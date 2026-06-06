import { api } from '../shared/browser-polyfill.js';
import { fetchTransactions, patchTransaction } from '../shared/ynab-api.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let TOKEN = '', BUDGET_ID = '', YNAB_DAYS = 30;
let amazonOrders = [];
let matches = [];
let skippedTxs = []; // Amazon txs hidden because they already have memos
let phase = 'idle'; // 'idle' | 'scraping' | 'matching' | 'results' | 'error'

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function showError(msg) {
  phase = 'error';
  hide('progress-section');
  hide('results');
  show('error');
  $('error-text').innerHTML = '⚠ ' + esc(msg);
}

function setProgress(pct, label, title, hint) {
  show('progress-section');
  hide('results');
  hide('error');
  if (title) $('progress-title').textContent = title;
  if (hint !== undefined) $('progress-hint').textContent = hint;
  $('progress-bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
  $('progress-label').textContent = label;
  $('progress-percent').textContent = Math.round(pct) + '%';
}

async function init() {
  const s = await api.storage.local.get({
    ynabToken: '', ynabBudgetId: '', ynabDays: 30,
    pendingScrape: null, scrapeStatus: null
  });
  TOKEN = s.ynabToken;
  BUDGET_ID = s.ynabBudgetId;
  YNAB_DAYS = s.ynabDays || 30;
  if (!TOKEN || !BUDGET_ID) {
    showError('YNAB token or budget not set. Open Settings.');
    return;
  }

  const status = s.scrapeStatus;
  if (status && status.status === 'running') {
    phase = 'scraping';
    setProgress(status.percent || 0, status.label || 'Working…', 'Scraping Amazon',
      'Hidden Chrome window is opening Amazon pages in the background. Don\'t close this tab.');
    api.storage.onChanged.addListener(onStorageChange);
    return;
  }
  if (status && status.status === 'error') {
    showError(status.errorMessage || 'Unknown error');
    return;
  }
  if (s.pendingScrape && s.pendingScrape.orders) {
    amazonOrders = s.pendingScrape.orders;
    runMatching();
    return;
  }
  showError('No scraped order data found. Run "Scrape & tag Amazon" from the extension popup first.');
}

function onStorageChange(changes, area) {
  if (area !== 'local' || !changes.scrapeStatus) return;
  const next = changes.scrapeStatus.newValue;
  if (!next) return;
  if (next.status === 'running' && phase === 'scraping') {
    setProgress(next.percent || 0, next.label || 'Working…');
  } else if (next.status === 'done' && phase === 'scraping') {
    api.storage.onChanged.removeListener(onStorageChange);
    setProgress(100, 'Scrape complete', 'Scraping Amazon');
    api.storage.local.get({ pendingScrape: null }).then((s) => {
      if (s.pendingScrape && s.pendingScrape.orders) {
        amazonOrders = s.pendingScrape.orders;
        runMatching();
      } else {
        showError('Scrape finished but no order data was saved.');
      }
    });
  } else if (next.status === 'error' && phase === 'scraping') {
    api.storage.onChanged.removeListener(onStorageChange);
    showError(next.errorMessage || 'Scrape failed');
  }
}

async function runMatching() {
  phase = 'matching';
  setProgress(20, 'Fetching YNAB transactions…', 'Matching to YNAB',
    'Pulling the last ' + YNAB_DAYS + ' days of YNAB transactions to match against.');
  try {
    const since = new Date(); since.setDate(since.getDate() - YNAB_DAYS);
    const txns = await fetchTransactions(TOKEN, BUDGET_ID, since.toISOString().split('T')[0]);
    setProgress(70, 'Matching transactions…', 'Matching to YNAB');
    const allAmazon = txns.filter((t) =>
      t.payee_name && t.payee_name.toLowerCase().includes('amazon') && t.amount < 0
    );
    skippedTxs = allAmazon.filter((t) => t.memo);
    const txs = allAmazon.filter((t) => !t.memo);
    matches = doMatch(txs, amazonOrders);
    setProgress(100, 'Done', 'Matching to YNAB');
    setTimeout(render, 200);
  } catch (e) {
    showError(e.message);
  }
}

function doMatch(txs, orders) {
  const used = new Set();
  const results = [];
  txs.forEach((tx) => {
    const txAmt = Math.abs(tx.amount) / 1000;
    const txDate = new Date(tx.date + 'T12:00:00');
    const cands = orders.filter((o) => {
      if (used.has(o.orderId)) return false;
      const days = Math.abs((new Date(o.date + 'T12:00:00') - txDate) / 86400000);
      const pct = o.totalAmount > 0 ? Math.abs(o.totalAmount - txAmt) / txAmt : 1;
      return days <= 7 && pct <= 0.02;
    }).sort((a, b) =>
      Math.abs(new Date(a.date + 'T12:00:00') - txDate) - Math.abs(new Date(b.date + 'T12:00:00') - txDate)
    );
    if (cands.length) {
      used.add(cands[0].orderId);
      let memo = (cands[0].items || []).map((i) => i.title).join(', ');
      if (memo.length > 200) memo = memo.slice(0, 197) + '…';
      results.push({ tx, order: cands[0], memo, sel: true, matched: true });
    } else {
      results.push({ tx, order: null, memo: null, sel: false, matched: false });
    }
  });
  return results;
}

// Build a single match card element and wire up its checkbox.
function makeMatchCard(m, i) {
  const amt = (Math.abs(m.tx.amount) / 1000).toFixed(2);
  const el = document.createElement('div');
  el.className = 'match-card ' + (m.matched ? 'ok' : 'miss');
  el.dataset.matchIdx = i;
  let itemsHtml = '';
  if (m.matched) {
    const items = m.order && m.order.items && m.order.items.length;
    itemsHtml = items
      ? m.order.items.map((it) => '<span class="tag green">' + esc(it.title) + '</span>').join('')
      : '<span class="tag yellow">Matched by amount — no item names</span>';
    if (m.unskipped) {
      itemsHtml = '<span class="tag yellow">Existing memo — included manually</span>';
    }
    if (m.memo) {
      itemsHtml += '<div class="memo-preview">' +
        '<label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Memo</label>' +
        '<input class="memo-input" data-i="' + i + '" type="text" value="' + esc(m.memo) + '" maxlength="200" ' +
        'style="width:100%;box-sizing:border-box;background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:12px">' +
        '</div>';
    }
  } else {
    itemsHtml = '<span class="tag yellow">No order matched within ±7 days / ±2%</span>';
  }
  el.innerHTML =
    '<div class="match-top">' +
      '<div class="check ' + (m.sel ? 'on' : '') + '" data-i="' + i + '" style="' + (m.matched ? '' : 'visibility:hidden') + '"></div>' +
      '<div class="dot ' + (m.matched ? 'ok' : 'miss') + '"></div>' +
      '<div class="match-info">' +
        '<div class="match-payee">' + esc(m.tx.payee_name || 'Amazon') + '</div>' +
        '<div class="match-meta">' + m.tx.date + ' · ' + esc(m.tx.account_name || '') + '</div>' +
      '</div>' +
      '<div class="match-amt">$' + amt + '</div>' +
    '</div>' +
    '<div class="match-items">' + itemsHtml + '</div>';
  el.querySelector('.check').addEventListener('click', (e) => {
    const idx = parseInt(e.currentTarget.dataset.i, 10);
    matches[idx].sel = !matches[idx].sel;
    e.currentTarget.className = 'check ' + (matches[idx].sel ? 'on' : '');
  });
  return el;
}

// Build a skipped card element with an Include button.
function makeSkippedCard(tx, skippedIdx) {
  const amt = (Math.abs(tx.amount) / 1000).toFixed(2);
  const el = document.createElement('div');
  el.className = 'match-card miss';
  el.dataset.skippedIdx = skippedIdx;
  el.innerHTML =
    '<div class="match-top">' +
      '<div class="dot miss"></div>' +
      '<div class="match-info">' +
        '<div class="match-payee">' + esc(tx.payee_name || 'Amazon') + '</div>' +
        '<div class="match-meta">' + tx.date + ' · ' + esc(tx.account_name || '') + '</div>' +
      '</div>' +
      '<div class="match-amt">$' + amt + '</div>' +
    '</div>' +
    '<div class="match-items">' +
      '<span class="tag yellow">Existing memo: ' + esc(tx.memo) + '</span>' +
      '<button class="btn btn-ghost btn-sm unskip-btn" style="margin-left:auto;display:block;margin-top:6px">Include</button>' +
    '</div>';
  el.querySelector('.unskip-btn').addEventListener('click', () => unskipTx(tx, skippedIdx));
  return el;
}

function updateSummary() {
  const ok = matches.filter((m) => m.matched);
  const miss = matches.filter((m) => !m.matched);
  $('match-summary').textContent = ok.length + ' matched · ' + miss.length + ' unmatched' +
    (skippedTxs.length ? ' · ' + skippedTxs.length + ' skipped (already have memos)' : '');
}

function render() {
  phase = 'results';
  hide('progress-section');
  show('results');

  const list = $('match-list');
  list.innerHTML = '';

  const ok = matches.filter((m) => m.matched);
  const miss = matches.filter((m) => !m.matched);
  ok.concat(miss).forEach((m) => {
    const i = matches.indexOf(m);
    list.appendChild(makeMatchCard(m, i));
  });

  renderSkippedSection();
  updateSummary();
}

function renderSkippedSection() {
  // Remove any existing skipped section before re-rendering it.
  const existing = $('skipped-section');
  if (existing) existing.remove();
  if (!skippedTxs.length) return;

  const section = document.createElement('div');
  section.id = 'skipped-section';
  section.style.marginTop = '16px';

  const toggle = document.createElement('button');
  toggle.className = 'btn btn-ghost btn-sm';
  toggle.style.cssText = 'width:100%;text-align:left;margin-bottom:8px;color:var(--muted)';
  toggle.dataset.open = 'false';
  toggle.textContent = '▶ ' + skippedTxs.length + ' skipped transaction' + (skippedTxs.length !== 1 ? 's' : '') + ' (already have memos) — click to expand';

  const inner = document.createElement('div');
  inner.id = 'skipped-list';
  inner.className = 'hidden';

  skippedTxs.forEach((tx, idx) => {
    inner.appendChild(makeSkippedCard(tx, idx));
  });

  toggle.addEventListener('click', () => {
    const open = toggle.dataset.open === 'true';
    toggle.dataset.open = String(!open);
    if (open) {
      inner.classList.add('hidden');
      toggle.textContent = '▶ ' + skippedTxs.length + ' skipped transaction' + (skippedTxs.length !== 1 ? 's' : '') + ' (already have memos) — click to expand';
    } else {
      inner.classList.remove('hidden');
      toggle.textContent = '▼ ' + skippedTxs.length + ' skipped transaction' + (skippedTxs.length !== 1 ? 's' : '') + ' (already have memos)';
    }
  });

  section.appendChild(toggle);
  section.appendChild(inner);
  $('match-list').after(section);
}

// Move a skipped tx into the active matches list without re-rendering existing cards.
function unskipTx(tx, skippedIdx) {
  // Remove from skipped list.
  skippedTxs.splice(skippedIdx, 1);

  // Create a new match entry using the tx's existing memo, pre-filled and editable.
  const m = { tx, order: null, memo: tx.memo, sel: true, matched: true, unskipped: true };
  matches.push(m);
  const i = matches.length - 1;

  // Insert the new card at the top of the match list so it's easy to see.
  const list = $('match-list');
  const card = makeMatchCard(m, i);
  list.insertBefore(card, list.firstChild);

  // Rebuild the skipped section to reflect new indices and count.
  renderSkippedSection();
  updateSummary();
}

function toggleAll(v) {
  matches.forEach((m, i) => {
    if (!m.matched) return;
    m.sel = v;
    const c = document.querySelector('.check[data-i="' + i + '"]');
    if (c) c.className = 'check ' + (v ? 'on' : '');
  });
}

async function pushMemos() {
  const todo = matches.filter((m) => m.matched && m.sel && m.memo);
  if (!todo.length) { alert('No matches selected.'); return; }
  $('push-btn').disabled = true;
  show('push-prog');
  $('push-result').innerHTML = '';
  let done = 0, errs = 0;
  for (let k = 0; k < todo.length; k++) {
    const idx = matches.indexOf(todo[k]);
    const inputEl = document.querySelector('.memo-input[data-i="' + idx + '"]');
    const memo = inputEl ? inputEl.value.trim() : todo[k].memo;
    try {
      await patchTransaction(TOKEN, BUDGET_ID, todo[k].tx.id, { memo, category_id: null });
      done++;
    } catch (_) { errs++; }
    const pct = Math.round(((done + errs) / todo.length) * 100);
    $('push-bar').style.width = pct + '%';
    $('push-label').textContent = 'Updated ' + (done + errs) + ' of ' + todo.length + '…';
  }
  hide('push-prog');
  $('push-result').innerHTML = errs === 0
    ? '<div class="alert alert-success">✓ Updated ' + done + ' memo' + (done !== 1 ? 's' : '') + ' in YNAB.</div>'
    : '<div class="alert alert-error">Updated ' + done + ', failed ' + errs + '.</div>';
  $('push-btn').disabled = false;
}

$('select-all').addEventListener('click', () => toggleAll(true));
$('deselect-all').addEventListener('click', () => toggleAll(false));
$('push-btn').addEventListener('click', pushMemos);
$('open-settings').addEventListener('click', () => api.runtime.openOptionsPage());

init();
