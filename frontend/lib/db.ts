import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import type { Person, Episode } from './types'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'secondbrain.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS google_accounts (
      user_id       TEXT PRIMARY KEY,
      google_sub    TEXT,
      email         TEXT,
      name          TEXT,
      picture       TEXT,
      access_token  TEXT NOT NULL,
      refresh_token TEXT,
      scope         TEXT,
      token_type    TEXT,
      expiry_date   INTEGER,
      connected_at  INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS people (
      person_id       TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      where_met       TEXT,
      summary         TEXT,
      open_loops      TEXT NOT NULL DEFAULT '[]',
      notes           TEXT NOT NULL DEFAULT '[]',
      prose           TEXT,
      last_seen       TEXT,
      nia_context_id  TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_people_last_seen ON people(last_seen DESC);

    CREATE TABLE IF NOT EXISTS episodes (
      episode_id      TEXT PRIMARY KEY,
      person_ids      TEXT NOT NULL DEFAULT '[]',
      topics          TEXT NOT NULL DEFAULT '[]',
      promises        TEXT NOT NULL DEFAULT '[]',
      next_actions    TEXT NOT NULL DEFAULT '[]',
      timestamp       TEXT NOT NULL,
      source          TEXT NOT NULL,
      prose           TEXT,
      nia_context_id  TEXT,
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp DESC);
  `)

  // Idempotent column additions for manual enrichment fields. Safe to call
  // on every boot — sqlite throws on duplicate ADD COLUMN which we swallow.
  const manualColumns: Array<[string, string]> = [
    ['email', 'TEXT'],
    ['job_title', 'TEXT'],
    ['company', 'TEXT'],
    ['linkedin_url', 'TEXT'],
    ['instagram', 'TEXT'],
    ['twitter', 'TEXT'],
    ['manual_notes', 'TEXT'],
  ]
  for (const [col, type] of manualColumns) {
    try {
      db.exec(`ALTER TABLE people ADD COLUMN ${col} ${type}`)
    } catch {
      // column already exists
    }
  }

  _db = db
  return db
}

export interface GoogleAccountRow {
  user_id: string
  google_sub: string | null
  email: string | null
  name: string | null
  picture: string | null
  access_token: string
  refresh_token: string | null
  scope: string | null
  token_type: string | null
  expiry_date: number | null
  connected_at: number
  updated_at: number
}

export function upsertGoogleAccount(row: Omit<GoogleAccountRow, 'connected_at' | 'updated_at'> & { connected_at?: number }) {
  const db = getDb()
  const now = Date.now()
  const existing = db
    .prepare('SELECT connected_at FROM google_accounts WHERE user_id = ?')
    .get(row.user_id) as { connected_at: number } | undefined

  db.prepare(
    `INSERT INTO google_accounts (
      user_id, google_sub, email, name, picture,
      access_token, refresh_token, scope, token_type, expiry_date,
      connected_at, updated_at
    ) VALUES (
      @user_id, @google_sub, @email, @name, @picture,
      @access_token, @refresh_token, @scope, @token_type, @expiry_date,
      @connected_at, @updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      google_sub    = excluded.google_sub,
      email         = excluded.email,
      name          = excluded.name,
      picture       = excluded.picture,
      access_token  = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, google_accounts.refresh_token),
      scope         = excluded.scope,
      token_type    = excluded.token_type,
      expiry_date   = excluded.expiry_date,
      updated_at    = excluded.updated_at`,
  ).run({
    ...row,
    connected_at: existing?.connected_at ?? row.connected_at ?? now,
    updated_at: now,
  })
}

export function getGoogleAccount(user_id: string): GoogleAccountRow | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM google_accounts WHERE user_id = ?')
    .get(user_id) as GoogleAccountRow | undefined
  return row ?? null
}

export function deleteGoogleAccount(user_id: string) {
  const db = getDb()
  db.prepare('DELETE FROM google_accounts WHERE user_id = ?').run(user_id)
}

// --- People ----------------------------------------------------------------

interface PersonRow {
  person_id: string
  name: string
  where_met: string | null
  summary: string | null
  open_loops: string
  notes: string
  prose: string | null
  last_seen: string | null
  nia_context_id: string | null
  created_at: number
  updated_at: number
  email: string | null
  job_title: string | null
  company: string | null
  linkedin_url: string | null
  instagram: string | null
  twitter: string | null
  manual_notes: string | null
}

function rowToPerson(row: PersonRow): Person {
  return {
    person_id: row.person_id,
    name: row.name,
    where_met: row.where_met || '',
    summary: row.summary || '',
    open_loops: safeJsonArray(row.open_loops),
    notes: safeJsonArray(row.notes),
    prose: row.prose || undefined,
    last_seen: row.last_seen || '',
    nia_context_id: row.nia_context_id || undefined,
    email: row.email || undefined,
    job_title: row.job_title || undefined,
    company: row.company || undefined,
    linkedin_url: row.linkedin_url || undefined,
    instagram: row.instagram || undefined,
    twitter: row.twitter || undefined,
    manual_notes: row.manual_notes || undefined,
  }
}

function safeJsonArray(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Insert or merge a person. Merges open_loops + notes so repeated encounters
 * accumulate instead of overwrite. The caller (lib/nia.ts) is responsible for
 * computing the "merged" Person shape — this function just persists it.
 */
export function upsertPerson(person: Person): void {
  const db = getDb()
  const now = Date.now()
  const existing = db
    .prepare('SELECT created_at FROM people WHERE person_id = ?')
    .get(person.person_id) as { created_at: number } | undefined

  db.prepare(
    `INSERT INTO people (
      person_id, name, where_met, summary, open_loops, notes, prose,
      last_seen, nia_context_id, created_at, updated_at,
      email, job_title, company, linkedin_url, instagram, twitter, manual_notes
    ) VALUES (
      @person_id, @name, @where_met, @summary, @open_loops, @notes, @prose,
      @last_seen, @nia_context_id, @created_at, @updated_at,
      @email, @job_title, @company, @linkedin_url, @instagram, @twitter, @manual_notes
    )
    ON CONFLICT(person_id) DO UPDATE SET
      name           = excluded.name,
      where_met      = excluded.where_met,
      summary        = excluded.summary,
      open_loops     = excluded.open_loops,
      notes          = excluded.notes,
      prose          = excluded.prose,
      last_seen      = excluded.last_seen,
      nia_context_id = COALESCE(excluded.nia_context_id, people.nia_context_id),
      updated_at     = excluded.updated_at,
      email          = COALESCE(excluded.email, people.email),
      job_title      = COALESCE(excluded.job_title, people.job_title),
      company        = COALESCE(excluded.company, people.company),
      linkedin_url   = COALESCE(excluded.linkedin_url, people.linkedin_url),
      instagram      = COALESCE(excluded.instagram, people.instagram),
      twitter        = COALESCE(excluded.twitter, people.twitter),
      manual_notes   = COALESCE(excluded.manual_notes, people.manual_notes)`,
  ).run({
    person_id: person.person_id,
    name: person.name,
    where_met: person.where_met || null,
    summary: person.summary || null,
    open_loops: JSON.stringify(person.open_loops || []),
    notes: JSON.stringify(person.notes || []),
    prose: person.prose || null,
    last_seen: person.last_seen || null,
    nia_context_id: person.nia_context_id || null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    email: person.email || null,
    job_title: person.job_title || null,
    company: person.company || null,
    linkedin_url: person.linkedin_url || null,
    instagram: person.instagram || null,
    twitter: person.twitter || null,
    manual_notes: person.manual_notes || null,
  })
}

export function getPerson(person_id: string): Person | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM people WHERE person_id = ?')
    .get(person_id) as PersonRow | undefined
  return row ? rowToPerson(row) : null
}

export function listPeopleDb(limit = 100): Person[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM people ORDER BY COALESCE(last_seen, '') DESC LIMIT ?`,
    )
    .all(limit) as PersonRow[]
  return rows.map(rowToPerson)
}

