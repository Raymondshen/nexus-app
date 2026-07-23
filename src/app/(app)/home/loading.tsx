// Suspense fallback for /home while the server component awaits crews + message
// previews. On a fresh launch this is invisible — LaunchSplashGate (mounted in
// (app)/layout.tsx) sits on top, opaque, for the whole window this could show —
// so it only actually matters for a client-side navigation back to /home later
// in the session (e.g. leaving a squad), where a plain black frame is enough;
// there's no wordmark to hand off to anymore now that the splash isn't scoped
// to this one route (see LaunchSplashGate's own doc comment for the split).
export default function HomeLoading() {
  return <div className="h-screen w-full bg-black" />
}
