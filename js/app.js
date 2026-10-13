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
  const ui = { gq: '', gg: '全部', tf: '全部', tq: '', cw: 150, fit: false };
  const CW_MIN = 6, CW_MAX = 240, BASE_CW = 150;
  const ZSTEPS = [4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 67, 80, 90, 100, 110, 125, 150, 160];

  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.pilots) { st = s; st.settings = Object.assign(C.defaultSettings(), st.settings); C.migrateSettings(st.settings); return; } } catch (e) {} reset(false); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function reset(r) { st = C.generateSample(); lastSolveMs = null; save(); if (r) refresh(); }
  function refresh() { sum = C.summarize(st); renderKpis(); render(); save(); }
  function toast(m, ms) { const t = $('#toast'); t.innerHTML = m; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms || 2600); }
  const pm = () => { const m = {}; st.pilots.forEach(p => m[p.id] = p); return m; };
  const pill = r => `<span class="pill r-${C.rankGroup(r)}">${esc(r)}</span>`;
  const dateOf = d => `11/${String(d).padStart(2, '0')}`;
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
    ({ gantt: rGantt, tasks: rTasks, report: rReport, leave: rLeave, duty: rDuty, welfare: rWelfare, data: rData, settings: rSettings })[tab]();
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
      <span><i style="background:repeating-linear-gradient(45deg,#2c6a52,#2c6a52 3px,transparent 3px,transparent 6px)"></i>意向休息日</span><span><i style="background:#6b4a12;border:1px solid #e6a23c"></i>备份</span><span><i style="background:repeating-linear-gradient(45deg,#8a3346,#8a3346 3px,transparent 3px,transparent 6px)"></i>请假</span><span class="red">红字=特殊机场</span><span><b class="rbadge r-high">⚠</b>执勤余量&lt;${st.settings.fdpRiskHigh}分 <b class="rbadge r-med">◔</b>&lt;${st.settings.fdpRiskMed}分 <b class="rbadge r-over">⛔</b>超限</span><span>点击任务条可调整机组</span></div>
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
        const rk = C.pairingRisk(pr, st, st.delays && Object.keys(st.delays).length ? st.delays : null); const rb = RISK_BADGE[rk.risk];
        const badge = rb ? `<span class="rbadge r-${rk.risk}" title="执勤风险：${rb[1]} · D${rk.worst.d} FDP ${C.fmtH(rk.worst.fdp)} / 限制 ${C.fmtH(rk.worst.limit)} · 余量 ${rk.worst.buffer} 分钟">${rb[0]}</span>` : '';
        let inner = '';
        if (lvl === 'full') { const ch = dayChains(pr); inner = `<div class="bh">${badge}${pr.id} [${C.SLOT_NAME[slot]}] ${crewTxt(pr, m)}</div><div style="display:flex">${ch.map(c => `<div class="lg" style="width:${cw - 4}px;white-space:normal;max-height:42px">${c.html}<br><span class="mut" style="color:#b9cbe8">${c.ls.map(l => l.flt).join(' ')}</span></div>`).join('')}</div>`; }
        else if (lvl === 'mid') inner = `<div class="bh">${badge}${pr.id} [${C.SLOT_NAME[slot]}]</div><div class="lg">${[...new Set(pr.legs.map(l => l.to))].filter(c => c !== pr.legs[0].from).map(apHtml).join('·')}</div>`;
        else if (lvl === 'small' && w >= 34) inner = `<span class="bh">${pr.id}</span>`;
        h += `<div class="bar slot${slot} ${rb ? 'rk-' + rk.risk : ''} ${V[pr.id] ? 'viol' : ''} ${hlr && ui.hl.pairings.has(pr.id) ? 'hl' : ''}" style="left:${left}px;width:${w}px" data-pr="${pr.id}">${inner}</div>`;
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
    return `<b>${pr.id}</b> · ${pr.ndays}天 · ${pr.ac} · ${C.pairingHours(pr).toFixed(1)}h<br>${pr.legs.map(l => `D${l.d} ${l.flt} ${apHtml(l.from)}-${apHtml(l.to)} ${C.fmtT(l.dep)}-${C.fmtT(l.arr)}${C.isNightLeg(l) ? ' <span class="warnc">夜航</span>' : ''}`).join('<br>')}
      <br><b>${crewTxt(pr, m)}</b>${['C', 'F', 'T'].map(s => pr.crew[s] && m[pr.crew[s]] ? ' ' + pill(m[pr.crew[s]].rank) : '').join('')}${V[pr.id] ? '<br><span class="red">' + V[pr.id].map(esc).join('<br>') + '</span>' : ''}`;
  }

  // ---------------- 编辑弹窗 ----------------
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.mLeave'); if (!b) return; const pr = st.pairings.find(x => x.id === $('#modalBox').dataset.pr); closeModal(); goLeave(b.dataset.pid, pr.start, pr.start + pr.ndays - 1); });
  function openEdit(id) {
    $('#modalBox').dataset.pr = id;
    $('#tip').classList.add('hidden');
    const pr = st.pairings.find(x => x.id === id); const m = pm();
    const sp = C.specialAirportsOf(pr, st); const bpt = pr.legs.filter(l => (st.settings.bpTesterAirports || []).includes(l.from));
    let h = `<div class="flex"><h3 style="margin:0">任务 ${pr.id} · ${dateOf(pr.start)} 起 ${pr.ndays} 天 · ${pr.ac} · ${C.pairingHours(pr).toFixed(1)} 飞行小时</h3><button class="btn" style="margin-left:auto" id="mClose">关闭</button></div>
      <div class="flex" style="margin-top:6px;flex-wrap:wrap"><span class="mut">临时请假（本任务日期 ${pr.start}–${pr.start + pr.ndays - 1} 日）：</span>${['C', 'F', 'T'].filter(x => pr.crew[x] && m[pr.crew[x]]).map(x => `<button class="btn sm mLeave" data-pid="${pr.crew[x]}">${C.SLOT_NAME[x]} ${esc(m[pr.crew[x]].name)} 请假 → 生成方案</button>`).join('')}</div>
      <table style="margin:10px 0"><tr><th>日</th><th>航班</th><th>航段</th><th>时刻</th><th>备注</th></tr>${pr.legs.map(l => `<tr><td>D${l.d} (${dateOf(Math.floor(l.dep / C.DAY) + 1)})</td><td>${l.flt}</td><td>${l.from} ${apHtml(l.from)} → ${l.to} ${apHtml(l.to)}</td><td>${C.fmtT(l.dep)}-${C.fmtT(l.arr)}</td><td>${[l.from, l.to].filter(c => C.isSpecial(c, st)).map(c => `<span class="red">${C.CAT_DESC[C.apCat(c, st)]}</span>`).join(' ')} ${(st.settings.bpTesterAirports || []).includes(l.from) ? '<span class="warnc">需血压测试仪</span>' : ''} ${C.isNightLeg(l) ? '<span class="warnc">夜航</span>' : ''} ${l.ac === 'A321' ? 'A321：左座须 J2+' : ''}</td></tr>`).join('')}</table>
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
      h += `<tr><td><b>${pr.id}</b></td><td>${dateOf(pr.start)}${pr.ndays > 1 ? '–' + dateOf(pr.start + pr.ndays - 1) : ''}</td><td>${pr.ndays}</td><td>${pr.ac}</td><td>${C.pairingHours(pr).toFixed(1)}</td>
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
    let h = `<div class="grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">
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
  let dutyDate = null, dutyOpts = null;
  function rDuty() {
    const S = st.settings; st.delays = st.delays || {};
    if (!dutyDate) { const r = C.fdpRiskSummary(st).rows[0]; dutyDate = r ? r.date : 1; }
    const mon = C.dutyMonitor(st, dutyDate); const m = pm();
    const nEx = mon.filter(x => x.exceed).length, nDn = mon.filter(x => x.downstream.length).length;
    const dl = Object.keys(st.delays).length;
    let h = `<div class="panel"><h3>执勤监控 · 延误推算 <small>输入各航段实际/预计延误（分钟），实时推算 FDP、超限航段与下游休息影响；延误数据随排班保存</small></h3>
      <div class="flex" style="flex-wrap:wrap"><span>日期</span><select id="dtD">${Array.from({ length: C.DAYS }, (_, i) => `<option value="${i + 1}" ${i + 1 === dutyDate ? 'selected' : ''}>11/${String(i + 1).padStart(2, '0')} 周${WK[dow(i + 1)]}</option>`).join('')}</select>
      <span class="mut">当日执行任务 ${mon.length} 个 · 预计超限 <b class="${nEx ? 'red' : 'okc'}">${nEx}</b> · 下游休息受影响 <b class="${nDn ? 'warnc' : 'okc'}">${nDn}</b> · 已录入延误 ${dl} 段</span>
      <button class="btn sm" id="dtSim">模拟：当日风险最高任务延误 +120 分</button><button class="btn sm" id="dtClr">清除当日延误</button>${leaveHist.length ? `<button class="btn sm" id="dtUndo">↶ 撤销（${leaveHist.length}）</button>` : ''}</div>
      <div class="note">FDP 限制按设置中的表（默认值参考 CCAR-121，可修改）；同日后续航段起飞 = max(计划起飞, 前段落地 + min(计划过站, ${S.minTurnMin} 分钟))，即过站富余可吸收部分延误。</div></div>`;
    h += `<div class="dutyg">${mon.map(x => { const dy = x.day; const pr = x.pr; const pct = Math.min(130, dy.fdp / dy.limit * 100);
      return `<div class="panel dutyc ${x.exceed ? 'dex' : ''}"><div class="flex"><b>${pr.id}</b><span class="mut">D${dy.d}/${pr.ndays} · ${crewTxt(pr, m)}</span>
        <span style="margin-left:auto" class="${{ over: 'red', high: 'red', med: 'warnc', low: 'okc' }[dy.risk]}"><span class="rdot r-${dy.risk}"></span>预计 FDP ${C.fmtH(dy.fdp)} / ${C.fmtH(dy.limit)} · ${dy.exceed ? '超 ' + dy.exceed + ' 分钟' : '余量 ' + dy.buffer + ' 分钟'}</span></div>
        <div class="fdpbar"><i style="width:${pct / 1.3}%" class="r-${dy.risk}"></i><b style="left:${100 / 1.3}%"></b></div>
        <table class="dlt"><tr><th>航班</th><th>航段</th><th>计划</th><th>延误(分)</th><th>预计</th></tr>${dy.legs.map(l => `<tr class="${dy.exLeg && l.i >= dy.exLeg.i ? 'exrow' : ''}"><td>${l.leg.flt}</td><td>${apHtml(l.leg.from)}-${apHtml(l.leg.to)}</td><td>${C.fmtT(l.leg.dep)}-${C.fmtT(l.leg.arr)}</td>
          <td><input type="number" min="0" step="5" class="dlin" data-k="${C.legKey(l.leg)}" value="${l.dly || ''}" placeholder="0"></td><td class="${l.late ? 'warnc' : 'mut'}">${C.fmtT(l.dep)}-${C.fmtT(l.arr)}${l.late ? ' (+' + l.late + ')' : ''}</td></tr>`).join('')}</table>
        ${dy.exLeg ? `<div class="red">✖ 自 ${dy.exLeg.leg.flt} ${C.apName(dy.exLeg.leg.from, st)}-${C.apName(dy.exLeg.leg.to, st)} 起超出 FDP 限制 ${dy.exceed} 分钟（报到 ${C.fmtT(dy.start)}，限制至 ${C.fmtT(dy.start + dy.limit)}）</div>` : ''}
        ${x.downstream.map(d => `<div class="warnc">↳ ${d.overnight ? `D${d.d} 过夜休息压缩至 ${C.fmtH(d.restAfter)}（低于 ${S.minOvernightRestH}h，差 ${d.short} 分钟）` : `${esc(m[d.pilot].name)} 下一任务 ${d.next} 前休息仅 ${C.fmtH(d.gap)}（低于 ${S.minRestH}h，差 ${d.short} 分钟）`}</div>`).join('')}
        ${x.exceed || x.downstream.length ? `<button class="btn sm ${x.exceed ? 'primary' : ''} dtGo" data-pr="${pr.id}">生成处置方案</button>` : ''}</div>`; }).join('') || '<div class="note">当日无执行任务</div>'}</div>`;
    const o = dutyOpts;
    if (o) h += `<div class="panel" id="dtSol"><h3>${o.pairing.id} 处置方案 <small>${o.exceed ? `D${o.exceed.d} 预计超 FDP ${o.exceed.exceed} 分钟` : '下游休息不足'} · 生成 ${o.solutions.length} 个方案 · 用时 ${o.ms} ms</small></h3>
      <div class="solgrid">${o.solutions.map(solCard).join('')}</div></div>
      <div class="panel"><h3>影响预览 <small>悬停/点选方案：绿=新增任务 · 橙=被调整任务 · 红虚线=移出</small></h3><div id="mgBox">${miniGantt(o.solutions[cardCtx.hover])}</div></div>`;
    $('#main').innerHTML = h;
    $('#dtD').onchange = e => { dutyDate = +e.target.value; dutyOpts = null; rDuty(); };
    document.querySelectorAll('.dlin').forEach(i => i.onchange = () => { const v = Math.max(0, +i.value || 0); if (v) st.delays[i.dataset.k] = v; else delete st.delays[i.dataset.k]; dutyOpts = null; save(); sum = C.summarize(st); renderKpis(); rDuty(); });
    $('#dtClr').onclick = () => { mon.forEach(x => x.day.legs.forEach(l => delete st.delays[C.legKey(l.leg)])); dutyOpts = null; save(); rDuty(); };
    $('#dtSim').onclick = () => { const x = mon.slice().sort((a, b) => a.day.buffer - b.day.buffer)[0]; if (!x) return; const l = x.day.legs[Math.min(1, x.day.legs.length - 1)]; st.delays[C.legKey(l.leg)] = (st.delays[C.legKey(l.leg)] || 0) + 120; dutyOpts = null; save(); rDuty(); };
    if ($('#dtUndo')) $('#dtUndo').onclick = undoLeave;
    document.querySelectorAll('.dtGo').forEach(b => b.onclick = () => { dutyOpts = C.fdpOptions(st, b.dataset.pr); const i = dutyOpts.solutions.findIndex(x => x.recommended);
      cardCtx = { hover: i < 0 ? 0 : i, focus: Object.values(dutyOpts.pairing.crew).filter(Boolean), days: dutyOpts.days.map(d => d.date) }; rDuty(); const e = $('#dtSol'); if (e) e.scrollIntoView(); });
    if (o) bindCards(o.solutions, sol => `${o.pairing.id} ${o.exceed ? '超执勤' : '休息不足'}处置 · 方案「${sol.name}」：${stepTxt(sol)}`, () => { dutyOpts = null; });
  }

  // ---------------- 请假调配（多方案） ----------------
  let leaveSel = { pid: null, from: null, to: null }, leaveOpts = null, leaveHover = null, leaveHist = [];
  const TYPE_TXT = { standby: ['备份', 'sbt'], rest: ['休息人员', 'rst'], chain: ['链式调换', 'cht'], manual: ['人工处理', 'mnt'], split: ['拆分换组', 'spt'] };
  let cardCtx = { hover: 0 };
  function genLeave() { const days = []; for (let d = leaveSel.from; d <= leaveSel.to; d++) days.push(d);
    leaveOpts = C.leaveOptions(st, leaveSel.pid, days); leaveHover = leaveOpts.solutions.findIndex(x => x.recommended); if (leaveHover < 0) leaveHover = 0; cardCtx = { hover: leaveHover, focus: [leaveSel.pid], days }; }
  function goLeave(pid, from, to) { leaveSel = { pid, from: from || 1, to: to || from || 1 }; tab = 'leave'; genLeave(); render(); }
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
      <button class="btn ${sol.recommended ? 'primary' : ''} sm solapply" data-i="${i}" ${!sol.state || (sol.unresolved && !sol.steps.some(x => x.to)) ? 'disabled' : ''}>${!sol.state ? '需运控人工处理' : sol.unresolved ? '应用（空缺待人工）' : '一键应用'}</button></div>`;
  }
  // 通用：方案卡片交互（悬停预览、点选、应用）。label(sol) 生成历史说明
  function bindCards(sols, label, after) {
    document.querySelectorAll('.solc').forEach(c => { const i = +c.dataset.i;
      c.onmouseenter = () => { $('#mgBox').innerHTML = miniGantt(sols[i]); document.querySelectorAll('.solc').forEach(x => x.classList.toggle('hov', x === c)); };
      c.onmouseleave = () => { $('#mgBox').innerHTML = miniGantt(sols[cardCtx.hover]); c.classList.remove('hov'); };
      c.onclick = e => { if (e.target.closest('.solapply')) return; cardCtx.hover = i; document.querySelectorAll('.solc').forEach(x => x.classList.toggle('sel', x === c)); $('#mgBox').innerHTML = miniGantt(sols[i]); }; });
    document.querySelectorAll('.solapply').forEach(b => b.onclick = () => { const sol = sols[+b.dataset.i]; if (!sol.state) return;
      const lb = label(sol); leaveHist.push({ snap: JSON.stringify(st), label: lb, time: new Date().toTimeString().slice(0, 8) });
      st = sol.state; ui.hl = { pairings: new Set(sol.steps.flatMap(x => [x.pairing, x.newPairing, x.chain && x.chain.pairing]).filter(Boolean)), pilots: new Set([...(cardCtx.focus || []), ...sol.people.map(x => x.id)]), days: cardCtx.days };
      if (after) after(); tab = 'gantt'; refresh(); setTimeout(scrollToHl, 30); toast('✔ 已应用：' + esc(lb) + ' <a href="#" id="tUndo" style="color:#9fd4ff">撤销</a>', 8000);
      const tu = $('#tUndo'); if (tu) tu.onclick = e => { e.preventDefault(); undoLeave(); }; });
  }
  const nmOf = (sol, id) => { const p = (sol.state || st).pilots.find(x => x.id === id); return p ? p.name : '空缺'; };
  function stepTxt(sol) { return sol.steps.map(x => x.type === 'split' ? `${x.pairing}${x.whole ? '整组替换' : '在' + C.apName(x.station, st) + '拆分'}` : x.pairing + (x.to ? '→' + nmOf(sol, x.to) : '空缺') + (x.chain ? `（${x.chain.pairing}→${nmOf(sol, x.chain.to)}）` : '')).join('，'); }
  function rLeave() {
    const caps = st.pilots.filter(p => C.isCaptClass(p.rank)).concat(st.pilots.filter(p => C.isFO(p.rank)));
    const idx = C.buildIndex(st);
    if (!leaveSel.pid) { const c = caps.slice().sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0]; const pr = idx.sched[c.id][1] || idx.sched[c.id][0]; leaveSel = { pid: c.id, from: pr ? pr.start : 1, to: pr ? pr.start + pr.ndays - 1 : 1 }; }
    const p = st.pilots.find(x => x.id === leaveSel.pid); const o = leaveOpts;
    let h = `<div class="panel"><h3>临时请假 · 多方案调配 <small>选择人员与日期后即时生成 3–5 个方案；也可在人员视图点击姓名，或在任务弹窗点“临时请假”</small></h3>
      <div class="flex" style="flex-wrap:wrap"><select id="lvP">${caps.map(c => `<option value="${c.id}" ${c.id === leaveSel.pid ? 'selected' : ''}>${esc(c.name)} · ${c.rank} · ${c.id} · ${idx.hours[c.id].toFixed(1)}h</option>`).join('')}</select>
      <span>日期</span><select id="lvF">${Array.from({ length: C.DAYS }, (_, i) => `<option ${i + 1 === leaveSel.from ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><span>至</span><select id="lvT">${Array.from({ length: C.DAYS }, (_, i) => `<option ${i + 1 === leaveSel.to ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><span>日</span>
      <button class="btn primary" id="lvGo">生成方案</button>${leaveHist.length ? `<button class="btn" id="lvUndo">↶ 撤销（${leaveHist.length}）</button>` : ''}</div>
      <div class="note" style="margin-top:6px">任务：${idx.sched[p.id].map(pr => `<a class="lvpr" data-f="${pr.start}" data-t="${pr.start + pr.ndays - 1}">${pr.id}(${pr.start}${pr.ndays > 1 ? '–' + (pr.start + pr.ndays - 1) : ''}日)</a>`).join(' ') || '无'} · 已请假：${(p.leave || []).join(',') || '无'} · 意向休息：${(p.prefs || []).join(',') || '无'}</div></div>`;
    if (o) {
      h += `<div class="panel"><h3>${esc(o.pilot.name)}（${o.pilot.rank}）请假 ${o.days[0]}${o.days.length > 1 ? '–' + o.days[o.days.length - 1] : ''} 日 <small>受影响任务 ${o.affected.map(a => a.id + '·' + C.SLOT_NAME[a.slot] + '位').join('、') || '无'} · 生成 ${o.solutions.length} 个方案 · 用时 ${o.ms} ms${o.solutions.length < 3 && o.affected.length ? ' · 合规候选有限，仅找到这些不同方案' : ''}</small></h3>
        ${o.solutions.some(x => x.manual) ? '<div class="note red">所有方案均有岗位无法合规补位，请人工处理（见各卡片“受阻规则”）</div>' : ''}
        <div class="solgrid">${o.solutions.map(solCard).join('')}</div></div>
        <div class="panel"><h3>影响预览 <small>悬停/点选方案卡片高亮：<span class="okc">绿=新增任务</span> · <span class="warnc">橙=被调整任务</span> · <span class="red">红虚线=移出</span> · 紫底=请假日</small></h3><div id="mgBox">${miniGantt(o.solutions[cardCtx.hover])}</div></div>`;
    }
    h += `<div class="panel"><h3>调配历史 <small>可逐步撤销</small></h3>${leaveHist.length ? `<table>${leaveHist.slice().reverse().map(x => `<tr><td>${x.time}</td><td>${esc(x.label)}</td></tr>`).join('')}</table>` : '<div class="note">暂无</div>'}</div>`;
    $('#main').innerHTML = h;
    const regen = () => { if (leaveSel.to < leaveSel.from) leaveSel.to = leaveSel.from; genLeave(); rLeave(); };
    $('#lvP').onchange = e => { leaveSel.pid = e.target.value; leaveOpts = null; rLeave(); };
    $('#lvF').onchange = e => { leaveSel.from = +e.target.value; if (leaveSel.to < leaveSel.from) leaveSel.to = leaveSel.from; leaveOpts = null; rLeave(); };
    $('#lvT').onchange = e => { leaveSel.to = +e.target.value; leaveOpts = null; rLeave(); };
    document.querySelectorAll('.lvpr').forEach(a => a.onclick = () => { leaveSel.from = +a.dataset.f; leaveSel.to = +a.dataset.t; regen(); });
    $('#lvGo').onclick = regen;
    if (o) bindCards(o.solutions, sol => `${o.pilot.name} 请假 ${o.days[0]}–${o.days[o.days.length - 1]} 日 · 方案「${sol.name}」：${stepTxt(sol)}`, () => { leaveOpts = null; });
    if ($('#lvUndo')) $('#lvUndo').onclick = undoLeave;
  }
  function scrollToHl() { const b = document.querySelector('.bar.hl'); const g = $('.gwrap'); if (b && g) { g.scrollTop = Math.max(0, b.parentElement.offsetTop - 140); g.scrollLeft = Math.max(0, b.offsetLeft - 420); } }
  function undoLeave() { const x = leaveHist.pop(); if (!x) return; st = JSON.parse(x.snap); ui.hl = null; leaveOpts = null; refresh(); toast('已撤销：' + esc(x.label)); }

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
      ${num('minRestH', '两任务间最短休息', '小时')}${num('hardMaxHours', '月飞行小时法规硬上限（CAAC）', '小时')}
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
    setTimeout(() => { const t0 = performance.now(); const s = C.autoFill(st); lastSolveMs = Math.round(performance.now() - t0);
      clearInterval(iv); $('#pfill').style.width = '100%'; $('#ptext').textContent = '100%';
      setTimeout(() => { p.classList.add('hidden'); refresh();
        toast(`✔ 自动填人完成（${lastSolveMs} ms）：满员 ${s.full}/${s.total}，硬性违规 ${s.hard}，工时 ${s.all.min.toFixed(1)}–${s.all.max.toFixed(1)}h，意向休息满足 ${(s.prefRate * 100).toFixed(1)}%`, 6000); if (cb) cb(); }, 250); }, 350);
  }

  // ---------------- 启动 ----------------
  load();
  $('#tabs').onclick = e => { const t = e.target.dataset && e.target.dataset.tab; if (t) { tab = t; ui.hl = null; location.hash = t; render(); } };
  $('#btnAuto').onclick = () => runAuto();
  $('#btnClear').onclick = () => { if (confirm('清空全部机组分配？')) { st.pairings.forEach(p => p.crew = { C: null, F: null, T: null }); st.standby = null; refresh(); } };
  $('#btnReset').onclick = () => { if (confirm('重置为示例数据？当前修改将丢失。')) { leaveOpts = null; leaveHist = []; ui.hl = null; dutyOpts = null; dutyDate = null; reset(true); toast('已重置示例数据'); } };
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  const hp = location.hash.slice(1).split('&'); if (hp[0]) tab = hp[0];
  sum = C.summarize(st); renderKpis(); render();
  if (hp.includes('auto')) runAuto(() => { if (hp.includes('leave')) { const idx = C.buildIndex(st); const c = st.pilots.filter(p => p.rank === 'J3').sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0];
    const pr = idx.sched[c.id][1]; goLeave(c.id, pr.start, pr.start + pr.ndays - 1); }
    if (hp.includes('edit')) { const pr = st.pairings.find(p => C.specialAirportsOf(p, st).length); openEdit(pr.id); document.querySelectorAll('#modalBox details')[0].open = true; } document.title += ' ready'; });
})();
