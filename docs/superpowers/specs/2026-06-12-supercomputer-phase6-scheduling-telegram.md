# Phase 6 — Scheduling + Telegram (server-side agent runtime)

**Date:** 2026-06-12
**Status:** Approved — in implementation
**Depends on:** Phase 5 (backend + connectors)

## Goal

Run creative briefs **unattended**: a server-side agent runtime executes briefs on a cron
schedule (24/7, client closed) and via a **Telegram** bot. Results can be delivered to
connectors (Slack/Drive/Notion/Gmail) or back to Telegram.

## Why a server-side runtime

The client agent modules (`llmProvider.js`, `tools.js`, `muapi.js`, `skills.js`) read browser
globals (`localStorage`, `window`, `import.meta.env`) for keys/config, so they are not
Node-runnable as-is. Phase 6 adds a **Node-native runtime** under `server/src/agent/` that
mirrors the same loop/provider/tool logic but takes keys + config by injection. The orchestration
contract (plan → execute → review, normalized tool calls) is identical, so behaviour matches the
client.

## 6a — Server agent runtime + scheduling

### `server/src/agent/` (Node-native, config-injected)
- `providers.js` — `runWithTools({ provider, model, system, messages, tools, keys })` for
  `claude` / `openai` / `gemini`. Same request/response translation as the client
  `llmProvider.js`, but Node `fetch` and keys from `config.agentKeys`.
- `muapiClient.js` — Node Muapi client (submit → poll) keyed by `config.muapiKey`. Methods for
  the generation actions used by tools.
- `tools.js` — `buildServerToolRegistry()` → generation tool defs/handlers (wrap
  `muapiClient`) MERGED with the existing connector handlers (import from `../connectors`). So a
  scheduled brief can generate AND post to Slack/Drive/etc.
- `loop.js` — `runAgentLoop({ brief, system, registry, providerCfg, maxIterations })` →
  `{ text, assets:[url], steps:[] }`. No browser deps.
- `runner.js` — `runBrief({ brief, brain, persona, deliver })`: assembles system prompt
  (persona + base + connector tool listing), runs the loop, returns a summary + assets, and if
  `deliver` is set routes the assets to a connector or Telegram.

### Config additions (`config.js` + `.env.example`)
- `MUAPI_KEY`, and per-brain keys `ANTHROPIC_KEY` / `OPENAI_KEY` / `GEMINI_KEY` (server-side,
  for unattended runs). Document that scheduling/Telegram require these.

### Scheduling (`server/src/schedules/`)
- New dep: `node-cron`.
- `store.js` — persist `server/.data/schedules.json`:
  `{ id, name, brief, cron, brain, persona, deliver, enabled, lastRun, lastStatus, createdAt }`.
- `index.js` — REST: `GET /api/schedules`, `POST /api/schedules`, `PUT /api/schedules/:id`,
  `DELETE /api/schedules/:id`, `POST /api/schedules/:id/run` (run now).
- `scheduler.js` — on boot, register all enabled schedules with `node-cron`; re-register on
  CRUD changes; each trigger calls `runner.runBrief(...)`, updates `lastRun`/`lastStatus`.
  Validate cron strings; skip+log invalid ones. Guard against overlapping runs of the same job.

## 6b — Telegram + client UI

### Telegram (`server/src/telegram/`)
- Config: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
- `webhook.js` — `POST /api/telegram/webhook` (verify `X-Telegram-Bot-Api-Secret-Token` against
  `TELEGRAM_WEBHOOK_SECRET`); parse the message; treat text as a brief (support a `/brain` and
  `/persona` prefix); call `runner.runBrief`; reply via Telegram `sendMessage` and
  `sendPhoto`/`sendVideo` for assets.
- `client.js` — minimal Telegram API helpers (sendMessage/sendPhoto/sendVideo).
- `scripts/set-telegram-webhook.js` — one-off helper to register the webhook URL.

### Client UI (`src/components/SupercomputerStudio.js` + `backendClient.js`)
- `backendClient.js`: add `listSchedules()`, `createSchedule()`, `updateSchedule()`,
  `deleteSchedule()`, `runSchedule(id)` (all no-op/disabled when backend unconfigured).
- A **Schedules** panel: list schedules (name, cron, brain, enabled, lastRun/status), create/
  edit/delete, enable toggle, "Run now". A short cron helper (presets: daily 9am, hourly, weekly).
- Surface that scheduling/Telegram need server-side keys configured.

## Constraints

- Server may add `node-cron`. Client adds NO new deps.
- Additive: new files under `server/src/agent`, `server/src/schedules`, `server/src/telegram`,
  `server/scripts`; edits to `server/src/index.js` (mount routers + start scheduler),
  `server/src/config.js`, `server/.env.example`, and client `backendClient.js` +
  `SupercomputerStudio.js`. Do NOT change the client agent core or other studios.
- Never log secrets/tokens. Backend unconfigured → client identical to Phase 5.

## Acceptance criteria

1. `npm run vite:build` passes; `server` installs (incl. node-cron) and boots.
2. `POST /api/schedules` creates a schedule; it registers with node-cron; `POST
   /api/schedules/:id/run` executes `runBrief` and returns a summary (mockable without real keys).
3. With server keys set, a scheduled brief generates an asset unattended and (if `deliver`)
   routes it to a connector.
4. Telegram webhook accepts a verified message, runs the brief, and replies with the result.
5. Client Schedules panel performs full CRUD against the server.
6. Backend unconfigured → client behaves exactly as Phase 5.
