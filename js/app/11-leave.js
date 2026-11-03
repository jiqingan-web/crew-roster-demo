/* 机组排班助手 - 界面 · leave.js —— 请假工作台（单页三步：① 选人与日期 → ② 登记 → ③ 补位）
   取代 05-ops.js 中旧的「空洞换人 / 多方案卡片」双视图流程；旧实现保留在同文件内但不再被调用。
   依赖：00-base.js 的 st/sum/ui/save/render/toast/helpers、05-ops.js 的 leaveSel/leaveHist 等状态变量。 */

  // ---------------- 工作台状态 ----------------
  let lvKind = 'leave';       // 'leave' 请假 | 'hold' 禁飞占位
  let lvReg = null;           // 最近一次登记的 { pid, days, kind, t }
  let lvPlanIdx = -1;         // 当前查看的方案序号
  let lvPlanOpen = false;     // 是否展开全部方案
  let lvScanMs = 0;           // 影响面扫描耗时
  let lvAllCands = false;     // 候选是否展开全部
  let lvAnchor = null;        // 日期条第一次点击的起点

  const lvPad = d => String(d).padStart(2, '0');
  const lvRange = () => { const a = Math.max(1, Math.min(leaveSel.from || 1, leaveSel.to || 1)), b = Math.min(C.DAYS, Math.max(leaveSel.from || 1, leaveSel.to || 1)); const o = []; for (let d = a; d <= b; d++) o.push(d); return o; };
  const lvSpan = ds => !ds || !ds.length ? '' : (ds[0] === ds[ds.length - 1] ? ds[0] + '日' : ds[0] + '–' + ds[ds.length - 1] + '日');
  const lvRegOf = pid => (lvReg && lvReg.pid === pid) ? lvReg : null;
  const lvKindTxt = k => k === 'hold' ? '禁飞占位' : '请假';
  const lvName = (sol, id) => { if (!id) return '空缺'; const q = ((sol && sol.state) || st).pilots.find(z => z.id === id); return q ? q.name : id; };
  const lvCLEAR_TXT = { standby: '备份', prefs: '意向休息', training: '培训', control: '控班', sim: '模拟机', simHold: '提前占位' };

  // 影响面：只扫空洞（不枚举方案），约 1/5 的耗时
  function lvScan() {
    if (!leaveSel.pid) { leaveHoles = null; return; }
    const days = lvRange(); if (!days.length) { leaveHoles = null; return; }
    const t0 = (performance && performance.now) ? performance.now() : Date.now();
    const fn = C.holeScan || C.holeRecommend;
    try { leaveHoles = fn(st, leaveSel.pid, days, { topK: 5 }); } catch (e) { leaveHoles = null; }
    lvScanMs = Math.round(((performance && performance.now) ? performance.now() : Date.now()) - t0);
    holePrev = null;
  }

  // 登记（统一入口）：优先用引擎的 leaveRegister，缺失时退回本地实现
  function lvRegisterCore(pid, days, kind) {
    if (C.leaveRegister) return C.leaveRegister(st, pid, days, kind);
    const p = st.pilots.find(x => x.id === pid); if (!p) return { ok: false, reason: '人员不存在' };
    if (!days.length) return { ok: false, reason: '无有效日期' };
    if (kind === 'hold') return C.reserveHold(st, pid, days);
    const cleared = { prefs: [], standby: [], training: [], control: [], sim: [], simHold: [] };
    const written = [];
    days.forEach(d => { if (!(p.leave || []).includes(d)) written.push(d); });
    p.leave = [...new Set([...(p.leave || []), ...days])].sort((a, b) => a - b);
    const cut = (obj, key) => { if (!obj || !obj[pid]) return; const had = obj[pid].filter(d => days.includes(d)); if (had.length) { cleared[key] = had; obj[pid] = obj[pid].filter(d => !days.includes(d)); } };
    cleared.prefs = (p.prefs || []).filter(d => days.includes(d)); p.prefs = (p.prefs || []).filter(d => !days.includes(d));
    cut(st.standby, 'standby'); cut(st.training, 'training'); cut(st.control, 'control'); cut(st.sim, 'sim'); cut(st.simHold, 'simHold');
    if (st.trainingKind && st.trainingKind[pid]) days.forEach(d => { if (st.trainingKind[pid][d] != null) { delete st.trainingKind[pid][d]; } });
    return { ok: true, kind: 'leave', written, skipped: days.filter(d => !written.includes(d)), cleared };
  }

  function lvDoRegister() {
    const p = st.pilots.find(x => x.id === leaveSel.pid); if (!p) return;
    const days = lvRange(); if (!days.length) return;
    const snap = JSON.stringify(st);
    const r = lvRegisterCore(p.id, days, lvKind);
    if (!r || !r.ok) { toast('登记失败：' + esc((r && r.reason) || '未知原因')); return; }
    const dl = (r.days || days).slice().sort((a, b) => a - b);
    leaveHist.push({ snap, label: p.name + ' ' + lvKindTxt(lvKind) + ' ' + lvSpan(dl), time: new Date().toTimeString().slice(0, 8) });
    lvReg = { pid: p.id, days: dl, kind: lvKind, t: Date.now() };
    leaveOpts = null; lvPlanIdx = -1; lvPlanOpen = false; lvAllCands = false;
    lvScan(); sum = C.summarize(st); renderKpis(); updateIssueBadge(); save(); rLeave();
    const n = leaveHoles && leaveHoles.holes ? leaveHoles.holes.length : 0;
    const cl = Object.keys(r.cleared || {}).filter(k => (r.cleared[k] || []).length).map(k => (lvCLEAR_TXT[k] || k) + ' ' + r.cleared[k].length + ' 天');
    toast('✔ 已登记 ' + esc(p.name) + ' ' + lvSpan(dl) + (cl.length ? ' · 已清理重叠：' + cl.join('、') : '') + (n ? ' · 待补 <b>' + n + '</b> 个座位' : ' · 无任务需补位'), 4200);
  }

  // ---------------- 渲染 ----------------
  function genLeave() { lvScan(); leaveOpts = null; lvPlanIdx = -1; }

  function goLeave(pid, from, to) {
    leaveSel = { pid, from: from || 1, to: to || (from || 1) };
    if (leaveSel.to < leaveSel.from) leaveSel.to = leaveSel.from;
    leaveOpts = null; lvPlanIdx = -1; lvPlanOpen = false; lvAllCands = false;
    tab = 'leave'; location.hash = 'leave';
    lvScan(); render();
  }

  function rLeave() {
    const caps = st.pilots.filter(p => C.isCaptClass(p.rank)).concat(st.pilots.filter(p => C.isFO(p.rank)));
    const idx = C.buildIndex(st);
    if (!leaveSel.pid) {
      const c = caps.slice().sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0];
      const pr = idx.sched[c.id][1] || idx.sched[c.id][0];
      leaveSel = { pid: c.id, from: pr ? pr.start : 1, to: pr ? pr.start + pr.ndays - 1 : 1 };
    }
    const p = st.pilots.find(x => x.id === leaveSel.pid) || caps[0]; if (!p) return;
    if (!leaveHoles || !leaveHoles.pilot || leaveHoles.pilot.id !== p.id) lvScan();
    const days = lvRange();
    let h = lvFormHtml(p, idx, caps);
    h += lvImpactHtml(p, days);
    h += lvPlanHtml(p, days);
    h += lvHistHtml();
    $('#main').innerHTML = h;
    lvBind(p, idx, caps);
    window.__lv = () => ({ leaveSel, lvReg, leaveHoles, leaveOpts, leaveHist, lvKind });
  }

  function lvFormHtml(p, idx, caps) {
    const days = lvRange(); const reg = lvRegOf(p.id);
    const registered = !!(reg && reg.kind === lvKind && days.every(d => (p.leave || []).includes(d) || reg.days.includes(d)));
    const sel = caps.filter(c => c.id === p.id || C.pilotMatches(c, ui.lvq));
    const cta = registered
      ? '<div class="lvregdone"><span class="okc">✔ 已登记 ' + esc(lvKindTxt(lvKind)) + ' ' + lvSpan(reg.days) + '</span><button class="btn sm" id="lvUndoReg">↶ 撤销登记</button></div>'
      : '<button class="btn primary lvregbtn" id="lvReg">' + (lvKind === 'hold' ? '登记禁飞占位' : '登记请假') + '</button><span class="mut lvregnote">写入后立即生效；缺位可在下方逐个补，也可整体调配</span>';
    return '<div class="panel lvform"><div class="lvfh"><h3>请假单</h3>'
      + '<div class="lvsteps"><span class="on">① 选人与日期</span><i>→</i><span class="' + (registered ? 'on' : '') + '">② 登记</span><i>→</i><span class="' + (registered && leaveHoles && leaveHoles.holes && leaveHoles.holes.length ? '' : (registered ? 'on' : '')) + '">③ 补位</span></div>'
      + '<div class="lvhead-right">' + (leaveHist.length ? '本次操作 ' + leaveHist.length + ' 步 · <button class="btn sm" id="lvUndo">↶ 撤销上一步</button>' : '<span class="mut">本次操作 0 步</span>') + '</div></div>'
      + '<div class="lvrow">'
      + '<div class="lvfield lvwho"><label>人员</label><div class="lvsrch"><input id="lvQ" placeholder="搜索 姓名/工号/级别/拼音" value="' + esc(ui.lvq || '') + '"><span class="mut" id="lvQn">' + sel.length + '/' + caps.length + '</span></div>'
      + '<select id="lvP">' + sel.map(c => '<option value="' + c.id + '"' + (c.id === p.id ? ' selected' : '') + '>' + esc(c.name) + ' · ' + c.rank + ' · ' + c.id + (c.squad ? ' · ' + esc(c.squad) : '') + ' · ' + idx.hours[c.id].toFixed(1) + 'h</option>').join('') + '</select></div>'
      + '<div class="lvfield"><label>类型</label><span class="seg" id="lvKindSeg"><button type="button" data-k="leave" class="' + (lvKind === 'leave' ? 'on' : '') + '">请假</button><button type="button" data-k="hold" class="' + (lvKind === 'hold' ? 'on' : '') + '">禁飞占位</button></span></div>'
      + '<div class="lvfield lvrange"><label>日期</label><b>' + dateOf(days[0]) + (days.length > 1 ? ' – ' + dateOf(days[days.length - 1]) : '') + '</b><span class="mut">共 ' + days.length + ' 天 · 点下方日期条选起止</span></div>'
      + '<div class="lvcta">' + cta + '</div></div>'
      + lvDayStrip(p, idx)
      + lvWhoInfo(p, idx)
      + '</div>';
  }

  function lvDayStrip(p, idx) {
    const fly = new Set(); (idx.sched[p.id] || []).forEach(pr => { for (let d = pr.start; d < pr.start + pr.ndays; d++) if (d >= 1 && d <= C.DAYS) fly.add(d); });
    const lv = new Set((p.leave || []).filter(d => d >= 1 && d <= C.DAYS));
    const sb = new Set(((st.standby || {})[p.id] || []).filter(d => d >= 1 && d <= C.DAYS));
    const pf = new Set((p.prefs || []).filter(d => d >= 1 && d <= C.DAYS));
    const sm = new Set(((st.sim || {})[p.id] || []).filter(d => d >= 1 && d <= C.DAYS));
    const a = Math.min(leaveSel.from, leaveSel.to), b = Math.max(leaveSel.from, leaveSel.to);
    const buckets = (C.monthBuckets && C.monthBuckets()) || [{ key: 'all', label: '', days: Array.from({ length: C.DAYS }, (_, i) => i + 1) }];
    const chipFor = d => {
      const cls = ['lvday'];
      if ([0, 6].includes(dow(d))) cls.push('we');
      if (d >= a && d <= b) cls.push('sel');
      if (fly.has(d)) cls.push('fly');
      if (lv.has(d)) cls.push('lv');
      if (sm.has(d)) cls.push('sim');
      if (sb.has(d)) cls.push('sb');
      if (pf.has(d)) cls.push('pref');
      const L = C.dayLabel ? C.dayLabel(d) : { d, text: '11/' + lvPad(d) };
      const tip = [dateOf(d) + ' 周' + WK[dow(d)] + (fly.has(d) ? ' · 有任务' : ''), lv.has(d) ? '已请假' : '', sb.has(d) ? '备份' : '', pf.has(d) ? '意向休息' : '', sm.has(d) ? '禁飞占位' : ''].filter(Boolean).join(' · ');
      return '<button type="button" class="' + cls.join(' ') + '" data-d="' + d + '" style="grid-column:' + L.d + '" title="' + esc(tip) + '">' + L.d + '</button>';
    };
    // 日期条：按自然月分行（monthBuckets），与个人审计 v668 一致；起止仍用网格日 data-d
    let h = '<div class="lvdays-wrap pa-days-wrap"><div id="lvDays" class="pa-months">';
    buckets.forEach(b => {
      const d0 = b.days[0], d1 = b.days[b.days.length - 1];
      const L0 = C.dayLabel ? C.dayLabel(d0) : null, L1 = C.dayLabel ? C.dayLabel(d1) : null;
      const span = L0 && L1 ? (L0.d + '–' + L1.d + '日 · 网格 ' + d0 + '–' + d1) : (d0 + '–' + d1);
      h += '<div class="pa-mrow" data-mkey="' + esc(b.key || '') + '">'
        + '<div class="pa-mlab" title="' + esc(span) + '">' + esc(b.label || '') + '</div>'
        + '<div class="lvdays">' + b.days.map(chipFor).join('') + '</div></div>';
    });
    h += '</div><div class="lvlegend"><span><i class="lvlg fly"></i>有任务</span><span><i class="lvlg sel"></i>本次请假</span><span><i class="lvlg lv"></i>已请假</span><span><i class="lvlg sb"></i>备份</span><span><i class="lvlg pref"></i>意向休息</span><span class="mut">点击：第一次点起始日，第二次点结束日</span></div></div>';
    return h;
  }

  function lvWhoInfo(p, idx) {
    const tasks = (idx.sched[p.id] || []).map(pr => '<a class="lvpr" data-f="' + pr.start + '" data-t="' + (pr.start + pr.ndays - 1) + '">' + pr.id + '(' + pr.start + (pr.ndays > 1 ? '–' + (pr.start + pr.ndays - 1) : '') + '日)</a>').join(' ');
    const reg = lvRegOf(p.id);
    return '<div class="lvpinfo"><span class="lab">任务</span>' + (tasks || '<span class="mut">本月无任务</span>')
      + '<span class="lab">已请假</span>' + ((p.leave || []).join(',') || '<span class="mut">无</span>')
      + '<span class="lab">意向休息</span>' + ((p.prefs || []).join(',') || '<span class="mut">无</span>')
      + '<span class="lab">备份</span>' + (((st.standby || {})[p.id] || []).join(',') || '<span class="mut">无</span>')
      + '</div>';
  }

  function lvImpactHtml(p, days) {
    if (!leaveHoles || !leaveHoles.holes) return '';
    const holes = leaveHoles.holes || [];
    const reg = lvRegOf(p.id);
    const filled = new Map();   // pairingId -> 本单已补的记录
    (st.fills || []).filter(f => !f.undone && f.leavePilotId === p.id && (f.leaveDays || []).some(d => days.includes(d)))
      .forEach(f => filled.set(f.pairingId, f));
    const holeIds = new Set(holes.map(h => h.id));
    const total = new Set([...holes.map(h => h.id), ...filled.keys()]).size;
    const done = Math.max(0, total - holes.length);
    const pct = total ? Math.round(done / total * 100) : 100;
    let head = '<div class="panel lvimpact"><div class="lvih"><h3>影响面</h3>'
      + '<span class="lviprog"><span class="lvibar"><i style="width:' + pct + '%"></i></span>已补 ' + done + '/' + total + '</span>'
      + '<span class="mut">' + (reg ? '已登记' : '预览') + ' · 扫描 ' + lvScanMs + ' ms</span></div>';
    if (!total) return head + '<div class="lvok">✔ 所选日期内该人员无执勤任务，只需登记' + lvKindTxt(lvKind) + '，无需补位。</div></div>';
    if (!holes.length) return head + '<div class="lvok">✔ ' + total + ' 个座位已全部补齐 · <a href="#" id="lvGoGantt">去人员视图查看</a> · <a href="#" id="lvNewReg">再登记一单</a></div>'
      + '<div class="lvhgrid">' + [...filled.values()].map(lvFilledCard).join('') + '</div></div>';
    head += '<div class="mut lvimphint">' + (reg ? '以下座位因该人员' + lvKindTxt(lvKind) + '而空缺，点候选人即可补位（立即写入，可撤销）。' : '登记后会空缺以下 ' + holes.length + ' 个座位；可先点候选人直接完成「登记 + 补位」。') + '</div>';
    head += '<div class="lvhgrid">' + holes.map((hh, hi) => lvHoleCard(hh, hi)).join('')
      + [...filled.values()].filter(f => !holeIds.has(f.pairingId)).map(lvFilledCard).join('') + '</div></div>';
    return head;
  }

  function lvFilledCard(f) {
    const pr = st.pairings.find(x => x.id === f.pairingId);
    const info = pr ? '11/' + lvPad(pr.start) + ' 起 ' + pr.ndays + ' 天 · ' + esc(pr.ac) + ' · ' + C.pairingHours(pr).toFixed(1) + 'h' : '';
    return '<div class="lvhole done"><div class="lvh1"><b>' + esc(f.pairingId) + '</b><span class="lvseat ok">' + esc(f.slotName || '') + '位</span>'
      + '<span class="mut">' + info + '</span><span class="lvdone">✔ 已补：' + esc(f.toName || '') + '</span></div></div>';
  }

  function lvHoleCard(hh, hi) {
    const pr = st.pairings.find(x => x.id === hh.id);
    const cands = hh.candidates || [];
    const shown = lvAllCands ? cands : cands.slice(0, 4);
    const chips = (hh.legChips || []).map(l => '<span class="legchip">D' + l.d + ' ' + esc(l.flt) + ' <span class="' + (l.spFrom ? 'sp' : '') + '">' + esc(l.fromName) + '</span>-<span class="' + (l.spTo ? 'sp' : '') + '">' + esc(l.toName) + '</span></span>').join('');
    let candHtml = shown.map((c, ci) => {
      const tip = [c.reasons && c.reasons.length ? '冲突：' + c.reasons.join('；') : '', c.warn ? '提示：' + c.warn : '', c.prefHit && c.prefHit.length ? '占意向休息 ' + c.prefHit.join(',') + ' 日' : ''].filter(Boolean).join(' | ');
      return '<button type="button" class="lvcand lv-' + c.light + '" data-hi="' + hi + '" data-ci="' + ci + '"' + (c.light === 'red' ? ' disabled' : '') + ' title="' + esc(tip || '合规') + '">'
        + '<span class="clight ' + c.light + '"></span><b>' + esc(c.name) + '</b>'
        + '<span class="lvcm">' + c.rank + ' · ' + c.hoursBefore + '→' + c.hoursAfter + 'h' + (c.fromStandby ? ' · ★备份' : '') + '</span>'
        + '<span class="lvgo">' + (c.light === 'red' ? '不可用' : '补位 →') + '</span></button>';
    }).join('');
    if (!cands.length) {
      let why = '';
      try { const d = C.holeDiagnosis && pr ? C.holeDiagnosis(st, pr, hh.slot) : null; if (d) why = '（' + d.cls + '：' + d.why + '）'; } catch (e) {}
      candHtml = '<div class="lvnone">无直接合规候选' + esc(why) + '，请用下方「整体调配」的链式方案。</div>';
    } else if (!lvAllCands && hh.candidates.length > 4) {
      candHtml += '<button type="button" class="btn sm lvmore" id="lvMoreCand">还有 ' + (hh.candidates.length - 4) + ' 人</button>';
    }
    return '<div class="lvhole"><div class="lvh1"><b>' + escPairOf(hh.id) + '</b><span class="lvseat">' + esc(hh.slotName) + '位</span>'
      + '<span class="mut">11/' + lvPad(hh.start) + ' 起 ' + hh.ndays + ' 天 · ' + esc(hh.ac) + ' · ' + hh.hours + 'h · ' + hh.legs + ' 段 · 机号 ' + (esc((hh.reg || []).join('/')) || '—') + '</span>'
      + '<span class="lvneed">缺 1 人</span></div>'
      + '<div class="lvroute">' + chips + '</div>'
      + '<div class="lvcands"><span class="lab">合规候选</span>' + candHtml + '</div></div>';
  }

  function lvPlanHtml(p, days) {
    if (!leaveHoles || !leaveHoles.holes) return '';
    const holes = leaveHoles.holes;
    if (!holes.length) return '';
    if (!leaveOpts) {
      return '<div class="panel lvplan"><h3>整体调配 <small>一次处理全部 ' + holes.length + ' 个座位（可能含链式调换 / 拆分）</small></h3>'
        + '<div class="lvgenrow"><button class="btn" id="lvGen">生成整体方案</button><span class="mut">按 5 种策略枚举 · 只计算不写入 · 预计 ' + (LITE ? '0.3' : '1.0') + ' 秒</span></div></div>';
    }
    const S = leaveOpts.solutions || [];
    if (!S.length) return '<div class="panel lvplan"><h3>整体调配</h3><div class="note">本次没有可用的整体方案，请逐个补位。</div></div>';
    let i = (lvPlanIdx >= 0 && S[lvPlanIdx]) ? lvPlanIdx : S.findIndex(x => x.recommended);
    if (i < 0) i = 0;
    const sol = S[i];
    const stp = (sol.steps || []).map(x => x.type === 'split'
      ? '<div>· ' + esc(x.pairing) + ' ' + (x.whole ? '整组替换' : '在 ' + esc(C.apName(x.station, st)) + ' 拆分换组') + '</div>'
      : '<div>· ' + esc(x.pairing) + (x.slot ? ' <span class="mut">' + C.SLOT_NAME[x.slot] + '位</span>' : '') + '：'
        + (x.from ? '<span class="diff-del">' + esc(lvName(sol, x.from)) + '</span> → ' : '')
        + (x.type === 'manual' ? '<span class="red">待人工</span>' : '<b>' + esc(lvName(sol, x.to)) + '</b>')
        + (x.chain ? ' <span class="mut">（' + esc(x.chain.pairing) + ' ' + C.SLOT_NAME[x.chain.slot] + '位 ← ' + esc(lvName(sol, x.chain.to)) + '）</span>' : '') + '</div>').join('');
    const ppl = (sol.people || []).map(x => '<div>' + esc(x.name) + ' ' + x.hb.toFixed(1) + 'h → <b class="' + (x.overHard ? 'red' : 'okc') + '">' + x.ha.toFixed(1) + 'h</b>' + (x.overHard ? ' <span class="red">超月上限</span>' : '') + '</div>').join('') || '<div class="mut">—</div>';
    const rows = S.map((x, j) => '<tr class="lvrow' + (j === i ? ' on' : '') + '" data-j="' + j + '"><td><b>' + String.fromCharCode(65 + j) + '</b> ' + esc(x.name) + (x.recommended ? '<span class="rtag">推荐</span>' : '') + '</td>'
      + '<td class="mut">' + (x.steps || []).length + ' 步 · ' + esc((x.steps || []).slice(0, 2).map(s => s.pairing + (s.to ? '→' + lvName(x, s.to) : '')).join('、')) + '</td>'
      + '<td class="' + ((x.unresolved || x.hard) ? 'red' : 'okc') + '">' + (x.unresolved ? x.unresolved + ' 人工' : (x.hard || 0)) + '</td>'
      + '<td class="' + (x.giniD > 0.002 ? 'warnc' : 'okc') + '">' + (x.giniD >= 0 ? '+' : '') + x.giniD.toFixed(4) + '</td>'
      + '<td class="' + (x.prefN ? 'warnc' : '') + '">' + (x.prefN || 0) + '</td></tr>').join('');
    return '<div class="panel lvplan"><div class="lvbh"><h3>整体调配</h3><span class="mut">' + leaveOpts.ms + ' ms · ' + S.length + ' 个方案</span>'
      + '<button class="btn sm lvhead-right" id="lvAllSol">' + (lvPlanOpen ? '收起方案对比' : '对比全部 ' + S.length + ' 个方案') + '</button></div>'
      + (lvPlanOpen ? '<table class="lvtbl"><tr><th>方案</th><th>做法</th><th>硬违规/人工</th><th>基尼 Δ</th><th>占意向休息</th></tr>' + rows + '</table>' : '')
      + '<div class="lvrec"><div class="lvrec-h"><b>方案 ' + String.fromCharCode(65 + i) + ' · ' + esc(sol.name) + '</b>' + (sol.recommended ? '<span class="rtag">引擎推荐</span>' : '') + '<span class="mut">' + esc(sol.desc || '') + '</span></div>'
      + '<div class="lvrec-grid"><div><span class="lab">调整</span>' + (stp || '<span class="mut">无需调整</span>') + '</div>'
      + '<div><span class="lab">工时变化</span>' + ppl + '</div>'
      + '<div><span class="lab">影响</span>'
      + '<div class="' + ((sol.hard > (sum ? sum.hard : 0)) ? 'red' : 'okc') + '">硬性违规 ' + (sum ? sum.hard : 0) + ' → <b>' + sol.hard + '</b>' + (sol.fdpAfter != null ? (sol.fdpAfter ? ' · <span class="red">执勤仍超限 ' + sol.fdpAfter + ' 日</span>' : ' · ✔ 执勤不超限') : '') + '</div>'
      + '<div class="' + (sol.prefN ? 'warnc' : 'okc') + '">' + (sol.prefN ? '占意向休息 ' + sol.prefN + ' 天' : '✔ 不占意向休息') + '</div>'
      + '<div class="mut">涉及备份 ' + (sol.steps || []).filter(s => s.type === 'standby' || (s.chain && s.chain.fromStandby)).length + ' 人 · 链式 ' + (sol.steps || []).filter(s => s.type === 'chain').length + ' 处</div></div></div>'
      + '<div class="lvrec-actions"><button class="btn primary" id="lvApply" ' + (!sol.state || (sol.unresolved && sol.unresolved > 0) ? 'disabled' : '') + '>应用这个方案' + (sol.unresolved ? '（含 ' + sol.unresolved + ' 处待人工）' : '') + '</button>'
      + '<button class="btn sm" id="lvExp">导出方案</button><span class="mut">应用后留在本页，可继续补位或撤销</span></div></div></div>';
  }

  function lvHistHtml() {
    const rows = leaveHist.slice().reverse().map((x, k) => {
      const idx = leaveHist.length - 1 - k;
      return '<div class="lvhline"><span class="mut">' + esc(x.time) + '</span><span class="lvhlab">' + esc(x.label) + '</span><button class="btn sm lvundo-step" data-i="' + idx + '">撤销到此步</button></div>';
    }).join('');
    return '<div class="panel lvhistp"><div class="lvbh"><h3>本次操作</h3><span class="mut">' + (leaveHist.length ? '共 ' + leaveHist.length + ' 步，可回滚到任意一步' : '尚无操作') + '</span></div>'
      + (rows || '<div class="mut">登记请假、补位、整体应用都会记录在这里。</div>')
      + '<details class="lvmore-hist"><summary>补位历史（' + ((st.fills || []).filter(f => !f.undone).length) + ' 条）</summary>' + fillsHistoryHtml() + '</details></div>';
  }

  // ---------------- 交互绑定 ----------------
  function lvBind(p, idx, caps) {
    const regen = () => { if (leaveSel.to < leaveSel.from) leaveSel.to = leaveSel.from; leaveOpts = null; lvPlanIdx = -1; lvScan(); rLeave(); };
    // 人员搜索：只重绘下拉，不整页重排
    const q = $('#lvQ'), sel = $('#lvP'), qn = $('#lvQn');
    if (q && sel) {
      const draw = () => {
        const list = caps.filter(c => c.id === p.id || C.pilotMatches(c, ui.lvq));
        sel.innerHTML = list.map(c => '<option value="' + c.id + '"' + (c.id === p.id ? ' selected' : '') + '>' + esc(c.name) + ' · ' + c.rank + ' · ' + c.id + (c.squad ? ' · ' + esc(c.squad) : '') + ' · ' + idx.hours[c.id].toFixed(1) + 'h</option>').join('');
        if (qn) qn.textContent = list.length + '/' + caps.length;
      };
      bindSearchInput(q, v => { ui.lvq = v; draw(); });
      q.onkeydown = e => { if (e.key === 'Enter') { const m = caps.find(c => c.id !== p.id && C.pilotMatches(c, ui.lvq)); if (m) { leaveSel.pid = m.id; leaveOpts = null; lvPlanIdx = -1; lvScan(); rLeave(); } } };
    }
    if ($('#lvP')) $('#lvP').onchange = e => { leaveSel.pid = e.target.value; leaveOpts = null; lvPlanIdx = -1; lvAllCands = false; lvScan(); rLeave(); };
    document.querySelectorAll('#lvKindSeg button').forEach(b => b.onclick = () => { lvKind = b.dataset.k; lvScan(); rLeave(); });
    if ($('#lvReg')) $('#lvReg').onclick = lvDoRegister;
    if ($('#lvUndo')) $('#lvUndo').onclick = undoLeave;
    if ($('#lvUndoReg')) $('#lvUndoReg').onclick = () => {
      const reg = lvRegOf(p.id); if (!reg) return;
      const i = leaveHist.length - 1;
      if (i >= 0 && (leaveHist[i].label || '').indexOf(lvKindTxt(reg.kind)) >= 0) { lvReg = null; undoToHist(i); return; }
      // 没有可回滚快照：只清登记标记
      lvReg = null; rLeave(); toast('已取消登记标记（排班未改动）');
    };
    // 日期条：两次点击定起止
    document.querySelectorAll('#lvDays .lvday').forEach(b => b.onclick = () => {
      const d = +b.dataset.d;
      if (!lvAnchor) { lvAnchor = d; leaveSel.from = d; leaveSel.to = d; }
      else { leaveSel.from = Math.min(lvAnchor, d); leaveSel.to = Math.max(lvAnchor, d); lvAnchor = null; }
      leaveOpts = null; lvPlanIdx = -1; lvAllCands = false; lvScan(); rLeave();
    });
    document.querySelectorAll('.lvpr').forEach(a => a.onclick = () => { leaveSel.from = +a.dataset.f; leaveSel.to = +a.dataset.t; lvAnchor = null; regen(); });
    document.querySelectorAll('.lvcand').forEach(b => b.onclick = () => lvApplyCand(+b.dataset.hi, +b.dataset.ci));
    if ($('#lvMoreCand')) $('#lvMoreCand').onclick = () => { lvAllCands = true; rLeave(); };
    if ($('#lvGen')) $('#lvGen').onclick = () => {
      const btn = $('#lvGen'); btn.disabled = true; btn.textContent = '正在计算…';
      setTimeout(() => {
        const days = lvRange();
        leaveOpts = C.leaveOptions(st, leaveSel.pid, days, { max: 5 });
        lvPlanIdx = -1; lvPlanOpen = false; rLeave();
      }, 30);
    };
    if ($('#lvAllSol')) $('#lvAllSol').onclick = () => { lvPlanOpen = !lvPlanOpen; rLeave(); };
    document.querySelectorAll('.lvrow').forEach(tr => tr.onclick = () => { lvPlanIdx = +tr.dataset.j; rLeave(); });
    if ($('#lvApply')) $('#lvApply').onclick = () => lvApplyPlan(lvPlanIdx >= 0 ? lvPlanIdx : Math.max(0, (leaveOpts.solutions || []).findIndex(x => x.recommended)));
    if ($('#lvExp')) $('#lvExp').onclick = () => {
      const i = lvPlanIdx >= 0 ? lvPlanIdx : Math.max(0, (leaveOpts.solutions || []).findIndex(x => x.recommended));
      const sol = leaveOpts.solutions[i]; if (!sol) return;
      exportSolPlan(sol, i, { kind: 'leave', leave: { pilotId: leaveOpts.pilot.id, pilotName: leaveOpts.pilot.name, days: leaveOpts.days }, date: leaveOpts.days[0], pairingId: (leaveOpts.affected[0] || {}).id || '' });
    };
    document.querySelectorAll('.lvundo-step').forEach(b => b.onclick = () => { lvReg = null; undoToHist(+b.dataset.i); });
    if ($('#lvGoGantt')) $('#lvGoGantt').onclick = e => { e.preventDefault(); tab = 'gantt'; location.hash = 'gantt'; render(); };
    if ($('#lvNewReg')) $('#lvNewReg').onclick = e => { e.preventDefault(); lvReg = null; leaveOpts = null; rLeave(); };
  }

  // 补位：未登记则先登记，再写入候选人
  function lvApplyCand(hi, ci) {
    if (!leaveHoles || !leaveHoles.holes[hi]) return;
    const hh = leaveHoles.holes[hi]; const c = (hh.candidates || [])[ci]; if (!c || c.light === 'red') return;
    const days = leaveHoles.days.slice(); const pid = leaveHoles.pilot.id;
    const p = st.pilots.find(x => x.id === pid); if (!p) return;
    const snap = JSON.stringify(st);
    const reg = lvRegisterCore(pid, days, 'leave');
    if (!reg || !reg.ok) { toast('登记失败：' + esc((reg && reg.reason) || '未知')); return; }
    const pr = st.pairings.find(x => x.id === hh.id); if (!pr) return;
    pr.crew[hh.slot] = c.id;
    if (st.standby && st.standby[c.id]) st.standby[c.id] = st.standby[c.id].filter(d => !C.daysTouched(pr, st).includes(d));
    leaveHist.push({ snap, label: p.name + ' 请假 ' + lvSpan(days) + ' · ' + pairLabelOf(hh.id) + ' ' + hh.slotName + '←' + c.name, time: new Date().toTimeString().slice(0, 8) });
    recordFillsFromHole(hh, p, days, c, 'hole');
    lvReg = { pid, days: days.slice(), kind: 'leave', t: Date.now() };
    ui.hl = { pairings: new Set([hh.id]), pilots: new Set([pid, c.id]), days, ok: (typeof crewComplianceOk === 'function' ? crewComplianceOk(pr) : false) };
    leaveOpts = null; lvPlanIdx = -1;
    lvScan(); sum = C.summarize(st); renderKpis(); updateIssueBadge(); save(); rLeave();
    const left = leaveHoles && leaveHoles.holes ? leaveHoles.holes.length : 0;
    toast('✔ ' + escPairOf(hh.id) + ' ' + esc(hh.slotName) + '位：<b>' + esc(c.name) + '</b> 已补位' + (left ? ' · 还剩 ' + left + ' 个座位' : ' · <span class="okc">座位已补齐</span>'), 4200);
  }

  function lvApplyPlan(i) {
    const o = leaveOpts; const sol = o && o.solutions ? o.solutions[i] : null;
    if (!sol) return;
    if (!sol.state) { toast('该方案无法直接应用'); return; }
    const days = o.days.slice(); const pid = o.pilot.id;
    const snap = JSON.stringify(st); const prevFills = JSON.parse(JSON.stringify(st.fills || []));
    leaveHist.push({ snap, label: o.pilot.name + ' 请假 ' + lvSpan(days) + ' · 方案「' + sol.name + '」', time: new Date().toTimeString().slice(0, 8) });
    st = sol.state; st.fills = prevFills;
    recordFillsFromSol(sol, { id: pid }, days, sol.name);
    lvReg = { pid, days: days.slice(), kind: 'leave', t: Date.now() };
    const prs = (sol.steps || []).flatMap(x => [x.pairing, x.newPairing, x.chain && x.chain.pairing]).filter(Boolean);
    const pls = [pid, ...(sol.people || []).map(x => x.id)];
    ui.hl = { pairings: new Set(prs), pilots: new Set(pls), days, ok: true };
    leaveOpts = null; lvPlanIdx = -1; lvPlanOpen = false;
    lvScan(); sum = C.summarize(st); renderKpis(); updateIssueBadge(); save(); rLeave();
    const left = leaveHoles && leaveHoles.holes ? leaveHoles.holes.length : 0;
    toast('✔ 已应用「' + esc(sol.name) + '」' + (left ? ' · 仍有 ' + left + ' 个座位待补' : ' · <span class="okc">座位已补齐</span>') + ' <a href="#" id="lvGoGantt2" style="color:#9fd4ff">去人员视图查看</a>', 5000);
    const a = $('#lvGoGantt2'); if (a) a.onclick = e => { e.preventDefault(); tab = 'gantt'; location.hash = 'gantt'; render(); };
  }

  // 兼容旧入口名
  function applyHoleCand() { if (holePrev) lvApplyCand(holePrev.hi, holePrev.ci); }
  function undoLeave() {
    const x = leaveHist.pop(); if (!x) return;
    st = JSON.parse(x.snap); ui.hl = null; leaveOpts = null; leaveHoles = null; holePrev = null; lvReg = null;
    sum = C.summarize(st); renderKpis(); updateIssueBadge(); save(); render();
    toast('已撤销：' + esc(x.label));
  }
