# SecondBrain

**SecondBrain gives your AI memory of your real life.**

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Hackathon Build](https://img.shields.io/badge/Build-Hackathon-black)](#)
[![Local-First](https://img.shields.io/badge/Storage-Local%20First-0f172a)](#local-storage)
[![Face Tracking](https://img.shields.io/badge/Tracking-Vectorized%20Top--K-1d4ed8)](#how-recognition-works-vectorizing--centroid--top-k)

[![Open Dashboard](https://img.shields.io/badge/Open-Dashboard-111827?style=for-the-badge)](http://localhost:3000/dashboard/overview)
[![Start Session](https://img.shields.io/badge/Start-Live%20Session-000000?style=for-the-badge)](http://localhost:3000/dashboard/session)
[![Memory Chat](https://img.shields.io/badge/Try-Memory%20Chat-0b0f19?style=for-the-badge)](http://localhost:3000/dashboard/chat)

## What This Is

SecondBrain is an experimental memory layer for real-world relationships.

It helps you remember:

- who someone is
- where you met
- what mattered in your last conversation
- what you promised to do

Instead of treating interactions as raw transcript logs, SecondBrain stores structured memory episodes so context can be surfaced instantly when it matters.

## Why Customers Care

Most tools remember documents and prompts. They do not remember your life.

SecondBrain is built for the moment right before you speak to someone and realize:

- you forgot their name
- you forgot where you met
- you forgot what you owe them

SecondBrain makes that moment recoverable by turning interactions into memory that can be searched and used in real time.

## Core Product Experience

### 1) Recognition + retrieval

During a live session, the system identifies (or suggests) who is in front of you and immediately loads context.

### 2) Memory capture

Conversation text is transformed into structured fields:

- people involved
- key topics
- explicit promises
- actionable next steps

### 3) Proactive nudge

You get short context before asking:

- name
- where met
- one key detail
- one open loop

### 4) Dashboard oracle

Use dashboard + chat to ask questions like:

- what did I promise them?
- who did I meet this week?
- what follow-ups are still open?

## How Recognition Works (Vectorizing + Centroid + Top-K)

Face tracking and matching is implemented as a practical experiment pipeline:

1. Face is detected from webcam frames.
2. The face is vectorized into an embedding.
3. Stored identity vectors are grouped by person.
4. A centroid vector is used as a fast representative for each person.
5. Distances are computed and top-K candidates are returned.
6. Confidence gating determines auto-resolve vs manual selection fallback.

This gives a resilient demo path:

- fast best-guess identity
- candidate fallback when uncertain
- quick manual correction loop

## Local Storage

SecondBrain is local-first in this repo:

- local SQLite persistence for people + episodes
- local profile/session artifacts
- local development environment for rapid iteration

This keeps iteration fast and demo behavior deterministic.

## Privacy + Scope

This repo is a hackathon experiment, not a production compliance product.

- Privacy/compliance guarantees are out of scope in this build.
- This is experimentation of thought and product direction.
- Do not treat this repository as a finalized privacy architecture.

## Long-Term Vision

In the long term, SecondBrain could become a wearable context layer that supports people with memory loss by helping reconnect names, faces, and personal history in real time.

Think: lightweight Meta Glasses-style attachment that adds context for people you have met and indexes people you meet next.

## Architecture Overview

Pipeline:

`camera + mic -> identity resolution -> person_id -> memory retrieval -> context nudge -> transcript extraction -> memory update`

Key boundaries:

- **Nia:** memory/retrieval layer
- **Recognition system:** identity resolution
- **Dashboard + live UI:** user-facing interaction surface

## Tech Notes

- Next.js + React frontend (`frontend/`)
- API routes under `frontend/app/api/*`
- Local DB and memory utilities under `frontend/lib/*`
- Dashboard routes in `frontend/app/dashboard/*`

## Quickstart

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Set `frontend/.env.local` as needed:

- `OPENAI_API_KEY`
- `NIA_API_KEY`
- `NIA_BASE_URL`

Optional:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `TAVILY_API_KEY`
- `APOLLO_API_KEY`
- `OPENAI_MEMORY_MODEL`

## Scripts

From `frontend/`:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## License

MIT. See [LICENSE](./LICENSE).
