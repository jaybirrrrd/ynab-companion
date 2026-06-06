# Development Guide

## Loading the Chrome extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `chrome/` directory in this repo
5. The YNAB Companion icon will appear in the toolbar

After making changes to any file, click the reload icon on the extension card at `chrome://extensions`.

## Loading the Firefox extension

1. Open Firefox and navigate to `about:debugging`
2. Click **This Firefox** in the left sidebar
3. Click **Load Temporary Add-on…**
4. Navigate to the `firefox/` directory and select `manifest.json`

Temporary add-ons are removed on Firefox restart. For persistent dev use without signing, use Firefox Developer Edition or Nightly and set `xpinstall.signatures.required` to `false` in `about:config`.

## Repository layout

```
chrome/      Chrome extension (Manifest V3)
firefox/     Firefox extension (Manifest V3)
shared/      Plain JS modules shared by both extensions
```

### shared/ modules

| File | Purpose |
|------|---------|
| `browser-polyfill.js` | Exports `api` — resolves to `browser` in Firefox, `chrome` in Chrome |
| `ynab-api.js` | `fetchBudgets`, `fetchTransactions`, `patchTransaction` wrappers |
| `anthropic-api.js` | `callClaudeSummarize` — calls the Anthropic Messages API |

### Adding new shared code

- If a function has no `browser.*` / `chrome.*` calls and could be used by both extensions, put it in `shared/`.
- Import it with a relative path: `import { myFn } from '../shared/my-module.js'`
- Never put browser-extension API calls in `shared/` — use the `api` shim from `browser-polyfill.js` in the extension files themselves, or pass the needed API calls in as arguments.

## browser / chrome namespace compatibility

All extension JS files import `api` from `shared/browser-polyfill.js`:

```js
import { api } from '../shared/browser-polyfill.js';
```

`api` resolves to `browser` when running in Firefox (native Promise-based API) and falls back to `chrome` in Chrome. Use `api.*` everywhere — never use `chrome.*` or `browser.*` directly.

The shim:

```js
const api = (typeof browser !== 'undefined') ? browser : chrome;
```

## No build system

This project is intentionally build-system-free. All files are loaded directly from source. There is no bundler, transpiler, or npm dependency. To make a change, edit the file and reload the extension.
