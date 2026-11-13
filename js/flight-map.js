// 航班号映射表（C-04）：新号 → 换季计划原号。可配置，解析时自动对应并保留两个号。
// 浏览器 window.FlightMap，Node require()
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.FlightMap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 首批映射（修改单原文）。2239/2240 等配对新号拆成可分别查找的行，但仍属同一条配置。
  const FIRST_BATCH = [
    { newNo: '2426', oldNo: '2764', route: '苏-武-琼', auto: true },
    { newNo: '2425', oldNo: '2763', route: '琼-武-苏', auto: true },
    { newNo: '1904', oldNo: '2238', route: '郑-福', auto: true },
    { newNo: '2725', oldNo: '2269', route: '湘-府', auto: true },
    { newNo: '2727', oldNo: '2435', route: '湘-陕-奇', auto: true },
    { newNo: '2728', oldNo: '2436', route: '奇-陕-湘', auto: true },
    { newNo: '2726', oldNo: '2270', route: '阿-府-湘', auto: true },
    { newNo: '2239/2240', oldNo: '1955', oldNote: '246 版', route: '府-贡-府', auto: true },
    { newNo: '2035/2036', oldNo: '2835', route: '蓉-厦-蓉', auto: true },
    { newNo: '6661/6662', oldNo: '6669', route: '蓉-虹桥-蓉', auto: true }
  ];

  const PENDING_CONFIRM = [
    { newNo: '1845', oldNo: '', route: '', auto: false, status: '存疑', reason: '拆分方式和 1807/1846 不同，待确认，不要自动映射' },
    { newNo: '1808', oldNo: '', route: '', auto: false, status: '存疑', reason: '拆分方式和 1807/1846 不同，待确认，不要自动映射' }
  ];

  const MISSING_FROM_PLAN = [
    { newNo: '2715/2716', oldNo: '', route: '', auto: false, status: '存疑', reason: '填入表有、换季计划没有，等人工补录' },
    { newNo: '2821/2822', oldNo: '', route: '', auto: false, status: '存疑', reason: '填入表有、换季计划没有，等人工补录' },
    { newNo: '2793/2794', oldNo: '', route: '', auto: false, status: '存疑', reason: '填入表有、换季计划没有，等人工补录' }
  ];

  function splitNos(s) {
    return String(s || '').split(/[\/、,，\s]+/).map(normalizeNo).filter(Boolean);
  }

  function normalizeNo(s) {
    if (s == null || s === '') return '';
    let t = String(s).trim().toUpperCase();
    t = t.replace(/[（(]摆渡[)）]|摆渡/g, '').replace(/[（）()]/g, '').trim();
    t = t.replace(/^[A-Z]{2}(?=\d)/, '');
    t = t.replace(/^0+(\d)/, '$1');
    return t;
  }

  function newId(prefix, i) { return (prefix || 'm') + String(i + 1); }

  function normalizeRow(row, i) {
    row = row || {};
    const newNo = String(row.newNo != null ? row.newNo : (row.newNos || []).join('/') || '').trim();
    const nos = row.newNos && row.newNos.length ? row.newNos.map(normalizeNo).filter(Boolean) : splitNos(newNo);
    const auto = row.auto !== false && row.status !== '存疑';
    const status = row.status || (auto ? 'mapped' : '存疑');
    return {
      id: row.id || newId('m', i),
      newNo: newNo || nos.join('/'),
      newNos: nos,
      oldNo: normalizeNo(row.oldNo || row.origNo || ''),
      oldNote: row.oldNote || '',
      route: row.route || '',
      auto: !!auto,
      status,
      reason: row.reason || ''
    };
  }

  function defaultTable() {
    const rows = FIRST_BATCH.concat(PENDING_CONFIRM, MISSING_FROM_PLAN).map(normalizeRow);
    return { version: 1, rows };
  }

  function loadTable(src) {
    if (!src) return defaultTable();
    if (Array.isArray(src)) return { version: 1, rows: src.map(normalizeRow) };
    const rows = (src.rows || src.mappings || []).map(normalizeRow);
    if (!rows.length) return defaultTable();
    return { version: src.version || 1, rows };
  }

  function indexTable(table) {
    const t = loadTable(table);
    const byNew = Object.create(null);
    const byOld = Object.create(null);
    const pending = Object.create(null);
    t.rows.forEach(r => {
      const nos = (r.newNos && r.newNos.length) ? r.newNos : splitNos(r.newNo);
      nos.forEach(n => {
        if (!n) return;
        if (r.auto && r.oldNo) byNew[n] = r;
        else pending[n] = r;
      });
      if (r.auto && r.oldNo) {
        const olds = splitNos(r.oldNo);
        olds.forEach(o => { if (o) byOld[o] = r; });
      }
    });
    return { table: t, byNew, byOld, pending };
  }

  function lookup(no, table) {
    const n = normalizeNo(no);
    if (!n) return { status: 'none', no: '', newNo: '', oldNo: '', both: [], auto: false };
    const ix = indexTable(table);
    if (ix.pending[n]) {
      const r = ix.pending[n];
      return { status: '存疑', no: n, newNo: n, oldNo: r.oldNo || '', both: r.oldNo ? [n, r.oldNo] : [n], row: r, auto: false, reason: r.reason };
    }
    let r = ix.byNew[n];
    if (r) {
      const both = unique([n].concat(r.newNos || [], r.oldNo ? [r.oldNo] : []));
      return { status: 'mapped', no: n, newNo: n, oldNo: r.oldNo, both, row: r, auto: true, route: r.route, oldNote: r.oldNote };
    }
    r = ix.byOld[n];
    if (r) {
      const both = unique((r.newNos || []).concat([n]));
      return { status: 'mapped', no: n, newNo: (r.newNos || [])[0] || r.newNo, oldNo: n, both, row: r, auto: true, route: r.route, oldNote: r.oldNote, fromOld: true };
    }
    return { status: 'none', no: n, newNo: n, oldNo: '', both: [n], auto: false };
  }

  function unique(arr) {
    const s = [], seen = Object.create(null);
    arr.forEach(x => { const n = normalizeNo(x); if (n && !seen[n]) { seen[n] = 1; s.push(n); } });
    return s;
  }

  function applyToFlights(flights, table) {
    const out = [];
    (flights || []).forEach(f => {
      const hit = lookup(f, table);
      out.push(Object.assign({ flt: normalizeNo(f) }, hit));
    });
    return out;
  }

  function flagMissingFromPlan(fillInFlights, seasonPlanFlights, table) {
    const plan = Object.create(null);
    (seasonPlanFlights || []).forEach(f => {
      const n = normalizeNo(f);
      if (n) plan[n] = 1;
      const hit = lookup(n, table);
      (hit.both || []).forEach(x => { plan[x] = 1; });
    });
    const ix = indexTable(table);
    const flagged = [];
    const seen = Object.create(null);
    (fillInFlights || []).forEach(f => {
      const n = normalizeNo(f);
      if (!n || seen[n]) return;
      seen[n] = 1;
      const pend = ix.pending[n];
      const inPlan = !!plan[n] || (pend && pend.oldNo && plan[pend.oldNo]);
      if (pend && /换季计划没有|人工补录/.test(pend.reason || '')) {
        flagged.push({ flt: n, status: '存疑', reason: pend.reason, waitManual: true, inPlan: !!inPlan });
        return;
      }
      if (!inPlan) {
        flagged.push({ flt: n, status: '存疑', reason: '填入表有、换季计划没有，等人工补录', waitManual: true, inPlan: false });
      }
    });
    return flagged;
  }

  function upsertRow(table, row) {
    const t = loadTable(table);
    const r = normalizeRow(row, t.rows.length);
    const idx = t.rows.findIndex(x => x.id === r.id || (x.newNo === r.newNo && x.oldNo === r.oldNo));
    if (idx >= 0) t.rows[idx] = Object.assign({}, t.rows[idx], r, { id: t.rows[idx].id });
    else t.rows.push(r);
    return t;
  }

  function removeRow(table, idOrNo) {
    const t = loadTable(table);
    const key = String(idOrNo);
    t.rows = t.rows.filter(r => r.id !== key && r.newNo !== key && !(r.newNos || []).includes(normalizeNo(key)));
    return t;
  }

  const STORAGE_KEY = 'crewRoster.flightMap';

  function readStored(store) {
    try {
      const raw = store && store.getItem(STORAGE_KEY);
      if (!raw) return null;
      return loadTable(JSON.parse(raw));
    } catch (e) { return null; }
  }

  function writeStored(table, store) {
    if (!store || !store.setItem) return false;
    store.setItem(STORAGE_KEY, JSON.stringify(loadTable(table)));
    return true;
  }

  return {
    FIRST_BATCH, PENDING_CONFIRM, MISSING_FROM_PLAN, STORAGE_KEY,
    defaultTable, loadTable, normalizeNo, splitNos, lookup, applyToFlights,
    flagMissingFromPlan, upsertRow, removeRow, indexTable, readStored, writeStored
  };
});
