import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      '@vladmandic/human': './node_modules/@vladmandic/human/dist/human.esm.js',
    },
  },
  // better-sqlite3 ships a native .node addon — keep it out of the server bundle
  // so it's resolved at runtime instead of being webpack-ed.
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
