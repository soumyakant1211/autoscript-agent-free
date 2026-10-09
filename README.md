# AutoScript Agent — 100% free setup

An AI agent that generates complete, runnable **test automation frameworks** for **54 tech stacks** — Java, TypeScript/JavaScript, Python, C#, native mobile, low-code tools, performance and security.

Everything in this guide is free: free AI model, free hosting, no paid plans.

**UI features**
- 🔽 Grouped stack dropdown with search (★ = stacks added beyond the original 41)
- ✅ Feature chips that adapt to the stack type (UI / API / mobile / perf / security / low-code)
- ⚡ Live streaming — files appear in the explorer as the agent writes them
- 💬 Chat to refine ("add a negative login test", "switch to Extent reports")
- 📄 Syntax-highlighted viewer, copy-file, **Download ZIP**

---

## Step 1 — Get a free AI key (pick one)

| Provider | Cost | Card needed? | Best for | Set in `.env` |
|---|---|---|---|---|
| **Google Gemini** (default) | Free tier | No | Best free quality, large output | `AI_PROVIDER=gemini`, `GEMINI_API_KEY=` |
| **Groq** | Free tier | No | Very fast, but small output (~6k tokens) — good for small frameworks / chat edits | `AI_PROVIDER=groq`, `GROQ_API_KEY=` |
| **OpenRouter** | Free models | No | Many free models (names ending in `:free`) | `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY=`, `AI_MODEL=<model>:free` |
| **Ollama** | Free forever, unlimited | No account | Runs on your own PC, works offline. Needs ~8 GB+ RAM | `AI_PROVIDER=ollama` |

**Gemini (recommended):** go to https://aistudio.google.com/apikey → sign in with Google → *Create API key* → copy it.

Free-tier notes:
- Free tiers have per-minute and per-day request limits. If you hit one, the app shows "rate limit reached" — wait a minute and retry. Your exact limits are shown in AI Studio / Groq console.
- On Google's free tier, prompts may be used to improve Google's products. Don't paste confidential company code or credentials into the description.

**Ollama (fully offline):** install from https://ollama.com, then `ollama pull qwen2.5-coder:7b` (or `:14b` if you have 16 GB+ RAM). Ollama only works when the app runs on the same PC (or a machine you own) — not on free cloud hosting.

## Step 2 — Run it on your PC

Install Node.js 20+ from https://nodejs.org, then:
```bash
cd autoscript-agent
cp .env.example .env        # Windows: copy .env.example .env   → then paste your key into .env
npm install
npm start                   # open http://localhost:8080
```
Want to see the UI without any key? `MOCK_MODE=1 npm start` (Windows PowerShell: `$env:MOCK_MODE=1; npm start`).

## Step 3 — Get a free live URL

### Option A — Render (free forever, easiest, HTTPS included)
1. Push this folder to a **GitHub** repo (free).
2. Sign up at https://render.com with GitHub.
3. **New → Blueprint** → select your repo. Render reads `render.yaml`.
4. When asked, paste your `GEMINI_API_KEY` and choose an `APP_PASSWORD`.
5. After the build you get a URL like `https://autoscript-agent.onrender.com`.

Limits: the free service sleeps after 15 minutes without visitors; the first visit after that takes about a minute to wake up. 750 free hours/month (enough to run one app all month).

### Option B — AWS EC2 on the AWS Free plan (real AWS experience, $0)
New AWS accounts can choose the **Free plan**: it comes with free credits and AWS does **not** charge your card — the account simply stops when the free period (6 months) or credits end, unless you choose to upgrade. When signing up, **choose "Free plan", not "Paid plan".**

1. Push the code to GitHub (public repo is simplest; for private, use a deploy key).
2. Edit `deploy/ec2-setup.sh`: set `REPO_URL`, your `GEMINI_API_KEY`, and an `APP_PASSWORD`.
3. AWS Console → region **Asia Pacific (Mumbai)** → **EC2 → Launch instance**:
   - Name: `autoscript-agent`
   - AMI: **Amazon Linux 2023**
   - Instance type: one marked **"Free tier eligible"** (e.g. t3.micro)
   - Key pair: create one (to SSH later)
   - Network: allow **SSH (port 22) from My IP** and **HTTP (port 80) from Anywhere**
   - Storage: keep the default
   - Advanced details → **User data**: paste the whole contents of `deploy/ec2-setup.sh`
4. Launch, wait ~3–4 minutes, copy the instance's **Public IPv4 address**, open `http://<that-IP>/`.
5. To update after you push new code: SSH in and run `sudo bash /opt/autoscript-agent/deploy/update.sh`.

Staying at $0 on AWS:
- Run only **one** small instance. Don't create load balancers, NAT gateways or Elastic IPs (they eat credits).
- Set a **Budget alert** (Billing → Budgets → "Zero spend budget") so you get an email if anything costs money.
- **Stop** the instance when you don't need it.
- Free HTTPS on EC2: get a free subdomain (e.g. from DuckDNS) pointing to your IP and put Caddy in front, or use Option A/C which include HTTPS.

### Option C — Your PC + free tunnel (instant public URL, uses Ollama if you like)
Run the app locally (Step 2), then:
```bash
cloudflared tunnel --url http://localhost:8080
```
Install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ — no account needed for quick tunnels. It prints a public `https://….trycloudflare.com` URL that works while your PC is on. This is the only way to share an Ollama-powered (fully unlimited) agent for free.

### Which should I pick?
- Want a permanent link to share/show in interviews → **Render**.
- Want AWS on your résumé → **EC2 Free plan** (works 6 months).
- Want unlimited AI with no quotas → **Ollama on your PC + Cloudflare tunnel**.

## CI/CD (free)
`.github/workflows/ci.yml` runs a smoke test on every push (GitHub Actions is free for public repos). Render redeploys automatically on every push to `main`.

## Configuration reference
| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini`, `groq`, `openrouter`, `ollama` (or `anthropic`, paid) |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | — | Key for the chosen provider |
| `AI_MODEL` | provider default (`gemini-3.8-flash`, `openai/gpt-oss-120b`, `qwen2.5-coder:7b`) | Override the model |
| `MAX_TOKENS` | provider default | Max output per generation; big frameworks may need "Continue generating" |
| `APP_PASSWORD` | empty | **Set it on any public URL** so strangers can't use up your free quota |
| `RATE_LIMIT_PER_HOUR` | `30` | Generations per visitor IP per hour |
| `MOCK_MODE` | off | `1` = canned responses, no AI calls |

## Stacks added to your list (★)
Java + RestAssured + Cucumber · Java + Selenide + JUnit 5 · TS + Playwright + Cucumber · TS + WebdriverIO + Appium · TS + Detox · TS + Pact · Python + pytest-bdd + Playwright · Python + Schemathesis · C# + Appium + NUnit · Maestro · Kotlin + Espresso · Swift + XCUITest · Artillery. Edit `stacks.json` to add more.

## Project layout
```
server.js            Express API: /api/stacks, /api/generate (streaming), /health; provider switch
stacks.json          All 54 stacks + guidance given to the agent
public/              UI (index.html, styles.css, app.js)
Dockerfile           Container (used by EC2 option)
render.yaml          Render free-tier blueprint
deploy/              EC2 setup + update scripts
.github/workflows/   Free CI smoke test
```

## Tips for best results on free models
- Free models write less per reply than paid ones. If a project stops midway, click **↪ Continue generating**.
- Be specific in the description (pages, flows, endpoints, test data), and select only the features you need — fewer features = complete output in one go.
