# GenerativeAI Supercomputer

> The open-source alternative to agentic AI creative platforms — a single chat that plans your creative brief, picks the right models, runs them, and delivers production-ready images, video, audio, and full campaigns.

**Status:** 🚧 Early development. Building an agentic orchestration layer on top of a multi-model generative studio.

## What this is

Most generative tools make *you* the orchestrator: pick a model, write a prompt, download, repeat. This project flips that — you describe what you want ("a 15s TikTok ad for my sneakers"), and an **agent** plans the workflow, selects the best models for each step, chains them together, checks the results, remembers your brand, and hands back finished assets.

It's built as a creative studio shell (200+ hosted image/video/audio/lipsync models) plus an agentic "Supercomputer" brain layered on top.

## Foundation: the studio

The studio provides the model access and generation primitives the agent orchestrates:

- **Image Studio** — text-to-image & image-to-image across 100+ models
- **Video Studio** — text-to-video & image-to-video
- **Lip Sync Studio** — audio-driven talking-head and video lipsync
- **Cinema Studio** — cinematic shots with pro camera controls
- **Workflow Studio** — node-based multi-step pipelines
- **Local inference** (desktop) — sd.cpp (bundled) and Wan2GP (BYO server)

Hosted generation runs through [Muapi.ai](https://muapi.ai); local inference runs on-device.

## The Supercomputer layer (in progress)

A new agentic studio that turns a natural-language brief into finished work:

- **Agent brain** — swappable between Claude, GPT, and Gemini
- **Orchestrator** — routes each step to the best-fit model
- **Memory** — persistent brand voice, style, and past-work context
- **Skills** — installable, reusable workflows (`/cinematic`, `/montage`, …)
- **AI employees** — task-specialized agent personas
- _(later)_ connectors, scheduling, and multi-surface access

See the design docs under `docs/` as they land.

## Quick start

> Requires [Node.js](https://nodejs.org/) v18+ and a [Muapi.ai access key](https://muapi.ai/access-keys).

```bash
npm run setup          # install deps + build workspace packages

npm run electron:dev   # desktop app (Electron + Vite)
# or
npm run dev            # hosted web version (Next.js) → http://localhost:3000
```

## Tech stack

Vite · vanilla JS (standalone app) · React 18 + Next.js (hosted) · Tailwind CSS · npm workspaces · Electron · Muapi.ai

## License

MIT — see [LICENSE](LICENSE). Portions derived from [Open Generative AI](https://github.com/Anil-matcha/Open-Generative-AI) (MIT).
