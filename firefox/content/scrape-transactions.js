(() => {
  const monthMap = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12'
  };

  function toIsoDate(s) {
    const m = s.match(/^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!m) return null;
    const mm = monthMap[m[1]];
    if (!mm) return null;
    const dd = String(m[2]).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }

  const dateRe = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/;
  const amountRe = /^-?\$[\d,]+\.\d{2}$/;
  const orderIdRe = /Order\s+#?\s*(\d{3}-\d{7}-\d{7})/i;

  const text = document.body ? document.body.innerText : '';
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);

  const out = [];
  let curDate = null;
  let curMethod = null;
  let curAmount = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (dateRe.test(line)) {
      curDate = toIsoDate(line);
      curMethod = null;
      curAmount = null;
      continue;
    }
    if (amountRe.test(line)) {
      curAmount = parseFloat(line.replace(/[^\d.-]/g, ''));
      continue;
    }
    const om = line.match(orderIdRe);
    if (om && curDate && curAmount !== null && curMethod) {
      const isGift = /gift\s*card/i.test(curMethod);
      if (!isGift) {
        out.push({
          orderId: om[1],
          date: curDate,
          amount: Math.abs(curAmount),
          paymentMethod: curMethod
        });
      }
      curMethod = null;
      curAmount = null;
      continue;
    }
    if (curDate && !curMethod && !amountRe.test(line) && !orderIdRe.test(line)) {
      curMethod = line;
    }
  }

  return { transactions: out, lineCount: lines.length };
})();
