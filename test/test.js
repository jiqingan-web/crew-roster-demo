const C = require('../js/core.js');
const st = C.generateSample();
console.log('pilots', st.pilots.length, 'pairings', st.pairings.length, 'totalH', st.pairings.reduce((s,p)=>s+C.pairingHours(p),0).toFixed(0));
const t0 = Date.now(); const s = C.autoFill(st); const ms = Date.now()-t0;
console.log('autofill ms', ms, 'coverage', (s.coverage*100).toFixed(1)+'%', 'hard', s.hard, 'soft', s.soft, 'info', s.info);
console.log('byType', JSON.stringify(s.byType));
s.violations.filter(v=>v.level==='hard').slice(0,15).forEach(v=>console.log('  ', v.type, v.msg));
console.log('hours all', JSON.stringify(Object.fromEntries(Object.entries(s.all).map(([k,v])=>[k,+v.toFixed(3)]))));
for (const g in s.groups) { const h=s.groups[g].hours; console.log(g, 'n',h.n,'mean',h.mean.toFixed(1),'std',h.std.toFixed(2),'min',h.min.toFixed(1),'max',h.max.toFixed(1),'gini',h.gini.toFixed(3),'| overnight std',s.groups[g].overnights.std.toFixed(2),'special std',s.groups[g].special.std.toFixed(2)); }
console.log('pref fulfil', (s.prefRate*100).toFixed(1)+'%', s.prefOK+'/'+s.prefT);
const out = s.per.filter(x=>x.hours>90); console.log('over 90h:', out.map(x=>x.name+x.rank+':'+x.hours.toFixed(1)).join(' ')||'none'); if (out.length) process.exitCode = 1;
// leave test
const idx = C.buildIndex(st);
const cap = st.pilots.filter(p=>p.rank==='J3').sort((a,b)=>idx.sched[b.id].length-idx.sched[a.id].length)[0];
const days = [...new Set(idx.sched[cap.id].slice(1,3).flatMap(pr=>C.daysTouched(pr,st)))];
const r = C.applyLeave(st, cap.id, days); console.log('leave days', days.join(','));
console.log('leave', cap.name, 'affected', r.affected.length, 'changes', r.changes.length, 'unresolved', r.unresolved.length, r.unresolved.map(u=>u.reason).join('|'));
const s2 = C.summarize(st); console.log('after leave hard', s2.hard, JSON.stringify(s2.byType));
process.exitCode = s.hard ? 1 : 0;
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
  const ok = Math.max(...per) <= st.settings.maxStandbyPerPilot && ss.hard === 0; console.log('standby cap', ok ? 'OK' : 'FAIL'); if (!ok) process.exitCode = 1; }
// 临时请假多方案
{ const st3 = C.generateSample(); C.autoFill(st3); const ix = C.buildIndex(st3); let okAll = true;
  for (const [lab, pred] of [['机长', p => p.rank === 'J3'], ['副驾驶', p => C.isFO(p.rank)], ['新机长', p => C.isNew(p.rank)], ['教员', p => C.isInstr(p.rank)]]) {
    const p = st3.pilots.filter(pred).sort((a, b) => ix.sched[b.id].length - ix.sched[a.id].length)[0];
    const a = ix.sched[p.id][1], b = ix.sched[p.id][2]; const days = []; for (let d = a.start; d < b.start + b.ndays; d++) days.push(d);
    const r = C.leaveOptions(st3, p.id, days); const rec = r.solutions.find(s => s.recommended);
    const good = r.ms < 2000 && r.solutions.length >= 1 && rec && rec.hard === 0 && rec.people.every(x => !x.overHard)
      && r.solutions.every(s => s.unresolved || s.hard === 0) && !r.solutions.some(s => s.steps.some(x => x.type === 'seat'));
    // 应用推荐方案后原状态不变、新状态 0 硬违规且请假人不再执行请假日任务
    const after = rec && C.summarize(rec.state); const freed = rec && !rec.state.pairings.some(pr => Object.values(pr.crew).includes(p.id) && C.daysTouched(pr, rec.state).some(d => days.includes(d)));
    console.log('leaveOptions', lab, p.name, 'days', days[0] + '-' + days[days.length - 1], 'affected', r.affected.length, 'solutions', r.solutions.length, r.ms + 'ms', 'rec', rec && rec.name, 'hard', after && after.hard, good && freed ? 'OK' : 'FAIL');
    if (!(good && freed && after.hard === 0)) okAll = false; }
  if (C.summarize(st3).hard !== 0) okAll = false; if (!okAll) process.exitCode = 1; }
