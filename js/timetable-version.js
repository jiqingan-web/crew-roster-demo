// 时刻表版本管理（C-03）：版本字段、同版本内时刻冲突须人工选择、与上一版差异（≥45 分钟标红）、排班结果记录版本号。
// 浏览器 window.TimetableVersion，Node require()
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TimetableVersion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RED_MIN = 45;

  function normalizeNo(s) {
    if (s == null || s === '') return '';
    let t = String(s).trim().toUpperCase();
    t = t.replace(/[（(]摆渡[)）]|摆渡/g, '').replace(/[（）()]/g, '').trim();
    t = t.replace(/^[A-Z]{2}(?=\d)/, '');
    return t;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function parseHM(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (v > 0 && v < 3) return Math.round(v * 24 * 60) % 1440;
      if (Number.isInteger(v) && v >= 0 && v <= 2359) {
        const h = Math.floor(v / 100), m = v % 100;
        if (h <= 47 && m < 60) return (h * 60 + m) % 1440;
      }
      if (v >= 0 && v < 48 * 60) return Math.round(v) % 1440;
    }
    const s = String(v).trim().replace(/：/g, ':');
    let m = s.match(/^(\d{1,2}):(\d{2})(?:\s*\+\s*(\d))?$/);
    if (m) return ((+(m[3] || 0)) * 1440 + (+m[1]) * 60 + (+m[2]));
    m = s.match(/^(\d{3,4})$/);
    if (m) {
      const n = +m[1], h = Math.floor(n / 100), mi = n % 100;
      if (h <= 47 && mi < 60) return h * 60 + mi;
    }
    return null;
  }

  function fmtHM(min) {
    if (min == null || !Number.isFinite(+min)) return '';
    let m = Math.round(+min);
    const plus = Math.floor(m / 1440);
    m = ((m % 1440) + 1440) % 1440;
    const s = pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
    return plus ? s + '+' + plus : s;
  }

  function timeKey(rec) {
    const dep = rec.depMin != null ? rec.depMin : parseHM(rec.dep);
    const arr = rec.arrMin != null ? rec.arrMin : parseHM(rec.arr);
    return [fmtHM(dep), fmtHM(arr), rec.from || '', rec.to || ''].join('|');
  }

  function normRec(raw, i) {
    raw = raw || {};
    const flt = normalizeNo(raw.flt || raw.flight || raw.航班 || raw.航班号);
    const depMin = raw.depMin != null ? +raw.depMin : parseHM(raw.dep || raw.std || raw.起飞);
    const arrMin = raw.arrMin != null ? +raw.arrMin : parseHM(raw.arr || raw.sta || raw.落地);
    return {
      flt,
      depMin,
      arrMin,
      dep: raw.dep != null ? raw.dep : fmtHM(depMin),
      arr: raw.arr != null ? raw.arr : fmtHM(arrMin),
      from: raw.from || raw.origin || '',
      to: raw.to || raw.dest || '',
      dow: raw.dow != null ? String(raw.dow) : '',
      sourceRow: raw.sourceRow != null ? raw.sourceRow : (raw.row != null ? raw.row : i + 1),
      sourceSheet: raw.sheet || raw.sourceSheet || '',
      pendingConflict: !!raw.pendingConflict
    };
  }

  function nowStamp(d) {
    d = d || new Date();
    const z = -d.getTimezoneOffset();
    const sign = z >= 0 ? '+' : '-';
    const off = pad2(Math.floor(Math.abs(z) / 60)) + ':' + pad2(Math.abs(z) % 60);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + sign + off;
  }

  function makeMeta(opt) {
    opt = opt || {};
    return {
      版本号: String(opt.版本号 || opt.version || opt.id || ''),
      生效日期: opt.生效日期 || opt.effectiveDate || '',
      来源文件名: opt.来源文件名 || opt.sourceFile || opt.filename || '',
      导入时间: opt.导入时间 || opt.importedAt || nowStamp()
    };
  }

  function sameTime(a, b) {
    if (!a || !b) return false;
    return fmtHM(a.depMin) === fmtHM(b.depMin) && fmtHM(a.arrMin) === fmtHM(b.arrMin);
  }

  function detectConflicts(records) {
    const recs = (records || []).map(normRec).filter(r => r.flt);
    const byFlt = Object.create(null);
    recs.forEach(r => { (byFlt[r.flt] = byFlt[r.flt] || []).push(r); });
    const conflicts = [];
    Object.keys(byFlt).forEach(flt => {
      const variants = [];
      byFlt[flt].forEach(r => {
        const hit = variants.find(v => sameTime(v, r));
        if (hit) { hit.rows.push(r.sourceRow); hit.copies++; }
        else variants.push(Object.assign({}, r, { rows: [r.sourceRow], copies: 1 }));
      });
      if (variants.length > 1) {
        conflicts.push({
          flt,
          times: variants.map(v => ({
            dep: fmtHM(v.depMin),
            arr: fmtHM(v.arrMin),
            from: v.from,
            to: v.to,
            dow: v.dow,
            key: timeKey(v),
            rows: v.rows,
            rec: v
          })),
          message: '航班 ' + flt + ' 在同一版本内有 ' + variants.length + ' 套时刻，须人工选择'
        });
      }
    });
    return conflicts;
  }

  function pickChosen(conflicts, choices) {
    choices = choices || {};
    const unresolved = [];
    const chosen = Object.create(null);
    conflicts.forEach(c => {
      const sel = choices[c.flt];
      const hit = c.times.find(t => t.key === sel || t.dep === sel || (sel && sel.dep === t.dep && (sel.arr == null || sel.arr === t.arr)));
      if (!hit) unresolved.push(c);
      else chosen[c.flt] = hit;
    });
    return { chosen, unresolved };
  }

  function recordsToFlights(records, choices) {
    const recs = (records || []).map(normRec).filter(r => r.flt);
    const conflicts = detectConflicts(recs);
    const { chosen, unresolved } = pickChosen(conflicts, choices);
    const byFlt = Object.create(null);
    recs.forEach(r => {
      const conf = conflicts.find(c => c.flt === r.flt);
      if (conf) {
        const ch = chosen[r.flt];
        if (!ch) return;
        if (!sameTime(ch.rec, r) && timeKey(ch) !== timeKey(r)) return;
      }
      if (!byFlt[r.flt]) byFlt[r.flt] = r;
    });
    return { flights: byFlt, conflicts, unresolved, complete: unresolved.length === 0 };
  }

  function flightsEvenIfPending(built) {
    const out = Object.assign({}, built.flights);
    built.unresolved.forEach(c => {
      out[c.flt] = Object.assign({}, c.times[0].rec, { pendingConflict: true });
    });
    return out;
  }

  function importVersion(records, meta, previous, opt) {
    opt = opt || {};
    const m = makeMeta(meta);
    const built = recordsToFlights(records, opt.choices);
    const version = Object.assign({}, m, {
      flights: built.complete ? built.flights : {},
      pending: !built.complete
    });
    const preview = Object.assign({}, version, { flights: flightsEvenIfPending(built) });
    const diff = previous ? diffVersions(previous, preview, opt.pairings) : [];
    return {
      version,
      meta: m,
      conflicts: built.conflicts,
      unresolved: built.unresolved,
      complete: built.complete,
      diff,
      flights: built.flights
    };
  }

  function flightList(ver) {
    if (!ver) return [];
    if (Array.isArray(ver.flights)) return ver.flights.map(normRec);
    const o = ver.flights || {};
    return Object.keys(o).map(k => normRec(Object.assign({ flt: k }, o[k])));
  }

  function wrapDelta(d) {
    if (d == null || !Number.isFinite(+d)) return null;
    d = +d;
    if (d > 720) d -= 1440;
    if (d < -720) d += 1440;
    return d;
  }
  function endDelta(oldMin, newMin) {
    if (oldMin == null || newMin == null || !Number.isFinite(+oldMin) || !Number.isFinite(+newMin)) return null;
    return wrapDelta(+newMin - +oldMin);
  }
  // C-03 P2：起飞、落地都比；展示与标红取绝对值更大的一端（任一端 ≥45 分钟即标红）
  function deltaMin(oldRec, newRec) {
    if (!oldRec || !newRec) return null;
    const dDep = endDelta(oldRec.depMin, newRec.depMin);
    const dArr = endDelta(oldRec.arrMin, newRec.arrMin);
    if (dDep == null) return dArr;
    if (dArr == null) return dDep;
    return Math.abs(dArr) > Math.abs(dDep) ? dArr : dDep;
  }
  function bothDeltas(oldRec, newRec) {
    if (!oldRec || !newRec) return { dep: null, arr: null };
    return { dep: endDelta(oldRec.depMin, newRec.depMin), arr: endDelta(oldRec.arrMin, newRec.arrMin) };
  }

  function fmtDelta(d) {
    if (d == null) return '';
    const sign = d > 0 ? '+' : d < 0 ? '−' : '';
    const a = Math.abs(d);
    return sign + Math.floor(a / 60) + 'h' + pad2(a % 60);
  }

  function affectedTasks(flt, pairings) {
    const n = normalizeNo(flt);
    const ids = [];
    (pairings || []).forEach(pr => {
      const hit = (pr.legs || []).some(l => normalizeNo(l.flt) === n || normalizeNo(l.fltOrig) === n || normalizeNo(l.fltNew) === n);
      if (hit) ids.push(pr.id);
    });
    return ids;
  }

  function diffVersions(prev, next, pairings) {
    const a = Object.create(null), b = Object.create(null);
    flightList(prev).forEach(r => { if (r.flt) a[r.flt] = r; });
    flightList(next).forEach(r => { if (r.flt) b[r.flt] = r; });
    const flts = unique(Object.keys(a).concat(Object.keys(b)));
    const rows = [];
    flts.forEach(flt => {
      const oldR = a[flt], newR = b[flt];
      if (oldR && newR && sameTime(oldR, newR)) return;
      const ends = oldR && newR ? bothDeltas(oldR, newR) : { dep: null, arr: null };
      const d = oldR && newR ? deltaMin(oldR, newR) : null;
      const kind = !oldR ? '新增' : !newR ? '删除' : '变更';
      rows.push({
        航班: flt,
        flt,
        旧时刻: oldR ? (fmtHM(oldR.depMin) + (oldR.arrMin != null ? '–' + fmtHM(oldR.arrMin) : '')) : '',
        新时刻: newR ? (fmtHM(newR.depMin) + (newR.arrMin != null ? '–' + fmtHM(newR.arrMin) : '')) : '',
        差值: kind === '变更' ? fmtDelta(d) : kind,
        deltaMin: d,
        deltaDep: ends.dep,
        deltaArr: ends.arr,
        受影响的任务: affectedTasks(flt, pairings),
        red: kind === '变更' && ((ends.dep != null && Math.abs(ends.dep) >= RED_MIN) || (ends.arr != null && Math.abs(ends.arr) >= RED_MIN)),
        kind,
        pendingConflict: !!(newR && newR.pendingConflict)
      });
    });
    rows.sort((x, y) => (y.red - x.red) || String(x.flt).localeCompare(y.flt, 'zh'));
    return rows;
  }

  function unique(arr) {
    const s = [], seen = Object.create(null);
    arr.forEach(x => { if (x && !seen[x]) { seen[x] = 1; s.push(x); } });
    return s;
  }

  function stampRoster(roster, versionOrMeta) {
    roster = roster || {};
    const meta = versionOrMeta && (versionOrMeta.版本号 || versionOrMeta.version || versionOrMeta.meta)
      ? makeMeta(versionOrMeta.meta || versionOrMeta)
      : makeMeta(versionOrMeta);
    roster.timetableVersion = meta;
    roster.时刻版本号 = meta.版本号;
    return roster;
  }

  function getStamp(roster) {
    if (!roster) return null;
    if (roster.timetableVersion) return makeMeta(roster.timetableVersion);
    if (roster.时刻版本号) return makeMeta({ 版本号: roster.时刻版本号 });
    return null;
  }

  return {
    RED_MIN, normalizeNo, parseHM, fmtHM, nowStamp, makeMeta,
    detectConflicts, recordsToFlights, importVersion, diffVersions,
    stampRoster, getStamp, timeKey, flightList, endDelta, bothDeltas
  };
});
