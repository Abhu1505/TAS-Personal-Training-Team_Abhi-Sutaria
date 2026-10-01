import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':900,'height':1200})
        errors=[]
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto('http://localhost:8099/index.html')
        await pg.wait_for_timeout(1500)
        # footer visible on login screen?
        res = await pg.evaluate('''() => {
          const f=document.querySelector('.app-footer');
          const svg=f.querySelector('svg.footer-logo');
          const texts=[...svg.querySelectorAll('text')].map(t=>getComputedStyle(t).fill);
          const rect=f.getBoundingClientRect();
          const cs=getComputedStyle(f);
          return {visible: rect.width>0, bg: cs.backgroundColor, borderTop: cs.borderTopColor, fills: texts};
        }''')
        print('LIGHT:', json.dumps(res))
        # switch to dark theme if toggle exists
        await pg.evaluate('''() => document.documentElement.setAttribute('data-theme','dark')''')
        await pg.wait_for_timeout(300)
        res2 = await pg.evaluate('''() => {
          const f=document.querySelector('.app-footer');
          const svg=f.querySelector('svg.footer-logo');
          const texts=[...svg.querySelectorAll('text')].map(t=>getComputedStyle(t).fill);
          const cs=getComputedStyle(f);
          return {bg: cs.backgroundColor, fills: texts};
        }''')
        print('DARK :', json.dumps(res2))
        await pg.screenshot(path='tmp/footer_light.png', clip=None)
        await pg.evaluate('''() => document.documentElement.setAttribute('data-theme','light')''')
        await pg.evaluate("document.querySelector('.app-footer').scrollIntoView()")
        await pg.wait_for_timeout(400)
        box = await pg.evaluate("()=>{const r=document.querySelector('.app-footer').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}")
        await pg.screenshot(path='tmp/footer_light_shot.png', clip=box)
        print('errors:', errors)
        await b.close()
asyncio.run(main())
