import threading, functools, http.server, socketserver, sys, json
from playwright.sync_api import sync_playwright

PORT = 8791
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/workspace')
class ThreadingTCPServer(socketserver.ThreadingTCPServer): allow_reuse_address = True
srv = ThreadingTCPServer(('127.0.0.1', PORT), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

results = []
def check(name, ok, detail=''):
    results.append((name, ok, detail)); print(('PASS' if ok else 'FAIL'), name, detail)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- iPhone-like viewport (390x844) ----------
    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle')
    pg.wait_for_timeout(1600)

    check('no JS errors (mobile)', len(errors)==0, str(errors[:2]))
    check('install chip visible on iOS UA', pg.is_visible('#pwaInstallBtn'))
    # click chip -> help popover (iOS has no beforeinstallprompt)
    pg.click('#pwaInstallBtn'); pg.wait_for_timeout(300)
    check('iOS install help popover', pg.is_visible('#pwaHelpPop'), pg.inner_text('#pwaHelpPop').replace('\n',' | ')[:80] if pg.is_visible('#pwaHelpPop') else '')
    pg.click('.pwa-help-close'); pg.wait_for_timeout(200)
    check('popover closes', not pg.is_visible('#pwaHelpPop'))

    # horizontal overflow check
    ovf = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('no horizontal overflow (phone login)', ovf <= 0, f'ovf={ovf}')

    # font sizes readable
    fs = pg.evaluate("parseFloat(getComputedStyle(document.body).fontSize)")
    check('body font >=13px on phone', fs >= 13, f'{fs}px')
    inp = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#unifiedEmail input, #loginEmail, .login-card input')).fontSize)") if pg.query_selector('.login-card input') else 16
    check('input font >=15px (no iOS zoom)', inp >= 15, f'{inp}px')

    # manifest valid + orientation any
    man = pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())")
    check('manifest orientation=any', man.get('orientation')=='any')
    check('manifest display_override', 'display_override' in man)

    # viewport-fit=cover present
    vp = pg.evaluate("document.querySelector('meta[name=viewport]').content")
    check('viewport-fit=cover', 'viewport-fit=cover' in vp)

    # ---------- client dashboard bottom dock (simulate login state via class toggle) ----------
    pg.evaluate("""() => {
      document.getElementById('loginCard').classList.add('hidden');
      const d = document.getElementById('clientDashboard');
      d.classList.remove('hidden');
    }""")
    pg.wait_for_timeout(400)
    dock = pg.evaluate("""() => {
      const t = document.querySelector('.client-tabs');
      if (!t) return null;
      const cs = getComputedStyle(t);
      const r = t.getBoundingClientRect();
      return {pos: cs.position, bottom: r.bottom, vh: innerHeight};
    }""")
    check('client tabs fixed dock on phone', dock and dock['pos']=='fixed', str(dock))
    check('dock sits at bottom', dock and abs(dock['vh']-dock['bottom']) < 60, str(dock))
    bodyPad = pg.evaluate("parseFloat(getComputedStyle(document.body).paddingBottom)")
    check('body leaves room for dock', bodyPad >= 60, f'{bodyPad}px')
    ovf2 = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('no horizontal overflow (client dash)', ovf2 <= 0, f'ovf={ovf2}')
    pg.screenshot(path='tmp/phone_client.png', full_page=False)

    # tab switching still works through the dock
    pg.click('[data-ctab="history"]'); pg.wait_for_timeout(250)
    check('dock tab switch works', pg.evaluate("document.querySelector('[data-ctab=history]').classList.contains('active')"))

    # ---------- laptop viewport (1440x900) ----------
    ctx2 = browser.new_context(viewport={'width':1440,'height':900})
    pg2 = ctx2.new_page()
    errs2=[]; pg2.on('pageerror', lambda e: errs2.append(str(e)))
    pg2.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle')
    pg2.wait_for_timeout(1200)
    check('no JS errors (laptop)', len(errs2)==0, str(errs2[:2]))
    pos = pg2.evaluate("getComputedStyle(document.querySelector('.tabs-bar') || document.createElement('div')).position")
    inlineTabs = pg2.evaluate("""() => {
      document.getElementById('loginCard').classList.add('hidden');
      document.getElementById('clientDashboard').classList.remove('hidden');
      const t=document.querySelector('.client-tabs');
      return getComputedStyle(t).position;
    }""")
    check('inline tabs on laptop (not fixed)', inlineTabs=='static', inlineTabs)
    wrapw = pg2.evaluate("document.querySelector('.unified-wrap').getBoundingClientRect().width")
    check('wider page on laptop', wrapw >= 700, f'{wrapw}px')
    fs2 = pg2.evaluate("parseFloat(getComputedStyle(document.body).fontSize)")
    check('larger body font on laptop', fs2 >= 14, f'{fs2}px')
    ovf3 = pg2.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('no horizontal overflow (laptop)', ovf3 <= 0, f'ovf={ovf3}')
    pg2.screenshot(path='tmp/laptop_client.png')

    # ---------- small android phone (320x568) ----------
    ctx3 = browser.new_context(viewport={'width':320,'height':568}, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36')
    pg3 = ctx3.new_page()
    errs3=[]; pg3.on('pageerror', lambda e: errs3.append(str(e)))
    pg3.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle')
    pg3.wait_for_timeout(1400)
    check('no JS errors (small android)', len(errs3)==0, str(errs3[:2]))
    check('install chip visible android', pg3.is_visible('#pwaInstallBtn'))
    ovf4 = pg3.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('no horizontal overflow (320px)', ovf4 <= 0, f'ovf={ovf4}')
    pg3.screenshot(path='tmp/small_android.png')

    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results)-len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
