/* =====================================================
   Archery Score Log — Supabase-powered frontend
   ===================================================== */

const state = {
  user: null,       // { id, email, name, isAdmin }
  activeTermId: null,
  activeTab: 'today',
  selectedDate: todayIso(),
  monthCursor: monthStart(todayIso()),
  adminDateFilter: todayIso(),
  adminStudentFilter: 'all',
  // cached data
  terms: [],
  enrollments: [],
  sessions: [],
  loading: false,
  error: null
};

const app = document.querySelector('#app');
app.addEventListener('click', onClick);
app.addEventListener('change', onChange);
app.addEventListener('submit', onSubmit);
app.addEventListener('input', onInput);

// Boot: check auth state
(async () => {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      await loadUserProfile(session.user.id);
    }
    // Listen for auth state changes
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await loadUserProfile(session.user.id);
        await loadTerms();
        await renderAsync();
      } else if (event === 'SIGNED_OUT') {
        state.user = null;
        state.terms = [];
        state.enrollments = [];
        state.sessions = [];
        render();
      }
    });
    await loadTerms();
  } catch (err) {
    console.error('Boot error:', err);
  }
  await renderAsync();
})();

// ── Data loaders ──────────────────────────────────────

async function loadUserProfile(userId) {
  // Retry a few times since trigger may not have finished yet
  let data = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await sb
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    data = result.data;
    if (data) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (data) {
    state.user = { id: data.id, email: data.email, name: data.name, isAdmin: data.is_admin };
  } else {
    // Fallback: trigger hasn't run yet or failed — create profile manually
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const email = session.user.email || '';
      const name = session.user.user_metadata?.name || email;
      await sb.from('users').upsert({ id: userId, email, name, is_admin: false });
      state.user = { id: userId, email, name, isAdmin: false };
    } else {
      state.user = null;
    }
  }
}

async function loadTerms() {
  const { data, error } = await sb
    .from('terms')
    .select('*')
    .order('start_date', { ascending: false });

  if (data) {
    state.terms = data.map(shapeTerm);
    if (!state.activeTermId && state.terms.length) {
      state.activeTermId = state.terms[0].id;
    }
  }
}

async function loadEnrollments(termId) {
  if (!termId) return;
  const { data } = await sb
    .from('enrollments')
    .select('*')
    .eq('term_id', termId);
  state.enrollments = (data || []).map(shapeEnrollment);
}

async function loadMySession(termId, date) {
  if (!termId || !state.user) return null;
  const { data } = await sb
    .from('sessions')
    .select('*, ends(*, shots(*))')
    .eq('term_id', termId)
    .eq('user_id', state.user.id)
    .eq('session_date', date)
    .maybeSingle();
  return data ? shapeSessionFull(data) : null;
}

async function loadMySessions(termId, month) {
  if (!termId || !state.user) return [];
  const { data } = await sb
    .from('sessions')
    .select('*, ends(*, shots(*))')
    .eq('term_id', termId)
    .eq('user_id', state.user.id)
    .gte('session_date', `${month}-01`)
    .lte('session_date', `${month}-31`)
    .order('session_date', { ascending: true });
  return (data || []).map(shapeSessionFull);
}

async function loadClassSessions(termId, date) {
  if (!termId) return [];
  const { data } = await sb
    .from('sessions')
    .select('*, ends(*, shots(*))')
    .eq('term_id', termId)
    .eq('session_date', date);
  return (data || []).map(shapeSessionFull);
}

async function loadClassEnrollments(termId) {
  if (!termId) return [];
  const { data } = await sb
    .from('enrollments')
    .select('*')
    .eq('term_id', termId)
    .eq('status', 'Approved');
  return (data || []).map(shapeEnrollment);
}

async function loadPendingEnrollments(termId) {
  if (!termId) return [];
  const { data } = await sb
    .from('enrollments')
    .select('*, users(name, email)')
    .eq('term_id', termId)
    .eq('status', 'Pending')
    .order('requested_at', { ascending: false });
  return (data || []).map(e => ({
    ...shapeEnrollment(e),
    user: e.users ? { name: e.users.name, email: e.users.email } : null
  }));
}

async function loadAdminRoster(termId) {
  if (!termId) return [];
  const { data } = await sb
    .from('enrollments')
    .select('*, users(name, email)')
    .eq('term_id', termId)
    .eq('status', 'Approved')
    .order('label', { ascending: true });
  return (data || []).map(e => ({
    ...shapeEnrollment(e),
    user: e.users ? { name: e.users.name, email: e.users.email } : null
  }));
}

async function loadAdminSessions(termId, date, userId) {
  if (!termId) return [];
  let query = sb
    .from('sessions')
    .select('*, ends(*, shots(*)), users(name)')
    .eq('term_id', termId)
    .order('session_date', { ascending: false });
  if (date) query = query.eq('session_date', date);
  if (userId && userId !== 'all') query = query.eq('user_id', userId);
  const { data } = await query;
  return (data || []).map(s => ({
    ...shapeSessionFull(s),
    userName: s.users?.name || 'Unknown'
  }));
}

