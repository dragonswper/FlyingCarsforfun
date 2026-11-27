# Private admin login and encrypted transport

Admin login: `https://flyingcarsforfun.connstors.workers.dev/admin`.
The game stays public. Operational server metrics require an authenticated admin
session. The login shell is public and contains no operational data or secrets.

## Two required steps

1. Enter the configured PIN. The server verifies its salted PBKDF2-SHA256 hash.
2. Enter the random eight-digit code delivered to the privately configured admin
   inbox. It expires after five minutes, works only with the requesting browser's
   HttpOnly challenge cookie, and can be used once.

The PIN alone never grants access. Missing private settings or failed email
delivery leaves admin access locked. There is no development bypass, query-string
password, default public PIN, browser-side credential check or code in an API
response. Tests use synthetic recipients and a mocked email transport.

PIN attempts are limited per keyed address to five per 15 minutes, with a global
limit of 30 per 15 minutes. Email delivery has a one-minute cooldown and a maximum
of five requests per hour. A challenge permits five verification attempts. The
limits, challenges and sessions persist in the authority's private storage so a
restart does not reset them. Only keyed hashes of address identifiers, challenges,
codes and session tokens persist; the application never logs credentials or codes.

Sessions use a random opaque token, last at most 15 minutes, and require a
`Secure; HttpOnly; SameSite=Strict; Path=/` host-only cookie. Cookies are not
accessible to the admin page's JavaScript. Logout revokes the server record;
expiry and replay checks run on the server. Admin POSTs require an exact
same-origin JSON request. Allowing another game frontend origin does not allow
cross-origin admin access. Responses use `Cache-Control: no-store`.

## One-time free email setup

A mail provider credential and Cloudflare secret access are required. GitHub's
deploy connection cannot supply these private values, and a successful mocked
test does not establish production email delivery.

The built-in sender uses the Resend HTTPS API. For this single-admin setup, the
free test sender can deliver to the email address registered with the Resend
account. No domain purchase is needed for that same-inbox case. Create the
account with the same email address that will receive admin codes; verify it.
Other recipients require a verified sending domain. See [Resend's test-email
rules](https://resend.com/docs/dashboard/emails/send-test-emails).

1. In a free Resend account, create a sending API key. Do not put it into chat,
   the public game, a URL, Git, an issue or a build log.
2. In Cloudflare, open **Workers & Pages → flyingcarsforfun → Settings →
   Variables and Secrets**. Add these as **Secret** values:

   | Secret | Value |
   | --- | --- |
   | `ADMIN_EMAIL` | The administrator's inbox; must match the free test-sender account |
   | `ADMIN_PIN_HASH` | The generated salted PIN hash |
   | `ADMIN_SECRET` | The generated random 256-bit secret |
   | `RESEND_API_KEY` | The sending key from Resend |

3. Save/deploy the private settings. The default sender is
   `onboarding@resend.dev`. With a verified domain, set `ADMIN_MAIL_FROM` to an
   authorized address on that domain instead.
4. Open `/admin` over HTTPS. Enter the PIN, retrieve the code from the configured
   inbox, verify it, refresh the metrics and sign out. Do not share the code.
   A send failure keeps access locked and displays a generic configuration error.

No paid service is provisioned by this repository. The email API receives the
configured recipient and code to deliver the requested message. It is never
called with a browser-supplied recipient or arbitrary URL. Redirects are not
followed and provider errors are not echoed into the browser.

## Preparing private settings

The task workspace can generate private settings for the requested PIN without
putting that PIN into the source. Alternatively, place a private JSON file with
`pin` and `email` fields in the ignored `.admin-setup/` directory, then run:

```sh
node scripts/create-admin-secrets.mjs --input .admin-setup/input.json
```

The command writes `.admin-setup/secrets.json` with mode 0600. It prints no
credential values, refuses to write public assets and does not configure a cloud
account. Transfer the values directly into Cloudflare Secrets. Keep the file
private and remove the plaintext input after setup. The generated values are
not delivered in the game bundle or committed to GitHub.

For Node hosting, set the same environment variables and use the existing TLS
configuration. Admin rate limits and token hashes save in `.admin-data/` with
private file permissions. That directory and `.admin-setup/` are ignored by Git.
Rotating `ADMIN_SECRET` invalidates existing sessions and challenges. The
Cloudflare object name, social records and migrations remain unchanged.

## What encryption protects

HTTPS encrypts game assets, API calls and admin traffic in transit. Dedicated
multiplayer requires WSS; WebRTC transports use the browser's DTLS protection.
Node TLS requires TLS 1.2 or newer, or an explicitly configured trusted HTTPS
proxy. Admin requests never use the optional plaintext local health probe.

Embedded model textures may be decoded through local `blob:` URLs. The connection
policy allows that in-memory path while network requests still require HTTPS/WSS.

The update adds HSTS, a content security policy, frame restrictions, MIME
sniffing protection, a no-referrer policy and restricted device permissions.
Server/configuration paths and key/source-map extensions are blocked from the
public static server. Public health retains only anonymous compatibility and
occupancy fields; detailed timing counters move to `/api/admin/overview`.

Encryption does not make downloaded browser code or artwork secret. Player
preferences, local replays and local cosmetic progress remain ordinary browser
storage; admin credentials and codes are never stored there. The GitHub source
remains public and must not contain secrets. Account security still depends on
keeping the admin inbox and hosting account secure.

The consolidated Random Eras routes use `wasm-unsafe-eval` for the bundled Meshopt
model decoder. This permits WebAssembly compilation without enabling JavaScript
`eval`; the hub, Boost Circuit and admin keep their existing script policy.
