# Phase 8 — Local Agent Studio + Local Workflow Studio

**Date:** 2026-06-12
**Status:** Approved — in implementation
**Depends on:** Phases 1–7

## Goal

Make the **Agent** and **Workflow** studios fully functional **locally** in the standalone
Vite/Electron app. Today they are placeholders that say "available in the web app at
open-generative-ai.com". Everything must live locally — no website dependency. Both reuse the
existing client agent core (`src/lib/agent/*`) and Muapi client (`src/lib/muapi.js`).

Remove the `*.webOnly` placeholder strings from these two studios.

## 8a — Local Agent Studio (`src/components/AgentStudio.js`, replace placeholder)

A builder + runner for user-defined agents, all in localStorage.

### Data
- `localStorage.sc_custom_agents` → array of:
  `{ id, name, emoji, instructions, brain, model, tools, imageModel, videoModel }`
  - `instructions` — extra system prompt prepended (like a persona)
  - `brain` — 'claude' | 'openai' | 'gemini'; `model` — optional model id
  - `tools` — `'all'` or an array of tool names to expose
  - `imageModel` / `videoModel` — optional preferred model ids ('' = Auto)
- `src/lib/agentStore.js` — `listAgents/getAgent/saveAgent/deleteAgent` helpers (DOM-free).

### UI (themed tokens only — text-fg/text-dim/bg-surface/bg-surface-2/border-border-token/bg-accent/text-accent/text-accent-contrast)
- Two-pane: left = saved agents list + "New Agent"; right = editor or run view (tabs: Edit / Run).
- **Editor:** name, emoji, instructions textarea, brain select, model input (datalist of
  `knownModels` from PROVIDERS, free-text), tool checkboxes (from `buildToolRegistry().definitions`
  plus connector tools when backend is configured), optional image/video model selects
  (from `t2iModels`/`t2vModels`, Auto default). Save / Delete.
- **Run:** a chat (prompt input + transcript) that, on send, builds:
  - `createProvider(agent.brain, { model: agent.model || undefined })`
  - a registry filtered to `agent.tools` (or full registry if `'all'`); merge connector tools if
    backend configured
  - `new Agent({ provider, registry, persona: { systemPersona: agent.instructions }, modelPrefs,
    confirmPlan?, onEvent })` and `run(brief)`
  - render the same event types as the Supercomputer studio (plan/tool_start/tool_result/
    assistant/error/done) in a compact transcript.

### Wiring
- No nav change needed (the `agents` route already mounts `AgentStudio`). Ensure it renders in
  all themes.

## 8b — Local Workflow Studio (`src/components/WorkflowStudio.js`, replace placeholder)

A local, sequential multi-step generation pipeline.

### Data
- `localStorage.sc_workflows` → array of `{ id, name, steps: [...] }`.
- A step: `{ id, type, model, prompt, params, inputFrom }`
  - `type` — 'image' | 'i2i' | 'video' | 'i2v' | 'lipsync'
  - `model` — model id (from the matching catalog)
  - `prompt` — text (supports referencing prior step output, see runner)
  - `params` — `{ aspect_ratio?, duration?, resolution?, quality?, audio_url? }`
  - `inputFrom` — `null` or a previous step id whose output URL feeds this step's image/start-frame
- `src/lib/workflowStore.js` — `listWorkflows/getWorkflow/saveWorkflow/deleteWorkflow` (DOM-free).

### UI (themed tokens only)
- Left = saved workflows list + "New Workflow"; right = builder + run.
- **Builder:** ordered step cards; per step pick type → model (dropdown from the matching catalog:
  `t2iModels`/`i2iModels`/`t2vModels`/`i2vModels`/`lipsyncModels`), prompt, params, and an
  "input from" select (None or a previous step). Add / reorder (up/down) / delete steps. Save / Delete.
- **Run:** a "Run workflow" button executes steps in order; show a per-step status row
  (pending/running/done/error) with the rendered image/video result inline.

### Runner (`src/lib/workflowRunner.js`, DOM-free)
- `runWorkflow(workflow, { onStep })` executes steps sequentially using the `muapi` singleton:
  - image → `muapi.generateImage`, i2i → `generateI2I`, video → `generateVideo`,
    i2v → `generateI2V`, lipsync → `processLipSync`.
  - If `inputFrom` is set, pass the referenced step's output URL as `image_url` (or start frame
    for i2v / portrait for lipsync). Also support `{{stepN.url}}` token substitution in prompt.
  - Emit `onStep({ stepId, status, url?, error? })`; collect `{ results: [...] }`.
  - Stop the chain on a failed step (mark remaining skipped), return partial results.

## Constraints

- Additive. Replace the two placeholder components; new helper files
  `agentStore.js`, `workflowStore.js`, `workflowRunner.js` under `src/lib/`. May import from
  `src/lib/agent/*`, `src/lib/muapi.js`, `src/lib/models.js`, `src/lib/agent/backendClient.js` +
  `connectorTools.js`. Do NOT modify the agent core, muapi, models, server, or other studios.
- New UI uses ONLY theme tokens (no hardcoded white/black) so it works in all 4 themes.
- No new npm deps. `npm run vite:build` must pass.
- Remove `agents.webOnly` / `workflows.webOnly` usage from these components (the i18n keys may stay
  unused or be repurposed).

## Acceptance criteria

1. Build passes. The Agent and Workflow studios render real local UIs (no "web app" message).
2. Create a custom agent, save it, run a brief — it plans + calls tools + renders results, locally.
3. Build a 2-step workflow (e.g. text→image then image→video), run it — step 2 consumes step 1's
   output; both results render.
4. Saved agents/workflows persist across reload.
5. Both studios are legible in all 4 themes.
