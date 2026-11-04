// 月飞行值勤期 210h 按自然月分桶（跨月网格不得整段求和）：node test/monthfdp.test.js
const C = require('../js/core.js');
let fail = 0; const chk = (n, ok, info) => { console.log('MFDP ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
function run(days, start) {
  C.setPeriod({ days, start });
  const st = C.generateLiteSample(20261101); const p = st.pilots.find(x => x.rank === 'TC' && !x.reserve);
  st.pilots = [p]; p.leave = []; p.prefs = []; st.standby = null; st.training = null; st.sim = null; st.control = null;
  st.pairings = [];
  for (let d = 1; d <= days; d += 2) { const b = (d - 1) * 1440;
    st.pairings.push({ id: 'M' + d, start: d, ndays: 1, ac: 'A320', crew: { C: p.id, F: null, T: null },
      legs: [{ flt: 'EU1', from: 'ZUUU', to: 'ZPPP', dep: b + 360, arr: b + 600, ac: 'A320', d: 1, reg: 'R' }, { flt: 'EU2', from: 'ZPPP', to: 'ZUUU', dep: b + 660, arr: b + 900, ac: 'A320', d: 1, reg: 'R' }] }); }
  return C.validate(st).filter(v => v.type === '月值勤超限');
}
try {
  const two = run(60, { m: 9, d: 1 });
  chk('60 日跨两月：各月均 <210h → 不报月值勤超限', two.length === 0, two.slice(0, 2).map(v => v.msg).join(' | '));
  const one = run(30, { m: 11, d: 1 });
  chk('30 日单月：同样排法不报', one.length === 0, one.length);
} finally { C.setPeriod({ days: 30, start: { m: 11, d: 1 } }); }
console.log(fail ? 'MFDP FAIL ' + fail : 'MFDP ALL OK'); process.exit(fail ? 1 : 0);
