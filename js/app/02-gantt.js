/* 机组排班助手 - 界面 · gantt.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
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
    applyCompact();
    const cw = ui.cw, nw = NW(); let lvl = cw >= 110 ? 'full' : cw >= 40 ? 'mid' : cw >= 16 ? 'small' : 'tiny';
    let rh = { full: 66, mid: 40, small: 18, tiny: 9 }[lvl]; const m = pm(); const V = violByPairing();
    const order = { '教员': 0, '机长': 1, '新机长': 2, '副驾驶': 3 };
    let ps = st.pilots.slice().sort((a, b) => order[C.rankGroup(a.rank)] - order[C.rankGroup(b.rank)] || C.RANK_VAL[b.rank] - C.RANK_VAL[a.rank] || a.id.localeCompare(b.id));
    if (ui.gg !== '全部') ps = ps.filter(p => C.rankGroup(p.rank) === ui.gg);
    if (ui.gq) ps = ps.filter(p => pilotSearchMatch(p, ui.gq));
    if (ui.gsq && ui.gsq !== '全部') ps = ps.filter(p => p.squad === ui.gsq);
    if (ui.fit) { const avail = ui.fitAvail || Math.max(200, innerHeight - 260); rh = Math.max(6, Math.min(40, Math.floor(avail / Math.max(1, ps.length))));
      lvl = rh >= 40 && cw >= 40 ? 'mid' : rh >= 16 ? 'small' : 'tiny'; }
    const idx = C.buildIndex(st); const S = st.settings;
    let h = `${demoFillBanner()}${exportBarHtml('<span class="mut">人员视图可导出班表/月历</span>')}
      <div class="toolbar"><input id="gq" placeholder="搜索 姓名/工号/级别/拼音首字母" value="${esc(ui.gq)}"> <select id="gg">${['全部', ...C.GROUPS].map(g => `<option ${g === ui.gg ? 'selected' : ''}>${g}</option>`).join('')}</select> <select id="gsq" title="中队">${squadOptions(ui.gsq)}</select>
      <div class="legend"><span><i style="background:#1d5fa8"></i>机长位(机)</span><span><i style="background:#14766a"></i>副驾驶位(副)</span><span><i style="background:#5a4a9a"></i>观察员</span>
      <span><i style="background:repeating-linear-gradient(45deg,#2c6a52,#2c6a52 3px,transparent 3px,transparent 6px)"></i>意向休息日</span><span><i style="background:#1a3a5c;border:1px solid #5aa0e6"></i>培训</span><span><i style="background:#2a2f6b;border:1px solid #8a8ff0"></i>模拟机训练</span><span><i style="background:#6b4a12;border:1px solid #e6a23c"></i>可能抓飞(备份)</span><span><i style="background:#3a3f46;border:1px dashed #9aa4b0"></i>空班</span><span><b class="dh">(随)</b>置位乘机</span><span><i style="background:#3d3a20;border:1px dashed #c9b458"></i>中队控班</span><span><i style="background:repeating-linear-gradient(45deg,#8a3346,#8a3346 3px,transparent 3px,transparent 6px)"></i>病假/年假</span><span><i style="background:repeating-linear-gradient(45deg,#2d6b6b,#2d6b6b 3px,transparent 3px,transparent 6px)"></i>疗养</span><span class="red">红字=特殊机场</span><span><b class="rbadge r-high">⚠</b>执勤余量&lt;${st.settings.fdpRiskHigh}分 <b class="rbadge r-med">◔</b>&lt;${st.settings.fdpRiskMed}分 <b class="rbadge r-over">⛔</b>超限</span><span><span class="fbadge">补位</span>已补位任务</span><span><span class="demotag">演示异常</span>路演用例</span><span>点击任务条可调整机组</span></div>
      <span class="mut" style="margin-left:auto">${ps.length} 名飞行员 · 2026年11月</span></div>
      ${ui.hl ? `<div class="hlbar ${ui.hl.ok ? 'ok' : ''}">${ui.hl.ok ? '✔ 已更新并合规' : '已高亮刚应用的调配'}（${ui.hl.pilots.size} 人 · 任务 ${[...ui.hl.pairings].join('、')}）<button class="btn sm" id="hlUndo">↶ 撤销</button><button class="btn sm" id="hlClr">清除高亮</button></div>` : ''}
      <div class="gbox"><div class="gwrap z-${lvl}" style="--cw:${cw}px;--rh:${rh}px;--nw:${nw}px"><div class="gt" style="width:${nw + cw * C.DAYS}px"><div class="ghead"><div class="gcell0"><b>${lvl === 'tiny' || lvl === 'small' ? '飞行员' : '员工号 / 姓名 / 级别'}</b><span style="margin-left:auto">${lvl === 'full' || lvl === 'mid' ? '本月小时' : 'h'}</span></div>`;
    const ticks = cw >= 64 ? `<div class="gticks">${[3, 6, 9, 12, 15, 18, 21].map(x => `<span style="left:${x / 24 * 100}%">${x}</span>`).join('')}</div>` : '';
    for (let d = 1; d <= C.DAYS; d++) h += `<div class="gday ${[0, 6].includes(dow(d)) ? 'we' : ''}" title="${dateOf(d)} 周${WK[dow(d)]}">${cw >= 70 ? `${dateOf(d)} 周${WK[dow(d)]}` : cw >= 26 ? `${d}<br>${WK[dow(d)]}` : cw >= 12 ? d : (d % 5 === 0 || d === 1 ? d : '')}${ticks}</div>`;
    h += '</div>';
    for (const p of ps) {
      const hr = idx.hours[p.id]; const bad = hr > (S.hardMaxHours || 100); const amb = false;
      const hlr = ui.hl && ui.hl.pilots.has(p.id);
      h += `<div class="grow ${hlr ? 'hlrow' : ''}"><div class="gcell0 lvable" data-pid="${p.id}" title="点击：为此人临时请假 · ${p.id} ${esc(p.name)} ${esc(p.rank)} ${hr.toFixed(1)}h">${lvl === 'tiny' ? '' : `<span class="mut">${p.id}</span>`}<span class="nm">${esc(p.name)}</span>${pill(p.rank)}<span class="hrs ${bad ? "red" : amb ? "warnc" : ""}">${hr.toFixed(1)}h</span></div><div class="gbg">`;
      const sbd = (st.standby || {})[p.id] || [];
      const trd = (st.training || {})[p.id] || [];
      const simd = (st.sim || {})[p.id] || [];
      const holdd = (st.simHold || {})[p.id] || [];
      const lbl = s => cw >= 30 && rh >= 18 ? `<span>${s}</span>` : '';
      const busy = new Set(); (idx.sched[p.id] || []).forEach(pr => { for (let k = 0; k < pr.ndays; k++) busy.add(pr.start + k); });
      for (let d = 1; d <= C.DAYS; d++) { const nk = nonFlyKind(p, d); const isHold = holdd.includes(d); h += (p.leave || []).includes(d) ? `<div class="lv lv-${nk.lv}" title="${nk.lvName}">${lbl(nk.lvName)}</div>` : simd.includes(d) ? `<div class="tr sim" title="${isHold ? '提前占位/模拟机占位（禁飞，自动排班不覆盖）' : '模拟机训练'}">${lbl(isHold ? '提前占位' : '模拟机')}</div>` : trd.includes(d) ? `<div class="tr" title="培训(飞技)">${lbl('培训')}</div>` : (p.prefs || []).includes(d) ? '<div class="pref" title="意向休息日"></div>' : sbd.includes(d) ? `<div class="sb" title="可能抓飞人员（备份 / Standby）">${lbl('抓飞')}</div>` : (!busy.has(d) && nk.idle) ? `<div class="idle ${nk.idle === '中队控班' ? 'ctl' : ''}" title="${nk.idle}">${lbl(nk.idle === '中队控班' ? '控班' : '空班')}</div>` : '<div></div>'; }
      h += '</div>';
      for (const pr of idx.sched[p.id]) {
        const slot = ['C', 'F', 'T'].find(s => pr.crew[s] === p.id);
        const gap = cw >= 20 ? 2 : 0.5; const left = nw + (pr.start - 1) * cw + gap, w = Math.max(1, pr.ndays * cw - 2 * gap);
        const rk = C.pairingRisk(pr, st, st.actuals && Object.keys(st.actuals).length ? st.actuals : null); const rb = RISK_BADGE[rk.risk];
        const badge = rb ? `<span class="rbadge r-${rk.risk}" title="执勤风险：${rb[1]} · D${rk.worst.d} FDP ${C.fmtH(rk.worst.fdp)} / 限制 ${C.fmtH(rk.worst.limit)} · 余量 ${rk.worst.buffer} 分钟">${rb[0]}</span>` : '';
        let inner = '';
        if (lvl === 'full') { const ch = dayChains(pr); inner = `<div class="bh">${badge}${fillBadge(pr.id)}${demoTag(pr)}${pr.id} ${crewShort(pr, m)}</div><div style="display:flex">${ch.map(c => `<div class="lg" style="width:${cw - 4}px;white-space:normal;max-height:42px">${blkDay(c)}</div>`).join('')}</div>`; }
        else if (lvl === 'mid') inner = `<div class="bh">${badge}${fillBadge(pr.id)}${demoTag(pr)}${pr.id} [${C.SLOT_NAME[slot]}]</div><div class="lg">${[...new Set(pr.legs.map(l => l.to))].filter(c => c !== pr.legs[0].from).map(abHtml).join('-')}</div>`;
        else if (lvl === 'small' && w >= 34) inner = `<span class="bh">${fillBadge(pr.id)}${pr.id}</span>`;
        const isHl = hlr && ui.hl.pairings.has(pr.id);
        const isOk = isHl && ui.hl.ok && !V[pr.id];
        let bl = left, bw = w, tcls = '';
        if (lvl === 'full' || lvl === 'mid') {
          // real-time segments: one per duty day, report → release, scaled inside day cells
          const DAYM = 1440, segs = [];
          for (let d = 1; d <= pr.ndays; d++) { const ls = pr.legs.filter(l => l.d === d); if (!ls.length) continue;
            const a = Math.min(...ls.map(l => l.dep)) - (S.reportMin || 95), b = Math.max(...ls.map(l => l.arr)) + (S.releaseMin || 30);
            segs.push({ x0: nw + a / DAYM * cw, x1: nw + b / DAYM * cw, ls }); }
          if (segs.length) {
            bl = segs[0].x0; bw = Math.max(4, segs[segs.length - 1].x1 - bl); tcls = ' timed';
            let sh = '';
            segs.forEach((g, i) => {  sh += `<i class="seg" style="left:${g.x0 - bl}px;width:${Math.max(3, g.x1 - g.x0)}px"></i>`; });
            if (lvl === 'full') { const ch = dayChains(pr);
              const lgs = segs.map((g, i) => { const c = ch[i]; if (!c) return ''; const room = Math.max(g.x1 - g.x0, Math.min(cw - 4, (segs[i + 1] ? segs[i + 1].x0 : g.x0 + cw) - g.x0 - 4));
                return `<div class="lg tl" style="left:${g.x0 - bl + 3}px;width:${room}px">${blkDay(c)}</div>`; }).join('');
              inner = `${sh}<div class="bh tl">${badge}${fillBadge(pr.id)}${demoTag(pr)}${pr.id} ${crewShort(pr, m)}</div>${lgs}`;
            } else inner = sh + inner.replace('class="bh"', 'class="bh tl"').replace('class="lg"', 'class="lg tl"');
          }
        }
        h += `<div class="bar slot${slot}${tcls} ${rb ? 'rk-' + rk.risk : ''} ${V[pr.id] ? 'viol' : ''} ${isOk ? 'ok' : ''} ${fillsOf(pr.id).length ? 'has-fill' : ''} ${isHl ? 'hl' : ''}" style="left:${bl}px;width:${bw}px" data-pr="${pr.id}">${inner}</div>`;
      }
      h += '</div>';
    }
    const pct = Math.round(cw / BASE_CW * 100);
    $('#main').innerHTML = h + `</div></div><div class="zoomw" id="zoomw"><button id="zOut" title="缩小（Ctrl/⌘+滚轮）">−</button><button id="zPct" title="点击恢复 100%（日视图）">${pct}%</button><button id="zIn" title="放大（Ctrl/⌘+滚轮）">+</button><button id="zMenuB" title="预设">▾</button>
      <div class="zmenu hidden" id="zMenu">${[['日', 'd', '100%'], ['3日', '3', ''], ['周', 'w', ''], ['半月', 'h', ''], ['整月 · 全局', 'm', '适配']].map(([n, k, t]) => `<div class="zp" data-z="${k}"><span>${n}</span><span class="mut">${t}</span></div>`).join('')}</div></div></div>`;
    // 高度：默认填满剩余视口；底边拖拽可调（≥300px，localStorage 记忆）；⤢ 全屏覆盖（Esc 退出）；「收起」隐藏主线/导出行
    const gw0 = $('.gwrap'); const gbox = $('.gbox'); const GH_KEY = 'crewRoster.ganttH';
    const tb = document.querySelector('#main .toolbar');
    if (tb && !$('#gFull')) tb.insertAdjacentHTML('beforeend', `<button class="btn sm" id="gCompact" title="收起/展开 主线步骤与导出行">${ganttCompact() ? '▾ 展开顶部' : '▴ 收起顶部'}</button><button class="btn sm" id="gFull" title="全屏查看（Esc 退出）">⤢ 全屏</button>`);
    if (ui.gFull) { gbox.classList.add('gfull'); gbox.insertAdjacentHTML('afterbegin', `<div class="gfull-bar"><b>人员视图 · 全屏</b><span class="mut">Ctrl/⌘+滚轮缩放 · Esc 退出</span><button class="btn sm" id="gFullX">✕ 退出全屏</button></div>`); }
    else gbox.insertAdjacentHTML('beforeend', '<div class="gresize" id="gResize" title="拖动调整高度（双击恢复自适应）"><i></i></div>');
    const sizeG = () => { if (ui.gFull) { gw0.style.height = (innerHeight - 46) + 'px'; return; }
      const saved = +localStorage.getItem(GH_KEY) || 0; const fill = innerHeight - gw0.getBoundingClientRect().top - window.scrollY * 0 - 22;
      gw0.style.height = Math.max(300, saved || fill) + 'px'; }; sizeG();
    if ($('#gCompact')) $('#gCompact').onclick = () => { localStorage.setItem('crewRoster.ganttCompact', ganttCompact() ? '0' : '1'); applyCompact(); rGantt(); };
    if ($('#gFull')) $('#gFull').onclick = () => { ui.gFull = true; rGantt(); };
    if ($('#gFullX')) $('#gFullX').onclick = () => { ui.gFull = false; rGantt(); };
    const rz = $('#gResize'); if (rz) { rz.ondblclick = () => { localStorage.removeItem(GH_KEY); sizeG(); };
      rz.onpointerdown = e => { e.preventDefault(); const y0 = e.clientY, h0 = gw0.offsetHeight; rz.setPointerCapture(e.pointerId); rz.classList.add('on');
        rz.onpointermove = ev => { gw0.style.height = Math.max(300, h0 + ev.clientY - y0) + 'px'; };
        rz.onpointerup = () => { rz.onpointermove = null; rz.classList.remove('on'); localStorage.setItem(GH_KEY, String(gw0.offsetHeight)); if (ui.fit) { ui.fitAvail = 0; rGantt(); } }; }; }
    if (ui.fit) { const av = gw0.clientHeight - $('.ghead').offsetHeight - 2; if (Math.abs(av - (ui.fitAvail || 0)) > 4) { ui.fitAvail = av; return rGantt(); } }
    document.querySelectorAll('.lvable').forEach(c => c.onclick = () => { const id = c.dataset.pid; const nx = C.buildIndex(st).sched[id].find(pr => pr.start + pr.ndays - 1 >= 1); goLeave(id, nx ? nx.start : 1, nx ? nx.start + nx.ndays - 1 : 1); });
    if ($('#hlClr')) { $('#hlClr').onclick = () => { ui.hl = null; rGantt(); }; $('#hlUndo').onclick = undoLeave; }
    bindSearchInput($('#gq'), v => { ui.gq = v; const pos = $('#gq').selectionStart; rGantt(); const el=$('#gq'); if(el){ el.focus(); try{el.setSelectionRange(pos,pos);}catch(e){} } });
    const gsq = $('#gsq'); if (gsq) gsq.onchange = e => { ui.gsq = e.target.value; rGantt(); };
    $('#gg').onchange = e => { ui.gg = e.target.value; rGantt(); };
    bindExportButtons();
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
  function ganttCompact() { return localStorage.getItem('crewRoster.ganttCompact') !== '0'; } // 默认收起
  function applyCompact() { document.body.classList.toggle('g-compact', tab === 'gantt' && ganttCompact()); document.body.classList.toggle('g-fullon', tab === 'gantt' && !!ui.gFull); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.gFull && tab === 'gantt') { ui.gFull = false; rGantt(); } });
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
    return `<b>${pr.id}</b>${fillBadge(pr.id)}${demoTag(pr)} · ${pr.ndays}天 · ${pr.ac} · ${C.pairingHours(pr).toFixed(1)}h${pr.offAway ? ` · 外站驻点（${C.apName(pr.outstationBase, st)}）休息日 ${C.offAwayDays(pr, st).join('、')} 日（不计值勤日）` : ''}${pr.legs.some(l => l.dh) ? ' · (随)=置位乘机，不计飞行小时' : ''}<br>${pr.legs.map(l => `D${l.d} ${C.fltLabel(l)} ${apHtml(l.from)}-${apHtml(l.to)} ${C.fmtT(l.dep)}-${C.fmtT(l.arr)} <span class="mut">${esc(l.reg || '')}</span>${C.isNightLeg(l) ? ' <span class="warnc">夜航</span>' : ''}`).join('<br>')}
      <br>FDP：${C.fdpDays(pr, st).map(dy => `D${dy.d} ${C.fmtH(dy.planFdp)}/${C.fmtH(dy.limit)} 余${fmtBuf(dy.planBuffer)}`).join(' · ')}
      <br><b>${crewTxt(pr, m)}</b>${['C', 'F', 'T'].map(s => pr.crew[s] && m[pr.crew[s]] ? ' ' + pill(m[pr.crew[s]].rank) : '').join('')}${flTxt}${pr.demoAnomalyNote ? '<br><span class="red">' + esc(pr.demoAnomalyNote) + '</span>' : ''}${V[pr.id] ? '<br><span class="red">' + V[pr.id].map(esc).join('<br>') + '</span>' : ''}`;
  }


// 非飞展示：请假子类/空班/控班仍用确定性标签；模拟机与培训以 st.sim / st.training 为准（不再哈希伪装）
function nonFlyKind(p, d) {
  let hsh = 0; const s = p.id; for (let i = 0; i < s.length; i++) hsh = (hsh * 31 + s.charCodeAt(i)) | 0; hsh = Math.abs(hsh);
  const lvKinds = [['rest', '疗养'], ['al', '年假'], ['sick', '病假(航医)']]; const lk = lvKinds[hsh % 3];
  const x = Math.abs((hsh * 7 + d * 131) % 100);
  const isHold = (((typeof st !== 'undefined' && st && st.simHold) || {})[p.id] || []).includes(d);
  const isSim = (((typeof st !== 'undefined' && st && st.sim) || {})[p.id] || []).includes(d);
  const isTr = (((typeof st !== 'undefined' && st && st.training) || {})[p.id] || []).includes(d);
  return { lv: lk[0], lvName: lk[1], tr: isHold ? '提前占位/模拟机占位' : (isSim ? '模拟机训练' : (isTr ? '培训(飞技)' : '')), idle: x < 4 ? '空班' : x < 6 ? '中队控班' : '' };
}
