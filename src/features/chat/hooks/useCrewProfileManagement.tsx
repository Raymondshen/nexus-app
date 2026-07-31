import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useChatStore } from '@/store/chatStore'
import { renameCrewAction } from '@/app/(app)/chat/actions'

// Unlike GifPickerSheet/EventCreationSheet/ManageSquadProfile (dynamically imported but
// conditionally MOUNTED by their caller), these two aren't conditionally mounted — they
// stay in the tree permanently once opened so their OWN internal AnimatePresence (keyed
// on the `file` prop) can play the close transition after `file` goes back to null. A
// plain dynamic() swap alone would still fetch the crop-tooling chunk (react-easy-crop +
// canvas compression) on every chat mount, since the component is present in the tree
// from the first render either way — `crewImageModalMounted`/`crewBgModalMounted` below
// are what actually defer the fetch to first use, by keeping these unmounted entirely
// until then.
const CrewImageUploadModal = dynamic(
  () => import('@/features/chat/components/sheets/CrewImageUploadModal').then((m) => m.CrewImageUploadModal),
  { ssr: false },
)
const CrewBackgroundUploadModal = dynamic(
  () => import('@/features/chat/components/sheets/CrewBackgroundUploadModal').then((m) => m.CrewBackgroundUploadModal),
  { ssr: false },
)

interface UseCrewProfileManagementParams {
  crewId:               string
  initialCrewImageUrl?: string | null
  initialCrewBgUrl?:    string | null
  liveCrewName:         string // for the rename's optimistic-update/rollback
}

// Owns crew image/background upload (file pick → crop modal → resolved URL) and crew
// rename. Extracted out of ChatInput (which had grown to ~2,500 lines mixing this with
// presence/composer/mention/send concerns); nothing about the underlying behavior
// changed in the move.
export function useCrewProfileManagement({ crewId, initialCrewImageUrl, initialCrewBgUrl, liveCrewName }: UseCrewProfileManagementParams) {
  const setCrewName = useChatStore((s) => s.setCrewName)

  const [crewImageUrl,  setCrewImageUrl]  = useState<string | null>(initialCrewImageUrl ?? null)
  const [crewImageFile, setCrewImageFile] = useState<File | null>(null)
  const [crewBgUrl,     setCrewBgUrl]     = useState<string | null>(initialCrewBgUrl ?? null)
  const [crewBgFile,    setCrewBgFile]    = useState<File | null>(null)
  // Flips true (and stays true) the first time each crop modal is actually opened — see
  // the dynamic() imports above for why this is what actually defers fetching their
  // chunk, not the dynamic() wrapping alone.
  const [crewImageModalMounted, setCrewImageModalMounted] = useState(false)
  const [crewBgModalMounted,    setCrewBgModalMounted]    = useState(false)

  const crewImageInputRef = useRef<HTMLInputElement>(null)
  const crewBgInputRef    = useRef<HTMLInputElement>(null)

  function onCrewImageFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) { setCrewImageFile(f); setCrewImageModalMounted(true) }
    e.target.value = ''
  }

  function onCrewBgFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) { setCrewBgFile(f); setCrewBgModalMounted(true) }
    e.target.value = ''
  }

  function openImagePicker() {
    crewImageInputRef.current?.click()
  }

  function openBackgroundPicker() {
    crewBgInputRef.current?.click()
  }

  const imageModal: ReactNode = crewImageModalMounted ? (
    <CrewImageUploadModal
      file={crewImageFile}
      crewId={crewId}
      onClose={() => setCrewImageFile(null)}
      onSuccess={(url) => setCrewImageUrl(url)}
    />
  ) : null

  const bgModal: ReactNode = crewBgModalMounted ? (
    <CrewBackgroundUploadModal
      file={crewBgFile}
      crewId={crewId}
      onClose={() => setCrewBgFile(null)}
      onSuccess={(url) => setCrewBgUrl(url)}
    />
  ) : null

  // Optimistic rename with rollback — matches ManageSquadProfile's existing `onSave`
  // prop type exactly: (newName: string) => Promise<{ error?: string } | void>.
  async function renameCrew(newName: string) {
    const trimmed = newName.trim()
    const prev = liveCrewName
    setCrewName(trimmed)
    const result = await renameCrewAction(crewId, trimmed)
    if (result?.error) { setCrewName(prev); return result }
    return result
  }

  return {
    crewImageUrl, crewBgUrl,
    crewImageInputRef, crewBgInputRef,
    onCrewImageFileChange, onCrewBgFileChange,
    openImagePicker, openBackgroundPicker,
    imageModal, bgModal,
    renameCrew,
  }
}
