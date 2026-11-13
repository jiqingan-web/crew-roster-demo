// v696 修改单 v1：C-05 P1 纯置位跳过座位校验 / C-10 界面与流程；附可选 P2
const C = require('../js/core.js');
const LI = require('../js/leg-import.js');
let fail = 0;
const chk = (n, ok, info) => { console.log('V696 ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };
const D = 1440;
const P = (id, rank, x) => Object.assign({ id, name: id, rank, auth: [], health: C.defaultHealth() }, x || {});
const leg = (d, flt, from, to, depHM, arrHM, extra) => Object.assign({
  d, flt, from, to, dep: (d - 1) * D + depHM, arr: (d - 1) * D + (arrHM <= depHM ? arrHM + D : arrHM), ac: 'A320'
}, extra || {});
const prOf = (id, legs, crew) => ({ id, start: legs[0].d, ndays: legs[legs.length - 1].d - legs[0].d + 1, legs, crew: crew || { C: null, F: null, T: null }, ac: 'A320' });
const S0 = (pilots, pairings, extra) => Object.assign({
  settings: C.migrateSettings(C.defaultSettings()), pilots, restrictions: [], pairings: pairings || [], standby: {}
}, extra || {});
const crewAF3 = { C: 'capA', F: 'fo4', T: 'fo3' };
const peopleAF3 = [P('capA', '机长A'), P('fo4', 'F4'), P('fo3', 'F3')];

// ---------- C-05 P1：纯置位跳过座位校验 ----------
{
  const ext = C.makeExtDhLeg({ d: 1, flt: '8791', from: 'ZUUU', to: 'ZBAA', depHM: 8 * 60, arrHM: 11 * 60, carrier: '3U' });
  const pX = prOf('XD-P1', [ext], crewAF3);
  const stX = S0(peopleAF3, [pX]);
  const infoX = C.legalSeatPairs(pX, peopleAF3, stX);
  const issX = C.crewIssue(pX, peopleAF3, stX);
  const vX = C.validate(stX);
  chk('C-05 P1 外航置位 skip seat pairs', infoX.skipped === true && infoX.ok && !issX, 'iss=' + issX + ' skipped=' + infoX.skipped + ' reason=' + infoX.reason + ' summary=' + infoX.summary);
  chk('C-05 P1 外航置位 机长A+F4+F3 no hard 上座', !vX.some(x => x.level === 'hard' && /无合规上座组合|座位|上座/.test(x.type + x.msg)), vX.filter(x => x.level === 'hard').map(x => x.type + ':' + x.msg).join('|'));
}
{
  const company = { d: 1, flt: '2758', from: 'ZYTX', to: 'ZUUU', dep: 8 * 60 + 55, arr: 12 * 60, ac: 'A320', dh: true };
  const pC = prOf('DH-P1', [company], crewAF3);
  const stC = S0(peopleAF3, [pC]);
  const infoC = C.legalSeatPairs(pC, peopleAF3, stC);
  const issC = C.crewIssue(pC, peopleAF3, stC);
  const vC = C.validate(stC);
  chk('C-05 P1 本公司置位 skip seat pairs', infoC.skipped === true && infoC.ok && !issC, 'iss=' + issC + ' skipped=' + infoC.skipped + ' summary=' + infoC.summary);
  chk('C-05 P1 本公司置位 机长A+F4+F3 no hard 上座', !vC.some(x => x.level === 'hard' && /无合规上座组合|座位|上座/.test(x.type + x.msg)), vC.filter(x => x.level === 'hard').map(x => x.type + ':' + x.msg).join('|'));
}
{
  const op = [leg(1, '2201', 'ZUUU', 'ZBAA', 8 * 60, 11 * 60), leg(1, '2202', 'ZBAA', 'ZUUU', 13 * 60, 16 * 60)];
  const pM = prOf('MX-P1', op, crewAF3);
  const stM = S0(peopleAF3, [pM]);
  const infoM = C.legalSeatPairs(pM, peopleAF3, stM);
  const issM = C.crewIssue(pM, peopleAF3, stM);
  const vM = C.validate(stM);
  chk('C-05 P1 mixed operating still seat-checks', !infoM.skipped && !infoM.ok && !!issM && vM.some(x => x.level === 'hard' && /无合规上座组合|座位/.test(x.type + x.msg)), 'iss=' + issM + ' skipped=' + infoM.skipped);
}

// ---------- C-10.1 值勤计算过程 ----------
{
  const p = P('j3', 'J3');
  const pr = prOf('TR-DUTY', [leg(1, '2201', 'ZUUU', 'ZBAA', 10 * 60, 13 * 60), leg(1, '2202', 'ZBAA', 'ZUUU', 15 * 60, 18 * 60)], { C: 'j3' });
  const st = S0([p], [pr]);
  const trail = C.dutyCalcTrail(pr, st);
  const steps = (trail[0] && trail[0].steps) || [];
  const labels = steps.map(x => x.label);
  const report = steps.find(x => x.key === 'report');
  const shutdown = steps.find(x => x.key === 'shutdown');
  chk('C-10 trail has report/dep/arr/shutdown', trail.length === 1 && labels.includes('报到') && labels.includes('起飞') && labels.includes('落地') && labels.includes('关车'), labels.join(','));
  chk('C-10 trail report airport params', report && report.airport === 'ZUUU' && /车程/.test(report.paramsText) && /报到提前/.test(report.paramsText) && report.params && report.params['是否基地'] === '是', report && report.paramsText);
  chk('C-10 trail shutdown airport params', shutdown && shutdown.airport === 'ZUUU' && /退场/.test(shutdown.paramsText) && /车程/.test(shutdown.paramsText), shutdown && shutdown.paramsText);
}
{
  const p = P('j3', 'J3');
  const pr = prOf('TR-REST', [
    { d: 1, flt: '1892', from: 'ZUUU', to: 'ZYTX', dep: 20 * 60, arr: D + 5, ac: 'A320' },
    { d: 2, flt: '2758', from: 'ZYTX', to: 'ZUUU', dep: D + 8 * 60 + 55, arr: D + 12 * 60, ac: 'A320', dh: true }
  ], { C: 'j3' });
  const st = S0([p], [pr]);
  const days = C.fdpDays(pr, st);
  const trail = C.dutyCalcTrail(pr, st);
  const s1 = (trail[0] && trail[0].steps) || [];
  const restStart = s1.find(x => x.key === 'restStart');
  const restEnd = s1.find(x => x.key === 'restEnd');
  chk('C-10 trail rest start/end with airport params', restStart && restEnd && /关车/.test(restStart.paramsText) && /车程/.test(restEnd.paramsText) && /下一窗纯置位/.test(restEnd.paramsText), (restStart && restStart.paramsText) + ' || ' + (restEnd && restEnd.paramsText));
  chk('C-10 / P2 same-task 执飞过夜→次日置位 planRest 7h00', days[0] && days[0].planRest === 7 * 60, days[0] && C.fmtH(days[0].planRest));
  chk('C-10 trail rest duration matches planRest', restEnd && restEnd.restMin === days[0].planRest, restEnd && restEnd.restMin);
}

// ---------- C-10.2 对比分类 ----------
{
  const legal = [P('c1', 'J3'), P('f1', 'F5'), P('t1', 'F3'), P('c2', 'J3'), P('f2', 'F5'), P('t2', 'F3')];
  const legs = [leg(1, '2201', 'ZUUU', 'ZBAA', 8 * 60, 11 * 60), leg(1, '2202', 'ZBAA', 'ZUUU', 13 * 60, 16 * 60)];
  const base = (id, crew) => prOf(id, legs.map(l => Object.assign({}, l)), crew);
  const make = (crews) => S0(legal, [base('T-A', crews[0]), base('T-B', crews[1]), base('T-C', crews[2])]);
  // Pref: both legal, different people on T-A
  const engPref = make([
    { C: 'c1', F: 'f1', T: 't1' },
    { C: 'c2', F: 'f2', T: 't2' },
    { C: 'c1', F: 'f1', T: 't2' }
  ]);
  const handPref = make([
    { C: 'c2', F: 'f2', T: 't2' },
    { C: 'c2', F: 'f2', T: 't2' },
    { C: 'c1', F: 'f1', T: 't2' }
  ]);
  // isolate T-A only for cleaner cases
  const e1 = S0(legal, [base('T-PREF', { C: 'c1', F: 'f1', T: 't1' })]);
  const h1 = S0(legal, [base('T-PREF', { C: 'c2', F: 'f2', T: 't2' })]);
  const d1 = C.classifyRosterDiffs(e1, h1);
  chk('C-10 classify 偏好不同', d1.n === 1 && d1.rows[0].category === '偏好不同' && d1.counts['偏好不同'] === 1, JSON.stringify(d1.rows[0]));

  const e2 = S0(peopleAF3.concat([P('j3', 'J3'), P('f5', 'F5'), P('f3b', 'F3')]), [prOf('T-HAND', legs, { C: 'j3', F: 'f5', T: 'f3b' })]);
  const h2 = S0(peopleAF3.concat([P('j3', 'J3'), P('f5', 'F5'), P('f3b', 'F3')]), [prOf('T-HAND', legs, crewAF3)]);
  const d2 = C.classifyRosterDiffs(e2, h2);
  chk('C-10 classify 手工违规', d2.n === 1 && d2.rows[0].category === '手工违规' && d2.counts['手工违规'] === 1 && d2.rows[0].handHard && !d2.rows[0].engineHard, JSON.stringify(d2.rows[0] && { cat: d2.rows[0].category, eH: d2.rows[0].engineHard, hH: d2.rows[0].handHard, eIss: (d2.rows[0].engineIssues || []).map(x => x.msg), hIss: (d2.rows[0].handIssues || []).map(x => x.msg) }));

  const e3 = S0(peopleAF3.concat([P('j3', 'J3'), P('f5', 'F5'), P('f3b', 'F3')]), [prOf('T-SYS', legs, crewAF3)]);
  const h3 = S0(peopleAF3.concat([P('j3', 'J3'), P('f5', 'F5'), P('f3b', 'F3')]), [prOf('T-SYS', legs, { C: 'j3', F: 'f5', T: 'f3b' })]);
  const d3 = C.classifyRosterDiffs(e3, h3);
  chk('C-10 classify 系统错', d3.n === 1 && d3.rows[0].category === '系统错' && d3.counts['系统错'] === 1 && d3.rows[0].engineHard && !d3.rows[0].handHard, JSON.stringify(d3.rows[0] && { cat: d3.rows[0].category, eH: d3.rows[0].engineHard, hH: d3.rows[0].handHard }));
}

// ---------- C-10.3 发布前检查 ----------
{
  const p = P('j3', 'J3');
  const pr = prOf('PUB-OK', [leg(1, '2201', 'ZUUU', 'ZBAA', 8 * 60, 11 * 60)], { C: 'j3', F: 'f5', T: 'f3' });
  const st = S0([p, P('f5', 'F5'), P('f3', 'F3')], [pr]);
  const ok0 = C.publishCheck(st);
  chk('C-10 publish allowed when three classes zero', ok0.ok && ok0.hardN === 0 && ok0.doubtN === 0 && ok0.conflictN === 0 && C.canPublish(st), JSON.stringify({ hard: ok0.hardN, doubt: ok0.doubtN, conf: ok0.conflictN, hardTypes: ok0.hard.map(x => x.type) }));

  const badCrew = S0(peopleAF3, [prOf('PUB-HARD', [leg(1, '2201', 'ZUUU', 'ZBAA', 8 * 60, 11 * 60), leg(1, '2202', 'ZBAA', 'ZUUU', 13 * 60, 16 * 60)], crewAF3)]);
  const blockedHard = C.publishCheck(badCrew);
  const pubHard = C.publishRoster(badCrew, { operator: 'alice' });
  chk('C-10 publish blocked by hard', !blockedHard.ok && blockedHard.hardN > 0 && !pubHard.ok && !pubHard.published, 'hardN=' + blockedHard.hardN);

  const stD = S0([p, P('f5', 'F5'), P('f3', 'F3')], [pr]);
  stD.parseDoubts = [{ id: 'd1', msg: '1845 存疑' }];
  const blockedD = C.publishCheck(stD);
  chk('C-10 publish blocked by 解析存疑', !blockedD.ok && blockedD.doubtN === 1 && !C.publishRoster(stD, { operator: 'alice' }).ok, 'doubtN=' + blockedD.doubtN);

  const stC = S0([p, P('f5', 'F5'), P('f3', 'F3')], [pr]);
  stC.timetableVersion = { 版本号: 'A', unresolved: [{ flt: '2201', key: '2201' }] };
  const blockedC = C.publishCheck(stC);
  chk('C-10 publish blocked by 时刻冲突', !blockedC.ok && blockedC.conflictN === 1 && !C.publishRoster(stC, { operator: 'alice' }).ok, 'conflictN=' + blockedC.conflictN);

  const at = Date.UTC(2026, 10, 14, 2, 0, 0);
  const rec = C.recordConfirmation(st, { type: '确认住宿', operator: 'bob', at, target: 'PUB-OK', note: 'D1' });
  chk('C-10 confirmation has operator+time', rec.operator === 'bob' && rec.at === at && rec.type === '确认住宿' && st.confirmations.length === 1 && st.confirmations[0].operator === 'bob', JSON.stringify(rec));

  C.resolveParseDoubt(stD, 'd1', { operator: 'carol', at: at + 1000 });
  chk('C-10 resolve doubt records operator+time and unblocks', stD.parseDoubts.length === 0 && stD.confirmations.some(x => x.type === '解析存疑确认' && x.operator === 'carol' && x.at === at + 1000) && C.canPublish(stD), JSON.stringify(stD.confirmations));

  const pub = C.publishRoster(st, { operator: 'dave', at: at + 2000 });
  chk('C-10 publish succeeds and stamps rule version', pub.ok && pub.published.operator === 'dave' && pub.published.at === at + 2000 && pub.published.ruleVersion === C.CURRENT_RULE_VERSION && pub.published.规则版本号 === C.CURRENT_RULE_VERSION && st.published === pub.published, JSON.stringify(pub.published));
  chk('C-10 publish writes confirmation', st.confirmations.some(x => x.type === '发布' && x.operator === 'dave' && x.at === at + 2000), JSON.stringify(st.confirmations));
}

// ---------- C-10.4 规则版本记录 ----------
{
  const st = S0([], []);
  const log = C.ensureRuleRevisions(st);
  chk('C-10 default rule revisions include v692-v696', log.length >= 5 && log.some(x => x.version === 'v696') && log.some(x => x.version === C.CURRENT_RULE_VERSION) && C.currentRuleVersion(st) === C.CURRENT_RULE_VERSION, JSON.stringify(log.map(x => x.version)));
  const added = C.addRuleRevision(st, { version: 'v696-a', date: '2026-11-14', author: 'eve', basis: '测试追加口径' });
  chk('C-10 add revision stores date/author/basis', added.version === 'v696-a' && added.author === 'eve' && added.basis === '测试追加口径' && added.date === '2026-11-14' && C.currentRuleVersion(st) === 'v696-a', JSON.stringify(added));
  const result = C.stampRosterResult({ foo: 1 }, st);
  chk('C-10 roster result stores 规则版本号', result.ruleVersion === 'v696-a' && result.规则版本号 === 'v696-a' && result.foo === 1, JSON.stringify(result));
}

// ---------- optional P2: 承运人误填 ----------
{
  const st = S0([P('a', 'J3')], []);
  const head = LI.HEAD;
  const row = (id, typ, carrier, dh, flt) => [id, '2026-11-03', flt || 'EU2201', 'ZUUU', 'ZBAA', '08:00', '11:00', dh || '', 'A320', '', '', '', '', '', '', typ || '', carrier || ''];
  const rEU = LI.parseRows([head, row('EU1', '', 'EU')], C, st);
  const lEU = rEU.pairings[0] && rEU.pairings[0].legs[0];
  chk('P2 company flight with 承运人 EU not 外航置位', lEU && !lEU.dh && !C.isExtDh(lEU) && C.pairingHours(rEU.pairings[0]) > 0, JSON.stringify(lEU));

  const r3U = LI.parseRows([head, row('X3U', '外航置位 / 买票', '3U', '', '3U8791')], C, st);
  const l3U = r3U.pairings[0] && r3U.pairings[0].legs[0];
  chk('P2 3U8791 explicit type still 外航置位', l3U && C.isExtDh(l3U) && l3U.carrier === '3U' && C.pairingHours(r3U.pairings[0]) === 0, JSON.stringify(l3U));

  const rCA = LI.parseRows([head, row('XCA', '', 'CA', '', 'CA8261')], C, st);
  const lCA = rCA.pairings[0] && rCA.pairings[0].legs[0];
  chk('P2 CA8261 carrier-only still 外航置位', lCA && C.isExtDh(lCA) && lCA.carrier === 'CA' && C.pairingHours(rCA.pairings[0]) === 0, JSON.stringify(lCA));
}

console.log(fail ? 'V696 FAIL ' + fail : 'V696 ALL PASS');
process.exit(fail ? 1 : 0);
