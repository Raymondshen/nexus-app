export default function NotesLoading() {
  return (
    <div
      className="fixed inset-0 bg-black"
      style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}
    >
      <div
        className="bg-border animate-pulse"
        style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}
      />
    </div>
  )
}
