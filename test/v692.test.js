// v692/v693 修改单 v1：C-01 座位组合（含起降/巡航分列） / C-02 多日环 / C-06 大过站 / 第5日软提示
const C = require('../js/core.js');
const SP = require('../js/season-plan.js');
let fail = 0;
const chk = (n, ok, info) => { console.log('V692 ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };
const D = 1440;
const P = (id, rank, x) => Object.assign({ id, name: id, rank, auth: [], health: C.defaultHealth() }, x || {});
const leg = (d, from, to, dep, arr, ac) => ({ d, flt: 'T' + from + to + dep, from, to, dep: (d - 1) * D + dep, arr: (d - 1) * D + arr, ac: ac || 'A320' });
const pr = (id, legs, crew) => ({ id, start: 1, ndays: (legs[legs.length - 1] && legs[legs.length - 1].d) || 1, legs, crew: crew || {}, ac: (legs[0] && legs[0].ac) || 'A320' });
const S0 = (pilots, pairing) => ({ settings: C.migrateSettings(C.defaultSettings()), pilots, restrictions: [], pairings: pairing ? [pairing] : [], standby: {} });
function pack(people, legs, slots) {
  const pilots = people.map(p => P(p.id, p.rank, p));
  const crew = slots || { C: people[0].id, F: people[1].id, T: people[2].id };
  const pairing = pr('T1', legs, crew);
  const st = S0(pilots, pairing);
  const cs = ['C', 'F', 'T'].map(s => crew[s] && pilots.find(x => x.id === crew[s]));
  const info = C.legalSeatPairs(pairing, cs, st);
  const iss = C.crewIssue(pairing, cs, st);
  const v = C.validate(st);
  return { st, pairing, info, iss, v };
}
function labels(info) { return (info.labels || []).slice().sort(); }
const domestic = [leg(1, 'ZUUU', 'ZBAA', 600, 800), leg(1, 'ZBAA', 'ZUUU', 900, 1100)];

// ---------- C-01 S-01..S-11 ----------
{ const r = pack([{ id: 'a', rank: '机长A' }, { id: 'b', rank: 'F4' }, { id: 'c', rank: 'F3' }], domestic);
  chk('S-01 机长A+F4+F3 hard, no pair', !r.info.ok && !!r.iss, r.iss);
  chk('S-01 reason mentions 机长A F5+', /机长A/.test(r.iss || '') && /F5\+/.test(r.iss || '') && /F4\/F3|F4.*F3/.test(r.iss || ''), r.iss);
  chk('S-01 validate hard 座位', r.v.some(x => x.level === 'hard' && /无合规上座组合|座位/.test(x.type + x.msg)), r.v.filter(x => x.level === 'hard').map(x => x.type + ':' + x.msg).join('|')); }

{ const r = pack([{ id: 'a', rank: 'J3' }, { id: 'b', rank: 'F3' }, { id: 'c', rank: 'F5' }], domestic);
  chk('S-02 pass', r.info.ok && !r.iss, r.iss);
  chk('S-02 includes J3+F5', r.info.labels.includes('J3+F5'), r.info.labels.join(','));
  const pF3 = r.info.pairs.find(x => x.label === 'J3+F3');
  const pF5 = r.info.pairs.find(x => x.label === 'J3+F5');
  chk('S-02 J3+F5 takeoff/landing legal', pF5 && pF5.phase === 'full' && (r.info.tlLabels || []).includes('J3+F5'), r.info.summary);
  chk('S-02 J3+F3 cruise-only, not 着陆机长 PF', pF3 && pF3.phase === 'cruise' && !(pF3.tips || []).includes('着陆机长 PF') && (r.info.cruiseOnlyLabels || []).includes('J3+F3') && /仅巡航：/.test(r.info.summary) && /可起降上座：/.test(r.info.summary), r.info.summary);
  console.log('V692 S-02 actual', r.info.summary); }

{ const r = pack([{ id: 'a', rank: 'J3' }, { id: 'b', rank: 'F3' }, { id: 'c', rank: 'F4' }], domestic);
  chk('S-03 pass', r.info.ok && !r.iss, r.iss);
  chk('S-03 includes J3+F4', r.info.labels.includes('J3+F4'), r.info.labels.join(','));
  const pF3 = r.info.pairs.find(x => x.label === 'J3+F3');
  const pF4 = r.info.pairs.find(x => x.label === 'J3+F4');
  chk('S-03 J3+F4 full + 着陆机长 PF', pF4 && pF4.phase === 'full' && (pF4.tips || []).includes('着陆机长 PF') && r.v.some(x => /着陆机长/.test(x.type + x.msg)), r.info.summary + ' | ' + r.v.map(x => x.type).join(','));
  chk('S-03 J3+F3 cruise-only, no 着陆机长 PF tip', pF3 && pF3.phase === 'cruise' && !(pF3.tips || []).includes('着陆机长 PF'), JSON.stringify(pF3 && pF3.tips) + ' ' + r.info.summary);
  console.log('V692 S-03 actual', r.info.summary); }

{ const r = pack([{ id: 'a', rank: '机长B' }, { id: 'b', rank: 'J3' }, { id: 'c', rank: 'F3' }], domestic);
  chk('S-04 pass', r.info.ok && !r.iss, r.iss);
  chk('S-04 includes 机长B+J3', r.info.labels.includes('机长B+J3'), r.info.labels.join(','));
  chk('S-04 机长B+J3 / J3+机长B takeoff/landing legal', (r.info.tlLabels || []).includes('机长B+J3') && (r.info.tlLabels || []).includes('J3+机长B'), r.info.summary);
  chk('S-04 J3+F3 cruise-only; 机长B+F3 excluded', (r.info.cruiseOnlyLabels || []).includes('J3+F3') && !(r.info.labels || []).includes('机长B+F3') && !(r.info.labels || []).includes('F3+机长B'), r.info.summary);
  console.log('V692 S-04 actual', r.info.summary); }

{ const r = pack([{ id: 'a', rank: 'TL' }, { id: 'b', rank: 'F1' }, { id: 'c', rank: 'F7' }], domestic);
  chk('S-05 pass', r.info.ok && !r.iss, r.iss);
  chk('S-05 includes TL+F7', r.info.labels.includes('TL+F7'), r.info.labels.join(','));
  chk('S-05 includes TL+F1 (instructor cruise experience)', r.info.labels.includes('TL+F1'), r.info.labels.join(','));
  const pF1 = r.info.pairs.find(x => x.label === 'TL+F1');
  const pF7 = r.info.pairs.find(x => x.label === 'TL+F7');
  const obs = (r.info.observers || []).map(x => x.rank);
  chk('S-05 TL+F7 takeoff/landing legal', pF7 && pF7.phase === 'full', r.info.summary);
  chk('S-05 TL+F1 cruise-only 仅巡航 / 起降不得 PF, not 着陆机长 PF, F1 not observer', pF1 && pF1.phase === 'cruise' && (pF1.tips || []).includes('仅巡航 / 起降不得 PF') && !(pF1.tips || []).includes('着陆机长 PF') && !obs.includes('F1') && r.v.some(x => /仅巡航 \/ 起降不得 PF/.test(x.msg)), r.info.summary + ' | obs=' + (obs.join(',') || '—') + ' | ' + r.v.map(x => x.type).join(','));
  console.log('V692 S-05 actual', r.info.summary, 'observers', obs.join(',') || '—'); }

{ const r = pack([{ id: 'a', rank: 'J3' }, { id: 'b', rank: 'F3' }, { id: 'c', rank: 'F3b', rank2: 'F3' }], domestic);
  // fix third rank
}
{ const people = [{ id: 'a', rank: 'J3' }, { id: 'b', rank: 'F3' }, { id: 'c', rank: 'F3' }];
  const r = pack(people, domestic);
  chk('S-06 J3+F3+F3 hard', !r.info.ok || !!r.iss, 'iss=' + r.iss + ' pairs=' + r.info.labels.join(','));
  chk('S-06 fo combo or no pair', /副驾驶|fo_combination|低/.test(r.iss || '') || !r.info.ok, r.iss); }

{ const r = pack([{ id: 'a', rank: '机长B' }, { id: 'b', rank: 'J3', deptControlled: true }, { id: 'c', rank: 'F6' }], domestic);
  chk('S-07 two dept-controlled hard', !!r.iss && /管控/.test(r.iss), r.iss); }

{ const lz = [leg(1, 'ZUUU', 'ZLLL', 600, 800), leg(1, 'ZLLL', 'ZUUU', 900, 1100)];
  const r = pack([
    { id: 'a', rank: 'J3', auth: ['ZLLL'] },
    { id: 'b', rank: 'F4', auth: ['ZLLL'] },
    { id: 'c', rank: 'F7', auth: [] }
  ], lz);
  chk('S-08 Lanzhou F7 no qual hard', !r.info.ok && !!r.iss, r.iss + ' | ' + r.info.labels.join(',')); }

{ const lz = [leg(1, 'ZUUU', 'ZLLL', 600, 800), leg(1, 'ZLLL', 'ZUUU', 900, 1100)];
  const r = pack([
    { id: 'a', rank: 'J3', auth: ['ZLLL'] },
    { id: 'b', rank: 'F4', auth: ['ZLLL'] },
    { id: 'c', rank: 'F7', auth: ['ZLLL'] }
  ], lz);
  chk('S-09 Lanzhou pass', r.info.ok && !r.iss, r.iss);
  chk('S-09 pair J3+F7', r.info.labels.includes('J3+F7'), r.info.labels.join(','));
  chk('S-09 J3+F4 not legal on plateau', !r.info.labels.includes('J3+F4'), r.info.labels.join(','));
  console.log('V692 S-09 actual pairs', r.info.labels.join('；')); }

{ const ls = [leg(1, 'ZUUU', 'ZULS', 600, 900), leg(1, 'ZULS', 'ZUUU', 1020, 1320)];
  const r = pack([
    { id: 'a', rank: 'J3', auth: ['ZULS'] },
    { id: 'b', rank: 'J3', auth: ['ZULS'] },
    { id: 'c', rank: 'F7', auth: ['ZULS'] }
  ], ls);
  chk('S-10 Lhasa J3+J3+F7 pass', r.info.ok && !r.iss, r.iss);
  console.log('V692 S-10 actual pairs', r.info.labels.join('；')); }

{ const ls = [leg(1, 'ZUUU', 'ZULS', 600, 900), leg(1, 'ZULS', 'ZUUU', 1020, 1320)];
  const r = pack([
    { id: 'a', rank: 'J3', auth: ['ZULS'] },
    { id: 'b', rank: 'F7', auth: ['ZULS'] },
    { id: 'c', rank: 'F6', auth: ['ZULS'] }
  ], ls);
  chk('S-11 Lhasa single captain hard', !!r.iss && /双机长|J3\+/.test(r.iss), r.iss); }

// F1 observer no instructor = soft
{ const r = pack([{ id: 'a', rank: 'J3' }, { id: 'b', rank: 'F5' }, { id: 'c', rank: 'F1' }], domestic);
  chk('F1 observer without instructor soft (not hard)', !r.iss && r.v.some(x => x.level === 'soft' && /F1/.test(x.type + x.msg)), r.v.map(x => x.level + ':' + x.type).join('|')); }

// slotRankOK: F1 + instructor OK, F1 + J3 no
chk('slotRankOK F1+TL in F', C.slotRankOK('F', 'F1', 'TL') && !C.slotRankOK('F', 'F1', 'J3'));

// ---------- day-5 soft ----------
{ const people = [P('c', 'J3'), P('f', 'F5'), P('t', 'F6')];
  const st = S0(people);
  for (let d = 1; d <= 5; d++) {
    const p = pr('D' + d, [leg(d, 'ZUUU', 'ZBAA', 540, 720), leg(d, 'ZBAA', 'ZUUU', 800, 980)], { C: 'c', F: 'f', T: 't' });
    st.pairings.push(p);
  }
  const v = C.validate(st);
  chk('day5 operating is soft not hard', v.some(x => x.type === '第5日执飞' && x.level === 'soft') && !v.some(x => x.type === '第5日执飞' && x.level === 'hard'), v.filter(x => /第5日/.test(x.type)).map(x => x.level + ':' + x.type).join(','));
  const idx = C.buildIndex(st);
  const rs = C.ftlCheckPerson(people[0], st.pairings[4], st, idx, {});
  chk('day5 not in ftlCheck hard reasons', !rs.some(x => /第5日/.test(x)), rs.join('|')); }

// ---------- C-06 G-01..G-06 ----------
function longStopCase(from, mid, to, dep, arr1, dep2, arr2, opt) {
  opt = opt || {};
  const legs = [leg(1, from, mid, dep, arr1), leg(1, mid, to, dep2, arr2)];
  const pairing = pr('LG', legs, { C: 'c', F: 'f', T: 't' });
  if (opt.confirmed) pairing.lodgingConfirmed = true;
  const st = S0([P('c', 'J3'), P('f', 'F5'), P('t', 'F6')], pairing);
  if (opt.lodgingTable) st.airportLodging = opt.lodgingTable;
  const stops = C.longStopsOf(pairing, st);
  const days = C.fdpDays(pairing, st);
  const v = C.validate(st);
  return { pairing, st, stops, days, v };
}
{ const g = 10 * 60 + 50; // 10h50 Wuhan
  // 08:00 Sanya - 10:00 Wuhan, 20:50 Wuhan - 22:50 Sanya
  const un = longStopCase('ZJHK', 'ZHHH', 'ZJHK', 8 * 60, 10 * 60, 8 * 60 + g + 2 * 60, 8 * 60 + g + 4 * 60);
  chk('G-01 tag 大过站 Wuhan', un.stops.some(s => s.ap === 'ZHHH' && s.min === g && /大过站/.test(s.label) && /武汉/.test(s.label)), JSON.stringify(un.stops));
  chk('G-01 unconfirmed tip 需安排住宿, one FDP', un.v.some(x => x.level === 'soft' && /需安排住宿/.test(x.msg)) && un.days.length === 1, 'days=' + un.days.length + ' ' + un.v.filter(x => /过站|住宿/.test(x.type + x.msg)).map(x => x.type + ':' + x.level).join('|'));
  const cf = longStopCase('ZJHK', 'ZHHH', 'ZJHK', 8 * 60, 10 * 60, 8 * 60 + g + 2 * 60, 8 * 60 + g + 4 * 60, { confirmed: true });
  chk('G-01 unconfirmed hard exceed table B (no deduct)', un.days.length === 1 && un.days[0].planBuffer < 0 && un.v.some(x => x.level === 'hard' && x.type === '执勤期超限'), 'fdp=' + (un.days[0] && un.days[0].planFdp) + ' lim=' + (un.days[0] && un.days[0].limit) + ' lodge=' + C.lodgingMin(un.pairing, un.days[0]));
  chk('G-01 confirmed splits to 2 FDP and passes table B', cf.days.length === 2 && cf.days.every(d => d.planBuffer >= 0) && !cf.v.some(x => x.level === 'hard' && x.type === '执勤期超限'), 'parts=' + cf.days.length + ' buf=' + cf.days.map(d => d.planBuffer).join(',') + ' hard=' + cf.v.filter(x => x.level === 'hard').map(x => x.type).join(','));
  const first = cf.days[0], second = cf.days[1], l1 = cf.pairing.legs[0], l2 = cf.pairing.legs[1];
  chk('G-01 confirmed endpoints 到位+30 / 起飞-75', first.planEnd === l1.arr + 30 && second.start === l2.dep - 75, 'p1end=' + first.planEnd + ' expect=' + (l1.arr + 30) + ' p2start=' + second.start + ' expect=' + (l2.dep - 75) + ' p1fdp=' + first.planFdp + ' p2fdp=' + second.planFdp);
  chk('G-01 first segment includes the extra 30 min', first.planFdp === (l1.arr + 30) - (l1.dep - 105), 'planFdp=' + first.planFdp + ' landingOnly=' + (l1.arr - (l1.dep - 105))); }

{ const g = 9 * 60 + 35;
  const un = longStopCase('ZSFZ', 'ZSJN', 'ZSFZ', 7 * 60, 9 * 60, 7 * 60 + 2 * 60 + g, 7 * 60 + 4 * 60 + g);
  chk('G-02 Jinan tagged', un.stops.some(s => s.ap === 'ZSJN' && /大过站/.test(s.label)), JSON.stringify(un.stops));
  const cf = longStopCase('ZSFZ', 'ZSJN', 'ZSFZ', 7 * 60, 9 * 60, 7 * 60 + 2 * 60 + g, 7 * 60 + 4 * 60 + g, { confirmed: true });
  chk('G-02 confirmed split', cf.days.length === 2, 'parts=' + cf.days.length); }

{ const g = 11 * 60;
  const un = longStopCase('ZBHH', 'ZHCC', 'ZBHH', 7 * 60, 9 * 60, 7 * 60 + 2 * 60 + g, 7 * 60 + 4 * 60 + g);
  chk('G-03 Zhengzhou tagged', un.stops.some(s => s.ap === 'ZHCC'), JSON.stringify(un.stops));
  const cf = longStopCase('ZBHH', 'ZHCC', 'ZBHH', 7 * 60, 9 * 60, 7 * 60 + 2 * 60 + g, 7 * 60 + 4 * 60 + g, { confirmed: true });
  chk('G-03 confirmed split', cf.days.length === 2, 'parts=' + cf.days.length); }

{ const g = 11 * 60;
  const un = longStopCase('ZGHA', 'ZUTF', 'ZGHA', 7 * 60, 9 * 60, 7 * 60 + 2 * 60 + g, 7 * 60 + 4 * 60 + g);
  chk('G-04 Tianfu tagged', un.stops.some(s => s.ap === 'ZUTF'), JSON.stringify(un.stops));
  const cf = longStopCase('ZGHA', 'ZUTF', 'ZGHA', 7 * 60, 9 * 60, 7 * 60 + 2 * 60 + g, 7 * 60 + 4 * 60 + g, { confirmed: true });
  chk('G-04 confirmed split', cf.days.length === 2, 'parts=' + cf.days.length); }

{ const un = longStopCase('ZUUU', 'ZBAA', 'ZUUU', 8 * 60, 10 * 60, 10 * 60 + 4 * 60 + 50, 10 * 60 + 4 * 60 + 50 + 2 * 60);
  chk('G-05 4h50 not tagged, stays in FDP', un.stops.length === 0 && un.days.length === 1, 'stops=' + un.stops.length + ' days=' + un.days.length + ' lg=' + (un.days[0] && un.days[0].longGroundMin)); }

{ const g = 6 * 60;
  const un = longStopCase('ZJSY', 'ZSWX', 'ZJSY', 8 * 60, 10 * 60, 10 * 60 + g, 10 * 60 + g + 2 * 60); // 无锡, no lodging params
  chk('G-06 no lodging params -> 需确认住宿', un.stops.length === 1 && un.v.some(x => x.type === '需确认住宿' && /需确认住宿/.test(x.msg)), un.v.filter(x => /住宿|过站/.test(x.type)).map(x => x.type + ':' + x.msg).join('|')); }

// C-06: unconfirmed lodging records must not deduct; over table B remains hard
{ const g = 10 * 60 + 50;
  const rec = longStopCase('ZJHK', 'ZHHH', 'ZJHK', 8 * 60, 10 * 60, 8 * 60 + g + 2 * 60, 8 * 60 + g + 4 * 60);
  const arr1 = rec.pairing.legs[0].arr, dep2 = rec.pairing.legs[1].dep;
  rec.pairing.lodging = [{ d: 1, in: arr1, out: dep2 }];
  const days = C.fdpDays(rec.pairing, rec.st);
  const v = C.validate(rec.st);
  chk('G-unconfirmed-with-records: no split, lodgingMin 0', days.length === 1 && C.lodgingMin(rec.pairing, days[0]) === 0, 'parts=' + days.length + ' lodge=' + C.lodgingMin(rec.pairing, days[0]));
  chk('G-unconfirmed-with-records: still hard exceed table B', days[0].planBuffer < 0 && v.some(x => x.level === 'hard' && x.type === '执勤期超限'), 'buf=' + days[0].planBuffer + ' ' + v.filter(x => x.type === '执勤期超限').map(x => x.level + ':' + x.msg).join('|')); }

// catalog category
{ const cat = C.rulesCatalog(S0([P('c', 'J3')]));
  const r27 = ((cat && cat.rules) || []).find(x => x.id === 'CR-27');
  chk('CR-27 category 参数/提示', r27 && r27.cat === '参数/提示', r27 && (r27.cat + ' ' + r27.kind)); }

// ---------- C-02 P-01..P-07 ----------
{ const rows = [
    { sheet: '换季计划', row: 10, flights: '2449', route: '蓉-皖-哈', dow: '246', overnightDays: 1, day: 1, legs: [
      { flt: '2449', from: 'ZUUU', to: 'ZSOF', d: 1, dep: 8 * 60, arr: 10 * 60 + 20 },
      { flt: '2449', from: 'ZSOF', to: 'ZYHB', d: 1, dep: 11 * 60, arr: 16 * 60 + 5 }
    ], flightMin: 5 * 60 + 25 },
    { sheet: '换季计划', row: 11, flights: '2450', route: '哈-皖-蓉', dow: '246', overnightDays: 0, day: 1, legs: [
      { flt: '2450', from: 'ZYHB', to: 'ZSOF', d: 1, dep: 17 * 60 + 5, arr: 22 * 60 },
      { flt: '2450', from: 'ZSOF', to: 'ZUUU', d: 1, dep: 22 * 60 + 40, arr: 24 * 60 + 25 }
    ], flightMin: 5 * 60 + 25 }
  ];
  const r = SP.parseSeasonPlan(rows);
  chk('P-01 two duties, not merged', r.duties.length === 2 && r.report.fail === 0, 'duties=' + r.duties.length + ' fail=' + r.report.fail + ' ' + SP.reportText(r.report));
  const mer = SP.forceMergeDuties(r.duties, { flightMin: 10 * 60 + 50 });
  chk('P-02 force merge 10h50 > 9h', !mer.ok && mer.blocked && /10h50/.test(mer.reasons.join(' ')) && /表A/.test(mer.reasons.join(' ')), mer.reasons.join('；')); }

{ const r = SP.parseSeasonPlan([{ sheet: '换季计划', row: 20, flights: '2449/2450', route: '蓉-皖-蓉' }]);
  chk('P-03 2449/2450 蓉-皖-蓉 discontinuous', r.report.fail >= 1 && r.duties.length === 0 && /航线不连续/.test((r.items[0].reasons || []).join(' ')), SP.reportText(r.report)); }

{ const rows = [
    { sheet: '换季计划', row: 30, flights: '1855', route: '蓉-皖-哈', overnightDays: 1, day: 1, legs: [
      { flt: '1855', from: 'ZUUU', to: 'ZSOF', d: 1, dep: 8 * 60, arr: 10 * 60 },
      { flt: '1855', from: 'ZSOF', to: 'ZYHB', d: 1, dep: 10 * 60 + 40, arr: 16 * 60 }
    ], flightMin: 5 * 60 },
    { sheet: '换季计划', row: 31, flights: '1856', route: '哈-皖-蓉', overnightDays: 0, day: 2, legs: [
      { flt: '1856', from: 'ZYHB', to: 'ZSOF', d: 2, dep: 8 * 60, arr: 13 * 60 },
      { flt: '1856', from: 'ZSOF', to: 'ZUUU', d: 2, dep: 13 * 60 + 40, arr: 16 * 60 + 45 }
    ], flightMin: 4 * 60 + 45 }
  ];
  const r = SP.parseSeasonPlan(rows);
  chk('P-04 split two days', r.duties.length === 2 && r.duties[0].day === 1 && r.duties[1].day === 2, 'n=' + r.duties.length);
  const mer = SP.forceMergeDuties(r.duties, { flightMin: 9 * 60 + 45 });
  chk('P-04 force merge 9h45 > 9h', !mer.ok && /9h45/.test(mer.reasons.join(' ')), mer.reasons.join('；')); }

{ const r = SP.parseSeasonPlan([{ sheet: '换季计划', row: 40, flights: '1849/1850', route: '蓉-兰-蓉', dow: '246', overnightDays: 0, day: 1, flightMin: 7 * 60 + 20, legs: [
    { flt: '1849', from: 'ZUUU', to: 'ZLLL', d: 1, dep: 14 * 60, arr: 21 * 60 + 30 },
    { flt: '1850', from: 'ZLLL', to: 'ZUUU', d: 1, dep: 22 * 60 + 30, arr: 24 * 60 + 20 }
  ] }]);
  chk('P-05 same-day 1849+1850 7h20 pass', r.report.fail === 0 && r.duties.length === 1 && r.duties[0].flightMin === 7 * 60 + 20, SP.reportText(r.report) + ' ft=' + (r.duties[0] && r.duties[0].flightMin)); }

{ const rows = [
    { sheet: '换季计划', row: 50, flights: '2729', route: '蓉-坤', dow: '24', overnightDays: 1, date: '2026-10-06', day: 2, legs: [ // Tuesday
      { flt: '2729', from: 'ZUUU', to: 'ZWBK', d: 2, dep: 10 * 60, arr: 16 * 60 }
    ] },
    { sheet: '换季计划', row: 51, flights: '2730', route: '坤-蓉', dow: '46', overnightDays: 0, date: '2026-10-08', day: 4, legs: [
      { flt: '2730', from: 'ZWBK', to: 'ZUUU', d: 4, dep: 10 * 60, arr: 16 * 60 }
    ] }
  ];
  const r = SP.parseSeasonPlan(rows);
  chk('P-06 two duties overnight 巴里坤, not same-day dh', r.duties.length === 2 && r.duties[0].overnightDays === 1 && r.duties[0].day !== r.duties[1].day, 'n=' + r.duties.length + ' days=' + r.duties.map(d => d.day).join(','));
  // 班期：周二(2) 只有 2729，把 2730 强行并到同一天应因班期无效失败
  const mer = SP.forceMergeDuties(r.duties, { date: '2026-10-06', dow: '24' });
  // 即使航线连续，班期 46 的 2730 在周二无效。checkDuty uses merged.dow as single mask — pass dowByFlight
  const mer2 = SP.checkDuty({
    flights: ['2729', '2730'],
    legs: r.duties[0].legs.concat(r.duties[1].legs),
    date: '2026-10-06',
    dowByFlight: [{ flt: '2729', mask: '24' }, { flt: '2730', mask: '46' }],
    flightMin: 12 * 60
  });
  chk('P-06 cannot fold into same-day return (dow or table A)', !mer2.ok, mer2.reasons.join('；')); }

{ const rows = [
    { sheet: '沈阳环', row: 1, flights: '2411', route: '蓉-沈', day: 1, legs: [{ flt: '2411', from: 'ZUUU', to: 'ZYTX', d: 1, dep: 8 * 60, arr: 12 * 60 }] },
    { sheet: '沈阳环', row: 2, flights: '2713', route: '沈-蓉', day: 2, legs: [{ flt: '2713', from: 'ZYTX', to: 'ZUUU', d: 2, dep: 8 * 60, arr: 12 * 60 }] },
    { sheet: '沈阳环', row: 3, flights: '2714', route: '蓉-沈', day: 3, legs: [{ flt: '2714', from: 'ZUUU', to: 'ZYTX', d: 3, dep: 8 * 60, arr: 12 * 60 }] },
    { sheet: '沈阳环', row: 4, flights: '', rest: true, day: 4, note: '休' },
    { sheet: '沈阳环', row: 5, flights: '', rest: true, day: 5, note: '休' },
    { sheet: '沈阳环', row: 6, flights: '2441', route: '沈-蓉', day: 6, legs: [{ flt: '2441', from: 'ZYTX', to: 'ZUUU', d: 6, dep: 8 * 60, arr: 12 * 60 }] },
    { sheet: '沈阳环', row: 7, flights: '2724', route: '蓉-沈', day: 7, legs: [{ flt: '2724', from: 'ZUUU', to: 'ZYTX', d: 7, dep: 8 * 60, arr: 12 * 60 }] },
    { sheet: '沈阳环', row: 8, flights: '2210', route: '沈-蓉', day: 8, legs: [{ flt: '2210', from: 'ZYTX', to: 'ZUUU', d: 8, dep: 8 * 60, arr: 12 * 60 }] }
  ];
  const r = SP.parseSeasonPlan(rows);
  chk('P-07 8-day Shenyang ring intact', r.duties.length === 8 && r.duties[3].kind === 'rest' && r.duties[4].kind === 'rest' && r.duties.map(d => d.day).join(',') === '1,2,3,4,5,6,7,8', 'n=' + r.duties.length + ' days=' + r.duties.map(d => d.day + (d.kind || '')).join(','));
  chk('P-07 report has sheet+row', r.report.items.every(it => it.sheet === '沈阳环' && it.row >= 1) && /成功/.test(SP.reportText(r.report)), SP.reportText(r.report).split('\n')[0]); }

console.log(fail ? 'V692 FAILED ' + fail : 'V692 ALL OK');
process.exit(fail ? 1 : 0);
