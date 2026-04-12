"use client"

import { ArrowRight, Github, Terminal, Copy, Check } from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AsciiSignal } from "@/components/ascii-signal"

const spaceGrotesk = Space_Grotesk({ weight: ["500", "700"], subsets: ["latin"] })

export function HeroHeader() {
  const [copied, setCopied] = useState(false)
  const repoUrl = "https://github.com/your-org/your-repo"

  const handleCopy = () => {
    navigator.clipboard.writeText("npx create-2ndbrain-app@latest")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <a href="/" className="text-lg font-bold lowercase tracking-tight text-foreground">
              2ndbrain
            </a>
            <nav className="hidden items-center gap-6 md:flex">
              <a href="#features" className="text-sm lowercase text-muted-foreground transition-colors hover:text-foreground">
                features
              </a>
              <a href="#pricing" className="text-sm lowercase text-muted-foreground transition-colors hover:text-foreground">
                pricing
              </a>
              <a href="#docs" className="text-sm lowercase text-muted-foreground transition-colors hover:text-foreground">
                docs
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="text-sm lowercase text-muted-foreground hover:text-foreground">
              sign in
            </Button>
            <Button className="bg-foreground text-background hover:bg-foreground/90 lowercase text-sm">
              get started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center md:py-32">
          {/* Eyebrow */}
          <div className="gleam-badge mb-6 inline-flex items-center gap-2 border border-border px-3 py-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center bg-white">
              <img src="/nia-logo.svg" alt="Nia logo" className="h-3 w-3 text-foreground" />
            </span>
            <span className="text-[10px] tracking-widest text-muted-foreground">
              powered by Nia
            </span>
          </div>

          {/* Main Headline */}
          <h1 className={`${spaceGrotesk.className} mb-6 text-4xl font-medium lowercase tracking-tight text-foreground md:text-6xl lg:text-7xl text-balance`}>
            bring your context into the{' '}
            <span className="font-serif italic normal-case tracking-normal">
              real world
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            2ndbrain transforms your scattered notes, documents, and ideas into actionable intelligence. 
            search across your entire knowledge base with ai-powered precision.
          </p>

          {/* CTA Buttons */}
          <div className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button className="h-12 bg-foreground px-8 text-background hover:bg-foreground/90 lowercase text-sm">
              start for free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button asChild variant="outline" className="h-12 border-border px-8 text-foreground hover:bg-muted lowercase text-sm">
              <a href={repoUrl} target="_blank" rel="noreferrer">
                <Github className="mr-2 h-4 w-4" />
                github
              </a>
            </Button>
          </div>

          {/* Terminal Installation Box */}
          <div className="mx-auto max-w-md">
            <div className="border border-border bg-muted/30">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">terminal</span>
                </div>
                <button 
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      copy
                    </>
                  )}
                </button>
              </div>
              <div className="px-4 py-3">
                <code className="text-sm text-foreground">
                  <span className="text-muted-foreground">{">"}</span> npx create-2ndbrain-app@latest
                </code>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Image/Video Placeholder */}
        <div className="mx-auto max-w-6xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-xl border border-border bg-muted/30">
            <div className="aspect-video w-full">
              {/* Simulated App Interface */}
              <div className="h-full w-full bg-secondary p-4">
                {/* Window Chrome */}
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-border" />
                  <div className="h-3 w-3 rounded-full bg-border" />
                  <div className="h-3 w-3 rounded-full bg-border" />
                </div>
                
                {/* Simulated Dashboard */}
                <div className="grid h-[calc(100%-2rem)] grid-cols-12 gap-4">
                  {/* Sidebar */}
                  <div className="col-span-3 space-y-3 border-r border-border pr-4">
                    <div className="h-8 w-full bg-muted/50" />
                    <div className="h-6 w-3/4 bg-muted/30" />
                    <div className="h-6 w-1/2 bg-muted/30" />
                    <div className="h-6 w-2/3 bg-muted/30" />
                    <div className="h-6 w-3/4 bg-muted/30" />
                  </div>
                  
                  {/* Main Content */}
                  <div className="col-span-9 space-y-4">
                    {/* Search Bar */}
                    <div className="flex items-center gap-2 border border-border bg-background/50 px-4 py-3">
                      <div className="h-4 w-4 rounded bg-accent/50" />
                      <div className="h-4 flex-1 bg-muted/30" />
                    </div>
                    
                    {/* Content Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2 border border-border p-4">
                        <div className="h-4 w-1/2 bg-muted/50" />
                        <div className="h-3 w-full bg-muted/30" />
                        <div className="h-3 w-3/4 bg-muted/30" />
                      </div>
                      <div className="space-y-2 border border-border p-4">
                        <div className="h-4 w-2/3 bg-muted/50" />
                        <div className="h-3 w-full bg-muted/30" />
                        <div className="h-3 w-1/2 bg-muted/30" />
                      </div>
                      <div className="space-y-2 border border-border p-4">
                        <div className="h-4 w-1/3 bg-muted/50" />
                        <div className="h-3 w-full bg-muted/30" />
                        <div className="h-3 w-2/3 bg-muted/30" />
                      </div>
                      <div className="space-y-2 border border-border p-4">
                        <div className="h-4 w-3/4 bg-muted/50" />
                        <div className="h-3 w-full bg-muted/30" />
                        <div className="h-3 w-1/2 bg-muted/30" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          <AsciiSignal />
          </div>
        </div>
      </section>

      {/* Logo Marquee Section */}
      <section className="border-y border-border py-12">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-xs uppercase tracking-widest text-muted-foreground">
            trusted by teams at
          </p>
          <div className="relative overflow-hidden">
            <div className="flex animate-marquee items-center gap-12">
              {['vercel', 'stripe', 'linear', 'notion', 'figma', 'github', 'slack', 'discord'].map((company) => (
                <div 
                  key={company} 
                  className="flex-shrink-0 text-lg font-bold text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                >
                  {company}
                </div>
              ))}
              {/* Duplicate for seamless loop */}
              {['vercel', 'stripe', 'linear', 'notion', 'figma', 'github', 'slack', 'discord'].map((company) => (
                <div 
                  key={`${company}-2`} 
                  className="flex-shrink-0 text-lg font-bold text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                >
                  {company}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
