// v695 修改单 v1：C-05 外航置位 / C-07 置位后休息提示 / C-08 公平性按级别 / C-09 未排原因；附 C-03 P2 起降两端差异
const C = require('../js/core.js');
const TV = require('../js/timetable-version.js');
let fail = 0;
const chk = (n, ok, info) => { console.log('V695 ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };
const D = 1440;
const P = (id, rank, x) => Object.assign({ id, name: id, rank, auth: [], health: C.defaultHealth() }, x || {});
const leg = (d, flt, from, to, depHM, arrHM, extra) => Object.assign({
  d, flt, from, to, dep: (d - 1) * D + depHM, arr: (d - 1) * D + (arrHM <= depHM ? arrHM + D : arrHM), ac: 'A320'
}, extra || {});
const prOf = (id, legs, crew) => ({ id, start: legs[0].d, ndays: legs[legs.length - 1].d - legs[0].d + 1, legs, crew: crew || { C: null, F: null, T: null }, ac: 'A320' });
const S0 = (pilots, pairings, extra) => Object.assign({
  settings: C.migrateSettings(C.defaultSettings()), pilots, restrictions: [], pairings: pairings || [], standby: {}
}, extra || {});

// ---------- C-03 P2：落地差也标红 ----------
{
  const prev = TV.importVersion([{ flt: '2201', dep: '10:00', arr: '12:00' }], { 版本号: 'A' });
  const next = TV.importVersion([{ flt: '2201', dep: '10:00', arr: '13:00' }], { 版本号: 'B' }, prev.version);
  const row = next.diff.find(x => x.flt === '2201');
  chk('C-03 P2 dep unchanged arr +60 red', row && row.red && row.deltaMin === 60 && row.deltaDep === 0 && row.deltaArr === 60 && row.差值 !== '0h00', JSON.stringify(row));
  const same = TV.importVersion([{ flt: '2201', dep: '10:15', arr: '12:15' }], { 版本号: 'C' }, prev.version);
  const r2 = same.diff.find(x => x.flt === '2201');
  chk('C-03 P2 both +15 not red', r2 && !r2.red && r2.deltaMin === 15, JSON.stringify(r2));
}

// ---------- C-05 外航置位 / 买票 ----------
{
  const L = C.makeExtDhLeg({ d: 1, flt: '8791', from: 'ZUUU', to: 'ZBAA', depHM: 8 * 60, arrHM: 11 * 60, carrier: '3U' });
  chk('C-05 fields 承运人/航班号/起降站/时刻', L.carrier === '3U' && L.flt === '8791' && L.from === 'ZUUU' && L.to === 'ZBAA' && L.dep === 8 * 60 && L.arr === 11 * 60 && L.taskType === '外航置位 / 买票' && C.isExtDh(L) && C.isDhLeg(L), JSON.stringify(L));
  const company = { d: 1, flt: '8791', from: 'ZUUU', to: 'ZBAA', dep: 8 * 60, arr: 11 * 60, ac: 'A320', dh: true };
  const pX = prOf('XD1', [L], { C: 'a', F: 'b', T: 'c' });
  const pC = prOf('DH1', [company], { C: 'a', F: 'b', T: 'c' });
  const people = [P('a', 'J3'), P('b', 'F5'), P('c', 'F3')];
  const stX = S0(people, [pX]);
  const stC = S0(people, [pC]);
  chk('C-05 not flight hours', C.pairingHours(pX) === 0 && C.pairingHours(pC) === 0, C.pairingHours(pX));
  const daysX = C.fdpDays(pX, stX), daysC = C.fdpDays(pC, stC);
  chk('C-05 duty same as company DH', daysX.length === 1 && daysC.length === 1 && daysX[0].dhOnly && daysC[0].dhOnly && daysX[0].start === daysC[0].start && daysX[0].planFdp === 0 && daysC[0].planFdp === 0 && daysX[0].end === daysC[0].end, JSON.stringify({ x: daysX[0].start, c: daysC[0].start, xfdp: daysX[0].planFdp }));
  const crew = people;
  const info = C.legalSeatPairs(pX, crew, stX);
  const iss = C.crewIssue(pX, crew, stX);
  chk('C-05 no seat-qualification check', info.ok && !iss, 'iss=' + iss + ' labels=' + (info.labels || []).join(','));
  const v = C.validate(stX);
  chk('C-05 validate no seat hard', !v.some(x => x.level === 'hard' && /座位|上座|资质/.test(x.type + x.msg)), v.map(x => x.level + ':' + x.type).join('|'));
  const ca = C.makeExtDhLeg({ d: 2, flt: '8261', from: 'ZBAA', to: 'ZUUU', depHM: 14 * 60, arrHM: 17 * 60, carrier: 'CA' });
  chk('C-05 CA8261 fields', ca.carrier === 'CA' && ca.flt === '8261' && C.isExtDh(ca), ca.carrier + ca.flt);
}

// ---------- C-07 R-01..R-04 ----------
{
  const p = P('p1', 'J3');
  // 1892 前一日晚出发，00:05 落沈；次日（同日历日早晨）2758 置位 08:55
  const a = prOf('PR-1892', [{ d: 1, flt: '1892', from: 'ZUUU', to: 'ZYTX', dep: 20 * 60, arr: D + 5, ac: 'A320' }], { C: 'p1', F: null, T: null });
  const b = prOf('PR-2758', [{ d: 2, flt: '2758', from: 'ZYTX', to: 'ZUUU', dep: D + 8 * 60 + 55, arr: D + 12 * 60, ac: 'A320', dh: true }], { C: 'p1', F: null, T: null });
  const rings = [{ id: 'A142', flights: [
    { flt: '2411' }, { flt: '1891' }, { flt: '1892' },
    { flt: '2412', dep: '17:40' }, { flt: '1954', dep: '15:00' }
  ] }];
  const st = S0([p], [a, b], { seasonRings: rings });
  const ret = C.formatDesignedReturns(C.designedReturnFlights(a, st));
  chk('R-01 原环回程 from design A142, not hardcoded-only', ret === '2412(17:40) / 1954(15:00)', ret);
  // another design should yield its own remainder
  const stAlt = S0([p], [a, b], { seasonRings: [{ id: 'X', flights: [{ flt: '1892' }, { flt: '9999', dep: '09:00' }] }] });
  chk('R-01 design-driven remainder changes with catalog', C.formatDesignedReturns(C.designedReturnFlights(a, stAlt)) === '9999(09:00)', C.formatDesignedReturns(C.designedReturnFlights(a, stAlt)));
  const v = C.validate(st);
  const tip = v.find(x => x.type === '置位后休息不足' && x.level === 'soft');
  const expected = '置位后休息约 7h00，原环回程为 2412(17:40) / 1954(15:00)';
  chk('R-01 soft tip with rest and 原环回程', tip && tip.level === 'soft' && /7h00/.test(tip.msg) && /原环回程为 2412\(17:40\) \/ 1954\(15:00\)/.test(tip.msg) && !v.some(x => x.level === 'hard' && /休息/.test(x.type)), tip ? tip.msg : v.map(x => x.level + ':' + x.type + ':' + x.msg).join('|'));
  console.log('V695 R-01 exact tip', tip ? tip.msg : '(none)');
}

{
  const p = P('p1', 'J3');
  const a = prOf('PR-1931', [leg(1, '1931', 'ZUUU', 'ZBHH', 16 * 60, 20 * 60 + 30)], { C: 'p1' });
  const b = prOf('PR-1974', [leg(2, '1974', 'ZBHH', 'ZUUU', 7 * 60 + 45, 11 * 60, { dh: true })], { C: 'p1' });
  const v = C.validate(S0([p], [a, b]));
  const tip = v.find(x => x.type === '置位后休息不足' && x.level === 'soft');
  chk('R-02 soft tip rest about 9h', tip && /休息约 9h/.test(tip.msg) && !v.some(x => x.level === 'hard' && /休息/.test(x.type)), tip ? tip.msg : v.map(x => x.level + ':' + x.type + ':' + x.msg).join('|'));
}

{
  const p = P('p1', 'J3');
  const a = prOf('PR-1892b', [{ d: 1, flt: '1892', from: 'ZUUU', to: 'ZYTX', dep: 20 * 60, arr: D + 5, ac: 'A320' }], { C: 'p1' });
  const b = prOf('PR-2412', [{ d: 2, flt: '2412', from: 'ZYTX', to: 'ZUUU', dep: D + 17 * 60 + 40, arr: D + 21 * 60, ac: 'A320' }], { C: 'p1' });
  const v = C.validate(S0([p], [a, b]));
  chk('R-03 no rest tip (2412 17:40)', !v.some(x => /置位后休息不足|过夜休息不足|休息不足/.test(x.type)), v.map(x => x.level + ':' + x.type + ':' + x.msg).join('|'));
}

{
  const p = P('p1', 'J3');
  // 执飞落地 → 次日执飞，休息 7h40：用引擎公式反推时刻
  // rest = (report(next)-preCommute) - release(prev) = 460
  const a = prOf('PR-OP1', [leg(1, '1001', 'ZUUU', 'ZBAA', 16 * 60, 20 * 60)], { C: 'p1' });
  const stProbe = S0([p], [a]);
  const rel = C.release(a, stProbe);
  const dummy = prOf('PR-OP2', [leg(2, '1002', 'ZBAA', 'ZUUU', 8 * 60, 11 * 60)], { C: 'p1' });
  const pre = C.preCommuteOf(dummy, stProbe);
  // report = dep - repMin; want report - pre - rel = 460 → dep = 460 + pre + rel + repMin
  const needDep = 460 + pre + rel + (dummy.legs[0].dep - C.report(dummy, S0([p], [dummy])));
  const b = prOf('PR-OP2', [{ d: 2, flt: '1002', from: 'ZBAA', to: 'ZUUU', dep: needDep, arr: needDep + 3 * 60, ac: 'A320' }], { C: 'p1' });
  const st = S0([p], [a, b]);
  const rest = C.restMinutesBetween(a, b, st);
  chk('R-04 fixture rest is 7h40', Math.abs(rest - 460) <= 1, 'rest=' + rest + ' ' + C.fmtH(rest));
  const v = C.validate(st);
  chk('R-04 operating-to-operating hard 休息不足', v.some(x => x.level === 'hard' && /休息不足|过夜休息不足/.test(x.type)) && !v.some(x => x.type === '置位后休息不足' && x.level === 'soft'), v.map(x => x.level + ':' + x.type + ':' + x.msg).join('|'));
}

// ---------- C-08 公平性分组 ----------
{
  chk('C-08 FAIR_GROUPS 五组', C.FAIR_GROUPS && C.FAIR_GROUPS.join(',') === '教员,机长,新机长,F4 及以上,F3 及以下', (C.FAIR_GROUPS || []).join(','));
  chk('C-08 fairGroup mapping', C.fairGroup('TL') === '教员' && C.fairGroup('J3') === '机长' && C.fairGroup('机长A') === '机长' && C.fairGroup('机长B') === '机长' && C.fairGroup('J2') === '机长' && C.fairGroup('J0') === '新机长' && C.fairGroup('F5') === 'F4 及以上' && C.fairGroup('F4') === 'F4 及以上' && C.fairGroup('F3') === 'F3 及以下' && C.fairGroup('F1') === 'F3 及以下', 'J3=' + C.fairGroup('J3') + ' F3=' + C.fairGroup('F3'));
  const pilots = [
    P('ins1', 'TL'), P('ins2', 'TB'),
    P('cap1', 'J3'), P('cap2', '机长A'),
    P('new1', 'J0'),
    P('f4a', 'F5'), P('f4b', 'F4'),
    P('f3a', 'F3'), P('f3b', 'F2'), P('f3c', 'F1')
  ];
  const hours = { ins1: 80, ins2: 70, cap1: 50, cap2: 50, new1: 30, f4a: 40, f4b: 40, f3a: 10, f3b: 12, f3c: 8 };
  const st = S0(pilots, []);
  const tgt = C.computeFairGroupTargets(st, { hours });
  const insT = (tgt.ins1 + tgt.ins2) / 2, f3T = (tgt.f3a + tgt.f3b + tgt.f3c) / 3;
  chk('C-08 targets within group not flattened', insT > 70 && f3T < 15 && Math.abs(insT - 75) < 2 && Math.abs(f3T - 10) < 2, 'insT=' + insT + ' f3T=' + f3T + ' all=' + JSON.stringify(tgt));
  // summarize groups
  // attach dummy hours via pairings? summarize uses buildIndex hours from assignments.
  // Use fairGroupStats after assigning hours via pairings is heavy; check stats median instead on fairGroups after fake sched.
  const long = prOf('H1', [leg(1, '1', 'ZUUU', 'ZBAA', 8 * 60, 8 * 60 + 80 * 60)], { C: 'ins1' }); // 80h block? arr-dep/60 = 80, but report etc. pairingHours uses arr-dep/60
  // simpler: unit already covers computeFairGroupTargets
  const st2 = S0([
    P('a', 'TL'), P('b', 'TL'), P('c', 'F3'), P('d', 'F3'), P('e', 'F3')
  ], [
    prOf('P1', [leg(1, '1', 'ZUUU', 'ZBAA', 8 * 60, 8 * 60 + 70 * 60)], { C: 'a', F: null, T: null }),
    prOf('P2', [leg(3, '2', 'ZUUU', 'ZBAA', 8 * 60, 8 * 60 + 70 * 60)], { C: 'b', F: null, T: null }),
    prOf('P3', [leg(1, '3', 'ZUUU', 'ZBAA', 8 * 60, 8 * 60 + 10 * 60)], { C: null, F: 'c', T: null }),
    prOf('P4', [leg(2, '4', 'ZUUU', 'ZBAA', 8 * 60, 8 * 60 + 10 * 60)], { C: null, F: 'd', T: null }),
    prOf('P5', [leg(3, '5', 'ZUUU', 'ZBAA', 8 * 60, 8 * 60 + 10 * 60)], { C: null, F: 'e', T: null })
  ]);
  const gs = C.fairGroupStats(st2);
  chk('C-08 fairGroupStats has five keys and median', C.FAIR_GROUPS.every(g => gs[g] && 'median' in gs[g] && 'min' in gs[g] && 'max' in gs[g]), JSON.stringify(Object.keys(gs)));
  chk('C-08 教员 hours not flattened with F3', gs['教员'].median >= 60 && gs['F3 及以下'].median <= 15, 'instr med=' + gs['教员'].median + ' f3 med=' + gs['F3 及以下'].median);
}

{
  const pilots = [P('cap', 'J3'), P('fo', 'F5'), P('low', 'F3'), P('hi', 'F7')];
  const pairing = prOf('T1', [leg(1, '2001', 'ZUUU', 'ZBAA', 9 * 60, 11 * 60), leg(1, '2002', 'ZBAA', 'ZUUU', 13 * 60, 15 * 60)], { C: 'cap', F: 'fo', T: null });
  const st = S0(pilots, [pairing]);
  const cs = C.candidates(st, pairing, 'T').filter(c => c.ok);
  const ids = cs.map(c => c.p.id);
  chk('C-08 observer candidates prefer F3 first', ids[0] === 'low' && ids.indexOf('low') < ids.indexOf('hi'), ids.join(','));
  // autoFill T
  const stA = S0(pilots.map(x => Object.assign({}, x)), [JSON.parse(JSON.stringify(pairing))]);
  stA.pairings[0].crew = { C: null, F: null, T: null };
  stA.lite = true;
  C.autoFill(stA, { attempts: 1, noSwap: true, keepExisting: false });
  const tId = stA.pairings[0].crew.T;
  const tP = stA.pilots.find(x => x.id === tId);
  chk('C-08 autoFill observer prefers F3 及以下 when available', tP && C.isLowFo(tP.rank), 'T=' + tId + ' rank=' + (tP && tP.rank) + ' crew=' + JSON.stringify(stA.pairings[0].crew));
}

// ---------- C-09 未排原因 ----------
{
  const early = prOf('BUSY', [leg(1, '1', 'ZUUU', 'ZBAA', 16 * 60, 18 * 60), leg(1, '2', 'ZBAA', 'ZUUU', 20 * 60, 23 * 60)], { C: 'rested', F: null, T: null });
  // 次日执飞过早，rested 因休息不足被排除
  const late = prOf('HOLE', [leg(2, '3', 'ZUUU', 'ZLLL', 6 * 60, 8 * 60), leg(2, '4', 'ZLLL', 'ZUUU', 9 * 60, 11 * 60)], { C: null, F: null, T: null });
  const pilots = [P('rested', 'J3'), P('okcap', 'J3', { auth: ['ZLLL'] }), P('fo1', 'F5', { auth: ['ZLLL'] }), P('fo2', 'F6', { auth: ['ZLLL'] })];
  // rested has no Lanzhou auth? early is not Lanzhou. hole is Lanzhou so rested may also fail qual.
  // Give rested ZLLL auth so the only reason for C on HOLE is rest (after BUSY).
  pilots[0].auth = ['ZLLL'];
  early.crew.C = 'rested';
  const st = S0(pilots, [early, late]);
  const reasons = C.unfilledReasons(st, late);
  const blob = reasons.join('；');
  chk('C-09 reasons not only 三座配不齐', reasons.length && reasons.every(r => r.trim() !== '三座配不齐') && !/^[三座配不齐]+$/.test(blob), blob);
  chk('C-09 lists rest-excluded alias', /休息不足/.test(blob) && /rested/.test(blob), blob);
  const v = C.validate(st);
  const msg = (v.find(x => x.type === '未满员' && x.pairing === 'HOLE') || {}).msg || '';
  chk('C-09 validate still flags 未满员 (detailed reasons via unfilledReasons)', /缺/.test(msg) && !/三座配不齐/.test(msg), msg);
  const rep = C.unfilledReport(st);
  chk('C-09 unfilledReport lists HOLE with reasons', rep.some(x => x.id === 'HOLE' && x.reasons.length && x.reasons.some(r => /rested/.test(r))), JSON.stringify(rep));
}

if (fail) { console.log('V695 FAILED', fail); process.exit(1); }
console.log('V695 all passed');
