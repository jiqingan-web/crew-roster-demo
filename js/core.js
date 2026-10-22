/* 机组排班助手 - 核心模块（数据生成 / 规则 / 求解器 / 校验 / 指标）
 * 浏览器中挂载到 window.RosterCore，在 Node 中可 require()。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sample-data.js'), require('./lite-roster.js'), require('./rules-config.js'), require('./pinyin-initials.js'));
  else { root.RosterCoreFactory = factory; root.RosterCore = factory(root.RosterSampleData || null, root.RosterLiteRoster || null, root.RosterRulesConfig || null, root.RosterPinyin || null); } // 工厂供 Blob Worker 复用（file:// 亦可）
})(typeof self !== 'undefined' ? self : this, function (SampleData, LiteRoster, RulesConfig, Pinyin) {
  'use strict';
  const YEAR = 2026, MONTH = 11, DAYS = 30, DAY = 1440;
  const SD = SampleData || {};
  const LR = (LiteRoster && LiteRoster.LITE_ROSTER) || (LiteRoster && LiteRoster.default && LiteRoster.default.LITE_ROSTER) || null;
  const PY = Pinyin || {};
  const SAMPLE_WEEK_PATHS = SD.SAMPLE_WEEK_PATHS || [];
  const SAMPLE_META = SD.SAMPLE_META || {};
  const SQUADS_AIRBUS = ['空客一中队', '空客二中队', '空客三中队', '空客四中队', '空客五中队', '空客六中队', '空客七中队', '空客八中队'];
  const SQUADS_C909 = ['C909一中队', 'C909二中队', 'C909三中队'];
  const ALL_SQUADS = SQUADS_AIRBUS.concat(SQUADS_C909);

  // ---------- 级别 ----------
  const RANK_VAL = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8,
    SPIC: 10, US: 11, J0: 12, '机长A': 12, '机长B': 12, J1: 13, J2: 14, J3: 15, TL: 20, TB: 21, TC: 22 };
  const RANKS = Object.keys(RANK_VAL);
  const NEW_CAPT = ['SPIC', 'US', 'J0', '机长A', '机长B'];
  const INSTR = ['TL', 'TB', 'TC'];
  const isFO = r => RANK_VAL[r] <= 8;
  const isCaptClass = r => RANK_VAL[r] >= 10;
  const isInstr = r => INSTR.includes(r);
  const isNew = r => NEW_CAPT.includes(r);
  const isJ2plus = r => ['J2', 'J3'].includes(r) || isInstr(r);
  const isJ3plus = r => r === 'J3' || isInstr(r);
  const isJ1plus = r => ['J1', 'J2', 'J3'].includes(r) || isInstr(r);
  // 副驾驶等效级别（机长类视为高于 F8）
  const foLevel = r => isFO(r) ? RANK_VAL[r] : 9;
  function rankGroup(r) {
    if (isInstr(r)) return '教员'; if (isNew(r)) return '新机长';
    if (isCaptClass(r)) return '机长'; return '副驾驶';
  }
  const GROUPS = ['教员', '机长', '新机长', '副驾驶'];

  // RE12 巡航座位搭配：左座 -> 右座是否允许
  // ---------- 规则配置（rules/crew_rules.yaml → js/rules-config.js；修订规则只改配置）----------
  const RC = (RulesConfig && (RulesConfig.RULES_CONFIG || (RulesConfig.default && RulesConfig.default.RULES_CONFIG))) || null;
  const EO = (RC && RC.engine_options) || {};
  const CAPT_ORDER = (RC && RC.captain_levels && RC.captain_levels.order) || ['US', 'J0', 'J1', 'J2', 'J3', 'TL', 'TB', 'TC'];
  const RANK_ALIAS = { '机长A': 'J0', '机长B': 'J0' }; // 公司“机长A/B”（新机长）按 J0 套矩阵
  const capKey = r => RANK_ALIAS[r] || r;
  const capLv = r => CAPT_ORDER.indexOf(capKey(r));
  const fNum = s => +String(s || 'F0').replace(/\D/g, '');
  const FO_GROUPS = (RC && RC.fo_levels && RC.fo_levels.groups) || { low: ['F1', 'F2', 'F3'], mid: ['F4', 'F5'], high: ['F6', 'F7', 'F8'] };
  function foGroup(r) { for (const k in FO_GROUPS) if (FO_GROUPS[k].includes(r)) return k; return null; }
  function foComboKey(a, b) { const o = ['low', 'mid', 'high']; const x = [foGroup(a), foGroup(b)].sort((p, q) => o.indexOf(p) - o.indexOf(q)); return x[0] + '_' + x[1]; }
  function foComboAllowed(a, b) { const al = RC && RC.fo_combination_matrix && RC.fo_combination_matrix.allow; const k = foComboKey(a, b); return !al || al[k] !== false; }
  function foComboScore(a, b) { const ps = RC && RC.fo_combination_matrix && RC.fo_combination_matrix.preference_score; return (ps && ps[foComboKey(a, b)]) || 0; }
  const SPIC_EXCL = (RC && RC.captain_levels && RC.captain_levels.excluded_from_roster) || ['SPIC'];
  // 特殊机场规则键 ↔ 引擎机场类别
  const RULE_CAT = { LXA: 'LHASA', LJG: 'HIGH', KMG: 'PLATEAU' };
  const CAT_RULE = {}; Object.keys(RULE_CAT).forEach(k => CAT_RULE[RULE_CAT[k]] = k);
  const SAR = (RC && RC.special_airport_rules) || {};
  function sarOf(cat) { const k = CAT_RULE[cat] || cat; return SAR[k] ? Object.assign({ key: k }, SAR[k]) : null; }
  const ageOf = p => p && (p.age != null ? +p.age : p.birthYear ? YEAR - (+p.birthYear) : null);

  function seatOK(L, R) {
    if (!isCaptClass(L)) return false;
    if (L === 'SPIC') return SPIC_EXCL.includes('SPIC') ? false : isInstr(R); // RE12：SPIC 不作为责任机长（左座）
    const mx = RC && RC.cruise_pairing_matrix && RC.cruise_pairing_matrix.by_captain_level[capKey(L)];
    if (mx) return isCaptClass(R) || (isFO(R) && RANK_VAL[R] >= fNum(mx.min_fo));
    if (isInstr(L)) return true;
    if (['US', 'J0', 'J1', '机长A', '机长B'].includes(L)) return isCaptClass(R) || (isFO(R) && RANK_VAL[R] >= 4);
    if (['J2', 'J3'].includes(L)) return isCaptClass(R) || (isFO(R) && RANK_VAL[R] >= 3);
    return false;
  }

  // ---------- 机场 ----------
  // cat: LHASA / HIGH / PLATEAU / ZBCF / J1 / US / NONE ; auth=需授权
  // 基础表 + sample-data 扩展（天府/疆内/东北等）；勿把真实 xlsx 提交仓库
  const AIRPORTS_BASE = {
    ZUUU: ['成都双流', 30.58, 103.95], ZUTF: ['成都天府', 30.31, 104.44], ZSLD: ['龙岩', 25.68, 116.75],
    ZBAA: ['北京', 40.08, 116.58], ZBAD: ['北京大兴', 39.51, 116.41],
    ZSPD: ['上海浦东', 31.14, 121.8], ZSSS: ['上海虹桥', 31.2, 121.34],
    ZGGG: ['广州', 23.39, 113.3], ZGSZ: ['深圳', 22.64, 113.81], ZGHA: ['长沙', 28.19, 113.22],
    ZJSY: ['三亚', 18.3, 109.41], ZJHK: ['海口', 19.93, 110.46], ZSHC: ['杭州', 30.23, 120.43],
    ZSNJ: ['南京', 31.74, 118.86], ZHHH: ['武汉', 30.78, 114.21], ZLXY: ['西安', 34.45, 108.75],
    ZWWW: ['乌鲁木齐', 43.9, 87.47], ZYHB: ['哈尔滨', 45.62, 126.25], ZSQD: ['青岛', 36.36, 120.09],
    ZSAM: ['厦门', 24.54, 118.13], ZPPP: ['昆明', 25.1, 102.93, 'PLATEAU'], ZGNN: ['南宁', 22.61, 108.17],
    ZBYN: ['太原', 37.75, 112.63], ZHCC: ['郑州', 34.52, 113.84], ZSJN: ['济南', 36.86, 117.22],
    ZGOW: ['揭阳', 23.55, 116.5], ZSFZ: ['福州', 25.93, 119.66], ZLLL: ['兰州', 36.52, 103.62],
    ZBHH: ['呼和浩特', 40.85, 111.82], ZUGY: ['贵阳', 26.54, 106.8], ZYYJ: ['延吉', 42.88, 129.45],
    ZYTX: ['沈阳', 41.64, 123.48], ZSWX: ['无锡', 31.49, 120.43],
    ZULS: ['拉萨', 29.3, 90.91, 'LHASA'], ZPLJ: ['丽江', 26.68, 100.25, 'HIGH'], ZPJH: ['西双版纳', 21.97, 100.76, 'HIGH'],
    ZUXC: ['西昌', 27.99, 102.18, 'HIGH'], ZLXN: ['西宁', 36.53, 102.04, 'HIGH'], ZYTL: ['大连', 38.97, 121.54, 'HIGH'],
    ZPDQ: ['迪庆', 27.79, 99.68, 'PLATEAU'], ZUDC: ['稻城亚丁', 29.32, 100.05, 'PLATEAU'], ZUJZ: ['九寨', 32.85, 103.68, 'PLATEAU'],
    ZBCF: ['赤峰', 42.24, 118.91, 'ZBCF'], ZWKM: ['克拉玛依', 45.47, 84.95, 'J1'], ZUMT: ['茅台', 27.81, 106.33, 'US'],
    ZBLL: ['吕梁', 37.68, 111.14, 'US'], ZBXZ: ['忻州', 38.6, 112.97, 'US'],
  };
  const AIRPORTS = Object.assign({}, AIRPORTS_BASE, SD.SAMPLE_AIRPORTS || {});
  // 配置驱动：special_airport_rules 的机场名/同组成员 → 机场类别（含昆明 KMG 新增为一般高原）
  Object.keys(SAR).forEach(k => { const cat = RULE_CAT[k] || k; const ru = SAR[k];
    const names = [String(ru.name || '').split('(')[0]].concat(ru.group_members || []);
    Object.keys(AIRPORTS).forEach(c => { const a = AIRPORTS[c]; if (a && names.includes(a[0])) { AIRPORTS[c] = a.slice(0, 3).concat([cat]); } }); });
  // 机场分类清单（一/二/三/四类、复杂）：界面标签
  const CLASS_LABEL = { class_1_high_plateau: '一类·高高原', class_2: '二类', class_3: '三类', class_4: '四类', complex_airport: '复杂' };
  function apClass(c, st) { const nm = apName(c, st); const L = (RC && RC.airport_category_list) || {};
    for (const fl of ['A320', 'ARJ21']) { const g = L[fl] || {}; for (const k of Object.keys(CLASS_LABEL)) if ((g[k] || []).includes(nm)) return { key: k, label: CLASS_LABEL[k], fleet: fl }; }
    return null; }
  const CAT_DESC = {
    LHASA: '拉萨（一类·高高原）：双机长（J3/教员 + J3+）+ 副驾驶，均需资质', HIGH: '高原/复杂机场：J2/J3+F6以上，或教员+F5以上',
    PLATEAU: '一般高原（昆明等）：J2/J3+F5以上，或教员+F4以上', ZBCF: '赤峰：J2/J3/教员 + F4以上',
    J1: '克拉玛依：左座 J1 及以上', US: '茅台/吕梁/忻州：左座 US 及以上', NONE: '无特殊要求' };
  const AUTH_CATS = ['LHASA', 'HIGH', 'PLATEAU', 'ZBCF'];
  function apName(c, st) { const a = (st && st.airports && st.airports[c]) || AIRPORTS[c]; return a ? a[0] : c; }
  function apCat(c, st) { const a = (st && st.airports && st.airports[c]) || AIRPORTS[c]; return (a && a[3]) || 'NONE'; }
  const needsAuth = (c, st) => AUTH_CATS.includes(apCat(c, st));
  const isSpecial = (c, st) => apCat(c, st) !== 'NONE';

  // 特殊机场座位规则（L 左座, R 右座）
  function catOK(cat, L, R) {
    const ru = sarOf(cat);
    if (ru) { // RE12 第六节 + 手册17章（配置驱动）
      if (!(ru.captain_levels || []).includes(capKey(L))) return false;
      if (isCaptClass(R)) return !ru.second_pilot_min || capLv(R) >= CAPT_ORDER.indexOf(ru.second_pilot_min);
      if (ru.second_pilot_min && EO.lxa_double_captain !== false && !EO.lxa_fallback_fo_min_single_captain) return false;
      const mn = ru.fo_min_by_captain ? ru.fo_min_by_captain[capKey(L)] : ru.fo_min;
      return !mn || (isFO(R) && RANK_VAL[R] >= fNum(mn));
    }
    switch (cat) {
      case 'LHASA': return isJ3plus(L) && isJ3plus(R);
      case 'HIGH': return (isJ2plus(L) && !isInstr(L) && foLevel(R) >= 6) || (isInstr(L) && foLevel(R) >= 5);
      case 'PLATEAU': return (isJ2plus(L) && !isInstr(L) && foLevel(R) >= 5) || (isInstr(L) && foLevel(R) >= 4);
      case 'ZBCF': return isJ2plus(L) && foLevel(R) >= 4;
      case 'J1': return isJ1plus(L);
      case 'US': return isCaptClass(L) && L !== 'SPIC';
      default: return true;
    }
  }

  // ---------- 随机 ----------
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function blockMin(a, b) {
    const A = AIRPORTS[a], B = AIRPORTS[b];
    const R = 6371, toR = Math.PI / 180;
    const d = 2 * R * Math.asin(Math.sqrt(Math.sin((B[1] - A[1]) * toR / 2) ** 2 + Math.cos(A[1] * toR) * Math.cos(B[1] * toR) * Math.sin((B[2] - A[2]) * toR / 2) ** 2));
    return Math.round((d * 1.1 / 12.5 + 28) / 5) * 5;
  }

  // ---------- 示例数据 ----------
  const SUR = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方邹熊白孟秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤';
  // 示例化名一律用复姓（与真实花名册零交集；离线 name_map 校验见 test/names.test.js）。opt.nameBlock 可再传入离线屏蔽集合。
  const ALIAS_SUR = ['欧阳', '上官', '诸葛', '东方', '皇甫', '尉迟', '慕容', '司徒', '夏侯', '轩辕', '令狐', '钟离', '端木', '百里', '南宫', '西门', '独孤', '澹台', '公冶', '申屠', '闻人', '万俟', '呼延', '拓跋', '赫连'];
  const GIV = ['伟', '强', '磊', '军', '勇', '杰', '涛', '斌', '超', '明', '刚', '平', '辉', '鹏', '华', '飞', '鑫', '波', '宇', '浩', '凯', '健', '俊', '帆', '帅', '旭', '宁', '龙', '林', '阳', '洋', '翔', '峰', '晨', '博', '昊', '睿', '航', '子轩', '一鸣', '志强', '建国', '海涛', '天佑', '思远', '浩然', '俊杰', '晓东', '文博', '明轩', '雨辰', '嘉豪', '国栋', '振宇', '立新', '云飞', '少华', '春雷', '晓峰', '子豪', '静', '婷', '丹', '雪', '琳'];

  function defaultFdpTable() {
    return [ { from: 0, to: 5, label: '00:00–04:59', lim: [12, 11, 10, 9] },
             { from: 5, to: 12, label: '05:00–11:59', lim: [14, 13, 12, 11] },
             { from: 12, to: 24, label: '12:00–23:59', lim: [13, 12, 11, 10] } ];
  }
  // CCAR-121-R8（交通运输部令2024年第7号）P章 数值常量；条款出处见 回测/121回测报告.md
  const CCAR121 = { rev: 'R8', monthFlightH: 100, yearFlightH: 900, sevenDayFdpH: 60, monthFdpH: 210, minRestBeforeFdpH: 10, augFlightH3: 13, augFlightH4: 17,
    tableA: [ { from: 0, to: 5, h: 8 }, { from: 5, to: 20, h: 9 }, { from: 20, to: 24, h: 8 } ] };
  // 公司手册 EU.COM（A3）核实值；出处见 回测/公司手册回测报告.md。月飞行公司=法规=100h；hardMaxHours 默认对齐 100h（用户拍板 2026-10-16）。
  const COM = { rev: 'EU.COM-Re07-06', re12: 'RE12-2026-09-11', monthFlightH: 100, yearFlightH: 900, sevenDayFdpH: 60, monthFdpH: 210, minRestBeforeFdpH: 10,
    reportMinDomesticFlight: 95, reportMinIntlFlight: 115, restAfterShutdownMin: 40, restBeforeNextReportMin: 25 };
  // 表A：非扩编机组一个飞行值勤期内最大飞行时间（按报到时刻，北京时间）；扩编3人=13h（121.483(a)(2)）
  function flightLimitMin(st, reportMin) {
    // 三人制运行：不启用扩编表A例外（即使用户旧存档曾打开 fdpAugmented）
    const h = (((reportMin % DAY) + DAY) % DAY) / 60; const r = CCAR121.tableA.find(x => h >= x.from && h < x.to) || CCAR121.tableA[2]; return r.h * 60;
  }
  function defaultSettings() {
    return { minRestH: 12, hardMaxHours: 100, maxOffCapt: 999, maxOffFO: 7,
      bpTesterAirports: ['ZLXY', 'ZWWW'], reportMin: 95, releaseMin: 30, honorPrefs: true,
      standbyPerDay: 1, maxStandbyPerPilot: 1, gapWeight: 0.45, softTargetMin: 40, softTargetMax: 60,
      opsDayWindowH: 14, // 飞机日可用窗口（利用率分母）
      // 飞行值勤期（FDP）限制：默认值参考 CCAR-121 部（非扩编机组 表A），可按公司规定修改
      fdpTable: defaultFdpTable(), fdpAugmented: false, fdpAugLimitH: 16, fdpRiskHigh: 60, fdpRiskMed: 120, minTurnMin: 35, minOvernightRestH: 10,
      // 路演：默认关闭故意植入的【演示异常】；开启时最多植入 1 项
      demoAnomalies: false,
      // 自动填人后故意留下的易补空洞数（便于现场演示补位）
      demoHoles: 4 };
  }

  // 旧版字段迁移：testerAirports（误称“酒测/血压测试员”）→ bpTesterAirports（始发站须配备血压测试仪）
  function migrateSettings(S) {
    if (S && S.testerAirports) { S.bpTesterAirports = S.testerAirports; delete S.testerAirports; }
    // 旧版备份参数（连续空闲插备份 + 每日 2+3 人池）→ 每日 1 人、每人每月至多 1 天
    if (S && ('standbyCapt' in S || 'standbyFO' in S || 'maxFreeRun' in S)) { delete S.standbyCapt; delete S.standbyFO; delete S.maxFreeRun; S.standbyPerDay = 1; S.maxStandbyPerPilot = 1; }
    // 取消 30–70h 目标范围；月上限默认对齐公司/法规 100h；三人制禁用扩编
    if (S) {
      delete S.minHours; delete S.maxHours; if (!S.fdpTable) S.fdpTable = defaultFdpTable();
      if (S.hardMaxHours === 90) S.hardMaxHours = 100;
      S.fdpAugmented = false;
      if (S.demoAnomalies == null) S.demoAnomalies = false;
      if (S.demoHoles == null) S.demoHoles = 4;
      if (S.maxOffCapt != null && S.maxOffCapt <= 4) S.maxOffCapt = 999; // 取消机长类每日休息上限
    }
    return S;
  }

  function defaultHealth() {
    return { noFly: false, noPlateau: false, noNight: false, maxMonthH: null, noSoleCaptain: false, bpNote: '', medExamExpiry: '', note: '' };
  }
  function authAirports(st) {
    const A = (st && st.airports) || AIRPORTS;
    return Object.keys(A).filter(c => AUTH_CATS.includes((A[c] && A[c][3]) || 'NONE')).sort((a, b) => apName(a, st).localeCompare(apName(b, st), 'zh'));
  }
  function levelAirports(st) {
    const A = (st && st.airports) || AIRPORTS;
    return Object.keys(A).filter(c => ['J1', 'US'].includes((A[c] && A[c][3]) || '')).sort();
  }
  function healthFlags(h) {
    h = h || {}; const f = [];
    if (h.noFly) f.push('暂时不适飞');
    if (h.noPlateau) f.push('限制高原');
    if (h.noNight) f.push('限制夜间');
    if (h.maxMonthH != null && h.maxMonthH > 0) f.push('月≤' + h.maxMonthH + 'h');
    if (h.noSoleCaptain) f.push('非唯一机长');
    if (h.bpNote) f.push('血压备注');
    if (h.medExamExpiry) f.push('体检' + h.medExamExpiry);
    const flagged = h.noFly || h.noPlateau || h.noNight || h.noSoleCaptain || (h.maxMonthH != null && h.maxMonthH > 0);
    if (h.note && !flagged) f.push('有备注');
    return f;
  }
  function hasHealthRestriction(h) {
    h = h || {};
    return !!(h.noFly || h.noPlateau || h.noNight || h.noSoleCaptain || (h.maxMonthH != null && h.maxMonthH > 0)
      || (h.bpNote && h.bpNote.trim()) || (h.medExamExpiry && h.medExamExpiry.trim()) || (h.note && h.note.trim()));
  }
  function isPlateauAirport(c, st) { return ['LHASA', 'HIGH', 'PLATEAU'].includes(apCat(c, st)); }
  function migratePilots(st) {
    if (!st || !st.pilots) return st;
    const legacy = { '一大队': '空客一中队', '二大队': '空客二中队', '三大队': '空客三中队', '教学中队': '空客一中队' };
    st.pilots.forEach((p, i) => {
      if (!p.health) p.health = defaultHealth();
      else p.health = Object.assign(defaultHealth(), p.health);
      if (p.squad && legacy[p.squad]) p.squad = legacy[p.squad];
      if (!p.squad) p.squad = ALL_SQUADS[i % ALL_SQUADS.length];
      if (!p.fleet) p.fleet = SQUADS_C909.includes(p.squad) ? 'C909' : 'A320';
      if (!Array.isArray(p.auth)) p.auth = [];
    });
    return st;
  }
  function healthBlocks(p, pr, st, opt) {
    opt = opt || {};
    const h = p.health || {}; const rs = [];
    if (h.noFly) rs.push('暂时不适飞');
    if (h.noPlateau && pr.legs.some(l => isPlateauAirport(l.from, st) || isPlateauAirport(l.to, st))) rs.push('限制高原（任务含高原/拉萨类机场）');
    if (h.noNight && pr.legs.some(isNightLeg)) rs.push('限制夜间（任务含夜航段）');
    // 体检合格证「不能作为唯一机长」：禁止担任 C 位（唯一人机长席）；可任 F/T
    if (h.noSoleCaptain && opt.slot === 'C') rs.push('不能作为唯一机长（禁止担任C位）');
    if (h.medExamExpiry) {
      const exp = new Date(h.medExamExpiry + 'T23:59:59');
      if (!isNaN(exp)) {
        const touch = daysTouched(pr, st).map(d => new Date(YEAR, MONTH - 1, d));
        if (touch.some(t => t > exp)) rs.push('体检已过期(' + h.medExamExpiry + ')');
      }
    }
    return rs;
  }


  // 体检合格证特殊运行限制 · 匿名演示样本（约 50 人；不含真实姓名）
  // 类型：月≤60h / 非唯一机长 / 禁夜 及其组合（与源表类型一致，姓名已抹除）
  function medRestrictionNote(h) {
    const parts = [];
    if (h.maxMonthH) parts.push('每月飞行时间不超过' + h.maxMonthH + '小时');
    if (h.noSoleCaptain) parts.push('不能作为唯一机长在航空器上行使职责');
    if (h.noNight) parts.push('禁止夜间飞行');
    return parts.join('，');
  }
  function medRestrictionSeed() {
    // 扩至约 50：保持原类型比例并追加同类组合
    const specs = [
      { maxMonthH: 60 }, { maxMonthH: 60 },
      { maxMonthH: 60, noSoleCaptain: true }, { maxMonthH: 60, noSoleCaptain: true }, { maxMonthH: 60, noSoleCaptain: true },
      { noSoleCaptain: true },
      { noSoleCaptain: true }, { noSoleCaptain: true }, { noSoleCaptain: true }, { noSoleCaptain: true },
      { noSoleCaptain: true }, { noSoleCaptain: true },
      { maxMonthH: 60, noSoleCaptain: true },
      { noSoleCaptain: true }, { noSoleCaptain: true },
      { maxMonthH: 60 },
      { noSoleCaptain: true },
      { maxMonthH: 60 },
      { maxMonthH: 60, noSoleCaptain: true, noNight: true },
      { noSoleCaptain: true },
      { maxMonthH: 60 },
      { noSoleCaptain: true },
      { maxMonthH: 60, noSoleCaptain: true },
      { noSoleCaptain: true },
      { maxMonthH: 60 },
      { noSoleCaptain: true },
      // ---- expand to ~50 ----
      { maxMonthH: 60 }, { maxMonthH: 60 }, { maxMonthH: 60 },
      { noSoleCaptain: true }, { noSoleCaptain: true }, { noSoleCaptain: true }, { noSoleCaptain: true },
      { noSoleCaptain: true }, { noSoleCaptain: true }, { noSoleCaptain: true },
      { maxMonthH: 60, noSoleCaptain: true }, { maxMonthH: 60, noSoleCaptain: true },
      { maxMonthH: 60, noSoleCaptain: true }, { maxMonthH: 60, noSoleCaptain: true },
      { maxMonthH: 60 }, { maxMonthH: 60 },
      { noSoleCaptain: true }, { noSoleCaptain: true },
      { maxMonthH: 60, noSoleCaptain: true, noNight: true },
      { noSoleCaptain: true }, { maxMonthH: 60 },
      { noSoleCaptain: true }, { maxMonthH: 60, noSoleCaptain: true },
      { maxMonthH: 60 }
    ];
    const captRanks = ['J3', 'J2', 'J1', 'J3', 'US', 'J2', 'J3', '机长A', 'J1', 'J2', 'J3', 'US', 'J2', 'J3', 'J1', 'J2', 'J3', '机长B', 'J2'];
    const foRanks = ['F7', 'F6', 'F5', 'F8', 'F4', 'F6', 'F7', 'F5', 'F4', 'F3'];
    let ci = 0, fi = 0;
    const specialAll = Object.keys(AIRPORTS).filter(c => AUTH_CATS.includes(AIRPORTS[c][3]));
    return specs.map((spec, i) => {
      const n = i + 1;
      const needCapt = !!spec.noSoleCaptain;
      const rank = needCapt ? captRanks[ci++ % captRanks.length] : foRanks[fi++ % foRanks.length];
      const health = Object.assign(defaultHealth(), spec, { note: medRestrictionNote(spec) });
      let auth = [];
      if (isInstr(rank) || rank === 'J3') auth = specialAll.slice();
      else if (['J2', 'J1', 'SPIC', 'US', 'J0', '机长A', '机长B'].includes(rank)) auth = [];
      else if (RANK_VAL[rank] >= 6) auth = specialAll.slice();
      else if (RANK_VAL[rank] >= 4) auth = specialAll.filter(c => c === 'ZULS' || AIRPORTS[c][3] === 'PLATEAU' || AIRPORTS[c][3] === 'ZBCF');
      const squad = ALL_SQUADS[i % ALL_SQUADS.length];
      return {
        id: 'MED' + String(n).padStart(2, '0'),
        name: '限-' + String(n).padStart(2, '0'),
        rank, auth, prefs: [], leave: [],
        squad,
        fleet: SQUADS_C909.includes(squad) ? 'C909' : 'A320',
        health
      };
    });
  }

  // 按级别分配特殊机场授权（用户 2026-10-20）
  function assignAuthForRank(rk, r, specialAll, byCat) {
    if (isInstr(rk) || rk === 'J3') return specialAll.slice();
    if (['J2', 'J1', 'SPIC', 'US', 'J0', '机长A', '机长B'].includes(rk)) return [];
    const v = RANK_VAL[rk];
    if (v >= 6) { // F7/F6：一般全特殊；少数留洞
      if (r() < 0.12) {
        const miss = specialAll.filter(() => r() < 0.35);
        return specialAll.filter(c => !miss.includes(c));
      }
      return specialAll.slice();
    }
    if (v >= 4) { // F5/F4：必有拉萨；多数再带高原/赤峰；少数缺个别
      let auth = ['ZULS'];
      byCat('PLATEAU').forEach(c => { if (r() < 0.75) auth.push(c); });
      byCat('ZBCF').forEach(c => { if (r() < 0.7) auth.push(c); });
      byCat('HIGH').forEach(c => { if (r() < 0.35) auth.push(c); });
      if (r() < 0.1) auth = auth.filter(c => c === 'ZULS' || r() < 0.5); // 少数缺洞
      return [...new Set(auth)];
    }
    // F3 及以下：基本无授权，极少数高原洞填
    if (v >= 3 && r() < 0.15) return byCat('PLATEAU').filter(() => r() < 0.5);
    return [];
  }

  // 每中队级别编制（约 100 人；比例参考一中队名单）
  function squadronRankMix() {
    return [
      ['TC', 1], ['TB', 2], ['TL', 3], ['J3', 16],
      ['SPIC', 1], ['US', 2], ['J0', 1], ['机长A', 2], ['机长B', 2],
      ['F8', 2], ['F7', 14], ['F6', 12], ['F5', 12], ['F4', 9], ['F3', 15], ['F2', 2], ['F1', 1]
    ]; // ≈97
  }

  function generateSample(seed, opt) {
    opt = opt || {};
    const r = rng(seed || 20261101);
    const pick = a => a[Math.floor(r() * a.length)];
    const specialAll = Object.keys(AIRPORTS).filter(c => AUTH_CATS.includes((AIRPORTS[c] && AIRPORTS[c][3]) || 'NONE'));
    const byCat = c => specialAll.filter(x => AIRPORTS[x][3] === c);
    const used = new Set(); const pilots = []; let no = 10230;
    const mix = squadronRankMix();

    ALL_SQUADS.forEach((squad, si) => {
      const fleet = SQUADS_C909.includes(squad) ? 'C909' : 'A320';
      mix.forEach(([rk, n]) => {
        for (let i = 0; i < n; i++) {
          let nm; do { nm = pick(ALIAS_SUR) + pick(GIV); } while (used.has(nm) || (opt.nameBlock && opt.nameBlock.has(nm))); used.add(nm);
          no += 1 + Math.floor(r() * 17);
          const auth = assignAuthForRank(rk, r, specialAll, byCat);
          // 每中队：确保 F4/F5 拉萨授权充足（再补一次）
          if ((rk === 'F4' || rk === 'F5') && !auth.includes('ZULS')) auth.push('ZULS');
          pilots.push({ id: 'E' + no, name: nm, rank: rk, auth, prefs: [], leave: [], squad, fleet, health: defaultHealth() });
        }
      });
      // 每中队留 2–4 名副驾缺部分授权（洞填演示）
      const fos = pilots.filter(p => p.squad === squad && isFO(p.rank) && RANK_VAL[p.rank] >= 4);
      const holeN = 2 + Math.floor(r() * 3);
      for (let h = 0; h < holeN && fos.length; h++) {
        const p = fos[Math.floor(r() * fos.length)];
        if (p.auth.length > 1) p.auth = p.auth.filter((c, idx) => idx === 0 || r() < 0.4);
      }
    });

    // 请假（少量）+ 意向休息日
    const S = defaultSettings();
    const offCount = { C: Array(DAYS + 1).fill(0), F: Array(DAYS + 1).fill(0) };
    const lim = p => isFO(p.rank) ? S.maxOffFO : S.maxOffCapt; const key = p => isFO(p.rank) ? 'F' : 'C';
    const leaveP = pilots.filter(() => r() < 0.04);
    leaveP.forEach(p => { const s = 1 + Math.floor(r() * 25), n = 3 + Math.floor(r() * 3);
      for (let d = s; d < s + n && d <= DAYS; d++) if (offCount[key(p)][d] < lim(p)) { p.leave.push(d); offCount[key(p)][d]++; } });
    pilots.forEach(p => { let tries = 0; while (p.prefs.length < 2 && tries++ < 50) {
      const d = 1 + Math.floor(r() * DAYS);
      if (p.prefs.includes(d) || p.leave.includes(d) || offCount[key(p)][d] >= lim(p)) continue;
      p.prefs.push(d); offCount[key(p)][d]++; } p.prefs.sort((a, b) => a - b); });

    // 任务：由真实完整日机径模板铺到整月（SAMPLE_META 机号；缺路径的机号克隆同机型模板）
    const pairings = buildPairingsFromWeek(r, opt);
    assignAircraftRegs(pairings);

    // 少量演示用健康限制（不消耗 RNG 语义；固定下标）
    const H = [
      { i: 4, h: { noPlateau: true, note: '高原机场暂不适任（演示）' } },
      { i: 9, h: { noNight: true, bpNote: '血压偏高随访中', note: '限制夜航（演示）' } },
      { i: 14, h: { noFly: true, medExamExpiry: '2026-10-20', note: '体检复查前不适飞（演示）' } },
      { i: 19, h: { medExamExpiry: '2026-11-05', bpNote: '须携带血压记录本' } },
      { i: 24, h: { noPlateau: true, noNight: true, note: '综合健康限制（演示）' } }
    ];
    H.forEach(({ i, h }) => { if (pilots[i]) pilots[i].health = Object.assign(defaultHealth(), h); });
    medRestrictionSeed().forEach(p => pilots.push(p));
    stripLhasaBelowJ3({ pilots });
    return { version: 1, sample: true, sampleSchema: 16, settings: S, pilots, pairings, fills: [],
      demoAnomaliesApplied: false, demoAnomalies: [], demoHolesApplied: false, demoHoles: [],
      sampleMeta: SAMPLE_META };
  }

  function weekdayJS(y, m, d) { // Mon=0..Sun=6 matching sample-data
    const dt = new Date(y, m - 1, d);
    return (dt.getDay() + 6) % 7;
  }
  // ---------------- 轻量版（lite/）：单中队 ~100 人，任务量按人均 12–14 值勤日裁剪 ----------------
  function liteRankMix() {
    // 七中队·演示实际编制（化名）；保留函数供测试/文档
    if (LR && LR.length) {
      const m = {}; LR.forEach(p => { m[p.rank] = (m[p.rank] || 0) + 1; });
      return Object.keys(m).sort().map(rk => [rk, m[rk]]);
    }
    return [['TC', 2], ['TB', 4], ['TL', 8], ['J3', 15], ['机长A', 2], ['机长B', 3], ['SPIC', 1], ['US', 1],
      ['F8', 1], ['F7', 16], ['F6', 12], ['F5', 5], ['F4', 15], ['F3', 15], ['F1', 1]];
  }

  // ---------- 外中队候补飞行员（化名，非真实人员）：按七中队职级比例补充机长/副驾驶 ----------
  // 拉萨资质只能由 J3 及以上（含 TL/TB/TC 教员）持有
  function lhasaRankOK(rank) { return INSTR.includes(rank) || CAPT_ORDER.indexOf(rank) >= CAPT_ORDER.indexOf('J3'); }
  function stripLhasaBelowJ3(st) { let n = 0; st.pilots.forEach(p => { if (!lhasaRankOK(p.rank) && (p.auth || []).some(c => apCat(c, st) === 'LHASA')) { p.auth = p.auth.filter(c => apCat(c, st) !== 'LHASA'); n++; } }); return n; }
  function addReservePilots(st, nC, nF, seed) {
    const r = rng(seed || 909); const own = st.pilots.filter(p => !p.reserve);
    const SUR = '安柏常戴范方甘古韩郝贺洪华纪江金康柯孔雷黎廉梁林凌柳龙鲁陆罗吕马孟莫倪宁欧潘庞裴彭蒲齐秦邱任阮尚邵沈盛石舒宋苏谈汤唐陶田童万汪韦温文翁巫吴伍夏项萧谢辛熊徐许薛严颜晏燕阳姚叶易殷尹应于余俞虞袁岳云詹章甄钟周朱庄卓邹';
    const GIV = '安邦博昌辰诚川丹东方飞峰钢冠光浩昊航和弘鸿华辉吉佳嘉建江杰金晋靖君凯康朗磊林霖龙鹏琦谦强清然锐森山尚晟树舒顺松涛腾天亭庭伟文翔骁晓欣新星旭轩阳一屹毅永宇羽元远岳越云泽哲振征志舟卓梓';
    const used = new Set(st.pilots.map(p => p.name)); const nm = () => { for (let k = 0; k < 500; k++) { const s = SUR[Math.floor(r() * SUR.length)] + GIV[Math.floor(r() * GIV.length)] + (r() < 0.5 ? GIV[Math.floor(r() * GIV.length)] : ''); if (!used.has(s)) { used.add(s); return s; } } return '候补' + used.size; };
    const capt = own.filter(p => isCaptClass(p.rank)), fo = own.filter(p => isFO(p.rank));
    const out = []; let seq = (st.pilots.filter(p => p.reserve).length) + 1;
    const mk = (tpl) => { const p = JSON.parse(JSON.stringify(tpl)); p.id = 'R9' + String(seq++).padStart(4, '0'); p.name = nm(); p.squad = '外中队候补·演示'; p.reserve = true; p.prefs = []; p.leave = []; p.health = defaultHealth(); delete p.traineeCapt; delete p.requalCapt; delete p.qualNotes; out.push(p); return p; };
    const plat = Object.keys(AIRPORTS).filter(c => ['LHASA', 'HIGH', 'PLATEAU'].includes(apCat(c)));
    for (let i = 0; i < nC; i++) { const q = mk(capt[(i * 7 + 3) % capt.length]); // 外中队候补机长：全部具备拉萨/高原资质（拉萨须 J3+ 或教员）
      if (lhasaRankOK(q.rank)) { q.auth = [...new Set([...(q.auth || []), ...plat])]; q.lhasaFull = true; } else q.auth = (q.auth || []).filter(c => apCat(c) !== 'LHASA'); }
    for (let i = 0; i < nF; i++) mk(fo[(i * 5 + 1) % fo.length]);
    st.pilots.push(...out); return out;
  }

  const LITE_RESERVES = [20, 20];
  function generateLiteSample(seed, opt) {
    opt = opt || {};
    const r = rng(seed || 20261101);
    if (!LR || !LR.length) throw new Error('lite roster missing');
    // 化名人员固定；prefs/leave/health 仍按种子轻扰，保证无人不适飞
    const pilots = LR.map(src => {
      const p = {
        id: src.id, name: src.name, rank: src.rank, auth: (src.auth || []).slice(),
        prefs: [], leave: [], squad: src.squad || '七中队·演示', fleet: src.fleet || 'A320',
        health: defaultHealth()
      };
      if (src.rnpAuth && src.rnpAuth.length) p.rnpAuth = src.rnpAuth.slice();
      if (src.qualNotes && src.qualNotes.length) p.qualNotes = src.qualNotes.slice();
      if (src.traineeCapt) p.traineeCapt = true;
      if (src.requalCapt) p.requalCapt = true;
      // 不可跳级（airport_category_list.qualification_note）：持一/二类资质者补全昆明(三类)资质——演示补全（非实飞台账）
      const hi = p.auth.some(c => ['LHASA', 'HIGH', 'ZBCF'].includes(apCat(c)));
      Object.keys(AIRPORTS).filter(c => apCat(c) === 'PLATEAU' && AIRPORTS[c][0] === '昆明').forEach(c => { if (hi && !p.auth.includes(c)) { p.auth.push(c); (p.authDemo = p.authDemo || []).push(c); } });
      return p;
    });
    const S = defaultSettings();
    S.demoHoles = 3; // 已有少量结构性空洞时，总数仍落在 3–5
    // 少量请假（2 人·3 天，按种子选下标）+ 每人 ≤2 个意向休息日
    const leaveIdx = [Math.floor(r() * pilots.length), Math.floor(r() * pilots.length)];
    leaveIdx.forEach((i, k) => { const s0 = 6 + k * 11; for (let d = s0; d < s0 + 3 && d <= DAYS; d++) if (!pilots[i].leave.includes(d)) pilots[i].leave.push(d); });
    pilots.forEach(p => { let t = 0; while (p.prefs.length < 2 && t++ < 50) { const d = 1 + Math.floor(r() * DAYS);
      if (!p.prefs.includes(d) && !p.leave.includes(d)) p.prefs.push(d); } p.prefs.sort((a, b) => a - b); });
    // 少量软性健康限制（不停飞）
    const hi = [Math.floor(r() * pilots.length), Math.floor(r() * pilots.length), Math.floor(r() * pilots.length)];
    const H = [
      { noPlateau: true, note: '高原机场暂不适任（演示）' },
      { noNight: true, bpNote: '血压偏高随访中', note: '限制夜航（演示）' },
      { medExamExpiry: '2026-11-20', bpNote: '须携带血压记录本' }
    ];
    H.forEach((h, k) => { pilots[hi[k]].health = Object.assign(defaultHealth(), h); });
    // 任务量：人均 ~12.3 值勤日；拉萨占比高的机号后置
    const all = buildPairingsFromWeek(r, { maxPairings: 1800 }).filter(p => p.ac !== 'C909');
    const byReg = {}; all.forEach(p => { const g = p.legs[0].reg; (byReg[g] = byReg[g] || []).push(p); });
    const spShare = g => { let a = 0, b = 0; byReg[g].forEach(p => { a += p.ndays; if (p.legs.some(l => isSpecial(l.from) || isSpecial(l.to))) b += p.ndays; }); return b / Math.max(1, a); };
    const regs = Object.keys(byReg).sort((x, y) => (spShare(x) > 0.6) - (spShare(y) > 0.6) || x.localeCompare(y));
    const RESV = opt.reserves === false ? [0, 0] : (opt.reserves || LITE_RESERVES); // 候补按 ~90% 出勤折算进需求，保持余量约 20–30%
    const want = Math.round((pilots.length + 0.9 * (RESV[0] + RESV[1])) * (opt.dutyDays || 12.3) / 3 * (opt.load || 1));
    const chosen = []; let pd = 0;
    for (const g of regs) {
      for (const p of byReg[g].sort((a, b) => a.start - b.start || (a.dutySlot || 0) - (b.dutySlot || 0))) {
        if (pd >= want) break; chosen.push(p); pd += p.ndays;
      }
      if (pd >= want) break;
    }
    chosen.sort((a, b) => a.legs[0].dep - b.legs[0].dep);
    chosen.forEach((p, i) => { p.id = 'PR' + String(i + 1).padStart(3, '0'); });
    const out = { version: 1, sample: true, lite: true, sampleSchema: 16, settings: S, pilots, pairings: chosen, fills: [],
      demoAnomaliesApplied: false, demoAnomalies: [], demoHolesApplied: false, demoHoles: [], sampleMeta: SAMPLE_META };
    // 外中队候补（化名）：按 9 月真实航段回测，+20 机长类 +20 副驾驶 → 0 供给性空缺、余量约 28%
    const RES = opt.reserves === false ? [0, 0] : (opt.reserves || LITE_RESERVES); if (RES[0] || RES[1]) addReservePilots(out, RES[0], RES[1], 909); stripLhasaBelowJ3(out);
    return out;
  }



  // 值勤连续性：每日从成都(ZUUU/ZUTF)始发并返回（少数外站过夜例外）；任务最终回基地。
  // 优先裁剪到基地起降；无法裁剪则改为短程基地往返；插入回程时控制日飞行≤7.5h。
  function ensurePairingContinuity(pairings, r) {
    const BASE = { ZUUU: 1, ZUTF: 1 };
    const pickBase = () => (r() < 0.72 ? 'ZUTF' : 'ZUUU');
    const DESTS = Object.keys(AIRPORTS).filter(c => !BASE[c] && AIRPORTS[c] && (AIRPORTS[c][3] || 'NONE') === 'NONE');
    // 近程目的地优先（块时短），避免回程撑爆表A
    const NEAR = DESTS.map(c => [c, Math.min(blockMin('ZUTF', c) || 999, blockMin('ZUUU', c) || 999)]).filter(x => x[1] <= 150).map(x => x[0]);
    let seq = 6800 + Math.floor(r() * 200);
    function synthFlt() { seq += 1 + Math.floor(r() * 13); return 'EU' + String(seq % 10000).padStart(4, '0'); }
    function makeLeg(from, to, dep, ac, reg, d) {
      const bm = Math.max(40, blockMin(from, to) || 80);
      return { d: d, flt: synthFlt(), from: from, to: to, dep: dep, arr: dep + bm, ac: ac, reg: reg, pos: true };
    }
    function flightMin(legs) { return legs.reduce((s, l) => s + (l.arr - l.dep), 0); }
    function fixIntra(legs) {
      if (legs.length < 2) return legs;
      const out = [Object.assign({}, legs[0])];
      for (let i = 1; i < legs.length; i++) {
        const prev = out[out.length - 1];
        const next = Object.assign({}, legs[i]);
        if (prev.to !== next.from) {
          const bm = Math.max(40, blockMin(prev.to, next.from) || 80);
          let dep = Math.max(prev.arr + 40, next.dep - bm - 40);
          if (dep + bm + 30 > next.dep) { const sh = dep + bm + 35 - next.dep; next.dep += sh; next.arr += sh; }
          out.push(makeLeg(prev.to, next.from, dep, prev.ac || next.ac, prev.reg || next.reg, prev.d));
        }
        out.push(next);
      }
      return out;
    }
    function roundTrip(template, d, ac, reg) {
      const base = pickBase();
      const nearPool = NEAR.length ? NEAR : DESTS;
      const fromTpl = (template || []).flatMap(l => [l.from, l.to]).filter(c => c && !BASE[c]);
      const shortTpl = fromTpl.filter(c => blockMin(base, c) <= 160);
      const pool = shortTpl.length ? shortTpl : nearPool;
      const dest = pool[Math.floor(r() * pool.length)] || 'ZLXY';
      const absDay0 = template && template[0] ? Math.floor(template[0].dep / DAY) * DAY : 0;
      const dep1 = absDay0 + (7 * 60 + Math.floor(r() * 90));
      const l1 = makeLeg(base, dest, dep1, ac, reg, d);
      return [l1, makeLeg(dest, base, l1.arr + 50, ac, reg, d)];
    }
    function trimToBaseStart(legs) {
      const i0 = legs.findIndex(l => BASE[l.from]);
      return i0 > 0 ? legs.slice(i0) : legs;
    }
    function trimToBaseEnd(legs) {
      let i1 = -1;
      for (let i = legs.length - 1; i >= 0; i--) if (BASE[legs[i].to]) { i1 = i; break; }
      return i1 >= 0 ? legs.slice(0, i1 + 1) : legs;
    }
    function ensureEndBase(legs, ac, reg, d) {
      if (!legs.length) return roundTrip(null, d, ac, reg);
      if (BASE[legs[legs.length - 1].to]) return legs;
      const trimmed = trimToBaseEnd(legs);
      if (BASE[trimmed[trimmed.length - 1].to] && trimmed.length) return trimmed;
      // 插入回程；若超 7.5h 飞行则改为短程往返
      const base = pickBase();
      const last = legs[legs.length - 1];
      const ret = makeLeg(last.to, base, last.arr + 45, last.ac || ac, last.reg || reg, d);
      const trial = legs.concat([ret]);
      if (flightMin(trial) <= 450 && trial.length <= 4) return trial;
      return roundTrip(legs, d, ac, reg);
    }

    pairings.forEach(pr => {
      const byD = {};
      pr.legs.forEach(l => { (byD[l.d] = byD[l.d] || []).push(Object.assign({}, l)); });
      const days = Object.keys(byD).map(Number).sort((a, b) => a - b);
      days.forEach(d => byD[d].sort((a, b) => a.dep - b.dep));

      // 先识别「裁剪前」自然过夜，再归一化
      const layoverAfter = {};
      for (let di = 0; di < days.length - 1; di++) {
        const a = byD[days[di]], b = byD[days[di + 1]];
        if (!BASE[a[a.length - 1].to] && a[a.length - 1].to === b[0].from) layoverAfter[days[di]] = true;
      }
      // 少数：从成都始发、外站结束的日，保留过夜（约 8%）
      if (days.length >= 2 && r() < 0.14) {
        const cands = days.slice(0, -1).filter(d => !layoverAfter[d] && BASE[byD[d][0].from] && !BASE[byD[d][byD[d].length - 1].to]);
        if (cands.length) layoverAfter[cands[Math.floor(r() * cands.length)]] = true;
      }

      const newLegs = [];
      let prevEnd = null;
      days.forEach((d, di) => {
        let legs = byD[d].map(l => Object.assign({}, l));
        const ac0 = legs[0].ac, reg0 = legs[0].reg;
        const layStart = di > 0 && layoverAfter[days[di - 1]];
        const layEnd = !!layoverAfter[d] && di < days.length - 1;

        if (layStart && prevEnd && !BASE[prevEnd.to]) {
          // 过夜日：必须从过夜站始发
          if (legs[0].from !== prevEnd.to) {
            const i = legs.findIndex(l => l.from === prevEnd.to);
            if (i >= 0) legs = legs.slice(i);
            else {
              const bm = Math.max(40, blockMin(prevEnd.to, legs[0].from) || 80);
              const dayStart = Math.floor(legs[0].dep / DAY) * DAY;
              const dep = Math.max(dayStart + 6 * 60, legs[0].dep - bm - 45);
              if (dep + bm + 35 <= legs[0].dep) legs = [makeLeg(prevEnd.to, legs[0].from, dep, ac0, reg0, d)].concat(legs);
              else { legs = roundTrip(byD[d], d, ac0, reg0); /* 放弃过夜 */ }
            }
          }
        } else {
          legs = trimToBaseStart(legs);
          if (!legs.length || !BASE[legs[0].from]) legs = roundTrip(byD[d], d, ac0, reg0);
        }

        if (layEnd) {
          // 外站结束：若当前已在基地则无过夜；若与次日不衔接，落到次日始发站（短段）或放弃
          let last = legs[legs.length - 1];
          const nextFrom = byD[days[di + 1]][0].from;
          if (BASE[last.to]) {
            // keep at base — overnight cancelled effectively
          } else if (last.to !== nextFrom) {
            const target = !BASE[nextFrom] ? nextFrom : null;
            if (target) {
              const add = makeLeg(last.to, target, last.arr + 45, last.ac || ac0, last.reg || reg0, d);
              if (flightMin(legs.concat([add])) <= 450) legs = legs.concat([add]);
              else legs = ensureEndBase(legs, ac0, reg0, d);
            } else legs = ensureEndBase(legs, ac0, reg0, d);
          }
        } else {
          legs = ensureEndBase(legs, ac0, reg0, d);
        }

        legs = fixIntra(legs);
        if (flightMin(legs) > 450 || legs.length > 4) legs = roundTrip(legs, d, ac0, reg0);

        // 最终约束
        const startOk = BASE[legs[0].from] || (layStart && prevEnd && legs[0].from === prevEnd.to);
        if (!startOk) legs = roundTrip(legs, d, ac0, reg0);
        if (!layEnd && !BASE[legs[legs.length - 1].to]) legs = ensureEndBase(legs, ac0, reg0, d);

        legs.forEach(l => newLegs.push(l));
        prevEnd = { to: legs[legs.length - 1].to, arr: legs[legs.length - 1].arr };
      });

      // 最终调和：日界要么同站过夜，要么两端均在成都；任务回基地；控飞行时长
      (function reconcile() {
        const by = {};
        newLegs.forEach(l => { (by[l.d] = by[l.d] || []).push(l); });
        const ds = Object.keys(by).map(Number).sort((a, b) => a - b);
        for (let di = 0; di < ds.length; di++) {
          let legs = by[ds[di]];
          if (flightMin(legs) > 450 || legs.length > 4) {
            legs = roundTrip(legs, ds[di], legs[0].ac, legs[0].reg);
            by[ds[di]] = legs;
          }
          const last = legs[legs.length - 1];
          if (di < ds.length - 1) {
            const next = by[ds[di + 1]][0];
            const ok = (BASE[last.to] && BASE[next.from]) || last.to === next.from;
            if (!ok) {
              // 强制本日回成都
              if (!BASE[last.to]) {
                const fixed = ensureEndBase(legs, last.ac, last.reg, ds[di]);
                by[ds[di]] = fixed;
              }
              // 次日若仍非成都始发，改往返
              if (!BASE[by[ds[di + 1]][0].from]) {
                const n0 = by[ds[di + 1]];
                by[ds[di + 1]] = roundTrip(n0, ds[di + 1], n0[0].ac, n0[0].reg);
              }
            }
          } else if (!BASE[last.to]) {
            by[ds[di]] = ensureEndBase(legs, last.ac, last.reg, ds[di]);
          }
        }
        // 过夜衔接：若本日外站结束，次日必须同站；否则次回成都往返已处理
        for (let di = 0; di < ds.length - 1; di++) {
          const a = by[ds[di]], b = by[ds[di + 1]];
          const end = a[a.length - 1].to;
          if (!BASE[end] && b[0].from !== end) {
            by[ds[di]] = ensureEndBase(a, a[0].ac, a[0].reg, ds[di]);
            if (!BASE[b[0].from]) by[ds[di + 1]] = roundTrip(b, ds[di + 1], b[0].ac, b[0].reg);
          }
        }
        newLegs.length = 0;
        ds.forEach(d => by[d].forEach(l => newLegs.push(l)));
      })();
      if (newLegs.length && !BASE[newLegs[newLegs.length - 1].to]) {
        const last = newLegs[newLegs.length - 1];
        const dayLegs = newLegs.filter(l => l.d === last.d);
        const add = makeLeg(last.to, pickBase(), last.arr + 50, last.ac, last.reg, last.d);
        if (flightMin(dayLegs.concat([add])) > 450) {
          const repl = roundTrip(dayLegs, last.d, last.ac, last.reg);
          pr.legs = newLegs.filter(l => l.d !== last.d).concat(repl);
          return;
        }
        newLegs.push(add);
      }
      pr.legs = newLegs;
    });
    return pairings;
  }


  // ---- 按真实七中队排班形态生成任务：日=基地→…→同日回基地（府/蓉），少数外站过夜链；去程单号/回程双号 ----
  function buildPatternPairings(r, opt) {
    const meta = SAMPLE_META || {};
    const BASE = ['ZUTF', 'ZUUU'];
    const isBase = c => c === 'ZUTF' || c === 'ZUUU';
    const regsAb = (meta.sampleRegsAirbus || []).slice();
    const regsC9 = (meta.sampleRegsC909 || []).slice();
    const dom = Object.keys(AIRPORTS).filter(c => !isBase(c) && /^Z/.test(c) && AIRPORTS[c] && AIRPORTS[c].length >= 3);
    const near = dom.filter(c => { const b = blockMin("ZUTF", c); return b >= 55 && b <= 180; });
    const normal = near.filter(c => (AIRPORTS[c][3] || 'NONE') === 'NONE');
    const special = near.filter(c => (AIRPORTS[c][3] || 'NONE') !== 'NONE').concat(dom.filter(c => apCat(c) === 'LHASA'));
    const pick = a => a[Math.floor(r() * a.length)];
    let spP = 0.03; const pickDest = () => (r() < spP && special.length ? pick(special) : pick(normal));
    let fno = 2201 + Math.floor(r() * 40) * 2;
    const nextPair = () => { fno += 2 + 2 * Math.floor(r() * 6); if (fno > 2997) fno = 2201 + Math.floor(r() * 50) * 2; return fno; }; // 去程单号=fno-? 用 odd
    const flt = n => 'EU' + String(n).padStart(4, '0');
    const T = (dayAbs, min) => (dayAbs - 1) * DAY + min;
    const legOf = (d, from, to, dep, ac, reg, no) => { const bm = blockMin(from, to); return { d, flt: flt(no), from, to, dep, arr: dep + bm, ac, reg }; };
    // 单日：base→X→base 或 base→X→Y→base；late 时段起飞较晚
    function dayRound(d, dayAbs, base, ac, reg, slot) {
      let dep = T(dayAbs, slot ? 11 * 60 + 30 + Math.floor(r() * 60) : 7 * 60 + 20 + Math.floor(r() * 100));
      const legs = []; const odd = nextPair(); const n = odd + 1;
      const X = pickDest();
      if (r() < 0.22) { // 三段 base-X-Y-base（可从府出、蓉回）
        let Y = pickDest(); let tries = 0; while ((Y === X || blockMin(X, Y) > 150) && tries++ < 20) Y = pickDest();
        if (Y !== X && blockMin(base, X) + blockMin(X, Y) + blockMin(Y, base) <= 420) {
          const a = legOf(d, base, X, dep, ac, reg, odd); legs.push(a);
          const b = legOf(d, X, Y, a.arr + 50, ac, reg, odd); legs.push(b);
          legs.push(legOf(d, Y, r() < 0.25 ? (base === 'ZUTF' ? 'ZUUU' : 'ZUTF') : base, b.arr + 50, ac, reg, n));
          return legs;
        }
      }
      const a = legOf(d, base, X, dep, ac, reg, odd); legs.push(a);
      legs.push(legOf(d, X, base, a.arr + 50, ac, reg, n));
      return legs;
    }
    const pairings = [];
    const regs = regsAb.map(g => [g, 'A320']).concat(regsC9.map(g => [g, 'C909']));
    regs.forEach(([reg, ac], ri) => {
      spP = (ri % 4 === 3) ? 0.7 : 0.01; let longDone = false; // 高原/特殊机场集中在少数机号（与原周模板一致）
      const slots = (ri % 5 === 0) ? [0] : [0, 1];
      slots.forEach(K => {
        let day = 1, nChunk = 0;
        while (day <= DAYS) {
          const len = Math.min(DAYS - day + 1, nChunk === 0 ? 2 + ((ri + K) % 2) : ((nChunk + K + ri) % 4 === 3) ? 2 : 3); nChunk++; // 首块错相，避免各机号同日换块
          const legs = [];
          // 罕见：外站驻点长块（真实：沈阳驻点 9 日，驻点期间休息日留在外站；固定带飞对 TL+SPIC）
          if (K === 0 && ri % 7 === 2 && !longDone && day >= 9 && day + 8 <= DAYS && AIRPORTS.ZYTX) {
            longDone = true; const O = 'ZYTX', base = 'ZUTF'; const n0 = nextPair();
            legs.push(legOf(1, base, O, T(day, 9 * 60), ac, reg, n0));
            for (const q of [4, 5, 8]) { let X = pick(normal); let tr = 0; while ((blockMin(O, X) > 150 || blockMin(O, X) < 50) && tr++ < 60) X = pick(normal); const m = nextPair();
              const o = legOf(q, O, X, T(day + q - 1, 9 * 60 + 30), ac, reg, m); legs.push(o, legOf(q, X, O, o.arr + 50, ac, reg, m + 1)); }
            legs.push(legOf(9, O, base, T(day + 8, 10 * 60), ac, reg, n0 + 1));
            pairings.push({ id: 'PR', start: day, ndays: 9, ac, legs, crew: { C: null, F: null, T: null }, demoSynth: false, dutySlot: K, demoFill: true, layover: true, outstationBase: O, offAway: true, fixedPair: true });
            day += 9; continue;
          }
          const lay = len >= 2 && r() < 0.55; // 外站过夜链（真实约 40% 飞行日）
          const layAt = lay && len === 3 && r() < 0.5 ? 1 : 0;
          let k = 0;
          while (k < len) {
            const d = k + 1, dayAbs = day + k;
            const base = r() < 0.55 ? 'ZUTF' : 'ZUUU';
            if (lay && k === layAt) {
              // D_k: base→X→Y(过夜)，晚班；D_k+1: Y→Z→base，次日中午起
              const X = pickDest(); let Y = pickDest(); let tr = 0;
              while ((Y === X || blockMin(X, Y) > 170 || blockMin(base, X) + blockMin(X, Y) > 360) && tr++ < 30) { Y = pickDest(); }
              const n1 = nextPair();
              const a = legOf(d, base, X, T(dayAbs, 12 * 60 + Math.floor(r() * 60)), ac, reg, n1);
              const b = legOf(d, X, Y, a.arr + 50, ac, reg, n1);
              if (r() < 0.15) a.dh = true; // (随)置位出港，接外站过夜链
              legs.push(a, b);
              let Yc = Y, dd = d, dA = dayAbs, lastArr = b.arr;
              // 3 日链：Y→Z（单段过夜）
              if (len - k >= 3 && r() < 0.35) { let Z = pickDest(); let tz = 0; while ((Z === Yc || blockMin(Yc, Z) > 170) && tz++ < 30) Z = pickDest();
                const mz = nextPair(); const z = legOf(dd + 1, Yc, Z, Math.max(lastArr + 13 * 60, T(dA + 1, 10 * 60)), ac, reg, mz); legs.push(z); Yc = Z; dd++; dA++; lastArr = z.arr; k++; }
              const Y2 = Yc; const n2 = n1 + 1; const d2 = dd + 1, dayAbs2 = dA + 1;
              const dep2 = Math.max(lastArr + 13 * 60, T(dayAbs2, 9 * 60 + 30));
              const back = r() < 0.3 ? (base === 'ZUTF' ? 'ZUUU' : 'ZUTF') : base;
              if (Y2 === Y && r() < 0.5 && blockMin(Y, X) + blockMin(X, back) <= 360) {
                const c = legOf(d2, Y, X, dep2, ac, reg, n2); const e = legOf(d2, X, back, c.arr + 50, ac, reg, n2); legs.push(c, e);
              } else { const z = legOf(d2, Y2, back, dep2, ac, reg, n2); if (r() < 0.35) z.dh = true; legs.push(z); } // 单段回程约 1/3 为(随)
              k += 2; continue;
            }
            dayRound(d, dayAbs, base, ac, reg, K).forEach(l => legs.push(l));
            k++;
          }
          pairings.push({ id: 'PR', start: day, ndays: len, ac, legs, crew: { C: null, F: null, T: null }, demoSynth: false, dutySlot: K, demoFill: true, layover: lay });
          day += len;
        }
      });
    });
    // 机号时间冲突：同机号同日两班按时段错开即可（早班≤13:30 落地；晚班 ≥13:30 起）
    const maxP = opt.maxPairings || 1800;
    pairings.sort((a, b) => a.legs[0].dep - b.legs[0].dep);
    const out = pairings.slice(0, maxP);
    out.forEach((p, i) => { p.id = 'PR' + String(i + 1).padStart(3, '0'); });
    return out;
  }

  function buildPairingsFromWeek(r, opt) {
    if (!opt || opt.legacy !== true) return buildPatternPairings(r, opt || {});
    const meta = SAMPLE_META || {};
    const abRegs = new Set(meta.sampleRegsAirbus || []);
    const c9Regs = new Set(meta.sampleRegsC909 || []);
    // 日径模板仅覆盖部分机号；对 SAMPLE_META 中额外机号按同机型捐赠模板克隆，以放大月任务量
    const paths = [];
    const donorsAb = [], donorsC9 = [];
    const byDonor = {};
    SAMPLE_WEEK_PATHS.forEach(p => {
      (byDonor[p.r] = byDonor[p.r] || []).push(p);
      if (p.a === 'C909') { if (!donorsC9.includes(p.r)) donorsC9.push(p.r); }
      else if (!donorsAb.includes(p.r)) donorsAb.push(p.r);
    });
    function addReg(reg, donors) {
      if (byDonor[reg]) { byDonor[reg].forEach(p => paths.push(p)); return; }
      if (!donors.length) return;
      const donor = donors[Math.abs(hashReg(reg)) % donors.length];
      (byDonor[donor] || []).forEach(p => paths.push(Object.assign({}, p, { r: reg })));
    }
    function hashReg(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
    (meta.sampleRegsAirbus || []).forEach(reg => addReg(reg, donorsAb));
    (meta.sampleRegsC909 || []).forEach(reg => addReg(reg, donorsC9));
    // 演示补全：不伪造 FR24 空窗日；整月按完整日模板·同星期循环铺满（非实飞）。工时靠排班集中到人均飞 40–60h。
    const synthRegSet = new Set();
    const byReg = {};
    const srcByWd = {}; // weekday -> [src,...] 有序去重
    const completeWd = Array.isArray(meta.completeWeekdays) ? meta.completeWeekdays : null;
    paths.forEach(p => {
      if (!abRegs.has(p.r) && !c9Regs.has(p.r)) return;
      const src = p.src == null ? 0 : (+p.src || 0);
      byReg[p.r] = byReg[p.r] || {};
      byReg[p.r][src] = byReg[p.r][src] || {};
      byReg[p.r][src][p.w] = p;
      const wd = completeWd && completeWd[src] != null ? completeWd[src] : p.w;
      (srcByWd[wd] = srcByWd[wd] || []);
      if (!srcByWd[wd].includes(src)) srcByWd[wd].push(src);
    });
    Object.keys(srcByWd).forEach(wd => srcByWd[wd].sort((a, b) => a - b));
    const BASES = { ZUUU: 1, ZUTF: 1 };
    // 将真实一日机径切成合法机组值勤段：≤4 段、飞行≤7.5h、FDP粗算≤12.5h
    function splitDuty(icao, flts, std, ac, reg, dayAbs) {
      const segs = [];
      let i = 0;
      let clock = (dayAbs - 1) * DAY + std;
      while (i < icao.length - 1) {
        // 同机第二个值勤段（晚班）接续早班落地+过站，避免同机号航段时间重叠
        let tmin = clock;
        const legs = [];
        let flight = 0;
        while (i < icao.length - 1 && legs.length < 3) {
          // 真实机组节奏：一日多为 2 段（往返），返基地或避免剩 1 段尾巴时才排第 3 段
          if (legs.length === 2) {
            const endBase = BASES[legs[1].to];
            const left = icao.length - 1 - i;
            const nextBack = BASES[icao[i + 1]];
            if (endBase && left !== 1) break;
            if (!endBase && !nextBack && left !== 1) break;
          }
          const a = icao[i], b = icao[i + 1];
          if (!AIRPORTS[a] || !AIRPORTS[b]) { i++; break; }
          const bm = blockMin(a, b);
          // 预估 FDP：报到95 + 飞行 + 过站50*(n-1) + 退场30
          const nextFlight = flight + bm;
          const nextN = legs.length + 1;
          const estFdp = 95 + nextFlight + Math.max(0, nextN - 1) * 50 + 30;
          if (legs.length && (nextFlight > 450 || estFdp > 12.5 * 60)) break;
          const flt = flts[i] || flts[flts.length - 1] || 'EU0000';
          legs.push({ d: 0, flt, from: a, to: b, dep: tmin, arr: tmin + bm, ac, reg });
          tmin += bm + 50; flight = nextFlight; i++;
        }
        if (!legs.length) { i++; continue; }
        clock = tmin;
        segs.push(legs);
        // 同日历日第二段：从下一起飞时刻继续（演示用，避免超长机径拖垮规则）
        if (i < icao.length - 1 && segs.length >= 2) break; // 每机每日最多 2 个机组值勤（早/晚班）
      }
      return segs;
    }
    function pickPath(bag, wd, dayAbs) {
      const pool = (srcByWd[wd] && srcByWd[wd].length) ? srcByWd[wd] : Object.keys(bag).map(Number).sort((a, b) => a - b);
      if (!pool.length) return null;
      const weekIdx = Math.floor((dayAbs - 1) / 7);
      // 同星期多模板按日历周循环；缺该机号当日模板则回退同星期其他 src
      for (let k = 0; k < pool.length; k++) {
        const src = pool[(weekIdx + k) % pool.length];
        const t = bag[src] && bag[src][wd];
        if (t) return t;
      }
      // 最后兜底：任意 src 的同星期
      for (const src of Object.keys(bag)) {
        if (bag[src][wd]) return bag[src][wd];
      }
      return null;
    }
    // reg -> [{day, legs}...] 按日历日展开的值勤段（一段= pairing 的一日）
    const duties = {}; // reg -> [{day, legs}]
    Object.keys(byReg).forEach(reg => {
      duties[reg] = [];
      for (let d = 1; d <= DAYS; d++) {
        const wd = weekdayJS(YEAR, MONTH, d);
        const t = pickPath(byReg[reg], wd, d);
        if (!t) continue;
        const segs = splitDuty(t.i, t.f, t.s, t.a, reg, d);
        segs.forEach(legs => duties[reg].push({ day: d, legs }));
      }
    });
    const pairings = []; let pid = 1;
    Object.keys(duties).forEach(reg => {
      // 按日历日合并同日多段（取首段，避免同日两段并入超长值勤）
      const slotsOf = {};
      duties[reg].forEach(du => { const k = (slotsOf[du.day] = (slotsOf[du.day] || 0) + 1) - 1; du.k = k; });
      // 演示量：约 1/5 机号只取早班值勤（晚班不铺），使机长/教员运力有余量
      const lateOK = Math.abs(hashReg(reg)) % 5 !== 0;
      for (let K = 0; K < (lateOK ? 2 : 1); K++) {
      const byDay = {};
      duties[reg].forEach(du => { if (du.k === K && !byDay[du.day]) byDay[du.day] = du; });
      const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
      let i = 0, nChunk = 0;
      while (i < days.length) {
        // 实飞记录校准：飞 3 天为主，约每 4 块穿插 1 个 2 天块（起点按机号/班次错开）
        const targetLen = ((nChunk++ + K + reg.length) % 4 === 3) ? 2 : 3;
        const chunkDays = [days[i]];
        while (chunkDays.length < targetLen) {
          const want = chunkDays[chunkDays.length - 1] + 1;
          if (byDay[want]) chunkDays.push(want);
          else break;
        }
        // 若只有 1 日且后面还有，尽量拼到 2
        if (chunkDays.length === 1 && byDay[days[i] + 1]) chunkDays.push(days[i] + 1);
        const endBase = d => BASES[byDay[d].legs.slice(-1)[0].to];
        if (chunkDays.length >= 3 && !endBase(chunkDays[chunkDays.length - 1])) {
          // 优先落到基地：能延长则延长，否则裁到基地日
          const nxt = chunkDays[chunkDays.length - 1] + 1;
          if (byDay[nxt] && endBase(nxt) && chunkDays.length < 3) chunkDays.push(nxt);
          else {
            // 仅当第 2 日恰好回基地时裁成 2 日；否则保留 3 日（演示补全，外站过夜后次日随机续飞）
            if (chunkDays.length === 3 && endBase(chunkDays[1])) chunkDays.pop();
          }
        }
        const legs = [];
        chunkDays.forEach((d, di) => {
          byDay[d].legs.forEach(L => {
            const x = Object.assign({}, L); x.d = di + 1; legs.push(x);
          });
        });
        pairings.push({
          id: 'PR' + String(pid).padStart(3, '0'),
          start: chunkDays[0], ndays: chunkDays.length,
          ac: legs[0].ac, legs, crew: { C: null, F: null, T: null },
          demoSynth: synthRegSet.has(reg), // B-Dxxx 演示扩量
          dutySlot: K, demoFill: true // 日历日由完整日模板按星期循环铺满（演示补全，非实飞）
        });
        pid++;
        const last = chunkDays[chunkDays.length - 1];
        while (i < days.length && days[i] <= last) i++;
      }
      }
    });
    const maxP = opt.maxPairings || 1800;
    pairings.sort((a, b) => a.legs[0].dep - b.legs[0].dep || a.id.localeCompare(b.id));
    const out = pairings.slice(0, maxP);
    out.forEach((p, i) => { p.id = 'PR' + String(i + 1).padStart(3, '0'); });
    ensurePairingContinuity(out, r);
    out.sort((a, b) => a.legs[0].dep - b.legs[0].dep || a.id.localeCompare(b.id));
    out.forEach((p, i) => { p.id = 'PR' + String(i + 1).padStart(3, '0'); });
    return out;
  }


  // 机号（机尾号）示例机队；同机型池内按时间贪心分配，保证同机号航段不重叠
  const FLEET = Object.assign({
    A320: ['B-32GV','B-32HC','B-30A1','B-30C8','B-30E2','B-32JF','B-32KH','B-30F6','B-32LM','B-30G9','B-32NP','B-30H3','B-32QR','B-30J5','B-32ST','B-30K7','B-32UV','B-30L1'],
    A321: ['B-32WX','B-30M4','B-32YZ'],
    C909: ['B-3386','B-3387','B-602A','B-603M','B-603P','B-603Z','B-604C','B-604D']
  }, SD.SAMPLE_FLEET || {});
  function assignAircraftRegs(pairings) {
    const busy = {}; // reg -> last arr minute
    Object.values(FLEET).flat().forEach(r => busy[r] = -1e9);
    const turn = 35;
    // 按航段时间顺序分配；同一 pairing 同一日优先续用上一机号
    const items = [];
    pairings.forEach(pr => pr.legs.forEach((l, i) => items.push({ pr, l, i })));
    items.sort((a, b) => a.l.dep - b.l.dep || a.pr.id.localeCompare(b.pr.id) || a.i - b.i);
    const lastReg = {}; // pr.id#d -> reg
    items.forEach(({ pr, l }) => {
      if (l.reg) { // 保留真实机号模板
        const pk0 = pr.id + '#' + l.d; lastReg[pk0] = l.reg;
        if (busy[l.reg] == null) busy[l.reg] = -1e9;
        busy[l.reg] = Math.max(busy[l.reg], l.arr);
        return;
      }
      const pool = FLEET[l.ac] || FLEET.A320;
      const pk = pr.id + '#' + l.d;
      const prefer = lastReg[pk];
      let best = null;
      if (prefer && busy[prefer] + turn <= l.dep) best = prefer;
      if (!best) {
        let bestT = 1e18;
        for (const r of pool) {
          if (busy[r] + turn <= l.dep && busy[r] < bestT) { best = r; bestT = busy[r]; }
        }
      }
      if (!best) {
        // 仍冲突：选空闲时刻最早的，必要时挤占（样本极少）
        best = pool.slice().sort((a, b) => busy[a] - busy[b] || a.localeCompare(b))[0];
      }
      l.reg = best; lastReg[pk] = best; busy[best] = Math.max(busy[best], l.arr);
    });
  }
  function ensureAircraftRegs(st) {
    if (!st || !st.pairings) return;
    const miss = st.pairings.some(p => p.legs.some(l => !l.reg));
    if (miss) assignAircraftRegs(st.pairings);
  }
  function aircraftDay(st, date) {
    ensureAircraftRegs(st);
    const acts = st.actuals || {};
    const day0 = (date - 1) * DAY, day1 = date * DAY;
    // 收录：计划或实际起飞落在当日，或跨日穿越当日的航段
    const rows = new Map(); // reg -> [{leg,pr,dy,...}]
    for (const pr of st.pairings) {
      const ds = fdpDays(pr, st, acts);
      pr.legs.forEach((leg, i) => {
        const a = acts[legKey(leg)] || {};
        const dep = a.dep != null ? a.dep : leg.dep;
        const arr = a.arr != null ? a.arr : (a.dep != null ? a.dep + (leg.arr - leg.dep) : leg.arr);
        // 起飞或落地落在所选日，或航段跨越该日（含跨午夜）
        const depDate = Math.floor(dep / DAY) + 1;
        const arrDate = Math.floor(Math.max(arr - 1, dep) / DAY) + 1;
        if (!(depDate === date || arrDate === date || (depDate < date && arrDate > date))) return;
        const dy = ds.find(x => x.legs.some(z => z.i === i)) || ds.find(x => x.d === leg.d);
        const lateArr = arr - leg.arr;
        const lateDep = dep - leg.dep;
        const risk = dy ? dy.risk : 'low';
        const buffer = dy ? dy.buffer : null;
        let color = 'ok';
        if (risk === 'over' || risk === 'high') color = 'over';
        else if (risk === 'med' || lateArr > 30 || lateDep > 30) color = 'med';
        else if (lateArr > 10 || lateDep > 10) color = 'late';
        const reg = leg.reg || '—';
        if (!rows.has(reg)) rows.set(reg, []);
        rows.get(reg).push({ leg, pr, i, dep, arr, planDep: leg.dep, planArr: leg.arr, lateDep, lateArr, risk, buffer, color, dy, known: a.dep != null || a.arr != null, kind: (a.kind || 'est'), landed: a.kind === 'act' && a.arr != null });
      });
    }
    const list = [...rows.entries()].map(([reg, items]) => {
      items.sort((a, b) => a.dep - b.dep);
      return { reg, ac: items[0].leg.ac || 'A320', items, nLate: items.filter(x => x.lateArr > 10).length, nRisk: items.filter(x => x.color === 'over' || x.color === 'med').length };
    }).sort((a, b) => a.reg.localeCompare(b.reg));
    // 时间轴：当日 0:00 起，若有跨午夜则延长
    let tMax = day1;
    list.forEach(r => r.items.forEach(x => { if (x.arr > tMax) tMax = x.arr; }));
    tMax = Math.max(tMax, day1);
    // 若全在白天，也可从最早起飞前一小时起
    let tMin = day0;
    const deps = list.flatMap(r => r.items.map(x => x.dep));
    if (deps.length) tMin = Math.min(day0, Math.max(day0 - 60, Math.min(...deps) - 60));
    return { date, day0, tMin, tMax, rows: list };
  }

  // ---------- 任务派生量 ----------
  const fltLabel = l => l.flt + (l.dh ? '(随)' : '');
  // 岗位显示名：TL 等教员带飞新机长时坐副驾驶位 → 「副驾驶位(教员)」
  const slotLabel = (pr, s, pm) => SLOT_NAME[s] + (s === 'F' && pr.crew.F && pm && pm[pr.crew.F] && isInstr(pm[pr.crew.F].rank) ? '(教员)' : '');
  function pairingHours(p) { return p.legs.reduce((s, l) => s + (l.dh ? 0 : l.arr - l.dep), 0) / 60; } // (随)置位不计飞行小时
  // 按值勤日拆分的值勤区间 [报到, 退场]（外站驻点休息日/过夜不计值勤）
  function dutyIvs(p, st) { const rep = (st && st.settings.reportMin) || 60, rel = (st && st.settings.releaseMin) || 30; const by = new Map();
    p.legs.forEach(l => { const x = by.get(l.d); if (!x) by.set(l.d, [l.dep - rep, l.arr + rel]); else { x[0] = Math.min(x[0], l.dep - rep); x[1] = Math.max(x[1], l.arr + rel); } });
    return [...by.values()].sort((a, b) => a[0] - b[0]); }
  // 任务占用的全部日历日（含外站驻点休息日）——用于请假/备份/培训/意向冲突
  function spanDays(p, st) { const a = Math.floor(report(p, st) / DAY) + 1, b = Math.floor((release(p, st) - 1) / DAY) + 1; const r = []; for (let d = a; d <= b; d++) r.push(d); return r; }
  // 外站驻点休息日：任务跨度内无值勤的日历日（不计值勤日，计休息）
  function offAwayDays(p, st) { const t = new Set(daysTouched(p, st)); return spanDays(p, st).filter(d => !t.has(d)); }
  function report(p, st) { return p.legs[0].dep - ((st && st.settings.reportMin) || 60); }
  function release(p, st) { return p.legs[p.legs.length - 1].arr + ((st && st.settings.releaseMin) || 30); }
  function daysTouched(p, st) { if (!p.offAway) { const a = Math.floor(report(p, st) / DAY) + 1, b = Math.floor((release(p, st) - 1) / DAY) + 1; const r = []; for (let d = a; d <= b; d++) r.push(d); return r; }
    const s = new Set(); dutyIvs(p, st).forEach(([a, b]) => { for (let d = Math.floor(a / DAY) + 1; d <= Math.floor((b - 1) / DAY) + 1; d++) s.add(d); }); return [...s].sort((x, y) => x - y); }
  const isNightLeg = l => { const a = ((l.dep % DAY) + DAY) % DAY, b = ((l.arr % DAY) + DAY) % DAY; return a < 360 || b < 360 || l.arr - Math.floor(l.dep / DAY) * DAY >= DAY; };
  const fmtT = m => { m = ((m % DAY) + DAY) % DAY; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  function specialAirportsOf(p, st) { const s = new Set(); p.legs.forEach(l => { if (l.dh) return; [l.from, l.to].forEach(c => { if (isSpecial(c, st)) s.add(c); }); }); return [...s]; }

  // ---------- 机组合法性（逐航段） ----------
  // 返回 null 表示合法，否则返回原因字符串
  function legSeatedOK(L, R, leg, st) {
    if (leg.dh) return true; // (随)置位：乘客身份，不需座位/特殊机场资质
    if (!seatOK(L.rank, R.rank)) return false;
    for (const c of [leg.from, leg.to]) { const cat = apCat(c, st);
      if (cat === 'NONE') continue;
      const ru = sarOf(cat); const needQ = ru ? ru.crew_qualification_required !== false : AUTH_CATS.includes(cat);
      if (needQ && (!(L.auth || []).includes(c) || !(R.auth || []).includes(c))) return false;
      if (!catOK(cat, L.rank, R.rank)) return false; }
    if ((leg.ac === 'A321' || leg.ac === 'A21N') && !isJ2plus(L.rank)) return false;
    return true;
  }
  function crewIssue(p, crewPilots, st) {
    const cs = crewPilots.filter(Boolean);
    if (cs.length < 3) return null; // 不完整机组不做组合判定
    // 新机长执飞须组内有教员（教员可任执飞座之一）；第三人观察员不强制为教员——候选过滤见 candidates(slot=T)
    if (cs.some(x => isNew(x.rank)) && !cs.some(x => isInstr(x.rank))) return '[CR-20] 新机长执飞须有 TL 及以上教员同组（观察员位可为任意级别）';
    if (cs.filter(x => isCaptClass(x.rank)).length < 1) return '[CR-05] 机组无机长';
    const xr = extraCrewIssue(p, cs, st); if (xr) return xr;
    for (const leg of p.legs) {
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) for (let j = 0; j < 3 && !ok; j++) if (i !== j && legSeatedOK(cs[i], cs[j], leg, st)) ok = true;
      if (!ok) { const c = [leg.from, leg.to].find(x => isSpecial(x, st));
        const ru = c && sarOf(apCat(c, st));
        return `[${ru ? 'CR-06/07/08·' + ru.key : c ? 'CR-特殊机场' : 'CR-01'}] D${leg.d} ${leg.flt} ${apName(leg.from, st)}-${apName(leg.to, st)}：无满足${c ? '特殊机场(' + apName(c, st) + ')授权/' : ''}座位搭配规则的左右座组合`; }
    }
    // F1 只能与教员在右座；F2 须有教员
    if (cs.some(x => x.rank === 'F1' || x.rank === 'F2') && !cs.some(x => isInstr(x.rank))) return '[CR-19] F1/F2 须与教员同组';
    return null;
  }
  // 配置驱动的组级硬规则：搭配限制表 / FO-FO 矩阵 / 高高原双机长 / 体检特许 / 年龄（有数据才生效）
  function restrictionSet(st) { const a = (st && st.restrictions) || []; if (st && st._rsSrc === a && st._rsSet) return st._rsSet;
    const s = new Set(); a.forEach(r => { if (!r || !r.a || !r.b) return; s.add(r.a + '|' + r.b); s.add(r.b + '|' + r.a); });
    if (st) { Object.defineProperty(st, '_rsSet', { value: s, writable: true, configurable: true, enumerable: false }); Object.defineProperty(st, '_rsSrc', { value: a, writable: true, configurable: true, enumerable: false }); } return s; }
  function extraCrewIssue(p, cs, st) {
    if (EO.restriction_table_hard !== false && st && st.restrictions && st.restrictions.length) { const rs = restrictionSet(st);
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (rs.has(cs[i].id + '|' + cs[j].id)) return `[restriction_table] 搭配限制表：${cs[i].name} 与 ${cs[j].name} 不可同机`; }
    const fos = cs.filter(x => isFO(x.rank));
    for (let i = 0; i < fos.length; i++) for (let j = i + 1; j < fos.length; j++) if (!foComboAllowed(fos[i].rank, fos[j].rank))
      return `[RE12 fo_combination_matrix.${foComboKey(fos[i].rank, fos[j].rank)}] 两名副驾驶 ${fos[i].rank}+${fos[j].rank} 搭配禁止`;
    const cats = new Set(); p.legs.forEach(l => [l.from, l.to].forEach(c => cats.add(apCat(c, st))));
    const PR = RC && RC.plateau_airport_rules; const cr = PR && PR.crew_requirements;
    for (const cat of cats) { const ru = sarOf(cat); if (!ru || ru.category !== 'high_plateau') continue;
      if (ru.second_pilot_min && EO.lxa_double_captain !== false && cr) {
        const caps = cs.filter(x => isCaptClass(x.rank) && capLv(x.rank) >= CAPT_ORDER.indexOf(ru.second_pilot_min));
        if (caps.length < (cr.high_plateau_min_captains || 2)) return `[17.1.3 crew_requirements.high_plateau_min_captains] ${ru.name}：须至少 ${cr.high_plateau_min_captains || 2} 名 ${ru.second_pilot_min}+ 机长`;
        if (fos.length < (cr.high_plateau_min_fos || 0)) return `[17.1.3 crew_requirements.high_plateau_min_fos] ${ru.name}：须至少 ${cr.high_plateau_min_fos} 名副驾驶（第三人）`; }
      const ms = PR && PR.medical_standards; if (ms && ms.special_qualified_excluded) { const x = cs.find(q => q.health && q.health.specialQualified);
        if (x) return `[17.1.4 medical_standards.special_qualified_excluded] ${x.name} 为体检特许合格，不得参与高高原（${ru.name}）`; }
      const al = PR && PR.age_limits; if (al) {
        const old = cs.find(q => ageOf(q) != null && ageOf(q) >= al.high_plateau_max_age);
        if (old) return `[17.1.3 age_limits.high_plateau_max_age] ${old.name} ${ageOf(old)} 岁 ≥ ${al.high_plateau_max_age}，不进高高原`;
        const ca = cs.filter(q => isCaptClass(q.rank)); if (ca.length >= 2 && ca.every(q => ageOf(q) != null)) { const sum = ca.slice(0, 2).reduce((a, q) => a + ageOf(q), 0);
          if (al.age_sum_strict_less ? sum >= al.captain_pair_age_sum_max : sum > al.captain_pair_age_sum_max) return `[17.1.3 age_limits.captain_pair_age_sum_max] 机长年龄和 ${sum} 不小于 ${al.captain_pair_age_sum_max}`; } } }
    const sr = RC && RC.senior_pilot_rule;
    if (sr && sr.enabled && EO.senior_pilot_rule_active) { const sen = cs.find(q => isCaptClass(q.rank) && ageOf(q) != null && ageOf(q) >= sr.age_threshold);
      if (sen) { const mn = fNum(isInstr(sen.rank) ? sr.instructor_min_fo_level : sr.captain_min_fo_level); const lo = fos.find(f => RANK_VAL[f.rank] < mn);
        if (lo) return `[CR-12] ${sen.name}(${ageOf(sen)}岁) 带队须搭配 F${mn}+，${lo.name} 为 ${lo.rank}`; } }
    return null;
  }
  // 搭配限制表导入：rows = [[人员A, 人员B, 限制类型], ...] 或 CSV 文本；按员工号或姓名匹配
  function parseRestrictions(input, pilots) {
    const rows = Array.isArray(input) ? input : String(input || '').split(/\r?\n/).map(l => l.split(/[,\t，]/).map(x => x.trim()));
    const sch = (RC && RC.restriction_table_schema) || { columns: ['人员A', '人员B', '限制类型'], default_type: '不可同机' };
    const find = k => { k = String(k || '').trim(); if (!k) return null; return pilots.find(p => p.id === k) || pilots.find(p => p.name === k) || null; };
    const pairs = [], unknown = [];
    rows.forEach((r, i) => { if (!r || r.length < 2 || !String(r[0] || '').trim()) return; if (i === 0 && String(r[0]).includes(sch.columns[0])) return;
      const A = find(r[0]), B = find(r[1]); const type = String(r[2] || '').trim() || sch.default_type;
      if (!A || !B || A === B) { unknown.push(String(r[0]) + '/' + String(r[1])); return; }
      if (type === sch.default_type) pairs.push({ a: A.id, b: B.id, type }); });
    return { pairs, unknown };
  }
  // 规则库（规则说明页 + 校验引用）
  function rulesCatalog(st) {
    const anyAge = !!(st && st.pilots && st.pilots.some(p => ageOf(p) != null));
    const anySQ = !!(st && st.pilots && st.pilots.some(p => p.health && p.health.specialQualified));
    const nR = ((st && st.restrictions) || []).length; const PR = (RC && RC.plateau_airport_rules) || {};
    const ageSt = anyAge ? '生效' : '待年龄数据';
    // 自有规则编号 CR-xx；legacyId 仅供引擎内部/旧文案映射，界面不展示 YAML 键名
    const R = [
      { id: 'CR-01', cat: '座位搭配', kind: '硬', status: '生效', legacyId: 'cruise_pairing_matrix',
        title: '巡航座位最低级别', params: 'US/J0/J1→右座≥F4；J2/J3→≥F3；教员 TL/TB/TC→右座≥F1',
        desc: '责任机长（左座）与上座副驾驶的级别配对下限。右座若同为机长类则不受副驾驶下限约束。',
        source: 'CCAR-121 R8 机组配备原则 / 公司机型操作与搭配规定', example: 'US 机长不得搭配 F3 及以下上座副驾驶。' },
      { id: 'CR-02', cat: '座位搭配', kind: '硬', status: '生效', legacyId: 'captain_levels.excluded_from_roster',
        title: '在训机长不上左座', params: 'SPIC 禁止作为责任机长',
        desc: 'SPIC 为在训阶段，不得担任本任务责任机长（左座）。',
        source: '公司机型操作与搭配规定', example: 'SPIC 可任观察员，不可任机长位。' },
      { id: 'CR-03', cat: '座位搭配', kind: '硬', status: '生效', legacyId: 'fo_combination_matrix.allow',
        title: '双副驾驶禁止低低搭配', params: 'low×low（F1–F3 与 F1–F3）禁止',
        desc: '两名副驾驶同组时，不允许双方同属低级别组。',
        source: '公司机型操作与搭配规定', example: 'F2+F3 同组不合规；F2+F5 合规。' },
      { id: 'CR-04', cat: '座位搭配', kind: '软', status: '生效', legacyId: 'fo_combination_matrix.preference_score',
        title: '副驾驶搭配偏好分', params: Object.entries((RC && RC.fo_combination_matrix && RC.fo_combination_matrix.preference_score) || {}).map(([k, v]) => k + '=' + v).join(' · ') || '见配置',
        desc: '自动排班时对副驾驶级别组合打分，优先较均衡的搭配。',
        source: '公司机型操作与搭配规定（软约束）', example: 'low_mid 得分高于 mid_mid。' },
      { id: 'CR-05', cat: '机组构成', kind: '硬', status: '生效', legacyId: 'three_person_crew',
        title: '三人制第三人不占上座矩阵', params: '机组=1 机长 + 2 副驾驶；第三人最低 F1',
        desc: '满足上座双人规则后，第三人（观察员）不参与左右座矩阵；仍须资质、体检与搭配限制。',
        source: '公司运行政策 · 三人制', example: '机长+F5 已合规上座时，第三人可为 F1。' },
      { id: 'CR-06', cat: '特殊机场', kind: '硬', status: EO.lxa_double_captain !== false ? '生效（双机长）' : '生效',
        legacyId: 'special_airport_rules.LXA', title: '拉萨（高高原）双机长',
        params: '左座 J3/教员；右座机长≥J3；第三人副驾驶；两上座持拉萨资质',
        desc: '飞经拉萨时须双机长制，且上座两人持对应机场资质。',
        source: 'CCAR-121 R8 高原运行 / 公司手册高原与特殊机场章节', example: 'J3+J3+F7 合规；单机长+两副驾驶不合规。' },
      { id: 'CR-07', cat: '特殊机场', kind: '硬', status: '生效', legacyId: 'special_airport_rules.LJG',
        title: '高原/复杂机场（丽江等）', params: '机长 J2+；J2/J3→FO≥F6，教员→FO≥F5；两上座持资质',
        desc: '丽江、西双版纳、西昌、西宁、大连等机场的座位与资质要求。',
        source: '公司手册高原与特殊机场章节', example: 'J2+F5 飞丽江不合规；J2+F6 合规。' },
      { id: 'CR-08', cat: '特殊机场', kind: '硬', status: '生效', legacyId: 'special_airport_rules.KMG',
        title: '一般高原（昆明等）', params: '机长 J2+；J2/J3→FO≥F5，教员→FO≥F4；两上座持资质',
        desc: '昆明等一般高原机场的座位与资质要求。',
        source: '公司手册高原与特殊机场章节', example: '教员+F4 飞昆明合规。' },
      { id: 'CR-09', cat: '特殊机场', kind: '展示', status: '生效', legacyId: 'airport_category_list',
        title: '机场类别标签', params: '一类高高原 / 二类 / 三类 / 四类 / 复杂',
        desc: '用于界面展示与资质补全提示；授权校验以具体机场规则为准。',
        source: '公司飞行技术/资质管理规定', example: '人员总览按类别列示授权列。' },
      { id: 'CR-10', cat: '高高原', kind: '硬', status: '生效', legacyId: 'plateau_airport_rules.crew_requirements',
        title: '高高原机组人数', params: '至少 2 名机长 + 1 名副驾驶',
        desc: '高高原机场运行时机组须满足双机长配备。',
        source: '公司运行手册高原机场章节', example: '拉萨任务不得仅 1 名机长。' },
      { id: 'CR-11', cat: '高高原', kind: '硬', status: ageSt, legacyId: 'plateau_airport_rules.age_limits',
        title: '高高原年龄限制', params: `单人≥${(PR.age_limits && PR.age_limits.high_plateau_max_age) || '—'} 岁禁飞；双机长年龄和 <${(PR.age_limits && PR.age_limits.captain_pair_age_sum_max) || '—'}`,
        desc: '有年龄数据时生效；无年龄字段则本规则不触发。',
        source: '公司运行手册高原机场章节', example: '两名 60 岁机长年龄和超限则不可同组飞高高原。' },
      { id: 'CR-12', cat: '年龄', kind: '硬', status: !EO.senior_pilot_rule_active ? '停用' : ageSt, legacyId: 'senior_pilot_rule',
        title: '资深机长带队副驾下限', params: '≥58 岁机长带队时副驾≥F6（教员带队≥F5）',
        desc: '可由引擎选项关闭；需年龄数据。',
        source: '公司机型操作与搭配规定', example: '60 岁机长 + F5（非教员任务）不合规。' },
      { id: 'CR-13', cat: '健康', kind: '硬', status: anySQ ? '生效' : '生效（暂无特许人员）', legacyId: 'medical_standards.special_qualified_excluded',
        title: '体检特许不进高高原', params: 'health.specialQualified = true 禁飞高高原',
        desc: '体检特许合格标记人员不得进入高高原机场运行。',
        source: '公司运行手册健康标准章节', example: '标记特许后不得排拉萨。' },
      { id: 'CR-14', cat: '搭配限制', kind: '硬', status: nR ? `生效（${nR} 对）` : '生效（未导入）', legacyId: 'restriction_table_schema',
        title: '人员不可同机表', params: '导入 CSV：人员A/人员B/不可同机',
        desc: '公司搭配限制表中的人员对不可出现在同一任务机组。',
        source: '公司搭配限制表', example: '导入后两人同组即硬违规。' },
      { id: 'CR-15', cat: '经历', kind: '展示', status: '仅展示', legacyId: 'experience_requirements',
        title: '经历小时参考', params: Object.entries(PR.experience_requirements || {}).map(([k, v]) => k + '=' + v).join(' · ') || '见配置',
        desc: '手册经历要求摘要；本演示无个人经历小时台账，不自动校验。',
        source: '公司运行手册', example: '—' },
      { id: 'CR-16', cat: '健康', kind: '展示', status: '仅展示', legacyId: 'medical_standards',
        title: '飞行前生理指标参考', params: '心率/血氧/禁酒时限见手册摘要',
        desc: '供讲解；不接入自动排班硬校验。',
        source: '公司运行手册健康标准章节', example: '—' },
      { id: 'CR-17', cat: '机型', kind: '展示', status: '仅展示', legacyId: 'arj21_restriction',
        title: '特定机型航线限制', params: ((PR.arj21_restriction || {}).aircraft_regs || []).join('/') || '—',
        desc: '特定注册号仅限指定航线；本演示无对应航线。',
        source: '公司运行手册', example: '—' },
      { id: 'CR-18', cat: '操作参考', kind: '展示', status: '仅展示', legacyId: 'operating_rules_reference',
        title: '操作级注意事项', params: '非排班硬约束',
        desc: ((RC && RC.operating_rules_reference) || []).slice(0, 3).join('；') || '见配置',
        source: '公司机型操作规定（参考）', example: '—' },
      { id: 'CR-19', cat: '带飞', kind: '硬', status: '生效', legacyId: 'RE12-操作 F1/F2',
        title: 'F1/F2 须与教员同组', params: '机组含 F1 或 F2 时须有 TL/TB/TC',
        desc: '低级别副驾驶须由教员带飞同组。',
        source: '公司机型操作与搭配规定', example: 'F1+J3+F5 无教员 → 不合规。' },
      { id: 'CR-20', cat: '带飞', kind: '硬', status: '生效', legacyId: 'RE12-新机长',
        title: '新机长须有教员同组', params: '新机长（含 SPIC/US/机长A/B 等）执飞须 TL+',
        desc: '新机长担任机组成员时须有教员同组（观察员位级别不限）。',
        source: '公司机型操作与搭配规定', example: '机长A 任机长位时须有 TL/TB/TC 同组。' },
    ];
    return { meta: Object.assign({}, (RC && RC.meta) || {}, { catalog: 'CR', note: '界面规则编号为 CR-xx，与引擎校验逻辑一一对应' }),
      sha: RC && RC._sha1, rules: R,
      legacyMap: Object.fromEntries(R.filter(x => x.legacyId).map(x => [x.legacyId, x.id])) };
  }
  // T=观察员：任意级别可上；RE12 座位规则只约束执飞双人座对
  const SLOT_NAME = { C: '机', F: '副', T: '观察' };
  function slotRankOK(slot, rank, capRank) { if (slot === 'C') return isCaptClass(rank); if (slot === 'F') return isFO(rank) || (isInstr(rank) && !!capRank && isNew(capRank)); return true; } // 带飞：新机长执飞时 TL 等教员可坐副驾驶位（操作座）

  // ---------- 索引与计算 ----------
  function buildIndex(st) {
    const pm = {}; st.pilots.forEach(p => pm[p.id] = p);
    const sched = {}; const hours = {}; st.pilots.forEach(p => { sched[p.id] = []; hours[p.id] = 0; });
    st.pairings.forEach(pr => { const h = pairingHours(pr); ['C', 'F', 'T'].forEach(s => { const id = pr.crew[s];
      if (id && sched[id]) { sched[id].push(pr); hours[id] += h; } }); });
    return { pm, sched, hours };
  }
  // 公平权重：按可用天数折算的工时份额（仅用于均衡，不是规则）
  function shareFor(p) { return Math.max(0.05, (DAYS - (p.leave || []).length) / DAYS); }


  // ---------- CCAR-121-R8 / EU.COM 累积与节奏硬规则（121.487 / 121.495 · 3.6.4 / 3.6.10）----------
  // 值勤区间：飞行值勤 = [报到, 退场]；主备份按日历日 [日初, 日末) 计入「值勤日」与 144h 窗口。
  function pilotDutyIntervals(p, st, idx, excludeId) {
    const iv = [];
    (idx.sched[p.id] || []).forEach(o => { if (excludeId && o.id === excludeId) return; dutyIvs(o, st).forEach(([a, b]) => iv.push([a, b, 'F', o.id])); });
    ((st.standby || {})[p.id] || []).forEach(d => { if (d >= 1 && d <= DAYS) iv.push([(d - 1) * DAY, d * DAY, 'S', 'SB' + d]); });
    return iv.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  function opDays(pr) { const s = new Set(); pr.legs.forEach(l => { if (l.dh) return; const a = Math.floor(l.dep / DAY) + 1, b = Math.floor((l.arr - 1) / DAY) + 1; for (let d = a; d <= b; d++) s.add(d); }); return [...s]; }
  function dhOnlyDays(pr) { const op = new Set(opDays(pr)); const s = new Set(); pr.legs.forEach(l => { if (!l.dh) return; const d = Math.floor(l.dep / DAY) + 1; if (!op.has(d)) s.add(d); }); return [...s]; }
  // 第 5 日置位：4 个连续值勤日后第 5 日只有置位(随)——合规但尽量避免（软）
  function day5Deadheads(p, st, idx, excludeId, extraPairing) {
    const f = dutyDayFlags(p, st, idx, excludeId, extraPairing); const prs = (idx.sched[p.id] || []).filter(o => !excludeId || o.id !== excludeId).concat(extraPairing ? [extraPairing] : []);
    const out = []; prs.forEach(o => dhOnlyDays(o).forEach(d => { if (!f[d] && d > 4 && [1, 2, 3, 4].every(k => f[d - k])) out.push({ pr: o, d }); })); return out; }
  function dutyDayFlags(p, st, idx, excludeId, extraPairing) {
    const f = Array(DAYS + 2).fill(false);
    // 121.495(b) 连续值勤日：当日以机组成员身份执飞（含跨日落地）或主备份才计；仅置位(随)的日子不计（用户确认口径）
    (idx.sched[p.id] || []).forEach(o => { if (excludeId && o.id === excludeId) return; opDays(o).forEach(d => { if (d >= 1 && d <= DAYS) f[d] = true; }); });
    if (extraPairing) opDays(extraPairing).forEach(d => { if (d >= 1 && d <= DAYS) f[d] = true; });
    ((st.standby || {})[p.id] || []).forEach(d => { if (d >= 1 && d <= DAYS) f[d] = true; });
    return f;
  }
  function pilotFdpByDay(p, st, idx, excludeId, extraPairing) {
    const a = Array(DAYS + 2).fill(0);
    (idx.sched[p.id] || []).forEach(o => { if (excludeId && o.id === excludeId) return;
      fdpDays(o, st).forEach(dy => { if (dy.date >= 1 && dy.date <= DAYS) a[dy.date] += dy.planFdp; }); });
    if (extraPairing) fdpDays(extraPairing, st).forEach(dy => { if (dy.date >= 1 && dy.date <= DAYS) a[dy.date] += dy.planFdp; });
    return a;
  }
  // 在 [t0 - 144h, t0) 内是否存在连续 ≥48h 的无值勤空隙（t<0 视为已休息）
  function has48hRestBefore(intervals, t0) {
    const W = 144 * 60, need = 48 * 60; const ws = t0 - W; // 无上月履历时 t<0 区间视为已休息（演示月可排满月初；窗口外不计入值勤）
    const clipped = [];
    intervals.forEach(([a, b]) => { const x = Math.max(a, ws), y = Math.min(b, t0); if (y > x) clipped.push([x, y]); });
    clipped.sort((a, b) => a[0] - b[0]);
    const merged = [];
    clipped.forEach(iv => { if (!merged.length || iv[0] > merged[merged.length - 1][1]) merged.push(iv.slice());
      else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]); });
    let cursor = ws;
    for (const [a, b] of merged) { if (a - cursor >= need) return true; cursor = Math.max(cursor, b); }
    return t0 - cursor >= need;
  }
  function ftlCheckPerson(p, pr, st, idx, opt) {
    opt = opt || {}; const rs = [];
    const already = (idx.sched[p.id] || []).includes(pr);
    const ex = opt.excludeId || '';
    const extra = already ? null : pr;
    // 合并后日程（含本任务）：须对整份结果做 144h/第5日/累积检查（含前向影响）
    // 注意：已排任务校验时不得把 pr 自身排除，否则连续日/144h 会漏报
    const others = (idx.sched[p.id] || []).filter(o => o.id !== ex);
    const allPr = extra ? others.concat([pr]) : others.slice();
    // 1) 每一飞行任务报到前 144h 内须有连续 48h 休息
    const ivP = allPr.map(x => [report(x, st), release(x, st)]); const ivD = allPr.map(x => dutyIvs(x, st));
    const ivS = []; ((st.standby || {})[p.id] || []).forEach(d => { if (d >= 1 && d <= DAYS) ivS.push([(d - 1) * DAY, d * DAY]); });
    for (let oi = 0; oi < allPr.length; oi++) {
      const iv = [];
      for (let xi = 0; xi < allPr.length; xi++) if (xi !== oi && allPr[xi] !== allPr[oi]) ivD[xi].forEach(v => iv.push(v));
      for (const v of ivS) iv.push(v);
      if (!has48hRestBefore(iv, ivP[oi][0])) rs.push('144h内无连续48h休息(121.495/3.6.10)');
    }
    // 1b) 每一主备份日开始前 144h 内同样须有连续 48h 休息（新增任务不得破坏已排备份）
    if (extra) for (let si = 0; si < ivS.length; si++) {
      const iv = []; ivD.forEach(a => a.forEach(v => iv.push(v))); ivS.forEach((v, k) => { if (k !== si) iv.push(v); });
      if (!has48hRestBefore(iv, ivS[si][0])) { rs.push('主备份前144h内无连续48h休息(121.495/3.6.10)'); break; }
    }
    // 2) 任一飞行日：若前 4 个日历日均为飞行值勤或主备份，则违规
    const flags = dutyDayFlags(p, st, idx, ex, extra);
    const flew = Array(DAYS + 2).fill(false);
    // CCAR-121.495(b) / EU.COM 3.6.10 2)：值勤+主备份达 4 个连续日历日后，第 5 个日历日不得「执行任何飞行任务」。
    // 第 5 日只看执飞航段（置位(随)回基地不是飞行任务；前日航班落地/放行跨入当日也不算当日执行飞行任务）
    allPr.forEach(o => o.legs.forEach(l => { if (l.dh) return; const a = Math.floor(l.dep / DAY) + 1, b = Math.floor((l.arr - 1) / DAY) + 1; for (let d = a; d <= b; d++) if (d >= 1 && d <= DAYS) flew[d] = true; }));
    for (let d = 1; d <= DAYS; d++) {
      if (!flew[d]) continue;
      let prior4 = true;
      for (let k = 1; k <= 4; k++) { const dd = d - k; if (dd < 1 || !flags[dd]) { prior4 = false; break; } }
      if (prior4) rs.push('连续4值勤日后第5日不得执飞(121.495(b),D' + d + ')');
    }
    // 3) 任意连续 7 日历日飞行值勤期 ≤60h；4) 月飞行值勤期 ≤210h
    const fdp = pilotFdpByDay(p, st, idx, ex, extra);
    let monthFdp = 0; for (let d = 1; d <= DAYS; d++) monthFdp += fdp[d];
    if (monthFdp > CCAR121.monthFdpH * 60 + 1e-9) rs.push('月飞行值勤期超' + CCAR121.monthFdpH + 'h(' + (monthFdp / 60).toFixed(1) + 'h)');
    for (let s = 1; s <= DAYS - 6; s++) {
      let sum = 0; for (let k = 0; k < 7; k++) sum += fdp[s + k];
      if (sum > CCAR121.sevenDayFdpH * 60 + 1e-9) { rs.push('连续7日飞行值勤超' + CCAR121.sevenDayFdpH + 'h(D' + s + '-' + (s + 6) + ':' + (sum / 60).toFixed(1) + 'h)'); break; }
    }
    // 5) 年飞行 900h：本月 + 可选 ytdFlightH
    const ytd = +(p.ytdFlightH || 0); const monthH = idx.hours[p.id] + (already ? 0 : pairingHours(pr));
    if (ytd + monthH > CCAR121.yearFlightH + 1e-9) rs.push('年飞行时间超' + CCAR121.yearFlightH + 'h(YTD+本月 ' + (ytd + monthH).toFixed(1) + 'h)');
    return [...new Set(rs)];
  }

  const hardCap = st => st.settings.hardMaxHours || 100;
  // 个人月飞行硬上限：取公司 hardMaxHours 与体检 maxMonthH 的更严者
  function pilotHardCap(p, st) {
    const base = hardCap(st);
    const m = p && p.health && p.health.maxMonthH;
    if (m != null && m > 0) return Math.min(base, m);
    return base;
  }
  // 某人能否执行某任务（不含组合规则）。返回 [ok, reasons[] ]
  // opt.slot：座位 C/F/T，用于「非唯一机长」禁 C 位
  function personCheck(p, pr, st, idx, opt) {
    progBeat();
    opt = opt || {}; const rs = []; const S = st.settings;
    // 机队资质：空客中队飞 A3xx，C909 中队飞 C909
    if (p.fleet && pr.ac) {
      const needC9 = pr.ac === 'C909';
      const isC9 = p.fleet === 'C909';
      if (needC9 !== isC9) rs.push(needC9 ? '非C909机队资质' : '非空客机队资质');
    }
    const dt = spanDays(pr, st);
    const lv = dt.filter(d => (p.leave || []).includes(d)); if (lv.length) rs.push('请假(' + lv.join(',') + '日)');
    const sbd = dt.filter(d => ((st.standby || {})[p.id] || []).includes(d)); if (sbd.length) rs.push('备份日冲突(' + sbd.join(',') + '日)');
    const trd = dt.filter(d => ((st.training || {})[p.id] || []).includes(d)); if (trd.length) rs.push('培训日冲突(' + trd.join(',') + '日)');
    if (!opt.ignorePrefs) { const pf = dt.filter(d => (p.prefs || []).includes(d)); if (pf.length) rs.push('意向休息日(' + pf.join(',') + '日)'); }
    if (!opt.ignorePrefs && !opt.skipFtl) { const d5 = day5Deadheads(p, st, idx, opt.excludeId, idx.sched[p.id].includes(pr) ? null : pr).filter(x => x.pr === pr); if (d5.length) rs.push('第5日置位(尽量避免,D' + d5.map(x => x.d).join(',') + ')'); }
    const a = report(pr, st), b = release(pr, st), rest = S.minRestH * 60;
    for (const o of idx.sched[p.id]) { if (o === pr || o.id === (opt.excludeId || '')) continue;
      const oa = report(o, st), ob = release(o, st);
      if (oa < b && a < ob) { rs.push('时间冲突(' + o.id + ')'); continue; }
      if ((oa >= b && oa - b < rest) || (a >= ob && a - ob < rest)) rs.push('休息不足' + S.minRestH + 'h(' + o.id + ')'); }
    const h = pairingHours(pr), already = idx.sched[p.id].includes(pr);
    const cap = pilotHardCap(p, st);
    if (!already && idx.hours[p.id] + h > cap + 1e-9) {
      const personal = p.health && p.health.maxMonthH > 0 && p.health.maxMonthH < hardCap(st);
      rs.push(personal ? ('超出个人月飞行上限' + cap + 'h') : ('超出月飞行小时硬上限' + cap + 'h'));
    }
    healthBlocks(p, pr, st, opt).forEach(x => rs.push(x));
    if (!opt.skipFtl) ftlCheckPerson(p, pr, st, idx, opt).forEach(x => rs.push(x));
    return [rs.length === 0, rs];
  }

  // ---------- 节奏（休息间隔） ----------
  // 两个相邻任务之间的空闲天数（扣除请假日与意向休息日）
  function pDays(pr, st) { return [Math.floor(report(pr, st) / DAY) + 1, Math.floor((release(pr, st) - 1) / DAY) + 1]; }
  function restGaps(p, list, st) {
    const ds = list.map(pr => pDays(pr, st)).sort((a, b) => a[0] - b[0]); const g = [];
    const ex = new Set([...(p.leave || []), ...(p.prefs || [])]);
    for (let i = 1; i < ds.length; i++) { let n = 0; for (let d = ds[i - 1][1] + 1; d < ds[i][0]; d++) if (!ex.has(d)) n++; g.push(n); }
    return g;
  }
  // 实飞记录校准（2026-06/07）：休 3–4 天为主，休 2 天偶有（约 2 次/两月），休 1 天应避免；≥5 天轻罚
  const gapCostOne = g => g <= 0 ? 1.4 : g === 1 ? 1.0 : g === 2 ? 0.4 : (g === 3 || g === 4) ? 0 : g === 5 ? 0.25 : 0.5 + 0.1 * (g - 6);
  const gapCost = (p, list, st) => restGaps(p, list, st).reduce((s, g) => s + gapCostOne(g), 0);

  // 节奏增量：加入 pr 后的休息间隔代价变化 + 飞行块长度偏好（3 天最佳）
  function rhythmDelta(q, pr, st, idx) {
    const sc = idx.sched[q.id] || [];
    let d = gapCost(q, sc.concat([pr]), st) - gapCost(q, sc, st);
    const days = new Set(); sc.forEach(x => daysTouched(x, st).forEach(v => days.add(v))); daysTouched(pr, st).forEach(v => days.add(v));
    let lo = pr.start, hi = pr.start + pr.ndays - 1; while (days.has(lo - 1)) lo--; while (days.has(hi + 1)) hi++;
    const len = hi - lo + 1;
    d += len === 3 ? -0.45 : len === 2 ? -0.1 : len === 4 ? 0.35 : len >= 5 ? 1.2 : 0.2;
    return d;
  }
  // 新机长任 C 需教员陪飞 → C 位工时软顶较低；任观察员(T)不需教员，按普通软顶
  const softCapOf = (p, slot) => isNew(p.rank) && slot !== 'T' ? SOFT_NEW + 4 : SOFT_MAX;
  // 先免 FTL 快检，通过后再做完整 FTL（R8/48h/第5日等硬规则不放松）
  function pcOK(q, pr, st, idx, slot) {
    if (!personCheck(q, pr, st, idx, { ignorePrefs: true, slot, skipFtl: true })[0]) return false;
    return personCheck(q, pr, st, idx, { ignorePrefs: true, slot })[0];
  }
  // 软工时带（实飞校准：月值勤 12–14 天 × 2 段/日 ≈ 4–4.5h → 典型 45–64h；硬顶仍为法规 100h）
  const SOFT_MAX = 70, SOFT_AIM = 63; let SOFT_NEW = 36; // 轻量版教员/新机长比例高，autoFill 内放宽
  // ---------- 求解器 ----------
  // 多次随机扰动求解，取最优（硬违规最少 → 软违规最少 → 节奏/工时更均衡）
  // ---------- 进度上报（Worker/主线程共用）：阶段 + 节流心跳 ----------
  let PROG = null; let PROG_N = 0;
  function progStage(key, detail) { if (PROG) PROG.stage(key, detail); }
  function progBeat(detail) { if (PROG && ((++PROG_N & 63) === 0 || detail)) PROG.beat(detail); }
  // 阶段相对耗时（Node 实测，单轮）；用于把阶段映射成连续百分比与 ETA
  const STAGE_LABEL = { init: '准备', fill: '组合航段', refill: '补位重排', phase: '工时均衡', swap: '互换优化', repairFtl: 'FTL 修复', repairCrewIssues: '机组搭配修复',
    bandBalance: '工时带调整', liftFoBand: '副驾工时提升', bandPull: '工时带拉齐', fairConcentrate: '公平调整', refillAfterConcentrate: '公平后补洞',
    fillBandHoles: '补洞', spreadInstrT: '教员观察位分摊', rhythmRepair: '节奏优化(3飞3–4休)', swapNewCaptHoles: '新机长缺口互换', topUpNewCapt: '新机长补班',
    assignStandby: '备份编排', assignTraining: '培训', summarize: '汇总校验' };
  // 阶段实测耗时序列（Node，单轮；scripts 重测后更新）
  const STAGE_SEQ_MAIN = [["init",14],["fill",3796],["refill",263],["phase",7624],["swap",2294],["bandPull",9734],["liftFoBand",60],["repairFtl",37],["refill",537],["repairFtl",10],["repairCrewIssues",3],["bandBalance",36],["liftFoBand",25],["bandPull",2686],["fairConcentrate",1040],["repairCrewIssues",1],["repairFtl",10],["refillAfterConcentrate",2131],["repairCrewIssues",2],["repairFtl",11],["fairConcentrate",387],["repairCrewIssues",2],["repairFtl",10],["fairConcentrate",134],["bandBalance",0],["fillBandHoles",1616],["repairCrewIssues",2],["repairFtl",11],["spreadInstrT",2],["repairFtl",11],["rhythmRepair",550],["repairFtl",11],["swapNewCaptHoles",15],["topUpNewCapt",550],["fairConcentrate",444],["swapNewCaptHoles",11],["fillBandHoles",1422],["repairCrewIssues",2],["repairFtl",12],["assignStandby",47],["assignTraining",6],["summarize",53]];
  const STAGE_SEQ_LITE = [["init",8],["fill",502],["refill",7],["phase",508],["swap",59],["bandPull",29],["liftFoBand",1],["repairFtl",5],["refill",0],["repairFtl",4],["repairCrewIssues",1],["bandBalance",0],["liftFoBand",0],["bandPull",7],["fairConcentrate",0],["repairCrewIssues",0],["repairFtl",5],["refillAfterConcentrate",3],["repairCrewIssues",0],["repairFtl",5],["fairConcentrate",0],["repairCrewIssues",0],["repairFtl",2],["fairConcentrate",0],["bandBalance",1],["fillBandHoles",1],["repairCrewIssues",0],["repairFtl",2],["spreadInstrT",1],["repairFtl",1],["rhythmRepair",24],["repairFtl",2],["swapNewCaptHoles",1],["topUpNewCapt",0],["fairConcentrate",0],["swapNewCaptHoles",0],["fillBandHoles",0],["repairCrewIssues",1],["repairFtl",1],["assignStandby",7],["assignTraining",2],["summarize",12]];
  function makeProgress(cb, K, seq) {
    // seq：[[阶段键, 实测 ms], ...] 按出现顺序；权重取实测耗时，运行中按已完成部分的实际速度重标定（ETA）
    seq = (seq || []).filter(x => x[0] !== 'init' && x[0] !== 'done');
    const t0 = Date.now(); const wAt = j => (seq[j] ? Math.max(1, seq[j][1]) : 1);
    const W = seq.reduce((a, x) => a + Math.max(1, x[1]), 0);
    let round = 0, i = -1, key = 'init', detail = '', stT = t0, doneW = 0, lastEmit = 0, msPerW = null;
    const pctNow = () => { const w = wAt(Math.max(0, i)); const exp = msPerW ? msPerW * w : w;
      const inStage = Math.min(0.97, (Date.now() - stT) / Math.max(1, exp));
      return Math.min(0.995, (round * W + doneW + w * inStage) / (K * W)); };
    const emit = force => { const now = Date.now(); if (!force && now - lastEmit < 150) return; lastEmit = now;
      const pct = pctNow(), el = (now - t0) / 1000;
      cb({ pct, round: round + 1, rounds: K, stage: STAGE_LABEL[key] || key, key, detail, elapsed: el, eta: pct > 0.02 ? el * (1 - pct) / pct : null }); };
    return {
      round(r) { round = r; i = -1; doneW = 0; emit(true); },
      stage(k, d) { const now = Date.now(); if (i >= 0) { const wPrev = wAt(i); doneW += wPrev; const spent = now - t0; const wDone = round * W + doneW; msPerW = spent / Math.max(1, wDone); }
        i++; key = k; detail = d || ''; stT = now; emit(true); },
      beat(d) { if (d) detail = d; emit(false); },
      done() { cb({ pct: 1, round: K, rounds: K, stage: '完成', key: 'done', detail: '', elapsed: (Date.now() - t0) / 1000, eta: 0 }); }
    };
  }
  function solutionScore(s) {
    const fly = (s.per || []).filter(x => x.hours > 0.5);
    const inBand = fly.length ? fly.filter(x => x.hours >= 40 && x.hours <= 60).length / fly.length : 0;
    return s.hard * 1e6 + s.soft * 1e3 + (1 - (s.rhythm.gap34 != null ? s.rhythm.gap34 : s.rhythm.gap23)) * 90 + (1 - inBand) * 120 + s.all.std * 0.15;
  }
  function crewDiff(a, b) { let n = 0, d = 0; a.forEach((c, i) => { const o = b[i] || {}; ['C', 'F', 'T'].forEach(k => { if (!c[k] && !o[k]) return; n++; if (c[k] !== o[k]) d++; }); }); return n ? d / n : 0; }
  // 每次点击：新种子 → 不同但合法的方案；lite 内部跑 2–3 个种子取 KPI 最优且与历史方案差异 ≥ minDiff
  function autoFillDiverse(st, opts) {
    opts = opts || {}; const seed = opts.seed != null ? opts.seed >>> 0 : (Date.now() % 1e9) >>> 0;
    const tries = opts.tries || (st.lite ? 3 : 1); const prev = opts.prevCrews || []; const minDiff = opts.minDiff != null ? opts.minDiff : 0.4;
    const onS = opts.onStatus; let best = null;
    for (let i = 0; i < tries; i++) { const sd = (seed + i * 7919) >>> 0;
      const s = autoFill(st, Object.assign({}, opts, { seed: sd, onStatus: onS ? (x => onS(Object.assign({}, x, { pct: (i + (x.pct || 0)) / tries, detail: (x.detail ? x.detail + ' · ' : '') + `候选 ${i + 1}/${tries}` }))) : null }));
      const crews = st.pairings.map(p => Object.assign({}, p.crew));
      const d = prev.length ? Math.min(...prev.map(pc => crewDiff(crews, pc))) : 1;
      const sc = solutionScore(s) + (d < minDiff ? 1e7 : 0);
      if (!best || sc < best.sc) best = { sc, crews, sb: JSON.stringify(st.standby || null), tr: JSON.stringify(st.training || null), seed: sd, diff: d }; }
    st.pairings.forEach((p, i) => p.crew = best.crews[i]); st.standby = JSON.parse(best.sb); st.training = JSON.parse(best.tr);
    return { seed: best.seed, diff: best.diff, tries };
  }

  // ---------- 同级别换班（员工福利 + 排班移动类型） ----------
  // 同级 = rank 完全相同。aPrs：A 的任务 → 给 B；bPrs：B 的任务 → 给 A（为空即单向）。
  function swapMoves(st, aId, bId, aPrs, bPrs) { const mv = [];
    (aPrs || []).forEach(id => { const pr = st.pairings.find(x => x.id === id); const s = pr && ['C', 'F', 'T'].find(k => pr.crew[k] === aId); if (s) mv.push({ pairing: id, slot: s, from: aId, to: bId }); });
    (bPrs || []).forEach(id => { const pr = st.pairings.find(x => x.id === id); const s = pr && ['C', 'F', 'T'].find(k => pr.crew[k] === bId); if (s) mv.push({ pairing: id, slot: s, from: bId, to: aId }); });
    return mv; }
  function swapPreview(st, aId, bId, aPrs, bPrs) {
    const pm = {}; st.pilots.forEach(p => pm[p.id] = p); const A = pm[aId], B = pm[bId]; const issues = [];
    if (!A || !B) return { ok: false, issues: ['人员不存在'], moves: [] };
    if (A.rank !== B.rank) issues.push(`级别不同：${A.rank} ≠ ${B.rank}（同级别换班要求级别一致）`);
    const moves = swapMoves(st, aId, bId, aPrs, bPrs); if (!moves.length) issues.push('未选择要交换的任务');
    moves.forEach(m => { const pr = st.pairings.find(x => x.id === m.pairing); if (Object.values(pr.crew).includes(m.to) && !moves.some(n => n.pairing === m.pairing && n.from === m.to)) issues.push(`${m.to === aId ? A.name : B.name} 已在 ${pr.id}`); });
    const rel = (s, ids) => validate(s).filter(v => (v.level === 'hard' && !INTRINSIC_TYPES.has(v.type) || v.type === '第5日置位') && (v.pilot === aId || v.pilot === bId || (!v.pilot && ids.has(v.pairing))));
    const ids = new Set(moves.map(m => m.pairing)); const before = rel(st, ids); const bset = new Set(before.map(v => v.msg));
    const w = Object.assign({}, st, { pairings: st.pairings.map(x => Object.assign({}, x, { crew: Object.assign({}, x.crew) })) });
    moves.forEach(m => { w.pairings.find(x => x.id === m.pairing).crew[m.slot] = m.to; });
    const after = rel(w, ids); const newHard = after.filter(v => v.level === 'hard' && !bset.has(v.msg)), newSoft = after.filter(v => v.level !== 'hard' && !bset.has(v.msg));
    const resolved = before.filter(v => !after.some(x => x.msg === v.msg));
    const i0 = buildIndex(st), i1 = buildIndex(w);
    const hours = { [aId]: [i0.hours[aId], i1.hours[aId]], [bId]: [i0.hours[bId], i1.hours[bId]] };
    return { ok: !issues.length && !newHard.length, issues, newHard, newSoft, resolved, moves, hours, a: aId, b: bId };
  }
  function applySwap(st, plan, note) { if (!plan || !plan.ok) return false;
    plan.moves.forEach(m => { const pr = st.pairings.find(x => x.id === m.pairing); if (pr) { pr.crew[m.slot] = m.to; if (pr.forced) delete pr.forced[m.slot]; } });
    (st.swaps = st.swaps || []).push({ at: Date.now(), a: plan.a, b: plan.b, moves: plan.moves, note: note || '同级换班' }); return true; }
  // 换班作为排班移动：① 空座：候选 x 只因另一任务 Q 冲突 → Q 换给同级 y，x 补空座；② 高工时/第5日置位 → 单向转给同级低工时者
  // 同级转让：把 fromId 在任务 prId 上的座位直接给同级空闲人员（休息/未排班），按工时升序
  // 返回每人：ok(全部硬规则通过)、reasons、soft(意向休息日/第5日置位)、工时前后、任务前后休息
  function transferCandidates(st, prId, fromId, opt) {
    opt = opt || {}; const pr = st.pairings.find(x => x.id === prId); if (!pr) return []; const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === fromId); if (!slot) return [];
    const from = st.pilots.find(x => x.id === fromId); const idx = buildIndex(st); const h = pairingHours(pr); const a = report(pr, st), b = release(pr, st);
    const out = candidates(st, pr, slot).filter(c => c.p.id !== fromId && c.p.rank === from.rank).map(c => {
      const sc = (idx.sched[c.p.id] || []).filter(o => o !== pr); const prev = sc.filter(o => release(o, st) <= a).map(o => release(o, st)), next = sc.filter(o => report(o, st) >= b).map(o => report(o, st));
      const soft = []; if (c.warn) soft.push(c.warn.replace('意向休息日', '占用申请的意向休息日 ') + '（普通休息，可用）');
      if (c.crewWarn) soft.push(c.crewWarn);
      if (c.ok) { const keep = pr.crew[slot]; pr.crew[slot] = c.p.id; const i2 = buildIndex(st); if (day5Deadheads(c.p, st, i2).some(x => x.pr === pr)) soft.push('第5日置位（合规，尽量避免）'); pr.crew[slot] = keep; }
      return { p: c.p, ok: c.ok && (slot === 'T' || !c.crewWarn), reasons: c.reasons, soft, slot,
        hoursBefore: idx.hours[c.p.id], hoursAfter: idx.hours[c.p.id] + h,
        restBefore: prev.length ? (a - Math.max(...prev)) / 60 : null, restAfter: next.length ? (Math.min(...next) - b) / 60 : null };
    });
    return out.sort((x, y) => (y.ok - x.ok) || (x.soft.length - y.soft.length) * (opt.softFirst ? 1 : 0) || x.hoursBefore - y.hoursBefore);
  }
  function applyTransfer(st, prId, fromId, toId, note) { const pv = swapPreview(st, fromId, toId, [prId], []); if (!pv.ok) return pv; applySwap(st, pv, note || '同级转让'); return pv; }
  function swapFillHoles(st, opt) { opt = opt || {}; const t0 = Date.now(), budget = opt.ms || 4000; const log = [];
    for (const P of st.pairings) { for (const s of ['C', 'F', 'T']) { if (P.crew[s] || Date.now() - t0 > budget) continue;
      const cs = candidates(st, P, s).filter(c => !c.ok && slotRankOK(s, c.p.rank) && c.reasons.length <= 3).sort((a, b) => a.reasons.length - b.reasons.length).slice(0, 30);
      let done = false;
      for (const cx of cs) { if (done || Date.now() - t0 > budget) break; const x = cx.p; const idx = buildIndex(st);
        const near = (idx.sched[x.id] || []).filter(Q => Q !== P && cx.reasons.some(r => r.includes(Q.id)) || (Q.start <= P.start + P.ndays + 1 && Q.start + Q.ndays >= P.start - 1));
        for (const Q of near.slice(0, 3)) { const qs = ['C', 'F', 'T'].find(k => Q.crew[k] === x.id); if (!qs) continue;
          const ys = transferCandidates(st, Q.id, x.id).filter(c => c.ok && !c.soft.length).slice(0, 6);
          for (const cy of ys) { Q.crew[qs] = cy.p.id; const cx2 = candidates(st, P, s).find(c => c.p.id === x.id);
            if (cx2 && cx2.ok && (s === 'T' || !cx2.crewWarn)) { P.crew[s] = x.id; log.push({ kind: 'swapFill', pairing: P.id, slot: s, pilot: x.id, via: Q.id, to: cy.p.id }); done = true; break; }
            Q.crew[qs] = x.id; }
          if (done) break; } }
    } }
    return log; }
  function swapBalance(st, opt) { opt = opt || {}; const t0 = Date.now(), budget = opt.ms || 3000; const log = []; const cap = opt.highH || 60;
    for (let it = 0; it < (opt.maxIter || 40) && Date.now() - t0 < budget; it++) {
      const idx = buildIndex(st); let moved = false;
      // 第5日置位优先，其次最高工时
      const d5 = []; st.pilots.forEach(p => day5Deadheads(p, st, idx).forEach(x => d5.push({ p, pr: x.pr, why: 'day5' })));
      const hi = st.pilots.filter(p => idx.hours[p.id] > cap).sort((a, b) => idx.hours[b.id] - idx.hours[a.id]).slice(0, 3).flatMap(p => idx.sched[p.id].slice().sort((a, b) => pairingHours(a) - pairingHours(b)).map(pr => ({ p, pr, why: 'hours' })));
      for (const { p, pr, why } of d5.concat(hi)) { const s = ['C', 'F', 'T'].find(k => pr.crew[k] === p.id); if (!s || (pr.forced && pr.forced[s])) continue;
        const ys = transferCandidates(st, pr.id, p.id).filter(c => c.ok && !c.soft.length && (why === 'day5' || c.hoursAfter < idx.hours[p.id] - 1e-6)).slice(0, 5).map(c => ({ p: c.p }));
        for (const cy of ys) { pr.crew[s] = cy.p.id; const i2 = buildIndex(st); const d5after = day5Deadheads(cy.p, st, i2).length, d5before = day5Deadheads(cy.p, st, idx).length;
          if (d5after > d5before) { pr.crew[s] = p.id; continue; } log.push({ kind: 'swap-' + why, pairing: pr.id, slot: s, from: p.id, to: cy.p.id }); moved = true; break; }
        if (moved) break; }
      if (!moved) break; }
    return log; }
  // 收尾：任何违反人员/机组硬规则的座位一律清空 → 残余只表现为「空座」。
  // 任务自身（估算时刻）的日飞行/执勤期超限与人员无关，保留为数据警告；强制指派的座位不动。
  const INTRINSIC_TYPES = new Set(['未满员', '日飞行时间超限', '执勤期超限', '强制指派']);
  function clearHardSeats(st) { let cleared = 0;
    for (let it = 0; it < 30; it++) {
      const vs = validate(st).filter(v => v.level === 'hard' && !INTRINSIC_TYPES.has(v.type) && v.pairing); if (!vs.length) break; let ch = 0;
      for (const v of vs) { const pr = st.pairings.find(x => x.id === v.pairing); if (!pr) continue; const fz = pr.forced || {};
        let slots = v.pilot ? ['C', 'F', 'T'].filter(s => pr.crew[s] === v.pilot) : ['T', 'F', 'C'].filter(s => pr.crew[s]).slice(0, 1);
        slots = slots.filter(s => !(fz[s] && fz[s].pilot === pr.crew[s]));
        slots.forEach(s => { pr.crew[s] = null; ch++; }); if (ch) break; }
      if (!ch) break; cleared += ch; }
    return cleared; }
  function autoFill(st, opts) {
    opts = opts || {};
    const big = (st.pairings || []).length > 800;
    const K = opts.attempts != null ? opts.attempts : (big ? 3 : st.lite ? 1 : 8); let best = null;
    FDP_PLAN_CACHE = new WeakMap(); const softNew0 = SOFT_NEW; if (st.lite) SOFT_NEW = 58;
    PROG = opts.onStatus ? makeProgress(opts.onStatus, K, opts.stageSeq || (st.lite ? STAGE_SEQ_LITE : STAGE_SEQ_MAIN)) : null; PROG_N = 0;
    try {
    const score = solutionScore;
    for (let k = 0; k < K; k++) {
      if (PROG) PROG.round(k);
      const res = autoFillOnce(st, Object.assign({}, opts, { noise: opts.seed != null ? rng((opts.seed >>> 0) * 31 + 9173 * k + 7) : k ? rng(9173 * k + 7) : null, noiseAmp: opts.noiseAmp,
        onProgress: opts.onProgress ? (x => opts.onProgress((k + x) / K)) : null }));
      const sc = score(res);
      if (!best || sc < best.sc) best = { sc, crew: st.pairings.map(p => Object.assign({}, p.crew)), sb: JSON.stringify(st.standby || null), k };
      if (res.hard === 0 && (res.soft <= 3 || k >= 1)) break;
    }
    st.pairings.forEach((p, i) => p.crew = best.crew[i]); st.standby = JSON.parse(best.sb);
    assignTraining(st);
    if (!opts.noSwap) { swapBalance(st, { ms: st.pairings.length > 800 ? 1500 : 3000 }); }
    clearHardSeats(st);
    if (!opts.noSwap) { swapFillHoles(st, { ms: 4000 }); clearHardSeats(st); }
    const out = summarize(st); out.attempt = best.k + 1; return out;
    } finally { if (PROG) PROG.done(); PROG = null; FDP_PLAN_CACHE = null; SOFT_NEW = softNew0; }
  }
  function autoFillOnce(st, opts) {
    opts = opts || {}; const nz = opts.noise; const S = st.settings; const keep = !!opts.keepExisting;
    if (!keep) { st.pairings.forEach(p => p.crew = { C: null, F: null, T: null }); st.standby = null; st.training = null; }
    // 外站驻点长块：先固定 新机长 + 教员 带飞对（整块同组），再由求解器补其余
    if (!keep) st.pairings.filter(p => p.fixedPair).forEach((pr, i) => {
      const free = q => !(q.health && q.health.noFly) && !(q.leave || []).some(d => d >= pr.start - 1 && d <= pr.start + pr.ndays);
      const ns = st.pilots.filter(q => isNew(q.rank) && free(q)), ts = st.pilots.filter(q => q.rank === 'TL' && free(q));
      if (ns.length && ts.length) { pr.crew.C = ns[(i * 3 + pr.start) % ns.length].id; pr.crew.F = ts[(i * 5 + pr.start) % ts.length].id; pr.pin = { C: pr.crew.C, F: pr.crew.F }; } /* 教员在副驾驶位（操作座）带飞新机长 */
    });
    const idx = buildIndex(st);
    const target = {}; const totalH = st.pairings.reduce((s, p) => s + pairingHours(p), 0) * 3;
    const activeN = Math.max(1, st.pilots.filter(p => !(p.health && p.health.noFly)).length);
    const availMean = totalH / activeN;
    // 运力约 27h/人：以 ~65% 公平主班吃满 40–60h，其余为跨职级均匀的闲置后备（不拿某一级当残差）
    const softT = Math.max(42, Math.min(58, 48));
    const big = st.pairings.length > 700;
    const concentrate = availMean < 42;
    st.pilots.forEach(p => target[p.id] = softT * shareFor(p));
    const primary = {};
    const PRIMARY_PCT = 70; // 先保覆盖；再按职级公平浓缩到 ~45h
    GROUPS.forEach(g => {
      const mem = st.pilots.filter(p => rankGroup(p.rank) === g && !(p.health && p.health.noFly));
      mem.forEach(p => {
        let h = 0; for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) | 0;
        primary[p.id] = (Math.abs(h) % 100) < PRIMARY_PCT;
      });
      if (mem.length && !mem.some(p => primary[p.id])) primary[mem[0].id] = true;
      // 按职级细档再校正：同一 rank 内主班比例也靠近 PRIMARY_PCT（防哈希偏斜）
      const byRank = {};
      mem.forEach(p => { (byRank[p.rank] = byRank[p.rank] || []).push(p); });
      Object.keys(byRank).forEach(rk => {
        const xs = byRank[rk].slice().sort((a, b) => a.id.localeCompare(b.id));
        if (xs.length < 8) { xs.forEach(p => { primary[p.id] = true; }); return; } // 小样本全飞，避免整级空白
        const need = Math.max(1, Math.round(xs.length * PRIMARY_PCT / 100));
        xs.forEach((p, i) => { primary[p.id] = i < need; });
      });
    });
    // 非主班软目标极低：局部改善/交换不会把他们当「最缺工时」来喂
    st.pilots.forEach(p => { if (!primary[p.id]) target[p.id] = Math.max(4, 8 * shareFor(p)); });
    const ratio = id => idx.hours[id] / target[id];
    const assign = (pr, s, id) => { const old = pr.crew[s]; const h = pairingHours(pr);
      if (old) { idx.sched[old] = idx.sched[old].filter(x => x !== pr); idx.hours[old] -= h; }
      pr.crew[s] = id; if (id) { idx.sched[id].push(pr); idx.hours[id] += h; } };
    const pilots = st.pilots;
    const hard = pr => { let w = 0; pr.legs.forEach(l => [l.from, l.to].forEach(c => { const cat = apCat(c, st);
      if (cat === 'LHASA') w += 100; else if (cat !== 'NONE') w += 10; })); if (pr.ac === 'A321') w += 5; return w; };
    const order = st.pairings.slice().sort((a, b) => (hard(b) > 0) - (hard(a) > 0) || a.legs[0].dep - b.legs[0].dep);

    const gw = (S.gapWeight == null ? 0.35 : S.gapWeight) * (concentrate ? 1.6 : 1);
    function fillOne(pr, ignorePrefs, primaryOnly) {
      const gdc = {}; const gd = p => gdc[p.id] != null ? gdc[p.id] : (gdc[p.id] = gw * (gapCost(p, idx.sched[p.id].concat([pr]), st) - gapCost(p, idx.sched[p.id], st)));
      const free = s => !pr.crew[s];
      const ok = (p, slot) => personCheck(p, pr, st, idx, { ignorePrefs, slot, skipFtl: big })[0];
      const instrL = pilots.filter(x => isInstr(x.rank)); const instrBusy = instrL.filter(x => idx.hours[x.id] > SOFT_MAX - 8).length / Math.max(1, instrL.length);
      const cur = { C: pr.crew.C && idx.pm[pr.crew.C], F: pr.crew.F && idx.pm[pr.crew.F], T: pr.crew.T && idx.pm[pr.crew.T] };
      const inCrew = id => Object.values(pr.crew).includes(id);
      const pool = primaryOnly ? pilots.filter(p => primary[p.id]) : pilots;
      const sortR = arr => arr.sort((a, b) => ratio(a.id) - ratio(b.id));
      const CAPN = primaryOnly ? (big ? 14 : 18) : (big ? 8 : 12);
      const FON = primaryOnly ? (big ? 12 : 16) : (big ? 6 : 10);
      const TN = primaryOnly ? (big ? 10 : 14) : (big ? 5 : 8);
      const newOK = p => !isNew(p.rank) || idx.hours[p.id] + pairingHours(pr) <= softCapOf(p); // 新机长受教员容量约束
      const capt = free('C') ? sortR(pool.filter(p => isCaptClass(p.rank) && !inCrew(p.id) && newOK(p) && ok(p, 'C'))).slice(0, CAPN) : [cur.C];
      const fos = sortR(pool.filter(p => isFO(p.rank) && !inCrew(p.id) && ok(p, 'F')));
      const capT = sortR(pool.filter(p => isCaptClass(p.rank) && !inCrew(p.id) && ok(p, 'T')));
      let best = null;
      for (const c of capt) {
        const Fl = free('F') ? fos.filter(x => x !== c).slice(0, FON) : [cur.F];
        let Tl;
        if (!free('T')) Tl = [cur.T];
        else if (isNew(c.rank)) Tl = capT.filter(x => isInstr(x.rank) && x !== c).slice(0, TN);
        else Tl = fos.slice(0, FON + 2).concat(capT.filter(x => x !== c).slice(0, big ? 3 : 6));
        for (const f of Fl) for (const t of Tl) {
          if (!f || !t || f === t || t === c) continue;
          if (crewIssue(pr, [c, f, t], st)) continue;
          const blk = p => {
            // 飞 2–4 / 休 2–3：续接已有飞块加分，拼成 ≥5 日重罚
            const days = new Set();
            idx.sched[p.id].forEach(x => daysTouched(x, st).forEach(d => days.add(d)));
            daysTouched(pr, st).forEach(d => days.add(d));
            let lo = pr.start, hi = pr.start + pr.ndays - 1;
            while (days.has(lo - 1)) lo--;
            while (days.has(hi + 1)) hi++;
            const len = hi - lo + 1;
            if (len === 3) return -0.36; // 飞 3 天为主
            if (len === 2) return -0.12;
            if (len === 4) return 0.3;
            if (len >= 5) return 1.0;
            return 0.15;
          };
          const act = (p, asT) => {
            const h = idx.hours[p.id];
            if (!asT && isNew(p.rank) && h > SOFT_NEW) return 1.4 + (h - SOFT_NEW) * 0.08; // 新机长受教员陪飞容量约束
            if (!primary[p.id]) {
              // 同职级主班未达 ~40h 前，后备极重罚（跨职级同一规则，不单杀某一级）
              const rk = p.rank;
              let under = 0, primN = 0;
              for (const q of pilots) {
                if (q.rank !== rk || !primary[q.id]) continue;
                primN++; if (idx.hours[q.id] < 40) under++;
              }
              if (!primN) return 0.5;
              if (under / primN > 0.2) return 4.5;
              if (under > 0) return 2.2;
              return 0.7;
            }
            if (h < 25) return -1.05;
            if (h < 40) return -0.7;
            if (h <= (SOFT_MAX - 5)) return -0.1;
            if (h <= (SOFT_MAX + 2)) return 0.55;
            return 1.15;
          };
          let sc = (free('C') ? ratio(c.id) + gd(c) + blk(c) + act(c) : 0)
            + (free('F') ? ratio(f.id) + gd(f) + blk(f) + act(f) : 0)
            + (free('T') ? ratio(t.id) + gd(t) + blk(t) + act(t, true) : 0);
          if (isFO(f.rank) && isFO(t.rank)) sc -= 0.006 * foComboScore(f.rank, t.rank); // RE12 fo_combination_matrix.preference_score（软）
          // 第三人：非新机长任务优先副驾驶，把机长工时留给 C 位（非歧视某副驾级别）
          if (free('T') && isCaptClass(t.rank) && !isNew(c.rank)) sc += isNew(t.rank) ? 0.1 : 1.2; // 新机长可任观察员补足值勤天数（不占教员）
          // 教员仅 ~6% 编制：新机长任 C 需教员陪飞，教员接近满载时少排新机长 C 位
          if (free('C') && isNew(c.rank)) sc += 0.25 + 1.2 * instrBusy;
          if (free('C') && isInstr(c.rank)) sc += 0.35 + 1.0 * instrBusy; // 教员优先留给新机长带飞 T 位
          if (nz) sc += nz() * (opts.noiseAmp || 0.25);
          if (!best || sc < best.sc) best = { sc, c, f, t };
        }
        if (best && capt.indexOf(c) >= 3) break;
      }
      if (!best) return false;
      if (free('C')) assign(pr, 'C', best.c.id); if (free('F')) assign(pr, 'F', best.f.id); if (free('T')) assign(pr, 'T', best.t.id);
      return true;
    }
    let n = 0;
    // 主班优先；集中模式下主填+放宽意向均不开放后备，避免工时被摊薄到 ~23h
    progStage('fill', '组合航段 0/' + order.length);
    for (const pr of order) { if (pr.crew.C && pr.crew.F && pr.crew.T) continue;
      if (!fillOne(pr, !S.honorPrefs, true)) fillOne(pr, !S.honorPrefs, false);
      n++; progBeat('组合航段 ' + n + '/' + order.length); if (opts.onProgress) opts.onProgress(n / order.length * 0.55); }
    progStage('refill');
    for (const pr of order) { if (pr.crew.C && pr.crew.F && pr.crew.T) continue;
      pr.crew = { C: pr.pin ? pr.pin.C : null, F: pr.pin ? pr.pin.F : null, T: null }; // 固定带飞对保留
      Object.keys(idx.sched).forEach(id => { idx.sched[id] = idx.sched[id].filter(x => x !== pr); });
      if (pr.pin) [pr.pin.C, pr.pin.F].forEach(id => { if (id && idx.sched[id]) idx.sched[id].push(pr); });
      recomputeHours();
      if (!fillOne(pr, true, true)) fillOne(pr, true, false); }
    function recomputeHours() { Object.keys(idx.hours).forEach(id => idx.hours[id] = idx.sched[id].reduce((s, x) => s + pairingHours(x), 0)); }
    recomputeHours();

    // 局部改进：替换使工时更均衡（集中模式跳过强均衡）
    const slotCls = (s, rank) => s === 'C' ? isCaptClass(rank) : s === 'F' ? isFO(rank) : true;
    const passes = opts.passes != null ? opts.passes : (big ? 2 : 6);
    const phases = big ? [[0, gw * 0.6]] : [[0, gw], [1, gw * 0.3]];
    const balPasses = concentrate ? Math.max(1, Math.floor(passes / 2)) : passes;
    progStage('phase');
    for (const [phase, gwX] of phases) for (let it = 0; it < balPasses; it++) {
      let improved = 0;
      for (const pr of st.pairings) { const h = pairingHours(pr);
        for (const s of ['C', 'F', 'T']) { const curId = pr.crew[s]; if (!curId) continue;
          const cp = idx.pm[curId];
          const grp = rankGroup(cp.rank);
          let bestQ = null, bestGain = 0;
          for (const q of pilots) {
            if (q.id === curId || Object.values(pr.crew).includes(q.id)) continue;
            if (!slotCls(s, q.rank)) continue;
            // 同类别内平衡（第三人位置允许跨类）
            if (s !== 'T' && rankGroup(q.rank) !== grp && !(s === 'C')) continue;
            // 集中/公平：不把任务改善给非主班，除非其已在飞且只是微调
            if (!primary[q.id] && idx.hours[q.id] < 5) {
              const underP = pilots.some(x => primary[x.id] && rankGroup(x.rank) === rankGroup(q.rank) && idx.hours[x.id] < 42);
              if (underP) continue;
            }
            const before = (ratio(curId) - 1) ** 2 + (ratio(q.id) - 1) ** 2;
            const hc = (idx.hours[curId] - h) / target[curId], hq = (idx.hours[q.id] + h) / target[q.id];
            const after = (hc - 1) ** 2 + (hq - 1) ** 2;
            let gain = before - after; if (gain + gwX * 3 <= bestGain + 1e-6) continue;
            const sc0 = idx.sched[curId], sq0 = idx.sched[q.id];
            gain -= gwX * (gapCost(cp, sc0.filter(x => x !== pr), st) - gapCost(cp, sc0, st) + gapCost(q, sq0.concat([pr]), st) - gapCost(q, sq0, st));
            if (gain <= bestGain + 1e-6) continue;
            if (!personCheck(q, pr, st, idx, { ignorePrefs: !S.honorPrefs, slot: s })[0]) continue;
            const crew = ['C', 'F', 'T'].map(x => x === s ? q : idx.pm[pr.crew[x]]);
            if (isNew(cp.rank) !== isNew(q.rank) && s !== 'T' && false) continue;
            if (crewIssue(pr, crew, st)) continue;
            bestQ = q; bestGain = gain;
          }
          if (bestQ) { assign(pr, s, bestQ.id); improved++; }
        } }
      if (opts.onProgress) opts.onProgress(0.6 + 0.2 * phase + 0.2 * (it + 1) / passes);
      if (!improved) break;
    }
    progStage('swap');
    // 交换：高工时者与低工时者互换任务（同岗位），缩小组内差距（集中模式跳过）
    const slotOf = (pr, id) => ['C', 'F', 'T'].find(k => pr.crew[k] === id);
    for (let it = 0; it < (concentrate ? 1 : (big ? 2 : 4)); it++) { let sw = 0;
      for (const g of GROUPS) {
        const mem = pilots.filter(p => rankGroup(p.rank) === g && primary[p.id]).sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
        if (mem.length < 4) continue;
        const q = Math.max(2, Math.ceil(mem.length / (big ? 5 : 4))); const hi = mem.slice(0, q), lo = mem.slice(-q).reverse();
        for (const a of hi) for (const b of lo) {
          const diff = idx.hours[a.id] - idx.hours[b.id]; if (diff < 3) continue;
          let done = false;
          for (const X of idx.sched[a.id].slice()) { if (done) break; const sx = slotOf(X, a.id); if (!slotCls(sx, b.rank) || Object.values(X.crew).includes(b.id)) continue;
            for (const Y of [null, ...idx.sched[b.id].slice()]) {
              const dh = pairingHours(X) - (Y ? pairingHours(Y) : 0); if (dh <= 0.4 || dh >= diff) continue;
              if (Y) { if (Y === X || Object.values(Y.crew).includes(a.id)) continue; if (!slotCls(slotOf(Y, b.id), a.rank)) continue; }
              const g0 = gapCost(a, idx.sched[a.id], st) + gapCost(b, idx.sched[b.id], st);
              const sy = Y && slotOf(Y, b.id);
              assign(X, sx, b.id); if (Y) assign(Y, sy, a.id);
              const ok = personCheck(b, X, st, idx, { ignorePrefs: !S.honorPrefs, slot: sx })[0] && idx.hours[b.id] <= pilotHardCap(b, st) + 1e-9 &&
                (!Y || personCheck(a, Y, st, idx, { ignorePrefs: !S.honorPrefs, slot: sy })[0]) &&
                !crewIssue(X, ['C', 'F', 'T'].map(k => idx.pm[X.crew[k]]), st) && (!Y || !crewIssue(Y, ['C', 'F', 'T'].map(k => idx.pm[Y.crew[k]]), st)) &&
                gapCost(a, idx.sched[a.id], st) + gapCost(b, idx.sched[b.id], st) - g0 <= 0.6;
              if (ok) { done = true; sw++; break; }
              if (Y) assign(Y, sy, b.id); assign(X, sx, a.id);
            } }
        } }
      if (!sw) break; }
    // 释放“三”位上非必要的机长类人员（换成副驾驶），为空缺任务腾出机长
    if (st.pairings.some(pr => !(pr.crew.C && pr.crew.F && pr.crew.T))) {
      for (const pr of st.pairings) { const t = pr.crew.T && idx.pm[pr.crew.T]; if (!t || !isCaptClass(t.rank)) continue;
        const fos = pilots.filter(q => isFO(q.rank) && !Object.values(pr.crew).includes(q.id)).sort((a, b) => ratio(a.id) - ratio(b.id));
        for (const q of fos) { if (!personCheck(q, pr, st, idx, { ignorePrefs: !S.honorPrefs, slot: 'T' })[0]) continue;
          if (crewIssue(pr, [idx.pm[pr.crew.C], idx.pm[pr.crew.F], q], st)) continue; assign(pr, 'T', q.id); break; } }
    }
    // 均衡后再次尝试补齐剩余空缺
    for (const pr of order) if (!(pr.crew.C && pr.crew.F && pr.crew.T)) {
      if (!fillOne(pr, !S.honorPrefs, true)) {
        if (!fillOne(pr, true, true)) fillOne(pr, true, false); // 最后才开放后备，保覆盖
      }
    }
    repairUnfilled(st);
    repairPrefs(st);
    progStage('bandPull');
    bandPull(st, primary, target); // 回收碎片/非主班 → 主班 <50h
    if (!concentrate) trimPeaks(st);
    else trimPeaks(st); // 轻削峰，防单人尖峰
    progStage('liftFoBand');
    liftFoBand(st, target, primary); // 各级内 >55→<40；观察员位机长→副驾
    progStage('repairFtl');
    repairFtl(st);
    // FTL 卸员后尝试再填一轮空缺
    progStage('refill');
    (function refill() {
      const idx = buildIndex(st);
      const order = st.pairings.filter(pr => !(pr.crew.C && pr.crew.F && pr.crew.T));
      const sortR = arr => arr.sort((a, b) => (primary[b.id] ? 1 : 0) - (primary[a.id] ? 1 : 0)
        || (idx.hours[a.id] < 40 ? 0 : 1) - (idx.hours[b.id] < 40 ? 0 : 1)
        || (idx.hours[a.id] < (SOFT_MAX - 10) ? 0 : 1) - (idx.hours[b.id] < (SOFT_MAX - 10) ? 0 : 1)
        || idx.hours[a.id] - idx.hours[b.id]);
      for (const pr of order) {
        const free = s => !pr.crew[s];
        const ok = (p, slot) => personCheck(p, pr, st, idx, { ignorePrefs: true, slot })[0];
        const inCrew = id => Object.values(pr.crew).includes(id);
        if (free('C')) {
          let caps = st.pilots.filter(p => isCaptClass(p.rank) && !inCrew(p.id) && (!isNew(p.rank) || idx.hours[p.id] + pairingHours(pr) <= softCapOf(p)) && ok(p, 'C'));
          if (caps.some(p => primary[p.id] && idx.hours[p.id] < (SOFT_MAX - 5))) caps = caps.filter(p => primary[p.id]);
          const c = sortR(caps)[0]; if (c) { pr.crew.C = c.id; idx.sched[c.id].push(pr); idx.hours[c.id] += pairingHours(pr); }
        }
        if (free('F')) {
          let fos = st.pilots.filter(p => isFO(p.rank) && !inCrew(p.id) && ok(p, 'F'));
          if (fos.some(p => primary[p.id] && idx.hours[p.id] < (SOFT_MAX - 5))) fos = fos.filter(p => primary[p.id]);
          const f = sortR(fos)[0]; if (f) { pr.crew.F = f.id; idx.sched[f.id].push(pr); idx.hours[f.id] += pairingHours(pr); }
        }
        if (free('T') && pr.crew.C && pr.crew.F) {
          const needInstr = isNew(idx.pm[pr.crew.C].rank);
          let ts = st.pilots.filter(p => !inCrew(p.id) && ok(p, 'T') && (!needInstr || isInstr(p.rank)));
          if (ts.some(p => primary[p.id] && idx.hours[p.id] < (SOFT_MAX - 5))) ts = ts.filter(p => primary[p.id]);
          const t = sortR(ts)[0];
          if (t) { const crew = [idx.pm[pr.crew.C], idx.pm[pr.crew.F], t]; if (!crewIssue(pr, crew, st)) { pr.crew.T = t.id; idx.sched[t.id].push(pr); idx.hours[t.id] += pairingHours(pr); } }
        }
      }
    })();
    progStage('repairFtl');
    repairFtl(st);
    progStage('repairCrewIssues');
    repairCrewIssues(st);
    progStage('bandBalance');
    bandBalance(st, target);
    progStage('liftFoBand');
    liftFoBand(st, target, primary);
    progStage('bandPull');
    for (let k = 0; k < 2; k++) bandPull(st, primary, target);
    progStage('fairConcentrate');
    if (!st.lite) fairConcentrate(st); // 各职级按本级工时池浓缩到 ~40–55h 飞行者，闲置比例跨级相近
    progStage('repairCrewIssues');
    repairCrewIssues(st);
    progStage('repairFtl');
    repairFtl(st);
    // 浓缩后补洞：优先已飞/同级不足 55h 者
    progStage('refillAfterConcentrate');
    (function refillAfterConcentrate() {
      const idx = buildIndex(st);
      const sortR = arr => arr.sort((a, b) => {
        const band = p => { const h = idx.hours[p.id]; if (h >= 18 && h < (SOFT_MAX - 5)) return 0; if (h >= 5 && h < SOFT_MAX) return 1; if (h < 5) return 3; return 2; };
        return band(a) - band(b) || idx.hours[a.id] - idx.hours[b.id];
      });
      for (const pr of st.pairings) {
        if (pr.crew.C && pr.crew.F && pr.crew.T) continue;
        const ok = (p, slot) => personCheck(p, pr, st, idx, { ignorePrefs: true, slot })[0];
        const inCrew = id => Object.values(pr.crew).includes(id);
        const put = (slot, p) => { pr.crew[slot] = p.id; idx.sched[p.id].push(pr); idx.hours[p.id] += pairingHours(pr); };
        if (!pr.crew.C) { const c = sortR(st.pilots.filter(p => isCaptClass(p.rank) && !inCrew(p.id) && ok(p, 'C')))[0]; if (c) put('C', c); }
        if (!pr.crew.F) { const f = sortR(st.pilots.filter(p => isFO(p.rank) && !inCrew(p.id) && ok(p, 'F')))[0]; if (f) put('F', f); }
        if (!pr.crew.T && pr.crew.C && pr.crew.F) {
          const needInstr = isNew(idx.pm[pr.crew.C].rank);
          const t = sortR(st.pilots.filter(p => !inCrew(p.id) && ok(p, 'T') && (!needInstr || isInstr(p.rank))))[0];
          if (t) { const crew = [idx.pm[pr.crew.C], idx.pm[pr.crew.F], t]; if (!crewIssue(pr, crew, st)) put('T', t); }
        }
      }
    })();
    progStage('repairCrewIssues');
    repairCrewIssues(st);
    progStage('repairFtl');
    repairFtl(st);
    // 补洞后再浓缩；禁止 repairUnfilled（会把工时重新摊回 0h 后备）
    progStage('fairConcentrate');
    if (!st.lite) fairConcentrate(st);
    progStage('repairCrewIssues');
    repairCrewIssues(st);
    progStage('repairFtl');
    repairFtl(st);
    progStage('fairConcentrate');
    if (!st.lite) fairConcentrate(st);
    progStage('bandBalance');
    bandBalance(st, target);
    // 最后补洞：只要 18–55h 带内有人可上就不启用 0h 后备
    progStage('fillBandHoles');
    fillBandHoles(st);
    progStage('repairCrewIssues');
    repairCrewIssues(st);
    progStage('repairFtl');
    repairFtl(st);
    progStage('spreadInstrT');
    spreadInstrT(st); // 新机长观察员位：教员工时互助，压尖峰
    progStage('repairFtl');
    repairFtl(st);
    progStage('rhythmRepair');
    rhythmRepair(st);
    progStage('repairFtl');
    repairFtl(st);
    progStage('swapNewCaptHoles');
    swapNewCaptHoles(st);
    progStage('topUpNewCapt');
    topUpNewCapt(st);
    progStage('fairConcentrate');
    if (!st.lite) fairConcentrate(st); // 顶替后再按职级浓缩，避免副驾被摊薄
    progStage('swapNewCaptHoles');
    swapNewCaptHoles(st);
    progStage('fillBandHoles');
    fillBandHoles(st); // 合规卸员后再补一轮（只取当前合规候选）
    progStage('repairCrewIssues');
    repairCrewIssues(st);
    progStage('repairFtl');
    repairFtl(st);
    if (st.lite) { progStage('bandPull'); rhythmRepair(st); repairFtl(st); }
    freeInstrForNewCapt(st); repairFtl(st);
    if (st.lite) { liteEqualize(st); rhythmRepair(st); repairFtl(st); liteEqualize(st); }
    progStage('trainingPairs');
    stickTrainingPairs(st);
    repairCrewIssues(st); repairFtl(st); // 均衡/带飞调整后复核搭配矩阵与 FTL
    progStage('assignStandby');
    assignStandby(st);
    progStage('assignTraining');
    assignTraining(st);
    progStage('summarize');
    return summarize(st);
  }

  function fillBandHoles(st) {
    const idx = buildIndex(st);
    const sortR = arr => arr.sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
    for (const pr of st.pairings) {
      if (pr.crew.C && pr.crew.F && pr.crew.T) continue;
      const ok = (p, slot) => personCheck(p, pr, st, idx, { ignorePrefs: true, slot })[0];
      const inCrew = id => Object.values(pr.crew).includes(id);
      const put = (slot, p) => { pr.crew[slot] = p.id; (idx.sched[p.id] = idx.sched[p.id] || []).push(pr); idx.hours[p.id] += pairingHours(pr); };
      const pick = (pool) => {
        const band = pool.filter(p => idx.hours[p.id] >= 12 && idx.hours[p.id] < (SOFT_MAX - 2));
        const use = band.length ? band : pool.filter(p => idx.hours[p.id] < (SOFT_MAX - 2));
        return sortR(use)[0];
      };
      if (!pr.crew.C) { const c = pick(st.pilots.filter(p => isCaptClass(p.rank) && !inCrew(p.id) && (!isNew(p.rank) || idx.hours[p.id] + pairingHours(pr) <= softCapOf(p)) && ok(p, 'C'))); if (c) put('C', c); }
      if (!pr.crew.F) { const f = pick(st.pilots.filter(p => isFO(p.rank) && !inCrew(p.id) && ok(p, 'F'))); if (f) put('F', f); }
      if (!pr.crew.T && pr.crew.C && pr.crew.F) {
        const needInstr = isNew(idx.pm[pr.crew.C].rank);
        const pool = st.pilots.filter(p => !inCrew(p.id) && (!needInstr || isInstr(p.rank)) && idx.hours[p.id] < SOFT_MAX + 6);
        const band = p => { const h = idx.hours[p.id]; return h >= 12 && h < SOFT_MAX - 2 ? 0 : h < 12 ? 1 : 2; };
        pool.sort((a, b) => band(a) - band(b) || idx.hours[a.id] - idx.hours[b.id]);
        let bt = null, bs = Infinity, nv = 0;
        for (const t of pool) {
          const rd = rhythmDelta(t, pr, st, idx);
          if (!ok(t, 'T')) continue;
          const crew = [idx.pm[pr.crew.C], idx.pm[pr.crew.F], t];
          if (crewIssue(pr, crew, st)) continue;
          const sc = rd + 0.6 * band(t) + 0.015 * idx.hours[t.id];
          if (sc < bs) { bs = sc; bt = t; }
          if (++nv >= 8) break;
        }
        if (bt) put('T', bt);
      }
    }
  }

  // 节奏修复：把造成「休 1–2 天 / 连飞 ≥4 天」的任务换给节奏更合适且工时未满的同类人员（不放松任何硬规则）
  function rhythmRepair(st) {
    for (let it = 0; it < 3; it++) {
      const idx = buildIndex(st); let moved = 0;
      const ds = dayStatus(st, idx);
      for (const p of st.pilots) {
        const sc = idx.sched[p.id] || []; if (sc.length < 2) continue;
        const bad = new Set();
        const sorted = sc.slice().sort((a, b) => a.start - b.start);
        for (let i = 1; i < sorted.length; i++) {
          const a = sorted[i - 1], b = sorted[i];
          const gap = b.start - (a.start + a.ndays);
          if (gap >= 1 && gap <= 2) { bad.add(a.ndays <= b.ndays ? a : b); }
        }
        // 连飞 ≥4 天：块内最短任务
        let run = []; const flush = () => { if (run.length >= 2) { const days = new Set(); run.forEach(x => daysTouched(x, st).forEach(d => days.add(d))); if (days.size >= 4) bad.add(run.slice().sort((x, y) => x.ndays - y.ndays)[0]); } run = []; };
        for (let i = 0; i < sorted.length; i++) { if (run.length && sorted[i].start > run[run.length - 1].start + run[run.length - 1].ndays) flush(); run.push(sorted[i]); } flush();
        for (const pr of bad) {
          const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === p.id); if (!slot) continue;
          const h = pairingHours(pr);
          const without = sc.filter(x => x !== pr);
          const gain0 = gapCost(p, sc, st) - gapCost(p, without, st);
          if (gain0 <= 0.2) continue;
          const pool = st.pilots.filter(q => q.id !== p.id && !Object.values(pr.crew).includes(q.id)
            && (slot === 'C' ? isCaptClass(q.rank) && (!isNew(q.rank) || idx.hours[q.id] + h <= softCapOf(q, slot)) : slot === 'F' ? isFO(q.rank) : (isNew((idx.pm[pr.crew.C] || {}).rank) ? isInstr(q.rank) : true))
            && idx.hours[q.id] > 0.5 && idx.hours[q.id] + h <= softCapOf(q, slot) && (rankGroup(q.rank) === rankGroup(p.rank) || (slot !== 'F' && isCaptClass(q.rank) && isCaptClass(p.rank) && !isNew(q.rank) && !isNew(p.rank))));
          let best = null, bs = -0.25;
          for (const q of pool) {
            const rd = rhythmDelta(q, pr, st, idx);
            const net = gain0 - rd - 0.01 * Math.abs((idx.hours[q.id] + h) - SOFT_AIM);
            if (net <= bs) continue;
            if (!pcOK(q, pr, st, idx, slot)) continue;
            const crew = ['C', 'F', 'T'].map(k => k === slot ? q : idx.pm[pr.crew[k]]);
            if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
            best = q; bs = net;
          }
          if (!best) continue;
          pr.crew[slot] = best.id;
          idx.sched[p.id] = idx.sched[p.id].filter(x => x !== pr); idx.hours[p.id] -= h;
          idx.sched[best.id].push(pr); idx.hours[best.id] += h;
          moved++; break;
        }
      }
      if (!moved) break;
    }
  }

  // 新机长补足值勤：任观察员（T 位不需教员陪飞）顶替值勤偏多者，使新机长也落在 ~12 天
  function topUpNewCapt(st) {
    const idx = buildIndex(st);
    const dd = id => { const s = new Set(); (idx.sched[id] || []).forEach(x => daysTouched(x, st).forEach(d => s.add(d))); return s.size; };
    const news = st.pilots.filter(p => isNew(p.rank) && !(p.health && p.health.noFly));
    for (let round = 0; round < 6; round++) {
      let moved = 0;
      news.sort((a, b) => dd(a.id) - dd(b.id));
      for (const p of news) {
        if (dd(p.id) >= 12) continue;
        let best = null, bs = 0.3;
        for (const pr of st.pairings) {
          const tid = pr.crew.T; if (!tid || Object.values(pr.crew).includes(p.id)) continue;
          const c = idx.pm[pr.crew.C]; if (c && isNew(c.rank)) continue; // 该 T 需教员
          const holder = idx.pm[tid]; if (!holder || isInstr(holder.rank) && false) continue;
          const hd = dd(tid);
          if (!(hd >= 13 || idx.hours[tid] > SOFT_AIM + 2)) continue;
          const h = pairingHours(pr); if (idx.hours[p.id] + h > SOFT_MAX) continue;
          const rd = rhythmDelta(p, pr, st, idx);
          if (rd >= bs) continue;
          if (!pcOK(p, pr, st, idx, 'T')) continue;
          if (crewIssue(pr, [c, idx.pm[pr.crew.F], p], st)) continue;
          best = pr; bs = rd;
          if (rd < -0.3) break;
        }
        if (!best) continue;
        const tid = best.crew.T, h = pairingHours(best);
        best.crew.T = p.id;
        idx.sched[tid] = idx.sched[tid].filter(x => x !== best); idx.hours[tid] -= h;
        idx.sched[p.id].push(best); idx.hours[p.id] += h; moved++;
      }
      if (!moved) break;
    }
  }

  // 新机长任务找不到教员陪飞时：换成有余量的普通机长（教员编制约 6%，是新机长飞行量的结构性上限）
  function swapNewCaptHoles(st) {
    const idx = buildIndex(st);
    for (const pr of st.pairings) {
      if (pr.crew.T || !pr.crew.C) continue;
      const c0 = idx.pm[pr.crew.C]; if (!c0 || !isNew(c0.rank)) continue;
      const h = pairingHours(pr);
      const pool = st.pilots.filter(q => isCaptClass(q.rank) && !isNew(q.rank) && !isInstr(q.rank) && !Object.values(pr.crew).includes(q.id) && idx.hours[q.id] + h <= SOFT_MAX + 8)
        .sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
      for (const q of pool) {
        if (!pcOK(q, pr, st, idx, 'C')) continue;
        const f = idx.pm[pr.crew.F];
        if (f && (f.rank === 'F1' || f.rank === 'F2')) break; // 仍需教员，换机长无益
        if (f && pr.legs.some(l => !legSeatedOK(q, f, l, st) && !legSeatedOK(f, q, l, st))) continue; // RE12 执飞对
        pr.crew.C = q.id;
        idx.sched[c0.id] = idx.sched[c0.id].filter(x => x !== pr); idx.hours[c0.id] -= h;
        idx.sched[q.id].push(pr); idx.hours[q.id] += h;
        break;
      }
    }
  }

  // 新机长任务缺 T（须教员）：把一名教员从其冲突任务中换出（由同岗合格者顶替），再放入本任务 T 位（一步链式交换）
  function freeInstrForNewCapt(st) {
    let idx = buildIndex(st); let fixed = 0;
    const assign = (q, pr, slot) => { pr.crew[slot] = q.id; idx.sched[q.id].push(pr); idx.hours[q.id] += pairingHours(pr); };
    const unassign = (q, pr, slot) => { pr.crew[slot] = null; idx.sched[q.id] = idx.sched[q.id].filter(x => x !== pr); idx.hours[q.id] -= pairingHours(pr); };
    // 让 q 可进入 pr 的 slot：直接可行，或把 q 唯一冲突任务 X 中的岗位让给合格替补 r。okFn 额外校验组合；成功则已写入
    function relocate(q, pr, slot, okFn) {
      if (pcOK(q, pr, st, idx, slot) && okFn(q)) { assign(q, pr, slot); return true; }
      const days = new Set(daysTouched(pr, st));
      const lo = Math.min(...days) - 3, hi = Math.max(...days) + 3;
      const confl = (idx.sched[q.id] || []).filter(x => x !== pr && daysTouched(x, st).some(d => d >= lo && d <= hi));
      for (const X of confl.slice(0, 3)) { if (tryMove(q, pr, slot, okFn, X)) return true; }
      return false;
    }
    function tryMove(q, pr, slot, okFn, X) {
      const xs = ['C', 'F', 'T'].find(k => X.crew[k] === q.id); const hx = pairingHours(X);
      unassign(q, X, xs);
      if (pcOK(q, pr, st, idx, slot) && okFn(q)) {
        // 变体：X 的第三人为非新机长 → 升至 C，T 由合格副驾/他人补
        const tX = idx.pm[X.crew.T];
        if (xs === 'C' && tX && isCaptClass(tX.rank) && !isNew(tX.rank)) {
          unassign(tX, X, 'T');
          if (!pcOK(tX, X, st, idx, 'C')) assign(tX, X, 'T'); else { assign(tX, X, 'C');
          const pool2 = st.pilots.filter(r => r !== q && !isNew(r.rank) && !Object.values(X.crew).includes(r.id) && !Object.values(pr.crew).includes(r.id) && idx.hours[r.id] + hx <= softCapOf(r, 'T') + 4).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
          for (const r of pool2) { if (!pcOK(r, X, st, idx, 'T')) continue; const crew = [tX, idx.pm[X.crew.F], r]; if (crewIssue(X, crew, st)) continue;
            assign(r, X, 'T'); assign(q, pr, slot); return true; }
          unassign(tX, X, 'C'); assign(tX, X, 'T'); } }
        const need = xs === 'C' ? (r => isCaptClass(r.rank) && !isNew(r.rank)) : xs === 'F' ? (r => isFO(r.rank)) : (r => isNew((idx.pm[X.crew.C] || {}).rank) ? isInstr(r.rank) : !isNew(r.rank));
        const pool = st.pilots.filter(r => r !== q && need(r) && !Object.values(X.crew).includes(r.id) && !Object.values(pr.crew).includes(r.id) && idx.hours[r.id] + hx <= softCapOf(r, xs) + 4).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        for (const r of pool) { if (!pcOK(r, X, st, idx, xs)) continue; const crew = ['C', 'F', 'T'].map(k => k === xs ? r : idx.pm[X.crew[k]]); if (crew.every(Boolean) && crewIssue(X, crew, st)) continue;
          assign(r, X, xs); assign(q, pr, slot); return true; } }
      assign(q, X, xs); return false;
    }
    for (let pass = 0; pass < 2; pass++) {
      idx = buildIndex(st);
      for (const pr of st.pairings.filter(x => x.crew.C && x.crew.F && !x.crew.T && isNew((idx.pm[x.crew.C] || {}).rank))) {
        const c0 = idx.pm[pr.crew.C], f = idx.pm[pr.crew.F];
        // A：教员进 T
        const instrs = st.pilots.filter(q => isInstr(q.rank) && q !== c0 && q !== f).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        if (instrs.some(q => relocate(q, pr, 'T', q2 => !crewIssue(pr, [c0, f, q2], st)))) { fixed++; continue; }
        // B：非新机长替换 C（新机长让出），T 由任意合格者（可链式让位）补
        unassign(c0, pr, 'C'); let done = false;
        const caps = st.pilots.filter(q => isCaptClass(q.rank) && !isNew(q.rank) && q !== f && idx.hours[q.id] + pairingHours(pr) <= SOFT_MAX + 6).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        for (const q of caps) { if (!relocate(q, pr, 'C', q2 => pr.legs.every(l => legSeatedOK(q2, f, l, st) || legSeatedOK(f, q2, l, st)))) continue;
          const ts = st.pilots.filter(t => t !== q && t !== f && t !== c0 && idx.hours[t.id] + pairingHours(pr) <= softCapOf(t, 'T') + 4).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
          if (ts.some(t => relocate(t, pr, 'T', t2 => !crewIssue(pr, [q, f, t2], st)))) { done = true; break; }
          unassign(q, pr, 'C'); }
        if (done) fixed++; else assign(c0, pr, 'C');
      }
    }
    return fixed;
  }
  // 新机长任务第三人必须是教员时，把高工时教员与低工时教员互换 T 位
  function spreadInstrT(st) {
    for (let it = 0; it < 8; it++) {
      const idx = buildIndex(st); let moved = 0;
      const fat = st.pilots.filter(p => isInstr(p.rank) && idx.hours[p.id] > (SOFT_MAX - 2))
        .sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
      const thin = st.pilots.filter(p => isInstr(p.rank) && idx.hours[p.id] < 48 && !(p.health && p.health.noFly))
        .sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
      if (!fat.length || !thin.length) break;
      for (const hi of fat) {
        if (idx.hours[hi.id] <= (SOFT_MAX - 2)) continue;
        for (const pr of (idx.sched[hi.id] || []).slice()) {
          if (pr.crew.T !== hi.id) continue;
          const cp = idx.pm[pr.crew.C]; if (!cp || !isNew(cp.rank)) continue; // 仅动「新机长+教员」义务位
          const h = pairingHours(pr);
          let best = null;
          for (const q of thin) {
            if (Object.values(pr.crew).includes(q.id)) continue;
            if (idx.hours[q.id] + h > softCapOf(q)) continue;
            if (!pcOK(q, pr, st, idx, 'T')) continue;
            const crew = [idx.pm[pr.crew.C], idx.pm[pr.crew.F], q];
            if (crewIssue(pr, crew, st)) continue;
            best = q; break;
          }
          if (!best) continue;
          pr.crew.T = best.id;
          idx.sched[hi.id] = idx.sched[hi.id].filter(x => x !== pr);
          idx.hours[hi.id] -= h;
          idx.sched[best.id].push(pr);
          idx.hours[best.id] += h;
          moved++;
          thin.sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
          break;
        }
      }
      if (!moved) break;
    }
  }

  // 按职级公平浓缩：本级总工时决定应飞人数，目标人均 ~45h 且人均 ≤58h；保留工时最高者，其余转给未满 55h 保留者
  function fairConcentrate(st) {
    const AIM = SOFT_AIM, MEAN_CAP = SOFT_MAX - 2;
    for (let pass = 0; pass < 4; pass++) {
      const allowDrop = pass < 2;
      const idx = buildIndex(st); let moved = 0;
      const byRank = {};
      st.pilots.forEach(p => {
        if (p.health && p.health.noFly) return;
        (byRank[p.rank] = byRank[p.rank] || []).push(p);
      });
      Object.keys(byRank).forEach(rk => {
        const xs = byRank[rk];
        if (xs.length < 6) return;
        const total = xs.reduce((a, p) => a + idx.hours[p.id], 0);
        if (total < 20) return;
        const aimR = AIM, capR = MEAN_CAP; // 新机长 C 位另有 softCapOf 约束，T 位不限
        let want = Math.round(total / aimR);
        while (want < xs.length && want > 0 && total / want > capR) want++;
        // 夹在约 48%–75%：跨级闲置比例接近，且不把人均抬过硬顶
        const isCaptRk = isCaptClass(rk);
        const loN = Math.ceil(xs.length * (isCaptRk ? 0.55 : 0.38));
        const hiN = Math.floor(xs.length * (isCaptRk ? 0.92 : 0.64));
        want = Math.max(loN, Math.min(hiN, want));
        want = Math.max(1, Math.min(xs.length, want));
        const ranked = xs.slice().sort((a, b) => idx.hours[b.id] - idx.hours[a.id] || a.id.localeCompare(b.id));
        const keep = new Set(ranked.slice(0, want).map(p => p.id));
        // 若保留者已临近满载，再扩一小批，避免只能卸洞
        let takers = ranked.filter(p => keep.has(p.id) && idx.hours[p.id] < (SOFT_MAX - 5));
        if (takers.length < Math.ceil(want * 0.3) && want < xs.length) {
          for (const p of ranked) {
            if (keep.has(p.id)) continue;
            keep.add(p.id); takers.push(p); want++;
            if (takers.length >= Math.ceil(want * 0.4) || want >= hiN) break;
          }
        }
        takers.sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        const donors = ranked.filter(p => !keep.has(p.id) && idx.hours[p.id] > 0);
        for (const lo of donors) {
          const list = (idx.sched[lo.id] || []).slice();
          for (const pr of list) {
            const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === lo.id); if (!slot) continue;
            const h = pairingHours(pr);
            let best = null;
            let tryList = takers.concat(ranked.filter(p => keep.has(p.id) && idx.hours[p.id] < SOFT_MAX && !takers.includes(p)));
            // F/T：若同级接不住，允许其它副驾级别中 20–55h 者接手（仍不喂 0h 新人）
            if ((slot === 'F' || slot === 'T') && isFO(lo.rank)) {
              const extra = st.pilots.filter(p => isFO(p.rank) && p.rank !== lo.rank && idx.hours[p.id] >= 18 && idx.hours[p.id] < (SOFT_MAX - 5));
              tryList = tryList.concat(extra.sort((a, b) => idx.hours[a.id] - idx.hours[b.id]));
            }
            if (slot === 'C' && isCaptClass(lo.rank)) {
              const extra = st.pilots.filter(p => isCaptClass(p.rank) && p.rank !== lo.rank && idx.hours[p.id] >= 18 && idx.hours[p.id] < (SOFT_MAX - 5));
              tryList = tryList.concat(extra.sort((a, b) => idx.hours[a.id] - idx.hours[b.id]));
            }
            let bestSc = Infinity, nValid = 0;
            for (const q of tryList) {
              if (q.id === lo.id || Object.values(pr.crew).includes(q.id)) continue;
              if (slot === 'C' && !isCaptClass(q.rank)) continue;
              if (slot === 'F' && !isFO(q.rank)) continue;
              if (idx.hours[q.id] + h > softCapOf(q, slot)) continue;
              const rd = rhythmDelta(q, pr, st, idx);
              if (rd > 1.0) continue; // 会造成 1 日休/5 日连飞等坏节奏：跳过
              if (!pcOK(q, pr, st, idx, slot)) continue;
              const crew = ['C', 'F', 'T'].map(k => k === slot ? q : idx.pm[pr.crew[k]]);
              if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
              const sc = rd + 0.02 * idx.hours[q.id];
              if (sc < bestSc) { bestSc = sc; best = q; }
              if (++nValid >= 6) break;
            }
            if (!best) {
              if (!allowDrop) continue;
              // 前两轮：接不住则卸下，交给补洞（优先 18–55h 已飞者）
              pr.crew[slot] = null;
              idx.sched[lo.id] = idx.sched[lo.id].filter(x => x !== pr);
              idx.hours[lo.id] -= h;
              moved++;
              continue;
            }
            pr.crew[slot] = best.id;
            idx.sched[lo.id] = idx.sched[lo.id].filter(x => x !== pr);
            idx.hours[lo.id] -= h;
            idx.sched[best.id].push(pr);
            idx.hours[best.id] += h;
            moved++;
            takers.sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
          }
        }
      });
      if (!moved) break;
    }
    // 削尖：>60h → 同大类 <50h（机长类可跨 TL/J3/TB…，副驾可跨 F*）
    (function shavePeaks() {
      const idx = buildIndex(st);
      for (let guard = 0; guard < 40; guard++) {
        const over = st.pilots.filter(p => idx.hours[p.id] > SOFT_MAX).sort((a, b) => idx.hours[b.id] - idx.hours[a.id])[0];
        if (!over) break;
        const under = st.pilots.filter(p => {
          if (idx.hours[p.id] >= (SOFT_MAX - 10) || (p.health && p.health.noFly)) return false;
          if (isCaptClass(over.rank)) return isCaptClass(p.rank);
          if (isFO(over.rank)) return isFO(p.rank);
          return p.rank === over.rank;
        }).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        let moved = false;
        for (const pr of (idx.sched[over.id] || []).slice()) {
          const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === over.id); if (!slot) continue;
          const h = pairingHours(pr);
          if (idx.hours[over.id] - h < 38) continue;
          for (const q of under) {
            if (Object.values(pr.crew).includes(q.id)) continue;
            if (slot === 'C' && !isCaptClass(q.rank)) continue;
            if (slot === 'F' && !isFO(q.rank)) continue;
            if (idx.hours[q.id] + h > softCapOf(q, slot)) continue;
            if (!pcOK(q, pr, st, idx, slot)) continue;
            const crew = ['C', 'F', 'T'].map(k => k === slot ? q : idx.pm[pr.crew[k]]);
            if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
            pr.crew[slot] = q.id;
            idx.sched[over.id] = idx.sched[over.id].filter(x => x !== pr);
            idx.hours[over.id] -= h;
            idx.sched[q.id].push(pr);
            idx.hours[q.id] += h;
            moved = true; break;
          }
          if (moved) break;
        }
        if (!moved) {
          // 接不住则卸一趟，避免硬顶尖峰留在册
          const pr = (idx.sched[over.id] || [])[0];
          if (!pr) break;
          const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === over.id);
          if (!slot) break;
          const h = pairingHours(pr);
          pr.crew[slot] = null;
          idx.sched[over.id] = idx.sched[over.id].filter(x => x !== pr);
          idx.hours[over.id] -= h;
        }
      }
    })();
  }

  // 集中模式：只回收碎片（<18h）或非主班任务 → 同岗位类别中不足 50h 的主班；不掏空已起飞主班
  function bandPull(st, primary, target) {
    for (let it = 0; it < 14; it++) {
      const idx = buildIndex(st); let moved = 0;
      const donors = st.pilots.filter(p => {
        const h = idx.hours[p.id]; if (h <= 0) return false;
        if (!primary[p.id]) return true; // 非主班一律回收
        if (h < 16) return true; // 主班碎片
        return false;
      }).sort((a, b) => (primary[a.id] ? 1 : 0) - (primary[b.id] ? 1 : 0) || idx.hours[a.id] - idx.hours[b.id]);
      const takers = st.pilots.filter(p => primary[p.id] && idx.hours[p.id] < (SOFT_MAX - 2))
        .sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
      if (!donors.length || !takers.length) break;
      for (const lo of donors) {
        const list = (idx.sched[lo.id] || []).slice();
        for (const pr of list) {
          const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === lo.id); if (!slot) continue;
          const h = pairingHours(pr);
          let best = null;
          for (const q of takers) {
            if (q.id === lo.id || Object.values(pr.crew).includes(q.id)) continue;
            if (slot === 'C' && !isCaptClass(q.rank)) continue;
            if (slot === 'F' && !isFO(q.rank)) continue;
            if (slot !== 'T' && rankGroup(q.rank) !== rankGroup(lo.rank) && !(slot === 'C')) continue;
            if (idx.hours[q.id] + h > (SOFT_MAX + 2)) continue; // 软顶，硬顶仍由 personCheck/FTL 卡
            if (!pcOK(q, pr, st, idx, slot)) continue;
            const crew = ['C', 'F', 'T'].map(k => k === slot ? q : idx.pm[pr.crew[k]]);
            if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
            best = q; break;
          }
          if (!best) continue;
          pr.crew[slot] = best.id;
          idx.sched[lo.id] = idx.sched[lo.id].filter(x => x !== pr);
          idx.hours[lo.id] -= h;
          idx.sched[best.id].push(pr);
          idx.hours[best.id] += h;
          moved++;
          break;
        }
      }
      if (!moved) break;
    }
  }

  // 公平抬升：各职级内把 >55h（及可替下的碎片）转给同级/<同组 中 <40h 的主飞者；观察员位尽量用副驾换下非必要机长
  function liftFoBand(st, target, primary) {
    primary = primary || {};
    for (let it = 0; it < 8; it++) {
      const idx = buildIndex(st); let moved = 0;
      // 1) 同 rank 内 >55 → <40
      const ranks = {};
      st.pilots.forEach(p => { (ranks[p.rank] = ranks[p.rank] || []).push(p); });
      Object.keys(ranks).forEach(rk => {
        const xs = ranks[rk];
        const over = xs.filter(p => idx.hours[p.id] > (SOFT_MAX - 5)).sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
        const under = xs.filter(p => primary[p.id] && idx.hours[p.id] < 40 && !(p.health && p.health.noFly))
          .sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        for (const hi of over) {
          if (idx.hours[hi.id] <= (SOFT_MAX - 5)) continue;
          for (const pr of (idx.sched[hi.id] || []).slice()) {
            const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === hi.id); if (!slot) continue;
        if (pr.pin && pr.pin[slot] === hi.id) continue; // 固定带飞对不拆
            const h = pairingHours(pr);
            if (idx.hours[hi.id] - h < 38) continue;
            let best = null;
            for (const q of under) {
              if (q.id === hi.id || Object.values(pr.crew).includes(q.id)) continue;
              if (slot === 'C' && !isCaptClass(q.rank)) continue;
              if (slot === 'F' && !isFO(q.rank)) continue;
              if (idx.hours[q.id] + h > softCapOf(q, slot) || idx.hours[q.id] >= 40) continue;
              if (!pcOK(q, pr, st, idx, slot)) continue;
              const crew = ['C', 'F', 'T'].map(k => k === slot ? q : idx.pm[pr.crew[k]]);
              if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
              best = q; break;
            }
            if (!best) continue;
            pr.crew[slot] = best.id;
            idx.sched[hi.id] = idx.sched[hi.id].filter(x => x !== pr);
            idx.hours[hi.id] -= h;
            idx.sched[best.id].push(pr);
            idx.hours[best.id] += h;
            moved++;
            under.sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
            break;
          }
        }
      });
      // 2) 非新机长任务：观察员位上的机长 → 不足 40h 的副驾（释放机长飞 C）
      for (const pr of st.pairings) {
        const tid = pr.crew.T; if (!tid) continue;
        const tp = idx.pm[tid]; if (!tp || !isCaptClass(tp.rank) || (isNew(tp.rank) && idx.hours[tp.id] < SOFT_AIM)) continue; // 新机长任观察员是补足值勤，不换走
        const cp = idx.pm[pr.crew.C]; if (cp && isNew(cp.rank)) continue;
        const h = pairingHours(pr);
        const underFo = st.pilots.filter(p => isFO(p.rank) && primary[p.id] && idx.hours[p.id] < 40 && !(p.health && p.health.noFly))
          .sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        let best = null;
        for (const q of underFo) {
          if (Object.values(pr.crew).includes(q.id)) continue;
          if (idx.hours[q.id] + h > softCapOf(q)) continue;
          if (!pcOK(q, pr, st, idx, 'T')) continue;
          const crew = [idx.pm[pr.crew.C], idx.pm[pr.crew.F], q];
          if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
          best = q; break;
        }
        if (!best) continue;
        pr.crew.T = best.id;
        idx.sched[tid] = idx.sched[tid].filter(x => x !== pr);
        idx.hours[tid] -= h;
        idx.sched[best.id].push(pr);
        idx.hours[best.id] += h;
        moved++;
      }
      if (!moved) break;
    }
  }

  // 把超 60h 的任务转给不足 40h 者，抬升 40–60 落带占比（软目标，不破硬规则）
  function bandBalance(st, target) {
    for (let it = 0; it < 4; it++) {
      const idx = buildIndex(st); let moved = 0;
      const over = st.pilots.filter(p => idx.hours[p.id] > SOFT_MAX).sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
      const under = st.pilots.filter(p => idx.hours[p.id] < 40 && !(p.health && p.health.noFly))
        .sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
      if (!over.length || !under.length) break;
      for (const hi of over) {
        if (idx.hours[hi.id] <= SOFT_MAX) continue;
        const list = (idx.sched[hi.id] || []).slice().sort((a, b) => pairingHours(b) - pairingHours(a));
        for (const pr of list) {
          const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === hi.id); if (!slot) continue;
        if (pr.pin && pr.pin[slot] === hi.id) continue; // 固定带飞对不拆
          const h = pairingHours(pr);
          if (idx.hours[hi.id] - h < 38) continue;
          let best = null;
          for (const q of under) {
            if (q.id === hi.id || Object.values(pr.crew).includes(q.id)) continue;
            if (slot === 'C' && !isCaptClass(q.rank)) continue;
            if (slot === 'F' && !isFO(q.rank)) continue;
            if (idx.hours[q.id] + h > softCapOf(q, slot)) continue;
            if (!pcOK(q, pr, st, idx, slot)) continue;
            const crew = ['C', 'F', 'T'].map(k => k === slot ? q : idx.pm[pr.crew[k]]);
            if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
            best = q; break;
          }
          if (!best) continue;
          pr.crew[slot] = best.id;
          idx.sched[hi.id] = idx.sched[hi.id].filter(x => x !== pr);
          idx.hours[hi.id] -= h;
          idx.sched[best.id].push(pr);
          idx.hours[best.id] += h;
          moved++;
          break;
        }
      }
      if (!moved) break;
    }
  }

  function repairCrewIssues(st) {
    const idx = buildIndex(st);
    st.pairings.forEach(pr => {
      const crew = ['C', 'F', 'T'].map(s => pr.crew[s] && idx.pm[pr.crew[s]]);
      if (!crew.every(Boolean)) return;
      const iss = crewIssue(pr, crew, st);
      if (!iss) return;
      // 卸第三人优先，仍不行再卸机/副
      for (const s of ['T', 'F', 'C']) {
        const id = pr.crew[s]; if (!id) continue;
        pr.crew[s] = null;
        const crew2 = ['C', 'F', 'T'].map(x => pr.crew[x] && idx.pm[pr.crew[x]]);
        if (!crew2.every(Boolean) || !crewIssue(pr, crew2, st)) break;
      }
    });
  }
  function repairFtl(st) {
    const idx = buildIndex(st); let n = 0;
    st.pilots.forEach(p => {
      const list = (idx.sched[p.id] || []).slice().sort((a, b) => report(b, st) - report(a, st)); // 先卸晚的
      for (const pr of list) {
        const rs = ftlCheckPerson(p, pr, st, idx, {});
        if (!rs.length) continue;
        for (const s of ['C', 'F', 'T']) if (pr.crew[s] === p.id) {
          pr.crew[s] = null; idx.sched[p.id] = idx.sched[p.id].filter(x => x !== pr);
          idx.hours[p.id] -= pairingHours(pr); n++; break;
        }
      }
    });
    return n;
  }

  // 削峰：工时明显高于本组均值者，把其任务转给合规且工时更低者（只做不占意向休息日、不破坏合规的替换）
  function trimPeaks(st) {
    for (let it = 0; it < 4; it++) { let moved = 0; const idx = buildIndex(st);
      const gm = {}; GROUPS.forEach(g => { const xs = st.pilots.filter(p => rankGroup(p.rank) === g).map(p => idx.hours[p.id] / shareFor(p)); gm[g] = xs.reduce((a, b) => a + b, 0) / (xs.length || 1); });
      for (const p of st.pilots) { const hp = idx.hours[p.id]; if (hp / shareFor(p) < gm[rankGroup(p.rank)] + 5) continue;
        for (const pr of idx.sched[p.id].slice().sort((a, b) => pairingHours(a) - pairingHours(b))) { const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === p.id); const h = pairingHours(pr);
          pr.crew[slot] = null;
          const cands = candidates(st, pr, slot, (q, ix) => q.id !== p.id && ix.hours[q.id] + h < hp - 1 && ix.hours[q.id] + h <= 60).filter(z => z.ok && !z.warn && z.p.id !== p.id && z.hours + h < hp - 1 && z.hours + h <= 60);
          // 优先已有一定工时者（避免把削峰结果倒给 0h 后备）
          cands.sort((a, b) => (a.hours < 8 ? 1 : 0) - (b.hours < 8 ? 1 : 0) || a.hours - b.hours);
          const c = cands[0];
          if (c) { pr.crew[slot] = c.p.id; moved++; break; } pr.crew[slot] = p.id; } }
      if (!moved) break; }
  }
  // 修复：被迫占用意向休息日的岗位，尝试换成不占意向休息日的合规人员（或一步置换链）
  function repairPrefs(st) {
    for (const pr of st.pairings) for (const slot of ['C', 'F', 'T']) {
      const id = pr.crew[slot]; if (!id) continue; const p = st.pilots.find(x => x.id === id);
      if (!daysTouched(pr, st).some(d => (p.prefs || []).includes(d))) continue;
      pr.crew[slot] = null;
      const c = candidates(st, pr, slot).find(z => z.ok && !z.warn && z.p.id !== id);
      if (c) { pr.crew[slot] = c.p.id; continue; }
      pr.crew[slot] = id; const keep = JSON.stringify(st.pairings.map(x => x.crew)); pr.crew[slot] = null;
      repairUnfilled(st, true);
      if (!pr.crew[slot]) { const back = JSON.parse(keep); st.pairings.forEach((x, i) => x.crew = back[i]); }
    }
  }
  // 修复：对仍有空缺的任务做一步“置换链”——把某人从冲突任务中换出，由他人顶替
  function repairUnfilled(st, strict) {
    for (const pr of st.pairings) {
      for (const slot of ['C', 'F', 'T']) {
        if (pr.crew[slot]) continue;
        const okc = candidates(st, pr, slot).filter(c => c.ok && !c.warn && !(slot === 'C' && isNew(c.p.rank) && c.hours + pairingHours(pr) > SOFT_NEW + 4));
        okc.sort((a, b) => {
          const as = (a.hours > 0.5 && a.hours < 55) ? 0 : (a.hours < 0.5 ? 2 : 1);
          const bs = (b.hours > 0.5 && b.hours < 55) ? 0 : (b.hours < 0.5 ? 2 : 1);
          return as - bs || a.hours - b.hours;
        });
        const direct = okc[0];
        if (direct) { pr.crew[slot] = direct.p.id; continue; }
        const cl = candidates(st, pr, slot).filter(c => c.reasons.length && c.reasons.every(r => /^(时间冲突|休息不足)/.test(r)));
        let done = false;
        for (const c of cl) {
          const ids = [...new Set(c.reasons.map(r => (r.match(/\((PR\d+)\)/) || [])[1]))];
          const others = ids.map(id => st.pairings.find(x => x.id === id));
          const saved = others.map(o => ({ o, s: ['C', 'F', 'T'].find(k => o.crew[k] === c.p.id) }));
          saved.forEach(x => x.o.crew[x.s] = null);
          if (!candidates(st, pr, slot).find(z => z.p.id === c.p.id && z.ok)) { saved.forEach(x => x.o.crew[x.s] = c.p.id); continue; }
          pr.crew[slot] = c.p.id; let okAll = true;
          for (const x of saved) { const rep = candidates(st, x.o, x.s).find(z => z.ok && !z.warn); if (rep) x.o.crew[x.s] = rep.p.id; else { okAll = false; break; } }
          if (okAll) { done = true; break; }
          pr.crew[slot] = null; saved.forEach(x => x.o.crew[x.s] = c.p.id);
        }
        if (!done && !strict) { const w = candidates(st, pr, slot).find(c => c.ok); if (w) pr.crew[slot] = w.p.id; }
      }
    }
  }

  // ---------- 备份（Standby） ----------
  // 每人日状态：D=飞行任务 L=请假 P=意向休息 S=备份 ''=空闲
  function dayStatus(st, idx) {
    idx = idx || buildIndex(st); const sb = st.standby || {}; const out = {};
    st.pilots.forEach(p => { const a = Array(DAYS + 2).fill('');
      (p.prefs || []).forEach(d => a[d] = 'P'); (p.leave || []).forEach(d => a[d] = 'L');
      ((st.training || {})[p.id] || []).forEach(d => { if (!a[d] || a[d] === 'P') a[d] = 'N'; });
      (sb[p.id] || []).forEach(d => { if (!a[d]) a[d] = 'S'; });
      idx.sched[p.id].forEach(pr => { daysTouched(pr, st).forEach(d => { if (d >= 1 && d <= DAYS) a[d] = 'D'; }); if (pr.offAway) offAwayDays(pr, st).forEach(d => { if (d >= 1 && d <= DAYS && a[d] !== 'D') a[d] = 'O'; }); });
      out[p.id] = a; });
    return out;
  }
  const sbOK = (a, d) => a[d] === '' && a[d - 1] !== 'D' && a[d + 1] !== 'D';
  function freeRuns(a) { const r = []; let s = 0; for (let d = 1; d <= DAYS + 1; d++) { if (d <= DAYS && a[d] === '') { if (!s) s = d; } else if (s) { r.push([s, d - 1]); s = 0; } } return r; }
  // 轻量版：同职级把偏高工时者的任务匀给同级偏低者，压低 0–1 个碎片尾部（不改硬规则）

  // ---------- 固定带飞对：新机长(SPIC 等)+教员(TL) 整块同组，并尽量跨连续块保持同一教员 ----------
  function stickTrainingPairs(st) {
    const hardN = () => summarize(st).violations.filter(v => v.level === 'hard').length;
    const pm = {}; st.pilots.forEach(p => pm[p.id] = p);
    const rk = id => id && pm[id] ? pm[id].rank : '';
    let h0 = hardN(), fixed = 0, kept = 0;
    // a) 外站驻点长块：整块固定 新机长 + TL（必要时腾挪二人邻近任务并补人；不增加硬违规/空缺才接受）
    const holesN = () => st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
    for (const pr of st.pairings.filter(p => p.fixedPair)) {
      const cs = Object.values(pr.crew);
      if (isNew(rk(pr.crew.C)) && isInstr(rk(pr.crew.F))) { fixed++; continue; }
      const snap = JSON.stringify(st.pairings.map(x => x.crew)); const restore = () => { const b = JSON.parse(snap); st.pairings.forEach((x, i) => x.crew = b[i]); };
      const hol0 = holesN(); const lo = pr.start - 3, hi = pr.start + pr.ndays + 2;
      const pinFirst = (a, b, k) => (pr.pin && b.id === pr.pin[k]) - (pr.pin && a.id === pr.pin[k]);
      const news = st.pilots.filter(p => isNew(p.rank) && !(p.health && p.health.noFly) && !(p.leave || []).some(d => d >= pr.start && d < pr.start + pr.ndays));
      const tls = st.pilots.filter(p => isInstr(p.rank) && !(p.health && p.health.noFly) && !(p.leave || []).some(d => d >= pr.start && d < pr.start + pr.ndays)).sort((a, b) => pinFirst(a, b, 'F') || (b.rank === 'TL') - (a.rank === 'TL'));
      news.sort((a, b) => pinFirst(a, b, 'C'));
      let ok = false;
      outer: for (const n of news) for (const ti of tls.slice(0, 8)) {
        const vac = [];
        st.pairings.forEach(x => { if (x === pr) return; ['C', 'F', 'T'].forEach(s => { if ((x.crew[s] === n.id || x.crew[s] === ti.id) && x.start <= hi && x.start + x.ndays - 1 >= lo) { x.crew[s] = null; vac.push([x, s]); } }); });
        const oldT = pr.crew.T && pr.crew.T !== n.id && pr.crew.T !== ti.id ? pr.crew.T : null;
        pr.crew = { C: n.id, F: ti.id, T: null };
        let fine = !!candidates(st, pr, 'C').find(c => c.ok && c.p.id === n.id); pr.crew.C = n.id;
        if (fine) { const hrs = buildIndex(st).hours; const o = candidates(st, pr, 'T').filter(c => c.ok).sort((a, b) => (b.p.id === oldT) - (a.p.id === oldT) || hrs[a.p.id] - hrs[b.p.id])[0]; if (o) pr.crew.T = o.p.id; else fine = false; }
        if (fine) for (const [x, s] of vac) { const hrs = buildIndex(st).hours; const c = candidates(st, x, s).filter(c => c.ok).sort((a, b) => hrs[a.p.id] - hrs[b.p.id])[0]; if (c) x.crew[s] = c.p.id; }
        if (fine && holesN() <= hol0 && hardN() <= h0) { ok = true; break outer; }
        restore();
      }
      if (ok) { fixed++; h0 = hardN(); }
    }
    // b) 连续块：同一新机长的相邻任务（间隔 ≤4 日）尽量沿用同一教员
    const byTrainee = {};
    st.pairings.forEach(pr => { const n = Object.values(pr.crew).find(id => isNew(rk(id))); if (n) (byTrainee[n] = byTrainee[n] || []).push(pr); });
    for (const n of Object.keys(byTrainee)) {
      const ps = byTrainee[n].sort((a, b) => a.start - b.start);
      for (let i = 1; i < ps.length; i++) {
        const A = ps[i - 1], B = ps[i]; if (B.start - (A.start + A.ndays) > 4) continue;
        const ia = Object.values(A.crew).find(id => isInstr(rk(id))); const slotB = ['C', 'F', 'T'].find(s => isInstr(rk(B.crew[s])));
        if (!ia || !slotB || B.crew[slotB] === ia || Object.values(B.crew).includes(ia)) { if (ia && Object.values(B.crew).includes(ia)) kept++; continue; }
        const save = B.crew[slotB]; B.crew[slotB] = null;
        const hit = candidates(st, B, slotB).find(c => c.ok && c.p.id === ia);
        if (hit) { B.crew[slotB] = ia; if (hardN() <= h0) { kept++; continue; } }
        B.crew[slotB] = save;
      }
    }
    st.trainingPairStats = { fixedBlocks: fixed, keptInstructor: kept };
    return st.trainingPairStats;
  }

  function liteEqualize(st) {
    function tryMove(idx, hi, lo, minKeep) {
      for (const pr of (idx.sched[hi.id] || []).slice()) {
        const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === hi.id); if (!slot) continue;
        if (pr.pin && pr.pin[slot] === hi.id) continue; // 固定带飞对不拆
        if (Object.values(pr.crew).includes(lo.id)) continue;
        const h = pairingHours(pr);
        if (idx.hours[hi.id] - h < minKeep) continue;
        if (idx.hours[lo.id] + h > SOFT_MAX) continue;
        if (!pcOK(lo, pr, st, idx, slot)) continue;
        const crew = ['C', 'F', 'T'].map(k => k === slot ? lo : idx.pm[pr.crew[k]]);
        if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
        pr.crew[slot] = lo.id;
        idx.sched[hi.id] = idx.sched[hi.id].filter(x => x !== pr);
        idx.hours[hi.id] -= h;
        (idx.sched[lo.id] = idx.sched[lo.id] || []).push(pr);
        idx.hours[lo.id] += h;
        return true;
      }
      return false;
    }
    for (let pass = 0; pass < 8; pass++) {
      const idx = buildIndex(st); let moved = 0;
      const by = {}; st.pilots.forEach(p => { if (!(p.health && p.health.noFly)) (by[p.rank] = by[p.rank] || []).push(p); });
      // 先拉起闲置（同职级），允许供体降至 25h
      Object.keys(by).forEach(rk => {
        const xs = by[rk]; if (xs.length < 2) return;
        const LOW = 30; // 同职级低尾抬升（真实班表在岗者 ≥35h；含过夜链时低尾更易出现）
        const idle = xs.filter(p => idx.hours[p.id] < LOW).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        const donors = xs.filter(p => idx.hours[p.id] >= 40).sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
        for (const lo of idle) {
          let guard = 0;
          while (idx.hours[lo.id] < LOW && guard++ < 6) {
            let got = false;
            for (const hi of donors) {
              if (tryMove(idx, hi, lo, 25)) { moved++; got = true; break; }
            }
            if (!got) break;
          }
        }
      });
      // 高尾削峰：同职级 >64h（真实班表上限约 64h）者匀给 <45h 者
      Object.keys(by).forEach(rk => {
        const xs = by[rk]; if (xs.length < 2) return;
        const hiS = xs.filter(p => idx.hours[p.id] > 60).sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
        for (const hi of hiS) {
          const los = xs.filter(p => idx.hours[p.id] < 50).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
          for (const lo of los) { if (idx.hours[hi.id] <= 60) break; if (tryMove(idx, hi, lo, 48)) moved++; }
        }
      });
      // 仍闲置：跨职级仅观察员位救援
      {
        const idle = st.pilots.filter(p => !(p.health && p.health.noFly) && idx.hours[p.id] < 8);
        const donors = st.pilots.filter(p => !(p.health && p.health.noFly) && idx.hours[p.id] >= 45)
          .sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
        for (const lo of idle) {
          let guard = 0;
          while (idx.hours[lo.id] < 8 && guard++ < 6) {
            let got = false;
            for (const hi of donors) {
              for (const pr of (idx.sched[hi.id] || []).slice()) {
                if (pr.crew.T !== hi.id) continue;
                if (Object.values(pr.crew).includes(lo.id)) continue;
                const h = pairingHours(pr);
                if (idx.hours[hi.id] - h < 30) continue;
                if (idx.hours[lo.id] + h > SOFT_MAX) continue;
                if (!pcOK(lo, pr, st, idx, 'T')) continue;
                const crew = ['C', 'F', 'T'].map(k => k === 'T' ? lo : idx.pm[pr.crew[k]]);
                if (crew.every(Boolean) && crewIssue(pr, crew, st)) continue;
                pr.crew.T = lo.id;
                idx.sched[hi.id] = idx.sched[hi.id].filter(x => x !== pr);
                idx.hours[hi.id] -= h;
                (idx.sched[lo.id] = idx.sched[lo.id] || []).push(pr);
                idx.hours[lo.id] += h;
                moved++; got = true; break;
              }
              if (got) break;
            }
            if (!got) break;
          }
        }
      }
      // 短工时↔长任务交换：仍 <8h 者用同级长任务对换
      Object.keys(by).forEach(rk => {
        const xs = by[rk]; if (xs.length < 2) return;
        const short = xs.filter(p => idx.hours[p.id] < 8);
        for (const lo of short) {
          const loPrs = (idx.sched[lo.id] || []).slice();
          for (const hi of xs.filter(p => idx.hours[p.id] >= 45).sort((a, b) => idx.hours[b.id] - idx.hours[a.id])) {
            if (idx.hours[lo.id] >= 8) break;
            for (const hiPr of (idx.sched[hi.id] || []).slice()) {
              const hiSlot = ['C', 'F', 'T'].find(k => hiPr.crew[k] === hi.id); if (!hiSlot) continue;
              const hiH = pairingHours(hiPr);
              if (hiH < 8) continue;
              if (idx.hours[hi.id] - hiH + (loPrs[0] ? pairingHours(loPrs[0]) : 0) < 25) continue;
              // 尝试：把 hi 的长任务给 lo；若 lo 有短任务则给 hi
              if (Object.values(hiPr.crew).includes(lo.id)) continue;
              let loPr = null, loSlot = null, loSaved = null, hiSaved = hiPr.crew[hiSlot];
              if (loPrs.length) {
                loPr = loPrs[0];
                loSlot = ['C', 'F', 'T'].find(k => loPr.crew[k] === lo.id);
                if (!loSlot || Object.values(loPr.crew).includes(hi.id)) continue;
                loSaved = loPr.crew[loSlot];
                // 临时摘下双方，再验合法性
                loPr.crew[loSlot] = null;
              }
              hiPr.crew[hiSlot] = null;
              // 重建轻量 idx 时间：直接用 pcOK（其 build 依赖 crew 表）
              const okLo = pcOK(lo, hiPr, st, buildIndex(st), hiSlot);
              const okHi = !loPr || pcOK(hi, loPr, st, buildIndex(st), loSlot);
              let crewBad = false;
              if (okLo) {
                const crewHi = ['C', 'F', 'T'].map(k => k === hiSlot ? lo : idx.pm[hiPr.crew[k] || (k === hiSlot ? null : hiSaved && k === hiSlot ? null : hiPr.crew[k])]);
                // 手动组装
                const cHi = { C: hiPr.crew.C, F: hiPr.crew.F, T: hiPr.crew.T }; cHi[hiSlot] = lo.id;
                const crewArr = ['C', 'F', 'T'].map(k => cHi[k] ? idx.pm[cHi[k]] : (k === hiSlot ? lo : null));
                if (crewArr.every(Boolean) && crewIssue(hiPr, crewArr, st)) crewBad = true;
              }
              if (okLo && okHi && loPr && !crewBad) {
                const cLo = { C: loPr.crew.C, F: loPr.crew.F, T: loPr.crew.T }; cLo[loSlot] = hi.id;
                const crewArr2 = ['C', 'F', 'T'].map(k => cLo[k] ? idx.pm[cLo[k]] : (k === loSlot ? hi : null));
                if (crewArr2.every(Boolean) && crewIssue(loPr, crewArr2, st)) crewBad = true;
              }
              if (!(okLo && okHi && !crewBad)) {
                hiPr.crew[hiSlot] = hiSaved;
                if (loPr) loPr.crew[loSlot] = loSaved;
                continue;
              }
              // commit（座位已清空）
              hiPr.crew[hiSlot] = lo.id;
              idx.sched[hi.id] = idx.sched[hi.id].filter(x => x !== hiPr);
              idx.hours[hi.id] -= hiH;
              (idx.sched[lo.id] = idx.sched[lo.id] || []).push(hiPr);
              idx.hours[lo.id] += hiH;
              if (loPr) {
                const loH = pairingHours(loPr);
                loPr.crew[loSlot] = hi.id;
                idx.sched[lo.id] = idx.sched[lo.id].filter(x => x !== loPr);
                idx.hours[lo.id] -= loH;
                (idx.sched[hi.id] = idx.sched[hi.id] || []).push(loPr);
                idx.hours[hi.id] += loH;
              }
              moved++; break;
            }
          }
        }
      });
      Object.keys(by).forEach(rk => {
        const xs = by[rk]; if (xs.length < 2) return;
        const over = xs.filter(p => idx.hours[p.id] > (SOFT_AIM + 4)).sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
        const under = xs.filter(p => idx.hours[p.id] < 40).sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        for (const hi of over) {
          if (idx.hours[hi.id] <= (SOFT_AIM + 4)) continue;
          for (const lo of under) {
            if (idx.hours[lo.id] >= 40) break;
            if (tryMove(idx, hi, lo, 45)) { moved++; break; }
          }
        }
      });
      if (!moved) break;
    }
    // 最终兜底：用 candidates() 给仍 <8h 的人再挂一趟（优先观察员）
    (function rescueIdle() {
      for (let round = 0; round < 5; round++) {
        const idx = buildIndex(st);
        const needy = st.pilots.filter(p => !(p.health && p.health.noFly) && idx.hours[p.id] < 8)
          .sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
        if (!needy.length) return;
        let got = false;
        for (const lo of needy) {
          const donors = st.pilots.filter(p => p.id !== lo.id && idx.hours[p.id] >= 50)
            .sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
          for (const hi of donors) {
            for (const slot of ['T', 'F', 'C']) {
              for (const pr of (idx.sched[hi.id] || []).slice()) {
                if (pr.crew[slot] !== hi.id) continue;
                if (Object.values(pr.crew).includes(lo.id)) continue;
                const h = pairingHours(pr);
                if (idx.hours[hi.id] - h < 30) continue;
                if (idx.hours[lo.id] + h > SOFT_MAX) continue;
                const saved = pr.crew[slot];
                pr.crew[slot] = null;
                const hit = candidates(st, pr, slot).find(c => c.p.id === lo.id && c.ok);
                if (!hit) { pr.crew[slot] = saved; continue; }
                const crew = ['C', 'F', 'T'].map(k => {
                  const id = k === slot ? lo.id : pr.crew[k];
                  return id ? idx.pm[id] : (k === slot ? lo : null);
                });
                // 填回试算
                pr.crew[slot] = lo.id;
                if (crew.every(Boolean) && crewIssue(pr, ['C', 'F', 'T'].map(k => idx.pm[pr.crew[k]]), st)) {
                  pr.crew[slot] = saved; continue;
                }
                idx.sched[hi.id] = idx.sched[hi.id].filter(x => x !== pr);
                idx.hours[hi.id] -= h;
                (idx.sched[lo.id] = idx.sched[lo.id] || []).push(pr);
                idx.hours[lo.id] += h;
                got = true; break;
              }
              if (got) break;
            }
            if (got) break;
          }
          if (got) break;
        }
        if (!got) return;
      }
    })();
  }

  function assignStandby(st) {
    const S = st.settings; const idx = buildIndex(st); st.standby = {}; st.pilots.forEach(p => st.standby[p.id] = []);
    const ds = dayStatus(st, idx);
    const put = (p, d) => { ds[p.id][d] = 'S'; st.standby[p.id].push(d); };
    // 每日备份：每天 standbyPerDay 人（机长类/副驾驶 交替），每人每月至多 maxStandbyPerPilot 天；其余空闲日均为正常休息
    const cnt = id => st.standby[id].length; const per = S.standbyPerDay == null ? 1 : S.standbyPerDay, cap = S.maxStandbyPerPilot == null ? 1 : S.maxStandbyPerPilot;
    const sbFtlOK = (p, d) => {
      // 试放入备份后，不得破坏已有飞行任务的 144h/48h 与连续4日后第5日等规则
      st.standby[p.id].push(d);
      const t0 = (d - 1) * DAY;
      const iv = pilotDutyIntervals(p, st, idx).filter(x => !(x[2] === 'S' && x[3] === 'SB' + d));
      let ok = has48hRestBefore(iv, t0);
      if (ok) {
        const sched = idx.sched[p.id] || [];
        if (sched.length && ftlCheckPerson(p, sched[0], st, idx, {}).length) ok = false;
      }
      st.standby[p.id].pop();
      return ok;
    };
    for (let d = 1; d <= DAYS; d++) for (let k = 0; k < per; k++) {
      const isC = (d + k) % 2 === 1;
      const pick = c => st.pilots.filter(p => isCaptClass(p.rank) === c && !(c && isNew(p.rank)) && cnt(p.id) < cap && sbOK(ds[p.id], d) && sbFtlOK(p, d))
        .sort((a, b) => cnt(a.id) - cnt(b.id) || idx.hours[a.id] - idx.hours[b.id] || a.id.localeCompare(b.id))[0];
      const p = pick(isC) || pick(!isC); if (p) put(p, d);
    }
    st.pilots.forEach(p => st.standby[p.id].sort((a, b) => a - b));
  }

  // ---------- 培训（演示：每人每月 1–2 个培训日，落在休息空档） ----------
  function assignTraining(st) {
    const idx = buildIndex(st);
    st.training = {};
    st.pilots.forEach(p => { st.training[p.id] = []; });
    const ds = dayStatus(st, idx);
    const rnd = rng(20261117);
    st.pilots.forEach(p => {
      if (p.health && p.health.noFly) return;
      if ((idx.hours[p.id] || 0) < 0.5) return; // 闲置后备保持休息，不用培训填满甘特
      const want = 1 + (rnd() < 0.55 ? 1 : 0); // 约 1–2 天
      const runs = freeRuns(ds[p.id]).filter(([a, b]) => b - a >= 1);
      const cands = [];
      runs.forEach(([a, b]) => {
        // 优先落在 2–3 日休息块中段；4 日休息块可夹 1 个培训（贴近「休4含备份/培训」）
        const mid = [];
        for (let d = a; d <= b; d++) mid.push(d);
        if (b - a + 1 >= 4) cands.push(...mid.slice(1, -1));
        else cands.push(...mid);
      });
      for (let i = 0; i < want && cands.length; i++) {
        const j = Math.floor(rnd() * cands.length);
        const d = cands.splice(j, 1)[0];
        st.training[p.id].push(d);
        ds[p.id][d] = 'N';
        // 避免连续两天培训
        for (let k = cands.length - 1; k >= 0; k--) if (Math.abs(cands[k] - d) <= 1) cands.splice(k, 1);
      }
      st.training[p.id].sort((a, b) => a - b);
    });
  }

  // ---------- 校验 ----------
  function validate(st) {
    const idx = buildIndex(st); const S = st.settings; const out = [];
    const add = (type, level, msg, pr, pid) => out.push({ type, level, msg, pairing: pr && pr.id, pilot: pid });
    for (const pr of st.pairings) {
      const crew = ['C', 'F', 'T'].map(s => pr.crew[s] && idx.pm[pr.crew[s]]);
      if (crew.some(x => !x)) add('未满员', 'hard', `${pr.id} 缺 ${['C', 'F', 'T'].filter((s, i) => !crew[i]).map(s => SLOT_NAME[s]).join('/')}`, pr);
      ['C', 'F', 'T'].forEach((s, i) => { const p = crew[i]; if (!p) return;
        if (!slotRankOK(s, p.rank, s === 'F' && pr.crew.C && idx.pm[pr.crew.C] ? idx.pm[pr.crew.C].rank : null)) add('岗位级别不符', 'hard', `${pr.id} ${SLOT_NAME[s]}位 ${p.name}(${p.rank}) 级别不符`, pr, p.id);
        const [ok, rs] = personCheck(p, pr, st, idx, { ignorePrefs: true, skipFtl: true, slot: s });
        rs.forEach(r => { const t = r.startsWith('请假') ? '请假冲突' : r.startsWith('时间') ? '时间重叠' : r.startsWith('休息') ? '休息不足'
            : (r.includes('144h') ? '144h内48h休息' : r.includes('第5日') ? '连续4日后第5日飞行' : r.includes('连续7日') ? '连续7日值勤超限' : r.includes('月飞行值勤') ? '月值勤超限' : r.includes('年飞行') ? '年飞行超限' : (r.includes('月飞行小时') || r.includes('个人月飞行上限')) ? '月小时超法规上限' : null);
          if (t) add(t, 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id);
          else if (r.includes('不适飞') || r.includes('体检已过期') || r.includes('不能作为唯一机长')) add('健康限制', 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id);
          else if (r.includes('限制高原') || r.includes('限制夜间')) add('健康限制', 'soft', `${pr.id} ${p.name}：${r}`, pr, p.id);
          else if (/144h|第5日|连续7日|月飞行值勤|年飞行/.test(r)) add('飞行时间限制', 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id); });
        day5Deadheads(p, st, idx).filter(x => x.pr === pr).forEach(x => add('第5日置位', 'soft', `${pr.id} ${p.name} 连续4个值勤日后第5日(${x.d}日)仅置位(随)：合规但尽量避免`, pr, p.id));
        const pf = daysTouched(pr, st).filter(d => (p.prefs || []).includes(d));
        if (pf.length) add('意向休息日未满足', 'soft', `${pr.id} ${p.name} 意向休息日 ${pf.join(',')} 日被排班`, pr, p.id);
      });
      if (crew.every(Boolean)) {
        const iss = crewIssue(pr, crew, st);
        if (iss) { const t = iss.includes('新机长') ? '新机长无教员' : iss.includes('restriction_table') ? '搭配限制表' : iss.includes('fo_combination_matrix') ? 'FO搭配矩阵' : iss.includes('17.1.') ? '高高原机组' : iss.includes('senior_pilot_rule') ? '58岁带队' : iss.includes('特殊机场') ? '特殊机场授权/搭配' : '座位搭配规则';
          const demo = pr.demoAnomaly ? '【演示异常】' : '';
          add(t, 'hard', `${demo}${pr.id} ${iss}`, pr); }
      }
      if (pr.demoAnomaly && pr.demoAnomalyNote) add('演示异常', 'info', `【演示异常】${pr.demoAnomalyNote}`, pr);
      if (pr.forced) Object.entries(pr.forced).forEach(([s, f]) => { if (f && pr.crew[s] === f.pilot) add('强制指派', 'soft', `${pr.id} ${SLOT_NAME[s] || s}位 强制指派 ${(st.pilots.find(x => x.id === f.pilot) || {}).name || f.pilot}（越过：${(f.reasons || []).join('；') || '无'}）`, pr); });
      fdpDays(pr, st).forEach(dy => { if (dy.planBuffer < 0) add('执勤期超限', 'hard', `${pr.id} D${dy.d} 计划 FDP ${fmtH(dy.planFdp)} > 限制 ${fmtH(dy.limit)}`, pr);
        if (dy.fltOver > 0) add('日飞行时间超限', 'hard', `${pr.id} D${dy.d} 计划飞行时间 ${fmtH(dy.planFlt)} > 表A限制 ${fmtH(dy.fltLimit)}（CCAR-121.483(a)）`, pr);
        if (dy.planRestShort > 0) add('过夜休息偏短', 'info', `${pr.id} D${dy.d}→D${dy.d + 1} 计划过夜休息 ${fmtH(dy.planRest)} < ${S.minOvernightRestH || 10}h（任务编排数据，需航线部门确认）`, pr); });
      const tl = pr.legs.filter(l => (S.bpTesterAirports || []).includes(l.from));
      if (tl.length && crew.some(Boolean)) add('需血压测试仪', 'info', `${pr.id} 自 ${[...new Set(tl.map(l => apName(l.from, st)))].join('、')} 出港（${tl.map(l => 'D' + l.d + ' ' + l.flt).join('，')}），始发站须配备血压测试仪`, pr);
      crew.forEach(p => { if (p && p.health && p.health.bpNote && tl.length) add('血压健康备注', 'info', `${pr.id} ${p.name}：${p.health.bpNote}`, pr, p.id); });
    }
    // 时间重叠会被两边各报一次，去重
    const seen = new Set(); const ded = out.filter(v => { if (v.type !== '时间重叠' && v.type !== '休息不足') return true;
      const k = v.type + v.pilot + [v.pairing, (v.msg.match(/\((PR\d+)\)/) || [])[1]].sort().join(); if (seen.has(k)) return false; seen.add(k); return true; });
    const dsv = dayStatus(st, idx);
    st.pilots.forEach(p => { (st.standby && st.standby[p.id] || []).forEach(d => { if (dsv[p.id][d] === 'D') ded.push({ type: '备份冲突', level: 'hard', msg: `${p.name} ${d}日备份与飞行任务冲突`, pilot: p.id }); });
      if (st.standby && (st.standby[p.id] || []).length > (S.maxStandbyPerPilot == null ? 1 : S.maxStandbyPerPilot)) ded.push({ type: '备份超限', level: 'soft', msg: `${p.name} 本月备份${st.standby[p.id].length}天，超过每人上限`, pilot: p.id }); });
    if (st.standby) for (let d = 1; d <= DAYS; d++) { const n = st.pilots.filter(p => (st.standby[p.id] || []).includes(d) && dsv[p.id][d] === 'S').length; const need = S.standbyPerDay == null ? 1 : S.standbyPerDay;
      if (n < need) ded.push({ type: '备份人数不足', level: 'soft', msg: `${d}日备份 ${n}/${need} 人` }); }
    // FTL 硬规则：按人×任务跑一遍（与求解器 personCheck 同口径），再扫主备份/年累计
    const ftlSeen = new Set();
    const addFtl = (type, msg, pr, pid) => { const k = type + '|' + pid + '|' + msg; if (ftlSeen.has(k)) return; ftlSeen.add(k); ded.push({ type, level: 'hard', msg, pairing: pr && pr.id, pilot: pid }); };
    st.pilots.forEach(p => {
      const h = idx.hours[p.id];
      const pCap = pilotHardCap(p, st);
      if (h > pCap + 1e-9) {
        const personal = p.health && p.health.maxMonthH > 0 && p.health.maxMonthH < hardCap(st);
        ded.push({ type: '月小时超法规上限', level: 'hard',
          msg: personal
            ? `${p.name}(${p.rank}) ${h.toFixed(1)}h > 个人月上限 ${pCap}h（体检限制）`
            : `${p.name}(${p.rank}) ${h.toFixed(1)}h > ${pCap}h（公司/法规月上限 ${CCAR121.monthFlightH}h）`,
          pilot: p.id });
      }
      const ytd = +(p.ytdFlightH || 0);
      if (ytd + h > CCAR121.yearFlightH + 1e-9) addFtl('年飞行超限', `${p.name} YTD+本月 ${(ytd + h).toFixed(1)}h > ${CCAR121.yearFlightH}h`, null, p.id);
      const sched = idx.sched[p.id] || [];
      if (sched.length) {
        ftlCheckPerson(p, sched[0], st, idx, {}).forEach(r => {
          const type = r.includes('144h') ? '144h内48h休息' : r.includes('第5日') ? '连续4日后第5日飞行' : r.includes('连续7日') ? '连续7日值勤超限' : r.includes('月飞行值勤') ? '月值勤超限' : r.includes('年飞行') ? '年飞行超限' : '飞行时间限制';
          addFtl(type, `${p.name}：${r}`, sched[0], p.id);
        });
      }
      ((st.standby || {})[p.id] || []).forEach(d => {
        const t0 = (d - 1) * DAY; const iv = pilotDutyIntervals(p, st, idx).filter(x => !(x[2] === 'S' && x[3] === 'SB' + d));
        if (!has48hRestBefore(iv, t0)) addFtl('144h内48h休息', `${p.name} ${d}日主备份前144h内无连续48h休息`, null, p.id);
      });
    });
    return ded;
  }

  // ---------- 指标 ----------
  function stats(arr) { const n = arr.length; if (!n) return { n: 0, mean: 0, std: 0, min: 0, max: 0, gini: 0 };
    const mean = arr.reduce((a, b) => a + b, 0) / n; const std = Math.sqrt(arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
    const s = arr.slice().sort((a, b) => a - b); let g = 0; s.forEach((x, i) => g += (2 * (i + 1) - n - 1) * x);
    return { n, mean, std, min: s[0], max: s[n - 1], gini: mean ? g / (n * n * mean) : 0, cv: mean ? std / mean : 0 }; }
  function summarize(st) {
    const idx = buildIndex(st); const v = validate(st);
    const per = st.pilots.map(p => { const sc = idx.sched[p.id];
      const touched = new Set(); sc.forEach(pr => daysTouched(pr, st).forEach(d => touched.add(d)));
      return { id: p.id, name: p.name, rank: p.rank, group: rankGroup(p.rank), hours: idx.hours[p.id], pairings: sc.length,
        overnights: sc.reduce((s, pr) => s + pr.ndays - 1, 0), special: sc.filter(pr => specialAirportsOf(pr, st).length).length,
        night: sc.reduce((s, pr) => s + pr.legs.filter(isNightLeg).length, 0), dutyDays: touched.size,
        gaps: restGaps(p, sc, st), standby: ((st.standby || {})[p.id] || []).length,
        prefTotal: (p.prefs || []).length, prefOK: (p.prefs || []).filter(d => !touched.has(d)).length }; });
    const groups = {}; GROUPS.forEach(g => { const xs = per.filter(x => x.group === g);
      groups[g] = { hours: stats(xs.map(x => x.hours)), overnights: stats(xs.map(x => x.overnights)), special: stats(xs.map(x => x.special)), night: stats(xs.map(x => x.night)) }; });
    const full = st.pairings.filter(p => p.crew.C && p.crew.F && p.crew.T).length;
    const byType = {}; v.forEach(x => { byType[x.type] = byType[x.type] || { level: x.level, n: 0 }; byType[x.type].n++; });
    const prefT = per.reduce((s, x) => s + x.prefTotal, 0), prefOK = per.reduce((s, x) => s + x.prefOK, 0);
    const allG = per.flatMap(x => x.gaps); const gapDist = { '0-1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
    allG.forEach(g => gapDist[g <= 1 ? '0-1' : g >= 5 ? '5+' : String(g)]++);
    const lenDist = {}; st.pairings.forEach(p => lenDist[p.ndays] = (lenDist[p.ndays] || 0) + 1);
    const sbC = per.filter(x => isCaptClass(x.rank)).map(x => x.standby), sbF = per.filter(x => isFO(x.rank)).map(x => x.standby);
    const rhythm = { gapDist, gapN: allG.length, gap23: allG.length ? allG.filter(g => g === 2 || g === 3).length / allG.length : 0, gap34: allG.length ? allG.filter(g => g === 3 || g === 4).length / allG.length : 0,
      gapMean: allG.length ? allG.reduce((a, b) => a + b, 0) / allG.length : 0, lenDist,
      standbyC: stats(sbC), standbyF: stats(sbF), standbyTotal: per.reduce((s, x) => s + x.standby, 0) };
    GROUPS.forEach(g => groups[g].standby = stats(per.filter(x => x.group === g).map(x => x.standby)));
    return { rhythm, per, groups, all: stats(per.map(x => x.hours)), coverage: st.pairings.length ? full / st.pairings.length : 0, full, total: st.pairings.length,
      violations: v, byType, hard: v.filter(x => x.level === 'hard').length, soft: v.filter(x => x.level === 'soft').length,
      info: v.filter(x => x.level === 'info').length, prefRate: prefT ? prefOK / prefT : 1, prefOK, prefT,
      totalHours: st.pairings.reduce((s, p) => s + pairingHours(p), 0) };
  }

  // ---------- 候选人（手工编辑） ----------
  // ---------- 空洞诊断：任务本身（数据）问题 vs 真实运力不足 ----------
  // 原因归类（用于分布统计）
  function reasonClass(r) { r = String(r);
    if (/未授权|资质|级别不适合|机队/.test(r)) return '资质/级别';
    if (/请假/.test(r)) return '请假';
    if (/备份|培训/.test(r)) return '备份/培训';
    if (/冲突|已在本任务|重叠/.test(r)) return '时间冲突';
    if (/48h|休息|第5日|连续/.test(r)) return '休息/连续值勤';
    if (/日飞行时间|执勤期|FDP|飞行值勤期/.test(r)) return '日飞行/执勤期超限';
    if (/月|年|上限|60h|100h|工时/.test(r)) return '工时上限';
    if (/健康|不适飞|体检|高原|夜间|机长/.test(r)) return '健康限制';
    if (/搭配|矩阵|教员|带飞|F3/.test(r)) return '机组搭配';
    return '其他'; }
  // 任务固有问题：用“空白档案、全授权、最高级别”的虚拟人单独执行此任务，仍不合规的原因即任务自身问题
  function pairingIntrinsic(pr, st) {
    const out = [];
    for (let i = 1; i < pr.legs.length; i++) if (pr.legs[i].from !== pr.legs[i - 1].to) out.push({ code: 'broken', soft: true, msg: `航段不衔接：${pr.legs[i - 1].to} → ${pr.legs[i].from}` });
    const BASE = ['ZUUU', 'ZUTF']; if (pr.legs.length && (!BASE.includes(pr.legs[0].from) || !BASE.includes(pr.legs[pr.legs.length - 1].to))) out.push({ code: 'base', msg: '未自 蓉/府 出发或未回到 蓉/府', soft: true });
    const unk = [...new Set(pr.legs.flatMap(l => [l.from, l.to]).filter(c => !AIRPORTS[c] && !(st.airports && st.airports[c] && !/\(导入\)$/.test(st.airports[c][0]))))]; if (unk.length) out.push({ code: 'airport', msg: '未知机场：' + unk.join('、'), soft: true });
    const ds = [...new Set(pr.legs.filter(l => !l.dh).map(l => Math.floor(l.dep / DAY)))].sort((a, b) => a - b); let run = ds.length ? 1 : 0, mx = run;
    for (let i = 1; i < ds.length; i++) { run = ds[i] === ds[i - 1] + 1 ? run + 1 : 1; mx = Math.max(mx, run); }
    if (mx >= 5) out.push({ code: 'consec', msg: `任务内连续 ${mx} 个执飞日（121.495(b) 4 个连续值勤日后第 5 日不得执飞），任何人都无法合规` });
    for (const slot of ['C', 'F']) {
      const ghost = { id: '__ghost' + slot, name: '虚拟', rank: slot === 'C' ? 'TC' : 'F5', squad: '', fleet: pr.ac === 'C909' ? 'C909' : 'A320', auth: [...new Set(pr.legs.flatMap(l => [l.from, l.to]))], prefs: [], leave: [], health: defaultHealth() };
      const gs = Object.assign({}, st, { pilots: [ghost], pairings: [Object.assign({}, pr, { crew: { C: null, F: null, T: null } })], standby: null, training: null, fills: [] });
      const c = candidates(gs, gs.pairings[0], slot)[0]; (c ? c.reasons : []).forEach(r => { if (!out.some(o => o.msg === r)) out.push({ code: 'ftl', msg: r + '（任务自身，估算时刻）' }); });
      if (out.some(o => o.code === 'ftl')) break; }
    // 任务级 FTL（不阻断排人，但任何机组执飞都违规）
    fdpDays(pr, st).forEach(dy => { if (dy.planBuffer < 0) out.push({ code: 'fdp', nonBlocking: true, msg: `D${dy.d} 计划执勤期 ${fmtH(dy.planFdp)} > 限制 ${fmtH(dy.limit)}（估算时刻），任何人执飞都超限` });
      if (dy.fltOver > 0) out.push({ code: 'flt', nonBlocking: true, msg: `D${dy.d} 计划飞行时间 ${fmtH(dy.planFlt)} > 限制 ${fmtH(dy.fltLimit)}（估算时刻），任何人执飞都超限` }); });
    return out;
  }
  // 单个空位诊断：全员阻断原因分布 + 分类
  function holeDiagnosis(st, pr, slot) {
    const cs = candidates(st, pr, slot); const ok = cs.filter(c => c.ok && !c.crewWarn).length; const okWarn = cs.filter(c => c.ok && c.crewWarn); const intrAll = pairingIntrinsic(pr, st); const intr = intrAll.filter(x => !x.soft && !x.nonBlocking);
    const dist = {}; let rankOK = 0, qualOK = 0;
    cs.forEach(c => { if (c.ok || !slotRankOK(slot, c.p.rank)) return; const k = new Set(c.reasons.map(reasonClass)); k.forEach(x => dist[x] = (dist[x] || 0) + 1); });
    cs.forEach(c => { if (slotRankOK(slot, c.p.rank)) { rankOK++; if (!c.reasons.some(r => /未授权|资质|机队/.test(r))) qualOK++; } });
    let cls, why;
    if (ok) { cls = '可填'; why = `${ok} 人可用`; }
    else if (okWarn.length && !intr.length) { cls = '真实运力不足'; why = `${okWarn.length} 人个人可用，但与当前机组搭配不合规：${String(okWarn[0].crewWarn).replace(/^\[[^\]]*\]\s*/, '')}（需调整同组人员或强制指派）`; dist['机组搭配'] = (dist['机组搭配'] || 0) + okWarn.length; }
    else if (intr.length) { cls = '数据问题'; why = intr.map(x => x.msg).join('；'); }
    else if (!qualOK) { cls = '数据问题'; why = rankOK ? '无人具备所需机场授权/资质' : '无此座位级别的人员'; }
    else { cls = '真实运力不足'; why = `${qualOK} 名有资质人员均不可用：` + Object.entries(dist).filter(([k]) => k !== '资质/级别').sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}人`).join('、'); }
    return { slot, ok, okWarn: okWarn.length, cls, why, intrinsic: intrAll, dist, qualified: qualOK, rankOK, total: cs.length };
  }
  // 强制指派：越过合规检查，写入并记录 override（校验仍会报违规）
  function forceAssign(st, prId, slot, pilotId, note) {
    const pr = st.pairings.find(p => p.id === prId); if (!pr) return false; const c = candidates(st, pr, slot).find(x => x.p.id === pilotId);
    pr.crew[slot] = pilotId; pr.forced = pr.forced || {}; pr.forced[slot] = { pilot: pilotId, reasons: c ? c.reasons.slice() : [], note: note || '', at: Date.now() }; return true; }
  function needAuthAirports(pr, st) { const s = new Set(); pr.legs.forEach(l => { if (l.dh) return; [l.from, l.to].forEach(c => { const cat = apCat(c, st); if (cat === 'NONE') return; const ru = sarOf(cat); if (ru ? ru.crew_qualification_required !== false : AUTH_CATS.includes(cat)) s.add(c); }); }); return [...s]; }
  function candidates(st, pr, slot, pre) {
    const idx = buildIndex(st); const res = [];
    for (const p of st.pilots) {
      if (pre && !pre(p, idx)) continue; // 求解器内：先用廉价工时条件预筛（结果与全量后过滤一致）
      const rs = []; let crewWarn = '';
      if (!slotRankOK(slot, p.rank, slot === 'F' && pr.crew.C && idx.pm[pr.crew.C] ? idx.pm[pr.crew.C].rank : null)) rs.push('级别不适合' + SLOT_NAME[slot] + '位');
      const other = ['C', 'F', 'T'].filter(s => s !== slot).map(s => pr.crew[s]);
      if (other.includes(p.id)) rs.push('已在本任务');
      // 执飞位个人授权：需授权机场（拉萨等）未授权直接排除（此前只在机组凑齐后由 crewIssue 判，空任务时候选表看不出差别）
      if (!rs.length && slot !== 'T') { const miss = needAuthAirports(pr, st).filter(c => !(p.auth || []).includes(c)); if (miss.length) rs.push('未授权 ' + miss.map(c => apName(c, st)).join('/')); }
      if (!rs.length) {
        const [, r2] = personCheck(p, pr, st, idx, { ignorePrefs: true, slot }); rs.push(...r2);
        const crew = ['C', 'F', 'T'].map(s => s === slot ? p : (pr.crew[s] && idx.pm[pr.crew[s]]));
        const iss = crewIssue(pr, crew, st);
        // 观察员位(T)：个人可用即可进候选（不因「须有教员」收成仅教员）；机组合规记 crewWarn 供自动补位优选
        // 执飞位(C/F)：crewIssue 仍阻断 ok
        if (iss) {
          if (slot === 'T') crewWarn = iss;
          else rs.push(iss);
        }
      }
      const pf = daysTouched(pr, st).filter(d => (p.prefs || []).includes(d));
      const sbd = daysTouched(pr, st).filter(d => ((st.standby || {})[p.id] || []).includes(d));
      res.push({ p, ok: rs.length === 0, reasons: rs, crewWarn, warn: pf.length ? '意向休息日' + pf.join(',') + '日' : '', standby: sbd, hours: idx.hours[p.id] });
    }
    // 观察员列表按工时排，不把教员置顶；自动补位另用 !crewWarn 优选
    return res.sort((a, b) => (b.ok - a.ok) || a.hours - b.hours);
  }

  // ---------- 空洞换人推荐 ----------
  // 请假后每个空缺位给出 topK 候选人，附合规灯与影响摘要（不改原状态）
  function holeRecommend(st, pilotId, days, opt) {
    opt = opt || {}; const topK = opt.topK || 3;
    const base = clone(st); const p = base.pilots.find(x => x.id === pilotId); if (!p) return null;
    p.leave = [...new Set([...(p.leave || []), ...days])].sort((a, b) => a - b);
    p.prefs = (p.prefs || []).filter(d => !p.leave.includes(d));
    if (base.standby && base.standby[pilotId]) base.standby[pilotId] = base.standby[pilotId].filter(d => !days.includes(d));
    const holes = [];
    for (const pr of base.pairings) {
      if (!Object.values(pr.crew).includes(pilotId)) continue;
      if (!daysTouched(pr, base).some(d => days.includes(d))) continue;
      const slot = ['C', 'F', 'T'].find(s => pr.crew[s] === pilotId);
      pr.crew[slot] = null;
      holes.push({ pairing: pr, id: pr.id, slot, from: pilotId });
    }
    const idx = buildIndex(base); const S = base.settings; const cap = hardCap(base);
    const out = holes.map(h => {
      const pr = h.pairing; const dt = daysTouched(pr, base);
      const cands = candidates(base, pr, h.slot).filter(c => c.p.id !== pilotId && slotRankOK(h.slot, c.p.rank)).slice(0, 40);
      const cands2 = cands.length ? cands : candidates(base, pr, h.slot).filter(c => c.p.id !== pilotId).slice(0, 40);
      const pool = cands2;
      const ranked = pool.map(c => {
        const hard = c.reasons.filter(r => !r.includes('限制高原') && !r.includes('限制夜间') && !r.includes('意向'));
        // candidates already folds personCheck; warn = prefs
        let light = 'red';
        if (c.ok && !c.warn) light = 'green';
        else if (c.ok && c.warn) light = 'amber';
        else if (!c.ok && c.reasons.every(r => r.includes('限制高原') || r.includes('限制夜间'))) light = 'amber';
        else light = c.ok ? 'green' : 'red';
        const ha = c.hours + pairingHours(pr);
        const prefHit = dt.filter(d => (c.p.prefs || []).includes(d));
        const sbUsed = dt.filter(d => ((base.standby || {})[c.p.id] || []).includes(d));
        const sbLeftDays = days.map(d => ({ d, n: base.pilots.filter(q => q.id !== c.p.id && ((base.standby || {})[q.id] || []).includes(d)).length - (sbUsed.includes(d) ? 0 : 0) }));
        // standby remaining after taking this person off standby for touched days
        const sbMonthLeft = Math.max(0, ((base.standby || {})[c.p.id] || []).filter(d => !dt.includes(d)).length);
        const score = (light === 'green' ? 0 : light === 'amber' ? 100 : 1000)
          + (c.standby.length ? -5 : 0) + c.hours * 0.01 + prefHit.length * 20 + (ha > cap ? 200 : 0);
        return {
          id: c.p.id, name: c.p.name, rank: c.p.rank, squad: c.p.squad || '',
          ok: c.ok, light, reasons: c.reasons.slice(), warn: c.warn || '',
          hoursBefore: +c.hours.toFixed(1), hoursAfter: +ha.toFixed(1), hoursDelta: +pairingHours(pr).toFixed(1),
          overHard: ha > cap + 1e-9, prefHit, standbyDays: c.standby.slice(), sbMonthLeft,
          fromStandby: c.standby.length > 0, score
        };
      }).sort((a, b) => a.score - b.score || a.hoursBefore - b.hoursBefore);
      const top = ranked.filter(x => x.light !== 'red').concat(ranked.filter(x => x.light === 'red')).slice(0, topK);
      // if fewer than topK non-red, still fill with red for visibility
      while (top.length < topK && ranked[top.length]) top.push(ranked[top.length]);
      const uniq = []; const seen = new Set();
      for (const x of ranked) { if (seen.has(x.id)) continue; seen.add(x.id); uniq.push(x); if (uniq.length >= topK) break; }
      return {
        id: pr.id, slot: h.slot, slotName: SLOT_NAME[h.slot],
        start: pr.start, ndays: pr.ndays, ac: pr.ac,
        route: pr.legs.map(l => apName(l.from, base) + '-' + apName(l.to, base)).join(' · '),
        legChips: pr.legs.map(l => ({ flt: l.flt, from: l.from, to: l.to, fromName: apName(l.from, base), toName: apName(l.to, base),
          spFrom: isSpecial(l.from, base), spTo: isSpecial(l.to, base), d: l.d })),
        legs: pr.legs.length, hours: +pairingHours(pr).toFixed(1),
        dates: dt, reg: [...new Set(pr.legs.map(l => l.reg).filter(Boolean))],
        crewLeft: ['C', 'F', 'T'].filter(s => s !== h.slot).map(s => { const q = idx.pm[pr.crew[s]]; return q ? { slot: s, id: q.id, name: q.name, rank: q.rank } : { slot: s, id: null }; }),
        candidates: uniq,
        nGreen: uniq.filter(x => x.light === 'green').length
      };
    });
    // 附上 leaveOptions 整案提示（链式/备份等直接候选看不到的路径）
    let plan = null;
    try {
      const lo = leaveOptions(st, pilotId, days, { max: 3 });
      const rec = (lo.solutions || []).find(x => x.recommended) || (lo.solutions || []).find(x => !x.unresolved && x.state);
      if (rec) {
        plan = { name: rec.name, desc: rec.desc, score: rec.score, steps: rec.steps, unresolved: rec.unresolved, hard: rec.hard,
          people: (rec.people || []).map(x => ({ id: x.id, name: x.name, rank: x.rank, hb: +x.hb.toFixed(1), ha: +x.ha.toFixed(1), delta: +(x.ha - x.hb).toFixed(1), prefHit: x.prefHit })),
          giniB: rec.giniB, giniA: rec.giniA, giniD: rec.giniD, sbLeft: rec.sbLeft };
        out.forEach(h => {
          const stps = rec.steps.filter(x => x.pairing === h.id || x.newPairing === h.id);
          if (stps.length) h.planSteps = stps;
        });
      }
    } catch (e) { /* ignore */ }
    return { pilot: { id: p.id, name: p.name, rank: p.rank }, days, holes: out, plan, ms: 0 };
  }

  function holeImpact(st, pilotId, days, pairingId, slot, candId) {
    const before = summarize(st); const w = clone(st);
    const p = w.pilots.find(x => x.id === pilotId); if (!p) return null;
    p.leave = [...new Set([...(p.leave || []), ...days])].sort((a, b) => a - b);
    p.prefs = (p.prefs || []).filter(d => !p.leave.includes(d));
    if (w.standby && w.standby[pilotId]) w.standby[pilotId] = w.standby[pilotId].filter(d => !days.includes(d));
    const pr = w.pairings.find(x => x.id === pairingId); if (!pr) return null;
    const fromSlot = ['C', 'F', 'T'].find(s => pr.crew[s] === pilotId) || slot;
    pr.crew[fromSlot] = candId;
    if (w.standby && w.standby[candId]) w.standby[candId] = w.standby[candId].filter(d => !daysTouched(pr, w).includes(d));
    const after = summarize(w); const idxB = buildIndex(st), idxA = buildIndex(w);
    const otherHoles = w.pairings.filter(x => Object.values(x.crew).includes(pilotId) && daysTouched(x, w).some(d => days.includes(d))).map(x => x.id);
    const ids = [pilotId, candId];
    const hours = ids.map(id => { const q = w.pilots.find(x => x.id === id); return { id, name: q.name, rank: q.rank, hb: +idxB.hours[id].toFixed(1), ha: +idxA.hours[id].toFixed(1), delta: +(idxA.hours[id] - idxB.hours[id]).toFixed(1) }; });
    const rest = ids.map(id => { const q = w.pilots.find(x => x.id === id); const gB = restGaps(q, idxB.sched[id], st), gA = restGaps(q, idxA.sched[id], w);
      return { id, name: q.name, gapsBefore: gB.slice(), gapsAfter: gA.slice() }; });
    const sbDays = days.map(d => ({ d, before: st.pilots.filter(q => ((st.standby || {})[q.id] || []).includes(d)).length,
      after: w.pilots.filter(q => ((w.standby || {})[q.id] || []).includes(d)).length }));
    return {
      hardB: before.hard, hardA: after.hard, softB: before.soft, softA: after.soft,
      giniB: +before.all.gini.toFixed(4), giniA: +after.all.gini.toFixed(4), giniD: +(after.all.gini - before.all.gini).toFixed(4),
      coverageB: before.coverage, coverageA: after.coverage,
      otherHoles, hours, rest, sbDays,
      stillOpen: !(pr.crew.C && pr.crew.F && pr.crew.T)
    };
  }


  // ---------- 运营看板指标 ----------
  // 饱和度/韧性度改编自行业「双轴四象限」思路，适配本补位演示：小时口径（已排/剩余相对个人硬上限）
  function opsZone(satPct, resiliPct) {
    // satPct / resiliPct：0–100
    if (satPct >= 80 && satPct <= 90 && resiliPct >= 10) return { id: 'ideal', label: '理想', hint: '维持配置，持续监控' };
    if (satPct > 90 && resiliPct < 5) return { id: 'critical', label: '高危', hint: '强制干预，切断非关键任务' };
    if (satPct > 90 || (satPct > 95)) return { id: 'alert', label: '警戒', hint: '主动降负荷，恢复安全缓冲' };
    if (satPct < 80) return { id: 'idle', label: '低效', hint: '任务量相对编制偏少；可增班或优化串接释放冗余价值' };
    // 80–90 但韧性 <10（小时口径下少见，因 resili≈100−sat）
    return { id: 'alert', label: '警戒', hint: '缓冲偏薄，关注扰动' };
  }
  function squadOpsMetrics(st, idx, hard) {
    const by = {};
    st.pilots.forEach(p => {
      const sq = p.squad || '未分中队';
      if (!by[sq]) by[sq] = { squad: sq, nPilots: 0, assigned: 0, capacity: 0, remain: 0 };
      const h = idx.hours[p.id] || 0; const cap = pilotHardCap(p, st);
      by[sq].nPilots++; by[sq].assigned += h; by[sq].capacity += cap; by[sq].remain += Math.max(0, cap - h);
    });
    return Object.values(by).map(x => {
      const sat = x.capacity ? x.assigned / x.capacity : 0;
      const resili = x.capacity ? x.remain / x.capacity : 0;
      const satPct = +(sat * 100).toFixed(1), resiliPct = +(resili * 100).toFixed(1);
      const zone = opsZone(satPct, resiliPct);
      return {
        squad: x.squad, nPilots: x.nPilots,
        assignedHours: +x.assigned.toFixed(1), capacityTotal: +x.capacity.toFixed(1), remainHours: +x.remain.toFixed(1),
        satPct, resiliPct, zone: zone.id, zoneLabel: zone.label
      };
    }).sort((a, b) => a.squad.localeCompare(b.squad, 'zh'));
  }
  function opsBriefText(m, st) {
    const d = String(m.focusDate).padStart(2, '0');
    const lines = [
      `【今日简报】2026-11-${d}（焦点日 · 执勤风险条目最多）`,
      `中队编制 ${m.nPilots} 人 · 本月机号 ${m.nAircraft} · 任务 ${m.nPairings} 组 · 轮挡 ${m.blockHours}h`,
      `饱和度 ${m.satPct}% · 韧性度 ${m.resiliPct}% · 四象限「${m.zoneLabel}」——${m.zoneHint}`,
      `今日运营：未满员 ${m.day.unfilled} · 高/中/超限执勤 ${m.day.fdpRisk} · 待补位空洞 ${m.day.pendingFills} · 备份缺口 ${m.day.standbyGap}`,
      `月度：未满员 ${m.unfilled} · FDP风险日 ${m.fdpRiskDays} · 备份缺口 ${m.standbyLeft} 人日 · 请假 ${m.leavePersonDays} 人日`,
      `公式：饱和度=已排飞行小时/Σ个人硬上限；韧性度=剩余可排小时/Σ个人硬上限（演示口径）`
    ];
    return lines.join('\n');
  }
  function opsMetrics(st) {
    const S = st.settings || defaultSettings(); const idx = buildIndex(st);
    const hard = hardCap(st); const dayWin = S.opsDayWindowH || 14;
    const nPilots = st.pilots.length;
    const regs = new Set(); st.pairings.forEach(p => p.legs.forEach(l => { if (l.reg) regs.add(l.reg); }));
    // also count fleet template size if sample has few flying
    const fleetN = Math.max(regs.size, Object.values(FLEET).flat().length);
    const flyingN = regs.size || fleetN;
    let blockH = 0; st.pairings.forEach(p => { blockH += pairingHours(p); });
    // 可用剩余运力：每人 (个人硬上限 - assigned) 之和（下限 0；含体检 maxMonthH）
    let remain = 0, assigned = 0, overN = 0, capacityTotal = 0;
    st.pilots.forEach(p => {
      const h = idx.hours[p.id] || 0; const cap = pilotHardCap(p, st);
      assigned += h; capacityTotal += cap; remain += Math.max(0, cap - h); if (h > cap + 1e-9) overN++;
    });
    const unfilled = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T));
    const risk = fdpRiskSummary(st);
    const highRiskDays = risk.rows.filter(r => r.risk === 'high' || r.risk === 'over' || r.risk === 'med');
    const hiOnly = risk.rows.filter(r => r.risk === 'high' || r.risk === 'over');
    // 备份：本月已排备份人日 vs 需求 DAYS * standbyPerDay
    const sbNeed = DAYS * (S.standbyPerDay == null ? 1 : S.standbyPerDay);
    let sbUsed = 0; st.pilots.forEach(p => { sbUsed += ((st.standby || {})[p.id] || []).length; });
    const sbLeft = Math.max(0, sbNeed - sbUsed);
    // 请假压力：本月请假人日
    let leaveDays = 0; st.pilots.forEach(p => { leaveDays += (p.leave || []).length; });
    // 当日（默认取高风险最多的一天或 15 日）
    const byDate = {}; highRiskDays.forEach(r => { byDate[r.date] = (byDate[r.date] || 0) + 1; });
    let focusDate = 15; let best = -1; Object.keys(byDate).forEach(d => { if (byDate[d] > best) { best = byDate[d]; focusDate = +d; } });
    const dayUnfilledList = st.pairings.filter(p => daysTouched(p, st).includes(focusDate) && !(p.crew.C && p.crew.F && p.crew.T));
    const dayUnfilled = dayUnfilledList.length;
    const dayRisk = highRiskDays.filter(r => r.date === focusDate).length;
    const dayHiRisk = hiOnly.filter(r => r.date === focusDate).length;
    const daySb = st.pilots.filter(p => ((st.standby || {})[p.id] || []).includes(focusDate)).length;
    const dayLeave = st.pilots.filter(p => (p.leave || []).includes(focusDate)).length;
    const sbPerDay = S.standbyPerDay == null ? 1 : S.standbyPerDay;
    const daySbGap = Math.max(0, sbPerDay - daySb);
    // 待补位：焦点日未满员 + 演示空洞（仍空）
    const demoOpen = (st.demoHoles || []).filter(h => {
      const pr = st.pairings.find(p => p.id === h.pairingId);
      return pr && daysTouched(pr, st).includes(focusDate) && !(pr.crew.C && pr.crew.F && pr.crew.T);
    }).length;
    const dayPending = Math.max(dayUnfilled, demoOpen);
    // 飞机利用率
    const util = flyingN && dayWin ? blockH / (flyingN * DAYS * dayWin) : 0;
    // 每机日航段
    let legs = 0; st.pairings.forEach(p => { legs += p.legs.length; });
    const legsPerAcDay = flyingN ? legs / (flyingN * DAYS) : 0;
    const usedPct = capacityTotal ? assigned / capacityTotal : 0;
    const resili = capacityTotal ? remain / capacityTotal : 0;
    const satPct = +(usedPct * 100).toFixed(1);
    const resiliPct = +(resili * 100).toFixed(1);
    const zone = opsZone(satPct, resiliPct);
    const bySquadron = squadOpsMetrics(st, idx, hard);
    const out = {
      hardMaxHours: hard, opsDayWindowH: dayWin,
      nPilots, nAircraft: flyingN, fleetTemplate: fleetN, nPairings: st.pairings.length, nLegs: legs,
      blockHours: +blockH.toFixed(1), assignedHours: +assigned.toFixed(1),
      capacityTotal, remainHours: +remain.toFixed(1), usedPct,
      satPct, resiliPct, sat: usedPct, resili,
      zone: zone.id, zoneLabel: zone.label, zoneHint: zone.hint,
      overHardPilots: overN,
      pilotsPerAircraft: flyingN ? +(nPilots / flyingN).toFixed(2) : 0,
      blockPerPilot: nPilots ? +(blockH / nPilots).toFixed(2) : 0,
      blockPerAircraft: flyingN ? +(blockH / flyingN).toFixed(2) : 0,
      aircraftUtil: util, aircraftUtilPct: +(util * 100).toFixed(1),
      legsPerAcDay: +legsPerAcDay.toFixed(2),
      unfilled: unfilled.length, unfilledIds: unfilled.slice(0, 12).map(p => p.id),
      fdpRisk: risk.cnt, fdpRiskDays: highRiskDays.length,
      standbyNeed: sbNeed, standbyUsed: sbUsed, standbyLeft: sbLeft,
      leavePersonDays: leaveDays,
      focusDate,
      day: {
        unfilled: dayUnfilled, fdpRisk: dayRisk, fdpHigh: dayHiRisk,
        standby: daySb, leave: dayLeave, standbyGap: daySbGap, pendingFills: dayPending,
        unfilledIds: dayUnfilledList.slice(0, 8).map(p => p.id)
      },
      bySquadron,
      formulas: {
        sat: '饱和度 = 已排飞行小时 ÷ Σ个人硬上限（≈ usedPct；人天口径演示中用小时等价）',
        resili: '韧性度 = Σ max(0, 个人硬上限 − 已排) ÷ Σ个人硬上限（可排冗余运力占比）',
        zone: '理想：饱和80–90%且韧性≥10%；低效：饱和<80%；警戒：饱和>90%；高危：饱和>90%且韧性<5%',
        remain: 'Σ max(0, 法规月上限 − 已排飞行小时)',
        pilotsPerAc: '飞行员人数 ÷ 本月出现过的机号数',
        blockPerPilot: '总轮挡小时 ÷ 飞行员人数',
        blockPerAc: '总轮挡小时 ÷ 机号数',
        util: '总轮挡小时 ÷ (机号数 × 日历天数 × 日可用窗口小时)',
        legsPerAcDay: '总航段数 ÷ (机号数 × 日历天数)'
      }
    };
    out.briefText = opsBriefText(out, st);
    return out;
  }

  // ---------- 请假调配 ----------
  function applyLeave(st, pilotId, days) {
    const p = st.pilots.find(x => x.id === pilotId); if (!p) return null;
    const before = JSON.parse(JSON.stringify(st.pairings.map(x => ({ id: x.id, crew: x.crew }))));
    p.leave = [...new Set([...(p.leave || []), ...days])].sort((a, b) => a - b);
    p.prefs = (p.prefs || []).filter(d => !p.leave.includes(d));
    if (st.standby && st.standby[pilotId]) st.standby[pilotId] = st.standby[pilotId].filter(d => !p.leave.includes(d));
    const affected = st.pairings.filter(pr => Object.values(pr.crew).includes(pilotId) && daysTouched(pr, st).some(d => days.includes(d)));
    const changes = [], unresolved = [];
    for (const pr of affected) {
      const slot = ['C', 'F', 'T'].find(s => pr.crew[s] === pilotId); pr.crew[slot] = null;
      let cands = candidates(st, pr, slot).filter(c => c.ok);
      const crewOk = cands.filter(c => !c.crewWarn); if (crewOk.length || ['C', 'F', 'T'].filter(k => k !== slot).every(k => pr.crew[k])) cands = crewOk; // 机组已满时不得引入组合违规（如新机长无教员）
      const noWarn = cands.filter(c => !c.warn); if (noWarn.length) cands = noWarn;
      // 首选：任务首日在备份的人员
      const d0 = daysTouched(pr, st)[0];
      cands.sort((a, b) => (b.standby.includes(d0) - a.standby.includes(d0)) || (b.standby.length > 0) - (a.standby.length > 0) || ((b.p.rank === p.rank) - (a.p.rank === p.rank)) || a.hours - b.hours); // 同级空闲优先（同级转让）
      if (cands.length) { const c0 = cands[0], q = c0.p; pr.crew[slot] = q.id;
        if (c0.standby.length && st.standby) st.standby[q.id] = st.standby[q.id].filter(d => !c0.standby.includes(d));
        changes.push({ pairing: pr.id, slot, from: p, to: q, fromStandby: c0.standby.length > 0, note: c0.standby.length ? `调用备份（${c0.standby.join(',')}日备份）` : c0.warn ? '（占用其意向休息日）' : '' }); }
      else { const all = candidates(st, pr, slot).filter(c => slotRankOK(slot, c.p.rank));
        const cnt = {}; all.forEach(c => c.reasons.forEach(r => { const k = r.replace(/\(.*\)/, '').replace(/：.*/, ''); cnt[k] = (cnt[k] || 0) + 1; }));
        unresolved.push({ pairing: pr.id, slot, reason: '无合规替补；候选人主要不满足：' + Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => k + '×' + n).join('，') }); }
    }
    if (unresolved.length) { const sw = swapFillHoles(st, { ms: 2500 }); sw.forEach(m => { const i = unresolved.findIndex(u => u.pairing === m.pairing && u.slot === m.slot); if (i >= 0) { unresolved.splice(i, 1); const q = st.pilots.find(x => x.id === m.pilot); changes.push({ pairing: m.pairing, slot: m.slot, from: p, to: q, note: `同级换班：${m.via} 换给 ${(st.pilots.find(x => x.id === m.to) || {}).name || m.to}` }); } }); }
    return { pilot: p, days, affected: affected.map(x => x.id), changes, unresolved, before };
  }


  // ---------- 临时请假 · 多方案 ----------
  const clone = o => JSON.parse(JSON.stringify(o));
  const prOf = (w, id) => w.pairings.find(x => x.id === id);
  function rhythmCost(p, list, st) { return restGaps(p, list, st).reduce((s, g) => s + (g <= 1 ? 3 : g === 4 ? 1 : g >= 5 ? 2 : 0), 0); }
  function addCost(w, p, pr, idx) { const sc = idx.sched[p.id]; return rhythmCost(p, sc.concat([pr]), w) - rhythmCost(p, sc, w); }
  function takeStandby(w, pid, pr) { if (w.standby && w.standby[pid]) { const td = daysTouched(pr, w); w.standby[pid] = w.standby[pid].filter(d => !td.includes(d)); } }
  // 链式调换：从另一任务 Q 调来 q 顶替 pr，再为 Q 找替补（最多 2 层）
  function chainOpts(w, pr, slot, ban, max) {
    const idx = buildIndex(w); const out = []; const td = daysTouched(pr, w); let tries = 0;
    const qs = w.pilots.filter(q => slotRankOK(slot, q.rank) && !ban.has(q.id) && !Object.values(pr.crew).includes(q.id) && !td.some(d => (q.leave || []).includes(d) || (q.prefs || []).includes(d)))
      .sort((a, b) => idx.hours[a.id] - idx.hours[b.id]);
    for (const q of qs) {
      if (out.length >= (max || 3) || tries > 80) break;
      const [, rs] = personCheck(q, pr, w, idx, { ignorePrefs: true, slot }); if (!rs.length) continue;
      const ids = [...new Set(rs.map(r => (r.match(/\((PR\d+)\)/) || [])[1]))]; if (ids.length !== 1 || !ids[0] || rs.some(r => !/\(PR\d+\)/.test(r) && !/超出.*月.*上限/.test(r))) continue;
      const Q = prOf(w, ids[0]); const sQ = ['C', 'F', 'T'].find(x => Q.crew[x] === q.id); if (!sQ || ban.has('PR:' + Q.id)) continue; tries++;
      Q.crew[sQ] = null; const idx2 = buildIndex(w);
      const [ok2] = personCheck(q, pr, w, idx2, { ignorePrefs: true, slot }); const crew = ['C', 'F', 'T'].map(x => x === slot ? q : (pr.crew[x] && idx2.pm[pr.crew[x]]));
      if (ok2 && !crewIssue(pr, crew, w) && !(idx2.hours[q.id] + pairingHours(pr) > pilotHardCap(q, w))) {
        pr.crew[slot] = q.id;
        const bf = candidates(w, Q, sQ).filter(c => c.ok && !ban.has(c.p.id) && c.p.id !== q.id && !c.crewWarn).sort((a, b) => (!!a.crewWarn - !!b.crewWarn) || (!!a.warn - !!b.warn) || (b.standby.length > 0) - (a.standby.length > 0) || a.hours - b.hours)[0];
        pr.crew[slot] = null;
        if (bf) out.push({ q, Q, sQ, bf });
      }
      Q.crew[sQ] = q.id;
    }
    return out;
  }
  function blockReason(w, pr, slot) {
    const all = candidates(w, pr, slot).filter(c => slotRankOK(slot, c.p.rank)); const cnt = {};
    all.forEach(c => c.reasons.forEach(r => { const k = r.replace(/\(.*\)/, '').replace(/：.*/, ''); cnt[k] = (cnt[k] || 0) + 1; }));
    const rules = []; const sp = specialAirportsOf(pr, w);
    if (pr.legs.some(l => l.to === 'ZULS' || l.from === 'ZULS')) rules.push('拉萨航段须两名 J3 及以上');
    if (sp.length) rules.push('特殊机场 ' + sp.map(c => apName(c, w)).join('、') + ' 须授权/级别搭配');
    const crew = ['C', 'F', 'T'].map(x => pr.crew[x] && w.pilots.find(p => p.id === pr.crew[x])).filter(Boolean);
    if (crew.some(x => isNew(x.rank)) && slot !== 'F') rules.push('新机长所在机组须有 TL 及以上教员');
    const bp = pr.legs.filter(l => (w.settings.bpTesterAirports || []).includes(l.from)); if (bp.length) rules.push('始发站 ' + [...new Set(bp.map(l => apName(l.from, w)))].join('、') + ' 须配备血压测试仪（提醒）');
    return { top: Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => k + '×' + n), rules };
  }
  const STRATS = {
    standby: { name: '调用当日备份', desc: '优先使用备份（Standby）人员' },
    rhythm: { name: '休息人员 · 节奏最优', desc: '空闲且合格，尽量不打乱 3–4 天飞 / 2–3 天休节奏' },
    hours: { name: '休息人员 · 工时均衡', desc: '空闲且合格，优先本月小时较少者' },
    alt: { name: '休息人员 · 备选', desc: '与其他方案不同的另一批候选人' },
    chain: { name: '链式调换', desc: '从其他任务调人顶替，再为该任务补位（≤2 层）' } };
  function fillVac(w, vac, key, ban, usedRest) {
    const steps = [];
      for (const v of vac) {
        const pr = prOf(w, v.id); const idx = buildIndex(w);
        let cands = candidates(w, pr, v.slot).filter(c => c.ok && !ban.has(c.p.id));
        const crewOk = cands.filter(c => !c.crewWarn); if (crewOk.length || ['C', 'F', 'T'].filter(k => k !== v.slot).every(k => pr.crew[k])) cands = crewOk; // 机组已满时不得引入组合违规（如新机长无教员）
        const sb = cands.filter(c => c.standby.length).sort((a, b) => a.hours - b.hours);
        let rest = cands.filter(c => !c.standby.length);
        const noPref = rest.filter(c => !c.warn); if (noPref.length) rest = noPref;
        rest.forEach(c => c.rc = addCost(w, c.p, pr, idx));
        const byRhythm = rest.slice().sort((a, b) => a.rc - b.rc || a.hours - b.hours), byHours = rest.slice().sort((a, b) => a.hours - b.hours || a.rc - b.rc);
        let pick = null, chain = null;
        const restPick = list => list[0] && { c: list[0], type: 'rest' };
        if (key === 'standby') pick = sb[0] ? { c: sb[0], type: 'standby' } : restPick(byRhythm);
        else if (key === 'rhythm') pick = restPick(byRhythm);
        else if (key === 'hours') pick = restPick(byHours);
        else if (key === 'alt') pick = restPick(byRhythm.filter(c => !usedRest.has(c.p.id))) || restPick(byRhythm);
        else if (key === 'chain') { chain = chainOpts(w, pr, v.slot, ban, 1)[0]; if (!chain) pick = sb[0] ? { c: sb[0], type: 'standby' } : restPick(byRhythm); }
        if (!pick && !chain && key !== 'chain') chain = chainOpts(w, pr, v.slot, ban, 1)[0];
        if (!pick && !chain && sb[0]) pick = { c: sb[0], type: 'standby' };
        if (chain) { const { q, Q, sQ, bf } = chain; Q.crew[sQ] = bf.p.id; pr.crew[v.slot] = q.id; takeStandby(w, bf.p.id, Q); takeStandby(w, q.id, pr);
          ban.add(q.id); ban.add(bf.p.id);
          steps.push({ pairing: pr.id, slot: v.slot, from: v.from, why: v.why, type: 'chain', to: q.id, chain: { pairing: Q.id, slot: sQ, from: q.id, to: bf.p.id, fromStandby: bf.standby.length > 0 } });
        } else if (pick) { const q = pick.c.p; pr.crew[v.slot] = q.id; takeStandby(w, q.id, pr); ban.add(q.id); if (pick.type === 'rest') usedRest.add(q.id);
          steps.push({ pairing: pr.id, slot: v.slot, from: v.from, why: v.why, type: pick.type, to: q.id, prefWarn: pick.c.warn || '' });
        } else steps.push({ pairing: pr.id, slot: v.slot, from: v.from, why: v.why, type: 'manual', block: blockReason(w, pr, v.slot) });
      }
    return steps;
  }
  function leaveOptions(st, pilotId, days, opt) {
    opt = opt || {}; const t0 = Date.now();
    const base = clone(st); const p = base.pilots.find(x => x.id === pilotId); if (!p) return null;
    p.leave = [...new Set([...(p.leave || []), ...days])].sort((a, b) => a - b); p.prefs = (p.prefs || []).filter(d => !p.leave.includes(d));
    if (base.standby && base.standby[pilotId]) base.standby[pilotId] = base.standby[pilotId].filter(d => !p.leave.includes(d));
    const affected = base.pairings.filter(pr => Object.values(pr.crew).includes(pilotId) && daysTouched(pr, base).some(d => days.includes(d))).sort((a, b) => a.start - b.start);
    const vac = affected.map(pr => { const slot = ['C', 'F', 'T'].find(x => pr.crew[x] === pilotId); pr.crew[slot] = null; return { id: pr.id, slot }; });
    const before = summarize(st), bIdx = buildIndex(st);
    if (!vac.length) { const sol = evaluate(st, base, [], 'none', before, bIdx); sol.name = '仅登记请假'; sol.desc = '所选日期内无任务，无需调配'; return { pilot: p, days, affected: [], solutions: [sol], ms: Date.now() - t0 }; }
    const sols = []; const usedRest = new Set();
    const keys = ['standby', 'rhythm', 'hours', 'chain', 'alt', 'alt', 'alt', 'alt']; let uniq = new Set();
    for (let ki = 0; ki < keys.length; ki++) { const key = keys[ki]; if (ki >= 5 && uniq.size >= 3) break;
      const w = clone(base); const steps = []; const ban = new Set([pilotId]);
      steps.push(...fillVac(w, vac.map(v => Object.assign({ from: pilotId }, v)), key, ban, usedRest));
      const sol = evaluate(st, w, steps, key, before, bIdx); sol.name = STRATS[key].name + (ki > 4 ? ' ' + (ki - 3) : ''); sol.desc = STRATS[key].desc; sols.push(sol); uniq.add(sol.sig);
    }
    const seen = new Set(); let out = sols.filter(x => { if (seen.has(x.sig)) return false; seen.add(x.sig); return true; });
    out.sort((a, b) => a.score - b.score);
    const ok = out.filter(x => !x.unresolved); if (ok.length) ok[0].recommended = true;
    if (!ok.length) out.forEach(x => x.manual = true);
    return { pilot: p, days, affected: vac, solutions: out.slice(0, opt.max || 5), ms: Date.now() - t0 };
  }
  function evaluate(st0, w, steps, key, before, bIdx) {
    const s = summarize(w), idx = buildIndex(w); const pm = {}; w.pilots.forEach(p => pm[p.id] = p);
    const ids = new Set(); steps.forEach(x => { if (x.from && x.type !== 'manual') ids.add(x.from); if (x.to) ids.add(x.to); if (x.chain) { ids.add(x.chain.from); ids.add(x.chain.to); } });
    const people = [...ids].map(id => { const p = pm[id], hb = bIdx.hours[id], ha = idx.hours[id];
      const newPr = idx.sched[id].filter(pr => !bIdx.sched[id].some(o => o.id === pr.id));
      const prefHit = [...new Set(newPr.flatMap(pr => daysTouched(pr, w)).filter(d => (p.prefs || []).includes(d)))];
      const rb = rhythmCost(p, bIdx.sched[id], w), ra = rhythmCost(p, idx.sched[id], w);
      return { id, name: p.name, rank: p.rank, hb, ha, overHard: ha > pilotHardCap(p, w) + 1e-9, prefHit, rhythm: ra - rb }; });
    const days = [...new Set(steps.flatMap(x => daysTouched(prOf(w, x.pairing), w)))].sort((a, b) => a - b);
    const sbLeft = days.map(d => ({ d, n: w.pilots.filter(p => ((w.standby || {})[p.id] || []).includes(d)).length }));
    const unresolved = steps.filter(x => x.type === 'manual').length;
    const hardNew = s.hard - (unresolved ? steps.filter(x => x.type === 'manual').length : 0);
    const bp = steps.filter(x => x.type !== 'manual').map(x => prOf(w, x.pairing)).filter(pr => pr.legs.some(l => (w.settings.bpTesterAirports || []).includes(l.from))).map(pr => pr.id);
    const giniD = s.all.gini - before.all.gini; const prefN = people.reduce((a, x) => a + x.prefHit.length, 0); const rhy = people.reduce((a, x) => a + Math.max(0, x.rhythm), 0);
    const nSb = steps.filter(x => x.type === 'standby' || (x.chain && x.chain.fromStandby)).length, nChain = steps.filter(x => x.type === 'chain').length;
    const outR = people.filter(x => x.overHard).length;
    const score = unresolved * 1000 + Math.max(0, hardNew) * 500 + outR * 200 + prefN * 25 + rhy * 4 + Math.max(0, giniD) * 2000 + nChain * 6 + people.length * 2 - nSb * 5
      + sbLeft.filter(x => x.n === 0).length * 3;
    return { key, steps, state: w, people, giniB: before.all.gini, giniA: s.all.gini, giniD, sbLeft, unresolved, hard: s.hard, hardNew: Math.max(0, hardNew), bp, prefN, rhy, score: Math.round(score * 10) / 10,
      gap23B: before.rhythm.gap23, gap23A: s.rhythm.gap23, sig: steps.map(x => x.pairing + x.slot + (x.to || 'x') + (x.chain ? x.chain.pairing + x.chain.to : '')).join('|') };
  }

  // ---------- 飞行值勤期（FDP）· 执勤监控 ----------
  const legKey = l => l.flt + '@' + l.dep;
  const LEG_COLS = ['1–4 段', '5 段', '6 段', '7 段及以上'];
  function fdpLimit(st, reportMin, nLegs) {
    const S = st.settings; // 三人制：忽略 fdpAugmented / 表C
    const h = (((reportMin % DAY) + DAY) % DAY) / 60; const T = S.fdpTable || defaultFdpTable();
    const row = T.find(r => h >= r.from && h < r.to) || T[T.length - 1]; const c = nLegs <= 4 ? 0 : nLegs === 5 ? 1 : nLegs === 6 ? 2 : 3;
    return row.lim[c] * 60;
  }
  // 逐日 FDP（按实际/预计时刻，不做延误级联）。
  // acts: { legKey: { dep?:分钟, arr?:分钟, kind:'est'|'act' } }（分钟自 11/01 00:00，可跨午夜）。
  // 未录入的航段按计划时刻；录入起飞未录落地时，落地 = 起飞 + 计划轮挡。pr.freshAt=legKey：新机组自该段（实际/预计）起飞前报到。
  // 另算“若不追回”的级联推算（cascEnd/cascExceed），仅作提示，不计入超限。
  // 求解期间缓存「计划」FDP（航段/设置在 autoFill 内不变）；求解结束即清空
  let FDP_PLAN_CACHE = null;
  function fdpDays(pr, st, acts) {
    if (!acts && FDP_PLAN_CACHE) { const c = FDP_PLAN_CACHE.get(pr); if (c) return c; const v = fdpDaysRaw(pr, st); FDP_PLAN_CACHE.set(pr, v); return v; }
    return fdpDaysRaw(pr, st, acts);
  }
  function fdpDaysRaw(pr, st, acts) {
    acts = acts || {}; const S = st.settings; const rep = S.reportMin || 60, rel = S.releaseMin || 30, turn = S.minTurnMin || 35;
    const out = []; let prevC = null;
    pr.legs.forEach((l, i) => { const a = acts[legKey(l)] || {}; const blk = l.arr - l.dep;
      const dep = a.dep != null ? a.dep : l.dep; const arr = a.arr != null ? a.arr : (a.dep != null ? a.dep + blk : l.arr);
      const known = a.dep != null || a.arr != null;
      // 级联（不追回）推算：录入值优先，否则受前段级联落地 + 最短过站约束
      let cdep = known ? dep : l.dep; if (!known && prevC && prevC.leg.d === l.d) cdep = Math.max(cdep, prevC.carr + Math.min(turn, l.dep - prevC.leg.arr));
      const carr = known ? arr : cdep + blk;
      const x = { i, leg: l, dep, arr, known, kind: known ? (a.kind || 'est') : 'plan', landed: a.arr != null && a.kind === 'act', departed: a.dep != null && a.kind === 'act',
        late: dep - l.dep, lateArr: arr - l.arr, cdep, carr, conflict: prevC && prevC.leg.d === l.d && dep < prevC.arr && !known ? prevC.arr - dep : 0 };
      x.dly = Math.max(0, x.late); // 兼容
      let day = out[out.length - 1]; if (!day || day.d !== l.d) { day = { d: l.d, legs: [] }; out.push(day); }
      day.legs.push(x); prevC = x; });
    out.forEach((dy, k) => { const f = dy.legs[0];
      dy.date = Math.floor(f.leg.dep / DAY) + 1;
      dy.start = (pr.freshAt && pr.freshAt === legKey(f.leg)) ? f.dep - rep : f.leg.dep - rep;
      dy.end = Math.max(...dy.legs.map(x => x.arr)); dy.planEnd = dy.legs[dy.legs.length - 1].leg.arr;
      dy.cascEnd = Math.max(...dy.legs.map(x => x.carr));
      dy.fdp = dy.end - dy.start; dy.planFdp = dy.planEnd - (f.leg.dep - rep);
      dy.limit = fdpLimit(st, f.leg.dep - rep, dy.legs.length); dy.buffer = dy.limit - dy.fdp; dy.planBuffer = dy.limit - dy.planFdp;
      dy.planFlt = dy.legs.reduce((a, x) => a + (x.leg.dh ? 0 : x.leg.arr - x.leg.dep), 0); dy.fltLimit = flightLimitMin(st, f.leg.dep - rep); dy.fltOver = Math.max(0, dy.planFlt - dy.fltLimit);
      dy.exceed = Math.max(0, -dy.buffer);
      dy.cascExceed = dy.exceed ? 0 : Math.max(0, dy.cascEnd - dy.start - dy.limit);
      dy.cascLeg = dy.cascExceed ? dy.legs.find(x => x.carr > dy.start + dy.limit) : null;
      dy.exLeg = dy.exceed ? dy.legs.find(x => x.arr > dy.start + dy.limit) : null;
      dy.nLanded = dy.legs.filter(x => x.landed).length; dy.nKnown = dy.legs.filter(x => x.known).length;
      dy.risk = dy.buffer < 0 ? 'over' : dy.buffer < (S.fdpRiskHigh || 60) ? 'high' : dy.buffer < (S.fdpRiskMed || 120) ? 'med' : 'low';
      dy.planRisk = dy.planBuffer < 0 ? 'over' : dy.planBuffer < (S.fdpRiskHigh || 60) ? 'high' : dy.planBuffer < (S.fdpRiskMed || 120) ? 'med' : 'low';
      const nx = out[k + 1]; if (nx) { const req = (S.minOvernightRestH || 10) * 60; dy.restAfter = (nx.legs[0].dep - rep) - (dy.end + rel); dy.planRest = (nx.legs[0].leg.dep - rep) - (dy.planEnd + rel);
        dy.restShort = dy.restAfter < dy.planRest ? Math.max(0, req - dy.restAfter) : 0; dy.planRestShort = Math.max(0, req - dy.planRest); } });
    return out;
  }
  // 旧版 st.delays {legKey: 分钟} → st.actuals：仅对该段本身设预计起飞/落地（不再级联）
  function migrateDelays(st) {
    if (!st.delays) { st.actuals = st.actuals || {}; return st; }
    st.actuals = st.actuals || {}; const legs = {}; st.pairings.forEach(p => p.legs.forEach(l => legs[legKey(l)] = l));
    Object.keys(st.delays).forEach(k => { const v = +st.delays[k] || 0; const l = legs[k]; if (l && v > 0 && !st.actuals[k]) st.actuals[k] = { dep: l.dep + v, arr: l.arr + v, kind: 'est' }; });
    delete st.delays; return st;
  }
  const RISK_ORDER = { over: 0, high: 1, med: 2, low: 3 };
  function pairingRisk(pr, st, delays) { const ds = fdpDays(pr, st, delays); const w = ds.slice().sort((a, b) => RISK_ORDER[delays ? a.risk : a.planRisk] - RISK_ORDER[delays ? b.risk : b.planRisk] || a.buffer - b.buffer)[0];
    return { days: ds, worst: w, risk: w ? (delays ? w.risk : w.planRisk) : 'low' }; }
  function fdpRiskSummary(st) {
    const rows = []; st.pairings.forEach(pr => fdpDays(pr, st).forEach(dy => rows.push({ pr: pr.id, d: dy.d, date: dy.date, legs: dy.legs.length, fdp: dy.planFdp, limit: dy.limit, buffer: dy.planBuffer, risk: dy.planRisk, restAfter: dy.planRest, restShort: dy.planRestShort })));
    const cnt = { over: 0, high: 0, med: 0, low: 0 }; rows.forEach(r => cnt[r.risk]++);
    return { rows: rows.sort((a, b) => a.buffer - b.buffer), cnt, n: rows.length, restShort: rows.filter(r => r.restShort > 0) };
  }
  // 机组成员的下一个任务休息是否被延误压缩
  function downstream(st, pr, days, idx) {
    idx = idx || buildIndex(st); const S = st.settings; const rel = S.releaseMin || 30; const out = [];
    const last = days[days.length - 1]; const end = last.end + rel;
    ['C', 'F', 'T'].forEach(s => { const id = pr.crew[s]; if (!id) return;
      const nx = idx.sched[id].filter(o => o !== pr && o.id !== pr.id && report(o, st) >= release(pr, st)).sort((a, b) => report(a, st) - report(b, st))[0];
      if (!nx) return; const gap = report(nx, st) - end;
      if (gap < S.minRestH * 60) out.push({ pilot: id, slot: s, next: nx.id, nextSlot: ['C', 'F', 'T'].find(k => nx.crew[k] === id), gap, short: S.minRestH * 60 - gap }); });
    days.forEach(dy => { if (dy.restShort > 0) out.push({ overnight: true, d: dy.d, short: dy.restShort, restAfter: dy.restAfter }); });
    return out;
  }
  function dutyMonitor(st, date) {
    const delays = st.actuals || {}; const idx = buildIndex(st); const res = [];
    for (const pr of st.pairings) { const ds = fdpDays(pr, st, delays); const dy = ds.find(x => x.date === date); if (!dy) continue;
      const dn = downstream(st, pr, ds, idx).filter(x => !x.overnight || x.d >= dy.d);
      res.push({ pr, day: dy, days: ds, downstream: dn, exceed: ds.some(x => x.exceed > 0 && x.date >= date) }); }
    return res.sort((a, b) => (b.exceed - a.exceed) || a.day.buffer - b.day.buffer);
  }
  // 拆分任务：legs[0..j-1] 留在原任务，legs[j..] 成为新任务（新机组接手）
  function splitPairing(w, pr, j) {
    const A = pr.legs.slice(0, j), B = pr.legs.slice(j); const d0 = B[0].d;
    const mk = (id, legs) => ({ id, start: Math.floor((legs[0].dep - (w.settings.reportMin || 60)) / DAY) + 1, ndays: 0, ac: legs.some(l => l.ac === 'A321') ? 'A321' : 'A320', legs, crew: { C: null, F: null, T: null } });
    const nb = mk(pr.id + '-B', B.map(l => Object.assign({}, l, { d: l.d - d0 + 1 }))); nb.ndays = nb.legs[nb.legs.length - 1].d; nb.freshAt = legKey(B[0]); nb.splitFrom = pr.id;
    if (A.length) { pr.legs = A; pr.ndays = A[A.length - 1].d; w.pairings.splice(w.pairings.indexOf(pr) + 1, 0, nb); return { A: pr, B: nb }; }
    // 当日首段即从成都出发：整组替换（任务不拆分）
    pr.freshAt = legKey(pr.legs[0]); return { A: null, B: pr };
  }
  function fdpOptions(st, prId, opt) {
    opt = opt || {}; const t0 = Date.now(); const delays = st.actuals || {};
    const pr0 = st.pairings.find(p => p.id === prId); if (!pr0) return null;
    const ds0 = fdpDays(pr0, st, delays); const idx0 = buildIndex(st);
    const ex = ds0.find(x => x.exceed > 0) || null; const dn0 = downstream(st, pr0, ds0, idx0);
    const crew0 = { ...pr0.crew }; const before = summarize(st), bIdx = idx0;
    const sols = []; const usedRest = new Set();
    // 拆分点：
    // 1) 已超限：超限日、超限段之前从成都出发的航段（基地换组）
    // 2) 已超限或高风险（余量 < fdpRiskHigh）：该风险日首段（异地换组，需运控确认位置/DH）
    const splits = []; const riskHigh = (st.settings.fdpRiskHigh || 60);
    const riskDay = ex || ds0.slice().sort((a, b) => a.buffer - b.buffer)[0];
    const needSplit = ex || (riskDay && riskDay.buffer < riskHigh && riskDay.buffer >= 0);
    if (ex) { const exI = ex.exLeg.i; const dayLegs = ex.legs.map(x => x.i);
      const cand = dayLegs.filter(i => i <= exI && pr0.legs[i].from === 'ZUUU');
      if (cand.length) { splits.push(cand[cand.length - 1]); if (cand[0] !== cand[cand.length - 1]) splits.push(cand[0]); } }
    if (needSplit && riskDay) {
      const dayStart = riskDay.legs[0].i;
      if (!splits.includes(dayStart)) splits.push(dayStart);
    }
    const mkBase = j => { const w = clone(st); const pr = w.pairings.find(p => p.id === prId); const sp = splitPairing(w, pr, j);
      const vac = ['C', 'F', 'T'].map(s => ({ id: sp.B.id, slot: s, from: crew0[s] })); if (!sp.A) ['C', 'F', 'T'].forEach(s => sp.B.crew[s] = null);
      return { w, sp, vac }; };
    const keys = ['standby', 'rhythm', 'hours', 'chain', 'alt'];
    for (const j of splits) for (const key of keys) {
      const { w, sp, vac } = mkBase(j); const ban = new Set(Object.values(crew0).filter(Boolean));
      const st0 = pr0.legs[j]; const head = { pairing: prId, type: 'split', at: j, station: st0.from, time: st0.dep, newPairing: sp.B.id, whole: !sp.A, legsB: sp.B.legs.length };
      const steps = [head].concat(fillVac(w, vac, key, ban, usedRest));
      if (sp.A) { const dA = fdpDays(sp.A, w, delays); downstream(w, sp.A, dA).filter(x => !x.overnight).forEach(x => { const q = w.pairings.find(p => p.id === x.next); if (q && q.crew[x.nextSlot] === x.pilot) { q.crew[x.nextSlot] = null; steps.push(...fillVac(w, [{ id: q.id, slot: x.nextSlot, from: x.pilot, why: '休息不足' }], key, ban, usedRest)); } }); }
      const sol = evaluate(st, w, steps, key, before, bIdx); fdpEval(sol, w, delays, [prId, sp.B.id]);
      const atBase = st0.from === 'ZUUU';
      const tag = ex ? '拆分换组' : '预防性拆分换组';
      sol.name = (sp.A ? `${tag}@${apName(st0.from, st)}` : '整组替换') + ' · ' + STRATS[key].name.replace('休息人员 · ', '');
      sol.desc = sp.A
        ? `原机组飞至 ${apName(st0.from, st)}（D${st0.d} ${fmtT(st0.dep)} 前）下机，新机组在 ${apName(st0.from, st)} 接手 ${sp.B.legs.length} 段${atBase ? '' : '（异地换组，需确认新机组到位或 DH）'}${ex ? '' : '；当前未超限，属余量紧张的预防处置'}`
        : `自 ${apName(st0.from, st)} 起更换整组机组（${pr0.legs.length - j} 段）`;
      sols.push(sol);
    }
    const seen = new Set(); let out = sols.filter(x => { if (seen.has(x.sig)) return false; seen.add(x.sig); return true; });
    // 丢弃填人后仍有硬违规或未解决岗位的拆分方案（避免劣于人工）
    out = out.filter(x => !x.unresolved && x.hard <= before.hard);
    if (!ex && dn0.some(x => !x.overnight)) for (const key of ['standby', 'rhythm', 'hours', 'chain']) {
      const w = clone(st); const ban = new Set(Object.values(crew0).filter(Boolean)); const steps = [];
      dn0.filter(x => !x.overnight).forEach(x => { const q = w.pairings.find(p => p.id === x.next); if (!q) return; q.crew[x.nextSlot] = null; steps.push(...fillVac(w, [{ id: q.id, slot: x.nextSlot, from: x.pilot, why: '休息不足' }], key, ban, usedRest)); });
      if (!steps.length) continue;
      const sol = evaluate(st, w, steps, key, before, bIdx); fdpEval(sol, w, delays, [prId]); sol.name = '后续任务换人 · ' + STRATS[key].name.replace('休息人员 · ', ''); sol.desc = '延误压缩了机组下一任务前的休息，替换受影响成员'; if (!seen.has(sol.sig) && !sol.unresolved && sol.hard <= before.hard) { seen.add(sol.sig); out.push(sol); } }
    const reasons = [];
    if (needSplit && !splits.length) reasons.push(`风险日无从合适站点拆分`);
    if (ex && !splits.some(j => pr0.legs[j].from === 'ZUUU')) reasons.push(`D${ex.d} 超限前无从成都出发的航段，基地换组不可用；已尝试异地预防/拆分（若上方无卡片则填人失败），或需 DH 新机组至 ${apName(ex.legs[0].leg.from, st)} / 调整航段`);
    if (ex) reasons.push(`D${ex.d} 预计 FDP ${fmtH(ex.fdp)} 超过限制 ${fmtH(ex.limit)}（${ex.legs.length} 段，报到 ${fmtT(ex.start)}），超 ${ex.exceed} 分钟，自 ${ex.exLeg.leg.flt} ${apName(ex.exLeg.leg.from, st)}-${apName(ex.exLeg.leg.to, st)} 起`);
    else if (riskDay && riskDay.buffer < riskHigh) reasons.push(`D${riskDay.d} 预计 FDP ${fmtH(riskDay.fdp)} / 限制 ${fmtH(riskDay.limit)}，余量仅 ${riskDay.buffer} 分钟（高风险），建议预防性换组或压缩航段`);
    dn0.forEach(x => reasons.push(x.overnight ? `D${x.d} 过夜休息仅 ${fmtH(x.restAfter)}，少于 ${st.settings.minOvernightRestH || 10}h（差 ${x.short} 分钟）：可延后次日报到或换组` : `${idx0.pm[x.pilot].name} 下一任务 ${x.next} 前休息仅 ${fmtH(x.gap)}（差 ${x.short} 分钟）`));
    if (!reasons.length) reasons.push('当前未超限且无下游休息压缩；可人工评估是否预防性调整');
    const man = { key: 'manual', name: ex ? '取消/调整超限航段（人工处理）' : '人工处理', desc: '由运控协调：取消或延后航段、摆渡机组、申请延长等', steps: [{ pairing: prId, type: 'manual', block: { rules: reasons, top: [] } }], people: [], giniB: before.all.gini, giniA: before.all.gini, giniD: 0, sbLeft: [], unresolved: 1, hard: before.hard, bp: [], prefN: 0, rhy: 0, score: 5000, state: null, manual: true, fdpAfter: ex ? 1 : 0, restAfterV: dn0.length, sig: 'manual' };
    out.sort((a, b) => a.score - b.score); out = out.slice(0, (opt.max || 5) - 1); out.push(man);
    const ok = out.filter(x => !x.unresolved && !x.fdpAfter); if (ok.length) ok[0].recommended = true;
    return { pairing: pr0, days: ds0, exceed: ex, downstream: dn0, solutions: out, ms: Date.now() - t0 };
  }

  // 演示友好的模拟故障：逐个尝试目标（风险最高优先），预检至少 minOk 个合规处置方案，且应用首选后硬违规=0、满员
  function simFaultPick(st, date, opt) {
    opt = opt || {}; const minOk = opt.minOk || 2; st.actuals = st.actuals || {}; const b0 = summarize(st);
    const hardN = s => s.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length;
    const mon = dutyMonitor(st, date).filter(x => x.day.legs.length >= 2 && !x.exceed && x.day.buffer > 60).sort((a, b) => a.day.buffer - b.day.buffer);
    for (const x of mon.slice(0, opt.maxTry || 12)) { const l = x.day.legs[Math.min(1, x.day.legs.length - 1)]; const k = legKey(l.leg);
      const dly = Math.max(20, Math.round((x.day.buffer - 30) / 5) * 5); // 压到余量约 30 分（高风险、未超限）→ 预防性换组
      const w = clone(st); w.actuals[k] = { dep: l.dep + dly, arr: l.arr + dly, kind: 'est' };
      const o = fdpOptions(w, x.pr.id); const good = o.solutions.filter(z => !z.manual && !z.unresolved && !z.fdpAfter && z.hard <= b0.hard && z.state);
      if (good.length < minOk) continue;
      const top = good.find(z => z.recommended) || good[0]; const after = summarize(top.state);
      if (hardN(after) > hardN(b0) || (after.total - after.full) > (b0.total - b0.full)) continue;
      return { pairing: x.pr.id, legKey: k, delay: dly, okCount: good.length, top: top.name };
    }
    return null;
  }
  const fmtH = m => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`;
  function fdpEval(sol, w, delays, ids) {
    let ex = 0, rv = 0; const idx = buildIndex(w);
    ids.forEach(id => { const p = w.pairings.find(x => x.id === id); if (!p || !p.legs.length) return; const ds = fdpDays(p, w, delays);
      ex += ds.filter(x => x.exceed > 0).length; rv += downstream(w, p, ds, idx).length; });
    sol.fdpAfter = ex; sol.restAfterV = rv; sol.score = Math.round((sol.score + ex * 800 + rv * 300) * 10) / 10;
  }


  // ---------- 路演：故意易补空洞（优先）+ 可选至多 1 项演示异常 ----------
  // 在近满员排班上，清空若干「易补」任务的副驾位，便于现场演示空洞换人（非 FTL 硬失败）

  // ---------- 一键自动纠错：空洞/硬违规的 BFS 换人链（深度≤4） ----------
  function cloneCrewState(st) {
    return JSON.parse(JSON.stringify({ pairings: st.pairings.map(p => ({ id: p.id, crew: Object.assign({}, p.crew) })), standby: st.standby || {}, fills: st.fills || [] }));
  }
  function applyCrewState(st, snap) {
    const by = {}; st.pairings.forEach(p => by[p.id] = p);
    (snap.pairings || []).forEach(p => { if (by[p.id]) by[p.id].crew = Object.assign({}, p.crew); });
    if (snap.standby) st.standby = JSON.parse(JSON.stringify(snap.standby));
  }
  function countHoles(st) { return st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length; }
  function hardBeyondUnfilled(st) { return validate(st).filter(x => x.level === 'hard' && x.type !== '未满员').length; }
  function problemScore(st) { return countHoles(st) * 10 + hardBeyondUnfilled(st); }

  function listHoles(st) {
    const out = [];
    st.pairings.forEach(pr => ['C', 'F', 'T'].forEach(slot => { if (!pr.crew[slot]) out.push({ pairingId: pr.id, slot }); }));
    return out;
  }

  // BFS：为 (pr,slot) 找一条换人链。节点=人员占用；边=从其他任务挪人并回填。
  function findSwapChain(st, pairingId, slot, maxDepth) {
    maxDepth = maxDepth == null ? 4 : maxDepth;
    const pr0 = prOf(st, pairingId); if (!pr0 || pr0.crew[slot]) return null;
    // depth 0: direct candidate
    const direct = candidates(st, pr0, slot).filter(c => c.ok && !c.crewWarn)
      .sort((a, b) => a.hours - b.hours);
    if (direct[0]) return { moves: [{ pairingId, slot, from: null, to: direct[0].p.id, kind: 'direct' }], person: direct[0].p.id };

    // BFS over chains: state key = temporary unassign set
    // Use iterative deepening on chainOpts-like search
    function tryDepth(depth) {
      // recursive search
      const ban = new Set();
      function dfs(pr, sl, d, path) {
        if (d > depth) return null;
        // direct at this level
        const dirs = candidates(st, pr, sl).filter(c => c.ok && !c.crewWarn && !ban.has(c.p.id)).sort((a, b) => a.hours - b.hours);
        if (dirs[0]) return path.concat([{ pairingId: pr.id, slot: sl, from: null, to: dirs[0].p.id, kind: d === 0 ? 'direct' : 'backfill' }]);
        if (d === depth) return null;
        const chains = chainOpts(st, pr, sl, ban, 8);
        for (const ch of chains) {
          ban.add(ch.q.id); ban.add('PR:' + ch.Q.id);
          // temporarily apply: take q from Q, put q into pr
          const savedQ = ch.Q.crew[ch.sQ], savedP = pr.crew[sl];
          ch.Q.crew[ch.sQ] = null;
          pr.crew[sl] = ch.q.id;
          // backfill Q
          const step1 = { pairingId: pr.id, slot: sl, from: null, to: ch.q.id, kind: 'pull', via: ch.Q.id };
          const step2need = { pairingId: ch.Q.id, slot: ch.sQ, from: ch.q.id, to: null, kind: 'hole' };
          // try backfill Q directly or deeper
          const bfDirs = candidates(st, ch.Q, ch.sQ).filter(c => c.ok && !c.crewWarn && !ban.has(c.p.id)).sort((a, b) => a.hours - b.hours);
          let rest = null;
          if (bfDirs[0]) {
            rest = path.concat([step1, { pairingId: ch.Q.id, slot: ch.sQ, from: ch.q.id, to: bfDirs[0].p.id, kind: 'backfill' }]);
          } else {
            const deeper = dfs(ch.Q, ch.sQ, d + 1, path.concat([step1]));
            if (deeper) rest = deeper;
          }
          // revert
          ch.Q.crew[ch.sQ] = savedQ; pr.crew[sl] = savedP;
          ban.delete(ch.q.id); ban.delete('PR:' + ch.Q.id);
          if (rest) return rest;
        }
        return null;
      }
      return dfs(pr0, slot, 0, []);
    }
    for (let d = 1; d <= maxDepth; d++) {
      const path = tryDepth(d);
      if (path && path.length) return { moves: path, depth: d };
    }
    return null;
  }

  function autoCorrectPlan(st, opt) {
    opt = opt || {};
    const maxDepth = opt.maxDepth || 4;
    const snap0 = cloneCrewState(st);
    const idx0 = buildIndex(st);
    const beforeHours = {}; st.pilots.forEach(p => { beforeHours[p.id] = idx0.hours[p.id] || 0; });
    const beforeDuty = {};
    const ds0 = dayStatus(st, idx0);
    st.pilots.forEach(p => { let n = 0; for (let d = 1; d <= DAYS; d++) if (ds0[p.id][d] === 'D') n++; beforeDuty[p.id] = n; });

    const w = st; // mutate then restore if building plan only — apply moves on working copy via JSON
    const work = JSON.parse(JSON.stringify({ pilots: st.pilots, pairings: st.pairings, settings: st.settings, standby: st.standby || {}, training: st.training || {}, fills: st.fills || [], lite: st.lite, sample: st.sample }));
    // re-link: use work as mutable state sharing pilot objects from clone
    const planMoves = [];
    const touched = new Set();
    let guard = 0;
    const startScore = problemScore(work);
    while (guard++ < 40) {
      const holes = listHoles(work);
      if (!holes.length && hardBeyondUnfilled(work) === 0) break;
      let progressed = false;
      for (const h of holes) {
        const chain = findSwapChain(work, h.pairingId, h.slot, maxDepth);
        if (!chain) continue;
        // apply moves on work
        for (const m of chain.moves) {
          const pr = work.pairings.find(p => p.id === m.pairingId); if (!pr) continue;
          if (m.kind === 'pull' && m.via) {
            const Q = work.pairings.find(p => p.id === m.via);
            if (Q) ['C', 'F', 'T'].forEach(s => { if (Q.crew[s] === m.to) Q.crew[s] = null; });
          }
          if (m.from && !m.to) {
            // hole placeholder — seat already cleared by pull
          }
          if (m.to) pr.crew[m.slot] = m.to;
          touched.add(m.pairingId);
          if (m.to) touched.add(m.to);
          if (m.from) touched.add(m.from);
          if (m.via) touched.add(m.via);
          planMoves.push(Object.assign({}, m));
        }
        progressed = true;
        break; // re-evaluate holes
      }
      if (!progressed) {
        // try fixing hard violations by clearing offending seat and re-filling — skip for lite demo
        break;
      }
      if (problemScore(work) >= startScore && guard > 8) break;
    }
    const idx1 = buildIndex(work);
    const ds1 = dayStatus(work, idx1);
    const people = {};
    const ids = new Set();
    planMoves.forEach(m => { if (m.to) ids.add(m.to); if (m.from) ids.add(m.from); });
    // also anyone whose hours changed
    work.pilots.forEach(p => {
      const h1 = idx1.hours[p.id] || 0;
      if (Math.abs(h1 - (beforeHours[p.id] || 0)) > 0.05) ids.add(p.id);
    });
    ids.forEach(id => {
      const p = work.pilots.find(x => x.id === id); if (!p) return;
      let duty = 0; for (let d = 1; d <= DAYS; d++) if (ds1[p.id][d] === 'D') duty++;
      people[id] = {
        id, name: p.name, rank: p.rank,
        hoursBefore: +(beforeHours[id] || 0).toFixed(1),
        hoursAfter: +(idx1.hours[id] || 0).toFixed(1),
        dutyBefore: beforeDuty[id] || 0,
        dutyAfter: duty
      };
    });
    const affectedPairings = [...new Set(planMoves.map(m => m.pairingId))];
    const endHoles = countHoles(work);
    const endHard = hardBeyondUnfilled(work);
    const solvable = endHoles < countHoles(st) || endHard < hardBeyondUnfilled(st);
    // restore original st crew (we mutated work which is a deep clone — st untouched)
    // But findSwapChain mutated `work` through chainOpts which uses work.pairings — good, st is original.

    return {
      moves: planMoves,
      people,
      affectedPairings,
      before: { holes: countHoles(st), hard: hardBeyondUnfilled(st), score: startScore },
      after: { holes: endHoles, hard: endHard, score: problemScore(work) },
      solvable: endHoles === 0 && endHard === 0,
      unsolvableReason: (endHoles === 0 && endHard === 0) ? null
        : (planMoves.length ? '仍有 ' + endHoles + ' 个空洞 / ' + endHard + ' 项硬违规，候选不足或链深不够' : '无可用直接候选或换人链'),
      workCrew: work.pairings.map(p => ({ id: p.id, crew: Object.assign({}, p.crew) })),
      snapBefore: snap0
    };
  }

  function applyAutoCorrect(st, plan) {
    if (!plan || !plan.workCrew) return false;
    const by = {}; st.pairings.forEach(p => by[p.id] = p);
    plan.workCrew.forEach(p => { if (by[p.id]) by[p.id].crew = Object.assign({}, p.crew); });
    st.fills = st.fills || [];
    st.fills.push({ id: 'AF' + Date.now().toString(36), time: new Date().toISOString(), source: 'autoCorrect',
      label: '一键自动纠错 ' + plan.moves.length + ' 步 · 空洞 ' + plan.before.holes + '→' + plan.after.holes,
      snap: plan.snapBefore, moves: plan.moves });
    const sw = swapFillHoles(st, { ms: 3000 }); if (sw.length) { clearHardSeats(st); st.fills[st.fills.length - 1].swaps = sw; }
    return true;
  }
  function undoAutoCorrect(st, fillId) {
    const f = (st.fills || []).find(x => x.id === fillId && x.snap);
    if (!f) return false;
    applyCrewState(st, f.snap);
    st.fills = st.fills.filter(x => x.id !== fillId);
    return true;
  }

  function leaveDemoHoles(st, opt) {
    opt = opt || {};
    if (!st || !st.sample) return [];
    if (st.demoHolesApplied) return st.demoHoles || [];
    const target = Math.max(0, Math.min(8, opt.count != null ? opt.count : (st.settings && st.settings.demoHoles != null ? st.settings.demoHoles : 4)));
    if (!target) { st.demoHolesApplied = true; st.demoHoles = []; return []; }
    const already = st.pairings.filter(pr => !(pr.crew.C && pr.crew.F && pr.crew.T)).length;
    // 优先保证足够的「易补」空洞供现场手填；总数控制在约 3–5（已有难填缺员时略多一点也可）
    const want = Math.max(0, Math.max(target - already, Math.min(3, target, 6 - already))); // 总数尽量 ≤6
    if (!want) { st.demoHolesApplied = true; st.demoHoles = []; return []; }
    const idx = buildIndex(st);
    // 易补：已满员、≤2 天、无特殊机场、非 A321；优先清空副驾位（备员多）
    const easy = st.pairings.filter(pr => pr.crew.C && pr.crew.F && pr.crew.T
      && pr.ndays <= 2 && pr.ac !== 'A321' && !specialAirportsOf(pr, st).length)
      .sort((a, b) => a.ndays - b.ndays || a.start - b.start || a.id.localeCompare(b.id));
    const out = [];
    for (const pr of easy) {
      if (out.length >= want) break;
      const slot = 'F';
      const fromId = pr.crew[slot];
      // 确认清空后仍有 ≥2 名合规副驾候选，保证洞可手填
      pr.crew[slot] = null;
      const okN = candidates(st, pr, slot).filter(c => c.ok).length;
      if (okN < 2) { pr.crew[slot] = fromId; continue; }
      pr.demoHole = true;
      out.push({ pairingId: pr.id, slot, fromId, okCandidates: okN });
      // 从索引摘掉，避免后续候选误算
      if (idx.sched[fromId]) idx.sched[fromId] = idx.sched[fromId].filter(x => x !== pr);
      if (idx.hours[fromId] != null) idx.hours[fromId] -= pairingHours(pr);
    }
    st.demoHolesApplied = true;
    st.demoHoles = out;
    return out;
  }

  // 路演演示异常：默认关闭；开启时最多植入 1 项（优先座位规则，便于「定位问题」演示）
  function injectDemoAnomalies(st, opt) {
    opt = opt || {};
    if (!st || !st.sample) return [];
    if (st.demoAnomaliesApplied) return st.demoAnomalies || [];
    const enabled = opt.force || (st.settings && st.settings.demoAnomalies);
    if (!enabled) { st.demoAnomaliesApplied = true; st.demoAnomalies = []; return []; }
    const out = [];
    const idx = buildIndex(st);
    const kind = opt.kind || 'seat'; // 'seat' | 'fdp'

    if (kind !== 'fdp') {
      const seatPr = st.pairings.find(pr => {
        const c = pr.crew.C && idx.pm[pr.crew.C];
        if (!c || !isNew(c.rank)) return false;
        return ['C', 'F', 'T'].some(s => { const q = pr.crew[s] && idx.pm[pr.crew[s]]; return q && isInstr(q.rank); });
      });
      if (seatPr) {
        for (const s of ['T', 'F']) {
          const q = seatPr.crew[s] && idx.pm[seatPr.crew[s]];
          if (!q || !isInstr(q.rank)) continue;
          const fo = st.pilots.find(p => isFO(p.rank) && !Object.values(seatPr.crew).includes(p.id)
            && personCheck(p, seatPr, st, idx, { ignorePrefs: true, slot: s })[0]);
          if (fo) { seatPr.crew[s] = fo.id; break; }
        }
        ['T', 'F'].forEach(s => {
          const q = seatPr.crew[s] && idx.pm[seatPr.crew[s]];
          if (q && isInstr(q.rank)) {
            const fo = st.pilots.find(p => isFO(p.rank) && !Object.values(seatPr.crew).includes(p.id));
            if (fo) seatPr.crew[s] = fo.id;
          }
        });
        seatPr.demoAnomaly = 'seat';
        seatPr.demoAnomalyNote = '演示异常：新机长机组故意缺少教员（座位规则，路演用例）';
        out.push({ kind: 'seat', pairingId: seatPr.id, note: seatPr.demoAnomalyNote });
      }
    }

    // 若座位未命中且允许 fdp，或显式 kind=fdp：植入 1 项 FDP 高风险（不叠座位）
    if (!out.length && kind !== 'seat') {
      const rows = fdpRiskSummary(st).rows.filter(x => x.buffer >= 55 && x.buffer <= 220).sort((a, b) => a.buffer - b.buffer);
      const fdpRow = rows[0] || fdpRiskSummary(st).rows.filter(x => x.buffer > 40).sort((a, b) => a.buffer - b.buffer)[0];
      if (fdpRow) {
        const pr = st.pairings.find(p => p.id === fdpRow.pr);
        if (pr) {
          const legs = pr.legs.filter(l => l.d === fdpRow.d);
          const last = legs[legs.length - 1];
          if (last) {
            const target = 35;
            const add = Math.max(0, fdpRow.buffer - target);
            last.arr += add;
            const note = `演示异常：${pr.id} D${fdpRow.d} 执勤余量压至约 ${target} 分（易超限，路演用例）`;
            pr.demoAnomaly = 'fdp';
            pr.demoAnomalyNote = note;
            out.push({ kind: 'fdp', pairingId: pr.id, d: fdpRow.d, note });
          }
        }
      }
    }

    st.demoAnomaliesApplied = true;
    st.demoAnomalies = out.slice(0, 1); // 硬上限 1 项
    st.fills = st.fills || [];
    return st.demoAnomalies;
  }




  // ---------- 人员搜索（候选人/选人通用） ----------
  function pilotMatches(p, q) {
    q = String(q || '').trim().toLowerCase(); if (!q) return true;
    const hay = [p.name, p.id, p.rank, p.squad, rankGroup(p.rank), p.fleet].filter(Boolean).join(' ').toLowerCase();
    const py = (PY.pinyinInitialsOf ? PY.pinyinInitialsOf(p.name) : '');
    return q.split(/\s+/).every(t => hay.includes(t) || (py && py.includes(t.replace(/[^a-z0-9]/g, ''))));
  }
  function filterByPilot(list, q, get) { get = get || (x => x.p || x); return q ? list.filter(x => pilotMatches(get(x), q)) : list; }

  // ---------- 导出（全月班表 / 个人月历） ----------
  function monthRosterRows(st) {
    const pm = {}; st.pilots.forEach(p => { pm[p.id] = p; });
    const name = id => { const p = pm[id]; return p ? p.name + '(' + p.id + ')/' + p.rank : ''; };
    const rows = [['任务号', '开始日', '天数', '机型', '机号', '演示补全', '日序', '日期', '航班号', '起飞', '落地', '起飞时刻', '落地时刻', '机长', '副驾驶', '第三人', '任务飞行小时']];
    st.pairings.forEach(pr => {
      const regs = [...new Set(pr.legs.map(l => l.reg).filter(Boolean))];
      const h = pairingHours(pr);
      pr.legs.forEach(l => {
        const day = Math.floor(l.dep / DAY) + 1;
        rows.push([
          pr.id, pr.start, pr.ndays, pr.ac, regs.join('/') || (l.reg || ''),
          pr.demoSynth ? '演示扩量' : (pr.demoFill ? '演示补全' : ''),
          'D' + l.d, YEAR + '-' + String(MONTH).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
          l.flt, l.from, l.to, fmtT(l.dep), fmtT(l.arr),
          name(pr.crew.C), name(pr.crew.F), name(pr.crew.T), h.toFixed(2)
        ]);
      });
    });
    return rows;
  }
  function personalDayKind(st, p, d, idx) {
    if ((p.leave || []).includes(d)) return '休假';
    if (((st.training || {})[p.id] || []).includes(d)) return '培训';
    if (((st.standby || {})[p.id] || []).includes(d)) return '备份';
    const fly = (idx.sched[p.id] || []).filter(pr => daysTouched(pr, st).includes(d));
    if (fly.length) return '飞行';
    if ((p.prefs || []).includes(d)) return '意向休息';
    return '休息';
  }
  function personalMonthRows(st, pilotId) {
    const idx = buildIndex(st);
    const p = st.pilots.find(x => x.id === pilotId);
    if (!p) return [];
    const rows = [['员工号', '姓名', '级别', '中队', '日期', '星期', '状态', '任务号', '机型', '机号', '航班摘要', '当日飞行小时', '本月累计小时']];
    const WK = ['一', '二', '三', '四', '五', '六', '日'];
    let cum = 0;
    for (let d = 1; d <= DAYS; d++) {
      const kind = personalDayKind(st, p, d, idx);
      const fly = (idx.sched[p.id] || []).filter(pr => daysTouched(pr, st).includes(d));
      let dayH = 0, flts = [], regs = [], acs = [], pids = [];
      fly.forEach(pr => {
        pids.push(pr.id);
        acs.push(pr.ac);
        pr.legs.forEach(l => {
          if (Math.floor(l.dep / DAY) + 1 === d) {
            if (!l.dh) dayH += (l.arr - l.dep) / 60;
            flts.push(l.flt + ':' + l.from + '-' + l.to);
            if (l.reg) regs.push(l.reg);
          }
        });
      });
      cum += dayH;
      const wd = weekdayJS(YEAR, MONTH, d);
      rows.push([
        p.id, p.name, p.rank, p.squad || '',
        YEAR + '-' + String(MONTH).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
        WK[wd], kind, pids.join(';'), [...new Set(acs)].join(';'), [...new Set(regs)].join(';'),
        flts.join(' / '), dayH ? dayH.toFixed(2) : '', cum.toFixed(2)
      ]);
    }
    return rows;
  }
  function personalMonthPack(st) {
    const files = [];
    const idx = buildIndex(st);
    st.pilots.forEach(p => {
      const rows = personalMonthRows(st, p.id);
      const h = (idx.hours[p.id] || 0).toFixed(1);
      files.push({ id: p.id, name: p.name, rank: p.rank, hours: h, rows });
    });
    return files;
  }

    return { CCAR121, COM, flightLimitMin, migrateDelays, fdpDays, fdpLimit, fdpRiskSummary, pairingRisk, dutyMonitor, fdpOptions, simFaultPick, splitPairing, legKey, fmtH, LEG_COLS, defaultFdpTable, leaveOptions, migrateSettings, ensureAircraftRegs, assignAircraftRegs, aircraftDay, FLEET, defaultHealth, authAirports, levelAirports, healthFlags, hasHealthRestriction, healthBlocks, migratePilots, pilotHardCap, medRestrictionSeed, isPlateauAirport, YEAR, MONTH, DAYS, DAY, RANKS, RANK_VAL, NEW_CAPT, INSTR, GROUPS, AIRPORTS, CAT_DESC, AUTH_CATS, ALL_SQUADS, SQUADS_AIRBUS, SQUADS_C909, SAMPLE_META,
    RULES_CONFIG: RC, autoFillDiverse, crewDiff, solutionScore, rulesCatalog, parseRestrictions, foComboKey, foComboAllowed, foComboScore, apClass, extraCrewIssue, legSeatedOK, ageOf,
    transferCandidates, applyTransfer, swapPreview, applySwap, swapFillHoles, swapBalance, lhasaRankOK, stripLhasaBelowJ3, day5Deadheads, opDays, clearHardSeats, pairingIntrinsic, holeDiagnosis, forceAssign, reasonClass,
    isFO, isCaptClass, isInstr, isNew, rankGroup, seatOK, catOK, apName, apCat, needsAuth, isSpecial, pinyinInitialsOf: PY.pinyinInitialsOf, nameMatchesQuery: PY.nameMatchesQuery,
    generateSample, generateLiteSample, ensurePairingContinuity, liteRankMix, defaultSettings, pilotMatches, filterByPilot, monthRosterRows, personalMonthRows, personalMonthPack, personalDayKind, assignTraining, pairingHours, addReservePilots, LITE_RESERVES, fltLabel, slotLabel, stickTrainingPairs, report, release, daysTouched, dutyIvs, spanDays, offAwayDays, isNightLeg, fmtT, specialAirportsOf,
    crewIssue, personCheck, ftlCheckPerson, has48hRestBefore, pilotDutyIntervals, dutyDayFlags, pilotFdpByDay, buildIndex, autoFill, assignStandby, dayStatus, restGaps, freeRuns, validate, summarize, stats, candidates, applyLeave, holeRecommend, holeImpact, leaveDemoHoles, autoCorrectPlan, applyAutoCorrect, undoAutoCorrect, injectDemoAnomalies, opsMetrics, opsZone, shareFor, SLOT_NAME, slotRankOK, blockMin };
});