// --- Episodes --------------------------------------------------------------

interface EpisodeRow {
  episode_id: string
  person_ids: string
  topics: string
  promises: string
  next_actions: string
  timestamp: string
  source: string
  prose: string | null
  nia_context_id: string | null
  created_at: number
}

function rowToEpisode(row: EpisodeRow): Episode {
  return {
    episode_id: row.episode_id,
    person_ids: safeJsonArray(row.person_ids),
    topics: safeJsonArray(row.topics),
    promises: safeJsonArray(row.promises),
    next_actions: safeJsonArray(row.next_actions),
    timestamp: row.timestamp,
    source: row.source === 'webcam' ? 'webcam' : 'screen',
    prose: row.prose || undefined,
    nia_context_id: row.nia_context_id || undefined,
  }
}

export function upsertEpisode(episode: Episode): void {
  const db = getDb()
  const now = Date.now()

  db.prepare(
    `INSERT INTO episodes (
      episode_id, person_ids, topics, promises, next_actions,
      timestamp, source, prose, nia_context_id, created_at
    ) VALUES (
      @episode_id, @person_ids, @topics, @promises, @next_actions,
      @timestamp, @source, @prose, @nia_context_id, @created_at
    )
    ON CONFLICT(episode_id) DO UPDATE SET
      person_ids     = excluded.person_ids,
      topics         = excluded.topics,
      promises       = excluded.promises,
      next_actions   = excluded.next_actions,
      timestamp      = excluded.timestamp,
      source         = excluded.source,
      prose          = excluded.prose,
      nia_context_id = COALESCE(excluded.nia_context_id, episodes.nia_context_id)`,
  ).run({
    episode_id: episode.episode_id,
    person_ids: JSON.stringify(episode.person_ids || []),
    topics: JSON.stringify(episode.topics || []),
    promises: JSON.stringify(episode.promises || []),
    next_actions: JSON.stringify(episode.next_actions || []),
    timestamp: episode.timestamp,
    source: episode.source,
    prose: episode.prose || null,
    nia_context_id: episode.nia_context_id || null,
    created_at: now,
  })
}

export function listEpisodesDb(limit = 100): Episode[] {
  const db = getDb()
  const rows = db
    .prepare(`SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?`)
    .all(limit) as EpisodeRow[]
  return rows.map(rowToEpisode)
}

export function listEpisodesForPersonDb(
  person_id: string,
  limit = 100,
): Episode[] {
  const db = getDb()
  // person_ids is a JSON array text blob; use json_each to filter.
  const rows = db
    .prepare(
      `SELECT e.* FROM episodes e
       WHERE EXISTS (
         SELECT 1 FROM json_each(e.person_ids) WHERE value = ?
       )
       ORDER BY e.timestamp DESC
       LIMIT ?`,
    )
    .all(person_id, limit) as EpisodeRow[]
  return rows.map(rowToEpisode)
}
