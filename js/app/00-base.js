/* 机组排班助手 - 界面 · base.js（由 app.js 拆分；经典 <script> 共享全局词法作用域，按 index.html 顺序加载） */
  const C = window.RosterCore, CH = window.Charts;
  const LITE = !!window.ROSTER_LITE; // lite/：单中队轻量版，独立存储
  const KEY = LITE ? 'crewRoster.lite.v1' : 'crewRoster.v2';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GCOL = { '教员': '#e6a23c', '机长': '#3ea6ff', '新机长': '#a78bfa', '副驾驶': '#2ecc8f' };
  const WK = ['日', '一', '二', '三', '四', '五', '六'];
  const dow = d => new Date(C.YEAR, C.MONTH - 1, d).getDay();
  let st, sum, tab = 'overview', lastSolveMs = null, leaveResult = null;
  const ui = { gq: '', gg: '全部', gsq: '全部', tf: '全部', tq: '', cw: 150, fit: false, rq: '', rg: '全部', rs: '全部', ra: '全部', rh: '全部', lvq: '' };
  // IME 友好搜索：composition 期间不重渲染；支持拼音首字母
  function bindSearchInput(el, onCommit, opt) {
    if (!el) return;
    opt = opt || {};
    let composing = false;
    const commit = () => { onCommit(el.value); };
    el.addEventListener('compositionstart', () => { composing = true; });
    el.addEventListener('compositionend', () => { composing = false; commit(); });
    el.addEventListener('input', () => { if (!composing) commit(); });
    if (opt.extra) opt.extra(el);
  }
  function pilotSearchMatch(p, q) {
    if (!q) return true;
    if (C.pilotMatches(p, q)) return true;
    if (C.nameMatchesQuery && C.nameMatchesQuery(p.name, q)) return true;
    return false;
  }
  function squadOptions(selected) {
    const set = new Set(st.pilots.map(p => p.squad).filter(Boolean));
    const list = ['全部', ...[...set].sort((a, b) => a.localeCompare(b, 'zh'))];
    return list.map(s => `<option value="${esc(s)}" ${s === (selected || '全部') ? 'selected' : ''}>${esc(s)}</option>`).join('');
  }

  const CW_MIN = 6, CW_MAX = 240, BASE_CW = 150;
  const ZSTEPS = [4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 67, 80, 90, 100, 110, 125, 150, 160];

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.pilots) {
        // 在 migratePilots 改写中队名之前检测旧示例（一大队等）
        const LEGACY = new Set(['一大队', '二大队', '三大队', '教学中队']);
        const isSampleish = s.sample === true;
        // 用户改过人员（新增/删除/编辑）后不再按人数判旧，只在 sampleSchema 真正升级时重置
        const edited = !!s.pilotsEdited;
        const stale = (LITE ? (!s.lite || !s.sampleSchema || s.sampleSchema < 16 || (!edited && s.pilots.filter(p => !p.reserve).length !== 101)) : (!edited && s.pilots.length < 500 || s.lite))
          || s.pilots.some(p => LEGACY.has(p.squad))
          || !s.sampleSchema || s.sampleSchema < 16;
        if (isSampleish && stale) {
          reset(false);
          toast('示例数据已升级（整月演示补全 + 导出），已自动重置');
          return;
        }
        st = s;
        st.settings = Object.assign(C.defaultSettings(), st.settings);
        C.migrateSettings(st.settings); C.migrateDelays(st); C.ensureAircraftRegs(st); C.migratePilots(st);
        st.fills = st.fills || [];
        return;
      }
    } catch (e) {}
    reset(false);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function reset(r) { st = LITE ? C.generateLiteSample() : C.generateSample(); lastSolveMs = null; save(); if (r) refresh(); }
  // ---------------- 人员变更：统一失效 + 全局重算（增/删/改 级别·授权·中队·健康） ----------------
  // 所有视图都在渲染时从 st.pilots 现算；这里清掉各页按旧人员算好的候选/方案缓存，重建派生数据并持久化
  function pilotsChanged(reason) {
    C.migratePilots(st); st.pilotsEdited = true; st.pilotsVer = (st.pilotsVer || 0) + 1;
    const ids = new Set(st.pilots.map(p => p.id));
    st.pairings.forEach(pr => ['C', 'F', 'T'].forEach(s => { if (pr.crew[s] && !ids.has(pr.crew[s])) pr.crew[s] = null; }));
    ['standby', 'training'].forEach(k => { if (st[k]) Object.keys(st[k]).forEach(id => { if (!ids.has(id)) delete st[k][id]; }); });
    if (st.standby) st.pilots.forEach(p => { if (!st.standby[p.id]) st.standby[p.id] = []; });
    try { dutyOpts = null; dutySel = null; } catch (e) {}
    try { leaveOpts = null; leaveHoles = null; holePrev = null; leaveHover = null; if (leaveSel && leaveSel.pid && !ids.has(leaveSel.pid)) leaveSel = { pid: null, from: null, to: null }; } catch (e) {}
    try { AB = null; } catch (e) {}
    if (typeof ui === 'object') { const sq = new Set(st.pilots.map(p => p.squad)); ['gsq', 'rs'].forEach(k => { if (ui[k] && ui[k] !== '全部' && !sq.has(ui[k])) ui[k] = '全部'; }); }
    try { if (typeof closeDrawer === 'function' && $('#drawer') && !$('#drawer').classList.contains('hidden')) closeDrawer(); } catch (e) {}
    refresh();
    try { window.dispatchEvent(new CustomEvent('roster:pilots', { detail: { reason, ver: st.pilotsVer } })); } catch (e) {}
  }
  function diagHtml(d) {
    const cls = d.cls === '数据问题' ? 'red' : d.cls === '真实运力不足' ? 'warnc' : 'okc';
    const chips = Object.entries(d.dist || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="dchip">${esc(k)} ${n}人</span>`).join('');
    return `<div class="holediag"><b class="${cls}">${d.cls === '数据问题' ? '⛔ 数据问题' : d.cls === '真实运力不足' ? '⚠ 真实运力不足' : '✔ 可填'}</b> ${esc(d.why)}
      ${(d.intrinsic || []).filter(x => x.nonBlocking || x.soft).map(x => `<div class="mut">· ${esc(x.msg)}</div>`).join('')}
      <div class="mut" style="margin-top:3px">该座位级别合格 ${d.rankOK} 人的阻断原因（一人可多项；全员 ${d.total}）：</div><div>${chips || '—'}</div></div>`;
  }
  function refresh() { sum = C.summarize(st); renderKpis(); updateIssueBadge(); render(); save(); }
  function toast(m, ms) { const t = $('#toast'); t.innerHTML = m; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms || 2600); }

  // ---------------- 定位问题（缺人 / 硬性违规） ----------------
  function collectIssues() {
    const items = [];
    const hard = (sum.violations || []).filter(v => v.level === 'hard' && v.pairing);
    hard.sort((a, b) => (a.type === '未满员' ? 0 : 1) - (b.type === '未满员' ? 0 : 1)
      || String(a.pairing).localeCompare(String(b.pairing)) || String(a.msg).localeCompare(String(b.msg)));
    hard.forEach(v => items.push({ level: 'hard', kind: v.type === '未满员' ? 'unfilled' : 'hard', type: v.type, msg: v.msg, pairing: v.pairing, pilot: v.pilot }));
    const soft = (sum.violations || []).filter(v => v.level === 'soft' && v.pairing);
    soft.forEach(v => items.push({ level: 'soft', kind: 'soft', type: v.type, msg: v.msg, pairing: v.pairing, pilot: v.pilot }));
    const focus = items.filter(x => x.level === 'hard');
    const pairings = new Set(focus.map(x => x.pairing));
    return { items, focus, count: pairings.size, softN: soft.length };
  }
  function updateIssueBadge() {
    const b = $('#issueBadge'), btn = $('#btnIssues'); if (!b || !btn) return;
    const { count } = collectIssues();
    if (count > 0) { b.textContent = count > 99 ? '99+' : String(count); b.classList.remove('hidden'); btn.classList.add('warn'); }
    else { b.classList.add('hidden'); b.textContent = '0'; }
  }
  function closeIssuePanel() {
    const pan = $('#issuePanel'); if (pan) pan.classList.add('hidden');
    document.removeEventListener('mousedown', onIssueOutside, true);
    document.removeEventListener('keydown', onIssueEsc, true);
  }
  function onIssueOutside(e) {
    const wrap = document.querySelector('.issue-wrap');
    if (wrap && !wrap.contains(e.target)) closeIssuePanel();
  }
  function onIssueEsc(e) { if (e.key === 'Escape') closeIssuePanel(); }
  function pulseHl() {
    document.querySelectorAll('.bar.hl').forEach(el => { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); });
  }
  function crewComplianceOk(pr) {
    if (!(pr.crew.C && pr.crew.F && pr.crew.T)) return false;
    const m = pm();
    const crew = ['C', 'F', 'T'].map(s => m[pr.crew[s]]);
    if (C.crewIssue(pr, crew, st)) return false;
    const V = violByPairing();
    return !V[pr.id];
  }
  function jumpToIssue(pairingId) {
    const pr = st.pairings.find(x => x.id === pairingId); if (!pr) { toast('未找到任务 ' + esc(pairingId)); return; }
    closeIssuePanel();
    tab = 'gantt'; location.hash = 'gantt';
    ui.hl = { pairings: new Set([pr.id]), pilots: new Set(['C', 'F', 'T'].map(s => pr.crew[s]).filter(Boolean)), days: C.daysTouched(pr, st) };
    render(); setTimeout(() => { scrollToHl(); pulseHl(); }, 40);
  }
  function openIssuePanel() {
    const pan = $('#issuePanel'); if (!pan) return;
    const { focus, count, softN } = collectIssues();
    if (!count) {
      closeIssuePanel();
      toast(softN ? `当前无硬性违规或缺人（另有 ${softN} 条软性提示，见校验报告）` : '当前无硬性违规或缺人');
      return;
    }
    let h = `<div class="ihd"><span>⚠ 需处理 <b>${count}</b> 个任务</span><span class="mut">${focus.length} 条硬性/缺人</span></div>`;
    h += focus.map((v, i) => `<button type="button" class="issue-row" data-pr="${esc(v.pairing)}" data-i="${i}">
      <span class="itag ${v.kind}">${v.kind === 'unfilled' ? '缺人' : '硬性'}</span>
      <span class="ipid">${esc(v.pairing)}</span>
      <span class="imsg">${esc(v.type)} · ${esc(v.msg)}</span>
    </button>`).join('');
    pan.innerHTML = h;
    pan.classList.remove('hidden');
    pan.querySelectorAll('.issue-row').forEach(btn => btn.onclick = () => jumpToIssue(btn.dataset.pr));
    document.addEventListener('mousedown', onIssueOutside, true);
    document.addEventListener('keydown', onIssueEsc, true);
  }
  function toggleIssuePanel() {
    const pan = $('#issuePanel');
    if (pan && !pan.classList.contains('hidden')) { closeIssuePanel(); return; }
    openIssuePanel();
  }

  /** 确认写入后：高亮并切到人员甘特，同步其它视图读同一 st */
  function commitHighlight(opt) {
    const pairings = opt.pairings || [];
    const pilots = opt.pilots || [];
    const days = opt.days || null;
    const ok = !!opt.ok;
    ui.hl = { pairings: new Set(pairings), pilots: new Set(pilots.filter(Boolean)), days, ok };
    closeIssuePanel();
    tab = 'gantt'; location.hash = 'gantt';
    refresh();
    setTimeout(() => { scrollToHl(); pulseHl(); }, 40);
    if (opt.toast) toast(opt.toast, opt.toastMs || 8000);
    const tu = $('#tUndo'); if (tu && opt.undo) tu.onclick = e => { e.preventDefault(); opt.undo(); };
  }
  function nameOf(id) { if (!id) return '空缺'; const p = st.pilots.find(x => x.id === id); return p ? p.name : id; }
  function recordFillEdit(pr, slot, fromId, toId) {
    if (!toId) return;
    ensureFills();
    st.fills.push({ id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 99),
      time: new Date().toTimeString().slice(0, 8), ts: Date.now(),
      pairingId: pr.id, slot, slotName: C.SLOT_NAME[slot],
      leavePilotId: fromId || '', leavePilotName: nameOf(fromId), leaveDays: [],
      fromId: fromId || '', fromName: nameOf(fromId),
      toId, toName: nameOf(toId), toRank: (st.pilots.find(x => x.id === toId) || {}).rank || '',
      source: 'edit', undone: false });
  }

  const pm = () => { const m = {}; st.pilots.forEach(p => m[p.id] = p); return m; };
  const pill = r => `<span class="pill r-${C.rankGroup(r)}">${esc(r)}</span>`;
  const dateOf = d => `11/${String(d).padStart(2, '0')}`;

  function ensureFills() { if (!st.fills) st.fills = []; }
  function fillsOf(prId) { return (st.fills || []).filter(f => f.pairingId === prId && !f.undone); }
  function fillBadge(prId) { return fillsOf(prId).length ? '<span class="fbadge" title="补位：' + fillsOf(prId).map(f => (f.toName || '') + '←' + (f.fromName || '')).join('；') + '">补位</span>' : ''; }
  function demoTag(pr) { return pr && pr.demoAnomaly ? '<span class="demotag" title="' + esc(pr.demoAnomalyNote || '') + '">演示异常</span>' : ''; }
  function recordFillsFromHole(hh, leavePilot, days, cand, source) {
    ensureFills();
    const rec = { id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 99),
      time: new Date().toTimeString().slice(0, 8), ts: Date.now(),
      pairingId: hh.id, slot: hh.slot, slotName: hh.slotName || C.SLOT_NAME[hh.slot],
      leavePilotId: leavePilot.id, leavePilotName: leavePilot.name, leaveDays: (days || []).slice(),
      fromId: leavePilot.id, fromName: leavePilot.name,
      toId: cand.id, toName: cand.name, toRank: cand.rank || '',
      source: source || 'hole', undone: false };
    st.fills.push(rec); return rec;
  }
  function recordFillsFromSol(sol, leavePilot, days, planName) {
    ensureFills();
    const lp = leavePilot || { id: (cardCtx.focus || [])[0], name: '' };
    if (lp.id && !lp.name) { const p = st.pilots.find(x => x.id === lp.id); if (p) lp.name = p.name; }
    const recs = [];
    (sol.steps || []).forEach(x => {
      if (x.type === 'split' || x.type === 'manual' || !x.pairing) return;
      if (x.to) {
        const toP = (sol.state || st).pilots.find(p => p.id === x.to) || { id: x.to, name: x.to, rank: '' };
        const fromP = x.from ? ((sol.state || st).pilots.find(p => p.id === x.from) || { id: x.from, name: x.from }) : lp;
        recs.push({ id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 99),
          time: new Date().toTimeString().slice(0, 8), ts: Date.now(),
          pairingId: x.pairing, slot: x.slot, slotName: x.slot ? C.SLOT_NAME[x.slot] : '',
          leavePilotId: lp.id, leavePilotName: lp.name, leaveDays: (days || []).slice(),
          fromId: fromP.id, fromName: fromP.name, toId: toP.id, toName: toP.name, toRank: toP.rank || '',
          source: 'plan', planName: planName || sol.name, undone: false });
      }
      if (x.chain && x.chain.to) {
        const toP = (sol.state || st).pilots.find(p => p.id === x.chain.to) || { id: x.chain.to, name: x.chain.to };
        const fromP = x.chain.from ? ((sol.state || st).pilots.find(p => p.id === x.chain.from) || { id: x.chain.from, name: x.chain.from }) : {};
        recs.push({ id: 'FL' + Date.now().toString(36) + Math.floor(Math.random() * 99),
          time: new Date().toTimeString().slice(0, 8), ts: Date.now(),
          pairingId: x.chain.pairing, slot: x.chain.slot, slotName: x.chain.slot ? C.SLOT_NAME[x.chain.slot] : '',
          leavePilotId: lp.id, leavePilotName: lp.name, leaveDays: (days || []).slice(),
          fromId: fromP.id, fromName: fromP.name, toId: toP.id, toName: toP.name, toRank: toP.rank || '',
          source: 'plan-chain', planName: planName || sol.name, undone: false });
      }
    });
    recs.forEach(r => st.fills.push(r)); return recs;
  }
  function fillsHistoryHtml() {
    ensureFills();
    const rows = (st.fills || []).slice().reverse();
    if (!rows.length && !leaveHist.length) return '<div class="note">暂无补位记录。在「请假调配 · 空洞换人」应用补位后将显示在此。</div>';
    let h = '<table class="solt"><tr><th>时间</th><th>请假人</th><th>请假日</th><th>任务</th><th>座位</th><th>原成员</th><th>补位人</th><th>来源</th><th></th></tr>';
    if (rows.length) {
      h += rows.map((f, ri) => {
        const src = f.source === 'hole' ? '空洞换人' : f.source === 'edit' ? '手工换人' : f.source === 'plan-chain' ? '链式整案' : (f.planName ? '方案「' + esc(f.planName) + '」' : '整案');
        return `<tr class="${f.undone ? 'mut' : ''}"><td>${esc(f.time)}</td><td>${esc(f.leavePilotName || '—')}</td><td>${(f.leaveDays || []).join(',') || '—'}</td>
          <td><b>${esc(f.pairingId)}</b>${fillBadge(f.pairingId)}</td><td>${esc(f.slotName || f.slot || '')}</td>
          <td>${esc(f.fromName || '—')}</td><td><b>${esc(f.toName || '—')}</b> ${f.toRank ? pill(f.toRank) : ''}</td>
          <td>${src}${f.undone ? ' · 已撤销' : ''}</td>
          <td>${f.undone ? '' : `<button class="btn sm fillUndoOne" data-fid="${esc(f.id)}">撤销此步</button>`}</td></tr>`;
      }).join('');
    } else {
      h += leaveHist.slice().reverse().map(x => `<tr><td>${esc(x.time)}</td><td colspan="7">${esc(x.label)}</td><td></td></tr>`).join('');
    }
    h += '</table>';
    if (leaveHist.length) h += `<div class="flex" style="margin-top:8px"><button class="btn" id="fillUndoLast">↶ 撤销最近一次调配（${leaveHist.length}）</button>
      <span class="mut">撤销将恢复应用前的排班快照（含补位标记）</span></div>`;
    return h;
  }
  function undoToHist(i) {
    if (i < 0 || i >= leaveHist.length) return;
    const x = leaveHist[i];
    st = JSON.parse(x.snap); st.fills = st.fills || [];
    leaveHist = leaveHist.slice(0, i);
    ui.hl = null; leaveOpts = null; leaveHoles = null; holePrev = null;
    refresh(); toast('已撤销：' + esc(x.label));
  }
  function undoFillById(fid) {
    // 找到对应 leaveHist 中含此补位的最近快照：简化为按 fills 顺序匹配 hist 栈顶逐步撤销直到该 fill 消失
    ensureFills();
    const f = st.fills.find(x => x.id === fid);
    if (!f || f.undone) return;
    // 从后往前找 leaveHist，恢复到「该 fill 写入前」的快照：hist 在写入 fill 前 push 了 snap
    // 我们在 apply 时先 snap 再 mutate 再 push hist；fills 在 mutate 后写入，故 hist.snap 不含该 fill
    // 找最后一个 label 含 pairing+toName 的 hist 项
    let idx = -1;
    for (let i = leaveHist.length - 1; i >= 0; i--) {
      const lb = leaveHist[i].label || '';
      if (lb.includes(f.pairingId) && (lb.includes(f.toName) || lb.includes(f.leavePilotName || ''))) { idx = i; break; }
    }
    if (idx < 0) { // fallback: mark undone only
      f.undone = true; save(); render(); toast('已标记撤销（无匹配快照，机组未回滚）'); return;
    }
    undoToHist(idx);
  }


  function apHtml(c) { const n = C.apName(c, st); const k = C.apClass && C.apClass(c, st); const tag = k ? `<sup class="apcls" title="机场分类：${k.label}（${k.fleet}）">${k.label[0]}</sup>` : ''; return C.isSpecial(c, st) ? `<span class="red" title="${esc(C.CAT_DESC[C.apCat(c, st)] || '')}${k ? ' · ' + k.label : ''}">${esc(n)}</span>${tag}` : esc(n) + tag; }
  function dayChains(pr) { const out = []; for (let d = 1; d <= pr.ndays; d++) { const ls = pr.legs.filter(l => l.d === d); if (!ls.length) continue;
    out.push({ d, html: `D${d} ${[ls[0].from, ...ls.map(l => l.to)].map(apHtml).join('-')}${ls.some(l => l.dh) ? '<span class="dh">(随)</span>' : ''} ${C.fmtT(ls[0].dep)}-${C.fmtT(ls[ls.length - 1].arr)}`, ls }); } return out; }
  // 机场单字简称：按出现频次分配，优先首字，冲突时依次取名称中下一个未占用字；成都双流=蓉、成都天府=府
  let AB = null, ABKEY = null;
  function apAbbr(c) { const key = st.pairings.length + ':' + (st.pairings[0] && st.pairings[0].id);
    if (!AB || ABKEY !== key) { AB = {}; ABKEY = key; const used = new Set(); const cnt = {};
      st.pairings.forEach(p => p.legs.forEach(l => { cnt[l.from] = (cnt[l.from] || 0) + 1; cnt[l.to] = (cnt[l.to] || 0) + 1; }));
      const fix = n => /双流/.test(n) ? '蓉' : /天府/.test(n) ? '府' : null;
      Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).forEach(code => { const n = String(C.apName(code, st) || code).replace(/[\s\d]/g, '');
        const cand = [fix(n), ...n.replace(/^成都/, '')].filter(Boolean).concat([...n]); const ch = cand.find(x => !used.has(x)) || n[0] || code[0]; used.add(ch); AB[code] = ch; }); }
    return AB[c] || String(C.apName(c, st) || c)[0]; }
  function abHtml(c) { const a = esc(apAbbr(c)); return C.isSpecial(c, st) ? `<span class="red">${a}</span>` : a; }
  function crewShort(pr, m) { return ['C', 'F', 'T'].map(s => pr.crew[s] && m[pr.crew[s]] ? esc(m[pr.crew[s]].name) + (s === 'F' && C.INSTR.includes(m[pr.crew[s]].rank) ? '<sup class="instr">教</sup>' : '') : '<span class="warnc">缺</span>').join('/'); }
  function blkDay(c) { return `${[c.ls[0].from, ...c.ls.map(l => l.to)].map(abHtml).join('-')}${c.ls.some(l => l.dh) ? '<span class="dh">(随)</span>' : ''}<br><span class="mut" style="color:#b9cbe8">${C.fmtT(c.ls[0].dep)}-${C.fmtT(c.ls[c.ls.length - 1].arr)}</span>`; }
  function crewTxt(pr, m) { m = m || pm(); return ['C', 'F', 'T'].map(s => `${C.slotLabel(pr, s, m)} ${pr.crew[s] && m[pr.crew[s]] ? esc(m[pr.crew[s]].name) : '<span class="warnc">空缺</span>'}`).join(' / '); }
  const violByPairing = () => { const v = {}; sum.violations.filter(x => x.level === 'hard' && x.pairing).forEach(x => (v[x.pairing] = v[x.pairing] || []).push(x.msg)); return v; };

  // ---------------- 方案历史（最近 5 套）----------------
  function solKpi(s) { return { coverage: s.coverage, holes: s.total - s.full, hard: s.violations.filter(v => v.level === 'hard' && v.type !== '未满员').length,
    min: s.all.min, max: s.all.max, std: s.all.std, gini: s.all.gini, g34: s.rhythm.gap34 != null ? s.rhythm.gap34 : s.rhythm.gap23, pref: s.prefRate }; }
  function pushSolution(s, info) {
    const H = st.solHist = st.solHist || []; st.solN = (st.solN || 0) + 1;
    const crews = st.pairings.map(p => Object.assign({}, p.crew));
    const diff = H.length ? C.crewDiff(crews, H[H.length - 1].crews) : null;
    H.push({ n: st.solN, seed: info.seed != null ? info.seed : null, crews, standby: st.standby || null, training: st.training || null,
      demoHoles: st.pairings.filter(p => p.demoHole).map(p => p.id), kpi: solKpi(s), diff, at: Date.now() });
    while (H.length > 5) H.shift(); st.solIdx = H.length - 1;
  }
  function useSolution(i) {
    const H = st.solHist || []; const h = H[i]; if (!h) return;
    st.pairings.forEach((p, k) => { p.crew = Object.assign({}, h.crews[k]); delete p.demoHole; }); const dh = new Set(h.demoHoles || []);
    st.pairings.forEach(p => { if (dh.has(p.id)) p.demoHole = true; });
    st.standby = h.standby; st.training = h.training; st.solIdx = i; refresh(); toast(`已切换到方案 #${h.n}（seed ${h.seed}）`);
  }
  function solBadge() {
    const H = st.solHist || []; if (!H.length) return ''; const i = st.solIdx != null ? st.solIdx : H.length - 1; const h = H[i];
    return `<span class="solsw"><button class="btn sm" data-sol="${i - 1}" ${i <= 0 ? 'disabled' : ''} title="上一套">◀ 上一套</button><b>方案 #${h.n}</b><small>seed ${h.seed}</small><button class="btn sm" data-sol="${i + 1}" ${i >= H.length - 1 ? 'disabled' : ''} title="下一套">下一套 ▶</button></span>`;
  }
  function solCompareHtml() {
    const H = st.solHist || []; if (!H.length) return '';
    const cur = st.solIdx != null ? st.solIdx : H.length - 1; const pc = x => (x * 100).toFixed(1) + '%';
    return `<div class="panel"><h3>方案对比 <small>每次「一键自动填人」生成新种子方案；保留最近 ${H.length}/5 套 · 差异 = 与上一套相比换人的岗位比例</small></h3>
      <table><tr><th>方案</th><th>seed</th><th>满员率</th><th>空洞</th><th>硬违规(非空洞)</th><th>工时区间</th><th>标准差</th><th>基尼</th><th>休3–4天占比</th><th>意向满足</th><th>与上一套差异</th><th></th></tr>${H.map((h, i) => { const k = h.kpi;
        return `<tr class="${i === cur ? 'solcur' : ''}"><td><b>#${h.n}</b></td><td class="mut">${h.seed}</td><td>${pc(k.coverage)}</td><td>${k.holes}</td><td class="${k.hard ? 'red' : 'okc'}">${k.hard}</td><td>${k.min.toFixed(0)}–${k.max.toFixed(0)}h</td><td>${k.std.toFixed(1)}</td><td>${k.gini.toFixed(3)}</td><td>${pc(k.g34)}</td><td>${pc(k.pref)}</td><td>${h.diff == null ? '—' : pc(h.diff)}</td><td>${i === cur ? '<span class="okc">当前</span>' : `<button class="btn sm" data-sol="${i}">切换</button>`}</td></tr>`; }).join('')}</table></div>`;
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-sol]'); if (b && !b.disabled) useSolution(+b.dataset.sol); });
  function renderKpis() {
    const hb = sum.hard ? 'bad' : 'good';
    $('#kpis').innerHTML = solBadge() + `<span>任务<b>${sum.total}</b></span><span class="${sum.coverage < 1 ? 'bad' : 'good'}">满员率<b>${(sum.coverage * 100).toFixed(1)}%</b></span>
      <span class="${hb}">硬性违规<b>${sum.hard}</b></span><span>工时区间<b>${sum.all.min.toFixed(0)}–${sum.all.max.toFixed(0)}h</b></span><span>意向休息满足<b>${(sum.prefRate * 100).toFixed(1)}%</b></span>`;
    hiBanner();
  }
  // 高强度模式横幅：开启时常驻主区顶部
  function hiBanner() {
    let b = document.getElementById('hiBanner'); const S = st.settings || {};
    if (!S.highIntensity) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'hiBanner'; b.className = 'hibanner'; const m = document.getElementById('main'); if (m) m.before(b); }
    const hx = C.buildIndex(st).hours; const n = st.pilots.filter(p => hx[p.id] > 80).length;
    b.innerHTML = `⚠ 高强度模式已开启：机长线（J3+/TL/TB/TC）软目标上调至 <b>${S.hiTargetH || 85}h</b>；硬规则不变（月100h、7日FDP 60h、月FDP 210h、144h内48h休息、121.495(b)第5日、公司上限）。当前 &gt;80h：<b>${n}</b> 人。<a href="#" id="hiOff">在设置中关闭</a>`;
    const o = document.getElementById('hiOff'); if (o) o.onclick = e => { e.preventDefault(); const t = document.querySelector('[data-tab="settings"]'); if (t) t.click(); };
  }
