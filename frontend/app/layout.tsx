import type { Metadata } from 'next'
import { Space_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const spaceMono = Space_Mono({ 
  weight: ['400', '700'],
  subsets: ["latin"],
  variable: '--font-space-mono'
});

export const metadata: Metadata = {
  title: '2ndbrain - Take your content into real life',
  description: 'Transform your content into actionable insights with 2ndbrain',
  generator: 'v0.app',
  icons: {
    icon: '/brain.jpg',
    apple: '/brain.jpg',
    shortcut: '/brain.jpg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${spaceMono.variable} font-sans antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
