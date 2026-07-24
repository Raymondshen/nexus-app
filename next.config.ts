import type { NextConfig } from 'next'

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
    localPatterns: [
      // `search` is an exact-string match in Next.js (not a glob), and the
      // encoded `url=` query differs per image — so match on pathname only.
      {
        pathname: '/api/og-image',
      },
    ],
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

// PWA/offline support is hand-written in public/sw-push.js (the only service
// worker anything registers — see SWRegister.tsx). next-pwa previously
// generated a second, parallel, never-registered service worker (sw.js +
// workbox-*.js + hashed fallback/worker chunks) here; it was removed since
// 100% of its output was dead weight regenerated on every build.
export default baseConfig
