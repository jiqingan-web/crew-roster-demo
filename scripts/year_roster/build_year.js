// 全年真实班表 → 程序可加载的状态（化名）。
// 用法：node scripts/year_roster/build_year.js <cells.json 由 parse_year.py 生成> <输出 year-roster.json> [起始 MM-DD] [结束 MM-DD]
// 输出不含真实姓名，但含真实运行数据：放在本地，勿提交（.gitignore 已忽略 ref/ 与 *.xlsx；输出请写到 ref/ 或仓库外）。
//
// 与 scripts/official_roster/build.js 同口径：
//  - 单元格时刻 = 当日首段起飞 → 末段落地；中间各段按轮挡比例在窗口内切分（推算，leg.inferred = true）
//  - 同一天同航线串、同航班号、同时窗的人 = 同一机组；停在外站且 3 日内同机组从同一外站出发 → 串成多日任务（含外站休息日）
//  - 座位按职级推断（新机长 + 教员 → C=新机长、F=教员；否则 C=最高机长类、F=最高副驾驶、T=其余）
//  - 源表只有本中队：没出现的座位记为 srcCrew=null，校验时归为「外中队缺位」(info)
//  - 未知机场简称 → 占位机场（成都坐标），leg.unknownAp = true，回测报告中单列
'use strict';
const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'js', 'core.js')); const LI = require(path.join(ROOT, 'js', 'leg-import.js'));
const [, , inPath, outPath, fromMd = '01-01', toMd = '10-31'] = process.argv;
if (!inPath || !outPath) { console.error('usage: build_year.js cells.json out.json [MM-DD] [MM-DD]'); process.exit(2); }
const D = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const doy = md => { const [m, d] = md.split('-').map(Number); let n = d; for (let i = 0; i < m - 1; i++) n += MD[i]; return n; };
const D0 = doy(fromMd), D1 = doy(toMd), NDAYS = D1 - D0 + 1;
const dayOf = md => { const n = doy(md) - D0 + 1; return n >= 1 && n <= NDAYS ? n : null; };
const ab = Object.assign({}, LI.ABBR_FIXED); const airports = {}; const unknownAp = {};
const apCode = ch => { if (ab[ch]) return ab[ch]; const code = 'X' + ch.charCodeAt(0).toString(16).toUpperCase().slice(-3); if (!airports[code]) airports[code] = [ch + '(源表简称·未确认)', 30.58, 103.95]; unknownAp[ch] = (unknownAp[ch] || 0) + 1; return code; };
const BASES = new Set(['ZUUU', 'ZUTF']);
const issues = { singleStation: 0, overflowSeats: 0, noTime: 0 };

// ---- 人员 ----
const pilots = Object.entries(D.people).map(([id, x]) => ({
  id, name: id, rank: x.rank, squad: '七中队(化名)', fleet: 'A320',
  auth: Object.keys(C.AIRPORTS).concat(Object.keys(airports)), rnpAuth: Object.keys(C.AIRPORTS), // 资质源表未提供 → 全部授予，资质类规则不可判定
  prefs: [], leave: [], health: { noFly: false, noPlateau: false, noNight: false, maxMonthH: null, noSoleCaptain: false, bpNote: '', medExamExpiry: '', note: '' },
}));
const P = Object.fromEntries(pilots.map(p => [p.id, p]));

// ---- 非飞行 ----
const per = () => Object.fromEntries(pilots.map(p => [p.id, []]));
const leave = per(), training = per(), sim = per(), control = per(), standby = per(); const trainingKind = {}; const notes = {};
const push = (o, p, d) => { if (!o[p].includes(d)) o[p].push(d); };
const duty = {};
for (const c of D.cells) {
  const d = dayOf(c.md); if (!d) continue; const p = c.pid;
  if (c.kind === 'duty') { if (c.s == null) { issues.noTime++; continue; } ((duty[p] = duty[p] || {})[d] = duty[p][d] || []).push(c); }
  else if (c.kind === 'leave') push(leave, p, d);
  else if (c.kind === 'training') { push(training, p, d); (trainingKind[p] = trainingKind[p] || {})[d] = (c.text || '').replace('（', '(').replace('）', ')'); }
  else if (c.kind === 'sim') push(sim, p, d);
  else if (c.kind === 'control') push(control, p, d);
  else if (c.kind === 'standby') push(standby, p, d);
  else ((notes[p] = notes[p] || {})[d] = ((notes[p][d] || '') + ' ' + (c.text || '')).trim());
}
// 请假与执飞同日：源表以执飞为准（请假日不算）
for (const p in duty) for (const d in duty[p]) leave[p] = leave[p].filter(x => x !== +d);