// 兜底：无人有工时余量 → 方案标记人工处理并给出受阻规则
{ const st4 = C.generateSample(); C.autoFill(st4); const ix = C.buildIndex(st4); st4.settings.hardMaxHours = 40;
  const lhasa = st4.pairings.find(pr => pr.legs.some(l => l.to === 'ZULS')) || st4.pairings[0]; const pid = lhasa.crew.C;
  const r = C.leaveOptions(st4, pid, C.daysTouched(lhasa, st4)); const m = r.solutions.every(s => s.unresolved > 0 && s.manual);
  const blk = r.solutions[0].steps.find(x => x.block); console.log('fallback manual', m ? 'OK' : 'FAIL', blk ? blk.block.rules.join('；') + ' | ' + blk.block.top.join('，') : ''); if (!m) process.exitCode = 1; }
// 90h 硬上限 / 70h 目标：J3 毛华 请假 9–14 日应有可行方案（可超 70h 但 ≤90h）
{ const st5 = C.generateSample(); C.autoFill(st5); const p = st5.pilots.find(x => x.name === '毛华' && x.rank === 'J3');
  const r = C.leaveOptions(st5, p.id, [9, 10, 11, 12, 13, 14]); const ok = r.solutions.filter(s => !s.unresolved && s.hard === 0);
  const maxH = Math.max(...ok.flatMap(s => s.people.map(x => x.ha)));
  console.log('毛华 9-14: solutions', r.solutions.length, 'resolved', ok.length, 'max person hours', maxH.toFixed(1), r.ms + 'ms', ok.length && maxH <= 90 ? 'OK' : 'FAIL');
  if (!ok.length || maxH > 90) process.exitCode = 1;
  // 校验：>90 为硬性；不再有 30–70h 软性提示
  const sv = JSON.parse(JSON.stringify(st5)); const v = C.summarize(sv); const t = !Object.keys(v.byType).some(k => /目标/.test(k));
  sv.settings.hardMaxHours = 60; const v2 = C.summarize(sv); const t2 = v2.byType['月小时超法规上限'] && v2.byType['月小时超法规上限'].level === 'hard';
  console.log('hours: no target warnings, hard>cap', t && t2 ? 'OK' : 'FAIL'); if (!(t && t2)) process.exitCode = 1; }
