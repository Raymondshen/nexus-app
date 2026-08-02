'use client'

import { useState } from 'react'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'
import { config } from '@/shared/constants/config'

interface InviteCodeCardProps {
  inviteCode: string
  /** Shown in the copied clipboard text ("Join my group on {groupName} —
   *  {link}"). Required, not optional — every current call site already has
   *  the crew's name in scope; a silently-missing name would just read
   *  "Join my group on  — {link}" with a blank hole in it. */
  groupName:  string
  style?: React.CSSProperties
  /** `'bordered'` (default, Figma 438:8098) — MessageList's empty state: bordered
   *  surface box, fixed 68px height, drop-shadow copy button with icon, "Invite new
   *  members" label. `'inline'` (Figma 674:14743) — ChatRoomBrowseSheet's Current
   *  Squad Information hero: no border/background/shadow (the row sits directly in
   *  the hero card's own surface + padding), no copy icon, intrinsic height, and a
   *  shorter "invite a member" label. `'success'` (Figma 784:24831, re-verified
   *  against a fresh pull of that node — the first pass had guessed this shared
   *  'bordered's own purple-border/gradient-text/solid-button look, which turned
   *  out wrong) — the create-group success screen: solid `--color-surface` fill,
   *  NO border, a DM Sans Light (not Silkscreen) "Invite new members" label, the
   *  code itself in plain primary text with a purple text-shadow glow (not a
   *  gradient-clip fill), and a purple->magenta GRADIENT-fill button (not solid
   *  purple) with no drop-shadow and no icon, labelled "Copy Invite Code". These
   *  diverged enough in Figma that this variant renders its own markup below
   *  rather than reusing 'bordered'/'inline's shared JSX — only the copy-to-
   *  clipboard behavior is shared across all three. */
  variant?: 'bordered' | 'inline' | 'success'
}

// Shared by ChatRoomBrowseSheet's Current Squad Information hero, MessageList's
// empty state, and the create-group success screen (Figma 674:14743 / 438:8098 /
// 784:24831) — same invite-code-copy behavior, `variant` picks which Figma
// treatment to render (see the prop doc above).
export function InviteCodeCard({ inviteCode, groupName, style, variant = 'bordered' }: InviteCodeCardProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (copied) return
    // The link lands on /login?code=XXX, which JoinGroupStep auto-checks on
    // mount (its `initialCode` prop — see that file and login/page.tsx's
    // `sharedInviteCode`) rather than just dropping the recipient on a bare
    // sign-in screen they'd still have to re-type the code into.
    const link = `${config.app.url}/login?code=${inviteCode}`
    navigator.clipboard.writeText(`Join my group on ${groupName} — ${link}\nCode: ${inviteCode}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  if (variant === 'success') {
    return (
      <div
        className="flex items-center justify-between w-full rounded-[var(--x3)] bg-[var(--color-surface)]"
        style={{ height: 68, padding: 'var(--x5)', ...style }}
      >
        <div className="flex flex-col items-start justify-center" style={{ gap: 'var(--x2)' }}>
          <p
            className="font-body font-light leading-none text-primary whitespace-nowrap"
            style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}
          >
            Invite new members
          </p>
          <p
            className="font-silkscreen leading-none text-primary whitespace-nowrap"
            style={{ fontSize: 'var(--xl)', letterSpacing: '0.2px', textShadow: '0 0 3px #a855f7' }}
          >
            {inviteCode}
          </p>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center justify-center flex-shrink-0 appearance-none transition-opacity active:opacity-80 rounded-[var(--x3)]"
          style={{ height: 48, padding: 'var(--x3) var(--x5)', background: 'linear-gradient(90deg, #a855f7, #d946ef)' }}
        >
          {/* `key` forces React to mount a brand-new node per state instead of mutating
              the existing text node in place — iOS Safari can otherwise leave the old
              label's glyphs painted through the gradient background for a frame (a
              WebKit repaint/compositing quirk that coincides with this button's own
              active:opacity-80 → opacity-1 release transition), which read as "Copied!"
              rendering on top of/behind "Copy Invite Code" instead of cleanly replacing it. */}
          <span
            key={copied ? 'copied' : 'copy'}
            className="font-body font-medium leading-none text-primary whitespace-nowrap"
            style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
          >
            {copied ? 'Copied!' : 'Copy Invite Code'}
          </span>
        </button>
      </div>
    )
  }

  const inline = variant === 'inline'

  return (
    <div
      className={`flex items-center justify-between w-full ${inline ? '' : 'bg-[var(--color-surface)] border border-purple'}`}
      style={{ height: inline ? undefined : 68, padding: inline ? 0 : 'var(--x5)', ...style }}
    >
      <div className="flex flex-col items-center justify-center font-silkscreen" style={{ gap: 'var(--x2)' }}>
        <p className="leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--mini)' }}>
          {inline ? 'invite a member' : 'Invite new members'}
        </p>
        <p
          className="leading-none bg-clip-text text-transparent whitespace-nowrap"
          style={{
            fontSize:        'var(--xl)',
            letterSpacing:   '0.2px',
            backgroundImage: 'linear-gradient(90deg, #a855f7, #d946ef)',
            textShadow:      '0 0 3px #a855f7',
          }}
        >
          {inviteCode}
        </p>
      </div>

      <button
        onClick={handleCopy}
        className="flex items-center justify-center flex-shrink-0 appearance-none transition-opacity active:opacity-80"
        style={{
          background: 'var(--color-purple)',
          boxShadow:  inline ? undefined : '4px 4px 0 rgba(168,85,247,0.5)',
          padding:    'var(--x4) var(--x5)',
          gap:        'var(--x3)',
        }}
      >
        {!inline && (copied ? (
          <Check style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
        ) : (
          <Copy style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
        ))}
        <span key={copied ? 'copied' : 'copy'} className="font-silkscreen leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--xxs)' }}>
          {copied ? 'Copied!' : 'Copy Code'}
        </span>
      </button>
    </div>
  )
}
