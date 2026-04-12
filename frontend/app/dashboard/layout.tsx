'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  MessageSquare,
  Plug,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { activeLoops } from '@/lib/dashboard-data'

const navItems = [
  { label: 'overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { label: 'start session', href: '/dashboard/session', icon: Play },
  { label: 'people', href: '/dashboard/people', icon: Users },
  { label: 'chat', href: '/dashboard/chat', icon: MessageSquare },
  { label: 'history', href: '/dashboard/history', icon: History },
  { label: 'integrations', href: '/dashboard/integrations', icon: Plug },
  { label: 'settings', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)

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
              {activeLoops.length} active loops
            </p>
            <p>last sync: 2 min ago</p>
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
