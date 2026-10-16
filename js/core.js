/* 机组排班助手 - 核心模块（数据生成 / 规则 / 求解器 / 校验 / 指标）
 * 浏览器中挂载到 window.RosterCore，在 Node 中可 require()。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RosterCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const YEAR = 2026, MONTH = 11, DAYS = 30, DAY = 1440;

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
  const AIRPORTS = {
    ZUUU: ['成都', 30.58, 103.95], ZBAA: ['北京', 40.08, 116.58], ZSPD: ['上海浦东', 31.14, 121.8],
    ZGGG: ['广州', 23.39, 113.3], ZGSZ: ['深圳', 22.64, 113.81], ZGHA: ['长沙', 28.19, 113.22],
    ZJSY: ['三亚', 18.3, 109.41], ZJHK: ['海口', 19.93, 110.46], ZSHC: ['杭州', 30.23, 120.43],
    ZSNJ: ['南京', 31.74, 118.86], ZHHH: ['武汉', 30.78, 114.21], ZLXY: ['西安', 34.45, 108.75],
    ZWWW: ['乌鲁木齐', 43.9, 87.47], ZYHB: ['哈尔滨', 45.62, 126.25], ZSQD: ['青岛', 36.36, 120.09],
    ZSAM: ['厦门', 24.54, 118.13], ZPPP: ['昆明', 25.1, 102.93], ZGNN: ['南宁', 22.61, 108.17],
    ZBYN: ['太原', 37.75, 112.63], ZHCC: ['郑州', 34.52, 113.84], ZSJN: ['济南', 36.86, 117.22],
    ZGOW: ['揭阳', 23.55, 116.5], ZSFZ: ['福州', 25.93, 119.66], ZLLL: ['兰州', 36.52, 103.62],
    ZBHH: ['呼和浩特', 40.85, 111.82], ZUGY: ['贵阳', 26.54, 106.8], ZYYJ: ['延吉', 42.88, 129.45],
    ZSSS: ['上海虹桥', 31.2, 121.34], ZYTX: ['沈阳', 41.64, 123.48], ZSWX: ['无锡', 31.49, 120.43],
    ZULS: ['拉萨', 29.3, 90.91, 'LHASA'], ZPLJ: ['丽江', 26.68, 100.25, 'HIGH'], ZPJH: ['西双版纳', 21.97, 100.76, 'HIGH'],
    ZUXC: ['西昌', 27.99, 102.18, 'HIGH'], ZLXN: ['西宁', 36.53, 102.04, 'HIGH'], ZYTL: ['大连', 38.97, 121.54, 'HIGH'],
    ZPDQ: ['迪庆', 27.79, 99.68, 'PLATEAU'], ZUDC: ['稻城亚丁', 29.32, 100.05, 'PLATEAU'], ZUJZ: ['九寨', 32.85, 103.68, 'PLATEAU'],
    ZBCF: ['赤峰', 42.24, 118.91, 'ZBCF'], ZWKM: ['克拉玛依', 45.47, 84.95, 'J1'], ZUMT: ['茅台', 27.81, 106.33, 'US'],
    ZBLL: ['吕梁', 37.68, 111.14, 'US'], ZBXZ: ['忻州', 38.6, 112.97, 'US'],
  };
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
  function defaultSettings() {
    return { minRestH: 12, hardMaxHours: 90, maxOffCapt: 4, maxOffFO: 7,
      bpTesterAirports: ['ZLXY', 'ZWWW'], reportMin: 60, releaseMin: 30, honorPrefs: true,
      standbyPerDay: 1, maxStandbyPerPilot: 1, gapWeight: 0.35,
      opsDayWindowH: 14, // 飞机日可用窗口（利用率分母）
      // 飞行值勤期（FDP）限制：默认值参考 CCAR-121 部（非扩编机组 表A），可按公司规定修改
      fdpTable: defaultFdpTable(), fdpAugmented: false, fdpAugLimitH: 16, fdpRiskHigh: 60, fdpRiskMed: 120, minTurnMin: 35, minOvernightRestH: 10 };
  }

  // 旧版字段迁移：testerAirports（误称“酒测/血压测试员”）→ bpTesterAirports（始发站须配备血压测试仪）
  function migrateSettings(S) {
    if (S && S.testerAirports) { S.bpTesterAirports = S.testerAirports; delete S.testerAirports; }
    // 旧版备份参数（连续空闲插备份 + 每日 2+3 人池）→ 每日 1 人、每人每月至多 1 天
    if (S && ('standbyCapt' in S || 'standbyFO' in S || 'maxFreeRun' in S)) { delete S.standbyCapt; delete S.standbyFO; delete S.maxFreeRun; S.standbyPerDay = 1; S.maxStandbyPerPilot = 1; }
    // 取消 30–70h 目标范围，仅保留 90h 法规硬上限
    if (S) { delete S.minHours; delete S.maxHours; if (!S.fdpTable) S.fdpTable = defaultFdpTable(); }
    return S;
  }

  function defaultHealth() {
    return { noFly: false, noPlateau: false, noNight: false, bpNote: '', medExamExpiry: '', note: '' };
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
    if (h.bpNote) f.push('血压备注');
    if (h.medExamExpiry) f.push('体检' + h.medExamExpiry);
    if (h.note && !h.noFly && !h.noPlateau && !h.noNight) f.push('有备注');
    return f;
  }
  function hasHealthRestriction(h) {
    h = h || {}; return !!(h.noFly || h.noPlateau || h.noNight || (h.bpNote && h.bpNote.trim()) || (h.medExamExpiry && h.medExamExpiry.trim()) || (h.note && h.note.trim()));
  }
  function isPlateauAirport(c, st) { return ['LHASA', 'HIGH', 'PLATEAU'].includes(apCat(c, st)); }
  function migratePilots(st) {
    if (!st || !st.pilots) return st;
    const squads = ['一大队', '二大队', '三大队', '教学中队'];
    st.pilots.forEach((p, i) => {
      if (!p.health) p.health = defaultHealth();
      else p.health = Object.assign(defaultHealth(), p.health);
      if (!p.squad) p.squad = isInstr(p.rank) ? '教学中队' : squads[i % 3];
      if (!Array.isArray(p.auth)) p.auth = [];
    });
    return st;
  }
  function healthBlocks(p, pr, st) {
    const h = p.health || {}; const rs = [];
    if (h.noFly) rs.push('暂时不适飞');
    if (h.noPlateau && pr.legs.some(l => isPlateauAirport(l.from, st) || isPlateauAirport(l.to, st))) rs.push('限制高原（任务含高原/拉萨类机场）');
    if (h.noNight && pr.legs.some(isNightLeg)) rs.push('限制夜间（任务含夜航段）');
    if (h.medExamExpiry) {
      const exp = new Date(h.medExamExpiry + 'T23:59:59');
      if (!isNaN(exp)) {
        const touch = daysTouched(pr, st).map(d => new Date(YEAR, MONTH - 1, d));
        if (touch.some(t => t > exp)) rs.push('体检已过期(' + h.medExamExpiry + ')');
      }
    }
    return rs;
  }

  function generateSample(seed, opt) {
    opt = opt || {};
    const r = rng(seed || 20261101);
    const pick = a => a[Math.floor(r() * a.length)];
    const comp = [['TC', 2], ['TB', 3], ['TL', 5], ['J3', 23], ['SPIC', 1], ['US', 2], ['J0', 1], ['机长A', 1], ['机长B', 1],
      ['F8', 2], ['F7', 12], ['F6', 11], ['F5', 11], ['F4', 7], ['F3', 15], ['F2', 2], ['F1', 1]];
    const used = new Set(); const pilots = []; let no = 10230;
    const specialAll = Object.keys(AIRPORTS).filter(c => AUTH_CATS.includes(AIRPORTS[c][3]));
    const byCat = c => specialAll.filter(x => AIRPORTS[x][3] === c);
    comp.forEach(([rk, n]) => { for (let i = 0; i < n; i++) {
      let nm; do { nm = pick(SUR) + pick(GIV); } while (used.has(nm)); used.add(nm);
      no += 1 + Math.floor(r() * 37);
      let auth = [];
      if (isInstr(rk)) auth = specialAll.slice();
      else if (rk === 'J3') auth = r() < 0.75 ? specialAll.slice() : specialAll.filter(x => AIRPORTS[x][3] !== 'LHASA' && r() < 0.7);
      else if (isNew(rk)) auth = byCat('PLATEAU').filter(() => r() < 0.4);
      else { const v = RANK_VAL[rk];
        if (v >= 6) auth = specialAll.filter(x => AIRPORTS[x][3] !== 'LHASA' && r() < 0.85);
        else if (v >= 4) auth = specialAll.filter(x => ['PLATEAU', 'ZBCF'].includes(AIRPORTS[x][3]) && r() < 0.6); }
      // 大队按序号固定分配，避免额外消耗随机数（保持与历史示例种子一致）
      const squad = isInstr(rk) ? '教学中队' : ['一大队', '二大队', '三大队'][pilots.length % 3];
      pilots.push({ id: 'E' + no, name: nm, rank: rk, auth, prefs: [], leave: [], squad, health: defaultHealth() });
    } });
    // 请假（少量）+ 意向休息日，遵守同日上限
    const S = defaultSettings();
    const offCount = { C: Array(DAYS + 1).fill(0), F: Array(DAYS + 1).fill(0) };
    const lim = p => isFO(p.rank) ? S.maxOffFO : S.maxOffCapt; const key = p => isFO(p.rank) ? 'F' : 'C';
    const leaveP = pilots.filter(() => r() < 0.07);
    leaveP.forEach(p => { const s = 1 + Math.floor(r() * 25), n = 3 + Math.floor(r() * 3);
      for (let d = s; d < s + n && d <= DAYS; d++) if (offCount[key(p)][d] < lim(p)) { p.leave.push(d); offCount[key(p)][d]++; } });
    pilots.forEach(p => { let tries = 0; while (p.prefs.length < 2 && tries++ < 50) {
      const d = 1 + Math.floor(r() * DAYS);
      if (p.prefs.includes(d) || p.leave.includes(d) || offCount[key(p)][d] >= lim(p)) continue;
      p.prefs.push(d); offCount[key(p)][d]++; } p.prefs.sort((a, b) => a - b); });

    // 任务（pairing）
    const normal = Object.keys(AIRPORTS).filter(c => c !== 'ZUUU' && !AIRPORTS[c][3]);
    const special = Object.keys(AIRPORTS).filter(c => AIRPORTS[c][3] && AIRPORTS[c][3] !== 'LHASA');
    const fltNo = {}; let fbase = 2201;
    const fn = (a, b) => { const k = a + b; if (!fltNo[k]) { const kr = b + a;
      if (fltNo[kr]) fltNo[k] = 'EU' + (parseInt(fltNo[kr].slice(2)) + 1); else { fltNo[k] = 'EU' + fbase; fbase += 2 + 2 * Math.floor(r() * 30); if (fbase > 9900) fbase = 1101; } } return fltNo[k]; };
    const pairings = []; let pid = 1; let total = 0; const target = opt.targetHours || 1880;
    const nearC = {};
    const near = (c, n) => (nearC[c + n] = nearC[c + n] || Object.keys(AIRPORTS).filter(x => x !== c && x !== 'ZUUU' && AIRPORTS[x][3] !== 'LHASA').sort((x, y) => blockMin(c, x) - blockMin(c, y)).slice(0, n));
    const pickNear = (c, n, excl) => { const pool = near(c, n).filter(x => !excl.includes(x)); const sp = pool.filter(x => AIRPORTS[x][3]), nm = pool.filter(x => !AIRPORTS[x][3]);
      return (r() < 0.2 && sp.length) ? pick(sp) : pick(nm.length ? nm : pool); };
    while (total < target) {
      const u = r(); const nd = u < 0.06 ? 1 : u < 0.18 ? 2 : u < 0.6 ? 3 : 4;
      const start = 1 + Math.floor(r() * (DAYS - nd + 1));
      const legs = []; const ac = r() < 0.08 ? 'A321' : 'A320';
      const lhasa = r() < 0.04;
      const stations = ['ZUUU']; for (let i = 1; i < nd; i++) stations.push(pickNear(stations[i - 1], i === 1 ? 26 : 12, [stations[i - 1]])); stations.push('ZUUU');
      const redeye = nd === 1 && !lhasa && r() < 0.3;
      for (let k = 0; k < nd; k++) {
        const a = stations[k], b = stations[k + 1];
        let seq;
        if (lhasa && k === 0) seq = a === b ? ['ZUUU', 'ZULS', 'ZUUU'] : ['ZUUU', 'ZULS', 'ZUUU', b];
        else {
          const v = r(); const nl = redeye ? 2 : v < 0.5 ? 2 : v < 0.82 ? 3 : 4;
          for (let tries = 0; tries < 6; tries++) {
            seq = [a]; let cur = a;
            for (let i = 0; i < nl - 1; i++) { const x = (i % 2 === 1 && cur !== a && r() < 0.6 && a !== b) ? a : pickNear(cur, 10, [cur, b]); seq.push(x); cur = x; }
            if (cur !== b) seq.push(b); else seq.push(pickNear(cur, 8, [cur]), b);
            seq = seq.filter((s2, i) => i === 0 || s2 !== seq[i - 1]);
            let bt = 0; for (let i = 0; i < seq.length - 1; i++) bt += blockMin(seq[i], seq[i + 1]);
            if (bt <= 450) break; if (tries === 5) seq = a === b ? [a, pickNear(a, 6, [a]), b] : [a, b];
          }
        }
        let t = (start - 1 + k) * DAY + (redeye ? 1230 + 5 * Math.floor(r() * 18) : 400 + 5 * Math.floor(r() * 66));
        for (let i = 0; i < seq.length - 1; i++) { const bm = blockMin(seq[i], seq[i + 1]);
          legs.push({ d: k + 1, flt: fn(seq[i], seq[i + 1]), from: seq[i], to: seq[i + 1], dep: t, arr: t + bm, ac }); t += bm + (pid % 7 === 3 && seq.length >= 5 ? 95 : 50); }
      }
      const p = { id: 'PR' + String(pid++).padStart(3, '0'), start, ndays: nd, ac, legs, crew: { C: null, F: null, T: null } };
      total += pairingHours(p); pairings.push(p);
    }
    pairings.sort((a, b) => a.legs[0].dep - b.legs[0].dep);
    pairings.forEach((p, i) => p.id = 'PR' + String(i + 1).padStart(3, '0'));
    assignAircraftRegs(pairings);
    // 固定下标写入演示用健康限制（不消耗 RNG）
    const H = [
      { i: 4, h: { noPlateau: true, note: '高原机场暂不适任（演示）' } },
      { i: 9, h: { noNight: true, bpNote: '血压偏高随访中', note: '限制夜航（演示）' } },
      { i: 14, h: { noFly: true, medExamExpiry: '2026-10-20', note: '体检复查前不适飞（演示）' } },
      { i: 19, h: { medExamExpiry: '2026-11-05', bpNote: '须携带血压记录本' } },
      { i: 24, h: { noPlateau: true, noNight: true, note: '综合健康限制（演示）' } }
    ];
    H.forEach(({ i, h }) => { if (pilots[i]) pilots[i].health = Object.assign(defaultHealth(), h); });
    return { version: 1, sample: true, settings: S, pilots, pairings, fills: [], demoAnomaliesApplied: false, demoAnomalies: [] };
  }

  // 机号（机尾号）示例机队；同机型池内按时间贪心分配，保证同机号航段不重叠
  const FLEET = {
    A320: ['B-32GV','B-32HC','B-30A1','B-30C8','B-30E2','B-32JF','B-32KH','B-30F6','B-32LM','B-30G9','B-32NP','B-30H3','B-32QR','B-30J5','B-32ST','B-30K7','B-32UV','B-30L1'],
    A321: ['B-32WX','B-30M4','B-32YZ']
  };
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
    if (leg.ac === 'A321' && !isJ2plus(L.rank)) return false;
    return true;
  }
  function crewIssue(p, crewPilots, st) {
    const cs = crewPilots.filter(Boolean);
    if (cs.length < 3) return null; // 不完整机组不做组合判定
    if (cs.some(x => isNew(x.rank)) && !cs.some(x => isInstr(x.rank))) return '新机长所在机组须有 TL 及以上教员';
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
  const SLOT_NAME = { C: '机', F: '副', T: '三' };
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

  const hardCap = st => st.settings.hardMaxHours || 90;
  // 某人能否执行某任务（不含组合规则）。返回 [ok, reasons[] ]
  function personCheck(p, pr, st, idx, opt) {
    opt = opt || {}; const rs = []; const S = st.settings;
    const dt = daysTouched(pr, st);
    const lv = dt.filter(d => (p.leave || []).includes(d)); if (lv.length) rs.push('请假(' + lv.join(',') + '日)');
    if (!opt.ignorePrefs) { const pf = dt.filter(d => (p.prefs || []).includes(d)); if (pf.length) rs.push('意向休息日(' + pf.join(',') + '日)'); }
    const a = report(pr, st), b = release(pr, st), rest = S.minRestH * 60;
    for (const o of idx.sched[p.id]) { if (o === pr || o.id === (opt.excludeId || '')) continue;
      const oa = report(o, st), ob = release(o, st);
      if (oa < b && a < ob) { rs.push('时间冲突(' + o.id + ')'); continue; }
      if ((oa >= b && oa - b < rest) || (a >= ob && a - ob < rest)) rs.push('休息不足' + S.minRestH + 'h(' + o.id + ')'); }
    const h = pairingHours(pr), already = idx.sched[p.id].includes(pr);
    const cap = hardCap(st); if (!already && idx.hours[p.id] + h > cap + 1e-9) rs.push('超出法规硬上限' + cap + 'h');
    healthBlocks(p, pr, st).forEach(x => rs.push(x));
    return [rs.length === 0, rs];
  }

  // ---------- 节奏（休息间隔） ----------
  // 两个相邻任务之间的空闲天数（扣除请假日与意向休息日）
  function pDays(pr, st) { const d = daysTouched(pr, st); return [d[0], d[d.length - 1]]; }
  function restGaps(p, list, st) {
    const ds = list.map(pr => pDays(pr, st)).sort((a, b) => a[0] - b[0]); const g = [];
    const ex = new Set([...(p.leave || []), ...(p.prefs || [])]);
    for (let i = 1; i < ds.length; i++) { let n = 0; for (let d = ds[i - 1][1] + 1; d < ds[i][0]; d++) if (!ex.has(d)) n++; g.push(n); }
    return g;
  }
  const gapCostOne = g => g <= 0 ? 1.0 : g === 1 ? 0.6 : g <= 3 ? 0 : g === 4 ? 0.25 : 0.5 + 0.1 * (g - 5);
  const gapCost = (p, list, st) => restGaps(p, list, st).reduce((s, g) => s + gapCostOne(g), 0);

  // ---------- 求解器 ----------
  // 多次随机扰动求解，取最优（硬违规最少 → 软违规最少 → 节奏/工时更均衡）
  function autoFill(st, opts) {
    opts = opts || {}; const K = opts.attempts || 5; let best = null;
    const score = s => s.hard * 1e6 + s.soft * 1e3 + (1 - s.rhythm.gap23) * 100 + s.all.std;
    for (let k = 0; k < K; k++) {
      const res = autoFillOnce(st, Object.assign({}, opts, { noise: k ? rng(9173 * k + 7) : null,
        onProgress: opts.onProgress ? (x => opts.onProgress((k + x) / K)) : null }));
      const sc = score(res);
      if (!best || sc < best.sc) best = { sc, crew: st.pairings.map(p => Object.assign({}, p.crew)), sb: JSON.stringify(st.standby || null), k };
      if (res.hard === 0 && (res.soft <= 3 || k >= 1)) break;
    }
    st.pairings.forEach((p, i) => p.crew = best.crew[i]); st.standby = JSON.parse(best.sb);
    const out = summarize(st); out.attempt = best.k + 1; return out;
  }
  function autoFillOnce(st, opts) {
    opts = opts || {}; const nz = opts.noise; const S = st.settings; const keep = !!opts.keepExisting;
    if (!keep) { st.pairings.forEach(p => p.crew = { C: null, F: null, T: null }); st.standby = null; }
    const idx = buildIndex(st);
    const target = {}; const totalH = st.pairings.reduce((s, p) => s + pairingHours(p), 0) * 3;
    st.pilots.forEach(p => target[p.id] = 60 * shareFor(p));
    const ratio = id => idx.hours[id] / target[id];
    const assign = (pr, s, id) => { const old = pr.crew[s]; const h = pairingHours(pr);
      if (old) { idx.sched[old] = idx.sched[old].filter(x => x !== pr); idx.hours[old] -= h; }
      pr.crew[s] = id; if (id) { idx.sched[id].push(pr); idx.hours[id] += h; } };
    const pilots = st.pilots;
    const hard = pr => { let w = 0; pr.legs.forEach(l => [l.from, l.to].forEach(c => { const cat = apCat(c, st);
      if (cat === 'LHASA') w += 100; else if (cat !== 'NONE') w += 10; })); if (pr.ac === 'A321') w += 5; return w; };
    const order = st.pairings.slice().sort((a, b) => (hard(b) > 0) - (hard(a) > 0) || a.legs[0].dep - b.legs[0].dep);

    const gw = S.gapWeight == null ? 0.35 : S.gapWeight;
    function fillOne(pr, ignorePrefs) {
      const gdc = {}; const gd = p => gdc[p.id] != null ? gdc[p.id] : (gdc[p.id] = gw * (gapCost(p, idx.sched[p.id].concat([pr]), st) - gapCost(p, idx.sched[p.id], st)));
      const free = s => !pr.crew[s];
      const ok = (p) => personCheck(p, pr, st, idx, { ignorePrefs })[0];
      const cur = { C: pr.crew.C && idx.pm[pr.crew.C], F: pr.crew.F && idx.pm[pr.crew.F], T: pr.crew.T && idx.pm[pr.crew.T] };
      const inCrew = id => Object.values(pr.crew).includes(id);
      const sortR = arr => arr.sort((a, b) => ratio(a.id) - ratio(b.id));
      const capt = free('C') ? sortR(pilots.filter(p => isCaptClass(p.rank) && !inCrew(p.id) && ok(p))).slice(0, 12) : [cur.C];
      const fos = sortR(pilots.filter(p => isFO(p.rank) && !inCrew(p.id) && ok(p)));
      const capT = sortR(pilots.filter(p => isCaptClass(p.rank) && !inCrew(p.id) && ok(p)));
      let best = null;
      for (const c of capt) {
        const Fl = free('F') ? fos.filter(x => x !== c).slice(0, 10) : [cur.F];
        let Tl;
        if (!free('T')) Tl = [cur.T];
        else if (isNew(c.rank)) Tl = capT.filter(x => isInstr(x.rank) && x !== c).slice(0, 8);
        else Tl = fos.slice(0, 12).concat(capT.filter(x => x !== c).slice(0, 6));
        for (const f of Fl) for (const t of Tl) {
          if (!f || !t || f === t || t === c) continue;
          if (crewIssue(pr, [c, f, t], st)) continue;
          let sc = (free('C') ? ratio(c.id) + gd(c) : 0) + (free('F') ? ratio(f.id) + gd(f) : 0) + (free('T') ? ratio(t.id) + gd(t) : 0);
          if (isFO(f.rank) && isFO(t.rank)) { const a = RANK_VAL[f.rank], b = RANK_VAL[t.rank];
            if ((a >= 6 && b >= 6) || (a <= 4 && b <= 4)) sc += 0.15; }
          if (free('T') && isCaptClass(t.rank) && !isNew(c.rank)) sc += 1.0; // 第三人优先副驾驶
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
    for (const pr of order) { if (pr.crew.C && pr.crew.F && pr.crew.T) continue; if (!fillOne(pr, !S.honorPrefs)) { /* 留待回退 */ } n++; if (opts.onProgress) opts.onProgress(n / order.length * 0.6); }
    // 回退：放宽意向休息日
    for (const pr of order) { if (pr.crew.C && pr.crew.F && pr.crew.T) continue;
      pr.crew = { C: null, F: null, T: null }; ['C', 'F', 'T'].forEach(() => {}); 
      // 先重建索引（清空后）
      Object.keys(idx.sched).forEach(id => { idx.sched[id] = idx.sched[id].filter(x => x !== pr); });
      recomputeHours();
      if (!fillOne(pr, true)) fillOne(pr, true); }
    function recomputeHours() { Object.keys(idx.hours).forEach(id => idx.hours[id] = idx.sched[id].reduce((s, x) => s + pairingHours(x), 0)); }
    recomputeHours();

    // 局部改进：替换使工时更均衡（并修复低于下限者）
    const slotCls = (s, rank) => s === 'C' ? isCaptClass(rank) : s === 'F' ? isFO(rank) : true;
    const passes = opts.passes || 6;
    for (const [phase, gwX] of [[0, gw], [1, gw * 0.3]]) for (let it = 0; it < passes; it++) {
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
            const before = (ratio(curId) - 1) ** 2 + (ratio(q.id) - 1) ** 2;
            const hc = (idx.hours[curId] - h) / target[curId], hq = (idx.hours[q.id] + h) / target[q.id];
            const after = (hc - 1) ** 2 + (hq - 1) ** 2;
            let gain = before - after; if (gain + gwX * 3 <= bestGain + 1e-6) continue;
            const sc0 = idx.sched[curId], sq0 = idx.sched[q.id];
            gain -= gwX * (gapCost(cp, sc0.filter(x => x !== pr), st) - gapCost(cp, sc0, st) + gapCost(q, sq0.concat([pr]), st) - gapCost(q, sq0, st));
            if (gain <= bestGain + 1e-6) continue;
            if (!personCheck(q, pr, st, idx, { ignorePrefs: !S.honorPrefs })[0]) continue;
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
    // 交换：高工时者与低工时者互换任务（同岗位），缩小组内差距
    const slotOf = (pr, id) => ['C', 'F', 'T'].find(k => pr.crew[k] === id);
    for (let it = 0; it < 4; it++) { let sw = 0;
      for (const g of GROUPS) {
        const mem = pilots.filter(p => rankGroup(p.rank) === g).sort((a, b) => idx.hours[b.id] - idx.hours[a.id]);
        const q = Math.max(2, Math.ceil(mem.length / 4)); const hi = mem.slice(0, q), lo = mem.slice(-q).reverse();
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
              const ok = personCheck(b, X, st, idx, { ignorePrefs: !S.honorPrefs })[0] && idx.hours[b.id] <= hardCap(st) + 1e-9 &&
                (!Y || personCheck(a, Y, st, idx, { ignorePrefs: !S.honorPrefs })[0]) &&
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
        for (const q of fos) { if (!personCheck(q, pr, st, idx, { ignorePrefs: !S.honorPrefs })[0]) continue;
          if (crewIssue(pr, [idx.pm[pr.crew.C], idx.pm[pr.crew.F], q], st)) continue; assign(pr, 'T', q.id); break; } }
    }
    // 均衡后再次尝试补齐剩余空缺
    for (const pr of order) if (!(pr.crew.C && pr.crew.F && pr.crew.T)) { if (!fillOne(pr, !S.honorPrefs)) fillOne(pr, true); }
    repairUnfilled(st);
    repairPrefs(st);
    trimPeaks(st);
    assignStandby(st);
    return summarize(st);
  }

  // 削峰：工时明显高于本组均值者，把其任务转给合规且工时更低者（只做不占意向休息日、不破坏合规的替换）
  function trimPeaks(st) {
    for (let it = 0; it < 4; it++) { let moved = 0; const idx = buildIndex(st);
      const gm = {}; GROUPS.forEach(g => { const xs = st.pilots.filter(p => rankGroup(p.rank) === g).map(p => idx.hours[p.id] / shareFor(p)); gm[g] = xs.reduce((a, b) => a + b, 0) / (xs.length || 1); });
      for (const p of st.pilots) { const hp = idx.hours[p.id]; if (hp / shareFor(p) < gm[rankGroup(p.rank)] + 5) continue;
        for (const pr of idx.sched[p.id].slice().sort((a, b) => pairingHours(a) - pairingHours(b))) { const slot = ['C', 'F', 'T'].find(k => pr.crew[k] === p.id); const h = pairingHours(pr);
          pr.crew[slot] = null; const c = candidates(st, pr, slot).find(z => z.ok && !z.warn && z.p.id !== p.id && z.hours + h < hp - 1);
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
        const direct = candidates(st, pr, slot).find(c => c.ok && !c.warn);
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
    for (let d = 1; d <= DAYS; d++) for (let k = 0; k < per; k++) {
      const isC = (d + k) % 2 === 1;
      const pick = c => st.pilots.filter(p => isCaptClass(p.rank) === c && !(c && isNew(p.rank)) && cnt(p.id) < cap && sbOK(ds[p.id], d))
        .sort((a, b) => cnt(a.id) - cnt(b.id) || idx.hours[a.id] - idx.hours[b.id] || a.id.localeCompare(b.id))[0];
      const p = pick(isC) || pick(!isC); if (p) put(p, d);
    }
    st.pilots.forEach(p => st.standby[p.id].sort((a, b) => a - b));
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
        const [ok, rs] = personCheck(p, pr, st, idx, { ignorePrefs: true });
        rs.forEach(r => { const t = r.startsWith('请假') ? '请假冲突' : r.startsWith('时间') ? '时间重叠' : r.startsWith('休息') ? '休息不足' : null;
          if (t) add(t, 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id);
          else if (r.includes('不适飞') || r.includes('体检已过期')) add('健康限制', 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id);
          else if (r.includes('限制高原') || r.includes('限制夜间')) add('健康限制', 'soft', `${pr.id} ${p.name}：${r}`, pr, p.id); });
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
    st.pilots.forEach(p => { const h = idx.hours[p.id];
      if (h > hardCap(st) + 1e-9) ded.push({ type: '月小时超法规上限', level: 'hard', msg: `${p.name}(${p.rank}) ${h.toFixed(1)}h > ${hardCap(st)}h（CAAC 月度硬上限）`, pilot: p.id });
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
    const rhythm = { gapDist, gapN: allG.length, gap23: allG.length ? allG.filter(g => g === 2 || g === 3).length / allG.length : 0,
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
      const rs = [];
      if (!slotRankOK(slot, p.rank)) rs.push('级别不适合' + SLOT_NAME[slot] + '位');
      const other = ['C', 'F', 'T'].filter(s => s !== slot).map(s => pr.crew[s]);
      if (other.includes(p.id)) rs.push('已在本任务');
      if (!rs.length) {
        const [, r2] = personCheck(p, pr, st, idx, { ignorePrefs: true }); rs.push(...r2);
        const crew = ['C', 'F', 'T'].map(s => s === slot ? p : (pr.crew[s] && idx.pm[pr.crew[s]]));
        const iss = crewIssue(pr, crew, st); if (iss) rs.push(iss);
      }
      const pf = daysTouched(pr, st).filter(d => (p.prefs || []).includes(d));
      const sbd = daysTouched(pr, st).filter(d => ((st.standby || {})[p.id] || []).includes(d));
      res.push({ p, ok: rs.length === 0, reasons: rs, warn: pf.length ? '意向休息日' + pf.join(',') + '日' : '', standby: sbd, hours: idx.hours[p.id] });
    }
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
  function opsMetrics(st) {
    const S = st.settings || defaultSettings(); const idx = buildIndex(st);
    const hard = hardCap(st); const dayWin = S.opsDayWindowH || 14;
    const nPilots = st.pilots.length;
    const regs = new Set(); st.pairings.forEach(p => p.legs.forEach(l => { if (l.reg) regs.add(l.reg); }));
    // also count fleet template size if sample has few flying
    const fleetN = Math.max(regs.size, Object.values(FLEET).flat().length);
    const flyingN = regs.size || fleetN;
    let blockH = 0; st.pairings.forEach(p => { blockH += pairingHours(p); });
    // 可用剩余运力：每人 (hard - assigned) 之和（下限 0）
    let remain = 0, assigned = 0, overN = 0;
    st.pilots.forEach(p => { const h = idx.hours[p.id] || 0; assigned += h; remain += Math.max(0, hard - h); if (h > hard + 1e-9) overN++; });
    const capacityTotal = nPilots * hard;
    const unfilled = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T));
    const risk = fdpRiskSummary(st);
    const highRiskDays = risk.rows.filter(r => r.risk === 'high' || r.risk === 'over' || r.risk === 'med');
    // 备份：本月已排备份人日 vs 需求 DAYS * standbyPerDay
    const sbNeed = DAYS * (S.standbyPerDay == null ? 1 : S.standbyPerDay);
    let sbUsed = 0; st.pilots.forEach(p => { sbUsed += ((st.standby || {})[p.id] || []).length; });
    const sbLeft = Math.max(0, sbNeed - sbUsed);
    // 请假压力：本月请假人日
    let leaveDays = 0; st.pilots.forEach(p => { leaveDays += (p.leave || []).length; });
    // 当日（默认取高风险最多的一天或 15 日）
    const byDate = {}; highRiskDays.forEach(r => { byDate[r.date] = (byDate[r.date] || 0) + 1; });
    let focusDate = 15; let best = -1; Object.keys(byDate).forEach(d => { if (byDate[d] > best) { best = byDate[d]; focusDate = +d; } });
    const dayUnfilled = st.pairings.filter(p => daysTouched(p, st).includes(focusDate) && !(p.crew.C && p.crew.F && p.crew.T)).length;
    const dayRisk = highRiskDays.filter(r => r.date === focusDate).length;
    const daySb = st.pilots.filter(p => ((st.standby || {})[p.id] || []).includes(focusDate)).length;
    const dayLeave = st.pilots.filter(p => (p.leave || []).includes(focusDate)).length;
    // 飞机利用率
    const util = flyingN && dayWin ? blockH / (flyingN * DAYS * dayWin) : 0;
    // 每机日航段
    let legs = 0; st.pairings.forEach(p => { legs += p.legs.length; });
    const legsPerAcDay = flyingN ? legs / (flyingN * DAYS) : 0;
    return {
      hardMaxHours: hard, opsDayWindowH: dayWin,
      nPilots, nAircraft: flyingN, fleetTemplate: fleetN, nPairings: st.pairings.length, nLegs: legs,
      blockHours: +blockH.toFixed(1), assignedHours: +assigned.toFixed(1),
      capacityTotal, remainHours: +remain.toFixed(1), usedPct: capacityTotal ? assigned / capacityTotal : 0,
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
      focusDate, day: { unfilled: dayUnfilled, fdpRisk: dayRisk, standby: daySb, leave: dayLeave },
      formulas: {
        remain: 'Σ max(0, 法规月上限 − 已排飞行小时)',
        pilotsPerAc: '飞行员人数 ÷ 本月出现过的机号数',
        blockPerPilot: '总轮挡小时 ÷ 飞行员人数',
        blockPerAc: '总轮挡小时 ÷ 机号数',
        util: '总轮挡小时 ÷ (机号数 × 日历天数 × 日可用窗口小时)',
        legsPerAcDay: '总航段数 ÷ (机号数 × 日历天数)'
      }
    };
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
      const [, rs] = personCheck(q, pr, w, idx, { ignorePrefs: true }); if (!rs.length) continue;
      const ids = [...new Set(rs.map(r => (r.match(/\((PR\d+)\)/) || [])[1]))]; if (ids.length !== 1 || !ids[0] || rs.some(r => !/\(PR\d+\)/.test(r) && !/超出月上限/.test(r))) continue;
      const Q = prOf(w, ids[0]); const sQ = ['C', 'F', 'T'].find(x => Q.crew[x] === q.id); if (!sQ || ban.has('PR:' + Q.id)) continue; tries++;
      Q.crew[sQ] = null; const idx2 = buildIndex(w);
      const [ok2] = personCheck(q, pr, w, idx2, { ignorePrefs: true }); const crew = ['C', 'F', 'T'].map(x => x === slot ? q : (pr.crew[x] && idx2.pm[pr.crew[x]]));
      if (ok2 && !crewIssue(pr, crew, w) && !(idx2.hours[q.id] + pairingHours(pr) > hardCap(w))) {
        pr.crew[slot] = q.id;
        const bf = candidates(w, Q, sQ).filter(c => c.ok && !ban.has(c.p.id) && c.p.id !== q.id).sort((a, b) => (!!a.warn - !!b.warn) || (b.standby.length > 0) - (a.standby.length > 0) || a.hours - b.hours)[0];
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
        const cands = candidates(w, pr, v.slot).filter(c => c.ok && !ban.has(c.p.id));
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
      return { id, name: p.name, rank: p.rank, hb, ha, overHard: ha > hardCap(w) + 1e-9, prefHit, rhythm: ra - rb }; });
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
    const S = st.settings; if (S.fdpAugmented) return (S.fdpAugLimitH || 16) * 60;
    const h = (((reportMin % DAY) + DAY) % DAY) / 60; const T = S.fdpTable || defaultFdpTable();
    const row = T.find(r => h >= r.from && h < r.to) || T[T.length - 1]; const c = nLegs <= 4 ? 0 : nLegs === 5 ? 1 : nLegs === 6 ? 2 : 3;
    return row.lim[c] * 60;
  }
  // 逐日 FDP（按实际/预计时刻，不做延误级联）。
  // acts: { legKey: { dep?:分钟, arr?:分钟, kind:'est'|'act' } }（分钟自 11/01 00:00，可跨午夜）。
  // 未录入的航段按计划时刻；录入起飞未录落地时，落地 = 起飞 + 计划轮挡。pr.freshAt=legKey：新机组自该段（实际/预计）起飞前报到。
  // 另算“若不追回”的级联推算（cascEnd/cascExceed），仅作提示，不计入超限。
  function fdpDays(pr, st, acts) {
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


  // ---------- 路演演示异常（示例数据自动填人后注入；测试勿默认调用） ----------
  // 故意留下：① 新机长机组缺教员（座位规则硬违规）；② 某值勤日 FDP 余量压到高风险区间
  function injectDemoAnomalies(st) {
    if (!st || !st.sample) return [];
    if (st.demoAnomaliesApplied) return st.demoAnomalies || [];
    const out = [];
    const idx = buildIndex(st);

    // ① 座位：找「新机长任机位 + 机组含教员」的任务，把教员位换成空闲副驾驶 → 触发「新机长须有教员」
    let seatPr = st.pairings.find(pr => {
      const c = pr.crew.C && idx.pm[pr.crew.C];
      if (!c || !isNew(c.rank)) return false;
      return ['C', 'F', 'T'].some(s => { const q = pr.crew[s] && idx.pm[pr.crew[s]]; return q && isInstr(q.rank); });
    });
    if (seatPr) {
      for (const s of ['T', 'F', 'C']) {
        const q = seatPr.crew[s] && idx.pm[seatPr.crew[s]];
        if (!q || !isInstr(q.rank)) continue;
        if (s === 'C') continue; // 保留新机长在机位
        const fo = st.pilots.find(p => isFO(p.rank) && !Object.values(seatPr.crew).includes(p.id) && personCheck(p, seatPr, st, idx, { ignorePrefs: true })[0]);
        if (fo) { seatPr.crew[s] = fo.id; break; }
      }
      // 若仍有教员，再清一次
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

    // ② FDP：取计划余量适中的值勤日，拉长末段落地，把余量压到约 35 分（高风险，不超限）
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
          if (pr.demoAnomaly === 'seat') {
            pr.demoAnomaly = 'seat+fdp';
            pr.demoAnomalyNote = (pr.demoAnomalyNote || '') + '；' + note;
          } else {
            pr.demoAnomaly = 'fdp';
            pr.demoAnomalyNote = note;
          }
          out.push({ kind: 'fdp', pairingId: pr.id, d: fdpRow.d, note });
        }
      }
    }

    st.demoAnomaliesApplied = true;
    st.demoAnomalies = out;
    st.fills = st.fills || [];
    return out;
  }


    return { migrateDelays, fdpDays, fdpLimit, fdpRiskSummary, pairingRisk, dutyMonitor, fdpOptions, splitPairing, legKey, fmtH, LEG_COLS, defaultFdpTable, leaveOptions, migrateSettings, ensureAircraftRegs, assignAircraftRegs, aircraftDay, FLEET, defaultHealth, authAirports, levelAirports, healthFlags, hasHealthRestriction, healthBlocks, migratePilots, isPlateauAirport, YEAR, MONTH, DAYS, DAY, RANKS, RANK_VAL, NEW_CAPT, INSTR, GROUPS, AIRPORTS, CAT_DESC, AUTH_CATS,
    isFO, isCaptClass, isInstr, isNew, rankGroup, seatOK, catOK, apName, apCat, needsAuth, isSpecial,
    generateSample, defaultSettings, pairingHours, report, release, daysTouched, isNightLeg, fmtT, specialAirportsOf,
    crewIssue, personCheck, buildIndex, autoFill, assignStandby, dayStatus, restGaps, freeRuns, validate, summarize, stats, candidates, applyLeave, holeRecommend, holeImpact, injectDemoAnomalies, opsMetrics, shareFor, SLOT_NAME, slotRankOK, blockMin };
});
