# ReachInbox Email Job Scheduler

ReachInbox is a TypeScript full-stack email scheduling platform built for the
Outbox Labs assignment. It accepts individual or CSV-based campaigns, stores
email state in PostgreSQL, schedules delivery with BullMQ delayed jobs, sends
through Ethereal SMTP, and provides a React dashboard and Bull Board queue
monitor.

The implementation is designed for **effectively-once processing**. SMTP,
PostgreSQL, and Redis cannot participate in one atomic transaction, so the
SMTP acceptance ambiguity window is documented instead of claiming impossible
exactly-once delivery.

## Architecture

The high-level design is also available in [`HLD.excalidraw`](./HLD.excalidraw).

```text
Browser / React + Vite
        |
        | REST + HTTP-only JWT cookie
        v
Express API
        |
        +--> PostgreSQL + Prisma
        |      users, senders, campaigns, emails, attempts, outbox events
        |
        +--> OutboxEvent (same PostgreSQL transaction as ScheduledEmail)
                       |
                       v
              Continuous outbox dispatcher
                       |
                       v
                 Redis + BullMQ
                 |       |       |
                 |       |       +--> notification-jobs --> Slack Web API
                 |       +----------> indexing-jobs -----> Elasticsearch
                 +------------------> email-jobs --------> Email worker
                                                           |
                                                           v
                                                   Ethereal SMTP
```

### Request and delivery flow

1. The authenticated client calls `POST /api/emails/schedule` or
   `POST /api/emails/bulk-schedule`.
2. PostgreSQL commits the `ScheduledEmail` and `OutboxEvent` together.
3. The outbox dispatcher publishes the event to a deterministic BullMQ job.
4. Redis persists the delayed job until `scheduledAt`.
5. The email worker checks current database state and skips `SENT` or
   `CANCELLED` records.
6. Redis Lua atomically reserves the sender's hourly quota.
7. If quota is unavailable, the job is delayed into the next hourly window and
   a deduplicated Slack notification is queued.
8. The worker applies `MIN_EMAIL_DELAY_MS`, sends through sender-specific SMTP,
   records the attempt, and updates PostgreSQL.
9. Indexing is asynchronous. Search uses Elasticsearch when ready and
   PostgreSQL fallback when it is unavailable.

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | TypeScript, Express.js, Zod |
| Persistence | PostgreSQL, Prisma |
| Scheduling | BullMQ, Redis |
| Delivery | Nodemailer, Ethereal SMTP |
| Search | Elasticsearch/Elastic Cloud, PostgreSQL fallback |
| Authentication | Google OAuth, Passport, JWT HTTP-only cookie |
| Notifications | Slack OAuth, Slack Web API |
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Client state | TanStack Query, Axios |
| Monitoring | Prometheus metrics, Bull Board |
| Local infrastructure | Docker Compose |

## Prerequisites

- Node.js 18+
- pnpm 8+
- Docker Desktop
- Google OAuth credentials for real Google login
- Slack OAuth credentials for Slack notifications
- Optional Elastic Cloud/API key or local Elasticsearch

## Local Setup

### 1. Configure environment

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
```

Set secrets in `backend/.env`. Never commit `.env` files.

### 2. Start PostgreSQL and Redis

```powershell
docker compose up -d postgres redis
```

The normal application does not require Elasticsearch because PostgreSQL
search fallback remains available.

### 3. Optional local Elasticsearch

Elasticsearch is intentionally an opt-in profile because it is substantially
larger than PostgreSQL or Redis:

```powershell
docker compose --profile search up -d
```

Then use:

```env
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_API_KEY=
```

### 4. Prepare the backend

```powershell
Set-Location backend
pnpm install
pnpm db:generate
pnpm db:migrate
```

### 5. Start the API

```powershell
pnpm dev
```

Default API: `http://localhost:4000`

### 6. Start the BullMQ worker separately

```powershell
Set-Location backend
pnpm dev:worker
```

The worker starts email delivery, indexing, notification, and outbox
dispatcher processes. The API and worker must both be running for complete
delivery behavior.

### 7. Start the frontend

```powershell
Set-Location frontend
pnpm install
pnpm dev
```

Default frontend: `http://localhost:5173`

## Environment Variables

Important backend variables:

