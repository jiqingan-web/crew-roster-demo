// 按日历月分桶 + 外中队缺位降级（node 直跑）
// 1) 51 天网格：月度小时上限按自然月判，127h 拆两月不报、集中在同月才报
// 2) 备份超限按自然月逐桶
// 3) 30 天网格：只有 1 个桶，summarize/personCheck/validate 口径与改造前一致
// 4) 官方班表外中队缺位 → info「外中队缺位」；原本有人的座位空了 → hard「未满员」
// 5) 真实官方班表（51 天）：未满员硬违规清零，月小时超上限不再误报
const C = require('../js/core.js');
let bad = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('ok   ' + name); return; }
  bad++; console.log('FAIL ' + name + (extra != null ? ' :: ' + extra : ''));
}
const J = o => JSON.stringify(o);
const near = (a, b) => Math.abs(a - b) < 1e-9;
const MK = (id, day, hours, pid) => { const dep = (day - 1) * C.DAY + 8 * 60;
  return { id: id, start: day, ndays: 1, ac: 'A320', legs: [{ d: day, flt: 'TL' + id, from: 'ZUUU', to: 'ZUUU', dep: dep, arr: dep + hours * 60, ac: 'A320' }],
    crew: { C: pid || null, F: null, T: null } }; };
const monthReasons = rs => rs.filter(r => /月飞行小时|个人月飞行上限/.test(r));

