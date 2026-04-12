import { NextResponse } from 'next/server'
import { enrollFaceEmbedding, getProfile, upsertProfile } from '@/lib/recognition-store'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const person_id = String(body.person_id || '').trim()
    const embeddings = Array.isArray(body.embeddings)
      ? body.embeddings
          .filter((item: unknown) => Array.isArray(item))
          .map((item: unknown) =>
            (item as unknown[]).map((v: unknown) => Number(v))
          )
      : []
    const singleEmbedding = Array.isArray(body.embedding)
      ? body.embedding.map((v: unknown) => Number(v))
      : []
    const enrollmentVectors =
      embeddings.length > 0
        ? embeddings
        : singleEmbedding.length > 0
          ? [singleEmbedding]
          : []

    if (!person_id) {
      return NextResponse.json({ error: 'person_id required' }, { status: 400 })
    }

    if (body.name) {
      await upsertProfile({
        person_id,
        name: String(body.name),
        name_confirmed:
          typeof body.name_confirmed === 'boolean'
            ? body.name_confirmed
            : undefined,
        where_met: body.where_met ? String(body.where_met) : undefined,
        summary: body.summary ? String(body.summary) : undefined,
        open_loops: Array.isArray(body.open_loops)
          ? body.open_loops.map((x: unknown) => String(x))
          : undefined,
        last_location: body.last_location ? String(body.last_location) : undefined,
        recent_topics: Array.isArray(body.recent_topics)
          ? body.recent_topics.map((x: unknown) => String(x))
          : undefined,
        last_conversation_summary: body.last_conversation_summary
          ? String(body.last_conversation_summary)
          : undefined,
        last_seen: body.last_seen ? String(body.last_seen) : undefined,
      })
    }

    const quality = Number(body.quality || 1)
    const faces = []
    for (const embedding of enrollmentVectors) {
      if (embedding.length < 8) continue
      const record = await enrollFaceEmbedding({
        person_id,
        embedding,
        quality,
      })
      faces.push(record)
    }

    if (faces.length === 0) {
      return NextResponse.json(
        { error: 'embedding(s) too short' },
        { status: 400 }
      )
    }

    const profile = await getProfile(person_id)

    return NextResponse.json({
      ok: true,
      profile,
      face: faces[0],
      faces,
    })
  } catch (err) {
    console.error('enroll error:', err)
    return NextResponse.json({ error: 'enroll failed' }, { status: 500 })
  }
}
