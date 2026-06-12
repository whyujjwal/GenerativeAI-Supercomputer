# Phase 7 — Theming + Model Flexibility

**Date:** 2026-06-12
**Status:** Approved — in implementation
**Depends on:** Phases 1–6

## Goals

1. **Theme switcher** — multiple presets (Midnight, Light, Sunset, Mono), live-switchable in the
   header, persisted, driven by CSS variables.
2. **Model flexibility** — use any supported LLM provider + key, choose the specific LLM model,
   and pin preferred image and video models (with custom IDs and an "Auto — agent picks" default).

## Part A — Theming

### Token system (CSS variables, RGB channels for alpha support)
Define semantic tokens per theme on `html[data-theme="<id>"]` (and a `:root` default):

```
--bg            app background
--surface       panels / cards
--surface-2     raised surface (hover, chips)
--border        borders / dividers
--text          primary text
--text-dim      secondary text
--text-muted    muted text
--accent        primary accent
--accent-contrast  text/icon color on accent fills
--glow          accent glow color (rgb)
```

Store each as space-separated RGB channels, e.g. `--accent: 34 211 238;` so Tailwind can do
`rgb(var(--accent) / <alpha-value>)` and opacity modifiers (`bg-accent/20`) keep working.

### Presets
- **midnight** (default, = current): bg `5 5 5`, surface `15 15 18`, accent cyan `34 211 238`, text `255 255 255`, text-dim `161 161 170`.
- **light**: bg `250 250 250`, surface `255 255 255`, surface-2 `244 244 245`, border `228 228 231`, text `24 24 27`, text-dim `82 82 91`, accent indigo `99 102 241`, accent-contrast `255 255 255`.
- **sunset**: bg `26 17 16`, surface `36 23 21`, accent amber `245 158 11`, text `253 244 231`, text-dim `201 169 143`.
- **mono**: bg `12 12 14`, surface `22 22 24`, accent violet `139 92 246`, text `237 237 237`, text-dim `154 154 162`.

### `src/lib/theme.js`
- `THEMES = [{ id, name }]`, `applyTheme(id)` sets `document.documentElement.dataset.theme`,
  `getTheme()` / `setTheme(id)` persist to `localStorage.sc_theme` (default `midnight`).
- Export the preset variable maps (or define them in CSS — see below).

### CSS (`src/styles/variables.css` or a new `themes.css` imported by `style.css`)
Define `:root` / `[data-theme="..."]` blocks with the RGB-channel vars above for all 4 presets.

### `tailwind.config.js`
Map color tokens to the variables so the WHOLE app shifts with the theme:
`'app-bg' → rgb(var(--bg)/<alpha-value>)`, `'panel-bg'/'card-bg' → var(--surface)`,
`primary → var(--accent)`, `secondary → var(--text-dim)`, `muted → var(--text-muted)`, and ADD
`surface`, `surface-2`, `border-token`, `text-base`, `text-dim`, `accent`, `accent-contrast`.
Keep `shadow-glow` but base it on `--glow`.

### Component migration (Supercomputer surfaces)
In **`src/components/SupercomputerStudio.js`** and **`src/components/Header.js`**, replace
hardcoded colors with tokens so both themes (incl. light) render correctly:
- `text-white` → `text-base`; `text-secondary` stays (now themed); raw `text-[#xxx]` → tokens.
- `bg-white/5`, `bg-white/[0.02]` → `bg-surface-2` (or `bg-surface`); `bg-black/40`, `bg-[#111]`,
  `bg-app-bg` → `bg-bg` / `bg-surface` as appropriate.
- `bg-primary` → `bg-accent`, `text-primary` → `text-accent`, text on accent → `text-accent-contrast`.
- `border-white/10`, `border-white/5` → `border-border-token`.
Keep the glassmorphism feel where it still reads well (backdrop-blur is fine in all themes).

### Wiring
- `src/main.js`: call `applyTheme(getTheme())` on boot (before first render).
- `src/components/Header.js`: a compact theme switcher (segmented control or dropdown) listing
  THEMES; selecting one calls `setTheme` + `applyTheme` live.

## Part B — Model Flexibility

### LLM model choice
- `llmProvider.js` already accepts `{ model }`. Ensure `createProvider(name, { model })` is used.
- `PROVIDERS` keep `defaultModel`; add a small `knownModels` list per provider for suggestions
  (free-text still allowed). Claude: `claude-opus-4-8`, `claude-sonnet-4-6`. OpenAI: `gpt-5.2`,
  `gpt-5.2-mini`. Gemini: `gemini-3.1-pro`, `gemini-2.5-flash`. (Suggestions only — any string allowed.)

### Image / video model pinning
- `agentLoop.js`: accept optional `modelPrefs = { image, video }`. When set, append to the system
  prompt: *"Preferred models — image: <id>, video: <id>. Use these unless the user explicitly
  asks for a different model."* No prefs → unchanged.

### Settings panel (`src/components/SupercomputerStudio.js`)
A **Settings** panel (button near the brain selector, or a tab in the existing Marketplace
modal) with:
- **LLM**: provider select (Claude/OpenAI/Gemini) + model field (datalist of `knownModels`,
  free-text allowed) + API key field — per provider, persisted
  (`localStorage`: `sc_model_<provider>`, existing key storage keys).
- **Image model**: a select populated from `t2iModels` (id+name) + an "Auto (agent picks)" option
  + free-text custom id. Persist to `localStorage.sc_image_model`.
- **Video model**: same from `t2vModels`. Persist to `localStorage.sc_video_model`.
- On send: pass the chosen LLM model to `createProvider(brain, { model })` and pass
  `modelPrefs` (omit keys set to Auto) to the `Agent`.

## Constraints

- Additive / backward compatible. No model prefs + default theme (midnight) → behaves like Phase 6.
- New files: `src/lib/theme.js`, optional `src/styles/themes.css`. Edits: `tailwind.config.js`,
  `src/styles/variables.css` (or import themes.css via `style.css`), `src/main.js`,
  `src/components/Header.js`, `src/components/SupercomputerStudio.js`, `src/lib/agent/agentLoop.js`,
  `src/lib/agent/llmProvider.js`. Do NOT change `tools.js`, `muapi.js`, `models.js`, server, or
  other studios' behavior.
- No new npm deps. `npm run vite:build` must stay green.

## Acceptance criteria

1. Build passes; switching themes in the header restyles the Supercomputer studio live and
   persists across reload; the Light theme is fully legible (no white-on-white).
2. The user can pick any provider, type any model id, and it is used for the run.
3. Pinning an image/video model makes the agent prefer it; "Auto" restores agent choice.
4. Defaults (midnight + Auto) reproduce Phase 6 behavior.
