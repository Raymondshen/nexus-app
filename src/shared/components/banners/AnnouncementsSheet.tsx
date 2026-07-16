"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Close } from "pixelarticons/react/Close";
import { SpaceBackground } from "@/shared/components/ui/SpaceBackground";
import { AnnouncementCard } from "./AnnouncementCard";
import { formatShortDate } from "@/shared/utils/date";

export interface AnnouncementItem {
  id: string;
  title: string;
  text: string;
  image_url: string;
  created_at: string;
}

const STORAGE_KEY = "nexus_dismissed_banners";

function getDismissed(): Set<string> {
  try {
    return new Set(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[],
    );
  } catch {
    return new Set();
  }
}

// Groups already created_at-DESC-ordered announcements into same-day rows,
// preserving incoming order (Map insertion order) both across and within groups.
function groupByDate(items: AnnouncementItem[]): [string, AnnouncementItem[]][] {
  const groups = new Map<string, AnnouncementItem[]>();
  for (const item of items) {
    const label = formatShortDate(item.created_at);
    const existing = groups.get(label);
    if (existing) existing.push(item);
    else groups.set(label, [item]);
  }
  return [...groups.entries()];
}

export interface AnnouncementsSheetViewProps {
  announcements: AnnouncementItem[];
  onClose: () => void;
}

// Presentational body for the production "Squad Updates" page (dismissed-state
// driven) — keep this the sole place that lays out the page chrome + card rows.
// Figma 419:1928 — was a bottom sheet, now a full-page overlay that slides up
// from the bottom (still rounded-top like a sheet, per the Figma frame).
export function AnnouncementsSheetView({
  announcements,
  onClose,
}: AnnouncementsSheetViewProps) {
  const groups = groupByDate(announcements);

  return (
    <AnimatePresence>
      {announcements.length > 0 && (
        <motion.div
          className="fixed inset-0 z-[80] bg-black flex flex-col overflow-hidden rounded-tl-[16px] rounded-tr-[16px]"
          style={{ maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
          <SpaceBackground dense />

          <div
            className="relative z-10 flex-shrink-0 flex items-center"
            style={{
              paddingLeft: "var(--md)",
              paddingRight: "var(--md)",
              paddingTop: "max(env(safe-area-inset-top), var(--x5))",
              paddingBottom: "var(--x5)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: 24, height: 24 }}
            >
              <Close
                style={{ width: 24, height: 24, color: "var(--color-primary)" }}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Fixed — does not scroll with the card list below it. */}
          <div
            className="relative z-10 flex-shrink-0 w-full flex flex-col items-center text-center"
            style={{
              gap: 8,
              paddingLeft: "var(--md)",
              paddingRight: "var(--md)",
              paddingBottom: "var(--x6)",
            }}
          >
            <p
              className="w-full font-body font-bold leading-none text-primary"
              style={{
                fontSize: "var(--text-xxl)",
                fontVariationSettings: '"opsz" 14',
              }}
            >
              Squad Updates
            </p>
            <p
              className="w-full font-body font-medium leading-none text-secondary"
              style={{
                fontSize: "var(--text-sm)",
                fontVariationSettings: '"opsz" 14',
              }}
            >
              New features and improvements, as they happen.
            </p>
          </div>

          <div
            className="relative z-10 flex-1 min-h-0 overflow-y-auto nexus-scroll w-full flex flex-col items-center"
            style={{
              gap: "var(--x6)",
              paddingLeft: "var(--md)",
              paddingRight: "var(--md)",
              paddingBottom: "max(env(safe-area-inset-bottom), var(--x5))",
            }}
          >
            {/* Each card fills the row's full width — horizontal scroll becomes a
                one-card-at-a-time swipe once a day has more than 1 announcement. */}
            {groups.map(([label, items], groupIndex) => (
              <div
                key={label}
                className="w-full flex flex-col items-start flex-shrink-0"
                style={{ gap: "var(--x3)" }}
              >
                <p
                  className="w-full font-body font-light leading-none text-tertiary"
                  style={{
                    fontSize: "var(--text-xs)",
                    fontVariationSettings: '"opsz" 14',
                  }}
                >
                  {groupIndex === 0 && (
                    <span className="font-body font-semibold text-purple">
                      Latest -{" "}
                    </span>
                  )}
                  {label}
                </p>
                <div
                  className="w-full flex overflow-x-auto no-scrollbar"
                  style={{ gap: "var(--x5)" }}
                >
                  {items.map((a) => (
                    <div
                      key={a.id}
                      className="w-full flex-shrink-0"
                    >
                      <AnnouncementCard
                        title={a.title}
                        text={a.text}
                        imageUrl={a.image_url}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Figma 419:1928 — "Squad Updates" page.
export function AnnouncementsSheet({
  announcements,
}: {
  announcements: AnnouncementItem[];
}) {
  // null = dismissed-state not checked yet; [] = nothing new to show; otherwise the
  // full announcements list, so a new announcement still surfaces the complete
  // grouped-by-date history rather than only the undismissed delta.
  const [visible, setVisible] = useState<AnnouncementItem[] | null>(null);

  useEffect(() => {
    const dismissed = getDismissed();
    const hasUnseen = announcements.some((a) => !dismissed.has(a.id));
    setVisible(hasUnseen ? announcements : []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function dismissAll() {
    if (!visible || visible.length === 0) return;
    const dismissed = getDismissed();
    for (const a of visible) dismissed.add(a.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
    setVisible([]);
  }

  return (
    <AnnouncementsSheetView
      announcements={visible ?? []}
      onClose={dismissAll}
    />
  );
}
