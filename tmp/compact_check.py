import threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

PORT = 8798
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/workspace')
class TS(socketserver.ThreadingTCPServer): allow_reuse_address = True
srv = TS(('127.0.0.1', PORT), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

PROBE = """() => {
  const g = id => document.getElementById(id).getBoundingClientRect();
  const card = g('loginCard');
  const brand = document.querySelector('.login-brand-row').getBoundingClientRect();
  const head = document.querySelector('.login-head').getBoundingClientRect();
  const csel = document.querySelector('.login-card .cloud-status');
  if(!csel){return {ERROR:'no cloud status', html:document.body.innerHTML.length, loginHidden:document.getElementById('loginCard').classList.contains('hidden'), cardCls:document.getElementById('loginCard').className};}
  const cs = csel.getBoundingClientRect();
  const ids = document.getElementById('loginIdInput');
  if(!ids){return {ERROR:'login inputs missing', cardHTML:(document.getElementById('loginCard')||{innerHTML:'no card'}).innerHTML.slice(0,200)};}
  const li = ids.parentElement.getBoundingClientRect();
  const pw = g('passwordInput').parentElement.getBoundingClientRect();
  const btn = g('unifiedLoginBtn').getBoundingClientRect();
  const photo = document.querySelector('.logo-photo-wrap').getBoundingClientRect();
  return {
    gapBrandHead: head.top - brand.bottom,
    gapHeadCs: cs.top - head.bottom,
    gapCsLi: li.top - cs.bottom,
    gapFields: pw.top - li.bottom,
    gapBtn: btn.top - pw.bottom,
    photoW: Math.round(photo.width), photoH: Math.round(photo.height),
    loginBottomInView: Math.round(card.bottom), vh: window.innerHeight,
    scrollY: window.scrollY,
  };
}"""

def probe(b, label, viewport, mobile, standalone=False):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    if standalone:
        pg.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});")
        pg.add_init_script("""(function(){const mm=window.matchMedia.bind(window);
          window.matchMedia=q=>{if(/display-mode:\\s*standalone/.test(q)){return {matches:true,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}};}return mm(q);};})();""")
    pg.goto(f'http://127.0.0.1:{PORT}/index.html')
    pg.wait_for_timeout(2500)
    m = pg.evaluate(PROBE)
    print(label, 'errs=', errs[:1])
    for k,v in m.items(): print('   ',k,'=',round(v,1) if isinstance(v,float) else v)
    # simulate scrolled-down state for standalone check
    if standalone:
        pg.evaluate("window.scrollTo(0,300)")
        pg.wait_for_timeout(2000)
        sy = pg.evaluate("window.scrollY")
        print('    after forced scroll, scrollY (should snap to 0):', sy)
    pg.screenshot(path=f'/workspace/tmp/compact_{label}.png')
    ctx.close()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args=['--no-sandbox'])
    probe(b, 'phone390', {'width':390,'height':844}, True)
    probe(b, 'narrow360', {'width':360,'height':640}, True)
    probe(b, 'laptop', {'width':1280,'height':800}, False)
    probe(b, 'app-phone390', {'width':390,'height':844}, True, standalone=True)
    b.close()
srv.shutdown()
