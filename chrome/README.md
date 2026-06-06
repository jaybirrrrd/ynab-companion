# YNAB Companion

Chrome extension for two YNAB chores:

1. **Tag Amazon transactions** — scrapes your Amazon orders + wallet charges, summarizes item names with Claude, matches them to YNAB transactions, and writes the result into the memo field.
2. **Clean check transactions** — finds bank-imported check transactions where the check number ended up in the **Payee** field, moves the number to **Memo**, and clears the payee so you can fill in the real one.

## Install (developer / unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Select the `ynab-companion` folder.
5. Pin the extension to your toolbar.

## Configure

Click the extension icon → **Settings ›** (or open the extension's options).

- **YNAB Personal Access Token** — generate at <https://app.ynab.com/settings/developer>.
- **Budget** — click **Connect & load budgets**, then pick the right budget from the dropdown.
- **Claude API Key** — generate at <https://console.anthropic.com/settings/keys>. Used to summarize Amazon item titles into 1–4 word memos.
- **Model** — defaults to `claude-haiku-4-5-20251001` (fast). Sonnet/Opus also available.
- **Days back** — how many days of YNAB transactions to consider when matching (default 45).

Settings are stored in `chrome.storage.local` (per Chrome profile, not synced).

## Use it

### Tag Amazon transactions

1. Make sure you're signed into Amazon in this Chrome profile.
2. Click the extension icon → **Scrape & tag Amazon**.
3. The extension opens a minimized window in the background, scrapes the wallet transactions and orders pages, and closes the window.
4. Item titles are summarized via the Claude API.
5. A **Review** tab opens showing matched/unmatched YNAB transactions with proposed memos.
6. Deselect any you don't want, then **Update YNAB Memos**.

### Clean check transactions

1. Click the extension icon → **Clean check transactions**.
2. Pick a date range and a regex pattern (default matches `Check 1234`, `CHECK#1234`, etc.).
3. Click **Scan** — the extension finds candidate transactions.
4. Review the proposed memos (`Check #1234`), deselect any false positives, then **Apply to YNAB**. The payee is cleared and the check number is written to the memo. Now fill in the real payee in YNAB.

## File layout

```
ynab-companion/
├── manifest.json
├── popup.html / popup.js          — toolbar popup
├── options.html / options.js      — settings page
├── background.js                  — orchestrates scrape + Claude API
├── content/
│   ├── scrape-orders.js           — runs on /your-orders/orders
│   └── scrape-transactions.js     — runs on /cpe/yourpayments/transactions
├── review.html / review.js        — Amazon → YNAB matching
├── check-cleanup.html / check-cleanup.js — check-transaction cleanup
├── styles.css                     — shared dark theme
└── icons/                         — placeholder PNGs
```

## Notes

- The Claude API is called from the extension service worker with `anthropic-dangerous-direct-browser-access: true`. The API key is stored locally in your Chrome profile.
- YNAB API requires the cleared payee write to succeed; reconciled transactions cannot be modified.
- Amazon scraping uses the wallet transactions page (`/cpe/yourpayments/transactions`) for accurate card-charged amounts (gift-card-offset orders show their real charge amount, not the order subtotal).
