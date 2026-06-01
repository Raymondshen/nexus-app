# Nexus — Production Environment Variable Checklist

Set all of these in Vercel → Project → Settings → Environment Variables.

## Required Now

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL (Settings → API)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Your Supabase anon/public key (Settings → API)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Your Supabase service role key (Settings → API, keep secret)
- [ ] `NEXT_PUBLIC_SITE_URL` — Your production Vercel URL, e.g. `https://nexus-app.vercel.app`

## Required Later (after push notification desktop setup)

- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — VAPID public key for Web Push
- [ ] `VAPID_PRIVATE_KEY` — VAPID private key (keep secret, never expose client-side)
- [ ] `VAPID_SUBJECT` — VAPID subject, e.g. `mailto:your@email.com`

## Notes

- Never commit `.env.local` or `.env.production` with real values to git.
- `SUPABASE_SERVICE_ROLE_KEY` must only be used in server-side code (Edge Functions, Server Actions, API Routes).
- `NEXT_PUBLIC_*` variables are bundled into the client JS — do not put secrets in them.
- After adding VAPID keys, wire them into `src/lib/notifications.ts` `subscribeToPush()`.
