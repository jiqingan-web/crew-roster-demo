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
      const prevDay = L.filter(l => l.d < d).pop(); // 外站驻点块：上一值勤日（可隔休息日）落地站
      if (!isB(dl[0].from) && !(p.layover && prevDay && prevDay.to === dl[0].from)) { bad++; console.log(tag, p.id, 'day start', d); }
      const n0 = +dl[0].flt.slice(2), nl = +dl[dl.length - 1].flt.slice(2);
      if (isB(dl[0].from) && n0 % 2 !== 1) { bad++; console.log(tag, p.id, 'outbound not odd', dl[0].flt); }
      if (isB(dl[dl.length - 1].to) && nl % 2 !== 0) { bad++; console.log(tag, p.id, 'return not even', dl[dl.length - 1].flt); }
    }
  }
  console.log(tag, 'pairings', st.pairings.length, 'layover', st.pairings.filter(p => p.layover).length);
}
const lite = C.generateLiteSample(20261101); C.autoFill(lite); check('lite', lite);
// (随)置位：存在、不计飞行小时、不要求座位资质
const dhP = lite.pairings.filter(p => p.legs.some(l => l.dh));
if (!dhP.length) { bad++; console.log('no deadhead legs'); }
for (const p of dhP) { const h = p.legs.reduce((s, l) => s + (l.dh ? 0 : l.arr - l.dep), 0) / 60; if (Math.abs(C.pairingHours(p) - h) > 1e-9) { bad++; console.log('dh counted in hours', p.id); } }
// 外站驻点长块：休息日不计值勤日（dayStatus=O），整块固定机组
const lp = lite.pairings.filter(p => p.offAway);
if (lp.length !== 1) { bad++; console.log('lite long outstation blocks', lp.length); }
const ix = C.buildIndex(lite), ds = C.dayStatus(lite, ix);
for (const p of lp) { const off = C.offAwayDays(p, lite); if (off.length < 3) { bad++; console.log('offAway days', off); }
  for (const id of Object.values(p.crew).filter(Boolean)) for (const d of off) if (ds[id][d] !== 'O') { bad++; console.log('offAway day not O', p.id, id, d, ds[id][d]); }
  if (C.daysTouched(p, lite).some(d => off.includes(d))) { bad++; console.log('off day counted as duty'); } }
// 带飞：长块 TL 坐副驾驶位、新机长执飞，且不判岗位级别不符
const pmL = {}; lite.pilots.forEach(p => pmL[p.id] = p);
for (const p of lp) { const cr = pmL[p.crew.C], fr = pmL[p.crew.F];
  if (!cr || !fr || !C.NEW_CAPT.includes(cr.rank) || !C.INSTR.includes(fr.rank)) { bad++; console.log('long block not new-capt + TL in FO seat', cr && cr.rank, fr && fr.rank); } }
const rv = C.validate(lite).filter(v => v.type === '岗位级别不符'); if (rv.length) { bad++; console.log('slot rank violations', rv.length); }
if (!C.slotRankOK('F', 'TL', '机长A') || C.slotRankOK('F', 'TL', 'J3')) { bad++; console.log('slotRankOK TL-in-FO rule wrong'); }
console.log('lite deadhead legs', lite.pairings.reduce((s, p) => s + p.legs.filter(l => l.dh).length, 0), 'long blocks', lp.length);
const full = C.generateSample(20261101); check('full', full);
if (lite.sampleSchema < 14 || full.sampleSchema < 13) { bad++; console.log('schema not bumped'); }
console.log(bad ? 'FAIL ' + bad : 'chain OK'); process.exit(bad ? 1 : 0);