// ---- 航段推算 ----
function legsOf(c, d) {
  let ch = [...c.route]; if (ch.length < 2) { ch = [ch[0], ch[0]]; issues.singleStation++; }
  const codes = ch.map(apCode); const fl = c.flts.map(f => f.replace('(V)', '')); const n = ch.length - 1;
  const s = c.s, e = c.e; const base = (d - 1) * 1440;
  const bm = []; for (let i = 0; i < n; i++) { let b = 90; try { if (C.AIRPORTS[codes[i]] && C.AIRPORTS[codes[i + 1]]) b = C.blockMin(codes[i], codes[i + 1]) || 90; } catch (err) {} bm.push(Math.max(40, b)); }
  const sumB = bm.reduce((a, b) => a + b, 0); const win = e - s; let k = 1, gap = n > 1 ? (win - sumB) / (n - 1) : 0;
  if (n > 1 && gap < 30) { k = Math.max(0.3, (win - 30 * (n - 1)) / sumB); gap = (win - sumB * k) / (n - 1); } if (n === 1) k = win / sumB;
  let t = s; const out = [];
  for (let i = 0; i < n; i++) { const b = Math.max(15, Math.round(bm[i] * k)); const arr = i === n - 1 ? e : t + b;
    const leg = { flt: fl[Math.min(i, fl.length - 1)], from: codes[i], to: codes[i + 1], dep: base + t, arr: base + arr, ac: 'A320' };
    if (c.dh) leg.dh = true; if (n > 1 && i < n - 1) leg.inferred = true; if (!ab[ch[i]] || !ab[ch[i + 1]]) leg.unknownAp = true;
    out.push(leg); t = Math.round(arr + gap); }
  return out;
}
// ---- 合车 + 串日 ----
const dg = {};
Object.keys(duty).forEach(p => Object.keys(duty[p]).forEach(d => {
  const cs = duty[p][d].slice().sort((a, b) => a.s - b.s); const raw = cs.map(c => c.route + ' ' + c.flts.join('/') + (c.dh ? '(随)' : '')).join(' + ');
  const key = d + '|' + raw + '|' + cs.map(c => c.s + '-' + c.e).join(',');
  (dg[key] = dg[key] || { d: +d, cs, raw, ids: [] }).ids.push(p);
}));
const items = Object.values(dg).sort((a, b) => a.d - b.d || a.cs[0].s - b.cs[0].s);
items.forEach(it => { it.ids.sort(); it.L = [].concat(...it.cs.map(c => legsOf(c, it.d))); it.ck = it.ids.join(','); });
const chains = []; const open = {};
for (const it of items) {
  const prev = open[it.ck]; const pl = prev && prev.legs[prev.legs.length - 1];
  if (prev && prev.last >= it.d - 3 && prev.last < it.d && !BASES.has(pl.to) && pl.to === it.L[0].from) { prev.legs.push(...it.L.map(l => Object.assign(l, { d: it.d - prev.start + 1 }))); prev.last = it.d; prev.raw.push(it.raw); }
  else { const ch = { ids: it.ids, start: it.d, last: it.d, legs: it.L.map(l => Object.assign(l, { d: 1 })), raw: [it.raw] }; chains.push(ch); open[it.ck] = ch; }
}
// ---- 座位 ----
const NEWC = ['SPIC', 'US', 'J0', '机长A', '机长B'];
const RO = ['TC', 'TB', 'TL', 'J3', 'J2', 'J1', '机长B', '机长A', 'SPIC', 'US', 'J0', 'F8', 'F7', 'F6', 'F5', 'F4', 'F3', 'F2', 'F1'];
const pairings = [];
for (const ch of chains) {
  const allDh = ch.legs.every(l => l.dh);
  const groups = allDh && ch.ids.length > 3 ? ch.ids.map(id => [id]) : [ch.ids]; // 全置位：每人一个置位任务
  for (const g0 of groups) {
    let ids = g0.slice().sort((a, b) => RO.indexOf(P[a].rank) - RO.indexOf(P[b].rank));
    const capt = ids.filter(i => C.isCaptClass(P[i].rank) || C.INSTR.includes(P[i].rank)); const fo = ids.filter(i => C.isFO(P[i].rank) && !capt.includes(i));
    const crew = { C: null, F: null, T: null }; let rest;
    const nc = capt.find(i => NEWC.includes(P[i].rank)), ins = capt.find(i => C.INSTR.includes(P[i].rank));
    if (nc && ins) { crew.C = nc; crew.F = ins; rest = ids.filter(i => i !== nc && i !== ins); }
    else { crew.C = capt[0] || null; crew.F = fo[0] || capt[1] || null; rest = ids.filter(i => i !== crew.C && i !== crew.F); }
    crew.T = rest.shift() || null; const extra = rest;
    const mk = cr => ({ id: '', start: ch.start, ndays: ch.last - ch.start + 1, ac: 'A320', legs: ch.legs.map(l => Object.assign({}, l)), crew: cr, srcCrew: Object.assign({}, cr), official: true, offRaw: ch.raw });
    pairings.push(mk(crew));
    if (extra.length) { issues.overflowSeats += extra.length; for (let k = 0; k < extra.length; k += 2) pairings.push(Object.assign(mk({ C: null, F: extra[k] || null, T: extra[k + 1] || null }), { offDup: true })); }
  }
}
pairings.sort((a, b) => a.legs[0].dep - b.legs[0].dep);
pairings.forEach((p, i) => { p.id = 'YR' + String(i + 1).padStart(4, '0'); p.legs.forEach(l => l.reg = 'REG-' + p.id); });
const out = { schema: 'year-roster/1', grid: { days: NDAYS, start: { m: +fromMd.slice(0, 2), d: +fromMd.slice(3) } }, year: D.year,
  source: `七中队全年班表 ${D.year}-${fromMd}..${toMd}（实际执行；化名 P###）`, airports, pilots, pairings, leave, training, trainingKind, sim, control, standby, notes,
  build: { issues, unknownAp, chains: chains.length } };
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('days', NDAYS, 'pilots', pilots.length, 'pairings', pairings.length, 'chains', chains.length, 'issues', JSON.stringify(issues), 'unknownAp', JSON.stringify(unknownAp));
const nd = pairings.filter(p => !p.legs.every(l => l.dh));
console.log('ndays', JSON.stringify(pairings.reduce((m, p) => (m[p.ndays] = (m[p.ndays] || 0) + 1, m), {})), 'endAway', pairings.filter(p => !BASES.has(p.legs[p.legs.length - 1].to)).length,
  'nonDH', nd.length, 'full3', nd.filter(p => p.crew.C && p.crew.F && p.crew.T).length);
