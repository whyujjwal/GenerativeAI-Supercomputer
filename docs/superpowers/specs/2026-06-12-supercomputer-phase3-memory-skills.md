# Phase 3 — Memory + Skills

**Date:** 2026-06-12
**Status:** Approved — in implementation
**Depends on:** Phase 1 (agent core), Phase 2 (multi-LLM + plan gate)

## Goal

Give the agent persistent memory (so it remembers brand voice/style and learns from past runs)
and a skills system (reusable, trigger-invoked workflow templates like `/cinematic`,
`/montage`). Both feed the system prompt so the brain is steered without changing the loop's
contract.

## 3.1 Memory (`src/lib/agent/memory.js`)

A `MemoryStore` class backed by `localStorage`, three layers:

- **Working** (`sc_mem_working`): the in-progress task context for the current session —
  `{ brief, lastPlan, generatedAssets:[{kind,url}], updatedAt }`. Set during a run; survives reload.
- **Long-term / brand** (`sc_mem_brand`): user-authored `{ brandVoice, stylePreferences,
  audience, persona, notes }`. Stable across all projects.
- **Episodic** (`sc_mem_episodes`): append-only list of successful runs —
  `{ brief, brain, steps:[{ tool, model, args }], assets:[url], ts }`. Cap to the most recent
  N (e.g. 25); drop oldest.

API:
- `getBrand() / setBrand(obj)`
- `getWorking() / setWorking(obj) / clearWorking()`
- `addEpisode(ep) / getEpisodes(limit?)`
- `buildMemoryContext()` → a compact string for the system prompt: brand block + up to 3 most
  relevant recent episodes (most recent first) summarised as `brief → tools/models used`.
  Returns `''` when nothing is stored.

Pure module, no DOM. Tolerate malformed/missing localStorage (try/catch → defaults).

## 3.2 Skills (`src/lib/agent/skills.js` + `src/lib/agent/builtinSkills.js`)

A skill is JSON:
```
{ id, name, trigger:'/cinematic', description, inputs:'free-text brief',
  guidance:'multi-line instructions appended to the system prompt when invoked',
  steps:[ { tool:'generate_image', notes:'...' }, ... ] }
```

- `builtinSkills.js` exports an array of 3–5 starter skills: `/cinematic` (cinematic image →
  i2v video), `/montage` (multi-shot then stitch guidance), `/product` (product photo pack),
  `/ugc` (creator-style UGC ad), `/portrait-talk` (portrait + audio lipsync).
- `skills.js`:
  - `loadSkills()` → merge built-ins with user skills from `localStorage.sc_skills` (user
    entries override built-ins by `trigger`).
  - `findSkillInBrief(brief)` → if the brief starts with a known `/trigger`, return
    `{ skill, rest }` (rest = brief minus the trigger token); else `null`.
  - `listSkillsForPrompt()` → compact `trigger — description` lines for the system prompt.
  - `saveUserSkill(skill) / deleteUserSkill(trigger)`.

## 3.3 Loop integration (`src/lib/agent/agentLoop.js`)

Backward-compatible additions:
- `Agent` constructor accepts optional `{ memory, skills }`.
- `run(brief)`:
  - If `skills` and `findSkillInBrief(brief)` matches, prepend the skill's `guidance` to the
    system prompt and use `rest` as the effective brief.
  - If `memory`, append `memory.buildMemoryContext()` to the system prompt, and
    `memory.setWorking({ brief, ... })` at start; update generatedAssets as `tool_result`
    events with urls arrive.
  - On successful `done`, if `memory`, call `memory.addEpisode(...)` summarising the run
    (tools/models/args/asset urls) and `clearWorking()`.
- When neither is passed, behaviour is identical to Phase 2.

## 3.4 UI (`src/components/SupercomputerStudio.js`)

- Instantiate `new MemoryStore()` and `loadSkills()`; pass to the `Agent`.
- **Brand panel:** a small ⚙/"Brand" button opening an inline panel with textareas for
  brandVoice / stylePreferences / audience / persona / notes → `memory.setBrand`.
- **Skills affordance:** a "Skills" button listing available skills (trigger + description);
  clicking one inserts its trigger into the input. Show a hint that `/trigger` invokes a skill.
- Keep everything in the existing dark glassmorphism style.

## Constraints

- Additive. New files: `memory.js`, `skills.js`, `builtinSkills.js`. Edits limited to
  `agentLoop.js` (optional, backward-compatible) and `SupercomputerStudio.js`.
- Do not touch `tools.js`, `llmProvider.js` (no API changes needed), `muapi.js`, `models.js`.
- No new npm deps. Pure-JS logic modules stay DOM-free and testable.

## Acceptance criteria

1. `npm run vite:build` passes.
2. Brand panel saves/reloads brand info across page reloads.
3. Typing `/cinematic a moody neon alley` invokes the cinematic skill (its guidance steers the
   plan) with the rest as the brief.
4. After a successful run, an episode is recorded and appears in `buildMemoryContext()` on the
   next run's system prompt.
5. Passing no memory/skills leaves Phase 2 behaviour unchanged.
