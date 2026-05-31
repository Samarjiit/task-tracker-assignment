# Team Task Tracker API

A production-grade, **multi-tenant team task tracker** built with **NestJS + TypeScript**, **PostgreSQL (Prisma)**, **Redis**, and **JWT auth** with refresh-token rotation. Ships with role-based access control enforced at the guard level, Redis-cached task lists, full Swagger docs, a minimal React task board, integration tests, and one-command Docker deployment.

---

## Quick start (one command)

```bash
cp .env.example .env        # optional — compose has sensible defaults
docker compose up --build
```

That's it. Compose starts **Postgres**, **Redis**, the **API** (auto-runs migrations + seed), and the **React frontend**.

| Service        | URL                                |
|----------------|------------------------------------|
| API (base)     | http://localhost:3000/api          |
| Swagger / docs | http://localhost:3000/docs         |
| Frontend       | http://localhost:5173              |
| Health         | http://localhost:3000/api/health   |

### Seeded demo accounts (password: `Password123!`)
| Role    | Email             | Can do                                            |
|---------|-------------------|---------------------------------------------------|
| ADMIN   | admin@acme.test   | Everything in the org (users, projects, tasks)    |
| MANAGER | manager@acme.test | Projects + tasks, assign members; **no** user mgmt|
| MEMBER  | member@acme.test  | View/update **only tasks assigned to them**       |

---

## Architecture

```
backend/  NestJS API (modular, clean architecture)
  src/
    common/   decorators, guards, filters, validators, dtos  ← RBAC + error contract
    config/   env validation (Joi, fail-fast)
    prisma/   PrismaService (global)
    redis/    RedisService (cache + versioned invalidation)
    auth/     register / login / refresh-rotation / logout (+ JWT strategy)
    users/    ADMIN-managed users; assignment lookups
    projects/ project CRUD
    tasks/    task CRUD, list (page/filter/sort), status state machine
frontend/   React + Vite task board (login + columns + transitions)
```

**Design principles:** single-responsibility services, thin controllers, dependency injection, DTO-validated boundaries, a single error contract, and authorization pushed to the edges (guards) wherever it isn't row-dependent.

---

## Authentication

- **Register** (`POST /api/auth/register`) creates a **new organization** and its first **ADMIN**. This bootstraps a tenant; the ADMIN then creates further users with roles.
- **Login** returns an **access token** (15 min, JWT) and a **refresh token** (7 days, opaque random string).
- **Refresh token rotation** (`POST /api/auth/refresh`): the presented refresh token is validated against its stored **SHA-256 hash**, then **revoked**, and a brand-new pair is issued. Re-using a rotated token fails with 401 — this detects/limits token theft.
- **Logout** (`POST /api/auth/logout`) revokes the refresh token.
- Raw refresh tokens are **never stored** — only their hashes.

---

## RBAC (enforced in guards, not controllers)

Two **global** guards run on every request (registered via `APP_GUARD`):

1. **`JwtAuthGuard`** — validates the access token (`@Public()` opts a route out, e.g. login).
2. **`RolesGuard`** — reads `@Roles(...)` metadata via `Reflector` and checks the user's role.

Controllers only **declare** the policy (`@Roles(Role.ADMIN)`); they contain **no authorization branching**.

| Capability             | ADMIN | MANAGER | MEMBER |
|------------------------|:-----:|:-------:|:------:|
| Manage users           | ✅    | ❌      | ❌     |
| Manage projects        | ✅    | ✅      | ❌     |
| Create/delete tasks    | ✅    | ✅      | ❌     |
| Assign tasks           | ✅    | ✅      | ❌     |
| View tasks             | org   | org     | own    |
| Advance task status    | ✅    | ✅      | own    |

**Tenant isolation:** every query is scoped by the `organizationId` taken from the JWT — never from the request body.

**Row-level rule (deliberate exception):** *"only the assignee or a manager can advance a task's status"* depends on the **row** (who the assignee is), which a static role guard cannot see. This single ownership check lives in `TasksService.assertCanAdvance()`. Coarse role-gating stays in the guard; row ownership stays in the service. This separation is intentional and documented rather than smuggling role logic into controllers.

---

## Task status state machine

Transitions are enforced **server-side** (`tasks/task-status.machine.ts`):

```
TODO        → IN_PROGRESS, BLOCKED
IN_PROGRESS → IN_REVIEW,   BLOCKED
IN_REVIEW   → DONE, IN_PROGRESS, BLOCKED
BLOCKED     → IN_PROGRESS, TODO        (un-block)
DONE        → (terminal)
```

`BLOCKED` is reachable from any active state. An illegal transition returns **422 `INVALID_STATUS_TRANSITION`**. Reaching `DONE` stamps `completedAt`.

---

## Task list API

`GET /api/tasks` supports:
- **Pagination:** `page`, `limit` (max 100) → response `{ data, meta: { page, limit, total, totalPages } }`
- **Filtering:** `status`, `priority`, `assigneeId`
- **Sorting:** `sortBy` ∈ `createdAt|dueDate|priority`, `sortOrder` ∈ `asc|desc`

MEMBERs are automatically restricted to their own assigned tasks.

---

## Caching strategy (Redis) + invalidation

**What is cached:** task-list responses **per assignee** (the hot read path — a member loading "my tasks", or a manager filtering by assignee).

