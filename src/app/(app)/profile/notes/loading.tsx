// This route (`/profile/notes`) is a dead-redirect shim — page.tsx immediately
// redirects to `/profile` (Vibes now renders inline in ProfileClient) — so
// there's no real content here to skeleton. Bare black div only, same
// reasoning as `home/loading.tsx`.
export default function NotesLoading() {
  return (
    <div
      className="fixed inset-0 bg-black"
      style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}
    />
  )
}
