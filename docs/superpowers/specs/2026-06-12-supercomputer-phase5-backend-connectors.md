# Phase 5 — Node/Express Backend + Connectors

**Date:** 2026-06-12
**Status:** Approved — in implementation
**Depends on:** Phases 1–4 (client-side agent platform)

## Goal

Add a self-hostable **Node/Express backend** that holds OAuth secrets and brokers connector
actions (Slack, Google Drive, Gmail, Notion), and wire the client agent to use connectors as
tools. This is the first server-side component; it is optional — when the backend URL is not
configured, the app behaves exactly as Phase 4.

## Architecture

```
Client (Electron/Vite app)                 server/  (Node + Express)
  Agent loop  ──connector tool call──▶  POST /api/connectors/:provider/:action
  backendClient.js (HTTP)                  │  loads stored OAuth token (decrypt)
  Connectors UI (connect/status)           │  calls provider API
                                           ▼  returns normalized result
  OAuth: opens /api/oauth/:provider  ◀──▶  /api/oauth/:provider/callback (stores token)
```

- Client secrets and user tokens live ONLY on the server. The client never sees them.
- The agent gains connector tools only when `backendClient` reports the backend reachable AND
  the relevant provider connected.

## 5a — The server (`server/`)

Self-contained workspace with its own `package.json` (deps: `express`, `cors`,
`cookie-session` or `express-session`, `node-fetch` if needed — prefer global `fetch` on Node
18+). Layout:

```
server/
  package.json
  .env.example
  src/
    index.js            # express app bootstrap, CORS, routes, listen
    config.js           # reads env: PORT, APP_ORIGIN, TOKEN_ENC_KEY, per-provider client id/secret/redirect
    tokenStore.js       # encrypted-at-rest token persistence (AES-256-GCM via TOKEN_ENC_KEY) → server/.data/tokens.json
    crypto.js           # encrypt/decrypt helpers
    oauth/
      index.js          # GET /api/oauth/:provider (redirect to provider), GET /api/oauth/:provider/callback (exchange code, store token)
      providers.js      # per-provider OAuth config: authUrl, tokenUrl, scopes, userinfo
    connectors/
      index.js          # POST /api/connectors/:provider/:action dispatcher + GET /api/connectors/status
      slack.js          # postMessage(channel, text)
      google.js         # drive.upload(name, mimeType, contentUrl), gmail.send(to, subject, body)
      notion.js         # createPage(parentId, title, contentMarkdown)
    util/http.js        # small fetch helpers + error normalization
```

Endpoints:
- `GET  /api/health` → `{ ok:true }`.
- `GET  /api/oauth/:provider` → 302 to the provider's consent screen (state param, redirect_uri from config).
- `GET  /api/oauth/:provider/callback` → exchange code → store encrypted token → redirect back to `APP_ORIGIN` with `?connected=:provider`.
- `GET  /api/connectors/status` → `{ slack:bool, google:bool, notion:bool }` (which have a stored token).
- `POST /api/connectors/:provider/:action` (JSON body) → perform action, return `{ ok, result?, error? }`.
- `POST /api/connectors/:provider/disconnect` → delete stored token.

Security:
- CORS limited to `APP_ORIGIN` (config; default `http://localhost:5173` for Vite + the Electron `file://` origin handled permissively only in dev).
- Tokens AES-256-GCM encrypted at rest with `TOKEN_ENC_KEY` (32-byte hex/base64). Refuse to start if missing in production.
- Never log secrets or tokens.
- `.env.example` documents every variable; real `.env` is gitignored.

Provider notes (implement the standard Authorization-Code flow; exact app registration is the
self-hoster's responsibility, documented in `.env.example`):
- **Slack**: OAuth v2, scope `chat:write`; action `postMessage`.
- **Google**: scopes `drive.file` + `gmail.send`; actions `drive.upload`, `gmail.send`. Use a
  refresh token; refresh when expired.
- **Notion**: OAuth, action `createPage`.

Root `package.json` scripts (add, do not break existing): `"server:dev"` and `"server:start"`
delegating into `server/` (e.g. `npm --prefix server run dev`). Add `server` to `.gitignore`
only for `server/.data` and `server/.env` (NOT the source).

## 5b — Client integration

- `src/lib/agent/backendClient.js` — reads backend base URL from `localStorage.sc_backend_url`
  (default empty = disabled). Methods: `isConfigured()`, `health()`, `status()`,
  `call(provider, action, body)`, `oauthUrl(provider)`, `disconnect(provider)`. All no-op/return
  disabled when not configured.
- Extend tooling: a new `buildConnectorTools(status)` (in `src/lib/agent/connectorTools.js`)
  returning tool definitions + handlers for the CONNECTED providers only:
  `slack_post_message`, `drive_upload_file`, `gmail_send_email`, `notion_create_page`. Handlers
  call `backendClient.call(...)`. Merge these into the registry passed to the `Agent` when the
  backend is reachable. Do NOT modify `tools.js`; merge at the studio layer.
- `SupercomputerStudio.js`: a **Connectors** panel (in the marketplace modal or its own button)
  showing each provider with Connect (opens `oauthUrl`) / Connected + Disconnect, plus a field
  to set the backend URL. On load, if `?connected=` is present, refresh status.

## Constraints

- Additive. New: `server/**`, `src/lib/agent/backendClient.js`, `src/lib/agent/connectorTools.js`,
  edits to `SupercomputerStudio.js` and root `package.json` scripts + `.gitignore`.
- Do not modify the existing agent core modules' public APIs, `muapi.js`, `models.js`, other
  studios. The Vite build must remain green and must NOT bundle the server.
- No secrets in the client bundle.

## Acceptance criteria

1. `npm run vite:build` passes (client unaffected when backend unconfigured).
2. `server/` installs and `npm run server:dev` boots, `GET /api/health` returns `{ok:true}`.
3. With backend URL set, the Connectors panel shows status and Connect opens the OAuth flow.
4. When a provider is connected, the agent exposes its connector tool and can invoke it through
   the backend (verified with a stubbed/mock provider call if real OAuth apps aren't registered).
5. Backend unconfigured → identical to Phase 4.
