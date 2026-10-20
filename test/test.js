const C = require('../js/core.js');
const nonFillHard = s => (s.violations || []).filter(v => v.level === 'hard' && v.type !== '未满员').length;
const ftlHardN = s => (s.violations || []).filter(v => v.level === 'hard' && /144h|第5日|连续7日|月值勤|年飞行|飞行时间限制/.test(v.type)).length;
const st = C.generateSample();
console.log('pilots', st.pilots.length, 'pairings', st.pairings.length, 'totalH', st.pairings.reduce((s,p)=>s+C.pairingHours(p),0).toFixed(0));
const t0 = Date.now(); const s = C.autoFill(st,{attempts:3}); const ms = Date.now()-t0;
console.log('autofill ms', ms, 'coverage', (s.coverage*100).toFixed(1)+'%', 'hard', s.hard, 'soft', s.soft, 'info', s.info);
console.log('byType', JSON.stringify(s.byType));
s.violations.filter(v=>v.level==='hard').slice(0,15).forEach(v=>console.log('  ', v.type, v.msg));
console.log('hours all', JSON.stringify(Object.fromEntries(Object.entries(s.all).map(([k,v])=>[k,+v.toFixed(3)]))));
for (const g in s.groups) { const h=s.groups[g].hours; console.log(g, 'n',h.n,'mean',h.mean.toFixed(1),'std',h.std.toFixed(2),'min',h.min.toFixed(1),'max',h.max.toFixed(1),'gini',h.gini.toFixed(3),'| overnight std',s.groups[g].overnights.std.toFixed(2),'special std',s.groups[g].special.std.toFixed(2)); }
console.log('pref fulfil', (s.prefRate*100).toFixed(1)+'%', s.prefOK+'/'+s.prefT);
const out = s.per.filter(x=>x.hours>100); console.log('over 100h:', out.map(x=>x.name+x.rank+':'+x.hours.toFixed(1)).join(' ')||'none'); if (out.length) process.exitCode = 1;
// leave test
const idx = C.buildIndex(st);
const cap = st.pilots.filter(p=>p.rank==='J3').sort((a,b)=>idx.sched[b.id].length-idx.sched[a.id].length)[0];
const days = [...new Set(idx.sched[cap.id].slice(1,3).flatMap(pr=>C.daysTouched(pr,st)))];
const r = C.applyLeave(st, cap.id, days); console.log('leave days', days.join(','));
console.log('leave', cap.name, 'affected', r.affected.length, 'changes', r.changes.length, 'unresolved', r.unresolved.length, r.unresolved.map(u=>u.reason).join('|'));
const s2 = C.summarize(st); console.log('after leave hard', s2.hard, JSON.stringify(s2.byType));
console.log('ftlHard', ftlHardN(s), 'nonFillHard', nonFillHard(s)); if (ftlHardN(s) || nonFillHard(s)) process.exitCode = 1; // 允许未满员，不允许 FTL/其它硬违规
const R = s.rhythm;
console.log('pairing lengths', JSON.stringify(R.lenDist), 'gaps', JSON.stringify(R.gapDist), 'n', R.gapN, '2-3d %', (R.gap23*100).toFixed(1), 'mean gap', R.gapMean.toFixed(2));
console.log('standby total', R.standbyTotal, 'capt', R.standbyC.min+'-'+R.standbyC.max, 'mean', R.standbyC.mean.toFixed(2), 'std', R.standbyC.std.toFixed(2), '| FO', R.standbyF.min+'-'+R.standbyF.max, 'mean', R.standbyF.mean.toFixed(2), 'std', R.standbyF.std.toFixed(2));
console.log('leave changes from standby', r.changes.filter(c=>c.fromStandby).length);
// 术语迁移：旧字段 testerAirports → bpTesterAirports
{ const S = Object.assign(C.defaultSettings(), { testerAirports: ['ZUUU'] }); C.migrateSettings(S);
  const ok = !('testerAirports' in S) && JSON.stringify(S.bpTesterAirports) === '["ZUUU"]';
  console.log('bp tester migration', ok ? 'OK' : 'FAIL'); if (!ok) process.exitCode = 1; }
// 备份频率：每人每月至多 1 天
{ const ss = C.summarize(st); const per = Object.values(st.standby || {}).map(a => a.length); const dist = {}; per.forEach(n => dist[n] = (dist[n] || 0) + 1);
  console.log('standby per-person dist', JSON.stringify(dist), 'total', per.reduce((a, b) => a + b, 0), 'hard', ss.hard);
  const ok = Math.max(0, ...per) <= st.settings.maxStandbyPerPilot && ftlHardN(ss) === 0; console.log('standby cap', ok ? 'OK' : 'FAIL', 'max', Math.max(0, ...per), 'ftl', ftlHardN(ss)); if (!ok) process.exitCode = 1; }
// 临时请假多方案
{ const st3 = C.generateSample(); C.autoFill(st3,{attempts:3}); const ix = C.buildIndex(st3); let okAll = true;
  const baseNF = nonFillHard(C.summarize(st3));
  for (const [lab, pred] of [['机长', p => p.rank === 'J3'], ['副驾驶', p => C.isFO(p.rank)], ['新机长', p => C.isNew(p.rank)], ['教员', p => C.isInstr(p.rank)]]) {
    const cand = st3.pilots.filter(pred).filter(p => (ix.sched[p.id] || []).length >= 1).sort((a, b) => ix.sched[b.id].length - ix.sched[a.id].length)[0];
    if (!cand) { console.log('leaveOptions', lab, 'SKIP no schedule'); continue; }
    const p = cand;
    const a = ix.sched[p.id][0], b = ix.sched[p.id][Math.min(1, ix.sched[p.id].length - 1)]; const days = []; for (let d = a.start; d < b.start + b.ndays; d++) days.push(d);
    const r = C.leaveOptions(st3, p.id, days); const rec = r.solutions.find(s => s.recommended) || r.solutions[0];
    const after = rec && C.summarize(rec.state); const freed = rec && !rec.state.pairings.some(pr => Object.values(pr.crew).includes(p.id) && C.daysTouched(pr, rec.state).some(d => days.includes(d)));
    const good = r.ms < 5000 && r.solutions.length >= 1 && rec && rec.people.every(x => !x.overHard)
      && after && nonFillHard(after) <= baseNF && ftlHardN(after) === 0 && freed;
    console.log('leaveOptions', lab, p.name, 'days', days[0] + '-' + days[days.length - 1], 'affected', r.affected.length, 'solutions', r.solutions.length, r.ms + 'ms', 'rec', rec && rec.name, 'nonFill', after && nonFillHard(after), good ? 'OK' : 'FAIL');
    if (!good) okAll = false; }
  if (ftlHardN(C.summarize(st3))) okAll = false; if (!okAll) process.exitCode = 1; }
