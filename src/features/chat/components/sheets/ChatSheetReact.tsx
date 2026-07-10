"use client";

import { useState } from "react";
import { CornerUpLeft } from "pixelarticons/react/CornerUpLeft";
import { Copy } from "pixelarticons/react/Copy";
import { Note } from "pixelarticons/react/Note";
import { MagicEdit } from "pixelarticons/react/MagicEdit";
import { Plus } from "pixelarticons/react/Plus";
import { BottomSheet } from "@/shared/components/ui/sheet/BottomSheet";
import { SheetActionButton } from "@/shared/components/ui/SheetActionButton";
import { LottieReactionIcon } from "@/shared/components/ui/LottieReactionIcon";
import { REACTION_LOTTIE_MAP } from "@/shared/constants/config";
import { useQuickReactions } from "@/shared/utils/quickReactions";
import { EmojiReactionPickerSheet } from "@/features/chat/components/sheets/EmojiReactionPickerSheet";

interface ChatSheetReactProps {
  onClose: () => void;
  reactions: Record<string, string[]>;
  currentUserId: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit?: () => void;
  isOwn?: boolean;
  onCopy: () => void;
  copied: boolean;
  canPin: boolean;
  onOpenPin: () => void;
}

export function ChatSheetReact({
  onClose,
  reactions,
  currentUserId,
  onReact,
  onReply,
  onEdit,
  isOwn,
  onCopy,
  copied,
  canPin,
  onOpenPin,
}: ChatSheetReactProps) {
  const quickReactions = useQuickReactions();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <BottomSheet onClose={onClose} zIndex={90} dismissOnPointerDown>
      <div
        className="flex flex-col"
        style={{
          gap: 16,
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: "max(env(safe-area-inset-bottom), 28px)",
        }}
      >
        {/* Emoji quick-pick row */}
        <div
          className="flex items-center justify-between w-full"
          style={{ paddingLeft: 1, paddingRight: 1 }}
        >
          {quickReactions.map((emoji, i) => {
            const active = (reactions[emoji] ?? []).includes(currentUserId);
            return (
              <button
                key={`${emoji}-${i}`}
                onClick={() => onReact(emoji)}
                className="flex items-center justify-center select-none transition-transform active:scale-90"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: active
                    ? "var(--color-purple)"
                    : "var(--color-surface-elevated)",
                  transform: active ? "scale(1.1)" : undefined,
                }}
              >
                <LottieReactionIcon
                  src={REACTION_LOTTIE_MAP[emoji]}
                  size={24}
                />
              </button>
            );
          })}

          {/* Figma 391:8863 — opens the full emoji picker (EmojiReactionPickerSheet)
              to customize which emoji fill the quick-pick row above. */}
          <button
            type="button"
            aria-label="Customize reactions"
            onClick={() => setShowPicker(true)}
            className="flex items-center justify-center select-none transition-transform active:scale-90"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--color-surface-elevated)",
            }}
          >
            <Plus
              style={{ width: 24, height: 24, color: "var(--color-primary)" }}
            />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col w-full" style={{ gap: 16 }}>
          {isOwn && onEdit && (
            <SheetActionButton
              icon={<MagicEdit style={{ width: 20, height: 20 }} />}
              label="Edit Message"
              onClick={onEdit}
            />
          )}
          <SheetActionButton
            icon={<CornerUpLeft style={{ width: 20, height: 20 }} />}
            label="Reply"
            onClick={onReply}
          />
          <SheetActionButton
            icon={<Copy style={{ width: 20, height: 20 }} />}
            label={copied ? "Copied!" : "Copy Text"}
            onClick={onCopy}
          />
          {canPin && (
            <SheetActionButton
              icon={<Note style={{ width: 20, height: 20 }} />}
              label="Pin Message"
              onClick={onOpenPin}
            />
          )}
        </div>
      </div>

      {showPicker && (
        <EmojiReactionPickerSheet
          current={quickReactions}
          onReact={onReact}
          onClose={() => setShowPicker(false)}
        />
      )}
    </BottomSheet>
  );
}
