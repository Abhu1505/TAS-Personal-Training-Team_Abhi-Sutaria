import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':900,'height':1200})
        for theme in ('light','dark'):
            await pg.goto('http://localhost:8099/index.html')
            await pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            await pg.wait_for_timeout(800)
            await pg.evaluate("document.querySelector('.app-footer').scrollIntoView({block:'end'})")
            await pg.wait_for_timeout(400)
            box = await pg.evaluate("()=>{const r=document.querySelector('.app-footer').getBoundingClientRect();return {x:Math.max(r.x,0),y:Math.max(r.y,0),width:r.width,height:r.height}}")
            await pg.screenshot(path=f'tmp/footer_{theme}.png', clip=box)
        await b.close()
asyncio.run(main())
