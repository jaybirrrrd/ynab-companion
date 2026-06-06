// Compatibility shim: exposes a unified `api` object that works in both Chrome
// (chrome.* namespace) and Firefox (browser.* namespace, Promise-based).
// Import this module and use `api.*` instead of `chrome.*` or `browser.*`.

const api = (typeof browser !== 'undefined') ? browser : chrome;

export { api };
