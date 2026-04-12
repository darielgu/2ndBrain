# Known Issues

Tech debt that we're aware of and accepting for the demo. Documented here so we have a clean answer if judges or reviewers ask.

## 1. `person_id` collisions from name-based derivation

**What:** The `person_id` is derived from the person's name — lowercased and with spaces replaced by underscores (e.g., `"John Smith"` → `"john_smith"`). Two different people with the same name will collide into a single merged profile.

**Impact:** In the demo this is acceptable because our test recordings feature unique names. In production, this would silently merge unrelated people and corrupt their memory histories.

**Intended fix:** Real ID generation — either stable UUIDs assigned at first encounter, or a disambiguation step when an existing `person_id` is matched but other metadata (where_met, role) strongly diverges. Could also use an LLM-based entity resolution step.

**Code reference:** `frontend/hooks/use-screen-recorder.ts` — the `person_id` is built inline in the loop that saves people after extraction.

---

## 2. Nia is the only persistence layer — no local source-of-truth

**What:** All person profiles and episodes persist exclusively through Nia's `/contexts` API. We don't maintain a local JSON store, IndexedDB cache, or any other backup. If Nia is unavailable at save time, the pipeline fails at the save step and the extracted memory is lost on page reload (it survives only in React state for the current session).

**Impact:** A Nia outage during the demo would break the write path. Reads also depend entirely on Nia being up.

**Intended future state:** A hybrid architecture where:
- A local JSON file (or SQLite) is the source of truth for structured lookups — fast profile card reads (<50ms), open-loops listing, and deterministic "who is this" matching.
- Nia becomes a semantic index layered over the episode prose for fuzzy recall queries and natural-language chat.
- Writes hit both stores; reads prefer the local store for structured data and Nia for search.

This separation also removes the "JSON in metadata" tech debt noted in point 3 below.

**Code reference:** `frontend/lib/nia.ts` — all `savePersonContext`, `saveEpisodeContext`, and read paths go directly to Nia.

---

## 3. Magic-moment card retrieval latency

**What:** When a person is recognized (screen recording today, webcam tomorrow), the context card retrieval goes through Nia semantic search, which adds roughly 200–500ms of latency before the card appears. The AGENTS.md product spec calls for "first token speed" — sub-50ms ideally.

**Impact:** In a live in-person interaction the delay is perceptible. For a pre-recorded screen session demo it's not noticeable because the UI appears after `stopRecording()` already involves a multi-second processing step.

**Intended fix:** Ties directly to issue 2 above — a local fast path would give us sub-50ms profile card reads. Until then, possible mitigations:
- Preload a small cache of recently-seen people into memory on dashboard mount.
- Use Nia's tag-filtered search (if/when available) instead of full semantic search for exact person_id lookups.

**Code reference:** `frontend/lib/nia.ts:findPersonByPersonId` does a semantic search and filters in code — this is on the hot path of every person save.

---

## 4. Ancillary: JSON-as-truth tech debt (bonus context)

Not on the priority list for the demo, but worth noting: we store the full structured `Person` / `Episode` object inside Nia's `metadata` field and rely on Nia to echo it back unchanged on search. Nia's metadata is documented as a flexible key-value object with `additionalProperties: true`, so this works today, but we don't have a formal guarantee that deeply nested structures will round-trip. If Nia ever flattens or alters metadata, our `use-memory.ts` parsers would fail silently. The fix is again the local source-of-truth layer described in issue 2.

---

## 5. Nia API quirk: `memory_type` is unreliable in search results

**What:** When you POST to `/v2/contexts` with `memory_type: "fact"` (or any value other than `"episodic"`), Nia accepts the value — `GET /v2/contexts/{id}` returns the correct stored value. However, `GET /v2/contexts/semantic-search` returns `memory_type: "episodic"` for **every** result regardless of the actual stored value. This appears to be a field-stamping issue on the search response serializer.

**Discovered:** While verifying the person dedupe path. Our initial implementation filtered search results with `memory_type === "fact"` to identify person records, and the filter rejected 100% of records because of this quirk.

**Workaround in place:** We no longer trust `memory_type` from search results. We identify person vs episode records by:
- `tags.includes("person")` vs `tags.includes("episode")`
- presence of `metadata.person_id` (persons only) vs `metadata.episode_id` (episodes only)

Both fields are under our control and round-trip correctly through Nia.

**Code references:**
- `frontend/lib/nia.ts:findPersonByPersonId` — dedupe lookup
- `frontend/hooks/use-memory.ts:usePeople` and `useEpisodes` — dashboard data fetch

**Report this upstream?** Worth filing with Nia if this persists — it's a documented field that disagrees between the POST response and the search response for the same record.
