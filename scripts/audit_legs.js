// 用现有规则审核一份航段导入表（空白航段 / 无机组）：node scripts/audit_legs.js <航段.xlsx> [输出 audit.json]
// 审核项：导入闸门（解析、衔接、基地、月份、未知机场）+ 任务固有问题（pairingIntrinsic：日飞行时间、飞行值勤期、过夜休息、第 5 日等）
'use strict';
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const ExcelJS = require(path.join(ROOT, 'js/vendor/exceljs.min.js')); const C = require(path.join(ROOT, 'js/core.js')); const LI = require(path.join(ROOT, 'js/leg-import.js'));
(async () => {
  const st = C.generateLiteSample(20261101);
  const x = await LI.readXlsx(ExcelJS, fs.readFileSync(process.argv[2]));
  const r = LI.parseRows(x.rows, C, st, { allowUnknown: true });
  console.log(LI.reportText(r.report));
  const ir = LI.intrinsicReport(r, C, st);
  const kinds = {}; ir.forEach(z => z.blocking.concat(z.ftl).forEach(m => { const k = (m.match(/^[^：:0-9（(]+/) || ['其他'])[0].replace(/\s*D\d.*/, '').trim(); kinds[k] = (kinds[k] || 0) + 1; }));
  console.log('任务固有问题：阻断', ir.filter(z => z.blocking.length).length, '个任务；时限类', ir.filter(z => z.ftl.length).length, '个任务');
  console.log('按类型', JSON.stringify(kinds));
  // 逐任务飞行值勤期（无人员也可算）
  const tmp = Object.assign({}, st, { airports: Object.assign({}, st.airports || {}) }); (r.unknownCodes || []).forEach(c => { if (!tmp.airports[c]) tmp.airports[c] = [c + '(导入)', 30.6, 104.0]; });
  const fdp = []; r.pairings.forEach(pr => C.fdpDays(pr, tmp).forEach(dy => fdp.push({ id: pr.id, d: dy.d, fdp: dy.planFdp, limit: dy.limit, buffer: dy.planBuffer, flt: dy.planFlt, fltLimit: dy.fltLimit, nLegs: (dy.legs || []).filter(l => !(l.leg || l).dh).length })));
  const bins = { '超限': 0, '<30分': 0, '30–60分': 0, '60–120分': 0, '≥120分': 0 }; fdp.forEach(z => { const b = z.buffer; bins[b < 0 ? '超限' : b < 30 ? '<30分' : b < 60 ? '30–60分' : b < 120 ? '60–120分' : '≥120分']++; });
  console.log('值勤日', fdp.length, '飞行值勤期余量分布', JSON.stringify(bins), '飞行时间超限值勤日', fdp.filter(z => z.flt > z.fltLimit).length);
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ report: r.report, unknownCodes: r.unknownCodes, intrinsic: ir, fdp, pairings: r.pairings.map(p => ({ id: p.id, start: p.start, ndays: p.ndays, legs: p.legs.length })) }));
})().catch(e => { console.error(e); process.exit(1); });
