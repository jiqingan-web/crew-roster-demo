// 请假工作台引擎：统一登记 leaveRegister + 快速影响面 holeScan（node 直跑）
const C = require('../js/core.js');
let bad = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('ok   ' + name); return; }
  bad++; console.log('FAIL ' + name + (extra != null ? ' :: ' + extra : ''));
}
const J = o => JSON.stringify(o);
const stripPlan = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'planSteps' ? undefined : v));
const crewSnap = st => J(st.pairings.map(pr => pr.crew));

// 轻量：lite 样本（141 人）秒级完成；全量 generateSample 1100+ 人 autoFill 需 >10 分钟，回归交给 test/test.js
function liteState(seed) { const st = C.generateLiteSample(seed || 20261101); C.autoFill(st); return st; }
function busiest(st, idx) {
  return st.pilots.filter(p => (idx.sched[p.id] || []).length)
    .sort((a, b) => (idx.sched[b.id].length - idx.sched[a.id].length) || String(a.id).localeCompare(String(b.id)))[0];
}
// 取该人前 n 个「排班覆盖且尚未请假」的自然日
function firstDays(st, idx, p, n) {
  const out = [];
  for (const pr of idx.sched[p.id] || []) for (const d of C.daysTouched(pr, st)) {
    if (!out.includes(d) && !(p.leave || []).includes(d)) out.push(d);
    if (out.length >= n) return out.sort((a, b) => a - b);
  }
  return out.sort((a, b) => a - b);
}

// ---------- 1) leaveRegister('leave')：写入 + 清理重叠 + 幂等 ----------
{
  const st = liteState();
  const idx = C.buildIndex(st);
  const p = busiest(st, idx);
  const D = firstDays(st, idx, p, 3);
  ok('T1 选中一名有排班的人且有 3 天', p && D.length === 3, p && p.id);
  // 造出重叠的备份/培训/控班/模拟机/提前占位/意向休息，验证「清理」可观测
  st.standby = st.standby || {}; st.standby[p.id] = [...new Set([...(st.standby[p.id] || []), D[0], D[1]])].sort((a, b) => a - b);
  st.training = st.training || {}; st.training[p.id] = [...new Set([...(st.training[p.id] || []), D[0]])].sort((a, b) => a - b);
  st.trainingKind = st.trainingKind || {}; st.trainingKind[p.id] = Object.assign({}, st.trainingKind[p.id], { [D[0]]: 'A' });
  st.control = st.control || {}; st.control[p.id] = [...new Set([...(st.control[p.id] || []), D[2]])].sort((a, b) => a - b);
  st.sim = st.sim || {}; st.sim[p.id] = [...new Set([...(st.sim[p.id] || []), D[2]])].sort((a, b) => a - b);
  st.simHold = st.simHold || {}; st.simHold[p.id] = [...new Set([...(st.simHold[p.id] || []), D[2]])].sort((a, b) => a - b);
  p.prefs = [...new Set([...(p.prefs || []), D[1]])].sort((a, b) => a - b);
  const crewB = crewSnap(st);

  const r = C.leaveRegister(st, p.id, D);
  ok('T1 登记返回 ok/kind', !!r && r.ok === true && r.kind === 'leave', r && J({ ok: r.ok, kind: r.kind, reason: r.reason }));
  ok('T1 leave 写入 3 天', D.every(d => (p.leave || []).includes(d)), J(p.leave));
  ok('T1 written=全部新增', J((r.written || []).slice().sort((a, b) => a - b)) === J(D), J(r.written));
  ok('T1 清理备份重叠', [D[0], D[1]].every(d => (r.cleared.standby || []).includes(d)), J(r.cleared.standby));
  ok('T1 清理培训重叠', (r.cleared.training || []).includes(D[0]), J(r.cleared.training));
  ok('T1 清理培训类型', !st.trainingKind[p.id] || st.trainingKind[p.id][D[0]] == null);
  ok('T1 清理控班/模拟机/提前占位重叠', (r.cleared.control || []).includes(D[2]) && (r.cleared.sim || []).includes(D[2]) && (r.cleared.simHold || []).includes(D[2]),
    J({ control: r.cleared.control, sim: r.cleared.sim, simHold: r.cleared.simHold }));
  ok('T1 清理意向休息重叠', (r.cleared.prefs || []).includes(D[1]), J(r.cleared.prefs));
  ok('T1 不清 pr.crew（缺口留给 validate/UI）', crewSnap(st) === crewB);

  const r2 = C.leaveRegister(st, p.id, D);
  ok('T1 幂等：二次 written 为空 / skipped 全 3', !!r2 && r2.ok && (r2.written || []).length === 0 && (r2.skipped || []).length === 3,
    r2 && J({ written: r2.written, skipped: r2.skipped }));
  ok('T1 幂等：二次 cleared 全空', Object.keys(r2.cleared || {}).every(k => !(r2.cleared[k] || []).length), J(r2.cleared));
}

