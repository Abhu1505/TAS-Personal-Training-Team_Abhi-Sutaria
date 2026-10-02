// Wire up all DOM events and boot the app
(function () {
  'use strict';

  function bind() {
    // Login
    $('unifiedLoginBtn').addEventListener('click', handleUnifiedLogin);
    $('passwordInput').addEventListener('keypress', e => { if (e.key === 'Enter') handleUnifiedLogin(); });
    $('loginIdInput').addEventListener('keypress', e => { if (e.key === 'Enter') handleUnifiedLogin(); });

    // Logout (two-step inline confirm — professional & fast)
    attachConfirmLogout($('clientLogoutBtn'));
    attachConfirmLogout($('adminLogoutBtn'));

    // Refresh cloud data (both dashboards)
    const bindRefresh = (btnId, after) => {
      const b = $(btnId);
      if (!b) return;
      b.addEventListener('click', async () => {
        b.disabled = true;
        const orig = b.textContent;
        b.textContent = '⏳ …';
        try { await refreshAllData(); if (after) after(); }
        finally { b.disabled = false; b.textContent = orig; }
      });
    };
    bindRefresh('clientRefreshBtn', () => {
      const c = APP_STATE.loggedInClient;
      if (c) renderClientDashboard(c);
    });
    bindRefresh('adminRefreshBtn', () => {
      renderClientList();
      if (APP_STATE.selectedClientId) { renderSessions(); renderAssignList(); renderAdminProgress(); }
      renderApprovals();
    });

    // Client search filter
    const searchInput = $('clientSearchInput');
    if (searchInput) searchInput.addEventListener('input', () => renderClientList());

    // Admin top buttons — resolved LAZILY at click time, because settings.js /
    // approvals.js etc. define these functions as window properties and the
    // reference captured at bind() time could go stale after a hot reload.
    const lazyBind = (btnId, fnName) => {
      const b = $(btnId);
      if (!b) return;
      b.addEventListener('click', () => {
        if (typeof window[fnName] === 'function') window[fnName]();
        else console.warn('Missing function:', fnName);
      });
    };
    lazyBind('sendAllTopBtn', 'sendToAllClients');
    lazyBind('notifyBtn', 'requestNotifyPermission');
    // 🔔 Client-portal bell — same handler, so "Enable" works for clients too
    // and both buttons stay in sync with the browser permission state.
    lazyBind('clientNotifyBtn', 'requestNotifyPermission');
    lazyBind('approvalsBtn', 'openApprovalsPanel');
    lazyBind('exerciseLibraryBtn', 'openLibraryPanel');
    lazyBind('openSettingsBtn', 'openSettingsPanel');
    lazyBind('saveSettingsBtn', 'saveSettings');

    // 🏢 Gym / Club tab inside the "Create Client" form — expand/collapse.
    document.querySelectorAll('.tab-btn[data-ctabform]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.ctabform;
        document.querySelectorAll('.tab-btn[data-ctabform]').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-content[id^="ctabform-"]').forEach(t => t.classList.toggle('hidden', t.id !== `ctabform-${tab}`));
      });
    });

    // ⏰ Class Times panel (js/class-times.js)
    if (typeof window.bindClassTimesEvents === 'function') window.bindClassTimesEvents();
    // 📊 Reports panel (js/reports.js exposes openReportsPanel).
    // NOTE: bind() runs at DOMContentLoaded, when reports.js may not be
    // loaded yet — so never test the function reference here. Bind the
    // click unconditionally and resolve the function lazily on click.
    const reportsBtn = $('reportsBtn');
    if (reportsBtn) {
      reportsBtn.addEventListener('click', () => {
        if (typeof window.openReportsPanel === 'function') window.openReportsPanel();
      });
    }

    // 🏠 Home / 📋 Clients workspaces + ✕ panel close buttons (js/workspace.js)
    if (typeof window.bindWorkspaceEvents === 'function') {
      window.__workspaceBound = true;
      window.bindWorkspaceEvents();
    } else {
      // workspace.js not loaded yet — bind as soon as it arrives.
      window.addEventListener('tas:workspace-ready', () => {
        if (!window.__workspaceBound && typeof window.bindWorkspaceEvents === 'function') {
          window.__workspaceBound = true;
          window.bindWorkspaceEvents();
        }
      });
      setTimeout(() => {
        if (!window.__workspaceBound && typeof window.bindWorkspaceEvents === 'function') {
          window.__workspaceBound = true;
          window.bindWorkspaceEvents();
        }
      }, 1500);
    }

    // Approvals tab buttons
    document.querySelectorAll('.tab-approval').forEach(btn => {
      btn.addEventListener('click', () => {
        APP_STATE.currentApprovalTab = btn.dataset.atab;
        document.querySelectorAll('.tab-approval').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.classList.toggle('btn-orange-small', b === btn);
          b.classList.toggle('btn-secondary', b !== btn);
        });
        renderApprovals();
      });
    });
    document.querySelectorAll('.tab-approval-type').forEach(btn => {
      btn.addEventListener('click', () => {
        APP_STATE.currentApprovalType = btn.dataset.atype;
        document.querySelectorAll('.tab-approval-type').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.classList.toggle('btn-orange-small', b === btn);
          b.classList.toggle('btn-secondary', b !== btn);
        });
        renderApprovals();
      });
    });

    // Exercise Library
    $('addExerciseBtn').addEventListener('click', () => openExerciseModal(null));
    $('cancelExerciseBtn').addEventListener('click', () => $('exerciseModal').classList.add('hidden'));
    $('saveExerciseBtn').addEventListener('click', async () => {
      const name = $('exName').value.trim();
      if (!name) { showStatus($('exerciseModalStatus'), '⚠️ Name required.', 'error'); return; }
      const payload = {
        name,
        category: $('exCategory').value.trim() || null,
        muscle_group: $('exMuscle').value.trim() || null,
        default_sets: parseInt($('exSets').value, 10) || null,
        default_reps: $('exReps').value.trim() || null,
        default_weight: $('exWeight').value.trim() || null,
        default_rest: $('exRest').value.trim() || null,
        notes: $('exNotes').value.trim() || null
      };
      try {
        $('saveExerciseBtn').disabled = true;
        const id = $('editExerciseId').value;
        if (id) {
          const { error } = await APP_STATE.supabaseClient.from('exercises').update(payload).eq('id', id);
          if (error) throw error;
          const idx = APP_STATE.exercises.findIndex(e => sameId(e.id, id));
          if (idx >= 0) APP_STATE.exercises[idx] = { ...APP_STATE.exercises[idx], ...payload };
        } else {
          const { data, error } = await APP_STATE.supabaseClient.from('exercises').insert(payload).select().single();
          if (error) throw error;
          APP_STATE.exercises.push(data);
        }
        APP_STATE.exercises.sort((a, b) => a.name.localeCompare(b.name));
        renderLibrary();
        $('exerciseModal').classList.add('hidden');
      } catch (err) {
        showStatus($('exerciseModalStatus'), `❌ ${err.message}`, 'error');
      } finally {
        $('saveExerciseBtn').disabled = false;
      }
    });

    // Create client
    $('createClientBtn').addEventListener('click', createClient);
    $('pickContactBtn').addEventListener('click', pickFromContacts);

    // Client detail actions
    $('closeClientBtn').addEventListener('click', closeSelectedClient);
    $('reopenClientBtn').addEventListener('click', reopenSelectedClient);
    $('deleteClientBtn').addEventListener('click', openDeleteClientModal);
    $('viewLastSessionBtn').addEventListener('click', showMonthSummary);
    $('ratePerSession').addEventListener('change', updateRatePerSession);

    // Reminder
    $('reminderNote').addEventListener('input', saveReminderNote);
    $('sendWhatsappBtn').addEventListener('click', () => sendReminder('whatsapp'));
    $('sendEmailBtn').addEventListener('click', () => sendReminder('email'));

    // Month selector
    $('monthSelect').addEventListener('change', changeMonth);

    // Day log modal
    $('addExerciseToggleBtn').addEventListener('click', () => {
      const body = $('addExerciseBody');
      const btn = $('addExerciseToggleBtn');
      const open = body.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!open));
      btn.querySelector('.aet-chevron').textContent = open ? '▾' : '▴';
    });
    $('closeDayLogBtn').addEventListener('click', () => $('dayLogModal').classList.add('hidden'));
    $('freeAddBtn').addEventListener('click', async () => {
      const name = $('freeExName').value.trim();
      if (!name) { $('freeExName').focus(); return; }
      const matched = APP_STATE.exercises.find(e => e.name.toLowerCase() === name.toLowerCase());
      await addExerciseToDay({ name: matched ? matched.name : name, exercise_id: matched ? matched.id : null });
      $('freeExName').value = '';
      openDayLogModal(APP_STATE.selectedDay);
    });
    $('freeExName').addEventListener('keypress', e => {
      if (e.key === 'Enter') { e.preventDefault(); $('freeAddBtn').click(); }
    });

    // Set time modal
    $('cancelSetTimeBtn').addEventListener('click', () => $('setTimeModal').classList.add('hidden'));
    $('saveSetTimeBtn').addEventListener('click', async () => {
      const dateStr = $('stDayDate').value;
      const timeVal = $('stTime').value;
      const noteVal = $('stNote').value.trim();
      if (!dateStr || !timeVal) { showStatus($('setTimeStatus'), '⚠️ Time required.', 'error'); return; }
      try {
        $('saveSetTimeBtn').disabled = true;
        const { error } = await APP_STATE.supabaseClient.from('daily_times').upsert(
          { client_id: APP_STATE.selectedClientId, day_date: dateStr, class_time: timeVal, note: noteVal || null },
          { onConflict: 'client_id,day_date' }
        );
        if (error) throw error;
        if (!clientMapGet(APP_STATE.dailyTimesCache, APP_STATE.selectedClientId)) clientMapSet(APP_STATE.dailyTimesCache, APP_STATE.selectedClientId, []);
        const dtList = clientMapGet(APP_STATE.dailyTimesCache, APP_STATE.selectedClientId);
        for (let i = dtList.length - 1; i >= 0; i--) {
          if (dtList[i].day_date === dateStr) dtList.splice(i, 1);
        }
        dtList.push({ day_date: dateStr, class_time: timeVal, note: noteVal || null });
        $('setTimeModal').classList.add('hidden');
        renderSessions();
      } catch (err) {
        showStatus($('setTimeStatus'), '❌ ' + err.message, 'error');
      } finally {
        $('saveSetTimeBtn').disabled = false;
      }
    });
    $('clearSetTimeBtn').addEventListener('click', async () => {
      const dateStr = $('stDayDate').value;
      if (!dateStr) return;
      if (!await uiConfirm({ title: 'Clear Class Time', message: 'Clear the time for this day?', confirmText: '🗑️ Clear', danger: true })) return;
      try {
        await APP_STATE.supabaseClient.from('daily_times').delete()
          .eq('client_id', APP_STATE.selectedClientId).eq('day_date', dateStr);
        clientMapSet(APP_STATE.dailyTimesCache, APP_STATE.selectedClientId,
          (clientMapGet(APP_STATE.dailyTimesCache, APP_STATE.selectedClientId) || []).filter(d => d.day_date !== dateStr));
        $('setTimeModal').classList.add('hidden');
        renderSessions();
      } catch (err) { showStatus($('setTimeStatus'), '❌ Failed: ' + err.message, 'error'); }
    });

    // Month summary modal
    $('closeMonthSummaryBtn').addEventListener('click', () => $('monthSummaryModal').classList.add('hidden'));

    // Progress modal
    $('cancelProgressBtn').addEventListener('click', () => $('progressModal').classList.add('hidden'));
    $('saveProgressBtn').addEventListener('click', saveProgress);
    // ➕ Add Entry — routed through the guarded opener in js/client-portal.js
    // (lazy lookup + try/catch, works even if main.js bind() partially failed).
    const adminAddBtn = $('adminAddProgressBtn');
    if (adminAddBtn) adminAddBtn.addEventListener('click', () => {
      if (!APP_STATE.selectedClientId) return;
      if (typeof window.openProgressModal === 'function') openProgressModal(null, APP_STATE.selectedClientId, 'admin');
    });
    const clientAddBtn = $('clientAddProgressBtn');
    if (clientAddBtn) clientAddBtn.addEventListener('click', () => {
      if (typeof window.tasOpenAddEntry === 'function') window.tasOpenAddEntry();
      else if (APP_STATE.loggedInClient && typeof window.openProgressModal === 'function') {
        openProgressModal(null, APP_STATE.loggedInClient.id, 'client');
      }
    });

    // Profile edit modal
    $('cancelProfileEditBtn').addEventListener('click', () => $('profileEditModal').classList.add('hidden'));
    $('submitProfileBtn').addEventListener('click', submitProfileEdit);
    // ✏️ Edit Profile — same guarded routing as above.
    const clientEditBtn = $('clientEditProfileBtn');
    if (clientEditBtn) clientEditBtn.addEventListener('click', () => {
      if (typeof window.tasOpenProfileEdit === 'function') window.tasOpenProfileEdit();
      else if (APP_STATE.loggedInClient) {
        const p = clientMapGet(APP_STATE.clientProfiles, APP_STATE.loggedInClient.id) || {};
        [['peHeight', p.height_cm], ['peGender', p.gender], ['peBirth', p.birth_date],
         ['peGoal', p.goal], ['peMedical', p.medical_notes], ['peEmergency', p.emergency_contact]]
          .forEach(([id, v]) => { const el = $(id); if (el) el.value = v == null ? '' : String(v); });
        if (typeof window.prefillProfileCalcStats === 'function') window.prefillProfileCalcStats(p);
        $('profileEditModal').classList.remove('hidden');
        clearStatus($('profileEditStatus'));
      }
    });

    // Wipe modal
    $('clearAllBtn').addEventListener('click', openWipeModal);
    $('cancelClearAllBtn').addEventListener('click', () => $('clearAllModal').classList.add('hidden'));
    $('clearConfirmInput').addEventListener('input', (e) => {
      $('confirmClearAllBtn').disabled = e.target.value.trim() !== 'DELETE';
    });
    $('confirmClearAllBtn').addEventListener('click', performWipe);

    // Delete client modal
    $('cancelDeleteClientBtn').addEventListener('click', () => $('deleteClientModal').classList.add('hidden'));
    $('deleteConfirmInput').addEventListener('input', (e) => {
      $('confirmDeleteClientBtn').disabled = e.target.value.trim() !== 'DELETE';
    });
    $('confirmDeleteClientBtn').addEventListener('click', confirmDeleteClient);

    // Client dashboard tabs
    document.querySelectorAll('.tab-btn[data-ctab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.ctab;
        document.querySelectorAll('.tab-btn[data-ctab]').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-content[id^="ctab-"]').forEach(t => t.classList.toggle('hidden', t.id !== `ctab-${tab}`));
      });
    });

    // Admin client detail tabs
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-content[id^="tab-"]').forEach(t => t.classList.toggle('hidden', t.id !== `tab-${tab}`));
        if (tab === 'progress' && typeof window.renderProgressDashboard === 'function') window.renderProgressDashboard();
      });
    });
  }

  function attachConfirmLogout(btn) {
    if (!btn) return;
    let armed = false, t = null;
    const original = btn.textContent;
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        btn.textContent = 'Confirm?';
        btn.classList.add('btn-danger');
        t = setTimeout(() => { armed = false; btn.textContent = original; btn.classList.remove('btn-danger'); }, 3000);
        return;
      }
      clearTimeout(t);
      armed = false;
      btn.textContent = original;
      btn.classList.remove('btn-danger');
      unifiedLogout();
      showToast('👋 Signed out successfully.', 'info', 2500);
    });
  }

  function boot() {
    // Footer year + live portal URL (same link that goes out in WhatsApp messages)
    const fy = $('footerYear'); if (fy) fy.textContent = new Date().getFullYear();
    const fu = $('footerAppUrl');
    if (fu) { try { fu.textContent = APP_CONFIG.LOGIN_URL.replace(/^https?:\/\//, ''); } catch (e) { fu.textContent = ''; } }

    // Default month dropdown
    const ms = $('monthSelect');
    if (ms) { ms.value = new Date().getMonth(); APP_STATE.selectedMonth = new Date().getMonth(); APP_STATE.selectedYear = new Date().getFullYear(); }

    // Password toggles
    initPasswordToggles();

    // Contact picker support
    initContactPicker();

    // Light/dark theme toggle (restores saved preference)
    if (typeof window.initThemeToggle === 'function') window.initThemeToggle();

    // Wire all events
    bind();

    // NEW: wire up the library cascading dropdowns
    if (typeof initLibraryDropdowns === 'function') initLibraryDropdowns();

    // ESC key closes any open modal or admin panel (professional UX)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
      ['settingsPanel', 'libraryPanel', 'approvalsPanel', 'classTimesPanel',
        'reportsPanel', 'requestsPanel'].forEach(id => {
        const el = $(id); if (el) el.classList.add('hidden');
      });
    });

    // Boot cloud + data (waits for Supabase SDK inside initSupabase)
    initSupabase();

    // Late init for drive images (after full load, in case <img> tags were added dynamically)
    window.addEventListener('load', () => {
      if (window.DriveImages) window.DriveImages.init();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();