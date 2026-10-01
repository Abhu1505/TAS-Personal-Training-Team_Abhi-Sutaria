window.updateNotifyButton = function () {
  const btn = $('notifyBtn'); if (!btn) return;
  if (!('Notification' in window)) { btn.textContent = '🔔 N/A'; btn.disabled = true; return; }
  if (Notification.permission === 'granted') {
    btn.textContent = '🔔 On';
    btn.classList.add('enabled');
    APP_STATE.notificationsEnabled = true;
  } else if (Notification.permission === 'denied') {
    btn.textContent = '🔕 Blocked';
    btn.classList.remove('enabled');
    btn.disabled = true;
  } else {
    btn.textContent = '🔔 Enable';
    btn.classList.remove('enabled');
    APP_STATE.notificationsEnabled = false;
  }
};

window.requestNotifyPermission = async function () {
  if (!('Notification' in window)) { showStatus(null, '⚠️ Notifications are not supported on this browser.', 'warning'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    APP_STATE.notificationsEnabled = true;
    new Notification('🔔 Notifications enabled', { body: 'You will be notified of new approvals.' });
  }
  updateNotifyButton();
};

window.checkForNewApprovalsAndNotify = function () {
  if (!APP_STATE.notificationsEnabled) return;
  const totalPending = APP_STATE.profileApprovals.filter(a => a.status === 'pending').length
    + APP_STATE.progressApprovals.filter(a => a.status === 'pending').length;
  if (totalPending > APP_STATE.lastSeenApprovalCount && APP_STATE.lastSeenApprovalCount > 0) {
    const diff = totalPending - APP_STATE.lastSeenApprovalCount;
    try {
      new Notification('🔔 New approval' + (diff > 1 ? 's' : ''), {
        body: `${diff} new pending item${diff > 1 ? 's' : ''} waiting for you.`,
        tag: 'approvals'
      });
    } catch (e) {}
  }
  APP_STATE.lastSeenApprovalCount = totalPending;
};

window.startNotificationPolling = function () {
  if (APP_STATE.notificationPollHandle) clearInterval(APP_STATE.notificationPollHandle);
  APP_STATE.notificationPollHandle = setInterval(async () => {
    if (!APP_STATE.loggedInClient && !$('adminDashboard').classList.contains('hidden')) {
      try {
        const { data: pa } = await APP_STATE.supabaseClient
          .from('profile_approvals').select('*').order('submitted_at', { ascending: false });
        APP_STATE.profileApprovals = pa || [];
        const { data: pg } = await APP_STATE.supabaseClient
          .from('progress_approvals').select('*').order('submitted_at', { ascending: false });
        APP_STATE.progressApprovals = pg || [];
        updateApprovalsBadge();
        checkForNewApprovalsAndNotify();
        if (!$('approvalsPanel').classList.contains('hidden')) renderApprovals();
        renderClientList();
      } catch (e) {}
    }
  }, 60000);
};