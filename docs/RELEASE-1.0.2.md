# Daymark 1.0.2

- Treat a missing login session as a normal signed-out visit instead of a connection failure. Continue showing genuine network and service errors, with a retry control on the sign-in screen.
- Let the desktop welcome headline occupy two lines, and group its description and benefits together.
- Show sign-in notices beside the form so they do not overlap the welcome tagline.
- Adjust narrow-screen spacing without hiding form controls.
- Use the package version for sign-in, Settings, About, the offline page and the service-worker cache. Earlier releases were labelled 1.0.0; this release is 1.0.2.

No database migration is required. Plans and account records are unchanged.
