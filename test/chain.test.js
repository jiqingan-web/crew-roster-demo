// 断言 UI 实际渲染的数据（lite+full 生成器，经 autoFill 后）航段链连续、日起止基地、任务回基地、单去双回
const C = require('../js/core.js');
const isB = c => c === 'ZUTF' || c === 'ZUUU';
let bad = 0;
function check(tag, st) {
  for (const p of st.pairings) {
    const L = p.legs.slice().sort((a, b) => a.dep - b.dep);
    if (!isB(L[0].from)) { bad++; console.log(tag, p.id, 'start not base', L[0].from); }
    if (!isB(L[L.length - 1].to)) { bad++; console.log(tag, p.id, 'end not base'); }
    for (let i = 1; i < L.length; i++) {
      if (L[i].from !== L[i - 1].to && !(L[i].d !== L[i - 1].d && isB(L[i].from) && isB(L[i - 1].to))) { bad++; console.log(tag, p.id, 'chain break', L[i - 1].to, L[i].from); }
      if (L[i].d !== L[i - 1].d && isB(L[i - 1].to) !== isB(L[i].from)) { bad++; console.log(tag, p.id, 'day boundary'); }
    }
    const days = [...new Set(L.map(l => l.d))];
    for (const d of days) {
      const dl = L.filter(l => l.d === d);
      if (!isB(dl[0].from) && !(p.layover && L.find(l => l.d === d - 1 && l.to === dl[0].from))) { bad++; console.log(tag, p.id, 'day start', d); }
      const n0 = +dl[0].flt.slice(2), nl = +dl[dl.length - 1].flt.slice(2);
      if (isB(dl[0].from) && n0 % 2 !== 1) { bad++; console.log(tag, p.id, 'outbound not odd', dl[0].flt); }
      if (isB(dl[dl.length - 1].to) && nl % 2 !== 0) { bad++; console.log(tag, p.id, 'return not even', dl[dl.length - 1].flt); }
    }
  }
  console.log(tag, 'pairings', st.pairings.length, 'layover', st.pairings.filter(p => p.layover).length);
}
const lite = C.generateLiteSample(20261101); C.autoFill(lite); check('lite', lite);
const full = C.generateSample(20261101); check('full', full);
if (lite.sampleSchema < 11 || full.sampleSchema < 11) { bad++; console.log('schema not bumped'); }
console.log(bad ? 'FAIL ' + bad : 'chain OK'); process.exit(bad ? 1 : 0);
