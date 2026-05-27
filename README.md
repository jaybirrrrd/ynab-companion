# ynab-companion

Personal tools for automating YNAB busywork.

## Contents

### [`ynab-companion/`](./ynab-companion) — Chrome Extension

A Chrome extension for two YNAB chores:

- **Tag Amazon transactions** — scrapes your Amazon order history and wallet charges, summarizes item names with Claude AI, matches them to YNAB transactions, and writes the result into memo fields.
- **Clean check transactions** — finds bank-imported check transactions where the check number landed in the Payee field, moves it to Memo, and clears the payee so you can fill in the real one.

→ See [ynab-companion/README.md](./ynab-companion/README.md) for install and usage instructions.

### [`amazon-ynab.html`](./amazon-ynab.html) — Standalone HTML Tool (legacy)

An earlier single-file version of the Amazon → YNAB matcher. Open locally in Chrome — no install needed. The Chrome extension above supersedes this for most workflows, but the HTML file is useful for one-off runs without installing the extension.

## Requirements

- Chrome (for the extension)
- A [YNAB Personal Access Token](https://app.ynab.com/settings/developer)
- An [Anthropic API Key](https://console.anthropic.com/settings/keys) (for Amazon memo summarization)

## License

MIT