**Key shape:**
```
tasks:org:{orgId}:assignee:{assigneeId}:v{version}:{sha1(filters)}
```
where `filters` = `{ page, limit, status, priority, sortBy, sortOrder }`. Entries have a 60s TTL.

**Invalidation — versioned namespace:** each assignee has an integer key
`tasks:org:{orgId}:assignee:{assigneeId}:version`. On **any** task mutation that affects an assignee (create, field update, status change, delete, reassignment) we **`INCR` that assignee's version**. Because the version is embedded in every cache key, the bump instantly makes all of that assignee's cached lists unreachable; the stale entries expire naturally via TTL.

**Why this approach (documented tradeoff):**
- `INCR` is **O(1)** and atomic — no `KEYS`/`SCAN` (which block Redis and don't scale).
- No need to track the set of keys per assignee.
- On **reassignment** we bump **both** the old and new assignee versions, so neither sees stale data.
- Cost: orphaned keys linger until TTL — acceptable and self-cleaning, and memory is bounded by the short TTL.

---

## Error handling & validation

Every error returns one consistent shape via `GlobalExceptionFilter`:
```json
{ "status": 400, "code": "VALIDATION_ERROR", "message": "due_date must be a future date" }
```
- DTOs validated globally (`whitelist`, `forbidNonWhitelisted`, `transform`); the first validation message is surfaced.
- Codes include `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATUS_TRANSITION`, `UNIQUE_CONSTRAINT`.
- Prisma known errors (P2002/P2025) are mapped to clean responses.

---

## Database design

Entities: **Organization → Users / Projects → Tasks**, plus **RefreshToken**. See `backend/prisma/schema.prisma`.

**Indexes** on the columns the task-list query filters/sorts by:
`Task(status)`, `Task(assigneeId)`, `Task(dueDate)`, `Task(projectId)`, plus `User(organizationId)` and `User(email)` unique.

### One design decision explained — index on `assigneeId` (+ status/dueDate)
The dominant query is *"tasks for assignee X, optionally filtered by status, sorted by due date"* — driven by both the MEMBER "my tasks" view and the per-assignee cache miss path. Without an index, that's a full table scan that degrades as tasks grow. I indexed `assigneeId`, `status`, and `dueDate` individually so Postgres can use them for the `WHERE`/`ORDER BY` on this path. I chose **single-column indexes** over one composite index because the filters are **optional and combinable** (status alone, assignee alone, assignee+status, etc.) — single-column indexes let the planner mix them flexibly (bitmap index scans) without committing to one column order, which a take-home's unpredictable query mix benefits from more than a single tuned composite. `assigneeId` is also **nullable** so unassigned tasks are first-class (FK `ON DELETE SET NULL` keeps tasks alive when a user is removed).

---

## Tests

Integration tests (Jest + Supertest) cover the two critical flows:
- **`test/auth.e2e-spec.ts`** — register → login → protected access → refresh rotation (old token rejected) → logout (revoked).
- **`test/task-status.e2e-spec.ts`** — valid transition chain, invalid jump → 422, `BLOCKED` reachable, non-assignee MEMBER blocked (403), MANAGER override, MEMBER cannot create (403).

```bash
docker compose up -d postgres redis   # or use the full stack
cd backend
npm install
npm run test:e2e
```
(The suite defaults to `localhost:5432`/`localhost:6379`; override via env for CI.)

---

## API spec

- Interactive Swagger UI: **http://localhost:3000/docs**
- Export a static OpenAPI file: `cd backend && npm run export:openapi` → `backend/openapi.json` (importable into Postman).

---

## Local development (without Docker)

**PowerShell (Windows):**
```powershell
cd backend
npm install
cp ../.env.example .env     # point DATABASE_URL/REDIS_HOST at localhost
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

```powershell
cd ../frontend
npm install
npm run dev                 # proxies /api → localhost:3000
```

**bash / Git Bash / WSL:**
```bash
cd backend
npm install
cp ../.env.example .env
npx prisma migrate deploy && npx prisma db seed
npm run start:dev

cd ../frontend
npm install && npm run dev
```

> Note: this project lives under a OneDrive-synced path. If `node_modules` sync churn is annoying locally, prefer the Docker workflow (deps live inside the containers).

---

## What I'd improve given more time
- **Analytics endpoint** (overdue count per user, avg completion time via SQL window functions) — schema already stores `completedAt`.
- **Real-time updates** (WebSocket/SSE) notifying an assignee when their task changes status.
- **Refresh-token reuse detection** that revokes the entire token family on replay (beyond rejecting the single token).
- **Testcontainers** so e2e tests provision their own ephemeral Postgres/Redis instead of relying on the running stack.
- **Composite/partial indexes** tuned from real query stats (e.g. partial index on non-DONE tasks) once access patterns are measured.
- **Rate limiting** on auth endpoints and structured request logging/observability.

---

## Tradeoffs intentionally made
- **Register bootstraps an org + ADMIN** (rather than an invite flow) to keep onboarding demoable; additional users are ADMIN-created.
- **Opaque refresh tokens** (not JWTs) — rotation needs server state anyway, and opaque tokens are simpler to revoke.
- **Org-wide task lists are not cached**, only per-assignee lists — that's where the spec targets caching and where repeated reads concentrate.
- **Bonus features** (analytics, realtime) were skipped in favor of a clean, complete, tested core, per the assignment's guidance.
