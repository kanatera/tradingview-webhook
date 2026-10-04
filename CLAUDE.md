# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server on port 12345

# Build
npm run build        # Prisma generate + Next.js build (standalone output)

# Production start
npm run start        # Prisma migrate deploy + Next.js start on port 12345

# Database
npm run db:migrate   # Run Prisma migrations in dev
npm run db:generate  # Regenerate Prisma client after schema changes

# Lint
npm run lint
```

### Container image (use podman, not docker)

```bash
podman build --format docker -t 192.168.7.17:5000/trade-alert-speaker:<version> .
podman login --tls-verify=false -u kanatera 192.168.7.17:5000
podman push --tls-verify=false 192.168.7.17:5000/trade-alert-speaker:<version>
```

- Always use `--format docker` — OCI format silently drops the `HEALTHCHECK` instruction.
- Always use `--tls-verify=false` — the private registry has SSL disabled.

## Architecture

### What this does

Receives TradingView webhook alerts and broadcasts them to output channels: LG TV (toast overlay, primary) and Google Home / Chromecast speakers (TTS, fallback). Designed for LAN deployment (TrueNAS Scale). No cloud dependencies at runtime.

### Request flow

```
POST /api/webhook/:secret
  → Validate secret (skip if no secret configured)
  → Store message in SQLite
  → Return 200 immediately (TradingView has short timeouts)
  → Background:
      If TV schedule active → try LG TV toast
        TV on  → mark spoken, skip speakers
        TV off → fall through to speakers
      Speakers: check schedules → cast TTS → retry queue (3×, 30s apart)
