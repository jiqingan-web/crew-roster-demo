// 一线排班表导出（ExcelJS，离线）：第一页「排班表」按任务轮逐日一行（航班日期 / Pair / 机型 / 特殊机场 / 航线 / 时刻 / 时长 / 违规 / 机组），
// 左上角「查看日期」下拉 = 横截面：凡任务轮跨度覆盖该日（含外站过夜日）的整轮都显示；其后附人员甘特 / 任务甘特（XlsxGantt）。
// 浏览器：await window.XlsxRoster.build(ExcelJS, C, st, { day, gantt: window.XlsxGantt, JSZip }) → ArrayBuffer
(function (root) {
  const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } });
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } }, BD = { top: thin, left: thin, bottom: thin, right: thin };
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  // 列：A 航班日期 B Pair C 机型 D 特殊机场 E 航线 F 标准 G 时刻 H 时长 I 违规 J 责任机长 K 机长 L 副驾驶 M 备注 | 隐藏 N 起始 O 结束 P 命中
  const HDR = ['航班', 'Pair', '飞机', '机', '航线', '标准', '时刻', '时长', '违规', '责任机长', '机长', '副驾驶', '备注', '起', '止', '命中所选日'];
  const WID = [8, 9, 6, 5, 20, 14, 8, 7, 12, 14, 14, 14, 18, 10, 10, 9];
  const HIT_COL = 16; // P
  function abbr(C, st, code) { const n = String(C.apName(code, st) || code); return /双流/.test(n) ? '蓉' : /天府/.test(n) ? '府' : (C.apAbbrSimple ? C.apAbbrSimple(code, st) : n[0]) || n[0]; }
  async function build(ExcelJS, C, st, opt) {
    opt = opt || {}; const D = C.DAYS, Y = C.YEAR; const DL = d => C.dayLabel(d);
    const xd = d => { const L = DL(d); return new Date(Date.UTC(Y, L.m - 1, L.d)); }; // Excel 日期（UTC 零点）
    const wdOf = d => { const L = DL(d); return WD[new Date(Y, L.m - 1, L.d).getDay()]; };
    const day0 = Math.max(1, Math.min(D, opt.day || 1));
    const pm = {}; st.pilots.forEach(p => { pm[p.id] = p; });
    const who = id => (id && pm[id] ? `${pm[id].name}(${pm[id].rank})` : '');
    const hardBy = {}; (C.validate(st) || []).filter(v => v.level === 'hard' && v.pairing).forEach(v => { (hardBy[v.pairing] = hardBy[v.pairing] || new Set()).add(v.type); });
    const wb = new ExcelJS.Workbook(); wb.creator = '机组智能排班助手'; wb.created = new Date(); wb.calcProperties = { fullCalcOnLoad: true };
    const ws = wb.addWorksheet('排班表', { properties: { defaultRowHeight: 30 } });
    ws.columns = WID.map(w => ({ width: w }));
    // 第 1 行：查看日期（横截面）
    ws.getCell('A1').value = '查看日期'; ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell('A1').fill = fill('1F4E79'); ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    ws.mergeCells('B1:C1'); const sel = ws.getCell('B1'); sel.value = xd(day0); sel.numFmt = 'mm"-"dd'; sel.font = { bold: true, size: 12, color: { argb: 'FF1F4E79' } };
    sel.fill = fill('FFF2CC'); sel.border = { top: { style: 'medium', color: { argb: 'FF1F4E79' } }, left: { style: 'medium', color: { argb: 'FF1F4E79' } }, bottom: { style: 'medium', color: { argb: 'FF1F4E79' } }, right: { style: 'medium', color: { argb: 'FF1F4E79' } } };
    sel.alignment = { vertical: 'middle', horizontal: 'center' };
    sel.dataValidation = { type: 'list', allowBlank: false, formulae: [`'日期表'!$A$1:$A$${D}`], showErrorMessage: true, errorTitle: '日期', error: '请从下拉列表选择排班周期内的日期', showInputMessage: true, promptTitle: '横截面', prompt: '选日期后：数据 → 重新应用筛选（Excel 快捷键 Ctrl+Alt+L）' };
    ws.mergeCells('D1:M1'); const tip = ws.getCell('D1');
    tip.value = '← 下拉选日期，再点「数据 → 筛选 → 重新应用」：显示所有在该日有航段或在外站过夜的任务轮（整轮显示）。清除筛选可看全部。';
    tip.font = { size: 9, color: { argb: 'FF595959' } }; tip.alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(1).height = 26;
    // 第 2 行：表头
    const hr = ws.getRow(2); HDR.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = BD;
      c.fill = fill(i === 9 || i === 11 ? 'FF7C80' : i === 10 ? 'A9D08E' : 'D9D9D9'); }); hr.height = 22;
    // 数据行：每个任务轮按值勤日一行
    const prs = st.pairings.slice().sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)));
    let r = 3, band = 0; const rows = [];
    prs.forEach(pr => {
      const span = C.spanDays ? C.spanDays(pr, st) : [pr.start, pr.start + pr.ndays - 1]; const a = Math.min(...span), b = Math.max(...span);
      const byD = {}; pr.legs.forEach(l => { (byD[l.d] = byD[l.d] || []).push(l); });
      const ds = Object.keys(byD).map(Number).sort((x, y) => x - y); band ^= 1;
      const capT = pr.crew.T && pm[pr.crew.T] && C.isCaptClass(pm[pr.crew.T].rank);
      const fo = [who(pr.crew.F), capT ? '' : who(pr.crew.T)].filter(Boolean).join('\n');
      const sp = C.specialAirportsOf ? C.specialAirportsOf(pr, st) : [];
      const hard = hardBy[pr.id] ? [...hardBy[pr.id]].join('\n') : '';
      ds.forEach((d, k) => {
        const ls = byD[d].slice().sort((x, y) => x.dep - y.dep); const abs = Math.floor(ls[0].dep / 1440) + 1;
        const flts = [...new Set(ls.map(l => String(l.flt)))].join('/');
        const route = [abbr(C, st, ls[0].from)].concat(ls.map(l => abbr(C, st, l.to) + (l.dh ? '(随)' : ''))).join('-');
        const dur = ls[ls.length - 1].arr - ls[0].dep; const spD = [...new Set(ls.flatMap(l => [l.from, l.to]).filter(c => sp.includes(c)))];
        const hit = a <= day0 && b >= day0;
        const v = [DL(abs).text.replace('/', '-'), k === 0 ? `${pr.id}\n${pr.ndays}天` : '', '320\n' + (ls[0].reg && !/^REG-/.test(ls[0].reg) ? ls[0].reg : '?'),
          spD.length ? '特\n' + spD.map(c => abbr(C, st, c)).join('') : '', `${flts}${k === 0 && pr.ndays > 1 ? `【+${pr.ndays}】` : ''}\n${route}`, '空客普通非扩编',
          `${C.fmtT(ls[0].dep)}\n${C.fmtT(ls[ls.length - 1].arr)}`, `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`,
          hard, who(pr.crew.C), capT ? who(pr.crew.T) : '', fo, k === 0 && C.pairingHotelNote ? (C.pairingHotelNote(pr, st) || '') : '', xd(a), xd(b), null];
        const row = ws.getRow(r); v.forEach((x, i) => { row.getCell(i + 1).value = x; });
        row.getCell(HIT_COL).value = { formula: `IF(AND(N${r}<=$B$1,O${r}>=$B$1),"✓","")`, result: hit ? '✓' : '' };
        row.getCell(14).numFmt = 'mm-dd'; row.getCell(15).numFmt = 'mm-dd';
        row.height = 30;
        for (let i = 1; i <= HDR.length; i++) { const c = row.getCell(i); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = BD;
          c.fill = fill(i === 1 ? (k === 0 ? 'FFFFFF' : 'BDD7EE') : i === 2 ? 'FCE4D6' : band ? 'F2F2F2' : 'FFFFFF'); }
        if (hard) row.getCell(9).font = { color: { argb: 'FFC00000' }, bold: true };
        if (spD.length) row.getCell(4).font = { color: { argb: 'FFC00000' } };
        if (!hit) row.hidden = true;
        rows.push(r); r++;
      });
    });
    const last = r - 1;
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: last, column: HDR.length } };
    ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 2, activeCell: 'B1' }];
    ws.getColumn(14).hidden = true; ws.getColumn(15).hidden = true;
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '2:2' };
    // 甘特（人员 / 任务 / 图例）
    if (opt.gantt) opt.gantt.build(ExcelJS, C, st, Object.assign({}, opt.ganttOpt || {}, { wb }));
    // 日期表（下拉来源，隐藏）
    const wd = wb.addWorksheet('日期表', { state: 'hidden' });
    for (let d = 1; d <= D; d++) { const c = wd.getCell(d, 1); c.value = xd(d); c.numFmt = 'mm"-"dd'; wd.getCell(d, 2).value = '周' + wdOf(d); }
    let buf = await wb.xlsx.writeBuffer();
    // ExcelJS 不写筛选条件：补上「命中所选日 = ✓」，换日期后「重新应用」即生效
    const JSZip = opt.JSZip; if (JSZip) {
      const z = await JSZip.loadAsync(buf); const f = 'xl/worksheets/sheet1.xml'; let x = await z.file(f).async('string');
      x = x.replace(/<autoFilter ref="([^"]+)"\s*\/>/, (m0, ref) => `<autoFilter ref="${ref}"><filterColumn colId="${HIT_COL - 1}"><filters><filter val="✓"/></filters></filterColumn></autoFilter>`);
      z.file(f, x); buf = await z.generateAsync({ type: opt.node ? 'nodebuffer' : 'arraybuffer' });
    }
    return { buf, rows: rows.length, shown: rows.length - ws._rows.filter(rw => rw && rw.hidden).length, day: day0 };
  }
  const api = { build };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.XlsxRoster = api;
})(typeof self !== 'undefined' ? self : this);
