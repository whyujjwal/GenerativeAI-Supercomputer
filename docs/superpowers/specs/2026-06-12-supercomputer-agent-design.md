# GenerativeAI Supercomputer — Agent Layer Design

**Date:** 2026-06-12
**Status:** Approved — Phase 1 in implementation
**Owner:** Orchestrated by Claude, coded by cursor-agent

## 1. Vision

Turn the existing multi-model generative studio into an **agentic creative platform**: the
user describes a brief in natural language ("a 15s TikTok ad for my sneakers") and an agent
plans the workflow, picks the best model per step, runs the existing generation tools, checks
results, remembers brand/style, and delivers finished assets. Open-source alternative to
agentic AI creative platforms (e.g. Higgsfield Supercomputer).

We do **not** train foundation models. The 200+ hosted models reachable through `muapi.js`
(plus local inference) are the foundation layer. This project builds the **agentic brain** on
top of them.

## 2. Where it lives

A new **Supercomputer studio** inside the existing standalone Vite app
(`open-generative-ai/`), alongside Image/Video/Cinema/LipSync/Workflow studios. It follows the
existing vanilla-JS component pattern (a function returning a DOM element, see
`src/components/ImageStudio.js`) and reuses `src/lib/muapi.js` for all generation. No backend
in Phases 1–4.

## 3. Architecture — the agent loop

```
User brief
   │
   ▼
AGENT LOOP  (provider-agnostic)
   1. PLAN     LLM decomposes brief → ordered steps
   2. SELECT   LLM picks a model id per step (from the model catalog)
   3. CONFIRM  surface plan + est. credit cost to the user for approval
   4. EXECUTE  LLM emits tool calls; loop runs them against muapi.js
   5. REVIEW   LLM inspects outputs, retries/adjusts on failure
   │
   ▼
TOOLS  (thin wrappers over existing muapi.js methods)
   generate_image · generate_video · generate_i2v · generate_i2i
   process_lipsync · upload_file · list_models
```

The agent never reimplements generation. Tools are declarative wrappers that call the
`MuapiClient` methods already present in `src/lib/muapi.js`.

## 4. Phase 1 scope (this spec)

Build the **agent core as pure logic modules** (no UI yet) under `src/lib/agent/`, plus a
minimal Supercomputer studio shell that exercises it.

### 4.1 Module: `src/lib/agent/llmProvider.js`

Defines the swappable-brain abstraction.

- Export a base class / JSDoc interface `LLMProvider` with a single async method:
  `runWithTools({ system, messages, tools }) -> { text, toolCalls: [{ id, name, args }], finishReason }`
- `messages` is a normalized array `[{ role: 'user'|'assistant'|'tool', content, toolCallId? }]`.
- `tools` is a normalized array `[{ name, description, parameters /* JSON Schema */ }]`.
- Implement **`ClaudeProvider`** (only provider in Phase 1):
  - Calls the Anthropic Messages API directly from the browser.
  - Endpoint: `https://api.anthropic.com/v1/messages`.
  - Headers: `x-api-key: <key>`, `anthropic-version: 2023-06-01`,
    `anthropic-dangerous-direct-browser-access: true`, `content-type: application/json`.
  - Default model id: `claude-opus-4-8`. Make model configurable via constructor.
  - Translate normalized `tools` → Anthropic `tools` format; translate Anthropic
    `tool_use` content blocks → normalized `toolCalls`; map `tool` role messages →
    Anthropic `tool_result` content blocks.
  - API key read from `localStorage` key `anthropic_key` (fallback: constructor arg).
- Phases 2 adds `OpenAIProvider` + `GeminiProvider` behind the same interface — design for it
  now, do not implement them.

### 4.2 Module: `src/lib/agent/tools.js`

Declarative tool registry over `muapi.js`.