```env
DATABASE_URL=postgresql://reachinbox:reachinbox_secret@localhost:5432/reachinbox_db
REDIS_URL=
REDIS_HOST=localhost
REDIS_PORT=6379

FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/callback
SLACK_BOT_TOKEN=
SLACK_DEFAULT_CHANNEL=general

JWT_SECRET=replace-with-a-long-random-secret
ENCRYPTION_KEY=64-hex-characters

ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_API_KEY=
ELASTICSEARCH_INDEX_EMAILS=emails

WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200

BULL_BOARD_USERNAME=admin
BULL_BOARD_PASSWORD=admin_secret
```

### Ethereal Email

Ethereal is a safe fake SMTP provider. It accepts SMTP messages and provides a
browser preview without delivering mail to real inboxes.

The application can create an Ethereal account through the sender provisioning
flow, or use:

```env
ETHEREAL_USER=
ETHEREAL_PASS=
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
```

The dashboard sender selector supports multiple sender accounts. After
successful delivery, the email detail page shows the SMTP message ID and
Ethereal preview URL.

### Google OAuth

In Google Cloud Console, create a Web OAuth client and add:

```text
http://localhost:4000/api/auth/google/callback
```

For production, add the deployed backend callback:

```text
https://outboxlabs-odvu.onrender.com/api/auth/google/callback
```

The frontend does not receive Google secrets. The backend exchanges the code,
persists the user, and sets the HTTP-only JWT cookie.

### Slack OAuth

Create a Slack app and add the callback:

```text
http://localhost:4000/api/slack/callback
```

Request the scopes required to post messages, then configure the client ID and
secret. Slack tokens are encrypted before storage. If Slack is disconnected,
email scheduling and delivery continue normally.

### Elastic Cloud

Elastic Cloud can be used instead of local Docker Elasticsearch:

```env
ELASTICSEARCH_URL=https://your-deployment.es.us-east-1.aws.elastic.cloud
ELASTICSEARCH_API_KEY=rotated-api-key
```

Use an API key with access to the `emails` index. Never put this value in
frontend variables or source control. Elastic Cloud free trials and quotas are
provider-dependent; PostgreSQL fallback keeps the application functional if
the service is unavailable.

## Bull Board

Open:

```text
http://localhost:4000/admin/queues
```

Authenticate with `BULL_BOARD_USERNAME` and `BULL_BOARD_PASSWORD`.

The dashboard frontend includes a **BullMQ Board** button that opens this URL
in a new tab. The browser will show the HTTP Basic Auth prompt. Bull Board
credentials must remain backend/deployment secrets; putting them in
`VITE_*` variables would expose them to every visitor.

Queues:

| Queue | Purpose |
|---|---|
| `email-jobs` | Delayed SMTP delivery |
| `indexing-jobs` | Elasticsearch indexing/status updates |
| `notification-jobs` | Slack rate-limit alerts |
| `email-dlq` | Terminal delivery failures |

Use the dashboard root and select a queue/status tab. Internal Bull Board
paths such as `/queue/email-jobs?status=completed` are not stable REST API
endpoints.

## Feature-to-Requirement Mapping

### Backend requirements

