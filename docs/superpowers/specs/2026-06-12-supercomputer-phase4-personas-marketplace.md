# Phase 4 — AI-Employee Personas + Skill Marketplace

**Date:** 2026-06-12
**Status:** Approved — in implementation
**Depends on:** Phases 1–3 (agent core, multi-LLM, memory + skills)

## Goal

Ship pre-built **AI-employee personas** (Product Photographer, Motion Designer, Podcast
Producer, Cartoon Animator, Ad Director) that each bundle a role persona + a curated skill set,
and a **marketplace** UI to browse/activate personas and install skills. Personas steer the
agent's system prompt; the marketplace makes skills discoverable and installable.

## 4.1 Personas (`src/lib/agent/personas.js`)

A persona is plain data:
```
{ id, name, emoji, tagline, description,
  systemPersona: 'multi-line role instructions prepended to the system prompt',
  skills: ['/product', '/ugc'],          // relevant skill triggers
  preferredModels?: { image?, video? } } // optional hints
```

- `BUILTIN_PERSONAS`: the 5 personas above, each with a focused `systemPersona` and its
  relevant skill triggers (reuse Phase 3 skill triggers where they fit).
- `listPersonas()` → all personas.
- `getPersonaById(id)`.
- `getActivePersona()` / `setActivePersona(id)` / `clearActivePersona()` — persisted to
  `localStorage.sc_active_persona` (store id; return the resolved persona object or null).
- `buildPersonaContext(persona)` → string for the system prompt (role + which skills it favors).
  Returns `''` for null.

DOM-free, try/catch tolerant.

## 4.2 Marketplace catalog (`src/lib/agent/marketplace.js`)

- `COMMUNITY_SKILLS`: a static array of extra skills (same shape as Phase 3 skills) beyond the
  built-ins — e.g. `/unbox`, `/kinetic-type`, `/tryon`, `/thumbnail`, `/data-viz`.
- `listMarketplaceSkills()` → built-in skills + community skills, each annotated
  `{ ...skill, installed: boolean, builtin: boolean }` (installed = present in user skills).
- `installSkill(skill)` → delegates to `saveUserSkill` (from skills.js).
- `uninstallSkill(trigger)` → delegates to `deleteUserSkill`.
- `listMarketplacePersonas()` → `listPersonas()` annotated with `active: boolean`.

## 4.3 Loop integration (`src/lib/agent/agentLoop.js`)

Backward-compatible:
- `Agent` accepts optional `persona`.
- In `run()`, build the system prompt in this order:
  `personaContext` (if any) → skill guidance (if matched) → base system → memory context.
- No `persona` → unchanged from Phase 3.

## 4.4 UI (`src/components/SupercomputerStudio.js`)

- **Persona switcher:** a control near the brain selector showing the active persona
  (emoji + name, or "No persona"). Selecting one calls `setActivePersona` and is passed to the
  `Agent` on the next send. Active persona also seeds the input placeholder with a hint.
- **Marketplace modal:** a "Marketplace" button opening a modal with two tabs:
  - **Personas** — cards (emoji, name, tagline, skills) with an Activate / Active toggle.
  - **Skills** — list from `listMarketplaceSkills()` with Install / Installed toggle; built-ins
    marked. Installing makes the `/trigger` available immediately.
- Match existing dark glassmorphism. Reuse the Phase 3 Skills/Brand panel patterns.

## Constraints

- Additive. New files: `personas.js`, `marketplace.js`. Edits limited to `agentLoop.js`
  (optional persona, backward compatible) and `SupercomputerStudio.js`.
- Do not touch `tools.js`, `llmProvider.js`, `memory.js`, `skills.js` public APIs (you may
  IMPORT from skills.js), `muapi.js`, `models.js`, other studios.
- No new npm deps. Logic modules DOM-free and testable.

## Acceptance criteria

1. `npm run vite:build` passes.
2. Activating "Product Photographer" persists across reload and prepends its persona to the
   system prompt on the next run.
3. The marketplace lists personas + skills; installing a community skill makes its `/trigger`
   work in the next brief.
4. No persona selected → Phase 3 behaviour unchanged.