// ===== 执勤监控（FDP）=====
{ const sf = C.generateSample(); C.autoFill(sf); sf.settings.reportMin = 60; /* 本段场景用例按旧报到60min标定余量数字；默认设置已改为公司95min */ const chk = (n, ok, info) => { console.log('FDP ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const sm = C.fdpRiskSummary(sf); chk('planned risk counts', sm.cnt.over === 0 && sm.cnt.high >= 1 && sm.cnt.med >= 1, JSON.stringify(sm.cnt));
  chk('limit table', C.fdpLimit(sf, 9 * 60, 4) === 840 && C.fdpLimit(sf, 2 * 60, 7) === 540 && C.fdpLimit(sf, 13 * 60, 5) === 720);
  chk('no 目标 settings', !('minHours' in sf.settings) && !('maxHours' in sf.settings));
  const pr = sf.pairings.find(p => p.id === 'PR140'); const d1 = pr.legs.filter(l => l.d === pr.legs[0].d);
  const K = l => C.legKey(l);
  // 1) 只录入第 2 段预计晚 240 分：不级联，仅提示“若不追回将超限”
  sf.actuals = { [K(d1[1])]: { dep: d1[1].dep + 240, arr: d1[1].arr + 240, kind: 'est' } };
  let dy = C.fdpDays(pr, sf, sf.actuals)[0];
  chk('no cascade', dy.exceed === 0 && dy.legs[2].dep === d1[2].dep && dy.cascExceed === 20, 'buffer ' + dy.buffer + ' casc ' + dy.cascExceed);
  chk('no cascade monitor', !C.dutyMonitor(sf, dy.date).find(x => x.pr.id === 'PR140').exceed);
  // 2) 第 2 段实际落地准点追回 → 无提示
  sf.actuals[K(d1[1])] = { dep: d1[1].dep + 30, arr: d1[1].arr + 10, kind: 'act' }; dy = C.fdpDays(pr, sf, sf.actuals)[0];
  chk('recovered', dy.exceed === 0 && dy.cascExceed === 0 && dy.nLanded === 1);
  // 3) 滚动：末段预计落地 23:05 → 超 20 分；过夜休息 9h25
  sf.actuals[K(d1[1])] = { dep: d1[1].dep + 240, arr: d1[1].arr + 240, kind: 'act' };
  sf.actuals[K(d1[3])] = { dep: d1[3].dep + 120, arr: d1[3].arr + 120, kind: 'est' }; dy = C.fdpDays(pr, sf, sf.actuals)[0];
  chk('PR140 exceed', dy.exceed === 20 && dy.exLeg.i === 3, 'exceed ' + dy.exceed + ' rest ' + C.fmtH(dy.restAfter));
  // 4) 跨午夜落地（00:30 次日）
  const w0 = JSON.parse(JSON.stringify(sf)); w0.actuals[K(d1[3])] = { arr: (dy.date) * 1440 + 30, kind: 'est' };
  const dz = C.fdpDays(pr, w0, w0.actuals)[0]; chk('cross midnight', dz.exceed === 20 + 85 && dz.end === dy.date * 1440 + 30, 'exceed ' + dz.exceed);
  // 5) 旧 delays 迁移：只作用于该段
  const wm = { pairings: sf.pairings, delays: { [K(d1[1])]: 240 } }; C.migrateDelays(wm);
  chk('migrate delays', !wm.delays && wm.actuals[K(d1[1])].dep === d1[1].dep + 240 && Object.keys(wm.actuals).length === 1);
  const mon = C.dutyMonitor(sf, dy.date); chk('monitor flags', mon[0].pr.id === 'PR140' && mon[0].exceed && mon[0].downstream.some(x => x.overnight));
  const t = Date.now(); const o = C.fdpOptions(sf, 'PR140'); const ms = Date.now() - t; const rec = o.solutions.find(s => s.recommended);
  chk('options', o.solutions.length >= 3 && o.solutions.length <= 6 && ms < 2000, o.solutions.map(s => s.name + ':' + s.score.toFixed(1) + '/fdp' + s.fdpAfter).join(' | ') + ' ' + ms + 'ms');
  chk('recommended split clean', rec && rec.fdpAfter === 0 && rec.hard === 0 && rec.steps.some(s => s.type === 'split'), rec && rec.name);
  chk('manual card', o.solutions.some(s => s.key === 'manual' && !s.state && s.steps[0].block.rules.length));
  const nb = rec.state.pairings.find(p => p.id === 'PR140-B'); chk('split pairing', nb && nb.freshAt && Object.values(nb.crew).every(Boolean) && C.summarize(rec.state).hard === 0);
  const w = JSON.parse(JSON.stringify(sf)); const p2 = w.pairings.find(p => p.id === 'PR140'); const j = p2.legs.findIndex(l => l.d === p2.legs[0].d && l.from === 'ZUUU' && l.dep > p2.legs[0].dep);
  C.splitPairing(w, p2, j); chk('splitPairing fdp ok', C.fdpDays(p2, w, w.actuals).every(x => !x.exceed));
}

{ const chk = (n, ok, info) => { console.log('AC ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const sr = C.generateSample();
  chk('every leg has reg', sr.pairings.every(p => p.legs.every(l => l.reg && /^B-/.test(l.reg))));
  const by = {}; let ov = 0; sr.pairings.forEach(p => p.legs.forEach(l => { (by[l.reg] = by[l.reg] || []).push(l); }));
  Object.values(by).forEach(ls => { ls.sort((a, b) => a.dep - b.dep); for (let i = 1; i < ls.length; i++) if (ls[i].dep < ls[i - 1].arr) ov++; });
  chk('no reg overlap', ov === 0, 'overlaps ' + ov);
  chk('fleet covers A321', sr.pairings.some(p => p.legs.some(l => l.ac === 'A321' && C.FLEET.A321.includes(l.reg))));
  const bare = JSON.parse(JSON.stringify(sr)); bare.pairings.forEach(p => p.legs.forEach(l => delete l.reg));
  C.ensureAircraftRegs(bare); chk('ensureAircraftRegs', !!bare.pairings[0].legs[0].reg);
  C.autoFill(sr);
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
  C.autoFill(st);
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
  const st = C.generateSample(); C.autoFill(st);
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
  chk('ops remain', m.remainHours > 0 && m.capacityTotal === st.pilots.length * m.hardMaxHours);
  chk('ops util', m.aircraftUtilPct > 0 && m.aircraftUtilPct < 100, m.aircraftUtilPct);
  chk('ops pilotsPerAc', m.pilotsPerAircraft > 1, m.pilotsPerAircraft);
  chk('ops formulas', m.formulas && m.formulas.util);
}

// ---- CCAR-121-R8 回测回归（P章 表A/表B/累积限制；出处见 回测/121回测报告.md）----
{ const chk = (n, ok, info) => { console.log('CCAR121 ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const st = C.generateSample(); C.autoFill(st); const m = h => h * 60;
  // 表A：00:00-04:59=8, 05:00-19:59=9, 20:00-23:59=8
  chk('tableA', [[0, 8], [4.98, 8], [5, 9], [19.98, 9], [20, 8], [23.98, 8]].every(([h, v]) => C.flightLimitMin(st, m(h)) === m(v)));
  chk('tableA aug3=13h', (() => { const s2 = JSON.parse(JSON.stringify(st)); s2.settings.fdpAugmented = true; return C.flightLimitMin(s2, m(8)) === m(13); })());
  // 表B：与默认 FDP 表逐格一致
  const B = { 0: [12, 11, 10, 9], 6: [14, 13, 12, 11], 15: [13, 12, 11, 10] };
  chk('tableB', Object.entries(B).every(([h, row]) => [3, 5, 6, 8].every((n, i) => C.fdpLimit(st, m(+h), n) === m(row[i])) && C.fdpLimit(st, m(+h), 1) === m(row[0]) && C.fdpLimit(st, m(+h), 4) === m(row[0])));
  chk('const', C.CCAR121.monthFlightH === 100 && C.CCAR121.yearFlightH === 900 && C.CCAR121.sevenDayFdpH === 60 && C.CCAR121.monthFdpH === 210 && C.CCAR121.minRestBeforeFdpH === 10);
  chk('settings stricter than law', C.defaultSettings().hardMaxHours <= C.CCAR121.monthFlightH && C.defaultSettings().minRestH >= C.CCAR121.minRestBeforeFdpH);
  // 日飞行时间超限：把某日末段拉长到 > 表A 限制应报 hard
  const pr = st.pairings.find(p => p.legs.length >= 2); const d0 = pr.legs[0].d; const last = pr.legs.filter(l => l.d === d0).pop();
  const lim = C.flightLimitMin(st, pr.legs[0].dep - st.settings.reportMin); const used = pr.legs.filter(l => l.d === d0).reduce((a, l) => a + (l.arr - l.dep), 0);
  last.arr += (lim - used) + 30;
  const v = C.validate(st).filter(x => x.type === '日飞行时间超限' && x.pairing === pr.id);
  chk('day flight-time hard', v.length >= 1 && v[0].level === 'hard', v.map(x => x.msg).join('|'));
  // 月上限提示文案不得再把 90h 称为“CAAC 月度硬上限”
  const s3 = C.generateSample(); C.autoFill(s3); s3.settings.hardMaxHours = 1;
  const vm = C.validate(s3).filter(x => x.type === '月小时超法规上限');
  chk('monthly msg cites 100h', vm.length > 0 && vm.every(x => !x.msg.includes('CAAC 月度硬上限') && x.msg.includes('100h')), vm[0] && vm[0].msg);
}

// ---- 公司手册 EU.COM / RE12 回测回归（出处见 回测/公司手册回测报告.md）----
{ const chk = (n, ok, info) => { console.log('COM ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) process.exitCode = 1; };
  const D = C.defaultSettings();
  chk('COM month=100', C.COM && C.COM.monthFlightH === 100 && C.COM.rev.indexOf('Re07-06') >= 0);
  chk('reportMin default 95', D.reportMin === 95, D.reportMin);
  chk('hardMax still 90 (stricter setting)', D.hardMaxHours === 90);
  chk('company == law month', C.COM.monthFlightH === C.CCAR121.monthFlightH);
  const s = C.generateSample(); C.autoFill(s); s.settings.hardMaxHours = 1;
  const vm = C.validate(s).filter(x => x.type === '月小时超法规上限');
  chk('monthly msg cites company 100h', vm.length > 0 && vm.every(x => x.msg.includes('公司手册') && x.msg.includes('100h') && !x.msg.includes('CAAC 月度硬上限')), vm[0] && vm[0].msg);
  // RE12 巡航矩阵抽检
  chk('seat SPIC+TL', C.seatOK('SPIC', 'TL') && !C.seatOK('SPIC', 'F4'));
  chk('seat US+F4', C.seatOK('US', 'F4') && !C.seatOK('US', 'F3'));
  chk('seat J2+F3', C.seatOK('J2', 'F3') && !C.seatOK('J2', 'F2'));
  chk('LHASA both J3+', C.catOK('LHASA', 'J3', 'J3') && !C.catOK('LHASA', 'J3', 'J2'));
}
