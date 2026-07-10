"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "pixelarticons/react/Search";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BottomSheet } from "@/shared/components/ui/sheet/BottomSheet";
import { LottieReactionIcon } from "@/shared/components/ui/LottieReactionIcon";
import {
  REACTION_CATALOG,
  REACTION_LOTTIE_MAP,
} from "@/shared/constants/config";
import { setQuickReactions } from "@/shared/utils/quickReactions";

// Figma 490:5343 — full-catalog emoji reaction picker. Opened from the "+" button in
// ChatSheetReact. Two modes, keyed on whether a primary slot is selected:
//   • CUSTOMIZE — tap-and-hold a primary slot to SELECT it (purple ring); tap-and-hold
//     it again (or short-tap it) to DESELECT. While a slot is selected, tapping any
//     catalog emoji SWAPS it into that slot and persists the primary set to localStorage
//     immediately (the design has no Save button — every swap commits live). See
//     quickReactions.ts.
//   • REACT — with NO slot selected, tapping a catalog emoji REACTS to the message,
//     identical to tapping a quick-pick emoji in ChatSheetReact (delegates to onReact,
//     then closes). This makes the full ~200-emoji grid a reaction picker for the
//     long-pressed message, not just a set editor.
//
// The catalog is ~200 animated Lottie icons; each LottieReactionIcon fetches its JSON
// on mount, so the grid is row-virtualized to only ever mount the visible rows.

interface EmojiReactionPickerSheetProps {
  /** Current quick-pick set (emoji chars) to seed the editable slots. */
  current: string[];
  /** React to the message with `emoji` — same handler as ChatSheetReact's quick-pick row. */
  onReact: (emoji: string) => void;
  onClose: () => void;
}

const GRID_COLS = 6;
const CELL = 40; // circle diameter
const ROW_GAP = 16; // vertical gap between grid rows
const ROW_STRIDE = CELL + ROW_GAP;
const LONG_PRESS_MS = 400;

// Forgiving filename match: ignore case, underscores and spaces so "steam", "thumbs up"
// and "thumbsup" all match the underlying Lottie file names.
const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");

