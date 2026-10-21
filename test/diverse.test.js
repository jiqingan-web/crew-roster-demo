// 一键自动填人：每次点击新种子 → 方案不同但合法（node test/diverse.test.js）
const C = require('../js/core.js');
let fail = 0; const chk = (n, ok, info) => { console.log('DIV ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
const st = C.generateLiteSample(20261101); const hist = []; const rows = [];
for (let click = 1; click <= 5; click++) {
  st.pairings.forEach(p => { delete p.demoHole; }); st.demoHolesApplied = false; st.demoHoles = [];
  const t = Date.now(); const info = C.autoFillDiverse(st, { seed: 1000003 * click + 17, prevCrews: hist.slice(-4), minDiff: 0.4 }); const ms = Date.now() - t;
  C.leaveDemoHoles(st); const s = C.summarize(st);
  const crews = st.pairings.map(p => Object.assign({}, p.crew)); hist.push(crews);
  const hard = s.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length, holes = s.total - s.full;
  rows.push({ click, seed: info.seed, ms, hard, holes, gini: +s.all.gini.toFixed(3), std: +s.all.std.toFixed(1), g34: +(s.rhythm.gap34 * 100).toFixed(0), min: +s.all.min.toFixed(1), max: +s.all.max.toFixed(1) });
  chk(`click${click} hard 0`, hard === 0, hard); chk(`click${click} holes 3-6`, holes >= 3 && holes <= 6, holes);
  chk(`click${click} gini<=0.12 & max<=100h & min>=8h`, s.all.gini <= 0.12 && s.all.max <= 100 && s.all.min >= 8, `${s.all.gini.toFixed(3)} ${s.all.min.toFixed(1)}-${s.all.max.toFixed(1)}`);
  chk(`click${click} rest3-4 >=35%`, s.rhythm.gap34 >= 0.35, (s.rhythm.gap34 * 100).toFixed(0) + '%');
}
let mn = 1; for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) mn = Math.min(mn, C.crewDiff(hist[i], hist[j]));
chk('pairwise crew diff >=40%', mn >= 0.4, (mn * 100).toFixed(1) + '%');
console.table(rows);
console.log(fail ? 'DIV FAIL ' + fail : 'DIV ALL OK'); process.exitCode = fail ? 1 : 0;
