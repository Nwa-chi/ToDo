# Daymark ToDo — fresh rebuild

Account-based task, event and occasion planner. The previous prototype was
replaced; its code remains recoverable in Git history.

## Selected backend

- Supabase project: **ToDo**
- Project reference: **uolwbaappjrggtaydvsq**
- Region: **eu-west-1**
- Source: https://github.com/Nwa-chi/ToDo

Only this project's publishable client configuration is included. No old project
keys, records or device-local task data are imported.

## Implemented

- Email/password sign-up and sign-in.
- Email-code verification and resend cooldown.
- Password reset using an emailed code and new-password form.
- Persistent Supabase sessions, sign-out and clearing the displayed user's data.
- Database-backed CRUD with confirmed-email and per-owner access policies.
- Tasks, events and occasions; priority, category, date, optional time and duration.
- Search, combined filters, sorting, completion counts, progress, delete confirmation
  and short-lived undo.
- Responsive light/dark interface and opt-in browser notifications while open.
- Bundled static build, allowlisted HTTP server and container configuration.

## Run

Node.js 22+:

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open http://localhost:4173 on the same computer. For hosting, run behind HTTPS.
The server exposes /healthz and serves only the compiled public files.

Optional container:

```sh
docker build -t daymark-todo .
docker run --rm -p 4173:4173 daymark-todo
```

The Docker recipe has not been executed in this environment.

## Tests

```sh
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

Unit tests exercise the actual domain functions; HTTP tests exercise the built
server. Browser tests use Chromium and mocked Supabase responses. They do not send
emails and do not replace live registration tests. Database policies were separately
tested with temporary users inside a transaction that was rolled back.

## Before inviting users

See [launch setup](docs/SETUP.md). Email templates, SMTP delivery, allowed URLs and
real email verification still need configuration and end-to-end testing.
This repository has not been deployed publicly.

The requested ChatGPT-admin login and admin portal are not part of this rebuild
yet. They require a supported identity integration and an explicit server-side
owner identity; no public signup can make itself an administrator.

## Structure

- public/: HTML, styles and favicon.
- src/: UI, authentication/data adapter, validated domain logic and public config.
- scripts/build.mjs: bundles dependencies and copies public assets into dist/.
- server.mjs: allowlisted HTTP server with security headers.
- supabase/migrations/: exact fresh migration applied to the selected project.
- tests/: domain, HTTP and browser checks.

## Data and notifications

Timed plans are stored as UTC instants and displayed in the viewing device's time
zone. Date-only plans retain their calendar date and become overdue after that day.
Browser reminders for date-only plans use 09:00 on the viewing device. Notifications
are best-effort while the page remains open; mobile support varies. They are not
background push notifications.

Legacy local records are not erased from users' browsers or silently uploaded.
Sign-out clears on-screen records, but cannot retract a browser notification that
was already delivered. Sessions are managed by the Supabase SDK. Never commit a
service-role key, SMTP password or personal account credentials.