// ================= 1) 51 天网格：月飞行小时逐桶 =================
{
  C.setPeriod({ days: 51, start: { m: 9, d: 1 } });
  const st = C.generateLiteSample(20261101); // 205 个空座任务，人员均未排班
  const p = st.pilots.find(x => C.pilotHardCap(x, st) === 100 && !(x.leave || []).length);
  ok('T1 51 天网格 + 找到 100h 硬上限的干净人员', C.DAYS === 51 && !!p, C.DAYS + ' ' + (p && p.id));
  // 分属两月：9 月 8 班 × 8h = 64h，10 月 7 班 × 9h = 63h，合计 127h（各月均 < 100h）
  for (let i = 0; i < 8; i++) st.pairings.push(MK('MA' + i, 1 + i * 2, 8, p.id));
  for (let i = 0; i < 7; i++) st.pairings.push(MK('MB' + i, 33 + i * 2, 9, p.id));
  const candA = MK('CAND-A', 20, 1, null), candB = MK('CAND-B', 40, 1, null);
  let idx = C.buildIndex(st);
  const mb = C.monthBuckets();
  ok('T1 monthBuckets 两桶 9月/10月', mb.length === 2 && mb[0].key === '2026-09' && mb[0].label === '9月' && mb[1].key === '2026-10' && mb[1].label === '10月', J(mb.map(b => [b.key, b.label, b.days.length])));
  ok('T1 桶切分 9月=1..30 / 10月=31..51', mb[0].days.length === 30 && mb[0].days[0] === 1 && mb[0].days[29] === 30 && mb[1].days.length === 21 && mb[1].days[0] === 31 && mb[1].days[20] === 51);
  ok('T1 monthOfDay 映射', C.monthOfDay(1) === '2026-09' && C.monthOfDay(30) === '2026-09' && C.monthOfDay(31) === '2026-10' && C.monthOfDay(51) === '2026-10', C.monthOfDay(30) + '/' + C.monthOfDay(31));
  ok('T1 全期 127.0h', near(idx.hours[p.id], 127), idx.hours[p.id]);
  const s1 = C.summarize(st), per = s1.per.find(x => x.id === p.id);
  ok('T1 summarize per.hours 仍为全期合计', near(per.hours, 127), per.hours);
  ok('T1 per.monthHours = {9月:64, 10月:63}', near(per.monthHours['2026-09'], 64) && near(per.monthHours['2026-10'], 63), J(per.monthHours));
  ok('T1 sum.monthMeta = monthBuckets()', J(s1.monthMeta) === J(C.monthBuckets()), J(s1.monthMeta && s1.monthMeta.map(b => b.key)));
  const rsA = C.personCheck(p, candA, st, idx, { ignorePrefs: true, skipFtl: true, slot: 'C' })[1];
  const rsB = C.personCheck(p, candB, st, idx, { ignorePrefs: true, skipFtl: true, slot: 'C' })[1];
  ok('T1 拆两月：personCheck 不报月上限', monthReasons(rsA).length === 0 && monthReasons(rsB).length === 0, J(monthReasons(rsA).concat(monthReasons(rsB))));
  // 集中到同一个月：把 10 月 7 班（63h）也排进 9 月 → 9 月 127h
  st.pairings.forEach(pr => { if (pr.id.indexOf('MB') === 0) pr.crew.C = null; });
  for (let i = 0; i < 7; i++) st.pairings.push(MK('MC' + i, 17 + i * 2, 9, p.id));
  idx = C.buildIndex(st);
  const s2 = C.summarize(st), per2 = s2.per.find(x => x.id === p.id);
  const rs2 = C.personCheck(p, candA, st, idx, { ignorePrefs: true, skipFtl: true, slot: 'C' })[1];
  ok('T1 集中在 9 月后 127h 落单桶', near(per2.monthHours['2026-09'], 127) && near(per2.monthHours['2026-10'], 0), J(per2.monthHours));
  ok('T1 集中同月：personCheck 报月小时硬上限', monthReasons(rs2).some(r => r.includes('超出月飞行小时硬上限100h')), J(rs2));
  const vm = C.validate(st).filter(v => v.type === '月小时超法规上限' && v.pilot === p.id);
  ok('T1 集中同月：validate 也报月小时超限（51 天口径）', vm.length === 1 && vm[0].level === 'hard', J(vm));

  // ================= 2) 备份超限逐桶（同一 51 天网格） =================
  const stB = C.generateLiteSample(20261101);
  const q = stB.pilots.find(x => !(x.leave || []).length);
  stB.settings.maxStandbyPerPilot = 1;
  stB.standby = {}; stB.pilots.forEach(x => stB.standby[x.id] = []);
  const sbOf = pid => C.validate(stB).filter(v => v.type === '备份超限' && v.pilot === pid);
  stB.standby[q.id] = [2, 33]; // 9 月 1 天 + 10 月 1 天
  ok('T2 两月各 1 天备份：不报备份超限', sbOf(q.id).length === 0, J(sbOf(q.id)));
  stB.standby[q.id] = [2, 4]; // 同在 9 月 2 天
  const sb2 = sbOf(q.id);
  ok('T2 同月 2 天备份：报备份超限', sb2.length === 1 && sb2[0].level === 'soft' && sb2[0].msg.includes('9月备份2天'), J(sb2));
  stB.standby[q.id] = [2, 33, 35]; // 9月1天 + 10月2天
  const sb3 = sbOf(q.id);
  ok('T2 跨月 3 天：只报超限的那个月', sb3.length === 1 && sb3[0].msg.includes('10月备份2天'), J(sb3));
  C.setPeriod({ days: 30, start: { m: 11, d: 1 } });
}