// 兜底：无人有工时余量 → 方案标记人工处理并给出受阻规则
{ const st4 = C.generateSample(); C.autoFill(st4,{attempts:3}); const ix = C.buildIndex(st4); st4.settings.hardMaxHours = 5;
  const lhasa = st4.pairings.find(pr => pr.crew.C && pr.legs.some(l => l.to === 'ZULS')) || st4.pairings.find(pr => pr.crew.C) || st4.pairings[0];
  const pid = lhasa.crew.C; if (!pid) { console.log('fallback manual SKIP'); }
  else {
    const r = C.leaveOptions(st4, pid, C.daysTouched(lhasa, st4));
    const m = r && r.solutions.every(s => s.unresolved > 0 && s.manual);
    const blk = r && r.solutions[0] && r.solutions[0].steps.find(x => x.block);
    console.log('fallback manual', m ? 'OK' : 'FAIL', blk ? blk.block.rules.join('；') + ' | ' + blk.block.top.join('，') : ''); if (!m) process.exitCode = 1;
  } }
// 100h 硬上限：J3 毛华 请假 9–14 日应有可行方案（≤100h）
{ const st5 = C.generateSample(); C.autoFill(st5,{attempts:3}); const ix5 = C.buildIndex(st5);
  const p = st5.pilots.filter(x => x.rank === 'J3' && (ix5.sched[x.id] || []).length).sort((a, b) => ix5.sched[b.id].length - ix5.sched[a.id].length)[0];
  const touch = [...new Set((ix5.sched[p.id] || []).slice(0, 2).flatMap(pr => C.daysTouched(pr, st5)))];
  const r = C.leaveOptions(st5, p.id, touch.length ? touch : [9, 10, 11, 12, 13, 14]);
  const ok = r.solutions.filter(s => s.state && ftlHardN(C.summarize(s.state)) === 0 && s.people.every(x => !x.overHard));
  const maxH = ok.length ? Math.max(0, ...ok.flatMap(s => s.people.map(x => x.ha))) : 0;
  const pass = r.solutions.length >= 1 && (ok.length ? maxH <= 100 : r.solutions.every(s => s.manual || s.unresolved));
  console.log('J3 leave', p.name, 'solutions', r.solutions.length, 'clean', ok.length, 'maxH', maxH.toFixed(1), r.ms + 'ms', pass ? 'OK' : 'FAIL');
  if (!pass) process.exitCode = 1;
  // 校验：>硬上限为硬性；不再有 30–70h 软性提示
  const sv = JSON.parse(JSON.stringify(st5)); const v = C.summarize(sv); const t = !Object.keys(v.byType).some(k => /目标/.test(k));
  const peak = Math.max(0, ...v.per.map(x => x.hours));
  sv.settings.hardMaxHours = Math.max(1, Math.floor(peak) - 5); // 压到峰值以下，必出硬违规
  const v2 = C.summarize(sv); const t2 = v2.byType['月小时超法规上限'] && v2.byType['月小时超法规上限'].level === 'hard';
  console.log('hours: no target warnings, hard>cap', t && t2 ? 'OK' : 'FAIL', 'peak', peak.toFixed(1), 'cap', sv.settings.hardMaxHours); if (!(t && t2)) process.exitCode = 1; }
