import { api } from '../shared/browser-polyfill.js';
import { fetchTransactions, patchTransaction } from '../shared/ynab-api.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let TOKEN = '', BUDGET_ID = '';
let candidates = [];

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function showError(msg) {
  show('error');
  $('error-text').innerHTML = '⚠ ' + esc(msg);
}

function buildMemo(existing, checkNumber) {
  const tag = 'Check #' + checkNumber;
  const trimmed = (existing || '').trim();
  if (!trimmed) return tag;
  if (new RegExp('check\\s*#?\\s*' + checkNumber + '\\b', 'i').test(trimmed)) return trimmed;
  return tag + ' · ' + trimmed;
}

async function scan() {
  $('scan-btn').disabled = true;
  $('scan-status').textContent = 'Fetching transactions…';
  $('scan-msg').innerHTML = '';
  hide('results');

  const days = parseInt($('days').value, 10) || 60;
  let pattern;
  try {
    pattern = new RegExp($('pattern').value, 'i');
  } catch (e) {
    $('scan-status').textContent = '';
    $('scan-msg').innerHTML = '<div class="alert alert-error">⚠ Bad regex: ' + esc(e.message) + '</div>';
    $('scan-btn').disabled = false;
    return;
  }

  try {
    const since = new Date(); since.setDate(since.getDate() - days);
    const txns = await fetchTransactions(TOKEN, BUDGET_ID, since.toISOString().split('T')[0]);
    candidates = [];
    txns.forEach((t) => {
      if (!t.payee_name) return;
      const m = t.payee_name.match(pattern);
      if (!m) return;
      // Prefer the first capture group; if the user's regex has none, pull the
      // first digit run from the matched text so we never end up using the
      // entire payee string as the "check number".
      let num = m[1];
      if (!num) {
        const digits = m[0].match(/\d+/);
        num = digits ? digits[0] : '';
      }
      if (!num) return;
      const proposedMemo = buildMemo(t.memo, num);
      candidates.push({
        tx: t,
        checkNumber: num,
        proposedMemo,
        sel: true
      });
    });
    $('scan-status').textContent = '';
    if (!candidates.length) {
      $('scan-msg').innerHTML = '<div class="alert alert-info">No transactions matched. Try a wider date range or different pattern.</div>';
    } else {
      render();
    }
  } catch (e) {
    $('scan-status').textContent = '';
    $('scan-msg').innerHTML = '<div class="alert alert-error">⚠ ' + esc(e.message) + '</div>';
  } finally {
    $('scan-btn').disabled = false;
  }
}

function render() {
  show('results');
  $('results-summary').textContent = candidates.length + ' candidate' + (candidates.length !== 1 ? 's' : '');
  const list = $('match-list');
  list.innerHTML = '';
  candidates.forEach((c, i) => {
    const t = c.tx;
    const amt = (t.amount / 1000).toFixed(2);
    const sign = t.amount < 0 ? '-' : '';
    const el = document.createElement('div');
    el.className = 'match-card ok';
    el.innerHTML =
      '<div class="match-top">' +
        '<div class="check ' + (c.sel ? 'on' : '') + '" data-i="' + i + '"></div>' +
        '<div class="dot ok"></div>' +
        '<div class="match-info">' +
          '<div class="match-payee">' + esc(t.payee_name) + ' → <em style="color:var(--muted)">(cleared)</em></div>' +
          '<div class="match-meta">' + t.date + ' · ' + esc(t.account_name || '') + '</div>' +
        '</div>' +
        '<div class="match-amt">' + sign + '$' + Math.abs(amt) + '</div>' +
      '</div>' +
      '<div class="match-items">' +
        '<span class="tag green">Check #' + esc(c.checkNumber) + '</span>' +
        '<div class="memo-preview"><strong>Memo:</strong> ' + esc(c.proposedMemo) + '</div>' +
      '</div>';
    list.appendChild(el);
  });
  list.querySelectorAll('.check').forEach((node) => {
    node.addEventListener('click', () => {
      const i = parseInt(node.dataset.i, 10);
      candidates[i].sel = !candidates[i].sel;
      node.className = 'check ' + (candidates[i].sel ? 'on' : '');
    });
  });
}

function toggleAll(v) {
  candidates.forEach((c, i) => {
    c.sel = v;
    const node = document.querySelector('.check[data-i="' + i + '"]');
    if (node) node.className = 'check ' + (v ? 'on' : '');
  });
}

async function apply() {
  const todo = candidates.filter((c) => c.sel);
  if (!todo.length) { alert('Nothing selected.'); return; }
  $('apply-btn').disabled = true;
  show('apply-prog');
  $('apply-result').innerHTML = '';
  let done = 0, errs = 0;
  for (let k = 0; k < todo.length; k++) {
    try {
      await patchTransaction(TOKEN, BUDGET_ID, todo[k].tx.id, {
        payee_id: null,
        payee_name: null,
        memo: todo[k].proposedMemo
      });
      done++;
    } catch (_) { errs++; }
    const pct = Math.round(((done + errs) / todo.length) * 100);
    $('apply-bar').style.width = pct + '%';
    $('apply-label').textContent = 'Updated ' + (done + errs) + ' of ' + todo.length + '…';
  }
  hide('apply-prog');
  $('apply-result').innerHTML = errs === 0
    ? '<div class="alert alert-success">✓ Updated ' + done + ' transaction' + (done !== 1 ? 's' : '') + '. Now go fill in the real payees in YNAB.</div>'
    : '<div class="alert alert-error">Updated ' + done + ', failed ' + errs + '. (YNAB may not allow clearing payee on reconciled transactions.)</div>';
  $('apply-btn').disabled = false;
}

async function init() {
  const s = await api.storage.local.get({ ynabToken: '', ynabBudgetId: '' });
  TOKEN = s.ynabToken;
  BUDGET_ID = s.ynabBudgetId;
  if (!TOKEN || !BUDGET_ID) {
    showError('YNAB token or budget not set. Open Settings.');
    $('scan-btn').disabled = true;
    return;
  }
}

$('scan-btn').addEventListener('click', scan);
$('select-all').addEventListener('click', () => toggleAll(true));
$('deselect-all').addEventListener('click', () => toggleAll(false));
$('apply-btn').addEventListener('click', apply);
$('open-settings').addEventListener('click', () => api.runtime.openOptionsPage());

init();
