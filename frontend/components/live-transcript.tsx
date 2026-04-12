'use client'

import { useEffect, useMemo, useRef } from 'react'
import { FileText, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TranscriptChunk, TranscriptSegment } from '@/lib/types'

// Brutalist palette for speaker tags — just enough hue variation to
// distinguish speakers without breaking the terminal aesthetic.
const SPEAKER_COLORS: Record<string, { text: string; border: string; bg: string }> = {
  person1: {
    text: 'text-[#3b82f6]',
    border: 'border-[#3b82f6]/40',
    bg: 'bg-[#3b82f6]/5',
  },
  person2: {
    text: 'text-[#10b981]',
    border: 'border-[#10b981]/40',
    bg: 'bg-[#10b981]/5',
  },
  person3: {
    text: 'text-[#f59e0b]',
    border: 'border-[#f59e0b]/40',
    bg: 'bg-[#f59e0b]/5',
  },
  person4: {
    text: 'text-[#8b5cf6]',
    border: 'border-[#8b5cf6]/40',
    bg: 'bg-[#8b5cf6]/5',
  },
  person5: {
    text: 'text-[#ef4444]',
    border: 'border-[#ef4444]/40',
    bg: 'bg-[#ef4444]/5',
  },
}

// Palette used when a speaker label isn't a known personN — e.g. after
// the vision pipeline has remapped "person2" → "enzo garcia". Keyed by
// a simple string hash so the same name always gets the same color
// across renders.
const NAMED_PALETTE: Array<{ text: string; border: string; bg: string }> = [
  { text: 'text-[#3b82f6]', border: 'border-[#3b82f6]/40', bg: 'bg-[#3b82f6]/5' },
  { text: 'text-[#10b981]', border: 'border-[#10b981]/40', bg: 'bg-[#10b981]/5' },
  { text: 'text-[#f59e0b]', border: 'border-[#f59e0b]/40', bg: 'bg-[#f59e0b]/5' },
  { text: 'text-[#8b5cf6]', border: 'border-[#8b5cf6]/40', bg: 'bg-[#8b5cf6]/5' },
  { text: 'text-[#ef4444]', border: 'border-[#ef4444]/40', bg: 'bg-[#ef4444]/5' },
  { text: 'text-[#ec4899]', border: 'border-[#ec4899]/40', bg: 'bg-[#ec4899]/5' },
]

function hashName(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function speakerStyle(speaker: string) {
  const known = SPEAKER_COLORS[speaker]
  if (known) return known
  // Unknown label = real name remapped from vision. Hash to palette.
  return NAMED_PALETTE[hashName(speaker) % NAMED_PALETTE.length]
}

interface FlatSegment extends TranscriptSegment {
  key: string
}

export function LiveTranscript({
  chunks,
  isTranscribing,
}: {
  chunks: TranscriptChunk[]
  isTranscribing: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Flatten chunk → segments, merging adjacent segments from the same
  // speaker so repeated labels don't stack visually. Falls back to raw
  // text when a chunk has no segments yet.
  const flattened = useMemo<FlatSegment[]>(() => {
    const out: FlatSegment[] = []
    for (const chunk of chunks) {
      const segs =
        chunk.segments && chunk.segments.length > 0
          ? chunk.segments
          : [{ speaker: 'person1', text: chunk.text }]
      segs.forEach((seg, i) => {
        const last = out[out.length - 1]
        if (last && last.speaker === seg.speaker) {
          last.text = `${last.text} ${seg.text}`.trim()
        } else {
          out.push({
            speaker: seg.speaker,
            text: seg.text,
            key: `${chunk.chunk_index}-${i}`,
          })
        }
      })
    }
    return out
  }, [chunks])

  const speakerCount = useMemo(() => {
    const set = new Set<string>()
    for (const seg of flattened) set.add(seg.speaker)
    return set.size
  }, [flattened])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [flattened.length])

  return (
    <Card className="rounded-none border-border bg-background/40 shadow-none">
      <CardHeader className="gap-1 px-4 py-3">
        <CardTitle className="flex items-center justify-between text-sm lowercase">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            live transcript
          </span>
          <div className="flex items-center gap-2">
            {speakerCount > 0 && (
              <Badge
                variant="outline"
                className="rounded-none border-border px-2 py-0.5 text-[10px] lowercase tracking-wider text-muted-foreground"
              >
                <Users className="mr-1 h-3 w-3" />
                {speakerCount} {speakerCount === 1 ? 'speaker' : 'speakers'}
              </Badge>
            )}
            {isTranscribing && (
              <Badge
                variant="outline"
                className="rounded-none border-border px-2 py-0.5 text-[10px] lowercase tracking-wider text-muted-foreground"
              >
                <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse bg-accent" />
                transcribing...
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ScrollArea className="h-48">
          <div className="space-y-2 pr-3">
            {flattened.length === 0 ? (
              <p className="text-xs lowercase text-muted-foreground">
                waiting for audio...
              </p>
            ) : (
              flattened.map((seg) => {
                const style = speakerStyle(seg.speaker)
                return (
                  <div
                    key={seg.key}
                    className="flex gap-2 text-sm lowercase leading-relaxed"
                  >
                    <span
                      className={`h-fit shrink-0 border ${style.border} ${style.bg} ${style.text} px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider`}
                    >
                      {seg.speaker}
                    </span>
                    <p className="text-foreground/90">{seg.text}</p>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
