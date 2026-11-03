# 🚀 ReachInbox — Full-Stack Email Job Scheduler

> Production-grade email scheduling platform built for the Outbox Labs internship assignment.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser  ──Google OAuth──►  React Frontend (Vite + TS)     │
│           ◄───JWT Cookie──                                   │
└───────────────────┬─────────────────────────────────────────┘
                    │ REST API
┌───────────────────▼─────────────────────────────────────────┐
│  Express.js API (TypeScript)                                │
│  • Auth middleware (JWT from HTTP-only cookie)              │
│  • Zod request validation                                   │
│  • Bull Board at /admin/queues                              │
└──────┬──────────────┬──────────────┬────────────────────────┘
       │              │              │
  PostgreSQL      BullMQ         Elasticsearch
  (Prisma ORM)   (Redis)         (email search)
       │              │
       └──────────────┤
                      │  Job dequeued
           ┌──────────▼──────────────────────────┐
           │  BullMQ Worker (separate process)   │
           │  1. Idempotency check (DB)          │
           │  2. Rate limit (Redis Lua script)   │
           │  3. Min delay (env: MIN_EMAIL_DELAY)│
           │  4. SMTP via Ethereal (Nodemailer)  │
           │  5. Update DB + ES index            │
           │  6. Notify Slack if limit hit       │
           └─────────────────────────────────────┘
```

---

## Technology Stack

| Layer       | Technology              |
|-------------|-------------------------|
| Backend     | TypeScript + Express.js |
| Queue       | BullMQ + Redis          |
| Database    | PostgreSQL + Prisma ORM |
| Search      | Elasticsearch 8         |
| SMTP        | Nodemailer + Ethereal   |
| Auth        | Passport.js + Google OAuth + JWT |
| Notifications | Slack Web API (Bot Token + OAuth) |
| Metrics     | Prometheus (`/metrics`) |
| Observability | Grafana + Bull Board Dashboard |
| Frontend    | React + Vite + TypeScript + Tailwind CSS |
| Data Fetching | TanStack Query       |
| Forms       | React Hook Form + Zod   |
| Infrastructure | Docker Compose       |

---

## Features Implemented Matrix

| Area | Feature | Implementation Details | Status |
|---|---|---|---|
| **Backend** | BullMQ Delayed Jobs | Primary scheduler mechanism using Redis delayed sets — **zero cron jobs** | ✅ Complete |
| **Backend** | Restart Persistence | Delayed jobs persist in Redis; startup reconciliation recovers any interrupted DB jobs | ✅ Complete |
| **Backend** | Idempotent Delivery | SHA-256 keying `sha256(userId\|recipient\|scheduledAt)` prevents duplicate sends | ✅ Complete |
| **Backend** | Rate Limiting | Atomic Redis Lua script enforces per-sender hourly quota; auto-reschedules overflow | ✅ Complete |
| **Backend** | Minimum Delay & Concurrency | Configurable `MIN_EMAIL_DELAY_MS` between sends; multi-worker concurrency | ✅ Complete |
| **Backend** | Ethereal SMTP | Nodemailer integration with auto test-account generation & web preview URLs | ✅ Complete |
| **Backend** | Elasticsearch Indexing | Scheduled & sent emails indexed; resilient search fallback if ES is offline | ✅ Complete |
| **Backend** | Slack Notifications | Real Slack OAuth with encrypted token storage; live alerts on hourly quota hit | ✅ Complete |
| **Backend** | Bull Board Dashboard | Real-time queue monitoring at `/admin/queues` with HTTP Basic auth protection | ✅ Complete |
| **Backend** | Senders API | Manage custom SMTP credentials + auto-generate Ethereal identities | ✅ Complete |
| **Backend** | Open API 3.1.0 Contract | Standardized OpenAPI spec available in [`openapi.yaml`](openapi.yaml) | ✅ Complete |
| **Frontend** | Google OAuth Login | Secure session with HTTP-only JWT cookie; redirects to dashboard | ✅ Complete |
| **Frontend** | User Profile & Header | Displays user name, email, avatar, Slack connection status, and logout | ✅ Complete |
| **Frontend** | Scheduled & Sent Tabs | Dedicated views with status badges, timestamps, loading skeletons, and pagination | ✅ Complete |
| **Frontend** | Compose Campaign Modal | Subject, HTML body, start time, delay, hourly limit, and sender selection | ✅ Complete |
| **Frontend** | CSV/TXT Recipient Parser | Header auto-detection, manual email entry, invalid address warning, and recipient list review/removal drawer | ✅ Complete |
| **Frontend** | Senders Management Drawer | Collapsible UI to view active SMTP senders and provision test Ethereal accounts | ✅ Complete |
| **Frontend** | Real-Time Search Bar | Search emails by subject, recipient, or body via Elasticsearch | ✅ Complete |

---

## Folder Structure

```
OutboxLabs/
├── backend/
│   ├── src/
│   │   ├── config/        # env, redis, database, passport config
│   │   ├── controllers/   # thin HTTP handlers
│   │   ├── services/      # business logic (EmailService, RateLimitService)
│   │   ├── workers/       # BullMQ worker entry + job processor
│   │   ├── queues/        # BullMQ queue definition + helpers
│   │   ├── middleware/    # auth, errorHandler, validate
│   │   ├── routes/        # Express routers
│   │   ├── integrations/  # Slack, Elasticsearch, Ethereal SMTP adapters
│   │   ├── repositories/  # DB access layer (Repository pattern)
│   │   ├── utils/         # logger, crypto, idempotency
│   │   └── types/         # shared TypeScript interfaces
│   ├── prisma/schema.prisma
│   └── tests/
├── frontend/
│   └── src/
│       ├── components/    # ui/ (Button, Input, Modal…) + email/ (Table, ComposeModal)
│       ├── pages/         # LoginPage, DashboardPage
│       ├── hooks/         # useEmails (TanStack Query wrappers)
│       ├── services/      # api.ts (Axios client)
│       ├── contexts/      # AuthContext
│       ├── types/         # API response interfaces
│       └── layouts/       # ProtectedRoute
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8
- **Docker + Docker Compose** (for PostgreSQL, Redis, Elasticsearch)