// ── Event handlers ────────────────────────────────────

async function onClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'switch-tab') {
    state.activeTab = btn.dataset.tab;
    await renderAsync();
    return;
  }

  if (action === 'logout') {
    await sb.auth.signOut();
    return;
  }

  if (action === 'request-enrollment') {
    await requestEnrollment(btn.dataset.termId);
    return;
  }

  if (action === 'approve' || action === 'reject') {
    await setEnrollmentStatus(btn.dataset.enrollmentId, action === 'approve' ? 'Approved' : 'Rejected');
    return;
  }

  if (action === 'create-session') {
    await createTodaySession();
    return;
  }

  if (action === 'add-end') {
    await addEnd();
    return;
  }

  if (action === 'save-end') {
    await saveEnd(btn.dataset.endId);
    return;
  }

  if (action === 'delete-end') {
    await deleteEnd(btn.dataset.endId);
    return;
  }

  if (action === 'finish-session') {
    await finishSession();
    return;
  }

  if (action === 'pick-date') {
    state.selectedDate = btn.dataset.date;
    await renderAsync();
    return;
  }

  if (action === 'month-prev' || action === 'month-next') {
    state.monthCursor = shiftMonth(state.monthCursor, action === 'month-next' ? 1 : -1);
    await renderAsync();
    return;
  }

  if (action === 'save-admin-session') {
    await adminSaveSession(btn.dataset.sessionId);
    return;
  }

  if (action === 'delete-account') {
    await deleteAccount();
    return;
  }
}

async function onChange(event) {
  if (event.target.name === 'termId') {
    state.activeTermId = event.target.value;
    await renderAsync();
  }
  if (event.target.name === 'adminDateFilter') {
    state.adminDateFilter = event.target.value;
    await renderAsync();
  }
  if (event.target.name === 'adminStudentFilter') {
    state.adminStudentFilter = event.target.value;
    await renderAsync();
  }
  if (event.target.name === 'classDate') {
    state.selectedDate = event.target.value;
    await renderAsync();
  }
}

function onInput(event) {
  if (!event.target.matches('input[data-score]')) return;
  const value = Number(event.target.value);
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    event.target.setCustomValidity('Use integer scores 0-10 only.');
  } else {
    event.target.setCustomValidity('');
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.target;

  if (form.dataset.form === 'login') {
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    const name = form.name.value.trim();
    const isSignUp = form.querySelector('[data-action="signup"]')?.classList.contains('active');

    if (!email || !password) return;

    if (isSignUp) {
      if (!name) { alert('Name is required for sign-up.'); return; }
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { name } }
      });
      if (error) { alert(error.message); return; }
      // Profile is auto-created by the database trigger on auth.users insert
      // If user has a session (auto-confirm enabled), load profile and render
      if (data.session) {
        await loadUserProfile(data.user.id);
        await loadTerms();
        render();
      } else {
        // Email confirmation required
        alert('Account created! Check your email for a confirmation link, then sign in.');
      }
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { alert(error.message); return; }
      // auth state change listener handles the rest
    }
    return;
  }

  if (form.dataset.form === 'new-term') {
    const payload = {
      institution: 'Mission College',
      course: 'Archery',
      name: form.termName.value.trim(),
      start_date: form.startDate.value,
      end_date: form.endDate.value,
      enrollment_status: form.enrollmentStatus.value,
      admin_email: form.adminEmail.value.trim().toLowerCase()
    };
    if (!payload.name || !payload.start_date || !payload.end_date || !payload.admin_email) return;
    const { error } = await sb.from('terms').insert(payload);
    if (error) { alert(error.message); return; }
    await loadTerms();
    state.activeTermId = state.terms[0]?.id || null;
    form.reset();
    await renderAsync();
    return;
  }
}

// ── Actions ──────────────────────────────────────────

async function requestEnrollment(termId) {
  if (!state.user) return;
  const { error } = await sb.from('enrollments').insert({
    user_id: state.user.id,
    term_id: termId,
    status: 'Pending'
  });
  if (error) { alert(error.message); return; }

  // Log notification
  const term = state.terms.find(t => t.id === termId);
  if (term) {
    await sb.from('notifications').insert({
      term_id: termId,
      to_email: term.adminEmail,
      subject: `Enrollment pending: ${term.name}`,
      body: `${state.user.email} requested enrollment`
    });
  }
  await renderAsync();
}

async function setEnrollmentStatus(enrollmentId, status) {
  const updates = { status };

  if (status === 'Approved') {
    // Get enrollment to find term_id
    const { data: enr } = await sb.from('enrollments').select('term_id, label').eq('id', enrollmentId).single();
    if (enr && !enr.label) {
      const { count } = await sb
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('term_id', enr.term_id)
        .not('label', 'is', null);
      updates.label = `Archer ${String((count || 0) + 1).padStart(2, '0')}`;
    }
  }

  const { error } = await sb.from('enrollments').update(updates).eq('id', enrollmentId);
  if (error) { alert(error.message); return; }
  await renderAsync();
}

