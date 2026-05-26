// Background service worker for YNAB Companion.
// Orchestrates Amazon scraping and Claude-based summarization.
// Progress is mirrored to chrome.storage.local under `scrapeStatus` so the
// review tab can render a live progress UI even if it opens late or refreshes.

const TXN_URL = 'https://www.amazon.com/cpe/yourpayments/transactions';
const ORDERS_URL_P1 = 'https://www.amazon.com/your-orders/orders?timeFilter=months-3&startIndex=0';
const ORDERS_URL_P2 = 'https://www.amazon.com/your-orders/orders?timeFilter=months-3&startIndex=10';

async function setStatus(patch) {
  const cur = (await chrome.storage.local.get({ scrapeStatus: null })).scrapeStatus || {};
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ scrapeStatus: next });
}

async function progress(percent, label) {
  await setStatus({ status: 'running', percent, label, errorMessage: null });
}

async function fail(message) {
  await setStatus({ status: 'error', errorMessage: message, finishedAt: Date.now() });
}

async function finish() {
  await setStatus({ status: 'done', percent: 100, label: 'Done', finishedAt: Date.now() });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timed out'));
    }, timeoutMs);
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function runScript(tabId, file) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: [file]
  });
  if (!results || !results.length) throw new Error('Script returned no result');
  return results[0].result;
}

async function openHiddenWindowWithTab(url) {
  const win = await chrome.windows.create({
    url,
    state: 'minimized',
    focused: false,
    type: 'normal'
  });
  try { await chrome.windows.update(win.id, { state: 'minimized', focused: false }); } catch (_) {}
  const tabId = win.tabs[0].id;
  await waitForTabComplete(tabId);
  await sleep(1500);
  return { windowId: win.id, tabId };
}

async function openHiddenTabInWindow(windowId, url) {
  const tab = await chrome.tabs.create({ windowId, url, active: false });
  await waitForTabComplete(tab.id);
  await sleep(1500);
  return tab.id;
}

async function callClaudeSummarize({ apiKey, model, orders }) {
  const flatItems = [];
  orders.forEach((o, oi) => {
    (o.items || []).forEach((it, ii) => {
      flatItems.push({ oi, ii, title: it.title });
    });
  });
  if (!flatItems.length) return orders;

  const userPrompt = [
    'You will receive a JSON array of Amazon item titles. For each, return a 1–4 word summary suitable for a budget memo (e.g., "Band Saw Blades", "Polymer Clay", "USB Cable").',
    'Return ONLY a JSON array of strings, the same length and order as the input. No commentary, no code fences.',
    '',
    'Input:',
    JSON.stringify(flatItems.map((x) => x.title))
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error('Claude API ' + r.status + ': ' + txt.slice(0, 200));
  }
  const data = await r.json();
  const content = (data.content || []).map((b) => b.text || '').join('').trim();
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('Claude returned non-JSON: ' + content.slice(0, 200));
  let summaries;
  try {
    summaries = JSON.parse(content.slice(start, end + 1));
  } catch (e) {
    throw new Error('Claude JSON parse error: ' + e.message);
  }
  if (!Array.isArray(summaries) || summaries.length !== flatItems.length) {
    throw new Error('Claude returned wrong-shape array: expected ' + flatItems.length + ' got ' + (Array.isArray(summaries) ? summaries.length : 'non-array'));
  }
  const out = orders.map((o) => ({ ...o, items: (o.items || []).map((it) => ({ ...it })) }));
  flatItems.forEach((f, i) => {
    const s = String(summaries[i] || '').trim();
    if (s) out[f.oi].items[f.ii].title = s;
  });
  return out;
}

async function runScrape() {
  const settings = await chrome.storage.local.get({
    ynabToken: '', ynabBudgetId: '',
    anthropicKey: '', anthropicModel: 'claude-haiku-4-5-20251001'
  });

  // Reset progress state and clear any prior pendingScrape so the review tab
  // doesn't render stale results during the run.
  await chrome.storage.local.set({
    scrapeStatus: {
      status: 'running', percent: 1, label: 'Starting…',
      startedAt: Date.now(), finishedAt: null, errorMessage: null
    },
    pendingScrape: null
  });

  // Open review tab right away so the user sees progress immediately.
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('review.html'), active: true });
  } catch (_) { /* non-fatal */ }

  if (!settings.ynabToken || !settings.ynabBudgetId) {
    await fail('YNAB token / budget not set — open Settings');
    return;
  }
  if (!settings.anthropicKey) {
    await fail('Claude API key not set — open Settings');
    return;
  }

  let windowId = null;
  try {
    await progress(5, 'Opening Amazon transactions page…');
    const txOpen = await openHiddenWindowWithTab(TXN_URL);
    windowId = txOpen.windowId;

    await progress(20, 'Scraping wallet transactions…');
    const txResult = await runScript(txOpen.tabId, 'content/scrape-transactions.js');
    const txns = (txResult && txResult.transactions) || [];
    if (!txns.length) {
      throw new Error('No card transactions found on Amazon wallet page. Are you logged in?');
    }
    await progress(28, 'Found ' + txns.length + ' card charges · opening orders page 1…');
    const ordersTab1 = await openHiddenTabInWindow(windowId, ORDERS_URL_P1);

    await progress(40, 'Scraping orders page 1…');
    const o1 = await runScript(ordersTab1, 'content/scrape-orders.js');

    await progress(48, 'Opening orders page 2…');
    const ordersTab2 = await openHiddenTabInWindow(windowId, ORDERS_URL_P2);

    await progress(60, 'Scraping orders page 2…');
    const o2 = await runScript(ordersTab2, 'content/scrape-orders.js');

    const allOrders = [...(o1.orders || []), ...(o2.orders || [])];
    if (!allOrders.length) {
      throw new Error('No orders found on Amazon orders page.');
    }

    await progress(65, 'Building order list (' + allOrders.length + ' orders)…');
    const orderById = new Map();
    allOrders.forEach((o) => { if (!orderById.has(o.orderId)) orderById.set(o.orderId, o); });
    const merged = [];
    txns.forEach((t) => {
      const o = orderById.get(t.orderId);
      const items = o ? o.items : [];
      merged.push({
        orderId: t.orderId,
        date: t.date,
        totalAmount: t.amount,
        paymentMethod: t.paymentMethod,
        items
      });
    });

    const totalItems = merged.reduce((n, o) => n + (o.items || []).length, 0);
    await progress(70, 'Summarizing ' + totalItems + ' item titles via Claude…');
    const summarized = await callClaudeSummarize({
      apiKey: settings.anthropicKey,
      model: settings.anthropicModel,
      orders: merged
    });

    await progress(95, 'Saving results…');
    await chrome.storage.local.set({
      pendingScrape: {
        orders: summarized,
        scrapedAt: Date.now(),
        rawTxnCount: txns.length,
        rawOrderCount: allOrders.length
      }
    });

    if (windowId !== null) {
      try { await chrome.windows.remove(windowId); } catch (_) {}
      windowId = null;
    }

    await finish();
  } catch (e) {
    if (windowId !== null) {
      try { await chrome.windows.remove(windowId); } catch (_) {}
    }
    await fail(e.message || String(e));
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'start-scrape') {
    runScrape();
  }
  return false;
});
