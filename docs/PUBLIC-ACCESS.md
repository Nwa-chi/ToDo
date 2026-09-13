# Public access and daymark.click

This status supersedes the private-access and nwachi.click target described in the initial 1.0 release notes.

The owner explicitly authorised public access. The Site access policy is now public and was read back to confirm it. Visitors can open https://daymark-nwachi-todo.nwachi-9670.chatgpt.site without the previous owner-only gate. Daymark email authentication and per-user database access rules remain required for plans. SMTP delivery still needs repair and real verification.

The new requested domain daymark.click is attached to the Site, with DNS ownership and TLS validation pending. This operation does not register or purchase the domain. The owner must control its DNS.

| Type | Name | Value |
| --- | --- | --- |
| A | daymark.click | 162.159.143.30 |
| A | daymark.click | 172.66.3.26 |
| TXT | _openai-site-verification.daymark.click | openai-site-verification=GYZUPLDwv8iIvvhcn18Itc_tzZR2ZtGe8SoCcpWi7Uw |
| TXT | _cf-custom-hostname.daymark.click | 8312dbf7-9869-425c-906d-863404a5b83e |

Preserve unrelated DNS records. An apex CNAME must not be used. Once domain and TLS status are active, configure Supabase Site URL to https://daymark.click and allow https://daymark.click/ as a redirect. Keep the current working Site origin allowed during transition. Install the app from the final domain; installations belong to an origin.

The earlier nwachi.click attachment has not been removed or redirected. No DNS records were changed by this update.
