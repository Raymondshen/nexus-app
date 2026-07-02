import type { Metadata, Viewport } from 'next'
import { Press_Start_2P, DM_Sans, Silkscreen } from 'next/font/google'
import { validateConfig } from '@/shared/constants/config'
import { SWRegister } from '@/shared/components/pwa/SWRegister'
import './globals.css'

const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start-2p',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const silkscreen = Silkscreen({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-silk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default:  'Nexus',
    template: '%s | Nexus',
  },
  description: 'Your crew. Your war. The group chat that fights back.',
  keywords:    ['messaging', 'RPG', 'group chat', 'game'],
  authors:     [{ name: 'Nexus' }],
  creator:     'Nexus',
  metadataBase: (() => {
    const raw = process.env.NEXT_PUBLIC_SITE_URL
    if (raw?.startsWith('http')) return new URL(raw)
    if (raw) return new URL(`https://${raw}`)
    return new URL('http://localhost:3000')
  })(),
  openGraph: {
    type:        'website',
    locale:      'en_US',
    url:         process.env.NEXT_PUBLIC_SITE_URL,
    title:       'Nexus — Your crew. Your war.',
    description: 'The group chat that fights back.',
    siteName:    'Nexus',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Nexus — Your crew. Your war.',
    description: 'The group chat that fights back.',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable:         true,
    statusBarStyle:  'black-translucent',
    title:           'Nexus',
  },
  icons: {
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  themeColor:    '#0a0612',
  width:         'device-width',
  initialScale:  1,
  minimumScale:  1,
  maximumScale:  1,
  viewportFit:   'cover',
}

validateConfig()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${pressStart2P.variable} ${dmSans.variable} ${silkscreen.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-[#0a0612] text-white antialiased">
        <SWRegister />
        {children}
      </body>
    </html>
  )
}
