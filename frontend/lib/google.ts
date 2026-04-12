import { google } from 'googleapis'
import {
  getGoogleAccount,
  upsertGoogleAccount,
  type GoogleAccountRow,
} from './db'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  // Gmail — read threads, send + draft replies
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  // Calendar — read + write events (covers Meet link creation)
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  // People API — read contacts to seed the people graph
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
  // Drive — read docs the user already has access to
  'https://www.googleapis.com/auth/drive.readonly',
  // Tasks — turn promises into real to-dos
  'https://www.googleapis.com/auth/tasks',
]

export function getRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:3000/api/auth/google/callback'
  )
}

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'missing google oauth env vars: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
    )
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri())
}

export function buildAuthUrl(state: string): string {
  const oauth2 = getOAuthClient()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  })
}

/**
 * Returns an OAuth2 client authenticated for the given user, refreshing the
 * access token (and persisting the new token) when necessary.
 */
export async function getAuthorizedClient(user_id: string) {
  const row = getGoogleAccount(user_id)
  if (!row) throw new Error(`no google account linked for user "${user_id}"`)

  const oauth2 = getOAuthClient()
  oauth2.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token || undefined,
    token_type: row.token_type || undefined,
    expiry_date: row.expiry_date || undefined,
    scope: row.scope || undefined,
  })

  // Persist refreshed tokens when google rotates them.
  oauth2.on('tokens', (tokens) => {
    upsertGoogleAccount({
      user_id,
      google_sub: row.google_sub,
      email: row.email,
      name: row.name,
      picture: row.picture,
      access_token: tokens.access_token || row.access_token,
      refresh_token: tokens.refresh_token || row.refresh_token,
      scope: tokens.scope || row.scope,
      token_type: tokens.token_type || row.token_type,
      expiry_date: tokens.expiry_date ?? row.expiry_date,
    })
  })

  return oauth2
}

// --- Gmail: send an email on behalf of the user ---
export async function sendGmail(
  user_id: string,
  opts: { to: string; subject: string; body: string; replyTo?: string },
): Promise<{ id: string; threadId: string }> {
  const auth = await getAuthorizedClient(user_id)
  const gmail = google.gmail({ version: 'v1', auth })

  const headers = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ]
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`)

  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${opts.body}`)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  return {
    id: res.data.id || '',
    threadId: res.data.threadId || '',
  }
}

