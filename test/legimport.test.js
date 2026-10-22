// 航段 Excel 导入（快速）：模板往返 + 可选回测文件（存在才测，不入库）
const fs = require('fs'); const ExcelJS = require('../js/vendor/exceljs.min.js'); const C = require('../js/core.js'); const LI = require('../js/leg-import.js');
let fail = 0; const chk = (n, ok, info) => { console.log('LEGIMP ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };
(async () => {
  const st = C.generateLiteSample(20261101); const T = LI.airportTable(C, st);
  chk('airport code/name/abbr', LI.resolveAirport('ZUUU', T) === 'ZUUU' && LI.resolveAirport('蓉', T) === 'ZUUU' && LI.resolveAirport('府', T) === 'ZUTF' && LI.resolveAirport('成都天府', T) === 'ZUTF' && LI.resolveAirport('双流', T) === 'ZUUU' && LI.resolveAirport('乌鲁木齐', T) === 'ZWWW' && LI.resolveAirport('湘', T) === 'ZGHA');
  chk('time parse', LI.parseTime('01:05(+1)') === 1505 && LI.parseTime('7:30') === 450 && LI.parseTime(0.5) === 720 && LI.parseTime('25:99') == null);
  // 模板：空“航段”表 + 说明示例往返
  const wb = LI.buildTemplate(ExcelJS, C, st, {}); const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook(); await back.xlsx.load(buf); chk('template sheets', ['航段', '说明', '机场表'].every(n => back.getWorksheet(n)), back.worksheets.map(w => w.name).join(','));
  chk('template header', LI.HEAD.every((h, i) => back.getWorksheet('航段').getRow(1).getCell(i + 1).value === h));
  const r1 = LI.parseRows([LI.HEAD, ...LI.SAMPLE], C, st); chk('sample rows parse', r1.pairings.length === 3 && !r1.report.badRows.length && !r1.report.notReturn.length, LI.reportText(r1.report));
  chk('sample dh+midnight', r1.pairings[2].legs[0].dh === true && r1.pairings[2].legs[0].arr - r1.pairings[2].legs[0].dep === 85);
  chk('sample overnight 2 days', r1.pairings[1].ndays === 2 && r1.pairings[1].start === 5);
  // 坏数据报告
  const bad = [LI.HEAD, ['X1', '2026-11-02', 'EU1', '蓉', '火星', '08:00', '09:00'], ['X2', '2026-11-02', 'EU3', 'ZUUU', 'ZGHA', '08:00', '10:00'], ['X2', '2026-11-02', 'EU4', 'ZGHA', 'ZPLJ', '09:30', '11:00'], ['X3', '2026-11-02', 'EU5', 'ZUUU', 'ZGHA', '8点', '10:00'], ['X4', '2026-12-05', 'EU7', 'ZUUU', 'ZGHA', '08:00', '10:00'], ['X4', '2026-12-05', 'EU8', 'ZGHA', 'ZUUU', '11:00', '13:00']];
  const r2 = LI.parseRows(bad, C, st); const R = r2.report;
  chk('report bad/unknown/overlap/notReturn/outOfMonth', R.badRows.length === 2 && R.unknownAirports['火星'] && R.overlaps.length === 1 && R.notReturn.length === 1 && R.outOfMonth.length === 1 && r2.pairings.length === 1, LI.reportText(R));
  // 应用 + 自动填人
  const s2 = C.generateLiteSample(20261101); LI.apply(s2, r1, 'replace', C); C.autoFill(s2); chk('apply+fill sample', s2.pairings.length === 3 && s2.pairings.every(p => p.crew.C && p.crew.F && p.crew.T));
  const s3 = C.generateLiteSample(20261101); const n0 = s3.pairings.length; LI.apply(s3, r1, 'merge', C); chk('merge', s3.pairings.length === n0 + 3);
  // 回测文件（本机存在才测；不入库）
  const f = '/workspace/exports/航段导入_9月回测.xlsx';
  if (fs.existsSync(f)) { const t0 = Date.now(); const x = await LI.readXlsx(ExcelJS, fs.readFileSync(f)); const r = LI.parseRows(x.rows, C, st, { allowUnknown: true });
    chk('backtest file 256 pairings', r.pairings.length === 256, LI.reportText(r.report).replace(/\n/g, ' | '));
    const s = C.generateLiteSample(20261101); LI.apply(s, r, 'replace', C); C.autoFill(s); const sm = C.summarize(s);
    chk('backtest fill runs', sm.full >= 248, `满员 ${sm.full}/${sm.total} hard ${sm.hard} ${Date.now() - t0}ms`); }
  console.log(fail ? 'LEGIMP FAIL ' + fail : 'LEGIMP ALL OK'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