```

The instant-return + background-processing split is intentional and critical. Do not move casting into the request handler.

### Key files

| Path | Role |
|------|------|
| `src/lib/lg-tv.ts` | LG webOS TV pairing and toast notifications via WSS port 3001; stores client key as JSON alongside SQLite DB |
| `src/lib/google-home.ts` | Chromecast discovery (avahi-browse primary, bonjour fallback) and TTS casting via castv2-client |
| `src/lib/schedule.ts` | Timezone-aware schedule matching; handles overnight ranges; returns `channelType` on each active channel |
| `src/lib/retry-queue.ts` | Background retry: 3 attempts, 30s apart; skips if speaker goes inactive by schedule |
| `src/lib/sse-clients.ts` | SSE broadcast for real-time dashboard; client falls back to 10s polling |
| `src/lib/auth.ts` | Session + read-token verification (constant-time); public/read-token route allowlists |
| `src/middleware.ts` | Default-deny auth for all `/api/*` routes |
| `src/app/api/webhook/[secret]/route.ts` | Main webhook entry point; TV-first routing logic |
| `src/app/api/lgtv/pair/route.ts` | POST: pair TV + create default schedules; GET: check pairing status |
| `src/app/api/lgtv/test/route.ts` | POST: send test toast to TV |
| `src/app/api/schedules/route.ts` | GET/POST for speaker schedules; supports `?channelType=` filter |
| `src/app/api/settings/webook/route.ts` | GET/POST for webhook secret, public URL, and timezone |
| `src/components/settings/LgTvManager.tsx` | LG TV section: add TV, pair, test, per-TV schedule management |
| `src/components/settings/CredentialsForm.tsx` | Settings form including IANA timezone dropdown |
| `prisma/schema.prisma` | SQLite schema: `Message`, `SpeakerSchedule` (with `channelType`), `AppSetting` |
| `Containerfile` | Multi-stage build (Node 20 Alpine → standalone Next.js) |
| `entrypoint.sh` | Container startup: init DB, set permissions, start as `nextjs` user |
| `podman-compose.yml` | Production compose config |

### Database (`AppSetting` keys)

Runtime configuration is stored in the `AppSetting` table (key/value SQLite):
- `webhook_secret` — auth token for incoming webhooks
- `public_url` — externally reachable URL shown in dashboard
- `timezone` — IANA timezone string; also written to `process.env.TZ` at runtime

### LG TV integration

- **Protocol:** WSS (WebSocket Secure) on port 3001. LG C2 and newer webOS TVs dropped plain WS on port 3000.
- **TLS:** Self-signed cert — `NODE_TLS_REJECT_UNAUTHORIZED=0` is set at module load in `lg-tv.ts`.
- **Client key:** Stored as `lgtv-key-<sanitized-ip>.json` in the same directory as the SQLite DB (`/app/data/` in production). The `lgtv2` npm package's `clientKeyFile` option is always passed to prevent crashes in its internal `saveKey()` call.
- **Toast limit:** LG webOS `createToast` API has a 60-character message limit; long messages are truncated with `...`.
- **TV-first routing:** If TV schedule is active and TV is on, alert goes to TV only (no speakers). If TV is off/unreachable, falls back to active speakers.

### Timezone handling

`process.env.TZ` is mutated at runtime when the user saves timezone in Settings. `getNowInTimezone()` in `schedule.ts` reads it fresh on every call — do not convert it back to a module-level constant.

### Speaker discovery

- **Primary:** `avahi-browse` (system daemon, works on TrueNAS)
- **Fallback:** `bonjour-service` (local mDNS, port 5354)
- **WSL2 limitation:** Even with `--network host`, the container sees WSL2's virtual NIC, not the real LAN — mDNS discovery won't find speakers on a dev machine. Use "+ Add Speaker" with manual IP during local testing.
- Container must run with `--network host` in production for mDNS to work.

### Auth

Webhook auth: if no secret is configured (`AppSetting` is empty and `WEBHOOK_SECRET` env is unset), all webhooks are accepted. Auth is only enforced when a secret exists — `if (expectedSecret && secret !== expectedSecret)`.

Session auth: protected pages use a layout wrapper that checks the session cookie against the DB.

API auth: `src/middleware.ts` (Node.js runtime, so it can use Prisma) is **default-deny for every `/api/*` route**: a valid `trade_alert_session` cookie is required. Exceptions live in `src/lib/auth.ts`:
- `PUBLIC_API_ROUTES` — `/api/webhook/:secret`, `/api/health`, `/api/auth/login`, `/api/auth/logout`. Don't add routes here unless they truly must be internet-reachable (port 80 is forwarded to this app).
- `READ_TOKEN_ROUTES` — `GET /api/messages` also accepts the read-only token (`X-API-Key` header, `AppSetting` `homepage_read_token`, managed in Settings → Read-only API Token). Used by the Homepage dashboard widget.

There is only one `SESSION_TOKEN`, so any login (including `e2e-test.js` / `auth-e2e-test.js`) logs out other browsers.

Tests: `node auth-e2e-test.js` (non-destructive; `BASE_URL`, `AUTH_USER`, `AUTH_PASS` env) checks every route's auth. `e2e-test.js` purges messages — run it against a scratch DB only.

### SpeakerSchedule channelType

`SpeakerSchedule.channelType` distinguishes output channels:
- `"chromecast"` — Google Home / Chromecast speaker (default for all existing rows)
- `"lgtv"` — LG webOS TV

`GET /api/schedules?channelType=chromecast` returns only speaker schedules (used by `ScheduleManager`).
`GET /api/schedules?channelType=lgtv` returns only TV schedules (used by `LgTvManager`).

### Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `TZ` | `Asia/Bangkok` | Server timezone; overridden at runtime via Settings UI |
| `NEXT_PUBLIC_TZ` | `Asia/Bangkok` | Client-side timezone display (must match `TZ`) |
| `DATABASE_URL` | `file:/app/data/alerts.db` | SQLite path; also used to derive LG TV key file directory |
| `WEBHOOK_SECRET` | — | Fallback if no DB setting; leave unset to allow unauthenticated on fresh install |
| `SECURE_COOKIES` | — | Set to `true` for HTTPS deployments |
