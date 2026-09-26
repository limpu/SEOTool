# Installing the AI SEO Intelligence Platform

This guide takes you from a fresh server to a working, signed-in platform.

It is written for an operator, not a developer. You will need to be able to
copy and paste commands into a terminal on your server, and to edit DNS
records for your domain. You do not need to read or write any code.

**The short version.** You put the application on a server, point a domain
at it, put HTTPS in front of it, then open `/install` in a browser and let
the installer do the rest. The installer checks 41 things about your server
and tells you, in plain language, what is wrong and how to fix it. It will
not tell you something is working when it has not proven that it is.

**Time required.** Roughly 30–60 minutes of your own work, plus waiting time
that is outside your control: DNS propagation (minutes to hours) and — if
you want Search Console and Analytics — Google's OAuth verification review,
which can take **several weeks**. Start the Google application early; see
Step 7.

---

## Before you start — what you need

| Thing | Why | Notes |
|---|---|---|
| A Linux server | Runs the application | 2 GB RAM minimum, 4 GB recommended. Below 4 GB, PageSpeed audits and large crawls will struggle. |
| PostgreSQL 18 or newer | The platform's only hard dependency | Can be on the same server or a managed database. |
| A domain name | Login links, emails and Google OAuth all need a real address | e.g. `seo.example.com` |
| A TLS certificate | Google OAuth **requires HTTPS in production** | Free from Let's Encrypt. See Step 3. |
| SMTP credentials | Sends registration codes and password resets | Optional to install, but nobody can register or reset a password without it. |

Two things are worth knowing before you begin, because they surprise people:

1. **Changing environment variables requires a restart.** The application
   reads its configuration once, when it starts. Editing `.env` while it is
   running changes nothing until you restart it. The installer says this
   plainly rather than claiming a save took effect.
2. **`NEXT_PUBLIC_APP_URL` requires a rebuild, not just a restart.** That one
   value is baked into the browser code when the application is built. If you
   change your domain later, you must rebuild.

---

## Step 1 — Deploy the application

Choose **one** of the two paths below.

### Path A — Docker (recommended)

The supplied `Dockerfile` builds a self-contained production image. It also
installs Chromium inside the image, because PageSpeed audits launch a real
browser; without it, that one feature would silently fail in production.

```bash
# On your server, in the unpacked project directory:
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=https://seo.example.com \
  -t ai-seo-platform:prod .
```

Replace `https://seo.example.com` with your real address. This value is
compiled into the browser bundle, which is why it is a **build** argument and
not a runtime one — you cannot change it later by restarting.

Then run it, supplying configuration through the container runtime:

```bash
docker run -d --name ai-seo-platform \
  -p 3000:3000 \
  -e DATABASE_URL='postgresql://seo_user:YOUR_PASSWORD@db-host:5432/seo_platform' \
  -e JWT_SECRET='<a generated secret — see below>' \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_APP_URL='https://seo.example.com' \
  ai-seo-platform:prod
```

Generate `JWT_SECRET` before you run this, on any machine with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> **Important, and easy to get wrong: in Docker, configuration must come from
> the container runtime, not from a `.env` file written inside the container.**
> A `.env` written inside a running container is destroyed by the next image
> build, `--force-recreate`, or reschedule. Your configuration would appear to
> work and then silently vanish. The installer detects that it is running in a
> container and, instead of writing a file it knows will be lost, prints the
> exact `-e` flags or `docker-compose` `environment:` block for you to paste
> into your deployment. That is the only form of configuration that survives a
> redeploy.

You will add the remaining variables (email, Google, Ollama) to this command
later, once the installer has told you what they should be. Each addition
means recreating the container — that is the restart.

`.env.example` in the project root lists every variable the application
reads, with a plain-language description of each.

### Path B — Traditional server / VPS

Requires Node.js 24 or newer and pnpm.

```bash
# In the unpacked project directory:
corepack enable
pnpm install --frozen-lockfile

cp .env.example .env
# Edit .env: at minimum set DATABASE_URL, JWT_SECRET,
# NODE_ENV=production and NEXT_PUBLIC_APP_URL.
# Every variable is explained inline in that file.

pnpm run build
pnpm run start
```

