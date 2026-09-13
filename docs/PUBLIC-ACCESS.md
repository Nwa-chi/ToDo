# Public access and daymarks.click

This status supersedes the private-access and nwachi.click target described in the initial 1.0 release notes.

The owner explicitly authorised public access. The Site access policy is now public and was read back to confirm it. Visitors can open https://daymark-nwachi-todo.nwachi-9670.chatgpt.site without the previous owner-only gate. Daymark email authentication and per-user database access rules remain required for plans. SMTP delivery still needs repair and real verification.

The new requested domain daymarks.click is attached to the Site, with DNS ownership and TLS validation pending. This operation does not register or purchase the domain. The owner must control its DNS.

| Type | Name | Value |
| --- | --- | --- |
| A | daymarks.click | 162.159.143.30 |
| A | daymarks.click | 172.66.3.26 |
| TXT | _openai-site-verification.daymarks.click | openai-site-verification=Odx3bIX_USkIsIfqIRGuj5ZarljXruQWCXJD8GDpY40 |
| TXT | _cf-custom-hostname.daymarks.click | 7fb62755-5aff-4ee2-95b5-a1bddc00851f |

Preserve unrelated DNS records. An apex CNAME must not be used. Once domain and TLS status are active, configure Supabase Site URL to https://daymarks.click and allow https://daymarks.click/ as a redirect. Keep the current working Site origin allowed during transition. Install the app from the final domain; installations belong to an origin.

The earlier nwachi.click attachment has not been removed or redirected. No DNS records were changed by this update.
