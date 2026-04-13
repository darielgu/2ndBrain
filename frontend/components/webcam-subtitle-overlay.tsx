'use client'

import { useEffect, useMemo, useState } from 'react'
import type { TranscriptChunk } from '@/lib/types'

const SUBTITLE_VISIBLE_MS = 7_000
const SUBTITLE_TICK_MS = 300
const MAX_SUBTITLE_LINES = 2

export function WebcamSubtitleOverlay({
  active,
  chunks,
  liveTranscript,
  interimLiveTranscript,
  isLiveListening,
  isTranscribing,
}: {
  active: boolean
  chunks: TranscriptChunk[]
  liveTranscript?: string
  interimLiveTranscript?: string
  isLiveListening?: boolean
  isTranscribing?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, SUBTITLE_TICK_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [active])

  const visibleChunks = useMemo(() => {
    if (!active || chunks.length === 0) return []
    return chunks
      .filter((chunk) => now - chunk.timestamp <= SUBTITLE_VISIBLE_MS)
      .slice(-MAX_SUBTITLE_LINES)
  }, [active, chunks, now])

  const liveText = (interimLiveTranscript || '').trim()

  const liveLines = useMemo(() => {
    if (!liveText) return []
    const words = liveText.split(/\s+/).filter(Boolean)
    if (words.length <= 18) return [words.join(' ')]
    const half = Math.ceil(words.length / 2)
    const first = words.slice(0, half).join(' ')
    const second = words.slice(half).join(' ')
    return [first, second]
  }, [liveText])

  if (visibleChunks.length === 0 && liveLines.length === 0 && !isLiveListening && !isTranscribing) {
    return null
  }

  const showChunkLines = liveLines.length === 0

  return (
    <div className="pointer-events-none absolute bottom-10 left-1/2 z-20 w-[min(900px,94%)] -translate-x-1/2 space-y-1 micro-enter">
      {liveLines.length > 0 ? (
        <div className="border border-white/40 bg-black/78 px-3 py-1.5 text-center text-sm leading-relaxed text-white backdrop-blur-sm">
          {liveLines.map((line, idx) => (
            <p key={`${idx}_${line.slice(0, 16)}`}>{line}</p>
          ))}
          {isLiveListening ? (
            <p className="mt-1 text-[10px] uppercase tracking-widest text-white/70">
              <span className="micro-pulse-dot mr-1 inline-block h-1.5 w-1.5 bg-emerald-300" />
              live mic
            </p>
          ) : null}
        </div>
      ) : (
        <div className="border border-white/30 bg-black/72 px-3 py-1.5 text-center text-xs uppercase tracking-widest text-white/80 backdrop-blur-sm">
          {isLiveListening ? 'listening...' : isTranscribing ? 'capturing transcript...' : 'waiting for mic'}
        </div>
      )}
      {showChunkLines && visibleChunks.map((chunk) => (
        <p
          key={chunk.chunk_index}
          className="border border-white/30 bg-black/72 px-3 py-1.5 text-center text-sm leading-relaxed text-white backdrop-blur-sm"
        >
          {chunk.text}
        </p>
      ))}
    </div>
  )
}
