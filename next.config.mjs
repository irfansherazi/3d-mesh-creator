import path from 'path'
import { fileURLToPath } from 'url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image (.next/standalone)
  output: 'standalone',
  // Pin the project root so a stray lockfile in a parent folder doesn't change the bundle layout
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // The API routes build paths from process.cwd(), which makes the tracer copy these folders into the bundle
  outputFileTracingExcludes: {
    '*': ['./uploads/**/*', './scripts/**/*'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
