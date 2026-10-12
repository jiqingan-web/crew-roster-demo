/* 机组排班助手 - 界面 */
(function () {
  const C = window.RosterCore, CH = window.Charts;
  const KEY = 'crewRoster.v2';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GCOL = { '教员': '#e6a23c', '机长': '#3ea6ff', '新机长': '#a78bfa', '副驾驶': '#2ecc8f' };
  const WK = ['日', '一', '二', '三', '四', '五', '六'];
  const dow = d => new Date(C.YEAR, C.MONTH - 1, d).getDay();
  let st, sum, tab = 'gantt', lastSolveMs = null, leaveResult = null, leaveUndo = null;
  const ui = { gq: '', gg: '全部', tf: '全部', tq: '' };

  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.pilots) { st = s; st.settings = Object.assign(C.defaultSettings(), st.settings); return; } } catch (e) {} reset(false); }
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
    ({ gantt: rGantt, tasks: rTasks, report: rReport, leave: rLeave, welfare: rWelfare, data: rData, settings: rSettings })[tab]();
  }

  // ---------------- 人员视图 ----------------
  function rGantt() {
    const cw = 150; const m = pm(); const V = violByPairing();
    const order = { '教员': 0, '机长': 1, '新机长': 2, '副驾驶': 3 };
    let ps = st.pilots.slice().sort((a, b) => order[C.rankGroup(a.rank)] - order[C.rankGroup(b.rank)] || C.RANK_VAL[b.rank] - C.RANK_VAL[a.rank] || a.id.localeCompare(b.id));
    if (ui.gg !== '全部') ps = ps.filter(p => C.rankGroup(p.rank) === ui.gg);
    if (ui.gq) ps = ps.filter(p => (p.name + p.id + p.rank).includes(ui.gq));
    const idx = C.buildIndex(st); const S = st.settings;
    let h = `<div class="toolbar"><input id="gq" placeholder="搜索 姓名/员工号/级别" value="${esc(ui.gq)}"> <select id="gg">${['全部', ...C.GROUPS].map(g => `<option ${g === ui.gg ? 'selected' : ''}>${g}</option>`).join('')}</select>
      <div class="legend"><span><i style="background:#1d5fa8"></i>机长位(机)</span><span><i style="background:#14766a"></i>副驾驶位(副)</span><span><i style="background:#5a4a9a"></i>第三人(三)</span>
      <span><i style="background:repeating-linear-gradient(45deg,#2c6a52,#2c6a52 3px,transparent 3px,transparent 6px)"></i>意向休息日</span><span><i style="background:#6b4a12;border:1px solid #e6a23c"></i>备份</span><span><i style="background:repeating-linear-gradient(45deg,#8a3346,#8a3346 3px,transparent 3px,transparent 6px)"></i>请假</span><span class="red">红字=特殊机场</span><span>点击任务条可调整机组</span></div>
      <span class="mut" style="margin-left:auto">${ps.length} 名飞行员 · 2026年11月</span></div>
      <div class="gwrap" style="--cw:${cw}px"><div class="gt" style="width:${250 + cw * C.DAYS}px"><div class="ghead"><div class="gcell0"><b>员工号 / 姓名 / 级别</b><span style="margin-left:auto">本月小时</span></div>`;
    for (let d = 1; d <= C.DAYS; d++) h += `<div class="gday ${[0, 6].includes(dow(d)) ? 'we' : ''}">${dateOf(d)} 周${WK[dow(d)]}</div>`;
    h += '</div>';
    for (const p of ps) {
      const hr = idx.hours[p.id]; const bad = hr > S.maxHours || hr < C.minHoursFor(p, st);
      h += `<div class="grow"><div class="gcell0"><span class="mut">${p.id}</span><span class="nm">${esc(p.name)}</span>${pill(p.rank)}<span class="hrs ${bad ? 'red' : ''}">${hr.toFixed(1)}h</span></div><div class="gbg">`;
      const sbd = (st.standby || {})[p.id] || [];
      for (let d = 1; d <= C.DAYS; d++) h += (p.leave || []).includes(d) ? '<div class="lv" title="请假"></div>' : (p.prefs || []).includes(d) ? '<div class="pref" title="意向休息日"></div>' : sbd.includes(d) ? '<div class="sb" title="备份（Standby）"><span>备份</span></div>' : '<div></div>';
      h += '</div>';
      for (const pr of idx.sched[p.id]) {
        const slot = ['C', 'F', 'T'].find(s => pr.crew[s] === p.id);
        const left = 250 + (pr.start - 1) * cw + 2, w = pr.ndays * cw - 4;
        const ch = dayChains(pr);
        h += `<div class="bar slot${slot} ${V[pr.id] ? 'viol' : ''}" style="left:${left}px;width:${w}px" data-pr="${pr.id}">
          <div class="bh">${pr.id} [${C.SLOT_NAME[slot]}] ${crewTxt(pr, m)}</div><div style="display:flex">${ch.map(c => `<div class="lg" style="width:${cw - 4}px;white-space:normal;max-height:42px">${c.html}<br><span class="mut" style="color:#b9cbe8">${c.ls.map(l => l.flt).join(' ')}</span></div>`).join('')}</div></div>`;
      }
      h += '</div>';
    }
    $('#main').innerHTML = h + '</div></div>';
    $('#gq').oninput = e => { ui.gq = e.target.value; const pos = e.target.selectionStart; rGantt(); $('#gq').focus(); $('#gq').setSelectionRange(pos, pos); };
    $('#gg').onchange = e => { ui.gg = e.target.value; rGantt(); };
    bindBars();
  }
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
  function openEdit(id) {
    $('#tip').classList.add('hidden');
    const pr = st.pairings.find(x => x.id === id); const m = pm();
    const sp = C.specialAirportsOf(pr, st); const tester = pr.legs.filter(l => (st.settings.testerAirports || []).includes(l.from));
    let h = `<div class="flex"><h3 style="margin:0">任务 ${pr.id} · ${dateOf(pr.start)} 起 ${pr.ndays} 天 · ${pr.ac} · ${C.pairingHours(pr).toFixed(1)} 飞行小时</h3><button class="btn" style="margin-left:auto" id="mClose">关闭</button></div>
      <table style="margin:10px 0"><tr><th>日</th><th>航班</th><th>航段</th><th>时刻</th><th>备注</th></tr>${pr.legs.map(l => `<tr><td>D${l.d} (${dateOf(Math.floor(l.dep / C.DAY) + 1)})</td><td>${l.flt}</td><td>${l.from} ${apHtml(l.from)} → ${l.to} ${apHtml(l.to)}</td><td>${C.fmtT(l.dep)}-${C.fmtT(l.arr)}</td><td>${[l.from, l.to].filter(c => C.isSpecial(c, st)).map(c => `<span class="red">${C.CAT_DESC[C.apCat(c, st)]}</span>`).join(' ')} ${(st.settings.testerAirports || []).includes(l.from) ? '<span class="warnc">需酒测/血压测试员</span>' : ''} ${C.isNightLeg(l) ? '<span class="warnc">夜航</span>' : ''} ${l.ac === 'A321' ? 'A321：左座须 J2+' : ''}</td></tr>`).join('')}</table>
      ${sp.length ? `<div class="note red">本任务涉及特殊机场：${sp.map(c => C.apName(c, st) + '(' + c + ')').join('、')}，执行左右座均需持有该机场授权</div>` : ''}
      ${tester.length ? `<div class="note warnc">提醒：自 ${[...new Set(tester.map(l => C.apName(l.from, st)))].join('、')} 出港须安排酒精/血压测试员到场</div>` : ''}
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
    if (ui.tq) ps = ps.filter(p => JSON.stringify(p.legs).includes(ui.tq) || p.id.includes(ui.tq) || p.legs.some(l => C.apName(l.to, st).includes(ui.tq)));
    const unf = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
    let h = `<div class="toolbar"><select id="tf">${['全部', '未满员', '已满员', '有违规', '特殊机场'].map(g => `<option ${g === ui.tf ? 'selected' : ''}>${g}</option>`).join('')}</select><input id="tq" placeholder="航班号/机场/任务号" value="${esc(ui.tq)}">
      <span class="mut">共 ${st.pairings.length} 个任务，已满员 ${st.pairings.length - unf}，未满员 <b class="${unf ? 'red' : 'okc'}">${unf}</b>；显示 ${ps.length}</span></div>
      <div class="panel scroll" style="max-height:calc(100vh - 200px)"><table><tr><th>任务号</th><th>日期</th><th>天数</th><th>机型</th><th>小时</th><th>行程（D1..Dn）</th><th>机组</th><th>状态</th><th></th></tr>`;
    for (const pr of ps) {
      const full = pr.crew.C && pr.crew.F && pr.crew.T; const tester = pr.legs.some(l => (st.settings.testerAirports || []).includes(l.from));
      h += `<tr><td><b>${pr.id}</b></td><td>${dateOf(pr.start)}${pr.ndays > 1 ? '–' + dateOf(pr.start + pr.ndays - 1) : ''}</td><td>${pr.ndays}</td><td>${pr.ac}</td><td>${C.pairingHours(pr).toFixed(1)}</td>
        <td>${dayChains(pr).map(c => c.html).join('<br>')}</td><td>${crewTxt(pr, m)}</td>
        <td>${V[pr.id] ? `<span class="red" title="${esc(V[pr.id].join('\n'))}">✖ ${V[pr.id].length}项违规</span>` : full ? '<span class="okc">✔ 合规</span>' : '<span class="warnc">待填</span>'}${tester ? '<br><span class="warnc">需测试员</span>' : ''}</td>
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
    const hardTypes = ['未满员', '时间重叠', '休息不足', '请假冲突', '岗位级别不符', '座位搭配规则', '特殊机场授权/搭配', '新机长无教员', '月小时超上限', '月小时低于下限', '备份冲突'];
    const card = (lab, val, sub, cls) => `<div class="card"><div class="lab">${lab}</div><div class="val ${cls || ''}">${val}</div><div class="sub">${sub}</div></div>`;
    const ov = C.stats(s.per.map(x => x.overnights)), spx = C.stats(s.per.map(x => x.special)), nt = C.stats(s.per.map(x => x.night));
    let h = `<div class="grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">
      ${card('任务覆盖率（满员）', (s.coverage * 100).toFixed(1) + '%', `${s.full}/${s.total} 个任务 · ${s.totalHours.toFixed(0)} 任务飞行小时`, s.coverage === 1 ? 'ok' : 'bad')}
      ${card('硬性规则违规', s.hard, s.hard ? '需处理，见下表' : '全部合规 ✔（座位搭配/特殊机场/休息/请假/工时）', s.hard ? 'bad' : 'ok')}
      ${card('工时公平性（基尼系数）', s.all.gini.toFixed(3), `全员 ${s.all.min.toFixed(1)}–${s.all.max.toFixed(1)}h · 均值 ${s.all.mean.toFixed(1)}h · 同级组内标准差 ≤ ${Math.max(...C.GROUPS.map(g => s.groups[g].hours.std)).toFixed(1)}h`, 'ok')}
      ${card('休息间隔 2–3 天占比', (s.rhythm.gap23 * 100).toFixed(1) + '%', `均值 ${s.rhythm.gapMean.toFixed(2)} 天 · 备份 ${s.rhythm.standbyTotal} 人日`, s.rhythm.gap23 > 0.5 ? 'ok' : '')}
      ${card('意向休息日满足率', (s.prefRate * 100).toFixed(1) + '%', `${s.prefOK}/${s.prefT} 个意向休息日得到保障`, s.prefRate > 0.95 ? 'ok' : '')}</div>
      <div class="grid g2"><div class="panel"><h3>合规性 <small>硬性规则逐项计数${lastSolveMs ? ' · 自动排班用时 ' + lastSolveMs + ' ms' : ''}</small></h3><table><tr><th>规则</th><th>违规数</th></tr>
      ${hardTypes.map(t => { const n = (s.byType[t] || {}).n || 0; return `<tr><td>${t}</td><td class="${n ? 'red' : 'okc'}">${n ? n : '0 ✔'}</td></tr>`; }).join('')}
      <tr><td>连续空闲超 ${S.maxFreeRun} 天无备份（软性）</td><td class="warnc">${(s.byType['连续空闲超限'] || {}).n || 0}</td></tr><tr><td>每日备份人数不足（软性）</td><td class="warnc">${(s.byType['备份人数不足'] || {}).n || 0}</td></tr><tr><td>意向休息日未满足（软性）</td><td class="warnc">${(s.byType['意向休息日未满足'] || {}).n || 0}</td></tr><tr><td>需酒测/血压测试员提醒（信息）</td><td class="warnc">${(s.byType['需酒测/血压测试员'] || {}).n || 0}</td></tr></table></div>
      <div class="panel"><h3>公平性 · 各级别组月飞行小时分布 <small>圆点=均值，阴影=±1σ，线=最小–最大；虚线=${S.minHours}/${S.maxHours}h 边界</small></h3><div class="chart">${CH.ranges(C.GROUPS.map(g => Object.assign({ label: g, color: GCOL[g] }, s.groups[g].hours)), { range: [20, 80], marks: [{ v: S.minHours, color: '#ffb020' }, { v: S.maxHours, color: '#ff5a6a' }] })}</div>
      <table><tr><th>组别</th><th>人数</th><th>均值</th><th>标准差</th><th>最小</th><th>最大</th><th>基尼</th></tr>${C.GROUPS.map(g => { const x = s.groups[g].hours; return `<tr><td>${g}</td><td>${x.n}</td><td>${x.mean.toFixed(1)}</td><td>${x.std.toFixed(2)}</td><td>${x.min.toFixed(1)}</td><td>${x.max.toFixed(1)}</td><td>${x.gini.toFixed(3)}</td></tr>`; }).join('')}</table></div></div>
      <div class="panel"><h3>每人本月飞行小时 <small>按组别、小时排序；颜色=组别</small></h3><div class="chart">${CH.bars(s.per.slice().sort((a, b) => C.GROUPS.indexOf(a.group) - C.GROUPS.indexOf(b.group) || b.hours - a.hours).map(x => ({ label: x.name, value: x.hours, color: GCOL[x.group] })), { w: 1400, h: 260, showLabels: false, lines: [{ v: S.minHours, label: '下限 ' + S.minHours + 'h', color: '#ffb020' }, { v: S.maxHours, label: '上限 ' + S.maxHours + 'h', color: '#ff5a6a' }], max: 80 })}</div>
      <div class="legend">${C.GROUPS.map(g => `<span><i style="background:${GCOL[g]}"></i>${g}</span>`).join('')}</div></div>
      <div class="grid g3">
      <div class="panel"><h3>节奏 · 任务天数分布 <small>${s.total} 个任务</small></h3>${CH.bars(Object.keys(s.rhythm.lenDist).map(k => ({ label: k + '天', value: s.rhythm.lenDist[k], color: '#3ea6ff' })), { w: 420, h: 200, values: true })}<div class="note">以 3–4 天多日任务为主，${((((s.rhythm.lenDist[3] || 0) + (s.rhythm.lenDist[4] || 0)) / s.total) * 100).toFixed(0)}% 为 3–4 天</div></div>
      <div class="panel"><h3>节奏 · 任务间休息天数 <small>2–3 天占比 <b class="okc">${(s.rhythm.gap23 * 100).toFixed(1)}%</b></small></h3>${CH.bars(['0-1', '2', '3', '4', '5+'].map(k => ({ label: k + '天', value: s.rhythm.gapDist[k], color: k === '2' || k === '3' ? '#2ecc8f' : k === '4' ? '#e6a23c' : '#ff7a85' })), { w: 420, h: 200, values: true })}<div class="note">共 ${s.rhythm.gapN} 个间隔，均值 ${s.rhythm.gapMean.toFixed(2)} 天（已扣除意向休息日/请假日；休息 ≥${S.minRestH}h 为硬约束）</div></div>
      <div class="panel"><h3>备份（Standby）公平性 <small>共 ${s.rhythm.standbyTotal} 人日</small></h3>${CH.bars(C.GROUPS.map(g => ({ label: g, value: s.groups[g].standby.mean, color: GCOL[g] })), { w: 420, h: 200, values: true })}<div class="note">人均备份天数；机长类 ${s.rhythm.standbyC.min}–${s.rhythm.standbyC.max}（σ${s.rhythm.standbyC.std.toFixed(2)}），副驾驶 ${s.rhythm.standbyF.min}–${s.rhythm.standbyF.max}（σ${s.rhythm.standbyF.std.toFixed(2)}）；每日备份池 机长类 ${S.standbyCapt} + 副驾驶 ${S.standbyFO}</div></div></div>
      <div class="grid g3">
      <div class="panel"><h3>合理性 · 外站过夜次数 <small>σ=${ov.std.toFixed(2)}</small></h3>${CH.bars(C.GROUPS.map(g => ({ label: g, value: s.groups[g].overnights.mean, color: GCOL[g] })), { w: 420, h: 200, values: true })}<div class="note">各组人均过夜次数；全员 ${ov.min}–${ov.max} 次</div></div>
      <div class="panel"><h3>合理性 · 特殊机场任务暴露 <small>σ=${spx.std.toFixed(2)}</small></h3>${CH.bars(C.GROUPS.map(g => ({ label: g, value: s.groups[g].special.mean, color: GCOL[g] })), { w: 420, h: 200, values: true })}<div class="note">人均含特殊机场任务数；仅持授权人员参与</div></div>
      <div class="panel"><h3>合理性 · 夜航航段 <small>σ=${nt.std.toFixed(2)}</small></h3>${CH.bars(C.GROUPS.map(g => ({ label: g, value: s.groups[g].night.mean, color: GCOL[g] })), { w: 420, h: 200, values: true })}<div class="note">人均夜航段（00:00–06:00 起降）；全员 ${nt.min}–${nt.max}</div></div></div>
      <div class="panel"><h3>问题明细 <small>${s.violations.length} 条（含软性与提醒）</small></h3><div class="scroll" style="max-height:300px"><table><tr><th>级别</th><th>类型</th><th>说明</th></tr>
      ${s.violations.slice().sort((a, b) => ['hard', 'soft', 'info'].indexOf(a.level) - ['hard', 'soft', 'info'].indexOf(b.level)).map(v => `<tr><td class="${v.level === 'hard' ? 'red' : 'warnc'}">${{ hard: '硬性', soft: '软性', info: '提醒' }[v.level]}</td><td>${v.type}</td><td>${esc(v.msg)}</td></tr>`).join('') || '<tr><td colspan=3 class="okc">无</td></tr>'}</table></div></div>`;
    $('#main').innerHTML = h;
  }

  // ---------------- 请假调配 ----------------
  let leaveSel = { pid: null, days: [] };
  function rLeave() {
    const caps = st.pilots.filter(p => C.isCaptClass(p.rank)).concat(st.pilots.filter(p => C.isFO(p.rank)));
    if (!leaveSel.pid) { const idx = C.buildIndex(st); const c = caps.slice().sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0]; leaveSel.pid = c.id; }
    const idx = C.buildIndex(st); const p = st.pilots.find(x => x.id === leaveSel.pid);
    let h = `<div class="grid g2"><div class="panel"><h3>1. 选择人员与请假日期 <small>默认列出机长，也可选副驾驶</small></h3>
      <div class="flex"><select id="lvP">${caps.map(c => `<option value="${c.id}" ${c.id === leaveSel.pid ? 'selected' : ''}>${esc(c.name)} · ${c.rank} · ${c.id} · ${idx.hours[c.id].toFixed(1)}h</option>`).join('')}</select></div>
      <div class="note" style="margin-top:8px">当前任务：${idx.sched[p.id].map(pr => `${pr.id}(${dateOf(pr.start)}${pr.ndays > 1 ? '–' + dateOf(pr.start + pr.ndays - 1) : ''})`).join('，') || '无'}；已有请假：${(p.leave || []).join(',') || '无'}；意向休息：${(p.prefs || []).join(',') || '无'}</div>
      <div class="daypick">${Array.from({ length: C.DAYS }, (_, i) => i + 1).map(d => { const busy = idx.sched[p.id].some(pr => C.daysTouched(pr, st).includes(d));
        return `<span data-d="${d}" class="${leaveSel.days.includes(d) ? 'on' : ''}" style="${busy ? 'box-shadow:inset 0 -3px 0 #3ea6ff' : ''}">${d}${(p.leave || []).includes(d) ? '假' : ''}</span>`; }).join('')}</div>
      <div class="note">蓝色下划线=当日有任务。点击日期选择/取消。</div>
      <div style="margin-top:10px"><button class="btn primary" id="lvGo">执行请假调配</button>${leaveUndo ? '<button class="btn" id="lvUndo">撤销上次调配</button>' : ''}</div></div>
      <div class="panel"><h3>2. 调配策略</h3><div class="note" style="line-height:1.9">• 仅移出与请假日期重叠的任务，其余机组成员<b>保持不变</b>（最小扰动）<br>• 替补候选须满足：级别岗位、全部航段座位搭配、特殊机场授权与搭配、新机长须有教员、无时间冲突、休息≥${st.settings.minRestH}h、不超过 ${st.settings.maxHours}h、不在请假期<br>• <b>首选当日备份（Standby）人员</b>，调用后自动撤销其相应备份日；其次选择本月小时较少、且不占用其意向休息日的人员<br>• 无法找到合规替补时列出原因，提示人工处理</div></div></div>`;
    if (leaveResult) {
      const r = leaveResult;
      h += `<div class="panel"><h3>调配结果：${esc(r.pilot.name)}（${r.pilot.rank}）请假 ${r.days.join(',')} 日 <small>受影响任务 ${r.affected.length} 个 · 已替补 ${r.changes.length} · 未解决 <span class="${r.unresolved.length ? 'red' : 'okc'}">${r.unresolved.length}</span> · 其他任务变动 0</small></h3>
        <table><tr><th>任务</th><th>岗位</th><th>调整前</th><th>调整后</th><th>说明</th></tr>
        ${r.changes.map(c => `<tr><td>${c.pairing}</td><td>${C.SLOT_NAME[c.slot]}</td><td class="diff-del">${esc(c.from.name)} ${c.from.rank}</td><td class="diff-add">${esc(c.to.name)} ${c.to.rank}</td><td class="mut">${c.note || '合规替补，其余成员不变'}</td></tr>`).join('')}
        ${r.unresolved.map(u => `<tr><td>${u.pairing}</td><td>${C.SLOT_NAME[u.slot]}</td><td class="diff-del">${esc(r.pilot.name)}</td><td class="red">空缺</td><td class="red">${esc(u.reason)}</td></tr>`).join('')}
        ${!r.affected.length ? '<tr><td colspan=5 class="mut">所选日期内该人员无任务，仅登记请假</td></tr>' : ''}</table></div>`;
    }
    $('#main').innerHTML = h;
    $('#lvP').onchange = e => { leaveSel = { pid: e.target.value, days: [] }; leaveResult = null; rLeave(); };
    document.querySelectorAll('.daypick span').forEach(s => s.onclick = () => { const d = +s.dataset.d; leaveSel.days = leaveSel.days.includes(d) ? leaveSel.days.filter(x => x !== d) : [...leaveSel.days, d]; rLeave(); });
    $('#lvGo').onclick = () => { if (!leaveSel.days.length) return toast('请先选择请假日期');
      leaveUndo = JSON.stringify(st); leaveResult = C.applyLeave(st, leaveSel.pid, leaveSel.days.slice().sort((a, b) => a - b)); leaveSel.days = []; refresh(); };
    if ($('#lvUndo')) $('#lvUndo').onclick = () => { st = JSON.parse(leaveUndo); leaveUndo = null; leaveResult = null; refresh(); toast('已撤销'); };
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
    $('#exRoster').onclick = () => dl('排班表_2026-11.csv', csv([['任务号', '日序', '日期', '航班号', '起飞', '落地', '起飞时间', '落地时间', '机型', '特殊机场', '需测试员', '机长(机)', '级别', '副驾驶(副)', '级别', '第三人(三)', '级别'],
      ...st.pairings.flatMap(pr => pr.legs.map(l => { const day = Math.floor(l.dep / C.DAY); const c = s => pr.crew[s] && m[pr.crew[s]];
        return [pr.id, 'D' + l.d, '2026-11-' + String(day + 1).padStart(2, '0'), l.flt, `${l.from} ${C.apName(l.from, st)}`, `${l.to} ${C.apName(l.to, st)}`, C.fmtT(l.dep), tm(l.arr, day), l.ac,
          [l.from, l.to].filter(x => C.isSpecial(x, st)).map(x => C.apName(x, st)).join(';'), (st.settings.testerAirports || []).includes(l.from) ? '是' : '',
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
    read($('#imJson'), t => { const s = JSON.parse(t); if (!s.pilots || !s.pairings) throw new Error('不是有效备份'); st = s; refresh(); toast('备份已恢复'); });
  }

  // ---------------- 设置 ----------------
  function rSettings() {
    const S = st.settings; const aps = Object.assign({}, C.AIRPORTS, st.airports || {});
    const num = (k, lab, unit) => `<div class="slotbox" style="grid-template-columns:200px 120px 60px"><span>${lab}</span><input type="number" step="any" data-k="${k}" value="${S[k]}"><span class="mut">${unit}</span></div>`;
    const cats = ['NONE', 'LHASA', 'HIGH', 'PLATEAU', 'ZBCF', 'J1', 'US'];
    $('#main').innerHTML = `<div class="grid g2"><div class="panel"><h3>排班参数</h3>
      ${num('minRestH', '两任务间最短休息', '小时')}${num('minHours', '月飞行小时下限', '小时')}${num('maxHours', '月飞行小时上限', '小时')}
      ${num('maxOffCapt', '同日最多休息/请假（机长类）', '人')}${num('maxOffFO', '同日最多休息/请假（副驾驶）', '人')}${num('maxFreeRun', '最多连续空闲天数（超出排备份）', '天')}${num('standbyCapt', '每日备份人数（机长类）', '人')}${num('standbyFO', '每日备份人数（副驾驶）', '人')}${num('gapWeight', '休息 2–3 天偏好权重（软）', '0–1')}${num('reportMin', '首段起飞前报到', '分钟')}${num('releaseMin', '末段落地后退场', '分钟')}
      <label class="flex"><input type="checkbox" id="hp" ${S.honorPrefs ? 'checked' : ''}> 自动排班优先保障意向休息日（无法满员时才放宽）</label>
      <div class="note" style="margin-top:8px">下限按可用天数折算：有请假者下限 = 下限 × (30-请假天数)/30。</div>
      <h3 style="margin-top:16px">酒精/血压测试员机场 <small>勾选的机场作为始发站时，任务将标记“须安排测试员”</small></h3>
      <div style="column-count:3;font-size:12px">${Object.keys(aps).map(c => `<label style="display:block"><input type="checkbox" data-tester="${c}" ${(S.testerAirports || []).includes(c) ? 'checked' : ''}> ${c} ${aps[c][0]}</label>`).join('')}</div>
      <div style="margin-top:12px"><button class="btn primary" id="saveS">保存设置并重新校验</button></div></div>
      <div class="panel"><h3>机场与特殊机场类别</h3><div class="note">类别：${cats.map(c => c + '=' + (C.CAT_DESC[c] || '')).join('；')}。需授权类别：${C.AUTH_CATS.join('/')}</div>
      <div class="scroll"><table><tr><th>ICAO</th><th>名称</th><th>类别</th></tr>${Object.keys(aps).map(c => `<tr><td>${c}</td><td class="${aps[c][3] ? 'red' : ''}">${aps[c][0]}</td><td><select data-cat="${c}" ${c === 'ZUUU' ? 'disabled' : ''}>${cats.map(k => `<option value="${k}" ${(aps[c][3] || 'NONE') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td></tr>`).join('')}</table></div></div></div>`;
    $('#saveS').onclick = () => {
      document.querySelectorAll('[data-k]').forEach(i => S[i.dataset.k] = +i.value);
      S.honorPrefs = $('#hp').checked; S.testerAirports = [...document.querySelectorAll('[data-tester]:checked')].map(i => i.dataset.tester);
      st.airports = {}; document.querySelectorAll('[data-cat]').forEach(s => { const a = C.AIRPORTS[s.dataset.cat].slice(0, 3); if (s.value !== 'NONE') a[3] = s.value; st.airports[s.dataset.cat] = a; });
      refresh(); toast('设置已保存，校验结果已更新');
    };
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
  $('#tabs').onclick = e => { const t = e.target.dataset && e.target.dataset.tab; if (t) { tab = t; location.hash = t; render(); } };
  $('#btnAuto').onclick = () => runAuto();
  $('#btnClear').onclick = () => { if (confirm('清空全部机组分配？')) { st.pairings.forEach(p => p.crew = { C: null, F: null, T: null }); st.standby = null; refresh(); } };
  $('#btnReset').onclick = () => { if (confirm('重置为示例数据？当前修改将丢失。')) { leaveResult = null; leaveUndo = null; reset(true); toast('已重置示例数据'); } };
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  const hp = location.hash.slice(1).split('&'); if (hp[0]) tab = hp[0];
  sum = C.summarize(st); renderKpis(); render();
  if (hp.includes('auto')) runAuto(() => { if (hp.includes('leave')) { const idx = C.buildIndex(st); const c = st.pilots.filter(p => p.rank === 'J3').sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0];
    const ds = C.daysTouched(idx.sched[c.id][1], st); leaveSel = { pid: c.id, days: ds }; leaveUndo = JSON.stringify(st); leaveResult = C.applyLeave(st, c.id, ds); leaveSel.days = []; refresh(); }
    if (hp.includes('edit')) { const pr = st.pairings.find(p => C.specialAirportsOf(p, st).length); openEdit(pr.id); document.querySelectorAll('#modalBox details')[0].open = true; } document.title += ' ready'; });
})();
