/* 机组排班助手 - 单人合规审计页（侧栏「个人审计」先选人；人员视图点姓名直达该人） */
  // ICAO → IATA（日历航线展示 CTU-PVG；未收录则回退 ICAO）
  const PA_IATA = {
    ZUUU: 'CTU', ZUTF: 'TFU', ZSPD: 'PVG', ZSSS: 'SHA', ZBAA: 'PEK', ZBAD: 'PKX',
    ZGGG: 'CAN', ZGSZ: 'SZX', ZGHA: 'CSX', ZJSY: 'SYX', ZJHK: 'HAK', ZSHC: 'HGH',
    ZSNJ: 'NKG', ZHHH: 'WUH', ZLXY: 'XIY', ZWWW: 'URC', ZYHB: 'HRB', ZSQD: 'TAO',
    ZSAM: 'XMN', ZPPP: 'KMG', ZGNN: 'NNG', ZBYN: 'TYN', ZHCC: 'CGO', ZSJN: 'TNA',
    ZGOW: 'SWA', ZSFZ: 'FOC', ZLLL: 'LHW', ZBHH: 'HET', ZUGY: 'KWE', ZYYJ: 'YNJ',
    ZYTX: 'SHE', ZSWX: 'WUX', ZULS: 'LXA', ZPLJ: 'LJG', ZPJH: 'JHG', ZUXC: 'XIC',
    ZLXN: 'XNN', ZYTL: 'DLC', ZPDQ: 'DIG', ZUDC: 'DCY', ZUJZ: 'JZH', ZBCF: 'CIF',
    ZWKM: 'KRY', ZUMT: 'WMT', ZBLL: 'LLV', ZBXZ: 'WUT', ZSLD: 'LCX'
  };
  const PA_COLORS = ['#1d5fa8', '#14766a', '#5a4a9a', '#8a5a2b', '#2a6b8a', '#6b3a6b', '#3d6b4a', '#7a4a4a', '#4a6a2b', '#5a3a8a'];
  function paIata(c) { return PA_IATA[c] || (c && c.length === 4 ? c.slice(1) : (c || '')); }
  function paRoute(from, to) { return paIata(from) + '-' + paIata(to); }
  function paColor(id) {
    let h = 0; const s = String(id || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return PA_COLORS[Math.abs(h) % PA_COLORS.length];
  }
  /** 任务机场单字简称链（复用 fmtOffRaw：府威春 + 春威府(随)） */
  function paRouteChain(pr) {
    return (C.fmtOffRaw && C.fmtOffRaw(pr, st)) || '';
  }
  /** 列表标签：OF289 府威春 + 春威府(随) · D1… */
  function paPairLabel(pr, dayBit) {
    const head = (C.pairingLabel && C.pairingLabel(pr, st)) || String((pr && pr.id) || '');
    return dayBit ? `${head} · ${dayBit}` : head;
  }

  /** 144h 窗内、报到前最大连续休息（小时） */
  function paMaxRestH(intervals, t0) {
    const W = 144 * 60, ws = t0 - W;
    const clipped = [];
    intervals.forEach(([a, b]) => { const x = Math.max(a, ws), y = Math.min(b, t0); if (y > x) clipped.push([x, y]); });
    clipped.sort((a, b) => a[0] - b[0]);
    const merged = [];
    clipped.forEach(iv => {
      if (!merged.length || iv[0] > merged[merged.length - 1][1]) merged.push(iv.slice());
      else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
    });
    let cursor = ws, best = 0;
    for (const [a, b] of merged) { best = Math.max(best, a - cursor); cursor = Math.max(cursor, b); }
    best = Math.max(best, t0 - cursor);
    return best / 60;
  }

  function openPersonAudit(pid) {
    ui.auditPid = pid;
    ui.auditDay = null;
    // 继承甘特/总览活动月（全部→首桶），避免一进页仍用全期假合计
    const bks = (C.monthBuckets && C.monthBuckets()) || [];
    if (bks.length) {
      const inherit = (ui.gMonth && ui.gMonth !== 'all' && bks.some(b => b.key === ui.gMonth))
        ? ui.gMonth
        : (ui.ovMonth && bks.some(b => b.key === ui.ovMonth) ? ui.ovMonth : bks[0].key);
      ui.auditMonth = inherit;
      if (!ui.ovMonth) ui.ovMonth = inherit;
    }
    tab = 'audit';
    location.hash = 'audit';
    closeIssuePanel();
    closeMore();
    try { closeDrawer(); } catch (e) {}
    try { closeModal(); } catch (e) {}
    render();
    window.scrollTo(0, 0);
  }
  function closePersonAudit() {
    ui.auditPid = null;
    ui.auditDay = null;
    // 保留 auditMonth，便于重选人后仍在同月口径
    tab = 'audit';
    location.hash = 'audit';
    render();
  }

  function paBar(pct, cls) {
    const w = Math.max(0, Math.min(100, pct));
    return `<div class="pa-bar"><i class="${cls || ''}" style="width:${w.toFixed(1)}%"></i></div>`;
  }

  function rPersonAuditPicker() {
    document.body.classList.remove('pa-on', 'g-compact', 'g-fullon');
    const q = ui.auditQ || '';
    const sq = ui.auditSq || '演示中队';
    const order = { '教员': 0, '机长': 1, '新机长': 2, '副驾驶': 3 };
    let ps = st.pilots.slice().sort((a, b) => order[C.rankGroup(a.rank)] - order[C.rankGroup(b.rank)] || C.RANK_VAL[b.rank] - C.RANK_VAL[a.rank] || a.id.localeCompare(b.id));
    if (sq && sq !== '全部') ps = ps.filter(p => p.squad === sq);
    if (q) ps = ps.filter(p => pilotSearchMatch(p, q));
    const idx = C.buildIndex(st);
    const rows = ps.slice(0, 120).map(p => {
      const hr = (idx.hours[p.id] || 0).toFixed(1);
      const n = (idx.sched[p.id] || []).length;
      return `<button type="button" class="pa-pick" data-pid="${p.id}"><span class="mut">${esc(p.id)}</span><b>${esc(p.name)}</b>${pill(p.rank)}<span class="mut">${esc(p.squad || '')}</span><span class="pa-pick-h">${hr}h · ${n} 任务</span></button>`;
    }).join('');
    $('#main').innerHTML = `<div class="pa-pickwrap panel">
      <h3>个人审计 <small>先选人，再看日历与合规指标</small></h3>
      <div class="toolbar pa-pickbar">
        <input id="paQ" placeholder="搜索 姓名/工号/级别/拼音首字母" value="${esc(q)}">
        <select id="paSq" title="中队">${squadOptions(sq)}</select>
        <span class="mut">${ps.length} 人${ps.length > 120 ? '（显示前 120）' : ''}</span>
      </div>
      <div class="pa-picklist">${rows || '<div class="mut">无匹配人员</div>'}</div>
    </div>`;
    bindSearchInput($('#paQ'), v => { ui.auditQ = v; rPersonAuditPicker(); });
    const paSq = $('#paSq'); if (paSq) paSq.onchange = e => { ui.auditSq = e.target.value; rPersonAuditPicker(); };
    document.querySelectorAll('.pa-pick').forEach(b => b.onclick = () => openPersonAudit(b.dataset.pid));
  }

  function rPersonAudit() {
    if (!ui.auditPid) return rPersonAuditPicker();
    const pid = ui.auditPid;
    const p = st.pilots.find(x => x.id === pid);
    if (!p) { ui.auditPid = null; return rPersonAuditPicker(); }
    applyCompact();
    document.body.classList.add('pa-on');
    document.body.classList.remove('g-compact', 'g-fullon');

    const idx = C.buildIndex(st);
    const S = st.settings;
    const softH = +(S.softRest48H != null ? S.softRest48H : 60);
    const hardRest = 48;
    const caacMonthH = 90; // 展示口径：CAAC 硬月 90h（卡片）；公司 hardMaxHours 另计
    const hardMonth = C.pilotHardCap ? C.pilotHardCap(p, st) : (S.hardMaxHours || 100);
    const sched = idx.sched[p.id] || [];
    // —— 活动自然月（KPI/列表唯一口径；与 monthBuckets / monthHoursOf 同源）——
    const buckets0 = (C.monthBuckets && C.monthBuckets()) || [{ key: 'all', label: '', days: Array.from({ length: C.DAYS }, (_, i) => i + 1) }];
    if (ui.auditMonth && !buckets0.some(b => b.key === ui.auditMonth)) ui.auditMonth = null;
    if (!ui.auditMonth) {
      if (ui.auditDay != null && C.monthOfDay) ui.auditMonth = C.monthOfDay(ui.auditDay);
      else ui.auditMonth = (typeof uiActiveMonth === 'function') ? uiActiveMonth(null) : (buckets0[0] && buckets0[0].key);
    }
    const mk = ui.auditMonth;
    const monthBucket = buckets0.find(b => b.key === mk) || buckets0[0];
    const monthDays = new Set((monthBucket && monthBucket.days) || []);
    const inMonth = d => !mk || monthDays.has(d);
    const prMonthKey = pr => (C.pairingMonthKey ? C.pairingMonthKey(pr, st) : (C.monthOfDay ? C.monthOfDay(pr.start) : null));
    const prInMonth = pr => {
      if (!mk) return true;
      const k = prMonthKey(pr);
      if (k) return k === mk;
      // 跨月兜底：值勤日与活动月有交集即计入列表
      for (let d = pr.start; d < pr.start + pr.ndays; d++) if (monthDays.has(d)) return true;
      return false;
    };
    const hours = (typeof monthHoursFor === 'function')
      ? monthHoursFor(p.id, mk, idx)
      : ((() => { const mh = C.monthHoursOf ? C.monthHoursOf(p, st, idx, null) : null; return (mh && mk) ? (mh[mk] || 0) : (idx.hours[p.id] || 0); })());
    const hoursAll = idx.hours[p.id] || 0;
    const monthLab = (monthBucket && monthBucket.label) || '';

    const violsAll = (sum.violations || []).filter(v => v.pilot === p.id);
    const pairIds = new Set(sched.map(pr => pr.id));
    const pairHardAll = (sum.violations || []).filter(v => v.level === 'hard' && v.pairing && pairIds.has(v.pairing) && (!v.pilot || v.pilot === p.id));
    const violTouchesMonth = v => {
      if (!mk) return true;
      const pr = v.pairing && st.pairings.find(x => x.id === v.pairing);
      if (pr) {
        const ds = C.daysTouched ? C.daysTouched(pr, st) : [];
        if (ds.some(d => monthDays.has(d))) return true;
        if (prInMonth(pr)) return true;
      }
      const m = String(v.msg || '').match(/(\d+)\s*日/);
      if (m && monthDays.has(+m[1])) return true;
      // 月小时类：文案含本月标签或 key
      if (/月飞行|月小时|个人月飞行/.test(String(v.type || '') + String(v.msg || ''))) {
        if (monthLab && String(v.msg || '').includes(monthLab.replace('月', ''))) return true;
        if (String(v.msg || '').includes(mk)) return true;
        // 无更细信息时，月小时违规按活动月展示（硬上限即按桶判）
        if ((v.type || '').includes('月小时') || (v.msg || '').includes('月飞行')) return true;
      }
      return false;
    };
    const hardV = violsAll.filter(v => v.level === 'hard' && violTouchesMonth(v));
    const softV = violsAll.filter(v => v.level === 'soft' && violTouchesMonth(v));
    const pairHard = pairHardAll.filter(violTouchesMonth);
    const hardAll = [];
    const seenH = new Set();
    hardV.concat(pairHard).forEach(v => { const k = v.type + '|' + v.msg; if (seenH.has(k)) return; seenH.add(k); hardAll.push(v); });
    const warnN = softV.length;
    const hardN = hardAll.length;
    // 日历红点用全期违规；KPI 计数用上方 month-scoped hardAll/softV
    const hardAllCal = [];
    const seenHC = new Set();
    violsAll.filter(v => v.level === 'hard').concat(pairHardAll).forEach(v => {
      const k = v.type + '|' + v.msg; if (seenHC.has(k)) return; seenHC.add(k); hardAllCal.push(v);
    });
    const softAllCal = violsAll.filter(v => v.level === 'soft');

    const dayViol = {}; // d → {hard, soft}
    hardAllCal.forEach(v => {
      const pr = v.pairing && st.pairings.find(x => x.id === v.pairing);
      if (pr) C.daysTouched(pr, st).forEach(d => { dayViol[d] = dayViol[d] || { hard: 0, soft: 0 }; dayViol[d].hard++; });
      else {
        const m = String(v.msg || '').match(/(\d+)\s*日/);
        if (m) { const d = +m[1]; dayViol[d] = dayViol[d] || { hard: 0, soft: 0 }; dayViol[d].hard++; }
      }
    });
    softAllCal.forEach(v => {
      const pr = v.pairing && st.pairings.find(x => x.id === v.pairing);
      if (pr) C.daysTouched(pr, st).forEach(d => { dayViol[d] = dayViol[d] || { hard: 0, soft: 0 }; dayViol[d].soft++; });
      else {
        const m = String(v.msg || '').match(/(\d+)\s*日/);
        if (m) { const d = +m[1]; dayViol[d] = dayViol[d] || { hard: 0, soft: 0 }; dayViol[d].soft++; }
      }
    });

    // 每日条目
    const dayItems = {};
    for (let d = 1; d <= C.DAYS; d++) dayItems[d] = [];
    sched.forEach(pr => {
      const slot = ['C', 'F', 'T'].find(s => pr.crew[s] === p.id);
      const role = slot ? C.SLOT_NAME[slot] : '';
      const col = paColor(pr.id);
      pr.legs.forEach(l => {
        const d = Math.floor(l.dep / C.DAY) + 1;
        if (d < 1 || d > C.DAYS) return;
        const h = l.dh ? 0 : (l.arr - l.dep) / 60;
        dayItems[d].push({
          kind: 'fly', pr, role, flt: C.fltLabel(l), from: l.from, to: l.to,
          dep: l.dep, arr: l.arr, h, dh: !!l.dh, reg: l.reg || '', col
        });
      });
    });
    ((st.simHold || {})[p.id] || []).forEach(d => { if (d >= 1 && d <= C.DAYS) dayItems[d].push({ kind: 'hold', label: '提前占位' }); });
    ((st.sim || {})[p.id] || []).forEach(d => {
      if (d < 1 || d > C.DAYS) return;
      if (!((st.simHold || {})[p.id] || []).includes(d)) dayItems[d].push({ kind: 'sim', label: '模拟机' });
    });
    ((st.training || {})[p.id] || []).forEach(d => {
      if (d < 1 || d > C.DAYS) return;
      const k = ((st.trainingKind || {})[p.id] || {})[d];
      dayItems[d].push({ kind: 'tr', label: k || '培训' });
    });
    ((st.control || {})[p.id] || []).forEach(d => { if (d >= 1 && d <= C.DAYS) dayItems[d].push({ kind: 'ctl', label: '控班' }); });
    ((st.standby || {})[p.id] || []).forEach(d => { if (d >= 1 && d <= C.DAYS) dayItems[d].push({ kind: 'sb', label: '备份' }); });
    (p.leave || []).forEach(d => { if (d >= 1 && d <= C.DAYS) dayItems[d].push({ kind: 'lv', label: '休假' }); });

    // 休息间隔（任务/备份前连续休息小时）— 仅活动月
    const dutyIv = C.pilotDutyIntervals(p, st, idx);
    const restRows = [];
    sched.filter(prInMonth).forEach(pr => {
      const t0 = C.report(pr, st);
      const iv = dutyIv.filter(x => x[3] !== pr.id);
      const rh = paMaxRestH(iv, t0);
      const underHard = rh + 1e-9 < hardRest;
      const underSoft = rh + 1e-9 < softH;
      restRows.push({
        label: paPairLabel(pr, 'D' + pr.start + (pr.ndays > 1 ? '–' + (pr.start + pr.ndays - 1) : '')),
        hours: rh, underHard, underSoft, soft: softH, hard: hardRest
      });
    });
    ((st.standby || {})[p.id] || []).filter(inMonth).forEach(d => {
      const t0 = (d - 1) * C.DAY;
      const iv = dutyIv.filter(x => !(x[2] === 'S' && x[3] === 'SB' + d));
      const rh = paMaxRestH(iv, t0);
      restRows.push({
        label: `备份 D${d}`,
        hours: rh, underHard: rh + 1e-9 < hardRest, underSoft: rh + 1e-9 < softH, soft: softH, hard: hardRest
      });
    });
    restRows.sort((a, b) => a.hours - b.hours);
    const restHs = restRows.map(r => r.hours);
    const minRest = restHs.length ? Math.min(...restHs) : null;
    const avgRest = restHs.length ? restHs.reduce((a, b) => a + b, 0) / restHs.length : null;

    // 飞行执勤期 rows — 值勤日落在活动月
    const fdpRows = [];
    let maxFdp = 0, maxFdpLimit = 0;
    sched.forEach(pr => {
      C.fdpDays(pr, st).forEach(dy => {
        if (mk && !inMonth(dy.date)) return;
        maxFdp = Math.max(maxFdp, dy.planFdp || 0);
        if ((dy.planFdp || 0) >= maxFdp) maxFdpLimit = dy.limit;
        const risk = dy.planRisk || 'low';
        const over = (dy.planBuffer || 0) < 0;
        let note = '';
        if (risk === 'over') note = '已超限';
        else if (risk === 'high') note = `延误风险高 · 余 ${dy.planBuffer} 分`;
        else if (risk === 'med') note = `延误风险中 · 余 ${dy.planBuffer} 分`;
        fdpRows.push({
          label: paPairLabel(pr, 'D' + dy.d + '（' + dateOf(dy.date) + '）'),
          fdp: dy.planFdp, limit: dy.limit, buffer: dy.planBuffer, risk, over, note
        });
      });
    });
    fdpRows.sort((a, b) => (b.fdp / Math.max(1, b.limit)) - (a.fdp / Math.max(1, a.limit)));

    // 过夜：活动月内过夜夜数 + 最长连续
    let overnightDays = 0, longestOv = 0, curOv = 0;
    for (let d = 1; d <= C.DAYS; d++) {
      const isOvNight = sched.some(pr => pr.ndays > 1 && d >= pr.start && d <= pr.start + pr.ndays - 2);
      if (isOvNight && inMonth(d)) {
        overnightDays++;
        curOv++; longestOv = Math.max(longestOv, curOv);
      } else if (!isOvNight) curOv = 0;
      else curOv = 0; // 跨出活动月打断连续计数
    }

    const trN = ((st.training || {})[p.id] || []).filter(inMonth).length;
    const sbN = ((st.standby || {})[p.id] || []).filter(inMonth).length;
    const simN = ((st.sim || {})[p.id] || []).filter(inMonth).length;
    const ctlN = ((st.control || {})[p.id] || []).filter(inMonth).length;

    const selDay = ui.auditDay;

    // —— 日期条（请假台芯片样式；按自然月分行）——
    const flyDays = new Set();
    sched.forEach(pr => { for (let d = pr.start; d < pr.start + pr.ndays; d++) if (d >= 1 && d <= C.DAYS) flyDays.add(d); });
    const lvDays = new Set((p.leave || []).filter(d => d >= 1 && d <= C.DAYS));
    const sbDays = new Set(((st.standby || {})[p.id] || []).filter(d => d >= 1 && d <= C.DAYS));
    const pfDays = new Set((p.prefs || []).filter(d => d >= 1 && d <= C.DAYS));
    const simDays = new Set(((st.sim || {})[p.id] || []).filter(d => d >= 1 && d <= C.DAYS));
    const trDays = new Set(((st.training || {})[p.id] || []).filter(d => d >= 1 && d <= C.DAYS));
    const ctlDays = new Set(((st.control || {})[p.id] || []).filter(d => d >= 1 && d <= C.DAYS));
    const holdDays = new Set(((st.simHold || {})[p.id] || []).filter(d => d >= 1 && d <= C.DAYS));

    // —— 日期条：按自然月分行（monthBuckets），芯片样式/图例与请假台一致 ——
    const buckets = buckets0;
    const chipFor = d => {
      const cls = ['lvday'];
      if ([0, 6].includes(dow(d))) cls.push('we');
      if (selDay === d) cls.push('sel');
      if (flyDays.has(d)) cls.push('fly');
      if (lvDays.has(d)) cls.push('lv');
      if (simDays.has(d) || holdDays.has(d)) cls.push('sim');
      if (sbDays.has(d)) cls.push('sb');
      if (pfDays.has(d)) cls.push('pref');
      if (trDays.has(d) || ctlDays.has(d)) cls.push('tr');
      if (!flyDays.has(d) && !lvDays.has(d) && !sbDays.has(d) && !pfDays.has(d) && !simDays.has(d) && !holdDays.has(d) && !trDays.has(d) && !ctlDays.has(d)) cls.push('rest');
      const tip = [
        dateOf(d) + ' 周' + WK[dow(d)],
        flyDays.has(d) ? '有任务' : '',
        lvDays.has(d) ? '请假' : '',
        sbDays.has(d) ? '备份' : '',
        pfDays.has(d) ? '意向休息' : '',
        (simDays.has(d) || holdDays.has(d)) ? '模拟机/占位' : '',
        trDays.has(d) ? '培训' : '',
        ctlDays.has(d) ? '控班' : '',
        (!flyDays.has(d) && !lvDays.has(d) && !sbDays.has(d) && !pfDays.has(d) && !simDays.has(d) && !holdDays.has(d) && !trDays.has(d) && !ctlDays.has(d)) ? '休息' : '',
        (dayViol[d] && dayViol[d].hard) ? '违规' : (dayViol[d] && dayViol[d].soft) ? '预警' : ''
      ].filter(Boolean).join(' · ');
      const mark = dayViol[d] && (dayViol[d].hard || dayViol[d].soft)
        ? '<i class="pa-dmark ' + (dayViol[d].hard ? 'hard' : 'soft') + '"></i>' : '';
      const L = C.dayLabel ? C.dayLabel(d) : { d };
      const lab = L.d; // 日历日（9月=1–30，10月=1–21）；data-d 仍为网格日 1..DAYS
      return '<button type="button" class="' + cls.join(' ') + '" data-d="' + d + '" style="grid-column:' + lab + '" title="' + esc(tip) + '">' + lab + mark + '</button>';
    };
    let dayStrip = '<div class="lvdays-wrap pa-days-wrap"><div id="paDays" class="pa-months">';
    buckets.forEach(b => {
      const d0 = b.days[0], d1 = b.days[b.days.length - 1];
      const L0 = C.dayLabel ? C.dayLabel(d0) : null, L1 = C.dayLabel ? C.dayLabel(d1) : null;
      const span = L0 && L1
        ? (L0.d + '–' + L1.d + '日 · 网格 ' + d0 + '–' + d1)
        : (d0 + '–' + d1);
      const on = b.key === mk ? ' on' : '';
      dayStrip += '<div class="pa-mrow' + on + '" data-mkey="' + esc(b.key || '') + '">'
        + '<button type="button" class="pa-mlab" data-mkey="' + esc(b.key || '') + '" title="' + esc('切换 KPI 口径 · ' + span) + '">' + esc(b.label || '') + '</button>'
        + '<div class="lvdays">' + b.days.map(chipFor).join('') + '</div></div>';
    });
    dayStrip += '</div><div class="lvlegend">'
      + '<span><i class="lvlg fly"></i>有任务</span>'
      + '<span><i class="lvlg lv"></i>请假</span>'
      + '<span><i class="lvlg sb"></i>备份</span>'
      + '<span><i class="lvlg pref"></i>意向休息</span>'
      + '<span><i class="lvlg rest"></i>休息</span>'
      + '<span><i class="lvlg sim"></i>模拟机</span>'
      + '<span><i class="lvlg tr"></i>培训/控班</span>'
      + '<span><i class="lvlg sel"></i>选中日</span>'
      + '<span class="mut">点月名切 KPI · 点日期看当日航段</span>'
      + '</div></div>';

    // —— 任务列表：每个 pairing 标题 + 小表（航班号/航线/时刻/小时）——
    const schedSorted = sched.slice().sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const pairBlocks = schedSorted.length ? schedSorted.map(pr => {
      const a = pr.start, b = pr.start + pr.ndays - 1;
      const dayBit = a === b ? (a + '日') : (a + '–' + b + '日');
      const touchSel = selDay != null && selDay >= a && selDay <= b;
      if (selDay != null && !touchSel) return '';
      const chain = paRouteChain(pr);
      const slot = ['C', 'F', 'T'].find(s => pr.crew[s] === p.id);
      const role = slot ? C.SLOT_NAME[slot] : '';
      const hrs = C.pairingHours(pr).toFixed(1);
      const legs = (pr.legs || []).slice().sort((x, y) => x.dep - y.dep);
      const rows = legs.length ? legs.map(l => {
        const h = l.dh ? 0 : (l.arr - l.dep) / 60;
        return '<tr><td>' + esc(C.fltLabel(l)) + '</td>'
          + '<td>' + esc(paRoute(l.from, l.to)) + '</td>'
          + '<td>' + esc(C.fmtT(l.dep) + '–' + C.fmtT(l.arr)) + '</td>'
          + '<td>' + (l.dh ? '置位' : (h ? h.toFixed(2) + 'h' : '—')) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="mut">无航段</td></tr>';
      return '<div class="pa-pr' + (touchSel ? ' on' : '') + '" data-pid="' + esc(pr.id) + '">'
        + '<div class="pa-prhd"><b>' + pairHtml(pr) + '(' + dayBit + ')</b>'
        + (chain ? ' <span class="mut">' + esc(chain) + '</span>' : '')
        + (role ? ' <span class="pill-lite">' + esc(role) + '</span>' : '')
        + ' <span class="mut">' + hrs + 'h · ' + legs.length + ' 段</span></div>'
        + '<table class="pa-prtab"><tr><th>航班号</th><th>航线</th><th>时刻</th><th>小时</th></tr>' + rows + '</table>'
        + '</div>';
    }).filter(Boolean).join('') : '<div class="mut">本周期无飞行任务</div>';

    const pairSection = '<div class="pa-prs">'
      + (selDay != null
        ? '<div class="pa-prs-hd mut">筛选 · ' + dateOf(selDay) + ' 周' + WK[dow(selDay)] + ' · 点日期条取消</div>'
        : '<div class="pa-prs-hd mut">全部任务 ' + schedSorted.length + ' 个</div>')
      + (pairBlocks || '<div class="mut">当日无飞行任务</div>')
      + '</div>';

    // metric cards — 全部按活动月实时重算（monthHoursOf / monthDays）
    const hCls = hours > caacMonthH ? 'red' : hours > 80 ? 'warnc' : 'okc';
    const monthSeg = buckets.length > 1
      ? `<div class="pa-mseg seg" id="paMonthSeg">${buckets.map(b => `<button type="button" data-pam="${esc(b.key)}" class="${b.key === mk ? 'on' : ''}">${esc(b.label)}</button>`).join('')}${hoursAll && Math.abs(hoursAll - hours) > 0.05 ? `<span class="mut pa-mseg-all">全期 ${hoursAll.toFixed(1)}h</span>` : ''}</div>`
      : '';
    const cards = `
      ${monthSeg}
      <div class="pa-kpis">
        <div class="pa-kpi"><div class="pa-kl">月飞小时${monthLab ? ' · ' + monthLab : ''}</div><div class="pa-kv ${hCls}">${hours.toFixed(1)}<small>/${caacMonthH}h</small></div><div class="pa-ks">CAAC · 公司 ${hardMonth}h</div></div>
        <div class="pa-kpi"><div class="pa-kl">最短 / 平均休息</div><div class="pa-kv">${minRest == null ? '—' : minRest.toFixed(1) + 'h'}<small> / ${avgRest == null ? '—' : avgRest.toFixed(1) + 'h'}</small></div><div class="pa-ks">软≥${softH}h · 硬 ${hardRest}h</div></div>
        <div class="pa-kpi"><div class="pa-kl">最长飞行执勤期</div><div class="pa-kv">${maxFdp ? C.fmtH(maxFdp) : '—'}</div><div class="pa-ks">${maxFdp ? '限 ' + C.fmtH(maxFdpLimit) : (monthLab || '本月') + '无执勤'}</div></div>
        <div class="pa-kpi"><div class="pa-kl">过夜天数</div><div class="pa-kv">${overnightDays}</div><div class="pa-ks">${longestOv ? '最长连续 ' + longestOv + ' 夜' : '无过夜'}</div></div>
        <div class="pa-kpi"><div class="pa-kl">培训·备份·模拟机</div><div class="pa-kv">${trN + sbN + simN}<small> 次</small></div><div class="pa-ks">培${trN} · 备${sbN} · 模${simN}${ctlN ? ' · 控' + ctlN : ''}</div></div>
        <div class="pa-kpi"><div class="pa-kl">硬违规 / 预警</div><div class="pa-kv ${hardN ? 'red' : 'okc'}">${hardN}<small> / ${warnN}</small></div><div class="pa-ks">${monthLab || '本人'}相关</div></div>
      </div>`;

    // detail lists（压缩）
    const restList = restRows.length ? restRows.map(r => {
      const cls = r.underHard ? 'pa-row bad' : r.underSoft ? 'pa-row warn' : 'pa-row';
      const pct = (r.hours / r.soft) * 100;
      const bcls = r.underHard ? 'bad' : r.underSoft ? 'warn' : 'ok';
      return `<div class="${cls}"><div class="pa-rl"><b>${esc(r.label)}</b><span>${r.hours.toFixed(1)}h <span class="mut">/ 软 ${r.soft}h</span></span></div>${paBar(pct, bcls)}</div>`;
    }).join('') : '<div class="mut">本月无执勤间隔</div>';

    const fdpList = fdpRows.length ? fdpRows.map(r => {
      const cls = r.over ? 'pa-row bad' : (r.risk === 'high' || r.risk === 'med') ? 'pa-row warn' : 'pa-row';
      const pct = (r.fdp / Math.max(1, r.limit)) * 100;
      const bcls = r.over ? 'bad' : r.risk === 'high' ? 'warn' : r.risk === 'med' ? 'warn' : 'ok';
      return `<div class="${cls}"><div class="pa-rl"><b>${esc(r.label)}</b><span>${C.fmtH(r.fdp)} / ${C.fmtH(r.limit)}${r.note ? ` <span class="mut">${esc(r.note)}</span>` : ''}</span></div>${paBar(pct, bcls)}</div>`;
    }).join('') : '<div class="mut">本月无飞行执勤期</div>';

    const miscLines = [];
    const listDays = (label, arr) => {
      const ds = (arr || []).filter(inMonth).slice().sort((a, b) => a - b);
      if (!ds.length) return;
      miscLines.push(`<div class="pa-misc"><b>${label}</b> ${ds.length} 次 · ${ds.map(d => dateOf(d)).join('、')}</div>`);
    };
    listDays('培训', (st.training || {})[p.id]);
    listDays('控班', (st.control || {})[p.id]);
    listDays('备份', (st.standby || {})[p.id]);
    listDays('模拟机', (st.sim || {})[p.id]);
    hardAll.forEach(v => miscLines.push(`<div class="pa-misc bad">⚠ ${esc(v.type)}：${esc(v.msg)}</div>`));
    softV.forEach(v => miscLines.push(`<div class="pa-misc warn">◔ ${esc(v.type)}：${esc(v.msg)}</div>`));
    if (!miscLines.length) miscLines.push('<div class="mut">无培训/控班/备份/模拟机，亦无违规项</div>');

    const header = `<div class="pa-head">
      <button type="button" class="btn" id="paBack">← 重选人员</button>
      <div class="pa-title"><b>${esc(p.name)}</b> · ${pill(p.rank)} <span class="mut">${esc(p.id)}</span></div>
      <div class="pa-squad">${esc(p.squad || '—')}</div>
    </div>`;

    $('#main').innerHTML = `${header}
      <div class="panel pa-calwrap lvform"><h3>个人日历 <small>${C.DAYS} 日 · 按月分行 · KPI 口径 ${esc(monthLab || '全期')}</small></h3>${dayStrip}${pairSection}</div>
      ${cards}
      <div class="grid g2 pa-detail">
        <div class="panel"><h3>休息间隔 <small>软 ${softH}h · 硬 ${hardRest}h</small></h3><div class="pa-list">${restList}</div></div>
        <div class="panel"><h3>飞行执勤期 <small>相对日限制</small></h3><div class="pa-list">${fdpList}</div></div>
      </div>
      <div class="grid g2 pa-detail">
        <div class="panel"><h3>过夜</h3><div class="pa-ov">共 <b>${overnightDays}</b> 天${longestOv ? ` · 最长连续 <b>${longestOv}</b> 夜` : ''}</div></div>
        <div class="panel"><h3>培训 / 控班 / 备份 / 模拟机</h3><div class="pa-list">${miscLines.join('')}</div></div>
      </div>`;

    $('#paBack').onclick = () => closePersonAudit();
    const applyMonth = key => {
      if (!key || key === ui.auditMonth) {
        // 同月再点：仅清除日筛选，KPI 仍留在该月
        if (key === ui.auditMonth && ui.auditDay != null) { ui.auditDay = null; rPersonAudit(); return; }
      }
      ui.auditMonth = key;
      if (typeof setUiMonth === 'function') setUiMonth(key);
      else ui.ovMonth = key;
      if (ui.auditDay != null && C.monthOfDay && C.monthOfDay(ui.auditDay) !== key) ui.auditDay = null;
      rPersonAudit();
    };
    document.querySelectorAll('#paDays .pa-mlab').forEach(el => {
      el.onclick = e => { e.preventDefault(); e.stopPropagation(); applyMonth(el.dataset.mkey); };
    });
    document.querySelectorAll('#paMonthSeg button').forEach(b => {
      b.onclick = () => applyMonth(b.dataset.pam);
    });
    document.querySelectorAll('#paDays .lvday').forEach(el => {
      el.onclick = () => {
        const d = +el.dataset.d;
        const next = ui.auditDay === d ? null : d;
        ui.auditDay = next;
        if (next != null && C.monthOfDay) {
          const km = C.monthOfDay(next);
          if (km && km !== ui.auditMonth) {
            ui.auditMonth = km;
            if (typeof setUiMonth === 'function') setUiMonth(km);
            else ui.ovMonth = km;
          }
        }
        rPersonAudit();
      };
    });
  }
