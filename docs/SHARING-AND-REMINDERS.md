# Categories, shared plans and background reminders

## Using the features

Choose a category in Add/Edit plan. Presets include Personal, Work, Study, Family,
Health & fitness, Finance, Shopping, Travel, Birthdays & occasions, and Home.
Previously saved categories remain selectable.

Choose Share on a saved plan, then Create code. Send that code privately to one
person. They sign in with a verified account, choose Link a plan, and enter it.
The code is random, single-use, expires after 24 hours, and is replaced whenever
another code is created. Both people can edit or complete the plan. Only the owner
can delete it, invite someone, or revoke access. The collaborator can leave.
Changes refresh every 30 seconds while visible and on reopening the app. Deletion
undo restores the owner's plan without restoring invitations or shared access.

Enable alerts on each device. On iPhone/iPad, add Daymark to the Home Screen first
(iOS/iPadOS 16.4+) and open the installed app. Allow notifications when asked.
Supported push services: Chrome/FCM, Firefox, Apple, and Windows notification hosts.
The server checks reminders every minute even when the app is closed. Timed plans
use their due instant; date-only plans use 09:00 in the timezone where the date was
set. Editing unrelated fields preserves that instant. Older date-only plans use
09:00 UTC until their date is changed because they had no stored timezone.

Push is best effort, not an alarm-clock guarantee: offline devices, Focus mode,
battery policies, permission changes and force-stopped browsers can delay or block
it. Pending delivery retries up to four times at five-minute intervals; stale
reminders expire after 24 hours and push-service messages have a one-hour TTL.
A rare retry after an interrupted response can replace the same tagged notification.
Disable alerts or explicitly sign out to remove this browser's subscription.
Notifications contain generic text, not plan titles. Already queued or delivered
messages cannot be recalled after completion, sign-out, or access revocation.

## Backend

The sharing_and_push and reminder_schedule migrations are applied to the ToDo
project. Membership is a single collaborator ID; direct client changes to ownership
or membership are forbidden with column grants. RLS requires a verified account
and ownership or membership. Invitations and subscriptions live in a private schema
with default-deny RLS; narrowly granted functions handle access. Invitation codes
are stored only as hashes. The worker RPC is executable by service_role only.

The daymark-reminders Edge Function accepts only POST requests authenticated with
a 256-bit scheduler secret. Gateway JWT verification is disabled because the
function verifies this custom secret using a constant-time comparison. Secret and
VAPID keys reside in Vault, never in the build or repository. The service-role key
is supplied by the Edge runtime. Payloads use standard encrypted Web Push.

Cron invokes the function once per minute. The queue uses unique plan/device/time
keys and row leases to avoid concurrent duplicate sends; completed, changed, revoked,
banned or deleted-account records are excluded from subsequent claims. 404/410
responses remove expired subscriptions. Outbound push endpoints are allowlisted.

For a NEW project: generate a P-256 VAPID pair using a trusted Web Push library;
store base64url values as Vault secrets daymark_vapid_public/daymark_vapid_private,
and a random 32-byte hex value as daymark_push_cron. Do not replace existing VAPID
keys casually: doing so requires users to resubscribe. Deploy the Edge Function
and apply migrations in order, adapting the scheduler project URL if needed.

## Verification

- npm run build and npm test verify the static build, domain logic and SW handler.
- supabase/tests/sharing.sql verifies real database access with temporary accounts
  and rolls back: collaboration, third-user isolation, revocation and worker denial.
- supabase/tests/reminders.sql verifies leasing, retries, duplicate prevention,
  completion suppression and subscription expiry, rolling back test fixtures.
- A live scheduled worker run returned HTTP 200 with zero jobs. This confirms the
  scheduled invocation, secret authentication and RPC path, not device receipt.
- A physical-device test is still required: enable alerts, create a plan two minutes
  ahead, close the app, and confirm receipt. Real SMTP delivery is a separate check.
- Supabase advisory: leaked-password protection is disabled in existing Auth settings.
  See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
  Private tables intentionally have no user RLS policies (deny all direct access).

## Daily progress and alert presentation

The summary now measures all plans scheduled for today in the viewing device's
local timezone, including completed plans. Undated plans and other dates are excluded.
Search and list filters do not change this daily total; the date is recalculated
on refresh and when the app becomes visible.

Alerts request a vibration pattern, default device sound and continued display
until dismissed where supported. View plan focuses the associated plan after
sign-in; Dismiss closes the notification. An open app also shows a persistent
reminder banner with the plan title once the account's access has been checked.
The lock screen continues to use generic text for privacy.

Test alert checks local notification presentation, not end-to-end push delivery.
Browser/OS support varies: websites cannot force volume, custom system sounds,
or bypass silent mode, Focus or battery restrictions. Unsupported rich options
fall back to a basic notification. Automated tests cover daily totals, alert options,
fallback, and notification actions; actual device sound/vibration needs a device test.

## Addressed invitations and sidebar toggle

Use the header menu button to hide/show the sidebar, or its top arrow to close it.
The preference is saved on this browser. Invitations remain accessible in the header
when the sidebar is hidden.

On a saved plan choose Share, enter the recipient's verified Daymark account email,
and Send invitation. The recipient opens Invitations in the header and accepts or
declines. Acceptance grants the one collaborator slot. Pending invitations expire
in 24 hours; another invitation or code replaces the previous one. The existing
code option remains available under Use a code instead.

An in-app pending count refreshes on load, refresh and every 30 seconds while visible.
The existing minute-by-minute worker also delivers invitation push alerts to the
recipient's opted-in devices. Tap Review invitation to open the inbox. No plan title
or email is sent in the lock-screen payload. Device delivery remains best effort;
in-app invitations work even without push permission. No SMTP email is sent here.

For privacy, the sender sees the same acknowledgement when an address is unknown,
unverified or their own. The recipient must already have a verified Daymark account.
Sending is limited to ten requests per hour per owner. Tests in
supabase/tests/addressed-invitations.sql run in a rolled-back transaction and cover
recipient isolation, accept, decline, expiry and privileged worker isolation.
Private queue tables remain denied to direct client access. The existing Auth
leaked-password-protection advisory is unchanged; see the security link above.

## Plans spanning several days

Set Start date and an optional End date in Add/Edit plan. The plan appears on every
included day and counts once in each day's progress. Completing the plan completes
it as a whole; there are no separate daily checkboxes. Multi-day plans become overdue
after the end date. The reminder remains at the start date/time (09:00 without a time);
extending the end date does not send another reminder. Single-day plans are unchanged.
The database rejects end dates before the start and end dates without a start date.

Search, category/type/priority filters, and sorting now live in the sidebar's search
panel. Open the search icon, make selections, then choose Show plans. They no longer
occupy the main page. If the sidebar is hidden, reopen it with the header menu button.