| Assignment requirement | Implemented solution | Evidence |
|---|---|---|
| Schedule at a specific time | BullMQ delayed job with `delay = scheduledAt - now` | `backend/src/queues/emailQueue.ts` |
| No cron | Redis/BullMQ delayed sets plus continuous outbox polling | `backend/src/workers/outboxDispatcher.ts` |
| Relational persistence | Prisma models for users, senders, campaigns, emails, attempts, Slack, outbox | `backend/prisma/schema.prisma` |
| Multiple senders | Sender ownership validation and sender-specific SMTP credentials | `backend/src/integrations/smtp.ts` |
| Ethereal SMTP | Nodemailer transport, message ID, preview URL | `backend/src/integrations/smtp.ts` |
| Restart persistence | Redis AOF plus transactional outbox and startup reconciliation | `backend/src/services/outboxService.ts`, `backend/src/services/emailService.ts` |
| Transactional DB/queue gap | Email and outbox event commit atomically; dispatcher publishes later | `backend/src/services/outboxService.ts` |
| Duplicate scheduling | Unique deterministic idempotency key and deterministic BullMQ job ID | `backend/src/utils/idempotency.ts`, schema |
| Duplicate processing | Fresh DB status check skips sent/cancelled records | `backend/src/workers/emailProcessor.ts` |
| Worker concurrency | Configurable BullMQ worker concurrency | `WORKER_CONCURRENCY`, `backend/src/workers/index.ts` |
| Minimum send delay | Configurable worker delay and BullMQ limiter | `MIN_EMAIL_DELAY_MS` |
| Hourly quota | Atomic Redis Lua counter per sender/hour | `backend/src/services/rateLimitService.ts` |
| Campaign quota | Campaign `hourlyLimit` is persisted and passed to worker reservation | `EmailCampaign.hourlyLimit` |
| Quota overflow | Job is rescheduled to the next hourly window, never discarded | `backend/src/workers/emailProcessor.ts` |
| Slack alert | Real Slack Web API call through notification queue | `backend/src/integrations/slack.ts` |
| Slack deduplication | Redis `SET NX EX` atomic notification-window claim | `backend/src/integrations/slack.ts` |
| Retry | Five attempts with exponential backoff | `backend/src/queues/emailQueue.ts` |
| DLQ | Terminal SMTP failure copied to retained `email-dlq` | `backend/src/queues/emailQueue.ts` |
| Search indexing | Async indexing queue and worker | `backend/src/workers/indexingWorker.ts` |
| Search resilience | Elasticsearch first, PostgreSQL search fallback | `backend/src/services/emailService.ts` |
| Queue monitoring | Protected Bull Board dashboard | `backend/src/app.ts` |
| Observability | Prometheus counters, latency histograms, health endpoint | `/metrics`, `/health` |

### Frontend requirements

| Assignment requirement | Implemented solution |
|---|---|
| Google login | Real Google OAuth initiation and callback |
| Demo login | `POST /api/auth/dev-login` remains available |
| Authentication state | TanStack Query `/api/auth/me` and protected layout |
| User identity | Name, email, avatar, logout |
| Scheduled and sent views | Paginated dashboard tabs |
| Compose flow | Subject, HTML body, sender, start time, delay, hourly limit |
| CSV/TXT upload | PapaParse, common email columns, validation, deduplication |
| CSV review | Active compose screen shows valid, invalid, and duplicate counts |
| Sender switching | Uses real sender accounts from the API |
| Search | Subject, recipient, and body search through API |
| Email detail | Status, sender, body, timestamps, SMTP preview |
| UX resilience | Loading states, empty states, errors, responsive layouts |

## Requirement Demonstrations

### CSV and batch scheduling

Create a file:

```csv
email
valid-one@example.com
valid-two@example.com
invalid-address
valid-one@example.com
```

Upload it in Compose. The UI shows valid, invalid, and duplicate counts. The
backend accepts up to 10,000 validated recipients and creates one
`ScheduledEmail` and one delayed job per recipient.

### Rate limiting and Slack

For a visible local test:

```env
MAX_EMAILS_PER_HOUR_PER_SENDER=3
WORKER_CONCURRENCY=2
MIN_EMAIL_DELAY_MS=1000
```

Schedule six recipients with one sender. Show three reservations succeeding,
the remaining jobs rescheduling to the next hour, one `notification-jobs`
entry, and the Slack message.

A queue depth above 1,000 **does not itself trigger Slack**. Slack is triggered
when a sender's hourly quota is exhausted.

### Retry and DLQ

Use a sender with an invalid SMTP host/port, then schedule one email. Show:

1. SMTP failure in worker logs.
2. Exponential retry attempts.
3. Final failure after attempt five.
4. The retained job in `email-dlq`.
5. The email marked `FAILED` in PostgreSQL.

### Restart recovery

1. Schedule a future email.
2. Stop the worker or API.
3. Confirm the PostgreSQL record remains.
4. Restart the process.
5. Show the outbox dispatcher/startup reconciliation and eventual delivery.

### Integration and load checks

Run the real local integration check:

```powershell
Set-Location backend
pnpm test:integration
```

It verifies live PostgreSQL, BullMQ delayed job creation, and ten concurrent
Redis Lua reservations with exactly three allowed slots. Elasticsearch is
skipped unless explicitly enabled:

```powershell
$env:RUN_ELASTICSEARCH_INTEGRATION="true"
pnpm test:integration
```

Run the database/outbox load test:

```powershell
pnpm test:load
pnpm test:load -- --totalEmails=1000 --batchSize=100
```

This measures batched PostgreSQL inserts and transactional outbox creation. It
does not pretend to send 1,000 real Ethereal emails.

