/* 机组排班助手 - 界面 · export.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ---------------- 全月班表 / 个人月历导出 ----------------
  function exportMonthRoster() {
    const rows = C.monthRosterRows(st);
    dl('全月班表_2026-11.csv', csv(rows));
    toast('✔ 已导出全月班表 CSV（任务×航段×机组）');
  }
  function exportPersonalCombined() {
    const pack = C.personalMonthPack(st);
    const rows = [['员工号', '姓名', '级别', '中队', '日期', '星期', '状态', '任务号', '机型', '机号', '航班摘要', '当日飞行小时', '本月累计小时']];
    pack.forEach(f => f.rows.slice(1).forEach(r => rows.push(r)));
    dl('个人月历汇总_2026-11.csv', csv(rows));
    toast('✔ 已导出个人月历汇总 CSV（含人员列）');
  }
  async function exportPersonalZip() {
    const pack = C.personalMonthPack(st);
    if (typeof JSZip === 'undefined') {
      exportPersonalCombined();
      toast('未加载 JSZip，已改为汇总 CSV', 4000);
      return;
    }
    toast('正在打包个人月历…');
    const zip = new JSZip();
    const folder = zip.folder('个人月历_2026-11');
    pack.forEach(f => {
      const safe = String(f.name).replace(/[\\/:*?"<>|]/g, '_');
      folder.file(f.id + '_' + safe + '_' + f.rank + '.csv', csv(f.rows));
    });
    const sumRows = [['员工号', '姓名', '级别', '中队', '本月飞行小时', '培训天数', '备份天数', '休假天数']];
    const idx = C.buildIndex(st);
    st.pilots.forEach(p => {
      sumRows.push([p.id, p.name, p.rank, p.squad || '', (idx.hours[p.id] || 0).toFixed(2),
        ((st.training || {})[p.id] || []).length, ((st.standby || {})[p.id] || []).length, (p.leave || []).length]);
    });
    folder.file('_汇总_工时培训备份.csv', csv(sumRows));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '个人月历包_2026-11.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('✔ 已导出个人月历包 ZIP（' + pack.length + ' 人）');
  }
  function demoFillBanner() {
    const note = (st.sampleMeta && st.sampleMeta.demoFill) || (C.SAMPLE_META && C.SAMPLE_META.demoFill) || '';
    if (!st.sample || !note) return '';
    return '<div class="demo-fill-note">📌 ' + esc(note) + ' · 任务 ' + st.pairings.length + ' 组已铺满 1–' + C.DAYS + ' 日</div>';
  }
  function exportBarHtml(extra) {
    return '<div class="export-bar">'
      + '<button type="button" class="btn primary" id="exXlsxAll" title="Excel 甘特图：人员甘特 / 任务甘特 / 图例与统计（离线生成）">📊 导出 Excel 甘特图</button>'
      + ((ui.gq || (ui.gg && ui.gg !== '全部')) ? '<button type="button" class="btn primary" id="exXlsxFilt">📊 Excel 甘特（当前筛选）</button>' : '')
      + '<button type="button" class="btn" id="exMonthRoster">导出全月班表 CSV</button>'
      + '<button type="button" class="btn" id="exPersonalZip">个人月历包 ZIP</button>'
      + '<button type="button" class="btn" id="exPersonalCsv">导出个人月历汇总 CSV</button>'
      + onePersonPicker()
      + (extra || '') + '</div>';
  }
  function exportOnePerson(pid) {
    const p = st.pilots.find(x => x.id === pid); if (!p) { toast('未找到该人员，请从下拉中选择'); return; }
    const safe = String(p.name).replace(/[\\/:*?"<>|]/g, '_');
    dl('个人月历_' + p.id + '_' + safe + '_' + p.rank + '_2026-11.csv', csv(C.personalMonthRows(st, p.id)));
    toast('✔ 已导出 ' + esc(p.name) + '（' + p.id + '）个人月历 CSV');
  }
  function onePersonPicker() {
    return '<span class="onepick"><input id="exOneQ" list="exOneDL" placeholder="搜索姓名/工号/级别/中队 → 单人月历" style="width:240px">'
      + '<datalist id="exOneDL">' + st.pilots.map(p => `<option value="${p.id} ${esc(p.name)} ${p.rank} ${esc(p.squad || '')}"></option>`).join('') + '</datalist>'
      + '<button type="button" class="btn primary" id="exOneX">此人 Excel 甘特</button><button type="button" class="btn" id="exOneBtn">此人月历 CSV</button><span class="mut" id="exOneN"></span></span>';
  }
  function bindOnePerson() {
    const q = $('#exOneQ'), b = $('#exOneBtn'), n = $('#exOneN'); if (!q || !b) return;
    const resolve = () => { const v = q.value.trim(); const id = v.split(/\s+/)[0];
      return st.pilots.find(p => p.id === id) || (v ? st.pilots.filter(p => C.pilotMatches(p, v))[0] : null); };
    q.oninput = () => { const v = q.value.trim(); n.textContent = v ? '匹配 ' + st.pilots.filter(p => C.pilotMatches(p, v)).length + ' 人' : ''; };
    b.onclick = () => { const p = resolve(); if (p) exportOnePerson(p.id); else toast('请输入并选择一名人员'); };
    const bx = $('#exOneX'); if (bx) bx.onclick = () => { const p = resolve(); if (p) exportXlsxGantt([p.id], p.id + ' ' + p.name + ' ' + p.rank); else toast('请输入并选择一名人员'); };
    q.onkeydown = e => { if (e.key === 'Enter') b.onclick(); };
  }
  function ganttFilteredIds() { const order = { '教员': 0, '机长': 1, '新机长': 2, '副驾驶': 3 };
    let ps = st.pilots.slice().sort((a, b) => order[C.rankGroup(a.rank)] - order[C.rankGroup(b.rank)] || C.RANK_VAL[b.rank] - C.RANK_VAL[a.rank] || a.id.localeCompare(b.id));
    if (ui.gg && ui.gg !== '全部') ps = ps.filter(p => C.rankGroup(p.rank) === ui.gg); if (ui.gsq && ui.gsq !== '全部') ps = ps.filter(p => p.squad === ui.gsq); if (ui.gq) ps = ps.filter(p => pilotSearchMatch(p, ui.gq)); return ps.map(p => p.id); }
  async function exportXlsxGantt(ids, label) {
    if (!window.ExcelJS || !window.XlsxGantt) { toast('Excel 组件未加载（js/vendor/exceljs.min.js）'); return; }
    const H = st.solHist || []; const h = H[st.solIdx != null ? st.solIdx : H.length - 1]; const plan = h ? `方案 #${h.n} · seed ${h.seed}` : '当前方案';
    toast('正在生成 Excel 甘特图…');
    try { const wb = XlsxGantt.build(ExcelJS, C, st, { pilotIds: ids, label: label || (LITE ? '七中队·演示（轻量版）' : '全部人员'), plan });
      const buf = await wb.xlsx.writeBuffer(); const safe = String(label || '全员').replace(/[\\/:*?"<>|\s]+/g, '_');
      dl(`排班甘特_${C.YEAR}-${String(C.MONTH).padStart(2, '0')}_${safe}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast(`✔ 已导出 Excel 甘特图（${ids ? ids.length : st.pilots.length} 人 · ${plan}）`); } catch (e) { toast('导出失败：' + e.message); } }
  function bindExportButtons() {
    bindOnePerson();
    const xa = $('#exXlsxAll'), xf = $('#exXlsxFilt'); if (xa) xa.onclick = () => exportXlsxGantt(ganttFilteredIds().length === st.pilots.length ? ganttFilteredIds() : null, null);
    if (xf) xf.onclick = () => { const ids = ganttFilteredIds(); if (!ids.length) return toast('当前筛选无人员'); exportXlsxGantt(ids, '筛选_' + (ui.gg !== '全部' ? ui.gg : '') + (ui.gq || '')); };
    document.querySelectorAll('.roCal').forEach(x => x.onclick = e => { e.stopPropagation(); exportOnePerson(x.dataset.pid); });
    const a = $('#exMonthRoster'), b = $('#exPersonalZip'), c = $('#exPersonalCsv');
    if (a) a.onclick = exportMonthRoster;
    if (b) b.onclick = () => { exportPersonalZip().catch(e => toast('导出失败：' + e.message)); };
    if (c) c.onclick = exportPersonalCombined;
  }

  // ---------------- 导入导出 ----------------
  function csv(rows) { return '\ufeff' + rows.map(r => r.map(x => { x = String(x == null ? '' : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',')).join('\r\n'); }
  function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' })); a.download = name; a.click(); }
  function parseCSV(t) { t = t.replace(/^\ufeff/, ''); const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
    if (f || row.length) { row.push(f); rows.push(row); } return rows.filter(r => r.some(x => x.trim())); }
  const PIL_H = ['员工号', '姓名', '级别', '授权机场(;分隔)', '意向休息日(;分隔)', '请假日(;分隔)'];
  const PR_H = ['任务号', '日序(D)', '航班号', '起飞机场', '落地机场', '日期(11月几日)', '起飞时间', '落地时间(次日加+1)', '机型'];
  const pilotRows = () => [PIL_H, ...st.pilots.map(p => [p.id, p.name, p.rank, (p.auth || []).join(';'), (p.prefs || []).join(';'), (p.leave || []).join(';')])];
  const tm = (m, base) => { const dd = Math.floor(m / C.DAY) - base; return C.fmtT(m) + (dd > 0 ? '+' + dd : ''); };
  const pairRows = () => [PR_H, ...st.pairings.flatMap(pr => pr.legs.map(l => { const day = Math.floor(l.dep / C.DAY); return [pr.id, l.d, C.fltLabel(l), l.from, l.to, day + 1, C.fmtT(l.dep), tm(l.arr, day), l.ac]; }))];
  function rData() {
    $('#main').innerHTML = `${demoFillBanner()}<div class="grid g2"><div class="panel"><h3>导出</h3><div class="note">CSV 为 UTF-8 BOM 格式，可直接用 Excel 打开。全月班表与个人月历包可离线导出。</div>
      ${exportBarHtml()}
      <div style="margin-top:10px;line-height:3">
      <button class="btn" id="exRoster">排班表（按航段，含机组）</button><button class="btn" id="exHours">人员工时统计</button><button class="btn" id="exViol">校验问题清单</button><br>
      <button class="btn" id="exPil">人员数据</button><button class="btn" id="exPr">任务数据</button><button class="btn" id="exJson">完整备份(JSON)</button></div></div>
      <div class="panel"><h3>导入</h3><div class="note">导入将替换对应数据并清空现有排班。可先下载模板。</div><div style="margin-top:10px;line-height:3">
      <button class="btn" id="tpPil">下载人员模板</button><button class="btn" id="tpPr">下载任务模板</button><br>
      <label class="btn">导入人员 CSV<input type="file" id="imPil" accept=".csv" hidden></label><label class="btn">导入任务 CSV<input type="file" id="imPr" accept=".csv" hidden></label><label class="btn">恢复备份 JSON<input type="file" id="imJson" accept=".json" hidden></label></div><div id="imMsg" class="note"></div></div></div>
      <div class="panel"><h3>格式说明</h3><div class="note" style="line-height:1.9">人员 CSV 列：${PIL_H.join('，')}；级别取值：${C.RANKS.join(' / ')}<br>任务 CSV 列：${PR_H.join('，')}；同一任务号的多行即该任务的各航段（按日序、时间排列），任务须从 ZUUU 出发并回到 ZUUU。机场使用 ICAO 四字码，须在“设置”机场表内。</div></div>`;
    const m = pm();
    $('#exRoster').onclick = () => dl('排班表_2026-11.csv', csv([['任务号', '日序', '日期', '航班号', '起飞', '落地', '起飞时间', '落地时间', '机型', '特殊机场', '需血压测试仪', '机长(机)', '级别', '副驾驶(副)', '级别', '观察员', '级别'],
      ...st.pairings.flatMap(pr => pr.legs.map(l => { const day = Math.floor(l.dep / C.DAY); const c = s => pr.crew[s] && m[pr.crew[s]];
        return [pr.id, 'D' + l.d, '2026-11-' + String(day + 1).padStart(2, '0'), C.fltLabel(l), `${l.from} ${C.apName(l.from, st)}`, `${l.to} ${C.apName(l.to, st)}`, C.fmtT(l.dep), tm(l.arr, day), l.ac,
          [l.from, l.to].filter(x => C.isSpecial(x, st)).map(x => C.apName(x, st)).join(';'), (st.settings.bpTesterAirports || []).includes(l.from) ? '是' : '',
          ...['C', 'F', 'T'].flatMap(s => c(s) ? [c(s).name + '(' + c(s).id + ')', c(s).rank] : ['空缺', ''])]; }))]));
    $('#exHours').onclick = () => dl('人员工时_2026-11.csv', csv([['员工号', '姓名', '级别', '组别', '本月飞行小时', '任务数', '执勤天数', '过夜次数', '特殊机场任务', '夜航段', '意向休息日满足', '备份天数', '备份日期', '任务间休息天数'], ...sum.per.map(x => [x.id, x.name, x.rank, x.group, x.hours.toFixed(2), x.pairings, x.dutyDays, x.overnights, x.special, x.night, x.prefOK + '/' + x.prefTotal, x.standby, ((st.standby || {})[x.id] || []).join(';'), x.gaps.join(';')])]));
    $('#exViol').onclick = () => dl('校验问题_2026-11.csv', csv([['级别', '类型', '任务', '说明'], ...sum.violations.map(v => [v.level, v.type, v.pairing || '', v.msg])]));
    $('#exPil').onclick = () => dl('人员数据.csv', csv(pilotRows())); $('#exPr').onclick = () => dl('任务数据.csv', csv(pairRows()));
    $('#exJson').onclick = () => dl('排班备份.json', JSON.stringify(st), 'application/json');
    $('#tpPil').onclick = () => dl('人员模板.csv', csv([PIL_H, ['E10001', '张三', 'J3', 'ZULS;ZPLJ', '5;18', ''], ['E10002', '李四', 'F5', 'ZUJZ', '7;21', '12;13;14']]));
    $('#tpPr').onclick = () => dl('任务模板.csv', csv([PR_H, ['PR901', 1, 'EU2201', 'ZUUU', 'ZWWW', 3, '08:00', '12:20', 'A320'], ['PR901', 1, 'EU2202', 'ZWWW', 'ZUUU', 3, '13:20', '17:30', 'A320'], ['PR902', 1, 'EU6683', 'ZUUU', 'ZGHA', 5, '21:00', '22:50', 'A320'], ['PR902', 2, 'EU6684', 'ZGHA', 'ZUUU', 6, '07:30', '09:20', 'A320']]));
    const read = (inp, fn) => inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { fn(r.result); } catch (e) { $('#imMsg').innerHTML = '<span class="red">导入失败：' + esc(e.message) + '</span>'; } }; r.readAsText(f, 'utf-8'); };
    read($('#imPil'), t => { const rows = parseCSV(t).slice(1); const ps = rows.map((r, i) => { if (!C.RANK_VAL[r[2] && r[2].trim()]) throw new Error(`第${i + 2}行级别无效：${r[2]}`);
      const ls = x => (x || '').split(/[;；\s]+/).filter(Boolean); return { id: r[0].trim(), name: r[1].trim(), rank: r[2].trim(), auth: ls(r[3]), prefs: ls(r[4]).map(Number), leave: ls(r[5]).map(Number) }; });
      st.pilots = ps; st.sample = false; st.standby = null; st.pairings.forEach(p => p.crew = { C: null, F: null, T: null }); refresh(); toast(`已导入 ${ps.length} 名人员`); });
    read($('#imPr'), t => { const rows = parseCSV(t).slice(1); const g = {};
      rows.forEach((r, i) => { const [id, d, flt, from, to, day, dep, arr, ac] = r.map(x => x.trim());
        if (!C.AIRPORTS[from] && !(st.airports || {})[from]) throw new Error(`第${i + 2}行机场未知：${from}`);
        const pt = s => { const m = s.match(/^(\d{1,2}):(\d{2})(?:\+(\d))?$/); if (!m) throw new Error(`第${i + 2}行时间格式错误：${s}`); return (+m[3] || 0) * C.DAY + (+m[1]) * 60 + (+m[2]); };
        const base = (+day - 1) * C.DAY; (g[id] = g[id] || []).push({ d: +d.replace(/\D/g, ''), flt, from, to, dep: base + pt(dep), arr: base + pt(arr), ac: ac || 'A320' }); });
      st.pairings = Object.entries(g).map(([id, legs]) => { legs.sort((a, b) => a.dep - b.dep); const start = Math.floor(legs[0].dep / C.DAY) + 1;
        return { id, start, ndays: Math.floor(legs[legs.length - 1].arr / C.DAY) + 1 - start + (legs[legs.length - 1].arr % C.DAY === 0 ? 0 : 0), ac: legs.some(l => l.ac === 'A321') ? 'A321' : 'A320', legs, crew: { C: null, F: null, T: null } }; })
        .map(p => (p.ndays = Math.max(p.ndays, ...p.legs.map(l => l.d)), p)).sort((a, b) => a.legs[0].dep - b.legs[0].dep);
      st.sample = false; refresh(); toast(`已导入 ${st.pairings.length} 个任务`); });
    read($('#imJson'), t => { const s = JSON.parse(t); if (!s.pilots || !s.pairings) throw new Error('不是有效备份'); st = s; st.settings = C.migrateSettings(Object.assign(C.defaultSettings(), st.settings)); refresh(); toast('备份已恢复'); });
    bindExportButtons();
  }

