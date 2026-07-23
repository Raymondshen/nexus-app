// SSR-safe localStorage dev-flag reader for useSyncExternalStore — the React-idiomatic
// way to sync from an external store like localStorage (an effect that calls setState
// in its body isn't; see react-hooks/set-state-in-effect). getServerSnapshot always
// returns false regardless of what's actually in localStorage, which also sidesteps
// any SSR/hydration mismatch. `changeEvent` lets same-tab writers (a Settings toggle,
// say) notify subscribers immediately — localStorage's own `storage` event only fires
// in OTHER tabs, never the one that wrote it.
export function makeLocalStorageFlagStore(storageKey: string, changeEvent: string) {
  function getSnapshot() {
    return typeof window === 'undefined' ? false : localStorage.getItem(storageKey) === '1'
  }
  function subscribe(onStoreChange: () => void) {
    window.addEventListener(changeEvent, onStoreChange)
    return () => window.removeEventListener(changeEvent, onStoreChange)
  }
  return { getSnapshot, subscribe }
}

export function getServerFlagSnapshotFalse() {
  return false
}
