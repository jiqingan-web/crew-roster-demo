/* 机组排班助手 - 界面 · editor.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  // ---------------- 编辑弹窗 ----------------
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.mLeave'); if (!b) return; const box = b.closest('[data-pr]'); const pr = st.pairings.find(x => x.id === (box ? box.dataset.pr : '')); if (!pr) return; closeDrawer(); closeModal(); goLeave(b.dataset.pid, pr.start, pr.start + pr.ndays - 1); });
  function openEdit(id) { openDrawer(id); }
  function editInto(id, BOX) {
    BOX.dataset.pr = id;
    $('#tip').classList.add('hidden');
    const pr = st.pairings.find(x => x.id === id); const m = pm();
    const sp = C.specialAirportsOf(pr, st); const bpt = pr.legs.filter(l => (st.settings.bpTesterAirports || []).includes(l.from));
    const draft = { C: pr.crew.C || null, F: pr.crew.F || null, T: pr.crew.T || null };
    const orig = { C: draft.C, F: draft.F, T: draft.T };
    let h = `<div class="flex"><a href="#" id="mClose" class="drw-back">← 返回详情</a><span class="mut" style="margin-left:auto">任务 ${pr.id}${fillBadge(pr.id)}${demoTag(pr)} · ${dateOf(pr.start)} 起 ${pr.ndays} 天 · ${pr.ac} · ${C.pairingHours(pr).toFixed(1)}h</span></div>
      <div class="flex" style="margin-top:6px;flex-wrap:wrap"><span class="mut">临时请假（本任务日期 ${pr.start}–${pr.start + pr.ndays - 1} 日）：</span>${['C', 'F', 'T'].filter(x => pr.crew[x] && m[pr.crew[x]]).map(x => `<button class="btn sm mLeave" data-pid="${pr.crew[x]}">${C.SLOT_NAME[x]} ${esc(m[pr.crew[x]].name)} 请假 → 生成方案</button>`).join('')}</div>
      <table class="legtbl"><thead><tr><th>日</th><th>航班</th><th>航段</th><th>机号</th><th>时刻</th><th>备注</th></tr></thead><tbody>${pr.legs.map(l => { const dd = Math.floor(l.dep / C.DAY) + 1; const md = String(C.MONTH).padStart(2,'0') + '/' + String(dd).padStart(2,'0'); const notes = [l.from, l.to].filter(c => C.isSpecial(c, st)).map(c => `<span class="red">${esc((C.CAT_DESC[C.apCat(c, st)] || '').split('：')[0].split('(')[0])}</span>`).join(' '); return `<tr><td class="nowrap">${md} D${l.d}</td><td>${esc(C.fltLabel(l))}${l.pos ? '<sup class="mut">调</sup>' : ''}</td><td class="legair"><span class="${C.isSpecial(l.from,st)?'red':''}">${esc(C.apName(l.from,st))}</span><span class="mut">→</span><span class="${C.isSpecial(l.to,st)?'red':''}">${esc(C.apName(l.to,st))}</span></td><td class="nowrap reg">${esc(l.reg || '—')}</td><td class="nowrap">${C.fmtT(l.dep)}-${C.fmtT(l.arr)}</td><td class="legnote">${notes}${(st.settings.bpTesterAirports || []).includes(l.from) ? ' <span class="warnc">血压仪</span>' : ''}${C.isNightLeg(l) ? ' <span class="warnc">夜</span>' : ''}${l.ac === 'A321' ? ' A321' : ''}</td></tr>`; }).join('')}</tbody></table>
      ${sp.length ? `<div class="note red">本任务涉及特殊机场：${sp.map(c => C.apName(c, st) + '(' + c + ')').join('、')}，执行左右座均需持有该机场授权</div>` : ''}
      ${bpt.length ? `<div class="note warnc">提醒：自 ${[...new Set(bpt.map(l => C.apName(l.from, st)))].join('、')} 出港，始发站须配备血压测试仪</div>` : ''}
      <h3 style="margin-top:14px">机组 <small class="mut">点选候选人后须点「确定」才写入；关闭不保存</small></h3><div id="slots"></div><div id="crewChk" class="note"></div>
      <div class="edit-foot"><div id="editDiff" class="mut">尚未选择变更</div>
        <button class="btn primary" id="mConfirm" disabled>确定</button>
        <button class="btn" id="mCancel">取消</button></div>`;
    BOX.innerHTML = h;
    $('#mClose').onclick = e => { e.preventDefault(); openDrawer(id); }; $('#mCancel').onclick = () => openDrawer(id);
    const drawSlots_q = { C: '', F: '', T: '' };
    const dirty = () => ['C', 'F', 'T'].some(s => (draft[s] || null) !== (orig[s] || null));
    const diffHtml = () => {
      if (!dirty()) return '尚未选择变更 · 点选下拉仅预览，须点「确定」写入各甘特';
      return ['C', 'F', 'T'].filter(s => (draft[s] || null) !== (orig[s] || null)).map(s => {
        const a = nameOf(orig[s]), b = nameOf(draft[s]);
        return `<b>${C.SLOT_NAME[s]}</b> ${esc(a)} → <b class="okc">${esc(b)}</b>`;
      }).join('　·　');
    };
    const slotQ = drawSlots_q;
    const optHtml = (ok, slot, cur, changed) => ok.map(c => {
      const tag = [esc(c.p.name), c.p.rank, c.hours.toFixed(1) + 'h', c.p.squad ? esc(c.p.squad) : '', c.standby && c.standby.length ? '★备份' : '', c.p.id === orig[slot] && changed ? '原任' : '', !c.ok && c.p.id !== orig[slot] ? '✖' : ''].filter(Boolean).join(' · ');
      return `<option value="${c.p.id}" ${c.p.id === cur ? 'selected' : ''} title="${esc(c.p.name)} ${c.p.rank} ${c.p.id} ${c.hours.toFixed(1)}h">${tag}</option>`;
    }).join('');
    const slotCache = {}; const forcedDraft = {};
    const drawSlots = () => {
      let s = '';
      for (const slot of ['C', 'F', 'T']) {
        const cs = C.candidates(st, pr, slot); const cur = draft[slot];
        const okAll = cs.filter(c => c.ok || c.p.id === cur || c.p.id === orig[slot]);
        slotCache[slot] = okAll;
        const ok = okAll.filter(c => c.p.id === cur || C.pilotMatches(c.p, slotQ[slot]));
        const bad = cs.filter(c => !c.ok && c.p.id !== cur && c.p.id !== orig[slot] && C.slotRankOK(slot, c.p.rank, draft.C && pm()[draft.C] ? pm()[draft.C].rank : null));
        const changed = (draft[slot] || null) !== (orig[slot] || null);
        s += `<div class="slotbox ${changed ? 'pending' : ''}">
            <div class="slot-h"><b>${slot === 'T' ? '观察员' : (C.SLOT_NAME[slot] + '位' + (slot === 'F' && draft.F && pm()[draft.F] && C.INSTR.includes(pm()[draft.F].rank) ? '（教员带飞）' : ''))}</b>
              <input class="candq" data-q="${slot}" placeholder="搜索姓名/工号/级别/中队/拼音" value="${esc(slotQ[slot] || '')}">
              <span class="mut candn" data-n="${slot}">${ok.length}/${okAll.length}</span>
              ${changed ? '<span class="pendtag">待确定</span>' : ''}
              ${orig[slot] ? `<button class="btn sm swSlot" data-sw="${orig[slot]}" title="与同级别人员换班">同级换班</button>` : ''}
            </div>
            <select class="slot-sel" data-slot="${slot}" size="1"><option value="">— 空缺 —</option>${optHtml(ok, slot, cur, changed)}</select>
            <div class="candlist">${ok.slice(0, 12).map(c => `<div class="candline ${c.p.id === cur ? 'on' : ''} ${!c.ok ? 'bad' : ''}" data-pick="${slot}:${c.p.id}"><span class="cn">${esc(c.p.name)}</span> ${pill(c.p.rank)} <span class="mut">${c.hours.toFixed(1)}h${c.p.squad ? ' · ' + esc(c.p.squad) : ''}${c.standby && c.standby.length ? ' · ★备份' : ''}</span></div>`).join('')}${ok.length > 12 ? `<div class="mut candmore">…另有 ${ok.length - 12} 人，可用搜索过滤</div>` : ''}</div>
          </div>
          ${!cur && !cs.some(c => c.ok && !c.crewWarn) ? diagHtml(C.holeDiagnosis(st, pr, slot)) : ''}${forcedDraft[slot] && draft[slot] ? `<div class="forcetag">⚠ 强制指派（越过合规检查，确定后记入校验）</div>` : ''}
          <details class="slot-bad" ${!cur && !cs.some(c => c.ok) ? 'open' : ''}><summary>${bad.length} 名不合规 — 查看原因 / 强制指派</summary><div class="inel"><table>${bad.slice(0, 40).map(c => `<tr><td>${esc(c.p.name)}</td><td>${pill(c.p.rank)}</td><td>${c.hours.toFixed(1)}h</td><td class="mut">${c.reasons.map(esc).join('；')}</td><td><button class="btn sm forceBtn" data-force="${slot}:${c.p.id}">强制指派</button></td></tr>`).join('')}</table></div></details>`;
      }
      $('#slots').innerHTML = s;
      // 用草稿机组做合规预览（临时挂到对象上再还原）
      const bak = { C: pr.crew.C, F: pr.crew.F, T: pr.crew.T };
      pr.crew.C = draft.C; pr.crew.F = draft.F; pr.crew.T = draft.T;
      const crew = ['C', 'F', 'T'].map(x => draft[x] && pm()[draft[x]]); const iss = C.crewIssue(pr, crew, st);
      pr.crew.C = bak.C; pr.crew.F = bak.F; pr.crew.T = bak.T;
      $('#crewChk').innerHTML = crew.every(Boolean) ? (iss ? `<span class="red">✖ ${esc(iss)}</span>` : '<span class="okc">✔ 机组组合满足全部航段座位搭配、特殊机场及新机长带飞规则</span>') : '<span class="warnc">机组未满员</span>';
      $('#editDiff').innerHTML = diffHtml();
      const btn = $('#mConfirm'); btn.disabled = !dirty();
      document.querySelectorAll('#slots select').forEach(sel => sel.onchange = () => {
        draft[sel.dataset.slot] = sel.value || null; forcedDraft[sel.dataset.slot] = false;
        drawSlots();
      });
      document.querySelectorAll('#slots .candq').forEach(inp => {
        const apply = () => {
          const slot = inp.dataset.q; slotQ[slot] = inp.value; const cur = draft[slot];
          const okAll = slotCache[slot] || []; const ok = okAll.filter(c => c.p.id === cur || C.pilotMatches(c.p, inp.value));
          const changed = (draft[slot] || null) !== (orig[slot] || null);
          const sel = document.querySelector(`#slots select[data-slot="${slot}"]`);
          const keep = sel.value;
          sel.innerHTML = '<option value="">— 空缺 —</option>' + optHtml(ok, slot, cur, changed);
          if (keep) sel.value = keep;
          document.querySelector(`#slots .candn[data-n="${slot}"]`).textContent = ok.length + '/' + okAll.length;
        };
        bindSearchInput(inp, apply);
      });
      document.querySelectorAll('#slots .swSlot').forEach(b => b.onclick = e => { e.preventDefault(); closeDrawer(); openSwap(b.dataset.sw, pr.id); });
      document.querySelectorAll('#slots .forceBtn').forEach(b => b.onclick = e => { e.preventDefault(); const [slot, id] = b.dataset.force.split(':'); const c = (C.candidates(st, pr, slot).find(x => x.p.id === id) || { reasons: [] });
        if (!confirm(`强制指派 ${nameOf(id)} 到 ${C.SLOT_NAME[slot] || slot}位？\n将越过：${c.reasons.join('；') || '—'}\n确定后该指派会在校验中标记为「强制指派」，相关违规仍会报出。`)) return;
        draft[slot] = id; forcedDraft[slot] = true; drawSlots(); });
      document.querySelectorAll('#slots .candline[data-pick]').forEach(row => row.onclick = () => {
        const [slot, id] = row.dataset.pick.split(':');
        draft[slot] = id; forcedDraft[slot] = false; drawSlots();
      });
    };
    $('#mConfirm').onclick = () => {
      if (!dirty()) return;
      const changes = ['C', 'F', 'T'].filter(s => (draft[s] || null) !== (orig[s] || null));
      const snap = JSON.stringify(st);
      changes.forEach(slot => {
        const fromId = orig[slot], toId = draft[slot];
        if (toId && forcedDraft[slot]) { pr.crew[slot] = fromId; C.forceAssign(st, pr.id, slot, toId, '手工强制指派'); } else if (pr.forced) delete pr.forced[slot];
        pr.crew[slot] = toId;
        if (toId && st.standby && st.standby[toId]) {
          const td = C.daysTouched(pr, st);
          st.standby[toId] = st.standby[toId].filter(d => !td.includes(d));
        }
        if (toId) recordFillEdit(pr, slot, fromId, toId);
      });
      const parts = changes.map(s => `${C.SLOT_NAME[s]} ${nameOf(orig[s])}→${nameOf(draft[s])}`);
      leaveHist.push({ snap, label: `${pr.id} 手工换人：${parts.join('，')}`, time: new Date().toTimeString().slice(0, 8) });
      const pilots = changes.flatMap(s => [orig[s], draft[s]]);
      closeDrawer();
      // 先刷新摘要再判定合规，便于去掉 viol、点亮绿灯
      sum = C.summarize(st);
      const okNow = crewComplianceOk(pr);
      const light = okNow ? ' <span class="okc">● 合规</span>' : (pr.crew.C && pr.crew.F && pr.crew.T ? ' <span class="warnc">● 仍有问题</span>' : ' <span class="warnc">● 未满员</span>');
      commitHighlight({
        pairings: [pr.id], pilots, days: C.daysTouched(pr, st), ok: okNow,
        toast: `✔ 已更新：${esc(pr.id)} ${parts.map(esc).join('；')}${light} <a href="#" id="tUndo" style="color:#9fd4ff">撤销</a>`,
        undo: undoLeave
      });
    };
    drawSlots();
  }
  function closeModal() { $('#modal').classList.add('hidden'); render(); }

  // ---------------- 任务视图 ----------------
  function rTaskList() {
    const m = pm(); const V = violByPairing();
    let ps = st.pairings.slice();
    if (ui.tf === '未满员') ps = ps.filter(p => !(p.crew.C && p.crew.F && p.crew.T));
    if (ui.tf === '已满员') ps = ps.filter(p => p.crew.C && p.crew.F && p.crew.T);
    if (ui.tf === '有违规') ps = ps.filter(p => V[p.id]);
    if (ui.tf === '特殊机场') ps = ps.filter(p => C.specialAirportsOf(p, st).length);
    if (ui.tf === '执勤高/中风险') ps = ps.filter(p => ['over', 'high', 'med'].includes(C.pairingRisk(p, st).risk));
    if (ui.tq) ps = ps.filter(p => JSON.stringify(p.legs).includes(ui.tq) || p.id.includes(ui.tq) || p.legs.some(l => C.apName(l.to, st).includes(ui.tq)));
    const unf = st.pairings.filter(p => !(p.crew.C && p.crew.F && p.crew.T)).length;
    let h = `<div class="toolbar"><select id="tf">${['全部', '未满员', '已满员', '有违规', '特殊机场', '执勤高/中风险'].map(g => `<option ${g === ui.tf ? 'selected' : ''}>${g}</option>`).join('')}</select><input id="tq" placeholder="航班号/机场/任务号" value="${esc(ui.tq)}">
      <span class="mut">共 ${st.pairings.length} 个任务，已满员 ${st.pairings.length - unf}，未满员 <b class="${unf ? 'red' : 'okc'}">${unf}</b>；显示 ${ps.length}</span></div>
      <div class="panel scroll" style="max-height:calc(100vh - 200px)"><table><tr><th>任务号</th><th>日期</th><th>天数</th><th>机型</th><th>小时</th><th>行程（D1..Dn）</th><th>机组</th><th>执勤风险（每日 FDP / 限制 · 余量）</th><th>状态</th><th></th></tr>`;
    for (const pr of ps) {
      const full = pr.crew.C && pr.crew.F && pr.crew.T; const bpt = pr.legs.some(l => (st.settings.bpTesterAirports || []).includes(l.from));
      h += `<tr><td><b>${pr.id}</b>${fillBadge(pr.id)}${demoTag(pr)}</td><td>${dateOf(pr.start)}${pr.ndays > 1 ? '–' + dateOf(pr.start + pr.ndays - 1) : ''}</td><td>${pr.ndays}</td><td>${pr.ac}</td><td>${C.pairingHours(pr).toFixed(1)}</td>
        <td>${dayChains(pr).map(c => c.html).join('<br>')}</td><td>${crewTxt(pr, m)}</td>
        <td class="fdpc">${C.fdpDays(pr, st).map(dy => `<div><span class="rdot r-${dy.planRisk}"></span>D${dy.d} ${C.fmtH(dy.planFdp)} / ${C.fmtH(dy.limit)} · <span class="${{ over: 'red', high: 'red', med: 'warnc', low: 'mut' }[dy.planRisk]}">余 ${dy.planBuffer} 分</span>${dy.planRestShort ? ` <span class="mut" title="计划过夜休息偏短">夜休 ${C.fmtH(dy.planRest)}</span>` : ''}</div>`).join('')}</td>
        <td>${V[pr.id] ? `<span class="red" title="${esc(V[pr.id].join('\n'))}">✖ ${V[pr.id].length}项违规</span>` : full ? '<span class="okc">✔ 合规</span>' : '<span class="warnc">待填</span>'}${bpt ? '<br><span class="warnc">需血压测试仪</span>' : ''}</td>
        <td><button class="btn sm" data-ed="${pr.id}">调整</button></td></tr>`;
    }
    $('#main').innerHTML = h + '</table></div>';
    $('#tf').onchange = e => { ui.tf = e.target.value; rTaskList(); };
    $('#tq').onchange = e => { ui.tq = e.target.value.trim(); rTaskList(); };
    document.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => openEdit(b.dataset.ed));
  }

