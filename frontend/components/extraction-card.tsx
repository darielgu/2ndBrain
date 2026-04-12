'use client'

import { Brain, CircleDot, ListChecks, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ExtractionResult } from '@/lib/types'

export function ExtractionCard({
  extraction,
}: {
  extraction: ExtractionResult
}) {
  return (
    <Card className="rounded-none border-border bg-background/40 shadow-none">
      <CardHeader className="gap-1 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm lowercase">
          <Brain className="h-4 w-4 text-accent" />
          memory extracted
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        {/* People */}
        {extraction.people.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Users className="h-3 w-3" />
              people
            </p>
            <div className="flex flex-wrap gap-1.5">
              {extraction.people.map((person) => (
                <Badge
                  key={person.name}
                  variant="outline"
                  className="rounded-none border-border px-2 py-0.5 text-xs lowercase"
                >
                  {person.name}
                  {person.role_or_context && (
                    <span className="ml-1 text-muted-foreground">
                      — {person.role_or_context}
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Topics */}
        {extraction.topics.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <CircleDot className="h-3 w-3" />
              topics
            </p>
            <div className="flex flex-wrap gap-1.5">
              {extraction.topics.map((topic) => (
                <Badge
                  key={topic}
                  variant="outline"
                  className="rounded-none border-accent/30 bg-accent/5 px-2 py-0.5 text-xs lowercase text-accent"
                >
                  {topic}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Promises */}
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <ListChecks className="h-3 w-3" />
            promises
          </p>
          {extraction.promises.length > 0 ? (
            <ul className="space-y-1">
              {extraction.promises.map((promise, i) => (
                <li
                  key={i}
                  className="border-l-2 border-accent/40 pl-2 text-sm lowercase text-foreground/90"
                >
                  {promise}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs lowercase text-muted-foreground">
              no promises detected
            </p>
          )}
        </div>

        {/* Next Actions */}
        {extraction.next_actions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              next actions
            </p>
            <ul className="space-y-1">
              {extraction.next_actions.map((action, i) => (
                <li
                  key={i}
                  className="text-sm lowercase text-foreground/90"
                >
                  → {action}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
