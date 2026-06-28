import type { NextConfig } from 'next'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const withPWA: any = require('next-pwa')

const isDev = process.env.NODE_ENV === 'development'

const baseConfig: NextConfig = {
  // turbopack removed from config — having it here enables Turbopack for
  // production builds, which causes Vercel's pipeline to generate an internal
  // proxy.ts from middleware.ts and then error on finding both files.
  // Use `next dev --turbo` to opt into Turbopack during development.
  images: {
    deviceSizes: [390, 768, 1080],
    imageSizes:  [24, 32, 40, 48, 56, 64, 128, 256],
    // Cache Vercel-optimized images for 7 days (matches SW rule for Google avatars).
    // Without this, Next.js defaults to 60 s and re-optimizes on every cache miss.
    minimumCacheTTL: 604800,
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
    // Google profile pictures: CacheFirst, 7 days — URL rule fires before generic extension rule
    {
      urlPattern: /^https:\/\/lh3\.googleusercontent\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'nexus-avatars',
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // Supabase avatars bucket: CacheFirst, 365 days (paths include a timestamp — immutable)
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/avatars\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'nexus-avatars-storage',
        expiration: { maxEntries: 500, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
    // Supabase chat-images bucket: CacheFirst, 30 days
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/chat-images\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'nexus-chat-images',
        expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    // Supabase render/image API (resized versions): CacheFirst, 30 days
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/render\/image\/public\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'nexus-rendered-images',
        expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    // Supabase Storage (all other public buckets): CacheFirst, 30 days
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'nexus-storage',
        expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    // Static assets — exclude Supabase/Google hosts whose URL rules already fired above
    {
      urlPattern: ({ url }: { url: URL }) =>
        !url.hostname.includes('.supabase.co') &&
        url.hostname !== 'lh3.googleusercontent.com' &&
        /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|otf)(\?.*)?$/i.test(url.pathname),
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
