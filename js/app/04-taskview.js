/* 机组排班助手 - 界面 · taskview.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ================= CrewOps 风格：侧边栏 / 任务视图（卡片+抽屉）/ 总览大屏 =================
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const wdOf = d => WD[new Date(2026, 10, d).getDay()];
  const SLOTS = [['早班', 0, 9], ['上午', 9, 12], ['下午', 12, 17], ['晚间', 17, 24]];
  const hm = m => C.fmtT(m);
  function legsOnDay(pr, d) { return pr.legs.filter(l => Math.floor(l.dep / 1440) + 1 === d); }
  function prStatus(pr, V, rk) { const full = pr.crew.C && pr.crew.F && pr.crew.T;
    if (!full) return ['缺员', 'b-hole']; if (V[pr.id]) return ['违规', 'b-viol']; if (rk && ['over', 'high', 'med'].includes(rk)) return ['风险', 'b-risk']; return ['正常', 'b-ok']; }
  function routeHtml(ls) { if (!ls.length) return ''; return [ls[0].from].concat(ls.map(l => l.to)).map(apHtml).join(' → '); }
  function dayIndex() { // 每日：任务、问题
    const V = violByPairing(); const D = []; for (let d = 1; d <= C.DAYS; d++) D[d] = { prs: [], issue: 0 };
    st.pairings.forEach(pr => { const rk = C.pairingRisk(pr, st).risk; const stt = prStatus(pr, V, rk);
      const days = new Set(pr.legs.map(l => Math.floor(l.dep / 1440) + 1));
      days.forEach(d => { if (D[d]) { D[d].prs.push({ pr, rk, stt }); if (stt[0] !== '正常') D[d].issue++; } }); });
    return { D, V };
  }
  function kpiCard(icon, lab, val, sub, cls) { return `<div class="okpi"><div class="okpi-l"><span class="okpi-i">${icon}</span>${lab}</div><div class="okpi-v ${cls || ''}">${val}</div><div class="okpi-s">${sub}</div></div>`; }
  function rTasks() {
    const t0 = performance.now(); const m = pm(); const { D, V } = dayIndex();
    const d = ui.tday = Math.min(C.DAYS, Math.max(1, ui.tday || 1));
    const hardN = sum.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length, softN = sum.soft, infoN = sum.info;
    const riskN = st.pairings.filter(pr => ['over', 'high', 'med'].includes(C.pairingRisk(pr, st).risk)).length;
    const fly = sum.per.filter(x => x.hours > 0.5); const avg = fly.length ? fly.reduce((a, x) => a + x.hours, 0) / fly.length : 0;
    let h = `<div class="cw"><div class="cw-head"><div><h2>任务视图</h2><div class="mut">${st.pairings.length} 个任务 · 按日/时段查看 · 点击卡片查看详情</div></div>
      <div class="cw-acts"><button class="btn primary" data-auto="1">⚡ 调整排班</button></div></div>
      <div class="okpis">${kpiCard('◎', '满员率', (sum.coverage * 100).toFixed(1) + '%', `${st.pairings.length} 个任务 · ${sum.full === sum.total ? '全部已覆盖' : '缺员 ' + (sum.total - sum.full)}`, sum.coverage >= 0.99 ? 'okc' : 'warnc')}
        ${kpiCard('⚠', '硬性违规', hardN, `软性 ${softN} · 提示 ${infoN}`, hardN ? 'red' : 'okc')}
        ${kpiCard('◷', '需关注风险', riskN || '—', riskN ? 'FDP 中/高风险任务' : 'FDP 余量均充足')}
        ${kpiCard('♙', '可排人员平均工时', avg.toFixed(1) + 'h', `${sum.all.min.toFixed(1)}–${sum.all.max.toFixed(1)}h · 基尼 ${sum.all.gini.toFixed(3)}`)}</div>
      <div class="dstrip">${Array.from({ length: C.DAYS }, (_, i) => i + 1).map(k => `<button class="dchip ${k === d ? 'cur' : ''} ${['六', '日'].includes(wdOf(k)) ? 'we' : ''}" data-day="${k}"><b>${String(k).padStart(2, '0')}</b><small>周${wdOf(k)}</small><small>${D[k].prs.length} 任务</small>${D[k].issue ? `<i class="ddot" title="${D[k].issue} 项需处理"></i>` : ''}</button>`).join('')}</div>`;
    let items = D[d].prs; const sbs = Object.entries(st.standby || {}).filter(([, ds]) => (ds || []).includes(d)).map(([id]) => m[id]).filter(Boolean);
    const crewN = items.reduce((a, x) => a + ['C', 'F', 'T'].filter(s => x.pr.crew[s]).length, 0);
    const holeN = items.filter(x => x.stt[0] === '缺员').length, rN = items.filter(x => x.stt[0] === '风险' || x.stt[0] === '违规').length;
    const spN = items.filter(x => C.specialAirportsOf(x.pr, st).length).length; const att = items.filter(x => x.stt[0] !== '正常');
    if (ui.needOnly) items = att;
    h += `<div class="dsum"><b>${dateOf(d)} 周${wdOf(d)}</b><span>任务 <b>${D[d].prs.length}</b></span><span>已排机组 <b>${crewN}</b> 人次</span><span>缺员 <b class="${holeN ? 'red' : ''}">${holeN}</b></span><span>风险 <b class="${rN ? 'warnc' : ''}">${rN}</b></span><span>特殊机场 <b>${spN}</b></span>
      <button class="tog ${ui.needOnly ? 'on' : ''}" id="needOnly">只看需处理 <span class="pillc">${att.length}</span></button></div><div class="tcols">`;
    for (const [nm, a, b] of SLOTS) {
      const col = items.filter(x => { const ls = legsOnDay(x.pr, d); const t = ((ls[0].dep % 1440) + 1440) % 1440 / 60; return t >= a && t < b; }).sort((x, y) => legsOnDay(x.pr, d)[0].dep - legsOnDay(y.pr, d)[0].dep);
      h += `<div class="tcol"><div class="tcol-h">${nm} <span class="mut">${String(a).padStart(2, '0')}–${String(b).padStart(2, '0')}</span><span class="pillc">${col.length}</span></div>`;
      if (!col.length) h += '<div class="tempty">这个时段没有任务</div>';
      for (const { pr, stt } of col) {
        const ls = legsOnDay(pr, d); const k = ls[0].d; const dy = C.fdpDays(pr, st).find(x => x.d === k);
        const chips = ['C', 'F', 'T'].map(s => { const p = m[pr.crew[s]]; return p ? `<span class="cchip s${s}">${esc(p.name)}<small>${esc(p.rank)}</small></span>` : `<span class="cchip hole">${C.SLOT_NAME[s]}位空缺</span>`; }).join('');
        h += `<div class="tcard ${stt[1]}" data-card="${pr.id}"><div class="tc-h"><b>${pr.id}</b><span class="badge ${stt[1]}">${stt[0]}</span><span class="tc-t">${hm(ls[0].dep)}</span></div>
          <div class="tc-r">${routeHtml(ls)}</div>
          <div class="tc-m">D${k}/${pr.ndays} · ${ls.length} 段 · ${(ls.reduce((a, l) => a + l.arr - l.dep, 0) / 60).toFixed(1)}h · ${pr.ac} · ${hm(ls[0].dep)}–${hm(ls[ls.length - 1].arr)}</div>
          <div class="tc-c">${chips}</div>
          <div class="tc-f">${dy ? `<span class="rdot r-${dy.planRisk}"></span>FDP ${C.fmtH(dy.planFdp)} / ${C.fmtH(dy.limit)} · 余 ${dy.planBuffer} 分` : 'FDP —'}</div></div>`;
      }
      h += '</div>';
    }
    h += `<div class="tcol side"><div class="sbox"><div class="tcol-h">当日备份 <span class="pillc">${sbs.length} 人</span></div>${sbs.length ? `<div class="tc-c">${sbs.map(p => `<span class="cchip">${esc(p.name)}<small>${esc(p.rank)}</small></span>`).join('')}</div>` : '<div class="tempty">当日没有备份</div>'}<div class="mut sm">备份被调用后，该日备份数量会减少；应用方案前会重新校验。</div></div>
      <div class="sbox"><div class="tcol-h">需要关注 <span class="pillc">${att.length}</span></div>${att.length ? att.map(({ pr, stt }) => `<div class="attn" data-card="${pr.id}"><span class="badge ${stt[1]}">${stt[0]}</span><b>${pr.id}</b><span class="mut">${esc((V[pr.id] || [stt[0] === '缺员' ? '缺 ' + ['C', 'F', 'T'].filter(s => !pr.crew[s]).map(s => C.SLOT_NAME[s]).join('/') : 'FDP 余量偏紧'])[0]).slice(0, 60)}</span></div>`).join('') : '<div class="tempty">当日没有需要关注的任务</div>'}</div></div></div></div>`;
    $('#main').innerHTML = h;
    document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { ui.tday = +b.dataset.day; rTasks(); });
    $('#needOnly').onclick = () => { ui.needOnly = !ui.needOnly; rTasks(); };
    document.querySelectorAll('[data-card]').forEach(c => c.onclick = () => openDrawer(c.dataset.card));
    ui.lastRenderMs = Math.round(performance.now() - t0);
  }
  function closeDrawer() { const dw = $('#drawer'); if (dw) dw.classList.add('hidden'); }
  function fmtBuf(v) { const n = Math.abs(Math.round(v)); return (v < 0 ? '-' : '') + Math.floor(n / 60) + 'h' + String(n % 60).padStart(2, '0') + 'm'; }
  function openDrawer(id, mode) {
    const pr = st.pairings.find(p => p.id === id); if (!pr) return; const m = pm(); const idx = C.buildIndex(st);
    $('#tip') && $('#tip').classList.add('hidden');
    const fd = C.fdpDays(pr, st); const minBuf = fd.length ? Math.min(...fd.map(x => x.planBuffer)) : null; const sp = C.specialAirportsOf(pr, st);
    const RK = { low: ['ok', 'ok'], med: ['tight', 'tight'], high: ['risk', 'risk'], over: ['超限', 'risk'] };
    const rule = sp.length ? (sp.some(c => C.isPlateauAirport && C.isPlateauAirport(c, st)) ? '高原' : '特殊机场') : '常规';
    const tile = (l, v, cls, t) => `<div class="dtile"${t ? ` title="${esc(t)}"` : ''}><small>${l}</small><b class="${cls || ''}">${v}</b></div>`;
    const cityChain = pr.legs.length ? [pr.legs[0].from].concat(pr.legs.map(l => l.to)).map(c => esc(C.apName(c, st))).join(' → ') : '';
    const bufCls = minBuf == null ? '' : minBuf < 0 ? 'red' : minBuf < (st.settings.fdpRiskHigh || 60) ? 'red' : minBuf < (st.settings.fdpRiskMed || 120) ? 'warnc' : 'okc';
    const spNotes = [...new Set(pr.legs.flatMap(l => [l.from, l.to]).filter(c => C.isSpecial(c, st)))].map(c => `${esc(C.apName(c, st))}(${c})：${esc(C.CAT_DESC[C.apCat(c, st)] || '特殊机场')}`);
    const head = `<div class="drw-h"><div><h3>${pr.id}${fillBadge(pr.id)}${demoTag(pr)}</h3><div class="mut">${cityChain}</div></div><button class="btn drw-x" id="drwX" title="关闭">✕</button></div>`;
    const view = `<div class="drw-b"><div class="dtiles">${tile('日期', dateOf(pr.start) + (pr.ndays > 1 ? '–' + dateOf(pr.start + pr.ndays - 1) : ''))}${tile('天数', pr.ndays + ' 天')}${tile('飞行小时', C.pairingHours(pr).toFixed(1) + 'h')}${tile('机型', esc(pr.ac))}${tile('FDP 余量', minBuf == null ? '—' : fmtBuf(minBuf), bufCls, '各值勤日 (限制 − 计划FDP) 的最小值')}${tile('规则', rule, sp.length ? 'red' : '', sp.map(c => C.apName(c, st)).join('、'))}</div>
      <h4>机组</h4>${['C', 'F', 'T'].map(s => { const p = m[pr.crew[s]]; return `<div class="drow ${p ? '' : 'vac'}"><span class="seat s-${s}">${({ C: '机长', F: '副驾驶', T: '观察员' })[s]}</span>${p ? `<b>${esc(p.name)}</b>${pill(p.rank)}<span class="hrs">${(idx.hours[p.id] || 0).toFixed(1)}h</span>` : '<b class="red">空缺</b><span class="mut">待补位 · 点「调整机组」选择候选人</span>'}</div>`; }).join('')}
      <h4>航段</h4><table class="dtab"><tr><th>日</th><th>航班</th><th>航段</th><th>计划</th><th>机型/机号</th></tr>${pr.legs.map(l => `<tr><td>D${l.d}</td><td>${esc(l.flt)}</td><td>${apHtml(l.from)} → ${apHtml(l.to)}</td><td>${C.fmtT(l.dep)}–${C.fmtT(l.arr)}</td><td>${esc(l.ac || pr.ac)}<span class="mut"> ${esc(l.reg || '')}</span></td></tr>`).join('')}</table>
      ${spNotes.length ? `<div class="note red">特殊机场：${spNotes.join('；')}，执行左右座均需持有该机场授权</div>` : ''}
      <h4>FDP</h4><table class="dtab"><tr><th>值勤日</th><th>FDP / 限制</th><th>余量</th><th>风险</th></tr>${fd.map(dy => `<tr><td>D${dy.d} · ${dateOf(dy.date)}</td><td>${C.fmtH(dy.planFdp)} / ${C.fmtH(dy.limit)}</td><td>${fmtBuf(dy.planBuffer)}</td><td><span class="rbadge rb-${RK[dy.planRisk][1]}">${RK[dy.planRisk][0]}</span></td></tr>`).join('')}</table>
      <div class="mut sm">FDP = 首段前报到 ${st.settings.reportMin || 60} 分 → 末段落地（计划时刻）；限制按规则表（报到时刻 × 航段数）。</div></div>
      <div class="drw-f"><button class="btn" id="drwC">关闭</button><button class="btn primary" id="drwE">⚙ 调整机组</button></div>`;
    let dw = $('#drawer'); if (!dw) { dw = document.createElement('div'); dw.id = 'drawer'; document.body.appendChild(dw); }
    dw.innerHTML = `<div class="drw-mask"></div><aside class="drw">${head}${view}</aside>`; dw.classList.remove('hidden');
    $('#drwX').onclick = closeDrawer; $('#drwC').onclick = closeDrawer; dw.querySelector('.drw-mask').onclick = closeDrawer;
    $('#drwE').onclick = () => { const b = dw.querySelector('.drw-b'); const aside = dw.querySelector('.drw'); dw.querySelector('.drw-f').remove(); b.classList.add('edit'); if (aside) aside.classList.add('wide'); editInto(id, b); };
    if (mode === 'edit') $('#drwE').click();
  }
  // ---- SVG 小部件 ----
  const PAL = ['#4f8cff', '#21c7a8', '#f5a524', '#8b6cf6', '#ef5d6c', '#3cc4f0', '#c7d0e0'];
  function spark(vals, color) { const n = vals.length; if (!n) return ''; const mx = Math.max(...vals, 1e-9), mn = Math.min(...vals, 0); const W = 200, H = 40;
    const pts = vals.map((v, i) => [i / Math.max(1, n - 1) * W, H - 3 - (v - mn) / Math.max(1e-9, mx - mn) * (H - 8)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d} L${W} ${H} L0 ${H}Z" fill="${color}" opacity=".14"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg>`; }
  function donut(items, center, sub) { const tot = items.reduce((a, x) => a + x[1], 0) || 1; let a0 = -Math.PI / 2; const R = 54, r = 36, cx = 70, cy = 70;
    const arcs = items.map((x, i) => { const a1 = a0 + x[1] / tot * Math.PI * 2; const lg = a1 - a0 > Math.PI ? 1 : 0; const p = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)].map(v => v.toFixed(2)).join(' ');
      const d = x[1] / tot >= 0.9999 ? `M${cx} ${cy - R}A${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R}L${cx - 0.01} ${cy - r}A${r} ${r} 0 1 0 ${cx} ${cy - r}Z` : `M${p(a0, R)}A${R} ${R} 0 ${lg} 1 ${p(a1, R)}L${p(a1, r)}A${r} ${r} 0 ${lg} 0 ${p(a0, r)}Z`; a0 = a1;
      return x[1] ? `<path d="${d}" fill="${x[2] || PAL[i % PAL.length]}"><title>${esc(x[0])} ${x[1]}</title></path>` : ''; }).join('');
    const leg = items.map((x, i) => `<div><i style="background:${x[2] || PAL[i % PAL.length]}"></i>${esc(x[0])}<b>${typeof x[1] === 'number' && x[1] % 1 ? x[1].toFixed(0) : x[1]}</b><span class="mut">${(x[1] / tot * 100).toFixed(1)}%</span></div>`).join('');
    return `<div class="donut"><svg viewBox="0 0 140 140">${arcs}<text x="70" y="68" text-anchor="middle" class="dc1">${center}</text><text x="70" y="86" text-anchor="middle" class="dc2">${sub}</text></svg><div class="dleg">${leg}</div></div>`; }
  function areaChart(series, labels) { const W = 560, H = 190, P = 26; const n = labels.length; const mx = Math.max(1, ...series.flatMap(s => s.v));
    const x = i => P + i / Math.max(1, n - 1) * (W - P - 8), y = v => H - 18 - v / mx * (H - 34);
    let g = ''; for (let k = 0; k <= 4; k++) { const yy = y(mx * k / 4); g += `<line x1="${P}" x2="${W - 8}" y1="${yy}" y2="${yy}" class="gl"/><text x="${P - 4}" y="${yy + 3}" text-anchor="end" class="ax">${Math.round(mx * k / 4)}</text>`; }
    labels.forEach((l, i) => { if (i % 5 === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 4}" text-anchor="middle" class="ax">${l}</text>`; });
    const paths = series.map(s => { const d = s.v.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(''); return `<path d="${d} L${x(n - 1)} ${H - 18} L${x(0)} ${H - 18}Z" fill="${s.c}" opacity=".12"/><path d="${d}" fill="none" stroke="${s.c}" stroke-width="2"/>`; }).join('');
    return `<svg class="area" viewBox="0 0 ${W} ${H}">${g}${paths}</svg><div class="dleg row">${series.map(s => `<div><i style="background:${s.c}"></i>${s.n}</div>`).join('')}</div>`; }
  function rOverview() {
    const t0 = performance.now(); const m = pm(); const idx = C.buildIndex(st); const om = C.opsMetrics(st); const ds = C.dayStatus(st, idx); const N = st.pilots.length;
    const days = Array.from({ length: C.DAYS }, (_, i) => i + 1);
    const V = violByPairing(); const onDay = d => st.pairings.filter(pr => pr.start <= d && pr.start + pr.ndays - 1 >= d);
    const cov = days.map(d => { const a = onDay(d); return a.length ? a.filter(p => p.crew.C && p.crew.F && p.crew.T).length / a.length * 100 : 100; });
    const vio = days.map(d => onDay(d).filter(p => V[p.id]).length);
    const holes = days.map(d => onDay(d).filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length);
    const duty = days.map(d => st.pilots.filter(p => ds[p.id][d] === 'D').length);
    const sb = days.map(d => Object.values(st.standby || {}).filter(x => (x || []).includes(d)).length);
    const tasks = days.map(d => st.pairings.filter(pr => pr.legs.some(l => Math.floor(l.dep / 1440) + 1 === d)).length);
    const hrsCum = days.map(d => { let s = 0; st.pairings.forEach(pr => pr.legs.forEach(l => { if (Math.floor(l.dep / 1440) + 1 <= d) s += ['C', 'F', 'T'].filter(k => pr.crew[k]).length * (l.arr - l.dep) / 60; })); return s / N; });
    const satD = duty.map(v => v / N * 100);
    const fly = sum.per.filter(x => x.hours > 0.5); const avg = fly.length ? fly.reduce((a, x) => a + x.hours, 0) / fly.length : 0;
    const hardN = sum.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length;
    const kc = (lab, val, sub, vals, color) => `<div class="bkpi" style="--c:${color}"><div class="bk-l">${lab}<i></i></div><div class="bk-v">${val}</div><div class="bk-s">${sub}</div>${spark(vals, color)}</div>`;
    // 维度
    const G = {}; const GH = {}; st.pilots.forEach(p => { const g = C.rankGroup(p.rank); G[g] = (G[g] || 0) + 1; GH[g] = (GH[g] || 0) + (idx.hours[p.id] || 0); });
    const slotN = SLOTS.map(([n, a, b]) => [n, st.pairings.filter(pr => { const t = ((pr.legs[0].dep % 1440) + 1440) % 1440 / 60; return t >= a && t < b; }).length]);
    const cls = {}; st.pairings.forEach(pr => pr.legs.forEach(l => { const k = C.apClass(l.to, st); const lab = k ? k.label : '普通'; cls[lab] = (cls[lab] || 0) + 1; }));
    const clsOrder = ['一类·高高原', '二类', '三类', '四类', '复杂', '普通']; const clsCol = ['#ef5d6c', '#f5a524', '#8b6cf6', '#3cc4f0', '#21c7a8', '#4f6a90'];
    const ranked = st.pilots.map(p => ({ p, h: idx.hours[p.id] || 0 })).sort((a, b) => b.h - a.h); const top = ranked.slice(0, 8), bot = ranked.slice(-8).reverse(); const hmx = Math.max(1, ranked[0].h);
    const bar = (x, i, col) => `<div class="rk"><span class="rk-i">${i + 1}</span><span class="rk-n">${esc(x.p.name)}<small>${esc(x.p.rank)}</small></span><span class="rk-b"><i style="width:${(x.h / hmx * 100).toFixed(1)}%;background:${col}"></i></span><b>${x.h.toFixed(1)}h</b></div>`;
    // 事件流
    const ev = [];
    (st.fills || []).slice(-8).reverse().forEach(f => ev.push(['调整', `${f.time || ''}`, `${esc(f.pairingId)} ${esc(f.slotName || '')}：${esc(f.fromName || '空缺')} → ${esc(f.toName || '')}${f.source === 'leave' ? '（请假替换）' : ''}`, 'ev-a']));
    (st.solHist || []).slice(-3).reverse().forEach(hh => ev.push(['方案', new Date(hh.at || Date.now()).toTimeString().slice(0, 8), `自动排班生成方案 #${hh.n}（seed ${hh.seed}）满员 ${(hh.kpi.coverage * 100).toFixed(1)}%`, 'ev-s']));
    sum.violations.filter(v => v.level === 'hard').slice(0, 8).forEach(v => ev.push([v.type === '未满员' ? '缺员' : '违规', '', esc(v.msg).slice(0, 80), v.type === '未满员' ? 'ev-w' : 'ev-r']));
    st.pilots.filter(p => (p.leave || []).length).slice(0, 4).forEach(p => ev.push(['请假', '', `${esc(p.name)} 请假 ${p.leave[0]}–${p.leave[p.leave.length - 1]} 日`, 'ev-l']));
    // 四象限
    const qx = v => 20 + v / 100 * 220, qy = v => 180 - v / 100 * 160;
    const quad = `<svg viewBox="0 0 260 200" class="quad"><rect x="20" y="20" width="${qx(80) - 20}" height="160" class="q-idle"/><rect x="${qx(80)}" y="20" width="${qx(90) - qx(80)}" height="${qy(10) - 20}" class="q-ideal"/><rect x="${qx(90)}" y="20" width="${240 - qx(90)}" height="160" class="q-alert"/><rect x="${qx(90)}" y="${qy(5)}" width="${240 - qx(90)}" height="${180 - qy(5)}" class="q-crit"/>
      <line x1="20" y1="180" x2="240" y2="180" class="gl"/><line x1="20" y1="20" x2="20" y2="180" class="gl"/><text x="130" y="197" class="ax" text-anchor="middle">饱和度 %</text><text x="8" y="100" class="ax" transform="rotate(-90 8 100)" text-anchor="middle">韧性度 %</text>
      <text x="60" y="40" class="ax">低效</text><text x="${qx(80) + 2}" y="40" class="ax">理想</text><text x="${qx(90) + 4}" y="40" class="ax">警戒</text><text x="${qx(90) + 4}" y="176" class="ax">高危</text>
      ${om.bySquadron.map(s => `<circle cx="${qx(s.satPct)}" cy="${qy(s.resiliPct)}" r="7" class="q-pt"><title>${esc(s.squad)} 饱和 ${s.satPct}% 韧性 ${s.resiliPct}%</title></circle>`).join('')}</svg>`;
    let h = `<div class="big"><div class="big-h"><div><div class="big-t">✈ 机组运行总览 · 数据大屏</div><div class="mut">${LITE ? '轻量版 · 七中队·演示（化名）' : '完整版 · 全部中队'} · 2026-11 · UTC+8</div></div><div class="clock"><b id="ovClock">--:--:--</b><small id="ovDate"></small></div><div>${solBadge() || '<span class="mut">尚未生成方案</span>'} <button class="btn primary" data-auto="1">⚡ 调整排班</button></div></div>
      <div class="bkpis">${kc('满员率', (sum.coverage * 100).toFixed(1) + '%', `${sum.full}/${sum.total} 任务`, cov, '#21c7a8')}${kc('硬 / 软违规', `${hardN} <small>/ ${sum.soft}</small>`, '不含缺员', vio, '#ef5d6c')}
        ${kc('平均工时', avg.toFixed(1) + 'h', `${sum.all.min.toFixed(0)}–${sum.all.max.toFixed(0)}h · 基尼 ${sum.all.gini.toFixed(3)}`, hrsCum, '#4f8cff')}${kc('饱和度', om.satPct + '%', om.zoneLabel + ' · 已排/上限', satD, '#8b6cf6')}
        ${kc('韧性度', om.resiliPct + '%', `余量 ${om.remainHours.toFixed(0)}h`, satD.map(v => 100 - v), '#3cc4f0')}${kc('空位', sum.total - sum.full, '未满员任务', holes, '#f5a524')}</div>
      <div class="bgrid3"><div class="bpanel"><h4>各职级人数 / 工时占比</h4><div class="d2">${donut(C.GROUPS.map((g, i) => [g, G[g] || 0, PAL[i]]), N, '人')}${donut(C.GROUPS.map((g, i) => [g, Math.round(GH[g] || 0), PAL[i]]), Math.round(Object.values(GH).reduce((a, b) => a + b, 0)), '机组小时')}</div></div>
        <div class="bpanel"><h4>任务时段分布</h4>${donut(slotN.map((x, i) => [x[0], x[1], PAL[i]]), st.pairings.length, '任务')}</div></div>
      <div class="bgrid3"><div class="bpanel"><h4>个人月工时排行 <small class="mut">公平性：Top 8 / Bottom 8</small></h4><div class="rks">${top.map((x, i) => bar(x, i, 'linear-gradient(90deg,#f5a524,#ef5d6c)')).join('')}<div class="rk-sep">…</div>${bot.map((x, i) => bar(x, ranked.length - 1 - i, 'linear-gradient(90deg,#2b6fd6,#4f8cff)')).join('')}</div></div>
        <div class="bpanel"><h4>实时事件 <span class="live">● LIVE</span></h4><div class="feed">${ev.length ? ev.slice(0, 16).map(e => `<div class="ev ${e[3]}"><span class="ev-t">${e[1] || '—'}</span><span class="ev-k">${e[0]}</span><span>${e[2]}</span></div>`).join('') : '<div class="tempty">暂无事件</div>'}</div></div>
        <div class="bpanel"><h4>每日趋势 <small class="mut">任务量 / 在岗人数 / 备份</small></h4>${areaChart([{ n: '每日任务', v: tasks, c: '#4f8cff' }, { n: '在飞人数', v: duty, c: '#21c7a8' }, { n: '备份', v: sb, c: '#f5a524' }], days.map(d => String(d).padStart(2, '0')))}
          <h4 style="margin-top:8px">四象限 · 饱和 × 韧性</h4>${quad}<div class="mut sm">${esc(om.zoneHint)}</div></div></div>
      <div class="mut sm">渲染 <span id="ovMs"></span> ms · 指标沿用运营看板口径（${esc(om.formulas.sat)}）</div></div>`;
    $('#main').innerHTML = h; tickClock(); ui.lastRenderMs = Math.round(performance.now() - t0); $('#ovMs').textContent = ui.lastRenderMs;
  }
  function tickClock() { const c = $('#ovClock'); if (!c) return; const n = new Date(); c.textContent = n.toTimeString().slice(0, 8); const dd = $('#ovDate'); if (dd) dd.textContent = n.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); }
  setInterval(tickClock, 1000);
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-auto]'); if (a) runAuto(); const g = e.target.closest && e.target.closest('[data-go]'); if (g) goTab(g.dataset.go); });
  // 侧边栏
  const SIDE = [['计划', [['overview', '▦', '总览'], ['gantt', '♙', '人员视图'], ['tasks', '☰', '任务视图'], ['leave', '▤', '请假调配']]],
    ['监控', [['report', '⚠', '校验与异常'], ['duty', '◷', '执勤监控'], ['ops', '◔', '运营看板']]],
    ['管理', [['settings', '⚙', '设置'], ['data', '⇅', '导入导出'], ['rules', '§', '规则库'], ['roster', '☷', '人员总览'], ['welfare', '♡', '员工福利'], ['fills', '↺', '补位历史']]]];
  function renderSide() {
    let s = $('#side'); if (!s) { s = document.createElement('aside'); s.id = 'side'; document.body.prepend(s); document.body.classList.add('side-layout'); }
    const hardN = sum ? sum.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length + (sum.total - sum.full) : 0;
    s.innerHTML = `<div class="sb-brand"><span class="sb-logo">✈</span><div><b>CrewOps</b><small>${LITE ? 'A320 · 七中队(化名)' : 'A320/C909 · 成都基地'}</small></div><span class="sb-tag">${LITE ? 'LITE' : 'PROTO'}</span></div>`
      + SIDE.map(([g, items]) => `<div class="sb-g">${g}</div>` + items.map(([k, ic, n]) => `<button class="sb-i ${tab === k ? 'cur' : ''}" data-go="${k}"><span class="sb-ic">${ic}</span>${n}${k === 'report' && hardN ? `<span class="sb-n">${hardN}</span>` : ''}</button>`).join('')).join('')
      + `<div class="sb-foot"><span class="okc">●</span> 已自动保存 · ${new Date().toTimeString().slice(0, 5)}</div>`;
  }

