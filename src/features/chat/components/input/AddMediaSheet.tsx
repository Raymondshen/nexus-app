"use client";

import { Camera } from "pixelarticons/react/Camera";
import { GifIcon } from "@/shared/icons/GifIcon";
import { BottomSheet } from "@/shared/components/ui/sheet/BottomSheet";
import { SheetActionButton } from "@/shared/components/ui/SheetActionButton";

interface AddMediaSheetProps {
  onClose: () => void;
  onUploadPhoto: () => void;
  onPickGif: () => void;
  photoDisabled?: boolean;
}

export function AddMediaSheet({
  onClose,
  onUploadPhoto,
  onPickGif,
  photoDisabled = false,
}: AddMediaSheetProps) {
  return (
    <BottomSheet onClose={onClose} zIndex={70}>
      <div
        className="flex flex-col"
        style={{
          gap: "var(--x5)",
          paddingLeft: "var(--md)",
          paddingRight: "var(--md)",
          paddingBottom: "max(env(safe-area-inset-bottom), var(--x8))",
        }}
      >
        {/* Header */}
        <div className="flex flex-col" style={{ gap: "var(--x2)" }}>
          <p
            className="font-body font-bold text-primary leading-none w-full"
            style={{
              fontSize: "var(--md)",
              fontVariationSettings: '"opsz" 14',
            }}
          >
            Add Dope Sh*t
          </p>
          <p
            className="font-body font-light text-tertiary leading-none w-full"
            style={{
              fontSize: "var(--xs)",
              fontVariationSettings: '"opsz" 14',
            }}
          >
            Express yourself to the squad.
          </p>
        </div>

        {/* Options */}
        <div className="flex flex-col" style={{ gap: "var(--x5)" }}>
          <SheetActionButton
            icon={<Camera style={{ width: 20, height: 20 }} />}
            label="Upload Photo"
            onClick={() => {
              onClose();
              onUploadPhoto();
            }}
            disabled={photoDisabled}
          />
          <SheetActionButton
            icon={<GifIcon style={{ width: 20, height: 20 }} />}
            label="GIF"
            onClick={() => {
              onClose();
              onPickGif();
            }}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
