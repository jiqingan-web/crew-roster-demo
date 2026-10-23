/* 机组排班助手 - 界面 · main.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ---------------- 启动 ----------------
  load();
  $('#tabs').onclick = e => { const t = e.target.dataset && e.target.dataset.tab; if (t) { tab = t; ui.hl = null; location.hash = t; closeIssuePanel(); closeMore(); render(); } };
  $('#btnMore').onclick = e => { e.stopPropagation(); toggleMore(); };
  document.addEventListener('mousedown', e => { const w = $('#moreWrap'); if (w && !w.contains(e.target)) closeMore(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMore(); });
  $('#btnAuto').onclick = () => runAuto();
  $('#btnClear').onclick = () => { if (confirm('清空全部机组分配？')) { st.pairings.forEach(p => { p.crew = { C: null, F: null, T: null }; delete p.demoHole; }); st.standby = null; st.training = null; st.sim = null; st.solHist = []; st.solIdx = null; refresh(); toast('已清空排班与方案历史'); } };
  $('#btnReset').onclick = () => { if (confirm(LITE ? '重置为轻量版示例数据（约100人 / 1中队）？当前修改将丢失。' : '重置为示例数据（约1100人 / 11中队）？当前修改将丢失。')) { leaveOpts = null; leaveHist = []; leaveHoles = null; leaveOpts = null; holePrev = null; ui.hl = null; dutyOpts = null; dutyDate = null; closeIssuePanel(); reset(true); toast('已重置示例数据'); } };
  { const TH = [['', '深蓝（默认）'], ['light', '浅色'], ['black', '纯黑/高对比'], ['green', '墨绿'], ['warm', '暖灰']];
    const sel = document.createElement('select'); sel.id = 'themeSel'; sel.className = 'btn'; sel.title = '配色主题';
    sel.innerHTML = TH.map(t => `<option value="${t[0]}">🎨 ${t[1]}</option>`).join('');
    const ap = v => { if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; };
    const sv = (location.hash.match(/theme=(\w+)/) || [])[1] || localStorage.getItem('crewTheme') || ''; sel.value = sv; ap(sv);
    sel.onchange = () => { localStorage.setItem('crewTheme', sel.value); ap(sel.value); };
    const rb = $('#btnReset'); rb.parentNode.insertBefore(sel, rb); }
  $('#btnIssues').onclick = e => { e.stopPropagation(); toggleIssuePanel(); };
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
  const hp = location.hash.slice(1).split('&'); if (hp[0]) tab = hp[0];
  sum = C.summarize(st); renderKpis(); updateIssueBadge(); render();
  if (hp.includes('auto')) runAuto(() => { if (hp.includes('leave')) { const idx = C.buildIndex(st); const c = st.pilots.filter(p => p.rank === 'J3').sort((a, b) => idx.sched[b.id].length - idx.sched[a.id].length)[0];
    const pr = idx.sched[c.id][1]; goLeave(c.id, pr.start, pr.start + pr.ndays - 1); }
    if (hp.includes('sim') && $('#dtSim')) $('#dtSim').click();
    if (hp.includes('drawer') && !hp.includes('edit')) { const pr = st.pairings.find(p => C.specialAirportsOf(p, st).length && p.crew.C) || st.pairings[0]; openEdit(pr.id); }
    if (hp.includes('edit')) { const pr = st.pairings.find(p => C.specialAirportsOf(p, st).length); openEdit(pr.id); $('#drwE').click(); document.querySelectorAll('#drawer details')[0].open = true; } document.title += ' ready'; });

  // debug/screenshot hook
  window.__roster = () => ({ st, sum, tab, C, openDrawer, closeDrawer, rReport, rOps, rDuty, rGantt });
