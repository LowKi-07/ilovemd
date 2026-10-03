# Deploying ilovemd to your GoDaddy domain

ilovemd is a Node.js server, so it needs a host that runs Node. A GoDaddy
**domain** on its own can't run it. There are two ways to get it live:

| | Option A: Render + GoDaddy DNS (recommended) | Option B: GoDaddy cPanel hosting |
|---|---|---|
| You need | The GoDaddy domain you already have | A GoDaddy **Web Hosting (cPanel, Linux)** plan that shows **Setup Node.js App** |
| Cost | Free tier (sleeps when idle) or ~$7/month always-on | Your hosting plan |
| Deploys | Automatically on every `git push` | Manual pull + restart in cPanel |
| HTTPS | Automatic | Via cPanel AutoSSL |

Whichever you pick, first get the AI key in step 0.

---

## 0. Get a Gemini API key

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account.
2. **Create API key**, then copy it. This is your `GEMINI_API_KEY`.
3. In Google Cloud console > Billing, set a **budget alert** on the project. The
   server's own limits (`ILOVEMD_RATE_LIMIT_PER_HOUR`, `ILOVEMD_MAX_CALLS_PER_DAY`)
   are courtesy limits, not a spending cap.

To use Grok instead, set `ILOVEMD_AI_PROVIDER=grok` and `XAI_API_KEY` (from
<https://console.x.ai>). OpenAI is `openai` + `OPENAI_API_KEY`. See
[.env.example](.env.example) for every setting.

Also pick:
- `ILOVEMD_GATE_PASSWORD`: the password visitors type to get in
- `ILOVEMD_SESSION_SECRET`: a long random string. To make one, run `openssl rand -hex 32`

---

## Option A: Render + GoDaddy DNS (recommended)

### A1. Create the service on Render

1. Sign up at <https://render.com> with your GitHub account.
2. **New > Blueprint**, then pick the `LowKi-07/ilovemd` repository. Render reads
   [render.yaml](render.yaml) and sets up the service. It asks for the two
   secrets: `ILOVEMD_GATE_PASSWORD` and `GEMINI_API_KEY`.
   - Use the **Free** plan to try it out. Change `plan: starter` in `render.yaml`
     to `plan: free` first, or pick the plan in the dashboard.
3. Wait for the deploy to go green, then open the `https://ilovemd-xxxx.onrender.com`
   URL. You should see the login page.

### A2. Point your GoDaddy domain at it

1. Render: open the service > **Settings > Custom Domains > Add**. Add both
   `yourdomain.com` and `www.yourdomain.com`. Render shows the DNS records it wants.
2. GoDaddy: **My Products > your domain > DNS > Manage DNS**.
   - **www**: edit (or add) the `CNAME` record named `www` so its value is
     `ilovemd-xxxx.onrender.com`.
   - **Root domain** (`@`): GoDaddy can't CNAME the root. Edit the `A` record
     named `@` so it points to the IP Render shows (currently `216.24.57.1`).
     Delete any other `A` record for `@`, including GoDaddy's "Parked" one.
   - If GoDaddy **Domain Forwarding** is switched on, turn it off.
3. Back in Render, click **Verify**. DNS can take from a few minutes to a few hours.
   Render then issues the HTTPS certificate on its own.

From then on, every `git push` to `main` redeploys automatically.

> Free-tier note: the service sleeps after 15 minutes idle, so the first visit
> afterwards takes about 30 to 50 seconds. Uploaded kits and saved documents
> are wiped on each redeploy. That's fine for a demo. Starter keeps it awake.

---

## Option B: GoDaddy cPanel hosting

Only if your plan has **cPanel > Software > Setup Node.js App**. If you don't
see it, your plan can't run Node, so use Option A.

1. **cPanel > Git Version Control > Create**. Clone URL
   `https://github.com/LowKi-07/ilovemd.git`, repository path e.g. `ilovemd`.
2. **cPanel > Setup Node.js App > Create Application**
   - Node.js version: **18 or newer**
   - Application mode: Production
   - Application root: `ilovemd`
   - Application URL: your domain
   - Application startup file: `app.cjs`
3. In the same screen, under **Environment variables**, add:
   `ILOVEMD_MODE=public`, `ILOVEMD_GATE_PASSWORD`, `ILOVEMD_SESSION_SECRET`,
   `ILOVEMD_AI_PROVIDER=gemini`, `GEMINI_API_KEY`. Leave `PORT` and `HOST` unset,
   because Passenger handles them.
4. Click **Run NPM Install**, then **Restart**.
5. **cPanel > SSL/TLS Status > Run AutoSSL** for HTTPS.
6. If the domain is registered at GoDaddy and the hosting is GoDaddy too, DNS is
   already correct. Otherwise point the `@` A record at the hosting IP shown in
   cPanel.

To update later: **Git Version Control > Manage > Pull or Deploy > Update from
Remote**, then **Restart** in Setup Node.js App.

---

## Checking it worked

- `https://yourdomain.com` redirects to `/login`. Enter the gate password.
- The server log's `ai` line names the provider, e.g. `Gemini via gemini - gemini-2.5-flash`.
- Text mode: type a prompt. If AI fails, the error says which key or setting is
  missing.
