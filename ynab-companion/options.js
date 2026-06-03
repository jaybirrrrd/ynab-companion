const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  ynabToken: '',
  ynabBudgetId: '',
  ynabBudgetName: '',
  ynabDays: 30,
  anthropicKey: '',
  anthropicModel: 'claude-haiku-4-5-20251001'
};

async function load() {
  const s = await chrome.storage.local.get(DEFAULTS);
  $('ynab-token').value = s.ynabToken || '';
  $('anthropic-key').value = s.anthropicKey || '';
  $('anthropic-model').value = s.anthropicModel || DEFAULTS.anthropicModel;
  $('ynab-days').value = s.ynabDays || DEFAULTS.ynabDays;

  if (s.ynabToken) {
    await populateBudgets(s.ynabToken, s.ynabBudgetId);
  }
}

async function populateBudgets(token, selectedId) {
  const sel = $('budget');
  sel.innerHTML = '<option value="">— loading… —</option>';
  sel.disabled = true;
  try {
    const r = await fetch('https://api.youneedabudget.com/v1/budgets', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) throw new Error('Status ' + r.status + ' — check your token');
    const d = await r.json();
    sel.innerHTML = '<option value="">— choose —</option>';
    d.data.budgets.forEach((b) => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.name;
      o.dataset.name = b.name;
      if (b.id === selectedId) o.selected = true;
      sel.appendChild(o);
    });
    sel.disabled = false;
    showMsg('ynab-msg', 'success', '✓ Connected — ' + d.data.budgets.length + ' budget(s) available');
  } catch (e) {
    sel.innerHTML = '<option value="">— failed to load —</option>';
    showMsg('ynab-msg', 'error', '⚠ ' + e.message);
  }
}

function showMsg(elId, kind, text) {
  const el = $(elId);
  el.innerHTML = '<div class="alert alert-' + kind + '">' + text + '</div>';
}

$('connect-ynab').addEventListener('click', async () => {
  const token = $('ynab-token').value.trim();
  if (!token) {
    showMsg('ynab-msg', 'error', '⚠ Enter a token first');
    return;
  }
  await populateBudgets(token, '');
});

$('save').addEventListener('click', async () => {
  const sel = $('budget');
  const selectedOpt = sel.options[sel.selectedIndex];
  const days = parseInt($('ynab-days').value, 10);
  await chrome.storage.local.set({
    ynabToken: $('ynab-token').value.trim(),
    ynabBudgetId: sel.value,
    ynabBudgetName: selectedOpt ? selectedOpt.dataset.name || selectedOpt.textContent : '',
    ynabDays: Number.isFinite(days) && days > 0 ? days : 30,
    anthropicKey: $('anthropic-key').value.trim(),
    anthropicModel: $('anthropic-model').value
  });
  const msg = $('save-msg');
  msg.textContent = '✓ Saved';
  setTimeout(() => { msg.textContent = ''; }, 2000);
});

load();
