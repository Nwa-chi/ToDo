# daymarks.click — Daymark 1.0

The owner reports that domain registration is in progress in Route 53.
The hostname is attached to Daymark hosting but is not yet active.

## Activation

1. Wait for registration to complete and open the domain's Route 53 hosted zone.
2. Set the apex A record to both 162.159.143.30 and 172.66.3.26.
3. Copy the exact ownership-verification TXT records from the hosting domain
   settings into Route 53. These provider-generated names and values are mandatory
   infrastructure records, not app branding; do not rename them.
4. Preserve unrelated email, NS and TXT records. Verify DNS and TLS status is active.
5. In the ToDo account service, set Site URL to https://daymarks.click and allow
   https://daymarks.click/ as a redirect. Retain the working hosting origin during
   the transition so existing email flows continue to work.
6. Test registration, code delivery, sign-in and password recovery at the final URL.

Do not use an apex CNAME. Installation belongs to the website's origin; install
from daymarks.click after activation and sign in to retrieve cloud plans.

No domain purchase, DNS edit or certificate activation is claimed by this guide.