async function createTodaySession() {
  if (!state.user || !state.activeTermId) return;
  if (!inCreateWindow()) { alert('Creation allowed only between 9:00am and 2:00pm'); return; }

  const { error } = await sb.from('sessions').insert({
    term_id: state.activeTermId,
    user_id: state.user.id,
    session_date: todayIso()
  });
  if (error) { alert(error.message); return; }
  await renderAsync();
}

async function addEnd() {
  if (!state.user || !state.activeTermId) return;
  if (!inCreateWindow()) { alert('Cannot add ends outside 9:00am-2:00pm'); return; }

  const session = await loadMySession(state.activeTermId, todayIso());
  if (!session || session.finishedAt) return;

  const endIndex = session.ends.length;
  const defaultShots = [0, 0, 0, 0, 0];

  const { data: newEnd, error: endError } = await sb
    .from('ends')
    .insert({
      session_id: session.id,
      end_index: endIndex,
      shots_count: 5,
      submitted_at: new Date().toISOString()
    })
    .select()
    .single();

  if (endError) { alert(endError.message); return; }

  // Insert default shots
  const shotInserts = defaultShots.map((score, i) => ({
    end_id: newEnd.id,
    shot_index: i,
    score
  }));
  const { error: shotError } = await sb.from('shots').insert(shotInserts);
  if (shotError) { alert(shotError.message); return; }
  await renderAsync();
}

async function saveEnd(endId) {
  const wrap = app.querySelector(`[data-end-wrap="${endId}"]`);
  if (!wrap) return;

  const countSelect = wrap.querySelector("select[data-role='shots-count']");
  const newCount = Number(countSelect?.value || 5);
  if (newCount < 1 || newCount > 6) return;

  const inputs = [...wrap.querySelectorAll('input[data-score]')].slice(0, newCount);
  const values = [];
  for (const input of inputs) {
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 0 || value > 10) {
      input.reportValidity();
      return;
    }
    values.push(value);
  }
  while (values.length < newCount) values.push(0);

  // Update end
  await sb.from('ends')
    .update({ shots_count: newCount, submitted_at: new Date().toISOString() })
    .eq('id', endId);

  // Delete old shots and insert new
  await sb.from('shots').delete().eq('end_id', endId);
  const shotInserts = values.map((score, i) => ({
    end_id: endId,
    shot_index: i,
    score
  }));
  await sb.from('shots').insert(shotInserts);
  await renderAsync();
}

async function deleteEnd(endId) {
  // Shots cascade-delete
  await sb.from('ends').delete().eq('id', endId);

  // Re-index remaining ends
  const session = await loadMySession(state.activeTermId, todayIso());
  if (session) {
    for (let i = 0; i < session.ends.length; i++) {
      if (session.ends[i].endIndex !== i) {
        await sb.from('ends').update({ end_index: i }).eq('id', session.ends[i].id);
      }
    }
  }
  await renderAsync();
}

async function finishSession() {
  const session = await loadMySession(state.activeTermId, todayIso());
  if (!session || session.finishedAt) return;
  await sb.from('sessions').update({ finished_at: new Date().toISOString(), auto_finished: false }).eq('id', session.id);
  await renderAsync();
}

async function adminSaveSession(sessionId) {
  if (!state.user?.isAdmin) return;
  const inputs = [...app.querySelectorAll(`input[data-admin-score][data-session-id="${sessionId}"]`)];
  const endUpdates = {};

  for (const input of inputs) {
    const score = Number(input.value);
    if (!Number.isInteger(score) || score < 0 || score > 10) { alert('Scores must be 0-10'); return; }
    const endId = input.dataset.endId;
    const shotIndex = Number(input.dataset.shotIndex);
    if (!endUpdates[endId]) endUpdates[endId] = {};
    endUpdates[endId][shotIndex] = score;
  }

  // Update each shot
  for (const [endId, shotMap] of Object.entries(endUpdates)) {
    for (const [shotIndex, score] of Object.entries(shotMap)) {
      await sb.from('shots')
        .update({ score })
        .eq('end_id', endId)
        .eq('shot_index', Number(shotIndex));
    }
  }

  // Mark session as edited by instructor
  await sb.from('sessions').update({ edited_by_instructor: true }).eq('id', sessionId);
  await renderAsync();
}

async function deleteAccount() {
  if (!state.user) return;
  const confirmed = confirm('Delete your account and all associated logs permanently?');
  if (!confirmed) return;

  // Delete user profile (cascades to enrollments, sessions, ends, shots)
  await sb.from('users').delete().eq('id', state.user.id);
  await sb.auth.signOut();
}

// ── Auto-finish logic ─────────────────────────────────

