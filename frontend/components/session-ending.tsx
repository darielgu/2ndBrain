'use client'

import { useEffect, useState } from 'react'
import { Activity, Brain, Check, Database, Users } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Step-by-step simulated progress for the memory extraction pipeline.
// We can't get precise per-step telemetry from the backend without
// streaming, so the steps advance on a timer. Each step lingers ~900ms;
// the last one stays 'in_progress' until the parent unmounts this view.
const STEPS = [
  { id: 'audio', label: 'finalizing audio stream', Icon: Activity },
  { id: 'transcript', label: 'stitching transcript chunks', Icon: Activity },
  { id: 'speakers', label: 'resolving speaker turns', Icon: Users },
  { id: 'extract', label: 'extracting episode memory', Icon: Brain },
  { id: 'persist', label: 'writing to nia context store', Icon: Database },
] as const

const STEP_INTERVAL_MS = 900

// ASCII waveform frames — rotated to simulate a live signal analyzer.
// Each frame is 32 chars wide; lowercase to match the brutalist theme.
const WAVE_FRAMES = [
  '▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█',
  '▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇',
  '▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆',
  '▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅',
  '▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃',
  '▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▅▆▇█▇▆▅▃▂',
]

export function SessionEnding() {
  const [stepIndex, setStepIndex] = useState(0)
  const [waveIndex, setWaveIndex] = useState(0)
  const [tickCount, setTickCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1))
    }, STEP_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setWaveIndex((prev) => (prev + 1) % WAVE_FRAMES.length)
      setTickCount((prev) => prev + 1)
    }, 120)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="rounded-none border-border bg-background/40 shadow-none">
      <CardHeader className="gap-1 px-4 py-4">
        <CardTitle className="flex items-center justify-between text-sm lowercase">
          <span className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent" />
            session ending — building memory
          </span>
          <span className="font-mono text-[10px] lowercase tracking-wider text-muted-foreground">
            t+{String(tickCount).padStart(3, '0')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-4 pb-5">
        {/* ASCII signal readout — scan lines + flicker via globals.css */}
        <div className="ascii-signal-shell session-ending-panel relative border border-border bg-secondary/20 p-4">
          <div className="session-ending-sweep pointer-events-none absolute inset-0" />
          <div className="ascii-signal-scan" />

          <div className="relative space-y-3">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>signal ∥ memory layer</span>
              <span className="flex items-center gap-1.5">
                <span className="session-ending-dot h-1.5 w-1.5 bg-accent" />
                compiling
              </span>
            </div>

            <pre className="ascii-signal-art overflow-hidden whitespace-pre font-mono text-lg leading-tight tracking-[0.15em] text-foreground/90">
              {WAVE_FRAMES[waveIndex]}
            </pre>

            <div className="flex items-center justify-between font-mono text-[10px] lowercase tracking-wider text-muted-foreground">
              <span>
                chunks·merged · context·{String(stepIndex + 1).padStart(2, '0')}
                /{STEPS.length}
              </span>
              <span className="session-ending-cursor">_</span>
            </div>
          </div>
        </div>

        {/* Step-by-step pipeline readout */}
        <ol className="space-y-1.5 font-mono text-xs lowercase">
          {STEPS.map((step, i) => {
            const state =
              i < stepIndex
                ? 'done'
                : i === stepIndex
                ? 'active'
                : 'pending'
            const Icon = step.Icon
            return (
              <li
                key={step.id}
                className={`flex items-center gap-3 border border-transparent px-2 py-1.5 transition-colors ${
                  state === 'active'
                    ? 'border-accent/40 bg-accent/5 text-foreground'
                    : state === 'done'
                    ? 'text-muted-foreground/70'
                    : 'text-muted-foreground/40'
                }`}
              >
                <span className="font-mono text-[10px] tracking-wider">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex h-5 w-5 items-center justify-center border border-border/80">
                  {state === 'done' ? (
                    <Check className="h-3 w-3 text-accent" />
                  ) : state === 'active' ? (
                    <span className="session-ending-dot h-1.5 w-1.5 bg-accent" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                </span>
                <span className="flex-1">{step.label}</span>
                <span className="text-[10px] tracking-wider">
                  {state === 'done' ? 'ok' : state === 'active' ? '...' : '—'}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="overflow-hidden border-t border-border pt-3 font-mono text-[10px] lowercase tracking-wider text-muted-foreground">
          <div className="session-ending-marquee flex w-max gap-6 whitespace-nowrap">
            {Array.from({ length: 2 }).map((_, i) => (
              <span key={i} className="flex shrink-0 items-center gap-6">
                <span>writing episode to nia context store</span>
                <span>·</span>
                <span>deduping people</span>
                <span>·</span>
                <span>regenerating prose</span>
                <span>·</span>
                <span>embedding for retrieval</span>
                <span>·</span>
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