---

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
# Fill in your values (see Environment Variables section below)
```

### 2. Start Infrastructure (Docker)

```bash
docker-compose up -d
# Starts: PostgreSQL on :5432, Redis on :6379, Elasticsearch on :9200

# Wait for Elasticsearch to be healthy (~30 seconds):
docker-compose ps
```

### 3. Backend Setup

```bash
cd backend

# Install dependencies
pnpm install

# Run Prisma migrations (creates all tables)
pnpm db:migrate

# Generate Prisma client
pnpm db:generate

# Start API server (development)
pnpm dev
# → API listening on http://localhost:4000
# → Bull Board at http://localhost:4000/admin/queues

# Start BullMQ Worker (separate terminal)
pnpm dev:worker
```

### 4. Frontend Setup

```bash
cd frontend
pnpm install
pnpm dev
# → Frontend at http://localhost:5173
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | ✅ | Redis connection |
| `ELASTICSEARCH_URL` | ✅ | Elasticsearch/OpenSearch node URL |
| `ELASTICSEARCH_API_KEY` | Optional | Elastic Cloud API key; never commit this value |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth app client secret |
| `GOOGLE_CALLBACK_URL` | ✅ | `http://localhost:4000/api/auth/google/callback` |
| `SLACK_CLIENT_ID` | ✅ | Slack app client ID |
| `SLACK_CLIENT_SECRET` | ✅ | Slack app client secret |
| `SLACK_REDIRECT_URI` | ✅ | `http://localhost:4000/api/slack/callback` |
| `JWT_SECRET` | ✅ | 64-char random hex |
| `ENCRYPTION_KEY` | ✅ | 64-char hex (AES-256 key) |
| `ETHEREAL_USER` / `ETHEREAL_PASS` | ⚪ | Auto-created if empty |
| `WORKER_CONCURRENCY` | ⚪ | Default: `5` |
| `MIN_EMAIL_DELAY_MS` | ⚪ | Default: `2000` (2 seconds) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | ⚪ | Default: `200` |

### Generate Secrets

