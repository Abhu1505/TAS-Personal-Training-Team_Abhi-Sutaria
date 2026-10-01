import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8137/index.html"
MOCK = "/workspace/tmp/test/mock_supabase.js"
results = []
def check(name, ok):
    results.append((name, bool(ok)))
    print(("PASS  " if ok else "FAIL  ") + name)

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.route("**/supabase-js**", lambda route: route.abort())
    page.goto(URL)
    page.add_script_tag(path=MOCK)
    page.wait_for_timeout(600)
    page.evaluate("window.initSupabase()")
    page.wait_for_timeout(800)

    # ---------- ADMIN: fitness calculator opens ----------
    page.fill("#loginIdInput", "TAS-Abhi"); page.fill("#passwordInput", "Abhu@1818")
    page.click("#unifiedLoginBtn"); page.wait_for_timeout(300)
    page.click("#adminTabClientsBtn"); page.wait_for_timeout(200)
    page.click(".client-item"); page.wait_for_timeout(300)          # select first client
    page.click('button[data-tab="fitness"]'); page.wait_for_timeout(300)
    check("admin fitness tab shows Add button", page.is_visible("#adminOpenFitnessBtn"))
    check("modal hidden before click", page.evaluate("document.getElementById('fitnessCalcModal').classList.contains('hidden')"))
    page.click("#adminOpenFitnessBtn"); page.wait_for_timeout(300)
    check("ADMIN calculator modal OPENS", not page.evaluate("document.getElementById('fitnessCalcModal').classList.contains('hidden')"))
    check("admin-only buttons visible", page.is_visible("#fcSaveAdminBtn"))
    check("client-only buttons hidden", not page.is_visible("#fcSubmitBtn"))
    # fill numbers -> live results render
    page.fill("#fcWeight", "80"); page.fill("#fcHeight", "175"); page.fill("#fcAge", "30")
    page.wait_for_timeout(200)
    check("live results rendered in modal", len(page.text_content("#fcResults")) > 50)
    # save for client
    page.click("#fcSaveAdminBtn"); page.wait_for_timeout(500)
    st = page.text_content("#fcFormStatus") or ""
    check("admin save success status", "Saved" in st or "updated" in st.lower())
    check("entry row in admin list", page.evaluate("document.querySelectorAll('#adminClientFitnessList .fitness-history-item').length") >= 1)
    page.click("#fcCloseBtn"); page.wait_for_timeout(200)
    check("modal closes via X", page.evaluate("document.getElementById('fitnessCalcModal').classList.contains('hidden')"))

    # edit existing entry from history
    page.click("#adminClientFitnessList .fa-edit-btn"); page.wait_for_timeout(300)
    check("edit reopens modal prefilled", page.input_value("#fcWeight") == "80")
    page.click("#fitnessCalcModal", position={"x": 5, "y": 5}); page.wait_for_timeout(200)
    check("backdrop click closes modal", page.evaluate("document.getElementById('fitnessCalcModal').classList.contains('hidden')"))

    # ---------- ADMIN: schedule request approval flow ----------
    # simulate a pending client_request row directly in the mock DB then load approvals
    page.evaluate("""() => {
      window.__MOCK_DB.client_requests.push({ id:'r1', client_id:'c1', session_date:'2026-10-01',
        request_type:'time', message:'Move to 6 PM', status:'pending',
        requested_at:new Date().toISOString() });
    }""")
    page.click("#adminRefreshBtn"); page.wait_for_timeout(800)
    page.click("#approvalsBtn"); page.wait_for_timeout(400)
    found = page.evaluate("""() => {
      const el = document.getElementById('crn-r1');
      return !!el;
    }""")
    check("schedule request appears in approvals", found)
    if not found:
        print("DEBUG approvals html:", (page.text_content("#approvalsPanel") or "")[:800])
        print("DEBUG clientRequests:", page.evaluate("JSON.stringify(APP_STATE.clientRequests)"))
    if found:
        page.fill("#crn-r1", "Sure, done")
        page.click('[data-cr-id="r1"].approve, [data-cr-id="r1"]')  # best-effort selector
        page.wait_for_timeout(500)
        status = page.evaluate("window.__MOCK_DB.client_requests.find(r=>r.id==='r1').status")
        check(f"approve updates DB row (status={status})", status == "approved")

    # ---------- CLIENT: send request + open calculator ----------
    page.evaluate("unifiedLogout && unifiedLogout()"); page.wait_for_timeout(300)
    page.fill("#loginIdInput", "ALI-9786"); page.fill("#passwordInput", "AK@1234")
    page.click("#unifiedLoginBtn"); page.wait_for_timeout(400)
    check("client dashboard opens", page.is_visible("#clientDashboard"))
    page.click('button[data-ctab="fitness"]'); page.wait_for_timeout(300)
    check("client fitness tab shows Open Calculator", page.is_visible("#clientOpenFitnessBtn"))
    page.click("#clientOpenFitnessBtn"); page.wait_for_timeout(300)
    check("CLIENT calculator modal OPENS", not page.evaluate("document.getElementById('fitnessCalcModal').classList.contains('hidden')"))
    check("client-only buttons visible", page.is_visible("#fcSubmitBtn"))
    check("admin-only buttons hidden", not page.is_visible("#fcSaveAdminBtn"))
    page.fill("#fcWeight", "75"); page.fill("#fcHeight", "170"); page.fill("#fcAge", "28")
    page.click("#fcSubmitBtn"); page.wait_for_timeout(600)
    st = page.text_content("#fcFormStatus") or ""
    check("client submit success", "Sent" in st or "approval" in st.lower())
    page.click("#fcCloseBtn"); page.wait_for_timeout(200)

    # client sends a schedule request through the real UI
    page.click('button[data-ctab="home"]'); page.wait_for_timeout(300)
    page.evaluate("openClientRequestModal(null, 'time')"); page.wait_for_timeout(200)
    page.fill("#crMessage", "Can we shift tomorrow's class to 7 AM?")
    page.click("#sendClientRequestBtn"); page.wait_for_timeout(700)
    n = page.evaluate("window.__MOCK_DB.client_requests.filter(r=>r.message && r.message.indexOf('7 AM')>=0).length")
    check("client request inserted into DB", n == 1)
    rid = page.evaluate("""() => {
      const rows = window.__MOCK_DB.client_requests.filter(r=>r.message && r.message.indexOf('7 AM')>=0);
      return rows.length ? String(rows[0].id) : '';
    }""")
    cached = page.evaluate("String(APP_STATE.clientRequests.some(r=>String(r.id)==='%s'))" % rid)
    check("real uuid id cached locally (not 'local-' fake)", cached == "true" and not rid.startswith("local-"))

    print("\nPAGE ERRORS:", [e for e in errors if "googleusercontent" not in e and "drive.google" not in e])
    fails = [n for n, ok in results if not ok]
    print(f"\nSUMMARY: {len(results)-len(fails)}/{len(results)} passed")
    sys.exit(1 if fails else 0)
