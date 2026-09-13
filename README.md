# Daymark ToDo

Independent ToDo application owned by Nwa-chi.

## Current status

The browser app is a local-storage prototype built with HTML, CSS and JavaScript.
It supports task creation, editing, completion, deletion with confirmation and undo,
priorities, categories, due dates, filtering, sorting, progress and theme preferences.
Browser notification support is opt-in and requires a compatible browser and an
open app. Notifications are not background push notifications.

New installations start with an empty list. Existing browser data is preserved.

A separate Daymark ToDo Supabase project has been provisioned. Its private-record
schema is saved in this repository. The browser app is **not yet connected** to
Supabase, and email/password accounts, OTP screens, cross-device sync and the admin
portal are **not yet implemented**.

## Run

Requires Node.js 22 or newer. There are no runtime npm dependencies.

```sh
npm run build
npm start
```

Open http://localhost:4173 on the same computer. The server serves only built public
assets, with security headers and a /healthz endpoint. Use an HTTPS reverse proxy
in production. A local server address is not a public deployment.

Container option:

```sh
docker build -t daymark-todo .
docker run --rm -p 4173:4173 daymark-todo
```

The Docker configuration is provided but has not been container-tested here.

## Check

```sh
node --check app.js
npm test
```

The test command starts the actual server and checks built assets, security
headers, allowed methods, health and blocked private paths. npm run check:source
provides additional lightweight source checks. Neither replaces browser-flow,
accessibility, notification or real email-delivery tests.

## Structure

- `index.html`: task interface and dialogs.
- `styles.css`: responsive styling, themes and focus treatment.
- `app.js`: current device-local task state and notifications.
- `tests.js`: lightweight source checks.
- `release.test.cjs`: actual HTTP release checks.
- `build.cjs` and `server.cjs`: static build and allowlisted HTTP server.
- `Dockerfile`: non-root container configuration.
- `supabase/migrations/`: exact migration already applied to Daymark's database.
- `docs/SETUP.md`: project separation, email setup and outstanding work.

## Launch status

This release prepares deployment of the device-local application only. It is
not ready for the requested multi-user launch. See docs/SETUP.md for authentication,
OTP, cloud sync, administrator identity, SMTP and hosting work still required.
No public deployment or organisation transfer is included in this change.

## Security

Never commit passwords, access tokens, SMTP credentials, service-role keys or user
data. Use deployment secrets for server credentials. Public Supabase keys alone
do not protect data: row-level policies enforce ownership and verified email.

Do not enter a ChatGPT password into this app. The planned admin sign-in requires
a supported ChatGPT identity flow and server-side authorisation.