async function autoFinishOpenSessions() {
  if (!state.user || !state.activeTermId) return;
  // Only auto-finish sessions for the current user
  const { data: openSessions } = await sb
    .from('sessions')
    .select('id, created_at')
    .eq('user_id', state.user.id)
    .eq('session_date', todayIso())
    .is('finished_at', null);

  if (!openSessions) return;
  const now = new Date();
  for (const s of openSessions) {
    const threeHours = new Date(new Date(s.created_at).getTime() + 3 * 60 * 60 * 1000);
    const twoPm = todayAt(14, 0);
    const cutoff = threeHours < twoPm ? threeHours : twoPm;
    if (now >= cutoff) {
      await sb.from('sessions')
        .update({ finished_at: cutoff.toISOString(), auto_finished: true })
        .eq('id', s.id);
    }
  }
}

// ── Rendering ─────────────────────────────────────────

async function renderAsync() {
  await autoFinishOpenSessions();
  render();
  // Some tabs need async data loading
  if (state.user) {
    if (state.activeTab === 'today') await renderTodayAsync();
    else if (state.activeTab === 'calendar') await renderCalendarAsync();
    else if (state.activeTab === 'class') await renderClassAsync();
    else if (state.activeTab === 'admin' && state.user.isAdmin) await renderAdminAsync();
    else if (state.activeTab === 'account') { /* static, already rendered */ }
  }
}

