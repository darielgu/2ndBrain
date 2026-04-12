'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  MessageSquare,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Person } from '@/lib/types'

const navItems = [
  { label: 'overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { label: 'start session', href: '/dashboard/session', icon: Play },
  { label: 'people', href: '/dashboard/people', icon: Users },
  { label: 'chat', href: '/dashboard/chat', icon: MessageSquare },
  { label: 'history', href: '/dashboard/history', icon: History },
  { label: 'settings', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loopsCount, setLoopsCount] = useState<number | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Poll for active loops on mount + whenever the user navigates between
  // dashboard pages. Cheap because the list is bounded and cached by Nia.
  useEffect(() => {
    let cancelled = false
    fetch('/api/memory?type=person')
      .then((r) => r.json())
      .then((data: { people?: Person[] }) => {
        if (cancelled) return
        const total = Array.isArray(data.people)
          ? data.people.reduce(
              (sum, p) => sum + (p.open_loops?.length || 0),
              0,
            )
          : 0
        setLoopsCount(total)
        setLastSyncedAt(new Date())
      })
      .catch(() => {
        if (!cancelled) setLoopsCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [pathname])

  const loopsLabel = loopsCount === null ? '—' : loopsCount
  const syncLabel = lastSyncedAt
    ? `last sync: ${lastSyncedAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'last sync: pending'

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="grid h-full w-full gap-3 p-3 lg:grid-cols-[auto_1fr]">
        <aside
          className={`border border-border bg-secondary/20 transition-all duration-200 ${
            sidebarOpen ? 'w-[260px] p-4' : 'w-14 p-2'
          } overflow-y-auto`}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="mb-3 flex w-full items-center justify-center border border-border bg-background/30 p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={sidebarOpen ? 'close sidebar' : 'open sidebar'}
            title={sidebarOpen ? 'close sidebar' : 'open sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>

          {sidebarOpen ? (
            <>
          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-sm lowercase transition-colors ${
                    active
                      ? 'border-foreground/60 bg-background text-foreground'
                      : 'border-border bg-background/30 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <Separator className="my-4" />

          <div className="space-y-2 border border-border bg-background/30 p-3 text-xs lowercase text-muted-foreground">
            <p className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              {loopsLabel} active loops
            </p>
            <p>{syncLabel}</p>
          </div>
            </>
          ) : (
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href

                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={`flex w-full items-center justify-center border p-2 transition-colors ${
                          active
                            ? 'border-foreground/60 bg-background text-foreground'
                            : 'border-border bg-background/30 text-muted-foreground hover:text-foreground'
                        }`}
                        aria-label={item.label}
                      >
                        <Icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="lowercase">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </nav>
          )}
        </aside>

        <section className="h-full overflow-y-auto border border-border bg-secondary/20 p-4">{children}</section>
      </div>
    </main>
  )
}
