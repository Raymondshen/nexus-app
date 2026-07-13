"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { BottomSheet } from "@/shared/components/ui/sheet/BottomSheet";
import { SheetFooter } from "@/shared/components/ui/sheet/SheetFooter";
import { Button } from "@/shared/components/ui/Button";
import { AnnouncementCard } from "./AnnouncementCard";

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

export interface AnnouncementsSheetViewProps {
  announcements: AnnouncementItem[];
  onClose: () => void;
}

// Presentational body for the production sheet (dismissed-state driven) —
// keep this the sole place that lays out the sheet chrome + card list.
export function AnnouncementsSheetView({
  announcements,
  onClose,
}: AnnouncementsSheetViewProps) {
  return (
    <AnimatePresence>
      {announcements.length > 0 && (
        <BottomSheet
          onClose={onClose}
          zIndex={80}
          maxHeight="85vh"
          className="border-l border-r border-t border-purple"
        >
          <div
            className="flex-1 min-h-0 overflow-y-auto nexus-scroll w-full flex flex-col items-center px-[var(--space-5)]"
            style={{ gap: "var(--space-5)" }}
          >
            <div
              className="w-full flex flex-col items-start"
              style={{ gap: "var(--space-3)" }}
            >
              <p
                className="font-silkscreen leading-none text-tertiary"
                style={{ fontSize: "var(--text-mini)" }}
              >
                Boom!
              </p>
              <p
                className="w-full font-body font-bold leading-none text-primary"
                style={{
                  fontSize: "var(--text-md)",
                  fontVariationSettings: '"opsz" 14',
                }}
              >
                Latest Updates...
              </p>
            </div>

            {announcements.map((a) => (
              <AnnouncementCard
                key={a.id}
                title={a.title}
                text={a.text}
                imageUrl={a.image_url}
                createdAt={a.created_at}
              />
            ))}
          </div>

          <SheetFooter>
            <Button onClick={onClose} shadow className="w-full">
              Dismiss
            </Button>
          </SheetFooter>
        </BottomSheet>
      )}
    </AnimatePresence>
  );
}

// Figma 419:1930 — "what's new" sheet.
export function AnnouncementsSheet({
  announcements,
}: {
  announcements: AnnouncementItem[];
}) {
  const [visible, setVisible] = useState<AnnouncementItem[] | null>(null); // null = dismissed-state not checked yet

  useEffect(() => {
    const dismissed = getDismissed();
    setVisible(announcements.filter((a) => !dismissed.has(a.id)));
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
