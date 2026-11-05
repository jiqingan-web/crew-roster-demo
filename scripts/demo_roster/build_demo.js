// 比赛演示数据：从全年真实班表（year-roster JSON，P### 匿名 id）截取近 3 个月航班，人员换成项目库化名（lite-roster.js），
// 机组清空，交给「一键排班」按规则填入。真实备份/培训/模拟机/控班/请假与特殊机场资质原样保留。
// 用法：node scripts/demo_roster/build_demo.js <year-q.json> <pmap.json: P###→lite id> <起 MM-DD> <止 MM-DD>
// 输出 js/demo-roster.js（仅化名，不含真名）
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..');
const L = require(path.join(R, 'js', 'lite-roster.js')).LITE_ROSTER;
const [, , yPath, mPath, fromMD, toMD, qPath] = process.argv; // qPath（可选）：synth_quals.py 生成的资质档案池
const Y = JSON.parse(fs.readFileSync(yPath, 'utf8')); const M = JSON.parse(fs.readFileSync(mPath, 'utf8'));
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const doy = md => { const [m, d] = md.split('-').map(Number); let n = d; for (let i = 0; i < m - 1; i++) n += MD[i]; return n; };
const y0 = doy(`${String(Y.grid.start.m).padStart(2, '0')}-${String(Y.grid.start.d).padStart(2, '0')}`);
const a = doy(fromMD) - y0 + 1, b = doy(toMD) - y0 + 1; const shift = a - 1;
// 人员：已匹配的用项目库化名；未匹配的按职级相近分配剩余化名
const LR = Object.fromEntries(L.map(p => [p.id, p])); const used = new Set(Object.values(M));
const free = L.filter(p => !used.has(p.id)); const idOf = {};
Y.pilots.forEach(p => { if (M[p.id] && LR[M[p.id]]) idOf[p.id] = M[p.id]; });
Y.pilots.filter(p => !idOf[p.id]).forEach(p => { let k = free.findIndex(q => q.rank === p.rank); if (k < 0) k = 0; const q = free.splice(k, 1)[0]; idOf[p.id] = q ? q.id : 'D' + p.id.slice(1); });
const EXTRA = ['温晨', '柯远', '祁峰', '易航', '岳川', '房宁']; let ex = 0; const exName = {}; // 项目库化名不够时的补充化名
const nameOf = id => (LR[id] ? LR[id].name : (exName[id] = exName[id] || EXTRA[ex++ % EXTRA.length]));
let pilots = Y.pilots.map(p => { const id = idOf[p.id]; const o = { id, name: nameOf(id), rank: p.rank, squad: '演示中队', fleet: p.fleet || 'A320', auth: p.auth || [], rnpAuth: p.rnpAuth || [] };
  ['qualRole', 'deptControl', 'traineeCapt', 'requalCapt', 'qualNotes'].forEach(k => { if (p[k] != null) o[k] = p[k]; }); return o; });
// 特殊机场资质：按资质表「同职级」的档案池分配（与真人脱钩，各职级 × 各机场 × 角色的比例与资质表一致）
let QAIR = Y.authAirports || null;
if (qPath) { const QP = JSON.parse(fs.readFileSync(qPath, 'utf8')); QAIR = QP.airports; const QS = new Set(QAIR); const used = {};
  const grp = r => /^F\d|^US|^SPIC/.test(r) ? 'FO' : 'CAP'; const byGrp = {}; Object.keys(QP.pool).forEach(r => { (byGrp[grp(r)] = byGrp[grp(r)] || []).push(...QP.pool[r]); });
  pilots = pilots.slice().sort((a, b) => a.id.localeCompare(b.id)).map(o => { const src = QP.pool[o.rank] && QP.pool[o.rank].length ? QP.pool[o.rank] : byGrp[grp(o.rank)];
    const k = used[o.rank] = (used[o.rank] || 0) + 1; const prof = src[(k - 1) % src.length];
    const base = (o.auth || []).filter(c => !QS.has(c)); const role = JSON.parse(JSON.stringify(prof.role));
    return Object.assign(o, { auth: base.concat(Object.keys(role)), rnpAuth: (o.rnpAuth || []).filter(c => !QS.has(c)).concat(Object.keys(role).filter(c => role[c].some(x => /RNP/.test(x)))), qualRole: role }); });
  const order = Object.fromEntries(Y.pilots.map((p, i) => [idOf[p.id], i])); pilots.sort((a, b) => order[a.id] - order[b.id]); }
const pairings = Y.pairings.filter(p => p.start >= a && p.start <= b).map((p, i) => ({ id: 'DM' + String(i + 1).padStart(3, '0'), start: p.start - shift, ndays: p.ndays, ac: p.ac || 'A320',
  legs: p.legs.map(l => { const o = Object.assign({}, l); o.dep -= shift * 1440; o.arr -= shift * 1440; /* l.d 为任务内第几天（相对），不随网格平移 */ o.reg = 'REG-DM' + String(i + 1).padStart(3, '0'); return o; }),
  crew: { C: null, F: null, T: null }, srcCrew: Object.fromEntries(['C', 'F', 'T'].map(k => [k, p.crew && p.crew[k] ? idOf[p.crew[k]] : null])), actualTimes: !!p.actualTimes }));
