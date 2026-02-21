# Shoot With Ceech Setup

## Environment

Copy `.env.example` to `.env.local` and provide values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `APP_SESSION_SECRET` (32+ chars)
- `SENTRY_DSN` (optional)
- `GOOGLE_MAPS_API_KEY` (required for GPS address auto-fill)

Local callback value:

- `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback`

## Google OAuth Scopes

The app requests least-privilege scopes for:

- OpenID profile/email identity
- Google Sheets read/write
- Google Drive file-level access for app-created/found sheet

## Local Development

```bash
npm install
npm run dev
```

## Deploy to GitHub + Vercel

### 1) Push project to GitHub

From your repo root, commit and push this app to a GitHub repository.

### 2) Import project in Vercel

In Vercel:

- New Project -> Import your GitHub repo
- Root Directory: `Archery/apps/archery-v2-personal-sheets`
- Framework: Next.js (auto-detected)
- Build Command: `npm run build`
- Output: default (`.next`)

### 3) Add Vercel environment variables

Set these in Vercel Project Settings -> Environment Variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` (production URL callback)
- `APP_SESSION_SECRET` (32+ random chars)
- `SENTRY_DSN` (optional)

Recommended production callback format:

- `https://<your-vercel-domain>/api/auth/google/callback`

### 4) Update Google OAuth client

In Google Cloud Console (OAuth client):

- Authorized JavaScript origins:
  - `http://localhost:3000`
  - `https://<your-vercel-domain>`
- Authorized redirect URIs:
  - `http://localhost:3000/api/auth/google/callback`
  - `https://<your-vercel-domain>/api/auth/google/callback`

### 5) Deploy and verify

After deployment:

- Open your Vercel URL
- Sign in with Google
- Confirm the app creates/fetches your spreadsheet
- Create a session and run Sync
- Refresh and confirm data reloads from the sheet

## Optional: Vercel preview domains

If you want Google login on preview deployments, each preview domain also needs to be added as an authorized origin + redirect URI in Google OAuth settings.

Most teams keep OAuth fully enabled on production and use localhost + production domain only.

## Notes

- Source of truth is the user's Google Sheet.
- Session/end/shot practice logs are not stored in Supabase.
- Offline writes are queued in IndexedDB and replayed on manual/auto sync.
