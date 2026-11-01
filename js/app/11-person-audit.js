/* 机组排班助手 - 单人合规审计页（人员视图点姓名整页切换） */
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
  function paIata(c) { return PA_IATA[c] || (c && c.length === 4 ? c.slice(1) : (c || '')); }
  function paRoute(from, to) { return paIata(from) + '-' + paIata(to); }

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
    tab = 'gantt';
    location.hash = 'gantt';
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
    tab = 'gantt';
    location.hash = 'gantt';
    render();
  }

  function paBar(pct, cls) {
    const w = Math.max(0, Math.min(100, pct));
    return `<div class="pa-bar"><i class="${cls || ''}" style="width:${w.toFixed(1)}%"></i></div>`;
  }

  function rPersonAudit() {
    const pid = ui.auditPid;
    const p = st.pilots.find(x => x.id === pid);
    if (!p) { ui.auditPid = null; return rGantt(); }
    applyCompact();
    document.body.classList.add('pa-on');
    document.body.classList.remove('g-compact', 'g-fullon');

    const idx = C.buildIndex(st);
    const S = st.settings;
    const softH = +(S.softRest48H != null ? S.softRest48H : 60);
    const hardRest = 48;
    const caacMonthH = 90; // 展示口径：CAAC 硬月 90h（卡片）；公司 hardMaxHours 另计
    const hardMonth = C.pilotHardCap ? C.pilotHardCap(p, st) : (S.hardMaxHours || 100);
    const hours = idx.hours[p.id] || 0;
    const sched = idx.sched[p.id] || [];
    const viols = (sum.violations || []).filter(v => v.pilot === p.id);
    const hardV = viols.filter(v => v.level === 'hard');
    const softV = viols.filter(v => v.level === 'soft');
    // 无 pilot 字段但 pairing 落在此人任务上的硬违规（搭配等）
    const pairIds = new Set(sched.map(pr => pr.id));
    const pairHard = (sum.violations || []).filter(v => v.level === 'hard' && v.pairing && pairIds.has(v.pairing) && (!v.pilot || v.pilot === p.id));
    const hardAll = [];
    const seenH = new Set();
    hardV.concat(pairHard).forEach(v => { const k = v.type + '|' + v.msg; if (seenH.has(k)) return; seenH.add(k); hardAll.push(v); });
    const warnN = softV.length;
    const hardN = hardAll.length;

    const dayViol = {}; // d → {hard, soft}
    hardAll.forEach(v => {
      const pr = v.pairing && st.pairings.find(x => x.id === v.pairing);
      if (pr) C.daysTouched(pr, st).forEach(d => { dayViol[d] = dayViol[d] || { hard: 0, soft: 0 }; dayViol[d].hard++; });
      else {
        const m = String(v.msg || '').match(/(\d+)\s*日/);
        if (m) { const d = +m[1]; dayViol[d] = dayViol[d] || { hard: 0, soft: 0 }; dayViol[d].hard++; }
      }
    });
    softV.forEach(v => {
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
      pr.legs.forEach(l => {
        const d = Math.floor(l.dep / C.DAY) + 1;
        if (d < 1 || d > C.DAYS) return;
        const h = l.dh ? 0 : (l.arr - l.dep) / 60;
        dayItems[d].push({
          kind: 'fly', pr, role, flt: C.fltLabel(l), from: l.from, to: l.to,
          dep: l.dep, arr: l.arr, h, dh: !!l.dh, reg: l.reg || ''
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

    // 休息间隔（任务/备份前连续休息小时）
    const dutyIv = C.pilotDutyIntervals(p, st, idx);
    const restRows = [];
    sched.forEach(pr => {
      const t0 = C.report(pr, st);
      const iv = dutyIv.filter(x => x[3] !== pr.id);
      const rh = paMaxRestH(iv, t0);
      const underHard = rh + 1e-9 < hardRest;
      const underSoft = rh + 1e-9 < softH;
      restRows.push({
        label: `${pr.id} · D${pr.start}` + (pr.ndays > 1 ? `–${pr.start + pr.ndays - 1}` : ''),
        hours: rh, underHard, underSoft, soft: softH, hard: hardRest
      });
    });
    ((st.standby || {})[p.id] || []).forEach(d => {
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

    // 飞行执勤期 rows
    const fdpRows = [];
    let maxFdp = 0, maxFdpLimit = 0;
    sched.forEach(pr => {
      C.fdpDays(pr, st).forEach(dy => {
        maxFdp = Math.max(maxFdp, dy.planFdp || 0);
        if ((dy.planFdp || 0) >= maxFdp) maxFdpLimit = dy.limit;
        const risk = dy.planRisk || 'low';
        const over = (dy.planBuffer || 0) < 0;
        let note = '';
        if (risk === 'over') note = '已超限';
        else if (risk === 'high') note = `延误风险高 · 余 ${dy.planBuffer} 分`;
        else if (risk === 'med') note = `延误风险中 · 余 ${dy.planBuffer} 分`;
        fdpRows.push({
          label: `${pr.id} · D${dy.d}（${dateOf(dy.date)}）`,
          fdp: dy.planFdp, limit: dy.limit, buffer: dy.planBuffer, risk, over, note
        });
      });
    });
    fdpRows.sort((a, b) => (b.fdp / Math.max(1, b.limit)) - (a.fdp / Math.max(1, a.limit)));

    // 过夜：仅天数 + 最长连续过夜段
    const per = (sum.per || []).find(x => x.id === p.id);
    const overnightDays = per ? per.overnights : sched.reduce((s, pr) => s + Math.max(0, pr.ndays - 1), 0);
    let longestOv = 0, curOv = 0;
    for (let d = 1; d <= C.DAYS; d++) {
      // 过夜夜 = 多日任务中非末日
      const isOvNight = sched.some(pr => pr.ndays > 1 && d >= pr.start && d <= pr.start + pr.ndays - 2);
      if (isOvNight) { curOv++; longestOv = Math.max(longestOv, curOv); }
      else curOv = 0;
    }

    const trN = ((st.training || {})[p.id] || []).length;
    const sbN = ((st.standby || {})[p.id] || []).length;
    const simN = ((st.sim || {})[p.id] || []).length;
    const ctlN = ((st.control || {})[p.id] || []).length;

    const selDay = ui.auditDay;

    // —— 日历 ——
    let cal = `<div class="pa-cal"><div class="pa-cal-hd">`;
    ['日', '一', '二', '三', '四', '五', '六'].forEach(w => { cal += `<div class="pa-wd">${w}</div>`; });
    cal += '</div><div class="pa-cal-bd">';
    // Nov 1 2026 = Sunday → pad 0
    const firstDow = new Date(C.YEAR, C.MONTH - 1, 1).getDay();
    for (let i = 0; i < firstDow; i++) cal += '<div class="pa-cell empty"></div>';
    for (let d = 1; d <= C.DAYS; d++) {
      const items = dayItems[d];
      const dv = dayViol[d];
      const mark = dv && (dv.hard || dv.soft) ? `<span class="pa-mark ${dv.hard ? 'hard' : 'soft'}" title="${dv.hard ? '违规' : '预警'}"></span>` : '';
      const we = [0, 6].includes(dow(d)) ? ' we' : '';
      const on = selDay === d ? ' on' : '';
      let body = '';
      const flies = items.filter(x => x.kind === 'fly');
      const tags = items.filter(x => x.kind !== 'fly');
      if (flies.length) {
        // group by pairing for compact multi-leg
        const byPr = {};
        flies.forEach(f => { (byPr[f.pr.id] = byPr[f.pr.id] || []).push(f); });
        Object.keys(byPr).forEach(pid0 => {
          const ls = byPr[pid0];
          const hSum = ls.reduce((s, x) => s + x.h, 0);
          body += `<div class="pa-leg">`;
          ls.forEach(f => {
            body += `<div class="pa-flt"><b>${esc(f.flt)}</b> ${paRoute(f.from, f.to)}`
              + `<span class="mut"> ${C.fmtT(f.dep)}-${C.fmtT(f.arr)}</span>`
              + (f.h ? ` <span class="pa-h">${f.h.toFixed(1)}h</span>` : '')
              + `</div>`;
          });
          if (ls.length > 1 && hSum) body += `<div class="mut pa-sum">当日 ${hSum.toFixed(1)}h · ${esc(ls[0].role || '')}</div>`;
          else if (ls[0].role) body += `<div class="mut pa-sum">${esc(ls[0].role)}</div>`;
          body += `</div>`;
        });
      }
      tags.forEach(t => { body += `<div class="pa-tag t-${t.kind}">${esc(t.label)}</div>`; });
      if (!flies.length && !tags.length) {
        const kind = C.personalDayKind(st, p, d, idx);
        if (kind === '休息' || kind === '意向休息') body += `<div class="pa-tag t-rest">${kind === '意向休息' ? '意向休息' : '休息'}</div>`;
        else body += `<div class="pa-tag t-rest">休息</div>`;
      }
      cal += `<div class="pa-cell${we}${on}${dv && dv.hard ? ' viol' : dv && dv.soft ? ' warn' : ''}" data-day="${d}">`
        + `<div class="pa-d">${d}${mark}</div>${body}</div>`;
    }
    cal += '</div></div>';

    // day detail panel
    let dayPanel = '';
    if (selDay) {
      const items = dayItems[selDay] || [];
      const rows = items.length ? items.map(it => {
        if (it.kind === 'fly') {
          return `<tr><td>${esc(it.pr.id)}</td><td>${esc(it.flt)}</td><td>${paRoute(it.from, it.to)}</td>`
            + `<td>${esc(it.role || '')}</td><td>${C.fmtT(it.dep)}–${C.fmtT(it.arr)}</td>`
            + `<td>${it.h ? it.h.toFixed(2) + 'h' : (it.dh ? '置位' : '—')}</td></tr>`;
        }
        return `<tr class="pa-nf"><td colspan="2">${esc(it.label)}</td><td colspan="4" class="mut">非飞任务</td></tr>`;
      }).join('') : '<tr><td colspan="6" class="mut">当日无任务</td></tr>';
      const dv = dayViol[selDay];
      const vnote = dv ? `<span class="${dv.hard ? 'red' : 'warnc'}">${dv.hard ? '违规 ' + dv.hard : ''}${dv.hard && dv.soft ? ' · ' : ''}${dv.soft ? '预警 ' + dv.soft : ''}</span>` : '';
      dayPanel = `<div class="panel pa-daypanel"><h3>${C.YEAR}-${String(C.MONTH).padStart(2, '0')}-${String(selDay).padStart(2, '0')} 周${WK[dow(selDay)]} 任务明细 ${vnote}</h3>
        <table class="tftab pa-dtab"><tr><th>任务</th><th>航班</th><th>航线</th><th>角色</th><th>时刻</th><th>小时</th></tr>${rows}</table></div>`;
    }

    // metric cards
    const hCls = hours > caacMonthH ? 'red' : hours > 80 ? 'warnc' : 'okc';
    const cards = `
      <div class="pa-kpis">
        <div class="pa-kpi"><div class="pa-kl">月飞小时</div><div class="pa-kv ${hCls}">${hours.toFixed(1)}<small>/${caacMonthH}h</small></div><div class="pa-ks">CAAC 硬上限 · 公司 ${hardMonth}h</div></div>
        <div class="pa-kpi"><div class="pa-kl">最短 / 平均休息</div><div class="pa-kv">${minRest == null ? '—' : minRest.toFixed(1) + 'h'}<small> / ${avgRest == null ? '—' : avgRest.toFixed(1) + 'h'}</small></div><div class="pa-ks">软目标 ≥${softH}h · 硬底 ${hardRest}h</div></div>
        <div class="pa-kpi"><div class="pa-kl">最长飞行执勤期</div><div class="pa-kv">${maxFdp ? C.fmtH(maxFdp) : '—'}</div><div class="pa-ks">${maxFdp ? '相对限制 ' + C.fmtH(maxFdpLimit) : '本月无执勤'}</div></div>
        <div class="pa-kpi"><div class="pa-kl">过夜天数</div><div class="pa-kv">${overnightDays}</div><div class="pa-ks">${longestOv ? '最长连续 ' + longestOv + ' 夜' : '无过夜'}</div></div>
        <div class="pa-kpi"><div class="pa-kl">培训·备份·模拟机</div><div class="pa-kv">${trN + sbN + simN}<small> 次</small></div><div class="pa-ks">培训 ${trN} · 备份 ${sbN} · 模拟机 ${simN}${ctlN ? ' · 控班 ' + ctlN : ''}</div></div>
        <div class="pa-kpi"><div class="pa-kl">硬违规 / 预警</div><div class="pa-kv ${hardN ? 'red' : 'okc'}">${hardN}<small> / ${warnN}</small></div><div class="pa-ks">本人相关校验项</div></div>
      </div>`;

    // detail lists
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

    // 培训/控班/备份/模拟机 compact + violations mixed
    const miscLines = [];
    const listDays = (label, arr) => {
      const ds = (arr || []).slice().sort((a, b) => a - b);
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
      <button type="button" class="btn" id="paBack">← 返回人员视图</button>
      <div class="pa-title"><b>${esc(p.name)}</b> · ${pill(p.rank)} <span class="mut">${esc(p.id)}</span></div>
      <div class="pa-squad">${esc(p.squad || '—')}</div>
    </div>`;

    $('#main').innerHTML = `${header}
      <div class="panel pa-calwrap"><h3>${C.YEAR}年${C.MONTH}月 · 个人日历 <small>单元格内嵌航班；红点=违规/预警 · 点击日期展开明细</small></h3>${cal}</div>
      ${dayPanel}
      ${cards}
      <div class="grid g2">
        <div class="panel"><h3>休息间隔 <small>相对软目标 ${softH}h · 硬底 ${hardRest}h</small></h3><div class="pa-list">${restList}</div></div>
        <div class="panel"><h3>飞行执勤期 <small>相对日限制</small></h3><div class="pa-list">${fdpList}</div></div>
      </div>
      <div class="grid g2">
        <div class="panel"><h3>过夜</h3><div class="pa-ov">共 <b>${overnightDays}</b> 天${longestOv ? ` · 最长连续 <b>${longestOv}</b> 夜` : ''}</div></div>
        <div class="panel"><h3>培训 / 控班 / 备份 / 模拟机</h3><div class="pa-list">${miscLines.join('')}</div></div>
      </div>`;

    $('#paBack').onclick = () => closePersonAudit();
    document.querySelectorAll('.pa-cell[data-day]').forEach(el => {
      el.onclick = () => {
        const d = +el.dataset.day;
        ui.auditDay = ui.auditDay === d ? null : d;
        rPersonAudit();
      };
    });
  }
