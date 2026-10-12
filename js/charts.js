/* 轻量 SVG 图表（无外部依赖） */
window.Charts = (function () {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // 柱状图：items [{label, value, color}], opts {w,h,lines:[{v,label,color}], max, rot}
  function bars(items, o) {
    o = o || {}; const W = o.w || 900, H = o.h || 260, P = { l: 40, r: 10, t: 14, b: o.rot ? 60 : 28 };
    const max = o.max || Math.max(1, ...items.map(i => i.value), ...(o.lines || []).map(l => l.v)) * 1.08;
    const iw = W - P.l - P.r, ih = H - P.t - P.b, bw = iw / Math.max(1, items.length);
    const y = v => P.t + ih - v / max * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-size="11" font-family="sans-serif">`;
    for (let k = 0; k <= 4; k++) { const v = max * k / 4; s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#22375e"/><text x="${P.l - 5}" y="${y(v) + 4}" fill="#8aa0c4" text-anchor="end">${max < 10 ? v.toFixed(1) : v.toFixed(0)}</text>`; }
    items.forEach((it, i) => { const x = P.l + i * bw; const h = ih * it.value / max;
      s += `<rect x="${x + bw * 0.12}" y="${y(it.value)}" width="${Math.max(1, bw * 0.76)}" height="${h}" fill="${it.color || '#3ea6ff'}" rx="1"><title>${esc(it.label)}: ${it.value.toFixed ? it.value.toFixed(1) : it.value}</title></rect>`;
      if (o.showLabels !== false && (bw > 14 || o.rot)) s += o.rot ? `<text transform="translate(${x + bw / 2},${H - P.b + 8}) rotate(60)" fill="#8aa0c4" font-size="9">${esc(it.label)}</text>` : `<text x="${x + bw / 2}" y="${H - 10}" fill="#8aa0c4" text-anchor="middle">${esc(it.label)}</text>`;
      if (o.values) s += `<text x="${x + bw / 2}" y="${y(it.value) - 3}" fill="#d8e3f5" text-anchor="middle">${it.value.toFixed ? +it.value.toFixed(1) : it.value}</text>`; });
    (o.lines || []).forEach(l => { s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(l.v)}" y2="${y(l.v)}" stroke="${l.color}" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - P.r - 4}" y="${y(l.v) - 4}" fill="${l.color}" text-anchor="end">${esc(l.label)}</text>`; });
    return s + '</svg>';
  }
  // 区间图：rows [{label,min,mean,max,std,color}], range [lo,hi]
  function ranges(rows, o) {
    o = o || {}; const W = o.w || 520, rh = 34, H = rows.length * rh + 40, L = 70, R = 20; const [lo, hi] = o.range || [0, 80];
    const x = v => L + (v - lo) / (hi - lo) * (W - L - R);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-size="11" font-family="sans-serif">`;
    for (let v = lo; v <= hi; v += 10) s += `<line x1="${x(v)}" x2="${x(v)}" y1="8" y2="${H - 22}" stroke="#22375e"/><text x="${x(v)}" y="${H - 8}" fill="#8aa0c4" text-anchor="middle">${v}h</text>`;
    (o.marks || []).forEach(m => s += `<line x1="${x(m.v)}" x2="${x(m.v)}" y1="8" y2="${H - 22}" stroke="${m.color}" stroke-dasharray="4 3" stroke-width="1.5"/>`);
    rows.forEach((r, i) => { const yy = 14 + i * rh + 10;
      s += `<text x="${L - 8}" y="${yy + 4}" fill="#d8e3f5" text-anchor="end">${esc(r.label)}</text>
      <line x1="${x(r.min)}" x2="${x(r.max)}" y1="${yy}" y2="${yy}" stroke="${r.color}" stroke-width="3"/>
      <rect x="${x(r.mean - r.std)}" y="${yy - 8}" width="${Math.max(2, x(r.mean + r.std) - x(r.mean - r.std))}" height="16" fill="${r.color}" opacity=".35" rx="3"/>
      <circle cx="${x(r.mean)}" cy="${yy}" r="5" fill="#fff"/><text x="${x(r.max) + 6}" y="${yy + 4}" fill="#8aa0c4">${r.min.toFixed(1)}–${r.max.toFixed(1)}，均${r.mean.toFixed(1)}</text>`; });
    return s + '</svg>';
  }
  function donut(pct, color, label) {
    const r = 42, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="${r}" stroke="#1d3460" stroke-width="12" fill="none"/>
    <circle cx="60" cy="60" r="${r}" stroke="${color}" stroke-width="12" fill="none" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 60 60)" stroke-linecap="round"/>
    <text x="60" y="64" fill="#fff" font-size="18" text-anchor="middle" font-weight="700">${(pct * 100).toFixed(1)}%</text><text x="60" y="84" fill="#8aa0c4" font-size="10" text-anchor="middle">${label}</text></svg>`;
  }
  return { bars, ranges, donut };
})();
