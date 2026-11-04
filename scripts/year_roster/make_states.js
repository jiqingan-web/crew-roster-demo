// year-roster.json → 程序「导入导出 → 恢复备份」可直接加载的状态 JSON（整段一份 + 每月一份）
// 用法：node scripts/year_roster/make_states.js <year-roster.json> <输出目录>
'use strict';
const path = require('path'); const fs = require('fs');
const C = require(path.join(__dirname, '..', '..', 'js', 'core.js'));
const [, , inPath, outDir] = process.argv;
const Y = JSON.parse(fs.readFileSync(inPath, 'utf8')); fs.mkdirSync(outDir, { recursive: true });
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function makeState(grid, pairings, dayShift, keepDay, label) {
  C.setPeriod(grid);
  const st = C.generateLiteSample(1, { reserves: false });
  const clip = o => { const r = {}; Y.pilots.forEach(p => { r[p.id] = ((o || {})[p.id] || []).map(d => d - dayShift).filter(keepDay); }); return r; };
  st.pilots = JSON.parse(JSON.stringify(Y.pilots)); const lv = clip(Y.leave); st.pilots.forEach(p => { p.leave = lv[p.id]; });
  st.pairings = JSON.parse(JSON.stringify(pairings)).map(pr => { pr.start -= dayShift; pr.legs.forEach(l => { l.dep -= dayShift * 1440; l.arr -= dayShift * 1440; }); return pr; });
  st.airports = Object.assign({}, C.AIRPORTS, Y.airports);
  if (Y.authAirports) st.authAirports = Y.authAirports.slice(); // 公司特殊机场资质表覆盖的机场
  st.training = clip(Y.training); st.sim = clip(Y.sim); st.control = clip(Y.control); st.standby = clip(Y.standby); st.simHold = null;
  st.trainingKind = {}; Y.pilots.forEach(p => { const k = (Y.trainingKind || {})[p.id] || {}; st.trainingKind[p.id] = {}; Object.keys(k).forEach(d => { const dd = d - dayShift; if (keepDay(dd)) st.trainingKind[p.id][dd] = k[d]; }); });
  Object.assign(st, { sample: false, lite: true, official: 1, grid, demoHoles: [], demoHolesApplied: true, demoAnomalies: [], demoAnomaliesApplied: true, fills: [], solN: 1, solIdx: 0, yearRoster: { source: Y.source, label } });
  st.settings.demoHoles = 0;
  return st;
}
const written = [];
// 整段
{ const st = makeState(Y.grid, Y.pairings, 0, d => d >= 1 && d <= Y.grid.days, '整段');
  const f = path.join(outDir, `state_${Y.year}_${String(Y.grid.start.m).padStart(2, '0')}-${String(Y.grid.start.d).padStart(2, '0')}_${Y.grid.days}d.json`); fs.writeFileSync(f, JSON.stringify(st)); written.push([f, st.pairings.length]); }
// 每月：收录当月开始的任务；网格延伸到当月最后一个任务结束（跨月任务完整保留）
let off = 0; const startDoy = (() => { let n = Y.grid.start.d; for (let i = 0; i < Y.grid.start.m - 1; i++) n += MD[i]; return n; })();
for (let m = Y.grid.start.m; m <= 12; m++) {
  let mStart = 1; for (let i = 0; i < m - 1; i++) mStart += MD[i]; const shift = mStart - startDoy; // 网格第 (shift+1) 日 = 当月 1 日
  if (shift >= Y.grid.days) break;
  const prs = Y.pairings.filter(p => p.start > shift && p.start <= shift + MD[m - 1]);
  if (!prs.length) continue;
  const lastDay = Math.max(MD[m - 1], ...prs.map(p => p.start - shift + p.ndays - 1));
  const grid = { days: Math.min(lastDay, Y.grid.days - shift), start: { m, d: 1 } };
  const st = makeState(grid, prs, shift, d => d >= 1 && d <= grid.days, m + '月');
  const f = path.join(outDir, `state_${Y.year}_${String(m).padStart(2, '0')}.json`); fs.writeFileSync(f, JSON.stringify(st)); written.push([f, prs.length, grid.days]);
}
C.setPeriod({ days: 30, start: { m: 11, d: 1 } });
written.forEach(w => console.log(path.basename(w[0]), 'pairings', w[1], w[2] ? 'days ' + w[2] : ''));
