/* 机组排班助手 - 界面 · settings.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ---------------- 设置 ----------------
  function rSettings() {
    const S = st.settings; const aps = Object.assign({}, C.AIRPORTS, st.airports || {});
    const num = (k, lab, unit) => `<div class="slotbox" style="grid-template-columns:200px 120px 60px"><span>${lab}</span><input type="number" step="any" data-k="${k}" value="${S[k]}"><span class="mut">${unit}</span></div>`;
    const cats = ['NONE', 'LHASA', 'HIGH', 'PLATEAU', 'ZBCF', 'J1', 'US'];
    $('#main').innerHTML = `<div class="grid g2"><div class="panel"><h3>排班参数</h3>
      ${num('minRestH', '两任务间最短休息', '小时')}${num('hardMaxHours', '月飞行小时硬上限（默认100h=公司/法规）', '小时')}${num('opsDayWindowH', '运营看板·飞机日可用窗口', '小时（利用率分母）')}
      ${num('maxOffCapt', '同日最多休息/请假（机长类，999=不限制）', '人')}${num('maxOffFO', '同日最多休息/请假（副驾驶）', '人')}${num('standbyPerDay', '每日备份人数（机长类/副驾驶交替）', '人')}${num('maxStandbyPerPilot', '每人每月最多备份', '天')}${num('gapWeight', '休息 2–3 天偏好权重（软）', '0–1')}${num('reportMin', '首段起飞前报到（公司国内飞行组95）', '分钟')}${num('releaseMin', '末段落地后退场（公司休息起算用关车+40，本项为近似）', '分钟')}
      <label class="flex"><input type="checkbox" id="hp" ${S.honorPrefs ? 'checked' : ''}> 自动排班优先保障意向休息日（无法满员时才放宽）</label>
      <h3 style="margin-top:14px">高强度模式</h3>
      <label class="flex"><input type="checkbox" id="hiMode" ${S.highIntensity ? 'checked' : ''}> 高强度模式：允许把工时集中到机长线（J3+/教员），普通模式软目标 ≤70–75h</label>
      ${num('hiTargetH', '高强度·机长线软目标', '小时（默认85，须 ≤ 硬上限）')}
      <div class="note">仅调整软目标；121.487 月100h、7日FDP 60h、月FDP 210h、144h内48h休息、121.495(b)第5日、公司上限照常硬卡。&gt;80h 者在校验中列为软提示「高强度」。</div>
      <div style="margin:6px 0"><button class="btn sm" id="dlyChk">延误鲁棒性检查（+30/+60 分钟/段）</button> <span id="dlyOut" class="mut"></span></div>
      <h3 style="margin-top:14px">路演演示</h3>
      <label class="flex"><input type="checkbox" id="demoAnom" ${S.demoAnomalies ? 'checked' : ''}> 自动填人后植入【演示异常】（默认关；开启时至多 1 项座位硬违规）</label>
      ${num('demoHoles', '自动填人后预留易补空洞数', '个（建议 3–5）')}
      <div class="note" style="margin-top:6px">空洞优先落在 1–2 天、无特殊机场的任务副驾位，便于现场「空洞换人」演示；不会故意留下大量 FTL 硬失败。</div>
      <div class="note" style="margin-top:8px">月飞行小时硬上限默认<strong>100h</strong>（对齐公司手册 EU.COM 3.6.4 与 CCAR-121.487，可改）。另强制：144h内连续48h休息、连续4个值勤日（执飞或主备份；仅置位的日子不计）后第5日不得执飞（第5日置位合规，软提示尽量避免）、任意连续7日飞行值勤≤60h、月飞行值勤≤210h、年飞行≤900h（YTD+本月）。两任务间最短休息默认12h（严于公司/法规10h）。自动排班按公平均衡（基尼），不设目标上下限。本系统仅<strong>三人制</strong>，不启用扩编表C。</div>
      <h3 style="margin-top:16px">血压测试仪机场 <small>勾选的机场作为始发站（出港）时须配备血压测试仪，相关任务将被标记提醒（机场清单待确认，可随时调整）</small></h3>
      <div style="column-count:3;font-size:12px">${Object.keys(aps).map(c => `<label style="display:block"><input type="checkbox" data-bpt="${c}" ${(S.bpTesterAirports || []).includes(c) ? 'checked' : ''}> ${c} ${aps[c][0]}</label>`).join('')}</div>
      <h3 style="margin-top:16px">飞行值勤期（FDP）限制 <small class="warnc">默认值，参考 CCAR-121 部非扩编机组表，可按公司规定修改</small></h3>
      <table class="fdpt"><tr><th>报到时间（本地）</th>${C.LEG_COLS.map(c => `<th>${c}</th>`).join('')}</tr>${S.fdpTable.map((r, ri) => `<tr><td>${r.label}</td>${r.lim.map((v, ci) => `<td><input type="number" step="0.5" class="fdpin" data-r="${ri}" data-c="${ci}" value="${v}"> h</td>`).join('')}</tr>`).join('')}</table>
      <div class="note">FDP = 当日首段计划起飞前报到（${S.reportMin} 分钟）至末段落地（挡轮挡）；按报到时刻与当日航段数查表。</div>
      <div class="note" style="margin-top:6px">三人制运行：不启用扩编机组 / 表C（公司手册 3.6.3 表C留白；用户拍板关闭）。</div>
      ${num('fdpRiskHigh', '高风险：延误余量 <', '分钟')}${num('fdpRiskMed', '中风险：延误余量 <', '分钟')}${num('minTurnMin', '延误推算最短过站', '分钟')}${num('minOvernightRestH', '任务内过夜最低休息', '小时')}
      <div style="margin-top:6px"><button class="btn sm" id="fdpReset">恢复默认 FDP 表</button></div>
      <div style="margin-top:12px"><button class="btn primary" id="saveS">保存设置并重新校验</button></div></div>
      <div class="panel"><h3>机场与特殊机场类别</h3><div class="note">类别：${cats.map(c => c + '=' + (C.CAT_DESC[c] || '')).join('；')}。需授权类别：${C.AUTH_CATS.join('/')}</div>
      <div class="scroll"><table><tr><th>ICAO</th><th>名称</th><th>类别</th></tr>${Object.keys(aps).map(c => `<tr><td>${c}</td><td class="${aps[c][3] ? 'red' : ''}">${aps[c][0]}</td><td><select data-cat="${c}" ${c === 'ZUUU' ? 'disabled' : ''}>${cats.map(k => `<option value="${k}" ${(aps[c][3] || 'NONE') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td></tr>`).join('')}</table></div></div></div>`;
    $('#saveS').onclick = () => {
      document.querySelectorAll('[data-k]').forEach(i => S[i.dataset.k] = +i.value);
      document.querySelectorAll('.fdpin').forEach(i => S.fdpTable[+i.dataset.r].lim[+i.dataset.c] = +i.value); S.fdpAugmented = false;
      S.honorPrefs = $('#hp').checked; S.highIntensity = $('#hiMode').checked; S.hiTargetH = Math.min(+S.hiTargetH || 85, S.hardMaxHours || 100); S.demoAnomalies = $('#demoAnom').checked; S.bpTesterAirports = [...document.querySelectorAll('[data-bpt]:checked')].map(i => i.dataset.bpt);
      st.airports = {}; document.querySelectorAll('[data-cat]').forEach(s => { const a = C.AIRPORTS[s.dataset.cat].slice(0, 3); if (s.value !== 'NONE') a[3] = s.value; st.airports[s.dataset.cat] = a; });
      refresh(); toast('设置已保存，校验结果已更新');
    };
    $('#dlyChk').onclick = () => { const r = C.delayRobustness(st, [30, 60]);
      $('#dlyOut').innerHTML = [30, 60].map(m => `+${m}min：新增硬超限 <b class="${r[m].newHard ? 'red' : ''}">${r[m].newHard}</b> 项（${r[m].pilots} 人 / ${r[m].pairings} 任务）${Object.entries(r[m].byType).map(([k, v]) => k + '×' + v).join('，')}`).join('；'); };
    $('#fdpReset').onclick = () => { S.fdpTable = C.defaultFdpTable(); rSettings(); toast('已恢复默认 FDP 表（尚未保存）'); };
  }

  // ---------------- 自动填人 ----------------
  // 自动排班放到 Web Worker（Blob URL，file:// 离线也可用）：主线程保持响应，进度连续上报；不支持时退回主线程
  let workerURL = null, autoJob = null;
  function makeAutoWorker() {
    if (!window.Worker || !window.Blob || !window.URL || !window.RosterCoreFactory) return null;
    try {
      if (!workerURL) {
        const src = 'self.RosterSampleData=' + JSON.stringify(window.RosterSampleData || null) + ';\n'
          + 'self.RosterLiteRoster=' + JSON.stringify(window.RosterLiteRoster || null) + ';\n'
          + 'self.RosterRulesConfig=' + JSON.stringify(window.RosterRulesConfig || null) + ';\n'
          + 'var C=(' + window.RosterCoreFactory.toString() + ')(self.RosterSampleData, self.RosterLiteRoster, self.RosterRulesConfig);\n'
          + 'self.onmessage=function(e){var d=e.data;try{var info=C.autoFillDiverse(d.st,Object.assign({},d.opts||{},{onStatus:function(x){self.postMessage({type:"status",x:x});}}));'
          + 'self.postMessage({type:"done",info:info,crews:d.st.pairings.map(function(p){return p.crew;}),standby:d.st.standby||null,training:d.st.training||null});}'
          + 'catch(err){self.postMessage({type:"error",msg:String(err&&err.stack||err)});}};';
        workerURL = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      }
      return new Worker(workerURL);
    } catch (e) { return null; }
  }
  const fmtS = x => x == null ? '—' : (x < 60 ? x.toFixed(0) + ' s' : Math.floor(x / 60) + ' 分 ' + String(Math.round(x % 60)).padStart(2, '0') + ' 秒');
  function showAutoStatus(x) {
    const pct = Math.max(0, Math.min(1, x.pct || 0));
    $('#pfill').style.width = (pct * 100).toFixed(1) + '%';
    $('#ptext').innerHTML = `<b>${(pct * 100).toFixed(0)}%</b> · 第 ${x.round || 1}/${x.rounds || 1} 轮 · ${esc(x.stage || '')}${x.detail ? '（' + esc(x.detail) + '）' : ''}`
      + `<br><span class="mut">已用 ${fmtS(x.elapsed)} · 预计剩余 ${x.eta != null && pct < 1 ? fmtS(x.eta) : '—'}</span>`;
  }
  function ensureCancelBtn() {
    const box = document.querySelector('#progress .pbox'); if (!box) return null;
    let b = $('#pcancel');
    if (!b) { b = document.createElement('button'); b.id = 'pcancel'; b.className = 'btn sm'; b.type = 'button'; b.textContent = '取消'; b.style.marginTop = '10px'; box.appendChild(b); }
    return b;
  }
  function finishAuto(t0, cb, info) {
    let demoN = 0, holeN = 0;
    if (st.sample) {
      // 每次重新填人时允许再留洞 / 再注入（受设置开关控制）
      st.demoHolesApplied = false; st.demoHoles = [];
      st.demoAnomaliesApplied = false; st.demoAnomalies = [];
      st.pairings.forEach(pr => { delete pr.demoHole; delete pr.demoAnomaly; delete pr.demoAnomalyNote; });
      const holes = C.leaveDemoHoles(st) || [];
      holeN = holes.length;
      if (st.settings && st.settings.demoAnomalies) { const d = C.injectDemoAnomalies(st) || []; demoN = d.length; }
    }
    const s = C.summarize(st); lastSolveMs = Math.round(performance.now() - t0);
    pushSolution(s, info || {});
    $('#pfill').style.width = '100%';
    setTimeout(() => { $('#progress').classList.add('hidden'); refresh();
      const unf = s.total - s.full;
      toast(`✔ 自动填人完成（${lastSolveMs} ms）：满员 ${s.full}/${s.total}` + (unf ? `（预留空洞 ${unf}）` : '') + `，硬性违规 ${s.hard}，工时 ${s.all.min.toFixed(1)}–${s.all.max.toFixed(1)}h，意向休息满足 ${(s.prefRate * 100).toFixed(1)}%` + (holeN ? ` · 已留 ${holeN} 个易补空洞` : '') + (demoN ? ` · 已植入 ${demoN} 项【演示异常】` : ''), 6500); if (cb) cb(); }, 200);
  }
  function runAuto(cb) {
    if (autoJob) return;
    const p = $('#progress'); p.classList.remove('hidden');
    showAutoStatus({ pct: 0, stage: '启动后台计算', elapsed: 0 });
    const t0 = performance.now();
    // 每次点击新种子：方案不同但合法；lite 内部 3 候选择优且与历史方案差异 ≥40%
    const seed = (window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4e9)) % 1000000000;
    const opts = { seed, prevCrews: (st.solHist || []).slice(-4).map(h => h.crews), minDiff: 0.4, tries: LITE ? 3 : 1 };
    const cancelBtn = ensureCancelBtn();
    const w = makeAutoWorker();
    const runMain = () => { // 退回：主线程同步计算（界面在计算期间不会刷新）
      if (cancelBtn) cancelBtn.style.display = 'none';
      showAutoStatus({ pct: 0.02, stage: '后台线程不可用，主线程计算中…', elapsed: 0 });
      setTimeout(() => { const info = C.autoFillDiverse(st, opts); autoJob = null; finishAuto(t0, cb, info); }, 60);
    };
    if (!w) { autoJob = { main: true }; runMain(); return; }
    autoJob = { w };
    let started = false;
    if (cancelBtn) { cancelBtn.style.display = ''; cancelBtn.onclick = () => { if (!autoJob || !autoJob.w) return; autoJob.w.terminate(); autoJob = null; p.classList.add('hidden'); toast('已取消自动排班，排班未改变'); }; }
    w.onmessage = e => { const m = e.data; if (!autoJob || autoJob.w !== w) return;
      if (m.type === 'status') { started = true; showAutoStatus(m.x); return; }
      w.terminate(); autoJob = null;
      if (m.type === 'done') {
        st.pairings.forEach((pr, i) => { pr.crew = m.crews[i]; }); st.standby = m.standby; st.training = m.training;
        finishAuto(t0, cb, m.info);
      } else { console.error(m.msg); if (!started) { autoJob = { main: true }; runMain(); } else { p.classList.add('hidden'); toast('自动排班出错：' + esc(String(m.msg).split('\n')[0])); } }
    };
    w.onerror = ev => { ev.preventDefault && ev.preventDefault(); if (!autoJob || autoJob.w !== w) return; w.terminate(); autoJob = { main: true }; runMain(); };
    w.postMessage({ st: JSON.parse(JSON.stringify(st)), opts });
  }