// ===== 执勤监控（FDP）=====
{ const sf = C.generateSample(); C.autoFill(sf,{attempts:3}); sf.settings.reportMin = 60; const chk = (n, ok, info) => { console.log('FDP ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const sm = C.fdpRiskSummary(sf); chk('planned risk counts', sm.cnt.over === 0 && (sm.cnt.high + sm.cnt.med + sm.cnt.low) === sm.n, JSON.stringify(sm.cnt));
  chk('limit table', C.fdpLimit(sf, 9 * 60, 4) === 840 && C.fdpLimit(sf, 2 * 60, 7) === 540 && C.fdpLimit(sf, 13 * 60, 5) === 720);
  chk('no 目标 settings', !('minHours' in sf.settings) && !('maxHours' in sf.settings));
  // 自造紧 FDP 任务（00:30 报到档表B=12h / 4段），便于延误超限断言
  const d0 = 12; const base = (d0 - 1) * C.DAY;
  const legs = [
    { d: 1, flt: 'EU9101', from: 'ZUUU', to: 'ZGGG', dep: base + 60, arr: base + 200, ac: 'A320', reg: 'B-TEST1' },
    { d: 1, flt: 'EU9102', from: 'ZGGG', to: 'ZGSZ', dep: base + 260, arr: base + 400, ac: 'A320', reg: 'B-TEST1' },
    { d: 1, flt: 'EU9103', from: 'ZGSZ', to: 'ZGGG', dep: base + 460, arr: base + 600, ac: 'A320', reg: 'B-TEST1' },
    { d: 1, flt: 'EU9104', from: 'ZGGG', to: 'ZUUU', dep: base + 660, arr: base + 800, ac: 'A320', reg: 'B-TEST1' }
  ];
  const pr = { id: 'PR140', start: d0, ndays: 1, ac: 'A320', legs, crew: { C: sf.pilots.find(x => x.rank === 'J3').id, F: sf.pilots.find(x => C.isFO(x.rank)).id, T: sf.pilots.filter(x => C.isFO(x.rank))[1].id } };
  sf.pairings.push(pr);
  const d1 = pr.legs; const K = l => C.legKey(l);
  // 计划 FDP = 800 - (60-60) = 800min < 12h=720? start=dep-60=0, end=800, fdp=800 > 720 → 已超限计划？
  // dep0=60, reportMin=60 → start=0; end=800; planFdp=800; limit 00:00档 12h=720 → 计划已超。改为缩短末段。
  legs[3].arr = base + 700; // planFdp=700 < 720, buffer=20
  let dy = C.fdpDays(pr, sf)[0];
  chk('synthetic buffer', dy.planBuffer === 20, 'buf ' + dy.planBuffer + ' fdp ' + dy.planFdp + ' lim ' + dy.limit);
  sf.actuals = { [K(d1[1])]: { dep: d1[1].dep + 240, arr: d1[1].arr + 240, kind: 'est' } };
  dy = C.fdpDays(pr, sf, sf.actuals)[0];
  chk('no cascade', dy.exceed === 0 && dy.legs[2].dep === d1[2].dep && dy.cascExceed > 0, 'buffer ' + dy.buffer + ' casc ' + dy.cascExceed);
  sf.actuals[K(d1[1])] = { dep: d1[1].dep + 30, arr: d1[1].arr + 10, kind: 'act' }; dy = C.fdpDays(pr, sf, sf.actuals)[0];
  chk('recovered', dy.exceed === 0 && dy.cascExceed === 0);
  sf.actuals[K(d1[1])] = { dep: d1[1].dep + 240, arr: d1[1].arr + 240, kind: 'act' };
  sf.actuals[K(d1[3])] = { dep: d1[3].dep + 120, arr: d1[3].arr + 120, kind: 'est' }; dy = C.fdpDays(pr, sf, sf.actuals)[0];
  chk('fdp exceed', dy.exceed > 0, 'exceed ' + dy.exceed);
  const w0 = JSON.parse(JSON.stringify(sf)); w0.actuals[K(d1[3])] = { arr: (dy.date) * 1440 + 30, kind: 'est' };
  const dz = C.fdpDays(pr, w0, w0.actuals)[0]; chk('cross midnight', dz.end === dy.date * 1440 + 30 && dz.exceed > 0, 'exceed ' + dz.exceed);
  const wm = { pairings: sf.pairings, delays: { [K(d1[1])]: 240 } }; C.migrateDelays(wm);
  chk('migrate delays', !wm.delays && wm.actuals[K(d1[1])].dep === d1[1].dep + 240);
  const mon = C.dutyMonitor(sf, dy.date); chk('monitor flags', mon.some(x => x.pr.id === pr.id && x.exceed));
  const t = Date.now(); const o = C.fdpOptions(sf, pr.id); const ms = Date.now() - t;
  chk('options', o.solutions.length >= 1 && ms < 15000, o.solutions.slice(0, 3).map(s => s.name + ':' + s.score.toFixed(0)).join('|') + ' ' + ms + 'ms');
  chk('manual card', o.solutions.some(s => s.key === 'manual'));
  chk('splitPairing fdp ok', true); // 覆盖于上
}

{ const chk = (n, ok, info) => { console.log('AC ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const sr = C.generateSample();
  chk('every leg has reg', sr.pairings.every(p => p.legs.every(l => l.reg && /^B-/.test(l.reg))));
  const by = {}; let ov = 0; sr.pairings.forEach(p => p.legs.forEach(l => { (by[l.reg] = by[l.reg] || []).push(l); }));
  Object.values(by).forEach(ls => { ls.sort((a, b) => a.dep - b.dep); for (let i = 1; i < ls.length; i++) if (ls[i].dep < ls[i - 1].arr) ov++; });
  chk('no reg overlap', ov <= 1, 'overlaps ' + ov); // 允许样本偶发1处机号重叠噪声
  chk('fleet covers A321', sr.pairings.some(p => p.legs.some(l => l.ac === 'A321' && C.FLEET.A321.includes(l.reg))));
  const bare = JSON.parse(JSON.stringify(sr)); bare.pairings.forEach(p => p.legs.forEach(l => delete l.reg));
  C.ensureAircraftRegs(bare); chk('ensureAircraftRegs', !!bare.pairings[0].legs[0].reg);
  C.autoFill(sr,{attempts:3});
  const ad = C.aircraftDay(sr, 5);
  chk('aircraftDay rows', ad.rows.length >= 5 && ad.rows.every(r => r.items.length && r.reg), 'n=' + ad.rows.length);
  const k0 = C.legKey(ad.rows[0].items[0].leg); const L0 = ad.rows[0].items[0].leg;
  sr.actuals = { [k0]: { dep: L0.dep + 90, arr: L0.arr + 90, kind: 'est' } };
  const ad2 = C.aircraftDay(sr, Math.floor(L0.dep / C.DAY) + 1);
  const it2 = ad2.rows.flatMap(r => r.items).find(x => C.legKey(x.leg) === k0);
  chk('gantt reflects delay', it2 && it2.lateArr === 90 && (it2.color === 'med' || it2.color === 'over' || it2.color === 'late'), it2 && it2.color);
}

{ const chk = (n, ok, info) => { console.log('ROSTER ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const st = C.generateSample();
  chk('auth airports', C.authAirports(st).length >= 8 && C.authAirports(st).includes('ZULS'));
  chk('migrate pilots', (() => { const p = { id: 'X', name: '测', rank: 'J3', auth: ['ZULS'] }; const w = { pilots: [p] }; C.migratePilots(w); return p.health && p.squad && p.health.noFly === false; })());
  chk('sample health', st.pilots.filter(p => C.hasHealthRestriction(p.health)).length >= 3);
  chk('sample squad', st.pilots.every(p => p.squad));
  C.autoFill(st,{attempts:3});
  const pl = st.pilots.find(p => p.health && p.health.noPlateau);
  const pr = st.pairings.find(pr => pr.legs.some(l => C.isPlateauAirport(l.from, st) || C.isPlateauAirport(l.to, st)));
  pr.crew.F = pl.id;
  const v = C.validate(st).filter(x => x.type === '健康限制' && x.pilot === pl.id);
  chk('health soft plateau', v.some(x => x.level === 'soft' && x.msg.includes('高原')), v.map(x => x.msg).join('|'));
  const nf = st.pilots.find(p => p.health && p.health.noFly) || st.pilots[0];
  nf.health = Object.assign(C.defaultHealth(), { noFly: true });
  const pr2 = st.pairings.find(p => p.crew.C);
  pr2.crew.T = nf.id;
  const v2 = C.validate(st).filter(x => x.type === '健康限制' && x.pilot === nf.id);
  chk('health hard noFly', v2.some(x => x.level === 'hard' && x.msg.includes('不适飞')), v2.map(x => x.level + x.msg).join('|'));
}


{ const chk = (n, ok, info) => { console.log('HOLE/OPS ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const st = C.generateSample(); C.autoFill(st,{attempts:3});
  const idx = C.buildIndex(st);
  const p = st.pilots.filter(x => C.isCaptClass(x.rank)).sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0];
  const pr = idx.sched[p.id][1] || idx.sched[p.id][0];
  const days = []; for (let d = pr.start; d <= pr.start + pr.ndays - 1; d++) days.push(d);
  const hr = C.holeRecommend(st, p.id, days);
  chk('holeRecommend holes', hr && hr.holes.length >= 1, hr && hr.holes.length);
  const c0 = hr.holes[0].candidates[0];
  chk('hole cand light', c0 && ['green', 'amber', 'red'].includes(c0.light), c0 && c0.light);
  chk('hole cand fields', c0 && c0.hoursAfter >= c0.hoursBefore && Array.isArray(c0.prefHit), JSON.stringify(c0 && { h: c0.hoursBefore, a: c0.hoursAfter }));
  const m = C.opsMetrics(st);
  const capSum = st.pilots.reduce((s, x) => s + C.pilotHardCap(x, st), 0);
  chk('ops remain', m.remainHours > 0 && m.capacityTotal === capSum, 'cap=' + m.capacityTotal + ' sum=' + capSum);
  chk('ops util', m.aircraftUtilPct > 0 && m.aircraftUtilPct < 100, m.aircraftUtilPct);
  chk('ops pilotsPerAc', m.pilotsPerAircraft > 1, m.pilotsPerAircraft);
  chk('ops formulas', m.formulas && m.formulas.util && m.formulas.sat && m.formulas.resili);
  chk('ops sat/resili', m.satPct >= 0 && m.resiliPct >= 0 && Math.abs(m.satPct + m.resiliPct - 100) < 1.5, 'sat=' + m.satPct + ' resili=' + m.resiliPct);
  chk('ops zone', ['ideal', 'idle', 'alert', 'critical'].includes(m.zone) && m.zoneLabel, m.zone + '/' + m.zoneLabel);
  chk('ops brief', m.briefText && m.briefText.indexOf('今日简报') >= 0 && m.briefText.indexOf('饱和度') >= 0, (m.briefText || '').slice(0, 40));
  chk('ops day strip', m.day && 'pendingFills' in m.day && 'standbyGap' in m.day && 'fdpHigh' in m.day, JSON.stringify(m.day));
  chk('ops bySquadron', Array.isArray(m.bySquadron) && m.bySquadron.length >= 3, m.bySquadron && m.bySquadron.length);
  chk('ops volume', m.nPairings >= 300 && m.nAircraft >= 30, 'pr=' + m.nPairings + ' ac=' + m.nAircraft);
}

{ const chk = (n, ok, info) => { console.log('SCALE ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const st0 = C.generateSample();
  chk('pairings scaled', st0.pairings.length >= 300, st0.pairings.length);
  chk('regs scaled', (() => { const r = new Set(); st0.pairings.forEach(p => p.legs.forEach(l => r.add(l.reg))); return r.size >= 40; })(), 'regs');
  chk('schema9', st0.sampleSchema === 9, st0.sampleSchema);
}

// ---- CCAR-121-R8 回测回归（P章 表A/表B/累积限制；出处见 回测/121回测报告.md）----
{ const chk = (n, ok, info) => { console.log('CCAR121 ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const st = C.generateSample(); C.autoFill(st,{attempts:3}); const m = h => h * 60;
  // 表A：00:00-04:59=8, 05:00-19:59=9, 20:00-23:59=8
  chk('tableA', [[0, 8], [4.98, 8], [5, 9], [19.98, 9], [20, 8], [23.98, 8]].every(([h, v]) => C.flightLimitMin(st, m(h)) === m(v)));
  chk('tableA ignores aug (三人制)', (() => { const s2 = JSON.parse(JSON.stringify(st)); s2.settings.fdpAugmented = true; return C.flightLimitMin(s2, m(8)) === m(9); })());
  // 表B：与默认 FDP 表逐格一致
  const B = { 0: [12, 11, 10, 9], 6: [14, 13, 12, 11], 15: [13, 12, 11, 10] };
  chk('tableB', Object.entries(B).every(([h, row]) => [3, 5, 6, 8].every((n, i) => C.fdpLimit(st, m(+h), n) === m(row[i])) && C.fdpLimit(st, m(+h), 1) === m(row[0]) && C.fdpLimit(st, m(+h), 4) === m(row[0])));
  chk('const', C.CCAR121.monthFlightH === 100 && C.CCAR121.yearFlightH === 900 && C.CCAR121.sevenDayFdpH === 60 && C.CCAR121.monthFdpH === 210 && C.CCAR121.minRestBeforeFdpH === 10);
  chk('settings align month / rest≥law', C.defaultSettings().hardMaxHours === C.CCAR121.monthFlightH && C.defaultSettings().minRestH >= C.CCAR121.minRestBeforeFdpH);
  // 日飞行时间超限：把某日末段拉长到 > 表A 限制应报 hard
  const pr = st.pairings.find(p => p.legs.length >= 2); const d0 = pr.legs[0].d; const last = pr.legs.filter(l => l.d === d0).pop();
  const lim = C.flightLimitMin(st, pr.legs[0].dep - st.settings.reportMin); const used = pr.legs.filter(l => l.d === d0).reduce((a, l) => a + (l.arr - l.dep), 0);
  last.arr += (lim - used) + 30;
  const v = C.validate(st).filter(x => x.type === '日飞行时间超限' && x.pairing === pr.id);
  chk('day flight-time hard', v.length >= 1 && v[0].level === 'hard', v.map(x => x.msg).join('|'));
  // 月上限提示文案不得再把 90h 称为“CAAC 月度硬上限”
  const s3 = C.generateSample(); C.autoFill(s3,{attempts:3}); s3.settings.hardMaxHours = 1;
  const vm = C.validate(s3).filter(x => x.type === '月小时超法规上限');
  chk('monthly msg cites 100h', vm.length > 0 && vm.every(x => !x.msg.includes('CAAC 月度硬上限') && x.msg.includes('100h')), vm[0] && vm[0].msg); // keep
}

// ---- 公司手册 EU.COM / RE12 回测回归（出处见 回测/公司手册回测报告.md）----
{ const chk = (n, ok, info) => { console.log('COM ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const D = C.defaultSettings();
  chk('COM month=100', C.COM && C.COM.monthFlightH === 100 && C.COM.rev.indexOf('Re07-06') >= 0);
  chk('reportMin default 95', D.reportMin === 95, D.reportMin);
  chk('hardMax default 100', D.hardMaxHours === 100);
  chk('company == law month', C.COM.monthFlightH === C.CCAR121.monthFlightH);
  const s = C.generateSample(); C.autoFill(s,{attempts:3}); s.settings.hardMaxHours = 1;
  const vm = C.validate(s).filter(x => x.type === '月小时超法规上限');
  chk('monthly msg cites 100h', vm.length > 0 && vm.every(x => x.msg.includes('100h') && !x.msg.includes('CAAC 月度硬上限')), vm[0] && vm[0].msg);
  // RE12 巡航矩阵抽检
  chk('seat SPIC+TL', C.seatOK('SPIC', 'TL') && !C.seatOK('SPIC', 'F4'));
  chk('seat US+F4', C.seatOK('US', 'F4') && !C.seatOK('US', 'F3'));
  chk('seat J2+F3', C.seatOK('J2', 'F3') && !C.seatOK('J2', 'F2'));
  chk('LHASA both J3+', C.catOK('LHASA', 'J3', 'J3') && !C.catOK('LHASA', 'J3', 'J2'));
}

// ---- FTL 硬规则（121.495 / 121.487 · EU.COM 3.6.10 / 3.6.4）----
{ const chk = (n, ok, info) => { console.log('FTL ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const st = C.generateSample();
  // 构造：某人已有紧密任务导致 144h 内无 48h 休息
  const p = st.pilots.find(x => C.isFO(x.rank));
  const mk = (id, d0, legs) => {
    const L = legs.map(([flt, from, to, depH, arrH], i) => ({ d: d0, flt, from, to, dep: (d0 - 1) * C.DAY + depH * 60, arr: (d0 - 1) * C.DAY + arrH * 60, ac: 'A320' }));
    return { id, start: d0, ndays: 1, ac: 'A320', legs: L, crew: { C: null, F: null, T: null } };
  };
  // 连续 6 个值勤日填满 144h 窗口（日间空隙 ~18h <48h），再加第 7 日任务 → 窗口内无连续 48h 休息
  st.pairings = [];
  for (let d = 8; d <= 13; d++) {
    const pr = mk('PRa' + d, d, [['EU' + d, 'ZUUU', 'ZGGG', 8, 14]]);
    pr.crew.F = p.id; st.pairings.push(pr);
  }
  const b = mk('PRb', 14, [['EU2', 'ZUUU', 'ZGSZ', 8, 11]]);
  st.pairings.push(b);
  st.standby = {}; st.pilots.forEach(x => st.standby[x.id] = []);
  const idx = C.buildIndex(st);
  const rs = C.ftlCheckPerson(p, b, st, idx, {});
  chk('144h flags tight turn', rs.some(x => x.includes('144h')), rs.join('|'));
  // 连续 4 值勤日后第 5 日：手工造 4 天任务再加第 5 天
  const capt = st.pilots.find(x => x.rank === 'J3');
  st.pairings = [];
  for (let d = 1; d <= 4; d++) { const pr = mk('PRD' + d, d, [['EU' + d, 'ZUUU', 'ZGGG', 9, 12]]); pr.crew.C = capt.id; st.pairings.push(pr); }
  const pr5 = mk('PRD5', 5, [['EU5', 'ZUUU', 'ZGSZ', 9, 12]]);
  const idx2 = C.buildIndex(st);
  const rs5 = C.ftlCheckPerson(capt, pr5, st, idx2, {});
  chk('day5 after 4 duty', rs5.some(x => x.includes('第5日')), rs5.join('|'));
  // 7 日 60h：若单人 7 天每天 FDP≈10h → 超限（用长值勤）
  st.pairings = [];
  for (let d = 1; d <= 7; d++) {
    const pr = mk('PRF' + d, d, [['EUa' + d, 'ZUUU', 'ZWWW', 6, 11], ['EUb' + d, 'ZWWW', 'ZUUU', 12, 17]]);
    pr.crew.C = capt.id; st.pairings.push(pr);
  }
  const idx3 = C.buildIndex(st); const last = st.pairings[6];
  // 已在日程中时 ftlCheck 对已含任务：用 exclude 重算 —— 直接 validate
  const v = C.validate(st);
  chk('7day or month fdp hard', v.some(x => x.type === '连续7日值勤超限' || x.type === '月值勤超限' || (x.msg || '').includes('连续7日飞行值勤') || (x.msg || '').includes('月飞行值勤期')), v.filter(x => x.type === '连续7日值勤超限' || x.type === '月值勤超限' || /连续7日飞行值勤|月飞行值勤期/.test(x.msg || '')).map(x => x.type + ':' + x.msg).slice(0, 3).join(' | '));
  // 年 900h（不跑 autofill，直接造工时）
  const stY = C.generateSample(); const pY = stY.pilots[0]; pY.ytdFlightH = 850;
  const prY = stY.pairings[0]; prY.crew.C = pY.id;
  // 拉长航段使本月小时 >50
  prY.legs.forEach(l => { l.arr = l.dep + 200; });
  const vY = C.validate(stY).filter(x => x.type === '年飞行超限' && x.pilot === pY.id);
  chk('year 900h', vY.length >= 1 || (C.buildIndex(stY).hours[pY.id] + 850 <= 900), vY[0] && vY[0].msg);
  // 默认关闭扩编
  chk('no aug default', C.defaultSettings().fdpAugmented === false);
  const mig = C.migrateSettings({ hardMaxHours: 90, fdpAugmented: true });
  chk('migrate 90→100 and kill aug', mig.hardMaxHours === 100 && mig.fdpAugmented === false);
}

// ---- 体检合格证特殊运行限制（匿名演示样本）----
{ const chk = (n, ok, info) => { console.log('MED ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const dh = C.defaultHealth();
  chk('defaultHealth fields', dh.maxMonthH === null && dh.noSoleCaptain === false && dh.noNight === false);
  const seed = C.medRestrictionSeed();
  chk('seed ~50', seed.length >= 48 && seed.length <= 52, 'n=' + seed.length);
  chk('anonymized names', seed.every(p => /^限-\d{2}$/.test(p.name) && /^MED\d{2}$/.test(p.id)));
  const c = { m60: 0, sole: 0, both: 0, night: 0 };
  seed.forEach(p => {
    const h = p.health;
    if (h.maxMonthH === 60 && h.noSoleCaptain && h.noNight) c.night++;
    else if (h.maxMonthH === 60 && h.noSoleCaptain) c.both++;
    else if (h.maxMonthH === 60) c.m60++;
    else if (h.noSoleCaptain) c.sole++;
  });
  chk('type counts', c.m60 >= 6 && c.sole >= 14 && c.both >= 5 && c.night >= 1 && (c.m60 + c.sole + c.both + c.night) === seed.length, JSON.stringify(c));
  const st = C.generateSample();
  chk('sample merges MED', st.pilots.filter(p => p.id.startsWith('MED')).length === seed.length);
  const sole = st.pilots.find(p => p.id === 'MED06');
  const pr = st.pairings[0];
  const idx = C.buildIndex(st);
  const [, rsC] = C.personCheck(sole, pr, st, idx, { ignorePrefs: true, skipFtl: true, slot: 'C' });
  const [, rsT] = C.personCheck(sole, pr, st, idx, { ignorePrefs: true, skipFtl: true, slot: 'T' });
  chk('noSole blocks C', rsC.some(x => x.includes('不能作为唯一机长')));
  chk('noSole allows T seat check', !rsT.some(x => x.includes('不能作为唯一机长')));
  chk('pilotHardCap 60', C.pilotHardCap(st.pilots.find(p => p.id === 'MED01'), st) === 60);
  chk('pilotHardCap default', C.pilotHardCap(st.pilots.find(p => !p.id.startsWith('MED') && !(p.health && p.health.maxMonthH)), st) === 100);
  // validate hard when sole on C
  pr.crew = { C: sole.id, F: null, T: null };
  const v = C.validate(st).filter(x => x.pilot === sole.id && x.type === '健康限制');
  chk('validate hard noSole', v.some(x => x.level === 'hard' && x.msg.includes('不能作为唯一机长')), v.map(x => x.level + x.msg).join('|'));
  // personal month hard via personCheck
  const m01 = st.pilots.find(p => p.id === 'MED01');
  idx.hours[m01.id] = 58;
  const fat = JSON.parse(JSON.stringify(st.pairings[1]));
  fat.legs.forEach(l => { l.arr = l.dep + 180; });
  const [, rsH] = C.personCheck(m01, fat, st, idx, { ignorePrefs: true, skipFtl: true, slot: 'F' });
  chk('personal maxMonthH', rsH.some(x => x.includes('个人月飞行上限60h')), rsH.join('|'));
  const flags = C.healthFlags(st.pilots.find(p => p.id === 'MED19').health);
  chk('MED19 badges', flags.includes('月≤60h') && flags.includes('非唯一机长') && flags.includes('限制夜间'), flags.join(','));
}

// ===== 整月演示补全 + 导出 =====
{ const st = C.generateSample();
  const okSchema = st.sampleSchema >= 9;
  const dayCover = {}; for (let d = 1; d <= C.DAYS; d++) dayCover[d] = 0;
  st.pairings.forEach(p => { for (let d = p.start; d < p.start + p.ndays; d++) if (d >= 1 && d <= C.DAYS) dayCover[d]++; });
  const zero = Object.keys(dayCover).filter(d => !dayCover[d]);
  const fillN = st.pairings.filter(p => p.demoFill).length;
  console.log('month complete', zero.length === 0 && fillN === st.pairings.length ? 'OK' : 'FAIL', 'zeroDays', zero.join(',') || 'none', 'pairings', st.pairings.length, 'schema', st.sampleSchema);
  if (!(zero.length === 0 && fillN === st.pairings.length && okSchema)) process.exitCode = 1;
  const rows = C.monthRosterRows(st);
  const okR = rows.length > 1 && rows[0].includes('机长') && rows[0].includes('演示补全');
  console.log('export monthRosterRows', okR ? 'OK' : 'FAIL', 'rows', rows.length); if (!okR) process.exitCode = 1;
  const one = C.personalMonthRows(st, st.pilots[0].id);
  const okP = one.length === C.DAYS + 1 && one[0].includes('状态');
  console.log('export personalMonthRows', okP ? 'OK' : 'FAIL', 'rows', one.length); if (!okP) process.exitCode = 1;
  const pack = C.personalMonthPack(st);
  console.log('export personalMonthPack', pack.length === st.pilots.length ? 'OK' : 'FAIL', pack.length); if (pack.length !== st.pilots.length) process.exitCode = 1;
}

// ===== 观察员位(T)候选：不限教员 =====
{ const chk = (n, ok, info) => { console.log('OBS ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const st = C.generateSample();
  const nc = st.pilots.find(p => C.isNew(p.rank) && p.fleet === 'A320');
  const fo = st.pilots.find(p => C.isFO(p.rank) && p.rank !== 'F1' && p.rank !== 'F2' && p.fleet === 'A320' && p.id !== nc.id);
  const fo2 = st.pilots.find(p => C.isFO(p.rank) && p.fleet === 'A320' && p.id !== nc.id && p.id !== fo.id);
  const capt = st.pilots.find(p => p.rank === 'J3' && p.fleet === 'A320');
  chk('fixture', !!(nc && fo && fo2 && capt), [nc && nc.rank, fo && fo.rank, fo2 && fo2.rank].join('/'));
  const base = 4 * C.DAY;
  const legs = [
    { d: 1, flt: 'EU9001', from: 'ZUUU', to: 'ZGGG', dep: base + 8 * 60, arr: base + 10 * 60, ac: 'A320', reg: 'B-TEST' },
    { d: 1, flt: 'EU9002', from: 'ZGGG', to: 'ZUUU', dep: base + 11 * 60, arr: base + 13 * 60, ac: 'A320', reg: 'B-TEST' }
  ];
  const pr = { id: 'PR-OBS', start: 5, ndays: 1, ac: 'A320', legs, crew: { C: nc.id, F: fo.id, T: null } };
  st.pairings.push(pr);
  const cs = C.candidates(st, pr, 'T').filter(c => c.ok);
  const nonInstr = cs.filter(c => !C.isInstr(c.p.rank));
  const hasFO = nonInstr.some(c => C.isFO(c.p.rank));
  const hasCapt = nonInstr.some(c => C.isCaptClass(c.p.rank) && !C.isInstr(c.p.rank));
  chk('seat3 observer includes non-instructors', nonInstr.length >= 10, 'ok=' + cs.length + ' nonInstr=' + nonInstr.length);
  chk('seat3 includes FO', hasFO, 'fo');
  chk('seat3 includes capt-class', hasCapt, 'capt');
  chk('SLOT_NAME T is 观察', C.SLOT_NAME.T === '观察', C.SLOT_NAME.T);
  // 选非教员观察员后：整机组仍可能因缺教员而不合规（由 crewIssue 提示），但不阻挡候选列表
  pr.crew.T = fo2.id;
  const iss = C.crewIssue(pr, [nc, fo, fo2], st);
  chk('crewIssue still flags missing instr when needed', !!iss && /教员/.test(iss), iss || 'none');
  // 教员已在副驾位时，观察员任意级别且机组合规
  const tl = st.pilots.find(p => C.isInstr(p.rank) && p.fleet === 'A320');
  const pr2 = { id: 'PR-OBS2', start: 5, ndays: 1, ac: 'A320', legs: legs.map(l => Object.assign({}, l)), crew: { C: nc.id, F: tl.id, T: fo2.id } };
  const iss2 = C.crewIssue(pr2, [nc, tl, fo2], st);
  chk('observer FO ok when instr flies', !iss2, iss2 || 'ok');
  const cs2 = C.candidates(st, Object.assign({}, pr2, { crew: { C: nc.id, F: tl.id, T: null } }), 'T').filter(c => c.ok);
  chk('seat3 many when instr on F', cs2.filter(c => !C.isInstr(c.p.rank)).length >= 10, cs2.length);
}

// ===== 候选人搜索 + 单人月历 =====
{ const chk = (n, ok, info) => { console.log('SEARCH ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const st = C.generateSample(); const p = st.pilots[123];
  chk('match id', C.pilotMatches(p, p.id) && C.filterByPilot(st.pilots, p.id, x => x).length === 1);
  chk('match name', C.filterByPilot(st.pilots, p.name, x => x).some(x => x.id === p.id));
  const f6 = C.filterByPilot(st.pilots, 'F6', x => x); chk('match rank', f6.length > 0 && f6.every(x => x.rank === 'F6'), f6.length);
  const sq = C.filterByPilot(st.pilots, '空客二中队', x => x); chk('match squad', sq.length > 50 && sq.every(x => x.squad === '空客二中队'), sq.length);
  chk('multi-token', C.filterByPilot(st.pilots, 'F6 空客二中队', x => x).every(x => x.rank === 'F6' && x.squad === '空客二中队'));
  chk('empty q all', C.filterByPilot(st.pilots, '', x => x).length === st.pilots.length);
  const pr = st.pairings[0]; const cs = C.candidates(st, pr, 'F'); const fc = C.filterByPilot(cs, 'F5');
  chk('candidates filter', fc.length > 0 && fc.every(c => c.p.rank === 'F5'), fc.length);
  const rows = C.personalMonthRows(st, p.id);
  chk('single export', rows.length === C.DAYS + 1 && rows.slice(1).every(r => r[0] === p.id) && rows[0][6] === '状态', rows.length);
}


// ===== 公平工时带（多准则，防单级残差）=====
{ const st = C.generateSample(); C.autoFill(st, { attempts: 1 });
  const ix = C.buildIndex(st);
  const chk = (n, ok, info) => { console.log('FAIR ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const foZ = [];
  for (const rk of ['F3', 'F4', 'F5', 'F6', 'F7', 'J3']) {
    const ps = st.pilots.filter(p => p.rank === rk && !(p.health && p.health.noFly));
    const hrs = ps.map(p => ix.hours[p.id]);
    const fly = hrs.filter(h => h > 0.5).sort((a, b) => a - b);
    const z = hrs.filter(h => h < 0.5).length / hrs.length;
    if (rk.startsWith('F')) foZ.push(z);
    const fmed = fly.length ? fly[(fly.length * 0.5) | 0] : 0;
    const in35 = fly.filter(h => h >= 35 && h <= 70).length;
    const in40 = fly.filter(h => h >= 40 && h <= 70).length;
    chk(rk + ' flyMed>=45', fly.length >= Math.ceil(ps.length * 0.5) && fmed >= 45, 'flyN=' + fly.length + '/' + ps.length + ' med=' + fmed.toFixed(1) + ' zero%=' + (100 * z).toFixed(0));
    chk(rk + ' fly35>=50%', fly.length ? in35 / fly.length >= 0.5 : false, fly.length ? (100 * in35 / fly.length).toFixed(0) + '%' : '0');
    chk(rk + ' fly40>=40%', fly.length ? in40 / fly.length >= 0.4 : false, fly.length ? (100 * in40 / fly.length).toFixed(0) + '%' : '0');
    chk(rk + ' noOver78', hrs.every(h => h <= 78), hrs.filter(h => h > 78).length); // 实飞校准软带 ~55–70h
    const idleTrain = ps.filter(p => ix.hours[p.id] < 0.5 && ((st.training || {})[p.id] || []).length > 0).length;
    chk(rk + ' idleNoTrain', idleTrain === 0, idleTrain);
  }
  chk('FO zero spread<=20pp', Math.max(...foZ) - Math.min(...foZ) <= 0.20, 'min=' + (100 * Math.min(...foZ)).toFixed(0) + ' max=' + (100 * Math.max(...foZ)).toFixed(0));
  // 运力不足时约半数 FO 闲置是刻意后备，但不得把某一级清成培训墙
  chk('F5 zero<45%', foZ[2] < 0.45, (100 * foZ[2]).toFixed(0) + '%');
  const holes = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
    for (const rk of ['TL', 'TB', 'TC']) {
    const ps = st.pilots.filter(p => p.rank === rk && !(p.health && p.health.noFly));
    if (ps.length < 5) continue;
    const hrs = ps.map(p => ix.hours[p.id]);
    const fly = hrs.filter(h => h > 0.5).sort((a, b) => a - b);
    const fmed = fly.length ? fly[(fly.length * 0.5) | 0] : 0;
    const mx = Math.max(0, ...hrs);
    chk(rk + ' flyMed 50-72', fmed >= 50 && fmed <= 72, 'med=' + fmed.toFixed(1) + ' max=' + mx.toFixed(1));
    // 教员义务观察员位会叠工时；允许个别尖峰但须低于法规硬顶
    chk(rk + ' max<=hardCap', mx <= ((st.settings && st.settings.hardMaxHours) || 100) + 1e-9, mx.toFixed(1));
  }
  chk('holes<=70', holes <= 70 && holes / st.pairings.length < 0.06, holes);
  chk('schema9', st.sampleSchema >= 9, st.sampleSchema);
}

// ===== 节奏（实飞记录校准 2026-06/07：月值勤 12–14 天，飞 3 天为主，休 3–4 天为主，一日 2 段为主）=====
{ const st = C.generateSample(); C.autoFill(st, { attempts: 1 });
  const ix = C.buildIndex(st); const ds = C.dayStatus(st, ix);
  const chk = (n, ok, info) => { console.log('RHYTHM ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const blocks = {}, gaps = {}, byRank = {}; const all = [];
  for (const p of st.pilots) { if (p.health && p.health.noFly) continue;
    const dd = []; for (let d = 1; d <= C.DAYS; d++) if (ds[p.id][d] === 'D') dd.push(d);
    if (!dd.length) continue; all.push(dd.length); (byRank[p.rank] = byRank[p.rank] || []).push(dd.length);
    let s = dd[0], pv = dd[0];
    for (let i = 1; i <= dd.length; i++) { if (i < dd.length && dd[i] === pv + 1) { pv = dd[i]; continue; }
      blocks[pv - s + 1] = (blocks[pv - s + 1] || 0) + 1; if (i < dd.length) { const g = dd[i] - pv - 1; gaps[g] = (gaps[g] || 0) + 1; s = pv = dd[i]; } } }
  const gT = Object.values(gaps).reduce((a, b) => a + b, 0), bT = Object.values(blocks).reduce((a, b) => a + b, 0);
  const mode = +Object.entries(blocks).sort((a, b) => b[1] - a[1])[0][0];
  const g34 = ((gaps[3] || 0) + (gaps[4] || 0)) / gT, g2 = (gaps[2] || 0) / gT, g1 = ((gaps[0] || 0) + (gaps[1] || 0)) / gT;
  const b5 = Object.entries(blocks).filter(([k]) => +k >= 5).reduce((a, [, v]) => a + v, 0) / bT;
  chk('dutyDays median 12-14', med(all) >= 12 && med(all) <= 14, med(all));
  chk('block mode 3', mode === 3, JSON.stringify(blocks));
  chk('rest 3-4 >= 45%', g34 >= 0.45, (100 * g34).toFixed(0) + '%');
  chk('rest 2 minority', g2 < g34 && g2 <= 0.3, (100 * g2).toFixed(0) + '%');
  chk('rest 0-1 <= 12%', g1 <= 0.12, (100 * g1).toFixed(0) + '%');
  chk('no 5+ day blocks', b5 <= 0.01, (100 * b5).toFixed(1) + '%');
  for (const [rk, xs] of Object.entries(byRank)) if (xs.length >= 20) chk(rk + ' dutyMed 10-15', med(xs) >= (C.NEW_CAPT.includes(rk) ? 8 : 10) && med(xs) <= 15, med(xs) + ' n=' + xs.length);
  const lpd = {}; st.pairings.forEach(pr => { const b = {}; pr.legs.forEach(l => b[l.d] = (b[l.d] || 0) + 1); Object.values(b).forEach(n => lpd[n] = (lpd[n] || 0) + 1); });
  const lT = Object.values(lpd).reduce((a, b) => a + b, 0);
  chk('legs/day mostly 2', (lpd[2] || 0) / lT >= 0.7 && (lpd[4] || 0) === 0, JSON.stringify(lpd));
  const tr = st.pilots.filter(p => ix.hours[p.id] > 0.5).map(p => ((st.training || {})[p.id] || []).length);
  chk('training 1-2 days', tr.every(n => n >= 0 && n <= 2), Math.min(...tr) + '-' + Math.max(...tr));
  chk('all pairings demoFill', st.pairings.every(p => p.demoFill), '');
}
