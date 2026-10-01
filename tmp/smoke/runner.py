import sys, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = '/workspace'
PORT = 8251
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', PORT), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.3)

results = []
def check(name, cond):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    pg = b.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html')
    # inject mock before app scripts by reloading with route interception
    mock_src = open('/workspace/tmp/test/mock_supabase.js').read()
    def route(r):
        if r.request.url.endswith('mock_inject.js'):
            r.fulfill(status=200, content_type='application/javascript', body=mock_src)
        else:
            r.continue_()
    pg.route('**/mock_inject.js', route)
    html = open(ROOT + '/index.html').read()
    html2 = html.replace('<script src="js/config.js">', '<script src="/mock_inject.js"></script>\n<script src="js/config.js">')
    def route2(r):
        if r.request.url.endswith('/index_test.html'):
            r.fulfill(status=200, content_type='text/html', body=html2)
        else:
            r.continue_()
    pg.route('**/index_test.html', route2)
    pg.goto(f'http://127.0.0.1:{PORT}/index_test.html')
    pg.wait_for_timeout(1500)

    # 1. Admin login
    pg.fill('#loginIdInput', 'TAS-Abhi'); pg.fill('#passwordInput', 'Abhu@1818')
    pg.click('#unifiedLoginBtn'); pg.wait_for_timeout(600)
    check('admin login shows dashboard', pg.is_visible('#adminDashboard'))

    # 2. go to clients workspace, select first client
    pg.evaluate("window.showAdminWorkspaceTab('clients')")
    pg.wait_for_timeout(400)
    check('clients workspace visible', pg.is_visible('#clientListContainer'))
    pg.click('#clientListContainer .client-item >> nth=0'); pg.wait_for_timeout(500)

    # 3. THE FIX: click 🧮 Fitness tab -> content must be visible
    pg.click('.tab-btn[data-tab="fitness"]'); pg.wait_for_timeout(400)
    vis = pg.is_visible('#tab-fitness')
    has_content = pg.evaluate("!!document.querySelector('#tab-fitness .fitness-admin-section')")
    list_ok = pg.evaluate("!document.getElementById('adminClientFitnessList').classList.contains('hidden')")
    rendered = pg.evaluate("document.getElementById('adminClientFitnessList').innerHTML.length>0")
    check('fitness tab panel visible after click', vis and has_content and list_ok)
    check('fitness admin list rendered', rendered)
    btn_ok = pg.is_visible('#adminOpenFitnessBtn')
    check('Add Calculator Entry button visible', btn_ok)

    # 4. progress tab no longer contains the fitness block (moved out)
    pg.click('.tab-btn[data-tab="progress"]'); pg.wait_for_timeout(300)
    moved = pg.evaluate("!document.querySelector('#tab-progress .fitness-admin-section')")
    check('fitness block removed from progress tab', moved)

    # 5. open calculator modal via admin button
    pg.click('.tab-btn[data-tab="fitness"]'); pg.wait_for_timeout(200)
    pg.click('#adminOpenFitnessBtn'); pg.wait_for_timeout(400)
    check('fitness calc modal opens', pg.evaluate("!document.getElementById('fitnessCalcModal').classList.contains('hidden')"))
    pg.keyboard.press('Escape'); pg.evaluate("document.getElementById('fitnessCalcModal')?.classList.add('hidden')")

    # 6. regression: other tabs still work
    for t in ['reminder','tracker','plan','progress']:
        pg.click(f'.tab-btn[data-tab="{t}"]'); pg.wait_for_timeout(150)
        check(f'tab {t} shows content', pg.evaluate(f"!document.getElementById('tab-{t}').classList.contains('hidden')"))

    # 7. approvals panel open/close
    pg.click('#approvalsBtn'); pg.wait_for_timeout(300)
    check('approvals panel opens', pg.evaluate("!document.getElementById('approvalsPanel').classList.contains('hidden')"))
    pg.evaluate("document.getElementById('approvalsPanel').querySelector('.panel-close,[id*=close]')?.click()")
    pg.wait_for_timeout(200)
    check('approvals panel closes', pg.evaluate("document.getElementById('approvalsPanel').classList.contains('hidden')"))

    check('no page JS errors', len(errors)==0)
    if errors: print('ERRORS:', errors[:5])

b.close(); srv.shutdown()
fails = [n for n,c in results if not c]
print('\n%d/%d passed' % (len(results)-len(fails), len(results)))
sys.exit(1 if fails else 0)
