import { api } from '../shared/browser-polyfill.js';

const $ = (id) => document.getElementById(id);

function setStatus(text, kind) {
  const el = $('status');
  if (!text) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.classList.remove('hidden');
  el.classList.remove('ok', 'warn');
  if (kind) el.classList.add(kind);
  el.textContent = text;
}

async function readSettings() {
  return api.storage.local.get({
    ynabToken: '', ynabBudgetId: '', ynabBudgetName: '',
    anthropicKey: '', anthropicModel: 'claude-haiku-4-5-20251001',
    ynabDays: 45, scrapeStatus: null
  });
}

function settingsComplete(s) {
  return !!(s.ynabToken && s.ynabBudgetId && s.anthropicKey);
}

async function refreshUi() {
  const s = await readSettings();
  $('budget-line').textContent = s.ynabBudgetName ? 'Budget · ' + s.ynabBudgetName : 'No budget selected';

  if (!settingsComplete(s)) {
    setStatus('Open Settings to add your YNAB token, Claude API key, and pick a budget.', 'warn');
    $('scrape-btn').disabled = true;
    return;
  }

  $('scrape-btn').disabled = false;

  const status = s.scrapeStatus;
  if (status && status.status === 'running') {
    setStatus(Math.round(status.percent || 0) + '% · ' + (status.label || 'Working…'));
    $('scrape-btn').disabled = true;
    $('scrape-btn').textContent = 'Scraping…';
  } else if (status && status.status === 'error') {
    setStatus('⚠ ' + (status.errorMessage || 'Last run failed'), 'warn');
  } else if (status && status.status === 'done' && status.finishedAt) {
    const ago = Math.round((Date.now() - status.finishedAt) / 60000);
    if (ago < 60) setStatus('✓ Last scrape ' + (ago === 0 ? 'just now' : ago + 'm ago'), 'ok');
    else setStatus('');
  } else {
    setStatus('');
  }
}

$('settings-link').addEventListener('click', () => {
  api.runtime.openOptionsPage();
});

$('scrape-btn').addEventListener('click', async () => {
  const s = await readSettings();
  if (!settingsComplete(s)) {
    api.runtime.openOptionsPage();
    return;
  }
  $('scrape-btn').disabled = true;
  $('checks-btn').disabled = true;
  setStatus('Starting scrape…');
  api.runtime.sendMessage({ type: 'start-scrape' });
  // Background opens the review tab. Close popup so the new tab takes focus.
  setTimeout(() => window.close(), 250);
});

$('checks-btn').addEventListener('click', async () => {
  const url = api.runtime.getURL('check-cleanup.html');
  await api.tabs.create({ url });
  window.close();
});

// Live-update popup status if the user reopens it during a run.
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.scrapeStatus) refreshUi();
});

refreshUi();