// ---------- 2/3/4) lite 数据：holeScan vs holeRecommend、登记后仍扫、填候选降违规 ----------
const stL = liteState();
const idxL = C.buildIndex(stL);
const pL = busiest(stL, idxL);
const daysL = firstDays(stL, idxL, pL, 3);
const hrL = C.holeRecommend(stL, pL.id, daysL, { topK: 3 });
const hsL = C.holeScan(stL, pL.id, daysL, { topK: 3 });
{
  ok('T2 两者都返回若干洞', !!hrL && !!hsL && hrL.holes.length > 0 && hsL.holes.length > 0,
    J({ rec: hrL && hrL.holes.length, scan: hsL && hsL.holes.length }));
  ok('T2 holes 逐字段一致（忽略 planSteps）', J(stripPlan(hrL.holes)) === J(stripPlan(hsL.holes)));
  ok('T2 holeScan.plan 恒为 null', hsL.plan === null);
  ok('T2 holeScan 耗时 < holeRecommend', hsL.ms < hrL.ms, 'scan=' + hsL.ms + 'ms recommend=' + hrL.ms + 'ms');
  ok('T2 lite 下 holeScan < 60ms', hsL.ms < 60, hsL.ms + 'ms');
  console.log('   lite holeScan ' + hsL.ms + 'ms / holeRecommend ' + hrL.ms + 'ms / holes ' + hsL.holes.length);
}
{
  const crewB = crewSnap(stL);
  const r = C.leaveRegister(stL, pL.id, daysL);
  ok('T3 登记成功', !!r && r.ok === true, r && r.reason);
  ok('T3 登记不改 pr.crew', crewSnap(stL) === crewB);
  const hs2 = C.holeScan(stL, pL.id, daysL, { topK: 3 });
  ok('T3 登记后洞数不变', !!hs2 && hs2.holes.length === hsL.holes.length, hsL.holes.length + ' -> ' + (hs2 && hs2.holes.length));
  ok('T3 登记后 crew 仍未改', crewSnap(stL) === crewB);

  // 数据随候补池构成变化，"第一个洞"不一定可补；断言改为"至少存在一个可补的洞"
  const hole = (hs2.holes || []).find(h => (h.candidates || []).some(c => c.light !== 'red')) || null;
  const cand = hole && (hole.candidates || []).find(c => c.light !== 'red');
  ok('T4 存在可补的洞（非红候选）', !!cand, (hs2.holes || []).map(h => h.id + ':' + (h.candidates || []).map(c => c.light).join('/')).join(' | '));
  if (hole && cand) {
    const hardB = C.summarize(stL).hard;
    const w = JSON.parse(JSON.stringify(stL));
    const prW = w.pairings.find(x => x.id === hole.id);
    prW.crew[hole.slot] = cand.id;
    const hardA = C.summarize(w).hard;
    ok('T4 填入 ' + cand.id + ' 后硬性违规下降', hardA < hardB, 'before=' + hardB + ' after=' + hardA);
  }
}

// ---------- 5) kind='hold' 走 reserveHold：有飞行任务的日期被 skip ----------
{
  const st = liteState();
  const idx = C.buildIndex(st);
  const p = busiest(st, idx);
  const flyDay = C.daysTouched(idx.sched[p.id][0], st)[0];
  let freeDay = null;
  for (let d = 1; d <= C.DAYS; d++) {
    if (d === flyDay) continue;
    if ((idx.sched[p.id] || []).some(pr => C.daysTouched(pr, st).includes(d))) continue;
    freeDay = d; break;
  }
  ok('T5 找到飞行日 + 空闲日', flyDay != null && freeDay != null, J({ flyDay, freeDay }));
  const r = C.leaveRegister(st, p.id, [flyDay, freeDay], 'hold');
  ok('T5 hold 返回 ok/kind/label', !!r && r.ok === true && r.kind === 'hold' && typeof r.label === 'string', r && J({ ok: r.ok, kind: r.kind, label: r.label, reason: r.reason }));
  ok('T5 飞行日被 skip', (r.skipped || []).includes(flyDay), J({ skipped: r.skipped, days: r.days }));
  ok('T5 空闲日写入 sim/simHold', (r.days || []).includes(freeDay) && (st.sim[p.id] || []).includes(freeDay) && (st.simHold[p.id] || []).includes(freeDay), J({ days: r.days, sim: st.sim[p.id], hold: st.simHold[p.id] }));
  ok('T5 飞行日未写入 hold', !(r.days || []).includes(flyDay));
}

console.log(bad ? 'FAIL ' + bad : 'leaveflow OK');
process.exitCode = bad ? 1 : 0;
