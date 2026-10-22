# 空洞诊断 / 强制指派 / 导入固有问题（无头浏览器，file://）。需本机存在 /workspace/exports/航段导入_9月回测.xlsx，否则跳过
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); URL = 'file://' + os.path.join(ROOT, 'lite', 'index.html')
F = '/workspace/exports/航段导入_9月回测.xlsx'; SHOT = sys.argv[1:] 
if not os.path.exists(F): print('HDIAG SKIP (no file)'); sys.exit(0)
fails = 0
def chk(n, ok, info=''):
    global fails; print('HDIAG', n, 'OK' if ok else 'FAIL', info)
    if not ok: fails += 1
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg = b.new_page(viewport={'width': 1500, 'height': 950})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(4000)
    pg.evaluate("() => document.querySelector('button[data-tab=\"data\"]').click()"); pg.wait_for_timeout(600)
    pg.set_input_files('#imXlsx', F); pg.wait_for_selector('#imRep', timeout=30000); pg.check('#imAllow'); pg.wait_for_timeout(2500)
    txt = pg.inner_text('#modalBox'); chk('import shows intrinsic', '任务本身无法合规排人：0' in txt and '估算时刻）：29' in txt, txt[txt.find('任务本身'):][:80])
    pg.evaluate("() => document.querySelector('.modal-box').scrollTop = 99999"); 
    if SHOT: pg.screenshot(path=SHOT[0])
    pg.click('#imRep'); pg.wait_for_timeout(800)
    n = pg.evaluate("() => window.__roster().st.pairings.length"); chk('imported all', n == 256, n)
    pg.click('#imAuto'); pg.wait_for_function("() => window.__roster().st.pairings.filter(p => p.crew.C && p.crew.F && p.crew.T).length > 200 && document.querySelector('#progress').classList.contains('hidden')", timeout=120000); pg.wait_for_timeout(1500)
    # 人为构造一个真正的数据问题：5 个连续执飞日（121.495(b) 第 5 日执飞），任何人都无法合规
    pg.evaluate("""() => { const R = window.__roster(), C = R.C, D = C.DAY; const legs = [];
      for (let d = 0; d < 5; d++) { legs.push({ d: d + 1, flt: 'EU90' + d, from: 'ZUUU', to: 'ZGGG', dep: (9 + d) * D + 540, arr: (9 + d) * D + 680, ac: 'A320' }, { d: d + 1, flt: 'EU91' + d, from: 'ZGGG', to: 'ZUUU', dep: (9 + d) * D + 740, arr: (9 + d) * D + 880, ac: 'A320' }); }
      R.st.pairings.push({ id: 'PRBAD5', start: 10, ndays: 5, ac: 'A320', legs, crew: { C: null, F: null, T: null } }); }""")
    pg.evaluate("() => document.querySelector('button[data-tab=\"report\"]').click()"); pg.wait_for_timeout(2500)
    rt = pg.inner_text('#main'); chk('report hole diagnosis', '空洞诊断' in rt and '数据问题' in rt)
    pid = pg.evaluate("() => { const st = window.__roster().st; const C = window.__roster().C; return 'PRBAD5'; }")
    pg.evaluate("id => window.__roster().openDrawer(id, 'edit')", pid); pg.wait_for_timeout(1500)
    d = pg.evaluate("() => [...document.querySelectorAll('.holediag')].map(e => e.innerText).join(' || ')")
    chk('drawer diagnosis', '数据问题' in d and '第 5 日不得执飞' in d, d[:160])
    if len(SHOT) > 1: pg.screenshot(path=SHOT[1])
    pg.evaluate("() => document.querySelector('.forceBtn[data-force^=\"C:\"]').click()"); pg.wait_for_timeout(1200)
    chk('force tag shown', pg.evaluate("() => !!document.querySelector('.forcetag')"))
    pg.evaluate("() => document.querySelector('#mConfirm').click()"); pg.wait_for_timeout(2000)
    f = pg.evaluate("id => { const R = window.__roster(); const p = R.st.pairings.find(x => x.id === id); return { forced: p.forced && p.forced.C, crew: p.crew.C, v: R.C.validate(R.st).some(v => v.type === '强制指派' && v.pairing === id) }; }", pid)
    chk('forced assignment saved + flagged', f['crew'] and f['forced'] and f['v'], f)
    chk('no page errors', not errs, errs[:3])
    b.close()
print('HDIAG FAIL %d' % fails if fails else 'HDIAG ALL OK'); sys.exit(1 if fails else 0)
