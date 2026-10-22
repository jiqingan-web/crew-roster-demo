// 航段/任务 Excel 导入（标准模板）：离线（file:// 亦可），浏览器 window.LegImport，Node require()
// 模板列：任务号 日期 航班号 起飞机场 到达机场 计划起飞 计划到达 是否置位(随) 机型 机号 备注 机长 副驾驶 副驾驶(2) 观察员
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.LegImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const HEAD = ['任务号', '日期', '航班号', '起飞机场', '到达机场', '计划起飞', '计划到达', '是否置位(随)', '机型', '机号', '备注', '机长', '副驾驶', '副驾驶(2)', '观察员'];
  const KEY = ['id', 'date', 'flt', 'from', 'to', 'dep', 'arr', 'dh', 'ac', 'reg', 'note', 'cC', 'cF', 'cF2', 'cT'];
  // 表头别名（兼容旧“空白航段”表与常见写法）
  const ALIAS = { id: ['任务号', '任务编号', '任务', 'pairing', 'pairingid'], date: ['日期', '航班日期', 'date'], flt: ['航班号', '航班', 'flight'],
    from: ['起飞机场', '起飞', '出发机场', 'from'], to: ['到达机场', '落地机场', '到达', '落地', 'to'], dep: ['计划起飞', '起飞时间', 'std', 'dep'], arr: ['计划到达', '落地时间', '到达时间', 'sta', 'arr'],
    dh: ['是否置位(随)', '是否置位', '置位(随)', '置位', '随', 'dh'], ac: ['机型', 'ac', 'type'], reg: ['机号', '注册号', 'reg'], note: ['备注', 'note'],
    cC: ['机长'], cF: ['副驾驶'], cF2: ['副驾驶(2)', '副驾驶2', '第二副驾驶'], cT: ['观察员'] };
  const BASES = ['ZUUU', 'ZUTF'];
  // 单字简称（与回测/甘特一致；蓉=双流 府=天府）
  const ABBR_FIXED = { 蓉: 'ZUUU', 府: 'ZUTF', 呼: 'ZBHH', 湘: 'ZGHA', 沈: 'ZYTX', 福: 'ZSFZ', 郑: 'ZHCC', 武: 'ZHHH', 贡: 'ZULS', 济: 'ZSJN', 琼: 'ZJHK', 犁: 'ZWYN', 春: 'ZYCC', 杭: 'ZSHC', 三: 'ZJSY', 筑: 'ZUGY', 皖: 'ZSOF', 石: 'ZBSJ', 包: 'ZBOW', 奇: 'ZWQT', 连: 'ZYTL', 盐: 'ZSYN', 阿: 'ZWAT', 宁: 'ZSNJ', 圳: 'ZGSZ', 津: 'ZBTJ', 北: 'ZGBH', 坤: 'ZWBK', 岩: 'ZSLD', 苏: 'ZSWX', 渝: 'ZUCK', 图: 'ZWTS', 威: 'ZSWH', 兰: 'ZLLL', 甬: 'ZSNB', 陕: 'ZLXY', 塔: 'ZWTC', 哈: 'ZYHB', 丽: 'ZPLJ', 浦: 'ZSPD', 昆: 'ZPPP', 峡: 'ZHYC', 泉: 'ZSQZ', 密: 'ZYMH', 海: 'ZBLA', 穗: 'ZGGG', 韶: 'ZGSG', 卫: 'ZLZW', 河: 'ZLXH', 厦: 'ZSAM', 田: 'ZWTN', 瓯: 'ZSWZ', 辽: 'ZBTL', 常: 'ZSCG', 池: 'ZSDJ', 汕: 'ZGOW', 迈: 'VTCC', 乌: 'ZWWW', 喀: 'ZWSH', 吉: 'ZYYJ', 曼: 'VTBS', 青: 'ZSQD', 珠: 'ZGSD', 沪: 'ZSSS', 吕: 'ZBLL', 忻: 'ZBXZ', 京: 'ZBAA', 舟: 'ZSZS', 版: 'ZPJH', 鸡: 'ZYJX', 昭: 'ZPZT', 抚: 'ZYFY', 吐: 'ZWTL', 莎: 'ZWSC' };
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();

  function airportTable(C, st) {
    const A = Object.assign({}, C.AIRPORTS, (st && st.airports) || {}); const ab = {}, byCode = {};
    Object.entries(ABBR_FIXED).forEach(([ch, code]) => { if (A[code] && !byCode[code]) { ab[ch] = code; byCode[code] = ch; } });
    Object.keys(A).sort().forEach(code => { if (byCode[code]) return; const n = String(A[code][0] || code).replace(/^成都/, '').replace(/[\s\d()（）]/g, '');
      const ch = [...n].find(x => !ab[x]); if (ch) { ab[ch] = code; byCode[code] = ch; } });
    const byName = {}; Object.entries(A).forEach(([code, v]) => { const n = String(v[0] || ''); if (!n) return; byName[norm(n)] = code; const s = n.replace(/^成都/, ''); if (s && !byName[norm(s)]) byName[norm(s)] = code;
      const s2 = n.replace(/(国际)?机场$/, ''); if (s2 && !byName[norm(s2)]) byName[norm(s2)] = code; });
    return { A, ab, byCode, byName, list: Object.keys(A).sort().map(code => ({ code, name: A[code][0], abbr: byCode[code] || '' })) };
  }
  function resolveAirport(v, T) { const s = String(v == null ? '' : v).trim(); if (!s) return null; const u = s.toUpperCase();
    if (/^[A-Z]{4}$/.test(u) && T.A[u]) return u; const m = s.match(/\b([A-Z]{4})\b/i); if (m && T.A[m[1].toUpperCase()]) return m[1].toUpperCase();
    if (s.length === 1 && T.ab[s]) return T.ab[s]; const n = norm(s.replace(/(国际)?机场$/, '')); return T.byName[norm(s)] || T.byName[n] || null; }
  // 单元格值 → 日期(UTC 毫秒) / 分钟
  function cellVal(v) { if (v && typeof v === 'object' && !(v instanceof Date)) { if ('result' in v) return v.result; if (v.richText) return v.richText.map(x => x.text).join(''); if ('text' in v) return v.text; } return v; }
  function parseDate(v) { v = cellVal(v); if (v == null || v === '') return null;
    if (v instanceof Date) return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
    if (typeof v === 'number') return v > 20000 && v < 80000 ? Date.UTC(1899, 11, 30) + Math.round(v) * 864e5 : null;
    const m = String(v).trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
  function parseTime(v) { v = cellVal(v); if (v == null || v === '') return null;
    if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes() + (v.getUTCSeconds() >= 30 ? 1 : 0);
    if (typeof v === 'number') { const f = v % 1 === 0 && v >= 100 ? null : v; if (f == null) { const h = Math.floor(v / 100), mi = v % 100; return h < 48 && mi < 60 ? h * 60 + mi : null; } return Math.round(f * 1440); }
    const s = String(v).trim(); const m = s.match(/^(\d{1,2})[:：]?(\d{2})(?::\d{2})?\s*(?:\(?\s*\+\s*(\d)\s*\)?)?$/); if (!m || +m[2] > 59 || +m[1] > 47) return null;
    return (+(m[3] || 0)) * 1440 + (+m[1]) * 60 + (+m[2]); }
  const isDH = v => /^(是|随|置位|y|yes|true|1|dh|√)$/i.test(String(cellVal(v) == null ? '' : cellVal(v)).trim());

  // 二维行（首行或前 5 行中的表头）→ 记录
  function rowsToRecords(rows) {
    let hi = -1, map = null;
    for (let i = 0; i < Math.min(rows.length, 6); i++) { const r = rows[i] || []; const m = {};
      r.forEach((h, j) => { const n = norm(cellVal(h)); if (!n) return; for (const k of KEY) if (m[k] == null && ALIAS[k].some(a => norm(a) === n)) { m[k] = j; break; } });
      if (m.id != null && m.flt != null && m.from != null && m.to != null) { hi = i; map = m; break; } }
    if (hi < 0) throw new Error('未找到表头：需包含 任务号 / 航班号 / 起飞机场 / 到达机场 等列（请使用“下载导入模板”）');
    const out = []; for (let i = hi + 1; i < rows.length; i++) { const r = rows[i] || []; const o = { row: i + 1 }; let any = false;
      for (const k of KEY) { const v = map[k] == null ? null : cellVal(r[map[k]]); o[k] = v; if (v != null && String(v).trim() !== '') any = true; }
      if (any) out.push(o); }
    return { records: out, cols: map };
  }
  function sheetRows(ws) { const rows = []; ws.eachRow({ includeEmpty: true }, (row, n) => { const a = []; row.eachCell({ includeEmpty: true }, (c, j) => { a[j - 1] = c.value; }); rows[n - 1] = a; }); return rows; }
  function pickSheet(wb) { let ws = wb.getWorksheet('航段'); if (ws) return ws; let hit = null;
    wb.eachSheet(s => { if (hit) return; try { rowsToRecords(sheetRows(s)); hit = s; } catch (e) { } }); return hit || wb.worksheets[0]; }
  async function readXlsx(ExcelJS, buf) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); const ws = pickSheet(wb); if (!ws) throw new Error('工作簿中没有工作表'); return { sheet: ws.name, rows: sheetRows(ws) }; }
  function parseCSV(t) { t = String(t).replace(/^\ufeff/, ''); const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
    if (f || row.length) { row.push(f); rows.push(row); } return rows; }

  // 记录 → 任务（含校验报告）。opt: { year, month, allowUnknown }
  function buildPairings(records, C, st, opt) {
    opt = opt || {}; const T = airportTable(C, st); const DAY = C.DAY || 1440, DAYS = C.DAYS || 30;
    const rep = { rows: records.length, badRows: [], unknownAirports: {}, overlaps: [], notReturn: [], broken: [], outOfMonth: [], crewUnknown: [], warnings: [] };
    const pm = {}; (st.pilots || []).forEach(p => { pm[p.id] = p.id; pm[norm(p.name)] = p.id; });
    const good = [];
    records.forEach(r => { const errs = []; const id = String(r.id == null ? '' : r.id).trim(); if (!id) errs.push('任务号为空');
      const date = parseDate(r.date); if (date == null) errs.push('日期无效：' + (r.date == null ? '空' : String(r.date)));
      const flt = String(r.flt == null ? '' : r.flt).trim(); if (!flt) errs.push('航班号为空');
      const from = resolveAirport(r.from, T), to = resolveAirport(r.to, T);
      [[r.from, from], [r.to, to]].forEach(([raw, c]) => { if (c) return; const s = String(raw == null ? '' : raw).trim(); if (!s) { errs.push('机场为空'); return; }
        const code = /^[A-Za-z]{4}$/.test(s) ? s.toUpperCase() : null; (rep.unknownAirports[s] = rep.unknownAirports[s] || []).push(r.row);
        if (!(opt.allowUnknown && code)) errs.push('未知机场：' + s); });
      const dep = parseTime(r.dep), arr0 = parseTime(r.arr); if (dep == null) errs.push('计划起飞时间无效：' + (r.dep == null ? '空' : String(r.dep))); if (arr0 == null) errs.push('计划到达时间无效：' + (r.arr == null ? '空' : String(r.arr)));
      if (errs.length) { rep.badRows.push({ row: r.row, id, msg: errs.join('；') }); return; }
      let arr = arr0; while (arr <= dep) arr += 1440;
      const crew = {}; [['C', r.cC], ['F', r.cF], ['T', r.cF2 || r.cT]].forEach(([s, v]) => { const k = String(v == null ? '' : v).trim(); if (!k) return; const pid = pm[k] || pm[norm(k)];
        if (pid) crew[s] = pid; else rep.crewUnknown.push({ row: r.row, id, slot: s, who: k }); });
      if (r.cF2 && r.cT && String(r.cF2).trim() && String(r.cT).trim()) rep.warnings.push(`第${r.row}行 副驾驶(2) 与 观察员 同时填写，仅取副驾驶(2)`);
      good.push({ row: r.row, id, date, flt: flt.toUpperCase(), from: from || String(r.from).trim().toUpperCase(), to: to || String(r.to).trim().toUpperCase(), dep, arr, dh: isDH(r.dh), ac: String(r.ac || 'A320').trim().toUpperCase() || 'A320', reg: String(r.reg || '').trim(), note: String(r.note || '').trim(), crew }); });
    if (!good.length) return { pairings: [], report: rep, unknownCodes: [] };
    // 排班月：opt 指定，否则取最早日期所在月；引擎固定 1..DAYS 日
    const d0 = new Date(Math.min(...good.map(g => g.date))); const Y = opt.year || d0.getUTCFullYear(), M = opt.month || (d0.getUTCMonth() + 1); const m0 = Date.UTC(Y, M - 1, 1);
    rep.month = { year: Y, month: M, days: DAYS };
    const badIds = new Set(rep.badRows.map(b => b.id).filter(Boolean)); const g = {};
    good.forEach(l => (g[l.id] = g[l.id] || []).push(l));
    const prs = []; const unknownCodes = new Set();
    Object.keys(g).forEach(id => { if (badIds.has(id)) { rep.warnings.push(`任务 ${id} 含错误行，整任务未导入`); return; }
      const L = g[id].map(l => { const di = Math.round((l.date - m0) / 864e5); return Object.assign({}, l, { di, adep: di * DAY + l.dep, aarr: di * DAY + l.arr }); }).sort((a, b) => a.adep - b.adep);
      const sIdx = Math.min(...L.map(l => l.di)), eIdx = Math.max(...L.map(l => l.di));
      if (sIdx < 0 || eIdx > DAYS - 1) { rep.outOfMonth.push({ id, from: sIdx + 1, to: eIdx + 1 }); return; }
      for (let i = 1; i < L.length; i++) { if (L[i].adep < L[i - 1].aarr) rep.overlaps.push({ id, row: L[i].row, msg: `${L[i - 1].flt} 到达 ${fmt(L[i - 1].aarr)} 晚于 ${L[i].flt} 起飞 ${fmt(L[i].adep)}` });
        if (L[i].from !== L[i - 1].to) rep.broken.push({ id, row: L[i].row, msg: `${L[i - 1].to} → ${L[i].from} 不衔接` }); }
      if (!BASES.includes(L[0].from) || !BASES.includes(L[L.length - 1].to)) rep.notReturn.push({ id, msg: `${L[0].from} … ${L[L.length - 1].to}（应自 蓉/府 出发并回到 蓉/府）` });
      L.forEach(l => [l.from, l.to].forEach(c => { if (!T.A[c]) unknownCodes.add(c); }));
      const legs = L.map(l => { const o = { d: l.di - sIdx + 1, flt: l.flt, from: l.from, to: l.to, dep: l.adep, arr: l.aarr, ac: l.ac === 'A321' ? 'A321' : 'A320', reg: l.reg }; if (l.dh) o.dh = true; if (l.note) o.note = l.note; return o; });
      const nd = eIdx - sIdx + 1; const crew = { C: null, F: null, T: null }; L.forEach(l => Object.assign(crew, l.crew));
      const lastOfDay = {}; legs.forEach(l => lastOfDay[l.d] = l);
      prs.push({ id, start: sIdx + 1, ndays: nd, ac: legs.some(l => l.ac === 'A321') ? 'A321' : 'A320', legs, crew, offAway: new Set(legs.map(l => l.d)).size < nd,
        layover: Object.values(lastOfDay).some(l => !BASES.includes(l.to) && l !== legs[legs.length - 1]) , imported: true }); });
    prs.sort((a, b) => a.legs[0].dep - b.legs[0].dep || (a.id < b.id ? -1 : 1));
    rep.pairings = prs.length; rep.legs = prs.reduce((s, p) => s + p.legs.length, 0); rep.dhLegs = prs.reduce((s, p) => s + p.legs.filter(l => l.dh).length, 0);
    return { pairings: prs, report: rep, unknownCodes: [...unknownCodes] };
    function fmt(m) { const d = Math.floor(m / DAY); const t = m - d * DAY; return `${d + 1}日${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
  }
  function parseRows(rows, C, st, opt) { const { records } = rowsToRecords(rows); return buildPairings(records, C, st, opt); }
  // 应用：mode 'replace' | 'merge'；返回新增数
  function apply(st, res, mode, C) {
    (res.unknownCodes || []).forEach(c => { st.airports = st.airports || {}; if (!st.airports[c] && !C.AIRPORTS[c]) st.airports[c] = [c + '(导入)', 30.6, 104.0]; });
    let add = res.pairings.map(p => JSON.parse(JSON.stringify(p)));
    if (mode === 'merge') { const ids = new Set(st.pairings.map(p => p.id)); add.forEach(p => { let id = p.id, k = 2; while (ids.has(id)) id = p.id + '-' + k++; ids.add(id); p.id = id; }); st.pairings = st.pairings.concat(add).sort((a, b) => a.legs[0].dep - b.legs[0].dep); }
    else { st.pairings = add; st.fills = []; st.training = null; }
    st.standby = null; st.sample = false; st.solHist = []; st.solIdx = null; return add.length;
  }
  function reportText(rep) { const L = []; L.push(`读取 ${rep.rows} 行 → 可导入任务 ${rep.pairings || 0} 个 / 航段 ${rep.legs || 0}（置位 ${rep.dhLegs || 0}）` + (rep.month ? `；排班月 ${rep.month.year}-${String(rep.month.month).padStart(2, '0')}（1–${rep.month.days} 日）` : ''));
    const ua = Object.keys(rep.unknownAirports); if (ua.length) L.push('未知机场：' + ua.join('、'));
    [['badRows', '错误行'], ['overlaps', '时间重叠'], ['broken', '航段不衔接'], ['notReturn', '未回蓉/府'], ['outOfMonth', '超出排班月(未导入)'], ['crewUnknown', '机组人员未匹配']].forEach(([k, n]) => { if (rep[k].length) L.push(`${n} ${rep[k].length}`); });
    return L.join('\n'); }

  // ---------- 模板 ----------
  const SAMPLE = [['PR901', '2026-11-03', 'EU2201', '蓉', '乌鲁木齐', '08:00', '12:20', '', 'A320', '', '示例：往返', '', '', '', ''],
    ['PR901', '2026-11-03', 'EU2202', 'ZWWW', 'ZUUU', '13:20', '17:30', '', 'A320', '', '', '', '', '', ''],
    ['PR902', '2026-11-05', 'EU6683', '天府', '湘', '21:00', '22:50', '', 'A320', '', '示例：外站过夜', '', '', '', ''],
    ['PR902', '2026-11-06', 'EU6684', 'ZGHA', 'ZUTF', '07:30', '09:20', '', 'A320', '', '', '', '', '', ''],
    ['PR903', '2026-11-08', 'EU2235', 'ZUUU', 'ZPLJ', '23:40', '01:05(+1)', '随', 'A320', '', '示例：置位(随)、跨午夜', '', '', '', ''],
    ['PR903', '2026-11-09', 'EU2236', '丽江', '蓉', '09:00', '10:25', '', 'A320', '', '', '', '', '', '']];
  function buildTemplate(ExcelJS, C, st, opt) {
    opt = opt || {}; const T = airportTable(C, st || {}); const wb = new ExcelJS.Workbook(); wb.creator = '机组智能排班助手'; wb.created = new Date(0);
    const hd = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2D4A' } }, opt2 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A6A86' } };
    const ws = wb.addWorksheet('航段', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = HEAD.map((h, i) => ({ header: h, key: KEY[i], width: [10, 12, 10, 12, 12, 10, 12, 12, 8, 10, 18, 12, 12, 12, 12][i] }));
    ws.getRow(1).eachCell((c, j) => { c.fill = j > 11 || j === 9 || j === 10 || j === 11 || j === 8 ? opt2 : hd; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center' }; });
    (opt.rows || []).forEach(r => ws.addRow(r));
    const n = Math.max(500, (opt.rows || []).length + 50);
    ws.dataValidations && ws.dataValidations.add && ws.dataValidations.add('H2:H' + n, { type: 'list', allowBlank: true, formulae: ['"是,随,"'] });
    ws.dataValidations && ws.dataValidations.add && ws.dataValidations.add('I2:I' + n, { type: 'list', allowBlank: true, formulae: ['"A320,A321,A319"'] });
    for (let i = 2; i <= Math.max(2, (opt.rows || []).length + 1); i++) ['B', 'F', 'G'].forEach(c => ws.getCell(c + i).numFmt = '@');
    const ex = wb.addWorksheet('说明');
    ex.columns = [{ width: 16 }, { width: 14 }, { width: 70 }];
    const add = (r, bold) => { const row = ex.addRow(r); if (bold) row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = hd; }); return row; };
    add(['航段导入模板（机组智能排班助手 · 轻量版）'], false).font = { bold: true, size: 14 };
    add(['每行一个航段；同一“任务号”的多行组成一个任务（机组任务/航段串），按日期+计划起飞自动排序。数据填在“航段”表，表头勿改。']);
    if (opt.sourceNote) add([opt.sourceNote]);
    add([]); add(['字段', '是否必填', '规则'], true);
    [['任务号', '必填', '同一机组连续执行的一组航段共用一个任务号（如 PR001、T001）。一个任务须自 蓉(双流 ZUUU) 或 府(天府 ZUTF) 出发并最终回到 蓉/府；中间可外站过夜，可有外站休息日。'],
      ['日期', '必填', '航段起飞当地日期：2026-11-03 / 2026/11/3 或 Excel 日期格式。排班月取文件中最早日期所在月份，引擎排 1–30 日，超出的任务会在报告中列出、不导入。'],
      ['航班号', '必填', '如 EU2201；去程一般为单号、回程双号（仅作展示，不强制）。'],
      ['起飞机场 / 到达机场', '必填', '三种写法均可：ICAO 四字码（ZUUU）、全称（成都双流 / 双流 / 乌鲁木齐）或单字简称（蓉、府、湘…，见“机场表”）。未知机场会在导入报告中列出。'],
      ['计划起飞 / 计划到达', '必填', '24 小时制 HH:MM（北京时间），也接受 Excel 时间格式。到达跨午夜写 01:05(+1) 或直接写 01:05（早于起飞自动视为次日）。'],
      ['是否置位(随)', '可选', '填“是”或“随”表示置位/随机（不计飞行时间、无需座位资格）；留空为执飞。'],
      ['机型 / 机号', '可选', '默认 A320；机号如 B-30XX，可留空。'],
      ['备注', '可选', '自由文本，随航段保存。'],
      ['机长 / 副驾驶 / 副驾驶(2) / 观察员', '可选（建议留空）', '预填机组：填员工号或化名（须与人员数据一致）。引擎每任务 3 个座位：机长、副驾驶、第三座（副驾驶(2) 或 观察员，二者填其一）。留空则由“一键自动填人”排班。']].forEach(r => add(r));
    add([]); add(['导入校验', '', '导入前显示报告：错误行（缺字段/日期或时间格式错）、未知机场、同一任务内时间重叠、航段不衔接、未自 蓉/府 出发或未回到 蓉/府、超出排班月、机组人员未匹配。确认后可“替换现有任务”或“合并到现有任务”，然后一键自动填人。'], false);
    add(['文件格式', '', '请使用 .xlsx（本模板）。旧版 .xls 请在 Excel / WPS 中“另存为 .xlsx”后导入；也兼容同表头的 CSV(UTF-8)。'], false);
    ex.eachRow(r => r.eachCell(c => { c.alignment = { wrapText: true, vertical: 'top' }; }));
    add([]); add(['示例航段（复制到“航段”表即可试导入；示例使用 2026-11 日期）'], false).font = { bold: true };
    const sh = ex.addRow(HEAD); sh.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = hd; });
    SAMPLE.forEach(r => ex.addRow(r));
    const ap = wb.addWorksheet('机场表', { views: [{ state: 'frozen', ySplit: 1 }] });
    ap.columns = [{ header: '四字码', width: 10 }, { header: '机场名称', width: 18 }, { header: '单字简称', width: 10 }, { header: '基地', width: 8 }, { header: '特殊机场', width: 10 }];
    ap.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = hd; });
    T.list.forEach(a => ap.addRow([a.code, a.name, a.abbr, BASES.includes(a.code) ? '基地' : '', C.isSpecial && C.isSpecial(a.code, st || {}) ? '是' : '']));
    return wb;
  }
  return { HEAD, KEY, BASES, ABBR_FIXED, airportTable, resolveAirport, parseDate, parseTime, rowsToRecords, sheetRows, readXlsx, parseCSV, buildPairings, parseRows, apply, reportText, buildTemplate, SAMPLE };
});