## API Overview

### Authentication

```text
GET  /api/auth/google
GET  /api/auth/google/callback
POST /api/auth/dev-login
POST /api/auth/logout
GET  /api/auth/me
```

### Emails

```text
POST /api/emails/schedule
POST /api/emails/bulk-schedule
GET  /api/emails/scheduled?page=1&limit=20
GET  /api/emails/sent?page=1&limit=20
GET  /api/emails/search?q=lead&page=1
GET  /api/emails/:id
```

### Senders and Slack

```text
GET    /api/senders
POST   /api/senders/ethereal
POST   /api/senders/custom
DELETE /api/senders/:id
GET    /api/slack/connect
GET    /api/slack/callback
GET    /api/slack/status
DELETE /api/slack/disconnect
```

## Persistence, Idempotency, and Failure Boundaries

- PostgreSQL is the source of truth for business state.
- Redis persists delayed BullMQ jobs using AOF in Docker.
- The transactional outbox prevents an email row from committing without a
  durable publication event.
- The dispatcher is continuously polling, not a cron job.
- Startup reconciliation repairs older orphan records or jobs lost during a
  Redis interruption.
- Search/indexing failures do not block SMTP delivery.
- Slack failures do not block email scheduling or delivery.
- SMTP acceptance is treated as successful handoff, not proof of inbox
  delivery.
- If SMTP accepts a message and the worker crashes before updating PostgreSQL,
  a retry can theoretically duplicate the message. This ambiguity cannot be
  removed without provider-side idempotency or delivery APIs.

## Assumptions and Trade-offs

### Assumptions

- Deployment is single-region; PostgreSQL, Redis, API, and workers are assumed
  to have low-latency connectivity.
- Hourly limits use fixed wall-clock hour buckets per sender.
- SMTP `250 OK` means the provider accepted the message.
- Sender accounts belong to the authenticated user and are not shared across
  tenants.
- Ethereal is used for safe evaluation rather than real production delivery.
- Elasticsearch is eventually consistent; PostgreSQL is authoritative.

### Conscious decisions

| Decision | Benefit | Cost |
|---|---|---|
| BullMQ/Redis instead of DB polling | Durable delayed jobs and efficient distributed workers | Redis/PostgreSQL state must be reconciled |
| Transactional outbox | Closes the DB-commit/queue-publish crash gap | Adds dispatcher state and operational work |
| Redis Lua quota reservation | Atomic across workers and instances | Requires Redis availability and careful reservation release |
| Fail-open when Redis quota check errors | Campaigns continue during Redis incidents | A partition can temporarily exceed sender quota |
| Elasticsearch plus PostgreSQL fallback | Rich full-text search without making delivery depend on ES | Eventual consistency and another service |
| Separate email/indexing/notification queues | Search or Slack lag cannot block SMTP | More workers and queues to monitor |
| Ethereal SMTP | Safe previews and no unsolicited production mail | Does not prove production deliverability |
| Effectively-once delivery | Strong duplicate protection at application level | SMTP crash ambiguity prevents absolute exactly-once |

### Future production hardening

- Use a production SMTP provider with bounce, complaint, and webhook events.
- Add provider-side idempotency where supported.
- Consider fail-closed rate limiting for reputation-sensitive campaigns.
- Add bounce/complaint suppression and unsubscribe enforcement.
- Add container-backed SMTP, Slack, and Elasticsearch integration tests in CI.
- Add multi-region design only when operational requirements justify it.

## Testing

```powershell
Set-Location backend
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:load -- --totalEmails=1000 --batchSize=100

Set-Location ..\frontend
pnpm exec tsc --noEmit
pnpm build
```

The default Jest suite covers authentication, idempotency, crypto, rate-limit
logic, circuit breaking, and email scheduling. The integration runner covers
live PostgreSQL, Redis, and BullMQ behavior. External SMTP, Slack, and hosted
Elasticsearch behavior still requires configured credentials and services.

## Security Notes

- Secrets belong only in backend environment variables.
- API keys must never be exposed in frontend builds.
- SMTP and Slack credentials are encrypted before database storage.
- API user identity is derived from the verified JWT, not request payloads.
- Sender ownership is validated server-side.
- Bull Board uses HTTP Basic Auth and should be protected behind TLS in
  production.
- Rotate any credential that is accidentally pasted into chat, logs, or a
  public repository.