// ================= 3) 30 天网格：单桶，口径与改造前一致 =================
{
  const mb = C.monthBuckets();
  ok('T3 30 天网格只有 1 个桶', mb.length === 1 && mb[0].key === '2026-11' && mb[0].label === '11月' && mb[0].days.length === 30, J(mb.map(b => [b.key, b.days.length])));
  const st = C.generateLiteSample(20261101); C.autoFill(st);
  const idx = C.buildIndex(st), s = C.summarize(st);
  ok('T3 per[].monthHours 单桶 == per[].hours', s.per.every(x => { const ks = Object.keys(x.monthHours); return ks.length === 1 && ks[0] === '2026-11' && near(x.monthHours[ks[0]], x.hours); }),
    J(s.per.slice(0, 3).map(x => [x.hours, x.monthHours])));
  ok('T3 sum.monthMeta = [{2026-11}]', J(s.monthMeta) === J(C.monthBuckets()) && s.monthMeta[0].key === '2026-11');
  // 既有 test/test.js 断言口径抽查（lite 口径）：无未满员以外的硬违规、无人超 100h、备份不超每人上限
  const hardBeyond = s.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length;
  ok('T3 硬违规仅剩「未满员」（与改造前一致）', hardBeyond === 0, hardBeyond + ' :: ' + J(s.byType));
  ok('T3 无「外中队缺位」（非官方班表不产生）', !s.byType['外中队缺位'], J(s.byType));
  ok('T3 无人超 100h', s.per.every(x => x.hours <= C.pilotHardCap(st.pilots.find(p => p.id === x.id), st) + 1e-9));
  const sbMax = Math.max(0, ...Object.values(st.standby || {}).map(a => a.length));
  ok('T3 每人备份天数 ≤ maxStandbyPerPilot', sbMax <= (st.settings.maxStandbyPerPilot == null ? 1 : st.settings.maxStandbyPerPilot), sbMax);
  // 月上限文案逐字节等于改造前模板（单桶）
  st.settings.hardMaxHours = 1;
  const vm = C.validate(st).filter(v => v.type === '月小时超法规上限');
  const idx2 = C.buildIndex(st);
  const exact = vm.length > 0 && vm.every(v => {
    const p = st.pilots.find(x => x.id === v.pilot), h = idx2.hours[v.pilot], cap = C.pilotHardCap(p, st);
    const personal = p.health && p.health.maxMonthH > 0 && p.health.maxMonthH < C.hardCap ? true : false;
    const legacy = personal ? `${p.name}(${p.rank}) ${h.toFixed(1)}h > 个人月上限 ${cap}h（体检限制）`
      : `${p.name}(${p.rank}) ${h.toFixed(1)}h > ${cap}h（公司/法规月上限 ${C.CCAR121.monthFlightH}h）`;
    return v.msg === legacy;
  });
  ok('T3 月上限文案与改造前逐字节一致', exact, vm[0] && vm[0].msg);
  // 未满员文案保持旧口径（用未填人的 lite 状态触发）
  const stU = C.generateLiteSample(20261101);
  const un = C.validate(stU).filter(v => v.type === '未满员' && v.level === 'hard');
  const prU = stU.pairings.find(pr => un.some(v => v.pairing === pr.id));
  const uMsg = prU && un.find(v => v.pairing === prU.id).msg;
  const legacyU = prU && (prU.id + ' 缺 ' + ['C', 'F', 'T'].filter(s2 => !prU.crew[s2]).map(s2 => C.SLOT_NAME[s2]).join('/'));
  ok('T3 「未满员」文案保持旧口径', uMsg === legacyU, uMsg + ' vs ' + legacyU);
}

// ================= 4) 外中队缺位降级 / 真缺位仍 hard =================
{
  const st = C.generateLiteSample(20261101);
  const p0 = st.pilots[0], p1 = st.pilots[1];
  const prA = st.pairings[0], prB = st.pairings[1], prC = st.pairings[2];
  // A：官方 + 源表本就没有 F 位 → 外中队缺位（info）
  prA.official = true; prA.crew = { C: p0.id, F: null, T: null }; prA.srcCrew = { C: p0.id, F: null, T: null };
  // B：官方 + 源表 F 位本来有人（p0），现在空了 → 仍硬「未满员」
  prB.official = true; prB.crew = { C: p1.id, F: null, T: null }; prB.srcCrew = { C: p1.id, F: p0.id, T: null };
  // C：非官方班表（无 srcCrew）→ 仍硬「未满员」
  prC.official = false; prC.crew = { C: p0.id, F: null, T: null };
  const v = C.validate(st);
  const of = id => v.filter(x => x.pairing === id);
  ok('T4 官方+源表空位 → info「外中队缺位」', of(prA.id).some(x => x.type === '外中队缺位' && x.level === 'info'), J(of(prA.id)));
  ok('T4 外中队缺位 msg 说明源表仅本中队', of(prA.id).some(x => x.type === '外中队缺位' && x.msg.includes('源表仅本中队') && x.msg.includes('外中队搭档未入表')), J(of(prA.id).map(x => x.msg)));
  ok('T4 外中队缺位保留 pairing 字段', of(prA.id).every(x => x.type !== '外中队缺位' || x.pairing === prA.id));
  ok('T4 外中队缺位不再算 hard 未满员', !of(prA.id).some(x => x.type === '未满员' && x.level === 'hard'), J(of(prA.id)));
  ok('T4 源表原本有人、现在空了 → hard 未满员', of(prB.id).some(x => x.type === '未满员' && x.level === 'hard' && x.msg.includes(C.SLOT_NAME.F)), J(of(prB.id)));
  ok('T4 非官方班表空位 → hard 未满员', of(prC.id).some(x => x.type === '未满员' && x.level === 'hard'), J(of(prC.id)));
  // 自动填人/空洞判据不变：crew 仍为空，空座仍是「洞」（autoFill 与 listHoles 只看 pr.crew，不看 validate 类型）
  ok('T4 降级不改变 pr.crew（自动填人判据保持现状）', prA.crew.C === p0.id && prA.crew.F === null && prA.crew.T === null);
  // st.official 回退：即使没写 pr.official，只要 official 班表 + srcCrew 也按外中队缺位
  const st2 = C.generateLiteSample(20261101); st2.official = 1;
  const prD = st2.pairings[0];
  prD.crew = { C: st2.pilots[0].id, F: null, T: null }; prD.srcCrew = { C: st2.pilots[0].id, F: null, T: null };
  ok('T4 st.official + srcCrew 亦按外中队缺位（官方班表实际接线）', C.validate(st2).some(x => x.pairing === prD.id && x.type === '外中队缺位' && x.level === 'info'));
}

