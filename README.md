# SecondBrain

SecondBrain gives your AI memory of your real life.

A hackathon project that helps you remember people, conversations, and commitments by converting real-world interactions into structured memory episodes.

## Inspiration

Most AI products remember prompts, not people.

In real life, we meet someone, have a meaningful conversation, promise a follow-up, and then lose context by the next interaction. That breaks trust and momentum.

SecondBrain was built to close that gap: capture what happened, store what matters, and bring it back instantly when you need it.

## What SecondBrain Does

- Recognizes or selects a person during a live interaction.
- Retrieves memory context fast: who they are, where you met, what changed, open loops.
- Captures conversation transcripts and extracts deterministic memory fields.
- Stores structured people + episode memory for later retrieval.
- Provides a dashboard to browse people, query memory, and track follow-ups.

## The Hackathon Demo Flow

1. Face is detected from webcam input.
2. System resolves `person_id` (or falls back to top candidates/manual override).
3. App queries memory and shows a context card immediately.
4. User sees a concise nudge:
   - name
   - where met
   - summary
   - top open loop
5. Conversation is captured and converted into structured memory episode.
6. Memory is upserted for future retrieval.

## Why Nia

Nia is the memory and retrieval layer in this project.

Nia is used for:

- Persistent context storage for people and episodes.
- Retrieval of relevant memory context by identity.
- Context continuity across sessions.

Nia is not used for:

- Face recognition itself.

Pipeline:

`camera/mic -> identity resolution -> person_id -> Nia retrieval -> context nudge -> memory extraction -> Nia update`

## Memory Model (Deterministic)

SecondBrain stores structured memory, not raw transcript dumps.

### Person

- `person_id`
- `name`
- `where_met`
- `summary`
- `open_loops[]`
- `last_seen`

### Episode

- `episode_id`
- `person_ids[]`
- `topics[]` (1-3)
- `promises[]` (explicit only)
- `next_actions[]`
- `timestamp`
- `source`

Extraction contract (strict):

- Only explicit commitments are captured.
- If no promise exists, `promises` is an empty array.
- Max 3 items per field.
- Precision over recall.

## Project Structure

- `frontend/app/page.tsx`: landing page
- `frontend/app/dashboard/*`: dashboard routes (overview, people, chat, history, session, settings)
- `frontend/app/api/*`: API routes for recognition, extraction, memory, chat, integrations
- `frontend/components/*`: UI components and live panels
- `frontend/lib/db.ts`: local SQLite persistence
- `frontend/lib/nia.ts`: Nia client + sync/retrieval logic
- `frontend/lib/ingest.ts`: transcript -> episode ingestion pipeline

## Setup

### Prerequisites

- Node.js 20+
- npm

### 1) Install dependencies

```bash
cd frontend
npm install
```

### 2) Configure environment variables

Create `frontend/.env.local` and set values for the integrations you need:

- `OPENAI_API_KEY` (required for extraction/chat features)
- `NIA_API_KEY` (required for Nia memory sync/retrieval)
- `NIA_BASE_URL` (optional, defaults to Nia API base)

Optional integrations:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `TAVILY_API_KEY`
- `APOLLO_API_KEY`
- `OPENAI_MEMORY_MODEL`

### 3) Run locally

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Scripts

From `frontend/`:

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - TypeScript type-check (`tsc --noEmit`)

## Reliability Notes (Hackathon-first)

Face recognition is not perfectly reliable under live conditions. The product is designed to degrade gracefully:

- Confidence threshold + candidate fallback
- Manual identity selection for instant correction
- Preloaded demo profiles to guarantee the magic moment

The priority is perceived intelligence and resilience, not perfect biometric accuracy.

## Current Product Direction

- Dark, dense, terminal-inspired UI
- Fast, progressive context reveal
- Proactive nudges over long summaries
- Structured memory over transcript archives

## Demo Checklist

- Recognition flow works with fallback
- Context card loads fast
- Open loop is visible
- New episode is captured and stored
- Dashboard query returns meaningful memory

## License

Hackathon prototype. Add a formal license before production/open-source release.
