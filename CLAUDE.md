# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SecondBrain is a real-world memory layer that gives AI memory of your real life. It captures interactions, structures them into **episodes** (not raw transcripts), and retrieves context in real time. Powered by **Nia** (memory + retrieval layer). This is a hackathon project — optimize for demo quality, reliability, and clarity over production infrastructure.

## Architecture

- **Frontend only** (no backend yet). All code lives in `frontend/`.
- Next.js 16 with App Router, React 19, TypeScript.
- Tailwind CSS v4 with `@tailwindcss/postcss` plugin (not legacy tailwind.config).
- shadcn/ui (new-york style, RSC-enabled) — components in `frontend/components/ui/`.
- Path alias: `@/*` resolves to `frontend/*`.
- Dashboard currently uses hardcoded mock data — no API calls.

### Routes

- `/` — Landing/hero page (`app/page.tsx` renders `HeroHeader`)
- `/dashboard` — Memory oracle dashboard with people sidebar, live recognition, chat, episodes

### Data Model (from AGENTS.md)

- **Person**: `{ person_id, name, where_met, summary, open_loops[], last_seen }`
- **Episode**: `{ person_id, topics[], promises[], timestamp }`

### Key Flow

`camera -> face recognition -> person_id -> query Nia -> display context card -> update Nia`

## Commands

All commands run from `frontend/`:

```bash
cd frontend
pnpm install      # install deps
pnpm dev           # dev server
pnpm build         # production build (TS errors ignored via next.config.mjs)
pnpm lint          # eslint
```

## Design System

Dark brutalist/terminal aesthetic. Enforced via CSS variables in `app/globals.css`:

- **Zero border-radius** (`--radius: 0rem`) — no rounded corners anywhere
- **Space Mono** as both sans and mono font
- All text **lowercase** — headings, labels, badges, nav
- Thin `border-border` (#262626), no shadows, no gradients on components
- Accent color: blue (#3b82f6)
- Background: near-black (#0a0a0a)
- Custom animations: marquee, gleam-sweep on badge, ASCII flicker/scan lines

## Memory Extraction Rules (Critical)

When building memory extraction features, follow these strictly:

- Extract ONLY: people involved, 1-3 key topics, explicit promises (verbatim), next actions
- If no promise exists, return empty array — do NOT infer commitments
- Max 3 items per field
- Prefer precision over recall — "boring but correct" over "smart but wrong"

## Demo Priorities

1. Recognition + retrieval (with fallback UX for low-confidence face recognition)
2. Memory extraction
3. Dashboard
4. Polish

If face recognition fails, fall back to: manual identity selection, candidate list (top 2-3), mock/preloaded data.
