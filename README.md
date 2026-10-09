# AutoScript Agent Pro

Full-stack AI agent that generates complete, runnable **test automation frameworks** for **54 tech stacks** (Selenium, Playwright, Cypress, Appium, RestAssured, Karate, Robot Framework, k6, JMeter, OWASP ZAP, low-code tools and more) — with sign-in, roles, monthly quotas, saved history and an admin panel. Runs entirely on free tiers.

## Tech stack
| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, React 19, TypeScript) |
| Styling | **Tailwind CSS v4** |
| Auth | **Better Auth** — Google, Microsoft, GitHub, email magic link, anonymous guests, admin roles |
| Database | **PostgreSQL** (free on **Neon**) via **Drizzle ORM** |
| AI | Google **Gemini** (free) — or Groq / OpenRouter / Ollama / Claude |
| Email | **Resend** (magic links) |
| Hosting / CI | **Render** (free) · **GitHub Actions** |

## Roles & limits
| Role | How you get it | New frameworks / month | Follow-ups per project | History | Admin panel |
|---|---|---|---|---|---|
| **Guest (no sign-in)** | Click Generate or "Continue as guest" | 2 (per browser **and** per IP) | 3 | — | — |
| **Guest** | Sign in with Google / Microsoft / GitHub / email | 5 | 5 | — | — |
| **Member** | An admin upgrades you | 50 | 30 | ✓ | — |
| **Demo admin** | Demo account on the sign-in page (shared, public) | 5 | 5 | ✓ | Read-only, emails masked |
| **Admin** | Your email in `ADMIN_EMAILS` | Unlimited | Unlimited | ✓ | Full: change roles, ban/unban |

- Limits reset on the 1st of each month (UTC) and can be changed with `LIMIT_*` env vars.
- When a guest signs in, what they already used carries over — signing in can't be used to reset the count.
- All limits and permissions are enforced on the server. Better Auth's own admin endpoints also reject non-admins.

---

## Deploy for free (about 30 minutes)

### 1. Free database — Neon
1. Sign up at https://neon.com (GitHub or Google login).
2. Create a project → region **AWS Asia Pacific (Singapore)** is closest to India.
3. **Connect** → copy the connection string (`postgresql://…?sslmode=require`). This is your `DATABASE_URL`.

Free plan: 0.5 GB storage; the database sleeps after 5 minutes idle and wakes on the next request.

### 2. Free AI key — Gemini
https://aistudio.google.com/apikey → **Create API key**. New keys start with `AQ.` — that's expected and supported.

### 3. Render — add the new settings BEFORE pushing
**Upgrading the existing `autoscript-agent` service** (same URL): Render → `autoscript-agent` → **Environment** → add:
   - `DATABASE_URL` — from Neon
   - `BETTER_AUTH_SECRET` — any random 40+ character string
   - `ADMIN_EMAILS` — **your** email (you become Admin the first time you sign in with it)
   - `DEMO_LOGINS` = `1` and `DEMO_PASSWORD` — e.g. `Recruiter@2026`. **This password is shown publicly** on the sign-in page for the 3 demo accounts, so never reuse a real password.
   - Keep `GEMINI_API_KEY` and `AI_PROVIDER`. `APP_PASSWORD` is no longer used — you can delete it.
   - Leave Google / Microsoft / GitHub / Resend empty for now.

   Click **Save** (choose *Save only*, not deploy).

**Brand-new deployment instead:** Render → **New → Blueprint** → pick the repo and fill in the same values when asked.

### 4. Push to GitHub
```
git add -A
git status            # .env and .env.local must NOT be listed
git commit -m "Full-stack upgrade: Next.js, sign-in, roles, quotas, admin"
git push
```
Render rebuilds automatically (3–6 minutes); the build runs the database migrations. Then check `https://<your-url>/api/health` → `{"ok":true,"database":"ok",...}`.

### 5. First admin sign-in (no OAuth setup needed)
Until Resend is set up, magic-link emails are **printed to the server log** instead of sent:
1. Open your app → **Sign in** → enter the email you put in `ADMIN_EMAILS` → **Email me a link**.
2. Render → your service → **Logs** → find `🔗 Magic link for you@…` → open that link.
3. You're signed in as **Admin** — the **Admin** tab appears.

