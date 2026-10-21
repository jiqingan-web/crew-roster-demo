// Excel 甘特导出：node test/xlsx.test.js
const ExcelJS = require('../js/vendor/exceljs.min.js'); const C = require('../js/core.js'); const X = require('../js/xlsx-gantt.js');
(async () => { let fail = 0; const chk = (n, ok, i) => { console.log('XLSX ' + n, ok ? 'OK' : 'FAIL', i || ''); if (!ok) fail++; };
  const st = C.generateLiteSample(7); C.autoFill(st); C.leaveDemoHoles(st);
  const wb = X.build(ExcelJS, C, st, { plan: 'test' }); const buf = await wb.xlsx.writeBuffer();
  const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(buf); const ws = w2.getWorksheet('人员甘特');
  chk('sheets', ['人员甘特', '任务甘特', '图例与统计'].every(n => w2.getWorksheet(n)));
  chk('rows', ws.rowCount === st.pilots.length + 2, ws.rowCount);
  chk('frozen', ws.views[0].state === 'frozen' && ws.views[0].xSplit === 4);
  const merges = Object.keys(ws._merges || {}).length; chk('merges', merges > st.pilots.length, merges);
  let notes = 0; ws.eachRow(r => r.eachCell(c => { if (c.note) notes++; })); chk('notes', notes > 100, notes);
  chk('landscape', ws.pageSetup.orientation === 'landscape');
  console.log(fail ? 'XLSX FAIL ' + fail : 'XLSX ALL OK'); process.exit(fail ? 1 : 0); })();
