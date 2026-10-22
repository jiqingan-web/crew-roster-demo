// 同级别换班 + 换班移动 + 拉萨资质级别（快速）
const C = require('../js/core.js'); let fail = 0; const chk = (n, ok, info) => { console.log('SWAP ' + n, ok ? 'OK' : 'FAIL', info == null ? '' : info); if (!ok) fail++; };
const st = C.generateLiteSample(20261101); C.autoFill(st);
// 拉萨资质仅 J3+
chk('no Lhasa below J3', !st.pilots.some(p => !C.lhasaRankOK(p.rank) && p.auth.includes('ZULS')));
const rc = st.pilots.filter(p => p.reserve && C.isCaptClass(p.rank)); const rq = rc.filter(p => p.auth.includes('ZULS'));
chk('reserve capt ranks kept, Lhasa only J3+', rq.every(p => C.lhasaRankOK(p.rank)) && rc.filter(p => C.lhasaRankOK(p.rank)).length === rq.length && rc.some(p => !C.lhasaRankOK(p.rank)), `${rq.length}/${rc.length}`);
// 找一对同级、日程不冲突的人做互换
const idx = C.buildIndex(st); let found = null;
outer: for (const a of st.pilots) for (const b of st.pilots) { if (a.id >= b.id || a.rank !== b.rank) continue;
  const A = idx.sched[a.id] || [], B = idx.sched[b.id] || []; if (!A.length || !B.length) continue;
  for (const pa of A) for (const pb of B) { const pv = C.swapPreview(st, a.id, b.id, [pa.id], [pb.id]); if (pv.ok) { found = pv; break outer; } } }
chk('mutual swap found & valid', !!found, found && found.moves.map(m => m.pairing).join(','));
const h0 = found.hours; const n0 = C.validate(st).filter(v => v.level === 'hard').length;
C.applySwap(st, found); chk('apply swap moves crews', found.moves.every(m => st.pairings.find(p => p.id === m.pairing).crew[m.slot] === m.to));
chk('no new hard after swap', C.validate(st).filter(v => v.level === 'hard').length <= n0);
chk('hours before/after reported', Object.values(h0).every(x => x.length === 2));
// 不同级别拒绝
const a = st.pilots.find(p => p.rank === 'F5'), b = st.pilots.find(p => p.rank === 'F6'); const pa = (C.buildIndex(st).sched[a.id] || [])[0];
chk('different rank rejected', !C.swapPreview(st, a.id, b.id, pa ? [pa.id] : [], []).ok);
// 冲突：把甲的任务给一个同日已有任务的同级人员 → 新增硬违规
const i2 = C.buildIndex(st); let bad = null;
for (const p of st.pilots) { for (const pr of (i2.sched[p.id] || [])) { const q = st.pilots.find(x => x.rank === p.rank && x.id !== p.id && (i2.sched[x.id] || []).some(o => o.start === pr.start)); if (q) { bad = C.swapPreview(st, p.id, q.id, [pr.id], []); break; } } if (bad) break; }
chk('conflicting one-way rejected with reason', bad && !bad.ok && bad.newHard.length > 0, bad && bad.newHard.slice(0, 1).map(v => v.msg).join(''));
// 换班补空座：造一个空座，swapFillHoles 至少不引入硬违规
const s2 = C.generateLiteSample(7); C.autoFill(s2, { noSwap: true }); const holes0 = s2.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
const log = C.swapFillHoles(s2, { ms: 4000 }); const holes1 = s2.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
const hard = C.validate(s2).filter(v => v.level === 'hard' && !['未满员', '日飞行时间超限', '执勤期超限'].includes(v.type));
chk('swapFillHoles reduces/keeps holes, no seat hard', holes1 <= holes0 && hard.length === 0, `${holes0}→${holes1} moves ${log.length}`);
// 同级转让（任务优先）：空闲且合规的同级人员，工时升序；请假不可用；意向休息日可用但软提示
{ const s = C.generateLiteSample(20261101); C.autoFill(s); const pr = s.pairings.find(p => C.transferCandidates(s, p.id, p.crew.F).filter(c => c.ok).length >= 3); const from = pr.crew.F;
  let tc = C.transferCandidates(s, pr.id, from); const ok = tc.filter(c => c.ok);
  chk('transfer: same rank only', tc.every(c => c.p.rank === s.pilots.find(x => x.id === from).rank));
  chk('transfer: ok sorted by hours asc', ok.every((c, i) => !i || ok[i - 1].hoursBefore <= c.hoursBefore + 1e-9), ok.length);
  chk('transfer: hours/rest fields', ok.every(c => c.hoursAfter > c.hoursBefore && ('restBefore' in c) && ('restAfter' in c)));
  const d = C.daysTouched(pr, s); const L = ok[0].p, Q = ok[1].p; L.leave = (L.leave || []).concat(d); Q.prefs = (Q.prefs || []).concat(d);
  tc = C.transferCandidates(s, pr.id, from); const cl = tc.find(c => c.p.id === L.id), cq = tc.find(c => c.p.id === Q.id);
  chk('transfer: approved leave excluded', cl && !cl.ok, cl && cl.reasons.join('|'));
  chk('transfer: pref rest day usable + soft note', cq && cq.ok && cq.soft.some(x => x.includes('意向休息日')), cq && cq.soft.join('|'));
  const pv = C.applyTransfer(s, pr.id, from, cq.p.id); chk('transfer applied', pv.ok && pr.crew[pv.moves[0].slot] === cq.p.id && C.validate(s).filter(v => v.level === 'hard' && v.pilot === cq.p.id).length === 0); }
console.log(fail ? 'SWAP FAIL ' + fail : 'SWAP ALL OK'); process.exit(fail ? 1 : 0);
