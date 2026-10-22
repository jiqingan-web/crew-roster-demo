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
        <select id="rh">${['全部', '有限制', '不适飞', '限制高原', '限制夜间', '月≤60h', '非唯一机长'].map(g => `<option ${g === ui.rh ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <span class="mut">${ps.length}/${st.pilots.length} 人 · 有健康限制 ${nRest} 人 · 授权机场 ${nAuth} 个</span>
        <button class="btn sm" id="roExp" style="margin-left:auto">导出人员 CSV</button>
        <button class="btn sm primary" id="exMonthRoster">全月班表</button>
        <button class="btn sm primary" id="exPersonalZip">个人月历包</button>
        ${onePersonPicker()}
      </div>
      ${demoFillBanner()}
      <div class="note" style="margin-top:8px"><span class="authtag on">绿</span> 已授权　<span class="authtag">灰</span> 未授权（需授权类：拉萨/丽江/西双版纳/西昌/西宁/大连/高原/赤峰）。克拉玛依、茅台/吕梁/忻州为级别运行限制（按座位级别，非个人授权本）。点击行可编辑健康限制与授权。</div></div>
      <div class="panel scroll" style="max-height:calc(100vh - 220px);padding:0"><table class="rost"><thead><tr>
        <th>员工号</th><th>姓名</th><th>级别</th><th>中队</th><th>健康限制</th>
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
        <td class="hcell">${badges}</td>
        ${authList.map(c => `<td class="acell">${(p.auth || []).includes(c) ? '<span class="authtag on" title="已授权">✓</span>' : '<span class="authtag" title="未授权">·</span>'}</td>`).join('')}
        <td>${authN}/${nAuth}</td>
        <td><button class="btn sm roEdit" data-pid="${p.id}">编辑</button> <button class="btn sm roLeave" data-pid="${p.id}">请假</button> <button class="btn sm roCal" data-pid="${p.id}" title="导出此人月历 CSV">月历</button></td></tr>`;
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
    document.querySelectorAll('.roEdit').forEach(b => b.onclick = e => { e.stopPropagation(); openRosterEdit(b.dataset.pid); });
    document.querySelectorAll('.roLeave').forEach(b => b.onclick = e => {
      e.stopPropagation(); const id = b.dataset.pid; const ix = C.buildIndex(st); const nx = (ix.sched[id] || []).find(pr => pr.start + pr.ndays - 1 >= 1) || (ix.sched[id] || [])[0];
      goLeave(id, nx ? nx.start : 1, nx ? nx.start + nx.ndays - 1 : 1);
    });
    document.querySelectorAll('.rorow').forEach(r => r.ondblclick = () => openRosterEdit(r.dataset.pid));
    $('#roExp').onclick = () => {
      const rows = [['员工号', '姓名', '级别', '组别', '中队', '暂时不适飞', '限制高原', '限制夜间', '月飞行上限h', '非唯一机长', '血压备注', '体检到期', '健康备注', ...authList.map(c => C.apName(c, st) + '(' + c + ')'), '已授权数']];
      st.pilots.forEach(p => {
        const h = p.health || C.defaultHealth();
        rows.push([p.id, p.name, p.rank, C.rankGroup(p.rank), p.squad || '', h.noFly ? '是' : '', h.noPlateau ? '是' : '', h.noNight ? '是' : '', h.maxMonthH != null ? h.maxMonthH : '', h.noSoleCaptain ? '是' : '', h.bpNote || '', h.medExamExpiry || '', h.note || '',
          ...authList.map(c => (p.auth || []).includes(c) ? '✓' : ''), (p.auth || []).filter(c => authList.includes(c)).length]);
      });
      dl('人员总览_授权与健康_2026-11.csv', csv(rows));
      toast('✔ 已导出人员总览 CSV');
    };
    bindExportButtons();
  }
  function openRosterEdit(pid) {
    C.migratePilots(st);
    const p = st.pilots.find(x => x.id === pid); if (!p) return;
    const authList = C.authAirports(st);
    const h = Object.assign(C.defaultHealth(), p.health || {});
    const squads = C.ALL_SQUADS || ['空客一中队','空客二中队','空客三中队','空客四中队','空客五中队','空客六中队','空客七中队','空客八中队','C909一中队','C909二中队','C909三中队'];
    let box = `<div class="flex"><h3 style="margin:0">人员档案 · ${esc(p.name)} ${pill(p.rank)} <span class="mut">${p.id}</span></h3><button class="btn" style="margin-left:auto" id="mClose">关闭</button></div>
      <div class="grid g2" style="margin-top:12px">
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
      <h3 style="margin-top:14px">特殊机场授权 <small>点击切换</small></h3>
      <div class="authgrid" id="edAuth">${authList.map(c => `<button type="button" class="authtag ${(p.auth || []).includes(c) ? 'on' : ''} edA" data-c="${c}">${esc(C.apName(c, st))}<span class="mut"> ${c}</span></button>`).join('')}</div>
      <div class="flex" style="margin-top:14px"><button class="btn primary" id="edSave">保存</button><button class="btn" id="edCancel">取消</button></div>`;
    $('#modalBox').innerHTML = box; $('#modal').classList.remove('hidden');
    $('#mClose').onclick = $('#edCancel').onclick = closeModal;
    document.querySelectorAll('.edA').forEach(b => b.onclick = () => b.classList.toggle('on'));
    $('#edSave').onclick = () => {
      p.squad = $('#edSquad').value;
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
      closeModal(); refresh(); toast('✔ 已保存 ' + esc(p.name) + ' 的档案');
    };
  }

  // ---------------- 员工福利 ----------------
  function rWelfare() {
    const S = st.settings; const off = { C: Array(C.DAYS + 1).fill(0), F: Array(C.DAYS + 1).fill(0) };
    st.pilots.forEach(p => { const k = C.isFO(p.rank) ? 'F' : 'C'; new Set([...(p.prefs || []), ...(p.leave || [])]).forEach(d => off[k][d]++); });
    const per = {}; sum.per.forEach(x => per[x.id] = x);
    const days = Array.from({ length: C.DAYS }, (_, i) => i + 1);
    let h = `<div class="grid g2"><div class="panel"><h3>每日休息/请假人数 · 机长类 <small>上限 ${S.maxOffCapt} 人/天</small></h3>${CH.bars(days.map(d => ({ label: String(d), value: off.C[d], color: off.C[d] > S.maxOffCapt ? '#ff5a6a' : '#3ea6ff' })), { w: 620, h: 200, lines: [{ v: S.maxOffCapt, label: '上限', color: '#ff5a6a' }] })}</div>
      <div class="panel"><h3>每日休息/请假人数 · 副驾驶 <small>上限 ${S.maxOffFO} 人/天</small></h3>${CH.bars(days.map(d => ({ label: String(d), value: off.F[d], color: off.F[d] > S.maxOffFO ? '#ff5a6a' : '#2ecc8f' })), { w: 620, h: 200, lines: [{ v: S.maxOffFO, label: '上限', color: '#ff5a6a' }] })}</div></div>
      <div class="panel"><h3>意向休息日申报 <small>每人可申报 2 个意向休息日（排班前提交）；满足率 <b class="okc">${(sum.prefRate * 100).toFixed(1)}%</b>（${sum.prefOK}/${sum.prefT}）</small></h3>
      <div class="scroll"><table><tr><th>员工号</th><th>姓名</th><th>级别</th><th>意向休息日 1</th><th>意向休息日 2</th><th>请假日</th><th>满足情况</th></tr>
      ${st.pilots.map(p => { const opts = v => `<option value="">—</option>` + days.map(d => `<option ${v === d ? 'selected' : ''} value="${d}">${dateOf(d)} 周${WK[dow(d)]}</option>`).join('');
        const x = per[p.id]; return `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${pill(p.rank)}</td>${[0, 1].map(i => `<td><select data-pref="${p.id}" data-i="${i}">${opts((p.prefs || [])[i])}</select></td>`).join('')}
        <td class="mut">${(p.leave || []).join(',') || '—'}</td><td>${x.prefTotal ? (x.prefOK === x.prefTotal ? '<span class="okc">✔ 全部满足</span>' : `<span class="warnc">${x.prefOK}/${x.prefTotal}</span>`) : '—'}</td></tr>`; }).join('')}</table></div></div>`;
    $('#main').innerHTML = h;
    document.querySelectorAll('[data-pref]').forEach(sel => sel.onchange = () => {
      const p = st.pilots.find(x => x.id === sel.dataset.pref); const i = +sel.dataset.i; const v = sel.value ? +sel.value : null;
      const prefs = (p.prefs || []).slice(); if (v) { const k = C.isFO(p.rank) ? 'F' : 'C'; const lim = k === 'F' ? S.maxOffFO : S.maxOffCapt;
        if (!prefs.includes(v) && !(p.leave || []).includes(v) && off[k][v] >= lim) { toast(`${dateOf(v)} ${k === 'F' ? '副驾驶' : '机长类'}休息人数已达上限 ${lim}，请选择其他日期`); return rWelfare(); } }
      prefs[i] = v; p.prefs = [...new Set(prefs.filter(Boolean))].sort((a, b) => a - b); refresh(); toast('已保存。重新“一键自动填人”可按新意向排班'); });
  }


