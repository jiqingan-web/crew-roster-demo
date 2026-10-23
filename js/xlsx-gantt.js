// Excel 甘特图导出（ExcelJS，离线）：人员甘特 / 任务甘特 / 图例与统计
// 浏览器：window.XlsxGantt.build(ExcelJS, C, st, opt)；Node：require('./xlsx-gantt.js').build(...)
(function (root) {
  const SLOTS = 8, SH = 180; // 每日 8 格 × 3h
  const COL = { C: '1D5FA8', F: '14766A', T: '5A4A9A', tr: '2F5D8C', sim: '2A2F6B', sb: 'B07A12', pref: 'D8F0DF', lv: 'E9D3D8', wk: 'FCE4D6', hd: '1F2D4A', hd2: 'DCE6F2' };
  const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
  const thin = { style: 'thin', color: { argb: 'FFBFC8D6' } }, B = { top: thin, left: thin, bottom: thin, right: thin };
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  function abbrMap(C, st) { const used = new Set(), cnt = {}, AB = {};
    st.pairings.forEach(p => p.legs.forEach(l => { cnt[l.from] = (cnt[l.from] || 0) + 1; cnt[l.to] = (cnt[l.to] || 0) + 1; }));
    Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).forEach(code => { const n = String(C.apName(code, st) || code).replace(/[\s\d]/g, '');
      const fx = /双流/.test(n) ? '蓉' : /天府/.test(n) ? '府' : null; const cand = [fx, ...n.replace(/^成都/, '')].filter(Boolean).concat([...n]);
      const ch = cand.find(x => !used.has(x)) || n[0] || code[0]; used.add(ch); AB[code] = ch; }); return AB; }
  function build(ExcelJS, C, st, opt) {
    opt = opt || {}; const S = st.settings || {}; const rep = S.reportMin || 60, rel = S.releaseMin || 30;
    const idx = C.buildIndex(st); const pm = {}; st.pilots.forEach(p => pm[p.id] = p); const AB = abbrMap(C, st);
    const D = C.DAYS, Y = C.YEAR, M = C.MONTH; const dow = d => new Date(Y, M - 1, d).getDay();
    const pilots = opt.pilotIds ? opt.pilotIds.map(id => pm[id]).filter(Boolean) : st.pilots;
    const wb = new ExcelJS.Workbook(); wb.creator = '机组智能排班助手'; wb.created = new Date();
    const nm = id => id && pm[id] ? pm[id].name : '空缺';
    const crewFull = pr => ['C', 'F', 'T'].map(s => `${C.slotLabel(pr, s, pm)} ${pr.crew[s] && pm[pr.crew[s]] ? pm[pr.crew[s]].name + '(' + pm[pr.crew[s]].rank + ')' : '空缺'}`).join(' / ');
    const fdpTxt = pr => C.fdpDays(pr, st).map(dy => `D${dy.d} FDP ${C.fmtH(dy.planFdp)}/${C.fmtH(dy.limit)} 余量 ${dy.planBuffer} 分`).join('\n');
    const noteOf = pr => `${pr.id} · ${pr.ndays}天 · ${pr.ac} · ${C.pairingHours(pr).toFixed(1)}h\n${crewFull(pr)}\n` + pr.legs.map(l => `D${l.d} ${C.fltLabel(l)} ${C.apName(l.from, st)}${C.isSpecial(l.from, st) ? '★' : ''}→${C.apName(l.to, st)}${C.isSpecial(l.to, st) ? '★' : ''} ${C.fmtT(l.dep)}-${C.fmtT(l.arr)} ${l.reg || ''}`).join('\n') + '\n' + fdpTxt(pr);
    const rich = (head, codes, tail) => { const r = [{ text: head + ' ', font: { color: { argb: 'FFFFFFFF' }, bold: true, size: 9 } }];
      codes.forEach((c, i) => { if (i) r.push({ text: '-', font: { color: { argb: 'FFFFFFFF' }, size: 9 } }); const sp = C.isSpecial(c, st); r.push({ text: AB[c] + (sp ? '★' : ''), font: { color: { argb: sp ? 'FFFFC2C2' : 'FFFFFFFF' }, bold: sp, size: 9 } }); });
      if (tail) r.push({ text: ' ' + tail, font: { color: { argb: 'FFE0E8F5' }, size: 8 } }); return { richText: r }; };
    function grid(ws, title, leftHdr, leftW) {
      const L = leftHdr.length; ws.columns = leftHdr.map((h, i) => ({ width: leftW[i] })).concat(Array.from({ length: D * SLOTS }, () => ({ width: 3.2 })));
      ws.getCell(1, 1).value = title; ws.getCell(1, 1).font = { bold: true, size: 13 }; ws.mergeCells(1, 1, 1, L);
      for (let d = 1; d <= D; d++) { const c0 = L + (d - 1) * SLOTS + 1; ws.mergeCells(1, c0, 1, c0 + SLOTS - 1); const c = ws.getCell(1, c0);
        const we = dow(d) === 0 || dow(d) === 6; c.value = `${M}/${String(d).padStart(2, '0')} 周${WD[dow(d)]}`; c.alignment = { horizontal: 'center' }; c.font = { bold: true, color: { argb: we ? 'FFC0392B' : 'FF1F2D4A' } }; c.fill = fill(we ? COL.wk : COL.hd2); c.border = B;
        for (let k = 0; k < SLOTS; k++) { const h = ws.getCell(2, c0 + k); h.value = String(k * 3).padStart(2, '0'); h.font = { size: 7, color: { argb: 'FF5D6F8C' } }; h.alignment = { horizontal: 'center' }; h.fill = fill(we ? COL.wk : 'F4F7FB'); h.border = B; } }
      leftHdr.forEach((h, i) => { const c = ws.getCell(2, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(COL.hd); c.border = B; });
      ws.views = [{ state: 'frozen', xSplit: L, ySplit: 2 }];
      ws.pageSetup = { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:2', margins: { left: .25, right: .25, top: .4, bottom: .4, header: .2, footer: .2 } };
      return L; }
    function put(ws, r, L, taken, s0, s1, value, color, note, fontColor) {
      s0 = Math.max(0, s0); s1 = Math.min(D * SLOTS - 1, s1); if (s1 < s0) return;
      while (s0 <= s1 && taken[s0]) s0++; let e = s0; while (e < s1 && !taken[e + 1]) e++; if (s0 > s1) return;
      for (let k = s0; k <= e; k++) taken[k] = 1; if (e > s0) ws.mergeCells(r, L + s0 + 1, r, L + e + 1);
      const c = ws.getCell(r, L + s0 + 1); c.value = value; c.fill = fill(color); c.border = B; c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false, shrinkToFit: false };
      if (!value || !value.richText) c.font = { size: 9, color: { argb: 'FF' + (fontColor || 'FFFFFF') }, bold: true }; if (note) c.note = note; }
    const segs = pr => { const out = []; for (let d = 1; d <= pr.ndays; d++) { const ls = pr.legs.filter(l => l.d === d); if (!ls.length) continue;
      out.push({ ls, a: Math.min(...ls.map(l => l.dep)) - rep, b: Math.max(...ls.map(l => l.arr)) + rel }); } return out; };
    // ---- 人员甘特 ----
    const ws = wb.addWorksheet('人员甘特', { properties: { defaultRowHeight: 30 } });
    const L = grid(ws, opt.title || `人员甘特 ${Y}-${String(M).padStart(2, '0')}${opt.label ? ' · ' + opt.label : ''}`, ['员工号', '姓名', '级别', '本月小时'], [9, 9, 6, 8]);
    pilots.forEach((p, i) => { const r = 3 + i; const row = ws.getRow(r); row.height = 30;
      [p.id, p.name, p.rank, +(idx.hours[p.id] || 0).toFixed(1)].forEach((v, k) => { const c = ws.getCell(r, k + 1); c.value = v; c.border = B; c.alignment = { vertical: 'middle' }; if (i % 2) c.fill = fill('F4F7FB'); });
      const taken = []; const sch = (idx.sched[p.id] || []).slice().sort((a, b) => a.start - b.start);
      sch.forEach(pr => { const slot = ['C', 'F', 'T'].find(s => pr.crew[s] === p.id); const nt = noteOf(pr);
        segs(pr).forEach((g, j) => { const codes = [g.ls[0].from, ...g.ls.map(l => l.to)];
          put(ws, r, L, taken, Math.floor(g.a / SH), Math.floor((g.b - 1) / SH), rich(j ? pr.id.replace(/^PR/, '') : pr.id + (slot === 'T' ? '[观]' : ''), codes, `${g.ls.some(l => l.dh) ? '(随)' : ''}${C.fmtT(g.ls[0].dep)}-${C.fmtT(g.ls[g.ls.length - 1].arr)}`), COL[slot] || COL.C, nt); }); });
      const sb = (st.standby || {})[p.id] || [], tr = (st.training || {})[p.id] || [], sim = (st.sim || {})[p.id] || [];
      for (let d = 1; d <= D; d++) { const s0 = (d - 1) * SLOTS, s1 = s0 + SLOTS - 1;
        if ((p.leave || []).includes(d)) put(ws, r, L, taken, s0, s1, '请假', COL.lv, '请假/休假', '7A2E3B');
        else if (sim.includes(d)) put(ws, r, L, taken, s0, s1, '模拟机', COL.sim, '模拟机训练（非执勤期）');
        else if (tr.includes(d)) put(ws, r, L, taken, s0, s1, '培训', COL.tr, '培训(飞技)');
        else if (sb.includes(d)) put(ws, r, L, taken, s0, s1, '备份', COL.sb, '备份（Standby）');
        else if ((p.prefs || []).includes(d)) put(ws, r, L, taken, s0, s1, '意向休', COL.pref, '意向休息日', '2E6B45'); }
      for (let k = 0; k < D * SLOTS; k++) if (!taken[k]) { const c = ws.getCell(r, L + k + 1); c.border = { left: k % SLOTS ? undefined : { style: 'thin', color: { argb: 'FF8A9BB5' } }, bottom: thin }; if (dow(Math.floor(k / SLOTS) + 1) % 6 === 0) c.fill = fill('FFF6EF'); } });
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: L } };
    // ---- 任务甘特 ----
    const pids = new Set(pilots.map(p => p.id)); const prs = st.pairings.filter(pr => !opt.pilotIds || ['C', 'F', 'T'].some(s => pids.has(pr.crew[s])));
    const wt = wb.addWorksheet('任务甘特'); const L2 = grid(wt, '任务甘特（按任务）', ['任务', '天数', '机型', '机组'], [8, 5, 6, 22]);
    prs.forEach((pr, i) => { const r = 3 + i; wt.getRow(r).height = 26; const full = pr.crew.C && pr.crew.F && pr.crew.T;
      [pr.id, pr.ndays, pr.ac, ['C', 'F', 'T'].map(s => nm(pr.crew[s])).join('/')].forEach((v, k) => { const c = wt.getCell(r, k + 1); c.value = v; c.border = B; c.alignment = { vertical: 'middle' }; if (!full) c.font = { color: { argb: 'FFC0392B' }, bold: k === 0 }; });
      const taken = []; segs(pr).forEach(g => put(wt, r, L2, taken, Math.floor(g.a / SH), Math.floor((g.b - 1) / SH), rich(pr.id, [g.ls[0].from, ...g.ls.map(l => l.to)], ''), full ? COL.C : 'C0392B', noteOf(pr))); });
    // ---- 图例与统计 ----
    const wl = wb.addWorksheet('图例与统计'); wl.columns = [{ width: 12 }, { width: 10 }, { width: 8 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }];
    const sum = C.summarize(st); let r = 1; const hdr = (t) => { const c = wl.getCell(r, 1); c.value = t; c.font = { bold: true, size: 12 }; r++; };
    hdr('方案信息'); [['方案', opt.plan || '当前方案'], ['导出范围', opt.label || '全部人员'], ['人数', pilots.length], ['任务数', prs.length], ['满员率', (sum.coverage != null ? (sum.coverage * (sum.coverage <= 1 ? 100 : 1)).toFixed(1) + '%' : '')], ['硬违规', sum.hard], ['导出时间', new Date().toLocaleString('zh-CN')], ['时间格', '每日 8 格 × 3 小时；色块 = 报到(首段前 ' + rep + ' 分) → 退场(末段后 ' + rel + ' 分)']].forEach(x => { wl.getCell(r, 1).value = x[0]; wl.getCell(r, 2).value = x[1]; wl.getCell(r, 1).font = { bold: true }; r++; });
    r++; hdr('图例');
    [['机长/左座', COL.C, 'FFFFFF'], ['副驾驶', COL.F, 'FFFFFF'], ['观察员', COL.T, 'FFFFFF'], ['培训', COL.tr, 'FFFFFF'], ['模拟机', COL.sim, 'FFFFFF'], ['备份', COL.sb, 'FFFFFF'], ['意向休息', COL.pref, '2E6B45'], ['请假', COL.lv, '7A2E3B'], ['★/红字 = 特殊机场', 'FFFFFF', 'C0392B']].forEach(x => { const c = wl.getCell(r, 1); c.value = x[0]; c.fill = fill(x[1]); c.font = { color: { argb: 'FF' + x[2] }, bold: true }; c.border = B; r++; });
    wl.getCell(r, 1).value = '色块内文字：任务号 + 当日机场单字简称链 + 首段起飞-末段落地；悬停批注查看完整机组/航班/城市/FDP'; r += 2;
    hdr('机场简称'); Object.keys(AB).forEach(code => { wl.getCell(r, 1).value = AB[code]; wl.getCell(r, 2).value = C.apName(code, st); wl.getCell(r, 3).value = code; if (C.isSpecial(code, st)) wl.getCell(r, 2).font = { color: { argb: 'FFC0392B' }, bold: true }; r++; });
    r++; hdr('人员统计'); const hr0 = r; ['员工号', '姓名', '级别', '本月小时', '值勤天数', '任务数', '备份天', '培训天', '模拟机天'].forEach((h, k) => { const c = wl.getCell(r, k + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(COL.hd); c.border = B; }); r++;
    pilots.forEach(p => { const dd = new Set(); (idx.sched[p.id] || []).forEach(pr => pr.legs.forEach(l => dd.add(Math.floor(l.dep / C.DAY) + 1)));
      [p.id, p.name, p.rank, +(idx.hours[p.id] || 0).toFixed(1), dd.size, (idx.sched[p.id] || []).length, ((st.standby || {})[p.id] || []).length, ((st.training || {})[p.id] || []).length, ((st.sim || {})[p.id] || []).length].forEach((v, k) => { const c = wl.getCell(r, k + 1); c.value = v; c.border = B; }); r++; });
    wl.views = [{ state: 'frozen', ySplit: hr0 }]; wl.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return wb;
  }
  const api = { build, abbrMap, SLOTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.XlsxGantt = api;
})(typeof window !== 'undefined' ? window : globalThis);
