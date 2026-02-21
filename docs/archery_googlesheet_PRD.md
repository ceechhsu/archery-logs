# Product Requirements Document (PRD)
## Archery Log Web App - Google Sheet Personal Storage Edition

**Owner:** Ceech  
**Primary users:** Any archer who wants to track practice  
**Platforms:** Web (responsive) - iPhone Safari, Android Chrome, Desktop browsers  
**Authentication:** Google OAuth (required)  
**Storage model:** User-owned Google Sheet (no Supabase data storage)

---

## 1. Product Overview

### 1.1 Purpose
Build an archery log app where each user:
- Signs in with Google OAuth.
- Creates and manages their own account automatically (no admin approval).
- Logs sessions, ends, and shots at any time.
- Stores all personal data in their own Google Sheet.

### 1.2 Problem Statement
The previous architecture stored user logs in Supabase and relied on admin-controlled enrollment/approval. This creates operational overhead and centralizes user data ownership.

### 1.3 Vision for This Version
- Remove Supabase as the app data store for practice logs.
- Remove admin approval and enrollment gating.
- Give each user full ownership and portability of their data through Google Sheets.

### 1.4 Goals
**G1 - Self-serve onboarding:** Any user can sign up and start immediately without admin action.  
**G2 - User-owned storage:** User log data is stored in the user's own Google Sheet.  
**G3 - No centralized log DB:** The app does not keep session/end/shot data in Supabase.

### 1.5 Non-goals (V1)
- No instructor approval queue.
- No class roster management.
- No admin editing of user logs.
- No cross-user data sharing.

---

## 2. Scope

### 2.1 In Scope (V1)
- Google OAuth sign-in/sign-out.
- First-time setup flow for Google Sheet access.
- Required consent for read/write access to user sheet.
- Automatic sheet discovery or creation per user.
- Session logging (sessions, ends, shots).
- Edit/delete of user's own records.
- History and summary analytics from user sheet data.
- Sync status and retry flows.

### 2.2 Out of Scope (V1)
- Supabase-based storage for practice logs.
- Admin approval workflows.
- Multi-user shared classes/teams.
- Paid organization accounts.

---

## 3. Users and Access Model

### 3.1 Roles
- **User** (single role in V1).

### 3.2 Account Model
- Any Google user can create an account by signing in.
- No manual approval by app owner/admin.
- Each account is isolated to the signed-in user's own spreadsheet.

### 3.3 Permissions
Users can:
- Create/read/update/delete their own session data.
- Connect or create a personal Google Sheet for storage.
- Re-sync app state from their own sheet.

---

## 4. Authentication and Authorization

### 4.1 Authentication
- Google OAuth is required for login.

### 4.2 Required Consent During Setup
During initial setup, user must grant:
- Identity scope(s) to authenticate the user.
- Google Sheets read/write scope so app can store and update data in the user's sheet.

If file discovery/creation through Drive API is needed, request least-privilege Drive scope.

### 4.3 Consent Failure Handling
- If user denies required scopes, show explanation and block completion of setup.
- Provide retry path to re-consent.

---

## 5. Data Architecture (Google Sheet First)

### 5.1 Source of Truth
- The user's Google Sheet is the canonical source of practice data.

### 5.2 App Storage Policy
- Supabase is not used to store sessions/ends/shots.
- Optional local cache may be used for performance/offline buffering.
- Local cache must always be reconstructible from the sheet.

### 5.3 Provisioning Flow
On first successful login:
1. Check for existing app-linked spreadsheet for this user.
2. If not found, create a new spreadsheet in the user's Drive.
3. Initialize required tabs and headers.
4. Save spreadsheet metadata in app session/local state as needed.

### 5.4 Required Sheet Tabs
- `sessions`
- `ends`
- `shots`
- `meta`

### 5.5 Baseline Columns
`sessions`:
- `session_id` (UUID)
- `session_date` (YYYY-MM-DD)
- `created_at`
- `updated_at`
- `notes` (optional)

`ends`:
- `end_id` (UUID)
- `session_id`
- `end_index`
- `shots_count`
- `end_total`

`shots`:
- `shot_id` (UUID)
- `end_id`
- `shot_index`
- `score`

`meta`:
- `key`
- `value`

---

## 6. Core Functional Requirements

### 6.1 Logging Rules
- Logging available 24/7.
- Score must be integer 0-10.
- Shots per end: configurable 1-12 (default 5).

### 6.2 Calculations
Per session:
- Total points.
- Total arrows.
- Average per arrow.
- Average per end.

Lifetime:
- Session count.
- Arrow count.
- Lifetime averages.

### 6.3 Editing and Ownership
- Users can edit/delete only their own data.
- No cross-user data access in UI or backend logic.

---

## 7. Sync, Offline, and Reliability

### 7.1 Sync Behavior
- Auto-sync on save.
- Manual re-sync action available.

### 7.2 Offline/Failure Handling
- Queue writes locally when offline.
- Show states: `Not synced`, `Syncing`, `Synced`, `Sync failed`.
- Retry with exponential backoff and manual retry option.

### 7.3 Idempotency
- Use stable IDs for sessions/ends/shots to prevent duplicates on retries.

### 7.4 Recovery
- Full app state can be rebuilt by reading the user's sheet.

---

## 8. Privacy and Security Requirements

### 8.1 Privacy Defaults
- No centralized practice-log database.
- No shared access between users by default.

### 8.2 Security
- Request minimum OAuth scopes required.
- Do not expose privileged secrets in frontend code.
- Use secure token handling and re-auth flow for expiration.

---

## 9. Acceptance Criteria

### 9.1 Onboarding and Account Creation
- New user can sign in via Google OAuth without admin approval.
- Setup requires and validates Google Sheets read/write consent.
- App connects to existing sheet or creates a new one automatically.

### 9.2 Data Operations
- User can create/edit/delete sessions, ends, and shots.
- Data saves to user's own Google Sheet.
- Reload reconstructs correctly from sheet data.

### 9.3 Reliability
- Failed syncs show actionable error states.
- Retry recovers from transient failures without duplicate records.

### 9.4 Privacy
- User cannot access other users' records.

---

## 10. Migration Notes (From Supabase Version)

- Remove Supabase as the source of truth for archery logs.
- Remove admin approval requirement for new users.
- Replace centralized enrollment model with self-serve Google OAuth onboarding.
- Introduce per-user Google Sheet provisioning and sync.

---

## 11. Future Considerations

- Optional shared coach/student mode.
- Optional admin dashboard for analytics only (without taking data ownership).
- Additional storage adapters beyond Google Sheets.
