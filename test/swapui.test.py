# 同级别换班 UI（无头浏览器，file://）：员工福利 → 发起换班 → 选乙 → 勾选 → 预览 → 确认 → 全局同步
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); URL = 'file://' + os.path.join(ROOT, 'lite', 'index.html'); SHOT = sys.argv[1] if len(sys.argv) > 1 else None
fails = 0
def chk(n, ok, info=''):
    global fails; print('SWAPUI', n, 'OK' if ok else 'FAIL', info)
    if not ok: fails += 1
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg = b.new_page(viewport={'width': 1500, 'height': 950})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(4000)
    # 先排班并找一对可互换的同级人员
    pair = pg.evaluate("""() => { const R = window.__roster(), C = R.C, st = R.st; C.autoFill(st); const idx = C.buildIndex(st);
      for (const a of st.pilots) for (const b of st.pilots) { if (a.id >= b.id || a.rank !== b.rank) continue; const A = idx.sched[a.id] || [], B = idx.sched[b.id] || [];
        for (const pa of A) for (const pb of B) { if (C.swapPreview(st, a.id, b.id, [pa.id], [pb.id]).ok) return [a.id, b.id, pa.id, pb.id]; } } return null; }""")
    chk('pair found', pair is not None, pair)
    pg.evaluate("() => document.querySelector('button[data-tab=\"welfare\"]').click()"); pg.wait_for_timeout(1000)
    # 主流程：任务优先转让（从任务抽屉的「同级换班」按钮进入）
    tp = pg.evaluate("() => { const R = window.__roster(), C = R.C, st = R.st; const pr = st.pairings.find(p => C.transferCandidates(st, p.id, p.crew.C).some(c => c.ok)); return [pr.id, pr.crew.C]; }")
    pg.evaluate("id => window.__roster().openDrawer(id)", tp[0]); pg.wait_for_timeout(800)
    pg.evaluate("a => document.querySelector('.drwTf[data-tf=\"' + a[1] + '\"]').click()", tp); pg.wait_for_timeout(1200)
    rows = pg.evaluate("() => [...document.querySelectorAll('.tftab tr')].length - 1")
    chk('transfer list shown', rows >= 1, rows)
    pg.evaluate("() => document.querySelector('.tfPick').click()"); pg.wait_for_timeout(1500)
    tv = pg.inner_text('.swpv'); chk('transfer preview ok', '可转让' in tv, tv[:100])
    if SHOT: pg.screenshot(path=SHOT)
    to = pg.evaluate("() => document.querySelector('.tfPick.primary').dataset.to")
    pg.click('#tfApply'); pg.wait_for_timeout(1500)
    done = pg.evaluate("a => Object.values(window.__roster().st.pairings.find(x => x.id === a[0]).crew).includes(a[2])", tp + [to])
    chk('transfer applied + synced', done)
    chk('welfare entry', pg.evaluate("() => !!document.querySelector('#wfSwap')"))
    pg.evaluate("a => openSwap(a[0], a[2])", pair); pg.wait_for_timeout(500)
    pg.select_option('#swB', pair[1]); pg.wait_for_timeout(400)
    pg.check('.swb[value="%s"]' % pair[3]); pg.wait_for_timeout(300)
    pg.click('#swPrev'); pg.wait_for_timeout(1500)
    pv = pg.inner_text('.swpv'); chk('preview ok + hours table', '可换班' in pv and '换班后' in pv, pv[:120])
    pg.click('#swApply'); pg.wait_for_timeout(1500)
    res = pg.evaluate("a => { const st = window.__roster().st; const P = id => st.pairings.find(x => x.id === id); return [Object.values(P(a[2]).crew).includes(a[1]), Object.values(P(a[3]).crew).includes(a[0]), (st.swaps || []).length]; }", pair)
    chk('applied + logged', res[0] and res[1] and res[2] == 2, res)
    # 不同级别：乙下拉只含同级
    other = pg.evaluate("a => { openSwap(a[0]); return [...document.querySelectorAll('#swB option')].filter(o => o.value).every(o => window.__roster().st.pilots.find(p => p.id === o.value).rank === window.__roster().st.pilots.find(p => p.id === a[0]).rank); }", pair)
    chk('peer list same rank only', other)
    pg.reload(); pg.wait_for_timeout(4000)
    kept = pg.evaluate("a => { const st = window.__roster().st; return Object.values(st.pairings.find(x => x.id === a[2]).crew).includes(a[1]); }", pair)
    chk('persists after reload', kept)
    chk('no page errors', not errs, errs[:3])
    b.close()
print('SWAPUI FAIL %d' % fails if fails else 'SWAPUI ALL OK'); sys.exit(1 if fails else 0)
