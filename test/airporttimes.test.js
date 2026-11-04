// 机场基础表（settings.airportTimes）驱动报到与休息期：node test/airporttimes.test.js
const C = require('../js/core.js');
let fail = 0; const chk = (n, ok, info) => { console.log('AT ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
const st = C.generateLiteSample(20261101); const p = st.pilots.find(x => x.rank === 'TC' && !x.reserve);
st.pilots = [p]; p.leave = []; p.prefs = []; st.standby = null; st.training = null; st.sim = null; st.control = null;
const mk = (id, from, to, dep, arr) => ({ id, start: Math.floor(dep / 1440) + 1, ndays: 1, ac: 'A320', crew: { C: p.id, F: null, T: null }, legs: [{ flt: 'EU1', from, to: 'ZPPP', dep, arr: dep + 90, ac: 'A320', d: 1, reg: 'R' }, { flt: 'EU2', from: 'ZPPP', to, dep: dep + 140, arr, ac: 'A320', d: 1, reg: 'R' }] });
const rest = (from, gapMin) => { st.pairings = [mk('A', from, from, 600, 1200), mk('B', from, from, 1200 + gapMin, 1200 + gapMin + 300)];
  return C.validate(st).some(v => v.type === '休息不足'); };
st.settings.airportTimes = { ZUUU: { report: 105, preCar: 25, leave: 15, postCar: 25 }, ZUTF: { report: 105, preCar: 0, leave: 15, postCar: 0 } };
chk('双流：12h50 足够', !rest('ZUUU', 770)); chk('双流：12h40 不足', rest('ZUUU', 760));
chk('天府：12h00 足够', !rest('ZUTF', 720)); chk('天府：11h50 不足', rest('ZUTF', 710));
delete st.settings.airportTimes; chk('无表时天府按默认 40/25：12h00 不足', rest('ZUTF', 720));
console.log(fail ? 'AT FAIL ' + fail : 'AT ALL OK'); process.exit(fail ? 1 : 0);
