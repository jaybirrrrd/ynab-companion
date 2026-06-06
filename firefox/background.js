// Background service worker for YNAB Companion.
// Orchestrates Amazon scraping and Claude-based summarization.
// Progress is mirrored to storage.local under `scrapeStatus` so the
// review tab can render a live progress UI even if it opens late or refreshes.

import { callClaudeSummarize } from './shared/anthropic-api.js';
import { api } from './shared/browser-polyfill.js';

const TXN_URL = 'https://www.amazon.com/cpe/yourpayments/transactions';
const ORDERS_URL_P1 = 'https://www.amazon.com/your-orders/orders?timeFilter=months-3&startIndex=0';
const ORDERS_URL_P2 = 'https://www.amazon.com/your-orders/orders?timeFilter=months-3&startIndex=10';

async function setStatus(patch) {
  const cur = (await api.storage.local.get({ scrapeStatus: null })).scrapeStatus || {};
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await api.storage.local.set({ scrapeStatus: next });
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
      api.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timed out'));
    }, timeoutMs);
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        api.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    api.tabs.onUpdated.addListener(listener);
  });
}

async function runScript(tabId, file) {
  const results = await api.scripting.executeScript({
    target: { tabId },
    files: [file]
  });
  if (!results || !results.length) throw new Error('Script returned no result');
  return results[0].result;
}

async function openHiddenWindowWithTab(url) {
  const win = await api.windows.create({
    url,
    state: 'minimized',
    focused: false,
    type: 'normal'
  });
  try { await api.windows.update(win.id, { state: 'minimized', focused: false }); } catch (_) {}
  const tabId = win.tabs[0].id;
  await waitForTabComplete(tabId);
  await sleep(1500);
  return { windowId: win.id, tabId };
}

async function openHiddenTabInWindow(windowId, url) {
  const tab = await api.tabs.create({ windowId, url, active: false });
  await waitForTabComplete(tab.id);
  await sleep(1500);
  return tab.id;
}

async function runScrape() {
  const settings = await api.storage.local.get({
    ynabToken: '', ynabBudgetId: '',
    anthropicKey: '', anthropicModel: 'claude-haiku-4-5-20251001'
  });

  // Reset progress state and clear any prior pendingScrape so the review tab
  // doesn't render stale results during the run.
  await api.storage.local.set({
    scrapeStatus: {
      status: 'running', percent: 1, label: 'Starting…',
      startedAt: Date.now(), finishedAt: null, errorMessage: null
    },
    pendingScrape: null
  });

  // Open review tab right away so the user sees progress immediately.
  try {
    await api.tabs.create({ url: api.runtime.getURL('review.html'), active: true });
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
    await api.storage.local.set({
      pendingScrape: {
        orders: summarized,
        scrapedAt: Date.now(),
        rawTxnCount: txns.length,
        rawOrderCount: allOrders.length
      }
    });

    if (windowId !== null) {
      try { await api.windows.remove(windowId); } catch (_) {}
      windowId = null;
    }

    await finish();
  } catch (e) {
    if (windowId !== null) {
      try { await api.windows.remove(windowId); } catch (_) {}
    }
    await fail(e.message || String(e));
  }
}

api.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'start-scrape') {
    runScrape();
  }
  return false;
});
