// Shared metadata for the "launch 1" ghost sprite
// (public/sprites/ghost/launch/launch_0001.webp…0009.webp, 1-indexed) — used by
// both LaunchSplashContent (the global app-launch splash, 48px) and the login
// landing screen's LandingGhost (774:19681, 64px). Frame count/interval/path
// used to be duplicated independently in both files; centralized here so a
// future re-export of the sprite sheet (different frame count, different
// timing) only needs to change one place.
export const GHOST_LAUNCH_FRAME_COUNT = 9
export const GHOST_LAUNCH_FRAME_MS    = 130

export function ghostLaunchFrameSrc(frameIndex: number): string {
  return `/sprites/ghost/launch/launch_${String(frameIndex + 1).padStart(4, '0')}.webp`
}

// Preloads every frame so a cold Cache Storage (first-ever visit, or an iOS
// storage-pressure eviction) doesn't show a blank frame mid-cycle while a
// not-yet-fetched frame is still in flight — the frames are tiny (~250B each)
// but an un-primed fetch can still lose the race against the 130ms interval.
export function preloadGhostLaunchFrames(): void {
  for (let i = 0; i < GHOST_LAUNCH_FRAME_COUNT; i++) {
    const img = new window.Image()
    img.src = ghostLaunchFrameSrc(i)
  }
}
