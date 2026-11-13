// v694 修改单 v1：C-03 时刻版本 / C-04 航班号映射 / C-12 Excel 容错（含缺站表学习、住宿参数提示不回退）
const SP = require('../js/season-plan.js');
const FM = require('../js/flight-map.js');
const TV = require('../js/timetable-version.js');
const C = require('../js/core.js');
let fail = 0;
const chk = (n, ok, info) => { console.log('V694 ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };

// ---------- C-04 航班号映射 ----------
const table = FM.defaultTable();
function expectMap(newNo, oldNo, route) {
  const hit = FM.lookup(newNo, table);
  chk('C-04 map ' + newNo + '→' + oldNo, hit.status === 'mapped' && hit.auto && hit.oldNo === oldNo && hit.both.indexOf(newNo) >= 0 && hit.both.indexOf(oldNo) >= 0 && (!route || hit.route === route), JSON.stringify(hit));
}
expectMap('2426', '2764', '苏-武-琼');
expectMap('2425', '2763', '琼-武-苏');
expectMap('1904', '2238', '郑-福');
expectMap('2725', '2269', '湘-府');
expectMap('2727', '2435', '湘-陕-奇');
expectMap('2728', '2436', '奇-陕-湘');
expectMap('2726', '2270', '阿-府-湘');
expectMap('2239', '1955', '府-贡-府');
expectMap('2240', '1955', '府-贡-府');
chk('C-04 2239 oldNote 246 版', FM.lookup('2239', table).oldNote === '246 版', FM.lookup('2239', table).oldNote);
expectMap('2035', '2835', '蓉-厦-蓉');
expectMap('2036', '2835', '蓉-厦-蓉');
expectMap('6661', '6669', '蓉-虹桥-蓉');
expectMap('6662', '6669', '蓉-虹桥-蓉');
['1845', '1808'].forEach(n => {
  const h = FM.lookup(n, table);
  chk('C-04 ' + n + ' 存疑 not auto-mapped', h.status === '存疑' && h.auto === false && !h.oldNo, JSON.stringify(h));
});
['2715', '2716', '2821', '2822', '2793', '2794'].forEach(n => {
  const h = FM.lookup(n, table);
  chk('C-04 ' + n + ' 存疑 wait manual', h.status === '存疑' && h.auto === false && /换季计划没有|人工补录/.test(h.reason || ''), JSON.stringify(h));
});
const missing = FM.flagMissingFromPlan(['2715', '2821', '9991'], ['2261', '2426'], table);
chk('C-04 flag 2715/2821/unknown from fill-in', missing.map(x => x.flt).sort().join(',') === '2715,2821,9991' && missing.every(x => x.status === '存疑' && x.waitManual), missing.map(x => x.flt + ':' + x.reason).join('|'));
const edited = FM.upsertRow(table, { newNo: '3001', oldNo: '2001', route: '蓉-沈', auto: true });
chk('C-04 table editable upsert', FM.lookup('3001', edited).oldNo === '2001' && FM.lookup('3001', table).status === 'none', JSON.stringify(FM.lookup('3001', edited)));
const removed = FM.removeRow(edited, '3001');
chk('C-04 table editable remove', FM.lookup('3001', removed).status === 'none', JSON.stringify(FM.lookup('3001', removed)));
chk('C-04 keep both numbers on apply', FM.applyToFlights(['2426'], table)[0].both.slice().sort().join(',') === '2426,2764', JSON.stringify(FM.applyToFlights(['2426'], table)[0]));

// ---------- C-03 时刻版本（合成夹具；未找到用户 A1/A2/A3 清单） ----------
const prev = TV.importVersion([
  { flt: '2209', dep: '15:05', arr: '17:00' },
  { flt: '1871', dep: '07:25', arr: '09:40' },
  { flt: '2221', dep: '10:00', arr: '12:10' },
  { flt: '1954', dep: '12:00', arr: '14:20' },
  { flt: '1801', dep: '08:45', arr: '10:30' }
], { 版本号: '10.16', 生效日期: '2026-10-16', 来源文件名: 'synthetic-1016.csv', 导入时间: '2026-11-14T02:00:00+08:00' });
chk('C-03 version fields', prev.complete && prev.meta.版本号 === '10.16' && prev.meta.生效日期 === '2026-10-16' && prev.meta.来源文件名 === 'synthetic-1016.csv' && prev.meta.导入时间, JSON.stringify(prev.meta));

const pairings = [
  { id: 'PR-2221', legs: [{ flt: '2221', from: 'ZUUU', to: 'ZJHK', dep: 0, arr: 100 }] },
  { id: 'PR-1954', legs: [{ flt: '1954', from: 'ZJHK', to: 'ZUUU', dep: 200, arr: 300 }] }
];
const incoming = [
  { flt: '2209', dep: '15:05', arr: '17:00', row: 2 },
  { flt: '2209', dep: '15:20', arr: '17:15', row: 9 }, // intra-version conflict
  { flt: '1871', dep: '08:10', arr: '10:25' },
  { flt: '2221', dep: '08:10', arr: '10:20' }, // −1h50, red
  { flt: '1954', dep: '14:20', arr: '16:40' }, // +2h20, red
  { flt: '1801', dep: '09:00', arr: '10:45' }  // +15 min, not red
];
const draft = TV.importVersion(incoming, { 版本号: '填入-11', 生效日期: '2026-11-01', 来源文件名: 'synthetic-fillin.csv' }, prev.version, { pairings });
chk('C-03 intra-version conflict requires choice', !draft.complete && draft.unresolved.some(c => c.flt === '2209' && c.times.length === 2), (draft.unresolved[0] && draft.unresolved[0].message) || 'no conflict');
chk('C-03 unresolved blocks version flights', draft.version.pending && !draft.flights['2209'], 'pending=' + draft.version.pending);

const red2221 = draft.diff.find(x => x.flt === '2221');
const red1954 = draft.diff.find(x => x.flt === '1954');
const small1801 = draft.diff.find(x => x.flt === '1801');
chk('C-03 diff ≥45 min red (2221)', red2221 && red2221.red && Math.abs(red2221.deltaMin) >= 45 && red2221.受影响的任务.indexOf('PR-2221') >= 0, JSON.stringify(red2221));
chk('C-03 diff ≥45 min red (1954)', red1954 && red1954.red && Math.abs(red1954.deltaMin) >= 45 && red1954.受影响的任务.indexOf('PR-1954') >= 0, JSON.stringify(red1954));
chk('C-03 smaller change not red (1801 +15)', small1801 && !small1801.red && small1801.deltaMin === 15, JSON.stringify(small1801));

const resolved = TV.importVersion(incoming, { 版本号: '填入-11', 生效日期: '2026-11-01', 来源文件名: 'synthetic-fillin.csv' }, prev.version, {
  pairings,
  choices: { '2209': { dep: '15:20', arr: '17:15' } }
});
chk('C-03 resolved after manual choice', resolved.complete && resolved.unresolved.length === 0 && TV.fmtHM(resolved.flights['2209'].depMin) === '15:20', resolved.unresolved.length + ' unresolved');

const roster = { pairings: [], pilots: [] };
TV.stampRoster(roster, resolved.meta);
chk('C-03 roster stores 时刻版本号', roster.时刻版本号 === '填入-11' && roster.timetableVersion.版本号 === '填入-11' && roster.timetableVersion.生效日期 === '2026-11-01' && roster.timetableVersion.来源文件名 === 'synthetic-fillin.csv', JSON.stringify(TV.getStamp(roster)));

// ---------- C-12 航班号写法 ----------
function flts(s) { return SP.normalizeFlights(s).flights.join(','); }
chk('C-12 parse EU1934 、2238', flts('EU1934 、2238') === '1934,2238', flts('EU1934 、2238'));
chk('C-12 parse 2739、40', flts('2739、40') === '2739,2740', flts('2739、40'));
chk('C-12 parse EU1966.5', flts('EU1966.5') === '1966' && /不像第二航班号/.test((SP.normalizeFlights('EU1966.5').flags || []).join(',')), JSON.stringify(SP.normalizeFlights('EU1966.5')));
chk('C-12 parse 1871/1872', flts('1871/1872') === '1871,1872', flts('1871/1872'));
chk('C-12 parse (摆渡） empty ferry', SP.normalizeFlights('(摆渡）').flights.length === 0 && SP.normalizeFlights('(摆渡）').ferry, JSON.stringify(SP.normalizeFlights('(摆渡）')));
chk('C-12 parse （摆渡） empty ferry', SP.normalizeFlights('（摆渡）').ferry && SP.normalizeFlights('（摆渡）').flights.length === 0, JSON.stringify(SP.normalizeFlights('（摆渡）')));
chk('C-12 parse EU2450（摆渡）', flts('EU2450（摆渡）') === '2450' && SP.normalizeFlights('EU2450（摆渡）').ferry, JSON.stringify(SP.normalizeFlights('EU2450（摆渡）')));
chk('C-12 parse EU2705/6', flts('EU2705/6') === '2705,2706', flts('EU2705/6'));

// ---------- C-12 机场别名 / 去重 ----------
chk('C-12 海口(摆渡）→海口/ZJHK', SP.cleanAirportName('海口(摆渡）') === '海口' && SP.normAp ? true : SP.aliasAirportName('海口(摆渡）') === '海口', SP.cleanAirportName('海口(摆渡）') + '/' + SP.aliasAirportName('海口(摆渡）'));
// normAp may not be exported; parseRoute covers it
chk('C-12 海口 ferry route', SP.parseRoute('海口(摆渡）-武汉').join(',') === 'ZJHK,ZHHH', SP.parseRoute('海口(摆渡）-武汉').join(','));
chk('C-12 伊宁（摆渡）', SP.cleanAirportName('伊宁（摆渡）') === '伊宁' && SP.parseRoute('伊宁（摆渡）').join(',') === 'ZWYN', SP.cleanAirportName('伊宁（摆渡）') + ' ' + SP.parseRoute('伊宁（摆渡）').join(','));
chk('C-12 达州金垭/达州/达县', ['达州金垭', '达州', '达县'].every(n => SP.parseRoute(n)[0] === 'ZUDX'), ['达州金垭', '达州', '达县'].map(n => n + '=' + SP.parseRoute(n)).join(','));
chk('C-12 揭阳潮汕/揭阳', SP.parseRoute('揭阳潮汕')[0] === 'ZGOW' && SP.parseRoute('揭阳')[0] === 'ZGOW', SP.parseRoute('揭阳潮汕') + '/' + SP.parseRoute('揭阳'));
const dup = SP.dedupeAirportTable([
  { name: '汉堡', row: 240 }, { name: '汉堡', row: 241 },
  { name: '图卢兹', row: 244 }, { name: '图卢兹', row: 245 },
  { name: '莫斯科', row: 273 }, { name: '莫斯科', row: 277 }
]);
chk('C-12 dedupe 汉堡/图卢兹/莫斯科', dup.rows.length === 3 && dup.deduped.length === 3 && dup.rows.map(r => r.name).sort().join(',') === '图卢兹,汉堡,莫斯科', JSON.stringify({ kept: dup.rows.map(r => r.name), dropped: dup.deduped.map(r => r.name + '@' + r.row) }));

// ---------- C-12 网格解析：过滤非数据行、标签元数据、时长交叉核对 ----------
const H = ['性质', '过夜天数', '航班号', '班期', '航站1', '起飞1', '落地1', '航站2', '起飞2', '落地2', '航站3', '起飞3', '落地3', '飞行时间'];
const grid = [
  H,
  [null, null, null, null, '沈阳', '沈阳', '沈阳', '沈阳', '沈阳', '沈阳', '沈阳', '沈阳', '沈阳', '沈阳'], // direction title (repeated)
  ['通知：头像对不上号', null, null, null, null, null, null, null, null, null, null, null, null, null],
  ['优先长沙属地化', '飞2天', 'EU2261', '1357', '长沙', '0815', '1015', '成都天府', '2115', '2300', '长沙', null, null, 0.1667], // 4h = 0.1667 day；实际 2h+1h45=3h45, |10-?|
  ['可单出来沈阳属地化飞', null, 'EU1934 、2238', '246', '博鳌', '1505', '1800', '郑州', '1900', '2105', '福州', null, null, 0.25],
  [null, null, '2739、40', '1357', '福州', '0810', '1030', '济南', '2005', '2215', '福州', null, null, 0.1736],
  ['已完成', null, 'EU1966.5', '3571', '海口(摆渡）', '1000', '1155', '武汉', '2245', '0110', '海口', null, null, 0.2986],
  [null, null, '(摆渡）', '1234567', '成都双流', null, null, '吐鲁番', null, null, null, null, null, null],
  [null, null, '1871/1872', '1234567', '成都天府', '0815', '1035', '呼和浩特', '1525', '1800', '成都天府', null, null, 0.2083]
];
const g = SP.parseSeasonGrid(grid, { sheet: '空客' });
chk('C-12 skip direction title 沈阳', (g.skipped || []).some(s => s.kind === 'direction' && /沈阳/.test(s.text)), JSON.stringify(g.skipped));
chk('C-12 skip remark 通知/头像, attach to next pairing', (g.skipped || []).some(s => s.kind === 'remark' && /头像对不上号/.test(s.text)) && (g.duties || []).some(d => (d.remarks || []).some(t => /头像对不上号/.test(t))), JSON.stringify({ skipped: g.skipped, remarks: (g.duties || []).map(d => d.remarks) }));
chk('C-12 label 优先长沙属地化 kept on duty', (g.duties || []).some(d => (d.labels || []).some(l => /优先长沙属地化/.test(l)) && (d.flights || []).indexOf('2261') >= 0), JSON.stringify((g.duties || []).map(d => ({ f: d.flights, labels: d.labels }))));
chk('C-12 label 可单出来沈阳属地化飞 kept', (g.duties || []).some(d => (d.labels || []).some(l => /可单出来沈阳属地化飞/.test(l))), JSON.stringify((g.duties || []).map(d => d.labels)));
chk('C-12 label 已完成 kept on EU1966', (g.duties || []).some(d => (d.flights || []).indexOf('1966') >= 0 && (d.labels || []).some(l => l === '已完成')), JSON.stringify((g.duties || []).filter(d => (d.flights || []).indexOf('1966') >= 0).map(d => d.labels)));
chk('C-12 grid parses 1934/2238 and 2739/2740', (g.duties || []).some(d => (d.flights || []).join('/') === '1934/2238' || ((d.flights || []).indexOf('1934') >= 0 && (d.flights || []).indexOf('2238') >= 0)) && (g.duties || []).some(d => (d.flights || []).indexOf('2739') >= 0 && (d.flights || []).indexOf('2740') >= 0), JSON.stringify((g.duties || []).map(d => d.flights)));
chk('C-12 海口(摆渡） normalized in legs', (g.duties || []).some(d => (d.legs || []).some(l => l.from === 'ZJHK' || l.to === 'ZJHK') && (d.flights || []).indexOf('1966') >= 0), JSON.stringify((g.duties || []).filter(d => (d.flights || []).indexOf('1966') >= 0).map(d => (d.legs || []).map(l => l.from + '-' + l.to))));

// duration cross-check: 0.2986 days = 430 min; 1966.5 海口1000-1155 (115) + 武汉2245-0110 (145) = 260, delta 170 > 5 → 存疑
const d1966 = (g.duties || []).find(d => (d.flights || []).indexOf('1966') >= 0);
const item1966 = (g.items || []).find(it => (it.flights || []).indexOf('1966') >= 0 || it.id === (d1966 && d1966.id));
chk('C-12 duration 0.2986 vs times >5 min 存疑', d1966 && d1966.durationDoubt && Math.abs(d1966.durationDelta) > 5 && item1966 && item1966.status === 'doubt', JSON.stringify({ dur: d1966 && d1966.durationMin, delta: d1966 && d1966.durationDelta, status: item1966 && item1966.status, ft: d1966 && d1966.flightMin }));

// 时长接近：1871/1872 0815-1035 (140) + 1525-1800 (155) = 295; 0.2083*1440≈300, delta 5, not >5
const d1871 = (g.duties || []).find(d => (d.flights || []).indexOf('1871') >= 0);
chk('C-12 duration within 5 min not 存疑', d1871 && !d1871.durationDoubt, JSON.stringify({ dur: d1871 && d1871.durationMin, delta: d1871 && d1871.durationDelta, ft: d1871 && d1871.flightMin }));

// ferry-only row should not be a failed data duty with bogus flights
chk('C-12 (摆渡） row not treated as a flight number 摆渡', !(g.duties || []).some(d => (d.flights || []).some(f => /摆渡/.test(f))), JSON.stringify((g.duties || []).map(d => d.flights)));

// ---------- C-12 缺站检查：从计划学习，而不只靠写死表 ----------
const learnGrid = [
  H,
  [null, null, 'EU3991', '1234567', '成都双流', '0800', '1000', '合肥', '1040', '1605', '哈尔滨', null, null, 0.25],
  [null, null, 'EU3991', '1234567', '成都双流', '0800', '2330', '合肥', null, null, null, null, null, 0.1]
];
const learned = SP.parseSeasonGrid(learnGrid, { sheet: '学习' });
const failItem = (learned.items || []).find(it => it.row === 3 || (it.flights || []).length && it.status === 'fail');
chk('C-12 learned route 3991 蓉-皖-哈 flags missing 哈', (learned.knownRoutes || {})['3991'] && (learned.knownRoutes['3991'].join(',') === 'ZUUU,ZSOF,ZYHB') && (learned.items || []).some(it => it.status === 'fail' && /航线不连续|缺少/.test((it.reasons || []).join(' '))), JSON.stringify({ routes: learned.knownRoutes && learned.knownRoutes['3991'], items: learned.items }));

// seed table still used for P-03 style incomplete writing without prior row in this call
const p3 = SP.parseSeasonPlan([{ sheet: '换季计划', row: 20, flights: '2449/2450', route: '蓉-皖-蓉' }]);
chk('C-12 seed still catches 2449/2450 蓉-皖-蓉', p3.report.fail >= 1 && /缺少 哈/.test((p3.items[0].reasons || []).join(' ')), SP.reportText(p3.report));

// ---------- C-12 接入 dutiesToPairings / 映射保留双号 ----------
const mapGrid = [
  H,
  [null, null, 'EU2426', '1234567', '无锡', '0800', '1000', '武汉', '1040', '1300', '海口', null, null, 0.2]
];
const mg = SP.parseSeasonGrid(mapGrid, { sheet: '映射' });
const md = (mg.duties || []).find(d => (d.flights || []).indexOf('2426') >= 0);
chk('C-12 parse auto-maps 2426 and keeps 2764', md && md.flightMap && md.flightMap.some(x => x.oldNo === '2764' && x.newNo === '2426') && (md.legs || []).some(l => l.fltOrig === '2764'), JSON.stringify(md && { flights: md.flights, map: md.flightMap, legs: md.legs }));
const prs = SP.dutiesToPairings(mg.duties || []);
chk('C-12 dutiesToPairings keeps both numbers', prs.length && prs[0].legs.some(l => l.flt === '2426' || l.fltNew === '2426') && prs[0].legs.some(l => l.fltOrig === '2764'), JSON.stringify(prs[0] && prs[0].legs));

const pendingGrid = [
  H,
  [null, null, '1845', '1234567', '成都双流', '0800', '1000', '长沙', null, null, null, null, null, 0.08]
];
const pg = SP.parseSeasonGrid(pendingGrid, { sheet: '存疑' });
chk('C-12 1845 not auto-mapped, marked 存疑', (pg.duties || []).some(d => (d.flights || []).indexOf('1845') >= 0 && d.status === 'doubt' && !(d.flightMap || []).some(x => x.auto && x.oldNo)) && (pg.report.doubt >= 1), JSON.stringify((pg.duties || []).map(d => ({ f: d.flights, st: d.status, map: d.flightMap, note: d.note }))));

// ---------- C-06 P2: 无住宿参数时「需确认住宿」仍出现；导入机场属性不得当成住宿参数 ----------
const D = 1440;
const stopsPr = { id: 'LG', start: 1, ndays: 1, ac: 'A320', crew: { C: 'c', F: 'f', T: 't' }, legs: [
  { d: 1, flt: 'T1', from: 'ZUUU', to: 'ZSWX', dep: 8 * 60, arr: 10 * 60, ac: 'A320' },
  { d: 1, flt: 'T2', from: 'ZSWX', to: 'ZUUU', dep: 16 * 60, arr: 18 * 60, ac: 'A320' }
] };
const pilots = [
  { id: 'c', name: 'C', rank: 'J3', auth: [], health: C.defaultHealth() },
  { id: 'f', name: 'F', rank: 'F7', auth: [], health: C.defaultHealth() },
  { id: 't', name: 'T', rank: 'F6', auth: [], health: C.defaultHealth() }
];
const st0 = { settings: C.migrateSettings(C.defaultSettings()), pilots, restrictions: [], pairings: [stopsPr], standby: {} };
const v0 = C.validate(st0);
chk('C-12/C-06 empty lodging params still tip 需确认住宿', v0.some(x => x.type === '需确认住宿' && /需确认住宿/.test(x.msg)) && v0.some(x => /需安排住宿/.test(x.msg)), v0.filter(x => /住宿|过站/.test(x.type + x.msg)).map(x => x.type + ':' + x.level).join('|'));
chk('C-12/C-06 unconfirmed still one FDP, no deduct', C.fdpDays(stopsPr, st0).length === 1 && C.lodgingMin(stopsPr, C.fdpDays(stopsPr, st0)[0]) === 0, 'parts=' + C.fdpDays(stopsPr, st0).length);
// 机场属性（报到/车程）写入 airportParams，不应写入 airportLodging
const ap = SP.parseAirportParamsSheet([['机场', '报道时长'], ['汉堡', 1], ['汉堡', 1], ['无锡', 1]]);
const st1 = Object.assign({}, st0, { airportParams: ap.rows, airportLodging: {} });
const v1 = C.validate(st1);
chk('C-12 airport params dedupe and not used as lodging', ap.deduped.length >= 1 && v1.some(x => x.type === '需确认住宿'), JSON.stringify({ kept: ap.rows.map(r => r.name), dropped: ap.deduped.length, tips: v1.filter(x => /住宿/.test(x.type)).map(x => x.type) }));

console.log(fail ? 'V694 FAILED ' + fail : 'V694 ALL OK');
process.exit(fail ? 1 : 0);
