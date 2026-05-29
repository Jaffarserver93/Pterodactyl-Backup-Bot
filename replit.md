# PteroBot — Pterodactyl Panel Backup Bot

Automated Pterodactyl Panel backup bot with real-time browser preview, Telegram MTProto notifications, and a premium mobile-first dark terminal UI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, paths: `/api`, `/socket.io`)
- `pnpm --filter @workspace/ptero-backup-bot run dev` — run the frontend (port $PORT, path: `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Socket.io 4 (real-time)
- Browser automation: Puppeteer-core (Chrome headless)
- Telegram: GramJS/telegram (MTProto, volatile in-memory, no DB)
- Frontend: React + Vite + Tailwind v4 + Shadcn/ui
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/lib/bot-state.ts` — in-memory bot state
- `artifacts/api-server/src/lib/puppeteer-engine.ts` — Chrome automation (login, backup click, screenshot stream)
- `artifacts/api-server/src/lib/telegram-client.ts` — GramJS Telegram MTProto client
- `artifacts/api-server/src/lib/socket.ts` — Socket.io server setup + event emitters
- `artifacts/api-server/src/routes/bot.ts` — bot REST endpoints
- `artifacts/api-server/src/routes/telegram.ts` — Telegram REST endpoints
- `artifacts/ptero-backup-bot/src/components/Dashboard.tsx` — status, live preview, terminal log feed
- `artifacts/ptero-backup-bot/src/components/Configuration.tsx` — config form
- `artifacts/ptero-backup-bot/src/components/Telegram.tsx` — Telegram auth flow
- `artifacts/ptero-backup-bot/src/hooks/use-socket.ts` — Socket.io React hook
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)

## Architecture decisions

- **Volatile Telegram state**: GramJS session is held in-memory only, never persisted. Reconnect required after server restart.
- **Puppeteer-core + manual Chrome**: Uses `puppeteer-core` with a manually downloaded Chrome binary at `/home/runner/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome`. In production, Chrome must be available at a path set in `puppeteer-engine.ts`.
- **`telegram` package externalized from esbuild**: GramJS/`telegram` depends on `websocket` which requires native `bufferutil`. Both are excluded from the esbuild bundle so pnpm's virtual store symlinks resolve them at runtime.
- **Socket.io at `/socket.io` path**: Added to `api-server` artifact.toml so the reverse proxy passes WebSocket upgrade requests through.
- **Contract-first API**: All endpoints are defined in `lib/api-spec/openapi.yaml` first; React Query hooks and Zod schemas are generated from it via Orval.

## Product

- **STATUS tab**: Live bot status (running/stopped), backup count, uptime, current action. Real-time browser preview via 100ms JPEG screenshot stream over Socket.io. Terminal log feed with level-coded colors. Start/Stop toggle.
- **CONFIG tab**: Form for Panel URL, credentials, Server ID, backup interval. Saved to volatile in-memory state.
- **TELEGRAM tab**: Multi-step Telegram MTProto auth (API ID + Hash + Phone → OTP → Connected). Shows live connection status badge. Send backup notifications to Saved Messages.

## User preferences

- Mobile-first layout, max 480px centered, one-handed use
- Dark mode only — deep slate/zinc with emerald accent
- Monospace font (JetBrains Mono) for all status/log text
- No emojis in UI text

## Gotchas

- `pnpm run typecheck` uses `tsc --noEmit`; `pnpm run build` needs `PORT` + `BASE_PATH` env vars (set by workflows) — don't run build from bash.
- Chrome binary at `/home/runner/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome` requires system libraries (libglib, X11, etc.) that may not be available in all environments. In production deploy, install Chromium via system package manager.
- The `telegram`/`websocket`/`bufferutil` chain must remain in esbuild's `external` list in `build.mjs` to avoid native module resolution failures.
- `@apply dark` is invalid in Tailwind v4 — always use `class="dark"` on the HTML element instead.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Generated API hooks: `lib/api-client-react/src/generated/api.ts`
- Error type shape: `ApiError<T>` — access body via `err.data?.error`, not `err.error`
