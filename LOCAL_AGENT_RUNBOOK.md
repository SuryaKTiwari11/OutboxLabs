# Local Agent Runbook

Use this file as the execution instruction for an agent that needs to run and
verify ReachInbox locally. Do not run deployment or destructive database
commands against production.

## Objective

Start the local PostgreSQL and Redis dependencies with Docker, optionally start
local Elasticsearch, configure the backend from a local environment file,
validate Ethereal SMTP independently, build and test the backend, and report
the first failing step with its complete error.

Render's Free plan blocks outbound SMTP ports `25`, `465`, and `587`. That is a
Render networking restriction, not a Docker or Ethereal failure. Local Docker
should be able to reach Ethereal on port `587` through the host network.

## Safety rules

- Work only in this repository.
- Never print, commit, or include `ETHEREAL_PASS`, OAuth secrets, API keys,
  `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, or `ENCRYPTION_KEY` in a
  report.
- Do not rotate credentials automatically.
- Do not mark an email `SENT` manually.
- Do not delete Docker volumes unless explicitly requested.
- Do not use the Render Free deployment to validate local SMTP behavior.

## Prerequisites

Required:

- Docker Desktop running
- Node.js and npm
- A local `backend/.env` copied from `backend/.env.example`
- Ethereal credentials in `backend/.env`, or permission to use a newly
  generated test account

Optional:

- Google OAuth credentials for browser login
- Slack OAuth credentials
- Elasticsearch local profile

## Execution steps

Run these commands from the repository root in PowerShell.

### 1. Check tools and repository state

```powershell
docker version
docker compose version
node --version
npm --version
git status --short
```

If Docker is unavailable, stop and report that Docker Desktop must be started.
Do not modify unrelated worktree files.

### 2. Create local configuration

```powershell
if (-not (Test-Path backend\.env)) {
  Copy-Item backend\.env.example backend\.env
}
```

Set these local values in `backend/.env`:

```env
NODE_ENV=development
DATABASE_URL="postgresql://reachinbox:reachinbox_secret@localhost:5432/reachinbox_db?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_URL=http://localhost:9200
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
SMTP_TIMEOUT_MS=30000
```

Add valid `ETHEREAL_USER` and `ETHEREAL_PASS` locally. Never put those values
in this runbook or any tracked file.

### 3. Start local dependencies

Core services:

```powershell
docker compose up -d postgres redis
docker compose ps
```

Optional Elasticsearch:

```powershell
docker compose --profile search up -d elasticsearch
docker compose ps
```

Wait until PostgreSQL and Redis report healthy before continuing. If
Elasticsearch is not started, the application should use its documented
PostgreSQL fallback.

### 4. Install and prepare the backend

```powershell
Set-Location backend
npm install
npx prisma generate
npx prisma db push
```

Do not use `prisma migrate reset`, `docker compose down -v`, or any command that
removes local data unless the user explicitly requests a reset.

### 5. Test Ethereal from the local host

Run a safe SMTP verification using the credentials already present in the
process environment. The output must redact the password:

```powershell
node -e "require('dotenv').config(); const nodemailer=require('nodemailer'); const t=nodemailer.createTransport({host:process.env.ETHEREAL_HOST,port:Number(process.env.ETHEREAL_PORT||587),secure:false,auth:{user:process.env.ETHEREAL_USER,pass:process.env.ETHEREAL_PASS},connectionTimeout:30000,greetingTimeout:30000,socketTimeout:30000}); t.verify().then(()=>{console.log('Ethereal SMTP verification succeeded'); t.close()}).catch(e=>{console.error({message:e.message,code:e.code,responseCode:e.responseCode,command:e.command,response:e.response}); process.exitCode=1})"
```

Expected result:

```text
Ethereal SMTP verification succeeded
```

If this fails, classify the failure as DNS, TCP, TLS, or authentication from
the reported `code`, `command`, and `responseCode`. Do not change ports
blindly; Ethereal documents port `587` with STARTTLS.

### 6. Build and test

From `backend`:

```powershell
npm run build
npm run typecheck
npm test -- --runInBand
```

All commands must pass. If Jest reports a temporary cache permission error,
rerun the same test command once with the environment's required permissions
and report both results.

### 7. Start the local application

Use separate terminals:

```powershell
# Terminal 1
Set-Location backend
npm run dev
```

```powershell
# Terminal 2
Set-Location backend
npm run dev:worker
```

Verify:

```powershell
curl.exe -i http://localhost:4000/health
curl.exe -i http://localhost:4000/metrics
```

Expected health response is HTTP `200` with `"status":"ok"`.

### 8. Functional email verification

Use the frontend or an authenticated local API flow to schedule one email for
the near future. Then verify all of the following:

1. BullMQ shows the job as delayed, waiting, active, and completed.
2. Worker logs show DNS, TCP, transport verification, and SMTP acceptance.
3. PostgreSQL changes the email to `SENT` only after SMTP acceptance.
4. An Ethereal preview URL is returned or stored.
5. The outbox event becomes `PUBLISHED`.
6. No duplicate job or duplicate delivery attempt is created.
7. A deliberately unreachable SMTP host produces a meaningful failed job and
   does not mark the email as `SENT`.

Never use a real recipient address for an Ethereal test; Ethereal captures
messages and does not deliver them to real inboxes.

## Final report format

Report:

- Commands executed
- Pass/fail result for Docker, PostgreSQL, Redis, Elasticsearch, SMTP, build,
  typecheck, and tests
- SMTP host, port, secure mode, and timeout only
- SMTP error classification if a check failed
- BullMQ and database state for the test email
- Any required manual action

Do not report secret values.

