import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8137/index.html"
MOCK = "/workspace/tmp/test/mock_supabase.js"
EXE = "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome"

def run():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=EXE, args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        errors = []
        console_errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        # Block real Supabase CDN so the mock is used; allow everything else.
        page.route("**/cdn.jsdelivr.net/**supabase**", lambda route: route.abort())
        page.goto(URL)
        page.add_script_tag(path=MOCK)
        page.wait_for_timeout(300)
        page.evaluate("window.initSupabase()")
        page.wait_for_timeout(1200)

        def check(name, ok):
            results.append((name, bool(ok)))
            print(("PASS  " if ok else "FAIL  ") + name)

        cloud = (page.text_content("#cloudStatusText") or "").strip().lower()
        check(f"cloud status connected ({cloud})", "connected" in cloud or "online" in cloud or "\u2705" in cloud)
        check("login card visible", page.is_visible("#loginCard"))
        check("admin config loaded from cloud", page.evaluate("APP_STATE.adminConfig && APP_STATE.adminConfig.admin_login_id === 'TAS-Abhi'"))

        # ---- Admin login ----
        page.fill("#loginIdInput", "TAS-Abhi")
        page.fill("#passwordInput", "Abhu@1818")
        page.click("#unifiedLoginBtn")
        page.wait_for_timeout(400)
        check("admin dashboard visible", page.is_visible("#adminDashboard"))
        check("login card hidden", not page.is_visible("#loginCard"))

        # ---- Workspace tabs ----
        page.click("#adminTabClientsBtn"); page.wait_for_timeout(250)
        check("clients workspace opens", page.is_visible("#adminWorkspaceClients"))
        page.click("#adminTabHomeBtn"); page.wait_for_timeout(250)
        check("home workspace opens back", page.is_visible("#adminWorkspaceHome"))

        # ---- Home stats ----
        total = (page.text_content("#hsTotalClients") or "").strip()
        active = (page.text_content("#hsActiveClients") or "").strip()
        check(f"home stats show clients (total={total} active={active})", total == "1" and active == "1")
        badge = (page.text_content("#adminClientsTabCount") or "").strip()
        check(f"clients tab badge = {badge}", badge == "1")

        # ---- Create client ----
        page.fill("#newClientName", "Test Client")
        page.fill("#newClientPhone", "971500001111")
        if page.query_selector("#newClientRate"):
            page.fill("#newClientRate", "250")
        errs_before = len(errors)
        page.click("#createClientBtn")
        page.wait_for_timeout(800)
        st = (page.text_content("#createClientStatus") or "").lower()
        check(f"create client success ({st[:40]})", ("created" in st or "success" in st or "added" in st) and len(errors) == errs_before)
        total = (page.text_content("#hsTotalClients") or "").strip()
        check(f"client count now {total}", total == "2")

        # ---- Clients list + search ----
        page.click("#adminTabClientsBtn"); page.wait_for_timeout(300)
        rows_all = page.eval_on_selector_all("#clientListContainer .client-item", "e => e.length")
        check(f"client list renders {rows_all} rows", rows_all == 2)
        page.fill("#clientSearchInput", "ALI-9786")
        page.wait_for_timeout(300)
        rows_f = page.eval_on_selector_all("#clientListContainer .client-item", "e => e.length")
        cnt = (page.text_content("#clientSearchCount") or "").strip()
        check(f"search 'ALI-9786' filters to {rows_f} ({cnt})", rows_f == 1)
        page.fill("#clientSearchInput", "")
        page.wait_for_timeout(300)

        # ---- Select client -> detail panel ----
        page.click("#clientListContainer .client-item >> nth=0")
        page.wait_for_timeout(500)
        check("client detail panel visible", page.is_visible("#clientDetailPanel"))

        # ---- Month/session calendar render ----
        errs_before = len(errors)
        ms = page.query_selector("#monthSelect")
        if ms and ms.is_visible():
            ms.select_option(index=new_month_index); page.wait_for_timeout(400)
        else:
            page.evaluate("document.getElementById('monthSelect').value = 2; document.getElementById('monthSelect').dispatchEvent(new Event('change'))")
            page.wait_for_timeout(400)
        check("month switch without JS error", len(errors) == errs_before)

        # ---- Assign exercise area present ----
        check("assign list rendered", page.query_selector("#assignList") is not None)

        # ---- Panels open/close cleanly ----
        for btn in ["exerciseLibraryBtn", "approvalsBtn", "openSettingsBtn", "reportsBtn", "classTimesBtn", "sendAllTopBtn"]:
            b = page.query_selector(f"#{btn}")
            if not b:
                check(f"{btn} exists", False); continue
            errs_before = len(errors)
            b.click(); page.wait_for_timeout(350)
            # capture any popup windows opened (WhatsApp/broadcast links)
            for pg in ctx.pages[1:]:
                print("POPUP:", pg.url[:120]); pg.close()
            ok = len(errors) == errs_before
            check(f"{btn} click without JS error", ok)
            panel_id = {"exerciseLibraryBtn":"libraryPanel","approvalsBtn":"approvalsPanel","openSettingsBtn":"settingsPanel","reportsBtn":"reportsPanel","classTimesBtn":"classTimesPanel"}.get(btn)
            if panel_id:
                vis = page.evaluate(f"!!document.getElementById('{panel_id}') && !document.getElementById('{panel_id}').classList.contains('hidden')")
                check(f"{panel_id} opened after click", vis)
            page.keyboard.press("Escape"); page.wait_for_timeout(250)
            if panel_id:
                vis2 = page.evaluate(f"!!document.getElementById('{panel_id}') && document.getElementById('{panel_id}').classList.contains('hidden')")
                check(f"{panel_id} closed after Escape", vis2)

        # ---- Add an exercise from library form (without submitting) ----
        # ---- Logout (two-step confirm) ----
        lb = page.query_selector("#adminLogoutBtn")
        lb.click(); page.wait_for_timeout(200)
        check("logout arms confirm text", "confirm" in (lb.text_content() or "").lower())
        lb.click(); page.wait_for_timeout(500)
        check("back to login after logout", page.is_visible("#loginCard") and not page.is_visible("#adminDashboard"))

        # ---- Client login ----
        page.fill("#loginIdInput", "ALI-9786")
        page.fill("#passwordInput", "AK@1234")
        errs_before = len(errors)
        page.click("#unifiedLoginBtn")
        page.wait_for_timeout(600)
        check("client dashboard visible", page.is_visible("#clientDashboard"))
        check("welcome name set", "Ali" in (page.text_content("#welcomeClientName") or ""))
        check("client login without JS error", len(errors) == errs_before)

        # ---- Client tabs ----
        for t in ["plan", "history", "progress", "profile"]:
            sel = f".tab-btn[data-ctab='{t}']"
            b = page.query_selector(sel)
            if b:
                errs_before = len(errors)
                b.click(); page.wait_for_timeout(300)
                check(f"client tab {t} without JS error", len(errors) == errs_before)

        # ---- Single-device session restore: reload page, expect auto-login ----
        page.reload()
        page.add_script_tag(path=MOCK)
        page.wait_for_timeout(300)
        page.evaluate("window.initSupabase()")
        page.wait_for_timeout(1500)
        check("session restored after reload (client)", page.is_visible("#clientDashboard"))

        browser.close()

    print("\n=== PAGE ERRORS (unfiltered) ===")
    for e in dict.fromkeys(errors): print("ERR:", e[:250])
    print("\n=== CONSOLE ERRORS (unique) ===")
    for e in dict.fromkeys(console_errors): print("CON:", e[:250])
    fails = [r for r in results if not r[1]]
    print(f"\nSUMMARY: {len(results)-len(fails)}/{len(results)} passed")
    return 1 if fails else 0

new_month_index = 2
sys.exit(run())
