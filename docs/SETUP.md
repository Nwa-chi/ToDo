# Daymark 1.0 launch setup

See RELEASE-1.0.md for current validation limits and DOMAIN.md for exact DNS records.

## Project

Use only Supabase project uolwbaappjrggtaydvsq (ToDo, eu-west-1).
The migration 20260913201136_fresh_daymark_plans.sql has already been applied to it.
Do not run it a second time manually against that project.

The connected account currently reports organisation zzqgplncbezrbitakmbh named
Daymark. A code reset does not create or transfer an organisation. Separate billing
or membership must be confirmed in the Supabase dashboard.

## Authentication and email

In the selected project's dashboard:

1. Enable Email provider and require Confirm email. Do not enable anonymous access.
2. Set the password minimum to at least eight characters; configure stronger
   provider password controls as appropriate.
3. Use docs/EMAIL-TEMPLATE.html in both Confirm signup and Reset password templates.
   Keep the {{ .Token }} variable, which inserts the real code.
4. Configure custom SMTP with a verified sender domain for delivery to real users.
   Enter SMTP credentials in Supabase, never in GitHub or chat.
5. Configure Site URL and allowed redirects for the final HTTPS app address.
6. Confirm registration/login/OTP resend rate limits and test them.

The app uses signUp with email and password, verifyOtp with type email for
verification, and type recovery for password-reset codes. A code verification
response does not override database policy: each database query checks the
confirmed email of the current authenticated account.

Supabase's default email service is not a substitute for a production SMTP setup.
Registration and verification UI can be built before that setup, but successful
delivery must be tested with a real inbox.

References:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp

## Test gate

- npm run build and npm test pass.
- Real database owner CRUD, unverified-account denial, cross-user read/write
  isolation and completion timestamps have passed transaction-based tests.
- Supabase security advisor returned no findings after schema creation.
- Chromium tests passed registration/OTP gating, create/edit/complete/search,
  delete/undo, reload, mobile width and logout against controlled API responses.
  Desktop and mobile screenshots were visually checked.
  No real OTP delivery has been verified yet.
- Test a real user on two devices, password reset, expired/wrong codes, failure
  states and sign-out before launch.

## Administration

User administration is not part of version 1.0. No default admin credentials or
automatic first-user promotion exists. Individual accounts use verified email.

## Hosting

The owner has explicitly authorised public website access. Personal plans remain
protected by email authentication and per-user database policies. Use HTTPS and preserve the server's
Content-Security-Policy when placing it behind a reverse proxy. The current CSP
allows network requests only to the selected Supabase project.

Public client config is in src/config.js. If changing projects, update the
publishable configuration, server policy, migration state and tests together.
The old project is not a fallback.
