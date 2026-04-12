# Repository Guidelines

🧠 AGENTS.md  
Project: SecondBrain

Tagline: Give your AI memory of your real life.  
Subtitle: A persistent memory layer for conversations, people, and follow-ups, powered by Nia.

---

## 1. Purpose of this file

This file gives coding agents and human collaborators the full product context for this repo.

Use it to understand:

- what we are building
- what matters most
- what is in scope for the hackathon
- what to optimize for
- what not to waste time on
- how the system should be architected
- how the UX should feel
- what demo moment must work

If you are an AI coding agent working in this repo, prioritize shipping the core demo over building extra infrastructure.

---

## 2. Product summary

SecondBrain is a real-world memory system for agents and humans.

It captures real-world interactions, structures them into memory, stores that memory in Nia, and allows the user to retrieve context later in real time or through a dashboard.

The system should help answer questions like:

- Who is this person?
- Where did I meet them?
- What did we talk about last time?
- What did I promise them?
- What changed since our last conversation?
- Who should I follow up with?

### Core idea

We do not store conversations as raw logs.

We store episodes:

- who was involved
- what happened
- what mattered
- what commitments were made
- what should happen next

---

## 3. The magic moment

The biggest wow factor:

Camera sees a person  
Face recognition resolves identity  
Nia retrieves context

User instantly sees/hears:

- name
- where met
- last convo
- open loop

Example:

“That’s Maya. You met her at the hackathon. You promised her the repo.”

⚠️ This flow has multiple failure points. The system must be resilient.

---

## 4. Critical UX: Instant illusion

Design for **instant perceived intelligence**, not perfect accuracy.

Principles:

- First token speed > full accuracy
- Stream results: show name first, details later
- Never block UI on full pipeline completion

Implementation:

- Preload last known people
- Show optimistic identity immediately
- Fill in context progressively (name → context → open loop)

---

## 5. Recognition reliability (critical)

Face recognition is NOT hackathon-reliable:

- lighting issues
- angle issues
- latency
- false positives

This is a demo killer if untreated.

### Required fallback UX

If confidence < threshold:

- show top 2–3 candidate identities
- allow tap-to-confirm

System must support:

- instant manual override
- fast correction loop

### Demo optimization

- preload 1–2 demo people
- bias recognition toward them
- reduce ambiguity

👉 The demo must NEVER depend on perfect real-time recognition

---

## 6. What we are building

### A. Live interaction surface

- webcam / phone input
- face recognition
- fetch memory from Nia
- show context card
- optional TTS nudge
- capture conversation

### B. Dashboard

- view people
- view memory episodes
- see open loops
- query via natural language

---

## 7. Product positioning

**One-liner**

We give your AI memory of your real life.

**Core thesis**

AI is stuck in the browser. Real life is not.

---

## 8. Nia’s role

Nia = memory + retrieval layer

Nia stores:

- person profiles
- episodes
- open loops
- summaries

Nia does NOT:

- facial recognition

Flow:

camera → identity → person_id → query Nia → display → update Nia

---

## 9. Core UX principles

### 1. Proactive

System should surface info BEFORE user asks

### 2. Short nudges

Only show:

- name
- context
- 1 key detail
- 1 open loop

### 3. Structured memory

Store meaning, not transcripts

### 4. Dashboard = memory oracle

Feels like querying your life

---

## 10. Constraints

Focus on:

- demo quality
- reliability
- clarity

Avoid:

- hardware complexity
- perfect accuracy
- overengineering

---

## 11. Non-goals

Do NOT build:

- mobile app
- glasses integration
- full infra
- CRM
- analytics system

---

## 12. Architecture

### Input

camera + mic

### Identity

face recognition → person_id

### Memory extraction

transcript → structured episode

### Memory layer

Nia

### Agent layer

retrieval + response

### UI

live + dashboard

---

## 13. Memory extraction (STRICT)

This is a critical system. Must be deterministic.

### Extraction contract

Extract ONLY:

- people involved
- 1–3 key topics
- explicit promises (verbatim if possible)
- next actions (clear + actionable)

Rules:

- If no promise exists → return empty array
- Do NOT infer commitments
- Max 3 items per field
- Prefer precision over recall

👉 Goal: boring but correct memory, not smart but wrong

---

## 14. Data model

### Person

```json
{
  "person_id": "maya_001",
  "name": "Maya",
  "where_met": "hackathon",
  "summary": "works on voice infra",
  "open_loops": ["send repo"],
  "last_seen": "timestamp"
}
```

### Episode

