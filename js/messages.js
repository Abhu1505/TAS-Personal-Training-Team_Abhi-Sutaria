// ============================================================
// 💬 IN-PORTAL MESSAGING — direct chat between trainer & clients
// ------------------------------------------------------------
// • Table: `messages` (thread_id = client login id upper-cased, so
//   both sides always land in the same conversation).
// • Realtime: piggybacks on Supabase Realtime (see realtime.js) and
//   also a 45s poll fallback → unread badges on both dashboards.
// • Trainer side: new "💬 Messages" panel inside the Clients
//   workspace — conversation list + thread view per client.
// • Client side: "💬 Chat" tab injected into the client portal.
// • WhatsApp fallback: one-tap "open in WhatsApp" keeps the message
//   history in-app while letting the client reply where they like.
// Works offline: sends queue through the tas-offline-queue and are
// replayed automatically when connectivity returns.
// ============================================================
(function () {
  'use strict';

  const $id = (x) => document.getElementById(x);
  function sb() { return APP_STATE.supabaseClient; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function threadIdFor(client) { return String((client && client.login_id) || '').toUpperCase(); }
  function who() {
    if (APP_STATE.loggedInClient) return { role: 'client', name: APP_STATE.loggedInClient.name, id: APP_STATE.loggedInClient.id };
    try { if (sessionStorage.getItem('tas_trainer_session') === '1') return { role: 'trainer', name: 'Trainer', id: 'trainer' }; } catch (e) {}
    return null;
  }

  const UNREAD_KEY = 'tas_msg_unread_v1'; // { threadIdUpper: lastReadISO }
  function readMarks() { try { return JSON.parse(localStorage.getItem(UNREAD_KEY) || '{}'); } catch (e) { return {}; } }
  function markRead(tid) { const m = readMarks(); m[tid] = new Date().toISOString(); localStorage.setItem(UNREAD_KEY, JSON.stringify(m)); refreshBadges(); }
  window._tasMsgState = { threads: {}, activeThread: null, poll: null };

  // ---------------- data ----------------
  async function fetchThread(tid, limit) {
    if (!sb()) return [];
    try {
      const { data, error } = await sb().from('messages')
        .select('*').eq('thread_id', tid).order('created_at', { ascending: true }).limit(limit || 200);
      if (error) throw error;
      return data || [];
    } catch (e) {
      if (window.isMissingTableError && window.isMissingTableError(e)) {
        try { await window.ensureTableExists('messages'); } catch (e2) {}
      }
      return [];
    }
  }

  window.tasSendmessage = null; // placeholder to avoid typos below
  window.tasSendMessage = async function (tid, text, fromRole, fromName, clientId) {
    text = String(text || '').trim();
    if (!text || !tid) return false;
    const row = {
      thread_id: tid, client_id: clientId || null, from_role: fromRole,
      from_name: fromName || '', body: text, created_at: new Date().toISOString()
    };
    if (!sb() || !navigator.onLine) {
      if (typeof window.tasQueueOfflineWrite === 'function') {
        window.tasQueueOfflineWrite({ table: 'messages', op: 'insert', payload: row });
        showToast('📴 Offline — message queued for send.', 'info');
        return true;
      }
      showToast('⚠️ Cannot send while offline.', 'error');
      return false;
    }
    try {
      const { error } = await sb().from('messages').insert(row);
      if (error) throw error;
      return true;
    } catch (e) {
      if (window.isMissingTableError && window.isMissingTableError(e)) {
        const fixed = await window.ensureTableExists('messages');
        if (fixed) return window.tasSendMessage(tid, text, fromRole, fromName, clientId);
      }
      showToast('❌ Could not send: ' + (e.message || e), 'error');
      return false;
    }
  };

  // ---------------- unread badges ----------------
  window.tasMessageUnreadCount = function (tid) {
    const rows = window._tasMsgState.threads[tid] || [];
    const lastRead = readMarks()[tid];
    return rows.filter(r => (!lastRead || r.created_at > lastRead)).length;
  };

  function refreshBadges() {
    // trainer tab badge
    const adminBadge = $id('adminMsgTabBadge');
    const clientBadge = $id('clientChatTabBadge');
    const me = who();
    if (me && me.role === 'trainer') {
      let total = 0;
      Object.keys(window._tasMsgState.threads).forEach(tid => {
        const rows = window._tasMsgState.threads[tid] || [];
        if (rows.some(r => r.from_role === 'client')) total += window.tasMessageUnreadCount(tid);
      });
      if (adminBadge) { adminBadge.textContent = total; adminBadge.classList.toggle('hidden', total === 0); }
    }
    if (me && me.role === 'client') {
      const tid = threadIdFor(me && APP_STATE.loggedInClient);
      const n = window.tasMessageUnreadCount(tid);
      if (clientBadge) { clientBadge.textContent = n; clientBadge.classList.toggle('hidden', n === 0); }
    }
  }

  async function loadAllThreadsForTrainer() {
    if (!sb()) return;
    try {
      const { data } = await sb().from('messages')
        .select('*').order('created_at', { ascending: true }).limit(2000);
      (data || []).forEach(r => {
        const tid = r.thread_id;
        if (!window._tasMsgState.threads[tid]) window._tasMsgState.threads[tid] = [];
        if (!window._tasMsgState.threads[tid].some(x => x.id === r.id)) window._tasMsgState.threads[tid].push(r);
      });
    } catch (e) { /* table missing */ }
    refreshBadges();
  }

  // Poll fallback (realtime covers instant, this covers gaps)
  function startPolling() {
    if (window._tasMsgState.poll) return;
    window._tasMsgState.poll = setInterval(async () => {
      const me = who(); if (!me || !sb()) return;
      if (me.role === 'trainer') {
        await loadAllThreadsForTrainer();
        if (window._tasMsgState.activeThread) renderTrainerThread(window._tasMsgState.activeThread);
      } else {
        const tid = threadIdFor(APP_STATE.loggedInClient);
        window._tasMsgState.threads[tid] = await fetchThread(tid);
        if ($id('clientChatThread')) renderClientChatThread();
        refreshBadges();
      }
    }, 45000);
  }

  // ---------------- trainer UI ----------------
  function ensureMessagesButton() {
    const bar = document.querySelector('.admin-workspace-tabs');
    if (!bar || $id('adminTabMsgsBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tab-btn'; btn.setAttribute('data-atab2', 'msgs');
    btn.setAttribute('type', 'button'); btn.setAttribute('role', 'tab');
    btn.id = 'adminTabMsgsBtn';
    btn.innerHTML = '💬 Messages <span id="adminMsgTabBadge" class="badge-count hidden">0</span>';
    bar.appendChild(btn);

    const wsClients = $id('adminWorkspaceClients');
    if (!wsClients) return;
    const ws = document.createElement('div');
    ws.id = 'adminWorkspaceMsgs'; ws.className = 'admin-workspace hidden';
    ws.innerHTML = `
      <div class="msg-layout">
        <aside class="msg-list" aria-label="Conversations"><div class="cds-muted">Loading…</div></aside>
        <section class="msg-thread" aria-label="Conversation">
          <div class="msg-empty">Select a client to view the conversation.</div>
        </section>
      </div>`;
    wsClients.parentNode.insertBefore(ws, wsClients.nextSibling);

    const orig = window.showAdminWorkspaceTab;
    if (orig && !window.__msgsWrapped) {
      window.__msgsWrapped = true;
      window.showAdminWorkspaceTab = function (tab) {
        const out = orig.apply(this, arguments);
        const el = $id('adminWorkspaceMsgs');
        if (el) el.classList.toggle('hidden', tab !== 'msgs');
        if (tab === 'msgs') { startPolling(); openMessagesPanel(); }
        return out;
      };
    }
  }

  window.openMessagesPanel = async function () {
    ensureMessagesButton();
    await loadAllThreadsForTrainer();
    renderTrainerList();
    if (window._tasMsgState.activeThread) renderTrainerThread(window._tasMsgState.activeThread);
  };

  function renderTrainerList() {
    const list = document.querySelector('#adminWorkspaceMsgs .msg-list');
    if (!list) return;
    const clients = (APP_STATE.clients || []).filter(c => c.active);
    const rowsHtml = clients.map(c => {
      const tid = threadIdFor(c);
      const msgs = window._tasMsgState.threads[tid] || [];
      const last = msgs[msgs.length - 1];
      const unread = msgs.some(m => m.from_role === 'client') ? window.tasMessageUnreadCount(tid) : 0;
      return `<button type="button" class="msg-item ${window._tasMsgState.activeThread === tid ? 'active' : ''}" data-tid="${esc(tid)}">
        <span class="msg-item-name">${esc(c.name)} ${unread ? `<span class="msg-unread">${unread}</span>` : ''}</span>
        <span class="msg-item-preview">${last ? esc((last.from_role === 'trainer' ? 'You: ' : '') + last.body).slice(0, 60) : 'No messages yet'}</span>
      </button>`;
    }).join('');
    list.innerHTML = `<div class="msg-search-wrap"><input id="msgSearch" class="msg-search" placeholder="🔍 Search clients…" aria-label="Search conversations"></div>${rowsHtml || '<div class="cds-muted">No active clients.</div>'}`;
    list.querySelectorAll('[data-tid]').forEach(b =>
      b.addEventListener('click', () => { window._tasMsgState.activeThread = b.dataset.tid; markRead(b.dataset.tid); renderTrainerList(); renderTrainerThread(b.dataset.tid); }));
    const search = $id('msgSearch');
    if (search) search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      list.querySelectorAll('.msg-item').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  async function renderTrainerThread(tid) {
    const pane = document.querySelector('#adminWorkspaceMsgs .msg-thread');
    if (!pane || !tid) return;
    if (!window._tasMsgState.threads[tid]) window._tasMsgState.threads[tid] = await fetchThread(tid);
    const client = (APP_STATE.clients || []).find(c => threadIdFor(c) === tid);
    const msgs = window._tasMsgState.threads[tid];
    pane.innerHTML = `
      <header class="msg-thread-head">
        <strong>${esc(client ? client.name : tid)}</strong>
        ${client && client.phone ? `<a class="btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/${esc(String(client.phone).replace(/\\D/g, ''))}?text=${encodeURIComponent('Hi ' + client.name + ', ') }">📱 Reply on WhatsApp</a>` : ''}
      </header>
      <div class="msg-bubbles" id="trainerMsgBubbles">${msgs.map(bubbleHtml).join('') || '<div class="cds-muted">Say hello 👋</div>'}</div>
      <form class="msg-compose" id="trainerMsgForm">
        <input id="trainerMsgInput" autocomplete="off" placeholder="Type a message to ${esc(client ? client.name.split(' ')[0] : tid)}…" aria-label="Message text">
        <button class="btn-primary" type="submit">Send ➤</button>
      </form>`;
    const bubbles = $id('trainerMsgBubbles');
    if (bubbles) bubbles.scrollTop = bubbles.scrollHeight;
    const form = $id('trainerMsgForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = $id('trainerMsgInput');
      const txt = inp.value.trim(); if (!txt) return;
      inp.value = ''; inp.disabled = true;
      const ok = await window.tasSendMessage(tid, txt, 'trainer', 'Trainer', client ? client.id : null);
      inp.disabled = false; inp.focus();
      if (ok) {
        window._tasMsgState.threads[tid].push({ thread_id: tid, from_role: 'trainer', from_name: 'Trainer', body: txt, created_at: new Date().toISOString(), _local: true });
        markRead(tid);
        renderTrainerThread(tid); renderTrainerList();
      }
    });
  }

  function bubbleHtml(m) {
    const mine = who();
    const side = m.from_role === 'trainer' ? 'trainer' : 'client';
    const t = new Date(m.created_at);
    const time = isNaN(t) ? '' : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `<div class="bubble bubble-${side} ${m._local ? 'bubble-pending' : ''}"><span class="bubble-body">${esc(m.body)}</span><span class="bubble-meta">${esc(m.from_name || side)} · ${esc(time)}</span></div>`;
  }

  // ---------------- client UI ----------------
  function injectClientChatTab() {
    const tabs = document.querySelector('#clientDashboard [data-ctab="tools"]');
    const bar = tabs && tabs.parentElement;
    if (!bar || $id('clientChatTabBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tab-btn'; btn.setAttribute('data-ctab', 'chat');
    btn.id = 'clientChatTabBtn';
    btn.innerHTML = '💬 Chat <span id="clientChatTabBadge" class="badge-count hidden">0</span>';
    bar.appendChild(btn);

    const content = document.querySelector('#clientDashboard .tab-content:not(.hidden)');
    const holder = content && content.parentElement;
    if (!holder) return;
    const div = document.createElement('div');
    div.className = 'tab-content hidden'; div.id = 'ctab-chat';
    div.innerHTML = `
      <div class="msg-thread client-msg-thread">
        <div class="msg-bubbles" id="clientChatThread"><div class="cds-muted">Loading chat…</div></div>
        <form class="msg-compose" id="clientMsgForm">
          <input id="clientMsgInput" autocomplete="off" placeholder="Message your trainer…" aria-label="Message your trainer">
          <button class="btn-primary" type="submit">Send ➤</button>
        </form>
        <p class="cds-muted msg-hint">💡 Your trainer gets an instant alert. You can also reply any time from WhatsApp.</p>
      </div>`;
    holder.appendChild(div);

    // wire tab switching (the portal uses delegated data-ctab handlers already;
    // add our own listener that reacts after them)
    btn.addEventListener('click', () => setTimeout(loadClientChat, 50));
  }

  async function loadClientChat() {
    const c = APP_STATE.loggedInClient; if (!c) return;
    const tid = threadIdFor(c);
    window._tasMsgState.threads[tid] = await fetchThread(tid);
    markRead(tid);
    renderClientChatThread();
  }

  function renderClientChatThread() {
    const box = $id('clientChatThread');
    const c = APP_STATE.loggedInClient; if (!box || !c) return;
    const tid = threadIdFor(c);
    const msgs = window._tasMsgState.threads[tid] || [];
    box.innerHTML = msgs.map(bubbleHtml).join('') || '<div class="cds-muted">No messages yet — say hi to your trainer 👋</div>';
    box.scrollTop = box.scrollHeight;
    const form = $id('clientMsgForm');
    if (form && !form.__wired) {
      form.__wired = true;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inp = $id('clientMsgInput');
        const txt = inp.value.trim(); if (!txt) return;
        inp.value = ''; inp.disabled = true;
        const ok = await window.tasSendMessage(tid, txt, 'client', c.name, c.id);
        inp.disabled = false;
        if (ok) {
          window._tasMsgState.threads[tid].push({ thread_id: tid, from_role: 'client', from_name: c.name, body: txt, created_at: new Date().toISOString(), _local: true });
          renderClientChatThread();
        }
      });
    }
  }

  // expose for realtime hook & auth wiring
  window.tasMessagesNotifyRemote = function () { refreshBadges(); };
  window.tasOpenClientChat = loadClientChat;

  // ---------------- boot ----------------
  document.addEventListener('DOMContentLoaded', () => {
    ensureMessagesButton();
    // After a client dashboard opens, inject the chat tab.
    const origOpen = window.openClientDashboard;
    if (origOpen && !window.__msgsClientWrapped) {
      window.__msgsClientWrapped = true;
      window.openClientDashboard = function () {
        const out = origOpen.apply(this, arguments);
        try { injectClientChatTab(); startPolling(); loadClientChat(); } catch (e) {}
        return out;
      };
    }
    // After admin dashboard opens, preload threads.
    const origAdmin = window.openAdminDashboard;
    if (origAdmin && !window.__msgsAdminWrapped) {
      window.__msgsAdminWrapped = true;
      window.openAdminDashboard = function () {
        const out = origAdmin.apply(this, arguments);
        try { startPolling(); loadAllThreadsForTrainer(); } catch (e) {}
        return out;
      };
    }
  });
})();
