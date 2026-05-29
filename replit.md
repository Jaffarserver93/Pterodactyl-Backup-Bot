# PteroBot — Pterodactyl Panel Backup Bot

Automated Pterodactyl Panel backup bot. Uses the Pterodactyl Client API to create backups on a schedule — no browser automation, no CAPTCHA. Sends Telegram MTProto notifications on success. Mobile-first dark terminal UI.

## Run & Operate

- **Run button** / `bash scripts/start.sh` — starts both services (API server on 8080, frontend on 5000)
- `pnpm --filter @workspace/api-server run dev` — run the API server only (port 8080)
- `pnpm --filter @workspace/ptero-backup-bot run dev` — run the frontend only (port $PORT)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- API: Express 5 + Socket.io 4 (real-time logs over WebSocket)
- Pterodactyl: Client API via `fetch` (no browser/Puppeteer)
- Telegram: GramJS/telegram (MTProto, volatile in-memory, no DB)
- Frontend: React + Vite + Tailwind v4 + Shadcn/ui
- Database: PostgreSQL via Drizzle ORM (config persistence)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/lib/bot-state.ts` — in-memory bot state + DB persistence
- `artifacts/api-server/src/lib/pterodactyl-api.ts` — Pterodactyl Client API engine (backup cycle)
- `artifacts/api-server/src/lib/telegram-client.ts` — GramJS Telegram MTProto client
- `artifacts/api-server/src/lib/socket.ts` — Socket.io server setup + event emitters
- `artifacts/api-server/src/routes/bot.ts` — bot REST endpoints
- `artifacts/api-server/src/routes/telegram.ts` — Telegram REST endpoints
- `artifacts/ptero-backup-bot/src/components/Dashboard.tsx` — status, terminal log feed, start/stop
- `artifacts/ptero-backup-bot/src/components/Configuration.tsx` — config form (API key, server ID)
- `artifacts/ptero-backup-bot/src/components/Telegram.tsx` — Telegram auth flow
- `artifacts/ptero-backup-bot/src/hooks/use-socket.ts` — Socket.io React hook
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/db/src/schema/bot-config.ts` — bot_config DB table (panelUrl, apiKey, serverId, interval)
- `scripts/start.sh` — starts both services for the Run button

## Architecture decisions

- **Pterodactyl Client API**: Bot authenticates with a `ptlc_...` API key, calls `/api/client/servers/{id}/backups` to create and poll backups. No browser, no CAPTCHA.
- **Auto-delete oldest backup**: If the server is at the 3-backup limit, the oldest unlocked backup is deleted before creating a new one.
- **Volatile Telegram state**: GramJS session is held in-memory only, never persisted. Reconnect required after server restart.
- **`telegram` package externalized from esbuild**: GramJS/`telegram` depends on `websocket` which requires native `bufferutil`. Both are excluded from the esbuild bundle so pnpm's virtual store symlinks resolve them at runtime.
- **Socket.io at `/socket.io` path**: Vite dev server proxies `/api` and `/socket.io` → localhost:8080.
- **Contract-first API**: All endpoints are defined in `lib/api-spec/openapi.yaml` first; React Query hooks and Zod schemas are generated from it via Orval.
- **Config persisted to PostgreSQL**: `bot_config` table (id=1 upsert), loaded into memory on startup.

## Product

- **STATUS tab**: Bot status (running/stopped), backup count, uptime, current action. Terminal log feed with level-coded colors. Start/Stop toggle.
- **CONFIG tab**: Form for Panel URL, Client API Key (`ptlc_...`), Server ID, backup interval. Saved to PostgreSQL.
- **TELEGRAM tab**: Multi-step Telegram MTProto auth (API ID + Hash + Phone → OTP → Connected). Shows live connection status badge. Sends backup notifications to Saved Messages.

## User preferences

- Mobile-first layout, max 480px centered, one-handed use
- Dark mode only — deep slate/zinc with emerald accent
- Monospace font (JetBrains Mono) for all status/log text
- No emojis in UI text

## Gotchas

- `pnpm run typecheck` uses `tsc --noEmit`; `pnpm run build` needs `PORT` + `BASE_PATH` env vars — don't run build from bash.
- The `telegram`/`websocket`/`bufferutil` chain must remain in esbuild's `external` list in `build.mjs` to avoid native module resolution failures.
- `@apply dark` is invalid in Tailwind v4 — always use `class="dark"` on the HTML element instead.
- DB schema changes: use raw SQL via `executeSql` (drizzle-kit push requires a TTY).

## Pointers

- Generated API hooks: `lib/api-client-react/src/generated/api.ts`
- Error type shape: `ApiError<T>` — access body via `err.data?.error`, not `err.error`
- Pterodactyl API base: `{panelUrl}/api/client/servers/{serverId}/...`