function render() {
  if (!state.user) {
    app.innerHTML = renderAuth();
    return;
  }


  const termOptions = visibleTermsForUser();
  if (!termOptions.some(t => t.id === state.activeTermId)) {
    state.activeTermId = termOptions[0]?.id || null;
  }

  app.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <strong>${escapeHtml(state.user.name)}</strong>
        <span class="pill ${state.user.isAdmin ? 'good' : ''}">${state.user.isAdmin ? 'Instructor/Admin' : 'Student'}</span>
        <label>Term
          <select name="termId">${termOptions.map(t => `<option value="${t.id}" ${t.id === state.activeTermId ? 'selected' : ''}>${escapeHtml(t.name)} (${t.enrollmentStatus})</option>`).join('')}</select>
        </label>
        <button data-action="logout" class="outline">Sign out</button>
      </div>
    </section>
    ${!state.activeTermId ? `<section class="panel notice"><p>No term available yet.</p></section>` : ''}
    ${state.activeTermId ? renderRoleArea() : ''}
  `;
}

function renderRoleArea() {
  const studentTabs = ['today', 'calendar', 'class', 'account'];
  const adminTabs = ['admin', 'today', 'calendar', 'class', 'account'];
  const tabs = state.user.isAdmin ? adminTabs : studentTabs;
  if (!tabs.includes(state.activeTab)) state.activeTab = tabs[0];

  // Show enrollment status placeholder; will be filled async
  return `
    <div id="enrollment-gate">
      <p class="muted" style="text-align:center;padding:1rem;">Loading...</p>
    </div>
    <section class="panel" id="tabs-container" style="display:none">
      <div class="tabs">${tabs.map(tab =>
    `<button data-action="switch-tab" data-tab="${tab}" class="${state.activeTab === tab ? 'active' : ''}">${tabLabel(tab)}</button>`
  ).join('')}</div>
    </section>
    <div id="tab-content"></div>
  `;
}

// Fill enrollment gate after render
async function checkEnrollmentGate() {
  if (!state.user || !state.activeTermId) return;
  const gate = document.getElementById('enrollment-gate');
  const tabsContainer = document.getElementById('tabs-container');
  if (!gate) return;

  if (state.user.isAdmin) {
    gate.style.display = 'none';
    if (tabsContainer) tabsContainer.style.display = '';
    return true;
  }

  await loadEnrollments(state.activeTermId);
  const enrollment = state.enrollments.find(e => e.userId === state.user.id && e.termId === state.activeTermId);
  const term = state.terms.find(t => t.id === state.activeTermId);

  if (!enrollment) {
    gate.innerHTML = `<section class="panel"><h2>Enrollment</h2><p class="muted">Request access for ${escapeHtml(term?.name || '')} to start logging.</p><button class="primary" data-action="request-enrollment" data-term-id="${state.activeTermId}" ${term?.enrollmentStatus === 'Closed' ? 'disabled' : ''}>Request Enrollment</button><p class="small">Closed terms cannot accept new enrollments.</p></section>`;
    return false;
  }

  if (enrollment.status === 'Pending') {
    gate.innerHTML = `<section class="panel"><h2>Pending Approval</h2><p>Your request for <strong>${escapeHtml(term?.name || '')}</strong> is pending. You can browse history after approval.</p><p class="small">An email notification was queued to ${escapeHtml(term?.adminEmail || '')}.</p></section>${renderAccountPanel()}`;
    return false;
  }

  if (enrollment.status === 'Rejected') {
    gate.innerHTML = `<section class="panel"><h2>Request Rejected</h2><p>Your enrollment for ${escapeHtml(term?.name || '')} was rejected by the instructor.</p></section>${renderAccountPanel()}`;
    return false;
  }

  // Approved
  gate.style.display = 'none';
  if (tabsContainer) tabsContainer.style.display = '';
  return true;
}

async function renderTodayAsync() {
  const allowed = await checkEnrollmentGate();
  if (!allowed) return;

  const session = await loadMySession(state.activeTermId, todayIso());
  const canCreate = inCreateWindow();
  const canAddEnd = session && !session.finishedAt && canCreate;
  const status = sessionStatus(session);
  const stats = sessionStats(session);

  document.getElementById('tab-content').innerHTML = `
    <section class="layout cols-2">
      <article class="panel stack">
        <h2>Today Session Editor</h2>
        <p class="small">Creation window: 9:00am-2:00pm local time. Score values are integers 0-10 (0 = miss).</p>
        ${session ? `<span class="pill ${session.editedByInstructor ? 'alert' : ''}">${status}</span>` : `<span class="pill ${canCreate ? 'good' : 'alert'}">${canCreate ? 'Creation open' : 'Creation closed'}</span>`}
        ${!session ? `<button class="primary" data-action="create-session" ${!canCreate ? 'disabled' : ''}>Start today session</button>` : ''}
        ${session ? `<div class="list">${session.ends.map((end, i) => renderEndEditor(session, end, i + 1)).join('')}</div>` : ''}
        ${session ? `<div class="row"><button class="secondary" data-action="add-end" ${!canAddEnd ? 'disabled' : ''}>+ End</button><button class="primary" data-action="finish-session" ${session.finishedAt ? 'disabled' : ''}>Finish Session</button></div>` : ''}
      </article>
      <aside class="panel stack">
        <h3>Session Summary</h3>
        <div class="stats">
          <div class="stat"><p class="small">Ends</p><p class="value">${stats.ends}</p></div>
          <div class="stat"><p class="small">Arrows</p><p class="value">${stats.arrows}</p></div>
          <div class="stat"><p class="small">Points</p><p class="value">${stats.points}</p></div>
          <div class="stat"><p class="small">Avg/arrow</p><p class="value">${stats.avgArrow}</p></div>
          <div class="stat"><p class="small">Avg/end</p><p class="value">${stats.avgEnd}</p></div>
        </div>
        ${session ? `<p class="small">${editWindowMessage(session)}</p>` : ''}
      </aside>
    </section>
  `;
}

async function renderCalendarAsync() {
  const allowed = await checkEnrollmentGate();
  if (!allowed) return;

  const month = state.monthCursor.slice(0, 7);
  const sessions = await loadMySessions(state.activeTermId, month);
  const monthDays = buildMonthGrid(state.monthCursor);
  const pickedSession = sessions.find(s => s.sessionDate === state.selectedDate) || null;

  document.getElementById('tab-content').innerHTML = `
    <section class="layout cols-2">
      <article class="panel stack">
        <div class="toolbar"><button data-action="month-prev">Prev</button><h2>${monthLabel(state.monthCursor)}</h2><button data-action="month-next">Next</button></div>
        <div class="calendar">${weekdayHeaders()}${monthDays.map(day => {
    if (!day) return `<div></div>`;
    const hasSession = sessions.some(s => s.sessionDate === day);
    return `<button class="calendar-cell ${state.selectedDate === day ? 'active' : ''}" data-action="pick-date" data-date="${day}"><span>${Number(day.split('-')[2])}</span>${hasSession ? `<span class="dot"></span>` : ''}</button>`;
  }).join('')}</div>
      </article>
      <aside class="panel stack">
        <h3>${state.selectedDate}</h3>
        ${pickedSession ? renderSessionReadOnly(pickedSession) : `<p class="muted">No session on selected date.</p>`}
      </aside>
    </section>
  `;
}

async function renderClassAsync() {
  const allowed = await checkEnrollmentGate();
  if (!allowed) return;

  const date = state.selectedDate;
  const [enrollments, classSessions] = await Promise.all([
    loadClassEnrollments(state.activeTermId),
    loadClassSessions(state.activeTermId, date)
  ]);

  document.getElementById('tab-content').innerHTML = `
    <section class="panel stack">
      <h2>Class Logs</h2>
      <p class="small">Full logs visible to class members. Students are pseudonymous per term.</p>
      <label>Selected date <input type="date" name="classDate" value="${date}"></label>
      <div class="list">${enrollments.map(enrollment => {
    const session = classSessions.find(s => s.userId === enrollment.userId);
    return `<div class="list-item"><div class="toolbar"><strong>${enrollment.label || 'Archer'}</strong>${session?.editedByInstructor ? `<span class="pill alert">Edited by instructor</span>` : ''}</div>${session
      ? session.ends.map((end, i) => `<p>End ${i + 1}: ${end.shots.join(' / ')} | total ${sum(end.shots)}</p>`).join('')
      : `<p class="muted">No session submitted.</p>`
      }</div>`;
  }).join('')}</div>
    </section>
  `;
}

async function renderAdminAsync() {
  const gate = document.getElementById('enrollment-gate');
  if (gate) gate.style.display = 'none';
  const tabsContainer = document.getElementById('tabs-container');
  if (tabsContainer) tabsContainer.style.display = '';

  const [pending, roster, adminSessions, analytics] = await Promise.all([
    loadPendingEnrollments(state.activeTermId),
    loadAdminRoster(state.activeTermId),
    loadAdminSessions(state.activeTermId, state.adminDateFilter, state.adminStudentFilter),
    loadAnalytics(state.activeTermId)
  ]);

  document.getElementById('tab-content').innerHTML = `
    <section class="layout cols-2">
      <article class="panel stack">
        <h2>Admin Dashboard</h2>
        <div class="list-item">
          <h3>Enrollment Queue</h3>
          <div class="list">${pending.map(enr =>
    `<div class="list-item"><p><strong>${escapeHtml(enr.user?.name || 'Unknown')}</strong> (${escapeHtml(enr.user?.email || '-')})</p><div class="row"><button class="secondary" data-action="approve" data-enrollment-id="${enr.id}">Approve</button><button class="warn" data-action="reject" data-enrollment-id="${enr.id}">Reject</button></div></div>`
  ).join('') || `<p class="muted">No pending requests.</p>`}</div>
        </div>
        <div class="list-item">
          <h3>Create Term</h3>
          <form data-form="new-term" class="stack">
            <label>Name <input name="termName" required></label>
            <label>Start date <input type="date" name="startDate" required></label>
            <label>End date <input type="date" name="endDate" required></label>
            <label>Enrollment status <select name="enrollmentStatus"><option>Open</option><option>Closed</option></select></label>
            <label>Admin email <input name="adminEmail" type="email" required></label>
            <button class="primary" type="submit">Create term</button>
          </form>
        </div>
      </article>
      <aside class="panel stack">
        <h3>Roster</h3>
        ${roster.map(enr => `<p>${escapeHtml(enr.label)} - ${escapeHtml(enr.user?.name || 'Unknown')} (${escapeHtml(enr.user?.email || '-')})</p>`).join('') || `<p class="muted">No approved students.</p>`}
        <div class="list-item">
          <h3>Analytics</h3>
          <p>Term avg/arrow: <strong>${analytics.termAvgArrow}</strong></p>
          <p>Term avg/end: <strong>${analytics.termAvgEnd}</strong></p>
          <div class="list">${analytics.daily.map(d =>
    `<p>${d.date}: avg/arrow ${d.avgArrow}, avg/end ${d.avgEnd}, participants ${d.participants}</p>`
  ).join('') || `<p class="muted">No daily stats yet.</p>`}</div>
        </div>
      </aside>
    </section>
    <section class="panel stack">
      <h3>Logs Browser</h3>
      <div class="toolbar">
        <label>Date <input type="date" name="adminDateFilter" value="${state.adminDateFilter}"></label>
        <label>Student
          <select name="adminStudentFilter"><option value="all">All students</option>${roster.map(enr =>
    `<option value="${enr.userId}" ${state.adminStudentFilter === enr.userId ? 'selected' : ''}>${escapeHtml(enr.user?.name || enr.userId)}</option>`
  ).join('')}</select>
        </label>
      </div>
      <div class="list">${adminSessions.map(s => renderAdminSessionEditor(s)).join('') || `<p class="muted">No matching sessions.</p>`}</div>
    </section>
  `;
}

async function loadAnalytics(termId) {
  if (!termId) return { termAvgArrow: '0.00', termAvgEnd: '0.00', daily: [] };
  const { data: sessions } = await sb
    .from('sessions')
    .select('*, ends(*, shots(*))')
    .eq('term_id', termId);

  if (!sessions || !sessions.length) return { termAvgArrow: '0.00', termAvgEnd: '0.00', daily: [] };

  const shaped = sessions.map(shapeSessionFull);
  const byDate = {};
  let totalPoints = 0, totalArrows = 0, totalEnds = 0;

  for (const s of shaped) {
    const stats = sessionStats(s);
    totalPoints += stats.points;
    totalArrows += stats.arrows;
    totalEnds += stats.ends;

    if (!byDate[s.sessionDate]) byDate[s.sessionDate] = { points: 0, arrows: 0, ends: 0, participants: 0 };
    byDate[s.sessionDate].points += stats.points;
    byDate[s.sessionDate].arrows += stats.arrows;
    byDate[s.sessionDate].ends += stats.ends;
    byDate[s.sessionDate].participants += 1;
  }

  const daily = Object.entries(byDate).map(([date, data]) => ({
    date,
    avgArrow: data.arrows ? (data.points / data.arrows).toFixed(2) : '0.00',
    avgEnd: data.ends ? (data.points / data.ends).toFixed(2) : '0.00',
    participants: data.participants
  }));

  return {
    termAvgArrow: totalArrows ? (totalPoints / totalArrows).toFixed(2) : '0.00',
    termAvgEnd: totalEnds ? (totalPoints / totalEnds).toFixed(2) : '0.00',
    daily
  };
}

// ── Render helpers ────────────────────────────────────

function renderEndEditor(session, end, index) {
  const editable = studentCanEditEnd(session, end);
  const countOpts = Array.from({ length: 6 }, (_, i) => i + 1)
    .map(n => `<option value="${n}" ${n === end.shotsCount ? 'selected' : ''}>${n}</option>`)
    .join('');

  return `
    <div class="list-item" data-end-wrap="${end.id}">
      <div class="toolbar">
        <strong>End ${index}</strong>
        <label>Shots
          <select data-end-id="${end.id}" data-role="shots-count" ${!editable ? 'disabled' : ''}>${countOpts}</select>
        </label>
        <span class="pill">Total ${sum(end.shots)}</span>
      </div>
      <div class="grid">${end.shots.map((value, shotIdx) =>
    `<label>Shot ${shotIdx + 1}<input data-score type="number" min="0" max="10" step="1" value="${value ?? ''}" data-end-id="${end.id}" data-shot-index="${shotIdx}" ${!editable ? 'disabled' : ''}></label>`
  ).join('')}</div>
      <div class="toolbar"><button data-action="save-end" data-end-id="${end.id}" ${!editable ? 'disabled' : ''}>Save End</button><button class="warn" data-action="delete-end" data-end-id="${end.id}" ${!editable ? 'disabled' : ''}>Delete End</button></div>
      <p class="small">${editable ? `Edits allowed until ${formatTime(editCutoff(end.submittedAt || session.createdAt))}.` : 'Edit window closed or session finished.'}</p>
    </div>
  `;
}

function renderSessionReadOnly(session) {
  const stats = sessionStats(session);
  return `
    <div class="list-item">
      ${session.editedByInstructor ? `<span class="pill alert">Edited by instructor</span>` : ''}
      <p class="small">${session.finishedAt ? `Finished ${formatDateTime(session.finishedAt)}` : 'Open session'}</p>
      ${session.ends.map((end, i) => `<p>End ${i + 1}: [${end.shots.join(', ')}] = <strong>${sum(end.shots)}</strong></p>`).join('')}
      <p><strong>Total ${stats.points}</strong> / ${stats.arrows} arrows (avg/arrow ${stats.avgArrow})</p>
    </div>
  `;
}

function renderAdminSessionEditor(session) {
  return `
    <div class="list-item" data-admin-session="${session.id}">
      <div class="toolbar"><strong>${escapeHtml(session.userName || 'Unknown')}</strong><span class="small">${session.sessionDate}</span>${session.editedByInstructor ? `<span class="pill alert">Edited</span>` : ''}</div>
      ${session.ends.map(end =>
    `<div class="grid">${end.shots.map((score, i) =>
      `<label>E${end.endIndex + 1}S${i + 1}<input type="number" min="0" max="10" step="1" value="${score}" data-admin-score data-session-id="${session.id}" data-end-id="${end.id}" data-shot-index="${i}"></label>`
    ).join('')}</div>`
  ).join('')}
      <button data-action="save-admin-session" data-session-id="${session.id}" class="secondary">Save admin edits</button>
    </div>
  `;
}

function renderAccountPanel() {
  return `
    <section class="panel stack">
      <h2>Account</h2>
      <p class="small">Deletion hard-removes your identity and all dependent logs. Term aggregate analytics remain non-identifiable.</p>
      <button class="warn" data-action="delete-account">Delete my account</button>
    </section>
  `;
}

function renderAuth() {
  return `
    <section class="layout cols-2">
      <article class="panel stack">
        <h2>Sign in</h2>
        <p class="small">Sign in or create an account to get started.</p>
        <div class="tabs" id="auth-tabs">
          <button class="active" onclick="switchAuthTab('login')">Sign In</button>
          <button onclick="switchAuthTab('signup')">Sign Up</button>
        </div>
        <form data-form="login" class="stack">
          <div id="name-field" style="display:none">
            <label>Full name <input name="name"></label>
          </div>
          <label>Email <input type="email" name="email" required></label>
          <label>Password <input type="password" name="password" required minlength="6"></label>
          <button type="submit" class="primary" id="auth-submit-btn">Sign In</button>
        </form>
      </article>
      <aside class="panel stack">
        <h3>About</h3>
        <p class="small">Mission College Archery Score Log — track practice performance, view class logs, and manage term enrollments.</p>
        <p class="small">Sign up with your email to get started. Your instructor will approve your enrollment.</p>
      </aside>
    </section>
  `;
}



// ── Global functions for inline handlers ──────────────

window.switchAuthTab = function (tab) {
  const nameField = document.getElementById('name-field');
  const submitBtn = document.getElementById('auth-submit-btn');
  const tabs = document.querySelectorAll('#auth-tabs button');

  if (tab === 'signup') {
    nameField.style.display = '';
    submitBtn.textContent = 'Sign Up';
    submitBtn.dataset.action = 'signup';
    submitBtn.classList.add('active');
    tabs[0].classList.remove('active');
    tabs[1].classList.add('active');
  } else {
    nameField.style.display = 'none';
    submitBtn.textContent = 'Sign In';
    delete submitBtn.dataset.action;
    submitBtn.classList.remove('active');
    tabs[0].classList.add('active');
    tabs[1].classList.remove('active');
  }
};

window.completeProfile = async function (event) {
  event.preventDefault();
  const form = event.target;
  const name = form.name.value.trim();
  const isAdmin = form.isAdmin.checked;
  if (!name) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  const { error } = await sb.from('users').upsert({
    id: session.user.id,
    email: session.user.email,
    name,
    is_admin: isAdmin
  });

  if (error) { alert(error.message); return; }
  state.user = { id: session.user.id, email: session.user.email, name, isAdmin };
  await loadTerms();
  await renderAsync();
};

// ── Shape helpers ─────────────────────────────────────

function shapeTerm(row) {
  return {
    id: row.id,
    institution: row.institution,
    course: row.course,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    enrollmentStatus: row.enrollment_status,
    adminEmail: row.admin_email
  };
}

function shapeEnrollment(row) {
  return {
    id: row.id,
    userId: row.user_id,
    termId: row.term_id,
    status: row.status,
    label: row.label,
    requestedAt: row.requested_at
  };
}

function shapeSessionFull(row) {
  const ends = (row.ends || [])
    .sort((a, b) => a.end_index - b.end_index)
    .map(end => ({
      id: end.id,
      endIndex: end.end_index,
      shotsCount: end.shots_count,
      submittedAt: end.submitted_at,
      shots: (end.shots || [])
        .sort((a, b) => a.shot_index - b.shot_index)
        .map(s => s.score)
    }));

  return {
    id: row.id,
    termId: row.term_id,
    userId: row.user_id,
    sessionDate: row.session_date,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    autoFinished: row.auto_finished,
    editedByInstructor: row.edited_by_instructor,
    ends
  };
}

// ── Business logic ────────────────────────────────────

function visibleTermsForUser() {
  if (state.user?.isAdmin) return state.terms;
  return state.terms.filter(t =>
    t.enrollmentStatus === 'Open' ||
    state.enrollments.some(e => e.userId === state.user?.id && e.termId === t.id)
  );
}

function studentCanEditEnd(session, end) {
  if (session.finishedAt) return false;
  if (session.sessionDate !== todayIso()) return false;
  return new Date() <= editCutoff(end.submittedAt || session.createdAt);
}

function editCutoff(dateIso) {
  const ten = new Date(new Date(dateIso).getTime() + 10 * 60 * 1000);
  return ten < todayAt(14, 0) ? ten : todayAt(14, 0);
}

function inCreateWindow() {
  const now = new Date();
  return now >= todayAt(9, 0) && now <= todayAt(14, 0);
}

function sessionStatus(session) {
  if (!session) return 'No session';
  if (session.finishedAt) return session.autoFinished ? 'Session auto-finished' : 'Session finished';
  return 'Session in progress';
}

function editWindowMessage(session) {
  if (!session.ends.length) return 'No ends yet. Add your first end.';
  const latest = session.ends[session.ends.length - 1];
  const cutoff = editCutoff(latest.submittedAt || session.createdAt);
  return `Edits allowed until ${formatTime(cutoff)} local time.`;
}

function sessionStats(session) {
  if (!session) return { ends: 0, arrows: 0, points: 0, avgArrow: '0.00', avgEnd: '0.00' };
  const ends = session.ends.length;
  const arrows = session.ends.reduce((n, end) => n + end.shots.length, 0);
  const points = session.ends.reduce((n, end) => n + sum(end.shots), 0);
  const avgArrow = arrows ? (points / arrows).toFixed(2) : '0.00';
  const avgEnd = ends ? (points / ends).toFixed(2) : '0.00';
  return { ends, arrows, points, avgArrow, avgEnd };
}

// ── Utility helpers ───────────────────────────────────

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function todayAt(hour, minute) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function monthStart(dateIso) {
  const [y, m] = dateIso.split('-');
  return `${y}-${m}-01`;
}

function shiftMonth(dateIso, delta) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function buildMonthGrid(dateIso) {
  const date = new Date(`${dateIso}T00:00:00`);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const list = [];
  for (let i = 0; i < start.getDay(); i += 1) list.push(null);
  for (let day = 1; day <= end.getDate(); day += 1) {
    list.push(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return list;
}

function monthLabel(dateIso) {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function weekdayHeaders() {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map(d => `<div class="small" style="padding:0.2rem">${d}</div>`)
    .join('');
}

function formatDateTime(iso) { return new Date(iso).toLocaleString(); }
function formatTime(date) { return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function sum(items) { return items.reduce((a, b) => a + Number(b || 0), 0); }
function tabLabel(tab) {
  const map = { today: 'Today', calendar: 'Calendar', class: 'Class Logs', admin: 'Admin', account: 'Account' };
  return map[tab] || tab;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
