# Mission College Archery Score Log

A web application for tracking archery practice sessions, managing enrollments, and viewing class analytics at Mission College.

## Features

- **Student score logging** — Record ends and shots during class (9am–2pm)
- **Calendar history** — View past sessions and performance trends
- **Class logs** — View anonymized logs for all enrolled students
- **Admin dashboard** — Manage terms, approve enrollments, edit sessions, view analytics
- **Real-time data** — Powered by Supabase (PostgreSQL + Auth)

## Tech Stack

- **Frontend**: Vanilla HTML/JS/CSS (no framework)
- **Backend**: [Supabase](https://supabase.com) (PostgreSQL, Auth, Row Level Security)
- **Deployment**: Vercel (static site)

## Getting Started

1. Open `index.html` in a browser, or serve locally:
   ```bash
   npx serve . -l 3000
   ```

2. Sign up with email/password at the login screen
3. Admin can approve enrollments from the Admin dashboard

## Configuration

Supabase credentials are in `supabase-config.js`. For your own deployment, update:
- `SUPABASE_URL` 
- `SUPABASE_ANON_KEY`

## Project Structure

```
├── index.html          # Entry point
├── app.js              # Application logic (Supabase client)
├── supabase-config.js  # Supabase connection config
├── styles.css          # Styling
├── package.json        # Project metadata
└── docs/               # PRD and documentation
```

## License

ISC
