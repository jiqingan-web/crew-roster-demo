/* 机组排班助手 - 界面 */
(function () {
  const C = window.RosterCore, CH = window.Charts;
  const KEY = 'crewRoster.v2';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GCOL = { '教员': '#e6a23c', '机长': '#3ea6ff', '新机长': '#a78bfa', '副驾驶': '#2ecc8f' };
  const WK = ['日', '一', '二', '三', '四', '五', '六'];
  const dow = d => new Date(C.YEAR, C.MONTH - 1, d).getDay();
  let st, sum, tab = 'gantt', lastSolveMs = null, leaveResult = null;
  const ui = { gq: '', gg: '全部', tf: '全部', tq: '', cw: 150, fit: false, rq: '', rg: '全部', rs: '全部', ra: '全部', rh: '全部' };
  const CW_MIN = 6, CW_MAX = 240, BASE_CW = 150;
  const ZSTEPS = [4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 67, 80, 90, 100, 110, 125, 150, 160];

  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.pilots) { st = s; st.settings = Object.assign(C.defaultSettings(), st.settings); C.migrateSettings(st.settings); C.migrateDelays(st); C.ensureAircraftRegs(st); C.migratePilots(st); st.fills = st.fills || []; return; } } catch (e) {} reset(false); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function reset(r) { st = C.generateSample(); lastSolveMs = null; save(); if (r) refresh(); }
  function refresh() { sum = C.summarize(st); renderKpis(); render(); save(); }
  function toast(m, ms) { const t = $('#toast'); t.innerHTML = m; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms || 2600); }
  const pm = () => { const m = {}; st.pilots.forEach(p => m[p.id] = p); return m; };
  const pill = r => `<span class="pill r-${C.rankGroup(r)}">${esc(r)}</span>`;
  const dateOf = d => `11/${String(d).padStart(2, '0')}`;

  function ensureFills() { if (!st.fills) st.fills = []; }
  function fillsOf(prId) { return (st.fills || []).filter(f => f.pairingId === prId && !f.undone); }
  function fillBadge(prId) { return fillsOf(prId).length ? '<span class="fbadge" title="补位：' + fillsOf(prId).map(f => (f.toName || '') + '←' + (f.fromName || '')).join('；') + '">补位</span>' : ''; }
  function demoTag(pr) { return pr && pr.demoAnomaly ? '<span class="demotag" title="' + esc(pr.demoAnomalyNote || '') + '">演示异常</span>' : ''; }
  function recordFillsFromHole(hh, leavePilot, days, cand, source) {
    ensureFills();
    const rec = { id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 99),
      time: new Date().toTimeString().slice(0, 8), ts: Date.now(),
      pairingId: hh.id, slot: hh.slot, slotName: hh.slotName || C.SLOT_NAME[hh.slot],
      leavePilotId: leavePilot.id, leavePilotName: leavePilot.name, leaveDays: (days || []).slice(),
      fromId: leavePilot.id, fromName: leavePilot.name,
      toId: cand.id, toName: cand.name, toRank: cand.rank || '',
      source: source || 'hole', undone: false };
    st.fills.push(rec); return rec;
  }
  function recordFillsFromSol(sol, leavePilot, days, planName) {
    ensureFills();
    const lp = leavePilot || { id: (cardCtx.focus || [])[0], name: '' };
    if (lp.id && !lp.name) { const p = st.pilots.find(x => x.id === lp.id); if (p) lp.name = p.name; }
    const recs = [];
    (sol.steps || []).forEach(x => {
      if (x.type === 'split' || x.type === 'manual' || !x.pairing) return;
      if (x.to) {
        const toP = (sol.state || st).pilots.find(p => p.id === x.to) || { id: x.to, name: x.to, rank: '' };
        const fromP = x.from ? ((sol.state || st).pilots.find(p => p.id === x.from) || { id: x.from, name: x.from }) : lp;
        recs.push({ id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 99),
          time: new Date().toTimeString().slice(0, 8), ts: Date.now(),
          pairingId: x.pairing, slot: x.slot, slotName: x.slot ? C.SLOT_NAME[x.slot] : '',
          leavePilotId: lp.id, leavePilotName: lp.name, leaveDays: (days || []).slice(),
          fromId: fromP.id, fromName: fromP.name, toId: toP.id, toName: toP.name, toRank: toP.rank || '',
          source: 'plan', planName: planName || sol.name, undone: false });
      }
      if (x.chain && x.chain.to) {
        const toP = (sol.state || st).pilots.find(p => p.id === x.chain.to) || { id: x.chain.to, name: x.chain.to };
        const fromP = x.chain.from ? ((sol.state || st).pilots.find(p => p.id === x.chain.from) || { id: x.chain.from, name: x.chain.from }) : {};
        recs.push({ id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 99),
          time: new Date().toTimeString().slice(0, 8), ts: Date.now(),
          pairingId: x.chain.pairing, slot: x.chain.slot, slotName: x.chain.slot ? C.SLOT_NAME[x.chain.slot] : '',
          leavePilotId: lp.id, leavePilotName: lp.name, leaveDays: (days || []).slice(),
          fromId: fromP.id, fromName: fromP.name, toId: toP.id, toName: toP.name, toRank: toP.rank || '',
          source: 'plan-chain', planName: planName || sol.name, undone: false });
      }
    });
    recs.forEach(r => st.fills.push(r)); return recs;
  }
  function fillsHistoryHtml() {
    ensureFills();
    const rows = (st.fills || []).slice().reverse();
    if (!rows.length && !leaveHist.length) return '<div class="note">暂无补位记录。在「请假调配 · 空洞换人」应用补位后将显示在此。</div>';
    let h = '<table class="solt"><tr><th>时间</th><th>请假人</th><th>请假日</th><th>任务</th><th>座位</th><th>原成员</th><th>补位人</th><th>来源</th><th></th></tr>';
    if (rows.length) {
      h += rows.map((f, ri) => {
        const src = f.source === 'hole' ? '空洞换人' : f.source === 'plan-chain' ? '链式整案' : (f.planName ? '方案「' + esc(f.planName) + '」' : '整案');
        return `<tr class="${f.undone ? 'mut' : ''}"><td>${esc(f.time)}</td><td>${esc(f.leavePilotName || '—')}</td><td>${(f.leaveDays || []).join(',') || '—'}</td>
          <td><b>${esc(f.pairingId)}</b>${fillBadge(f.pairingId)}</td><td>${esc(f.slotName || f.slot || '')}</td>
          <td>${esc(f.fromName || '—')}</td><td><b>${esc(f.toName || '—')}</b> ${f.toRank ? pill(f.toRank) : ''}</td>
          <td>${src}${f.undone ? ' · 已撤销' : ''}</td>
          <td>${f.undone ? '' : `<button class="btn sm fillUndoOne" data-fid="${esc(f.id)}">撤销此步</button>`}</td></tr>`;
      }).join('');
    } else {
      h += leaveHist.slice().reverse().map(x => `<tr><td>${esc(x.time)}</td><td colspan="7">${esc(x.label)}</td><td></td></tr>`).join('');
    }
    h += '</table>';
    if (leaveHist.length) h += `<div class="flex" style="margin-top:8px"><button class="btn" id="fillUndoLast">↶ 撤销最近一次调配（${leaveHist.length}）</button>
      <span class="mut">撤销将恢复应用前的排班快照（含补位标记）</span></div>`;
    return h;
  }
  function undoToHist(i) {
    if (i < 0 || i >= leaveHist.length) return;
    const x = leaveHist[i];
    st = JSON.parse(x.snap); st.fills = st.fills || [];
    leaveHist = leaveHist.slice(0, i);
    ui.hl = null; leaveOpts = null; leaveHoles = null; holePrev = null;
    refresh(); toast('已撤销：' + esc(x.label));
  }
  function undoFillById(fid) {
    // 找到对应 leaveHist 中含此补位的最近快照：简化为按 fills 顺序匹配 hist 栈顶逐步撤销直到该 fill 消失
    ensureFills();
    const f = st.fills.find(x => x.id === fid);
    if (!f || f.undone) return;
    // 从后往前找 leaveHist，恢复到「该 fill 写入前」的快照：hist 在写入 fill 前 push 了 snap
    // 我们在 apply 时先 snap 再 mutate 再 push hist；fills 在 mutate 后写入，故 hist.snap 不含该 fill
    // 找最后一个 label 含 pairing+toName 的 hist 项
    let idx = -1;
    for (let i = leaveHist.length - 1; i >= 0; i--) {
      const lb = leaveHist[i].label || '';
      if (lb.includes(f.pairingId) && (lb.includes(f.toName) || lb.includes(f.leavePilotName || ''))) { idx = i; break; }
    }
    if (idx < 0) { // fallback: mark undone only
      f.undone = true; save(); render(); toast('已标记撤销（无匹配快照，机组未回滚）'); return;
    }
    undoToHist(idx);
  }


  function apHtml(c) { const n = C.apName(c, st); return C.isSpecial(c, st) ? `<span class="red">${esc(n)}</span>` : esc(n); }
  function dayChains(pr) { const out = []; for (let d = 1; d <= pr.ndays; d++) { const ls = pr.legs.filter(l => l.d === d); if (!ls.length) continue;
    out.push({ d, html: `D${d} ${[ls[0].from, ...ls.map(l => l.to)].map(apHtml).join('-')} ${C.fmtT(ls[0].dep)}-${C.fmtT(ls[ls.length - 1].arr)}`, ls }); } return out; }
  function crewTxt(pr, m) { m = m || pm(); return ['C', 'F', 'T'].map(s => `${C.SLOT_NAME[s]} ${pr.crew[s] && m[pr.crew[s]] ? esc(m[pr.crew[s]].name) : '<span class="warnc">空缺</span>'}`).join(' / '); }
  const violByPairing = () => { const v = {}; sum.violations.filter(x => x.level === 'hard' && x.pairing).forEach(x => (v[x.pairing] = v[x.pairing] || []).push(x.msg)); return v; };

  function renderKpis() {
    const hb = sum.hard ? 'bad' : 'good';
    $('#kpis').innerHTML = `<span>任务<b>${sum.total}</b></span><span class="${sum.coverage < 1 ? 'bad' : 'good'}">满员率<b>${(sum.coverage * 100).toFixed(1)}%</b></span>
      <span class="${hb}">硬性违规<b>${sum.hard}</b></span><span>工时区间<b>${sum.all.min.toFixed(0)}–${sum.all.max.toFixed(0)}h</b></span><span>意向休息满足<b>${(sum.prefRate * 100).toFixed(1)}%</b></span>`;
  }
  function render() {
    document.querySelectorAll('#tabs>button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    ({ ops: rOps, gantt: rGantt, roster: rRoster, tasks: rTasks, report: rReport, leave: rLeave, fills: rFills, duty: rDuty, welfare: rWelfare, data: rData, settings: rSettings })[tab]();
  }


  // ---------------- 运营看板 ----------------
  function rOps() {
    const m = C.opsMetrics(st); const S = st.settings;
    const kpis = [
      ['剩余运力', m.remainHours.toFixed(0) + 'h', `法规上限 ${m.hardMaxHours}h × ${m.nPilots} 人 − 已排；已用 ${(m.usedPct * 100).toFixed(1)}%`],
      ['人机比', m.pilotsPerAircraft, `${m.nPilots} 人 / ${m.nAircraft} 机`],
      ['人均轮挡', m.blockPerPilot + 'h', '总轮挡 ÷ 飞行员'],
      ['单机轮挡', m.blockPerAircraft + 'h', '总轮挡 ÷ 机号'],
      ['飞机利用率', m.aircraftUtilPct + '%', `轮挡 ÷ (机数×${C.DAYS}天×${m.opsDayWindowH}h)`],
      ['未满员任务', m.unfilled, m.unfilled ? m.unfilledIds.join('、') : '全部满员']
    ];
    let h = `<div class="panel"><h3>运营看板 <small>基于当前排班快照 · 机队按本月出现机号（示例机队模板 ${m.fleetTemplate} 架）</small></h3>
      <div class="opskpi">${kpis.map(([a, b, c]) => `<div class="okpi"><div class="olab">${a}</div><div class="oval">${b}</div><div class="omut">${esc(c)}</div></div>`).join('')}</div></div>`;
    h += `<div class="grid g2">
      <div class="panel"><h3>运力与工时</h3>
        ${CH.bars([
          { label: '已排小时', value: m.assignedHours, color: '#3ea6ff' },
          { label: '剩余运力', value: m.remainHours, color: '#2ecc8f' },
          { label: '总轮挡', value: m.blockHours, color: '#a78bfa' }
        ], { w: 520, h: 200, values: true })}
        <div class="note">超法规上限人数：${m.overHardPilots} · 公式：剩余运力 = Σ max(0, ${m.hardMaxHours} − 个人已排小时)</div></div>
      <div class="panel"><h3>人机效能</h3>
        ${CH.bars([
          { label: '人均轮挡h', value: m.blockPerPilot, color: '#3ea6ff' },
          { label: '单机轮挡h', value: m.blockPerAircraft, color: '#e6a23c' },
          { label: '人机比', value: m.pilotsPerAircraft, color: '#2ecc8f' },
          { label: '机日航段', value: m.legsPerAcDay, color: '#a78bfa' }
        ], { w: 520, h: 200, values: true })}
        <div class="note">利用率 ${m.aircraftUtilPct}% = ${m.blockHours}h ÷ (${m.nAircraft} × ${C.DAYS} × ${m.opsDayWindowH}h)。日窗口可在设置中改 opsDayWindowH。</div></div></div>`;
    const riskItems = [
      { label: '超限', value: m.fdpRisk.over, color: '#ff5a6a' },
      { label: '高风险', value: m.fdpRisk.high, color: '#ff8a5a' },
      { label: '中风险', value: m.fdpRisk.med, color: '#e6a23c' },
      { label: '低风险', value: m.fdpRisk.low, color: '#2ecc8f' }
    ];
    h += `<div class="grid g2">
      <div class="panel"><h3>执勤风险（值勤日）</h3>${CH.bars(riskItems, { w: 520, h: 200, values: true })}
        <div class="note">高/中/超限合计 ${m.fdpRiskDays} 个值勤日</div></div>
      <div class="panel"><h3>备份与请假</h3>
        ${CH.bars([
          { label: '备份需求人日', value: m.standbyNeed, color: '#6b4a12' },
          { label: '已排备份', value: m.standbyUsed, color: '#e6a23c' },
          { label: '备份缺口', value: m.standbyLeft, color: m.standbyLeft ? '#ff5a6a' : '#2ecc8f' },
          { label: '请假人日', value: m.leavePersonDays, color: '#a78bfa' }
        ], { w: 520, h: 200, values: true })}</div></div>`;
    h += `<div class="panel"><h3>焦点日 11/${String(m.focusDate).padStart(2, '0')} <small>取执勤风险条目最多的一天</small></h3>
      <div class="opskpi">
        <div class="okpi"><div class="olab">当日未满员</div><div class="oval">${m.day.unfilled}</div></div>
        <div class="okpi"><div class="olab">当日风险值勤</div><div class="oval">${m.day.fdpRisk}</div></div>
        <div class="okpi"><div class="olab">当日备份</div><div class="oval">${m.day.standby}</div></div>
        <div class="okpi"><div class="olab">当日请假</div><div class="oval">${m.day.leave}</div></div>
      </div></div>`;
    h += `<div class="panel"><h3>指标公式</h3><table class="solt"><tr><th>指标</th><th>公式</th></tr>
      ${Object.entries(m.formulas).map(([k, v]) => `<tr><td>${esc({ remain: '剩余运力', pilotsPerAc: '人机比', blockPerPilot: '人均轮挡', blockPerAc: '单机轮挡', util: '飞机利用率', legsPerAcDay: '机日航段' }[k] || k)}</td><td>${esc(v)}</td></tr>`).join('')}
      </table></div>`;
    $('#main').innerHTML = h;
  }

  // ---------------- 人员视图 ----------------
  function fitCw(days, nw) { const w = ($('#main').clientWidth || innerWidth) - 40 - (nw || 250); return Math.max(CW_MIN, Math.min(CW_MAX, Math.floor(w / days))); }
  const NW = () => ui.fit || ui.cw < 40 ? 170 : 250;
  function setZoom(cw, anchorX, fit) {
    ui.fit = !!fit;
    const g = $('.gwrap'); cw = Math.max(CW_MIN, Math.min(CW_MAX, Math.round(cw)));
    let frac = 0, ax = 0, top = 0;
    if (g) { ax = anchorX == null ? (g.clientWidth - NW()) / 2 : Math.max(0, anchorX - NW()); frac = (g.scrollLeft + ax) / (ui.cw * C.DAYS); top = g.scrollTop / Math.max(1, g.scrollHeight); }
    ui.cw = cw; rGantt();
    const g2 = $('.gwrap'); if (g2) { g2.scrollLeft = frac * ui.cw * C.DAYS - ax; g2.scrollTop = top * g2.scrollHeight; }
  }
  document.addEventListener('click', e => { const m = $('#zMenu'); if (m && !e.target.closest('#zoomw')) m.classList.add('hidden'); });
  let _rz; addEventListener('resize', () => { clearTimeout(_rz); _rz = setTimeout(() => { if (tab === 'gantt' && st) { ui.fitAvail = 0; if (ui.fit) ui.cw = fitCw(C.DAYS, 170); rGantt(); } }, 150); });
  function rGantt() {
    const cw = ui.cw, nw = NW(); let lvl = cw >= 110 ? 'full' : cw >= 40 ? 'mid' : cw >= 16 ? 'small' : 'tiny';
    let rh = { full: 66, mid: 40, small: 18, tiny: 9 }[lvl]; const m = pm(); const V = violByPairing();
    const order = { '教员': 0, '机长': 1, '新机长': 2, '副驾驶': 3 };
    let ps = st.pilots.slice().sort((a, b) => order[C.rankGroup(a.rank)] - order[C.rankGroup(b.rank)] || C.RANK_VAL[b.rank] - C.RANK_VAL[a.rank] || a.id.localeCompare(b.id));
    if (ui.gg !== '全部') ps = ps.filter(p => C.rankGroup(p.rank) === ui.gg);
    if (ui.gq) ps = ps.filter(p => (p.name + p.id + p.rank).includes(ui.gq));
    if (ui.fit) { const avail = ui.fitAvail || Math.max(200, innerHeight - 260); rh = Math.max(6, Math.min(40, Math.floor(avail / Math.max(1, ps.length))));
      lvl = rh >= 40 && cw >= 40 ? 'mid' : rh >= 16 ? 'small' : 'tiny'; }
    const idx = C.buildIndex(st); const S = st.settings;
    let h = `<div class="toolbar"><input id="gq" placeholder="搜索 姓名/员工号/级别" value="${esc(ui.gq)}"> <select id="gg">${['全部', ...C.GROUPS].map(g => `<option ${g === ui.gg ? 'selected' : ''}>${g}</option>`).join('')}</select>
      <div class="legend"><span><i style="background:#1d5fa8"></i>机长位(机)</span><span><i style="background:#14766a"></i>副驾驶位(副)</span><span><i style="background:#5a4a9a"></i>第三人(三)</span>
      <span><i style="background:repeating-linear-gradient(45deg,#2c6a52,#2c6a52 3px,transparent 3px,transparent 6px)"></i>意向休息日</span><span><i style="background:#6b4a12;border:1px solid #e6a23c"></i>备份</span><span><i style="background:repeating-linear-gradient(45deg,#8a3346,#8a3346 3px,transparent 3px,transparent 6px)"></i>请假</span><span class="red">红字=特殊机场</span><span><b class="rbadge r-high">⚠</b>执勤余量&lt;${st.settings.fdpRiskHigh}分 <b class="rbadge r-med">◔</b>&lt;${st.settings.fdpRiskMed}分 <b class="rbadge r-over">⛔</b>超限</span><span><span class="fbadge">补位</span>已补位任务</span><span><span class="demotag">演示异常</span>路演用例</span><span>点击任务条可调整机组</span></div>
      <span class="mut" style="margin-left:auto">${ps.length} 名飞行员 · 2026年11月</span></div>
      ${ui.hl ? `<div class="hlbar">已高亮刚应用的调配（${ui.hl.pilots.size} 人 · 任务 ${[...ui.hl.pairings].join('、')}）<button class="btn sm" id="hlUndo">↶ 撤销</button><button class="btn sm" id="hlClr">清除高亮</button></div>` : ''}
      <div class="gbox"><div class="gwrap z-${lvl}" style="--cw:${cw}px;--rh:${rh}px;--nw:${nw}px"><div class="gt" style="width:${nw + cw * C.DAYS}px"><div class="ghead"><div class="gcell0"><b>${lvl === 'tiny' || lvl === 'small' ? '飞行员' : '员工号 / 姓名 / 级别'}</b><span style="margin-left:auto">${lvl === 'full' || lvl === 'mid' ? '本月小时' : 'h'}</span></div>`;
    for (let d = 1; d <= C.DAYS; d++) h += `<div class="gday ${[0, 6].includes(dow(d)) ? 'we' : ''}" title="${dateOf(d)} 周${WK[dow(d)]}">${cw >= 70 ? `${dateOf(d)} 周${WK[dow(d)]}` : cw >= 26 ? `${d}<br>${WK[dow(d)]}` : cw >= 12 ? d : (d % 5 === 0 || d === 1 ? d : '')}</div>`;
    h += '</div>';
    for (const p of ps) {
      const hr = idx.hours[p.id]; const bad = hr > (S.hardMaxHours || 90); const amb = false;
      const hlr = ui.hl && ui.hl.pilots.has(p.id);
      h += `<div class="grow ${hlr ? 'hlrow' : ''}"><div class="gcell0 lvable" data-pid="${p.id}" title="点击：为此人临时请假 · ${p.id} ${esc(p.name)} ${esc(p.rank)} ${hr.toFixed(1)}h">${lvl === 'tiny' ? '' : `<span class="mut">${p.id}</span>`}<span class="nm">${esc(p.name)}</span>${pill(p.rank)}<span class="hrs ${bad ? "red" : amb ? "warnc" : ""}">${hr.toFixed(1)}h</span></div><div class="gbg">`;
      const sbd = (st.standby || {})[p.id] || [];
      for (let d = 1; d <= C.DAYS; d++) h += (p.leave || []).includes(d) ? '<div class="lv" title="请假"></div>' : (p.prefs || []).includes(d) ? '<div class="pref" title="意向休息日"></div>' : sbd.includes(d) ? `<div class="sb" title="备份（Standby）">${cw >= 30 && rh >= 18 ? '<span>备份</span>' : ''}</div>` : '<div></div>';
      h += '</div>';
      for (const pr of idx.sched[p.id]) {
        const slot = ['C', 'F', 'T'].find(s => pr.crew[s] === p.id);
        const gap = cw >= 20 ? 2 : 0.5; const left = nw + (pr.start - 1) * cw + gap, w = Math.max(1, pr.ndays * cw - 2 * gap);
        const rk = C.pairingRisk(pr, st, st.actuals && Object.keys(st.actuals).length ? st.actuals : null); const rb = RISK_BADGE[rk.risk];
        const badge = rb ? `<span class="rbadge r-${rk.risk}" title="执勤风险：${rb[1]} · D${rk.worst.d} FDP ${C.fmtH(rk.worst.fdp)} / 限制 ${C.fmtH(rk.worst.limit)} · 余量 ${rk.worst.buffer} 分钟">${rb[0]}</span>` : '';
        let inner = '';
        if (lvl === 'full') { const ch = dayChains(pr); inner = `<div class="bh">${badge}${fillBadge(pr.id)}${demoTag(pr)}${pr.id} [${C.SLOT_NAME[slot]}] ${crewTxt(pr, m)}</div><div style="display:flex">${ch.map(c => `<div class="lg" style="width:${cw - 4}px;white-space:normal;max-height:42px">${c.html}<br><span class="mut" style="color:#b9cbe8">${c.ls.map(l => l.flt).join(' ')}</span></div>`).join('')}</div>`; }
        else if (lvl === 'mid') inner = `<div class="bh">${badge}${fillBadge(pr.id)}${demoTag(pr)}${pr.id} [${C.SLOT_NAME[slot]}]</div><div class="lg">${[...new Set(pr.legs.map(l => l.to))].filter(c => c !== pr.legs[0].from).map(apHtml).join('·')}</div>`;
        else if (lvl === 'small' && w >= 34) inner = `<span class="bh">${fillBadge(pr.id)}${pr.id}</span>`;
        h += `<div class="bar slot${slot} ${rb ? 'rk-' + rk.risk : ''} ${V[pr.id] ? 'viol' : ''} ${fillsOf(pr.id).length ? 'has-fill' : ''} ${hlr && ui.hl.pairings.has(pr.id) ? 'hl' : ''}" style="left:${left}px;width:${w}px" data-pr="${pr.id}">${inner}</div>`;
      }
      h += '</div>';
    }
    const pct = Math.round(cw / BASE_CW * 100);
    $('#main').innerHTML = h + `</div></div><div class="zoomw" id="zoomw"><button id="zOut" title="缩小（Ctrl/⌘+滚轮）">−</button><button id="zPct" title="点击恢复 100%（日视图）">${pct}%</button><button id="zIn" title="放大（Ctrl/⌘+滚轮）">+</button><button id="zMenuB" title="预设">▾</button>
      <div class="zmenu hidden" id="zMenu">${[['日', 'd', '100%'], ['3日', '3', ''], ['周', 'w', ''], ['半月', 'h', ''], ['整月 · 全局', 'm', '适配']].map(([n, k, t]) => `<div class="zp" data-z="${k}"><span>${n}</span><span class="mut">${t}</span></div>`).join('')}</div></div></div>`;
    const gw0 = $('.gwrap'); const sizeG = () => { gw0.style.height = Math.max(240, innerHeight - gw0.getBoundingClientRect().top - 14) + 'px'; }; sizeG();
    if (ui.fit) { const av = gw0.clientHeight - $('.ghead').offsetHeight - 2; if (Math.abs(av - (ui.fitAvail || 0)) > 4) { ui.fitAvail = av; return rGantt(); } }
    document.querySelectorAll('.lvable').forEach(c => c.onclick = () => { const id = c.dataset.pid; const nx = C.buildIndex(st).sched[id].find(pr => pr.start + pr.ndays - 1 >= 1); goLeave(id, nx ? nx.start : 1, nx ? nx.start + nx.ndays - 1 : 1); });
    if ($('#hlClr')) { $('#hlClr').onclick = () => { ui.hl = null; rGantt(); }; $('#hlUndo').onclick = undoLeave; }
    $('#gq').oninput = e => { ui.gq = e.target.value; const pos = e.target.selectionStart; rGantt(); $('#gq').focus(); $('#gq').setSelectionRange(pos, pos); };
    $('#gg').onchange = e => { ui.gg = e.target.value; rGantt(); };
    const curP = () => ui.cw / BASE_CW * 100;
    $('#zIn').onclick = () => setZoom((ZSTEPS.find(z => z > curP() + 0.5) || 160) * BASE_CW / 100);
    $('#zOut').onclick = () => setZoom(([...ZSTEPS].reverse().find(z => z < curP() - 0.5) || 4) * BASE_CW / 100);
    $('#zPct').onclick = () => setZoom(BASE_CW);
    $('#zMenuB').onclick = e => { e.stopPropagation(); $('#zMenu').classList.toggle('hidden'); };
    document.querySelectorAll('.zp').forEach(b => b.onclick = () => { const k = b.dataset.z; k === 'm' ? setZoom(fitCw(C.DAYS, 170), null, true) : setZoom(k === 'd' ? BASE_CW : fitCw({ '3': 3, w: 7, h: 15 }[k])); const g = $('.gwrap'); if (k === 'm' && g) g.scrollLeft = 0; });
    const gw = $('.gwrap'); gw.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault();
      setZoom(ui.cw * Math.exp(-e.deltaY * 0.003), e.clientX - gw.getBoundingClientRect().left); }, { passive: false });
    bindBars();
  }
  const RISK_BADGE = { over: ['⛔', '超限'], high: ['⚠', '高'], med: ['◔', '中'] };
  function bindBars() {
    document.querySelectorAll('.bar').forEach(b => {
      b.onclick = () => openEdit(b.dataset.pr);
      b.onmousemove = e => { const pr = st.pairings.find(x => x.id === b.dataset.pr); const t = $('#tip');
        t.innerHTML = tipHtml(pr); t.classList.remove('hidden');
        t.style.left = Math.min(e.clientX + 14, innerWidth - 470) + 'px'; t.style.top = Math.min(e.clientY + 14, innerHeight - t.offsetHeight - 10) + 'px'; };
      b.onmouseleave = () => $('#tip').classList.add('hidden');
    });
  }
  function tipHtml(pr) {
    const m = pm(); const V = violByPairing();
    const fl = fillsOf(pr.id); const flTxt = fl.length ? '<br><span class="fbadge">补位</span> ' + fl.map(f => esc((f.slotName || '') + ' ' + (f.toName || '') + ' ← ' + (f.fromName || '') + (f.leaveDays && f.leaveDays.length ? '（请假 ' + f.leaveDays.join(',') + ' 日）' : ''))).join('；') : '';
    return `<b>${pr.id}</b>${fillBadge(pr.id)}${demoTag(pr)} · ${pr.ndays}天 · ${pr.ac} · ${C.pairingHours(pr).toFixed(1)}h<br>${pr.legs.map(l => `D${l.d} ${l.flt} ${apHtml(l.from)}-${apHtml(l.to)} ${C.fmtT(l.dep)}-${C.fmtT(l.arr)} <span class="mut">${esc(l.reg || '')}</span>${C.isNightLeg(l) ? ' <span class="warnc">夜航</span>' : ''}`).join('<br>')}
      <br><b>${crewTxt(pr, m)}</b>${['C', 'F', 'T'].map(s => pr.crew[s] && m[pr.crew[s]] ? ' ' + pill(m[pr.crew[s]].rank) : '').join('')}${flTxt}${pr.demoAnomalyNote ? '<br><span class="red">' + esc(pr.demoAnomalyNote) + '</span>' : ''}${V[pr.id] ? '<br><span class="red">' + V[pr.id].map(esc).join('<br>') + '</span>' : ''}`;
  }

  // ---------------- 编辑弹窗 ----------------
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.mLeave'); if (!b) return; const pr = st.pairings.find(x => x.id === $('#modalBox').dataset.pr); closeModal(); goLeave(b.dataset.pid, pr.start, pr.start + pr.ndays - 1); });
  function openEdit(id) {
    $('#modalBox').dataset.pr = id;
    $('#tip').classList.add('hidden');
    const pr = st.pairings.find(x => x.id === id); const m = pm();
    const sp = C.specialAirportsOf(pr, st); const bpt = pr.legs.filter(l => (st.settings.bpTesterAirports || []).includes(l.from));
    let h = `<div class="flex"><h3 style="margin:0">任务 ${pr.id}${fillBadge(pr.id)}${demoTag(pr)} · ${dateOf(pr.start)} 起 ${pr.ndays} 天 · ${pr.ac} · ${C.pairingHours(pr).toFixed(1)} 飞行小时</h3><button class="btn" style="margin-left:auto" id="mClose">关闭</button></div>
      <div class="flex" style="margin-top:6px;flex-wrap:wrap"><span class="mut">临时请假（本任务日期 ${pr.start}–${pr.start + pr.ndays - 1} 日）：</span>${['C', 'F', 'T'].filter(x => pr.crew[x] && m[pr.crew[x]]).map(x => `<button class="btn sm mLeave" data-pid="${pr.crew[x]}">${C.SLOT_NAME[x]} ${esc(m[pr.crew[x]].name)} 请假 → 生成方案</button>`).join('')}</div>
      <table style="margin:10px 0"><tr><th>日</th><th>航班</th><th>航段</th><th>机号</th><th>时刻</th><th>备注</th></tr>${pr.legs.map(l => `<tr><td>D${l.d} (${dateOf(Math.floor(l.dep / C.DAY) + 1)})</td><td>${l.flt}</td><td>${l.from} ${apHtml(l.from)} → ${l.to} ${apHtml(l.to)}</td><td>${esc(l.reg || '—')}</td><td>${C.fmtT(l.dep)}-${C.fmtT(l.arr)}</td><td>${[l.from, l.to].filter(c => C.isSpecial(c, st)).map(c => `<span class="red">${C.CAT_DESC[C.apCat(c, st)]}</span>`).join(' ')} ${(st.settings.bpTesterAirports || []).includes(l.from) ? '<span class="warnc">需血压测试仪</span>' : ''} ${C.isNightLeg(l) ? '<span class="warnc">夜航</span>' : ''} ${l.ac === 'A321' ? 'A321：左座须 J2+' : ''}</td></tr>`).join('')}</table>
      ${sp.length ? `<div class="note red">本任务涉及特殊机场：${sp.map(c => C.apName(c, st) + '(' + c + ')').join('、')}，执行左右座均需持有该机场授权</div>` : ''}
      ${bpt.length ? `<div class="note warnc">提醒：自 ${[...new Set(bpt.map(l => C.apName(l.from, st)))].join('、')} 出港，始发站须配备血压测试仪</div>` : ''}
      <h3 style="margin-top:14px">机组</h3><div id="slots"></div><div id="crewChk" class="note"></div>`;
    $('#modalBox').innerHTML = h; $('#modal').classList.remove('hidden');
    $('#mClose').onclick = closeModal;
    const drawSlots = () => {
      let s = '';
      for (const slot of ['C', 'F', 'T']) {
        const cs = C.candidates(st, pr, slot); const cur = pr.crew[slot];
        const ok = cs.filter(c => c.ok || c.p.id === cur), bad = cs.filter(c => !c.ok && c.p.id !== cur && C.slotRankOK(slot, c.p.rank));
        s += `<div class="slotbox"><b>${C.SLOT_NAME[slot]}位</b><select data-slot="${slot}"><option value="">— 空缺 —</option>${ok.map(c => `<option value="${c.p.id}" ${c.p.id === cur ? 'selected' : ''}>${esc(c.p.name)} ${c.p.rank} · ${c.p.id} · 本月${c.hours.toFixed(1)}h${c.standby && c.standby.length ? ' · ★备份可调用' : ''}${c.warn ? ' · ⚠' + c.warn : ''}${!c.ok ? ' · ✖' + c.reasons.join('；') : ''}</option>`).join('')}</select></div>
          <details style="margin:-4px 0 10px 68px"><summary>${ok.length} 名合规候选（按本月小时升序）；${bad.length} 名不合规 — 查看原因</summary><div class="inel"><table>${bad.map(c => `<tr><td>${esc(c.p.name)}</td><td>${pill(c.p.rank)}</td><td>${c.hours.toFixed(1)}h</td><td class="mut">${c.reasons.map(esc).join('；')}</td></tr>`).join('')}</table></div></details>`;
      }
      $('#slots').innerHTML = s;
      const crew = ['C', 'F', 'T'].map(x => pr.crew[x] && pm()[pr.crew[x]]); const iss = C.crewIssue(pr, crew, st);
      $('#crewChk').innerHTML = crew.every(Boolean) ? (iss ? `<span class="red">✖ ${esc(iss)}</span>` : '<span class="okc">✔ 机组组合满足全部航段座位搭配、特殊机场及新机长带飞规则</span>') : '<span class="warnc">机组未满员</span>';
      document.querySelectorAll('#slots select').forEach(sel => sel.onchange = () => { pr.crew[sel.dataset.slot] = sel.value || null;
        if (sel.value && st.standby && st.standby[sel.value]) { const td = C.daysTouched(pr, st); st.standby[sel.value] = st.standby[sel.value].filter(d => !td.includes(d)); } save(); drawSlots(); sum = C.summarize(st); renderKpis(); });
    };
    drawSlots();
  }
  function closeModal() { $('#modal').classList.add('hidden'); render(); }

  // ---------------- 任务视图 ----------------
  function rTasks() {
    const m = pm(); const V = violByPairing();
    let ps = st.pairings.slice();
    if (ui.tf === '未满员') ps = ps.filter(p => !(p.crew.C && p.crew.F && p.crew.T));
    if (ui.tf === '已满员') ps = ps.filter(p => p.crew.C && p.crew.F && p.crew.T);
    if (ui.tf === '有违规') ps = ps.filter(p => V[p.id]);
    if (ui.tf === '特殊机场') ps = ps.filter(p => C.specialAirportsOf(p, st).length);
    if (ui.tf === '执勤高/中风险') ps = ps.filter(p => ['over', 'high', 'med'].includes(C.pairingRisk(p, st).risk));
    if (ui.tq) ps = ps.filter(p => JSON.stringify(p.legs).includes(ui.tq) || p.id.includes(ui.tq) || p.legs.some(l => C.apName(l.to, st).includes(ui.tq)));
    const unf = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
    let h = `<div class="toolbar"><select id="tf">${['全部', '未满员', '已满员', '有违规', '特殊机场', '执勤高/中风险'].map(g => `<option ${g === ui.tf ? 'selected' : ''}>${g}</option>`).join('')}</select><input id="tq" placeholder="航班号/机场/任务号" value="${esc(ui.tq)}">
      <span class="mut">共 ${st.pairings.length} 个任务，已满员 ${st.pairings.length - unf}，未满员 <b class="${unf ? 'red' : 'okc'}">${unf}</b>；显示 ${ps.length}</span></div>
      <div class="panel scroll" style="max-height:calc(100vh - 200px)"><table><tr><th>任务号</th><th>日期</th><th>天数</th><th>机型</th><th>小时</th><th>行程（D1..Dn）</th><th>机组</th><th>执勤风险（每日 FDP / 限制 · 余量）</th><th>状态</th><th></th></tr>`;
    for (const pr of ps) {
      const full = pr.crew.C && pr.crew.F && pr.crew.T; const bpt = pr.legs.some(l => (st.settings.bpTesterAirports || []).includes(l.from));
      h += `<tr><td><b>${pr.id}</b>${fillBadge(pr.id)}${demoTag(pr)}</td><td>${dateOf(pr.start)}${pr.ndays > 1 ? '–' + dateOf(pr.start + pr.ndays - 1) : ''}</td><td>${pr.ndays}</td><td>${pr.ac}</td><td>${C.pairingHours(pr).toFixed(1)}</td>
        <td>${dayChains(pr).map(c => c.html).join('<br>')}</td><td>${crewTxt(pr, m)}</td>
        <td class="fdpc">${C.fdpDays(pr, st).map(dy => `<div><span class="rdot r-${dy.planRisk}"></span>D${dy.d} ${C.fmtH(dy.planFdp)} / ${C.fmtH(dy.limit)} · <span class="${{ over: 'red', high: 'red', med: 'warnc', low: 'mut' }[dy.planRisk]}">余 ${dy.planBuffer} 分</span>${dy.planRestShort ? ` <span class="mut" title="计划过夜休息偏短">夜休 ${C.fmtH(dy.planRest)}</span>` : ''}</div>`).join('')}</td>
        <td>${V[pr.id] ? `<span class="red" title="${esc(V[pr.id].join('\n'))}">✖ ${V[pr.id].length}项违规</span>` : full ? '<span class="okc">✔ 合规</span>' : '<span class="warnc">待填</span>'}${bpt ? '<br><span class="warnc">需血压测试仪</span>' : ''}</td>
        <td><button class="btn sm" data-ed="${pr.id}">调整</button></td></tr>`;
    }
    $('#main').innerHTML = h + '</table></div>';
    $('#tf').onchange = e => { ui.tf = e.target.value; rTasks(); };
    $('#tq').onchange = e => { ui.tq = e.target.value.trim(); rTasks(); };
    document.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => openEdit(b.dataset.ed));
  }

  // ---------------- 校验报告 ----------------
  function rReport() {
    const s = sum, S = st.settings;
    const hardTypes = ['未满员', '时间重叠', '休息不足', '请假冲突', '岗位级别不符', '座位搭配规则', '特殊机场授权/搭配', '新机长无教员', '月小时超法规上限', '备份冲突'];
    const card = (lab, val, sub, cls) => `<div class="card"><div class="lab">${lab}</div><div class="val ${cls || ''}">${val}</div><div class="sub">${sub}</div></div>`;
    const ov = C.stats(s.per.map(x => x.overnights)), spx = C.stats(s.per.map(x => x.special)), nt = C.stats(s.per.map(x => x.night));
    const demos = st.pairings.filter(p => p.demoAnomaly);
    let h = (demos.length ? `<div class="demo-banner"><b>演示异常（路演用例）</b>：${demos.map(p => `<a href="#gantt" class="demoJump" data-pr="${p.id}">${p.id}</a> ${esc(p.demoAnomalyNote || p.demoAnomaly)}`).join('　·　')}<div class="mut" style="margin-top:4px">校验报告中对应项带【演示异常】前缀；正式排班不会自动注入。</div></div>` : '')
      + `<div class="grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">
      ${card('任务覆盖率（满员）', (s.coverage * 100).toFixed(1) + '%', `${s.full}/${s.total} 个任务 · ${s.totalHours.toFixed(0)} 任务飞行小时`, s.coverage === 1 ? 'ok' : 'bad')}
      ${card('硬性规则违规', s.hard, s.hard ? '需处理，见下表' : '全部合规 ✔（座位搭配/特殊机场/休息/请假/≤${S.hardMaxHours || 90}h）', s.hard ? 'bad' : 'ok')}
      ${card('工时公平性（基尼系数）', s.all.gini.toFixed(3), `全员 ${s.all.min.toFixed(1)}–${s.all.max.toFixed(1)}h · 均值 ${s.all.mean.toFixed(1)}h · 同级组内标准差 ≤ ${Math.max(...C.GROUPS.map(g => s.groups[g].hours.std)).toFixed(1)}h`, 'ok')}
      ${card('休息间隔 2–3 天占比', (s.rhythm.gap23 * 100).toFixed(1) + '%', `均值 ${s.rhythm.gapMean.toFixed(2)} 天 · 备份 ${s.rhythm.standbyTotal} 人日`, s.rhythm.gap23 > 0.5 ? 'ok' : '')}
      ${card('意向休息日满足率', (s.prefRate * 100).toFixed(1) + '%', `${s.prefOK}/${s.prefT} 个意向休息日得到保障`, s.prefRate > 0.95 ? 'ok' : '')}</div>
      <div class="grid g2"><div class="panel"><h3>合规性 <small>硬性规则逐项计数${lastSolveMs ? ' · 自动排班用时 ' + lastSolveMs + ' ms' : ''}</small></h3><table><tr><th>规则</th><th>违规数</th></tr>
      ${hardTypes.map(t => { const n = (s.byType[t] || {}).n || 0; return `<tr><td>${t}</td><td class="${n ? 'red' : 'okc'}">${n ? n : '0 ✔'}</td></tr>`; }).join('')}
      <tr><td>备份超过每人每月 ${S.maxStandbyPerPilot} 天（软性）</td><td class="warnc">${(s.byType['备份超限'] || {}).n || 0}</td></tr><tr><td>每日备份人数不足（软性）</td><td class="warnc">${(s.byType['备份人数不足'] || {}).n || 0}</td></tr><tr><td>意向休息日未满足（软性）</td><td class="warnc">${(s.byType['意向休息日未满足'] || {}).n || 0}</td></tr><tr><td>始发站需血压测试仪提醒（信息）</td><td class="warnc">${(s.byType['需血压测试仪'] || {}).n || 0}</td></tr></table></div>
      <div class="panel"><h3>公平性 · 各级别组月飞行小时分布 <small>圆点=均值，阴影=±1σ，线=最小–最大；红虚线=法规硬上限 ${S.hardMaxHours || 90}h</small></h3><div class="chart">${CH.ranges(C.GROUPS.map(g => Object.assign({ label: g, color: GCOL[g] }, s.groups[g].hours)), { range: [20, 100], marks: [{ v: S.hardMaxHours || 90, color: '#ff5a6a' }] })}</div>
      <table><tr><th>组别</th><th>人数</th><th>均值</th><th>标准差</th><th>最小</th><th>最大</th><th>基尼</th></tr>${C.GROUPS.map(g => { const x = s.groups[g].hours; return `<tr><td>${g}</td><td>${x.n}</td><td>${x.mean.toFixed(1)}</td><td>${x.std.toFixed(2)}</td><td>${x.min.toFixed(1)}</td><td>${x.max.toFixed(1)}</td><td>${x.gini.toFixed(3)}</td></tr>`; }).join('')}</table></div></div>
      <div class="panel"><h3>每人本月飞行小时 <small>按组别、小时排序；颜色=组别</small></h3><div class="chart">${CH.bars(s.per.slice().sort((a, b) => C.GROUPS.indexOf(a.group) - C.GROUPS.indexOf(b.group) || b.hours - a.hours).map(x => ({ label: x.name, value: x.hours, color: GCOL[x.group] })), { w: 1400, h: 260, showLabels: false, lines: [{ v: S.hardMaxHours || 90, label: '法规硬上限 ' + (S.hardMaxHours || 90) + 'h', color: '#ff5a6a' }], max: 100 })}</div>
      <div class="legend">${C.GROUPS.map(g => `<span><i style="background:${GCOL[g]}"></i>${g}</span>`).join('')}</div></div>
      <div class="grid g3">
      <div class="panel"><h3>节奏 · 任务天数分布 <small>${s.total} 个任务</small></h3>${CH.bars(Object.keys(s.rhythm.lenDist).map(k => ({ label: k + '天', value: s.rhythm.lenDist[k], color: '#3ea6ff' })), { w: 420, h: 200, values: true })}<div class="note">以 3–4 天多日任务为主，${((((s.rhythm.lenDist[3] || 0) + (s.rhythm.lenDist[4] || 0)) / s.total) * 100).toFixed(0)}% 为 3–4 天</div></div>
      <div class="panel"><h3>节奏 · 任务间休息天数 <small>2–3 天占比 <b class="okc">${(s.rhythm.gap23 * 100).toFixed(1)}%</b></small></h3>${CH.bars(['0-1', '2', '3', '4', '5+'].map(k => ({ label: k + '天', value: s.rhythm.gapDist[k], color: k === '2' || k === '3' ? '#2ecc8f' : k === '4' ? '#e6a23c' : '#ff7a85' })), { w: 420, h: 200, values: true })}<div class="note">共 ${s.rhythm.gapN} 个间隔，均值 ${s.rhythm.gapMean.toFixed(2)} 天（已扣除意向休息日/请假日；休息 ≥${S.minRestH}h 为硬约束）</div></div>
      <div class="panel"><h3>备份（Standby）公平性 <small>共 ${s.rhythm.standbyTotal} 人日</small></h3>${CH.bars(C.GROUPS.map(g => ({ label: g, value: s.groups[g].standby.mean, color: GCOL[g] })), { w: 420, h: 200, values: true })}<div class="note">人均备份天数；机长类 ${s.rhythm.standbyC.min}–${s.rhythm.standbyC.max}（σ${s.rhythm.standbyC.std.toFixed(2)}），副驾驶 ${s.rhythm.standbyF.min}–${s.rhythm.standbyF.max}（σ${s.rhythm.standbyF.std.toFixed(2)}）；每日备份 ${S.standbyPerDay} 人，每人每月至多 ${S.maxStandbyPerPilot} 天（${st.pilots.length - Object.values(st.standby || {}).filter(a => a.length).length} 人本月无备份）</div></div></div>
      <div class="grid g3">
      <div class="panel"><h3>合理性 · 外站过夜次数 <small>σ=${ov.std.toFixed(2)}</small></h3>${CH.bars(C.GROUPS.map(g => ({ label: g, value: s.groups[g].overnights.mean, color: GCOL[g] })), { w: 420, h: 200, values: true })}<div class="note">各组人均过夜次数；全员 ${ov.min}–${ov.max} 次</div></div>
      <div class="panel"><h3>合理性 · 特殊机场任务暴露 <small>σ=${spx.std.toFixed(2)}</small></h3>${CH.bars(C.GROUPS.map(g => ({ label: g, value: s.groups[g].special.mean, color: GCOL[g] })), { w: 420, h: 200, values: true })}<div class="note">人均含特殊机场任务数；仅持授权人员参与</div></div>
      <div class="panel"><h3>合理性 · 夜航航段 <small>σ=${nt.std.toFixed(2)}</small></h3>${CH.bars(C.GROUPS.map(g => ({ label: g, value: s.groups[g].night.mean, color: GCOL[g] })), { w: 420, h: 200, values: true })}<div class="note">人均夜航段（00:00–06:00 起降）；全员 ${nt.min}–${nt.max}</div></div></div>
      ${fdpReportPanel()}
      <div class="panel"><h3>问题明细 <small>${s.violations.length} 条（含软性与提醒）</small></h3><div class="scroll" style="max-height:300px"><table><tr><th>级别</th><th>类型</th><th>说明</th></tr>
      ${s.violations.slice().sort((a, b) => ['hard', 'soft', 'info'].indexOf(a.level) - ['hard', 'soft', 'info'].indexOf(b.level)).map(v => `<tr><td class="${v.level === 'hard' ? 'red' : 'warnc'}">${{ hard: '硬性', soft: '软性', info: '提醒' }[v.level]}</td><td>${v.type}</td><td>${esc(v.msg)}</td></tr>`).join('') || '<tr><td colspan=3 class="okc">无</td></tr>'}</table></div></div>`;
    $('#main').innerHTML = h;
    document.querySelectorAll('.demoJump').forEach(a => a.onclick = e => { e.preventDefault(); const pr = st.pairings.find(x => x.id === a.dataset.pr); if (!pr) return; tab = 'gantt'; ui.hl = { pairings: new Set([pr.id]), pilots: new Set(['C','F','T'].map(s => pr.crew[s]).filter(Boolean)), days: C.daysTouched(pr, st) }; render(); setTimeout(scrollToHl, 40); });
  }

  function fdpReportPanel() {
    const r = C.fdpRiskSummary(st); const S = st.settings;
    return `<div class="panel"><h3>执勤风险（计划 FDP 与延误余量） <small>${r.n} 个值勤日 · 限制表为默认值（参考 CCAR-121），可在设置中修改</small></h3>
      <div class="grid g4" style="margin-bottom:10px">${[['over', '超限', 'bad'], ['high', `高（余量 &lt;${S.fdpRiskHigh} 分）`, 'bad'], ['med', `中（&lt;${S.fdpRiskMed} 分）`, ''], ['low', '低', 'ok']].map(([k, l, c]) => `<div class="card"><div class="lab"><span class="rdot r-${k}"></span>${l}</div><div class="val ${r.cnt[k] && c === 'bad' ? 'bad' : c === 'ok' ? 'ok' : ''}">${r.cnt[k]}</div></div>`).join('')}</div>
      <div class="scroll" style="max-height:260px"><table><tr><th>任务</th><th>值勤日</th><th>日期</th><th>段数</th><th>计划 FDP</th><th>限制</th><th>延误余量</th><th>风险</th><th>次日过夜休息</th></tr>
      ${r.rows.filter(x => x.risk !== 'low').concat(r.rows.filter(x => x.risk === 'low').slice(0, 5)).map(x => `<tr><td>${x.pr}</td><td>D${x.d}</td><td>${dateOf(x.date)}</td><td>${x.legs}</td><td>${C.fmtH(x.fdp)}</td><td>${C.fmtH(x.limit)}</td><td class="${{ over: 'red', high: 'red', med: 'warnc', low: '' }[x.risk]}">${x.buffer} 分钟</td><td><span class="rdot r-${x.risk}"></span>${{ over: '超限', high: '高', med: '中', low: '低' }[x.risk]}</td><td>${x.restAfter != null ? C.fmtH(x.restAfter) + (x.restShort ? ' <span class="warnc">偏短</span>' : '') : '—'}</td></tr>`).join('')}</table></div>
      ${r.restShort.length ? `<div class="note warnc">计划过夜休息低于 ${S.minOvernightRestH}h：${r.restShort.map(x => x.pr + ' D' + x.d).join('、')}（任务编排数据，提醒航线部门确认）</div>` : ''}</div>`;
  }

  // ---------------- 执勤监控（延误 / 超执勤） ----------------
  let dutyDate = null, dutyOpts = null, dutyView = 'cards', dutyRegQ = '', dutySel = null, dutyPxh = 48;
  const p2 = n => String(n).padStart(2, '0');
  function toDT(m) { const d = new Date(C.YEAR, C.MONTH - 1, 1, 0, m); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; }
  function fromDT(v) { if (!v) return null; const t = new Date(v); if (isNaN(t)) return null; return Math.round((t - new Date(C.YEAR, C.MONTH - 1, 1)) / 60000); }
  function rDuty() {
    const S = st.settings; C.migrateDelays(st); C.ensureAircraftRegs(st); const A = st.actuals;
    if (!dutyDate) { const r = C.fdpRiskSummary(st).rows[0]; dutyDate = r ? r.date : 1; }
    const mon = C.dutyMonitor(st, dutyDate); const m = pm();
    const nEx = mon.filter(x => x.exceed).length, nDn = mon.filter(x => x.downstream.length).length;
    const dl = Object.keys(A).length;
    const tog = `<span class="seg" id="dtView"><button type="button" data-v="cards" class="${dutyView === 'cards' ? 'on' : ''}">任务卡片</button><button type="button" data-v="ac" class="${dutyView === 'ac' ? 'on' : ''}">飞机甘特</button></span>`;
    let h = `<div class="panel"><h3>执勤监控 · 按实际/预计时刻滚动监控 <small>逐段录入实际/预计起飞、落地（日期+时间，可跨午夜），每录入一段实际落地即按实际时刻重算 FDP、剩余余量与过夜休息；数据随排班保存</small></h3>
      <div class="flex" style="flex-wrap:wrap">${tog}<span>日期</span><select id="dtD">${Array.from({ length: C.DAYS }, (_, i) => `<option value="${i + 1}" ${i + 1 === dutyDate ? 'selected' : ''}>11/${String(i + 1).padStart(2, '0')} 周${WK[dow(i + 1)]}</option>`).join('')}</select>
      <span class="mut">当日执行任务 ${mon.length} 个 · 预计超限 <b class="${nEx ? 'red' : 'okc'}">${nEx}</b> · 下游休息受影响 <b class="${nDn ? 'warnc' : 'okc'}">${nDn}</b> · 已录入延误 ${dl} 段</span>
      <button class="btn sm" id="dtSim">模拟：风险最高任务第 2 段预计晚 120 分（仅该段）</button><button class="btn sm" id="dtClr">清除当日延误</button>${leaveHist.length ? `<button class="btn sm" id="dtUndo">↶ 撤销（${leaveHist.length}）</button>` : ''}</div>
      <div class="note">FDP = 报到（首段计划起飞前 ${S.reportMin} 分钟）→ 当日最晚的实际/预计落地；未录入的航段按计划时刻计算，前段延误<b>不会</b>自动顺延到后续航段（可能在后续过站追回）。若前段延误不追回、按最短过站 ${S.minTurnMin} 分钟顺延会超限，仅给出「若不追回将超限」提示，不计入超限。限制表为默认值（参考 CCAR-121，可在设置中修改）。飞机甘特按机号分行，色块表示延误/FDP 风险（绿=正常 · 琥珀=延误或中风险 · 红=高风险/超限）。</div></div>`;
    if (dutyView === 'ac') h += rDutyAcHtml(mon, m, A);
    else {
      h += `<div class="dutyg">${mon.map(x => { const dy = x.day; const pr = x.pr; const pct = Math.min(130, dy.fdp / dy.limit * 100);
        return `<div class="panel dutyc ${x.exceed ? 'dex' : ''}"><div class="flex"><b>${pr.id}</b><span class="mut">D${dy.d}/${pr.ndays} · ${crewTxt(pr, m)}</span>
          <span style="margin-left:auto" class="${{ over: 'red', high: 'red', med: 'warnc', low: 'okc' }[dy.risk]}"><span class="rdot r-${dy.risk}"></span>${dy.nLanded ? `已落地 ${dy.nLanded}/${dy.legs.length} 段 · ` : ''}预计 FDP ${C.fmtH(dy.fdp)} / ${C.fmtH(dy.limit)} · ${dy.exceed ? '超 ' + dy.exceed + ' 分钟' : '剩余余量 ' + dy.buffer + ' 分钟'}</span></div>
          <div class="fdpbar"><i style="width:${pct / 1.3}%" class="r-${dy.risk}"></i><b style="left:${100 / 1.3}%"></b></div>
          <table class="dlt"><tr><th>航班</th><th>航段</th><th>机号</th><th>计划</th><th>实际/预计起飞</th><th>实际/预计落地</th><th>状态</th><th>偏差</th></tr>${dy.legs.map(l => { const k = C.legKey(l.leg); const a = A[k] || {}; return `<tr class="${dy.exLeg && l.arr > dy.start + dy.limit ? 'exrow' : ''}"><td>${l.leg.flt}</td><td>${apHtml(l.leg.from)}-${apHtml(l.leg.to)}</td><td class="mut">${esc(l.leg.reg || '—')}</td><td>${C.fmtT(l.leg.dep)}-${C.fmtT(l.leg.arr)}</td>
            <td><input type="datetime-local" class="atin" data-k="${k}" data-f="dep" value="${a.dep != null ? toDT(a.dep) : ''}" placeholder="${toDT(l.leg.dep)}"></td><td><input type="datetime-local" class="atin" data-k="${k}" data-f="arr" value="${a.arr != null ? toDT(a.arr) : ''}"></td><td><select class="atkind" data-k="${k}" ${l.known ? '' : 'disabled'}><option value="est" ${a.kind !== 'act' ? 'selected' : ''}>预计</option><option value="act" ${a.kind === 'act' ? 'selected' : ''}>实际</option></select></td><td class="${l.known ? (l.lateArr > 0 ? 'warnc' : 'okc') : 'mut'}">${l.known ? `${l.landed ? '✔' : ''}落地 ${l.lateArr >= 0 ? '+' : ''}${l.lateArr} 分` : '按计划'}${l.conflict ? `<div class="mut" title="前段落地晚于本段计划起飞">前段晚到 ${l.conflict} 分</div>` : ''}</td></tr>`; }).join('')}</table>
          ${dy.exLeg ? `<div class="red">✖ 自 ${dy.exLeg.leg.flt} ${C.apName(dy.exLeg.leg.from, st)}-${C.apName(dy.exLeg.leg.to, st)} 起超出 FDP 限制 ${dy.exceed} 分钟（报到 ${C.fmtT(dy.start)}，限制至 ${C.fmtT(dy.start + dy.limit)}）</div>` : ''}
          ${dy.cascExceed ? `<div class="mut">ⓘ 若不追回将超限：前段延误按最短过站顺延，预计 ${dy.cascLeg.leg.flt} 落地 ${C.fmtT(dy.cascLeg.carr)}，超 ${dy.cascExceed} 分钟（提示，不计入超限）</div>` : ''}
          ${x.downstream.map(d => `<div class="warnc">↳ ${d.overnight ? `D${d.d} 过夜休息压缩至 ${C.fmtH(d.restAfter)}（低于 ${S.minOvernightRestH}h，差 ${d.short} 分钟）` : `${esc(m[d.pilot].name)} 下一任务 ${d.next} 前休息仅 ${C.fmtH(d.gap)}（低于 ${S.minRestH}h，差 ${d.short} 分钟）`}</div>`).join('')}
          ${x.exceed || x.downstream.length ? `<button class="btn sm ${x.exceed ? 'primary' : ''} dtGo" data-pr="${pr.id}">生成处置方案</button>` : ''}</div>`; }).join('') || '<div class="note">当日无执行任务</div>'}</div>`;
    }
    const o = dutyOpts;
    if (o) h += `<div class="panel" id="dtSol"><div class="flex" style="flex-wrap:wrap;align-items:center"><h3 style="margin:0">${o.pairing.id} 处置方案 <small>${o.exceed ? `D${o.exceed.d} 预计超 FDP ${o.exceed.exceed} 分钟` : (o.downstream && o.downstream.length ? '下游休息不足' : '执勤余量紧张（预防）')} · 生成 ${o.solutions.length} 个方案 · 用时 ${o.ms} ms</small></h3>
      <button class="btn sm" id="dtExpSel" style="margin-left:auto" title="导出当前选中方案；若未选中则导出推荐方案">导出备选方案</button></div>
      <div class="note" style="margin:6px 0 8px">「导出此方案 / 导出备选方案」仅下载 JSON 与 CSV 摘要，<b>不会</b>改动当前排班；「一键应用」才会写入并高亮。</div>
      <div class="solgrid">${o.solutions.map(solCard).join('')}</div></div>
      <div class="panel"><h3>影响预览 <small>悬停/点选方案：绿=新增任务 · 橙=被调整任务 · 红虚线=移出</small></h3><div id="mgBox">${miniGantt(o.solutions[cardCtx.hover])}</div></div>`;
    $('#main').innerHTML = h;
    document.querySelectorAll('#dtView button').forEach(b => b.onclick = () => { dutyView = b.dataset.v; dutyOpts = null; dutySel = null; rDuty(); });
    $('#dtD').onchange = e => { dutyDate = +e.target.value; dutyOpts = null; dutySel = null; rDuty(); };
    document.querySelectorAll('.atin').forEach(i => i.onchange = () => { const k = i.dataset.k; const a = A[k] = A[k] || { kind: 'est' }; const v = fromDT(i.value); if (v == null) delete a[i.dataset.f]; else a[i.dataset.f] = v; if (a.dep == null && a.arr == null) delete A[k]; dutyOpts = null; save(); sum = C.summarize(st); renderKpis(); rDuty(); });
    document.querySelectorAll('.atkind').forEach(i => i.onchange = () => { if (A[i.dataset.k]) A[i.dataset.k].kind = i.value; save(); rDuty(); });
    $('#dtClr').onclick = () => { mon.forEach(x => x.day.legs.forEach(l => delete A[C.legKey(l.leg)])); dutyOpts = null; dutySel = null; save(); rDuty(); };
    $('#dtSim').onclick = () => { const x = mon.slice().sort((a, b) => a.day.buffer - b.day.buffer)[0]; if (!x) return; const l = x.day.legs[Math.min(1, x.day.legs.length - 1)]; A[C.legKey(l.leg)] = { dep: l.dep + 120, arr: l.arr + 120, kind: 'est' }; dutyOpts = null; save(); rDuty(); };
    if ($('#dtUndo')) $('#dtUndo').onclick = undoLeave;
    document.querySelectorAll('.dtGo').forEach(b => b.onclick = () => { dutyOpts = C.fdpOptions(st, b.dataset.pr); const i = dutyOpts.solutions.findIndex(x => x.recommended);
      cardCtx = { hover: i < 0 ? 0 : i, focus: Object.values(dutyOpts.pairing.crew).filter(Boolean), days: dutyOpts.days.map(d => d.date) }; rDuty(); const e = $('#dtSol'); if (e) e.scrollIntoView(); });
    if (o) {
      const expCtx = dutyExportCtx(o);
      bindCards(o.solutions, sol => `${o.pairing.id} ${o.exceed ? '超执勤' : (o.downstream && o.downstream.length ? '休息不足' : '余量紧张')}处置 · 方案「${sol.name}」：${stepTxt(sol)}`, () => { dutyOpts = null; }, expCtx);
      if ($('#dtExpSel')) $('#dtExpSel').onclick = () => {
        let i = cardCtx.hover; if (i == null || i < 0 || !o.solutions[i]) i = o.solutions.findIndex(x => x.recommended);
        if (i < 0) i = 0; exportSolPlan(o.solutions[i], i, expCtx);
      };
    }
    if (dutyView === 'ac') bindDutyAc(mon, m, A);
  }

  function rDutyAcHtml(mon, m, A) {
    const ad = C.aircraftDay(st, dutyDate);
    const q = (dutyRegQ || '').trim().toUpperCase();
    let rows = ad.rows;
    if (q) rows = rows.filter(r => r.reg.toUpperCase().includes(q) || r.ac.toUpperCase().includes(q));
    const pxh = dutyPxh; // px per hour
    const spanMin = Math.max(60, ad.tMax - ad.tMin);
    const width = Math.ceil(spanMin / 60 * pxh);
    const nw = 110;
    const xOf = t => (t - ad.tMin) / 60 * pxh;
    // hour ticks
    const t0 = Math.floor(ad.tMin / 60) * 60;
    let ticks = '';
    for (let t = t0; t <= ad.tMax; t += 60) {
      const lab = C.fmtT(t); const dayMark = t % C.DAY === 0 ? ' midn' : '';
      ticks += `<div class="ac-tick${dayMark}" style="left:${xOf(t)}px">${lab}</div>`;
    }
    // midnight line
    const day1 = dutyDate * C.DAY;
    let h = `<div class="panel acpanel"><div class="flex" style="flex-wrap:wrap;margin-bottom:8px">
      <input id="dtRegQ" placeholder="筛选机号 / 机型" value="${esc(dutyRegQ)}" style="width:160px">
      <span class="mut">${rows.length} 架飞机 · ${rows.reduce((s, r) => s + r.items.length, 0)} 段
        · <i class="acdot ok"></i>正常 <i class="acdot late"></i>小延误 <i class="acdot med"></i>中风险/延误 <i class="acdot over"></i>高风险/超限</span>
      <span class="mut" style="margin-left:auto">点击航段条可编辑实际/预计时刻</span></div>
      <div class="acbox"><div class="acwrap" id="acwrap"><div class="acgrid" style="width:${nw + width}px;--nw:${nw}px;--pxh:${pxh}px">
      <div class="achead"><div class="accell0">机号</div><div class="actrack" style="width:${width}px">${ticks}
        <div class="ac-midn" style="left:${xOf(day1)}px"></div></div></div>`;
    for (const r of rows) {
      h += `<div class="acrow"><div class="accell0" title="${esc(r.reg)} · ${r.ac}"><b>${esc(r.reg)}</b><span class="mut">${r.ac}</span></div><div class="actrack" style="width:${width}px;height:100%">`;
      // ghost plan bars
      for (const it of r.items) {
        const left = xOf(it.dep), w = Math.max(4, xOf(it.arr) - left);
        const pl = xOf(it.planDep), pw = Math.max(2, xOf(it.planArr) - pl);
        const sel = dutySel && dutySel.k === C.legKey(it.leg);
        const tip = `${it.leg.flt} ${C.apName(it.leg.from, st)}-${C.apName(it.leg.to, st)}`;
        if (it.known && (it.lateDep || it.lateArr)) h += `<div class="acbar plan" style="left:${pl}px;width:${pw}px"></div>`;
        h += `<div class="acbar c-${it.color}${sel ? ' sel' : ''}" style="left:${left}px;width:${w}px" data-k="${C.legKey(it.leg)}" data-pr="${it.pr.id}" title="${esc(tip)}"><span class="acfl">${esc(it.leg.flt)}</span>${w >= 70 ? `<span class="acroute">${esc(C.apName(it.leg.from, st))}-${esc(C.apName(it.leg.to, st))}</span>` : ''}</div>`;
      }
      h += `</div></div>`;
    }
    if (!rows.length) h += `<div class="note" style="padding:20px">无匹配机号</div>`;
    h += `</div></div>`;
    // zoom widget
    const pct = Math.round(pxh / 48 * 100);
    h += `<div class="zoomw" id="acZoom"><button id="azOut">−</button><button id="azPct">${pct}%</button><button id="azIn">+</button></div></div>`;
    // selection editor
    if (dutySel) {
      const leg = dutySel.leg; const k = C.legKey(leg); const a = A[k] || {};
      const pr = dutySel.pr; const dy = dutySel.dy;
      h += `<div class="panel" id="acEdit"><div class="flex"><b>${esc(leg.reg || '')} · ${leg.flt}</b> ${apHtml(leg.from)}-${apHtml(leg.to)} · ${pr.id}
        <span class="mut" style="margin-left:8px">${crewTxt(pr, m)}</span>
        ${dy ? `<span style="margin-left:auto" class="${{ over: 'red', high: 'red', med: 'warnc', low: 'okc' }[dy.risk]}">FDP ${C.fmtH(dy.fdp)} / ${C.fmtH(dy.limit)} · ${dy.exceed ? '超 ' + dy.exceed + ' 分' : '余量 ' + dy.buffer + ' 分'}</span>` : ''}
        <button class="btn sm" id="acEditX">关闭</button></div>
        <table class="dlt" style="margin-top:8px"><tr><th>计划</th><th>实际/预计起飞</th><th>实际/预计落地</th><th>状态</th></tr>
        <tr><td>${C.fmtT(leg.dep)}-${C.fmtT(leg.arr)}</td>
          <td><input type="datetime-local" class="atin" data-k="${k}" data-f="dep" value="${a.dep != null ? toDT(a.dep) : ''}"></td>
          <td><input type="datetime-local" class="atin" data-k="${k}" data-f="arr" value="${a.arr != null ? toDT(a.arr) : ''}"></td>
          <td><select class="atkind" data-k="${k}" ${a.dep != null || a.arr != null ? '' : 'disabled'}><option value="est" ${a.kind !== 'act' ? 'selected' : ''}>预计</option><option value="act" ${a.kind === 'act' ? 'selected' : ''}>实际</option></select>
            <button class="btn sm dtGo" data-pr="${pr.id}">生成处置方案</button></td></tr></table></div>`;
    }
    return h;
  }

  function bindDutyAc(mon, m, A) {
    const ad = C.aircraftDay(st, dutyDate);
    const find = k => { for (const r of ad.rows) for (const it of r.items) if (C.legKey(it.leg) === k) return it; return null; };
    $('#dtRegQ').oninput = e => { dutyRegQ = e.target.value; const pos = e.target.selectionStart; rDuty(); const el = $('#dtRegQ'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } };
    const setZ = v => { dutyPxh = Math.max(16, Math.min(120, v)); rDuty(); };
    $('#azIn').onclick = () => setZ(dutyPxh * 1.25);
    $('#azOut').onclick = () => setZ(dutyPxh / 1.25);
    $('#azPct').onclick = () => setZ(48);
    const gw = $('#acwrap');
    if (gw) gw.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZ(dutyPxh * Math.exp(-e.deltaY * 0.003)); }, { passive: false });
    document.querySelectorAll('.acbar:not(.plan)').forEach(b => {
      b.onmousemove = e => {
        const it = find(b.dataset.k); if (!it) return;
        const t = $('#tip'); const dy = it.dy;
        t.innerHTML = `<b>${esc(it.leg.reg)} · ${it.leg.flt}</b> ${apHtml(it.leg.from)}-${apHtml(it.leg.to)} · ${it.pr.id} · ${it.leg.ac}<br>
          计划 ${C.fmtT(it.planDep)}-${C.fmtT(it.planArr)}<br>
          ${it.known ? `${it.kind === 'act' ? '实际' : '预计'} ${C.fmtT(it.dep)}-${C.fmtT(it.arr)} <span class="${it.lateArr > 0 ? 'warnc' : 'okc'}">落地 ${it.lateArr >= 0 ? '+' : ''}${it.lateArr} 分</span>` : '<span class="mut">按计划（未录入）</span>'}
          <br><b>${crewTxt(it.pr, m)}</b>
          ${dy ? `<br>FDP ${C.fmtH(dy.fdp)} / ${C.fmtH(dy.limit)} · ${dy.exceed ? '<span class="red">超 ' + dy.exceed + ' 分</span>' : '余量 ' + dy.buffer + ' 分'} · 风险 ${dy.risk}` : ''}`;
        t.classList.remove('hidden');
        t.style.left = Math.min(e.clientX + 14, innerWidth - 420) + 'px';
        t.style.top = Math.min(e.clientY + 14, innerHeight - t.offsetHeight - 10) + 'px';
      };
      b.onmouseleave = () => $('#tip').classList.add('hidden');
      b.onclick = () => { const it = find(b.dataset.k); if (!it) return; dutySel = { k: b.dataset.k, leg: it.leg, pr: it.pr, dy: it.dy }; $('#tip').classList.add('hidden'); rDuty(); const ed = $('#acEdit'); if (ed) ed.scrollIntoView({ block: 'nearest' }); };
    });
    if ($('#acEditX')) $('#acEditX').onclick = () => { dutySel = null; rDuty(); };
  }

  // ---------------- 请假调配（多方案） ----------------
  let leaveSel = { pid: null, from: null, to: null }, leaveOpts = null, leaveHover = null, leaveHist = [], leaveView = 'holes', leaveHoles = null, holePrev = null;
  const TYPE_TXT = { standby: ['备份', 'sbt'], rest: ['休息人员', 'rst'], chain: ['链式调换', 'cht'], manual: ['人工处理', 'mnt'], split: ['拆分换组', 'spt'] };
  let cardCtx = { hover: 0 };
  function genLeave() { const days = []; for (let d = leaveSel.from; d <= leaveSel.to; d++) days.push(d);
    leaveHoles = C.holeRecommend(st, leaveSel.pid, days);
    leaveOpts = C.leaveOptions(st, leaveSel.pid, days); leaveHover = leaveOpts.solutions.findIndex(x => x.recommended); if (leaveHover < 0) leaveHover = 0;
    cardCtx = { hover: leaveHover, focus: [leaveSel.pid], days }; holePrev = null; }
  function goLeave(pid, from, to) {
    leaveSel = { pid, from: from || 1, to: to || from || 1 }; leaveView = 'holes'; holePrev = null;
    tab = 'leave'; genLeave();
    if (leaveHoles && leaveHoles.holes.length) {
      const hi = 0; const hs = leaveHoles.holes[hi].candidates;
      let ci = hs.findIndex(c => c.light === 'green'); if (ci < 0) ci = hs.findIndex(c => c.light === 'amber'); if (ci < 0) ci = 0;
      holePrev = { hi, ci, fromNav: true };
    }
    render();
    setTimeout(() => { const e = document.querySelector('#holePrev') || document.querySelector('.holec'); if (e) e.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
  }
  function miniGantt(sol, ctx) {
    ctx = ctx || cardCtx; const m = pm(); const ws = sol && sol.state ? sol.state : st; const idxA = C.buildIndex(ws), idxB = C.buildIndex(st);
    const ids = [...(ctx.focus || []), ...(sol ? sol.people.map(x => x.id) : [])]; const chg = new Set(sol ? sol.steps.flatMap(x => [x.pairing, x.chain && x.chain.pairing]).filter(Boolean) : []);
    const days = ctx.days || []; const cw = 34, nw = 150;
    let h = `<div class="mg" style="--cw:${cw}px"><div class="mgrow mghead"><div class="mgn">人员</div>${Array.from({ length: C.DAYS }, (_, i) => `<div class="mgd ${days.includes(i + 1) ? 'lvday' : ''} ${[0, 6].includes(dow(i + 1)) ? 'we' : ''}">${i + 1}</div>`).join('')}</div>`;
    for (const id of [...new Set(ids)]) { const p = ws.pilots.find(x => x.id === id); const sb = (ws.standby || {})[id] || [];
      h += `<div class="mgrow"><div class="mgn">${esc(p.name)} ${pill(p.rank)}<span class="mut">${idxB.hours[id].toFixed(0)}→${idxA.hours[id].toFixed(0)}h</span></div>`;
      for (let d = 1; d <= C.DAYS; d++) h += `<div class="mgd ${(p.leave || []).includes(d) ? 'lv' : (p.prefs || []).includes(d) ? 'pref' : sb.includes(d) ? 'sb' : ''}"></div>`;
      const cur = idxA.sched[id], old = idxB.sched[id];
      old.filter(o => !cur.some(c => c.id === o.id)).forEach(pr => h += `<div class="mgbar gone" style="left:${nw + (pr.start - 1) * cw}px;width:${pr.ndays * cw - 2}px">${pr.id} 移出</div>`);
      cur.forEach(pr => { const isNew = !old.some(o => o.id === pr.id); h += `<div class="mgbar ${isNew ? 'add' : chg.has(pr.id) ? 'chg' : ''}" style="left:${nw + (pr.start - 1) * cw}px;width:${pr.ndays * cw - 2}px">${pr.id}${isNew ? ' 新增' : ''}</div>`; });
      h += '</div>'; }
    return h + '</div>';
  }
  function dutyExportCtx(o) {
    const pr = o.pairing;
    const dayLegs = (o.exceed ? o.days.find(d => d.d === o.exceed.d) : o.days[0]);
    const regs = [...new Set((dayLegs ? dayLegs.legs : pr.legs).map(x => (x.leg || x).reg).filter(Boolean))];
    const reg = (dutySel && dutySel.leg && dutySel.leg.reg) || regs[0] || '';
    const date = dutyDate || (dayLegs && dayLegs.date) || pr.start;
    return { kind: 'fdp', pairingId: pr.id, reg, date, exceed: o.exceed, downstream: o.downstream || [], actuals: st.actuals || {} };
  }
  function exportSolPlan(sol, idx, ctx) {
    ctx = ctx || {};
    const letter = String.fromCharCode(65 + (idx || 0));
    const before = st; const after = sol.state || null;
    const pm0 = {}; before.pilots.forEach(p => pm0[p.id] = p);
    const pm1 = {}; (after || before).pilots.forEach(p => pm1[p.id] = p);
    const crewOf = (pr, pm) => ({ C: pr.crew.C && pm[pr.crew.C] ? { id: pr.crew.C, name: pm[pr.crew.C].name, rank: pm[pr.crew.C].rank } : null,
      F: pr.crew.F && pm[pr.crew.F] ? { id: pr.crew.F, name: pm[pr.crew.F].name, rank: pm[pr.crew.F].rank } : null,
      T: pr.crew.T && pm[pr.crew.T] ? { id: pr.crew.T, name: pm[pr.crew.T].name, rank: pm[pr.crew.T].rank } : null });
    const ids = new Set(sol.steps.flatMap(x => [x.pairing, x.newPairing, x.chain && x.chain.pairing]).filter(Boolean));
    if (ctx.pairingId) ids.add(ctx.pairingId);
    const affected = [];
    ids.forEach(id => {
      const pb = before.pairings.find(p => p.id === id);
      const pa = after && after.pairings.find(p => p.id === id);
      if (!pb && !pa) return;
      const src = pa || pb;
      affected.push({
        id, splitFrom: src.splitFrom || null, freshAt: src.freshAt || null,
        before: pb ? { crew: crewOf(pb, pm0), hours: +C.pairingHours(pb).toFixed(2), ndays: pb.ndays, legs: pb.legs.length, reg: [...new Set(pb.legs.map(l => l.reg).filter(Boolean))] } : null,
        after: pa ? { crew: crewOf(pa, pm1), hours: +C.pairingHours(pa).toFixed(2), ndays: pa.ndays, legs: pa.legs.length, reg: [...new Set(pa.legs.map(l => l.reg).filter(Boolean))],
          legsDetail: pa.legs.map(l => ({ d: l.d, flt: l.flt, from: l.from, to: l.to, dep: l.dep, arr: l.arr, reg: l.reg || null, ac: l.ac })) } : null,
        created: !pb && !!pa, removed: !!pb && !pa
      });
    });
    const splits = affected.filter(x => x.created || (x.after && x.after.freshAt) || (sol.steps.some(s => s.type === 'split' && s.newPairing === x.id)));
    const people = (sol.people || []).map(x => ({ id: x.id, name: x.name, rank: x.rank, hoursBefore: +x.hb.toFixed(2), hoursAfter: +x.ha.toFixed(2), delta: +(x.ha - x.hb).toFixed(2), overHard: !!x.overHard }));
    const steps = (sol.steps || []).map(x => {
      if (x.type === 'split') return { type: 'split', pairing: x.pairing, newPairing: x.newPairing, station: x.station, stationName: C.apName(x.station, before), time: x.time, timeTxt: C.fmtT(x.time), at: x.at, whole: !!x.whole, legsB: x.legsB };
      if (x.type === 'manual') return { type: 'manual', pairing: x.pairing, block: x.block };
      return { type: x.type, pairing: x.pairing, slot: x.slot, slotName: x.slot ? C.SLOT_NAME[x.slot] : null,
        from: x.from ? { id: x.from, name: pm0[x.from] ? pm0[x.from].name : x.from } : null,
        to: x.to ? { id: x.to, name: pm1[x.to] ? pm1[x.to].name : x.to, rank: pm1[x.to] ? pm1[x.to].rank : null } : null,
        why: x.why || null, fromStandby: !!x.fromStandby, prefWarn: x.prefWarn || null,
        chain: x.chain ? { pairing: x.chain.pairing, slot: x.chain.slot, from: x.chain.from, to: x.chain.to, fromStandby: !!x.chain.fromStandby } : null };
    });
    const dateStr = ctx.date != null ? `11/${String(ctx.date).padStart(2, '0')}` : '';
    const payload = {
      type: ctx.kind === 'leave' ? 'leave_alternate' : 'fdp_alternate',
      version: 1, exportedAt: new Date().toISOString(),
      note: '备选方案导出：仅供对比/备案，未应用到当前排班。使用「一键应用」才会写入。',
      context: {
        pairingId: ctx.pairingId || null, reg: ctx.reg || null, date: dateStr || null, dateNum: ctx.date || null,
        reason: ctx.exceed ? `D${ctx.exceed.d} 预计超 FDP ${ctx.exceed.exceed} 分钟` : (ctx.kind === 'leave' ? '临时请假调配' : (ctx.downstream && ctx.downstream.length ? '下游休息不足' : '执勤余量紧张（预防）')),
        exceed: ctx.exceed ? { d: ctx.exceed.d, fdp: ctx.exceed.fdp, limit: ctx.exceed.limit, exceed: ctx.exceed.exceed } : null,
        actuals: ctx.actuals || null,
        leave: ctx.leave || null
      },
      solution: {
        letter, name: sol.name, desc: sol.desc, score: sol.score, recommended: !!sol.recommended, key: sol.key || null,
        fdpFix: sol.fdpAfter != null ? { fdpDaysStillOver: sol.fdpAfter, restShortItems: sol.restAfterV || 0, ok: !sol.fdpAfter && !sol.restAfterV } : null,
        hard: sol.hard || 0, unresolved: sol.unresolved || 0, giniBefore: sol.giniB, giniAfter: sol.giniA, giniDelta: sol.giniD,
        prefDaysHit: sol.prefN || 0, rhythmDelta: sol.rhy || 0, bpTester: sol.bp || [],
        steps, people, affectedPairings: affected, newSplits: splits
      }
    };
    const base = `备选方案_${ctx.pairingId || (ctx.leave && ctx.leave.pilotId) || '方案'}${ctx.reg ? '_' + ctx.reg : ''}${dateStr ? '_' + dateStr.replace('/', '-') : ''}_方案${letter}`;
    dl(base + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    // CSV summary
    const rows = [['字段', '值'],
      ['方案', `方案${letter} · ${sol.name}`], ['推荐', sol.recommended ? '是' : '否'], ['评分', sol.score],
      ['任务', ctx.pairingId || ''], ['机号', ctx.reg || ''], ['日期', dateStr],
      ['说明', sol.desc || ''], ['FDP仍超限日数', sol.fdpAfter != null ? sol.fdpAfter : ''],
      ['休息不足项', sol.restAfterV != null ? sol.restAfterV : ''], ['硬性违规', sol.hard || 0],
      ['未解决岗位', sol.unresolved || 0], ['导出说明', '未应用到当前排班']];
    rows.push([]); rows.push(['步骤类型', '任务', '详情']);
    steps.forEach(x => {
      if (x.type === 'split') rows.push(['拆分', x.pairing, `${x.whole ? '整组' : '拆分'} → ${x.newPairing} @ ${x.stationName} ${x.timeTxt} · ${x.legsB} 段`]);
      else if (x.type === 'manual') rows.push(['人工', x.pairing, (x.block && x.block.rules || []).join('；')]);
      else rows.push([x.type, x.pairing, `${x.slotName || ''} ${(x.from && x.from.name) || '空'} → ${(x.to && x.to.name) || '空缺'}`]);
    });
    rows.push([]); rows.push(['人员', '级别', '工时前', '工时后', '变化']);
    people.forEach(x => rows.push([x.name, x.rank, x.hoursBefore, x.hoursAfter, x.delta]));
    rows.push([]); rows.push(['任务', '状态', '原机组', '新机组', '小时前', '小时后']);
    affected.forEach(x => {
      const cb = x.before ? ['C', 'F', 'T'].map(s => x.before.crew[s] ? x.before.crew[s].name : '—').join('/') : '';
      const ca = x.after ? ['C', 'F', 'T'].map(s => x.after.crew[s] ? x.after.crew[s].name : '—').join('/') : '';
      rows.push([x.id, x.created ? '新建' : x.removed ? '移除' : '调整', cb, ca, x.before ? x.before.hours : '', x.after ? x.after.hours : '']);
    });
    setTimeout(() => dl(base + '.csv', csv(rows)), 200);
    toast(`✔ 已导出备选方案 ${letter}（JSON + CSV），未改动当前排班`);
  }

  function solCard(sol, i) {
    const m = {}; (sol.state || st).pilots.forEach(p => m[p.id] = p); const nm = id => id && m[id] ? `${esc(m[id].name)} <span class="mut">${m[id].rank}</span>` : '<span class="red">空缺</span>';
    const t = sol.manual || sol.unresolved ? TYPE_TXT.manual : null;
    return `<div class="solc ${sol.recommended ? 'rec' : ''} ${i === cardCtx.hover ? 'sel' : ''} ${sol.unresolved ? 'bad' : ''}" data-i="${i}">
      <div class="solh"><b>方案 ${String.fromCharCode(65 + i)} · ${esc(sol.name)}</b>${sol.recommended ? '<span class="rtag">推荐</span>' : ''}${t ? `<span class="ttag ${t[1]}">${t[0]}</span>` : ''}<span class="score" title="综合评分（越低越好）：未解决×1000、新增硬违规×500、超90h×200、占意向休息×25、节奏扰动×4、基尼增量×2000、链式层级×6、涉及人数×2、调用备份−5；执勤方案另加：仍超执勤×800、休息不足×300">评分 ${sol.score}</span></div>
      <div class="note">${esc(sol.desc)}</div>
      <table class="solt"><tr><th>任务</th><th>调整</th></tr>${sol.steps.map(x => x.type === 'split' ? `<tr><td>${x.pairing}</td><td><span class="ttag spt">${x.whole ? '整组替换' : '拆分'}</span> ${x.whole ? '' : `原机组飞至 ${esc(C.apName(x.station, st))} 下机；`}自 ${C.fmtT(x.time)} ${esc(C.apName(x.station, st))} 起 ${x.legsB} 段由新机组执行${x.whole ? '' : `（新任务 ${x.newPairing}）`}</td></tr>` : `<tr><td>${x.pairing}${x.slot ? `<br><span class="mut">${C.SLOT_NAME[x.slot]}位</span>` : ''}</td><td>
        ${x.from ? `<span class="diff-del">${esc(m[x.from] ? m[x.from].name : x.from)}</span> → ` : ''}${x.why ? `<span class="mut">（${x.why}）</span>` : ''}${x.type === 'manual' ? '<span class="red">待人工</span>' : nm(x.to)} <span class="ttag ${TYPE_TXT[x.type][1]}">${TYPE_TXT[x.type][0]}</span>${x.prefWarn ? ` <span class="warnc">占${x.prefWarn}</span>` : ''}
        ${x.chain ? `<div class="mut">↳ ${x.chain.pairing} ${C.SLOT_NAME[x.chain.slot]}位：<span class="diff-del">${nm(x.chain.from)}</span> → ${nm(x.chain.to)}${x.chain.fromStandby ? ' <span class="ttag sbt">备份</span>' : ''}</div>` : ''}
        ${x.block ? `<div class="red" style="font-size:11px">受阻规则：${x.block.rules.map(esc).join('；') || '—'}<br>候选人主要不满足：${x.block.top.map(esc).join('，')}</div>` : ''}</td></tr>`).join('')}</table>
      <div class="solk">
        <div><span class="lab">工时变化</span>${sol.people.map(x => `<div>${esc(x.name)} ${x.hb.toFixed(1)}h→<b class="${x.overHard ? 'red' : 'okc'}">${x.ha.toFixed(1)}h</b> ${x.overHard ? `<span class="red">超 ${st.settings.hardMaxHours || 90}h 法规上限</span>` : ''}</div>`).join('') || '—'}</div>
        <div><span class="lab">公平（基尼）</span>${sol.giniB.toFixed(4)}→${sol.giniA.toFixed(4)} <span class="${sol.giniD > 0.002 ? 'warnc' : 'okc'}">(${sol.giniD >= 0 ? '+' : ''}${sol.giniD.toFixed(4)})</span></div>
        <div><span class="lab">意向休息 / 节奏</span>${sol.prefN ? `<span class="warnc">占用意向休息 ${sol.prefN} 天</span>` : '<span class="okc">不占意向休息</span>'} · ${sol.rhy ? `<span class="warnc">节奏扰动 +${sol.rhy}</span>` : '<span class="okc">节奏无扰动</span>'}</div>
        <div><span class="lab">当日剩余备份</span>${sol.sbLeft.map(x => `<span class="${x.n ? '' : 'warnc'}">${x.d}日:${x.n}</span>`).join(' ')}</div>
        ${sol.fdpAfter != null ? `<div><span class="lab">执勤 / 休息</span>${sol.fdpAfter ? `<span class="red">✖ 仍有 ${sol.fdpAfter} 个值勤日超限</span>` : '<span class="okc">✔ 预计 FDP 不超限</span>'} · ${sol.restAfterV ? `<span class="red">休息不足 ${sol.restAfterV} 项</span>` : '<span class="okc">休息满足</span>'}</div>` : ''}
        <div><span class="lab">合规检查</span>${sol.unresolved ? `<span class="red">✖ ${sol.unresolved} 个岗位需人工处理</span>` : sol.hard ? `<span class="red">✖ 硬性违规 ${sol.hard}</span>` : '<span class="okc">✔ 座位搭配 ✔ 特殊机场 ✔ 休息/工时 · 硬性违规 0</span>'}${sol.bp.length ? `<br><span class="warnc">血压测试仪：${sol.bp.join('、')} 始发站须配备</span>` : ''}</div>
      </div>
      <div class="solbtns"><button class="btn sm solext" data-i="${i}" title="下载此方案 JSON/CSV，不修改当前排班">导出此方案</button>
        <button class="btn ${sol.recommended ? 'primary' : ''} sm solapply" data-i="${i}" ${!sol.state || (sol.unresolved && !sol.steps.some(x => x.to)) ? 'disabled' : ''}>${!sol.state ? '需运控人工处理' : sol.unresolved ? '应用（空缺待人工）' : '一键应用'}</button></div></div>`;
  }
  // 通用：方案卡片交互（悬停预览、点选、应用）。label(sol) 生成历史说明
  function bindCards(sols, label, after, expCtx) {
    document.querySelectorAll('.solc').forEach(c => { const i = +c.dataset.i;
      c.onmouseenter = () => { $('#mgBox').innerHTML = miniGantt(sols[i]); document.querySelectorAll('.solc').forEach(x => x.classList.toggle('hov', x === c)); };
      c.onmouseleave = () => { $('#mgBox').innerHTML = miniGantt(sols[cardCtx.hover]); c.classList.remove('hov'); };
      c.onclick = e => { if (e.target.closest('.solapply, .solext')) return; cardCtx.hover = i; document.querySelectorAll('.solc').forEach(x => x.classList.toggle('sel', x === c)); $('#mgBox').innerHTML = miniGantt(sols[i]); }; });
    document.querySelectorAll('.solext').forEach(b => b.onclick = e => { e.stopPropagation(); exportSolPlan(sols[+b.dataset.i], +b.dataset.i, expCtx || {}); });
    document.querySelectorAll('.solapply').forEach(b => b.onclick = () => { const sol = sols[+b.dataset.i]; if (!sol.state) return;
      const lb = label(sol); const snap = JSON.stringify(st); const prevFills = JSON.parse(JSON.stringify(st.fills || []));
      leaveHist.push({ snap, label: lb, time: new Date().toTimeString().slice(0, 8) });
      const leavePilot = { id: (cardCtx.focus || [])[0] }; const days = cardCtx.days || [];
      st = sol.state; st.fills = prevFills; recordFillsFromSol(sol, leavePilot, days, sol.name);
      ui.hl = { pairings: new Set(sol.steps.flatMap(x => [x.pairing, x.newPairing, x.chain && x.chain.pairing]).filter(Boolean)), pilots: new Set([...(cardCtx.focus || []), ...sol.people.map(x => x.id)]), days: cardCtx.days };
      if (after) after(); tab = 'gantt'; refresh(); setTimeout(scrollToHl, 30); toast('✔ 已应用并标记补位：' + esc(lb) + ' <a href="#" id="tUndo" style="color:#9fd4ff">撤销</a>', 8000);
      const tu = $('#tUndo'); if (tu) tu.onclick = e => { e.preventDefault(); undoLeave(); }; });
  }
  const nmOf = (sol, id) => { const p = (sol.state || st).pilots.find(x => x.id === id); return p ? p.name : '空缺'; };
  function stepTxt(sol) { return sol.steps.map(x => x.type === 'split' ? `${x.pairing}${x.whole ? '整组替换' : '在' + C.apName(x.station, st) + '拆分'}` : x.pairing + (x.to ? '→' + nmOf(sol, x.to) : '空缺') + (x.chain ? `（${x.chain.pairing}→${nmOf(sol, x.chain.to)}）` : '')).join('，'); }
  function rLeave() {
    const caps = st.pilots.filter(p => C.isCaptClass(p.rank)).concat(st.pilots.filter(p => C.isFO(p.rank)));
    const idx = C.buildIndex(st);
    if (!leaveSel.pid) { const c = caps.slice().sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0]; const pr = idx.sched[c.id][1] || idx.sched[c.id][0]; leaveSel = { pid: c.id, from: pr ? pr.start : 1, to: pr ? pr.start + pr.ndays - 1 : 1 }; }
    const p = st.pilots.find(x => x.id === leaveSel.pid); const o = leaveOpts; const holes = leaveHoles;
    const tog = `<span class="seg" id="lvView"><button type="button" data-v="holes" class="${leaveView === 'holes' ? 'on' : ''}">空洞换人</button><button type="button" data-v="cards" class="${leaveView === 'cards' ? 'on' : ''}">多方案卡片</button><button type="button" data-v="history" class="${leaveView === 'history' ? 'on' : ''}">补位历史</button></span>`;
    let h = `<div class="panel"><h3>临时请假 · 调配 <small>先看「空洞换人」：空缺座位 + 推荐候选人与合规灯；完整多方案在右侧/次要视图</small></h3>
      <div class="flex" style="flex-wrap:wrap;gap:8px">${tog}
        <select id="lvP">${caps.map(c => `<option value="${c.id}" ${c.id === leaveSel.pid ? 'selected' : ''}>${esc(c.name)} · ${c.rank} · ${c.id} · ${idx.hours[c.id].toFixed(1)}h</option>`).join('')}</select>
        <span>日期</span><select id="lvF">${Array.from({ length: C.DAYS }, (_, i) => `<option ${i + 1 === leaveSel.from ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><span>至</span><select id="lvT">${Array.from({ length: C.DAYS }, (_, i) => `<option ${i + 1 === leaveSel.to ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><span>日</span>
        <button class="btn primary" id="lvGo">生成推荐</button>${leaveHist.length ? `<button class="btn" id="lvUndo">↶ 撤销（${leaveHist.length}）</button>` : ''}</div>
      <div class="note" style="margin-top:6px">任务：${idx.sched[p.id].map(pr => `<a class="lvpr" data-f="${pr.start}" data-t="${pr.start + pr.ndays - 1}">${pr.id}(${pr.start}${pr.ndays > 1 ? '–' + (pr.start + pr.ndays - 1) : ''}日)</a>`).join(' ') || '无'} · 已请假：${(p.leave || []).join(',') || '无'} · 意向休息：${(p.prefs || []).join(',') || '无'}
        · 灯：<span class="clight green"></span>合规 <span class="clight amber"></span>软性/意向休息 <span class="clight red"></span>硬性冲突</div></div>`;
    if (!holes && !o) h += `<div class="note">选择人员与日期后点击「生成推荐」</div>`;
    if (leaveView === 'holes' && holes) {
      h += `<div class="panel"><h3>${esc(holes.pilot.name)}（${holes.pilot.rank}）请假 ${holes.days[0]}${holes.days.length > 1 ? '–' + holes.days[holes.days.length - 1] : ''} 日 · 空洞 ${holes.holes.length} 个</h3>`;
      if (holes.plan) h += `<div class="planhint">✔ 引擎整案推荐「${esc(holes.plan.name)}」：${esc(holes.plan.desc || '')} · 评分 ${holes.plan.score}
        · 可在下方点选直接候选人，或打开「多方案卡片」一键应用整案（含链式调换）</div>`;
      if (!holes.holes.length) h += `<div class="note">所选日期内无执勤任务，仅需登记请假（可在多方案卡片中一键登记）。</div>`;
      h += `<div class="holegrid">${holes.holes.map((hh, hi) => {
        const empty = `<div class="hole-seat empty"><span class="clight red"></span><b>${hh.slotName}位 · 空缺</b><div class="mut">${esc(p.name)} 请假腾出</div></div>`;
        const left = hh.crewLeft.map(c => c.id ? `<div class="hole-seat"><b>${C.SLOT_NAME[c.slot]} ${esc(c.name)}</b> ${pill(c.rank)}</div>` : `<div class="hole-seat mut">${C.SLOT_NAME[c.slot]} 空</div>`).join('');
        const chips = (hh.legChips || []).map(l => `<span class="legchip">D${l.d} ${esc(l.flt)} <span class="${l.spFrom ? 'sp' : ''}">${esc(l.fromName)}</span>-<span class="${l.spTo ? 'sp' : ''}">${esc(l.toName)}</span></span>`).join('');
        const cands = hh.candidates.map((c, ci) => `<button type="button" class="cand ${c.light === 'red' ? 'redish' : ''} ${holePrev && holePrev.hi === hi && holePrev.ci === ci ? 'on' : ''}" data-hi="${hi}" data-ci="${ci}">
          <span class="clight ${c.light}"></span><span class="av">${esc((c.name || '??').slice(-2))}</span>
          <span class="cn"><b>${esc(c.name)}</b> ${pill(c.rank)}<br><span class="mut">${c.hoursBefore}h${c.fromStandby ? ' · ★备份' : ''}${c.warn ? ' · ⚠休息' : ''}${c.light === 'red' && c.reasons[0] ? ' · ' + esc(c.reasons[0].slice(0, 18)) : ''}</span></span></button>`).join('') || '<span class="mut">无候选</span>';
        const psteps = (hh.planSteps || []).map(x => x.type === 'chain' ? `链式：${x.to ? '←新机长位' : ''} ${esc(x.type)}` : `${esc(x.type)}${x.to ? '→…' : ''}`).join('；');
        return `<div class="holec" id="hole${hi}"><div class="holehd"><b>${hh.id}</b><span class="holemeta">${dateOf(hh.start)}起 ${hh.ndays} 天 · ${hh.ac} · ${hh.hours}h · 机号 ${(hh.reg || []).join('/') || '—'}</span></div>
          <div class="holeroute">${chips}</div>
          <div class="holeseats">${empty}${left}</div>
          <div class="candrow"><span class="lab">推荐</span>${cands}</div>
          ${hh.nGreen === 0 && holes.plan ? `<div class="note warnc" style="margin-top:8px">直接合规候选人不足；请用整案「${esc(holes.plan.name)}」或点选候选人查看原因。${psteps ? ' · ' + esc(psteps) : ''}</div>` : ''}
          </div>`;
      }).join('')}</div></div>`;
      if (holePrev && holes.holes[holePrev.hi] && holes.holes[holePrev.hi].candidates[holePrev.ci]) {
        const hh = holes.holes[holePrev.hi]; const c = hh.candidates[holePrev.ci];
        const imp = C.holeImpact(st, holes.pilot.id, holes.days, hh.id, hh.slot, c.id);
        h += `<div class="panel" id="holePrev"><div class="flex" style="flex-wrap:wrap"><h3 style="margin:0">预览 · ${esc(c.name)} → ${hh.id} ${hh.slotName}位</h3>
          <span class="clight ${c.light}" style="margin-left:8px"></span><b class="${c.light === 'green' ? 'okc' : c.light === 'amber' ? 'warnc' : 'red'}">${c.light === 'green' ? '合规通过' : c.light === 'amber' ? '软性提示' : '硬性冲突'}</b>
          <button class="btn sm" id="hpX" style="margin-left:auto">关闭</button></div>
          <div class="chiprow">
            <span class="chip">工时 ${c.hoursBefore}h → <b>${c.hoursAfter}h</b>（+${c.hoursDelta}）</span>
            <span class="chip ${c.overHard ? 'bad' : 'ok'}">${c.overHard ? '将超法规上限' : '未超法规上限'}</span>
            <span class="chip ${c.prefHit.length ? 'warn' : 'ok'}">意向休息 ${c.prefHit.length ? '占 ' + c.prefHit.join(',') + ' 日' : '不占用'}</span>
            <span class="chip">${c.fromStandby ? '调用备份 ' + c.standbyDays.join(',') : '非备份'}</span>
            <span class="chip">候选人剩余备份 ${c.sbMonthLeft} 天</span>
          </div>
          ${c.reasons.length ? `<div class="note red">冲突：${c.reasons.map(esc).join('；')}</div>` : ''}
          ${c.warn ? `<div class="note warnc">提示：${esc(c.warn)}</div>` : ''}
          ${imp ? `<div class="impactbox"><h4>下游影响（模拟应用后）</h4>
            <div class="chiprow">
              <span class="chip">基尼 ${imp.giniB} → <b>${imp.giniA}</b>（${imp.giniD >= 0 ? '+' : ''}${imp.giniD}）</span>
              <span class="chip ${imp.hardA > imp.hardB ? 'bad' : 'ok'}">硬性违规 ${imp.hardB} → ${imp.hardA}</span>
              <span class="chip ${imp.softA > imp.softB ? 'warn' : 'ok'}">软性 ${imp.softB} → ${imp.softA}</span>
              <span class="chip">满员率 ${(imp.coverageB * 100).toFixed(1)}% → ${(imp.coverageA * 100).toFixed(1)}%</span>
              <span class="chip ${imp.otherHoles.length ? 'warn' : 'ok'}">其余空洞 ${imp.otherHoles.length ? imp.otherHoles.join('、') : '无'}</span>
            </div>
            <table class="solt"><tr><th>人员</th><th>工时前</th><th>工时后</th><th>Δ</th><th>休息间隔（后）</th></tr>
              ${imp.hours.map((x, i) => `<tr><td>${esc(x.name)} ${pill(x.rank)}</td><td>${x.hb}</td><td><b>${x.ha}</b></td><td class="${x.delta > 0 ? 'warnc' : 'okc'}">${x.delta >= 0 ? '+' : ''}${x.delta}</td><td class="mut">${(imp.rest[i].gapsAfter || []).join(',') || '—'}</td></tr>`).join('')}
            </table>
            <div class="note">请假日备份人数：${imp.sbDays.map(x => `${x.d}日 ${x.before}→${x.after}`).join('；')}</div>
          </div>` : ''}
          ${holes.plan ? `<div class="note">若直接补位不可行，请改用多方案卡片中的「${esc(holes.plan.name)}」整案（可能含链式调换）。</div>` : ''}
          <div class="flex" style="margin-top:10px;flex-wrap:wrap;gap:8px"><button class="btn primary" id="hpApply" ${c.light === 'red' ? 'disabled' : ''}>应用此人补位并登记请假</button>
            ${holes.plan && o ? `<button class="btn" id="hpUsePlan">改用整案「${esc(holes.plan.name)}」</button>` : ''}
            <span class="mut">仅填本空洞；其余空洞请继续点选</span></div></div>`;
      }
    }
    if (leaveView === 'cards' && o) {
      h += `<div class="panel"><h3>${esc(o.pilot.name)}（${o.pilot.rank}）请假 ${o.days[0]}${o.days.length > 1 ? '–' + o.days[o.days.length - 1] : ''} 日 <small>受影响 ${o.affected.map(a => a.id + '·' + C.SLOT_NAME[a.slot] + '位').join('、') || '无'} · ${o.solutions.length} 方案 · ${o.ms} ms</small></h3>
        ${o.solutions.some(x => x.manual) ? '<div class="note red">有方案需人工处理</div>' : ''}
        <div class="solgrid">${o.solutions.map(solCard).join('')}</div></div>
        <div class="panel"><h3>影响预览</h3><div id="mgBox">${miniGantt(o.solutions[cardCtx.hover])}</div></div>`;
    } else if (holes && leaveView === 'holes') {
      h += `<div class="panel"><details><summary>高级：多方案卡片（${o ? o.solutions.length : 0}）</summary>
        ${o ? `<div class="solgrid" style="margin-top:10px">${o.solutions.map(solCard).join('')}</div>` : '<div class="note">请先生成</div>'}</details></div>`;
    }
    if (leaveView === 'history') {
      h += `<div class="panel"><h3>补位历史 <small>谁请假 · 谁补位 · 任务 · 可撤销</small></h3>${fillsHistoryHtml()}</div>`;
    } else {
      h += `<div class="panel"><h3>补位历史 <small><a href="#" id="lvToHist">查看全部</a></small></h3>${fillsHistoryHtml()}</div>`;
    }
    $('#main').innerHTML = h;
    if ($('#lvToHist')) $('#lvToHist').onclick = e => { e.preventDefault(); leaveView = 'history'; rLeave(); };
    if ($('#fillUndoLast')) $('#fillUndoLast').onclick = undoLeave;
    document.querySelectorAll('.fillUndoOne').forEach(b => b.onclick = () => undoFillById(b.dataset.fid));
    const regen = () => { if (leaveSel.to < leaveSel.from) leaveSel.to = leaveSel.from; genLeave(); rLeave(); };
    document.querySelectorAll('#lvView button').forEach(b => b.onclick = () => { leaveView = b.dataset.v; rLeave(); });
    $('#lvP').onchange = e => { leaveSel.pid = e.target.value; leaveOpts = null; leaveHoles = null; holePrev = null; rLeave(); };
    $('#lvF').onchange = e => { leaveSel.from = +e.target.value; if (leaveSel.to < leaveSel.from) leaveSel.to = leaveSel.from; leaveOpts = null; leaveHoles = null; rLeave(); };
    $('#lvT').onchange = e => { leaveSel.to = +e.target.value; leaveOpts = null; leaveHoles = null; rLeave(); };
    document.querySelectorAll('.lvpr').forEach(a => a.onclick = () => { leaveSel.from = +a.dataset.f; leaveSel.to = +a.dataset.t; regen(); });
    $('#lvGo').onclick = regen;
    document.querySelectorAll('.cand').forEach(b => b.onclick = () => { holePrev = { hi: +b.dataset.hi, ci: +b.dataset.ci }; rLeave(); const e = $('#holePrev'); if (e) e.scrollIntoView({ block: 'nearest' }); });
    if ($('#hpX')) $('#hpX').onclick = () => { holePrev = null; rLeave(); };
    if ($('#hpApply')) $('#hpApply').onclick = () => applyHoleCand();
    if ($('#hpUsePlan')) $('#hpUsePlan').onclick = () => { leaveView = 'cards'; rLeave(); const e = document.querySelector('.solc.rec .solapply') || document.querySelector('.solc.rec'); if (e) e.scrollIntoView({ block: 'center' }); };
    if (o && (leaveView === 'cards' || (leaveView === 'holes' && holes))) bindCards(o.solutions, sol => `${o.pilot.name} 请假 ${o.days[0]}–${o.days[o.days.length - 1]} 日 · 方案「${sol.name}」：${stepTxt(sol)}`, () => { leaveOpts = null; leaveHoles = null; },
      { kind: 'leave', leave: { pilotId: o.pilot.id, pilotName: o.pilot.name, days: o.days }, date: o.days[0], pairingId: (o.affected[0] && o.affected[0].id) || '' });
    if ($('#lvUndo')) $('#lvUndo').onclick = undoLeave;
  }
  function applyHoleCand() {
    if (!leaveHoles || !holePrev) return;
    const hh = leaveHoles.holes[holePrev.hi]; const c = hh.candidates[holePrev.ci]; if (!c || c.light === 'red') return;
    const days = leaveHoles.days.slice(); const pid = leaveHoles.pilot.id;
    const snap = JSON.stringify(st);
    const p = st.pilots.find(x => x.id === pid);
    p.leave = [...new Set([...(p.leave || []), ...days])].sort((a, b) => a - b);
    p.prefs = (p.prefs || []).filter(d => !p.leave.includes(d));
    if (st.standby && st.standby[pid]) st.standby[pid] = st.standby[pid].filter(d => !days.includes(d));
    const pr = st.pairings.find(x => x.id === hh.id); if (!pr) return;
    pr.crew[hh.slot] = c.id;
    if (st.standby && st.standby[c.id]) st.standby[c.id] = st.standby[c.id].filter(d => !C.daysTouched(pr, st).includes(d));
    leaveHist.push({ snap, label: `${p.name} 请假 ${days[0]}–${days[days.length - 1]} · ${hh.id}${hh.slotName}←${c.name}`, time: new Date().toTimeString().slice(0, 8) });
    recordFillsFromHole(hh, p, days, c, 'hole');
    ui.hl = { pairings: new Set([hh.id]), pilots: new Set([pid, c.id]), days };
    leaveOpts = null; leaveHoles = null; holePrev = null;
    tab = 'gantt'; refresh(); setTimeout(scrollToHl, 30);
    toast('✔ 已补位并标记：' + esc(c.name) + ' → ' + hh.id + ' <a href="#" id="tUndo" style="color:#9fd4ff">撤销</a>', 8000);
    const tu = $('#tUndo'); if (tu) tu.onclick = e => { e.preventDefault(); undoLeave(); };
  }
  function scrollToHl() { const b = document.querySelector('.bar.hl'); const g = $('.gwrap'); if (b && g) { g.scrollTop = Math.max(0, b.parentElement.offsetTop - 140); g.scrollLeft = Math.max(0, b.offsetLeft - 420); } }
  function undoLeave() { const x = leaveHist.pop(); if (!x) return; st = JSON.parse(x.snap); ui.hl = null; leaveOpts = null; leaveHoles = null; holePrev = null; refresh(); toast('已撤销：' + esc(x.label)); }


  function rFills() {
    ensureFills();
    let h = `<div class="panel"><h3>补位历史 <small>请假调配应用后的补位记录；甘特/任务上显示「补位」角标</small></h3>
      <div class="note">共 ${(st.fills || []).filter(f => !f.undone).length} 条有效记录 · 历史栈 ${leaveHist.length} 步可撤销</div>
      ${fillsHistoryHtml()}</div>`;
    $('#main').innerHTML = h;
    if ($('#fillUndoLast')) $('#fillUndoLast').onclick = undoLeave;
    document.querySelectorAll('.fillUndoOne').forEach(b => b.onclick = () => undoFillById(b.dataset.fid));
  }

  // ---------------- 人员总览（授权 / 健康限制） ----------------
  function rRoster() {
    C.migratePilots(st);
    const authList = C.authAirports(st);
    const levelList = C.levelAirports(st);
    let ps = st.pilots.slice().sort((a, b) => {
      const order = { '教员': 0, '机长': 1, '新机长': 2, '副驾驶': 3 };
      return order[C.rankGroup(a.rank)] - order[C.rankGroup(b.rank)] || C.RANK_VAL[b.rank] - C.RANK_VAL[a.rank] || a.id.localeCompare(b.id);
    });
    if (ui.rg !== '全部') ps = ps.filter(p => C.rankGroup(p.rank) === ui.rg);
    if (ui.rs !== '全部') ps = ps.filter(p => p.squad === ui.rs);
    if (ui.ra !== '全部') ps = ps.filter(p => (p.auth || []).includes(ui.ra));
    if (ui.rh === '有限制') ps = ps.filter(p => C.hasHealthRestriction(p.health));
    if (ui.rh === '不适飞') ps = ps.filter(p => p.health && p.health.noFly);
    if (ui.rh === '限制高原') ps = ps.filter(p => p.health && p.health.noPlateau);
    if (ui.rh === '限制夜间') ps = ps.filter(p => p.health && p.health.noNight);
    if (ui.rq) { const q = ui.rq.trim(); ps = ps.filter(p => (p.name + p.id + p.rank + (p.squad || '') + (p.health && p.health.note || '')).includes(q)); }
    const squads = ['全部', ...new Set(st.pilots.map(p => p.squad).filter(Boolean))];
    const nAuth = authList.length;
    const nRest = st.pilots.filter(p => C.hasHealthRestriction(p.health)).length;
    let h = `<div class="panel"><h3>人员总览 · 特殊机场授权与健康限制 <small>授权机场与规章校验一致（RE12 需授权类）；健康限制参与候选人过滤与校验（不适飞/体检过期为硬性，高原/夜航限制为软性提示）</small></h3>
      <div class="flex" style="flex-wrap:wrap;gap:8px">
        <input id="rq" placeholder="搜索姓名/员工号/备注" value="${esc(ui.rq)}" style="width:180px">
        <select id="rg">${['全部', ...C.GROUPS].map(g => `<option ${g === ui.rg ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <select id="rs">${squads.map(g => `<option ${g === ui.rs ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <select id="ra"><option value="全部">授权机场：全部</option>${authList.map(c => `<option value="${c}" ${ui.ra === c ? 'selected' : ''}>${esc(C.apName(c, st))}</option>`).join('')}</select>
        <select id="rh">${['全部', '有限制', '不适飞', '限制高原', '限制夜间'].map(g => `<option ${g === ui.rh ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <span class="mut">${ps.length}/${st.pilots.length} 人 · 有健康限制 ${nRest} 人 · 授权机场 ${nAuth} 个</span>
        <button class="btn sm" id="roExp" style="margin-left:auto">导出 CSV</button>
      </div>
      <div class="note" style="margin-top:8px"><span class="authtag on">绿</span> 已授权　<span class="authtag">灰</span> 未授权（需授权类：拉萨/丽江/西双版纳/西昌/西宁/大连/高原/赤峰）。克拉玛依、茅台/吕梁/忻州为级别运行限制（按座位级别，非个人授权本）。点击行可编辑健康限制与授权。</div></div>
      <div class="panel scroll" style="max-height:calc(100vh - 220px);padding:0"><table class="rost"><thead><tr>
        <th>员工号</th><th>姓名</th><th>级别</th><th>大队</th><th>健康限制</th>
        ${authList.map(c => `<th class="ath" title="${c}">${esc(C.apName(c, st))}</th>`).join('')}
        <th>授权数</th><th></th></tr></thead><tbody>`;
    for (const p of ps) {
      const flags = C.healthFlags(p.health);
      const badges = flags.length
        ? flags.map(f => {
            const cls = f.includes('不适飞') || f.includes('体检') ? 'hb bad' : f.includes('高原') || f.includes('夜间') ? 'hb warn' : 'hb';
            return `<span class="${cls}">${esc(f)}</span>`;
          }).join(' ')
        : '<span class="mut">—</span>';
      const authN = (p.auth || []).filter(c => authList.includes(c)).length;
      h += `<tr class="rorow" data-pid="${p.id}">
        <td class="mut">${p.id}</td><td><b>${esc(p.name)}</b></td><td>${pill(p.rank)}</td><td>${esc(p.squad || '—')}</td>
        <td class="hcell">${badges}</td>
        ${authList.map(c => `<td class="acell">${(p.auth || []).includes(c) ? '<span class="authtag on" title="已授权">✓</span>' : '<span class="authtag" title="未授权">·</span>'}</td>`).join('')}
        <td>${authN}/${nAuth}</td>
        <td><button class="btn sm roEdit" data-pid="${p.id}">编辑</button> <button class="btn sm roLeave" data-pid="${p.id}">请假</button></td></tr>`;
    }
    if (!ps.length) h += '<tr><td colspan="20" class="note">无匹配人员</td></tr>';
    h += '</tbody></table></div>';
    // legend level airports
    h += `<div class="panel"><h3>级别运行机场（参考）</h3><div class="note">${levelList.map(c => `${esc(C.apName(c, st))}（${esc(C.CAT_DESC[C.apCat(c, st)] || C.apCat(c, st))}）`).join('　·　') || '—'}</div></div>`;
    $('#main').innerHTML = h;
    const redraw = () => rRoster();
    $('#rq').oninput = e => { ui.rq = e.target.value; const pos = e.target.selectionStart; redraw(); const el = $('#rq'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } };
    $('#rg').onchange = e => { ui.rg = e.target.value; redraw(); };
    $('#rs').onchange = e => { ui.rs = e.target.value; redraw(); };
    $('#ra').onchange = e => { ui.ra = e.target.value; redraw(); };
    $('#rh').onchange = e => { ui.rh = e.target.value; redraw(); };
    document.querySelectorAll('.roEdit').forEach(b => b.onclick = e => { e.stopPropagation(); openRosterEdit(b.dataset.pid); });
    document.querySelectorAll('.roLeave').forEach(b => b.onclick = e => {
      e.stopPropagation(); const id = b.dataset.pid; const ix = C.buildIndex(st); const nx = (ix.sched[id] || []).find(pr => pr.start + pr.ndays - 1 >= 1) || (ix.sched[id] || [])[0];
      goLeave(id, nx ? nx.start : 1, nx ? nx.start + nx.ndays - 1 : 1);
    });
    document.querySelectorAll('.rorow').forEach(r => r.ondblclick = () => openRosterEdit(r.dataset.pid));
    $('#roExp').onclick = () => {
      const rows = [['员工号', '姓名', '级别', '组别', '大队', '暂时不适飞', '限制高原', '限制夜间', '血压备注', '体检到期', '健康备注', ...authList.map(c => C.apName(c, st) + '(' + c + ')'), '已授权数']];
      st.pilots.forEach(p => {
        const h = p.health || C.defaultHealth();
        rows.push([p.id, p.name, p.rank, C.rankGroup(p.rank), p.squad || '', h.noFly ? '是' : '', h.noPlateau ? '是' : '', h.noNight ? '是' : '', h.bpNote || '', h.medExamExpiry || '', h.note || '',
          ...authList.map(c => (p.auth || []).includes(c) ? '✓' : ''), (p.auth || []).filter(c => authList.includes(c)).length]);
      });
      dl('人员总览_授权与健康_2026-11.csv', csv(rows));
      toast('✔ 已导出人员总览 CSV');
    };
  }
  function openRosterEdit(pid) {
    C.migratePilots(st);
    const p = st.pilots.find(x => x.id === pid); if (!p) return;
    const authList = C.authAirports(st);
    const h = Object.assign(C.defaultHealth(), p.health || {});
    const squads = ['一大队', '二大队', '三大队', '教学中队'];
    let box = `<div class="flex"><h3 style="margin:0">人员档案 · ${esc(p.name)} ${pill(p.rank)} <span class="mut">${p.id}</span></h3><button class="btn" style="margin-left:auto" id="mClose">关闭</button></div>
      <div class="grid g2" style="margin-top:12px">
        <div><label class="lab">大队</label><select id="edSquad">${squads.map(x => `<option ${x === p.squad ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div><label class="lab">体检到期日</label><input type="date" id="edMed" value="${esc(h.medExamExpiry || '')}"></div>
      </div>
      <h3 style="margin-top:14px">健康 / 身体限制</h3>
      <div class="flex" style="flex-wrap:wrap;gap:12px">
        <label><input type="checkbox" id="edNoFly" ${h.noFly ? 'checked' : ''}> 暂时不适飞</label>
        <label><input type="checkbox" id="edNoPl" ${h.noPlateau ? 'checked' : ''}> 限制高原（拉萨/高原类）</label>
        <label><input type="checkbox" id="edNoNi" ${h.noNight ? 'checked' : ''}> 限制夜间</label>
      </div>
      <div style="margin-top:8px"><label class="lab">血压相关备注</label><input id="edBp" style="width:100%" value="${esc(h.bpNote || '')}" placeholder="如：血压偏高随访、须带记录本"></div>
      <div style="margin-top:8px"><label class="lab">其他备注</label><input id="edNote" style="width:100%" value="${esc(h.note || '')}"></div>
      <h3 style="margin-top:14px">特殊机场授权 <small>点击切换</small></h3>
      <div class="authgrid" id="edAuth">${authList.map(c => `<button type="button" class="authtag ${(p.auth || []).includes(c) ? 'on' : ''} edA" data-c="${c}">${esc(C.apName(c, st))}<span class="mut"> ${c}</span></button>`).join('')}</div>
      <div class="flex" style="margin-top:14px"><button class="btn primary" id="edSave">保存</button><button class="btn" id="edCancel">取消</button></div>`;
    $('#modalBox').innerHTML = box; $('#modal').classList.remove('hidden');
    $('#mClose').onclick = $('#edCancel').onclick = closeModal;
    document.querySelectorAll('.edA').forEach(b => b.onclick = () => b.classList.toggle('on'));
    $('#edSave').onclick = () => {
      p.squad = $('#edSquad').value;
      p.health = {
        noFly: $('#edNoFly').checked, noPlateau: $('#edNoPl').checked, noNight: $('#edNoNi').checked,
        bpNote: $('#edBp').value.trim(), medExamExpiry: $('#edMed').value || '', note: $('#edNote').value.trim()
      };
      const on = new Set([...document.querySelectorAll('.edA.on')].map(x => x.dataset.c));
      // keep non-auth-list entries if any, replace auth-list ones
      const keep = (p.auth || []).filter(c => !authList.includes(c));
      p.auth = keep.concat(authList.filter(c => on.has(c)));
      closeModal(); refresh(); toast('✔ 已保存 ' + esc(p.name) + ' 的档案');
    };
  }

  // ---------------- 员工福利 ----------------
  function rWelfare() {
    const S = st.settings; const off = { C: Array(C.DAYS + 1).fill(0), F: Array(C.DAYS + 1).fill(0) };
    st.pilots.forEach(p => { const k = C.isFO(p.rank) ? 'F' : 'C'; new Set([...(p.prefs || []), ...(p.leave || [])]).forEach(d => off[k][d]++); });
    const per = {}; sum.per.forEach(x => per[x.id] = x);
    const days = Array.from({ length: C.DAYS }, (_, i) => i + 1);
    let h = `<div class="grid g2"><div class="panel"><h3>每日休息/请假人数 · 机长类 <small>上限 ${S.maxOffCapt} 人/天</small></h3>${CH.bars(days.map(d => ({ label: String(d), value: off.C[d], color: off.C[d] > S.maxOffCapt ? '#ff5a6a' : '#3ea6ff' })), { w: 620, h: 200, lines: [{ v: S.maxOffCapt, label: '上限', color: '#ff5a6a' }] })}</div>
      <div class="panel"><h3>每日休息/请假人数 · 副驾驶 <small>上限 ${S.maxOffFO} 人/天</small></h3>${CH.bars(days.map(d => ({ label: String(d), value: off.F[d], color: off.F[d] > S.maxOffFO ? '#ff5a6a' : '#2ecc8f' })), { w: 620, h: 200, lines: [{ v: S.maxOffFO, label: '上限', color: '#ff5a6a' }] })}</div></div>
      <div class="panel"><h3>意向休息日申报 <small>每人可申报 2 个意向休息日（排班前提交）；满足率 <b class="okc">${(sum.prefRate * 100).toFixed(1)}%</b>（${sum.prefOK}/${sum.prefT}）</small></h3>
      <div class="scroll"><table><tr><th>员工号</th><th>姓名</th><th>级别</th><th>意向休息日 1</th><th>意向休息日 2</th><th>请假日</th><th>满足情况</th></tr>
      ${st.pilots.map(p => { const opts = v => `<option value="">—</option>` + days.map(d => `<option ${v === d ? 'selected' : ''} value="${d}">${dateOf(d)} 周${WK[dow(d)]}</option>`).join('');
        const x = per[p.id]; return `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${pill(p.rank)}</td>${[0, 1].map(i => `<td><select data-pref="${p.id}" data-i="${i}">${opts((p.prefs || [])[i])}</select></td>`).join('')}
        <td class="mut">${(p.leave || []).join(',') || '—'}</td><td>${x.prefTotal ? (x.prefOK === x.prefTotal ? '<span class="okc">✔ 全部满足</span>' : `<span class="warnc">${x.prefOK}/${x.prefTotal}</span>`) : '—'}</td></tr>`; }).join('')}</table></div></div>`;
    $('#main').innerHTML = h;
    document.querySelectorAll('[data-pref]').forEach(sel => sel.onchange = () => {
      const p = st.pilots.find(x => x.id === sel.dataset.pref); const i = +sel.dataset.i; const v = sel.value ? +sel.value : null;
      const prefs = (p.prefs || []).slice(); if (v) { const k = C.isFO(p.rank) ? 'F' : 'C'; const lim = k === 'F' ? S.maxOffFO : S.maxOffCapt;
        if (!prefs.includes(v) && !(p.leave || []).includes(v) && off[k][v] >= lim) { toast(`${dateOf(v)} ${k === 'F' ? '副驾驶' : '机长类'}休息人数已达上限 ${lim}，请选择其他日期`); return rWelfare(); } }
      prefs[i] = v; p.prefs = [...new Set(prefs.filter(Boolean))].sort((a, b) => a - b); refresh(); toast('已保存。重新“一键自动填人”可按新意向排班'); });
  }

  // ---------------- 导入导出 ----------------
  function csv(rows) { return '\ufeff' + rows.map(r => r.map(x => { x = String(x == null ? '' : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',')).join('\r\n'); }
  function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' })); a.download = name; a.click(); }
  function parseCSV(t) { t = t.replace(/^\ufeff/, ''); const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
    if (f || row.length) { row.push(f); rows.push(row); } return rows.filter(r => r.some(x => x.trim())); }
  const PIL_H = ['员工号', '姓名', '级别', '授权机场(;分隔)', '意向休息日(;分隔)', '请假日(;分隔)'];
  const PR_H = ['任务号', '日序(D)', '航班号', '起飞机场', '落地机场', '日期(11月几日)', '起飞时间', '落地时间(次日加+1)', '机型'];
  const pilotRows = () => [PIL_H, ...st.pilots.map(p => [p.id, p.name, p.rank, (p.auth || []).join(';'), (p.prefs || []).join(';'), (p.leave || []).join(';')])];
  const tm = (m, base) => { const dd = Math.floor(m / C.DAY) - base; return C.fmtT(m) + (dd > 0 ? '+' + dd : ''); };
  const pairRows = () => [PR_H, ...st.pairings.flatMap(pr => pr.legs.map(l => { const day = Math.floor(l.dep / C.DAY); return [pr.id, l.d, l.flt, l.from, l.to, day + 1, C.fmtT(l.dep), tm(l.arr, day), l.ac]; }))];
  function rData() {
    $('#main').innerHTML = `<div class="grid g2"><div class="panel"><h3>导出</h3><div class="note">CSV 为 UTF-8 BOM 格式，可直接用 Excel 打开。</div><div style="margin-top:10px;line-height:3">
      <button class="btn" id="exRoster">排班表（按航段，含机组）</button><button class="btn" id="exHours">人员工时统计</button><button class="btn" id="exViol">校验问题清单</button><br>
      <button class="btn" id="exPil">人员数据</button><button class="btn" id="exPr">任务数据</button><button class="btn" id="exJson">完整备份(JSON)</button></div></div>
      <div class="panel"><h3>导入</h3><div class="note">导入将替换对应数据并清空现有排班。可先下载模板。</div><div style="margin-top:10px;line-height:3">
      <button class="btn" id="tpPil">下载人员模板</button><button class="btn" id="tpPr">下载任务模板</button><br>
      <label class="btn">导入人员 CSV<input type="file" id="imPil" accept=".csv" hidden></label><label class="btn">导入任务 CSV<input type="file" id="imPr" accept=".csv" hidden></label><label class="btn">恢复备份 JSON<input type="file" id="imJson" accept=".json" hidden></label></div><div id="imMsg" class="note"></div></div></div>
      <div class="panel"><h3>格式说明</h3><div class="note" style="line-height:1.9">人员 CSV 列：${PIL_H.join('，')}；级别取值：${C.RANKS.join(' / ')}<br>任务 CSV 列：${PR_H.join('，')}；同一任务号的多行即该任务的各航段（按日序、时间排列），任务须从 ZUUU 出发并回到 ZUUU。机场使用 ICAO 四字码，须在“设置”机场表内。</div></div>`;
    const m = pm();
    $('#exRoster').onclick = () => dl('排班表_2026-11.csv', csv([['任务号', '日序', '日期', '航班号', '起飞', '落地', '起飞时间', '落地时间', '机型', '特殊机场', '需血压测试仪', '机长(机)', '级别', '副驾驶(副)', '级别', '第三人(三)', '级别'],
      ...st.pairings.flatMap(pr => pr.legs.map(l => { const day = Math.floor(l.dep / C.DAY); const c = s => pr.crew[s] && m[pr.crew[s]];
        return [pr.id, 'D' + l.d, '2026-11-' + String(day + 1).padStart(2, '0'), l.flt, `${l.from} ${C.apName(l.from, st)}`, `${l.to} ${C.apName(l.to, st)}`, C.fmtT(l.dep), tm(l.arr, day), l.ac,
          [l.from, l.to].filter(x => C.isSpecial(x, st)).map(x => C.apName(x, st)).join(';'), (st.settings.bpTesterAirports || []).includes(l.from) ? '是' : '',
          ...['C', 'F', 'T'].flatMap(s => c(s) ? [c(s).name + '(' + c(s).id + ')', c(s).rank] : ['空缺', ''])]; }))]));
    $('#exHours').onclick = () => dl('人员工时_2026-11.csv', csv([['员工号', '姓名', '级别', '组别', '本月飞行小时', '任务数', '执勤天数', '过夜次数', '特殊机场任务', '夜航段', '意向休息日满足', '备份天数', '备份日期', '任务间休息天数'], ...sum.per.map(x => [x.id, x.name, x.rank, x.group, x.hours.toFixed(2), x.pairings, x.dutyDays, x.overnights, x.special, x.night, x.prefOK + '/' + x.prefTotal, x.standby, ((st.standby || {})[x.id] || []).join(';'), x.gaps.join(';')])]));
    $('#exViol').onclick = () => dl('校验问题_2026-11.csv', csv([['级别', '类型', '任务', '说明'], ...sum.violations.map(v => [v.level, v.type, v.pairing || '', v.msg])]));
    $('#exPil').onclick = () => dl('人员数据.csv', csv(pilotRows())); $('#exPr').onclick = () => dl('任务数据.csv', csv(pairRows()));
    $('#exJson').onclick = () => dl('排班备份.json', JSON.stringify(st), 'application/json');
    $('#tpPil').onclick = () => dl('人员模板.csv', csv([PIL_H, ['E10001', '张三', 'J3', 'ZULS;ZPLJ', '5;18', ''], ['E10002', '李四', 'F5', 'ZUJZ', '7;21', '12;13;14']]));
    $('#tpPr').onclick = () => dl('任务模板.csv', csv([PR_H, ['PR901', 1, 'EU2201', 'ZUUU', 'ZWWW', 3, '08:00', '12:20', 'A320'], ['PR901', 1, 'EU2202', 'ZWWW', 'ZUUU', 3, '13:20', '17:30', 'A320'], ['PR902', 1, 'EU6683', 'ZUUU', 'ZGHA', 5, '21:00', '22:50', 'A320'], ['PR902', 2, 'EU6684', 'ZGHA', 'ZUUU', 6, '07:30', '09:20', 'A320']]));
    const read = (inp, fn) => inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { fn(r.result); } catch (e) { $('#imMsg').innerHTML = '<span class="red">导入失败：' + esc(e.message) + '</span>'; } }; r.readAsText(f, 'utf-8'); };
    read($('#imPil'), t => { const rows = parseCSV(t).slice(1); const ps = rows.map((r, i) => { if (!C.RANK_VAL[r[2] && r[2].trim()]) throw new Error(`第${i + 2}行级别无效：${r[2]}`);
      const ls = x => (x || '').split(/[;；\s]+/).filter(Boolean); return { id: r[0].trim(), name: r[1].trim(), rank: r[2].trim(), auth: ls(r[3]), prefs: ls(r[4]).map(Number), leave: ls(r[5]).map(Number) }; });
      st.pilots = ps; st.sample = false; st.standby = null; st.pairings.forEach(p => p.crew = { C: null, F: null, T: null }); refresh(); toast(`已导入 ${ps.length} 名人员`); });
    read($('#imPr'), t => { const rows = parseCSV(t).slice(1); const g = {};
      rows.forEach((r, i) => { const [id, d, flt, from, to, day, dep, arr, ac] = r.map(x => x.trim());
        if (!C.AIRPORTS[from] && !(st.airports || {})[from]) throw new Error(`第${i + 2}行机场未知：${from}`);
        const pt = s => { const m = s.match(/^(\d{1,2}):(\d{2})(?:\+(\d))?$/); if (!m) throw new Error(`第${i + 2}行时间格式错误：${s}`); return (+m[3] || 0) * C.DAY + (+m[1]) * 60 + (+m[2]); };
        const base = (+day - 1) * C.DAY; (g[id] = g[id] || []).push({ d: +d.replace(/\D/g, ''), flt, from, to, dep: base + pt(dep), arr: base + pt(arr), ac: ac || 'A320' }); });
      st.pairings = Object.entries(g).map(([id, legs]) => { legs.sort((a, b) => a.dep - b.dep); const start = Math.floor(legs[0].dep / C.DAY) + 1;
        return { id, start, ndays: Math.floor(legs[legs.length - 1].arr / C.DAY) + 1 - start + (legs[legs.length - 1].arr % C.DAY === 0 ? 0 : 0), ac: legs.some(l => l.ac === 'A321') ? 'A321' : 'A320', legs, crew: { C: null, F: null, T: null } }; })
        .map(p => (p.ndays = Math.max(p.ndays, ...p.legs.map(l => l.d)), p)).sort((a, b) => a.legs[0].dep - b.legs[0].dep);
      st.sample = false; refresh(); toast(`已导入 ${st.pairings.length} 个任务`); });
    read($('#imJson'), t => { const s = JSON.parse(t); if (!s.pilots || !s.pairings) throw new Error('不是有效备份'); st = s; st.settings = C.migrateSettings(Object.assign(C.defaultSettings(), st.settings)); refresh(); toast('备份已恢复'); });
  }

  // ---------------- 设置 ----------------
  function rSettings() {
    const S = st.settings; const aps = Object.assign({}, C.AIRPORTS, st.airports || {});
    const num = (k, lab, unit) => `<div class="slotbox" style="grid-template-columns:200px 120px 60px"><span>${lab}</span><input type="number" step="any" data-k="${k}" value="${S[k]}"><span class="mut">${unit}</span></div>`;
    const cats = ['NONE', 'LHASA', 'HIGH', 'PLATEAU', 'ZBCF', 'J1', 'US'];
    $('#main').innerHTML = `<div class="grid g2"><div class="panel"><h3>排班参数</h3>
      ${num('minRestH', '两任务间最短休息', '小时')}${num('hardMaxHours', '月飞行小时法规硬上限（CAAC）', '小时')}${num('opsDayWindowH', '运营看板·飞机日可用窗口', '小时（利用率分母）')}
      ${num('maxOffCapt', '同日最多休息/请假（机长类）', '人')}${num('maxOffFO', '同日最多休息/请假（副驾驶）', '人')}${num('standbyPerDay', '每日备份人数（机长类/副驾驶交替）', '人')}${num('maxStandbyPerPilot', '每人每月最多备份', '天')}${num('gapWeight', '休息 2–3 天偏好权重（软）', '0–1')}${num('reportMin', '首段起飞前报到', '分钟')}${num('releaseMin', '末段落地后退场', '分钟')}
      <label class="flex"><input type="checkbox" id="hp" ${S.honorPrefs ? 'checked' : ''}> 自动排班优先保障意向休息日（无法满员时才放宽）</label>
      <div class="note" style="margin-top:8px">月飞行小时仅设 CAAC 法规硬上限；自动排班按可用天数折算份额做公平均衡（基尼系数），不设目标上下限。</div>
      <h3 style="margin-top:16px">血压测试仪机场 <small>勾选的机场作为始发站（出港）时须配备血压测试仪，相关任务将被标记提醒（机场清单待确认，可随时调整）</small></h3>
      <div style="column-count:3;font-size:12px">${Object.keys(aps).map(c => `<label style="display:block"><input type="checkbox" data-bpt="${c}" ${(S.bpTesterAirports || []).includes(c) ? 'checked' : ''}> ${c} ${aps[c][0]}</label>`).join('')}</div>
      <h3 style="margin-top:16px">飞行值勤期（FDP）限制 <small class="warnc">默认值，参考 CCAR-121 部非扩编机组表，可按公司规定修改</small></h3>
      <table class="fdpt"><tr><th>报到时间（本地）</th>${C.LEG_COLS.map(c => `<th>${c}</th>`).join('')}</tr>${S.fdpTable.map((r, ri) => `<tr><td>${r.label}</td>${r.lim.map((v, ci) => `<td><input type="number" step="0.5" class="fdpin" data-r="${ri}" data-c="${ci}" value="${v}"> h</td>`).join('')}</tr>`).join('')}</table>
      <div class="note">FDP = 当日首段计划起飞前报到（${S.reportMin} 分钟）至末段落地（挡轮挡）；按报到时刻与当日航段数查表。</div>
      <label class="flex" style="margin-top:6px"><input type="checkbox" id="fdpAug" ${S.fdpAugmented ? 'checked' : ''}> 三人机组按扩编机组计算（须具备符合要求的机上休息设施），限制统一取</label>${num('fdpAugLimitH', '扩编机组 FDP 限制', '小时')}
      ${num('fdpRiskHigh', '高风险：延误余量 <', '分钟')}${num('fdpRiskMed', '中风险：延误余量 <', '分钟')}${num('minTurnMin', '延误推算最短过站', '分钟')}${num('minOvernightRestH', '任务内过夜最低休息', '小时')}
      <div style="margin-top:6px"><button class="btn sm" id="fdpReset">恢复默认 FDP 表</button></div>
      <div style="margin-top:12px"><button class="btn primary" id="saveS">保存设置并重新校验</button></div></div>
      <div class="panel"><h3>机场与特殊机场类别</h3><div class="note">类别：${cats.map(c => c + '=' + (C.CAT_DESC[c] || '')).join('；')}。需授权类别：${C.AUTH_CATS.join('/')}</div>
      <div class="scroll"><table><tr><th>ICAO</th><th>名称</th><th>类别</th></tr>${Object.keys(aps).map(c => `<tr><td>${c}</td><td class="${aps[c][3] ? 'red' : ''}">${aps[c][0]}</td><td><select data-cat="${c}" ${c === 'ZUUU' ? 'disabled' : ''}>${cats.map(k => `<option value="${k}" ${(aps[c][3] || 'NONE') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td></tr>`).join('')}</table></div></div></div>`;
    $('#saveS').onclick = () => {
      document.querySelectorAll('[data-k]').forEach(i => S[i.dataset.k] = +i.value);
      document.querySelectorAll('.fdpin').forEach(i => S.fdpTable[+i.dataset.r].lim[+i.dataset.c] = +i.value); S.fdpAugmented = $('#fdpAug').checked;
      S.honorPrefs = $('#hp').checked; S.bpTesterAirports = [...document.querySelectorAll('[data-bpt]:checked')].map(i => i.dataset.bpt);
      st.airports = {}; document.querySelectorAll('[data-cat]').forEach(s => { const a = C.AIRPORTS[s.dataset.cat].slice(0, 3); if (s.value !== 'NONE') a[3] = s.value; st.airports[s.dataset.cat] = a; });
      refresh(); toast('设置已保存，校验结果已更新');
    };
    $('#fdpReset').onclick = () => { S.fdpTable = C.defaultFdpTable(); rSettings(); toast('已恢复默认 FDP 表（尚未保存）'); };
  }

  // ---------------- 自动填人 ----------------
  function runAuto(cb) {
    const p = $('#progress'); p.classList.remove('hidden'); $('#pfill').style.width = '0%';
    let v = 0; const iv = setInterval(() => { v = Math.min(92, v + 7); $('#pfill').style.width = v + '%'; $('#ptext').textContent = v + '%'; }, 40);
    setTimeout(() => { const t0 = performance.now(); C.autoFill(st);
      let demoN = 0;
      if (st.sample) { const d = C.injectDemoAnomalies(st) || []; demoN = d.length; }
      const s = C.summarize(st); lastSolveMs = Math.round(performance.now() - t0);
      clearInterval(iv); $('#pfill').style.width = '100%'; $('#ptext').textContent = '100%';
      setTimeout(() => { p.classList.add('hidden'); refresh();
        toast(`✔ 自动填人完成（${lastSolveMs} ms）：满员 ${s.full}/${s.total}，硬性违规 ${s.hard}，工时 ${s.all.min.toFixed(1)}–${s.all.max.toFixed(1)}h，意向休息满足 ${(s.prefRate * 100).toFixed(1)}%` + (demoN ? ` · 已植入 ${demoN} 项【演示异常】` : ''), 6500); if (cb) cb(); }, 250); }, 350);
  }

  // ---------------- 启动 ----------------
  load();
  $('#tabs').onclick = e => { const t = e.target.dataset && e.target.dataset.tab; if (t) { tab = t; ui.hl = null; location.hash = t; render(); } };
  $('#btnAuto').onclick = () => runAuto();
  $('#btnClear').onclick = () => { if (confirm('清空全部机组分配？')) { st.pairings.forEach(p => p.crew = { C: null, F: null, T: null }); st.standby = null; refresh(); } };
  $('#btnReset').onclick = () => { if (confirm('重置为示例数据？当前修改将丢失。')) { leaveOpts = null; leaveHist = []; leaveHoles = null; leaveOpts = null; holePrev = null; ui.hl = null; dutyOpts = null; dutyDate = null; reset(true); toast('已重置示例数据'); } };
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  const hp = location.hash.slice(1).split('&'); if (hp[0]) tab = hp[0];
  sum = C.summarize(st); renderKpis(); render();
  if (hp.includes('auto')) runAuto(() => { if (hp.includes('leave')) { const idx = C.buildIndex(st); const c = st.pilots.filter(p => p.rank === 'J3').sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0];
    const pr = idx.sched[c.id][1]; goLeave(c.id, pr.start, pr.start + pr.ndays - 1); }
    if (hp.includes('edit')) { const pr = st.pairings.find(p => C.specialAirportsOf(p, st).length); openEdit(pr.id); document.querySelectorAll('#modalBox details')[0].open = true; } document.title += ' ready'; });
})();