// --- Calendar: create an event, optionally with a Google Meet link ---
export async function createCalendarEvent(
  user_id: string,
  opts: {
    summary: string
    description?: string
    startIso: string
    endIso: string
    attendees?: string[]
    timeZone?: string
    withMeet?: boolean
  },
): Promise<{ id: string; htmlLink: string; meetUrl: string | null }> {
  const auth = await getAuthorizedClient(user_id)
  const calendar = google.calendar({ version: 'v3', auth })

  const conferenceData = opts.withMeet
    ? {
        createRequest: {
          requestId: `sb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    : undefined

  const res = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: opts.withMeet ? 1 : 0,
    sendUpdates: 'all',
    requestBody: {
      summary: opts.summary,
      description: opts.description,
      start: { dateTime: opts.startIso, timeZone: opts.timeZone },
      end: { dateTime: opts.endIso, timeZone: opts.timeZone },
      attendees: opts.attendees?.map((email) => ({ email })),
      conferenceData,
    },
  })

  const meetUrl =
    res.data.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === 'video',
    )?.uri || res.data.hangoutLink || null

  return {
    id: res.data.id || '',
    htmlLink: res.data.htmlLink || '',
    meetUrl,
  }
}

// --- Gmail: read recent messages ---
export interface GmailMessageSummary {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  body: string
}

function decodeGmailBody(
  payload: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] | null } | undefined | null,
): string {
  if (!payload) return ''
  const fromB64 = (data: string) =>
    Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

  if (payload.body?.data) {
    return fromB64(payload.body.data)
  }
  if (Array.isArray(payload.parts)) {
    // Prefer text/plain, fall back to text/html stripped
    const plain = (payload.parts as Array<typeof payload>).find(
      (p) => p.mimeType === 'text/plain',
    )
    if (plain?.body?.data) return fromB64(plain.body.data)
    const html = (payload.parts as Array<typeof payload>).find(
      (p) => p.mimeType === 'text/html',
    )
    if (html?.body?.data) {
      return fromB64(html.body.data)
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
    // Recurse into nested multipart
    for (const part of payload.parts as Array<typeof payload>) {
      const nested = decodeGmailBody(part)
      if (nested) return nested
    }
  }
  return ''
}

export async function listRecentGmail(
  user_id: string,
  opts: { days?: number; maxResults?: number } = {},
): Promise<GmailMessageSummary[]> {
  const auth = await getAuthorizedClient(user_id)
  const gmail = google.gmail({ version: 'v1', auth })
  const days = opts.days ?? 14
  const max = opts.maxResults ?? 25

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `newer_than:${days}d -category:promotions -category:social`,
    maxResults: max,
  })

  const ids = (listRes.data.messages || []).map((m) => m.id).filter(Boolean) as string[]

  const summaries: GmailMessageSummary[] = []
  for (const id of ids) {
    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    const headers = msg.data.payload?.headers || []
    const h = (name: string) =>
      headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || ''
    summaries.push({
      id: msg.data.id || id,
      threadId: msg.data.threadId || '',
      from: h('from'),
      to: h('to'),
      subject: h('subject'),
      date: h('date'),
      snippet: msg.data.snippet || '',
      body: decodeGmailBody(msg.data.payload || undefined),
    })
  }
  return summaries
}

// --- Gmail: create a draft instead of sending directly ---
export async function createGmailDraft(
  user_id: string,
  opts: { to: string; subject: string; body: string },
): Promise<{ id: string; messageId: string }> {
  const auth = await getAuthorizedClient(user_id)
  const gmail = google.gmail({ version: 'v1', auth })

  const raw = Buffer.from(
    [
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      opts.body,
    ].join('\r\n'),
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw } },
  })

  return {
    id: res.data.id || '',
    messageId: res.data.message?.id || '',
  }
}

// --- Calendar: list events in a time range ---
export interface CalendarEventSummary {
  id: string
  summary: string
  description: string
  startIso: string
  endIso: string
  attendees: string[]
  location: string
  meetUrl: string | null
  htmlLink: string
}

export async function listCalendarEvents(
  user_id: string,
  opts: { timeMin?: string; timeMax?: string; maxResults?: number } = {},
): Promise<CalendarEventSummary[]> {
  const auth = await getAuthorizedClient(user_id)
  const calendar = google.calendar({ version: 'v3', auth })
  const now = Date.now()
  const defaultMin = new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString() // 30d back
  const defaultMax = new Date(now + 1000 * 60 * 60 * 24 * 30).toISOString() // 30d fwd

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: opts.timeMin || defaultMin,
    timeMax: opts.timeMax || defaultMax,
    maxResults: opts.maxResults ?? 50,
    singleEvents: true,
    orderBy: 'startTime',
  })

  return (res.data.items || []).map((ev) => ({
    id: ev.id || '',
    summary: ev.summary || '(no title)',
    description: ev.description || '',
    startIso: ev.start?.dateTime || ev.start?.date || '',
    endIso: ev.end?.dateTime || ev.end?.date || '',
    attendees: (ev.attendees || [])
      .map((a) => a.email || '')
      .filter(Boolean),
    location: ev.location || '',
    meetUrl:
      ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
      ev.hangoutLink ||
      null,
    htmlLink: ev.htmlLink || '',
  }))
}

// --- People API: list the user's contacts ---
export interface ContactSummary {
  resourceName: string
  name: string
  emails: string[]
  phones: string[]
  organization: string
  title: string
}

export async function listContacts(
  user_id: string,
  opts: { pageSize?: number } = {},
): Promise<ContactSummary[]> {
  const auth = await getAuthorizedClient(user_id)
  const people = google.people({ version: 'v1', auth })

  const res = await people.people.connections.list({
    resourceName: 'people/me',
    pageSize: opts.pageSize ?? 200,
    personFields: 'names,emailAddresses,phoneNumbers,organizations',
  })

  return (res.data.connections || []).map((p) => ({
    resourceName: p.resourceName || '',
    name: p.names?.[0]?.displayName || '',
    emails: (p.emailAddresses || []).map((e) => e.value || '').filter(Boolean),
    phones: (p.phoneNumbers || []).map((n) => n.value || '').filter(Boolean),
    organization: p.organizations?.[0]?.name || '',
    title: p.organizations?.[0]?.title || '',
  }))
}

// --- Drive: search files ---
export interface DriveFileSummary {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  webViewLink: string
  owners: string[]
}

export async function listDriveFiles(
  user_id: string,
  opts: { query?: string; pageSize?: number } = {},
): Promise<DriveFileSummary[]> {
  const auth = await getAuthorizedClient(user_id)
  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.list({
    q: opts.query || 'trashed = false',
    pageSize: opts.pageSize ?? 50,
    fields:
      'files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName,emailAddress))',
    orderBy: 'modifiedTime desc',
  })
  return (res.data.files || []).map((f) => ({
    id: f.id || '',
    name: f.name || '',
    mimeType: f.mimeType || '',
    modifiedTime: f.modifiedTime || '',
    webViewLink: f.webViewLink || '',
    owners: (f.owners || [])
      .map((o) => o.displayName || o.emailAddress || '')
      .filter(Boolean),
  }))
}

export async function getDriveDocText(
  user_id: string,
  fileId: string,
): Promise<string> {
  const auth = await getAuthorizedClient(user_id)
  const drive = google.drive({ version: 'v3', auth })
  // Export Google Docs to plain text; binary files return empty.
  const meta = await drive.files.get({ fileId, fields: 'mimeType,name' })
  if (meta.data.mimeType?.startsWith('application/vnd.google-apps.document')) {
    const res = await drive.files.export(
      { fileId, mimeType: 'text/plain' },
      { responseType: 'text' },
    )
    return typeof res.data === 'string' ? res.data : ''
  }
  return ''
}

// --- Tasks: list + create ---
export interface TaskSummary {
  id: string
  title: string
  notes: string
  due: string
  status: string
}

export async function listTasks(user_id: string): Promise<TaskSummary[]> {
  const auth = await getAuthorizedClient(user_id)
  const tasks = google.tasks({ version: 'v1', auth })
  const listsRes = await tasks.tasklists.list({ maxResults: 1 })
  const listId = listsRes.data.items?.[0]?.id
  if (!listId) return []
  const res = await tasks.tasks.list({
    tasklist: listId,
    maxResults: 100,
    showCompleted: false,
  })
  return (res.data.items || []).map((t) => ({
    id: t.id || '',
    title: t.title || '',
    notes: t.notes || '',
    due: t.due || '',
    status: t.status || '',
  }))
}

export async function createTask(
  user_id: string,
  opts: { title: string; notes?: string; dueIso?: string },
): Promise<{ id: string; title: string }> {
  const auth = await getAuthorizedClient(user_id)
  const tasks = google.tasks({ version: 'v1', auth })
  const listsRes = await tasks.tasklists.list({ maxResults: 1 })
  const listId = listsRes.data.items?.[0]?.id
  if (!listId) throw new Error('no default task list found')
  const res = await tasks.tasks.insert({
    tasklist: listId,
    requestBody: {
      title: opts.title,
      notes: opts.notes,
      due: opts.dueIso,
    },
  })
  return { id: res.data.id || '', title: res.data.title || opts.title }
}

export function serializeAccount(row: GoogleAccountRow) {
  return {
    email: row.email,
    name: row.name,
    picture: row.picture,
    scope: row.scope,
    connected_at: row.connected_at,
  }
}
