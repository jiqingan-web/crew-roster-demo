/* 机组排班助手 - 界面 · roster.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ---------------- 人员总览（授权 / 健康限制） ----------------
  function rRoster() {
    C.migratePilots(st);
    const authList = C.authAirports(st);
    const levelList = C.levelAirports(st);
    let ps = st.pilots.slice().sort((a, b) => {
      const order = { '教员': 0, '机长': 1, '新机长': 2, '副驾驶': 3 };
      return order[C.rankGroup(a.rank)] - order[C.rankGroup(b.rank)] || C.RANK_VAL[b.rank] - C.RANK_VAL[a.rank] || a.id.localeCompare(b.id);
    });
    if (ui.rg !== '全部') ps = ps.filter(p => C.rankGroup(p.rank) === ui.rg);
    if (ui.rs !== '全部') ps = ps.filter(p => p.squad === ui.rs);
    if (ui.ra !== '全部') ps = ps.filter(p => (p.auth || []).includes(ui.ra));
    if (ui.rh === '有限制') ps = ps.filter(p => C.hasHealthRestriction(p.health));
    if (ui.rh === '不适飞') ps = ps.filter(p => p.health && p.health.noFly);
    if (ui.rh === '限制高原') ps = ps.filter(p => p.health && p.health.noPlateau);
    if (ui.rh === '限制夜间') ps = ps.filter(p => p.health && p.health.noNight);
    if (ui.rh === '月≤60h') ps = ps.filter(p => p.health && p.health.maxMonthH === 60);
    if (ui.rh === '非唯一机长') ps = ps.filter(p => p.health && p.health.noSoleCaptain);
    if (ui.rh === '帮扶对象') ps = ps.filter(p => p.bangfu);
    if (ui.rq) ps = ps.filter(p => pilotSearchMatch(p, ui.rq) || ((p.health && p.health.note || '').includes(ui.rq.trim())));
    const squads = ['全部', ...new Set(st.pilots.map(p => p.squad).filter(Boolean))];
    const nAuth = authList.length;
    const nRest = st.pilots.filter(p => C.hasHealthRestriction(p.health)).length;
    let h = `<div class="panel"><h3>人员总览 · 特殊机场授权与健康限制 <small>授权机场与规章校验一致（RE12 需授权类）；健康限制参与候选人过滤与校验（不适飞/体检过期/个人月上限/非唯一机长为硬性，高原/夜航限制为软性提示）</small></h3>
      <div class="flex" style="flex-wrap:wrap;gap:8px">
        <input id="rq" placeholder="搜索姓名/工号/拼音首字母/备注" value="${esc(ui.rq)}" style="width:200px">
        <select id="rg">${['全部', ...C.GROUPS].map(g => `<option ${g === ui.rg ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <select id="rs">${squads.map(g => `<option ${g === ui.rs ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <select id="ra"><option value="全部">授权机场：全部</option>${authList.map(c => `<option value="${c}" ${ui.ra === c ? 'selected' : ''}>${esc(C.apName(c, st))}</option>`).join('')}</select>
        <select id="rh">${['全部', '有限制', '不适飞', '限制高原', '限制夜间', '月≤60h', '非唯一机长', '帮扶对象'].map(g => `<option ${g === ui.rh ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <span class="mut">${ps.length}/${st.pilots.length} 人 · 有健康限制 ${nRest} 人 · 帮扶 ${st.pilots.filter(p => p.bangfu).length} 人 · 授权机场 ${nAuth} 个</span>
        <button class="btn sm primary" id="roAdd" style="margin-left:auto">＋ 新增人员</button>
        <button class="btn sm" id="roExp">导出人员 CSV</button>
        <button class="btn sm primary" id="exMonthRoster">全月班表</button>
        <button class="btn sm primary" id="exPersonalZip">个人月历包</button>
        ${onePersonPicker()}
      </div>
      ${demoFillBanner()}
      <div class="note" style="margin-top:8px"><span class="authtag on">绿</span> 已授权　<span class="authtag">灰</span> 未授权（需授权类：拉萨/丽江/西双版纳/西昌/西宁/大连/高原/赤峰）。克拉玛依、茅台/吕梁/忻州为级别运行限制（按座位级别，非个人授权本）。点击行可编辑健康限制与授权。</div></div>
      <div class="panel scroll" style="max-height:calc(100vh - 220px);padding:0"><table class="rost"><thead><tr>
        <th>员工号</th><th>姓名</th><th>级别</th><th>中队</th><th>帮扶</th><th>健康限制</th>
        ${authList.map(c => `<th class="ath" title="${c}">${esc(C.apName(c, st))}</th>`).join('')}
        <th>授权数</th><th></th></tr></thead><tbody>`;
    for (const p of ps) {
      const flags = C.healthFlags(p.health);
      const badges = flags.length
        ? flags.map(f => {
            const cls = f.includes('不适飞') || f.includes('体检') || f.includes('非唯一机长') ? 'hb bad'
              : f.includes('高原') || f.includes('夜间') || f.includes('月≤') ? 'hb warn' : 'hb';
            return `<span class="${cls}">${esc(f)}</span>`;
          }).join(' ')
        : '<span class="mut">—</span>';
      const authN = (p.auth || []).filter(c => authList.includes(c)).length;
      h += `<tr class="rorow" data-pid="${p.id}">
        <td class="mut">${p.id}</td><td><b>${esc(p.name)}</b></td><td>${pill(p.rank)}</td><td>${esc(p.squad || '—')}</td>
        <td class="hcell"><button type="button" class="btn sm roBangfu ${p.bangfu ? 'primary' : ''}" data-pid="${p.id}" title="切换帮扶对象">${p.bangfu ? '帮扶✓' : '—'}</button></td>
        <td class="hcell">${badges}</td>
        ${authList.map(c => `<td class="acell">${(p.auth || []).includes(c) ? '<span class="authtag on" title="已授权">✓</span>' : '<span class="authtag" title="未授权">·</span>'}</td>`).join('')}
        <td>${authN}/${nAuth}</td>
        <td><button class="btn sm roEdit" data-pid="${p.id}">编辑</button> <button class="btn sm roLeave" data-pid="${p.id}">请假</button> <button class="btn sm roSwap" data-pid="${p.id}">换班</button> <button class="btn sm roCal" data-pid="${p.id}" title="导出此人月历 CSV">月历</button></td></tr>`;
    }
    if (!ps.length) h += '<tr><td colspan="20" class="note">无匹配人员</td></tr>';
    h += '</tbody></table></div>';
    // legend level airports
    h += `<div class="panel"><h3>级别运行机场（参考）</h3><div class="note">${levelList.map(c => `${esc(C.apName(c, st))}（${esc(C.CAT_DESC[C.apCat(c, st)] || C.apCat(c, st))}）`).join('　·　') || '—'}</div></div>`;
    $('#main').innerHTML = h;
    const redraw = () => rRoster();
    bindSearchInput($('#rq'), v => { ui.rq = v; const pos = $('#rq') && $('#rq').selectionStart; redraw(); const el = $('#rq'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} } });
    $('#rg').onchange = e => { ui.rg = e.target.value; redraw(); };
    $('#rs').onchange = e => { ui.rs = e.target.value; redraw(); };
    $('#ra').onchange = e => { ui.ra = e.target.value; redraw(); };
    $('#rh').onchange = e => { ui.rh = e.target.value; redraw(); };
    $('#roAdd').onclick = () => openRosterEdit(null);
    document.querySelectorAll('.roSwap').forEach(b => b.onclick = e => { e.stopPropagation(); openTransfer(b.dataset.pid); });
    document.querySelectorAll('.roEdit').forEach(b => b.onclick = e => { e.stopPropagation(); openRosterEdit(b.dataset.pid); });
    document.querySelectorAll('.roBangfu').forEach(b => b.onclick = e => {
      e.stopPropagation(); const p = st.pilots.find(x => x.id === b.dataset.pid); if (!p) return;
      p.bangfu = !p.bangfu; pilotsChanged('bangfu'); toast(p.bangfu ? `✔ ${esc(p.name)} 已标为帮扶对象` : `✔ ${esc(p.name)} 已取消帮扶对象`);
    });
    document.querySelectorAll('.roLeave').forEach(b => b.onclick = e => {
      e.stopPropagation(); const id = b.dataset.pid; const ix = C.buildIndex(st); const nx = (ix.sched[id] || []).find(pr => pr.start + pr.ndays - 1 >= 1) || (ix.sched[id] || [])[0];
      goLeave(id, nx ? nx.start : 1, nx ? nx.start + nx.ndays - 1 : 1);
    });
    document.querySelectorAll('.rorow').forEach(r => r.ondblclick = () => openRosterEdit(r.dataset.pid));
    $('#roExp').onclick = () => {
      const rows = [['员工号', '姓名', '级别', '组别', '中队', '帮扶对象', '暂时不适飞', '限制高原', '限制夜间', '月飞行上限h', '非唯一机长', '血压备注', '体检到期', '健康备注', ...authList.map(c => C.apName(c, st) + '(' + c + ')'), '已授权数']];
      st.pilots.forEach(p => {
        const h = p.health || C.defaultHealth();
        rows.push([p.id, p.name, p.rank, C.rankGroup(p.rank), p.squad || '', p.bangfu ? '是' : '', h.noFly ? '是' : '', h.noPlateau ? '是' : '', h.noNight ? '是' : '', h.maxMonthH != null ? h.maxMonthH : '', h.noSoleCaptain ? '是' : '', h.bpNote || '', h.medExamExpiry || '', h.note || '',
          ...authList.map(c => (p.auth || []).includes(c) ? '✓' : ''), (p.auth || []).filter(c => authList.includes(c)).length]);
      });
      dl('人员总览_授权与健康_2026-11.csv', csv(rows));
      toast('✔ 已导出人员总览 CSV');
    };
    bindExportButtons();
  }
  function newPilotId() { let n = 80001; const ids = new Set(st.pilots.map(p => p.id)); while (ids.has('N' + n)) n++; return 'N' + n; }
  function openRosterEdit(pid) {
    C.migratePilots(st);
    const isNew = !pid; const p = isNew ? { id: newPilotId(), name: '', rank: 'C1', squad: (st.pilots[0] && st.pilots[0].squad) || '', auth: [], prefs: [], leave: [], health: C.defaultHealth(), bangfu: false } : st.pilots.find(x => x.id === pid); if (!p) return;
    const authList = C.authAirports(st);
    const h = Object.assign(C.defaultHealth(), p.health || {});
    // 中队选项 = 现有人员中队 ∪ 标准中队（保留当前值，避免保存时被改成列表第一项）
    const squads = [...new Set([p.squad, ...st.pilots.map(x => x.squad), ...(C.ALL_SQUADS || [])].filter(Boolean))];
    let box = `<div class="flex"><h3 style="margin:0">${isNew ? '新增人员' : '人员档案 · ' + esc(p.name) + ' ' + pill(p.rank)} <span class="mut">${p.id}</span></h3><button class="btn" style="margin-left:auto" id="mClose">关闭</button></div>
      <div class="grid g2" style="margin-top:12px">
        <div><label class="lab">员工号</label><input id="edId" value="${esc(p.id)}" ${isNew ? '' : 'disabled'}></div>
        <div><label class="lab">姓名（化名）</label><input id="edName" value="${esc(p.name)}" placeholder="化名"></div>
        <div><label class="lab">级别</label><select id="edRank">${C.RANKS.map(r => `<option ${r === p.rank ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div><label class="lab">中队</label><select id="edSquad">${squads.map(x => `<option ${x === p.squad ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div><label class="lab">体检到期日</label><input type="date" id="edMed" value="${esc(h.medExamExpiry || '')}"></div>
      </div>
      <h3 style="margin-top:14px">健康 / 身体限制</h3>
      <div class="flex" style="flex-wrap:wrap;gap:12px">
        <label><input type="checkbox" id="edNoFly" ${h.noFly ? 'checked' : ''}> 暂时不适飞</label>
        <label><input type="checkbox" id="edNoPl" ${h.noPlateau ? 'checked' : ''}> 限制高原（拉萨/高原类）</label>
        <label><input type="checkbox" id="edNoNi" ${h.noNight ? 'checked' : ''}> 限制夜间</label>
        <label><input type="checkbox" id="edNoSole" ${h.noSoleCaptain ? 'checked' : ''}> 非唯一机长（禁止C位）</label>
      </div>
      <div class="grid g2" style="margin-top:8px">
        <div><label class="lab">个人月飞行上限（小时，空=不限）</label><input type="number" id="edMaxMH" min="1" max="100" step="1" value="${h.maxMonthH != null && h.maxMonthH > 0 ? h.maxMonthH : ''}" placeholder="如 60"></div>
        <div class="note" style="align-self:end">体检合格证特殊运行限制：月≤Nh 为硬性；非唯一机长不可排 C 位，可排副驾/三。备注建议写完整限制原文。</div>
      </div>
      <div style="margin-top:8px"><label class="lab">血压相关备注</label><input id="edBp" style="width:100%" value="${esc(h.bpNote || '')}" placeholder="如：血压偏高随访、须带记录本"></div>
      <div style="margin-top:8px"><label class="lab">其他备注</label><input id="edNote" style="width:100%" value="${esc(h.note || '')}"></div>
      <h3 style="margin-top:14px">帮扶对象</h3>
      <div class="flex" style="flex-wrap:wrap;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--border,#3a424c);border-radius:8px;background:var(--panel2,#1a222c)">
        <label style="font-weight:600;cursor:pointer"><input type="checkbox" id="edBangfu" ${p.bangfu ? 'checked' : ''}> 「帮扶对象」</label>
        <span class="mut">同航班/任务机组至多一名；保存写入 p.bangfu</span>
      </div>
      <h3 style="margin-top:14px">特殊机场授权 <small>点击切换</small></h3>
      <div class="authgrid" id="edAuth">${authList.map(c => `<button type="button" class="authtag ${(p.auth || []).includes(c) ? 'on' : ''} edA" data-c="${c}">${esc(C.apName(c, st))}<span class="mut"> ${c}</span></button>`).join('')}</div>
      <div class="flex" style="margin-top:14px"><button class="btn primary" id="edSave">保存</button><button class="btn" id="edCancel">取消</button>${isNew ? '' : '<button class="btn" id="edDel" style="margin-left:auto;color:var(--red)">删除此人</button>'}<span id="edErr" class="red" style="margin-left:10px"></span></div>`;
    $('#modalBox').innerHTML = box; $('#modal').classList.remove('hidden');
    $('#mClose').onclick = $('#edCancel').onclick = closeModal;
    document.querySelectorAll('.edA').forEach(b => b.onclick = () => b.classList.toggle('on'));
    if ($('#edDel')) $('#edDel').onclick = () => { if (!confirm(`删除 ${p.name}（${p.id}）？其已排任务座位将置空。`)) return;
      st.pilots = st.pilots.filter(x => x.id !== p.id); $('#modal').classList.add('hidden'); pilotsChanged('delete'); toast('✔ 已删除 ' + esc(p.name)); };
    $('#edSave').onclick = () => {
      const name = $('#edName').value.trim(), id = $('#edId').value.trim();
      if (!name) { $('#edErr').textContent = '请填写姓名'; return; }
      if (isNew && (!id || st.pilots.some(x => x.id === id))) { $('#edErr').textContent = '员工号为空或已存在'; return; }
      const onSet = new Set([...document.querySelectorAll('.edA.on')].map(x => x.dataset.c)); const rk = $('#edRank').value;
      const lxa = [...onSet].filter(c => C.apCat(c, st) === 'LHASA');
      if (lxa.length && !C.lhasaRankOK(rk)) { $('#edErr').textContent = `拉萨资质仅限 J3 及以上（含教员）；当前级别 ${rk} 不可持有，请取消「${lxa.map(c => C.apName(c, st)).join('、')}」授权或调整级别`; return; }
      if (isNew) p.id = id; p.name = name; p.rank = $('#edRank').value;
      p.squad = $('#edSquad').value;
      p.bangfu = !!$('#edBangfu').checked;
      const mhRaw = $('#edMaxMH').value.trim();
      const mh = mhRaw === '' ? null : Math.max(1, Math.min(100, parseInt(mhRaw, 10) || 0));
      p.health = {
        noFly: $('#edNoFly').checked, noPlateau: $('#edNoPl').checked, noNight: $('#edNoNi').checked,
        noSoleCaptain: $('#edNoSole').checked, maxMonthH: mh && mh > 0 ? mh : null,
        bpNote: $('#edBp').value.trim(), medExamExpiry: $('#edMed').value || '', note: $('#edNote').value.trim()
      };
      const on = new Set([...document.querySelectorAll('.edA.on')].map(x => x.dataset.c));
      // keep non-auth-list entries if any, replace auth-list ones
      const keep = (p.auth || []).filter(c => !authList.includes(c));
      p.auth = keep.concat(authList.filter(c => on.has(c)));
      if (isNew) st.pilots.push(p);
      $('#modal').classList.add('hidden'); pilotsChanged(isNew ? 'add' : 'edit'); toast('✔ 已' + (isNew ? '新增 ' : '保存 ') + esc(p.name) + (isNew ? '' : ' 的档案'));
    };
  }

  // ---------------- 员工福利 ----------------
  function rWelfare() {
    const S = st.settings; const off = { C: Array(C.DAYS + 1).fill(0), F: Array(C.DAYS + 1).fill(0) };
    st.pilots.forEach(p => { const k = C.isFO(p.rank) ? 'F' : 'C'; new Set([...(p.prefs || []), ...(p.leave || [])]).forEach(d => off[k][d]++); });
    const per = {}; sum.per.forEach(x => per[x.id] = x);
    const days = Array.from({ length: C.DAYS }, (_, i) => i + 1);
    let h = `<div class="panel"><h3>同级别换班 <small>员工福利：同一级别人员之间单向转出或互换任务，系统自动校验休息/121.495(b)/工时/资质/搭配</small></h3><button class="btn primary" id="wfSwap">发起同级换班（转让任务）</button></div><div class="grid g2"><div class="panel"><h3>每日休息/请假人数 · 机长类 <small>不设每日上限（任意请假模式）</small></h3>${CH.bars(days.map(d => ({ label: String(d), value: off.C[d], color: '#3ea6ff' })), { w: 620, h: 200 })}</div>
      <div class="panel"><h3>每日休息/请假人数 · 副驾驶 <small>上限 ${S.maxOffFO} 人/天</small></h3>${CH.bars(days.map(d => ({ label: String(d), value: off.F[d], color: off.F[d] > S.maxOffFO ? '#ff5a6a' : '#2ecc8f' })), { w: 620, h: 200, lines: [{ v: S.maxOffFO, label: '上限', color: '#ff5a6a' }] })}</div></div>
      <div class="panel"><h3>意向休息日申报 <small>每人可申报 2 个意向休息日（排班前提交）；满足率 <b class="okc">${(sum.prefRate * 100).toFixed(1)}%</b>（${sum.prefOK}/${sum.prefT}）</small></h3>
      <div class="scroll"><table><tr><th>员工号</th><th>姓名</th><th>级别</th><th>意向休息日 1</th><th>意向休息日 2</th><th>请假日</th><th>满足情况</th></tr>
      ${st.pilots.map(p => { const opts = v => `<option value="">—</option>` + days.map(d => `<option ${v === d ? 'selected' : ''} value="${d}">${dateOf(d)} 周${WK[dow(d)]}</option>`).join('');
        const x = per[p.id]; return `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${pill(p.rank)}</td>${[0, 1].map(i => `<td><select data-pref="${p.id}" data-i="${i}">${opts((p.prefs || [])[i])}</select></td>`).join('')}
        <td class="mut">${(p.leave || []).join(',') || '—'}</td><td>${x.prefTotal ? (x.prefOK === x.prefTotal ? '<span class="okc">✔ 全部满足</span>' : `<span class="warnc">${x.prefOK}/${x.prefTotal}</span>`) : '—'}</td></tr>`; }).join('')}</table></div></div>`;
    $('#main').innerHTML = h; if ($('#wfSwap')) $('#wfSwap').onclick = () => { const top = st.pilots.slice().sort((a, b) => (sum.per.find(x => x.id === b.id) || {}).hours - (sum.per.find(x => x.id === a.id) || {}).hours)[0]; openTransfer(top.id); };
    document.querySelectorAll('[data-pref]').forEach(sel => sel.onchange = () => {
      const p = st.pilots.find(x => x.id === sel.dataset.pref); const i = +sel.dataset.i; const v = sel.value ? +sel.value : null;
      const prefs = (p.prefs || []).slice(); if (v) { const k = C.isFO(p.rank) ? 'F' : 'C'; const lim = k === 'F' ? S.maxOffFO : S.maxOffCapt;
        if (!prefs.includes(v) && !(p.leave || []).includes(v) && off[k][v] >= lim) { toast(`${dateOf(v)} ${k === 'F' ? '副驾驶' : '机长类'}休息人数已达上限 ${lim}，请选择其他日期`); return rWelfare(); } }
      prefs[i] = v; p.prefs = [...new Set(prefs.filter(Boolean))].sort((a, b) => a - b); refresh(); toast('已保存。重新“一键自动填人”可按新意向排班'); });
  }



  // ---------------- 同级别换班（员工福利） ----------------
  // openSwap(甲员工号, 预选任务号?)：选同级别乙 → 勾选双方要交换的任务（单向或互换）→ 预览校验（休息/121.495(b)/工时上限/资质/搭配）→ 确认写入并全局同步
  function openSwap(aId, prId) {
    const pmap = pm(); let A = pmap[aId] || st.pilots[0]; let bId = null; const selA = new Set(prId ? [prId] : []), selB = new Set(); let plan = null;
    const schedOf = id => st.pairings.filter(p => Object.values(p.crew).includes(id)).sort((x, y) => x.start - y.start);
    const prLine = (pr, id) => { const s = ['C', 'F', 'T'].find(k => pr.crew[k] === id); return `${pr.id} · ${dateOf(pr.start)}${pr.ndays > 1 ? '–' + dateOf(pr.start + pr.ndays - 1) : ''} · ${C.SLOT_NAME[s] || s} · ${C.pairingHours(pr).toFixed(1)}h · ${esc([pr.legs[0].from, ...pr.legs.map(l => l.to)].map(c => C.apName(c, st)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).join('-'))}`; };
    const idx = C.buildIndex(st);
    const draw = () => {
      const peers = st.pilots.filter(p => p.rank === A.rank && p.id !== A.id).sort((x, y) => idx.hours[x.id] - idx.hours[y.id]);
      if (bId && !peers.some(p => p.id === bId)) bId = null;
      const B = bId && pmap[bId];
      const list = (id, sel, cls) => schedOf(id).map(pr => `<label class="swrow"><input type="checkbox" class="${cls}" value="${pr.id}" ${sel.has(pr.id) ? 'checked' : ''}> ${prLine(pr, id)}</label>`).join('') || '<div class="mut">本月无任务</div>';
      const pv = plan ? `<div class="swpv ${plan.ok ? 'ok' : 'bad'}"><b>${plan.ok ? '✔ 可换班' : '✖ 不可换班'}</b>
          ${plan.issues.map(x => `<div class="red">· ${esc(x)}</div>`).join('')}
          ${plan.newHard.map(v => `<div class="red">· 新增硬违规：${esc(v.msg)}</div>`).join('')}
          ${plan.newSoft.map(v => `<div class="warnc">· 软提示：${esc(v.msg)}</div>`).join('')}
          ${plan.resolved.length ? `<div class="okc">· 消除 ${plan.resolved.length} 项：${plan.resolved.map(v => esc(v.type)).join('、')}</div>` : ''}
          ${plan.moves.length ? `<table style="margin-top:6px"><tr><th>人员</th><th>换班前</th><th>换班后</th></tr>${[plan.a, plan.b].map(id => `<tr><td>${esc(pmap[id].name)} ${pill(pmap[id].rank)}</td><td>${plan.hours[id][0].toFixed(1)}h</td><td><b>${plan.hours[id][1].toFixed(1)}h</b></td></tr>`).join('')}</table>
          <div class="mut">${plan.moves.map(m => `${m.pairing} ${C.SLOT_NAME[m.slot] || m.slot}：${esc(pmap[m.from].name)} → ${esc(pmap[m.to].name)}`).join('；')}</div>` : ''}</div>` : '';
      $('#modalBox').innerHTML = `<div class="flex"><h3 style="margin:0">同级别换班 <small>员工福利 · 仅限同一级别；可单向转出或互换</small></h3><button class="btn" style="margin-left:auto" id="swClose">关闭</button></div>
        <div class="grid g2" style="margin-top:10px">
          <div><label class="lab">甲方</label><select id="swA">${st.pilots.slice().sort((x, y) => x.rank.localeCompare(y.rank) || x.id.localeCompare(y.id)).map(p => `<option value="${p.id}" ${p.id === A.id ? 'selected' : ''}>${esc(p.name)} · ${p.rank} · ${idx.hours[p.id].toFixed(1)}h</option>`).join('')}</select>
            <div class="mut" style="margin:6px 0 2px">勾选：甲 → 乙 的任务</div><div class="swlist">${list(A.id, selA, 'swa')}</div></div>
          <div><label class="lab">乙方（同级别 ${A.rank}，按工时升序）</label><select id="swB"><option value="">— 选择 —</option>${peers.map(p => `<option value="${p.id}" ${p.id === bId ? 'selected' : ''}>${esc(p.name)} · ${idx.hours[p.id].toFixed(1)}h${p.squad ? ' · ' + esc(p.squad) : ''}</option>`).join('')}</select>
            <div class="mut" style="margin:6px 0 2px">勾选：乙 → 甲 的任务（不勾即单向）</div><div class="swlist">${B ? list(B.id, selB, 'swb') : '<div class="mut">先选乙方</div>'}</div></div>
        </div>${pv}
        <div class="flex" style="margin-top:12px;gap:8px"><button class="btn" id="swPrev" ${bId ? '' : 'disabled'}>预览校验</button><button class="btn primary" id="swApply" ${plan && plan.ok ? '' : 'disabled'}>确认换班</button></div>`;
      $('#modal').classList.remove('hidden');
      $('#swClose').onclick = () => $('#modal').classList.add('hidden');
      $('#swA').onchange = e => { A = pmap[e.target.value]; selA.clear(); selB.clear(); plan = null; draw(); };
      $('#swB').onchange = e => { bId = e.target.value || null; selB.clear(); plan = null; draw(); };
      document.querySelectorAll('.swa').forEach(c => c.onchange = () => { c.checked ? selA.add(c.value) : selA.delete(c.value); plan = null; draw(); });
      document.querySelectorAll('.swb').forEach(c => c.onchange = () => { c.checked ? selB.add(c.value) : selB.delete(c.value); plan = null; draw(); });
      $('#swPrev').onclick = () => { plan = C.swapPreview(st, A.id, bId, [...selA], [...selB]); draw(); };
      $('#swApply').onclick = () => { if (!plan || !plan.ok) return; C.applySwap(st, plan, '同级换班'); $('#modal').classList.add('hidden');
        try { leaveOpts = null; leaveHoles = null; dutyOpts = null; } catch (e) {} refresh(); toast(`✔ 已换班：${esc(pmap[plan.a].name)} ⇄ ${esc(pmap[plan.b].name)}（${plan.moves.length} 个任务）`); };
    };
    draw();
  }

  // ---------------- 同级转让（主流程：任务优先） ----------------
  // 选某人的一个任务 → 列出同级、该时段空闲且全部合规的人（工时升序）→ 预览 → 一键转给他；互换为次要选项
  function openTransfer(fromId, prId) {
    const pmap = pm(); let A = pmap[fromId] || st.pilots[0]; let P = prId || null; let pick = null, plan = null;
    const idx = C.buildIndex(st);
    const fh = x => x == null ? '—' : x.toFixed(1) + 'h';
    const draw = () => {
      const mine = st.pairings.filter(p => Object.values(p.crew).includes(A.id)).sort((x, y) => x.start - y.start);
      if (P && !mine.some(p => p.id === P)) P = null;
      const cands = P ? C.transferCandidates(st, P, A.id) : []; const okc = cands.filter(c => c.ok), bad = cands.filter(c => !c.ok);
      const pr = P && st.pairings.find(x => x.id === P);
      const rows = okc.map(c => `<tr class="${pick === c.p.id ? 'on' : ''}"><td><b>${esc(c.p.name)}</b> <span class="mut">${c.p.id}</span>${c.p.squad ? `<div class="mut">${esc(c.p.squad)}</div>` : ''}</td>
          <td>${fh(c.hoursBefore)} → <b>${fh(c.hoursAfter)}</b></td><td>${fh(c.restBefore)}</td><td>${fh(c.restAfter)}</td>
          <td>${c.soft.length ? c.soft.map(s => `<div class="warnc">· ${esc(s)}</div>`).join('') : '<span class="okc">—</span>'}</td>
          <td><button class="btn sm ${pick === c.p.id ? 'primary' : ''} tfPick" data-to="${c.p.id}">${pick === c.p.id ? '已选' : '预览'}</button></td></tr>`).join('');
      const pv = plan ? `<div class="swpv ${plan.ok ? 'ok' : 'bad'}"><b>${plan.ok ? '✔ 可转让' : '✖ 不可转让'}</b> ${esc(pr.id)}：${esc(A.name)}（${fh(plan.hours[A.id][0])}→${fh(plan.hours[A.id][1])}）→ ${esc(pmap[pick].name)}（${fh(plan.hours[pick][0])}→${fh(plan.hours[pick][1])}）
          ${plan.issues.concat(plan.newHard.map(v => '新增硬违规：' + v.msg)).map(x => `<div class="red">· ${esc(x)}</div>`).join('')}${plan.newSoft.map(v => `<div class="warnc">· ${esc(v.msg)}</div>`).join('')}
          ${plan.resolved.length ? `<div class="okc">· 同时消除：${plan.resolved.map(v => esc(v.type)).join('、')}</div>` : ''}</div>` : '';
      $('#modalBox').innerHTML = `<div class="flex"><h3 style="margin:0">同级换班 · 转让任务 <small>员工福利：把任务转给同级别、该时段休息/空闲且全部合规的人</small></h3><button class="btn" style="margin-left:auto" id="tfClose">关闭</button></div>
        <div class="grid g2" style="margin-top:10px">
          <div><label class="lab">转出人</label><select id="tfA">${st.pilots.slice().sort((x, y) => x.rank.localeCompare(y.rank) || x.id.localeCompare(y.id)).map(p => `<option value="${p.id}" ${p.id === A.id ? 'selected' : ''}>${esc(p.name)} · ${p.rank} · ${idx.hours[p.id].toFixed(1)}h</option>`).join('')}</select></div>
          <div><label class="lab">要转出的任务</label><select id="tfP"><option value="">— 选择任务 —</option>${mine.map(p => { const s = ['C', 'F', 'T'].find(k => p.crew[k] === A.id); return `<option value="${p.id}" ${p.id === P ? 'selected' : ''}>${p.id} · ${dateOf(p.start)}${p.ndays > 1 ? '–' + dateOf(p.start + p.ndays - 1) : ''} · ${C.SLOT_NAME[s] || s} · ${C.pairingHours(p).toFixed(1)}h</option>`; }).join('')}</select></div>
        </div>
        ${P ? `<div class="note" style="margin-top:8px">同级 ${A.rank} 共 ${cands.length} 人：<b class="okc">${okc.length} 人空闲且合规</b>（按工时升序）· ${bad.length} 人不可（请假/疗养/备份/培训/模拟机/时间冲突/休息/121.495(b)/工时上限/资质/搭配）。申请的意向休息日属普通休息，可用但会提示；已批准请假/疗养不可用。</div>
          <div class="scroll" style="max-height:300px;margin-top:6px"><table class="tftab"><tr><th>同级人员</th><th>本月工时 前→后</th><th>任务前休息</th><th>任务后休息</th><th>软提示</th><th></th></tr>${rows || '<tr><td colspan="6" class="mut">无空闲合规的同级人员，可尝试「改为互换」</td></tr>'}</table></div>
          <details class="slot-bad"><summary>${bad.length} 名同级不可 — 查看原因</summary><div class="inel"><table>${bad.slice(0, 40).map(c => `<tr><td>${esc(c.p.name)}</td><td>${fh(c.hoursBefore)}</td><td class="mut">${c.reasons.map(esc).join('；')}</td></tr>`).join('')}</table></div></details>` : '<div class="mut" style="margin-top:8px">先选择要转出的任务</div>'}
        ${pv}
        <div class="flex" style="margin-top:12px;gap:8px"><button class="btn primary" id="tfApply" ${plan && plan.ok ? '' : 'disabled'}>确认转让</button><button class="btn" id="tfMutual">改为互换（两人交换任务）</button></div>`;
      $('#modal').classList.remove('hidden');
      $('#tfClose').onclick = () => $('#modal').classList.add('hidden');
      $('#tfA').onchange = e => { A = pmap[e.target.value]; P = null; pick = null; plan = null; draw(); };
      $('#tfP').onchange = e => { P = e.target.value || null; pick = null; plan = null; draw(); };
      document.querySelectorAll('.tfPick').forEach(b => b.onclick = () => { pick = b.dataset.to; plan = C.swapPreview(st, A.id, pick, [P], []); draw(); });
      $('#tfMutual').onclick = () => openSwap(A.id, P);
      $('#tfApply').onclick = () => { if (!plan || !plan.ok) return; C.applySwap(st, plan, '同级转让'); $('#modal').classList.add('hidden');
        try { leaveOpts = null; leaveHoles = null; dutyOpts = null; } catch (e) {} refresh(); toast(`✔ 已转让 ${esc(P)}：${esc(A.name)} → ${esc(pmap[pick].name)}`); };
    };
    draw();
  }