```bash
# JWT_SECRET / ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Ethereal Email Setup

Ethereal is a fake SMTP service — emails are captured and viewable in browser.

**Option A — Auto:** Leave `ETHEREAL_USER` and `ETHEREAL_PASS` empty.  
The app creates a test account on first startup and logs the credentials.

**Option B — Manual:**
1. Visit https://ethereal.email/create
2. Copy the SMTP credentials into `.env`

After sending, the API returns `etherealPreviewUrl` — click it to view the email.

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → APIs & Services → Credentials → OAuth 2.0 Client
3. Add authorized redirect URI: `http://localhost:4000/api/auth/google/callback`
4. Copy Client ID and Secret into `.env`

---

## Slack OAuth Setup

1. Go to https://api.slack.com/apps → Create New App → From Scratch
2. OAuth & Permissions → Add redirect URL: `http://localhost:4000/api/slack/callback`
3. Bot Token Scopes: `chat:write`, `incoming-webhook`
4. Copy Client ID and Secret into `.env`

---

## Database Migration & Seeding

```bash
cd backend

# Create and apply migrations
pnpm db:migrate

# (Optional) Seed demo user, Ethereal sender, and sample emails:
pnpm db:seed

# Open Prisma Studio (visual DB browser)
pnpm db:studio
```

> **Tip for Local Testing**: Running `pnpm db:seed` prints a generated `auth_token` cookie. You can paste this cookie in DevTools to test the dashboard immediately without setting up Google OAuth credentials!

---

## BullMQ Dashboard (Bull Board)

URL: `http://localhost:4000/admin/queues`  
Auth: HTTP Basic — credentials from `BULL_BOARD_USERNAME` / `BULL_BOARD_PASSWORD` in `.env` (default: `admin` / `admin_secret`)

Shows:
- **Waiting** — jobs pending processing
- **Active** — jobs being processed right now
- **Delayed** — jobs scheduled for the future (purple bar)
- **Completed** — successfully sent emails (green bar)
- **Failed** — emails that exhausted retries

---

## Prometheus & Grafana Telemetry Dashboard

The application exposes real-time Prometheus telemetry at `http://localhost:4000/metrics` and provisions an out-of-the-box Grafana dashboard.

### Accessing the Dashboards
1. **Start Monitoring Containers**:
   ```bash
   docker-compose up -d prometheus grafana
   ```
2. **Prometheus Target**: `http://localhost:9090` (Scrapes `/metrics` every 5 seconds)
3. **Grafana URL**: `http://localhost:3000`
   - **Username**: `admin`
   - **Password**: `admin`
   - **Pre-configured Dashboard**: **"ReachInbox Scheduler Telemetry"**

### Monitored Metrics
- **Total Emails Scheduled** (`reachinbox_emails_scheduled_total`)
- **Total Emails Processed / Sent** (`reachinbox_emails_processed_total{status="sent"}`)
- **Delivery Failure Rate** (`reachinbox_emails_processed_total{status="failed"}`)
- **Hourly Rate Limit Rollover Spikes** (`reachinbox_rate_limit_hits_total`)
- **Email Delivery Throughput** (`rate(reachinbox_emails_processed_total[1m])`)
- **SMTP Delivery Latency Histogram** (p50 and p95 latency quantiles)

---

## Load Testing (1,000 Scheduled Emails Simulation)

To validate behavior under heavy load and rate limits (as required by the hiring specification):

```bash
cd backend
pnpm test:load
```

### What This Tests
1. **Batch Ingestion**: Creates 1,000 scheduled emails in atomic batches across multiple senders.
2. **Throughput Benchmark**: Measures database write throughput (e.g. `> 1,200 emails/sec`) and heap memory overhead.
3. **Queue Ingestion**: Observe jobs instantly populate the Bull Board (`/admin/queues`) and Grafana rate curves in real time.
4. **Rate Limit Overflow**: Verifies that emails exceeding a sender's quota are deferred into the subsequent hourly window without dropping.

---

## API Reference

### Auth
```
GET  /api/auth/google           → Redirect to Google login
GET  /api/auth/google/callback  → OAuth callback (sets cookie)
POST /api/auth/logout           → Clear auth cookie
GET  /api/auth/me               → Current user info
```

### Emails (all require auth)
```
POST /api/emails/schedule       → Schedule single email
POST /api/emails/bulk-schedule  → Schedule from recipient list
GET  /api/emails/scheduled      → List scheduled emails (paginated)
GET  /api/emails/sent           → List sent emails (paginated)
GET  /api/emails/search?q=...   → Full-text search via Elasticsearch
GET  /api/emails/:id            → Single email detail
```