- Import the singleton `muapi` from `../muapi.js`.
- Export `buildToolRegistry()` returning `{ definitions, handlers }`:
  - `definitions`: array of `{ name, description, parameters }` (normalized, JSON-Schema params)
    for: `generate_image`, `generate_i2i`, `generate_video`, `generate_i2v`,
    `process_lipsync`, `upload_file`, `list_models`.
  - `handlers`: `{ [name]: async (args) => result }` mapping each tool to the matching
    `muapi` method. Normalize the return to `{ ok, url?, raw?, error? }`.
- `list_models` returns a compact catalog (id, name, kind) from `src/lib/models.js` so the LLM
  can choose models. Keep the payload small (id + name + category only).
- Tool parameter schemas must mirror what the `muapi` methods accept (prompt, model,
  aspect_ratio, image_url, duration, resolution, quality, audio_url, etc.).

### 4.3 Module: `src/lib/agent/agentLoop.js`

The provider-agnostic orchestration loop.

- Export `class Agent { constructor({ provider, registry, onEvent }) }`.
- Method `async run(brief)`:
  1. Seed a system prompt describing the role, the available tools, the model catalog, and the
     plan→confirm→execute→review protocol.
  2. Loop: call `provider.runWithTools(...)`. If it returns `toolCalls`, execute each via
     `registry.handlers`, append `tool` results to messages, continue. If it returns final text
     with no tool calls, stop.
  3. Emit progress through `onEvent(event)` where event is one of:
     `{ type: 'plan'|'tool_start'|'tool_result'|'assistant'|'error'|'done', ... }`.
  4. Guard: max N iterations (default 16) to prevent infinite loops.
- No DOM, no framework imports — pure JS so it is unit-testable.

### 4.4 Minimal UI shell: `src/components/SupercomputerStudio.js`

- Vanilla JS component (function returning a DOM element), matching the existing studio style
  (dark glassmorphism, Tailwind classes already in the app).
- A chat transcript area + a prompt input + send button.
- On send: instantiate `ClaudeProvider` + `buildToolRegistry()` + `Agent`, call `run(brief)`,
  and render each `onEvent` into the transcript (plan, tool calls, generated image/video
  thumbnails, final message).
- A small settings affordance to capture/store the `anthropic_key` in localStorage if missing
  (mirror the existing Muapi key modal pattern; do not block if Muapi key flow already covers it).

### 4.5 Wiring

- Register the route in `src/main.js` (add a `supercomputer` page that imports
  `SupercomputerStudio`).
- Add a nav entry in `src/components/Header.js` (follow the existing nav item pattern).
- Add i18n keys if `src/lib/i18n.js` is used by siblings (follow existing pattern; otherwise
  inline strings).

## 5. Constraints

- **Additive only.** Do not modify `muapi.js`, `models.js`, or existing studios except the two
  wiring touch-points (`main.js`, `Header.js`). New code lives under `src/lib/agent/` and
  `src/components/SupercomputerStudio.js`.
- Keep each module focused and independently testable. No backend. No new heavy dependencies —
  use `fetch` directly. If a tiny helper is needed, write it inline.
- Match existing code style (vanilla JS, ES modules, Tailwind utility classes).

## 6. Acceptance criteria (Phase 1)

1. `npm run dev` (or `electron:dev`) starts without errors.
2. A "Supercomputer" nav item appears and opens the chat studio.
3. With an Anthropic key + Muapi key set, sending "generate an image of a neon cyberpunk cat"
   produces: a visible plan, a `generate_image` tool call, and a rendered image in the
   transcript.
4. The agent loop is provider-agnostic (ClaudeProvider is injected, not hard-wired into the loop).
5. No changes to existing generation behavior in other studios.

## 7. Out of scope (later phases)

- Phase 2: OpenAI + Gemini providers, mid-chat brain swap, credit-cost estimation UI.
- Phase 3: 3-layer memory, skills system.
- Phase 4: AI-employee personas, skill marketplace.
- Phase 5–6: backend, connectors (Slack/Drive/Notion), scheduling, Telegram.
