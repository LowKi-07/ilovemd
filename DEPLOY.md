# Deploying ilovemd to your GoDaddy domain

ilovemd is a Node.js server, so it needs a host that runs Node. A GoDaddy
**domain** on its own can't run it. There are two ways to get it live:

| | Option A: Render + GoDaddy DNS (recommended) | Option B: GoDaddy cPanel hosting |
|---|---|---|
| You need | The GoDaddy domain you already have | A GoDaddy **Web Hosting (cPanel, Linux)** plan that shows **Setup Node.js App** |
| Cost | ~$7/month + $0.25/GB disk (Starter). Free tier works but resets visitors' files on each deploy | Your hosting plan |
| Deploys | Automatically on every `git push` | Manual pull + restart in cPanel |
| HTTPS | Automatic | Via cPanel AutoSSL |

The site is **open to everyone** by default: no login. Each visitor gets an
anonymous ID in a cookie and their own private folder, so nobody sees anyone
else's files. Setting `ILOVEMD_GATE_PASSWORD` turns the shared password back on.

---

## 0. Before you start

1. **Gemini key.** Go to <https://aistudio.google.com/apikey>, then **Create API
   key**. This is your `GEMINI_API_KEY`.
2. **Spending cap. Do this before going live.** In Google Cloud console, open
   **Billing > Budgets & alerts** for the key's project and set a budget. The
   server's own limits slow abuse down, but the cap on the key is the only
   thing that hard-stops spending.
3. **Session secret** (`ILOVEMD_SESSION_SECRET`). A long random string that signs
   visitor cookies. Render creates one for you. For cPanel, run `openssl rand -hex 32`
   and use the output.

To use Grok instead, set `ILOVEMD_AI_PROVIDER=grok` and `XAI_API_KEY`. OpenAI uses
`openai` + `OPENAI_API_KEY`. Every setting is listed in [.env.example](.env.example).

---

## Option A: Render + GoDaddy DNS (recommended)

### A1. Create the service

1. Sign up at <https://render.com> with your GitHub account.
2. **New > Blueprint**, then pick `LowKi-07/ilovemd`. Render reads
   [render.yaml](render.yaml): a Starter web service with a 1 GB disk at
   `/var/data` for visitors' files. It asks once for `GEMINI_API_KEY`.
   - To try it free first: in `render.yaml`, set `plan: free` and delete the
     `disk:` block and the `ILOVEMD_DATA_DIR` entry. Everything works, but
     visitors' saved files reset on each deploy, and the site sleeps when idle.
3. When the deploy is green, open the `https://ilovemd-xxxx.onrender.com` URL.
   The homepage should load straight away, with no login.

### A2. Point your GoDaddy domain at it

1. Render: open the service > **Settings > Custom Domains > Add**. Add both
   `yourdomain.com` and `www.yourdomain.com`.
2. GoDaddy: **My Products > your domain > DNS > Manage DNS**.
   - **www**: set the `CNAME` record named `www` to `ilovemd-xxxx.onrender.com`.
   - **Root domain** (`@`): set the `A` record named `@` to the IP Render shows
     (currently `216.24.57.1`). Delete any other `@` A record, including
     GoDaddy's "Parked" one.
   - If GoDaddy **Domain Forwarding** is on, turn it off.
3. In Render, click **Verify**. DNS takes minutes to a few hours, then Render
   issues the HTTPS certificate on its own.

From then on, every `git push` to `main` redeploys.

---

## Option B: GoDaddy cPanel hosting

Only if your plan has **cPanel > Software > Setup Node.js App**. If it doesn't,
use Option A.

1. **cPanel > Git Version Control > Create**. Clone
   `https://github.com/LowKi-07/ilovemd.git` into e.g. `ilovemd`.
2. **cPanel > Setup Node.js App > Create Application**: Node.js **18+**,
   Production mode, application root `ilovemd`, your domain as the URL, and
   startup file `app.cjs`.
3. **Environment variables**: `ILOVEMD_MODE=public`, `ILOVEMD_SESSION_SECRET`,
   `ILOVEMD_AI_PROVIDER=gemini`, `GEMINI_API_KEY`. Leave `PORT`/`HOST` unset;
   Passenger handles them.
4. **Run NPM Install**, then **Restart**.
5. **SSL/TLS Status > Run AutoSSL** for HTTPS.

To update later: **Git Version Control > Manage > Pull or Deploy > Update from
Remote**, then **Restart**.

---

## Checking it worked

- `https://yourdomain.com/healthz` returns `{"ok":true,...}`.
- The server log shows `access open to everyone`, the AI provider line, and
  the limits in force.
- Generate something in Text mode. If AI fails, the message says which key or
  setting is missing.

---

## Scaling later, without a rewrite

The code keeps each concern behind one module, so growing means swapping that
module, not rewriting routes:

| When | What to change | Where |
|---|---|---|
| AI bill or quality | Switch provider or model with an env var | `ILOVEMD_AI_PROVIDER`, `ILOVEMD_AI_MODEL` (`ai/`) |
| More traffic on one server | Bigger Render plan; raise `ILOVEMD_MAX_CONCURRENT_AI` | Settings only |
| Need 2+ servers | Add a Redis-backed store to the limiter (same `take()` call), move visitor files to object storage (S3 / R2), drop the disk | `platform/limits.mjs`, `platform/userdata.mjs` |
| Real accounts | Sign-in that returns a user ID from `identify()`. Folders, limits and routes already key off that ID | `platform/identity.mjs` |
| Paid plans | Different limits per user tier, read where `runAI()` applies them | `server.mjs` `runAI()` |

One server with the current setup handles a lot: the server mostly waits on the
AI API, and the real ceiling is your AI rate limits and budget. The step to two
or more servers is the first one that needs code, and only in those two
`platform/` files.
