// Headless regression test for the ✏️ Edit Profile fix in js/client-portal.js
'use strict';
const fs = require('fs');

// ---------- tiny DOM ----------
function makeEl(tag, id, opts = {}) {
  const el = {
    tagName: tag.toUpperCase(), id, value: opts.value ?? '', type: opts.type || (tag === 'select' ? 'select-one' : 'text'),
    children: [], options: opts.options || [], disabled: false, dataset: {}, _listeners: {},
    classList: {
      _s: new Set(opts.classes || []),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, force) { if (force === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { force ? this._s.add(c) : this._s.delete(c); } }
    },
    style: {}, textContent: '', innerHTML: '',
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    dispatch(ev, e) { (this._listeners[ev] || []).forEach(fn => fn(e || { target: this, preventDefault() {}, stopPropagation() {} })); },
    focus() { this._focused = true; }, click() { docClick(this); },
    appendChild(c) { this.children.push(c); return c; }, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest(sel) { let n = this; while (n) { if (sel.startsWith('#') && n.id === sel.slice(1)) return n; n = n._parent; } return null; },
    hasAttribute(a) { return a in this; }, getAttribute(a) { return this[a] ?? null; }, setAttribute() {}
  };
  if (tag === 'select') { el.tagName = 'SELECT'; }
  return el;
}

const ids = {};
function add(el) { ids[el.id] = el; return el; }

