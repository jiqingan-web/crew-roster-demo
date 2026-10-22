const C = require('../js/core.js');
let fail = 0; const chk = (n, ok, info) => { console.log('AC ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
for (const seed of [20261101, 7]) {
  const st = C.generateLiteSample(seed);
  C.autoFill(st);
  // inject holes on easy pairings
  let n = 0;
  for (const pr of st.pairings) {
    if (n >= 4) break;
    if (pr.crew.C && pr.crew.F && pr.crew.T && pr.ndays <= 2 && !C.specialAirportsOf(pr, st).length) {
      pr.crew.F = null; n++;
    }
  }
  chk(seed + ' injected', n >= 3, n);
  const before = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
  const plan = C.autoCorrectPlan(st, { maxDepth: 4 });
  chk(seed + ' plan moves', plan.moves.length >= 1, plan.moves.length);
  C.applyAutoCorrect(st, plan);
  const after = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
  const hard = C.validate(st).filter(x => x.level === 'hard' && x.type !== '未满员').length;
  chk(seed + ' holes reduced to 0 or reported', after === 0 || !!plan.unsolvableReason, 'before ' + before + ' after ' + after + ' solv ' + plan.solvable);
  chk(seed + ' no new hard', hard === 0, hard);
}
console.log(fail ? 'AC FAIL ' + fail : 'AC ALL OK');
process.exitCode = fail ? 1 : 0;