### Senders (all require auth)
```
GET    /api/senders               → List active sender accounts
POST   /api/senders/ethereal      → Auto-create Ethereal SMTP test account
POST   /api/senders/custom        → Add custom SMTP sender account
GET    /api/senders/:id           → Get sender account details
DELETE /api/senders/:id           → Deactivate sender account (soft-delete)
```

### Slack
```
GET    /api/slack/connect       → OAuth redirect to Slack
GET    /api/slack/callback      → Slack OAuth callback
DELETE /api/slack/disconnect    → Disconnect Slack
GET    /api/slack/status        → Connection status
```

### OpenAPI Specification
The full interactive API contract is available in [`openapi.yaml`](openapi.yaml) (OpenAPI 3.1.0 standard). You can import it directly into Postman, Swagger UI, or Insomnia.

#### Example: Schedule a single email
```json
POST /api/emails/schedule
{
  "recipientEmail": "lead@example.com",
  "subject": "Following up on your inquiry",
  "body": "<p>Hi there,...</p>",
  "scheduledAt": "2024-12-01T10:00:00.000Z",
  "senderId": "clx..."
}
```

#### Example: Bulk schedule
```json
POST /api/emails/bulk-schedule
{
  "recipients": ["a@example.com", "b@example.com"],
  "subject": "Q4 Outreach",
  "body": "<p>Hello!</p>",
  "startAt": "2024-12-01T09:00:00.000Z",
  "delayBetweenMs": 2000,
  "hourlyLimit": 100,
  "senderId": "clx..."
}
```

---

## Scheduling Architecture

### How it works
1. API receives `POST /api/emails/schedule`
2. Email record inserted into PostgreSQL with `status=PENDING`
3. BullMQ delayed job enqueued with `delay = scheduledAt - now()`
4. DB updated: `bullJobId` set, `status=QUEUED`
5. Email indexed in Elasticsearch
6. At scheduled time, BullMQ activates the job → Worker processes it

### Persistence on Restart
- BullMQ delayed jobs are persisted in Redis (AOF enabled)
- On restart, jobs still exist in Redis → Worker picks them up
- If Redis was also restarted: **Startup Reconciliation** runs at API boot
  - Queries DB for `PENDING`/`QUEUED` emails with future `scheduledAt`
  - Re-enqueues them into BullMQ
  - **Not a cron** — runs exactly once per startup

### Idempotency
- Every email has a deterministic key: `sha256(userId|recipient|scheduledAt)`
- Used as both `BullMQ jobId` and `DB UNIQUE idempotencyKey`
- Duplicate API calls → DB constraint violation (409) → no double-send
- Worker checks `status === SENT` before processing → safe to retry

### SMTP Ambiguity Window
Truly exactly-once delivery is impossible with SMTP:
- Worker sends email → Ethereal confirms → DB update
- If crash between SMTP confirm and DB update: Worker retries → email re-sent
- Mitigation: Check `status === SENT` in DB before SMTP call; use short job timeout

---

## Rate Limiting

### Configuration
```env
MAX_EMAILS_PER_HOUR_PER_SENDER=200
MIN_EMAIL_DELAY_MS=2000
WORKER_CONCURRENCY=5
```

### How it works
- **Per-sender hourly limit**: Redis Lua script atomically increments a counter keyed by `ratelimit:{senderId}:{hourWindow}`
- **Atomic**: Lua runs server-side — no race conditions across workers
- **When limit hit**:
  1. Counter decremented (slot released)
  2. Email rescheduled to next hour window via BullMQ delay
  3. Slack notification sent (deduplicated per hour per sender)
  4. Original job completes cleanly
- **Minimum delay**: `sleep(MIN_EMAIL_DELAY_MS)` between sends — mimics provider throttling

### Behavior under 1000+ simultaneous jobs
- Workers process `WORKER_CONCURRENCY` jobs in parallel
- Each checks per-sender quota atomically (no over-counting)
- Jobs exceeding the hourly limit are auto-rescheduled to the next window
- No jobs are dropped or permanently failed due to rate limiting

---

## Running Tests

