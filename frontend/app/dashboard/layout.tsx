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

const navItems = [
  { label: 'overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { label: 'chat', href: '/dashboard/chat', icon: MessageSquare },
  { label: 'start session', href: '/dashboard/session', icon: Play },
  { label: 'people', href: '/dashboard/people', icon: Users },
  { label: 'history', href: '/dashboard/history', icon: History },
  { label: 'settings', href: '/dashboard/settings', icon: Settings },
]

type DashboardSnapshot = {
  generated_at: string
  active_loops: string[]
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeLoopCount, setActiveLoopCount] = useState(0)
  const [lastSync, setLastSync] = useState('pending')

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    let activeController: AbortController | null = null

    const load = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      activeController?.abort()
      activeController = new AbortController()

      try {
        let json: DashboardSnapshot | null = null

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch('/api/recognition/dashboard', {
              cache: 'no-store',
              signal: activeController.signal,
            })
            if (!res.ok) {
              throw new Error(`dashboard fetch failed (${res.status})`)
            }
            json = (await res.json()) as DashboardSnapshot
            break
          } catch (err) {
            if ((err as { name?: string })?.name === 'AbortError') return
            if (attempt === 1) throw err
            await new Promise((resolve) => setTimeout(resolve, 350))
          }
        }

        if (!json) return
        if (cancelled) return
        setActiveLoopCount(Array.isArray(json.active_loops) ? json.active_loops.length : 0)
        setLastSync(
          json.generated_at
            ? new Date(json.generated_at).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'pending'
        )
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
        console.warn('dashboard snapshot unavailable (transient):', err)
        if (!cancelled) {
          setActiveLoopCount(0)
          setLastSync('pending')
        }
      } finally {
        inFlight = false
      }
    }

    load()
    const interval = setInterval(load, 20_000)

    return () => {
      cancelled = true
      activeController?.abort()
      clearInterval(interval)
    }
  }, [])

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="grid h-full w-full gap-3 p-3 lg:grid-cols-[auto_1fr]">
        <aside
          className={`micro-enter border border-border bg-secondary/20 transition-all duration-200 ${
            sidebarOpen ? 'w-[260px] p-4' : 'w-14 p-2'
          } overflow-y-auto`}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="mb-3 flex w-full items-center justify-center border border-border bg-background/30 p-2 text-muted-foreground hover:-translate-y-px hover:text-foreground"
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
                  className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-sm lowercase hover:-translate-y-px ${
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
              <Sparkles className="micro-pulse-dot h-3.5 w-3.5" />
              {activeLoopCount} active loops
            </p>
            <p>last sync: {lastSync}</p>
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
                        className={`flex w-full items-center justify-center border p-2 hover:-translate-y-px ${
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

        <section className="micro-enter h-full overflow-y-auto border border-border bg-secondary/20 p-4">{children}</section>
      </div>
    </main>
  )
}
