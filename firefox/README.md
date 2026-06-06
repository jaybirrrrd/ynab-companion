# YNAB Companion — Firefox Extension

Firefox port of the YNAB Companion Chrome extension with full feature parity.

## Features

- **Tag Amazon transactions** — scrapes your Amazon order history and wallet charges, summarizes item names with Claude AI, matches them to YNAB transactions, and writes the result into memo fields.
- **Clean check transactions** — finds bank-imported check transactions where the check number landed in the Payee field, moves it to Memo, and clears the payee so you can fill in the real one.

## Installing (temporary load for development)

Firefox requires extensions to be signed for permanent installation. For development and personal use, load it temporarily:

1. Open Firefox and navigate to `about:debugging`
2. Click **This Firefox** in the left sidebar
3. Click **Load Temporary Add-on…**
4. Navigate to the `firefox/` directory and select `manifest.json`
5. The extension will appear in the toolbar

**Note:** Temporary add-ons are removed when Firefox restarts. For persistent personal use without signing, enable the unsigned extension setting in Firefox Developer Edition or Nightly (`about:config` → `xpinstall.signatures.required` → `false`).

## Requirements

- Firefox 109 or later
- A [YNAB Personal Access Token](https://app.ynab.com/settings/developer)
- An [Anthropic API Key](https://console.anthropic.com/settings/keys) (for Amazon memo summarization)

## Settings

After loading the extension, click the toolbar icon and open Settings to configure:

- **YNAB Personal Access Token** — connect and select your budget
- **Claude API Key** — used to summarize Amazon item titles into short memos
- **Scrape window** — how many days of YNAB transactions to match against (default 45)
