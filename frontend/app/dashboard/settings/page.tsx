import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <div className="border border-border bg-background/40 px-4 py-4 md:px-5 md:py-5">
        <h1 className="text-xl tracking-tight text-foreground md:text-2xl">Workspace Settings</h1>
      </div>

      <div className="border border-border bg-background/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Settings className="h-4 w-4" />
          configuration
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <article className="border border-border bg-background/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">memory capture</p>
            <p className="mt-1 text-sm lowercase">enabled</p>
          </article>
          <article className="border border-border bg-background/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">camera identity confidence</p>
            <p className="mt-1 text-sm lowercase">0.50 threshold</p>
          </article>
          <article className="border border-border bg-background/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">sync cadence</p>
            <p className="mt-1 text-sm lowercase">every 5 minutes</p>
          </article>
          <article className="border border-border bg-background/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">export format</p>
            <p className="mt-1 text-sm lowercase">json + markdown</p>
          </article>
        </div>
      </div>
    </div>
  )
}
