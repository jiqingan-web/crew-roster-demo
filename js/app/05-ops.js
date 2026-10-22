/* 机组排班助手 - 界面 · ops.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ---------------- 校验报告 ----------------
  function rReport() {
    const s = sum, S = st.settings;
    const hardTypes = ['日飞行时间超限', '执勤期超限', '未满员', '时间重叠', '休息不足', '请假冲突', '岗位级别不符', '座位搭配规则', '特殊机场授权/搭配', '新机长无教员', '月小时超法规上限', '年飞行超限', '144h内48h休息', '连续4日后第5日飞行', '连续7日值勤超限', '月值勤超限', '飞行时间限制', '备份冲突', '搭配限制表', 'FO搭配矩阵', '高高原机组', '58岁带队'];
    const card = (lab, val, sub, cls) => `<div class="card"><div class="lab">${lab}</div><div class="val ${cls || ''}">${val}</div><div class="sub">${sub}</div></div>`;
    const ov = C.stats(s.per.map(x => x.overnights)), spx = C.stats(s.per.map(x => x.special)), nt = C.stats(s.per.map(x => x.night));
    const demos = st.pairings.filter(p => p.demoAnomaly);
    const R = C.CCAR121, COM = C.COM || {};
    const ccarPanel = `<div class="panel" id="ccarBox"><h3>CCAR-121-${R.rev} / 公司手册回测摘要 <small>R8 · ${COM.rev || 'EU.COM'} · ${COM.re12 || 'RE12'}</small></h3>
      <div class="mut">表B/表A ✔ · 休息设置 ${S.minRestH}h（≥公司/法规 ${R.minRestBeforeFdpH}h）· 月飞行硬上限 <b>${S.hardMaxHours || 100}h</b>（对齐公司/法规 ${COM.monthFlightH || R.monthFlightH}h）· 报到 ${S.reportMin}min · <b>已启用硬规则</b>：144h内48h休息、4连续值勤日后第5日不飞、7日FDP≤${R.sevenDayFdpH}h、月FDP≤${R.monthFdpH}h、年飞行≤${R.yearFlightH}h（含可选 ytdFlightH）· 三人制（无表C扩编）<br>
      <a href="回测/121回测报告.md" target="_blank" rel="noopener">121报告</a> · <a href="回测/公司手册回测报告.md" target="_blank" rel="noopener">公司手册报告</a> · <a href="https://github.com/jiqingan-web/crew-roster-demo/blob/main/回测/公司手册回测报告.md" target="_blank" rel="noopener">GitHub</a></div></div>`;
    let h = demoFillBanner() + exportBarHtml() + ccarPanel + (demos.length ? `<div class="demo-banner"><b>演示异常（路演用例）</b>：${demos.map(p => `<a href="#gantt" class="demoJump" data-pr="${p.id}">${p.id}</a> ${esc(p.demoAnomalyNote || p.demoAnomaly)}`).join('　·　')}<div class="mut" style="margin-top:4px">校验报告中对应项带【演示异常】前缀；正式排班不会自动注入。</div></div>` : '')
      + `<div class="grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">
      ${card('任务覆盖率（满员）', (s.coverage * 100).toFixed(1) + '%', `${s.full}/${s.total} 个任务 · ${s.totalHours.toFixed(0)} 任务飞行小时`, s.coverage === 1 ? 'ok' : 'bad')}
      ${card('硬性规则违规', s.hard, s.hard ? '需处理，见下表' : '全部合规 ✔（座位搭配/特殊机场/休息/请假/≤${S.hardMaxHours || 100}h）', s.hard ? 'bad' : 'ok')}
      ${card('工时公平性（基尼系数）', s.all.gini.toFixed(3), `全员 ${s.all.min.toFixed(1)}–${s.all.max.toFixed(1)}h · 均值 ${s.all.mean.toFixed(1)}h · 同级组内标准差 ≤ ${Math.max(...C.GROUPS.map(g => s.groups[g].hours.std)).toFixed(1)}h`, 'ok')}
      ${card('休息间隔 2–3 天占比', (s.rhythm.gap23 * 100).toFixed(1) + '%', `均值 ${s.rhythm.gapMean.toFixed(2)} 天 · 备份 ${s.rhythm.standbyTotal} 人日`, s.rhythm.gap23 > 0.5 ? 'ok' : '')}
      ${card('意向休息日满足率', (s.prefRate * 100).toFixed(1) + '%', `${s.prefOK}/${s.prefT} 个意向休息日得到保障`, s.prefRate > 0.95 ? 'ok' : '')}</div>
      <div class="grid g2"><div class="panel"><h3>合规性 <small>硬性规则逐项计数${lastSolveMs ? ' · 自动排班用时 ' + lastSolveMs + ' ms' : ''}</small></h3><table><tr><th>规则</th><th>违规数</th></tr>
      ${hardTypes.map(t => { const n = (s.byType[t] || {}).n || 0; return `<tr><td>${t}</td><td class="${n ? 'red' : 'okc'}">${n ? n : '0 ✔'}</td></tr>`; }).join('')}
      <tr><td>备份超过每人每月 ${S.maxStandbyPerPilot} 天（软性）</td><td class="warnc">${(s.byType['备份超限'] || {}).n || 0}</td></tr><tr><td>每日备份人数不足（软性）</td><td class="warnc">${(s.byType['备份人数不足'] || {}).n || 0}</td></tr><tr><td>意向休息日未满足（软性）</td><td class="warnc">${(s.byType['意向休息日未满足'] || {}).n || 0}</td></tr><tr><td>始发站需血压测试仪提醒（信息）</td><td class="warnc">${(s.byType['需血压测试仪'] || {}).n || 0}</td></tr></table></div>
      <div class="panel"><h3>公平性 · 各级别组月飞行小时分布 <small>圆点=均值，阴影=±1σ，线=最小–最大；红虚线=月硬上限（设置值） ${S.hardMaxHours || 100}h</small></h3><div class="chart">${CH.ranges(C.GROUPS.map(g => Object.assign({ label: g, color: GCOL[g] }, s.groups[g].hours)), { range: [20, 100], marks: [{ v: S.hardMaxHours || 100, color: '#ff5a6a' }] })}</div>
      <table><tr><th>组别</th><th>人数</th><th>均值</th><th>标准差</th><th>最小</th><th>最大</th><th>基尼</th></tr>${C.GROUPS.map(g => { const x = s.groups[g].hours; return `<tr><td>${g}</td><td>${x.n}</td><td>${x.mean.toFixed(1)}</td><td>${x.std.toFixed(2)}</td><td>${x.min.toFixed(1)}</td><td>${x.max.toFixed(1)}</td><td>${x.gini.toFixed(3)}</td></tr>`; }).join('')}</table></div></div>
      <div class="panel"><h3>每人本月飞行小时 <small>按组别、小时排序；颜色=组别</small></h3><div class="chart">${CH.bars(s.per.slice().sort((a, b) => C.GROUPS.indexOf(a.group) - C.GROUPS.indexOf(b.group) || b.hours - a.hours).map(x => ({ label: x.name, value: x.hours, color: GCOL[x.group] })), { w: 1400, h: 260, showLabels: false, lines: [{ v: S.hardMaxHours || 100, label: '月硬上限(设置) ' + (S.hardMaxHours || 100) + 'h', color: '#ff5a6a' }], max: 100 })}</div>
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
      <div class="panel"><h3>问题明细 <small>${s.violations.length} 条（含软性与提醒）</small></h3><div class="scroll" style="max-height:300px"><table><tr><th>级别</th><th>类型</th><th>说明</th><th></th></tr>
      ${s.violations.slice().sort((a, b) => ['hard', 'soft', 'info'].indexOf(a.level) - ['hard', 'soft', 'info'].indexOf(b.level)).map(v => `<tr class="${v.pairing ? 'issueJump' : ''}" ${v.pairing ? `data-pr="${esc(v.pairing)}"` : ''}><td class="${v.level === 'hard' ? 'red' : 'warnc'}">${{ hard: '硬性', soft: '软性', info: '提醒' }[v.level]}</td><td>${v.type}</td><td>${esc(v.msg)}</td><td>${v.pairing ? '<span class="mut">定位 →</span>' : ''}</td></tr>`).join('') || '<tr><td colspan=4 class="okc">无</td></tr>'}</table></div></div>`;
    const needFix = (s.hard > 0) || st.pairings.some(pr => !(pr.crew.C && pr.crew.F && pr.crew.T));
    h = `<div class="panel" id="autoFixBox"><h3>一键自动纠错 <small>空洞/硬违规 · 直接补位 + 换人链（深度≤4）· 可撤销</small></h3>
      <div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn primary" id="btnAutoFix" ${needFix ? '' : 'disabled'}>🔧 生成纠错方案</button>
        <span class="mut" id="autoFixStatus">${needFix ? '检测到未满员或硬违规，可尝试自动纠错' : '当前无未满员/硬违规'}</span>
      </div><div id="autoFixPlan"></div></div>` + h;
    $('#main').innerHTML = h;
    document.querySelectorAll('.demoJump').forEach(a => a.onclick = e => { e.preventDefault(); jumpToIssue(a.dataset.pr); });
    document.querySelectorAll('tr.issueJump').forEach(tr => tr.onclick = () => jumpToIssue(tr.dataset.pr));
    bindExportButtons();
    const btnAf = $('#btnAutoFix');
    if (btnAf) btnAf.onclick = () => {
      const plan = C.autoCorrectPlan(st, { maxDepth: 4 });
      window._autoFixPlan = plan;
      const box = $('#autoFixPlan');
      if (!plan.moves.length) { box.innerHTML = `<div class="note red">无法纠错：${esc(plan.unsolvableReason || '无方案')}</div>`; return; }
      const peeps = Object.values(plan.people || {});
      box.innerHTML = `<div class="note ${plan.solvable ? 'okc' : 'warnc'}">方案 ${plan.moves.length} 步 · 空洞 ${plan.before.holes}→${plan.after.holes} · 硬违规 ${plan.before.hard}→${plan.after.hard}${plan.solvable ? ' · 可清零' : ' · ' + esc(plan.unsolvableReason || '')}</div>
        <div class="scroll" style="max-height:220px;margin-top:8px"><table><tr><th>要改的航班/任务</th><th>座位</th><th>动作</th><th>人员</th><th>受影响航班</th></tr>
        ${plan.moves.map(m => { const to = m.to && st.pilots.find(p => p.id === m.to); const fr = m.from && st.pilots.find(p => p.id === m.from);
          return `<tr><td>${m.pairingId}</td><td>${C.SLOT_NAME[m.slot] || m.slot}</td><td>${esc(m.kind)}</td><td>${fr ? esc(fr.name) + ' → ' : ''}${to ? esc(to.name) + ' · ' + to.rank : (m.to || '—')}</td><td class="mut">${m.via ? m.via : m.pairingId}</td></tr>`; }).join('')}</table></div>
        <div class="scroll" style="max-height:180px;margin-top:8px"><table><tr><th>受影响人员</th><th>级别</th><th>工时 前→后</th><th>值勤日 前→后</th></tr>
        ${peeps.map(x => `<tr><td>${esc(x.name)}</td><td>${x.rank}</td><td>${x.hoursBefore}h → <b>${x.hoursAfter}h</b></td><td>${x.dutyBefore} → <b>${x.dutyAfter}</b></td></tr>`).join('') || '<tr><td colspan=4 class="mut">—</td></tr>'}</table></div>
        <div class="flex" style="margin-top:10px;gap:8px"><button class="btn primary" id="btnAutoFixApply">应用</button><button class="btn" id="btnAutoFixDiscard">丢弃方案</button></div>`;
      $('#btnAutoFixApply').onclick = () => {
        const snap = JSON.stringify(st);
        C.applyAutoCorrect(st, plan);
        leaveHist.push({ snap, label: '一键自动纠错', time: new Date().toTimeString().slice(0, 8) });
        toast('已应用自动纠错'); save(); render();
      };
      $('#btnAutoFixDiscard').onclick = () => { window._autoFixPlan = null; box.innerHTML = ''; };
    };
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
      <button class="btn sm" id="dtSim">模拟故障：延误致执勤余量告急（预检≥2套合规换人方案）</button><button class="btn sm" id="dtClr">清除当日延误</button>${leaveHist.length ? `<button class="btn sm" id="dtUndo">↶ 撤销（${leaveHist.length}）</button>` : ''}</div>
      <div class="note">FDP = 报到（首段计划起飞前 ${S.reportMin} 分钟）→ 当日最晚的实际/预计落地；未录入的航段按计划时刻计算。飞机甘特色块：绿=正常 · 琥珀=延误/中风险 · 红=高风险/超限。</div>
      <div class="opskpi" style="margin-top:10px">
        <div class="okpi"><div class="olab">执行任务</div><div class="oval">${mon.length}</div></div>
        <div class="okpi"><div class="olab">预计超限</div><div class="oval ${nEx ? 'bad' : 'ok'}">${nEx}</div></div>
        <div class="okpi"><div class="olab">下游休息风险</div><div class="oval ${nDn ? 'bad' : 'ok'}">${nDn}</div></div>
        <div class="okpi"><div class="olab">已录入延误段</div><div class="oval">${dl}</div></div>
        <div class="okpi"><div class="olab">低余量任务</div><div class="oval">${mon.filter(x => x.day.buffer < (S.fdpRiskHigh || 60)).length}</div></div>
      </div>
      <div class="panel" style="margin:10px 0 0;padding:10px 12px"><h4 style="margin:0 0 6px">告警列表</h4>
        ${(() => {
          const alerts = [];
          mon.forEach(x => {
            if (x.exceed) alerts.push({ sev: 'critical', msg: `${x.pr.id} 预计超 FDP ${x.exceed.exceed || x.day.exceed} 分`, pr: x.pr.id });
            else if (x.day.buffer < (S.fdpRiskHigh || 60)) alerts.push({ sev: 'high', msg: `${x.pr.id} 余量仅 ${x.day.buffer} 分`, pr: x.pr.id });
            else if (x.day.buffer < (S.fdpRiskMed || 120)) alerts.push({ sev: 'med', msg: `${x.pr.id} 余量 ${x.day.buffer} 分（中）`, pr: x.pr.id });
            x.downstream.forEach(d => alerts.push({ sev: 'med', msg: `${x.pr.id} 下游休息不足`, pr: x.pr.id }));
          });
          if (!alerts.length) return '<div class="okc">✔ 当日无告警</div>';
          const col = { critical: 'red', high: 'red', med: 'warnc' };
          return `<div class="scroll" style="max-height:120px">${alerts.slice(0, 12).map(a => `<div class="${col[a.sev] || ''}" style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1a2a45"><b style="width:64px">${a.sev}</b><span style="flex:1">${esc(a.msg)}</span><button class="btn sm dtGo" data-pr="${a.pr}">快换</button></div>`).join('')}</div>`;
        })()}
      </div></div>`;
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
          ${x.exceed || x.downstream.length || x.day.buffer < (st.settings.fdpRiskHigh || 60) ? `<button class="btn sm ${x.exceed || x.day.buffer < (st.settings.fdpRiskHigh || 60) ? 'primary' : ''} dtGo" data-pr="${pr.id}">生成处置方案</button>` : ''}</div>`; }).join('') || '<div class="note">当日无执行任务</div>'}</div>`;
    }
    const o = dutyOpts;
    if (o) h += `<div class="panel" id="dtSol"><div class="flex" style="flex-wrap:wrap;align-items:center"><h3 style="margin:0">${o.pairing.id} 处置方案 <small>${o.exceed ? `D${o.exceed.d} 预计超 FDP ${o.exceed.exceed} 分钟` : (o.downstream && o.downstream.length ? '下游休息不足' : '执勤余量紧张（预防）')} · 生成 ${o.solutions.length} 个方案 · 用时 ${o.ms} ms</small></h3>
      <button class="btn sm" id="dtExpSel" style="margin-left:auto" title="导出当前选中方案；若未选中则导出推荐方案">导出备选方案</button></div>
      <div class="note" style="margin:6px 0 8px">「导出此方案 / 导出备选方案」仅下载 JSON 与 CSV 摘要，<b>不会</b>改动当前排班；「确定应用」才会写入并高亮各甘特。</div>
      <div class="solgrid">${o.solutions.map(solCard).join('')}</div></div>
      <div class="panel"><h3>影响预览 <small>悬停/点选方案：绿=新增任务 · 橙=被调整任务 · 红虚线=移出</small></h3><div id="mgBox">${miniGantt(o.solutions[cardCtx.hover])}</div></div>`;
    $('#main').innerHTML = h;
    document.querySelectorAll('#dtView button').forEach(b => b.onclick = () => { dutyView = b.dataset.v; dutyOpts = null; dutySel = null; rDuty(); });
    $('#dtD').onchange = e => { dutyDate = +e.target.value; dutyOpts = null; dutySel = null; rDuty(); };
    document.querySelectorAll('.atin').forEach(i => i.onchange = () => { const k = i.dataset.k; const a = A[k] = A[k] || { kind: 'est' }; const v = fromDT(i.value); if (v == null) delete a[i.dataset.f]; else a[i.dataset.f] = v; if (a.dep == null && a.arr == null) delete A[k]; dutyOpts = null; save(); sum = C.summarize(st); renderKpis(); rDuty(); });
    document.querySelectorAll('.atkind').forEach(i => i.onchange = () => { if (A[i.dataset.k]) A[i.dataset.k].kind = i.value; save(); rDuty(); });
    $('#dtClr').onclick = () => { mon.forEach(x => x.day.legs.forEach(l => delete A[C.legKey(l.leg)])); dutyOpts = null; dutySel = null; save(); rDuty(); };
    $('#dtSim').onclick = () => { const f = C.simFaultPick(st, dutyDate);
      if (f) { const l = st.pairings.find(p => p.id === f.pairing).legs.find(x => C.legKey(x) === f.legKey); A[f.legKey] = { dep: l.dep + f.delay, arr: l.arr + f.delay, kind: 'est' }; dutyOpts = null; save(); toast(`模拟：${f.pairing} 第 2 段预计晚 ${f.delay} 分 → 执勤余量告急；已预检 ${f.okCount} 套合规换人方案`); rDuty(); const g = document.querySelector(`.dtGo[data-pr="${f.pairing}"]`); if (g) g.click(); return; }
      const x = mon.slice().sort((a, b) => a.day.buffer - b.day.buffer)[0]; if (!x) return; const l = x.day.legs[Math.min(1, x.day.legs.length - 1)]; A[C.legKey(l.leg)] = { dep: l.dep + 120, arr: l.arr + 120, kind: 'est' }; dutyOpts = null; save(); rDuty(); };
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
      note: '备选方案导出：仅供对比/备案，未应用到当前排班。使用「确定应用」才会写入。',
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
      <div class="solh"><b>方案 ${String.fromCharCode(65 + i)} · ${esc(sol.name)}</b>${sol.recommended ? '<span class="rtag">推荐</span>' : ''}${t ? `<span class="ttag ${t[1]}">${t[0]}</span>` : ''}<span class="score" title="综合评分（越低越好）：未解决×1000、新增硬违规×500、超月上限×200、占意向休息×25、节奏扰动×4、基尼增量×2000、链式层级×6、涉及人数×2、调用备份−5；执勤方案另加：仍超执勤×800、休息不足×300">评分 ${sol.score}</span></div>
      <div class="note">${esc(sol.desc)}</div>
      <table class="solt"><tr><th>任务</th><th>调整</th></tr>${sol.steps.map(x => x.type === 'split' ? `<tr><td>${x.pairing}</td><td><span class="ttag spt">${x.whole ? '整组替换' : '拆分'}</span> ${x.whole ? '' : `原机组飞至 ${esc(C.apName(x.station, st))} 下机；`}自 ${C.fmtT(x.time)} ${esc(C.apName(x.station, st))} 起 ${x.legsB} 段由新机组执行${x.whole ? '' : `（新任务 ${x.newPairing}）`}</td></tr>` : `<tr><td>${x.pairing}${x.slot ? `<br><span class="mut">${C.SLOT_NAME[x.slot]}位</span>` : ''}</td><td>
        ${x.from ? `<span class="diff-del">${esc(m[x.from] ? m[x.from].name : x.from)}</span> → ` : ''}${x.why ? `<span class="mut">（${x.why}）</span>` : ''}${x.type === 'manual' ? '<span class="red">待人工</span>' : nm(x.to)} <span class="ttag ${TYPE_TXT[x.type][1]}">${TYPE_TXT[x.type][0]}</span>${x.prefWarn ? ` <span class="warnc">占${x.prefWarn}</span>` : ''}
        ${x.chain ? `<div class="mut">↳ ${x.chain.pairing} ${C.SLOT_NAME[x.chain.slot]}位：<span class="diff-del">${nm(x.chain.from)}</span> → ${nm(x.chain.to)}${x.chain.fromStandby ? ' <span class="ttag sbt">备份</span>' : ''}</div>` : ''}
        ${x.block ? `<div class="red" style="font-size:11px">受阻规则：${x.block.rules.map(esc).join('；') || '—'}<br>候选人主要不满足：${x.block.top.map(esc).join('，')}</div>` : ''}</td></tr>`).join('')}</table>
      <div class="solk">
        <div><span class="lab">工时变化</span>${sol.people.map(x => `<div>${esc(x.name)} ${x.hb.toFixed(1)}h→<b class="${x.overHard ? 'red' : 'okc'}">${x.ha.toFixed(1)}h</b> ${x.overHard ? `<span class="red">超 ${st.settings.hardMaxHours || 100}h 系统月上限</span>` : ''}</div>`).join('') || '—'}</div>
        <div><span class="lab">公平（基尼）</span>${sol.giniB.toFixed(4)}→${sol.giniA.toFixed(4)} <span class="${sol.giniD > 0.002 ? 'warnc' : 'okc'}">(${sol.giniD >= 0 ? '+' : ''}${sol.giniD.toFixed(4)})</span></div>
        <div><span class="lab">意向休息 / 节奏</span>${sol.prefN ? `<span class="warnc">占用意向休息 ${sol.prefN} 天</span>` : '<span class="okc">不占意向休息</span>'} · ${sol.rhy ? `<span class="warnc">节奏扰动 +${sol.rhy}</span>` : '<span class="okc">节奏无扰动</span>'}</div>
        <div><span class="lab">当日剩余备份</span>${sol.sbLeft.map(x => `<span class="${x.n ? '' : 'warnc'}">${x.d}日:${x.n}</span>`).join(' ')}</div>
        ${sol.fdpAfter != null ? `<div><span class="lab">执勤 / 休息</span>${sol.fdpAfter ? `<span class="red">✖ 仍有 ${sol.fdpAfter} 个值勤日超限</span>` : '<span class="okc">✔ 预计 FDP 不超限</span>'} · ${sol.restAfterV ? `<span class="red">休息不足 ${sol.restAfterV} 项</span>` : '<span class="okc">休息满足</span>'}</div>` : ''}
        <div><span class="lab">合规检查</span>${sol.unresolved ? `<span class="red">✖ ${sol.unresolved} 个岗位需人工处理</span>` : sol.hard ? `<span class="red">✖ 硬性违规 ${sol.hard}</span>` : '<span class="okc">✔ 座位搭配 ✔ 特殊机场 ✔ 休息/工时 · 硬性违规 0</span>'}${sol.bp.length ? `<br><span class="warnc">血压测试仪：${sol.bp.join('、')} 始发站须配备</span>` : ''}</div>
      </div>
      <div class="solbtns"><button class="btn sm solext" data-i="${i}" title="下载此方案 JSON/CSV，不修改当前排班">导出此方案</button>
        <button class="btn ${sol.recommended ? 'primary' : ''} sm solapply" data-i="${i}" ${!sol.state || (sol.unresolved && !sol.steps.some(x => x.to)) ? 'disabled' : ''}>${!sol.state ? '需运控人工处理' : sol.unresolved ? '确定（空缺待人工）' : '确定应用'}</button></div></div>`;
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
      const prs = sol.steps.flatMap(x => [x.pairing, x.newPairing, x.chain && x.chain.pairing]).filter(Boolean);
      const pls = [...(cardCtx.focus || []), ...sol.people.map(x => x.id)];
      if (after) after();
      commitHighlight({ pairings: prs, pilots: pls, days: cardCtx.days,
        toast: '✔ 已确定并同步甘特：' + esc(lb) + ' <a href="#" id="tUndo" style="color:#9fd4ff">撤销</a>', undo: undoLeave });
    });
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
        <input id="lvQ" placeholder="搜索姓名/工号/级别/中队" value="${esc(ui.lvq || '')}" style="width:170px"><span class="mut" id="lvQn"></span>
        <select id="lvP">${caps.filter(c => c.id === leaveSel.pid || C.pilotMatches(c, ui.lvq)).map(c => `<option value="${c.id}" ${c.id === leaveSel.pid ? 'selected' : ''}>${esc(c.name)} · ${c.rank} · ${c.id}${c.squad ? ' · ' + esc(c.squad) : ''} · ${idx.hours[c.id].toFixed(1)}h</option>`).join('')}</select>
        <span>日期</span><select id="lvF">${Array.from({ length: C.DAYS }, (_, i) => `<option ${i + 1 === leaveSel.from ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><span>至</span><select id="lvT">${Array.from({ length: C.DAYS }, (_, i) => `<option ${i + 1 === leaveSel.to ? 'selected' : ''}>${i + 1}</option>`).join('')}</select><span>日</span>
        <button class="btn primary" id="lvGo">生成推荐</button>${leaveHist.length ? `<button class="btn" id="lvUndo">↶ 撤销（${leaveHist.length}）</button>` : ''}</div>
      <div class="note" style="margin-top:6px">任务：${idx.sched[p.id].map(pr => `<a class="lvpr" data-f="${pr.start}" data-t="${pr.start + pr.ndays - 1}">${pr.id}(${pr.start}${pr.ndays > 1 ? '–' + (pr.start + pr.ndays - 1) : ''}日)</a>`).join(' ') || '无'} · 已请假：${(p.leave || []).join(',') || '无'} · 意向休息：${(p.prefs || []).join(',') || '无'}
        · 灯：<span class="clight green"></span>合规 <span class="clight amber"></span>软性/意向休息 <span class="clight red"></span>硬性冲突</div></div>`;
    if (!holes && !o) h += `<div class="note">选择人员与日期后点击「生成推荐」</div>`;
    if (leaveView === 'holes' && holes) {
      h += `<div class="panel"><h3>${esc(holes.pilot.name)}（${holes.pilot.rank}）请假 ${holes.days[0]}${holes.days.length > 1 ? '–' + holes.days[holes.days.length - 1] : ''} 日 · 空洞 ${holes.holes.length} 个</h3>`;
      if (holes.plan) h += `<div class="planhint">✔ 引擎整案推荐「${esc(holes.plan.name)}」：${esc(holes.plan.desc || '')} · 评分 ${holes.plan.score}
        · 可在下方点选候选人预览，点「确定」写入；或打开「多方案卡片」确定应用整案</div>`;
      if (!holes.holes.length) h += `<div class="note">所选日期内无执勤任务，仅需登记请假（可在多方案卡片中一键登记）。</div>`;
      h += `<div class="holegrid">${holes.holes.map((hh, hi) => {
        const empty = `<div class="hole-seat empty"><span class="clight red"></span><b>${hh.slotName}位 · 空缺</b><div class="mut">${esc(p.name)} 请假腾出</div></div>`;
        const left = hh.crewLeft.map(c => c.id ? `<div class="hole-seat"><b>${C.SLOT_NAME[c.slot]} ${esc(c.name)}</b> ${pill(c.rank)}</div>` : `<div class="hole-seat mut">${C.SLOT_NAME[c.slot]} 空</div>`).join('');
        const chips = (hh.legChips || []).map(l => `<span class="legchip">D${l.d} ${esc(l.flt)} <span class="${l.spFrom ? 'sp' : ''}">${esc(l.fromName)}</span>-<span class="${l.spTo ? 'sp' : ''}">${esc(l.toName)}</span></span>`).join('');
        const cands = hh.candidates.map((c, ci) => `<button type="button" data-s="${esc([c.name, c.id, c.rank, (st.pilots.find(x => x.id === c.id) || {}).squad].join(' '))}" data-py="${esc((C.pinyinInitialsOf && C.pinyinInitialsOf(c.name)) || '')}" class="cand ${c.light === 'red' ? 'redish' : ''} ${holePrev && holePrev.hi === hi && holePrev.ci === ci ? 'on' : ''}" data-hi="${hi}" data-ci="${ci}">
          <span class="clight ${c.light}"></span><span class="av">${esc((c.name || '??').slice(-2))}</span>
          <span class="cn"><b>${esc(c.name)}</b> ${pill(c.rank)}<br><span class="mut">${c.hoursBefore}h${c.fromStandby ? ' · ★备份' : ''}${c.warn ? ' · ⚠休息' : ''}${c.light === 'red' && c.reasons[0] ? ' · ' + esc(c.reasons[0].slice(0, 18)) : ''}</span></span></button>`).join('') || '<span class="mut">无候选</span>';
        const psteps = (hh.planSteps || []).map(x => x.type === 'chain' ? `链式：${x.to ? '←新机长位' : ''} ${esc(x.type)}` : `${esc(x.type)}${x.to ? '→…' : ''}`).join('；');
        return `<div class="holec" id="hole${hi}"><div class="holehd"><b>${hh.id}</b><span class="holemeta">${dateOf(hh.start)}起 ${hh.ndays} 天 · ${hh.ac} · ${hh.hours}h · 机号 ${(hh.reg || []).join('/') || '—'}</span></div>
          <div class="holeroute">${chips}</div>
          <div class="holeseats">${empty}${left}</div>
          <div class="candrow"><span class="lab">推荐</span><input class="holeq" data-hi="${hi}" placeholder="搜索姓名/工号/级别/中队" style="width:160px"><span class="mut holen" data-hi="${hi}">${hh.candidates.length}/${hh.candidates.length}</span>${cands}</div>
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
          <div class="flex" style="margin-top:10px;flex-wrap:wrap;gap:8px"><button class="btn primary" id="hpApply" ${c.light === 'red' ? 'disabled' : ''}>确定</button><span class="mut">写入补位并登记请假 · 点选候选人仅预览</span>
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
    { const q = $('#lvQ'), sel = $('#lvP'), n = $('#lvQn');
      const caps = st.pilots.filter(p => C.isCaptClass(p.rank)).concat(st.pilots.filter(p => C.isFO(p.rank))); const ix = C.buildIndex(st);
      const draw = () => { const list = caps.filter(c => c.id === leaveSel.pid || C.pilotMatches(c, ui.lvq));
        sel.innerHTML = list.map(c => `<option value="${c.id}" ${c.id === leaveSel.pid ? 'selected' : ''}>${esc(c.name)} · ${c.rank} · ${c.id}${c.squad ? ' · ' + esc(c.squad) : ''} · ${ix.hours[c.id].toFixed(1)}h</option>`).join('');
        n.textContent = '匹配 ' + list.length + '/' + caps.length; };
      if (q) { n.textContent = '匹配 ' + sel.options.length + '/' + caps.length;
        bindSearchInput(q, v => { ui.lvq = v; draw(); });
        q.onkeydown = e => { if (e.key === 'Enter') { const m = caps.find(c => c.id !== leaveSel.pid && C.pilotMatches(c, ui.lvq)); if (m) { leaveSel.pid = m.id; leaveOpts = null; leaveHoles = null; holePrev = null; rLeave(); } } }; } }
    document.querySelectorAll('.holeq').forEach(inp => bindSearchInput(inp, () => {
      const row = inp.closest('.candrow'); const t = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean); let n = 0, all = 0;
      row.querySelectorAll('.cand').forEach(b => { all++;
        const hay = (b.dataset.s || '').toLowerCase();
        const py = (C.pinyinInitialsOf && b.dataset.py) ? b.dataset.py : '';
        const ok = !t.length || t.every(x => hay.includes(x) || (py && py.includes(x)));
        b.style.display = ok ? '' : 'none'; if (ok) n++; });
      row.querySelector('.holen').textContent = n + '/' + all; }));
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
    const fromName = p ? p.name : '空缺';
    p.leave = [...new Set([...(p.leave || []), ...days])].sort((a, b) => a - b);
    p.prefs = (p.prefs || []).filter(d => !p.leave.includes(d));
    if (st.standby && st.standby[pid]) st.standby[pid] = st.standby[pid].filter(d => !days.includes(d));
    const pr = st.pairings.find(x => x.id === hh.id); if (!pr) return;
    pr.crew[hh.slot] = c.id;
    if (st.standby && st.standby[c.id]) st.standby[c.id] = st.standby[c.id].filter(d => !C.daysTouched(pr, st).includes(d));
    leaveHist.push({ snap, label: `${p.name} 请假 ${days[0]}–${days[days.length - 1]} · ${hh.id}${hh.slotName}←${c.name}`, time: new Date().toTimeString().slice(0, 8) });
    recordFillsFromHole(hh, p, days, c, 'hole');
    leaveOpts = null; leaveHoles = null; holePrev = null;
    sum = C.summarize(st);
    const okNow = crewComplianceOk(pr);
    commitHighlight({
      pairings: [hh.id], pilots: [pid, c.id], days, ok: okNow,
      toast: `✔ 已更新：${esc(hh.id)} ${esc(hh.slotName)} ${esc(fromName)}→<b>${esc(c.name)}</b>${okNow ? ' <span class="okc">● 合规</span>' : ''} <a href="#" id="tUndo" style="color:#9fd4ff">撤销</a>`,
      undo: undoLeave
    });
  }
  function scrollToHl() { const b = document.querySelector('.bar.hl'); const g = $('.gwrap'); if (b && g) { g.scrollTop = Math.max(0, b.parentElement.offsetTop - 140); g.scrollLeft = Math.max(0, b.offsetLeft - 420); } }
  function undoLeave() { const x = leaveHist.pop(); if (!x) return; st = JSON.parse(x.snap); ui.hl = null; leaveOpts = null; leaveHoles = null; holePrev = null; refresh(); toast('已撤销：' + esc(x.label)); }


  // ---------------- 规则库（rules/crew_rules.yaml → js/rules-config.js）----------------
  async function readTable(file) {
    if (/\.xlsx$/i.test(file.name) && window.JSZip) {
      const z = await JSZip.loadAsync(await file.arrayBuffer()); const P = new DOMParser();
      const ssx = z.file('xl/sharedStrings.xml'); const ss = ssx ? [...P.parseFromString(await ssx.async('string'), 'text/xml').getElementsByTagName('si')].map(n => n.textContent) : [];
      const sh = z.file('xl/worksheets/sheet1.xml') || z.file(/xl\/worksheets\/sheet\d+\.xml/)[0];
      const doc = P.parseFromString(await sh.async('string'), 'text/xml');
      return [...doc.getElementsByTagName('row')].map(r => { const out = []; [...r.getElementsByTagName('c')].forEach(c => { const ref = c.getAttribute('r') || ''; const col = ref.replace(/\d+/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const v = c.getElementsByTagName('v')[0]; const is = c.getElementsByTagName('is')[0]; const t = c.getAttribute('t');
        out[col] = t === 's' ? ss[+(v && v.textContent)] : is ? is.textContent : v ? v.textContent : ''; }); return out; });
    }
    return await file.text();
  }
  function rRules() {
    const cat = C.rulesCatalog(st); const RC = C.RULES_CONFIG || {}; const L = RC.airport_category_list || {};
    const stCls = s => /^生效/.test(s) ? 'okc' : /待|停用/.test(s) ? 'warnc' : 'mut';
    const rs = st.restrictions || []; const pm = {}; st.pilots.forEach(p => pm[p.id] = p);
    let h = `<div class="panel"><div class="flex"><h3 style="margin:0">规则库 · CrewRules（CR）</h3><span class="mut" style="margin-left:10px">${esc((cat.meta || {}).source || '')} · ${esc((cat.meta || {}).version || '')}</span></div>
      <div class="note">规则以自有编号 <b>CR-xx</b> 组织；数值参数来自 <code>rules/crew_rules.yaml</code>（生成 <code>js/rules-config.js</code>）。引擎行为不变，校验文案引用 CR 编号。出处泛指 CCAR-121 R8 与公司手册相关条款。</div>
      <table><tr><th>编号</th><th>类别</th><th>类型</th><th>状态</th><th>规则</th><th>参数</th><th>出处</th><th>示例</th></tr>${cat.rules.map(r => `<tr><td><code>${esc(r.id)}</code></td><td>${esc(r.cat || '')}</td><td>${r.kind}</td><td class="${stCls(r.status)}">${esc(r.status)}</td><td style="white-space:normal"><b>${esc(r.title || r.desc)}</b><div class="mut">${esc(r.desc || '')}</div></td><td style="white-space:normal" class="mut">${esc(r.params || '')}</td><td style="white-space:normal" class="mut">${esc(r.source || r.src || '')}</td><td style="white-space:normal" class="mut">${esc(r.example || '')}</td></tr>`).join('')}</table></div>
      <div class="panel"><h3>机场分类（airport_category_list）</h3><div class="note">${Object.keys(L).filter(fl => L[fl] && typeof L[fl] === 'object').map(fl => `<b>${fl}</b>：` + Object.keys(L[fl]).map(k => `<span class="apcls-l">${({ class_1_high_plateau: '一类·高高原', class_2: '二类', class_3: '三类', class_4: '四类', complex_airport: '复杂' })[k] || k}</span> ${(L[fl][k] || []).map(esc).join('、')}`).join('；')).join('<br>')}<br>${esc(L.qualification_note || '')}<br>甘特/任务中机场名后上标：一/二/三/四/复 = 分类；红色 = 需特殊授权/搭配。</div></div>
      <div class="panel"><div class="flex"><h3 style="margin:0">搭配限制表（不可同机）</h3><span class="mut" style="margin-left:10px">${rs.length} 对</span>
        <label class="btn sm" style="margin-left:auto">导入 CSV / xlsx<input type="file" id="rsFile" accept=".csv,.txt,.xlsx" style="display:none"></label><button class="btn sm" id="rsClear">清空</button></div>
      <div class="note">列：${esc(((RC.restriction_table_schema || {}).columns || []).join(' / '))}；限制类型留空按「${esc((RC.restriction_table_schema || {}).default_type || '不可同机')}」。人员可填员工号或姓名。导入后作为硬约束参与自动排班与校验。</div>
      ${rs.length ? `<table><tr><th>人员A</th><th>人员B</th><th>类型</th></tr>${rs.map(r => `<tr><td>${esc((pm[r.a] || {}).name || r.a)} <span class="mut">${esc(r.a)}</span></td><td>${esc((pm[r.b] || {}).name || r.b)} <span class="mut">${esc(r.b)}</span></td><td>${esc(r.type)}</td></tr>`).join('')}</table>` : ''}</div>`;
    $('#main').innerHTML = h;
    $('#rsFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const res = C.parseRestrictions(await readTable(f), st.pilots);
      const key = r => [r.a, r.b].sort().join('|'); const have = new Set((st.restrictions || []).map(key));
      st.restrictions = (st.restrictions || []).concat(res.pairs.filter(r => !have.has(key(r)))); refresh();
      toast(`导入 ${res.pairs.length} 对${res.unknown.length ? '；未匹配 ' + res.unknown.length + ' 行：' + res.unknown.slice(0, 5).join('，') : ''}`); } catch (err) { toast('导入失败：' + err.message); } };
    $('#rsClear').onclick = () => { st.restrictions = []; refresh(); };
  }
  function rFills() {
    ensureFills();
    let h = `<div class="panel"><h3>补位历史 <small>请假调配应用后的补位记录；甘特/任务上显示「补位」角标</small></h3>
      <div class="note">共 ${(st.fills || []).filter(f => !f.undone).length} 条有效记录 · 历史栈 ${leaveHist.length} 步可撤销</div>
      ${fillsHistoryHtml()}</div>`;
    $('#main').innerHTML = h;
    if ($('#fillUndoLast')) $('#fillUndoLast').onclick = undoLeave;
    document.querySelectorAll('.fillUndoOne').forEach(b => b.onclick = () => undoFillById(b.dataset.fid));
  }