The application listens on port 3000. Run it under a process manager
(`systemd`, `pm2`) so it restarts on boot and on crash.

On this path the installer **can** write `.env` for you, and it does so
safely: atomically, with `0600` permissions, preserving every existing
comment and line. It will tell you a restart is required, and then it
re-runs its checks afterwards rather than assuming the write worked.

---

## Step 2 — Configure DNS

Point your chosen hostname at the server.

1. In your domain registrar's DNS panel, create an **A record**:
   - Name: the subdomain you want, e.g. `seo`
   - Value: your server's public IPv4 address
   - TTL: leave at the default
2. If your server has an IPv6 address, add a matching **AAAA record**.
3. Wait for propagation — usually a few minutes, occasionally a few hours.

Confirm it before moving on:

```bash
dig +short seo.example.com
# should print your server's IP address
```

Do not continue until this resolves. Everything after this point — the TLS
certificate, the OAuth redirect URIs, the login links in emails — depends on
the hostname being real and reachable.

---

## Step 3 — Configure HTTPS / TLS

**Google OAuth requires HTTPS in production.** Search Console and Analytics
will not work over plain `http://`, at all. This is a Google requirement, not
a setting in this application.

There are two more reasons the platform itself insists on it:

- The administrator password you are about to create would otherwise cross
  the network in clear text.
- In production the session cookie is issued with the `Secure` flag, so over
  plain HTTP nobody could stay signed in even after logging in successfully.

Because of those, **the installer refuses to complete over plain HTTP in
production.** That refusal is deliberate.

Put a reverse proxy in front of the application and let it terminate TLS.
With Caddy, which obtains and renews a Let's Encrypt certificate
automatically, the entire configuration is:

```
seo.example.com {
    reverse_proxy localhost:3000
}
```

With nginx, use Certbot (`certbot --nginx -d seo.example.com`) and proxy to
`http://localhost:3000`. Make sure your proxy forwards the
`X-Forwarded-Proto` header — the installer reads it to confirm that the
connection reaching your browser really is HTTPS, and without it a correctly
secured deployment reports itself as insecure.

Confirm before moving on:

```bash
curl -I https://seo.example.com/api/health
# expect: HTTP/2 200
```

---

## Step 4 — Retrieve the install token

Open your browser to `https://seo.example.com/install` and you will be asked
for an **install token**. You need to fetch it from the server.

### Why this exists

Until installation is complete, `/install` can create the first administrator
account. That makes it, briefly, an endpoint that can hand someone control of
your platform. If the only protection were "no administrator exists yet",
then anyone scanning the internet for fresh deployments could reach your
`/install` before you do, complete the wizard, and own the platform — with no
bug involved anywhere. That is a real attack, and it is how WordPress sites
get taken over during installation.

The token closes that window. It is 32 random bytes, generated when the
application starts, written to a file readable only by the application's own
user and printed to the log exactly once. Possessing it proves you have
filesystem access to the server or access to its logs — that is, that you are
the person who deployed this. Merely knowing the URL proves nothing.

### How to retrieve it

**Docker:**

```bash
docker logs ai-seo-platform 2>&1 | grep -i "install token"
```

The token file exists inside the container too, but you cannot reach it from
outside — in a container, the log is your retrieval path. (The file inside a
container is also erased on every redeploy, which is fine: a new token is
generated on the next start, and that is loudly logged.)

**Traditional server:**

```bash
cat /path/to/ai-seo-platform/.install-token
```

If you run under systemd and the file is unavailable for any reason, the log
also has it: `journalctl -u ai-seo-platform | grep -i "install token"`.

> **Treat the token like a password.** Do not paste it into a chat, an issue
> tracker, or a screenshot. It becomes worthless the moment installation
> completes — the installer deletes the file and permanently closes `/install`.

---

## Step 5 — Open `/install` and complete the wizard

Go to `https://seo.example.com/install`, paste the token, and continue.

What you will see is **not** a linear form. It is a live checklist of eleven
sections, each showing the real state of your server right now:

**Welcome · Server check · Environment · Database · Google integrations ·
Email · AI (Ollama) · Administrator account · Security · Final checks ·
Complete**

