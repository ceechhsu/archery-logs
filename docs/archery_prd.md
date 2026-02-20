```markdown
# Product Requirements Document (PRD)
## Archery Score Log + Tournament Web App (Mission College)

**Owner:** Instructor/Admin (Ceech)  
**Primary users:** Students enrolled in Mission College Archery (and future terms)  
**Platforms:** Web (responsive) — iPhone Safari, Android Chrome, Desktop browsers  
**Time zone:** User local time zone for session rules and “today”

---

## 1. Overview

### 1.1 Purpose
Build a web application that enables:
- Students to authenticate and request enrollment into a specific term (semester folder).
- Instructor/Admin to approve/reject enrollments.
- Approved students to log archery scores during class hours for “today” only.
- Students and Admin to view score history via a calendar.
- Admin to view and lightly manage student logs and basic analytics.
- V2 tournament mode for weekly class competition with live pairing and two winners.

### 1.2 Goals
**G1 — Student self-tracking:** Students can track practice performance over a term with session history and averages.  
**G2 — Instructor oversight:** Instructor approves enrollment, can view logs, and can correct logs when necessary.  
**G3 — Competition engagement:** Tournament play (V2) increases motivation and participation.

### 1.3 Non-goals
- No SIS/Canvas integration.
- No grading outputs (no CSV/PDF exports required in V1).
- No offline-first requirements; assume decent cell service.
- No anti-cheat mechanisms beyond honor system (V2).

---

## 2. Release Phases and Scope

### 2.1 V1 (MVP) — In Scope
- Google OAuth authentication (Yahoo OAuth optional; if difficult, Google-only).
- Term (“semester folder”) management by Admin.
- Student self-enrollment request + Admin approval/rejection.
- Pending enrollment landing page + admin email notification.
- Today-only session editor:
  - Ends (rounds), shots per end, totals, averages.
  - Add multiple ends via “+ End”.
  - Finish Session button + auto-finish rules.
- Calendar history view (read-only past sessions).
- Edit/delete rules (time-bound).
- Student view of class logs (full logs visible to class members) using anonymized identifiers.
- Admin dashboard to view/edit logs and view basic analytics.

### 2.2 V2 — Deferred
- Photo upload per end (optional).
- Tournament mode:
  - Two-track system: winners single-elimination + losers Swiss ladder.
  - Live results to class members.
  - Automatic next-opponent assignment.
  - Two weekly winners.

---

## 3. Users, Roles, Permissions

### 3.1 Roles
- **Student**
- **Instructor/Admin**

### 3.2 Student Permissions
- Sign in (Google OAuth; Yahoo optional).
- Request enrollment into an open term.
- View “Pending Approval” page until approved.
- Once approved:
  - Create session logs for “today” only within allowed time window.
  - View own session history and averages.
  - View other students’ full logs for the same term, anonymized as “Archer ##”.
  - Edit/delete their own entries only within defined edit window.
- Delete their account at any time.

### 3.3 Admin Permissions
- Create and manage terms:
  - Name, start/end dates, enrollment status (Open/Closed), admin email destination.
- Approve/reject enrollment requests.
- View all logs for a term and all students.
- Edit student logs (with “Edited by instructor” marker).
- View basic analytics.

---

## 4. Privacy and Exposure Minimization (Binding)

### 4.1 Access Restriction
- All content is restricted to authenticated users.
- Term data is visible only to:
  - Approved enrolled students for that term, and
  - Admin(s) for that term.
- No public indexing of term data.

### 4.2 Pseudonymous Student Display
- Student-facing views must not display real names/emails.
- Students appear as stable anonymized identifiers **per term**: “Archer 01”, “Archer 02”, etc.
- Admin sees real identity and mapping.

### 4.3 Student Opt-out / Deletion (Binding Default)
- Students can delete their account at any time.
- Default deletion behavior:
  - **Hard-delete** the student’s identity and all associated session/end/shot records.
  - Retain only non-identifiable aggregate analytics at the term level (e.g., daily class average) that cannot be traced to an individual.
- Admin cannot block deletion.

---

## 5. Term (“Semester Folder”) Model

### 5.1 Term Fields
Each term is uniquely identified by:
- Institution (e.g., “Mission College”)
- Course label (e.g., “Archery”)
- Term name (e.g., “Spring 2026”)
- Start date / End date
- Enrollment status: **Open** or **Closed**
- Admin notification email

### 5.2 Term Visibility Rules (Binding Default)
- Students can see:
  - All **Open** terms (to request enrollment)
  - Any terms they are already enrolled in (Pending/Approved), including Closed terms for history viewing.
- Students cannot enroll into Closed terms.

### 5.3 Multi-term Enrollment
- Student account persists across terms (same login).
- A student may be enrolled in multiple terms, with separate approvals per term.

---

## 6. Authentication and Enrollment

### 6.1 Authentication
- Primary: **Google OAuth**
- Optional: Yahoo OAuth
- **Conservative fallback:** If Yahoo OAuth is difficult/slow, ship **Google-only** (students must use Gmail).

### 6.2 Enrollment Workflow
1. Student signs in.
2. Student selects an Open term and requests enrollment.
3. System sets enrollment state to **Pending**.
4. Student is blocked from creating logs until approved.
5. Student is shown a **Pending Approval** landing page.
6. Admin receives an email notification with Approve/Reject actions.
7. Admin approves or rejects:
   - Approved: student can use app for that term.
   - Rejected: student remains blocked for that term.

### 6.3 Enrollment States
- Pending
- Approved
- Rejected

---

## 7. Core Student Experience (V1)

### 7.1 Primary Screen: Today Session Editor
Default view after approval:
- Today’s session editor as primary.
- Calendar as secondary navigation.

### 7.2 Calendar History (Read-only Past)
- Calendar displays dates where sessions exist.
- Students can view past sessions but cannot create or modify past sessions.

---

## 8. Session and Logging Rules (V1 — Binding)

### 8.1 Definitions
- **Session:** all ends recorded by a student for a single day in a term.
- **End (Round):** one set of N shots (default 5).

### 8.2 Time Window (User Local Time)
**Creation allowed only between 9:00am and 2:00pm local time.**
- Outside that window:
  - Creating a session or adding an end is blocked.
  - Viewing history is allowed.

### 8.3 Session Completion
- Student can tap **Finish Session** to close the session.
- Auto-finish occurs at the earlier of:
  - **3 hours after first entry**, OR
  - **2:00pm**
- After finish/auto-finish:
  - No new ends may be added.

### 8.4 Edit/Delete Window (Student)
- Students can edit or delete their own submissions until:
  - **min(10 minutes after submission, 2:00pm)** local time.
- After the edit window expires:
  - No changes permitted by student.

### 8.5 Shots per End (Binding Default)
- Default shots per end: **5**
- Student can set shots per end **per end**.
- Allowed range: **1 to 6** shots per end.

Behavior:
- If student reduces shots count after entering values: extra values are truncated with a warning.
- If student increases shots count: new blank fields appear.

---

## 9. Scoring Rules (V1 — Binding)

### 9.1 Allowed Values
- Integer values **0–10 only**, inclusive.
- No half points.
- Target system: standard **10-ring**.

### 9.2 “0” Semantics (Binding Default)
- A score of **0** means **miss / no score**.
- No separate hit/miss flag exists in V1.
- UI must label 0 as “0 (miss)” to reduce confusion.

### 9.3 Totals and Averages
Per End:
- **End total** = sum of shot scores.

Per Session (Day):
- **Total points** = sum of all end totals.
- **Total arrows** = sum of shots across ends.
- **Average per arrow** = total points / total arrows.
- **Average per end** = mean of end totals.

Per Term:
- Student term averages:
  - average per arrow over all sessions
  - average per end over all sessions

---

## 10. Student UI Requirements (V1)

### 10.1 Today Session Editor Components
- End entry component:
  - Input fields for each shot (N = 1–6; default 5).
  - Auto-calculated end total (or “Total” button; auto-calc preferred).
  - Save end action (explicit or implicit; must persist).
- “+ End” button:
  - Adds a new end to session.
- Session summary panel:
  - Ends count
  - Total arrows
  - Total points
  - Avg per arrow
  - Avg per end
- “Finish Session” button (prominent).
- Status indicators:
  - “Session finished” state.
  - “Edits allowed until …” message while within window.

### 10.2 Class Logs View (Student)
- Displays all approved students’ session logs for selected date/term.
- Students shown as “Archer ##”.
- Shows full logs (end totals + individual shot values).

---

## 11. Admin Experience (V1)

### 11.1 Admin Dashboard
- Term selector
- Enrollment queue:
  - Pending requests list with approve/reject
- Roster list:
  - Approved students with real identity
- Logs browser:
  - Filter by date
  - Filter by student
  - View end-by-end breakdown
- Analytics:
  - Daily class averages (avg per arrow, avg per end)
  - Term-level averages (avg per arrow, avg per end)

### 11.2 Admin Editing Rules (Binding)
- Admin may edit any student session/end/shot.
- Any admin change sets a marker on the session:
  - `edited_by_instructor = true`
- Student view must show a badge on that session:
  - **“Edited by instructor”**
- No reason/comment required in V1.
- No audit log required in V1.

---

## 12. Email Notifications (Enrollment Pending) — Binding Default

### 12.1 Trigger
- When a student requests enrollment into a term, system sends email to the term’s admin email.

### 12.2 Implementation Default
- Use platform-native email capability where available.
- If not available, fallback to SMTP with a single sender address controlled by admin.

### 12.3 Email Content
- Term name
- Student email (admin-visible)
- Direct links to Approve/Reject in admin dashboard

---

## 13. Non-functional Requirements

### 13.1 Performance
- Today editor should load quickly; target < 2 seconds perceived on typical mobile connection.
- UI must be lightweight; avoid unnecessary media in V1.

### 13.2 Compatibility
- Responsive web UI:
  - iPhone Safari
  - Android Chrome
  - Desktop modern browsers

### 13.3 Reliability
- Handle refresh/reload gracefully without losing saved ends.
- Clear error messaging if network fails mid-submit.

### 13.4 Security Baseline
- Auth required for all access.
- Term membership enforced server-side for all reads/writes.
- Rate limiting optional; not required in V1.

---

## 14. Data Model (Conceptual)

Entities:
- **User**
  - OAuth identity (Google), email, global account fields
- **Term**
  - name, start/end, enrollment status, admin email
- **Enrollment**
  - user_id, term_id, status (Pending/Approved/Rejected), anonymized_label (“Archer 01”)
- **Session**
  - term_id, user_id, session_date (local), created_at, finished_at, auto_finished, edited_by_instructor
- **End**
  - session_id, end_index, shots_count (1–6), end_total
- **Shot**
  - end_id, shot_index, score (0–10)

Aggregates (non-identifiable):
- **TermDailyStats**
  - term_id, date, class_avg_per_arrow, class_avg_per_end, counts (participants, arrows)

Deletion behavior:
- Account deletion hard-deletes user and dependent records; aggregates remain.

---

## 15. Acceptance Criteria (V1)

### 15.1 Authentication and Enrollment
- Student can sign in with Google.
- Student can request enrollment into an Open term.
- Student remains blocked until Admin approval.
- Student sees Pending page while pending.
- Admin receives email notification.
- Admin can approve/reject from dashboard.
- Approved students can access logging; rejected cannot.

### 15.2 Logging and Rules
- Students can create/add ends only 9:00am–2:00pm local time.
- Default 5 shots per end; student can change to 1–6 per end.
- Only integer values 0–10 accepted.
- End total and session totals/averages compute correctly.
- Finish Session closes session.
- Auto-finish triggers at min(3 hours after first entry, 2:00pm).
- Student edit/delete permitted only until min(10 minutes after submission, 2:00pm).

### 15.3 Viewing
- Calendar shows historical sessions.
- Past sessions are view-only.
- Students can view other students’ full logs for term using “Archer ##”.

### 15.4 Admin
- Admin can view all sessions and drill into shot-level data.
- Admin can edit session data.
- Edited sessions show “Edited by instructor” badge to students.

### 15.5 Account Deletion
- Student can delete account.
- User identity and all dependent logs are removed.
- Term-level aggregate analytics remain and cannot identify the student.

---

## 16. V2 Specification (Deferred)

### 16.1 Photo Uploads (Per End)
- Optional one photo per end.
- Compress to smallest viewable size.
- Retention:
  - If low/no cost storage feasible: keep indefinitely.
  - Otherwise: delete at end of term.

### 16.2 Tournament Mode (Hybrid)
- Instructor-triggered only.
- Students join by accepting invite; only joined students are active participants.
- Two tracks:
  - Winners bracket: single-elimination
  - Losers bracket: Swiss-style pairing by record (and points tiebreak)
- Odd participants: random bye.
- Match = one end of 5 arrows per archer.
- Each student enters own scores.
- No opponent confirmation (honor system).
- Tie handled via `tiebreak_winner` field.
- Tournament ends manually by instructor.
- Next opponent assigned automatically when both submissions are in.
- Live results visible to term members.
- Two weekly winners:
  - Winners bracket champion
  - Losers Swiss top performer (record, points tiebreak)
```
