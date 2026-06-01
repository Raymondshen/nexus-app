import type { Metadata, Viewport } from 'next'
import { Press_Start_2P } from 'next/font/google'
import { validateConfig } from '@/lib/config'
import './globals.css'

const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start-2p',
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
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  validateConfig()

  return (
    <html lang="en" className={pressStart2P.variable}>
      <body className="min-h-screen bg-[#0a0612] text-white antialiased">
        {children}
      </body>
    </html>
  )
}
