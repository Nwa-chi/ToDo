# nwachi.click — Daymark 1.0

The hostname is attached to the existing Daymark Site. It is not active until DNS
ownership and certificate validation succeed. Do not point an apex CNAME record
at the target: use the A records below. Preserve unrelated MX, TXT, NS and email
records. Inspect existing website A/AAAA records before switching their traffic.

## Required DNS records

| Type | Name | Value |
| --- | --- | --- |
| A | nwachi.click | 162.159.143.30 |
| A | nwachi.click | 172.66.3.26 |
| TXT | _openai-site-verification.nwachi.click | openai-site-verification=ss9o1fUSVLKHfUDxKyNmgkjdZx38wpoSeNMp9BwsrsI |
| TXT | _cf-custom-hostname.nwachi.click | 941acae5-23e3-4771-96e2-6ae06739571e |

Some DNS dashboards accept @ for the apex and automatically append nwachi.click
to TXT record names. Use a reasonable initial TTL such as 300 seconds.
These are public DNS validation records, not API credentials.

Once DNS validates, check the Site domain status is active and SSL is active.
Do not claim the domain works based on DNS entry alone. Host access remains private.

## Supabase redirects

In ToDo project uolwbaappjrggtaydvsq, Authentication → URL Configuration:

- While testing, use the currently working private Site URL as Site URL:
  https://daymark-nwachi-todo.nwachi-9670.chatgpt.site
- Keep that origin with a trailing slash in the allowed Redirect URLs.
- Add https://nwachi.click/ to Redirect URLs.
- After DNS and TLS are confirmed, use https://nwachi.click as Site URL.

The app sends location.origin + '/' as the email redirect, avoiding hardcoded
localhost links. The dashboard allowlist still needs configuring by the owner.
Do not add unrestricted wildcard origins. Set both Confirm signup and Reset
password templates to include {{ .Token }} to support code entry in the app.

## Installation

PWAs belong to an origin. An app installed from the private Site URL does not
silently change to nwachi.click. Once the domain works, install from nwachi.click;
sign in with the same verified Daymark account to retrieve existing cloud plans.
The private host's ChatGPT access check and Daymark's email login are separate.
