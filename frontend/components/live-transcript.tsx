'use client'

import { useEffect, useRef } from 'react'
import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TranscriptChunk } from '@/lib/types'

export function LiveTranscript({
  chunks,
  isTranscribing,
}: {
  chunks: TranscriptChunk[]
  isTranscribing: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new chunks arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chunks.length])

  return (
    <Card className="rounded-none border-border bg-background/40 shadow-none">
      <CardHeader className="gap-1 px-4 py-3">
        <CardTitle className="flex items-center justify-between text-sm lowercase">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            live transcript
          </span>
          {isTranscribing && (
            <Badge
              variant="outline"
              className="rounded-none border-border px-2 py-0.5 text-[10px] lowercase tracking-wider text-muted-foreground"
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse bg-accent" />
              transcribing...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ScrollArea className="h-48">
          <div className="space-y-2 pr-3">
            {chunks.length === 0 ? (
              <p className="text-xs lowercase text-muted-foreground">
                waiting for audio...
              </p>
            ) : (
              chunks.map((chunk) => (
                <p
                  key={chunk.chunk_index}
                  className="text-sm lowercase leading-relaxed text-foreground/90"
                >
                  {chunk.text}
                </p>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
