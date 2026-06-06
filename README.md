# ynab-companion

Personal tools for automating YNAB busywork. This is a monorepo containing browser extensions and shared logic.

## Monorepo layout

```
chrome/     ← Chrome extension (MV3, fully functional)
firefox/    ← Firefox extension (in progress)
shared/     ← Shared JS modules used by both extensions
```

### [`chrome/`](./chrome) — Chrome Extension

A Chrome extension for two YNAB chores:

- **Tag Amazon transactions** — scrapes your Amazon order history and wallet charges, summarizes item names with Claude AI, matches them to YNAB transactions, and writes the result into memo fields.
- **Clean check transactions** — finds bank-imported check transactions where the check number landed in the Payee field, moves it to Memo, and clears the payee so you can fill in the real one.

→ See [chrome/README.md](./chrome/README.md) for install and usage instructions.

### [`firefox/`](./firefox) — Firefox Extension *(in progress)*

Firefox port of the Chrome extension with full feature parity. Uses Manifest V3.

→ See [firefox/README.md](./firefox/README.md) for install instructions once complete.

### [`shared/`](./shared) — Shared logic

Plain JavaScript modules (no browser-extension APIs) used by both extensions.

### [`amazon-ynab.html`](./amazon-ynab.html) — Standalone HTML Tool (legacy)

An earlier single-file version of the Amazon → YNAB matcher. Open locally in Chrome — no install needed. The Chrome extension above supersedes this for most workflows, but the HTML file is useful for one-off runs without installing the extension.

## Requirements

- Chrome or Firefox (for the extensions)
- A [YNAB Personal Access Token](https://app.ynab.com/settings/developer)
- An [Anthropic API Key](https://console.anthropic.com/settings/keys) (for Amazon memo summarization)

## License

MIT