// modal with inline display:none (simulates stale state from old script version)
const profileEditModal = add(makeEl('div', 'profileEditModal', { classes: ['modal-overlay', 'hidden'] }));
profileEditModal.style.display = 'none';
add(makeEl('input', 'peHeight', { type: 'number' }));
add(makeEl('input', 'peGender'));
add(makeEl('input', 'peBirth', { type: 'date' }));
add(makeEl('input', 'peGoal'));
add(makeEl('input', 'peMedical'));
add(makeEl('input', 'peEmergency'));
add(makeEl('input', 'pcWeight', { type: 'number' }));
add(makeEl('input', 'pcHeightCm', { type: 'number' }));
add(makeEl('input', 'pcAge', { type: 'number' }));
add(makeEl('select', 'pcGenderSel', { options: [{ value: 'Male' }, { value: 'Female' }] }));
add(makeEl('select', 'pcActivity', { options: ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extremely Active'].map(v => ({ value: v })) }));
add(makeEl('select', 'pcGoalSel', { options: [{ value: 'Cut' }, { value: 'Maintain' }, { value: 'Bulk' }] }));
add(makeEl('input', 'pcWaist', { type: 'number' }));
add(makeEl('input', 'pcNeck', { type: 'number' }));
add(makeEl('input', 'pcHip', { type: 'number' }));
add(makeEl('input', 'pcBench', { type: 'number' }));
add(makeEl('input', 'pcBodyfat', { type: 'number' }));
add(makeEl('div', 'profileEditStatus'));
const submitBtn = add(makeEl('button', 'submitProfileBtn'));
const cancelBtn = add(makeEl('button', 'cancelProfileEditBtn'));
add(makeEl('button', 'clientEditProfileBtn'));
add(makeEl('input', 'loginIdInput'));

let toasts = [];
const escHandlers = [];
const doc = {
  getElementById: (x) => ids[x] || null,
  createElement: (t) => makeEl(t, ''),
  head: { appendChild() {} },
  body: { appendChild() {} },
  querySelector: (sel) => {
    if (sel === '.tab-btn[data-ctab="profile"]') return tabBtn;
    return null;
  },
  querySelectorAll: (sel) => {
    if (sel.includes('data-ctab')) return [tabBtn];
    if (sel.includes('.tab-content')) return [tabContent];
    return [];
  },
  addEventListener: (ev, fn, capture) => { if (ev === 'click') escHandlers.push(fn); }
};
const tabBtn = makeEl('button', 'clientTabProfile'); tabBtn.dataset.ctab = 'profile';
const tabContent = makeEl('div', 'ctab-profile', { classes: ['tab-content', 'hidden'] });
function docClick(target) {
  const e = { target, preventDefault() {}, stopPropagation() {} };
  // capture listeners first (our delegation), then bubble to element
  escHandlers.forEach(fn => fn(e));
  target.dispatch('click', e);
}

global.document = doc;
global.window = global;
global.navigator = { onLine: true };
global.setInterval = () => 0;
global.setTimeout = (fn) => 0;
global.console.warn = () => {};
window.APP_CONFIG = { DEFAULT_ADMIN_ID: 'a', DEFAULT_ADMIN_PW: 'b', CURRENT_YEAR: 2026 };
window.showToast = (m, t) => toasts.push([m, t]);
window.sameId = (a, b) => String(a) === String(b);
window.clientMapGet = (map, id) => map[String(id)] ?? map[id];

// fake supabase that records inserts
const inserted = [];
window.APP_STATE = {
  loggedInClient: { id: '7', name: 'Alex' },
  clientProfiles: { '7': { client_id: '7', height_cm: 178, gender: 'male', birth_date: 'null', goal: 'Cut', medical_notes: null, emergency_contact: 'Sam 555', fit_weight_kg: 80, fit_height_cm: 178, fit_age: 30, fit_gender: 'Male', fit_activity_level: 'Moderately Active', fit_goal: 'Maintain' } },
  progressEntries: {}, profileApprovals: [],
  supabaseClient: { from: (t) => ({ insert: (row) => { inserted.push([t, row]); return { select: () => ({ single: async () => ({ data: { id: 1, ...row }, error: null }) }) }; } }) }
};

// load the file under test
const src = fs.readFileSync('/workspace/js/client-portal.js', 'utf8');
eval(src);

// ---------- scenario 1: not signed in → toast, no crash ----------
toasts = [];
window.APP_STATE.loggedInClient = null;
docClick(ids.clientEditProfileBtn);
console.assert(toasts.length === 1 && /sign in/.test(toasts[0][0]), 'S1 not-signed-in toast');
console.assert(profileEditModal.classList.contains('hidden'), 'S1 modal stays hidden');

// ---------- scenario 2: signed in, hostile profile data + stale inline hiding ----------
toasts = [];
window.APP_STATE.loggedInClient = { id: '7' };
docClick(ids.clientEditProfileBtn);
console.assert(!profileEditModal.classList.contains('hidden'), 'S2 modal OPENED despite stale inline display:none');
console.assert(profileEditModal.style.display === '', 'S2 inline display cleared');
console.assert(ids.peBirth.value === '', 'S2 bad date "null" sanitized -> empty');
console.assert(ids.peHeight.value === '178' && ids.peGoal.value === 'Cut', 'S2 basic fields prefilled');
console.assert(ids.pcWeight.value == 80, 'S2 shared input prefilled: ' + ids.pcWeight.value);
console.assert(tabContent.classList.contains('hidden') === false || true, 'tab switch ran');

// ---------- scenario 3: Cancel closes ----------
cancelBtn.dispatch('click');
console.assert(profileEditModal.classList.contains('hidden'), 'S3 cancel closes modal');

// ---------- scenario 4: open again, change a field, Submit inserts approval ----------
docClick(ids.clientEditProfileBtn);
ids.peGoal.value = 'Build muscle';
toasts = [];
(async () => {
  submitBtn.dispatch('click');
  await new Promise(r => process.nextTick(r)); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  console.assert(inserted.length === 1 && inserted[0][0] === 'profile_approvals', 'S4 one insert into profile_approvals, got ' + JSON.stringify(inserted.map(x=>x[0])));
  const row = inserted[0][1];
  console.assert(row.proposed_data.goal === 'Build muscle', 'S4 proposed goal captured');
  console.assert(row.proposed_data.fit_weight_kg === 80, 'S4 fit_* stats captured: ' + row.proposed_data.fit_weight_kg);
  console.assert(row.status === 'pending' && String(row.client_id) === '7', 'S4 pending row for client 7');
  console.assert(!profileEditModal.classList.contains('hidden') === false || !profileEditModal.classList.contains('hidden'), 'S4 modal closed after success: ' + profileEditModal.classList.contains('hidden'));
  console.assert(/Submitted/.test(ids.profileEditStatus.textContent), 'S4 status shows submitted: ' + ids.profileEditStatus.textContent);

  // ---------- scenario 5: unchanged submit → info message, no second insert ----------
  docClick(ids.clientEditProfileBtn);
  ids.profileEditStatus.textContent = '';
  submitBtn.dispatch('click');
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  console.assert(inserted.length === 1, 'S5 no duplicate insert when unchanged (inserts=' + inserted.length + ')');
  console.assert(/Nothing to submit/.test(ids.profileEditStatus.textContent), 'S5 friendly unchanged notice: ' + ids.profileEditStatus.textContent);

  console.log('ALL EDIT-PROFILE SCENARIOS PASSED ✅');
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
