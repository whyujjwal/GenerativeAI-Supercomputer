# Phase 2 — Swappable Multi-LLM Brain + Plan Confirmation

**Date:** 2026-06-12
**Status:** Approved — in implementation
**Depends on:** Phase 1 (agent core + Supercomputer studio)

## Goal

Make the agent brain swappable between Claude, OpenAI, and Gemini — mid-conversation — behind
the existing `LLMProvider` interface, and add a plan-confirmation gate so the user approves the
plan before generation tools run (and credits are spent).

## 2.1 Providers (`src/lib/agent/llmProvider.js`)

Add two classes alongside the existing `ClaudeProvider`, each extending `LLMProvider` and
returning the SAME normalized `LLMResult` shape `{ text, toolCalls:[{id,name,args}], finishReason }`
so `agentLoop.js` works unchanged.

### `OpenAIProvider`
- Endpoint: `POST https://api.openai.com/v1/chat/completions`.
- Auth: `Authorization: Bearer <key>`; key from `localStorage.openai_key` (or constructor arg).
- Default model: `gpt-5.2` (configurable via constructor `{ model }`).
- Translate normalized `tools` → OpenAI `tools` (`{ type:'function', function:{ name, description, parameters } }`).
- Translate normalized messages → OpenAI messages:
  - `user`/`assistant` text → `{ role, content }`.
  - assistant with `toolCalls` → `{ role:'assistant', content, tool_calls:[{ id, type:'function', function:{ name, arguments: JSON.stringify(args) } }] }`.
  - `tool` role → `{ role:'tool', tool_call_id, content }`.
  - `system` passed as the first `{ role:'system' }` message.
- Parse response `choices[0].message`: text from `content`; `tool_calls[]` → normalized
  `toolCalls` (JSON.parse the `function.arguments`). `finishReason` from `choices[0].finish_reason`.

### `GeminiProvider`
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<key>`.
- Auth: API key in query string; key from `localStorage.gemini_key` (or constructor arg).
- Default model: `gemini-3.1-pro` (configurable).
- `system` → `systemInstruction: { parts:[{ text }] }`.
- Tools → `tools:[{ functionDeclarations:[{ name, description, parameters }] }]`.
- Messages → `contents[]`: roles map `user`→`user`, `assistant`→`model`; assistant `toolCalls`
  → parts `{ functionCall:{ name, args } }`; `tool` role → `{ role:'user', parts:[{ functionResponse:{ name, response:{ result } } }] }`.
- Parse `candidates[0].content.parts`: collect `text` parts → text; `functionCall` parts →
  normalized `toolCalls` (synthesize an `id` like `gemini-<index>` since Gemini has no call id).
  `finishReason` from `candidates[0].finishReason`.

### Factory
- Export `createProvider(name, options)` returning the right provider for
  `name ∈ {'claude','openai','gemini'}`. Default `'claude'`.
- Export `PROVIDERS = [{ id, label, keyStorageKey, defaultModel }]` metadata for the UI.

## 2.2 Brain selector UI (`src/components/SupercomputerStudio.js`)

- Add a small dropdown (in the input bar or header of the studio) listing Claude / OpenAI /
  Gemini. Selection persists to `localStorage.supercomputer_brain`.
- On send, instantiate the provider via `createProvider(selectedBrain)` instead of hardcoding
  `ClaudeProvider`. Swapping mid-chat affects the next send.
- The inline API-key banner must adapt to the selected brain (prompt for the matching key:
  `anthropic_key` / `openai_key` / `gemini_key`).

## 2.3 Plan-confirmation gate (`src/lib/agent/agentLoop.js` + UI)

- Add an `Agent` option `confirmPlan?: (plan) => Promise<boolean>`.
- When the model returns its FIRST batch of tool calls, if `confirmPlan` is provided, call it
  with `{ text, toolCalls }` and await approval BEFORE executing handlers. If it resolves
  `false`, emit `{ type:'cancelled' }`, stop the loop, and return.
- UI implements `confirmPlan` by rendering an Approve / Cancel control inline and resolving the
  promise on click. Subsequent batches in the same run do not re-prompt (only the first).
- Credit-cost display: best-effort only. If a selected model has no known price, show
  "cost shown on the provider" — do NOT block. (Precise per-model pricing is a later phase.)

## Constraints

- Additive. Only edit `llmProvider.js`, `agentLoop.js` (add the optional gate — keep existing
  behavior when `confirmPlan` is absent), and `SupercomputerStudio.js`. Do not touch `tools.js`,
  `muapi.js`, `models.js`, other studios.
- `agentLoop.js` must remain provider-agnostic and backward compatible.

## Acceptance criteria

1. `npm run vite:build` passes.
2. The studio shows a brain selector; switching it and sending uses the right provider/key.
3. With only an OpenAI key set and brain=OpenAI, a brief produces a plan + tool calls + result.
4. Same for Gemini.
5. The plan-confirm gate shows Approve/Cancel before any generation runs; Cancel halts without
   calling tools.
6. Existing Claude path still works unchanged.
