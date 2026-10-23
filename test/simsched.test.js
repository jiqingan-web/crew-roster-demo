// 模拟机编排：连续块、约5%、非执勤期、与飞行冲突、12h软缓冲
const C = require('../js/core.js');
let fail = 0;
const chk = (n, ok, info) => { console.log('SIM ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };

const st = C.generateLiteSample(20261101);
C.autoFill(st, { attempts: 1 });
const ix = C.buildIndex(st);
const active = st.pilots.filter(p => !(p.health && p.health.noFly) && (ix.hours[p.id] || 0) > 0.5);
const withSim = active.filter(p => ((st.sim || {})[p.id] || []).length);
const rate = withSim.length / active.length;
chk('density ~5%', rate >= 0.02 && rate <= 0.12, (100 * rate).toFixed(1) + '% ' + withSim.length + '/' + active.length);
chk('has st.sim', !!st.sim && typeof st.sim === 'object');

let lenOk = true, consOk = true;
withSim.forEach(p => {
  const ds = st.sim[p.id].slice().sort((a, b) => a - b);
  if (ds.length < 2 || ds.length > 4) lenOk = false;
  for (let i = 1; i < ds.length; i++) if (ds[i] !== ds[i - 1] + 1) consOk = false;
});
chk('block length 2-4', lenOk);
chk('consecutive days', consOk);

// personCheck blocks flying on sim day (synthetic same-day pairing)
let blocked = 0, checked = 0;
for (const p of withSim.slice(0, 5)) {
  const d0 = st.sim[p.id][0];
  const dep = (d0 - 1) * C.DAY + 10 * 60, arr = dep + 90;
  const ghost = { id: 'SIMCHK', ndays: 1, start: d0, ac: 'A320', crew: { C: null, F: null, T: null },
    legs: [{ d: 1, flt: 'EU9', from: 'ZUTF', to: 'ZPPP', dep, arr, dh: false }] };
  const [ok, rs] = C.personCheck(p, ghost, st, ix, { ignorePrefs: true, skipFtl: true, slot: 'T' });
  checked++;
  if (!ok && rs.some(r => r.includes('模拟机'))) blocked++;
}
chk('personCheck blocks sim', checked > 0 && blocked === checked, 'checked=' + checked + ' blocked=' + blocked);

// dutyDayFlags: sim-only day is not duty
let leak = 0;
withSim.forEach(p => {
  const flags = C.dutyDayFlags(p, st, ix);
  st.sim[p.id].forEach(d => {
    const flew = (ix.sched[p.id] || []).some(pr => C.opDays(pr).includes(d));
    const sb = ((st.standby || {})[p.id] || []).includes(d);
    if (flags[d] && !flew && !sb) leak++;
  });
});
chk('sim ≠ FDP duty day', leak === 0, leak);

// soft 12h: majority of blocks should satisfy soft gap (placement prefers soft)
let softN = 0;
withSim.forEach(p => {
  const ds = st.sim[p.id].slice().sort((a, b) => a - b);
  if (C.simSoftGapOK(p, ds[0], ds[ds.length - 1], st, ix)) softN++;
});
chk('soft 12h preferred', softN >= Math.ceil(withSim.length * 0.5), softN + '/' + withSim.length);

// training still present and distinct from sim
const trN = active.filter(p => ((st.training || {})[p.id] || []).length).length;
chk('training still assigned', trN > active.length * 0.5, trN + '/' + active.length);
let overlap = 0;
active.forEach(p => {
  const S = new Set(st.sim[p.id] || []);
  ((st.training || {})[p.id] || []).forEach(d => { if (S.has(d)) overlap++; });
});
chk('sim ∩ training empty', overlap === 0, overlap);

// personalDayKind
if (withSim.length) {
  const p = withSim[0];
  chk('personalDayKind 模拟机', C.personalDayKind(st, p, st.sim[p.id][0], ix) === '模拟机');
}

console.log(fail ? 'SIM SCHED FAIL ' + fail : 'SIM SCHED ALL OK');
process.exitCode = fail ? 1 : 0;
