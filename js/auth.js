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
  transitionToCard($('adminDashboard'), ['loginCard', 'clientDashboard']);
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
  transitionToCard($('clientDashboard'), ['loginCard', 'adminDashboard']);
  $('welcomeClientName').textContent = c.name;
  clearStatus($('unifiedStatus'));
  renderClientDashboard(c);

  const hasPendingProfile = APP_STATE.profileApprovals.some(a => sameId(a.client_id, c.id) && a.status === 'pending');
  const hasPendingProgress = APP_STATE.progressApprovals.some(a => sameId(a.client_id, c.id) && a.status === 'pending');
  $('clientPendingBanner').classList.toggle('hidden', !(hasPendingProfile || hasPendingProgress));

  document.querySelectorAll('.tab-btn[data-ctab]').forEach(b =>
    b.classList.toggle('active', b.dataset.ctab === 'plan'));
  document.querySelectorAll('.tab-content[id^="ctab-"]').forEach(t =>
    t.classList.toggle('hidden', t.id !== 'ctab-plan'));
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
  initClientLogViewer();
};

window.refreshClientPortalViews = window.refreshClientPortalViews || function () {
  if (APP_STATE.loggedInClient) renderClientDashboard(APP_STATE.loggedInClient);
};

window.unifiedLogout = function () {
  APP_STATE.loggedInClient = null;
  APP_STATE.selectedClientId = null;
  transitionToCard($('loginCard'), ['clientDashboard', 'adminDashboard']);
  $('loginIdInput').value = '';
  $('passwordInput').value = '';
  clearStatus($('unifiedStatus'));
};