const days = Math.max(b - shift, ...pairings.map(p => p.start + p.ndays - 1));
const clip = o => { const r = {}; Y.pilots.forEach(p => { const v = ((o || {})[p.id] || []).map(d => d - shift).filter(d => d >= 1 && d <= days); if (v.length) r[idOf[p.id]] = v; }); return r; };
const tk = {}; Y.pilots.forEach(p => { const k = (Y.trainingKind || {})[p.id] || {}; const o = {}; Object.keys(k).forEach(d => { const dd = d - shift; if (dd >= 1 && dd <= days) o[dd] = k[d]; }); if (Object.keys(o).length) tk[idOf[p.id]] = o; });
const [fm, fd] = fromMD.split('-').map(Number);
const D = { grid: { days, start: { m: fm, d: fd } }, range: [fromMD, toMD], pilots, pairings, authAirports: QAIR, airports: Y.airports || {},
  leave: clip(Y.leave), training: clip(Y.training), trainingKind: tk, sim: clip(Y.sim), control: clip(Y.control), standby: clip(Y.standby) };
let js = `/* 比赛演示数据（由 scripts/demo_roster/build_demo.js 生成，勿手改）
 * 航班：全年真实班表 ${Y.year}-${fromMD}..${toMD} 开始的任务（航线/航班号/时刻取自源表；中间航段时刻按航距推算）。机组已清空，由「一键排班」按规则填入。
 * 人员：化名（项目库 lite-roster.js），职级与特殊机场资质取自公司资质表；备份/培训/模拟机/控班/请假取自真实班表。 */
(function (root) {
  "use strict";
  const DEMO_ROSTER = ${JSON.stringify(D)};
  function build(C) {
    const D = DEMO_ROSTER; if (C.setPeriod) C.setPeriod(D.grid);
    const st = C.generateLiteSample(20261101, { reserves: [23, 19] });
    const base = {}; st.pilots.forEach(p => { base[p.id] = p; });
    const reserves = st.pilots.filter(p => p.reserve);
    st.pilots = D.pilots.map(q => Object.assign({}, base[q.id] || {}, { health: { noFly: false, noPlateau: false, noNight: false, maxMonthH: null, noSoleCaptain: false, bpNote: '', medExamExpiry: '', note: '' }, prefs: [] }, JSON.parse(JSON.stringify(q)), { leave: (D.leave[q.id] || []).slice() })).concat(reserves);
    if (C.migratePilots) C.migratePilots(st);
    st.grid = D.grid; st.airports = Object.assign({}, C.AIRPORTS, D.airports); if (D.authAirports) st.authAirports = D.authAirports.slice();
    st.pairings = JSON.parse(JSON.stringify(D.pairings));
    const per = o => { const r = {}; st.pilots.forEach(p => { r[p.id] = ((o || {})[p.id] || []).slice(); }); return r; };
    st.training = per(D.training); st.sim = per(D.sim); st.control = per(D.control); st.standby = per(D.standby); st.simHold = null;
    st.trainingKind = {}; st.pilots.forEach(p => { st.trainingKind[p.id] = Object.assign({}, D.trainingKind[p.id] || {}); });
    Object.assign(st, { sample: true, lite: true, demo: 1, fixedDuties: true, official: 0, fills: [], fillResult: null, demoHoles: [], demoHolesApplied: true, demoAnomalies: [], demoAnomaliesApplied: true, solHist: [], solN: 0, solIdx: null });
    st.settings.demoHoles = 0;
    return st;
  }
  const api = { DEMO_ROSTER, build, NAME: '近三个月航班（${fromMD}–${toMD}）' };
  if (typeof module === "object" && module.exports) module.exports = api; else root.RosterDemo = api;
})(typeof self !== "undefined" ? self : this);
`;
fs.writeFileSync(path.join(R, 'js', 'demo-roster.js'), js);
// 内置预计算：用与页面「一键排班」完全相同的引擎与参数（固定种子、按月）算一遍，结果写回数据文件；页面输入未改动时直接载入
if (!process.env.NO_SOLVE) {
  delete require.cache[require.resolve(path.join(R, 'js', 'demo-roster.js'))];
  const C = require(path.join(R, 'js', 'core.js')); const Dm = require(path.join(R, 'js', 'demo-roster.js'));
  const st = Dm.build(C); const t = Date.now();
  const info = C.autoFillByMonth(st, { seed: 20260801, tries: 1, minDiff: 0, attempts: 1, passes: 2, byMonth: true });
    // 只移除用户明确要求删除的任务（DM138，用户 2026-11-04 指定）；其余排不满的保留，让系统如实报出、再由人工处理
  const EXCLUDE = new Set(['DM138']); const keep = st.pairings.map(p => !EXCLUDE.has(p.id)); const dropped = st.pairings.filter((p, i) => !keep[i]).map(p => p.id);
  if (dropped.length) { st.pairings = st.pairings.filter((p, i) => keep[i]); D.pairings = D.pairings.filter((p, i) => keep[i]); js = js.replace(/const DEMO_ROSTER = .*;\n/, () => `const DEMO_ROSTER = ${JSON.stringify(D)};\n`); }
  info.autoResolved = (info.autoResolved || []).concat(C.autoResolveHoles(st)); // 移除指定任务后的最终状态再判一次零代价补位（与页面一致）
  const solved = st.pairings.map(p => [p.crew.C || 0, p.crew.F || 0, p.crew.T || 0]);
  const s = C.summarize(st); console.log('dropped unfilled', dropped.join(',') || '无');
  fs.writeFileSync(path.join(R, 'js', 'demo-roster.js'), js.replace('const api = { DEMO_ROSTER, build,', `const SOLVED = ${JSON.stringify({ crews: solved, full: s.full, total: s.total, hard: s.hard, ms: Date.now() - t, autoResolved: (info.autoResolved || []).filter(x => keep[st.pairings.findIndex(p => p.id === x.pairing)] !== false) })};\n  const api = { DEMO_ROSTER, SOLVED, build,`));
  console.log('solved', s.full + '/' + s.total, 'hard', s.hard, (Date.now() - t) + 'ms');
}
console.log('pilots', pilots.length, 'pairings', pairings.length, 'days', days, 'bytes', js.length);
