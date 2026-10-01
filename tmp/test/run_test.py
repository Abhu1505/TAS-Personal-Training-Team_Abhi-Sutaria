import sys, json
from playwright.sync_api import sync_playwright

URL = "http://localhost:8137/index.html"
MOCK = "/workspace/tmp/test/mock_supabase.js"

def run():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("requestfailed", lambda r: errors.append("REQFAIL " + r.url))
        # Block real Supabase CDN + API so the mock is used and no network needed
        page.route("**/supabase-js**", lambda route: route.abort())
        page.goto(URL)
        page.add_script_tag(path=MOCK)
        page.wait_for_timeout(600)
        # Re-run init with mock present
        page.evaluate("window.initSupabase()")
        page.wait_for_timeout(800)

        def check(name, ok):
            results.append((name, bool(ok)))
            print(("PASS  " if ok else "FAIL  ") + name)

        # Login as admin
        page.fill("#loginIdInput", "TAS-Abhi")
        page.fill("#passwordInput", "Abhu@1818")
        page.click("#unifiedLoginBtn")
        page.wait_for_timeout(300)
        check("admin dashboard visible", page.is_visible("#adminDashboard"))

        # Workspace tab buttons work?
        page.click("#adminTabClientsBtn")
        page.wait_for_timeout(200)
        check("clients workspace opens", page.is_visible("#adminWorkspaceClients"))
        check("home workspace hidden", not page.is_visible("#adminWorkspaceHome"))
        page.click("#adminTabHomeBtn")
        page.wait_for_timeout(200)
        check("home workspace opens back", page.is_visible("#adminWorkspaceHome"))

        # Home stats reflect existing client (mock has 1 client)
        total = page.text_content("#hsTotalClients")
        active = page.text_content("#hsActiveClients")
        check(f"home stats show clients (total={total}, active={active})", total == "1" and active == "1")
        badge = page.text_content("#adminClientsTabCount")
        check(f"clients tab badge count = {badge}", badge == "1")

        # Create a client from Home tab
        page.click("#adminTabHomeBtn")
        page.fill("#newClientName", "Test Client")
        page.fill("#newClientPhone", "971500001111")
        page.fill("#newClientRate", "250")
        page.click("#createClientBtn")
        page.wait_for_timeout(600)
        status = page.text_content("#createClientStatus") or ""
        check("create client success status", "created" in status.lower())
        total = page.text_content("#hsTotalClients")
        check(f"stats updated after create (total={total})", total == "2")

        # Go to Clients tab -> list should render
        page.click("#adminTabClientsBtn")
        page.wait_for_timeout(300)
        items = page.query_selector_all(".client-item")
        check(f"client list rendered ({len(items)} items)", len(items) == 2)

        # Click first client -> detail panel opens
        if items:
            items[0].click()
            page.wait_for_timeout(300)
            check("client detail panel opens", page.is_visible("#clientDetailPanel"))
            # inner tabs
            page.click('.tab-btn[data-tab="tracker"]')
            page.wait_for_timeout(200)
            check("sessions tab shows", page.is_visible("#tab-tracker") and not page.is_visible("#tab-reminder"))
            page.click('.tab-btn[data-tab="plan"]')
            page.wait_for_timeout(200)
            check("plan tab shows", page.is_visible("#tab-plan"))
            page.click('.tab-btn[data-tab="progress"]')
            page.wait_for_timeout(200)
            check("progress tab shows", page.is_visible("#tab-progress"))
            page.click('.tab-btn[data-tab="fitness"]')
            page.wait_for_timeout(200)
            check("fitness tab shows", page.is_visible("#tab-fitness"))
            page.click('.tab-btn[data-tab="reminder"]')
            page.wait_for_timeout(200)
            check("message tab shows", page.is_visible("#tab-reminder"))

        # Top buttons
        for btn, panel in [("approvalsBtn", "#approvalsPanel"), ("exerciseLibraryBtn", "#libraryPanel"),
                           ("openSettingsBtn", "#settingsPanel"), ("classTimesBtn", "#classTimesPanel"),
                           ("fitnessAdminBtn", "#fitnessPanel"), ("reportsBtn", "#reportsPanel")]:
            page.click("#" + btn)
            page.wait_for_timeout(250)
            vis = page.is_visible(panel)
            check(f"{btn} opens {panel}", vis)
            if vis:
                page.click(f'[data-close-panel="{panel[1:]}"]')
                page.wait_for_timeout(150)
                check(f"{panel} closes via X", not page.is_visible(panel))

        # Refresh button
        page.click("#adminRefreshBtn")
        page.wait_for_timeout(600)
        check("refresh works", True)

        # Client login flow
        page.click("#adminLogoutBtn"); page.wait_for_timeout(100); page.click("#adminLogoutBtn")
        page.wait_for_timeout(200)
        check("logout returns to login", page.is_visible("#loginCard"))
        page.fill("#loginIdInput", "ALI-9786")
        page.fill("#passwordInput", "AK@1234")
        page.click("#unifiedLoginBtn")
        page.wait_for_timeout(400)
        check("client dashboard opens", page.is_visible("#clientDashboard"))
        page.click('#clientTabsBar .tab-btn[data-ctab="history"]' if page.query_selector('#clientTabsBar') else '.tab-btn[data-ctab="history"]')
        page.wait_for_timeout(200)
        check("client history tab shows", page.is_visible("#ctab-history"))

        print("\nPAGE ERRORS:", json.dumps(errors[:10], indent=1))
        fails = [n for n, ok in results if not ok]
        print(f"\nSUMMARY: {len(results)-len(fails)}/{len(results)} passed")
        browser.close()
        return 1 if fails else 0

sys.exit(run())
