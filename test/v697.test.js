// v697：C-10.3 P1 换季导入解析存疑须阻断发布；附可选 P2
const C = require('../js/core.js');
const SP = require('../js/season-plan.js');
let fail = 0;
const chk = (n, ok, info) => { console.log('V697 ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };
const D = 1440;
const P = (id, rank, x) => Object.assign({ id, name: id, rank, auth: [], health: C.defaultHealth() }, x || {});
const leg = (d, flt, from, to, depHM, arrHM, extra) => Object.assign({
  d, flt, from, to, dep: (d - 1) * D + depHM, arr: (d - 1) * D + (arrHM <= depHM ? arrHM + D : arrHM), ac: 'A320'
}, extra || {});
const prOf = (id, legs, crew) => ({ id, start: legs.length ? legs[0].d : 1, ndays: legs.length ? (legs[legs.length - 1].d - legs[0].d + 1) : 1, legs, crew: crew || { C: null, F: null, T: null }, ac: 'A320' });
const S0 = (pilots, pairings, extra) => Object.assign({
  settings: C.migrateSettings(C.defaultSettings()), pilots, restrictions: [], pairings: pairings || [], standby: {}
}, extra || {});
const people = [P('j3', 'J3'), P('f5', 'F5'), P('f3', 'F3')];
const legalCrew = { C: 'j3', F: 'f5', T: 'f3' };

// ---------- C-10.3 P1：带存疑换季任务不能发布，确认后才能发布 ----------
{
  const H = ['性质', '过夜天数', '航班号', '班期', '航站1', '起飞1', '落地1', '航站2', '起飞2', '落地2', '航站3', '起飞3', '落地3', '飞行时间'];
  const grid = [
    H,
    [null, null, 'EU2201', '1234567', '成都双流', '0800', '1100', '北京', null, null, null, null, null, 0.125],
    [null, null, '1845', '1234567', '成都双流', '0800', '1000', '长沙', null, null, null, null, null, 0.08]
  ];
  const parsed = SP.parseSeasonGrid(grid, { sheet: '存疑' });
  const prs = SP.dutiesToPairings(parsed.duties || []);
  prs.forEach(p => { p.crew = Object.assign({}, legalCrew); });
  chk('C-10.3 P1 parse has 1845 存疑', (parsed.report && parsed.report.doubt >= 1) && (parsed.duties || []).some(d => (d.flights || []).indexOf('1845') >= 0 && (d.doubt || d.status === 'doubt')), JSON.stringify({ doubt: parsed.report && parsed.report.doubt, duties: (parsed.duties || []).map(d => ({ f: d.flights, st: d.status, doubt: d.doubt })) }));
  chk('C-10.3 P1 dutiesToPairings keeps doubt on 1845 task', prs.some(p => p.doubt && (p.legs || []).some(l => String(l.flt || '').replace(/^[A-Z]{2}/, '') === '1845')), JSON.stringify(prs.map(p => ({ id: p.id, doubt: p.doubt, flts: (p.legs || []).map(l => l.flt) }))));

  // Faithful import path: report is written by ingest, not by manually stuffing parseDoubts only
  const st = S0(people, prs);
  const ingested = C.ingestSeasonPlanReport(st, parsed);
  chk('C-10.3 P1 ingest writes seasonPlanReport and parseDoubts', !!(st.seasonPlanReport && st.seasonPlanReport.items && st.parseDoubts && st.parseDoubts.length >= 1 && ingested.doubts.length >= 1), JSON.stringify({ reportDoubt: st.seasonPlanReport && st.seasonPlanReport.doubt, parseN: (st.parseDoubts || []).length, ids: (st.parseDoubts || []).map(x => x.id) }));

  const blocked = C.publishCheck(st);
  const pubBlocked = C.publishRoster(st, { operator: 'alice' });
  chk('C-10.3 P1 doubtful season-plan cannot publish', !blocked.ok && blocked.doubtN >= 1 && !pubBlocked.ok && !pubBlocked.published, JSON.stringify({ ok: blocked.ok, hard: blocked.hardN, doubt: blocked.doubtN, conf: blocked.conflictN, msgs: (blocked.doubts || []).map(d => d.id + ':' + d.msg), hardTypes: (blocked.hard || []).map(x => x.type) }));

  // Even if parseDoubts is emptied without resolve, report + pairing.doubt must still block
  const stOnlyReport = S0(people, prs.map(p => JSON.parse(JSON.stringify(p))));
  stOnlyReport.seasonPlanReport = JSON.parse(JSON.stringify(parsed.report));
  stOnlyReport.parseDoubts = [];
  const onlyRep = C.publishCheck(stOnlyReport);
  chk('C-10.3 P1 collectParseDoubts reads seasonPlanReport without parseDoubts', !onlyRep.ok && onlyRep.doubtN >= 1, 'doubtN=' + onlyRep.doubtN + ' ' + JSON.stringify((onlyRep.doubts || []).map(d => d.msg)));

  const stOnlyPair = S0(people, prs.map(p => JSON.parse(JSON.stringify(p))));
  stOnlyPair.parseDoubts = [];
  const onlyPair = C.publishCheck(stOnlyPair);
  chk('C-10.3 P1 collectParseDoubts reads pairing.doubt', !onlyPair.ok && onlyPair.doubtN >= 1, 'doubtN=' + onlyPair.doubtN);

  // Confirm / clear every ingested doubt, including report-side and pairing flags
  const ids = C.collectParseDoubts(st).map(d => d.id);
  ids.forEach(id => C.resolveParseDoubt(st, id, { operator: 'carol', at: Date.UTC(2026, 10, 14, 3, 0, 0) }));
  const after = C.collectParseDoubts(st);
  const reportOpen = (st.seasonPlanReport.items || []).filter(it => it.status === 'doubt' || it.status === '存疑' || it.doubt);
  const pairingOpen = st.pairings.filter(p => p.doubt);
  chk('C-10.3 P1 resolveParseDoubt clears report and pairing sides', after.length === 0 && reportOpen.length === 0 && pairingOpen.length === 0 && (st.parseDoubts || []).length === 0, JSON.stringify({ after: after.map(x => x.id), report: (st.seasonPlanReport.items || []).map(it => it.status), pairing: st.pairings.map(p => ({ id: p.id, doubt: p.doubt })), conf: st.confirmations && st.confirmations.length }));

  const allowed = C.publishCheck(st);
  const pub = C.publishRoster(st, { operator: 'dave', at: Date.UTC(2026, 10, 14, 3, 10, 0) });
  chk('C-10.3 P1 after confirm can publish', allowed.ok && allowed.doubtN === 0 && pub.ok && pub.published && pub.published.ruleVersion === 'v697', JSON.stringify({ ok: allowed.ok, hard: allowed.hardN, doubt: allowed.doubtN, conf: allowed.conflictN, hardTypes: (allowed.hard || []).map(x => x.type + ':' + x.msg), ver: pub.published && pub.published.ruleVersion }));
}

// ---------- P2-1：同日拆段过程表用暂停起止，不用过夜「休息开始/结束」 ----------
{
  const p = prOf('LG-P2', [
    leg(1, '2201', 'ZUUU', 'ZHHH', 8 * 60, 10 * 60),
    leg(1, '2202', 'ZHHH', 'ZUUU', 20 * 60, 22 * 60)
  ], legalCrew);
  p.lodgingConfirmed = true;
  const st = S0(people, [p]);
  const days = C.fdpDays(p, st);
  const trail = C.dutyCalcTrail(p, st);
  const s0 = (trail[0] && trail[0].steps) || [];
  const pauseStart = s0.find(x => x.key === 'pauseStart' || x.label === '暂停开始');
  const pauseEnd = s0.find(x => x.key === 'pauseEnd' || x.label === '暂停结束');
  const overnight = s0.filter(x => x.label === '休息开始' || x.label === '休息结束');
  const expectStart = 10 * 60 + 30;
  const expectEnd = 20 * 60 - 75;
  chk('P2-1 confirmed split has two duty windows', days.length === 2 && days[0].splitNext && days[1].splitFrom, 'n=' + days.length + ' splitNext=' + (days[0] && days[0].splitNext));
  chk('P2-1 trail shows 暂停开始/结束 not overnight 休息', pauseStart && pauseEnd && overnight.length === 0 && pauseStart.time === expectStart && pauseEnd.time === expectEnd, JSON.stringify({ labels: s0.map(x => x.label + '@' + x.time), expectStart, expectEnd, p1end: days[0] && days[0].planEnd, p2start: days[1] && days[1].start }));
}

// ---------- P2-2：国际航班过程表公式写「国际 125」 ----------
{
  const p = prOf('INTL-P2', [leg(1, '6601', 'ZUUU', 'VTBS', 8 * 60, 12 * 60)], legalCrew);
  const st = S0(people, [p]);
  const trail = C.dutyCalcTrail(p, st);
  const report = ((trail[0] && trail[0].steps) || []).find(x => x.key === 'report');
  const formula = report && (report.params && report.params['公式'] || report.paramsText || '');
  chk('P2-2 international trail formula says 国际 125', report && /国际\s*125/.test(formula) && !/国内\s*105/.test(formula), formula);
  const pDom = prOf('DOM-P2', [leg(1, '2201', 'ZUUU', 'ZBAA', 8 * 60, 11 * 60)], legalCrew);
  const rDom = ((C.dutyCalcTrail(pDom, S0(people, [pDom]))[0] || {}).steps || []).find(x => x.key === 'report');
  const fDom = rDom && (rDom.params && rDom.params['公式'] || rDom.paramsText || '');
  chk('P2-2 domestic trail formula still 国内 105', /国内\s*105/.test(fDom), fDom);
}

// ---------- P2-3：发布后编辑出硬违规，发布戳作废 ----------
{
  const pr = prOf('PUB-INV', [leg(1, '2201', 'ZUUU', 'ZBAA', 8 * 60, 11 * 60)], legalCrew);
  const st = S0(people, [pr]);
  const pub = C.publishRoster(st, { operator: 'eve', at: Date.UTC(2026, 10, 14, 4, 0, 0) });
  chk('P2-3 publish succeeds first', pub.ok && !!st.published, JSON.stringify(pub.published));
  st.pairings[0].crew = { C: 'capA', F: 'fo4', T: 'fo3' };
  st.pilots = people.concat([P('capA', '机长A'), P('fo4', 'F4'), P('fo3', 'F3')]);
  const after = C.publishCheck(st);
  chk('P2-3 new hard error invalidates published stamp', !st.published && st.publishedInvalidated && st.publishedInvalidated.operator === 'eve' && !after.ok && after.hardN > 0, JSON.stringify({ published: st.published, inv: st.publishedInvalidated, hard: after.hardN, types: (after.hard || []).map(x => x.type) }));
}

// ---------- P2-4：一侧缺任务不标「偏好不同」 ----------
{
  const legs = [leg(1, '2201', 'ZUUU', 'ZBAA', 8 * 60, 11 * 60), leg(1, '2202', 'ZBAA', 'ZUUU', 13 * 60, 16 * 60)];
  const e = S0(people, [prOf('T-MISS', legs, legalCrew)]);
  const h = S0(people, []);
  const d = C.classifyRosterDiffs(e, h);
  chk('P2-4 missing on hand side is 手工缺任务 not 偏好不同', d.n === 1 && d.rows[0].category === '手工缺任务' && d.counts['手工缺任务'] === 1 && d.counts['偏好不同'] === 0 && d.rows[0].missing === '手工缺任务', JSON.stringify(d.rows[0]));
  const d2 = C.classifyRosterDiffs(h, e);
  chk('P2-4 missing on engine side is 系统缺任务', d2.n === 1 && d2.rows[0].category === '系统缺任务' && d2.counts['系统缺任务'] === 1 && d2.counts['偏好不同'] === 0, JSON.stringify(d2.rows[0]));
}

// ---------- P2-5：空航段不标「纯置位任务」 ----------
{
  const empty = prOf('EMPTY', [], legalCrew);
  empty.legs = [];
  const st = S0(people, [empty]);
  const info = C.legalSeatPairs(empty, people, st);
  chk('P2-5 empty legs skipped but not labeled 纯置位', info.skipped === true && info.ok && info.reason === 'empty-legs' && !/纯置位/.test(info.summary || '') && /无航段/.test(info.summary || ''), info.summary + ' reason=' + info.reason);
  const dh = prOf('DH-OK', [Object.assign(leg(1, '2758', 'ZYTX', 'ZUUU', 8 * 60 + 55, 12 * 60), { dh: true })], legalCrew);
  const infoD = C.legalSeatPairs(dh, people, S0(people, [dh]));
  chk('P2-5 real deadhead-only still 纯置位', infoD.skipped === true && infoD.reason === 'pure-dh' && /纯置位/.test(infoD.summary || ''), infoD.summary + ' reason=' + infoD.reason);
}

chk('rule version is v697', C.CURRENT_RULE_VERSION === 'v697' && C.currentRuleVersion(S0([], [])) === 'v697', C.CURRENT_RULE_VERSION);

console.log(fail ? 'V697 FAIL ' + fail : 'V697 ALL PASS');
process.exit(fail ? 1 : 0);
