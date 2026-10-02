// Smooth card-to-card navigation (login ⇄ dashboards).
// Hides the outgoing cards and reveals the target one; the CSS rule
// `.dash-card:not(.hidden){animation:dashIn …}` plays a short rise+fade.
// We force-restart the animation so it also replays on logout→login.
window.transitionToCard = function (target, hideIds) {
  (hideIds || []).forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
  if (!target) return;
  target.classList.remove('hidden');
  try {
    target.style.animation = 'none';
    void target.offsetWidth;            // reflow → restart keyframes
    target.style.animation = '';
  } catch (e) {}
  try { window.scrollTo({ top: 0, behavior: (matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth') }); } catch (e) { window.scrollTo(0, 0); }
};

window.handleUnifiedLogin = async function () {
  const loginId = $('loginIdInput').value.trim();
  const password = $('passwordInput').value.trim();
  if (!loginId || !password) {
    showStatus($('unifiedStatus'), 'Enter Login ID and password.', 'error');
    return;
  }
  if (loginId === APP_STATE.adminConfig.admin_login_id && password === APP_STATE.adminConfig.admin_password) {
    openAdminDashboard();
    return;
  }
  const up = loginId.toUpperCase();
  const c = APP_STATE.clients.find(x => (x.login_id || '').toUpperCase() === up && x.password_hint === password);
  if (!c) { showStatus($('unifiedStatus'), '❌ Invalid login.', 'error'); return; }
  if (!c.active) { showStatus($('unifiedStatus'), '🔒 Account closed.', 'error'); return; }
  openClientDashboard(c);
};

window.openAdminDashboard = function () {
  APP_STATE.loggedInClient = null;
  // Remember on THIS device only — next time the app opens on this
  // device the admin lands straight back in the dashboard.
  if (typeof tasSaveSession === 'function') {
    tasSaveSession({ role: 'admin', loginId: APP_STATE.adminConfig.admin_login_id });
  }
  try { sessionStorage.setItem('tas_trainer_session', '1'); } catch (e) {}
  transitionToCard($('adminDashboard'), ['loginCard', 'clientDashboard']);
  try { if (typeof window.refreshFooterNav === 'function') window.refreshFooterNav('admin'); } catch (e) {}
  $('adminDisplayId').textContent = APP_STATE.adminConfig.admin_login_id;
  clearStatus($('unifiedStatus'));
  renderClientList();
  updateApprovalsBadge();
  APP_STATE.selectedClientId = null;
  $('clientDetailPanel').classList.add('hidden');
  $('noClientSelectedMsg').classList.remove('hidden');
  $('settingsPanel').classList.add('hidden');
  $('libraryPanel').classList.add('hidden');
  $('approvalsPanel').classList.add('hidden');
  const ct = $('classTimesPanel'); if (ct) ct.classList.add('hidden');
  updateNotifyButton();
  startNotificationPolling();
};

window.openClientDashboard = function (c) {
  APP_STATE.loggedInClient = c;
  // Remember on THIS device only — next time the app opens on this
  // device the client lands straight back in their portal.
  if (typeof tasSaveSession === 'function') {
    tasSaveSession({ role: 'client', clientId: String(c.id), loginId: c.login_id });
  }
  transitionToCard($('clientDashboard'), ['loginCard', 'adminDashboard']);
  try { if (typeof window.refreshFooterNav === 'function') window.refreshFooterNav('client'); } catch (e) {}
  $('welcomeClientName').textContent = c.name;
  clearStatus($('unifiedStatus'));
  renderClientDashboard(c);

  // Banner only for GENUINE pending requests (shared true-pending filter) —
  // legacy/stale rows can no longer trigger a false "Pending approval".
  if (typeof window.syncClientPendingBanner === 'function') window.syncClientPendingBanner();
  else {
    const p = window.getTruePendingCounts ? window.getTruePendingCounts() : null;
    const hasPending = p
      ? (p.perClient[String(c.id)] || { total: 0 }).total > 0
      : (APP_STATE.profileApprovals.some(a => sameId(a.client_id, c.id) && a.status === 'pending')
        || APP_STATE.progressApprovals.some(a => sameId(a.client_id, c.id) && a.status === 'pending'));
    $('clientPendingBanner').classList.toggle('hidden', !hasPending);
  }
  // Make the client-portal 🔔 Enable button functional + reflect permission.
  if (typeof window.bindClientNotifyButton === 'function') window.bindClientNotifyButton();
  if (typeof window.updateNotifyButton === 'function') window.updateNotifyButton();

  document.querySelectorAll('.tab-btn[data-ctab]').forEach(b =>
    b.classList.toggle('active', b.dataset.ctab === 'plan'));
  document.querySelectorAll('.tab-content[id^="ctab-"]').forEach(t =>
    t.classList.toggle('hidden', t.id !== 'ctab-plan'));

  // Client portal: start the live notification watcher too, so the
  // client also gets a beep + popup when the trainer sets a class
  // time, assigns exercises or marks a session.
  if (typeof window.startNotificationPolling === 'function') window.startNotificationPolling();
};

// Full (re)render of everything the client portal shows. Called on login,
// after data reloads and after any workout/session change so the client
// always sees their latest plan, schedule and finished sessions.
window.renderClientDashboard = function (c) {
  if (!c) return;
  const nowD = new Date(); const y = nowD.getFullYear(), m = nowD.getMonth();
  const sessions = getSessions(c.id, y, m);
  const rate = getRate(c.id);
  $('clientDashMonth').textContent = `${getMonthName(m)} ${y}`;
  $('clientDashDone').textContent = sessions.length;
  $('clientDashAmount').textContent = `${APP_CONFIG.CURRENCY} ${sessions.length * rate}`;

  renderClientUpcoming(c);
  renderClientPlan(c);
  // Also pull this client's assigned plan directly from the server so the
  // "My Plan" tab always reflects what the trainer set — even if the bulk
  // cache was keyed differently or hasn't loaded yet.
  if (typeof window.fetchClientPlan === 'function' && APP_STATE.supabaseClient) {
    window.fetchClientPlan(c.id).then(list => {
      if (APP_STATE.loggedInClient && sameId(APP_STATE.loggedInClient.id, c.id)) {
        renderClientPlan(c, list);
      }
    }).catch(() => {});
  }
  renderClientProgress(c);
  renderClientProfile(c);
  renderClientHistory(c);
  // 🧮 Fitness Calculator Hub: restore this client's saved shared inputs.
  if (typeof window.loadFitnessInputsFor === 'function') {
    window.loadFitnessInputsFor(c.id).catch(() => {});
  }
  initClientLogViewer();
};

window.refreshClientPortalViews = window.refreshClientPortalViews || function () {
  if (APP_STATE.loggedInClient) renderClientDashboard(APP_STATE.loggedInClient);
};

window.unifiedLogout = function () {
  APP_STATE.loggedInClient = null;
  APP_STATE.selectedClientId = null;
  // Stop the alert polling loop and silence any pending badge.
  if (APP_STATE.notificationPollHandle) { clearInterval(APP_STATE.notificationPollHandle); APP_STATE.notificationPollHandle = null; }
  APP_STATE.clientSnapshot = null;
  APP_STATE.lastSeenApprovalCount = 0;
  try { clearAlertBadge(); } catch (e) {}
  // Forget this device — next open shows the login screen again.
  if (typeof tasClearSession === 'function') tasClearSession();
  transitionToCard($('loginCard'), ['clientDashboard', 'adminDashboard']);
  try { if (typeof window.refreshFooterNav === 'function') window.refreshFooterNav(null); } catch (e) {}
  $('loginIdInput').value = '';
  $('passwordInput').value = '';
  clearStatus($('unifiedStatus'));
};

/* ============================================================
   AUTO-RESTORE — called once after cloud data has loaded.
   If THIS device has a saved login (client or admin), skip the
   login form and open the matching dashboard directly.
   ============================================================ */
window.tryRestoreDeviceSession = function () {
  const sess = (typeof tasLoadSession === 'function') ? tasLoadSession() : null;
  if (!sess) return false;
  if (sess.role === 'admin') {
    // Admin credentials may have changed in settings — re-validate.
    const pwOk = !sess.password || sess.password === APP_STATE.adminConfig.admin_password;
    if (pwOk && typeof openAdminDashboard === 'function') { openAdminDashboard(); return true; }
    tasClearSession();
    return false;
  }
  if (sess.role === 'client' && sess.clientId) {
    const c = (APP_STATE.clients || []).find(x => sameId(x.id, sess.clientId));
    if (c && c.active !== false) { openClientDashboard(c); return true; }
    // Client removed / closed on another device → must log in again.
    tasClearSession();
    return false;
  }
  return false;
};