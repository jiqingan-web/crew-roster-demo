// 模拟故障演示友好性：每次注入都有 >=2 合规处置方案，应用首选后无新增硬违规/空缺：node test/simfault.test.js
const C = require('../js/core.js');
let fail = 0; const chk = (n, ok, info) => { console.log('SIM ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
const hardN = s => s.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length;
for (const seed of [20261101, 7, 42]) {
  const st = C.generateLiteSample(seed); C.autoFill(st); C.leaveDemoHoles(st);
  const b = C.summarize(st);
  for (const date of [3, 10, 18]) {
    const t = Date.now(); const f = C.simFaultPick(st, date);
    chk(`${seed} d${date} fault found`, !!f, f ? `${f.pairing} +${f.delay}m ok=${f.okCount} ${Date.now() - t}ms` : '');
    if (!f) continue;
    const w = JSON.parse(JSON.stringify(st)); w.actuals[f.legKey] = { dep: 0, arr: 0 }; // placeholder replaced below
    const l = st.pairings.find(p => p.id === f.pairing).legs.find(x => C.legKey(x) === f.legKey);
    w.actuals[f.legKey] = { dep: l.dep + f.delay, arr: l.arr + f.delay, kind: 'est' };
    const o = C.fdpOptions(w, f.pairing); const good = o.solutions.filter(z => !z.manual && !z.unresolved && !z.fdpAfter && z.hard <= b.hard && z.state);
    chk(`${seed} d${date} >=2 legal options`, good.length >= 2, good.length);
    const top = good.find(z => z.recommended) || good[0]; const a = C.summarize(top.state);
    chk(`${seed} d${date} apply top → 0 new hard, no new holes`, hardN(a) === 0 && hardN(a) <= hardN(b) && (a.total - a.full) <= (b.total - b.full), `hard ${hardN(a)} holes ${a.total - a.full}`);
  }
  // 请假：演示用目标须有 >=2 名合规替补
  const ix = C.buildIndex(st); let okLeave = 0;
  for (const pr of st.pairings.slice(0, 40)) { if (!pr.crew.F) continue; const n = C.candidates(st, pr, 'F').filter(c => c.ok && c.p.id !== pr.crew.F).length; if (n >= 2) okLeave++; }
  chk(`${seed} leave targets with >=2 candidates`, okLeave >= 10, okLeave + '/40');
}
console.log(fail ? 'SIM FAIL ' + fail : 'SIM ALL OK'); process.exit(fail ? 1 : 0);