### 6. Add Google / Microsoft / GitHub sign-in
For each provider, the **callback / redirect URL** is `https://<your-url>/api/auth/callback/<provider>`.
After adding the IDs/secrets in Render → **Environment**, click **Save, rebuild and deploy**; the button appears on the sign-in page automatically.

**Google**
1. https://console.cloud.google.com → create a project.
2. **Google Auth Platform → Branding**: app name, support email → save. **Audience**: External.
3. **Clients → Create client** → *Web application*.
   - Authorized JavaScript origin: `https://<your-url>`
   - Authorized redirect URI: `https://<your-url>/api/auth/callback/google`
4. Copy into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. While the app is in *Testing*, add your users under **Audience → Test users**, or click **Publish app**.

**Microsoft (personal + work accounts)**
1. https://entra.microsoft.com → **App registrations → New registration**.
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Web**, `https://<your-url>/api/auth/callback/microsoft`.
4. Copy **Application (client) ID** → `MICROSOFT_CLIENT_ID`.
5. **Certificates & secrets → New client secret** → copy the **Value** → `MICROSOFT_CLIENT_SECRET`. (Secrets expire — note the date.)
6. Keep `MICROSOFT_TENANT_ID=common`.

**GitHub**
1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Homepage URL: `https://<your-url>` · Callback URL: `https://<your-url>/api/auth/callback/github`.
3. Copy Client ID → `GITHUB_CLIENT_ID`; **Generate a new client secret** → `GITHUB_CLIENT_SECRET`.

### 7. Real magic-link emails (optional) — Resend
1. https://resend.com → **API Keys** → create → `RESEND_API_KEY`.
2. With the default sender `onboarding@resend.dev`, Resend only delivers to **your own** account email. To email anyone, verify a domain you own at resend.com/domains and set `EMAIL_FROM=AutoScript Agent <login@yourdomain.com>`.

---

## Sign-in page
Visitors land on `/login`; the generator, History and Admin need a session. Options shown:
- **Continue with Google / Microsoft / GitHub** — greyed out until you add that provider's keys.
- **Email + password** — only the demo accounts have passwords (public sign-up is off).
- **Email me a sign-in link** — anyone; new accounts start as Guest.
- **Demo accounts for recruiters** — `demo-admin@autoscript.demo` (read-only admin), `demo-member@autoscript.demo`, `demo-guest@autoscript.demo`, all with `DEMO_PASSWORD`. Created automatically; any change a visitor makes to them is reset on the next restart.
- **Continue as guest** — no sign-in, 2 frameworks/month.

## Managing users
Admin tab → change a user's role (Guest → Member, etc.) or ban them. Banning signs the user out everywhere. You can't change your own role (prevents locking yourself out), and demo accounts are fixed by configuration.

## Run locally
```
cp .env.example .env.local      # fill DATABASE_URL, BETTER_AUTH_SECRET, GEMINI_API_KEY, ADMIN_EMAILS (a .env file works too)
npm install
npm run db:migrate
npm run dev                     # http://localhost:3000
```
Set `MOCK_MODE=1` to try everything without calling the AI. Local Postgres or a Neon dev branch both work.

## Project layout
```
src/app/                 pages (/, /login, /history, /admin) and API routes
src/app/api/generate     streaming generation + quota enforcement
src/app/api/admin/users  admin user list, role changes, bans
src/lib/auth.ts          Better Auth config (providers, roles, anonymous, magic link)
src/lib/permissions.ts   role definitions (admin, demo_admin, member, guest)
src/lib/quota.ts         monthly limits and usage counting
src/lib/ai.ts            AI providers (Gemini native, OpenAI-compatible, Claude, mock)
src/db/                  Drizzle schema; migrations in /drizzle
render.yaml              Render blueprint · .github/workflows/ci.yml  CI
```

## Notes
- Render free web services sleep after 15 minutes idle; the first request then takes ~50 s.
- Demo accounts are shared by all visitors (and so is their quota and history) — turn them off with `DEMO_LOGINS=0`.
- On Gemini's free tier, prompts may be used by Google to improve its products — don't paste confidential code.
- Change the database schema in `src/db/schema.ts`, then `npm run db:generate` and commit the new file in `/drizzle`.
