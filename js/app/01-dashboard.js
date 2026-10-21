/* 机组排班助手 - 界面 · dashboard.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ---------------- 主线（路演：4 步） + 更多功能 ----------------
  const MORE_TABS = { roster: '人员总览', welfare: '员工福利', fills: '补位历史', rules: '规则库', settings: '设置' };
  function toggleMore() { const p = $('#morePanel'); const open = p.classList.contains('hidden'); p.classList.toggle('hidden', !open); $('#btnMore').setAttribute('aria-expanded', open ? 'true' : 'false'); }
  function closeMore() { const p = $('#morePanel'); if (p) p.classList.add('hidden'); const b = $('#btnMore'); if (b) b.setAttribute('aria-expanded', 'false'); }
  function goTab(t) { tab = t; ui.hl = null; location.hash = t; closeIssuePanel(); closeMore(); render(); }
  function renderStory() {
    const mb = $('#btnMore'); if (mb) { const inMore = MORE_TABS[tab]; mb.classList.toggle('active', !!inMore); mb.textContent = inMore ? '更多功能 · ' + inMore + ' ▾' : '更多功能 ▾'; }
    const el = $('#story'); if (!el || !sum) return;
    const nIssue = collectIssues().count; const nFill = (st.fills || []).filter(f => !f.undone).length;
    const filled = sum.full > 0; const allFull = sum.total > 0 && sum.full === sum.total;
    const next = !filled ? 2 : (nIssue > 0 ? 3 : 4);
    const steps = [
      { n: 1, t: '导入数据', d: `${st.pilots.length} 人 · ${st.pairings.length} 任务${st.sample ? ' · 示例数据' : ''}`, act: 'tab:data' },
      { n: 2, t: '一键自动填人', d: filled ? `满员 ${sum.full}/${sum.total} · 硬违规 ${sum.hard}` : '尚未排班，点此开始', act: 'auto' },
      { n: 3, t: '定位问题', d: nIssue ? `${nIssue} 个任务待处理（缺人/硬违规）` : (filled ? '✔ 无缺人/硬违规' : '排班后查看'), act: 'issues' },
      { n: 4, t: '确定补位 / 换人', d: nFill ? `已确定 ${nFill} 次补位 · 可撤销` : '选人 → 确定 → 甘特高亮', act: 'tab:leave' }
    ];
    el.innerHTML = '<span class="story-lab">主线</span>' + steps.map((s, i) => `<button type="button" class="step${s.n === next ? ' next' : ''}${(s.n === 2 && filled) || (s.n === 3 && filled && !nIssue) ? ' done' : ''}" data-act="${s.act}"><span class="sn">${s.n}</span><span class="sb"><b>${s.t}</b><small>${esc(s.d)}</small></span></button>${i < 3 ? '<span class="sarrow">➜</span>' : ''}`).join('')
      + `<span class="sarrow">+</span><button type="button" class="step rep${tab === 'report' ? ' cur' : ''}" data-act="tab:report"><span class="sn">✓</span><span class="sb"><b>校验报告</b><small>${allFull && !sum.hard ? '全部合规 ✔' : `硬违规 ${sum.hard}`} · 含 CCAR-121 回测</small></span></button>`;
    el.querySelectorAll('.step').forEach(b => b.onclick = () => { const a = b.dataset.act;
      if (a === 'auto') runAuto(); else if (a === 'issues') { closeMore(); openIssuePanel(); } else goTab(a.slice(4)); });
  }
  function render() {
    document.querySelectorAll('#tabs button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderStory(); renderSide(); applyCompact();
    ({ ops: rOps, gantt: rGantt, roster: rRoster, tasks: rTasks, tasklist: rTaskList, overview: rOverview, report: rReport, leave: rLeave, fills: rFills, rules: rRules, duty: rDuty, welfare: rWelfare, data: rData, settings: rSettings })[tab]();
  }


  // ---------------- 运营看板 ----------------
  function copyOpsBrief() {
    const m = C.opsMetrics(st); const t = m.briefText || '';
    const done = () => toast('今日简报已复制');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => fallbackCopy(t, done));
    else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动导出 txt'); }
    ta.remove();
  }
  function exportOpsBrief() {
    const m = C.opsMetrics(st); const t = m.briefText || '';
    const blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `今日简报_2026-11-${String(m.focusDate).padStart(2, '0')}.txt`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    toast('已导出今日简报');
  }
  function rOps() {
    const m = C.opsMetrics(st); const S = st.settings;
    const zoneCls = { ideal: 'z-ideal', idle: 'z-idle', alert: 'z-alert', critical: 'z-critical' }[m.zone] || 'z-idle';
    let h = solCompareHtml() + `<div class="panel"><h3>运营看板 <small>基于当前排班快照 · 本月机号 ${m.nAircraft}（模板池 ${m.fleetTemplate}）· 任务 ${m.nPairings} 组</small></h3>
      <div class="satrow">
        <div class="satcard ${zoneCls}">
          <div class="olab">饱和度</div>
          <div class="oval big">${m.satPct}<small>%</small></div>
          <div class="omut">已排 ${m.assignedHours.toFixed(0)}h ÷ 容量 ${m.capacityTotal.toFixed(0)}h</div>
        </div>
        <div class="satcard ${zoneCls}">
          <div class="olab">韧性度</div>
          <div class="oval big">${m.resiliPct}<small>%</small></div>
          <div class="omut">剩余可排 ${m.remainHours.toFixed(0)}h ÷ 容量</div>
        </div>
        <div class="satcard zonebadge ${zoneCls}">
          <div class="olab">四象限</div>
          <div class="oval big">${esc(m.zoneLabel)}</div>
          <div class="omut">${esc(m.zoneHint)}</div>
        </div>
      </div>
      <div class="note">饱和度 ≈ 已排飞行小时 / Σ个人硬上限（小时口径，贴近人天占用比）；韧性度 ≈ 剩余可排小时 / Σ个人硬上限。理想区：饱和 80–90% 且韧性 ≥10%。本演示编制约千人、机队按周模板扩量，饱和度常落在「低效」——表示运力相对任务有冗余，便于补位演示。</div>
    </div>`;

    h += `<div class="panel todaystrip"><div class="todayhd"><h3>今日运营 <small>焦点日 11/${String(m.focusDate).padStart(2, '0')}（执勤风险条目最多）</small></h3>
      <div class="briefbtns"><button class="btn sm" id="btnBriefCopy">复制今日简报</button><button class="btn sm prim" id="btnBriefExport">导出 txt</button></div></div>
      <div class="opskpi">
        <div class="okpi"><div class="olab">未满员任务</div><div class="oval">${m.day.unfilled}</div><div class="omut">${m.day.unfilledIds && m.day.unfilledIds.length ? esc(m.day.unfilledIds.join('、')) : '无'}</div></div>
        <div class="okpi"><div class="olab">高 FDP 风险</div><div class="oval">${m.day.fdpHigh}</div><div class="omut">含超限；中风险计 ${m.day.fdpRisk}</div></div>
        <div class="okpi"><div class="olab">待补位空洞</div><div class="oval">${m.day.pendingFills}</div><div class="omut">未满员/演示预留空洞</div></div>
        <div class="okpi"><div class="olab">备份缺口</div><div class="oval">${m.day.standbyGap}</div><div class="omut">当日备份 ${m.day.standby} · 请假 ${m.day.leave}</div></div>
      </div></div>`;

    const kpis = [
      ['剩余运力', m.remainHours.toFixed(0) + 'h', `系统月上限 ${m.hardMaxHours}h × ${m.nPilots} 人 − 已排；已用 ${m.satPct}%`],
      ['人机比', m.pilotsPerAircraft, `${m.nPilots} 人 / ${m.nAircraft} 机`],
      ['人均轮挡', m.blockPerPilot + 'h', '总轮挡 ÷ 飞行员'],
      ['单机轮挡', m.blockPerAircraft + 'h', '总轮挡 ÷ 机号'],
      ['飞机利用率', m.aircraftUtilPct + '%', `轮挡 ÷ (机数×${C.DAYS}天×${m.opsDayWindowH}h)`],
      ['未满员任务', m.unfilled, m.unfilled ? m.unfilledIds.join('、') : '全部满员']
    ];
    h += `<div class="panel"><h3>规模 KPI</h3>
      <div class="opskpi">${kpis.map(([a, b, c]) => `<div class="okpi"><div class="olab">${a}</div><div class="oval">${b}</div><div class="omut">${esc(c)}</div></div>`).join('')}</div></div>`;

    h += `<div class="grid g2">
      <div class="panel"><h3>运力与工时</h3>
        ${CH.bars([
          { label: '已排小时', value: m.assignedHours, color: '#3ea6ff' },
          { label: '剩余运力', value: m.remainHours, color: '#2ecc8f' },
          { label: '总轮挡', value: m.blockHours, color: '#a78bfa' }
        ], { w: 520, h: 200, values: true })}
        <div class="note">超系统月上限人数：${m.overHardPilots} · 公式：剩余运力 = Σ max(0, ${m.hardMaxHours} − 个人已排小时)</div></div>
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

    // 分中队饱和/韧性（可选）
    const sq = (m.bySquadron || []).slice();
    h += `<div class="panel"><h3>分中队饱和度 / 韧性度 <small>可选下钻</small></h3>
      <div class="sqgrid">${sq.map(x => `<div class="sqcard z-${esc(x.zone)}"><div class="sqlab">${esc(x.squad)}</div>
        <div class="sqvals"><span>饱和 <b>${x.satPct}%</b></span><span>韧性 <b>${x.resiliPct}%</b></span></div>
        <div class="omut">${x.nPilots} 人 · ${esc(x.zoneLabel)} · 已排 ${x.assignedHours}h</div></div>`).join('')}</div></div>`;

    const fname = { sat: '饱和度', resili: '韧性度', zone: '四象限', remain: '剩余运力', pilotsPerAc: '人机比', blockPerPilot: '人均轮挡', blockPerAc: '单机轮挡', util: '飞机利用率', legsPerAcDay: '机日航段' };
    h += `<div class="panel"><h3>指标公式</h3><table class="solt"><tr><th>指标</th><th>公式</th></tr>
      ${Object.entries(m.formulas).map(([k, v]) => `<tr><td>${esc(fname[k] || k)}</td><td>${esc(v)}</td></tr>`).join('')}
      </table></div>`;
    h = demoFillBanner() + exportBarHtml('<span class="mut">班表 / 个人月历</span>') + h;
    $('#main').innerHTML = h;
    bindExportButtons();
    const bc = $('#btnBriefCopy'), be = $('#btnBriefExport');
    if (bc) bc.onclick = copyOpsBrief;
    if (be) be.onclick = exportOpsBrief;
  }

