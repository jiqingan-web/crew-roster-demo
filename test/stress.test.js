// 压力回测：深拷贝跑 4 行、不改 live（node test/stress.test.js）
const C = require('../js/core.js');
let fail = 0;
const chk = (n, ok, info) => { console.log('STRESS ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };

const live = C.generateLiteSample(20261029);
const snapCrew = JSON.stringify(live.pairings.map(p => p.crew));
const snapPilots = JSON.stringify(live.pilots.map(p => ({ id: p.id, leave: p.leave, auth: p.auth, prefs: p.prefs })));
const snapN = live.pairings.length;

const t0 = Date.now();
const rep = C.runStressBacktest(live, { seed: 20261029, tries: 1, minDiff: 0 });
const ms = Date.now() - t0;
console.log('STRESS total ms', ms);
console.table(rep.rows.map(r => ({
  label: r.label, full: r.full + '/' + r.total, hard: r.hard, unfilled: r.unfilled,
  hours: (+r.hoursMin).toFixed(1) + '-' + (+r.hoursMax).toFixed(1), ms: r.ms,
  note: r.leavePersonDays != null ? ('leavePD=' + r.leavePersonDays)
    : r.pairingsAdded != null ? ('+pair=' + r.pairingsAdded)
    : r.authHoldersAfter != null ? ('auth=' + r.authHoldersBefore + '→' + r.authHoldersAfter) : ''
})));

chk('4 rows', rep.rows.length === 4, rep.rows.length);
chk('labels', rep.rows.map(r => r.label).join('|') === '基线|多人同时请假|任务密度 +30%|特殊机场资质稀缺', rep.rows.map(r => r.label).join('|'));
chk('live pairings unchanged', live.pairings.length === snapN, live.pairings.length + ' vs ' + snapN);
chk('live crew unchanged', JSON.stringify(live.pairings.map(p => p.crew)) === snapCrew, '');
chk('live pilots leave/auth/prefs unchanged', JSON.stringify(live.pilots.map(p => ({ id: p.id, leave: p.leave, auth: p.auth, prefs: p.prefs }))) === snapPilots, '');
chk('density more pairings in row', (rep.rows.find(r => r.key === 'density') || {}).pairingsAfter > snapN, '');
chk('auth holders reduced', (() => { const a = rep.rows.find(r => r.key === 'auth'); return a && a.authHoldersAfter < a.authHoldersBefore; })(), '');
chk('leave person-days > 0', ((rep.rows.find(r => r.key === 'leave') || {}).leavePersonDays || 0) > 0, '');

console.log(fail ? 'STRESS FAIL ' + fail : 'STRESS ALL OK');
process.exitCode = fail ? 1 : 0;