// ================= 5) 真实官方班表（51 天）端到端 =================
{
  const O = require('../js/official-roster.js');
  const st = O.build(C);
  try {
    const v = C.validate(st), s = C.summarize(st);
    const missSlot = pr => ['C', 'F', 'T'].filter(s2 => !pr.crew[s2]);
    const isOfficial = pr => !!(pr.official || (pr.srcCrew && st.official));
    const extSlot = (pr, s2) => isOfficial(pr) && pr.srcCrew && pr.srcCrew[s2] == null;
    const expExt = st.pairings.filter(pr => missSlot(pr).some(s2 => extSlot(pr, s2))).length;
    const expHardUnfilled = st.pairings.filter(pr => missSlot(pr).some(s2 => !extSlot(pr, s2))).length;
    const hardUnfilled = v.filter(x => x.type === '未满员' && x.level === 'hard').length;
    const extInfo = v.filter(x => x.type === '外中队缺位').length;
    ok('T5 官方班表 51 天', C.DAYS === 51 && s.monthMeta.length === 2, C.DAYS + '/' + J(s.monthMeta && s.monthMeta.map(x => x.key)));
    ok('T5 未满员硬违规 = 源表本有人的空座数', hardUnfilled === expHardUnfilled, hardUnfilled + ' vs ' + expHardUnfilled);
    ok('T5 外中队缺位 info 条数 = 含源表空位的任务数', extInfo === expExt && extInfo > 0, extInfo + ' vs ' + expExt);
    ok('T5 官方班表不再有「未满员」硬违规（' + hardUnfilled + ' 条）', hardUnfilled === 0, hardUnfilled);
    // 月上限：逐桶后不应再有误报（127h/51 天 分属两月各 <100h）
    const monthHard = v.filter(x => x.type === '月小时超法规上限');
    const overBucket = [];
    s.per.forEach(x => Object.keys(x.monthHours).forEach(k => { if (x.monthHours[k] > C.CCAR121.monthFlightH + 1e-9) overBucket.push([x.id, k, x.monthHours[k]]); }));
    ok('T5 51 天无月小时超上限硬违规（逐桶判定生效）', monthHard.length === 0 && overBucket.length === 0, J({ monthHard: monthHard.length, overBucket: overBucket.slice(0, 3) }));
    ok('T5 全期小时仍保留（最大 >100h 说明是两月合计）', Math.max(...s.per.map(x => x.hours)) > 100, Math.max(...s.per.map(x => x.hours)).toFixed(1) + 'h');
    ok('T5 per[].hours = 各桶之和', s.per.every(x => near(Object.keys(x.monthHours).reduce((a, k) => a + x.monthHours[k], 0), x.hours)), J(s.per.slice(0, 2).map(x => [x.hours, x.monthHours])));
  } finally { C.setPeriod({ days: 30, start: { m: 11, d: 1 } }); }
}

console.log(bad ? 'FAIL ' + bad : 'monthbucket OK');
process.exitCode = bad ? 1 : 0;