```json
{
  "person_id": "maya_001",
  "topics": ["voice infra"],
  "promises": ["send repo"],
  "timestamp": "timestamp"
}
```

---

## 15. Key flows

### Recognition

face → person_id → query Nia → show card

### Capture

audio → transcript → structured memory

### Update

store episode in Nia

### Query

user → Nia → answer

---

## 16. Nudge design

### Visual

- name
- where met
- 1 line summary
- open loop

### Audio

“That’s Maya. You owe her the repo.”

---

## 17. Dashboard

Left: people  
Center: chat  
Right: profile + memory

Queries:

- what did I promise?
- who did I meet?

---

## 18. Design direction

- dark
- dense
- terminal style
- thin borders
- no shadows
- Inter + mono fonts

---

## 19. Demo priorities

Must show:

- recognition
- memory retrieval
- open loop

---

## 20. Build priority

1. recognition + retrieval
2. memory extraction
3. dashboard
4. polish

---

## 21. Done =

- recognition works (with fallback)
- memory shows
- query works
- demo feels real

---

## 22. Coding rules

Do:

- ship fast
- use mocks if needed
- optimize demo
- keep features modular and isolated to reduce merge conflicts
- wire new modules through main route entry points (for example `frontend/app/page.tsx` and dashboard page routes) instead of editing unrelated surfaces

Don’t:

- overengineer
- block on hardware

### Hackathon collaboration note

We are building this with multiple people in a fast-paced hackathon.

- Prefer small, composable components and focused files
- Minimize edits to shared hot files unless required
- Integrate via clear page-level entry points so parallel work can land cleanly

---

## 23. If blocked

Fallback:

- manual identity selection
- mock memory
- preloaded data

---

## 24. Final north star

Your AI remembers people, conversations, and promises from your real life.


---

# SecondBrain

## One-liner

SecondBrain gives your AI memory of your real life.

---

## What is SecondBrain?

SecondBrain is a real-world memory layer that helps you remember people, conversations, and commitments.

It captures interactions, turns them into structured memory, and retrieves the right context at the right moment.

Instead of relying on your own memory—or scattered notes—SecondBrain keeps track of:

* who you met
* what you talked about
* what mattered
* what you promised
* what you should do next

---

## The problem

Human memory is fragile and inconsistent.

You meet people, have meaningful conversations, and make commitments—but quickly forget details like:

* names
* context of where you met
* important topics
* follow-ups you promised

AI today does not help with this.

It lives in the browser and has no memory of your real-world interactions.

---

## The solution

SecondBrain bridges real life and AI.

It captures real-world interactions and converts them into structured, retrievable memory.

Instead of storing raw transcripts, it stores **episodes**:

* people involved
* key topics
* important context
* explicit promises
* next actions (open loops)

This allows the system to surface meaningful, actionable context—not just data.

---

## The core experience

SecondBrain works proactively.

When you see someone again, it helps you remember instantly.

### The magic moment

You look at someone → the system recognizes them → memory is retrieved → context appears

Example:

“That’s Maya. You met her at the hackathon. You promised her the repo.”

The experience is:

* fast
* minimal
* relevant

Only the most important information is shown.

---

## Key features

### 1. Recognition + retrieval

* Identify a person
* Fetch their memory
* Show a concise context card

### 2. Memory capture

* Record conversations
* Convert into structured episodes
* Store in memory system

### 3. Open loop tracking

* Capture promises and commitments
* Surface what you owe people

### 4. Dashboard

* View people and memory
* Query your life using natural language

---

## Design principles

### 1. Proactive, not reactive

The system surfaces information before you ask.

### 2. Minimal output

Only show:

* name
* context
* 1 key detail
* 1 open loop

### 3. Structured memory

Store meaning, not transcripts.

### 4. Instant perception

Speed matters more than completeness.

The system should feel immediate and intelligent.

---

## Why this matters

Relationships are built on memory.

Forgetting names, context, or commitments creates friction.

SecondBrain reduces that friction and makes interactions smoother, more thoughtful, and more reliable.

It turns AI into something that actually understands your real life—not just your prompts.

---

## Hackathon scope

For this hackathon, the goal is to demonstrate the core experience:

* recognize a person
* retrieve memory
* show context
* surface an open loop

The focus is on:

* clarity
* reliability
* demo quality

Not on:

* perfect accuracy
* full infrastructure
* production systems

---

## Vision

Your AI remembers the people in your life, the conversations you’ve had, and the promises you’ve made.

It helps you show up better in every interaction.

That is SecondBrain.
