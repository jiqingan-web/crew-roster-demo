# 人员增删改 → 全局同步（快速、无头浏览器，file://）
# 运行：python3 test/pilotsync.test.py   （需 playwright + /usr/bin/google-chrome）
import os, sys, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'lite', 'index.html')
SHOT = sys.argv[1] if len(sys.argv) > 1 else None
fails = 0
def goTab(pg, t):
    pg.evaluate("t => document.querySelector('button[data-tab=\"' + t + '\"]').click()", t)
def chk(n, ok, info=''):
    global fails
    print('PSYNC', n, 'OK' if ok else 'FAIL', info)
    if not ok: fails += 1
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg = b.new_page(viewport={'width': 1500, 'height': 950})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.wait_for_timeout(4000)
    # 准备：去掉所有机长类的拉萨授权，新增一个全空的拉萨任务（ZUUU-ZULS-ZUUU，第 12 日）→ 机长座位无人可排
    pg.evaluate("""() => { const R = window.__roster(); const st = R.st, C = R.C;
      C.autoFill(st);
      const D = C.DAY, d = 11; const pr = { id: 'PRLXA', start: 12, ndays: 1, ac: 'A320', crew: { C: null, F: null, T: null },
        legs: [{ d: 1, flt: 'EU2211', from: 'ZUUU', to: 'ZULS', dep: d * D + 9 * 60, arr: d * D + 11 * 60, ac: 'A320' }, { d: 1, flt: 'EU2212', from: 'ZULS', to: 'ZUUU', dep: d * D + 12 * 60, arr: d * D + 14 * 60, ac: 'A320' }] };
      st.pairings.push(pr);
      const x = C.candidates(st, pr, 'F').find(c => c.ok && C.isCaptClass(c.p.rank)); if (x) pr.crew.F = x.p.id;
      st.pilots.forEach(p => { if (C.isCaptClass(p.rank) && (!x || p.id !== x.p.id)) p.auth = (p.auth || []).filter(c => c !== 'ZULS'); });
    }""")
    key = pg.evaluate("() => Object.keys(localStorage).find(k => { try { const s = JSON.parse(localStorage.getItem(k)); return s && s.pilots; } catch (e) { return false; } })")
    pg.evaluate("k => { const st = window.__roster().st; localStorage.setItem(k, JSON.stringify(st)); }", key)
    pg.reload(); pg.wait_for_timeout(4000)
    pre = pg.evaluate("() => { const R = window.__roster(); const pr = R.st.pairings.find(p => p.id === 'PRLXA'); return pr ? R.C.candidates(R.st, pr, 'C').filter(c => c.ok).length : -1; }")
    chk('setup hole has 0 C candidates', pre == 0, pre)
    # 通过人员总览 UI 新增机长（J2 · 拉萨授权）
    goTab(pg, 'roster'); pg.wait_for_timeout(800)
    pg.click('#roAdd'); pg.wait_for_timeout(300)
    pg.fill('#edId', 'N99001'); pg.fill('#edName', '测试拉萨机长'); pg.select_option('#edRank', 'J2')
    pg.click('.edA[data-c="ZULS"]'); pg.click('#edSave'); pg.wait_for_timeout(800)
    chk('roster list shows new', '测试拉萨机长' in pg.inner_text('#main'))
    # 人员视图甘特
    goTab(pg, 'gantt'); pg.wait_for_timeout(1200)
    pg.fill('#gq', ''); pg.type('#gq', 'N99001'); pg.wait_for_timeout(2000)
    chk('person Gantt row', pg.evaluate("() => [...document.querySelectorAll('#main *')].some(e => e.children.length === 0 && e.textContent.includes('测试拉萨机长'))"))
    if SHOT: pg.screenshot(path=SHOT)
    pg.fill('#gq', ''); pg.wait_for_timeout(400)
    # 候选人（抽屉）
    cand = pg.evaluate("() => { const R = window.__roster(); const pr = R.st.pairings.find(p => p.id === 'PRLXA'); return R.C.candidates(R.st, pr, 'C').filter(c => c.ok).map(c => c.p.id); }")
    chk('candidate list for hole', 'N99001' in cand, cand)
    pg.evaluate("() => window.__roster().openDrawer('PRLXA', 'edit')"); pg.wait_for_timeout(800)
    dtxt = pg.evaluate("() => [...document.querySelectorAll('#drawer option, .drawer option')].map(o => o.textContent).join('|') || document.body.innerHTML")
    chk('drawer shows him', '测试拉萨机长' in dtxt)
    pg.evaluate("() => window.__roster().closeDrawer()")
    # 校验报告 → 生成纠错方案
    goTab(pg, 'report'); pg.wait_for_timeout(1200)
    pg.click('#btnAutoFix'); pg.wait_for_timeout(4000)
    plan = pg.evaluate("() => (window._autoFixPlan.moves || []).filter(m => m.pairingId === 'PRLXA').map(m => m.slot + ':' + m.to)")
    if 'C:N99001' not in plan: print(pg.evaluate("() => JSON.stringify({u: window._autoFixPlan.unsolvableReason, m: window._autoFixPlan.moves.slice(0, 8), b: window._autoFixPlan.before})")[:800])
    chk('autocorrect uses him', 'C:N99001' in plan, plan)
    # 编辑：改中队 → 中队筛选可见
    goTab(pg, 'roster'); pg.wait_for_timeout(600)
    sq = pg.evaluate("() => [...document.querySelectorAll('#rs option')].map(o => o.value)")
    chk('squad filter options intact', any('七中队' in s for s in sq), sq)
    # 刷新后仍在（不被示例重置）
    pg.reload(); pg.wait_for_timeout(4000)
    st = pg.evaluate("() => { const st = window.__roster().st; const p = st.pilots.find(x => x.id === 'N99001'); return { p: p && { name: p.name, rank: p.rank, auth: p.auth }, n: st.pilots.length, lxa: !!st.pairings.find(x => x.id === 'PRLXA') }; }")
    chk('persists across reload', st['p'] and st['p']['rank'] == 'J2' and 'ZULS' in st['p']['auth'] and st['lxa'], st)
    # 删除 → 座位与各页同步
    goTab(pg, 'roster'); pg.wait_for_timeout(600)
    pg.click('.roEdit[data-pid="N99001"]'); pg.wait_for_timeout(300); pg.click('#edDel'); pg.wait_for_timeout(800)
    gone = pg.evaluate("() => { const st = window.__roster().st; return !st.pilots.some(p => p.id === 'N99001') && !st.pairings.some(p => Object.values(p.crew).includes('N99001')); }")
    chk('delete syncs', gone)
    chk('no page errors', not errs, errs[:3])
    b.close()
print('PSYNC FAIL %d' % fails if fails else 'PSYNC ALL OK'); sys.exit(1 if fails else 0)
