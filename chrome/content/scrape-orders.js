(() => {
  const monthMap = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12'
  };

  function toIsoDate(s) {
    if (!s) return null;
    const trimmed = s.trim();
    let m = trimmed.match(/^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (m) {
      const mm = monthMap[m[1]];
      if (!mm) return null;
      return `${m[3]}-${mm}-${String(m[2]).padStart(2, '0')}`;
    }
    m = trimmed.match(/^([A-Z][a-z]+)\s+(\d{1,2})$/);
    if (m) {
      const mm = monthMap[m[1]];
      if (!mm) return null;
      const yr = new Date().getFullYear();
      return `${yr}-${mm}-${String(m[2]).padStart(2, '0')}`;
    }
    return null;
  }

  const orderIdRe = /(\d{3}-\d{7}-\d{7})/;
  const cards = document.querySelectorAll('.js-order-card');
  const orders = [];

  cards.forEach((card) => {
    const text = card.innerText || '';
    const idMatch = text.match(orderIdRe);
    if (!idMatch) return;
    const orderId = idMatch[1];

    let date = null;
    let total = null;
    const spans = card.querySelectorAll('.a-size-base.a-color-secondary.aok-break-word');
    spans.forEach((sp) => {
      const t = (sp.textContent || '').trim();
      if (!t) return;
      if (t.startsWith('$')) {
        if (total === null) {
          const v = parseFloat(t.replace(/[^\d.-]/g, ''));
          if (!isNaN(v)) total = v;
        }
      } else if (date === null) {
        const iso = toIsoDate(t);
        if (iso) date = iso;
      }
    });

    const items = [];
    card.querySelectorAll('.yohtmlc-product-title').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (t) items.push({ title: t });
    });

    orders.push({ orderId, date, total, items });
  });

  return { orders, cardCount: cards.length };
})();
