import type { NextConfig } from 'next'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const withPWA: any = require('next-pwa')

const isDev = process.env.NODE_ENV === 'development'

const baseConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

const pwaConfig = {
  dest: 'public',
  disable: isDev,
  register: true,
  skipWaiting: true,
  // Don't cache auth routes
  exclude: [/\/login/, /\/signup/, /\/auth\//],
  fallbacks: {
    document: '/offline.html',
  },
  runtimeCaching: [
    // Static assets: CacheFirst, 30 days
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|otf)(\?.*)?$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'nexus-static',
        expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    // API routes: NetworkFirst, 10s timeout
    {
      urlPattern: /^https?:\/\/[^/]+\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'nexus-api',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    // Supabase API calls: NetworkFirst
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'nexus-supabase',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    // Pages: NetworkFirst
    {
      urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'nexus-pages',
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 16, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
  ],
}

export default isDev ? baseConfig : withPWA(pwaConfig)(baseConfig)
