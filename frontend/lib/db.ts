import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

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
  `)

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
