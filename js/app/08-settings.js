/* 机组排班助手 - 界面 · settings.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ---------------- 设置 ----------------
  function rSettings() {
    const S = st.settings; const aps = Object.assign({}, C.AIRPORTS, st.airports || {});
    const num = (k, lab, unit) => `<div class="slotbox" style="grid-template-columns:200px 120px 60px"><span>${lab}</span><input type="number" step="any" data-k="${k}" value="${S[k]}"><span class="mut">${unit}</span></div>`;
    const cats = ['NONE', 'LHASA', 'HIGH', 'PLATEAU', 'ZBCF', 'J1', 'US'];
    $('#main').innerHTML = `<div class="grid g2"><div class="panel"><h3>排班参数</h3>
      ${num('minRestH', '两任务间最短休息期（手册：关车后40分钟起、至报到前25分钟止，≥10h）', '小时')}${num('hardMaxHours', '月飞行小时硬上限（默认100h=公司/法规）', '小时')}${num('opsDayWindowH', '运营看板·飞机日可用窗口', '小时（利用率分母）')}
      ${num('maxOffCapt', '同日最多休息/请假（机长类，999=不限制）', '人')}${num('maxOffFO', '同日最多休息/请假（副驾驶）', '人')}${num('maxStandbyPerPilot', '每人每月最多备份', '天')}${num('gapWeight', '休息 2–3 天偏好权重（软）', '0–1')}${num('softRest48H', '144h内连续休息软目标', '小时')}${num('reportMin', '首段起飞前报到（公司国内飞行组105=1h45）', '分钟')}${num('releaseMin', '末段落地后退场（公司休息起算用关车+40，本项为近似）', '分钟')}
      <label class="flex"><input type="checkbox" id="hp" ${S.honorPrefs ? 'checked' : ''}> 自动排班优先保障意向休息日（无法满员时才放宽）</label>
      <h3 style="margin-top:14px">高强度模式</h3>
      <label class="flex"><input type="checkbox" id="hiMode" ${S.highIntensity ? 'checked' : ''}> 高强度模式：允许把工时集中到机长线（J3+/教员），普通模式软目标 ≤70–75h</label>
      ${num('hiTargetH', '高强度·机长线软目标', '小时（默认85，须 ≤ 硬上限）')}
      <div class="note">仅调整软目标；121.487 月100h、7日飞行执勤期 60h、月飞行执勤期 210h、<strong>144h内连续48h休息仍为硬底</strong>、121.495(b)第5日、公司上限照常硬卡。另设「144h内连续休息软目标」（默认60h）：自动排班偏好更松的连续休息，避免卡在48h边缘；未达标仅软提示。&gt;80h 者在校验中列为软提示「高强度」。</div>
      <div style="margin:6px 0"><button class="btn sm" id="dlyChk">延误鲁棒性检查（+30/+60 分钟/段）</button> <span id="dlyOut" class="mut"></span></div>
      <h3 style="margin-top:14px">路演演示</h3>
      <label class="flex"><input type="checkbox" id="demoAnom" ${S.demoAnomalies ? 'checked' : ''}> 自动填人后植入【演示异常】（默认关；开启时至多 1 项座位硬违规）</label>
      ${num('demoHoles', '自动填人后预留易补空洞数', '个（建议 3–5）')}
      <div class="note" style="margin-top:6px">空洞优先落在 1–2 天、无特殊机场的任务副驾位，便于现场「空洞换人」演示；不会故意留下大量 FTL 硬失败。</div>
      <h3 style="margin-top:14px">压力回测</h3>
      <div class="note">在当前示例盘的 <strong>深拷贝</strong> 上跑基线与三档压力（多人同时请假 / 任务密度+30% / 特殊机场资质稀缺），与基线对比；<strong>不会改坏当前排班</strong>。</div>
      <div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <button class="btn primary sm" id="stressRun" type="button">跑压力场景回测</button>
        <button class="btn sm" id="stressLeave" type="button">仅·多人请假</button>
        <button class="btn sm" id="stressDense" type="button">仅·密度+30%</button>
        <button class="btn sm" id="stressAuth" type="button">仅·资质稀缺</button>
      </div>
      <div id="stressOut" class="note" style="margin-top:6px">尚未跑过压力回测。</div>
      <div class="note" style="margin-top:8px">月飞行小时硬上限默认<strong>100h</strong>（对齐公司运行手册与 CCAR-121.487，可改）。另强制：<strong>144h内连续48h休息</strong>（硬底不变）、连续4个值勤日（执飞或主备份；仅置位的日子不计）后第5日不得执飞（第5日置位合规，软提示尽量避免）、任意连续7日飞行值勤≤60h、月飞行值勤≤210h、年飞行≤900h（YTD+本月）。软目标：144h内连续休息默认偏好<strong>≥60h</strong>（可调），自动排班避免卡死在硬底边缘，未达标仅软提示「48h休息偏紧」。两任务间最短休息默认12h（严于公司/法规10h）。自动排班按公平均衡（基尼），不设目标上下限。本系统仅<strong>三人制</strong>，不启用扩编表C。</div>
      <h3 style="margin-top:16px">血压测试仪机场 <small>勾选的机场作为始发站（出港）时须配备血压测试仪，相关任务将被标记提醒（机场清单待确认，可随时调整）</small></h3>
      <div style="column-count:3;font-size:12px">${Object.keys(aps).map(c => `<label style="display:block"><input type="checkbox" data-bpt="${c}" ${(S.bpTesterAirports || []).includes(c) ? 'checked' : ''}> ${c} ${aps[c][0]}</label>`).join('')}</div>
      <h3 style="margin-top:16px">飞行执勤期限制 <small class="warnc">默认值，参考 CCAR-121 部非扩编机组表，可按公司规定修改</small></h3>
      <table class="fdpt"><tr><th>报到时间（本地）</th>${C.LEG_COLS.map(c => `<th>${c}</th>`).join('')}</tr>${S.fdpTable.map((r, ri) => `<tr><td>${r.label}</td>${r.lim.map((v, ci) => `<td><input type="number" step="0.5" class="fdpin" data-r="${ri}" data-c="${ci}" value="${v}"> h</td>`).join('')}</tr>`).join('')}</table>
      <div class="note">飞行执勤期 = 当日<strong>首个执飞段</strong>起飞前报到（${S.reportMin} 分钟）至<strong>末个执飞段</strong>落地；两端置位(随)不拉长窗口（置位仍占休息/占用，不计飞行小时与执勤期长度）。按报到时刻与当日<strong>执飞</strong>段数查表。</div>
      <div class="note" style="margin-top:6px">三人制运行：不启用扩编机组 / 表C（公司手册 3.6.3 表C留白；用户拍板关闭）。</div>
      <label class="flex" style="margin-top:8px"><input type="checkbox" id="fdpSplitLG" ${S.fdpSplitLongGround !== false ? 'checked' : ''}> 长过站拆分飞行值勤期（过站≥阈值默认休息；合肥式早出晚归；短过站不拆）</label>
      ${num('fdpSplitLongGroundH', '拆分阈值：同站过站 ≥', '小时（默认5；外站与基地均拆）')}
      <div class="note" style="margin-top:4px">拆分后次段按 reportMin 重新报到，不与前段并成一个连续 FDP。含成都双流/天府基地长过站（如湘府湘）。</div>
      ${num('fdpRiskHigh', '高风险：延误余量 <', '分钟')}${num('fdpRiskMed', '中风险：延误余量 <', '分钟')}${num('minTurnMin', '延误推算最短过站', '分钟')}${num('minOvernightRestH', '任务内过夜最低休息', '小时')}
      <div style="margin-top:6px"><button class="btn sm" id="fdpReset">恢复默认 飞行执勤期表</button></div>
      <div style="margin-top:12px"><button class="btn primary" id="saveS">保存设置并重新校验</button></div></div>
      <div class="panel"><h3>机场与特殊机场类别</h3><div class="note">类别：${cats.map(c => c + '=' + (C.CAT_DESC[c] || '')).join('；')}。需授权类别：${C.AUTH_CATS.join('/')}</div>
      <div class="scroll"><table><tr><th>ICAO</th><th>名称</th><th>类别</th></tr>${Object.keys(aps).map(c => `<tr><td>${c}</td><td class="${aps[c][3] ? 'red' : ''}">${aps[c][0]}</td><td><select data-cat="${c}" ${c === 'ZUUU' ? 'disabled' : ''}>${cats.map(k => `<option value="${k}" ${(aps[c][3] || 'NONE') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td></tr>`).join('')}</table></div></div></div>`;
    $('#saveS').onclick = () => {
      document.querySelectorAll('[data-k]').forEach(i => S[i.dataset.k] = +i.value);
      document.querySelectorAll('.fdpin').forEach(i => S.fdpTable[+i.dataset.r].lim[+i.dataset.c] = +i.value); S.fdpAugmented = false;
      S.honorPrefs = $('#hp').checked; S.fdpSplitLongGround = $('#fdpSplitLG').checked; S.highIntensity = $('#hiMode').checked; S.hiTargetH = Math.min(+S.hiTargetH || 85, S.hardMaxHours || 100); S.demoAnomalies = $('#demoAnom').checked; S.bpTesterAirports = [...document.querySelectorAll('[data-bpt]:checked')].map(i => i.dataset.bpt);
      st.airports = {}; document.querySelectorAll('[data-cat]').forEach(s => { const a = C.AIRPORTS[s.dataset.cat].slice(0, 3); if (s.value !== 'NONE') a[3] = s.value; st.airports[s.dataset.cat] = a; });
      refresh(); toast('设置已保存，校验结果已更新');
    };
    $('#dlyChk').onclick = () => { const r = C.delayRobustness(st, [30, 60]);
      $('#dlyOut').innerHTML = [30, 60].map(m => `+${m}min：新增硬超限 <b class="${r[m].newHard ? 'red' : ''}">${r[m].newHard}</b> 项（${r[m].pilots} 人 / ${r[m].pairings} 任务）${Object.entries(r[m].byType).map(([k, v]) => k + '×' + v).join('，')}`).join('；'); };
    $('#fdpReset').onclick = () => { S.fdpTable = C.defaultFdpTable(); rSettings(); toast('已恢复默认 飞行执勤期表（尚未保存）'); };
    const fmtStressTable = (rep) => {
      if (!rep || !rep.rows || !rep.rows.length) return '无结果';
      const base = rep.rows.find(r => r.key === 'baseline') || rep.rows[0];
      const head = '<table class="fdpt" style="font-size:12px;margin-top:6px"><tr><th>场景</th><th>满员</th><th>满员率</th><th>硬违规</th><th>未满员</th><th>工时区间</th><th>耗时</th><th>备注</th></tr>';
      const body = rep.rows.map(r => {
        let note = '';
        if (r.key === 'leave') note = `请假 ${r.leavePilots || 0} 人×${(r.leaveDays || []).length || 0} 日＝${r.leavePersonDays || 0} 人日`;
        else if (r.key === 'density') note = `任务 ${r.pairingsBefore || '?'}→${r.pairingsAfter || r.total}（+${r.pairingsAdded || 0}）`;
        else if (r.key === 'auth') note = `特殊机场资质 ${r.authHoldersBefore || '?'}→${r.authHoldersAfter || '?'}`;
        else if (r.key === 'baseline') note = '对照';
        const cov = ((r.coverage || 0) * 100).toFixed(1) + '%';
        const hardCls = r.hard ? 'red' : '';
        const dFull = base && r.key !== 'baseline' ? ` <span class="mut">(${r.full - base.full >= 0 ? '+' : ''}${r.full - base.full})</span>` : '';
        const dHard = base && r.key !== 'baseline' ? ` <span class="mut">(${r.hard - base.hard >= 0 ? '+' : ''}${r.hard - base.hard})</span>` : '';
        return `<tr><td>${esc(r.label)}</td><td>${r.full}/${r.total}${dFull}</td><td>${cov}</td><td class="${hardCls}">${r.hard}${dHard}</td><td>${r.unfilled}</td><td>${(+r.hoursMin || 0).toFixed(1)}–${(+r.hoursMax || 0).toFixed(1)}h</td><td>${r.ms} ms</td><td class="mut">${note}</td></tr>`;
      }).join('');
      return head + body + `</table><div class="mut" style="margin-top:4px">seed=${rep.seed} · 仅写结果到本面板（及可选 st.stressReport），live 排班未改</div>`;
    };
    const paintStress = (rep) => {
      st.stressReport = rep;
      const el = $('#stressOut'); if (el) el.innerHTML = fmtStressTable(rep);
    };
    if (st.stressReport) paintStress(st.stressReport);
    let stressBusy = false;
    const runStress = (scenarios) => {
      if (stressBusy) { toast('压力回测进行中…'); return; }
      if (!C.runStressBacktest) { toast('当前核心未含压力回测'); return; }
      stressBusy = true;
      const out = $('#stressOut');
      if (out) out.innerHTML = '<span class="mut">计算中…（深拷贝上 autofill，请稍候）</span>';
      toast('压力回测计算中…');
      const labels = { baseline: '基线', leave: '多人同时请假', density: '任务密度 +30%', auth: '特殊机场资质稀缺' };
      setTimeout(() => {
        try {
          const rep = C.runStressBacktest(st, {
            seed: 20261029, tries: 1, minDiff: 0, scenarios,
            onProgress: (x) => {
              if (!out) return;
              out.innerHTML = `<span class="mut">计算中… ${esc(x.label || labels[x.key] || x.key)}（${(x.i || 0) + 1}/${x.n || scenarios.length}）· ${esc(x.stage || '')}</span>`;
            }
          });
          paintStress(rep);
          const brief = (rep.rows || []).map(r => `${r.label} 满员${r.full}/${r.total} 硬${r.hard}`).join('；');
          toast('✔ 压力回测完成：' + brief, 7000);
        } catch (err) {
          console.error(err);
          if (out) out.innerHTML = '<span class="red">压力回测失败：' + esc(String(err && err.message || err)) + '</span>';
          toast('压力回测失败');
        } finally { stressBusy = false; }
      }, 40);
    };
    $('#stressRun').onclick = () => runStress(['baseline', 'leave', 'density', 'auth']);
    $('#stressLeave').onclick = () => runStress(['baseline', 'leave']);
    $('#stressDense').onclick = () => runStress(['baseline', 'density']);
    $('#stressAuth').onclick = () => runStress(['baseline', 'auth']);
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
          + 'self.onmessage=function(e){var d=e.data;try{if(d.st&&d.st.grid&&C.setPeriod)C.setPeriod(d.st.grid);var info=(d.opts&&d.opts.byMonth?C.autoFillByMonth:C.autoFillDiverse)(d.st,Object.assign({},d.opts||{},{onStatus:function(x){self.postMessage({type:"status",x:x});}}));'
          + 'self.postMessage({type:"done",info:info,crews:d.st.pairings.map(function(p){return p.crew;}),standby:d.st.standby||null,training:d.st.training||null,sim:d.st.sim||null,simHold:d.st.simHold||null});}'
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
    if (st.sample && !st.demo) {
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
      toast(`✔ ${st.demo ? '按规则排班' : '自动填人'}完成（${info && info.builtin ? '载入内置预计算结果' : (lastSolveMs / 1000).toFixed(1) + ' 秒'}）：满员 ${s.full}/${s.total}` + (unf ? (st.demo ? `（未满员 ${unf}）` : `（预留空洞 ${unf}）`) : '') + `，硬性违规 ${s.hard}，工时 ${s.all.min.toFixed(1)}–${s.all.max.toFixed(1)}h，意向休息满足 ${(s.prefRate * 100).toFixed(1)}%` + (info && info.prefs && (info.prefs.fixed || info.prefs.left) ? ` · 意向休息：换下 ${info.prefs.fixed} 个任务${info.prefs.left ? `，${info.prefs.left} 个找不到合规替换人` : ''}` : '') + (holeN ? ` · 已留 ${holeN} 个易补空洞` : '') + (demoN ? ` · 已植入 ${demoN} 项【演示异常】` : ''), 6500); if (cb) cb(); }, 200);
  }
  // 演示版预计算：页面载入后即在后台线程按规则求解（同一输入同一结果）；点「一键排班」时直接接上进度/结果。输入改动则作废重算
  let preJob = null;
  const demoSig = () => JSON.stringify([st.pilots.map(p => [p.id, p.rank, p.leave, p.health && p.health.noFly]), st.pairings.length, st.settings, st.simHold || null]);
  const demoOpts = () => ({ seed: 20260801, tries: 1, minDiff: 0, attempts: 1, passes: 2, byMonth: true });
  function prewarmDemo() {
    if (!st || !st.demo || preJob || autoJob) return; if (window.RosterDemo && window.RosterDemo.SOLVED && st.demoSig0 && demoSig() === st.demoSig0) return; // 有内置结果就不必后台预算 if (st.pairings.some(p => p.crew.C || p.crew.F || p.crew.T)) return;
    const w = makeAutoWorker(); if (!w) return;
    const job = preJob = { w, sig: demoSig(), t0: performance.now(), msg: null, last: null, onStatus: null, onDone: null };
    w.onmessage = e => { const m = e.data; if (preJob !== job) return;
      if (m.type === 'status') { job.last = m.x; if (job.onStatus) job.onStatus(m.x); return; }
      w.terminate(); if (m.type === 'done') { job.msg = m; job.ms = performance.now() - job.t0; if (job.onDone) job.onDone(); } else preJob = null; };
    w.onerror = ev => { ev.preventDefault && ev.preventDefault(); if (preJob === job) preJob = null; w.terminate(); };
    w.postMessage({ st: JSON.parse(JSON.stringify(st)), opts: demoOpts() });
  }
  function applyPre(job, t0, cb) { const m = job.msg; preJob = null; autoJob = null;
    st.pairings.forEach((pr, i) => { pr.crew = m.crews[i]; }); finishAuto(t0, cb, Object.assign({}, m.info || {}, { prewarmMs: Math.round(job.ms) })); }
  // 内置缓存：演示数据未改动（人员/请假/设置与初始一致）时，直接载入随包预计算的结果（与现场按规则计算完全相同的引擎与参数）
  function applyBuiltin(cb) {
    const SV = window.RosterDemo && window.RosterDemo.SOLVED; if (!SV || !st.demoSig0 || demoSig() !== st.demoSig0 || SV.crews.length !== st.pairings.length) return false;
    if (preJob) { try { preJob.w.terminate(); } catch (e) {} preJob = null; }
    const t0 = performance.now(); autoJob = { builtin: true }; $('#progress').classList.remove('hidden');
    const steps = ['载入航班与人员', '校验资质与搭配', '逐月填入机组', '复核休息与值勤期'];
    steps.forEach((x, i) => setTimeout(() => showAutoStatus({ pct: (i + 1) / (steps.length + 1), stage: x, detail: '内置预计算', elapsed: (performance.now() - t0) / 1000 }), i * 220));
    setTimeout(() => { st.pairings.forEach((pr, i) => { const c = SV.crews[i]; pr.crew = { C: c[0] || null, F: c[1] || null, T: c[2] || null }; }); const rp = C.prefSwap ? C.prefSwap(st) : null; autoJob = null; finishAuto(t0, cb, { builtin: true, prefs: rp }); }, steps.length * 220 + 150);
    return true;
  }
  function runAuto(cb) {
    if (autoJob) return;
    if (st.demo && applyBuiltin(cb)) return;
    if (st.demo && preJob) {
      if (preJob.sig !== demoSig()) { preJob.w.terminate(); preJob = null; }
      else { const job = preJob, t0 = job.t0; autoJob = { pre: true }; $('#progress').classList.remove('hidden');
        if (job.msg) { showAutoStatus({ pct: 1, stage: '后台已按规则算完，正在载入', elapsed: (performance.now() - t0) / 1000 }); setTimeout(() => applyPre(job, t0, cb), 400); return; }
        showAutoStatus(job.last || { pct: 0, stage: '后台计算中', elapsed: (performance.now() - t0) / 1000 });
        job.onStatus = x => showAutoStatus(x); job.onDone = () => applyPre(job, t0, cb); return; }
    }
    const p = $('#progress'); p.classList.remove('hidden');
    showAutoStatus({ pct: 0, stage: '启动后台计算', elapsed: 0 });
    const t0 = performance.now();
    // 单次生成：新种子即可；不再为「多套方案轮播」强求 minDiff / 多候选
    const seed = (window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4e9)) % 1000000000;
    const opts = st.demo ? demoOpts() : { seed, tries: 1, minDiff: 0 }; // 演示版：固定种子、按月依次按规则填入（同一输入→同一结果）
    const cancelBtn = ensureCancelBtn();
    const w = makeAutoWorker();
    const runMain = () => { // 退回：主线程同步计算（界面在计算期间不会刷新）
      if (cancelBtn) cancelBtn.style.display = 'none';
      showAutoStatus({ pct: 0.02, stage: '后台线程不可用，主线程计算中…', elapsed: 0 });
      setTimeout(() => { const info = (opts.byMonth ? C.autoFillByMonth : C.autoFillDiverse)(st, opts); autoJob = null; finishAuto(t0, cb, info); }, 60);
    };
    if (!w) { autoJob = { main: true }; runMain(); return; }
    autoJob = { w };
    let started = false;
    if (cancelBtn) { cancelBtn.style.display = ''; cancelBtn.onclick = () => { if (!autoJob || !autoJob.w) return; autoJob.w.terminate(); autoJob = null; p.classList.add('hidden'); toast('已取消自动排班，排班未改变'); }; }
    w.onmessage = e => { const m = e.data; if (!autoJob || autoJob.w !== w) return;
      if (m.type === 'status') { started = true; showAutoStatus(m.x); return; }
      w.terminate(); autoJob = null;
      if (m.type === 'done') {
        st.pairings.forEach((pr, i) => { pr.crew = m.crews[i]; }); st.standby = m.standby; st.training = m.training; st.sim = m.sim || null; if (m.simHold) st.simHold = m.simHold; else if (st.simHold && C.mergeSimHolds) C.mergeSimHolds(st);
        finishAuto(t0, cb, m.info);
      } else { console.error(m.msg); if (!started) { autoJob = { main: true }; runMain(); } else { p.classList.add('hidden'); toast('自动排班出错：' + esc(String(m.msg).split('\n')[0])); } }
    };
    w.onerror = ev => { ev.preventDefault && ev.preventDefault(); if (!autoJob || autoJob.w !== w) return; w.terminate(); autoJob = { main: true }; runMain(); };
    w.postMessage({ st: JSON.parse(JSON.stringify(st)), opts });
  }

