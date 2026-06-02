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
      // Google OAuth profile pictures
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
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
    // Google profile pictures: CacheFirst, 7 days
    {
      urlPattern: /^https:\/\/lh3\.googleusercontent\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'nexus-avatars',
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // Supabase Storage images (chat-images bucket): CacheFirst, 30 days
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/chat-images\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'nexus-chat-images',
        expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
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
