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

  function defaultSettings() {
    return { minRestH: 12, minHours: 30, maxHours: 70, maxOffCapt: 4, maxOffFO: 7,
      bpTesterAirports: ['ZLXY', 'ZWWW'], reportMin: 60, releaseMin: 30, honorPrefs: true,
      maxFreeRun: 3, standbyCapt: 2, standbyFO: 3, gapWeight: 0.35 };
  }

  // 旧版字段迁移：testerAirports（误称“酒测/血压测试员”）→ bpTesterAirports（始发站须配备血压测试仪）
  function migrateSettings(S) {
    if (S && S.testerAirports) { S.bpTesterAirports = S.testerAirports; delete S.testerAirports; }
    return S;
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
      pilots.push({ id: 'E' + no, name: nm, rank: rk, auth, prefs: [], leave: [] });
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
          legs.push({ d: k + 1, flt: fn(seq[i], seq[i + 1]), from: seq[i], to: seq[i + 1], dep: t, arr: t + bm, ac }); t += bm + 50; }
      }
      const p = { id: 'PR' + String(pid++).padStart(3, '0'), start, ndays: nd, ac, legs, crew: { C: null, F: null, T: null } };
      total += pairingHours(p); pairings.push(p);
    }
    pairings.sort((a, b) => a.legs[0].dep - b.legs[0].dep);
    pairings.forEach((p, i) => p.id = 'PR' + String(i + 1).padStart(3, '0'));
    return { version: 1, sample: true, settings: S, pilots, pairings };
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
  function minHoursFor(p, st) { const avail = DAYS - (p.leave || []).length; return Math.round(st.settings.minHours * avail / DAYS * 10) / 10; }

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
    if (!already && idx.hours[p.id] + h > S.maxHours + 1e-9) rs.push('超出月上限' + S.maxHours + 'h');
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
    st.pilots.forEach(p => target[p.id] = Math.max(minHoursFor(p, st), 1));
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
            if (idx.hours[curId] - h < minHoursFor(cp, st) - 1e-9) continue;
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
              if (idx.hours[a.id] - dh < minHoursFor(a, st)) continue;
              const g0 = gapCost(a, idx.sched[a.id], st) + gapCost(b, idx.sched[b.id], st);
              const sy = Y && slotOf(Y, b.id);
              assign(X, sx, b.id); if (Y) assign(Y, sy, a.id);
              const ok = personCheck(b, X, st, idx, { ignorePrefs: !S.honorPrefs })[0] && idx.hours[b.id] <= S.maxHours + 1e-9 &&
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
    assignStandby(st);
    return summarize(st);
  }

  // 修复：对仍有空缺的任务做一步“置换链”——把某人从冲突任务中换出，由他人顶替
  function repairUnfilled(st) {
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
        if (!done) { const w = candidates(st, pr, slot).find(c => c.ok); if (w) pr.crew[slot] = w.p.id; }
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
    const ds = dayStatus(st, idx); const maxRun = S.maxFreeRun || 3;
    const put = (p, d) => { ds[p.id][d] = 'S'; st.standby[p.id].push(d); };
    // 1) 连续空闲超过上限者插入备份
    st.pilots.forEach(p => { const a = ds[p.id]; let guard = 0;
      for (let runs = freeRuns(a).filter(r => r[1] - r[0] + 1 > maxRun); runs.length && guard++ < 20; runs = freeRuns(a).filter(r => r[1] - r[0] + 1 > maxRun)) {
        const [s0, e0] = runs[0]; const len = e0 - s0 + 1; let d = s0 + Math.min(maxRun, len - 2);
        if (!sbOK(a, d)) { const alt = []; for (let x = s0; x <= e0; x++) if (sbOK(a, x) && x - s0 <= maxRun) alt.push(x); if (alt.length) d = alt[alt.length - 1]; else { a[s0] = 'x'; continue; } }
        put(p, d); }
      for (let d = 1; d <= DAYS; d++) if (a[d] === 'x') a[d] = ''; });
    // 2) 每日备份池
    const cnt = id => st.standby[id].length;
    for (let d = 1; d <= DAYS; d++) for (const [isC, need] of [[true, S.standbyCapt || 0], [false, S.standbyFO || 0]]) {
      const grp = st.pilots.filter(p => isCaptClass(p.rank) === isC);
      let have = grp.filter(p => ds[p.id][d] === 'S').length;
      const cands = grp.filter(p => sbOK(ds[p.id], d) && !(isC && (isNew(p.rank)))).sort((a, b) => cnt(a.id) - cnt(b.id) || idx.hours[a.id] - idx.hours[b.id]);
      while (have < need && cands.length) { put(cands.shift(), d); have++; }
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
          if (t) add(t, 'hard', `${pr.id} ${p.name}：${r}`, pr, p.id); });
        const pf = daysTouched(pr, st).filter(d => (p.prefs || []).includes(d));
        if (pf.length) add('意向休息日未满足', 'soft', `${pr.id} ${p.name} 意向休息日 ${pf.join(',')} 日被排班`, pr, p.id);
      });
      if (crew.every(Boolean)) {
        const iss = crewIssue(pr, crew, st);
        if (iss) { const t = iss.includes('新机长') ? '新机长无教员' : iss.includes('特殊机场') ? '特殊机场授权/搭配' : '座位搭配规则'; add(t, 'hard', `${pr.id} ${iss}`, pr); }
      }
      const tl = pr.legs.filter(l => (S.bpTesterAirports || []).includes(l.from));
      if (tl.length && crew.some(Boolean)) add('需血压测试仪', 'info', `${pr.id} 自 ${[...new Set(tl.map(l => apName(l.from, st)))].join('、')} 出港（${tl.map(l => 'D' + l.d + ' ' + l.flt).join('，')}），始发站须配备血压测试仪`, pr);
    }
    // 时间重叠会被两边各报一次，去重
    const seen = new Set(); const ded = out.filter(v => { if (v.type !== '时间重叠' && v.type !== '休息不足') return true;
      const k = v.type + v.pilot + [v.pairing, (v.msg.match(/\((PR\d+)\)/) || [])[1]].sort().join(); if (seen.has(k)) return false; seen.add(k); return true; });
    const dsv = dayStatus(st, idx);
    st.pilots.forEach(p => { (st.standby && st.standby[p.id] || []).forEach(d => { if (dsv[p.id][d] === 'D') ded.push({ type: '备份冲突', level: 'hard', msg: `${p.name} ${d}日备份与飞行任务冲突`, pilot: p.id }); });
      freeRuns(dsv[p.id]).forEach(([a, b]) => { if (b - a + 1 > (S.maxFreeRun || 3) && st.standby) ded.push({ type: '连续空闲超限', level: 'soft', msg: `${p.name} ${a}-${b}日连续空闲${b - a + 1}天无备份`, pilot: p.id }); }); });
    if (st.standby) for (let d = 1; d <= DAYS; d++) { const n = [true, false].map(c => st.pilots.filter(p => isCaptClass(p.rank) === c && (st.standby[p.id] || []).includes(d) && dsv[p.id][d] === 'S').length);
      if (n[0] < (S.standbyCapt || 0) || n[1] < (S.standbyFO || 0)) ded.push({ type: '备份人数不足', level: 'soft', msg: `${d}日备份 机长类${n[0]}/${S.standbyCapt} 副驾驶${n[1]}/${S.standbyFO}` }); }
    st.pilots.forEach(p => { const h = idx.hours[p.id];
      if (h > S.maxHours + 1e-9) ded.push({ type: '月小时超上限', level: 'hard', msg: `${p.name}(${p.rank}) ${h.toFixed(1)}h > ${S.maxHours}h`, pilot: p.id });
      if (h < minHoursFor(p, st) - 1e-9) ded.push({ type: '月小时低于下限', level: 'hard', msg: `${p.name}(${p.rank}) ${h.toFixed(1)}h < ${minHoursFor(p, st)}h`, pilot: p.id }); });
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

  return { migrateSettings, YEAR, MONTH, DAYS, DAY, RANKS, RANK_VAL, NEW_CAPT, INSTR, GROUPS, AIRPORTS, CAT_DESC, AUTH_CATS,
    isFO, isCaptClass, isInstr, isNew, rankGroup, seatOK, catOK, apName, apCat, needsAuth, isSpecial,
    generateSample, defaultSettings, pairingHours, report, release, daysTouched, isNightLeg, fmtT, specialAirportsOf,
    crewIssue, personCheck, buildIndex, autoFill, assignStandby, dayStatus, restGaps, freeRuns, validate, summarize, stats, candidates, applyLeave, minHoursFor, SLOT_NAME, slotRankOK, blockMin };
});
