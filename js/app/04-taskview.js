/* 机组排班助手 - 界面 · taskview.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ================= CrewOps 风格：侧边栏 / 任务视图（卡片+抽屉）/ 总览大屏 =================
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const wdOf = d => WD[new Date(2026, 10, d).getDay()];
  const SLOTS = [['早班', 0, 9], ['上午', 9, 12], ['下午', 12, 17], ['晚间', 17, 24]];
  const hm = m => C.fmtT(m);
  function legsOnDay(pr, d) { return pr.legs.filter(l => Math.floor(l.dep / 1440) + 1 === d); }
  function prStatus(pr, V, rk) { const full = C.pairingFull(pr);
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
    const avg = (() => { const xs = (sum.per || []).filter(x => x.hours > 0.5); return xs.length ? xs.reduce((a, x) => a + x.hours, 0) / xs.length : 0; })(); // 有飞人员平均工时（本周期）
    let h = `<div class="cw"><div class="cw-head"><div><h2>任务视图</h2><div class="mut">${st.pairings.length} 个任务 · 按日/时段查看 · 点击卡片查看详情</div></div>
      <div class="cw-acts">${DEMO ? '' : '<button class="btn primary" data-auto="1">⚡ 调整排班</button>'}</div></div>
      <div class="okpis">${kpiCard('◎', '满员率', (sum.coverage * 100).toFixed(1) + '%', `${st.pairings.length} 个任务 · ${sum.full === sum.total ? '全部已覆盖' : '缺员 ' + (sum.total - sum.full)}`, sum.coverage >= 0.99 ? 'okc' : 'warnc')}
        ${kpiCard('⚠', '硬性违规', hardN, `软性 ${softN} · 提示 ${infoN}`, hardN ? 'red' : 'okc')}
        ${kpiCard('◷', '需关注风险', riskN || '—', riskN ? '飞行执勤期中/高风险任务' : '飞行执勤期余量均充足')}
        ${kpiCard('♙', '可排人员平均工时', avg.toFixed(1) + 'h', `${sum.all.min.toFixed(1)}–${sum.all.max.toFixed(1)}h · 基尼 ${sum.all.gini.toFixed(3)}`)}</div>
      <div class="dstrip">${Array.from({ length: C.DAYS }, (_, i) => i + 1).map(k => `<button class="dchip ${k === d ? 'cur' : ''} ${['六', '日'].includes(wdOf(k)) ? 'we' : ''}" data-day="${k}"><b>${C.dayLabel ? C.dayLabel(k).text : String(k).padStart(2, '0')}</b><small>周${wdOf(k)}</small><small>${D[k].prs.length} 任务</small>${D[k].issue ? `<i class="ddot" title="${D[k].issue} 项需处理"></i>` : ''}</button>`).join('')}</div>`;
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
        h += `<div class="tcard ${stt[1]}" data-card="${pr.id}"><div class="tc-h"><b>${esc(pairLabel(pr))}</b><span class="badge ${stt[1]}">${stt[0]}</span><span class="tc-t">${hm(ls[0].dep)}</span></div>
          <div class="tc-r">${routeHtml(ls)}</div>
          <div class="tc-m">D${k}/${pr.ndays} · ${ls.length} 段 · ${(ls.reduce((a, l) => a + l.arr - l.dep, 0) / 60).toFixed(1)}h · ${pr.ac} · ${hm(ls[0].dep)}–${hm(ls[ls.length - 1].arr)}</div>
          <div class="tc-c">${chips}</div>
          <div class="tc-f">${dy ? `<span class="rdot r-${dy.planRisk}"></span>飞行执勤期 ${C.fmtH(dy.planFdp)} / ${C.fmtH(dy.limit)} · 余 ${dy.planBuffer} 分` : '飞行执勤期 —'}</div></div>`;
      }
      h += '</div>';
    }
    h += `<div class="tcol side"><div class="sbox"><div class="tcol-h">当日备份 <span class="pillc">${sbs.length} 人</span></div>${sbs.length ? `<div class="tc-c">${sbs.map(p => `<span class="cchip">${esc(p.name)}<small>${esc(p.rank)}</small></span>`).join('')}</div>` : '<div class="tempty">当日没有备份</div>'}<div class="mut sm">备份被调用后，该日备份数量会减少；应用方案前会重新校验。</div></div>
      <div class="sbox"><div class="tcol-h">需要关注 <span class="pillc">${att.length}</span></div>${att.length ? att.map(({ pr, stt }) => `<div class="attn" data-card="${pr.id}"><span class="badge ${stt[1]}">${stt[0]}</span><b>${esc(pairLabel(pr))}</b><span class="mut">${esc((V[pr.id] || [stt[0] === '缺员' ? '缺 ' + ['C', 'F', 'T'].filter(s => !pr.crew[s]).map(s => C.SLOT_NAME[s]).join('/') : '飞行执勤期余量偏紧'])[0]).slice(0, 60)}</span></div>`).join('') : '<div class="tempty">当日没有需要关注的任务</div>'}</div></div></div></div>`;
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
    const head = `<div class="drw-h"><div><h3>${esc(pairLabel(pr))}${fillBadge(pr.id)}${demoTag(pr)}</h3><div class="mut">${cityChain}</div></div><button class="btn drw-x" id="drwX" title="关闭">✕</button></div>`;
    const tfBar = ['C', 'F', 'T'].filter(s => pr.crew[s] && m[pr.crew[s]]).map(s => `<button class="btn sm drwTf" data-tf="${pr.crew[s]}" title="转给同级空闲人员">同级换班 · ${C.SLOT_NAME[s] || s} ${esc(m[pr.crew[s]].name)}</button>`).join(' ');
    const view = `<div class="drw-b"><div class="drwtf" style="margin-bottom:8px">${tfBar}</div><div class="dtiles">${tile('日期', dateOf(pr.start) + (pr.ndays > 1 ? '–' + dateOf(pr.start + pr.ndays - 1) : ''))}${tile('天数', pr.ndays + ' 天')}${tile('飞行小时', C.pairingHours(pr).toFixed(1) + 'h')}${tile('机型', esc(pr.ac))}${tile('飞行执勤期余量', minBuf == null ? '—' : fmtBuf(minBuf), bufCls, '各值勤日 (限制 − 计划飞行执勤期) 的最小值')}${tile('规则', rule, sp.length ? 'red' : '', sp.map(c => C.apName(c, st)).join('、'))}</div>
      <h4>机组</h4>${['C', 'F', 'T'].map(s => { const p = m[pr.crew[s]]; return `<div class="drow ${p ? '' : 'vac'}"><span class="seat s-${s}">${({ C: '机长', F: '副驾驶', T: '观察员' })[s]}</span>${p ? `<b>${esc(p.name)}</b>${pill(p.rank)}<span class="hrs">${(idx.hours[p.id] || 0).toFixed(1)}h</span>` : '<b class="red">空缺</b><span class="mut">待补位 · 点「调整机组」选择候选人</span>'}</div>`; }).join('')}
      <h4>航段</h4><table class="dtab"><tr><th>日</th><th>航班</th><th>航段</th><th>计划</th><th>机型/机号</th></tr>${pr.legs.map(l => `<tr><td>D${l.d}</td><td>${esc(C.fltLabel(l))}</td><td>${apHtml(l.from)} → ${apHtml(l.to)}</td><td>${C.fmtT(l.dep)}–${C.fmtT(l.arr)}</td><td>${esc(l.ac || pr.ac)}<span class="mut"> ${esc(l.reg || '')}</span></td></tr>`).join('')}</table>
      ${spNotes.length ? `<div class="note red">特殊机场：${spNotes.join('；')}，执行左右座均需持有该机场授权</div>` : ''}
      <h4>飞行执勤期</h4><table class="dtab"><tr><th>值勤日</th><th>飞行执勤期 / 限制</th><th>余量</th><th>风险</th></tr>${fd.map(dy => `<tr><td>D${dy.d} · ${dateOf(dy.date)}</td><td>${C.fmtH(dy.planFdp)} / ${C.fmtH(dy.limit)}</td><td>${fmtBuf(dy.planBuffer)}</td><td><span class="rbadge rb-${RK[dy.planRisk][1]}">${RK[dy.planRisk][0]}</span></td></tr>`).join('')}</table>
      <div class="mut sm">飞行执勤期 = 首段前报到 ${st.settings.reportMin || 60} 分 → 末段落地（计划时刻）；限制按规则表（报到时刻 × 航段数）。</div></div>
      <div class="drw-f"><button class="btn" id="drwC">关闭</button><button class="btn primary" id="drwE">⚙ 调整机组</button></div>`;
    let dw = $('#drawer'); if (!dw) { dw = document.createElement('div'); dw.id = 'drawer'; document.body.appendChild(dw); }
    dw.innerHTML = `<div class="drw-mask"></div><aside class="drw">${head}${view}</aside>`; dw.classList.remove('hidden');
    dw.querySelectorAll('.drwTf').forEach(b => b.onclick = () => { closeDrawer(); openTransfer(b.dataset.tf, id); });
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
    const stp = Math.max(5, Math.ceil(n / 10)); labels.forEach((l, i) => { if ((i % stp === 0 && n - 1 - i >= stp / 2) || i === n - 1) g += `<text x="${x(i)}" y="${H - 4}" text-anchor="${i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}" class="ax">${l}</text>`; });
    const paths = series.map(s => { const d = s.v.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(''); return `<path d="${d} L${x(n - 1)} ${H - 18} L${x(0)} ${H - 18}Z" fill="${s.c}" opacity=".12"/><path d="${d}" fill="none" stroke="${s.c}" stroke-width="2"/>`; }).join('');
    return `<svg class="area" viewBox="0 0 ${W} ${H}">${g}${paths}</svg><div class="dleg row">${series.map(s => `<div><i style="background:${s.c}"></i>${s.n}</div>`).join('')}</div>`; }
  const dayText = d => (C.dayLabel ? C.dayLabel(d).text : d + '日');
  function periodText() { if (!C.dayLabel) return C.YEAR + ''; const a = C.dayLabel(1), b = C.dayLabel(C.DAYS); return `${C.YEAR}-${String(a.m).padStart(2, '0')}-${String(a.d).padStart(2, '0')} – ${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}（${C.DAYS} 天）`; }
  // 人工班表 vs 一键排班（仅演示版：任务带真实机组 srcCrew）；按当前机组签名缓存
  let cmpCache = null;
  function cmpHtml() {
    if (!C.realVsAuto || !st.pairings.some(p => p.srcCrew)) return '';
    if (!st.pairings.some(p => p.crew.C || p.crew.F || p.crew.T)) return `<div class="cmpbox"><div class="cmp-h">人工排班 vs 一键排班</div><div class="mut">点「⚡ 一键排班」后，这里对比同一批航班的人工真实班表与引擎结果。</div></div>`;
    const sig = (st.solN || 0) + '|' + st.pairings.map(p => (p.crew.C || '') + (p.crew.F || '') + (p.crew.T || '')).join(',').length + '|' + (st.fills || []).length;
    if (!cmpCache || cmpCache.sig !== sig) cmpCache = { sig, r: C.realVsAuto(st) };
    const { real: a, auto: b } = cmpCache.r; const f1 = x => x.toFixed(1);
    const row = (lab, x, y, fmt, better, note) => { const good = better === 'low' ? y < x - 1e-9 : better === 'high' ? y > x + 1e-9 : null; const eq = Math.abs(x - y) < 1e-9;
      return `<tr><td>${lab}${note ? `<small class="mut"> ${note}</small>` : ''}</td><td>${fmt(x)}</td><td><b>${fmt(y)}</b></td><td class="${eq || good == null ? 'mut' : good ? 'okc' : 'warnc'}">${eq ? '持平' : good == null ? '—' : good ? '▲ 更好' : '▼ 更差'}</td></tr>`; };
    const ht = o => Object.entries(o.hardTypes).map(([k, n]) => k + ' ' + n).join('、') || '无';
    return `<div class="cmpbox"><div class="cmp-h">人工排班 vs 一键排班 <small class="mut">同一批 ${st.pairings.length} 个航班任务 · 本中队口径 · 月工时取完整月平均</small></div>
      <table class="solt cmpt"><tr><th>指标</th><th>人工真实班表</th><th>一键排班</th><th></th></tr>
      ${row('硬违规', a.hard, b.hard, x => x, 'low', '不含缺员')}
      ${row('月工时标准差', a.std, b.std, f1, 'low', '越小越公平')}
      ${row('月工时最高−最低', a.spread, b.spread, x => f1(x) + 'h', 'low')}
      ${row('单人最高月工时', a.maxMonth, b.maxMonth, x => f1(x) + 'h', 'low')}
      ${row('软提示', a.soft, b.soft, x => x, 'low', '第5日执飞等')}
      </table><div class="mut sm">人工班表硬违规：${esc(ht(a))}；一键排班：${esc(ht(b))}。人工表只录了本中队人员（外中队座位未入表），一键排班中外中队候补承担 ${b.extSeats} 个座位，故平均月工时 ${f1(a.meanMonth)}h → ${f1(b.meanMonth)}h。</div></div>`;
  }
  // ---- 席位监控小方块：选定日期（默认 10/15，可切换）----
  function seatDayDefault() { if (!C.dayLabel) return 1; for (let d = 1; d <= C.DAYS; d++) { const L = C.dayLabel(d); if (L.m === 10 && L.d === 15) return d; } return Math.ceil(C.DAYS / 2); }
  function seatTiles(idx, om, ds) {
    if (!st.pairings.some(p => p.crew.C || p.crew.F || p.crew.T)) return '';
    let d = ui.seatDay; if (!d || d < 1 || d > C.DAYS) d = ui.seatDay = seatDayDefault();
    const own = st.pilots.filter(p => !C.isOuterPilot(p) && !(p.health && p.health.noFly));
    const mk = C.monthBuckets ? (C.monthBuckets().find(b => b.days.includes(d)) || {}).key : null;
    const mh = p => { const per = (sum.per || []).find(x => x.id === p.id); return per && per.monthHours && mk ? (per.monthHours[mk] || 0) : (idx.hours[p.id] || 0); };
    const cap = st.settings.hardMaxHours || 100;
    // 4 今日可调：当日空闲或备份、前后一日无执勤、本月余量 ≥ 8h
    const avail = own.filter(p => { const a = ds[p.id]; return (a[d] === '' || a[d] === 'S') && a[d - 1] !== 'D' && a[d + 1] !== 'D' && cap - mh(p) >= 8; });
    const aC = avail.filter(p => C.isCaptClass(p.rank)), aF = avail.filter(p => C.isFO(p.rank));
    // 10 接近月上限（≥85h）
    const near = own.map(p => ({ p, h: mh(p) })).filter(x => x.h >= 85).sort((a, b) => b.h - a.h);
    // 11 连续值勤：当日执勤且前 4 日均执勤（第 5 个连续值勤日）
    const run5 = own.filter(p => { const a = ds[p.id]; return a[d] === 'D' && [1, 2, 3, 4].every(k => a[d - k] === 'D'); });
    // 6 所选日期起未来 7 天里最紧张的一天（可调用人数最少）
    const bb = om.benchByDay || []; let wd = d, wn = Infinity; for (let k = d; k < d + 7 && k <= C.DAYS; k++) { const n = bb[k - 1]; if (n != null && n < wn) { wn = n; wd = k; } } if (!isFinite(wn)) wn = 0;
    const lv = (n, warn, bad, inv) => inv ? (n <= bad ? 'bad' : n <= warn ? 'warn' : 'ok') : (n >= bad ? 'bad' : n >= warn ? 'warn' : 'ok');
    const names = xs => esc(xs.slice(0, 12).join('、') + (xs.length > 12 ? ` 等 ${xs.length} 人` : ''));
    const tile = (cls, lab, val, sub, tip, go) => `<button type="button" class="stile ${cls}" title="${tip}" ${go ? `data-go="${go}"` : ''}><span class="st-l">${lab}</span><span class="st-v">${val}</span><span class="st-s">${sub}</span></button>`;
    const opts = Array.from({ length: C.DAYS }, (_, i) => i + 1).map(k => `<option value="${k}" ${k === d ? 'selected' : ''}>${dayText(k)}</option>`).join('');
    return `<div class="seatmon"><div class="sm-h"><b>席位监控</b><label class="mut">日期 <select id="seatDaySel">${opts}</select></label><button type="button" class="btn sm" id="seatPrev">◀</button><button type="button" class="btn sm" id="seatNext">▶</button></div><div class="stiles">
      ${tile(lv(Math.min(aC.length, aF.length), 3, 1, true), '今日可调 机长 / 副驾驶', `${aC.length}<small> / </small>${aF.length}`, '空闲或备份 · 前后日无执勤 · 余量≥8h', '机长：' + names(aC.map(p => p.name + ' ' + p.rank)) + '\n副驾驶：' + names(aF.map(p => p.name + ' ' + p.rank)), 'gantt')}
      ${tile(lv(wn, 5, 2, true), '未来 7 天最紧张的一天', `${dayText(wd)}`, `可调 ${wn} / ${om.benchPool} 人`, esc(Array.from({ length: Math.min(7, C.DAYS - d + 1) }, (_, i) => dayText(d + i) + ' ' + bb[d + i - 1] + ' 人').join('\n')), '')}
      ${tile(lv(near.length, 1, 5), '接近月上限 ≥85h', `${near.length}<small> 人</small>`, `${(C.monthBuckets().find(b => b.key === mk) || {}).label || ''} · 上限 ${cap}h`, names(near.map(x => x.p.name + ' ' + x.h.toFixed(0) + 'h')) || '无', 'roster')}
    </div></div>`;
  }
  // 执勤期监控：所选日期起 7 天内，飞行值勤期余量最小的值勤日（可能接近超限）
  function fdpWatch() {
    const d = ui.seatDay || seatDayDefault(); const prm = {}; st.pairings.forEach(p => { prm[p.id] = p; }); const m = pm();
    const all = C.fdpRiskSummary(st).rows.filter(r => r.date >= d && r.date < d + 7);
    const list = all.filter(r => r.buffer < 120).sort((a, b) => a.buffer - b.buffer).slice(0, 8);
    const fm = x => Math.floor(x / 60) + 'h' + String(Math.round(x % 60)).padStart(2, '0');
    const cls = b => b < 0 ? 'fw-over' : b < 30 ? 'fw-bad' : b < 60 ? 'fw-warn' : 'fw-ok';
    const rows = list.map(r => { const pr = prm[r.pr]; const crew = pr ? ['C', 'F', 'T'].map(k => pr.crew[k] && m[pr.crew[k]] ? m[pr.crew[k]].name : null).filter(Boolean).join('/') : '';
      return `<button type="button" class="fw-row ${cls(r.buffer)}" data-fwpr="${esc(r.pr)}" title="${esc(pairLabelOf(r.pr))}"><span class="fw-d">${dayText(r.date)}</span><span class="fw-t"><b>${esc(pairLabelOf(r.pr))}</b><small>${esc(crew)} · ${r.legs} 段 · 值勤 ${fm(r.fdp)} / 限 ${fm(r.limit)}</small></span><span class="fw-b">${r.buffer < 0 ? '超 ' + fm(-r.buffer) : '余 ' + Math.round(r.buffer) + ' 分'}</span></button>`; }).join('');
    const n60 = all.filter(r => r.buffer < 60).length;
    return `<div class="bpanel fwatch"><h4>执勤期监控 <small class="mut">${dayText(d)} 起 7 天 · 余量 &lt;2h · 共 ${all.filter(r => r.buffer < 120).length} 个值勤日，&lt;1h ${n60} 个</small></h4>
      ${rows || `<div class="mut" style="padding:12px 0">这 7 天没有余量不足 2 小时的值勤期。</div>`}</div>`;
  }
  function bindSeatTiles() {
    document.querySelectorAll('[data-fwpr]').forEach(b => { b.onclick = () => openDrawer(b.dataset.fwpr); });
    const sel = $('#seatDaySel'); if (!sel) return; const go = v => { ui.seatDay = Math.max(1, Math.min(C.DAYS, v)); rOverview(); };
    sel.onchange = () => go(+sel.value); $('#seatPrev').onclick = () => go(ui.seatDay - 1); $('#seatNext').onclick = () => go(ui.seatDay + 1);
    document.querySelectorAll('.stile[data-go]').forEach(b => { b.onclick = () => { if (b.dataset.go === 'gantt') { const L = C.dayLabel(ui.seatDay); setUiMonth(C.YEAR + '-' + String(L.m).padStart(2, '0')); } goTab(b.dataset.go); }; });
  }
  function rOverview() {
    const t0 = performance.now(); const m = pm(); const idx = C.buildIndex(st); const om = C.opsMetrics(st); const ds = C.dayStatus(st, idx); const N = st.pilots.length;
    const days = Array.from({ length: C.DAYS }, (_, i) => i + 1);
    const V = violByPairing(); const onDay = d => st.pairings.filter(pr => pr.start <= d && pr.start + pr.ndays - 1 >= d);
    const cov = days.map(d => { const a = onDay(d); return a.length ? a.filter(p => C.pairingFull(p)).length / a.length * 100 : 100; });
    const vio = days.map(d => onDay(d).filter(p => V[p.id]).length);
    const holes = days.map(d => onDay(d).filter(p => !C.pairingFull(p)).length);
    const duty = days.map(d => st.pilots.filter(p => ds[p.id][d] === 'D').length);
    const sb = days.map(d => Object.values(st.standby || {}).filter(x => (x || []).includes(d)).length);
    const tasks = days.map(d => st.pairings.filter(pr => pr.legs.some(l => Math.floor(l.dep / 1440) + 1 === d)).length);
    const hrsCum = days.map(d => { let s = 0; st.pairings.forEach(pr => pr.legs.forEach(l => { if (Math.floor(l.dep / 1440) + 1 <= d) s += ['C', 'F', 'T'].filter(k => pr.crew[k]).length * (l.arr - l.dep) / 60; })); return s / N; });
    const satD = duty.map(v => v / N * 100);
    const hardN = sum.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length;
    const kc = (lab, val, sub, vals, color) => `<div class="bkpi" style="--c:${color}"><div class="bk-l">${lab}<i></i></div><div class="bk-v">${val}</div><div class="bk-s">${sub}</div>${spark(vals, color)}</div>`;
    // 维度
    const G = {}; const GH = {}; st.pilots.filter(p => !(C.isOuterPilot && C.isOuterPilot(p))).forEach(p => { const g = C.rankGroup(p.rank); G[g] = (G[g] || 0) + 1; GH[g] = (GH[g] || 0) + (idx.hours[p.id] || 0); });
    const slotN = SLOTS.map(([n, a, b]) => [n, st.pairings.filter(pr => { const t = ((pr.legs[0].dep % 1440) + 1440) % 1440 / 60; return t >= a && t < b; }).length]);
    const cls = {}; st.pairings.forEach(pr => pr.legs.forEach(l => { const k = C.apClass(l.to, st); const lab = k ? k.label : '普通'; cls[lab] = (cls[lab] || 0) + 1; }));
    const clsOrder = ['一类·高高原', '二类', '三类', '四类', '复杂', '普通']; const clsCol = ['#ef5d6c', '#f5a524', '#8b6cf6', '#3cc4f0', '#21c7a8', '#4f6a90'];
    // 个人月工时排行：按自然月桶（monthHours / monthBuckets）排序，可切换 9月/10月
    const buckets = (sum.monthMeta && sum.monthMeta.length) ? sum.monthMeta : ((C.monthBuckets && C.monthBuckets()) || []);
    const curCalKey = C.YEAR + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    let mk = ui.ovMonth;
    if (!mk || !buckets.some(b => b.key === mk)) {
      // 默认：当前日历月（须是完整月）；否则取最后一个完整月（≥20 天），避免落在只含几天的尾月显示 0h
      const fullB = buckets.filter(b => !b.days || b.days.length >= 20);
      mk = (fullB.find(b => b.key === curCalKey) || fullB[fullB.length - 1] || buckets[0] || {}).key || null;
      ui.ovMonth = mk;
    }
    const mhOf = id => {
      const per = (sum.per || []).find(x => x.id === id);
      if (per && per.monthHours && mk) return per.monthHours[mk] || 0;
      if (C.monthHoursOf) { const m = C.monthHoursOf(st.pilots.find(p => p.id === id), st, idx, null); return (m && mk) ? (m[mk] || 0) : (idx.hours[id] || 0); }
      return idx.hours[id] || 0;
    };
    // 公平性排行仅本中队真实人员（排除外中队/候补）；全假 0h 仍可垫底
    const homePilots = st.pilots.filter(p => !(typeof isOuterPilot === 'function' ? isOuterPilot(p) : (C.isOuterPilot && C.isOuterPilot(p))));
    const ranked = homePilots.map(p => ({ p, h: mhOf(p.id) })).sort((a, b) => b.h - a.h || a.p.id.localeCompare(b.p.id));
    const flyM = ranked.filter(x => x.h > 0.5); const avg = flyM.length ? flyM.reduce((a, x) => a + x.h, 0) / flyM.length : 0;
    const top = ranked.slice(0, 8), bot = ranked.slice(-8).reverse(); const hmx = Math.max(1, ranked[0] ? ranked[0].h : 0, 0.1);
    const nHome = ranked.length;
    // 低工时原因：当月请假 / 培训 / 模拟机天数（解释 0h 不是排班不公）
    const mDays = new Set(((buckets.find(b => b.key === mk) || {}).days) || []);
    const cntIn = arr => (arr || []).filter(d => mDays.has(d)).length;
    const offTag = x => { if (x.h > 20) return ''; const lv = cntIn(x.p.leave), tr = cntIn((st.training || {})[x.p.id]), sm = cntIn((st.sim || {})[x.p.id]);
      const t = lv ? '假' + lv : tr ? '训' + tr : sm ? '模' + sm : ''; return t ? ` · <span title="当月请假/培训/模拟机天数" style="color:#f5a524">${t}</span>` : ''; };
    const bar = (x, rankLab, col, tip) => `<div class="rk" title="${esc(tip || '')}"><span class="rk-i">${esc(String(rankLab))}</span><span class="rk-n">${esc(x.p.name)}<small>${esc(x.p.rank)}${offTag(x)}</small></span><span class="rk-b"><i style="width:${(x.h / hmx * 100).toFixed(1)}%;background:${col}"></i></span><b>${x.h.toFixed(1)}h</b></div>`;
    const monthSeg = buckets.length > 1
      ? `<span class="seg" id="ovMonthSeg" style="margin-left:8px;vertical-align:middle">${buckets.map(b => `<button type="button" data-ovm="${esc(b.key)}" class="${b.key === mk ? 'on' : ''}">${esc(b.label)}</button>`).join('')}</span>`
      : '';
    const monthLab = (buckets.find(b => b.key === mk) || {}).label || '';
    // 事件流
    const ev = [];
    (st.fills || []).slice(-8).reverse().forEach(f => ev.push(['调整', `${f.time || ''}`, `${esc(f.pairingId)} ${esc(f.slotName || '')}：${esc(f.fromName || '空缺')} → ${esc(f.toName || '')}${f.source === 'leave' ? '（请假替换）' : ''}`, 'ev-a']));
    (st.solHist || []).slice(-3).reverse().forEach(hh => ev.push(['方案', new Date(hh.at || Date.now()).toTimeString().slice(0, 8), `${st.demo ? '一键排班完成' : '自动排班生成方案 #' + hh.n}${hh.seed != null ? '（seed ' + hh.seed + '）' : ''} 满员 ${(hh.kpi.coverage * 100).toFixed(1)}%`, 'ev-s']));
    sum.violations.filter(v => v.level === 'hard').slice(0, 8).forEach(v => ev.push([v.type === '未满员' ? '缺员' : '违规', '', esc(v.msg).slice(0, 80), v.type === '未满员' ? 'ev-w' : 'ev-r']));
    st.pilots.filter(p => (p.leave || []).length).slice(0, 4).forEach(p => ev.push(['请假', '', `${esc(p.name)} 请假 ${dayText(p.leave[0])}–${dayText(p.leave[p.leave.length - 1])}（${p.leave.length} 天）`, 'ev-l']));
    // 四象限
    const qx = v => 20 + v / 100 * 220, qy = v => 180 - v / 100 * 160;
    const quad = `<svg viewBox="0 0 260 200" class="quad"><rect x="20" y="20" width="${qx(80) - 20}" height="160" class="q-idle"/><rect x="${qx(80)}" y="20" width="${qx(90) - qx(80)}" height="${qy(10) - 20}" class="q-ideal"/><rect x="${qx(90)}" y="20" width="${240 - qx(90)}" height="160" class="q-alert"/><rect x="${qx(90)}" y="${qy(5)}" width="${240 - qx(90)}" height="${180 - qy(5)}" class="q-crit"/>
      <line x1="20" y1="180" x2="240" y2="180" class="gl"/><line x1="20" y1="20" x2="20" y2="180" class="gl"/><text x="130" y="197" class="ax" text-anchor="middle">饱和度 %</text><text x="8" y="100" class="ax" transform="rotate(-90 8 100)" text-anchor="middle">韧性度 %</text>
      <text x="60" y="40" class="ax">低效</text><text x="${qx(80) + 2}" y="40" class="ax">理想</text><text x="${qx(90) + 4}" y="40" class="ax">警戒</text><text x="${qx(90) + 4}" y="176" class="ax">高危</text>
      ${om.bySquadron.map(s => `<circle cx="${qx(s.satPct)}" cy="${qy(s.resiliPct)}" r="7" class="q-pt"><title>${esc(s.squad)} 饱和 ${s.satPct}% 韧性 ${s.resiliPct}%</title></circle>`).join('')}</svg>`;
    let h = `<div class="big"><div class="big-h"><div><div class="big-t">✈ 机组运行总览 · 数据大屏</div><div class="mut">${DEMO ? '演示版 · 演示中队（化名）' : LITE ? '轻量版 · 演示中队（化名）' : '完整版 · 全部中队'} · ${periodText()} · UTC+8</div></div><div class="clock"><b id="ovClock">--:--:--</b><small id="ovDate"></small></div><div>${solBadge() || '<span class="mut">尚未生成方案</span>'} ${DEMO ? '' : '<button class="btn primary" data-auto="1">⚡ 调整排班</button>'}</div></div>
      <div class="bkpis">${kc('满员率', (sum.coverage * 100).toFixed(1) + '%', `${sum.full}/${sum.total} 任务`, cov, '#21c7a8')}${kc('硬 / 软违规', `${hardN} <small>/ ${sum.soft}</small>`, '不含缺员', vio, '#ef5d6c')}
        ${kc('平均工时' + (monthLab ? ' · ' + monthLab : ''), avg.toFixed(1) + 'h', (monthLab ? monthLab + ' · ' : '') + `有飞 ${flyM.length} 人 · Top ${hmx.toFixed(0)}h`, hrsCum, '#4f8cff')}${kc('饱和度', om.satPct + '%', om.zoneLabel + ' · 已排/上限', satD, '#8b6cf6')}
        ${kc('韧性度', om.resiliPct + '%', `余量 ${om.remainHours.toFixed(0)}h`, om.benchByDay || [], '#3cc4f0')}${kc('空位', sum.total - sum.full, '未满员任务', holes, '#f5a524')}</div>
      ${seatTiles(idx, om, ds)}
      <div class="bgrid3"><div class="bpanel"><h4>各职级人数 / 工时占比 <small class="mut">本中队</small></h4><div class="d2">${donut(C.GROUPS.map((g, i) => [g, G[g] || 0, PAL[i]]), Object.values(G).reduce((a, b) => a + b, 0), '人')}${donut(C.GROUPS.map((g, i) => [g, Math.round(GH[g] || 0), PAL[i]]), Math.round(Object.values(GH).reduce((a, b) => a + b, 0)), '机组小时')}</div></div>
        <div class="bpanel"><h4>任务时段分布</h4>${donut(slotN.map((x, i) => [x[0], x[1], PAL[i]]), st.pairings.length, '任务')}</div>${fdpWatch()}</div>
      <div class="bgrid3"><div class="bpanel"><h4>个人月工时排行 <small class="mut">公平性：Top 8 / Bottom 8 · 本中队 ${nHome} 人${monthLab ? ' · ' + esc(monthLab) : ''}</small>${monthSeg}</h4><div class="rks">${top.map((x, i) => bar(x, i + 1, 'linear-gradient(90deg,#f5a524,#ef5d6c)', `本中队第 ${i + 1} 名 / ${nHome}`)).join('')}<div class="rk-sep">…</div>${bot.map((x, i) => { const fromBottom = i + 1; const abs = nHome - i; return bar(x, '末' + fromBottom, 'linear-gradient(90deg,#2b6fd6,#4f8cff)', `倒数第 ${fromBottom} 名 · 本中队第 ${abs}/${nHome}`); }).join('')}</div></div>
        <div class="bpanel"><h4>实时事件 <span class="live">● LIVE</span></h4><div class="feed">${ev.length ? ev.slice(0, 16).map(e => `<div class="ev ${e[3]}"><span class="ev-t">${e[1] || '—'}</span><span class="ev-k">${e[0]}</span><span>${e[2]}</span></div>`).join('') : '<div class="tempty">暂无事件</div>'}</div></div>
        <div class="bpanel"><h4>每日趋势 <small class="mut">任务量 / 在岗人数 / 备份</small></h4>${areaChart([{ n: '每日任务', v: tasks, c: '#4f8cff' }, { n: '在飞人数', v: duty, c: '#21c7a8' }, { n: '备份', v: sb, c: '#f5a524' }], days.map(d => C.dayLabel ? C.dayLabel(d).text : String(d).padStart(2, '0')))}
          <h4 style="margin-top:8px">四象限 · 饱和 × 韧性</h4>${quad}<div class="mut sm">${esc(om.zoneHint)}</div></div></div>
      <div class="mut sm">渲染 <span id="ovMs"></span> ms · 指标沿用运营看板口径（${esc(om.formulas.sat)}）</div></div>`;
    $('#main').innerHTML = h; tickClock(); ui.lastRenderMs = Math.round(performance.now() - t0); $('#ovMs').textContent = ui.lastRenderMs;
    document.querySelectorAll('#ovMonthSeg button').forEach(b => { b.onclick = () => { ui.ovMonth = b.dataset.ovm; rOverview(); }; }); bindSeatTiles();
  }
  function tickClock() { const c = $('#ovClock'); if (!c) return; const n = new Date(); c.textContent = n.toTimeString().slice(0, 8); const dd = $('#ovDate'); if (dd) dd.textContent = n.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); }
  setInterval(tickClock, 1000);
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-auto]'); if (a) runAuto(); const g = e.target.closest && e.target.closest('[data-go]'); if (g) goTab(g.dataset.go); });
  // 侧边栏
  const SIDE = [['计划', [['overview', '▦', '总览'], ['gantt', '♙', '人员视图'], ['audit', '▣', '个人审计'], ['tasks', '☰', '任务视图'], ['leave', '▤', '请假调配']]],
    ['监控', [['report', '⚠', '校验与异常'], ['duty', '◷', '执勤监控'], ['ops', '◔', '运营看板']]],
    ['管理', [['settings', '⚙', '设置'], ['data', '⇅', '导入导出'], ['rules', '§', '规则库'], ['roster', '☷', '人员总览'], ['welfare', '♡', '员工福利'], ['fills', '↺', '补位历史']]]];
  function renderSide() {
    let s = $('#side'); if (!s) { s = document.createElement('aside'); s.id = 'side'; document.body.prepend(s); document.body.classList.add('side-layout'); }
    const hardN = sum ? sum.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length + (sum.total - sum.full) : 0;
    s.innerHTML = `<div class="sb-brand"><span class="sb-logo">✈</span><div><b>CrewOps</b><small>${LITE ? 'A320 · 演示中队(化名)' : 'A320/C909 · 成都基地'}</small></div><span class="sb-tag">${LITE ? 'LITE' : 'PROTO'}</span></div>`
      + SIDE.map(([g, items]) => `<div class="sb-g">${g}</div>` + items.map(([k, ic, n]) => `<button class="sb-i ${tab === k ? 'cur' : ''}" data-go="${k}"><span class="sb-ic">${ic}</span>${n}${k === 'report' && hardN ? `<span class="sb-n">${hardN}</span>` : ''}</button>`).join('')).join('')
      + `<div class="sb-foot"><span class="okc">●</span> 已自动保存 · ${new Date().toTimeString().slice(0, 5)}</div>`;
  }

