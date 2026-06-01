// Sound effect stubs — infrastructure for adding sounds later.
// All functions are safe to call; they no-op when audio isn't configured.

type SoundKey = 'messageSend' | 'bossDamage' | 'bossDefeat' | 'levelUp' | 'artifactDrop'

const SOUNDS: Record<SoundKey, string | null> = {
  messageSend:  null,
  bossDamage:   null,
  bossDefeat:   null,
  levelUp:      null,
  artifactDrop: null,
}

let muted = false

export function setMuted(value: boolean): void {
  muted = value
}

export function isMuted(): boolean {
  return muted
}

export function playSound(key: SoundKey): void {
  if (muted) return
  const src = SOUNDS[key]
  if (!src) return
  try {
    const audio = new Audio(src)
    audio.volume = 0.4
    audio.play().catch(() => {})
  } catch {
    // Audio not supported
  }
}

export function haptic(pattern?: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  try {
    navigator.vibrate(pattern ?? 10)
  } catch {
    // Vibration not supported
  }
}
