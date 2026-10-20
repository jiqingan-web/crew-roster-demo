/* 机组排班助手 - 核心模块（数据生成 / 规则 / 求解器 / 校验 / 指标）
 * 浏览器中挂载到 window.RosterCore，在 Node 中可 require()。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sample-data.js'));
  else root.RosterCore = factory(root.RosterSampleData || null);
})(typeof self !== 'undefined' ? self : this, function (SampleData) {
  'use strict';
  const YEAR = 2026, MONTH = 11, DAYS = 30, DAY = 1440;
  const SD = SampleData || {};
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
  function seatOK(L, R) {
    if (!isCaptClass(L)) return false;
    if (L === 'SPIC') return isInstr(R);
    if (isInstr(L)) return true;
    if (['US', 'J0', 'J1', '机长A', '机长B'].includes(L)) return isCaptClass(R) || (isFO(R) && RANK_VAL[R] >= 4);
    if (['J2', 'J3'].includes(L)) return isCaptClass(R) || (isFO(R) && RANK_VAL[R] >= 3);
    return false;
  }

  // ---------- 机场 ----------
  // cat: LHASA / HIGH / PLATEAU / ZBCF / J1 / US / NONE ; auth=需授权
  // 基础表 + sample-data 扩展（天府/疆内/东北等）；勿把真实 xlsx 提交仓库
  const AIRPORTS_BASE = {
    ZUUU: ['成都双流', 30.58, 103.95], ZUTF: ['成都天府', 30.31, 104.44],
    ZBAA: ['北京', 40.08, 116.58], ZBAD: ['北京大兴', 39.51, 116.41],
    ZSPD: ['上海浦东', 31.14, 121.8], ZSSS: ['上海虹桥', 31.2, 121.34],
    ZGGG: ['广州', 23.39, 113.3], ZGSZ: ['深圳', 22.64, 113.81], ZGHA: ['长沙', 28.19, 113.22],
    ZJSY: ['三亚', 18.3, 109.41], ZJHK: ['海口', 19.93, 110.46], ZSHC: ['杭州', 30.23, 120.43],
    ZSNJ: ['南京', 31.74, 118.86], ZHHH: ['武汉', 30.78, 114.21], ZLXY: ['西安', 34.45, 108.75],
    ZWWW: ['乌鲁木齐', 43.9, 87.47], ZYHB: ['哈尔滨', 45.62, 126.25], ZSQD: ['青岛', 36.36, 120.09],
    ZSAM: ['厦门', 24.54, 118.13], ZPPP: ['昆明', 25.1, 102.93], ZGNN: ['南宁', 22.61, 108.17],
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
  const CAT_DESC = {
    LHASA: '拉萨：两名飞行员均需 J3 及以上', HIGH: '高原/复杂机场：J2/J3+F6以上，或教员+F5以上',
    PLATEAU: '一般高原机场：J2/J3+F5以上，或教员+F4以上', ZBCF: '赤峰：J2/J3/教员 + F4以上',
    J1: '克拉玛依：左座 J1 及以上', US: '茅台/吕梁/忻州：左座 US 及以上', NONE: '无特殊要求' };
  const AUTH_CATS = ['LHASA', 'HIGH', 'PLATEAU', 'ZBCF'];
  function apName(c, st) { const a = (st && st.airports && st.airports[c]) || AIRPORTS[c]; return a ? a[0] : c; }
  function apCat(c, st) { const a = (st && st.airports && st.airports[c]) || AIRPORTS[c]; return (a && a[3]) || 'NONE'; }
  const needsAuth = (c, st) => AUTH_CATS.includes(apCat(c, st));
  const isSpecial = (c, st) => apCat(c, st) !== 'NONE';

  // 特殊机场座位规则（L 左座, R 右座）
  function catOK(cat, L, R) {
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
    return { minRestH: 12, hardMaxHours: 100, maxOffCapt: 4, maxOffFO: 7,
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
          let nm; do { nm = pick(SUR) + pick(GIV); } while (used.has(nm)); used.add(nm);
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
    return { version: 1, sample: true, sampleSchema: 9, settings: S, pilots, pairings, fills: [],
      demoAnomaliesApplied: false, demoAnomalies: [], demoHolesApplied: false, demoHoles: [],
      sampleMeta: SAMPLE_META };
  }

  function weekdayJS(y, m, d) { // Mon=0..Sun=6 matching sample-data
    const dt = new Date(y, m - 1, d);
    return (dt.getDay() + 6) % 7;
  }
  // ---------------- 轻量版（lite/）：单中队 ~100 人，任务量按人均 12–14 值勤日裁剪 ----------------
  function liteRankMix() {
    return [['TC', 1], ['TB', 2], ['TL', 4], ['J3', 27], ['机长A', 2], ['机长B', 2],
      ['F7', 13], ['F6', 12], ['F5', 12], ['F4', 12], ['F3', 13]]; // 38 机长（含 7 教员、4 新机长）+ 62 副驾
  }
  function generateLiteSample(seed, opt) {
    opt = opt || {};
    const r = rng(seed || 20261101);
    const pick = a => a[Math.floor(r() * a.length)];
    const specialAll = Object.keys(AIRPORTS).filter(c => AUTH_CATS.includes((AIRPORTS[c] && AIRPORTS[c][3]) || 'NONE'));
    const byCat = c => specialAll.filter(x => AIRPORTS[x][3] === c);
    const used = new Set(); const pilots = []; let no = 30100;
    const squad = SQUADS_AIRBUS[0];
    liteRankMix().forEach(([rk, n]) => { for (let i = 0; i < n; i++) {
      let nm; do { nm = pick(SUR) + pick(GIV); } while (used.has(nm)); used.add(nm);
      no += 1 + Math.floor(r() * 9);
      const auth = assignAuthForRank(rk, r, specialAll, byCat);
      if ((rk === 'F4' || rk === 'F5') && !auth.includes('ZULS')) auth.push('ZULS');
      pilots.push({ id: 'E' + no, name: nm, rank: rk, auth, prefs: [], leave: [], squad, fleet: 'A320', health: defaultHealth() });
    } });
    const S = defaultSettings();
    // 少量请假（2 人·3 天）+ 每人 ≤2 个意向休息日
    [7, 52].forEach((i, k) => { const s0 = 6 + k * 11; for (let d = s0; d < s0 + 3; d++) pilots[i].leave.push(d); });
    pilots.forEach(p => { let t = 0; while (p.prefs.length < 2 && t++ < 50) { const d = 1 + Math.floor(r() * DAYS);
      if (!p.prefs.includes(d) && !p.leave.includes(d)) p.prefs.push(d); } p.prefs.sort((a, b) => a - b); });
    // 少量体检/健康限制（软限制，不停飞，保证无人闲置）
    [[11, { noPlateau: true, note: '高原机场暂不适任（演示）' }], [40, { noNight: true, bpNote: '血压偏高随访中', note: '限制夜航（演示）' }],
     [77, { medExamExpiry: '2026-11-20', bpNote: '须携带血压记录本' }]].forEach(([i, h]) => { pilots[i].health = Object.assign(defaultHealth(), h); });
    // 任务：同完整版的真实日径模板铺满整月（演示补全），只取若干空客机号，使 值勤人日 ≈ 人数×目标日 / 3
    const all = buildPairingsFromWeek(r, { maxPairings: 1800 }).filter(p => p.ac !== 'C909');
    const byReg = {}; all.forEach(p => { const g = p.legs[0].reg; (byReg[g] = byReg[g] || []).push(p); });
    // 单中队机长运力有限：特殊机场（拉萨须两名 J3+）占比 >60% 的机号排后，避免机长位结构性缺口
    const spShare = g => { let a = 0, b = 0; byReg[g].forEach(p => { a += p.ndays; if (p.legs.some(l => isSpecial(l.from) || isSpecial(l.to))) b += p.ndays; }); return b / Math.max(1, a); };
    const regs = Object.keys(byReg).sort((x, y) => (spShare(x) > 0.6) - (spShare(y) > 0.6) || x.localeCompare(y));
    const want = Math.round(pilots.length * (opt.dutyDays || 12.3) / 3 * (opt.load || 1));
    const chosen = []; let pd = 0;
    for (const g of regs) {
      for (const p of byReg[g].sort((a, b) => a.start - b.start || (a.dutySlot || 0) - (b.dutySlot || 0))) {
        if (pd >= want) break; chosen.push(p); pd += p.ndays;
      }
      if (pd >= want) break;
    }
    chosen.sort((a, b) => a.legs[0].dep - b.legs[0].dep);
    chosen.forEach((p, i) => { p.id = 'PR' + String(i + 1).padStart(3, '0'); });
    return { version: 1, sample: true, lite: true, sampleSchema: 9, settings: S, pilots, pairings: chosen, fills: [],
      demoAnomaliesApplied: false, demoAnomalies: [], demoHolesApplied: false, demoHoles: [], sampleMeta: SAMPLE_META };
  }

  function buildPairingsFromWeek(r, opt) {
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
  function pairingHours(p) { return p.legs.reduce((s, l) => s + (l.arr - l.dep), 0) / 60; }
  function report(p, st) { return p.legs[0].dep - ((st && st.settings.reportMin) || 60); }
  function release(p, st) { return p.legs[p.legs.length - 1].arr + ((st && st.settings.releaseMin) || 30); }
  function daysTouched(p, st) { const a = Math.floor(report(p, st) / DAY) + 1, b = Math.floor((release(p, st) - 1) / DAY) + 1; const r = []; for (let d = a; d <= b; d++) r.push(d); return r; }
  const isNightLeg = l => { const a = ((l.dep % DAY) + DAY) % DAY, b = ((l.arr % DAY) + DAY) % DAY; return a < 360 || b < 360 || l.arr - Math.floor(l.dep / DAY) * DAY >= DAY; };
  const fmtT = m => { m = ((m % DAY) + DAY) % DAY; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  function specialAirportsOf(p, st) { const s = new Set(); p.legs.forEach(l => { [l.from, l.to].forEach(c => { if (isSpecial(c, st)) s.add(c); }); }); return [...s]; }

  // ---------- 机组合法性（逐航段） ----------
  // 返回 null 表示合法，否则返回原因字符串
  function legSeatedOK(L, R, leg, st) {
    if (!seatOK(L.rank, R.rank)) return false;
    for (const c of [leg.from, leg.to]) { const cat = apCat(c, st);
      if (cat === 'NONE') continue;
      if (AUTH_CATS.includes(cat) && (!L.auth.includes(c) || !R.auth.includes(c))) return false;
      if (!catOK(cat, L.rank, R.rank)) return false; }
    if ((leg.ac === 'A321' || leg.ac === 'A21N') && !isJ2plus(L.rank)) return false;
    return true;
  }
  function crewIssue(p, crewPilots, st) {
    const cs = crewPilots.filter(Boolean);
    if (cs.length < 3) return null; // 不完整机组不做组合判定
    // 新机长执飞须组内有教员（教员可任执飞座之一）；第三人观察员不强制为教员——候选过滤见 candidates(slot=T)
    if (cs.some(x => isNew(x.rank)) && !cs.some(x => isInstr(x.rank))) return '新机长执飞须有 TL 及以上教员同组（观察员位可为任意级别）';
    if (cs.filter(x => isCaptClass(x.rank)).length < 1) return '机组无机长';
    for (const leg of p.legs) {
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) for (let j = 0; j < 3 && !ok; j++) if (i !== j && legSeatedOK(cs[i], cs[j], leg, st)) ok = true;
      if (!ok) { const c = [leg.from, leg.to].find(x => isSpecial(x, st));
        return `D${leg.d} ${leg.flt} ${apName(leg.from, st)}-${apName(leg.to, st)}：无满足${c ? '特殊机场(' + apName(c, st) + ')授权/' : ''}座位搭配规则的左右座组合`; }
    }
    // F1 只能与教员在右座；F2 须有教员
    if (cs.some(x => x.rank === 'F1' || x.rank === 'F2') && !cs.some(x => isInstr(x.rank))) return 'F1/F2 须与教员同组';
    return null;
  }
  // T=观察员：任意级别可上；RE12 座位规则只约束执飞双人座对
  const SLOT_NAME = { C: '机', F: '副', T: '观察' };
  function slotRankOK(slot, rank) { if (slot === 'C') return isCaptClass(rank); if (slot === 'F') return isFO(rank); return true; }

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
    (idx.sched[p.id] || []).forEach(o => { if (excludeId && o.id === excludeId) return; iv.push([report(o, st), release(o, st), 'F', o.id]); });
    ((st.standby || {})[p.id] || []).forEach(d => { if (d >= 1 && d <= DAYS) iv.push([(d - 1) * DAY, d * DAY, 'S', 'SB' + d]); });
    return iv.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  function dutyDayFlags(p, st, idx, excludeId, extraPairing) {
    const f = Array(DAYS + 2).fill(false);
    (idx.sched[p.id] || []).forEach(o => { if (excludeId && o.id === excludeId) return; daysTouched(o, st).forEach(d => { if (d >= 1 && d <= DAYS) f[d] = true; }); });
    if (extraPairing) daysTouched(extraPairing, st).forEach(d => { if (d >= 1 && d <= DAYS) f[d] = true; });
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
    allPr.forEach(o => {
      const iv = [];
      allPr.forEach(x => { if (x !== o) iv.push([report(x, st), release(x, st)]); });
      ((st.standby || {})[p.id] || []).forEach(d => { if (d >= 1 && d <= DAYS) iv.push([(d - 1) * DAY, d * DAY]); });
      iv.sort((a, b) => a[0] - b[0]);
      if (!has48hRestBefore(iv, report(o, st))) rs.push('144h内无连续48h休息(121.495/3.6.10)');
    });
    // 2) 任一飞行日：若前 4 个日历日均为飞行值勤或主备份，则违规
    const flags = dutyDayFlags(p, st, idx, ex, extra);
    const flew = Array(DAYS + 2).fill(false);
    allPr.forEach(o => daysTouched(o, st).forEach(d => { if (d >= 1 && d <= DAYS) flew[d] = true; }));
    for (let d = 1; d <= DAYS; d++) {
      if (!flew[d]) continue;
      let prior4 = true;
      for (let k = 1; k <= 4; k++) { const dd = d - k; if (dd < 1 || !flags[dd]) { prior4 = false; break; } }
      if (prior4) rs.push('连续4值勤日后第5日不得飞(D' + d + ')');
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
    opt = opt || {}; const rs = []; const S = st.settings;
    // 机队资质：空客中队飞 A3xx，C909 中队飞 C909
    if (p.fleet && pr.ac) {
      const needC9 = pr.ac === 'C909';
      const isC9 = p.fleet === 'C909';
      if (needC9 !== isC9) rs.push(needC9 ? '非C909机队资质' : '非空客机队资质');
    }
    const dt = daysTouched(pr, st);
    const lv = dt.filter(d => (p.leave || []).includes(d)); if (lv.length) rs.push('请假(' + lv.join(',') + '日)');
    const sbd = dt.filter(d => ((st.standby || {})[p.id] || []).includes(d)); if (sbd.length) rs.push('备份日冲突(' + sbd.join(',') + '日)');
    const trd = dt.filter(d => ((st.training || {})[p.id] || []).includes(d)); if (trd.length) rs.push('培训日冲突(' + trd.join(',') + '日)');
    if (!opt.ignorePrefs) { const pf = dt.filter(d => (p.prefs || []).includes(d)); if (pf.length) rs.push('意向休息日(' + pf.join(',') + '日)'); }
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
  function autoFill(st, opts) {
    opts = opts || {};
    const big = (st.pairings || []).length > 800;
    const K = opts.attempts != null ? opts.attempts : (big ? 3 : st.lite ? 1 : 8); let best = null;
    FDP_PLAN_CACHE = new WeakMap(); const softNew0 = SOFT_NEW; if (st.lite) SOFT_NEW = 58;
    try {
    const score = s => {
      const fly = (s.per || []).filter(x => x.hours > 0.5);
      const inBand = fly.length ? fly.filter(x => x.hours >= 40 && x.hours <= 60).length / fly.length : 0;
      return s.hard * 1e6 + s.soft * 1e3 + (1 - (s.rhythm.gap34 != null ? s.rhythm.gap34 : s.rhythm.gap23)) * 90 + (1 - inBand) * 120 + s.all.std * 0.15;
    };
    for (let k = 0; k < K; k++) {
      const res = autoFillOnce(st, Object.assign({}, opts, { noise: k ? rng(9173 * k + 7) : null,
        onProgress: opts.onProgress ? (x => opts.onProgress((k + x) / K)) : null }));
      const sc = score(res);
      if (!best || sc < best.sc) best = { sc, crew: st.pairings.map(p => Object.assign({}, p.crew)), sb: JSON.stringify(st.standby || null), k };
      if (res.hard === 0 && (res.soft <= 3 || k >= 1)) break;
    }
    st.pairings.forEach((p, i) => p.crew = best.crew[i]); st.standby = JSON.parse(best.sb);
    assignTraining(st);
    const out = summarize(st); out.attempt = best.k + 1; return out;
    } finally { FDP_PLAN_CACHE = null; SOFT_NEW = softNew0; }
  }
  function autoFillOnce(st, opts) {
    opts = opts || {}; const nz = opts.noise; const S = st.settings; const keep = !!opts.keepExisting;
    if (!keep) { st.pairings.forEach(p => p.crew = { C: null, F: null, T: null }); st.standby = null; st.training = null; }
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
          if (isFO(f.rank) && isFO(t.rank)) { const a = RANK_VAL[f.rank], b = RANK_VAL[t.rank];
            if ((a >= 6 && b >= 6) || (a <= 4 && b <= 4)) sc += 0.08; }
          // 第三人：非新机长任务优先副驾驶，把机长工时留给 C 位（非歧视某副驾级别）
          if (free('T') && isCaptClass(t.rank) && !isNew(c.rank)) sc += isNew(t.rank) ? 0.1 : 1.2; // 新机长可任观察员补足值勤天数（不占教员）
          // 教员仅 ~6% 编制：新机长任 C 需教员陪飞，教员接近满载时少排新机长 C 位
          if (free('C') && isNew(c.rank)) sc += 0.25 + 1.2 * instrBusy;
          if (free('C') && isInstr(c.rank)) sc += 0.35 + 1.0 * instrBusy; // 教员优先留给新机长带飞 T 位
          if (nz) sc += nz() * 0.25;
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
    for (const pr of order) { if (pr.crew.C && pr.crew.F && pr.crew.T) continue;
      if (!fillOne(pr, !S.honorPrefs, true)) fillOne(pr, !S.honorPrefs, false);
      n++; if (opts.onProgress) opts.onProgress(n / order.length * 0.55); }
    for (const pr of order) { if (pr.crew.C && pr.crew.F && pr.crew.T) continue;
      pr.crew = { C: null, F: null, T: null };
      Object.keys(idx.sched).forEach(id => { idx.sched[id] = idx.sched[id].filter(x => x !== pr); });
      recomputeHours();
      if (!fillOne(pr, true, true)) fillOne(pr, true, false); }
    function recomputeHours() { Object.keys(idx.hours).forEach(id => idx.hours[id] = idx.sched[id].reduce((s, x) => s + pairingHours(x), 0)); }
    recomputeHours();

    // 局部改进：替换使工时更均衡（集中模式跳过强均衡）
    const slotCls = (s, rank) => s === 'C' ? isCaptClass(rank) : s === 'F' ? isFO(rank) : true;
    const passes = opts.passes != null ? opts.passes : (big ? 2 : 6);
    const phases = big ? [[0, gw * 0.6]] : [[0, gw], [1, gw * 0.3]];
    const balPasses = concentrate ? Math.max(1, Math.floor(passes / 2)) : passes;
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
    bandPull(st, primary, target); // 回收碎片/非主班 → 主班 <50h
    if (!concentrate) trimPeaks(st);
    else trimPeaks(st); // 轻削峰，防单人尖峰
    liftFoBand(st, target, primary); // 各级内 >55→<40；观察员位机长→副驾
    repairFtl(st);
    // FTL 卸员后尝试再填一轮空缺
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
    repairFtl(st);
    repairCrewIssues(st);
    bandBalance(st, target);
    liftFoBand(st, target, primary);
    for (let k = 0; k < 2; k++) bandPull(st, primary, target);
    if (!st.lite) fairConcentrate(st); // 各职级按本级工时池浓缩到 ~40–55h 飞行者，闲置比例跨级相近
    repairCrewIssues(st);
    repairFtl(st);
    // 浓缩后补洞：优先已飞/同级不足 55h 者
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
    repairCrewIssues(st);
    repairFtl(st);
    // 补洞后再浓缩；禁止 repairUnfilled（会把工时重新摊回 0h 后备）
    if (!st.lite) fairConcentrate(st);
    repairCrewIssues(st);
    repairFtl(st);
    if (!st.lite) fairConcentrate(st);
    bandBalance(st, target);
    // 最后补洞：只要 18–55h 带内有人可上就不启用 0h 后备
    fillBandHoles(st);
    repairCrewIssues(st);
    repairFtl(st);
    spreadInstrT(st); // 新机长观察员位：教员工时互助，压尖峰
    repairFtl(st);
    rhythmRepair(st);
    repairFtl(st);
    swapNewCaptHoles(st);
    topUpNewCapt(st);
    if (!st.lite) fairConcentrate(st); // 顶替后再按职级浓缩，避免副驾被摊薄
    swapNewCaptHoles(st);
    fillBandHoles(st); // 合规卸员后再补一轮（只取当前合规候选）
    repairCrewIssues(st);
    repairFtl(st);
    assignStandby(st);
    assignTraining(st);
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
            && idx.hours[q.id] > 0.5 && idx.hours[q.id] + h <= softCapOf(q, slot) && rankGroup(q.rank) === rankGroup(p.rank));
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
          const cands = candidates(st, pr, slot).filter(z => z.ok && !z.warn && z.p.id !== p.id && z.hours + h < hp - 1 && z.hours + h <= 60);
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
      idx.sched[p.id].forEach(pr => daysTouched(pr, st).forEach(d => { if (d >= 1 && d <= DAYS) a[d] = 'D'; }));
      out[p.id] = a; });
    return out;
  }
  const sbOK = (a, d) => a[d] === '' && a[d - 1] !== 'D' && a[d + 1] !== 'D';
  function freeRuns(a) { const r = []; let s = 0; for (let d = 1; d <= DAYS + 1; d++) { if (d <= DAYS && a[d] === '') { if (!s) s = d; } else if (s) { r.push([s, d - 1]); s = 0; } } return r; }
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
        if (!slotRankOK(s, p.rank)) add('岗位级别不符', 'hard', `${pr.id} ${SLOT_NAME[s]}位 ${p.name}(${p.rank}) 级别不符`, pr, p.id);
        const [ok, rs] = personCheck(p, pr, st, idx, { ignorePrefs: true, skipFtl: true, slot: s });
        rs.forEach(r => { const t = r.startsWith('请假') ? '请假冲突' : r.startsWith('时间') ? '时间重叠' : r.startsWith('休息') ? '休息不足'
            : (r.includes('144h') ? '144h内48h休息' : r.includes('第5日') ? '连续4日后第5日飞行' : r.includes('连续7日') ? '连续7日值勤超限' : r.includes('月飞行值勤') ? '月值勤超限' : r.includes('年飞行') ? '年飞行超限' : (r.includes('月飞行小时') || r.includes('个人月飞行上限')) ? '月小时超法规上限' : null);
          if (t) add(t, 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id);
          else if (r.includes('不适飞') || r.includes('体检已过期') || r.includes('不能作为唯一机长')) add('健康限制', 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id);
          else if (r.includes('限制高原') || r.includes('限制夜间')) add('健康限制', 'soft', `${pr.id} ${p.name}：${r}`, pr, p.id);
          else if (/144h|第5日|连续7日|月飞行值勤|年飞行/.test(r)) add('飞行时间限制', 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id); });
        const pf = daysTouched(pr, st).filter(d => (p.prefs || []).includes(d));
        if (pf.length) add('意向休息日未满足', 'soft', `${pr.id} ${p.name} 意向休息日 ${pf.join(',')} 日被排班`, pr, p.id);
      });
      if (crew.every(Boolean)) {
        const iss = crewIssue(pr, crew, st);
        if (iss) { const t = iss.includes('新机长') ? '新机长无教员' : iss.includes('特殊机场') ? '特殊机场授权/搭配' : '座位搭配规则';
          const demo = pr.demoAnomaly ? '【演示异常】' : '';
          add(t, 'hard', `${demo}${pr.id} ${iss}`, pr); }
      }
      if (pr.demoAnomaly && pr.demoAnomalyNote) add('演示异常', 'info', `【演示异常】${pr.demoAnomalyNote}`, pr);
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
  function candidates(st, pr, slot) {
    const idx = buildIndex(st); const res = [];
    for (const p of st.pilots) {
      const rs = []; let crewWarn = '';
      if (!slotRankOK(slot, p.rank)) rs.push('级别不适合' + SLOT_NAME[slot] + '位');
      const other = ['C', 'F', 'T'].filter(s => s !== slot).map(s => pr.crew[s]);
      if (other.includes(p.id)) rs.push('已在本任务');
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
      const crewOk = cands.filter(c => !c.crewWarn); if (crewOk.length) cands = crewOk;
      const noWarn = cands.filter(c => !c.warn); if (noWarn.length) cands = noWarn;
      // 首选：任务首日在备份的人员
      const d0 = daysTouched(pr, st)[0];
      cands.sort((a, b) => (b.standby.includes(d0) - a.standby.includes(d0)) || (b.standby.length > 0) - (a.standby.length > 0) || a.hours - b.hours);
      if (cands.length) { const c0 = cands[0], q = c0.p; pr.crew[slot] = q.id;
        if (c0.standby.length && st.standby) st.standby[q.id] = st.standby[q.id].filter(d => !c0.standby.includes(d));
        changes.push({ pairing: pr.id, slot, from: p, to: q, fromStandby: c0.standby.length > 0, note: c0.standby.length ? `调用备份（${c0.standby.join(',')}日备份）` : c0.warn ? '（占用其意向休息日）' : '' }); }
      else { const all = candidates(st, pr, slot).filter(c => slotRankOK(slot, c.p.rank));
        const cnt = {}; all.forEach(c => c.reasons.forEach(r => { const k = r.replace(/\(.*\)/, '').replace(/：.*/, ''); cnt[k] = (cnt[k] || 0) + 1; }));
        unresolved.push({ pairing: pr.id, slot, reason: '无合规替补；候选人主要不满足：' + Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => k + '×' + n).join('，') }); }
    }
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
        const bf = candidates(w, Q, sQ).filter(c => c.ok && !ban.has(c.p.id) && c.p.id !== q.id).sort((a, b) => (!!a.crewWarn - !!b.crewWarn) || (!!a.warn - !!b.warn) || (b.standby.length > 0) - (a.standby.length > 0) || a.hours - b.hours)[0];
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
        const crewOk = cands.filter(c => !c.crewWarn); if (crewOk.length) cands = crewOk;
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
      dy.planFlt = dy.legs.reduce((a, x) => a + (x.leg.arr - x.leg.dep), 0); dy.fltLimit = flightLimitMin(st, f.leg.dep - rep); dy.fltOver = Math.max(0, dy.planFlt - dy.fltLimit);
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
    out = out.filter(x => !x.unresolved && x.hard === 0);
    if (!ex && dn0.some(x => !x.overnight)) for (const key of ['standby', 'rhythm', 'hours', 'chain']) {
      const w = clone(st); const ban = new Set(Object.values(crew0).filter(Boolean)); const steps = [];
      dn0.filter(x => !x.overnight).forEach(x => { const q = w.pairings.find(p => p.id === x.next); if (!q) return; q.crew[x.nextSlot] = null; steps.push(...fillVac(w, [{ id: q.id, slot: x.nextSlot, from: x.pilot, why: '休息不足' }], key, ban, usedRest)); });
      if (!steps.length) continue;
      const sol = evaluate(st, w, steps, key, before, bIdx); fdpEval(sol, w, delays, [prId]); sol.name = '后续任务换人 · ' + STRATS[key].name.replace('休息人员 · ', ''); sol.desc = '延误压缩了机组下一任务前的休息，替换受影响成员'; if (!seen.has(sol.sig) && !sol.unresolved && sol.hard === 0) { seen.add(sol.sig); out.push(sol); } }
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
  const fmtH = m => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`;
  function fdpEval(sol, w, delays, ids) {
    let ex = 0, rv = 0; const idx = buildIndex(w);
    ids.forEach(id => { const p = w.pairings.find(x => x.id === id); if (!p || !p.legs.length) return; const ds = fdpDays(p, w, delays);
      ex += ds.filter(x => x.exceed > 0).length; rv += downstream(w, p, ds, idx).length; });
    sol.fdpAfter = ex; sol.restAfterV = rv; sol.score = Math.round((sol.score + ex * 800 + rv * 300) * 10) / 10;
  }


  // ---------- 路演：故意易补空洞（优先）+ 可选至多 1 项演示异常 ----------
  // 在近满员排班上，清空若干「易补」任务的副驾位，便于现场演示空洞换人（非 FTL 硬失败）
  function leaveDemoHoles(st, opt) {
    opt = opt || {};
    if (!st || !st.sample) return [];
    if (st.demoHolesApplied) return st.demoHoles || [];
    const target = Math.max(0, Math.min(8, opt.count != null ? opt.count : (st.settings && st.settings.demoHoles != null ? st.settings.demoHoles : 4)));
    if (!target) { st.demoHolesApplied = true; st.demoHoles = []; return []; }
    const already = st.pairings.filter(pr => !(pr.crew.C && pr.crew.F && pr.crew.T)).length;
    // 优先保证足够的「易补」空洞供现场手填；总数控制在约 3–5（已有难填缺员时略多一点也可）
    const want = Math.max(0, Math.max(target - already, Math.min(3, target)));
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
    return q.split(/\s+/).every(t => hay.includes(t));
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
            dayH += (l.arr - l.dep) / 60;
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

    return { CCAR121, COM, flightLimitMin, migrateDelays, fdpDays, fdpLimit, fdpRiskSummary, pairingRisk, dutyMonitor, fdpOptions, splitPairing, legKey, fmtH, LEG_COLS, defaultFdpTable, leaveOptions, migrateSettings, ensureAircraftRegs, assignAircraftRegs, aircraftDay, FLEET, defaultHealth, authAirports, levelAirports, healthFlags, hasHealthRestriction, healthBlocks, migratePilots, pilotHardCap, medRestrictionSeed, isPlateauAirport, YEAR, MONTH, DAYS, DAY, RANKS, RANK_VAL, NEW_CAPT, INSTR, GROUPS, AIRPORTS, CAT_DESC, AUTH_CATS, ALL_SQUADS, SQUADS_AIRBUS, SQUADS_C909, SAMPLE_META,
    isFO, isCaptClass, isInstr, isNew, rankGroup, seatOK, catOK, apName, apCat, needsAuth, isSpecial,
    generateSample, generateLiteSample, liteRankMix, defaultSettings, pilotMatches, filterByPilot, monthRosterRows, personalMonthRows, personalMonthPack, personalDayKind, assignTraining, pairingHours, report, release, daysTouched, isNightLeg, fmtT, specialAirportsOf,
    crewIssue, personCheck, ftlCheckPerson, has48hRestBefore, pilotDutyIntervals, dutyDayFlags, pilotFdpByDay, buildIndex, autoFill, assignStandby, dayStatus, restGaps, freeRuns, validate, summarize, stats, candidates, applyLeave, holeRecommend, holeImpact, leaveDemoHoles, injectDemoAnomalies, opsMetrics, opsZone, shareFor, SLOT_NAME, slotRankOK, blockMin };
});
