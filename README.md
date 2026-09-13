# Daymark ToDo

Independent ToDo application owned by Nwa-chi.

## Current status

The browser app is a local-storage prototype built with HTML, CSS and JavaScript.
It supports task creation, editing, completion, deletion with confirmation and undo,
priorities, categories, due dates, filtering, sorting, progress and theme preferences.
Browser notification support is opt-in and requires a compatible browser and an
open app. Notifications are not background push notifications.

The first launch inserts three sample tasks. These are demonstration records,
not real user data; the current interface does not yet label them as samples.

A separate Daymark ToDo Supabase project has been provisioned. Its private-record
schema is saved in this repository. The browser app is **not yet connected** to
Supabase, and email/password accounts, OTP screens, cross-device sync and the admin
portal are **not yet implemented**.

## Run

Requires Python 3 to serve the app; Node.js is needed for the source checks.

```sh
npm start
```

Open http://localhost:4173 on the same computer. This is a local server, not a
public deployment. Do not use the Python development server as a production host.

## Check

```sh
node --check app.js
npm test
```

The test command checks source structure only. It does not execute the app in a
browser or prove that accessibility, notifications, authentication or email
delivery work. Real browser flow tests are still required before release.

## Structure

- `index.html`: task interface and dialogs.
- `styles.css`: responsive styling, themes and focus treatment.
- `app.js`: current device-local task state and notifications.
- `tests.js`: lightweight source checks.
- `supabase/migrations/`: exact migration already applied to Daymark's database.
- `docs/SETUP.md`: project separation, email setup and outstanding work.

## Security

Never commit passwords, access tokens, SMTP credentials, service-role keys or user
data. Use deployment secrets for server credentials. Public Supabase keys alone
do not protect data: row-level policies enforce ownership and verified email.

Do not enter a ChatGPT password into this app. The planned admin sign-in requires
a supported ChatGPT identity flow and server-side authorisation.
