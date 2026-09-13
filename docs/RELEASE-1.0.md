# Daymark 1.0.0

## Delivered

- Installable PWA manifest, regular and maskable icons, standalone window settings.
- Install button with native prompt where supported and platform instructions.
- Service worker caches public interface assets only; offline navigation shows a
  reconnect page. No auth responses or user records are cached by the worker.
- Update notice activates new app assets on explicit user action.
- Clear connection/sync status, offline write guard, password visibility toggle,
  eight-character password guidance, resume-verification entry point and clearer
  authentication error messages.
- Email redirects use the current HTTPS origin, and unconfirmed logins lead to
  the verification form. No verification bypass or default admin credentials.
- Notification delivery uses the service worker where available, with a desktop
  fallback; reminders still require the app to remain open.
- Refined responsive spacing, larger action targets, new empty-state action,
  install/about controls, privacy explanation and visible version 1.0.
- Existing cloud-backed tasks, events, occasions, filters, sorting and undo retained.

## Verification

The version 1.0 build and 11 Node tests pass. Tests cover domain logic, HTTP asset
serving, security headers, manifest icon dimensions, service-worker API exclusions,
online/offline navigation and authentication error handling.

The Chromium test suite remains included but could not execute in this session:
the browser executable was absent and its download timed out. Earlier-version
browser results do not establish this version's browser behaviour. Real Gmail
OTP delivery, mobile installation and cross-device user testing remain release
gates. The app is prepared as version 1.0.0; this number is not a claim that the
external launch gates below have passed.

## External launch gates

1. Gmail SMTP returned 535 5.7.8 (credentials rejected). Enter a valid Google App
   Password for the exact sender account in Supabase, then test real signup,
   resend, code verification, login and password recovery. Do not enter the normal
   Gmail password. Never store the app password in this repository.
2. nwachi.click is attached to the Site but DNS/TLS validation is pending. Follow
   DOMAIN.md and configure the Supabase Site URL/redirect allowlist.
3. Hosting remains owner-private. Public sharing is a separate owner decision.
4. The previously requested ChatGPT-admin portal is not implemented. Version 1.0
   is an individual planner; do not advertise user administration or ChatGPT SSO
   within the planner. The host access gate is not an admin role.
5. Background push notifications and offline task editing are not implemented.

All work belongs to Nwa-chi/ToDo. No other application is a fallback backend.
