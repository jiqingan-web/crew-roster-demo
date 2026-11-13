// 换季计划解析（C-02）：以原表分行和「过夜天数」为值勤期边界，不做跨行合并。
// 浏览器 window.SeasonPlan，Node require()
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.SeasonPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ABBR = { 蓉: 'ZUUU', 府: 'ZUTF', 呼: 'ZBHH', 湘: 'ZGHA', 沈: 'ZYTX', 福: 'ZSFZ', 郑: 'ZHCC', 武: 'ZHHH', 贡: 'ZULS', 济: 'ZSJN', 琼: 'ZJHK', 皖: 'ZSOF', 坤: 'ZWBK', 兰: 'ZLLL', 哈: 'ZYHB', 陕: 'ZLXY', 苏: 'ZSWX', 渝: 'ZUCK', 京: 'ZBAA', 沪: 'ZSSS', 浦: 'ZSPD', 昆: 'ZPPP', 厦: 'ZSAM', 盐: 'ZSYN', 奇: 'ZWQT', 阿: 'ZWAT', 连: 'ZYTL', 春: 'ZYCC', 杭: 'ZSHC', 三: 'ZJSY', 宁: 'ZSNJ', 乌: 'ZWWW', 穗: 'ZGGG' };
  const AP_NAME = { ZUUU: '蓉', ZUTF: '府', ZSOF: '皖', ZYHB: '哈', ZLLL: '兰', ZWBK: '坤', ZYTX: '沈', ZJHK: '琼', ZHHH: '武', ZSJN: '济', ZHCC: '郑', ZBHH: '呼', ZGHA: '湘', ZSFZ: '福' };

  // 缺站检查用航线表：默认表覆盖 C-02 验收航班；解析时从完整航站学习并合并，不覆盖更长的已知航线。
  const DEFAULT_KNOWN_ROUTES = {
    '2449': ['ZUUU', 'ZSOF', 'ZYHB'],
    '2450': ['ZYHB', 'ZSOF', 'ZUUU'],
    '1855': ['ZUUU', 'ZSOF', 'ZYHB'],
    '1856': ['ZYHB', 'ZSOF', 'ZUUU'],
    '1849': ['ZUUU', 'ZLLL'],
    '1850': ['ZLLL', 'ZUUU'],
    '2729': ['ZUUU', 'ZWBK'],
    '2730': ['ZWBK', 'ZUUU'],
    '2411': ['ZUUU', 'ZYTX'],
    '2713': ['ZYTX', 'ZUUU'],
    '2714': ['ZUUU', 'ZYTX'],
    '2441': ['ZYTX', 'ZUUU'],
    '2724': ['ZUUU', 'ZYTX'],
    '2210': ['ZYTX', 'ZUUU']
  };
  const KNOWN_ROUTES = DEFAULT_KNOWN_ROUTES;

  // CCAR-121 表 A：按计划起飞所在时刻（报告时刻用首段起飞）的日飞行时间上限
  function tableALimitMin(depMinOfDay) {
    const h = ((depMinOfDay % 1440) + 1440) % 1440 / 60;
    if (h < 5) return 8 * 60;
    if (h < 20) return 9 * 60;
    return 8 * 60;
  }


  const FERRY_RE = /[（(]摆渡[)）]|摆渡/g;
  const AIRPORT_ALIASES = {
    '揭阳潮汕': '揭阳', '达州金垭': '达州', '达县': '达州',
    '伊宁': '伊犁', '重庆江北': '重庆', '虹桥': '上海虹桥', '浦东': '上海浦东'
  };
  const LABEL_RE = /已完成|优先长沙属地化|可单出来沈阳属地化飞|属地化/;
  const REMARK_RE = /通知|头像对不上号/;

  function cleanAirportName(name) {
    if (name == null) return '';
    let s = String(name).trim();
    s = s.replace(FERRY_RE, '');
    s = s.replace(/[（）()]/g, '').trim();
    return s;
  }

  function aliasAirportName(name) {
    const c = cleanAirportName(name);
    if (!c) return '';
    return AIRPORT_ALIASES[c] || c;
  }

  function normAp(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (/^[A-Z]{4}$/i.test(s)) return s.toUpperCase();
    if (ABBR[s]) return ABBR[s];
    if (s.length === 1 && ABBR[s]) return ABBR[s];
    // 全称/别名
    const cleaned = cleanAirportName(s);
    const canon = AIRPORT_ALIASES[cleaned] || AIRPORT_ALIASES[s] || cleaned;
    const alias = { 成都: 'ZUUU', 双流: 'ZUUU', 成都双流: 'ZUUU', 天府: 'ZUTF', 成都天府: 'ZUTF', 合肥: 'ZSOF', 哈尔滨: 'ZYHB', 兰州: 'ZLLL', 巴里坤: 'ZWBK', 沈阳: 'ZYTX', 海口: 'ZJHK', 武汉: 'ZHHH', 济南: 'ZSJN', 郑州: 'ZHCC', 呼和浩特: 'ZBHH', 长沙: 'ZGHA', 福州: 'ZSFZ', 达州: 'ZUDX', 揭阳: 'ZGOW', 伊犁: 'ZWYN', 伊宁: 'ZWYN', 虹桥: 'ZSSS', 上海虹桥: 'ZSSS', 浦东: 'ZSPD', 上海浦东: 'ZSPD', 厦门: 'ZSAM', 西安: 'ZLXY', 无锡: 'ZSWX', 拉萨: 'ZULS', 奇台: 'ZWQT', 阿勒泰: 'ZWAT' };
    if (alias[canon]) return alias[canon];
    if (alias[cleaned]) return alias[cleaned];
    if (ABBR[canon]) return ABBR[canon];
    return alias[s] || null;
  }

  function parseRoute(s) {
    if (!s) return [];
    return String(s).split(/[-–—－\/]/).map(x => normAp(x.trim())).filter(Boolean);
  }

  function expandShortFlight(prev, token) {
    let t = String(token || '').trim().toUpperCase();
    t = t.replace(/^[A-Z]{2}(?=\d)/, '');
    if (!t) return '';
    if (prev && /^\d+$/.test(t) && t.length < String(prev).length) {
      return String(prev).slice(0, String(prev).length - t.length) + t;
    }
    return t;
  }

  function normalizeFlights(raw) {
    const flags = [];
    if (raw == null) return { flights: [], flags, ferry: false, raw: '' };
    let s = String(raw).trim();
    if (!s) return { flights: [], flags, ferry: false, raw: s };
    const ferry = FERRY_RE.test(s);
    FERRY_RE.lastIndex = 0;
    s = s.replace(FERRY_RE, '');
    s = s.replace(/[（）()]/g, ' ').trim();
    if (/^(休|休息|买票)$/.test(s)) return { flights: [], flags, ferry, rest: /^休/.test(s), raw: String(raw) };
    // EU1966.5 / 1966.5：小数点后一位不像第二航班号
    const oneDec = s.match(/^(?:[A-Za-z]{2})?(\d{3,4})\.(\d)$/);
    if (oneDec && !/[、,\/]/.test(s)) {
      flags.push('航班号原文 ' + raw + '：小数点后不像第二航班号，按 ' + oneDec[1] + ' 处理');
      return { flights: [oneDec[1]], flags, ferry, raw: String(raw) };
    }
    const parts = s.split(/[、,\/．.\s]+/).map(x => x.trim()).filter(Boolean);
    const nums = [];
    parts.forEach(p => {
      let t = expandShortFlight(nums.length ? nums[nums.length - 1] : '', p);
      if (/^\d{1,4}$/.test(t)) nums.push(t);
    });
    return { flights: nums, flags, ferry, raw: String(raw) };
  }

  function parseFlights(s) {
    return normalizeFlights(s).flights;
  }

  function parseHM(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v.getUTCHours() * 60 + v.getUTCMinutes();
    if (typeof v === 'object' && v && typeof v.totalSeconds === 'function') return Math.round(v.totalSeconds() / 60);
    if (typeof v === 'object' && v && v.seconds != null) return Math.round(v.seconds / 60);
    if (typeof v === 'number') {
      if (v > 0 && v < 3) return Math.round(v * 24 * 60); // Excel 天数小数
      if (Number.isInteger(v) && v >= 0 && v <= 2359) {
        const h = Math.floor(v / 100), m = v % 100;
        if (h <= 47 && m < 60) return h * 60 + m;
      }
      if (v >= 0 && v < 48 * 60) return Math.round(v);
    }
    const s = String(v).trim().replace(/：/g, ':');
    let m = s.match(/^(\d{1,2}):(\d{2})(?:\s*\+\s*(\d))?$/);
    if (m) return ((+(m[3] || 0)) * 1440 + (+m[1]) * 60 + (+m[2]));
    m = s.match(/^(\d{3,4})$/);
    if (m) {
      const n = +m[1], h = Math.floor(n / 100), mi = n % 100;
      if (h <= 47 && mi < 60) return h * 60 + mi;
    }
    const n = +s;
    if (Number.isFinite(n) && n >= 0 && n < 48 * 60) return n;
    return null;
  }

  function durationMin(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (v > 0 && v < 3) return Math.round(v * 24 * 60);
      if (v >= 3 && v < 48 * 60) return Math.round(v);
    }
    if (v instanceof Date && !isNaN(v)) {
      // Excel 时长有时以 1899-12-30 的 Date 出现
      return v.getUTCHours() * 60 + v.getUTCMinutes();
    }
    if (typeof v === 'object') {
      if (typeof v.totalSeconds === 'function') return Math.round(v.totalSeconds() / 60);
      if (v.seconds != null) return Math.round(v.seconds / 60);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d+)h(\d{2})$/i) || s.match(/^(\d+):(\d{2})$/) || s.match(/^(\d+)小时(\d+)?分?$/);
    if (m) return (+m[1]) * 60 + (+(m[2] || 0));
    const n = +s;
    if (Number.isFinite(n) && n > 0 && n < 3) return Math.round(n * 24 * 60);
    if (Number.isFinite(n) && n >= 3 && n < 48 * 60) return Math.round(n);
    return null;
  }

  function dowValid(mask, dateOrDow) {
    if (!mask) return true;
    const m = String(mask).replace(/\D/g, '');
    if (!m) return true;
    let dow;
    if (typeof dateOrDow === 'number' && dateOrDow >= 0 && dateOrDow <= 7) {
      dow = dateOrDow === 0 ? 7 : dateOrDow; // 1=周一 … 7=周日
    } else {
      const d = dateOrDow instanceof Date ? dateOrDow : new Date(dateOrDow);
      if (isNaN(d)) return true;
      dow = d.getDay() === 0 ? 7 : d.getDay();
    }
    return m.indexOf(String(dow)) >= 0;
  }

  function fmtH(min) {
    min = Math.round(min || 0);
    return Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
  }

  function legsFromRow(row) {
    if (Array.isArray(row.legs) && row.legs.length) {
      return row.legs.map(l => Object.assign({}, l, { from: normAp(l.from) || l.from, to: normAp(l.to) || l.to }));
    }
    const flts = parseFlights(row.flights || row.flt || '');
    const route = parseRoute(row.route);
    const legs = [];
    if (flts.length && route.length >= 2) {
      // 若只有一班且航线多段：该航班经停
      if (flts.length === 1) {
        for (let i = 0; i < route.length - 1; i++) legs.push({ flt: flts[0], from: route[i], to: route[i + 1] });
      } else if (route.length === flts.length + 1) {
        for (let i = 0; i < flts.length; i++) legs.push({ flt: flts[i], from: route[i], to: route[i + 1] });
      } else {
        // 无法对齐时先按航线连成一段标记，后续用已知航线核对
        for (let i = 0; i < route.length - 1; i++) legs.push({ flt: flts[Math.min(i, flts.length - 1)], from: route[i], to: route[i + 1] });
      }
    }
    // 补时刻：若提供了首段起飞、末段落地和飞行时间，按段均分；测试可直接给 legs
    const dep0 = parseHM(row.dep);
    const arr1 = parseHM(row.arr);
    const day = row.day != null ? +row.day : 1;
    const base = (day - 1) * 1440;
    if (legs.length && dep0 != null && arr1 != null) {
      const span = arr1 - dep0; const n = legs.length;
      const blkEach = Math.round(span / n);
      legs.forEach((l, i) => {
        l.dep = base + dep0 + i * blkEach;
        l.arr = base + (i === n - 1 ? arr1 : dep0 + (i + 1) * blkEach);
        l.d = day;
      });
    } else {
      legs.forEach(l => { if (l.d == null) l.d = day; });
    }
    return legs;
  }

  function flightMin(legs) {
    return (legs || []).reduce((s, l) => s + Math.max(0, (l.arr != null && l.dep != null) ? (l.arr - l.dep) : (l.blk || 0)), 0);
  }

  function continuity(legs) {
    for (let i = 1; i < legs.length; i++) {
      if (legs[i].from !== legs[i - 1].to) {
        return { ok: false, at: i, from: legs[i - 1].to, to: legs[i].from, msg: '航线不连续：上一段落地 ' + (legs[i - 1].to || '?') + ' 与下一段起飞 ' + (legs[i].from || '?') + ' 不一致' };
      }
    }
    return { ok: true };
  }

  function rememberRoute(tab, flt, chain) {
    if (!flt || !chain || chain.length < 2) return tab;
    const prev = tab[flt];
    if (!prev || chain.length > prev.length) tab[flt] = chain.slice();
    return tab;
  }

  function routeChainFromLegs(flt, legs) {
    const mine = (legs || []).filter(l => String(l.flt || '').replace(/^[A-Z]{2}/, '') === String(flt).replace(/^[A-Z]{2}/, ''));
    if (!mine.length) return null;
    const chain = [mine[0].from];
    for (let i = 0; i < mine.length; i++) {
      if (chain[chain.length - 1] !== mine[i].from) return null;
      chain.push(mine[i].to);
    }
    return chain;
  }

  function learnKnownRoutes(rowsOrDuties, base) {
    const tab = Object.assign({}, DEFAULT_KNOWN_ROUTES, base || {});
    (rowsOrDuties || []).forEach(r => {
      const legs = r.legs || [];
      const flts = r.flights && r.flights.length ? r.flights : parseFlights(r.flights || r.flt || '');
      if (flts.length === 1 && r.routeCodes && r.routeCodes.length >= 3) rememberRoute(tab, flts[0], r.routeCodes);
      if (legs.length) {
        flts.forEach(f => {
          const ch = routeChainFromLegs(f, legs);
          if (ch && ch.length >= 2) rememberRoute(tab, f, ch);
        });
      }
    });
    return tab;
  }

  function knownRouteMismatch(flts, writtenRoute, table) {
    const TAB = table || KNOWN_ROUTES;
    const known = [];
    flts.forEach(f => { const r = TAB[f]; if (r) known.push(r); });
    if (!known.length) return null;
    // 拼接已知航线（下一段应从上一段末站出发）
    let chain = known[0].slice();
    for (let i = 1; i < known.length; i++) {
      const r = known[i];
      if (r[0] !== chain[chain.length - 1]) {
        return '航线不连续：航班 ' + flts[i - 1] + ' 止于 ' + chain[chain.length - 1] + '，航班 ' + flts[i] + ' 起于 ' + r[0];
      }
      chain = chain.concat(r.slice(1));
    }
    if (writtenRoute && writtenRoute.length) {
      const wr = writtenRoute.join('-');
      const kn = chain.join('-');
      if (wr !== kn && writtenRoute.length < chain.length) {
        const missing = chain.filter(c => writtenRoute.indexOf(c) < 0).map(c => AP_NAME[c] || c);
        return '航线不连续：航班 ' + flts.join('/') + ' 的完整航线为 ' + chain.map(c => AP_NAME[c] || c).join('-') + (missing.length ? '，缺少 ' + missing.join('、') : '') + '（表写 ' + writtenRoute.map(c => AP_NAME[c] || c).join('-') + '）';
      }
    }
    return null;
  }

  function checkDuty(duty, opt) {
    opt = opt || {};
    const reasons = [];
    const legs = duty.legs || [];
    const flts = duty.flights || [...new Set(legs.map(l => String(l.flt || '').replace(/^EU/, '')))];
    const written = duty.routeCodes || [];
    const mis = knownRouteMismatch(flts, written, opt.knownRoutes);
    if (mis) reasons.push(mis);
    const cont = continuity(legs);
    if (!cont.ok) reasons.push(cont.msg);
    const ft = duty.flightMin != null ? duty.flightMin : flightMin(legs);
    const dep0 = legs.length && legs[0].dep != null ? legs[0].dep : 0;
    const cap = tableALimitMin(dep0);
    if (ft > cap) reasons.push('飞行时间 ' + fmtH(ft) + ' > 表A上限 ' + fmtH(cap));
    // 班期：每个航班在实际执行日必须有效
    if (duty.dow && duty.date != null) {
      flts.forEach((f, i) => {
        const mask = Array.isArray(duty.dow) ? duty.dow[i] || duty.dow[0] : duty.dow;
        if (!dowValid(mask, duty.date)) reasons.push('航班 ' + f + ' 班期 ' + mask + ' 在执行日无效');
      });
    }
    if (Array.isArray(duty.dowByFlight) && duty.date != null) {
      duty.dowByFlight.forEach(x => {
        if (x && x.mask && !dowValid(x.mask, duty.date)) reasons.push('航班 ' + x.flt + ' 班期 ' + x.mask + ' 在执行日无效');
      });
    }
    const fail = reasons.length > 0;
    return { ok: !fail, reasons, flightMin: ft, tableA: cap };
  }

  function rowToDuty(row, idx) {
    const legs = legsFromRow(row);
    const flts = parseFlights(row.flights || row.flt || '') || [...new Set(legs.map(l => l.flt))];
    const routeCodes = parseRoute(row.route);
    const duty = {
      id: row.id || ('SP' + String(idx + 1).padStart(3, '0')),
      sheet: row.sheet || row.sheetName || '',
      row: row.row != null ? +row.row : (idx + 1),
      flights: flts,
      route: row.route || '',
      routeCodes,
      overnightDays: row.overnightDays == null ? 0 : +row.overnightDays,
      dow: row.dow,
      dowByFlight: row.dowByFlight,
      date: row.date,
      day: row.day,
      legs,
      flightMin: row.flightMin != null ? +row.flightMin : flightMin(legs),
      rest: !!row.rest,
      note: row.note || ''
    };
    return duty;
  }

  /**
   * 解析换季计划行。原表分行 = 值勤期边界；过夜天数 > 0 也视为本行值勤结束。
   * 不把相邻两行合成一个值勤期。
   * 返回 { duties, report }
   */
  function parseSeasonPlan(rows, opt) {
    opt = opt || {};
    const duties = [];
    const items = [];
    const prelim = (rows || []).map((row, i) => rowToDuty(row || {}, i));
    const knownRoutes = learnKnownRoutes(prelim, opt.knownRoutes);
    const chkOpt = Object.assign({}, opt, { knownRoutes });
    (rows || []).forEach((row, i) => {
      if (row && row.rest) {
        const d = prelim[i] || rowToDuty(row, i);
        d.kind = 'rest';
        attachMeta(d, row, opt);
        duties.push(d);
        items.push({ sheet: d.sheet, row: d.row, status: 'ok', kind: 'rest', id: d.id, reasons: [] });
        return;
      }
      const d = prelim[i] || rowToDuty(row, i);
      attachMeta(d, row, opt);
      const chk = checkDuty(d, chkOpt);
      d.check = chk;
      let status = 'ok';
      if (!chk.ok) status = 'fail';
      else if (row.doubt || d.note && /存疑/.test(d.note)) status = 'doubt';
      items.push({ sheet: d.sheet, row: d.row, status, id: d.id, flights: d.flights, reasons: chk.reasons, flightMin: chk.flightMin, tableA: chk.tableA });
      d.status = status;
      // 失败条不得交给排班
      if (status !== 'fail') duties.push(d);
      else d.blocked = true;
    });
    const report = summarize(items);
    return { duties, report, items, knownRoutes };
  }

  function summarize(items) {
    const ok = items.filter(x => x.status === 'ok').length;
    const doubt = items.filter(x => x.status === 'doubt').length;
    const fail = items.filter(x => x.status === 'fail').length;
    return { ok, doubt, fail, total: items.length, items };
  }

  /**
   * 强制把多个已解析值勤期合成一个（仅用于验收「不得合并」的反例）。
   * 合并后检查航线连续与表 A，失败则报解析错误。
   */
  function forceMergeDuties(duties, opt) {
    opt = opt || {};
    const legs = [];
    const flts = [];
    const rows = [];
    let sumBlk = 0;
    (duties || []).forEach(d => {
      (d.legs || []).forEach(l => legs.push(Object.assign({}, l)));
      (d.flights || []).forEach(f => flts.push(f));
      rows.push({ sheet: d.sheet, row: d.row });
      sumBlk += d.flightMin != null ? +d.flightMin : 0;
    });
    let flightMin;
    if (opt.flightMin != null) flightMin = +opt.flightMin;
    else {
      const s = legs.reduce((a, l) => a + ((l.arr != null && l.dep != null) ? (l.arr - l.dep) : (l.blk || 0)), 0);
      flightMin = s || sumBlk;
    }
    const merged = {
      id: opt.id || ((duties[0] && duties[0].id) + '+merged'),
      sheet: duties[0] && duties[0].sheet,
      rows,
      flights: flts,
      routeCodes: opt.routeCodes,
      legs,
      flightMin,
      date: opt.date || (duties[0] && duties[0].date),
      dow: opt.dow
    };
    const chk = checkDuty(merged, opt);
    return { ok: chk.ok, blocked: !chk.ok, reasons: chk.reasons, flightMin: chk.flightMin, tableA: chk.tableA, merged };
  }

  function reportText(rep) {
    const L = [];
    L.push('解析报告：成功 ' + rep.ok + ' / 存疑 ' + rep.doubt + ' / 失败 ' + rep.fail + '（共 ' + rep.total + ' 条）');
    (rep.items || []).forEach(it => {
      const loc = (it.sheet ? it.sheet + ' ' : '') + '第' + it.row + '行';
      const why = (it.reasons && it.reasons.length) ? '：' + it.reasons.join('；') : '';
      L.push((it.status === 'ok' ? '成功' : it.status === 'doubt' ? '存疑' : '失败') + ' · ' + loc + (it.id ? ' ' + it.id : '') + why);
    });
    return L.join('\n');
  }


  function getFlightMap() {
    if (typeof FlightMap !== 'undefined') return FlightMap;
    try { return require('./flight-map.js'); } catch (e) { return null; }
  }

  function attachMeta(duty, row, opt) {
    row = row || {};
    duty.labels = (row.labels || duty.labels || []).slice();
    duty.remarks = (row.remarks || duty.remarks || []).slice();
    if (row.ferry || duty.ferry) duty.ferry = true;
    if (row.ringLength) duty.ringLength = row.ringLength;
    if (row.durationMin != null) duty.durationMin = row.durationMin;
    if (row.durationDelta != null) duty.durationDelta = row.durationDelta;
    if (row.durationDoubt) duty.durationDoubt = true;
    const FM = getFlightMap();
    if (FM && duty.flights && duty.flights.length) {
      const mapped = FM.applyToFlights(duty.flights, opt && opt.flightMap);
      duty.flightMap = mapped;
      (duty.legs || []).forEach(l => {
        const id = String(l.flt || '').replace(/^[A-Z]{2}/, '');
        const m = mapped.find(x => x.flt === id || (x.both || []).indexOf(id) >= 0);
        if (m && m.status === 'mapped') { l.fltNew = m.newNo; l.fltOrig = m.oldNo; }
      });
      const doubts = mapped.filter(m => m.status === '存疑');
      if (doubts.length) {
        duty.doubt = true;
        const note = doubts.map(m => m.flt + ' 存疑' + (m.reason ? '：' + m.reason : '')).join('；');
        duty.note = duty.note ? duty.note + '；' + note : note;
      }
    }
    if (duty.durationDoubt) {
      duty.doubt = true;
      const note = '飞行时间与起落时刻相差 ' + Math.abs(duty.durationDelta || 0) + ' 分钟，超过 5 分钟，标为存疑';
      duty.note = duty.note ? duty.note + '；' + note : note;
    }
    if (row.doubt) duty.doubt = true;
    return duty;
  }

  function parseOvernightLabel(val) {
    if (val == null || val === '') return { overnightDays: 0 };
    if (typeof val === 'number' && Number.isFinite(val)) {
      const n = Math.round(val);
      return n > 1 ? { overnightDays: n, ringLength: n } : { overnightDays: n };
    }
    const s = String(val).trim();
    let m = s.match(/飞\s*(\d+)\s*天/);
    if (m) return { overnightDays: +m[1], ringLength: +m[1], flyDays: +m[1] };
    m = s.match(/(\d+)\s*天/);
    if (m) return { overnightDays: +m[1], ringLength: +m[1] };
    m = s.match(/^(\d+)$/);
    if (m) {
      const n = +m[1];
      return n > 1 ? { overnightDays: n, ringLength: n } : { overnightDays: n };
    }
    return { overnightDays: 0, raw: s };
  }

  function cellText(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'object') {
      if (v.result != null) return cellText(v.result);
      if (v.richText) return v.richText.map(x => x.text).join('');
      if (v.text != null) return String(v.text);
    }
    return String(v).trim();
  }

  function detectHeader(rows) {
    const aliases = {
      nature: ['性质', '标签'],
      overnight: ['过夜天数', '过夜'],
      flights: ['航班号', '航班'],
      dow: ['班期'],
      duration: ['飞行时间', '时长', '轮挡'],
      fdp: ['飞行值勤期']
    };
    const norm = s => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const r = rows[i] || [];
      const map = {};
      const stations = [];
      r.forEach((h, j) => {
        const n = norm(cellText(h));
        if (!n) return;
        Object.keys(aliases).forEach(k => {
          if (map[k] == null && aliases[k].some(a => norm(a) === n)) map[k] = j;
        });
        const sm = n.match(/^航站(\d+)$/);
        const dm = n.match(/^起飞(\d+)$/);
        const am = n.match(/^落地(\d+)$/);
        if (sm) stations[+sm[1]] = Object.assign(stations[+sm[1]] || {}, { ap: j, n: +sm[1] });
        if (dm) stations[+dm[1]] = Object.assign(stations[+dm[1]] || {}, { dep: j, n: +dm[1] });
        if (am) stations[+am[1]] = Object.assign(stations[+am[1]] || {}, { arr: j, n: +am[1] });
      });
      if (map.flights != null && (map.overnight != null || map.dow != null || stations.filter(Boolean).length >= 2)) {
        return { headerRow: i, map, stations: stations.filter(Boolean).sort((a, b) => a.n - b.n) };
      }
    }
    return { headerRow: -1, map: null, stations: [] };
  }

  function isSeasonPlanGrid(rows) {
    return detectHeader(rows || []).headerRow >= 0;
  }

  function nonemptyCells(row) {
    return (row || []).map((v, j) => ({ j, v, t: cellText(v) })).filter(x => x.t !== '');
  }

  function isDirectionTitle(row) {
    const xs = nonemptyCells(row);
    if (!xs.length) return false;
    const texts = xs.map(x => x.t);
    if (texts.length >= 8 && texts.every(t => t === texts[0]) && texts[0] !== '性质') return true;
    if (xs.length !== 1) return false;
    const s = texts[0];
    if (/^(休|休息)$/.test(s)) return false;
    if (LABEL_RE.test(s) || REMARK_RE.test(s)) return false;
    if (/\d/.test(s)) return false;
    if (/^EU/i.test(s)) return false;
    return s.length <= 8;
  }

  function isRemarkRow(row) {
    const xs = nonemptyCells(row);
    if (!xs.length) return false;
    const s = xs.map(x => x.t).join('');
    if (!REMARK_RE.test(s)) return false;
    const nf = normalizeFlights(s);
    return nf.flights.length === 0;
  }

  function isLabelOnly(row, map) {
    const xs = nonemptyCells(row);
    if (!xs.length) return false;
    const s = xs.map(x => x.t).join(' ');
    if (!LABEL_RE.test(s)) return false;
    if (map && map.flights != null && cellText(row[map.flights])) {
      const nf = normalizeFlights(row[map.flights]);
      if (nf.flights.length) return false;
    }
    return normalizeFlights(s).flights.length === 0;
  }

  function isRestRow(row, map) {
    const fl = map && map.flights != null ? cellText(row[map.flights]) : '';
    const dow = map && map.dow != null ? cellText(row[map.dow]) : '';
    if (/^(休|休息)$/.test(fl) || /^(休|休息)$/.test(dow)) return true;
    const xs = nonemptyCells(row);
    return xs.length === 1 && /^(休|休息)$/.test(xs[0].t);
  }

  /**
   * 解析换季计划二维表（含方向标题、标签、备注、航班号容错、时长交叉核对）。
   * 再交给 parseSeasonPlan 做 C-02 值勤期拆分与表A/航线检查。
   */
  function parseSeasonGrid(rows, opt) {
    opt = opt || {};
    const det = detectHeader(rows || []);
    if (det.headerRow < 0) return { ok: false, error: '未识别为换季计划表（需含 航班号 及 过夜天数/班期/航站）', duties: [], report: { ok: 0, doubt: 0, fail: 0, total: 0, items: [] }, skipped: [], knownRoutes: Object.assign({}, DEFAULT_KNOWN_ROUTES) };
    const map = det.map, stations = det.stations;
    const sheet = opt.sheet || opt.sheetName || '';
    const pendingLabels = [];
    const pendingRemarks = [];
    let section = '';
    const parsedRows = [];
    const skipped = [];
    for (let i = det.headerRow + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const xs = nonemptyCells(row);
      if (!xs.length) continue;
      const loc = { sheet, row: i + 1 };
      if (isDirectionTitle(row)) {
        section = xs[0].t;
        skipped.push(Object.assign({ kind: 'direction', text: section }, loc));
        continue;
      }
      if (isRemarkRow(row)) {
        const text = xs.map(x => x.t).join(' ');
        pendingRemarks.push(text);
        skipped.push(Object.assign({ kind: 'remark', text }, loc));
        continue;
      }
      if (isLabelOnly(row, map)) {
        const text = xs.map(x => x.t).join(' ');
        const labs = text.match(/已完成|优先长沙属地化|可单出来沈阳属地化飞|属地化[^，,]*/g) || [text];
        labs.forEach(l => pendingLabels.push(l));
        skipped.push(Object.assign({ kind: 'label', text }, loc));
        continue;
      }
      if (isRestRow(row, map)) {
        const ov = parseOvernightLabel(map.overnight != null ? row[map.overnight] : '');
        const rec = {
          sheet, row: i + 1, rest: true, note: '休', day: ov.overnightDays || undefined,
          overnightDays: ov.overnightDays, labels: pendingLabels.splice(0), remarks: pendingRemarks.splice(0), section
        };
        parsedRows.push(rec);
        continue;
      }
      const rawFlt = map.flights != null ? row[map.flights] : '';
      const nf = normalizeFlights(rawFlt);
      const hasStation = stations.some(st => st.ap != null && cellText(row[st.ap]));
      if (!nf.flights.length && !nf.ferry && !hasStation) {
        const text = xs.map(x => x.t).join(' ');
        if (REMARK_RE.test(text) || /通知|头像/.test(text)) pendingRemarks.push(text);
        else if (text) pendingLabels.push(text);
        skipped.push(Object.assign({ kind: REMARK_RE.test(text) ? 'remark' : 'label', text }, loc));
        continue;
      }
      const nature = map.nature != null ? cellText(row[map.nature]) : '';
      const labels = pendingLabels.splice(0);
      if (nature && LABEL_RE.test(nature)) labels.push(nature);
      else if (nature) labels.push(nature);
      const remarks = pendingRemarks.splice(0);
      const ov = parseOvernightLabel(map.overnight != null ? row[map.overnight] : '');
      const stNames = [];
      const legs = [];
      stations.forEach((st, idx) => {
        const name = st.ap != null ? cellText(row[st.ap]) : '';
        if (!name) return;
        const code = normAp(name) || null;
        const dep = st.dep != null ? parseHM(row[st.dep]) : null;
        const arr = st.arr != null ? parseHM(row[st.arr]) : null;
        stNames.push({ raw: name, name: aliasAirportName(name), code, dep, arr, col: st });
      });
      for (let k = 0; k < stNames.length - 1; k++) {
        const a = stNames[k], b = stNames[k + 1];
        if (!a.code || !b.code) continue;
        // 表头 起飞N/落地N 均属于航站N：起飞=本站离场，落地=下一站到达。
        let dep = a.dep, arr = a.arr != null ? a.arr : b.arr;
        if (dep == null || arr == null) continue;
        if (arr <= dep) arr += 1440;
        const flt = nf.flights.length === 1 ? nf.flights[0]
          : (nf.flights[k] || nf.flights[Math.min(k, nf.flights.length - 1)] || nf.flights[0] || '');
        legs.push({ flt, from: a.code, to: b.code, dep, arr, d: 1, ferry: nf.ferry, fromName: a.name, toName: b.name });
      }
      // 两航班 + 多段：按折返回站切分
      if (nf.flights.length === 2 && legs.length > 2) {
        let cut = Math.floor(legs.length / 2);
        const codes = stNames.map(x => x.code);
        for (let t = 1; t < codes.length; t++) if (codes[t] && codes.slice(0, t).indexOf(codes[t]) >= 0) { cut = t; break; }
        legs.forEach((l, idx) => { l.flt = idx < cut ? nf.flights[0] : nf.flights[1]; });
      }
      const route = stNames.map(x => x.name || x.raw).filter(Boolean).join('-');
      const routeCodes = stNames.map(x => x.code).filter(Boolean);
      let computed = flightMin(legs);
      const dur = map.duration != null ? durationMin(row[map.duration]) : null;
      let durationDoubt = false, durationDelta = 0;
      if (dur != null && computed > 0) {
        durationDelta = dur - computed;
        if (Math.abs(durationDelta) > 5) durationDoubt = true;
      }
      parsedRows.push({
        sheet, row: i + 1, flights: nf.flights.join('/'), flightFlags: nf.flags, ferry: nf.ferry,
        route, routeCodes, legs, dow: map.dow != null ? cellText(row[map.dow]) : '',
        overnightDays: ov.overnightDays, ringLength: ov.ringLength, flyDays: ov.flyDays,
        durationMin: dur, durationDelta, durationDoubt, doubt: durationDoubt,
        labels, remarks, section, nature, flightRaw: cellText(rawFlt),
        flightMin: computed || undefined
      });
    }
    const parsed = parseSeasonPlan(parsedRows, opt);
    parsed.skipped = skipped;
    parsed.gridRows = parsedRows;
    return parsed;
  }

  function isSeasonWorkbook(sheets) {
    return (sheets || []).some(s => isSeasonPlanGrid(s.rows) || /空客|商飞|换季/.test(s.name || s.sheet || ''));
  }

  function sheetsFromExcelJS(wb) {
    const sheets = [];
    if (!wb) return sheets;
    if (typeof wb.eachSheet === 'function') {
      wb.eachSheet(s => {
        const rows = [];
        s.eachRow({ includeEmpty: true }, (row, n) => {
          const a = [];
          row.eachCell({ includeEmpty: true }, (c, j) => { a[j - 1] = c.value; });
          rows[n - 1] = a;
        });
        sheets.push({ name: s.name, rows });
      });
    }
    return sheets;
  }

  function parseAirportParamsSheet(rows) {
    const out = [];
    if (!rows || !rows.length) return { rows: out, deduped: [] };
    const hdr = (rows[0] || []).map(cellText);
    const ni = hdr.findIndex(h => /机场/.test(h) && !/特殊/.test(h));
    const nameCol = ni >= 0 ? ni : 0;
    for (let i = 1; i < rows.length; i++) {
      const name = aliasAirportName(cellText((rows[i] || [])[nameCol]));
      if (!name) continue;
      const rec = { name, raw: cellText((rows[i] || [])[nameCol]), row: i + 1, values: (rows[i] || []).slice() };
      out.push(rec);
    }
    return dedupeAirportTable(out);
  }

  function dedupeAirportTable(rows) {
    const list = (rows || []).map(r => {
      if (typeof r === 'string') return { name: aliasAirportName(r), raw: r };
      const name = aliasAirportName(r.name || r[0] || r.机场 || '');
      return Object.assign({}, r, { name, key: name });
    }).filter(r => r.name);
    const seen = Object.create(null);
    const kept = [], dropped = [];
    list.forEach(r => {
      if (seen[r.name]) dropped.push(Object.assign({}, r, { duplicateOf: seen[r.name].row || seen[r.name].name }));
      else { seen[r.name] = r; kept.push(r); }
    });
    return { rows: kept, deduped: dropped };
  }

  function parseWorkbook(sheets, opt) {
    opt = opt || {};
    const allDuties = [], allItems = [], allSkipped = [];
    let knownRoutes = Object.assign({}, DEFAULT_KNOWN_ROUTES, opt.knownRoutes || {});
    const airportParams = [];
    let airportDeduped = [];
    (sheets || []).forEach(s => {
      const name = s.name || s.sheet || '';
      const rows = s.rows || [];
      if (/机场属性|住宿/.test(name) && !isSeasonPlanGrid(rows)) {
        const ap = parseAirportParamsSheet(rows);
        ap.rows.forEach(r => airportParams.push(Object.assign({ sheet: name }, r)));
        airportDeduped = airportDeduped.concat(ap.deduped.map(d => Object.assign({ sheet: name }, d)));
        return;
      }
      if (!isSeasonPlanGrid(rows)) return;
      const r = parseSeasonGrid(rows, Object.assign({}, opt, { sheet: name, knownRoutes }));
      knownRoutes = Object.assign({}, knownRoutes, r.knownRoutes || {});
      (r.duties || []).forEach(d => allDuties.push(d));
      (r.items || []).forEach(it => allItems.push(it));
      (r.skipped || []).forEach(sk => allSkipped.push(sk));
    });
    const report = summarize(allItems);
    return { duties: allDuties, report, items: allItems, skipped: allSkipped, knownRoutes, airportParams, airportDeduped };
  }

  function groupDutiesIntoRings(duties) {
    const out = [];
    let i = 0;
    const arr = duties || [];
    while (i < arr.length) {
      const d = arr[i];
      const len = d.ringLength || 0;
      if (len > 1) {
        const grp = [d];
        i++;
        while (i < arr.length && grp.length < len) {
          if (arr[i].ringLength > 1) break;
          grp.push(arr[i]); i++;
        }
        out.push(grp);
      } else {
        out.push([d]); i++;
      }
    }
    return out;
  }

  function dutiesToPairings(duties, opt) {
    opt = opt || {};
    const DAY = opt.DAY || 1440;
    const groups = groupDutiesIntoRings(duties);
    return groups.map((g, i) => {
      const labels = [];
      const remarks = [];
      const legs = [];
      let minDay = Infinity, maxDay = 0;
      let doubted = false;
      const doubtNotes = [];
      g.forEach(d => {
        if (d.doubt || d.status === 'doubt' || d.status === '存疑') {
          doubted = true;
          if (d.note) doubtNotes.push(d.note);
        }
        (d.labels || []).forEach(l => { if (labels.indexOf(l) < 0) labels.push(l); });
        (d.remarks || []).forEach(l => { if (remarks.indexOf(l) < 0) remarks.push(l); });
        if (d.kind === 'rest' || d.rest) {
          const day = d.day || (maxDay ? maxDay + 1 : 1);
          minDay = Math.min(minDay, day); maxDay = Math.max(maxDay, day);
          return;
        }
        (d.legs || []).forEach(l => {
          const day = l.d || d.day || 1;
          minDay = Math.min(minDay, day); maxDay = Math.max(maxDay, day);
          const depOfDay = (l.dep != null ? ((l.dep % DAY) + DAY) % DAY : 0);
          const span = (l.arr != null && l.dep != null) ? (l.arr - l.dep) : 0;
          const dep = (day - 1) * DAY + depOfDay;
          legs.push(Object.assign({}, l, { d: day, dep, arr: dep + span, fltOrig: l.fltOrig, fltNew: l.fltNew }));
        });
      });
      if (!Number.isFinite(minDay)) minDay = 1;
      if (maxDay < minDay) maxDay = minDay;
      const start = opt.start != null ? opt.start : minDay;
      const rel = legs.map(l => Object.assign({}, l, { d: l.d - minDay + 1, dep: l.dep - (minDay - 1) * DAY + (start - 1) * DAY, arr: l.arr - (minDay - 1) * DAY + (start - 1) * DAY }));
      const id = (g[0] && g[0].id) || ('SP' + String(i + 1).padStart(3, '0'));
      return {
        id,
        start,
        ndays: maxDay - minDay + 1,
        ac: 'A320',
        legs: rel,
        crew: { C: null, F: null, T: null },
        labels, remarks,
        doubt: doubted,
        status: doubted ? 'doubt' : undefined,
        doubtNote: doubtNotes.join('；'),
        meta: { sheet: g[0] && g[0].sheet, rows: g.map(d => d.row), labels, remarks, source: 'season-plan', doubt: doubted, doubtNote: doubtNotes.join('；') },
        imported: true,
        source: 'season-plan'
      };
    }).filter(p => p.legs.length || (p.labels && p.labels.length));
  }

  function dutiesToTimetableRecords(duties) {
    const recs = [];
    (duties || []).forEach(d => {
      if (d.kind === 'rest' || d.rest) return;
      const byFlt = Object.create(null);
      (d.legs || []).forEach(l => {
        const f = String(l.flt || '').replace(/^[A-Z]{2}/, '');
        if (!f) return;
        if (!byFlt[f]) byFlt[f] = { flt: f, depMin: l.dep, arrMin: l.arr, from: l.from, to: l.to, dow: d.dow, sheet: d.sheet, row: d.row };
        else {
          if (l.dep < byFlt[f].depMin) { byFlt[f].depMin = l.dep; byFlt[f].from = l.from; }
          if (l.arr > byFlt[f].arrMin) { byFlt[f].arrMin = l.arr; byFlt[f].to = l.to; }
        }
      });
      Object.keys(byFlt).forEach(k => recs.push(byFlt[k]));
    });
    return recs;
  }

  return {
    ABBR, KNOWN_ROUTES, DEFAULT_KNOWN_ROUTES, AIRPORT_ALIASES, tableALimitMin, parseRoute, parseFlights, normalizeFlights, dowValid, fmtH, parseHM, durationMin,
    parseSeasonPlan, forceMergeDuties, checkDuty, reportText, summarize, flightMin, continuity, knownRouteMismatch,
    learnKnownRoutes, cleanAirportName, aliasAirportName, parseOvernightLabel, detectHeader, isSeasonPlanGrid,
    parseSeasonGrid, isSeasonWorkbook, sheetsFromExcelJS, parseWorkbook, parseAirportParamsSheet, dedupeAirportTable,
    groupDutiesIntoRings, dutiesToPairings, dutiesToTimetableRecords
  };
});
