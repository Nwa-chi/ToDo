# Daymark on Cloudflare Pages

This is the selected replacement host. Supabase remains the account/database
service and Nwa-chi/ToDo remains the source repository. No migration has deployed
until the Pages account connection and first build succeed.

## Connect the repository

In Cloudflare, open Workers & Pages and create a Pages project connected to Git.
Authorise GitHub access to Nwa-chi/ToDo and select main.

- Framework preset: None
- Build command: npm run build
- Build output directory: dist
- Root directory: repository root (leave blank)
- Build environment variable NODE_VERSION: 22
- Plan: Free; no Pages Functions or paid Workers are required by this app.

The build contains only the public Supabase publishable key. Do not add service
keys, Gmail credentials or database passwords to the build environment.

First verify the assigned pages.dev address loads the app. Add that exact origin
with a trailing slash to Supabase's allowed redirect URLs for authentication tests.

## Custom domain

For the apex daymarks.click, add the domain as a Cloudflare zone and choose the
Free plan. Review imported DNS records before changing nameservers. Preserve mail
and other unrelated records. After registration completes, update the registered
domain's authoritative nameservers at AWS to the exact pair Cloudflare assigns.
Do not merely change the NS record within the old hosted zone. If DNSSEC is enabled,
follow Cloudflare's DNSSEC migration instructions before the nameserver change.

In the Pages project's Custom domains tab, add daymarks.click. Use the records
Cloudflare generates; do not guess the deployment's target. Replace the previous
website A records as part of this cutover, preserving unrelated records. Wait for
DNS and TLS status to become active, then test the final domain.

Set Supabase Site URL to https://daymarks.click and allow https://daymarks.click/.
Use the code template in EMAIL-TEMPLATE.html for both signup and recovery. Gmail
SMTP still needs a valid sender App Password and an actual email-delivery test.

Only after the replacement site works should the former website deployment be
retired. The old host's metadata file is no longer part of current source.

## Costs and limits

Pages has a Free plan with limits, including 500 builds per month at preparation.
Domain renewal, AWS DNS charges until retired, and Supabase/email usage are separate.
Review https://developers.cloudflare.com/pages/platform/limits/ before scaling.

## Validation

Run npm run build and npm test. Browser installation, live email delivery and the
new host's actual response headers must be tested after deployment. The _headers
file applies the static host's security headers; no server process is required.
