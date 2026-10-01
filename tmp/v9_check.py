import threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

PORT = 8793
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/workspace')
class ThreadingTCPServer(socketserver.ThreadingTCPServer): allow_reuse_address = True
srv = ThreadingTCPServer(('127.0.0.1', PORT), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

results=[]
def check(name, ok, detail=''):
    results.append((name, ok)); print(('PASS' if ok else 'FAIL'), name, detail)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- iPhone Safari (390x844) ----------
    ctx = b.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle'); pg.wait_for_timeout(1500)
    check('iphone: no JS errors', len(errs)==0, str(errs[:2]))
    cls = pg.evaluate("document.documentElement.className")
    check('iphone: device-phone class', 'device-phone' in cls, cls)
    ovf = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('iphone: login fits width', ovf<=0, f'ovf={ovf}')
    check('iphone: install chip visible', pg.is_visible('#pwaInstallBtn'))
    pinw = pg.evaluate("document.getElementById('passwordInput').getBoundingClientRect().width")
    check('iphone: password field full width', 300 < pinw < 390, f'{pinw}px')
    fs = pg.evaluate("parseFloat(getComputedStyle(document.getElementById('loginIdInput')).fontSize)")
    check('iphone: input font >=16px (no zoom)', fs>=16, f'{fs}px')
    # login as admin -> client dock should NOT exist but workspace tabs fit
    pg.fill('#loginIdInput','TAS-Abhi'); pg.fill('#passwordInput','Abhu@1818'); pg.click('#unifiedLoginBtn')
    pg.wait_for_timeout(1200)
    check('iphone: admin logged in', pg.is_visible('#adminDashboard'))
    ovf2 = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('iphone: admin dashboard fits', ovf2<=0, f'ovf={ovf2}')
    hscols = pg.evaluate("getComputedStyle(document.querySelector('.home-stats-row')).gridTemplateColumns")
    check('iphone: stats wrap to <=3 cols', len(hscols.split())<=3, hscols)
    pg.screenshot(path='/workspace/tmp/v9_iphone.png', full_page=False)
    # logout via double-click confirm
    pg.click('#adminLogoutBtn'); pg.wait_for_timeout(400); pg.click('#adminLogoutBtn'); pg.wait_for_timeout(800)
    check('iphone: back to login', pg.is_visible('#loginCard'))
    ctx.close()

    # ---------- Android Chrome phone (360x800) ----------
    ctx = b.new_context(viewport={'width':360,'height':800}, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle'); pg.wait_for_timeout(1200)
    check('android: no JS errors', len(errs)==0, str(errs[:2]))
    cls = pg.evaluate("document.documentElement.className")
    check('android: device-phone class', 'device-phone' in cls, cls)
    ovf = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('android: fits width', ovf<=0, f'ovf={ovf}')
    # rotate to landscape
    pg.set_viewport_size({'width':800,'height':360}); pg.wait_for_timeout(600)
    cls2 = pg.evaluate("document.documentElement.className")
    check('android landscape: reclassified (not phone)', 'device-phone' not in cls2, cls2)
    ovfL = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('android landscape: fits width', ovfL<=0, f'ovf={ovfL}')
    ctx.close()

    # ---------- Small Android (320x568) ----------
    ctx = b.new_context(viewport={'width':320,'height':568}, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (Linux; Android 11; SM-G960F) AppleWebKit/537.36 Chrome/120 Mobile')
    pg = ctx.new_page()
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle'); pg.wait_for_timeout(1000)
    ovf = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('small android 320px: fits width', ovf<=0, f'ovf={ovf}')
    btnh = pg.evaluate("document.getElementById('unifiedLoginBtn').getBoundingClientRect().height")
    check('small android: tappable CTA >=40px', btnh>=40, f'{btnh}px')
    ctx.close()

    # ---------- Tablet (820x1180 touch) ----------
    ctx = b.new_context(viewport={'width':820,'height':1180}, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    pg = ctx.new_page()
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle'); pg.wait_for_timeout(1000)
    cls = pg.evaluate("document.documentElement.className")
    check('tablet: device-tablet class', 'device-tablet' in cls, cls)
    mw = pg.evaluate("document.querySelector('.unified-wrap').getBoundingClientRect().width")
    check('tablet: compact centered column', 500<mw<=720, f'{mw}px')
    ctx.close()

    # ---------- Laptop (1440x900) ----------
    ctx = b.new_context(viewport={'width':1440,'height':900})
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle'); pg.wait_for_timeout(1200)
    check('laptop: no JS errors', len(errs)==0, str(errs[:2]))
    cls = pg.evaluate("document.documentElement.className")
    check('laptop: device-laptop class', 'device-laptop' in cls, cls)
    mw = pg.evaluate("document.querySelector('.unified-wrap').getBoundingClientRect().width")
    check('laptop: readable column 600-800px', 600<=mw<=800, f'{mw}px')
    pg.fill('#loginIdInput','TAS-Abhi'); pg.fill('#passwordInput','Abhu@1818'); pg.click('#unifiedLoginBtn')
    pg.wait_for_timeout(1200)
    check('laptop: admin logged in', pg.is_visible('#adminDashboard'))
    ctabs = pg.evaluate("getComputedStyle(document.querySelector('.client-tabs')||document.body).position")
    pg.screenshot(path='/workspace/tmp/v9_laptop.png')
    ctx.close()

    # ---------- Offline reload (SW) ----------
    ctx = b.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle'); pg.wait_for_timeout(2500)
    registered = pg.evaluate("navigator.serviceWorker.getRegistrations().then(r=>r.length)")
    pg.context.set_offline(True)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
    title = pg.title()
    visible = pg.is_visible('#loginCard')
    check('offline reload works (SW cache)', visible, title)
    pg.context.set_offline(False)
    ctx.close()
    b.close()

srv.shutdown()
fails=[n for n,ok in results if not ok]
print('\nTOTAL', len(results), 'FAILED', len(fails), fails)
