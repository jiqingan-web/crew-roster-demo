// 提前占位：写入 sim+simHold，personCheck 禁飞，assignSimulator / autofill 不覆盖
const C = require('../js/core.js');
let fail = 0;
const chk = (n, ok, info) => { console.log('HOLD ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };

const st = C.generateLiteSample(20261101);
// clear crews so reserve days are free
st.pairings.forEach(p => { p.crew = { C: null, F: null, T: null }; });
st.standby = {}; st.training = {}; st.sim = {}; st.simHold = {};
const p = st.pilots.find(x => !(x.health && x.health.noFly));
chk('has pilot', !!p, p && p.id);

const r = C.reserveHold(st, p.id, [5, 6, 7]);
chk('reserve 3d ok', r.ok && r.asSimBlock, r);
chk('in sim', (st.sim[p.id] || []).join(',') === '5,6,7');
chk('in simHold', (st.simHold[p.id] || []).join(',') === '5,6,7');
chk('label 模拟机占位', r.label === '模拟机占位', r.label);

const ix = C.buildIndex(st);
const dep = (5 - 1) * C.DAY + 10 * 60, arr = dep + 90;
const ghost = { id: 'HOLDCHK', ndays: 1, start: 5, ac: 'A320', crew: { C: null, F: null, T: null },
  legs: [{ d: 1, flt: 'EU9', from: 'ZUTF', to: 'ZPPP', dep, arr, dh: false }] };
const [ok, rs] = C.personCheck(p, ghost, st, ix, { ignorePrefs: true, skipFtl: true, slot: 'T' });
chk('personCheck blocks', !ok && rs.some(x => x.includes('模拟机')), rs);

// assignSimulator must keep hold
C.assignSimulator(st);
chk('hold survives assignSimulator', (st.simHold[p.id] || []).join(',') === '5,6,7' && [5, 6, 7].every(d => (st.sim[p.id] || []).includes(d)), st.sim[p.id]);

// autofill clears crew but keeps hold
const st2 = C.generateLiteSample(20261102);
const q = st2.pilots.find(x => !(x.health && x.health.noFly));
st2.pairings.forEach(pr => { pr.crew = { C: null, F: null, T: null }; });
C.reserveHold(st2, q.id, [10, 11]);
C.autoFill(st2, { attempts: 1, seed: 42 });
chk('hold survives autofill', (st2.simHold[q.id] || []).includes(10) && (st2.simHold[q.id] || []).includes(11)
  && (st2.sim[q.id] || []).includes(10) && (st2.sim[q.id] || []).includes(11), (st2.sim[q.id] || []).join(','));
// no flying on hold days
const flew = (C.buildIndex(st2).sched[q.id] || []).some(pr => C.daysTouched(pr, st2).some(d => d === 10 || d === 11));
chk('no fly on hold after autofill', !flew);

chk('personalDayKind', C.personalDayKind(st, p, 5, ix) === '提前占位');

const r1 = C.reserveHold(st, p.id, [20]);
chk('1-day hold label', r1.ok && r1.label === '提前占位' && !r1.asSimBlock, r1);

console.log(fail ? 'PREHOLD FAIL ' + fail : 'PREHOLD ALL OK');
process.exitCode = fail ? 1 : 0;
