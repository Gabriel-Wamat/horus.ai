import { createMDX } from 'fumadocs-mdx/next'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(__dirname, '../..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: workspaceRoot,
  },
}

const withMDX = createMDX()

export default withMDX(nextConfig)
