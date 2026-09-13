# Daymark setup and project boundaries

## Canonical projects

- Source: https://github.com/Nwa-chi/ToDo
- Supabase project: Daymark ToDo
- Supabase reference: evctsfrxefzzqedeqslg
- Region: eu-central-1 (Frankfurt)

Daymark has its own database and authentication project. It shares the AURA MUSIC
HUB Supabase organisation, which is an administrative/billing grouping. It does not
use Aura Music Hub's database, authentication users, keys or repository. Moving to
a separate organisation has not been requested with a destination or performed.

All further Daymark source, migration history and setup changes should be committed
to this repository. Exclude secrets, personal records and temporary exports.

## Database

Migration 20260913172731_daymark_private_items.sql was exported from the actual
Daymark migration history. It is already applied there; do not apply it again
manually to the same project.

The daymark_items table supports tasks, events and occasions, dates, optional
times, time zone and duration. Database policies restrict CRUD to the owner with
a confirmed email and a non-deleted, non-banned account. A private helper checks
the current authenticated identity; callers cannot supply someone else's ID.
Anonymous clients have no table privileges.

A transactional database test passed owner CRUD, completion timestamps,
cross-user read/write isolation and unverified-user denial. All test records were
rolled back. The security advisor returned no findings at that stage.

## Email configuration still required

In Supabase Authentication:

1. Keep Email sign-in and Confirm email enabled.
2. In Email Templates / Confirm signup, set subject to
   "Your Daymark verification code".
3. Use this template:

```html
<h2>Welcome to Daymark</h2>
<p>Enter this code in the app to verify your email:</p>
<p style="font-size:28px;font-weight:bold">{{ .Token }}</p>
<p>If you did not create an account, ignore this email.</p>
```

Configure a production SMTP sender and its verified domain before opening
registration to users. Supply credentials directly in Supabase's settings,
never in source control or chat. Configure Site URL and allowed redirects once
the deployment address is known.

References:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp

## Remaining implementation

1. Email/password sign-up, OTP verification and resend limits.
2. Login, password reset, session handling and logout.
3. Connect the interface to per-user database CRUD; preserve existing local records
   until the user explicitly chooses whether to import them.
4. Event and occasion interfaces with time-zone-aware scheduling.
5. Admin portal with a supported ChatGPT sign-in and a server-enforced owner
   allowlist. No administrator has been assigned yet.
6. End-to-end browser, permission and email tests.
7. HTTPS deployment and verification of a real user-accessible URL.

The present prototype is not a finished multi-user production application.
