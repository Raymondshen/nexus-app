"use client";

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import type { Area } from "react-easy-crop";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { addPhotoAction, deletePhotoAction } from "@/app/(app)/profile/actions";
import {
  compressCanvas,
  extForBlob,
  validateImageFile,
} from "@/shared/utils/imageCompress";
import { drawCroppedCanvas } from "@/shared/utils/cropImage";
import { avatarImageLoader } from "@/shared/supabase/imageLoader";
import { createClient } from "@/shared/supabase/client";
import { BottomSheet } from "@/shared/components/ui/sheet/BottomSheet";
import { PhotoCropModal } from "@/shared/components/ui/PhotoCropModal";
import { ImagePreviewOverlay } from "@/shared/components/overlays/ImagePreviewOverlay";
import type { ProfilePhoto } from "@/types";

const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB input limit
const MAX_PHOTOS = 30;
const PHOTO_SIZE = 800; // target square dimension

// ─── PhotoActionSheet — long-press context menu ───────────────────────────────

function PhotoActionSheet({
  onView,
  onRemove,
  onClose,
  isOwner,
}: {
  onView: () => void;
  onRemove: () => void;
  onClose: () => void;
  isOwner: boolean;
}) {
  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 400) onClose();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex flex-col" style={{ padding: 24, gap: 4 }}>
          <button
            className="flex items-center text-left w-full"
            style={{ height: 48 }}
            onClick={() => {
              onView();
              onClose();
            }}
          >
            <span
              className="font-body font-medium text-primary"
              style={{
                fontSize: "var(--text-sm)",
                fontVariationSettings: '"opsz" 14',
              }}
            >
              View Photo
            </span>
          </button>

          {isOwner && (
            <button
              className="flex items-center text-left w-full"
              style={{ height: 48 }}
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              <span
                className="font-body font-medium"
                style={{
                  fontSize: "var(--text-sm)",
                  fontVariationSettings: '"opsz" 14',
                  color: "var(--color-danger)",
                }}
              >
                Remove Photo
              </span>
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── PhotoCell — single grid tile ────────────────────────────────────────────

function PhotoCell({
  photo,
  isOwner,
  onRemove,
  onView,
}: {
  photo: ProfilePhoto;
  isOwner: boolean;
  onRemove: () => void;
  onView: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  function onPointerDown() {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      setShowActions(true);
    }, 500);
  }

  function cancelPress() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleTap(e: React.MouseEvent) {
    if (firedRef.current) {
      e.preventDefault();
      firedRef.current = false;
      return;
    }
    onView();
  }

  return (
    <div
      className="relative overflow-hidden flex-1"
      style={{
        aspectRatio: "1",
        background: "var(--color-surface)",
        minWidth: 0,
      }}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onClick={handleTap}
    >
      <Image
        src={photo.url}
        alt=""
        fill
        sizes="(max-width: 480px) 33vw, 160px"
        className="object-cover"
        style={{ pointerEvents: "none" }}
        loading="lazy"
        loader={avatarImageLoader}
      />

      <AnimatePresence>
        {showActions && (
          <PhotoActionSheet
            isOwner={isOwner}
            onView={onView}
            onRemove={onRemove}
            onClose={() => setShowActions(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── PhotosGrid (main export) ─────────────────────────────────────────────────

export interface PhotosGridHandle {
  /** Opens the native gallery/file picker — used by ProfileClient's floating pill "+" button. */
  openAdd: () => void;
  /** Opens the native camera directly — used by ProfileClient's floating pill "+" button. */
  openCamera: () => void;
}

export interface PhotosGridProps {
  initialPhotos: ProfilePhoto[];
  userId: string;
  isOwner: boolean;
  /** Extra scroll bottom-padding so the last row isn't hidden under a floating overlay (e.g. ProfileClient's pill). */
  bottomInset?: number;
}

export const PhotosGrid = forwardRef<PhotosGridHandle, PhotosGridProps>(function PhotosGrid(
  { initialPhotos, userId, isOwner, bottomInset = 0 },
  ref
) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>(initialPhotos);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmPhoto, setConfirmPhoto] = useState<ProfilePhoto | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<ProfilePhoto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe createPortal mount flag, same pattern as MessageBubble
    setMounted(true);
  }, []);

  useImperativeHandle(ref, () => ({
    openAdd: () => fileInputRef.current?.click(),
    openCamera: () => cameraInputRef.current?.click(),
  }), []);

  const handleRemove = useCallback((photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    deletePhotoAction(photoId);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file, MAX_INPUT_BYTES);
    if (!validation.ok) {
      setUploadError(validation.error);
      return;
    }
    if (photos.length >= MAX_PHOTOS) {
      setUploadError(`Maximum ${MAX_PHOTOS} photos reached`);
      return;
    }

    setUploadError(null);
    setPendingFile(file);
  }

  async function handleCropConfirm(area: Area, img: HTMLImageElement) {
    setPendingFile(null);
    setUploadError(null);

    try {
      const canvas = drawCroppedCanvas(img, area, PHOTO_SIZE, PHOTO_SIZE);
      const blob = await compressCanvas(canvas);
      const ext = extForBlob(blob);
      const ts = Date.now();
      const storageKey = `${userId}/${ts}.${ext}`;

      const supabase = createClient();
      const { error: storageErr } = await supabase.storage
        .from("profile-photos")
        .upload(storageKey, blob, {
          contentType: blob.type,
          cacheControl: "31536000",
        });

      if (storageErr) throw new Error(storageErr.message);

      const {
        data: { publicUrl },
      } = supabase.storage.from("profile-photos").getPublicUrl(storageKey);

      const result = await addPhotoAction(publicUrl, storageKey);
      if (result.error || !result.photo)
        throw new Error(result.error ?? "Failed to save photo");

      setPhotos((prev) => [result.photo!, ...prev]);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed — try again",
      );
    }
  }

  if (photos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full"
        style={{ gap: 8, padding: "48px 16px" }}
      >
        <p
          className="font-silkscreen text-center"
          style={{
            fontSize: "var(--text-mini)",
            color: "var(--color-tertiary)",
          }}
        >
          No photos yet
        </p>
      </div>
    );
  }

  // Chunk into rows of 3
  const rows: Array<typeof photos> = [];
  for (let i = 0; i < photos.length; i += 3) {
    rows.push(photos.slice(i, i + 3));
  }

  return (
    <>
      <div
        className="w-full"
        style={{
          paddingTop: 16,
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: `max(calc(env(safe-area-inset-bottom) + ${bottomInset}px), ${16 + bottomInset}px)`,
        }}
      >
        {uploadError && (
          <p
            className="font-pixel mb-3 text-center"
            style={{ fontSize: 7, color: "var(--color-danger)" }}
          >
            {uploadError}
          </p>
        )}

        <div className="flex flex-col w-full" style={{ gap: 4 }}>
          {rows.map((row, ri) => (
            <div key={ri} className="flex w-full" style={{ gap: 4 }}>
              {row.map((photo) => (
                <PhotoCell
                  key={photo.id}
                  photo={photo}
                  isOwner={isOwner}
                  onRemove={() => setConfirmPhoto(photo)}
                  onView={() => setPreviewPhoto(photo)}
                />
              ))}
              {/* Pad incomplete last rows so tiles stay consistent width */}
              {row.length === 1 && (
                <div className="flex-1 min-w-0" style={{ aspectRatio: "1" }} />
              )}
              {row.length === 1 && (
                <div className="flex-1 min-w-0" style={{ aspectRatio: "1" }} />
              )}
              {row.length === 2 && (
                <div className="flex-1 min-w-0" style={{ aspectRatio: "1" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* accept="image/*" (not an enumerated MIME list) is what makes iOS Safari open
          straight into the Photos library picker instead of the fuller Take Photo/Browse
          action sheet — actual type/size validation still happens after selection. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{
          position: "fixed",
          top: -1,
          left: -1,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
        onChange={handleFileChange}
      />

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{
          position: "fixed",
          top: -1,
          left: -1,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
        onChange={handleFileChange}
      />

      <PhotoCropModal
        file={pendingFile}
        aspect={1}
        cropShape="rect"
        title="ADD PHOTO"
        onCancel={() => setPendingFile(null)}
        onConfirm={handleCropConfirm}
      />

      <AnimatePresence>
        {confirmPhoto && (
          <BottomSheet onClose={() => setConfirmPhoto(null)} zIndex={80}>
            <div
              className="flex flex-col"
              style={{
                padding: 24,
                paddingTop: 0,
                gap: 24,
                paddingBottom: "max(28px, env(safe-area-inset-bottom))",
              }}
            >
              <div className="flex flex-col" style={{ gap: 4 }}>
                <h2
                  className="font-body font-bold text-primary leading-none"
                  style={{
                    fontSize: "var(--text-md)",
                    fontVariationSettings: '"opsz" 14',
                  }}
                >
                  Remove Photo?
                </h2>
                <p
                  className="font-body text-secondary"
                  style={{ fontSize: "var(--text-xs)" }}
                >
                  This can&apos;t be undone.
                </p>
              </div>

              <div className="flex flex-col" style={{ gap: 8 }}>
                <button
                  onClick={() => {
                    handleRemove(confirmPhoto.id);
                    setConfirmPhoto(null);
                  }}
                  className="w-full flex items-center justify-center appearance-none transition-opacity active:opacity-70"
                  style={{ height: 48, background: "var(--color-danger)" }}
                >
                  <span
                    className="font-body font-semibold text-primary"
                    style={{
                      fontSize: "var(--text-sm)",
                      fontVariationSettings: '"opsz" 14',
                    }}
                  >
                    Remove Photo
                  </span>
                </button>
                <button
                  onClick={() => setConfirmPhoto(null)}
                  className="w-full flex items-center justify-center appearance-none transition-opacity active:opacity-70"
                  style={{ height: 48 }}
                >
                  <span
                    className="font-body font-medium text-tertiary"
                    style={{
                      fontSize: "var(--text-sm)",
                      fontVariationSettings: '"opsz" 14',
                    }}
                  >
                    Cancel
                  </span>
                </button>
              </div>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {previewPhoto && (
              <ImagePreviewOverlay
                src={previewPhoto.url}
                alt="Profile photo"
                onClose={() => setPreviewPhoto(null)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
});
