export const config = {
  supabase: {
    url:     process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  },
  app: {
    url:     process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    name:    'Nexus',
    version: '1.0.0',
  },
  push: {
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
    configured:     !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  isDev:  process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
}

export function validateConfig(): void {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]
  const optional = [
    'NEXT_PUBLIC_SITE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  ]

  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`[Nexus] Missing required env var: ${name}. Check your environment variables.`)
    }
  }

  for (const name of optional) {
    if (!process.env[name]) {
      console.warn(`[Nexus] Optional env var not set: ${name}`)
    }
  }
}

// Named exports used by client components
export const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
