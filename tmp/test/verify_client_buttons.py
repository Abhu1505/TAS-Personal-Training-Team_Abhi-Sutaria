import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8137/index.html"
MOCK = "/workspace/tmp/test/mock_supabase.js"
results = []
def check(name, ok):
    results.append((name, bool(ok)))
    print(("PASS  " if ok else "FAIL  ") + name)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 480, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    console_errs = []
    page.on("console", lambda m: console_errs.append(m.text) if m.type == "error" else None)
    page.route("**/supabase-js**", lambda route: route.abort())
    page.goto(URL)
    page.add_script_tag(path=MOCK)
    page.wait_for_timeout(600)
    page.evaluate("window.initSupabase()")
    page.wait_for_timeout(800)

    # ---------- CLIENT LOGIN ----------
    page.fill("#loginIdInput", "ALI-9786")
    page.fill("#passwordInput", "AK@1234")
    page.click("#unifiedLoginBtn")
    page.wait_for_timeout(600)
    check("client dashboard visible", page.is_visible("#clientDashboard"))

    # ---------- PROGRESS TAB -> ADD ENTRY ----------
    page.click('button[data-ctab="progress"]')
    page.wait_for_timeout(300)
    check("progress tab content visible", page.is_visible("#ctab-progress"))
    check("Add Entry button visible", page.is_visible("#clientAddProgressBtn"))
    check("modal hidden before click", page.evaluate("document.getElementById('progressModal').classList.contains('hidden')"))
    page.click("#clientAddProgressBtn")
    page.wait_for_timeout(400)
    check("ADD ENTRY MODAL OPENS (click)", not page.evaluate("document.getElementById('progressModal').classList.contains('hidden')"))
    check("modal title is client add", "Add My Progress" in (page.text_content("#progressModalTitle") or ""))
    check("date prefilled today", page.input_value("#pgDate") == __import__("datetime").date.today().isoformat())

    # fill and save -> should create a progress_approval (client flow)
    page.fill("#pgWeight", "82.5")
    page.fill("#pgWaist", "90")
    page.fill("#pgNotes", "test entry")
    page.click("#saveProgressBtn")
    page.wait_for_timeout(600)
    st = page.text_content("#progressModalStatus") or ""
    check("save submitted for approval", "Submitted" in st or "approval" in st.lower())
    n_app = page.evaluate("window.__MOCK_DB.progress_approvals.length")
    check("progress_approvals row created", n_app == 1)
    check("modal closed after save", page.evaluate("document.getElementById('progressModal').classList.contains('hidden')"))
    pending_banner = page.evaluate("!document.getElementById('clientPendingBanner').classList.contains('hidden')")
    check("pending banner shown", pending_banner)

    # tasOpenAddEntry callable directly too
    page.evaluate("window.tasOpenAddEntry()")
    page.wait_for_timeout(300)
    check("tasOpenAddEntry() opens modal", not page.evaluate("document.getElementById('progressModal').classList.contains('hidden')"))
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("Escape closes modal", page.evaluate("document.getElementById('progressModal').classList.contains('hidden')"))

    # ---------- PROFILE TAB -> EDIT MY PROFILE ----------
    page.click('button[data-ctab="profile"]')
    page.wait_for_timeout(300)
    check("Edit Profile button visible", page.is_visible("#clientEditProfileBtn"))
    check("profile modal hidden before click", page.evaluate("document.getElementById('profileEditModal').classList.contains('hidden')"))
    page.click("#clientEditProfileBtn")
    page.wait_for_timeout(400)
    check("EDIT PROFILE MODAL OPENS (click)", not page.evaluate("document.getElementById('profileEditModal').classList.contains('hidden')"))
    # prefill + edit + submit
    page.fill("#peHeight", "178")
    page.fill("#peGoal", "Lose 5kg")
    page.fill("#pcWeight", "82")
    page.fill("#pcAge", "29")
    page.click("#submitProfileBtn")
    page.wait_for_timeout(600)
    st2 = page.text_content("#profileEditStatus") or ""
    check("profile submit success", "Submitted" in st2 or "approval" in st2.lower())
    n_prof = page.evaluate("window.__MOCK_DB.profile_approvals.length")
    check("profile_approvals row created", n_prof >= 1)
    check("profile modal closed after submit", page.evaluate("document.getElementById('profileEditModal').classList.contains('hidden')"))

    # tasOpenProfileEdit callable directly
    page.evaluate("window.tasOpenProfileEdit()")
    page.wait_for_timeout(300)
    check("tasOpenProfileEdit() opens modal", not page.evaluate("document.getElementById('profileEditModal').classList.contains('hidden')"))
    check("prefill keeps goal value", page.input_value("#peGoal") == "Lose 5kg")
    page.keyboard.press("Escape")

    # ---------- dispatchEvent robustness (delegation capture path) ----------
    page.evaluate("""() => {
      document.getElementById('clientAddProgressBtn').dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
    }""")
    page.wait_for_timeout(300)
    check("programmatic click on Add Entry works", not page.evaluate("document.getElementById('progressModal').classList.contains('hidden')"))

    real_errors = [e for e in errors]
    check("no uncaught page errors", len(real_errors) == 0)
    if real_errors: print("PAGE ERRORS:", real_errors)
    js_errs = [e for e in console_errs if 'net::' not in e and 'Failed to load resource' not in e]
    if js_errs: print("CONSOLE ERRORS:", js_errs)

    browser.close()

print("\n%d/%d checks passed" % (sum(1 for _, ok in results if ok), len(results)))
sys.exit(0 if all(ok for _, ok in results) else 1)