export function EmojiReactionPickerSheet({
  current,
  onReact,
  onClose,
}: EmojiReactionPickerSheetProps) {
  const [slots, setSlots] = useState<string[]>(current);
  // null = no slot selected → grid taps REACT. A number = that slot is selected
  // (via long-press) → grid taps SWAP it.
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return REACTION_CATALOG;
    return REACTION_CATALOG.filter((r) => norm(r.file).includes(q));
  }, [query]);

  // Chunk the flat catalog into rows of GRID_COLS for row-based virtualization.
  const rows = useMemo(() => {
    const out: (typeof REACTION_CATALOG)[] = [];
    for (let i = 0; i < results.length; i += GRID_COLS)
      out.push(results.slice(i, i + GRID_COLS));
    return out;
  }, [results]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_STRIDE,
    overscan: 3,
  });

  // ── Long-press handling for the primary slots ──────────────────────────────
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  function clearPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }
  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  function onSlotPointerDown(i: number) {
    longFiredRef.current = false;
    clearPress();
    pressTimer.current = setTimeout(() => {
      longFiredRef.current = true;
      // Toggle: holding a slot that's already selected deselects it.
      setSelected((prev) => (prev === i ? null : i));
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  }

  function onSlotClick(i: number) {
    // A completed long-press already handled selection — swallow the trailing click.
    if (longFiredRef.current) {
      longFiredRef.current = false;
      return;
    }
    // Short-tap only deselects the already-selected slot (returns to react mode).
    setSelected((prev) => (prev === i ? null : prev));
  }

  // ── Grid emoji tap: swap the selected slot, or react to the message ─────────
  function handleGridTap(emoji: string) {
    if (selected !== null) {
      // Customize mode: drop the tapped emoji into the selected primary slot and
      // persist immediately — the design has no Save button, so each swap commits live.
      const next = slots.map((e, i) => (i === selected ? emoji : e));
      setSlots(next);
      setQuickReactions(next);
    } else {
      // React mode: apply the reaction to the message, same as ChatSheetReact's
      // quick-pick row, then dismiss. onReact already closes the parent sheet.
      onReact(emoji);
      onClose();
    }
  }

  return (
    <BottomSheet onClose={onClose} zIndex={110} maxHeight="85vh">
      <div className="flex flex-col flex-1 min-h-0">
        {/* ── Header (Figma 491:5849) ───────────────────────────────────────── */}
        <div
          className="flex-shrink-0 flex flex-col"
          style={{ paddingLeft: 16, paddingRight: 16, gap: 4 }}
        >
          <p
            className="font-body font-bold"
            style={{
              fontSize: "var(--md)",
              color: "var(--color-primary)",
              lineHeight: 1,
            }}
          >
            Emoji Reactions
          </p>
          <p
            className="font-body font-light"
            style={{
              fontSize: "var(--xs)",
              color: "var(--color-tertiary)",
              lineHeight: 1.3,
            }}
          >
            Tap and hold to switch among the 6 primary reactions.
          </p>
        </div>

        {/* ── Editable primary slots (Figma 490:2144) ───────────────────────── */}
        <div
          className="flex-shrink-0 flex items-center justify-between w-full"
          style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 16 }}
        >
          {slots.map((emoji, i) => {
            const isSel = selected === i;
            return (
              <button
                key={i}
                type="button"
                onPointerDown={() => onSlotPointerDown(i)}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                onPointerCancel={clearPress}
                onClick={() => onSlotClick(i)}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={`Primary reaction slot ${i + 1}${isSel ? " (selected — tap an emoji to swap)" : ""}`}
                className="relative flex items-center justify-center transition-transform active:scale-95"
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: "50%",
                  background: "var(--color-surface-elevated)",
                  border: `1px solid ${isSel ? "var(--color-purple)" : "transparent"}`,
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                }}
              >
                <LottieReactionIcon
                  src={REACTION_LOTTIE_MAP[emoji]}
                  size={24}
                />
              </button>
            );
          })}
        </div>

        {/* ── Search (Figma 490:5589) ───────────────────────────────────────── */}
        <div
          className="flex-shrink-0"
          style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 16 }}
        >
          <div
            className="flex items-center w-full"
            style={{
              gap: 16,
              padding: 16,
              border: "1px solid var(--color-border)",
            }}
          >
            <Search
              style={{
                width: 16,
                height: 16,
                color: "var(--color-muted)",
                flexShrink: 0,
              }}
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Emoji reactions..."
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent outline-none font-body"
              style={{ fontSize: "var(--sm)", color: "var(--color-primary)" }}
            />
          </div>
        </div>

        {/* ── Virtualized emoji grid (Figma 490:2245+) ──────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto nexus-scroll"
          style={{
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 16,
            paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
          }}
        >
          {rows.length === 0 ? (
            <p
              className="font-body text-center"
              style={{
                color: "var(--color-tertiary)",
                fontSize: "var(--sm)",
                paddingTop: 24,
                paddingBottom: 24,
              }}
            >
              No emoji found
            </p>
          ) : (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: "relative",
                width: "100%",
              }}
            >
              {virtualizer.getVirtualItems().map((vRow) => {
                const row = rows[vRow.index];
                return (
                  <div
                    key={vRow.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: CELL,
                      transform: `translateY(${vRow.start}px)`,
                      display: "grid",
                      gridTemplateColumns: `repeat(${GRID_COLS}, ${CELL}px)`,
                      justifyContent: "space-between",
                    }}
                  >
                    {row.map((r) => (
                      <button
                        key={r.file}
                        type="button"
                        onClick={() => handleGridTap(r.emoji)}
                        aria-label={r.file.replace(/_/g, " ")}
                        className="flex items-center justify-center transition-transform active:scale-90"
                        style={{
                          width: CELL,
                          height: CELL,
                          borderRadius: "50%",
                          background: "var(--color-surface-elevated)",
                        }}
                      >
                        <LottieReactionIcon
                          src={REACTION_LOTTIE_MAP[r.emoji]}
                          size={24}
                        />
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