Four words are used for status, and they never mean anything else:

- **✓ Ready** — checked, and working.
- **⚠ Action Required** — checked, and something is wrong. The screen tells
  you what is wrong, why it matters, and exactly how to fix it.
- **○ Optional** — not configured, and that is a supported state. Not a
  failure in disguise.
- **✕ Failed** — this blocks installation.

There is no "step 4 of 11", because the installer works out what you actually
still need. If you already supplied a complete configuration before first
boot, it will take you straight to the end. If your database goes away
halfway through, Database becomes the next thing to deal with again,
regardless of how far you had got.

Work through whatever is not Ready. In particular:

- **Environment** — 21 variables, each checked individually. Being *set* is
  not the same as being *valid*: a redirect URI pointing at `localhost`, or an
  encryption key that decodes to 24 bytes instead of 32, are both "set" and
  both broken. The installer says which.
- **Database** — run the migrations from here. They are applied one file at a
  time, each in its own transaction, verified before it commits. If one fails,
  the run stops immediately and tells you what was **not** attempted. Nothing
  is ever dropped, truncated or reset. Running it twice is safe.
- **Administrator account** — creates the first SUPER_ADMIN. This account is
  pre-verified, so you can sign in even before email works. It can only ever
  create the *first* administrator: if one already exists, this refuses.
  **Use a strong password and store it in a password manager before you
  submit the form — it is never shown again and cannot be recovered from
  anywhere in the system.**
- **Generated secrets** — the wizard can generate `JWT_SECRET`,
  `GSC_TOKEN_ENCRYPTION_KEY` and `GA4_TOKEN_ENCRYPTION_KEY` for you. Let it.
  Do not invent these by hand and never reuse one from documentation or from
  another deployment. Each generated value is shown to you **once** and is
  never stored anywhere it could be read back — copy it into your
  configuration immediately.

  If a secret is already set, the installer will **refuse** to replace it
  until you confirm by typing that variable's exact name. That refusal is the
  point, not an obstacle: replacing either token-encryption key makes every
  already-connected Search Console and Analytics property permanently
  unreadable, because nothing in this system can decrypt under an old key.

Then complete the installation. This is the one irreversible action. When you
confirm, the platform records the completed state in the database and deletes
the token file, and `/install` stops existing — it returns a genuine 404 from
then on, even to someone holding a valid token, and restoring the deleted
token file does not reopen it.

---

## Step 6 — Log in

Go to:

```
https://seo.example.com/login
```

Sign in with the administrator email and password you created in Step 5. The
final screen of the installer shows this URL and the email address; it does
not show the password, and it cannot.

If you cannot sign in, the two usual causes are that you are on `http://`
rather than `https://` (the session cookie is refused), or that the password
is not what you think it is. There is no way to recover the password without
working email, which is why configuring SMTP is worth doing.

---

## Step 7 — Connect Search Console and Google Analytics

Optional, but this is where most of the platform's value comes from. Both
integrations share **one** Google Cloud OAuth client.

**Start this early. The verification step below can take weeks.**

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   project.
2. Enable three APIs: **Google Search Console API**, **Google Analytics Admin
   API**, and **Google Analytics Data API**.
3. Configure the OAuth consent screen (External, unless you use Google
   Workspace and only your own organisation will connect).
4. Create an **OAuth 2.0 Client ID**, type *Web application*, and register
   **both** of these as Authorized redirect URIs:
   - `https://seo.example.com/api/gsc/callback`
   - `https://seo.example.com/api/ga4/callback`

   Google matches redirect URIs by **exact string**. A trailing slash, a
   missing `www`, or `http` instead of `https` is a mismatch, and the error
   Google returns (`redirect_uri_mismatch`) does not tell you which. Copy
   these from the installer's Google section, which has copy buttons for
   exactly this reason.
5. Put the Client ID and Client secret into your configuration, along with
   the two redirect URIs and the two encryption keys, then **restart** (or
   recreate the container).
6. In the platform, connect each property from its own screen. **The
   installer never contacts Google and never starts an authorisation flow** —
   granting access to your data is your explicit act, not something an
   installer should do on your behalf. The installer only checks that your
   configuration is internally consistent, and says so.

