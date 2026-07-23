// Detects the class of error thrown when a client is still running JS from a PREVIOUS
// Vercel deployment and tries to load a chunk (a lazy `import()`, a webpack-split
// route bundle) that no longer exists at the URL baked into that old build — the
// asset was superseded the moment the new deploy went live. This is not a bug in the
// running code; it just means a newer build is available and the tab needs a real
// reload to pick it up. Shared between ErrorBoundary (catches this inside the React
// render tree) and AppUpdateWatcher (catches it globally — chunk-load failures from a
// plain, non-Suspense `import()` surface as an unhandled promise rejection instead of
// a React render error) so both sides recognize the exact same error shapes.
export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'ChunkLoadError') return true
  const msg = error.message ?? ''
  return (
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  )
}
