// Thin wrappers around the YNAB REST API.
// All functions accept a { token, budgetId } config object.

const BASE = 'https://api.youneedabudget.com/v1';

function headers(token) {
  return { Authorization: 'Bearer ' + token };
}

export async function fetchBudgets(token) {
  const r = await fetch(BASE + '/budgets', { headers: headers(token) });
  if (!r.ok) throw new Error('Status ' + r.status + ' — check your token');
  const d = await r.json();
  return d.data.budgets;
}

export async function fetchTransactions(token, budgetId, sinceDate) {
  const url = BASE + '/budgets/' + budgetId + '/transactions' +
    (sinceDate ? '?since_date=' + sinceDate : '');
  const r = await fetch(url, { headers: headers(token) });
  if (!r.ok) throw new Error('YNAB error ' + r.status);
  const d = await r.json();
  return d.data.transactions;
}

export async function patchTransaction(token, budgetId, txId, patch) {
  const r = await fetch(BASE + '/budgets/' + budgetId + '/transactions/' + txId, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: patch })
  });
  if (!r.ok) throw new Error(await r.text());
}