```bash
cd backend
pnpm test

# With coverage
pnpm test -- --coverage
```

Unit & Integration test suites (**23 tests passing across 5 suites**):
- **Rate Limit Service**: Atomic Redis Lua quota reservation, hourly window calculation, fail-open resiliency.
- **Idempotency**: Deterministic SHA-256 keying `sha256(userId|recipient|scheduledAt)` & duplicate rejection.
- **Crypto**: AES-256-GCM authenticated encryption/decryption of SMTP passwords and Slack tokens.
- **Email Service**: Single & bulk scheduling, future time validation, sender ownership checks, and startup crash reconciliation.
- **Auth Middleware**: JWT generation, cookie extraction, `Authorization: Bearer` fallback, and invalid/expired token rejections.

---

## Design Patterns

| Pattern | Where |
|---|---|
| Repository | `repositories/` — isolates DB queries from business logic |
| Service Layer | `services/` — orchestrates repositories + integrations |
| Strategy | `RateLimitService` — swappable rate limit strategies |
| Adapter | `integrations/` — Slack, ES, SMTP behind consistent interfaces |
| Factory | `createTransporterForSender()` — per-sender SMTP transporter |
| Middleware Chain | Express: auth → validate → controller |
| Observer | BullMQ events → DB status updates |

---

## System Design Analysis: Assumptions, Shortcuts, & Trade-offs

When designing and evaluating distributed scheduling architectures, understanding architectural trade-offs and operational failure boundaries is critical.

### 1. Assumptions — What Did We Assume?

| Assumption | Operational Meaning & Architectural Impact |
|---|---|
| **Single-Region Deployment** | All application nodes, PostgreSQL primary, and Redis clusters operate within a single cloud region (low network latency assumed between API and Redis). |
| **Hourly Rate Limiting** | Sending quotas are enforced per 60-minute wall-clock sliding/fixed window keyed by sender account (`hourWindow = floor(epoch / 3600000)`). |
| **SMTP Acceptance = Successful Operation** | When the upstream SMTP server returns `250 OK` / queued, the scheduler considers its contract fulfilled. End-inbox placement depends on recipient MTA spam filters. |
| **Strict Sender Ownership** | Users may only schedule campaigns and dispatch emails through verified sender accounts linked to their tenant ID. |
| **Test Environment** | Ethereal SMTP is used to safely capture, inspect, and verify MIME messages without dispatching unsolicited emails to real inboxes. |
| **Eventual Search Consistency** | Transactional PostgreSQL write is the immediate source of truth; Elasticsearch full-text indexing operates asynchronously. |

---

### 2. Shortcuts — What Did We Simplify?

| Functional Area | Chosen Simplification | Enterprise / Production Alternative | Rationale |
|---|---|---|---|
| **Email Transport** | Ethereal Fake SMTP | Amazon SES / SendGrid / Mailgun | Prevents accidental delivery to real recipients during evaluation while providing web preview URLs. |
| **Crash Recovery** | Startup Reconciliation | Continuous Transactional Outbox Dispatcher | PostgreSQL is scanned at boot for unfinished future jobs. Simpler and zero-lag recovery without standing pollers. |
| **Search Storage** | Elasticsearch 8 with DB fallback | Multi-node OpenSearch with CDC (Debezium) | Direct dual-write/indexing with graceful fallback to DB if ES is offline. |
| **Session Auth** | HTTP-Only JWT Cookies + Bearer | OAuth2 Authorization Server + OIDC | Stateless JWT verification eliminates database session lookups on high-frequency API routes. |

---

### 3. Trade-offs — What Did We Sacrifice?

#### Trade-off 1: Redis (BullMQ) vs. PostgreSQL Polling for Scheduling
- **Decision:** Use Redis-backed BullMQ delayed sets rather than periodic database queries (`SELECT ... WHERE scheduled_at <= NOW()`).
- **Gains:** Sub-millisecond queue operations, distributed lock-free job reservation across multiple workers, offloading transactional database CPU.
- **Sacrifice:** Dual-system state consistency. Requires startup reconciliation if Redis memory is evicted or wiped.