### Two Google realities you must plan around

> **The 7-day Testing-mode expiry.** If your OAuth consent screen is left in
> **Testing**, Google issues refresh tokens that **expire after seven days**.
> Everything will work perfectly for a week. Then every connection breaks at
> once with an `invalid_grant` error and every user has to reconnect. Move the
> consent screen to **In production** before you rely on it. This has been
> observed directly during this project's development — it is not theoretical.

> **Sensitive-scope verification has real lead time.** Search Console and
> Analytics scopes are classed by Google as *sensitive*. Publishing your
> consent screen triggers a Google review that requires a verified domain, a
> privacy policy, and often a recorded demonstration video. Turnaround is
> commonly **several weeks**, sometimes longer. Until it clears, you are
> limited to the small number of test users you list on the consent screen —
> and those users are subject to the 7-day expiry above. Submit the
> verification application as early as you can; nothing you do on your own
> server shortens it.

---

## Step 8 — Optional: local AI with Ollama

Entirely optional. Without it, every AI feature reports "AI analysis
unavailable" rather than crashing or inventing an answer. Nothing is ever
sent to a third-party AI service.

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
```

Then set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` (the exact name you pulled —
there is deliberately no default) and restart. In Docker, `localhost` means
the container itself, so use the service name or
`http://host.docker.internal:11434`.

The installer's Ollama test checks three things separately, because they fail
separately: that the server is reachable, that your model is actually
present, and that it can genuinely produce a completion. A host that is up
with the model missing looks identical to a working one if you only check
reachability. None of these outcomes blocks installation.

---

## After installation

### Reopening the installer

You cannot, and that is the design. Once complete, `/install` returns 404
permanently. The lock lives in the database, not in a file or a cookie, so it
cannot be cleared by deleting something or by redeploying. Restoring the
deleted token file does nothing.

If you genuinely need to install again — a new deployment, a rebuilt
database — install against a fresh database.

### Changing configuration later

1. Change the value: edit `.env` (traditional) or the `-e` flags / compose
   `environment:` block (Docker).
2. Restart the application — a running process will not pick it up.
3. For `NEXT_PUBLIC_APP_URL`, rebuild rather than restart.

### Backups

`scripts/backup-db.ps1` and `scripts/restore-db.ps1` are provided. Back up the
database, and back up your secrets separately — particularly
`GSC_TOKEN_ENCRYPTION_KEY` and `GA4_TOKEN_ENCRYPTION_KEY`. **A database
restored without its matching encryption keys still cannot decrypt a single
stored Google token.**

### Health monitoring

`GET /api/health` returns 200 when the application and its database are
healthy, 503 when they are not. Point your orchestrator's readiness probe or
your load balancer's health check at it.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/install` returns 404 | Installation is already complete | This is correct and permanent. Use `/login`. |
| "Invalid token" repeatedly | The application restarted and generated a new token | Fetch it again (Step 4). |
| Token page rejects everything after 5 tries | Rate limit: 5 attempts per 15 minutes | Wait 15 minutes. A *correct* token does not count against this. |
| Installer will not complete | Plain HTTP in production, or no administrator | Finish Step 3, then create the administrator. |
| Cannot stay signed in | Serving over HTTP with `NODE_ENV=production` | The session cookie is `Secure`. Use HTTPS. |
| Password-reset emails link to `localhost` | `NEXT_PUBLIC_APP_URL` is wrong | Fix it and **rebuild** — a restart is not enough. |
| Google: `redirect_uri_mismatch` | The registered URI is not a byte-for-byte match | Copy the URI from the installer's Google section and paste it into Google. |
| Google connections all broke after a week | Consent screen still in Testing | Publish the consent screen (Step 7). |
| PageSpeed audits fail | No usable Chrome/Chromium | Docker: use the supplied image. Otherwise set `PAGESPEED_CHROME_PATH`. |
| Configuration keeps reverting | A `.env` written inside a container | Move it to `-e` flags or the compose `environment:` block. |
| Registration codes never arrive | SMTP not configured | Set `EMAIL_*`. Gmail and Microsoft 365 need an **app password**. |
