// 轻量版快速回归（单中队 ~100 人）：node test/lite.test.js（约 2–10 s）
const C = require('../js/core.js');
let fail = 0; const chk = (n, ok, info) => { console.log('LITE ' + n, ok ? 'OK' : 'FAIL', info || ''); if (!ok) fail++; };
const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
for (const seed of [20261101, 7, 42]) {
  const st = C.generateLiteSample(seed);
  const capt = st.pilots.filter(p => C.RANK_VAL[p.rank] >= 9 || C.NEW_CAPT.includes(p.rank) || C.INSTR.includes(p.rank) || p.rank === 'J3').length;
  chk(seed + ' size', st.lite && st.pilots.filter(p => !p.reserve).length === 101 && st.pilots.filter(p => p.reserve).length === 40 && st.pilots.filter(p => p.reserve).every(p => p.squad === '外中队候补·演示') && [...new Set(st.pilots.map(p => p.squad))][0] === '七中队·演示', st.pilots.length + ' pilots');
  { const own = st.pilots.filter(p => !p.reserve); chk(seed + ' mix', own.filter(p => C.INSTR.includes(p.rank)).length === 14 && own.filter(p => C.NEW_CAPT.includes(p.rank)).length === 7, ''); }
  chk(seed + ' demoFill', st.pairings.every(p => p.demoFill));
  const t = Date.now(); C.autoFill(st); C.leaveDemoHoles(st); const ms = Date.now() - t;
  chk(seed + ' speed<4s(node)', ms < 4000, ms + 'ms');
  const ix = C.buildIndex(st), ds = C.dayStatus(st, ix), v = C.validate(st);
  const holes = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
  chk(seed + ' holes 3-6', holes >= 3 && holes <= 6, holes);
  chk(seed + ' hard only unfilled', v.filter(x => x.level === 'hard' && x.type !== '未满员').length === 0);
  const duty = {}, hrs = {}; st.pilots.forEach(p => { let n = 0; for (let d = 1; d <= C.DAYS; d++) if (ds[p.id][d] === 'D') n++; duty[p.id] = n; hrs[p.id] = ix.hours[p.id]; });
  chk(seed + ' nobody idle', st.pilots.every(p => hrs[p.id] >= 8), 'min ' + Math.min(...Object.values(hrs)).toFixed(1));
  chk(seed + ' max<=100h', Math.max(...Object.values(hrs)) <= 100);
  const byRank = {}; st.pilots.forEach(p => (byRank[p.rank] = byRank[p.rank] || []).push(p));
  for (const [rk, ps] of Object.entries(byRank)) {
    const dm = med(ps.map(p => duty[p.id])), hm = med(ps.map(p => hrs[p.id]));
    if (ps.length < 5) { chk(seed + ' ' + rk + ' duty 8-18 / h>=30', dm >= 8 && dm <= 18 && hm >= 30, dm + 'd ' + hm.toFixed(1) + 'h n=' + ps.length); continue; }
    // 阈值按真实七中队 10 月班表校准（在岗者 35–64h、中位 ~50h；原 45–78 编码旧生成器偏高中位数；值勤日下限 10→9：外站驻点休息日/置位不计值勤日，个别小职级中位数落在 9 日）
    chk(seed + ' ' + rk + ' duty 9-16 / h 35-70', dm >= 9 && dm <= 16 && hm >= 35 && hm <= 70, dm + 'd ' + hm.toFixed(1) + 'h');
  }
  chk(seed + ' duty median 12-14', (m => m >= 12 && m <= 14)(med(Object.values(duty))), med(Object.values(duty)));
  // 节奏
  const bl = {}, gp = {};
  st.pilots.forEach(p => { const dd = []; for (let d = 1; d <= C.DAYS; d++) if (ds[p.id][d] === 'D') dd.push(d);
    let s0 = dd[0]; for (let i = 1; i <= dd.length; i++) if (i === dd.length || dd[i] !== dd[i - 1] + 1) { const L = dd[i - 1] - s0 + 1; bl[L] = (bl[L] || 0) + 1; if (i < dd.length) { const g = dd[i] - dd[i - 1] - 1; gp[g] = (gp[g] || 0) + 1; s0 = dd[i]; } } });
  const bt = Object.values(bl).reduce((a, b) => a + b, 0), gt = Object.values(gp).reduce((a, b) => a + b, 0);
  const mode = +Object.entries(bl).sort((a, b) => b[1] - a[1])[0][0];
  const g34 = ((gp[3] || 0) + (gp[4] || 0)) / gt, g2 = (gp[2] || 0) / gt, g01 = ((gp[0] || 0) + (gp[1] || 0)) / gt;
  const b5 = Object.entries(bl).filter(([k]) => +k >= 5).reduce((a, [, v]) => a + v, 0) / bt;
  chk(seed + ' block mode 3', mode === 3, JSON.stringify(bl));
  chk(seed + ' rest3-4 >=40% & > rest2', g34 >= 0.4 && g34 > g2, (100 * g34).toFixed(0) + '% vs ' + (100 * g2).toFixed(0) + '%');
  // 121.495(b)：4 个连续值勤日后第 5 日不得执飞 → 只要求无「第5日执飞」；第 5 日置位(随)回基地允许
  // 连续值勤日 = 执飞日(含跨日落地) 或 主备份；仅置位的日子不计
  const ix5 = C.buildIndex(st); let op5 = 0; const D5 = []; st.pilots.forEach(p => { const fl = {}, du = {}; (ix5.sched[p.id] || []).forEach(o => { o.legs.forEach(l => { if (!l.dh) fl[Math.floor(l.dep / C.DAY) + 1] = 1; }); C.opDays(o).forEach(d => du[d] = 1); });
    ((st.standby || {})[p.id] || []).forEach(d => du[d] = 1);
    for (let d = 5; d <= C.DAYS; d++) if (fl[d] && [1, 2, 3, 4].every(k => du[d - k])) { op5++; D5.push(p.id + '@' + d); } });
  chk(seed + ' rest0-1 <=10%, no day-5 operating', g01 <= 0.1 && op5 === 0, (100 * g01).toFixed(0) + '% 5+blocks ' + (100 * b5).toFixed(1) + '% op5 ' + op5 + ' ' + D5.slice(0, 3));
  const tr = st.pilots.filter(p => ix.hours[p.id] > 0.5).map(p => ((st.training || {})[p.id] || []).length);

  // 值勤连续性：日内衔接；任务起讫成都；日间要么同站过夜要么两端均在成都
  const BASE = { ZUUU: 1, ZUTF: 1 };
  let contOk = true, contInfo = '';
  for (const pr of st.pairings) {
    const byD = {};
    pr.legs.forEach(l => { (byD[l.d] = byD[l.d] || []).push(l); });
    const days = Object.keys(byD).map(Number).sort((a, b) => a - b);
    for (const d of days) {
      const legs = byD[d];
      for (let i = 0; i < legs.length - 1; i++) if (legs[i].to !== legs[i + 1].from) { contOk = false; contInfo = pr.id + ' D' + d + ' chain'; }
    }
    const last = byD[days[days.length - 1]].slice(-1)[0];
    if (!BASE[last.to]) { contOk = false; contInfo = pr.id + ' end ' + last.to; }
    if (!BASE[byD[days[0]][0].from] && !(days.length > 1)) { /* single day must start base */ }
    if (!BASE[byD[days[0]][0].from]) { contOk = false; contInfo = pr.id + ' start ' + byD[days[0]][0].from; }
    for (let di = 0; di < days.length - 1; di++) {
      const a = byD[days[di]].slice(-1)[0], b = byD[days[di + 1]][0];
      const ok = (BASE[a.to] && BASE[b.from]) || a.to === b.from;
      if (!ok) { contOk = false; contInfo = pr.id + ' lay ' + a.to + '!=' + b.from; }
      // non-layover day end must be Chengdu; layover next-start away ok if matched
      if (!(a.to === b.from) && (!BASE[a.to] || !BASE[b.from])) { contOk = false; contInfo = pr.id + ' daybound'; }
    }
  }
  chk(seed + ' pairing continuity', contOk, contInfo);

  chk(seed + ' schema17', st.sampleSchema === 17);
  { const rc = st.pilots.filter(p => p.reserve && C.isCaptClass(p.rank)); chk(seed + ' reserve captains Lhasa = J3+ only', rc.length === 20 && rc.every(p => p.auth.includes('ZULS') === C.lhasaRankOK(p.rank)), rc.filter(p => p.auth.includes('ZULS')).length + '/20'); }
  chk(seed + ' training 1-2', tr.length && Math.min(...tr) >= 1 && Math.max(...tr) <= 2, (tr.length ? Math.min(...tr) + '-' + Math.max(...tr) : 'none'));
  const active = st.pilots.filter(p => !(p.health && p.health.noFly) && ix.hours[p.id] > 0.5);
  const withSim = active.filter(p => ((st.sim || {})[p.id] || []).length > 0);
  const rate = withSim.length / Math.max(1, active.length);
  chk(seed + ' sim ~5%', rate >= 0.02 && rate <= 0.12, (100 * rate).toFixed(1) + '% ' + withSim.length + '/' + active.length);
  let simOk = withSim.length > 0;
  withSim.forEach(p => { const ds = ((st.sim || {})[p.id] || []).slice().sort((a,b)=>a-b); if (ds.length < 2 || ds.length > 4) simOk = false; for (let i = 1; i < ds.length; i++) if (ds[i] !== ds[i-1] + 1) simOk = false; });
  chk(seed + ' sim 2-4 consecutive', simOk);
  const sb = st.pilots.map(p => ((st.standby || {})[p.id] || []).length);
  chk(seed + ' standby rare', Math.max(...sb) <= 1);
}
// 不影响完整版：独立生成器 & 存储键
chk('main sample unaffected', !C.generateSample().lite);
console.log(fail ? 'LITE FAIL ' + fail : 'LITE ALL OK'); process.exitCode = fail ? 1 : 0;