#### Trade-off 2: Fail-Open vs. Fail-Closed Rate Limiting
- **Decision:** Fail-Open. If Redis is temporarily unreachable during the rate-limit Lua check, the worker logs a warning and permits the email to proceed.
- **Gains:** Outbox campaigns are not halted during transient Redis connection blips.
- **Sacrifice:** Slight risk of exceeding a sender's hourly quota during Redis network partitions.
- *Interview Note:* In a production cold-email SaaS where IP/domain reputation is paramount, this can be toggled to fail-closed via configuration.

#### Trade-off 3: Exactly-Once vs. Effectively-Once Delivery
- **Decision:** Effectively-Once delivery using SHA-256 idempotency hashing (`sha256(userId|recipient|scheduledAt)`), unique database constraints, and pre-send status checks.
- **Gains:** Prevents duplicate scheduling from repeated user clicks or network retries.
- **Sacrifice:** A narrow ambiguity window remains if a worker crashes after SMTP accepts the message but before PostgreSQL commits `status=SENT`.

#### Trade-off 4: Elasticsearch vs. PostgreSQL Search
- **Decision:** Elasticsearch handles full-text search across subject and body; PostgreSQL remains the transactional system of record.
- **Gains:** High-speed fuzzy search across millions of emails without degrading primary database performance.
- **Sacrifice:** Eventual consistency — there can be a 100–500ms delay before a newly sent email appears in search queries.

#### Trade-off 5: Dedicated Queues vs. Single Unified Queue
- **Decision:** Segregated queues for email delivery (`email-jobs`), search indexing (`indexing-jobs`), and alerts (`notification-jobs`).
- **Gains:** Auxiliary service lag (e.g. slow Elasticsearch cluster) cannot block or delay core SMTP email delivery.
- **Sacrifice:** Higher operational overhead and more queue workers to monitor and scale.

---

### 4. Future Enhancements (With More Time)

1. **Continuous Transactional Outbox Dispatcher:** Decouple event publishing from API handlers completely using a persistent background outbox processor.
2. **Delivery Event Webhooks:** Ingest real-time bounce, spam complaint, open, and click tracking webhooks from upstream providers.
3. **Sliding-Window Rolling Rate Limiter:** Replace fixed hour-bucket counters with Redis sorted sets (`ZADD` / `ZREMRANGEBYSCORE`) to eliminate quota bursts at hour boundaries.
4. **Multi-Region Active-Active Setup:** Deploy worker pools across multiple AWS/GCP regions with localized Redis instances for latency reduction.

---

## 📹 Demo Video & Submission Guide

### Video Outline (Max 5 Minutes)
1. **Overview & Dashboard**:
   - Log in via Google OAuth or seed user token.
   - Show User header, Slack connection status, and Sender identities.
2. **Scheduling Campaign**:
   - Open Compose Modal.
   - Upload sample CSV lead list or type recipients manually.
   - Review detected recipient count and show the collapsible review drawer.
   - Set start time, minimum delay (e.g. 2000ms), and hourly limit.
   - Submit and show scheduled jobs appearing in the **Scheduled Emails** tab.
3. **Queue Inspection**:
   - Open Bull Board at `http://localhost:4000/admin/queues` showing delayed & active jobs.
4. **Sending & Ethereal Verification**:
   - Wait for jobs to activate or schedule for immediate test send.
   - Show jobs transitioning to **Sent Emails** with Ethereal preview URLs.
   - Click preview URL to view rendered email in browser.
5. **Server Restart Resilience (No Cron)**:
   - Schedule future emails.
   - Terminate API & worker processes (`Ctrl+C`).
   - Restart the processes.
   - Demonstrate startup reconciliation logs and show future emails are still processed at the exact scheduled timestamp.
6. **Rate Limiting & Slack Alert (Bonus)**:
   - Schedule emails exceeding the sender's configured hourly quota.
   - Show jobs being deferred to the next hourly window without dropping.
   - Show automated rate limit notification received in Slack.

### Submission Checklist
- [x] Repository configured with clean git history and commits pushed.
- [ ] Grant private repo access to GitHub users: `Mitrajit` and `Yadav036`.
- [ ] Record and upload 5-minute Loom/YouTube demo video.
- [ ] Complete the submission form: [Assignment Submission Form](https://forms.clickup.com/9005062261/f/8cbwp3n-8876/6NNNJ92DV93PQTAYST).

