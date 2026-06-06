// Calls the Anthropic Messages API to produce short memo summaries for
// Amazon order item titles. Returns the orders array with titles replaced
// by 1–4 word summaries.

export async function callClaudeSummarize({ apiKey, model, orders }) {
  const flatItems = [];
  orders.forEach((o, oi) => {
    (o.items || []).forEach((it, ii) => {
      flatItems.push({ oi, ii, title: it.title });
    });
  });
  if (!flatItems.length) return orders;

  const userPrompt = [
    'You will receive a JSON array of Amazon item titles. For each, return a 1–4 word summary suitable for a budget memo (e.g., "Band Saw Blades", "Polymer Clay", "USB Cable").',
    'Return ONLY a JSON array of strings, the same length and order as the input. No commentary, no code fences.',
    '',
    'Input:',
    JSON.stringify(flatItems.map((x) => x.title))
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error('Claude API ' + r.status + ': ' + txt.slice(0, 200));
  }
  const data = await r.json();
  const content = (data.content || []).map((b) => b.text || '').join('').trim();
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('Claude returned non-JSON: ' + content.slice(0, 200));
  let summaries;
  try {
    summaries = JSON.parse(content.slice(start, end + 1));
  } catch (e) {
    throw new Error('Claude JSON parse error: ' + e.message);
  }
  if (!Array.isArray(summaries) || summaries.length !== flatItems.length) {
    throw new Error('Claude returned wrong-shape array: expected ' + flatItems.length + ' got ' + (Array.isArray(summaries) ? summaries.length : 'non-array'));
  }
  const out = orders.map((o) => ({ ...o, items: (o.items || []).map((it) => ({ ...it })) }));
  flatItems.forEach((f, i) => {
    const s = String(summaries[i] || '').trim();
    if (s) out[f.oi].items[f.ii].title = s;
  });
  return out;
}
