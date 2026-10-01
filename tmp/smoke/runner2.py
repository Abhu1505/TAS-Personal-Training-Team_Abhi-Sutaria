import sys, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = '/workspace'
PORT = 8252
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
    mock_src = open('/workspace/tmp/smoke/mock.js').read()
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

    # Admin login
    pg.fill('#loginIdInput', 'TAS-Abhi'); pg.fill('#passwordInput', 'Abhu@1818')
    pg.click('#unifiedLoginBtn'); pg.wait_for_timeout(600)
    check('admin login shows dashboard', pg.is_visible('#adminDashboard'))

    pg.evaluate("window.showAdminWorkspaceTab('clients')")
    pg.wait_for_timeout(400)

    # --- Scenario B: full happy path with a selected client ---
    pg.click('#clientListContainer .client-item >> nth=0'); pg.wait_for_timeout(500)
    sel = pg.evaluate("!!APP_STATE.selectedClientId")
    check('B: client selected', sel)
    pg.click('.tab-btn[data-tab="fitness"]'); pg.wait_for_timeout(200)
    pg.click('#adminOpenFitnessBtn'); pg.wait_for_timeout(400)
    opened = pg.evaluate("!document.getElementById('fitnessCalcModal').classList.contains('hidden')")
    check('B: calculator modal opens on button click', opened)
    title_ok = pg.evaluate("(document.getElementById('fcModalTitle').textContent||'').includes('Add Calculator Entry')")
    check('B: modal titled "Add Calculator Entry — <client>"', title_ok)
    save_visible = pg.is_visible('#fcSaveAdminBtn')
    client_btns_hidden = pg.evaluate("Array.from(document.querySelectorAll('#fitnessCalcModal .fc-client-only')).every(e=>e.classList.contains('hidden'))")
    check('B: admin Save button visible, client buttons hidden', save_visible and client_btns_hidden)

    # Fill the form and save for the client
    pg.fill('#fcWeight', '82.5'); pg.fill('#fcHeight', '178'); pg.fill('#fcAge', '34')
    pg.select_option('#fcSex', 'male'); pg.select_option('#fcActivity', '1.55')
    pg.wait_for_timeout(200)
    pg.click('#fcSaveAdminBtn'); pg.wait_for_timeout(700)
    saved = pg.evaluate("(document.getElementById('fcFormStatus').textContent||'').includes('Saved directly')")
    check('B: "Save for client" persists (success status)', saved)
    inserted = pg.evaluate("(window.__mockDb.fitness_entries||[]).filter(e=>e.client_id===APP_STATE.selectedClientId && e.status==='approved'&&e.added_by_admin===true).length")
    check('B: row inserted into fitness_entries as approved admin entry', inserted == 1)
    list_has = pg.evaluate("document.getElementById('adminClientFitnessList').innerHTML.includes('Added by trainer')")
    check('B: per-client fitness list re-rendered with new entry', list_has)
    modal_closed_after_close = False
    pg.click('#fcCloseBtn'); pg.wait_for_timeout(200)
    modal_closed_after_close = pg.evaluate("document.getElementById('fitnessCalcModal').classList.contains('hidden')")
    check('B: ✕ closes the modal', modal_closed_after_close)

    # --- Scenario C: same flow from the 🧮 Fitness admin panel (different workspace view) ---
    pg.click('#fitnessAdminBtn'); pg.wait_for_timeout(300)
    pg.click('.tab-btn[data-tab="fitness"]'); pg.wait_for_timeout(200)
    pg.click('#adminOpenFitnessBtn'); pg.wait_for_timeout(400)
    opened_c = pg.evaluate("!document.getElementById('fitnessCalcModal').classList.contains('hidden')")
    check('C: button works while fitness approvals panel is open', opened_c)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    check('no page JS errors', len(errors) == 0)
    if errors: print('ERRORS:', errors[:5])

b.close(); srv.shutdown()
fails = [n for n, c in results if not c]
print('\n%d/%d passed' % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)
