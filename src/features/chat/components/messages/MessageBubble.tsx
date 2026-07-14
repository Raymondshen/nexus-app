"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useChatStore } from "@/store/chatStore";
import type {
  MessageWithProfile,
  Profile,
  SquadDefinitionWithCreator,
} from "@/types";
import { supabaseImageLoader } from "@/shared/supabase/imageLoader";
import { UserAvatar } from "@/shared/components/ui/UserAvatar";
import { extractFirstUrl } from "@/shared/utils";
import { useOGPreview } from "@/shared/hooks/useOGPreview";
import { LinkPreviewCard } from "@/features/chat/components/messages/LinkPreviewCard";
import { PollCard } from "@/features/chat/components/polls/PollCard";
import { EventCardMessage } from "@/features/events/components/EventCardMessage";
import { PinDurationSheet } from "@/features/chat/components/sheets/PinDurationSheet";
import { ChatSheetReact } from "@/features/chat/components/sheets/ChatSheetReact";
import { useMessageReactions } from "@/features/chat/components/messages/useMessageReactions";
import { LottieReactionIcon } from "@/shared/components/ui/LottieReactionIcon";
import { REACTION_LOTTIE_MAP } from "@/shared/constants/config";
import { TextEffectText } from "@/features/chat/components/text-effects/TextEffectText";
import { ImagePreviewOverlay } from "@/shared/components/overlays/ImagePreviewOverlay";
import { BottomSheet } from "@/shared/components/ui/sheet/BottomSheet";
import { VinylPill } from "@/shared/components/ui/VinylPill";
import { CornerDownRight } from "pixelarticons/react/CornerDownRight";
import { CornerUpLeft } from "pixelarticons/react/CornerUpLeft";
import { Cake } from "pixelarticons/react/Cake";
import { PartyPopper } from "pixelarticons/react/PartyPopper";
import { Crown } from "pixelarticons/react/Crown";

// Parse a JSON-encoded array of image URLs stored in image_url / image_blur_hash.
// Returns null for legacy single-image messages (plain URL string).
function parseJsonArray(value: string | null | undefined): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {}
  return null;
}

// Figma 384:3068 — tappable 80×80 cell, object-cover, next/image for compression; <img> for GIFs
function MultiImageCell({
  src,
  lqip,
  onTap,
}: {
  src: string;
  lqip: string | null;
  onTap: (src: string) => void;
}) {
  const isGif = /\.gif(\?|$)/i.test(src) || src.includes("static.klipy.com");
  return (
    <div
      style={{
        position: "relative",
        width: 160,
        height: 160,
        overflow: "hidden",
        flexShrink: 0,
        cursor: "pointer",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onTap(src);
      }}
    >
      {isGif ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            maxWidth: "none",
          }}
        />
      ) : (
        <Image
          src={src}
          alt="shared image"
          fill
          sizes="160px"
          className="object-cover"
          loader={supabaseImageLoader}
          placeholder={lqip ? "blur" : "empty"}
          blurDataURL={lqip ?? undefined}
        />
      )}
    </div>
  );
}

// Figma 384:3084 — horizontal flex row, gap 8px, overflow clip; scrollable beyond 3 items.
// All images and GIFs use 160×160 grid cells regardless of count.
function MultiImageGrid({
  urls,
  lqips,
  onTap,
}: {
  urls: string[];
  lqips: (string | null)[];
  onTap: (src: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        overflow: urls.length > 3 ? "auto" : "clip",
        width: "100%",
        flexShrink: 0,
      }}
    >
      {urls.map((url, i) => (
        <MultiImageCell
          key={i}
          src={url}
          lqip={lqips[i] ?? null}
          onTap={onTap}
        />
      ))}
    </div>
  );
}

interface MessageBubbleProps {
  message: MessageWithProfile;
  isOwn: boolean;
  showHeader: boolean;
  groupId?: string;
  currentUserId: string;
  crewId?: string;
  xpOverride?: number;
  coinOverride?: number;
  onAvatarTap?: (userId: string) => void;
  definitions?: SquadDefinitionWithCreator[];
  memberUsernames?: Set<string>;
  /** Old username (lowercased) → current username, for crew members who've renamed. */
  mentionAliases?: Map<string, string>;
  replyProfile?: Pick<
    Profile,
    "id" | "username" | "avatar_class" | "avatar_url"
  > | null;
  isCreator?: boolean;
  pinnedVinyl?: { imageUrl: string | null; title: string | null } | null;
}

// Targeted field comparison — prevents re-renders from unrelated store updates
// (online sweeps, XP ticks, etc.) without deep-equality overhead.
function areEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  if (prev.message.id !== next.message.id) return false;
  if (prev.isOwn !== next.isOwn) return false;
  if (prev.showHeader !== next.showHeader) return false;
  if (prev.groupId !== next.groupId) return false;
  if (prev.xpOverride !== next.xpOverride) return false;
  if (prev.coinOverride !== next.coinOverride) return false;
  if (prev.isCreator !== next.isCreator) return false;
  if (prev.message.reactions !== next.message.reactions) return false;
  if (prev.message.xp_awarded !== next.message.xp_awarded) return false;
  if (prev.message.sendStatus !== next.message.sendStatus) return false;
  if (prev.message.element_type !== next.message.element_type) return false;
  if (prev.message.content !== next.message.content) return false;
  if (prev.message.pinned !== next.message.pinned) return false;
  if (prev.message.pin_expires_at !== next.message.pin_expires_at) return false;
  if (prev.message.profile.avatar_url !== next.message.profile.avatar_url)
    return false;
  if (prev.message.profile.username !== next.message.profile.username)
    return false;
  if (prev.message.profile.status !== next.message.profile.status) return false;
  if (prev.definitions !== next.definitions) return false;
  if (prev.memberUsernames !== next.memberUsernames) return false;
  if (prev.mentionAliases !== next.mentionAliases) return false;
  if (prev.replyProfile !== next.replyProfile) return false;
  if (prev.pinnedVinyl !== next.pinnedVinyl) return false;
  return true;
}

// ─── Definition highlight renderer ──────────────────────────────────────────

function parseAliases(word: string): string[] {
  return word
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
}

function renderWithDefinitions(
  content: string,
  definitions: SquadDefinitionWithCreator[],
  onTap: (def: SquadDefinitionWithCreator) => void,
): React.ReactNode {
  if (!definitions.length) return content;

  // Expand each definition into (alias, def) pairs; sort by alias length desc
  // so longer aliases are matched before shorter substrings.
  const pairs: { alias: string; def: SquadDefinitionWithCreator }[] = [];
  for (const def of definitions) {
    for (const alias of parseAliases(def.word)) {
      pairs.push({ alias, def });
    }
  }
  if (!pairs.length) return content;
  pairs.sort((a, b) => b.alias.length - a.alias.length);

  const escaped = pairs.map((p) =>
    p.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  let regex: RegExp;
  try {
    regex = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  } catch {
    return content;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex)
      parts.push(content.slice(lastIndex, match.index));
    const hit = match[1];
    const pair = pairs.find((p) => p.alias.toLowerCase() === hit.toLowerCase());
    if (pair) {
      parts.push(
        <span
          key={`${pair.def.id}-${match.index}`}
          style={{ color: "var(--color-purple)", fontWeight: 500 }}
          onClick={(e) => {
            e.stopPropagation();
            onTap(pair.def);
          }}
        >
          <TextEffectText text={hit} effect={pair.def.text_effect} />
        </span>,
      );
    } else {
      parts.push(hit);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts.length ? parts : content;
}

// ─── URL + definition renderer ───────────────────────────────────────────────

const URL_RE_G = /https?:\/\/[^\s<>"']+/g;

function renderWithLinks(
  text: string,
  definitions: SquadDefinitionWithCreator[],
  onTap: (def: SquadDefinitionWithCreator) => void,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = new RegExp(URL_RE_G.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      const nodes = renderWithDefinitions(before, definitions, onTap);
      if (Array.isArray(nodes)) parts.push(...nodes);
      else parts.push(nodes);
    }
    parts.push(
      <a
        key={`url-${match.index}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "var(--color-blue)",
          textDecoration: "underline",
          wordBreak: "break-all",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {match[0]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const after = text.slice(lastIndex);
    const nodes = renderWithDefinitions(after, definitions, onTap);
    if (Array.isArray(nodes)) parts.push(...nodes);
    else parts.push(nodes);
  }

  return parts;
}

// ─── Combined mentions + definition + link renderer ──────────────────────────

function renderMessageContent(
  content: string,
  definitions: SquadDefinitionWithCreator[],
  memberUsernames: Set<string>,
  mentionAliases: Map<string, string>,
  onTapDef: (def: SquadDefinitionWithCreator) => void,
): React.ReactNode {
  // Pass 1: split on @mention tokens, preserving non-mention text as strings.
  // A token matching a current member's username displays as typed; a token matching
  // a member's OLD username (see username_history) displays as their CURRENT one —
  // this is what makes a rename retroactively "fix" mentions in old messages.
  const mentionRx = /@(\w+)/g;
  const pass1: Array<
    { kind: "text"; value: string } | { kind: "mention"; value: string }
  > = [];
  let lastIdx = 0;
  let mx: RegExpExecArray | null;
  while ((mx = mentionRx.exec(content)) !== null) {
    const lower = mx[1].toLowerCase();
    const display = memberUsernames.has(lower)
      ? mx[1]
      : mentionAliases.get(lower);
    if (display) {
      if (mx.index > lastIdx)
        pass1.push({ kind: "text", value: content.slice(lastIdx, mx.index) });
      pass1.push({ kind: "mention", value: display });
      lastIdx = mx.index + mx[0].length;
    }
  }
  if (lastIdx < content.length)
    pass1.push({ kind: "text", value: content.slice(lastIdx) });
  if (!pass1.length) pass1.push({ kind: "text", value: content });

  // Pass 2: apply URL links + definition highlights to each text segment
  const result: React.ReactNode[] = [];
  for (let i = 0; i < pass1.length; i++) {
    const part = pass1[i];
    if (part.kind === "mention") {
      result.push(
        <span key={`mn-${i}`} style={{ color: "var(--color-purple)" }}>
          @{part.value}
        </span>,
      );
    } else if (part.value) {
      const nodes = renderWithLinks(part.value, definitions, onTapDef);
      result.push(
        ...nodes.map((n, j) => (
          <React.Fragment key={`tx-${i}-${j}`}>{n}</React.Fragment>
        )),
      );
    }
  }
  return result.length ? result : content;
}

// ─── MsgReactionPills — Figma 424:4732 "reaction-pill" ───────────────────────
// Active (current user included): purple border + purple count text.
// Inactive (others only): border-hover (grey) border + tertiary count text.
// Icon is the animated Lottie for the 6 quick-pick emoji (REACTION_LOTTIE_MAP);
// any other/legacy emoji (🔥💧⚡🌿🌑🔮 from before this icon set) falls back to
// the plain glyph so old reactions still render.
function MsgReactionPills({
  reactions,
  currentUserId,
  onReact,
}: {
  reactions: [string, string[]][];
  currentUserId: string;
  onReact: (emoji: string) => void;
}) {
  return (
    <>
      {reactions.map(([emoji, users]) => {
        const active = users.includes(currentUserId);
        const lottieSrc = REACTION_LOTTIE_MAP[emoji];
        const tintColor = active
          ? "var(--color-purple)"
          : "var(--color-tertiary)";
        return (
          <button
            key={emoji}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={() => onReact(emoji)}
            className="bg-surface-elevated flex items-center overflow-hidden select-none active:opacity-70 transition-opacity"
            style={{
              gap: "var(--x2)",
              padding: "var(--x2)",
              borderRadius: "var(--x2)",
              border: `1px solid ${active ? "var(--color-purple)" : "var(--color-border-hover)"}`,
            }}
          >
            {lottieSrc ? (
              <LottieReactionIcon src={lottieSrc} size={16} />
            ) : (
              <span
                style={{
                  width: 16,
                  height: 16,
                  fontSize: 14,
                  lineHeight: "16px",
                  textAlign: "center",
                }}
              >
                {emoji}
              </span>
            )}
            <span
              className="font-body font-semibold leading-none tabular-nums"
              style={{
                fontSize: "var(--xs)",
                color: tintColor,
                fontVariationSettings: '"opsz" 14',
              }}
            >
              {users.length}
            </span>
          </button>
        );
      })}
    </>
  );
}

// Stable fallback constants — avoids new array/Set allocations when caller omits optional props
const EMPTY_DEFINITIONS: SquadDefinitionWithCreator[] = [];
const EMPTY_USERNAMES = new Set<string>();
const EMPTY_ALIASES = new Map<string, string>();

function MessageBubbleImpl({
  message,
  isOwn,
  showHeader,
  groupId,
  currentUserId,
  crewId,
  xpOverride,
  coinOverride,
  onAvatarTap,
  definitions = EMPTY_DEFINITIONS,
  memberUsernames = EMPTY_USERNAMES,
  mentionAliases = EMPTY_ALIASES,
  replyProfile = null,
  isCreator = false,
  pinnedVinyl = null,
}: MessageBubbleProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [healFloat, setHealFloat] = useState<{
    id: number;
    amount: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [activeDefinition, setActiveDefinition] =
    useState<SquadDefinitionWithCreator | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [pinSheetOpen, setPinSheetOpen] = useState(false);

  const lastTapRef = useRef(0);
  const hasMoved = useRef(false);

  // Swipe-to-reply (other messages only)
  const SWIPE_THRESHOLD = 64;
  const DOUBLE_TAP_MS = 300;
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isDraggingXRef = useRef(false);
  const swipeCommittedRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const replyIconRef = useRef<HTMLDivElement>(null);
  // Cached per-gesture list of all slide wrappers in this message's group
  const groupElsRef = useRef<HTMLElement[]>([]);

  const updateMessage = useChatStore((s) => s.updateMessage);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditTo = useChatStore((s) => s.setEditTo);
  const requestRetrySend = useChatStore((s) => s.requestRetrySend);

  const { displayReactions, handleReaction } = useMessageReactions({
    messageId: message.id,
    crewId: message.crew_id,
    currentUserId,
    reactions: message.reactions,
    onHypeManHeal: (amount) => setHealFloat({ id: Date.now(), amount }),
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // ─── XP count-up ────────────────────────────────────────────────────────────
  const xpTarget = xpOverride ?? message.xp_awarded ?? 0;
  const [displayXP, setDisplayXP] = useState(xpTarget);
  const displayXPRef = useRef(xpTarget);

  useEffect(() => {
    const start = displayXPRef.current;
    const end = xpTarget;
    if (start === end) return;
    const duration = 500;
    const startTime = performance.now();
    let raf: number;
    function step(now: number) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(start + (end - start) * eased);
      displayXPRef.current = val;
      setDisplayXP(val);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [xpTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Coin count-up ──────────────────────────────────────────────────────────
  const coinTarget = coinOverride ?? ((message.xp_awarded ?? 0) > 0 ? 1 : 0);
  const [_displayCoins, setDisplayCoins] = useState(coinTarget);
  const displayCoinsRef = useRef(coinTarget);

  useEffect(() => {
    const start = displayCoinsRef.current;
    const end = coinTarget;
    if (start === end) return;
    const duration = 500;
    const startTime = performance.now();
    let raf: number;
    function step(now: number) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(start + (end - start) * eased);
      displayCoinsRef.current = val;
      setDisplayCoins(val);
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [coinTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Reply tap — scroll to original message with a brief purple flash ───────
  function handleReplyTap() {
    if (!message.reply_to_id) return;
    const el = document.getElementById(`msg-${message.reply_to_id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background-color 0.2s ease";
    el.style.backgroundColor = "rgba(191,95,255,0.12)";
    setTimeout(() => {
      el.style.backgroundColor = "";
      setTimeout(() => {
        el.style.transition = "";
      }, 300);
    }, 700);
  }

  // ─── Double-tap + swipe-to-reply handlers ───────────────────────────────────

  // Apply transform to every slide wrapper in this message's group.
  function applyGroupTransform(x: number) {
    const transition =
      x === 0 ? "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)" : "none";
    for (const el of groupElsRef.current) {
      el.style.transition = transition;
      el.style.transform = x === 0 ? "translateX(0)" : `translateX(${x}px)`;
    }
  }

  function resetSwipeDOM() {
    applyGroupTransform(0);
    if (replyIconRef.current) {
      replyIconRef.current.style.transition =
        "opacity 0.22s ease-out, transform 0.22s ease-out";
      replyIconRef.current.style.opacity = "0";
      replyIconRef.current.style.transform = "scale(0.5)";
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    hasMoved.current = false;
    if (!isOwn) {
      // Cache all slide wrappers for this group once per gesture — avoids
      // repeated querySelector calls during high-frequency touchmove events.
      groupElsRef.current = groupId
        ? Array.from(
            document.querySelectorAll<HTMLElement>(`[data-group="${groupId}"]`),
          )
        : contentRef.current
          ? [contentRef.current]
          : [];

      // Snap all group elements back to origin before tracking the new gesture
      // so a stuck bubble never corrupts the dx calculation.
      for (const el of groupElsRef.current) {
        el.style.transition = "none";
        el.style.transform = "translateX(0)";
      }
      if (replyIconRef.current) {
        replyIconRef.current.style.transition = "none";
        replyIconRef.current.style.opacity = "0";
        replyIconRef.current.style.transform = "scale(0.5)";
      }
      const t = e.touches[0];
      touchStartXRef.current = t.clientX;
      touchStartYRef.current = t.clientY;
      isDraggingXRef.current = false;
      swipeCommittedRef.current = false;
    }
  }
  function handleTouchEnd() {
    if (!isOwn && isDraggingXRef.current) {
      const wasCommitted = swipeCommittedRef.current;
      isDraggingXRef.current = false;
      swipeCommittedRef.current = false;
      resetSwipeDOM();
      if (wasCommitted) setReplyTo({ ...message }, groupId);
      return;
    }
    if (!hasMoved.current) {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        setSheetOpen(true);
      } else {
        lastTapRef.current = now;
      }
    }
  }
  function handleTouchCancel() {
    if (!isOwn && isDraggingXRef.current) {
      const wasCommitted = swipeCommittedRef.current;
      isDraggingXRef.current = false;
      swipeCommittedRef.current = false;
      resetSwipeDOM();
      if (wasCommitted) setReplyTo({ ...message }, groupId);
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    hasMoved.current = true;
    if (!isOwn) {
      const t = e.touches[0];
      const dx = t.clientX - touchStartXRef.current;
      const dy = Math.abs(t.clientY - touchStartYRef.current);
      if (!isDraggingXRef.current) {
        if (Math.abs(dx) < 5 && dy < 5) return;
        if (dy > Math.abs(dx) || dx > 0) return; // vertical scroll or right swipe
        isDraggingXRef.current = true;
        // Clear a stale reply the instant a swipe starts on a different group
        const s = useChatStore.getState();
        if (
          s.replyTo &&
          s.replyGroupId &&
          groupId &&
          s.replyGroupId !== groupId
        ) {
          setReplyTo(null);
        }
      }
      // Rubber-band past threshold
      const clamped = Math.min(0, dx);
      const x =
        clamped > -SWIPE_THRESHOLD
          ? clamped
          : -SWIPE_THRESHOLD + (clamped + SWIPE_THRESHOLD) * 0.3;
      applyGroupTransform(x);

      // Smooth icon: invisible for first 30% of swipe, then ease-in quadratically
      const progress = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD);
      const delayed = Math.max(0, (progress - 0.3) / 0.7);
      const eased = delayed * delayed;
      if (replyIconRef.current) {
        replyIconRef.current.style.transition =
          "opacity 0.1s ease-out, transform 0.1s ease-out";
        replyIconRef.current.style.opacity = String(eased);
        replyIconRef.current.style.transform = `scale(${0.5 + eased * 0.5})`;
      }
      if (dx <= -SWIPE_THRESHOLD && !swipeCommittedRef.current) {
        swipeCommittedRef.current = true;
        try {
          navigator.vibrate(10);
        } catch {}
      } else if (dx > -SWIPE_THRESHOLD) {
        swipeCommittedRef.current = false;
      }
    }
  }

  // ─── Copy ───────────────────────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setSheetOpen(false);
      }, 800);
    } catch {
      setSheetOpen(false);
    }
  }

  // ─── Reaction toggle — closes any open action sheet, then delegates to the hook ──
  const handleReactionTap = useCallback(
    (emoji: string) => {
      setSheetOpen(false);
      void handleReaction(emoji);
    },
    [handleReaction],
  );

  // ─── OG preview — must be called before early returns ───────────────────────
  const ogUrl =
    message.message_type === "text" && !message.image_url
      ? extractFirstUrl(message.content)
      : undefined;
  const { data: ogPreview, loading: ogLoading } = useOGPreview(ogUrl);

  // ─── System messages ────────────────────────────────────────────────────────
  if (message.message_type === "system") {
    return <SystemMessage message={message} />;
  }

  // ─── Poll messages ───────────────────────────────────────────────────────────
  if (message.message_type === "poll") {
    const pollId = message.content.startsWith("POLL:")
      ? message.content.slice(5)
      : null;
    if (!pollId) return null;

    const pollAvatarUrl = message.profile.avatar_url as
      | string
      | null
      | undefined;
    const pollTimeStr = `${format(new Date(message.created_at), "MMM d")} · ${format(new Date(message.created_at), "h:mma").toLowerCase()}`;

    return (
      <div
        className={`flex gap-[8px] items-start w-full ${showHeader ? "pt-[var(--space-6)] pb-0" : "pt-[var(--space-2)] pb-0"}`}
      >
        {showHeader && (
          <div
            className="relative flex-shrink-0"
            onClick={
              onAvatarTap ? () => onAvatarTap(message.user_id) : undefined
            }
            style={onAvatarTap ? { cursor: "pointer" } : undefined}
          >
            <UserAvatar
              avatarUrl={pollAvatarUrl}
              username={message.profile.username}
              size={32}
            />
          </div>
        )}
        <div
          className={`flex-1 min-w-0 flex flex-col gap-0 ${!showHeader ? "pl-10" : ""}`}
        >
          {showHeader && (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-[4px] flex-1 min-w-0">
                <span
                  className={`font-body font-medium text-[12px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap ${isOwn ? "text-primary" : "text-secondary"}`}
                  style={{
                    fontVariationSettings: '"opsz" 14',
                    cursor: onAvatarTap ? "pointer" : undefined,
                  }}
                  onClick={
                    onAvatarTap ? () => onAvatarTap(message.user_id) : undefined
                  }
                >
                  {message.profile.username}
                </span>
              </div>
              <span
                className="font-body font-light text-[12px] shrink-0 leading-none whitespace-nowrap ml-1"
                style={{
                  color: "var(--color-tertiary)",
                  fontVariationSettings: '"opsz" 14',
                }}
              >
                {pollTimeStr}
              </span>
            </div>
          )}
          <PollCard pollId={pollId} currentUserId={currentUserId} />
        </div>
      </div>
    );
  }

  // ─── Event messages ──────────────────────────────────────────────────────────
  if (message.message_type === "event" && message.event_id) {
    const eventAvatarUrl = message.profile.avatar_url as
      | string
      | null
      | undefined;
    const eventTimeStr = `${format(new Date(message.created_at), "MMM d")} · ${format(new Date(message.created_at), "h:mma").toLowerCase()}`;

    return (
      <div
        className={`flex gap-[8px] items-start w-full ${showHeader ? "pt-[var(--space-6)] pb-0" : "pt-[var(--space-2)] pb-0"}`}
      >
        {showHeader && (
          <div
            className="relative flex-shrink-0"
            onClick={
              onAvatarTap ? () => onAvatarTap(message.user_id) : undefined
            }
            style={onAvatarTap ? { cursor: "pointer" } : undefined}
          >
            <UserAvatar
              avatarUrl={eventAvatarUrl}
              username={message.profile.username}
              size={32}
            />
          </div>
        )}
        <div
          className={`flex-1 min-w-0 flex flex-col gap-[4px] ${!showHeader ? "pl-10" : ""}`}
        >
          {showHeader && (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-[4px] flex-1 min-w-0">
                <span
                  className={`font-body font-medium text-[12px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap ${isOwn ? "text-primary" : "text-secondary"}`}
                  style={{
                    fontVariationSettings: '"opsz" 14',
                    cursor: onAvatarTap ? "pointer" : undefined,
                  }}
                  onClick={
                    onAvatarTap ? () => onAvatarTap(message.user_id) : undefined
                  }
                >
                  {message.profile.username}
                </span>
              </div>
              <span
                className="font-body font-light text-[12px] shrink-0 leading-none whitespace-nowrap ml-1"
                style={{
                  color: "var(--color-tertiary)",
                  fontVariationSettings: '"opsz" 14',
                }}
              >
                {eventTimeStr}
              </span>
            </div>
          )}
          <EventCardMessage
            eventId={message.event_id as string}
            crewId={crewId ?? message.crew_id}
          />
        </div>
      </div>
    );
  }

  const avatarUrl = message.profile.avatar_url as string | null | undefined;
  const timeStr = format(new Date(message.created_at), "h:mma").toLowerCase();

  const sortedReactions = React.useMemo(
    () =>
      Object.entries(displayReactions)
        .filter(([, users]) => users.length > 0)
        .sort(([, a], [, b]) => b.length - a.length),
    [displayReactions], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <>
      <div
        className={`relative flex items-start w-full select-none ${showHeader ? "pt-[var(--space-6)] pb-0" : "pt-[var(--space-2)] pb-0"}`}
        onContextMenu={(e) => {
          e.preventDefault();
          setSheetOpen(true);
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchCancel={handleTouchCancel}
      >
        {/* Swipe-to-reply icon — top offset matches wrapper padding so icon centers within content area only */}
        {!isOwn && (
          <div
            ref={replyIconRef}
            className="pointer-events-none absolute flex items-center justify-end"
            style={{
              top: showHeader ? "var(--space-6)" : "var(--space-2)",
              bottom: 0,
              left: 0,
              right: 0,
              paddingRight: 8,
              transform: "scale(0.5)",
              opacity: 0,
              zIndex: 2,
            }}
          >
            <CornerUpLeft
              style={{ width: 16, height: 16, color: "var(--color-primary)" }}
            />
          </div>
        )}
        {/* Slide wrapper — avatar and content move together so content never overlaps avatar */}
        <div
          ref={contentRef}
          data-group={groupId}
          className="flex flex-1 min-w-0 items-start gap-[8px]"
        >
          {/* Avatar — only rendered for the first message in a group */}
          {showHeader && (
            <div
              className="relative flex-shrink-0"
              onClick={
                onAvatarTap ? () => onAvatarTap(message.user_id) : undefined
              }
              onTouchStart={
                onAvatarTap ? (e) => e.stopPropagation() : undefined
              }
              style={onAvatarTap ? { cursor: "pointer" } : undefined}
            >
              <UserAvatar
                avatarUrl={avatarUrl}
                username={message.profile.username}
                size={32}
              />
            </div>
          )}

          {/* Message content — pl-10 aligns continuation text with grouped messages */}
          <div
            className={`flex-1 min-w-0 flex flex-col gap-[4px] ${!showHeader ? "pl-10" : ""}`}
          >
            {/* Header row: username · vinyl · admin crown · timestamp */}
            {showHeader && (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-[4px] flex-1 min-w-0 overflow-hidden">
                  <span
                    className={`font-body font-medium text-[12px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap ${
                      isOwn ? "text-primary" : "text-secondary"
                    }`}
                    style={{
                      fontVariationSettings: '"opsz" 14',
                      cursor: onAvatarTap ? "pointer" : undefined,
                    }}
                    onClick={
                      onAvatarTap
                        ? () => onAvatarTap(message.user_id)
                        : undefined
                    }
                    onTouchStart={
                      onAvatarTap ? (e) => e.stopPropagation() : undefined
                    }
                  >
                    {message.profile.username}
                  </span>

                  {isCreator && (
                    <Crown
                      style={{
                        width: 12,
                        height: 12,
                        color: "var(--color-coins)",
                        flexShrink: 0,
                      }}
                    />
                  )}

                  {pinnedVinyl && (
                    <VinylPill
                      imageUrl={pinnedVinyl.imageUrl}
                      title={pinnedVinyl.title}
                    />
                  )}
                </div>

                {isOwn && message.sendStatus === "failed" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      requestRetrySend?.(message.tempId ?? message.id);
                    }}
                    className="font-body font-medium text-[12px] shrink-0 leading-none whitespace-nowrap ml-1"
                    style={{
                      color: "var(--color-danger)",
                      fontVariationSettings: '"opsz" 14',
                    }}
                  >
                    Failed · Retry
                  </button>
                ) : (
                  <span
                    className="font-body font-light text-[12px] shrink-0 leading-none whitespace-nowrap ml-1"
                    style={{
                      color: "var(--color-tertiary)",
                      fontVariationSettings: '"opsz" 14',
                    }}
                  >
                    {isOwn && message.sendStatus === "sending"
                      ? "sending…"
                      : timeStr}
                  </span>
                )}
              </div>
            )}

            {/* Body section: reply row + message content + OG preview — gap-[8px] matches Figma 377:5504 */}
            <div className="flex flex-col gap-[8px] w-full shrink-0">
              {/* Reply row — Figma: icon + avatar + @username + preview (single line) */}
              {message.reply_to_id &&
                (message.reply_preview || message.reply_username) &&
                (() => {
                  const replyAvatarUrl = replyProfile?.avatar_url ?? null;
                  return (
                    <button
                      className="flex items-center gap-[4px] h-[16px] w-full overflow-hidden"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplyTap();
                      }}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                    >
                      <CornerDownRight
                        style={{
                          width: 16,
                          height: 16,
                          color: "var(--color-tertiary)",
                          flexShrink: 0,
                        }}
                      />
                      <UserAvatar
                        avatarUrl={replyAvatarUrl}
                        username={message.reply_username ?? ""}
                        size={16}
                      />
                      {message.reply_username && (
                        <span
                          className="font-body font-normal whitespace-nowrap shrink-0 leading-none"
                          style={{
                            fontSize: 12,
                            color: "var(--color-purple)",
                            fontVariationSettings: '"opsz" 14',
                          }}
                        >
                          @{message.reply_username}
                        </span>
                      )}
                      {message.reply_preview && (
                        <span
                          className="font-body font-normal flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-none"
                          style={{
                            fontSize: 12,
                            color: "var(--color-tertiary)",
                            fontVariationSettings: '"opsz" 14',
                          }}
                        >
                          {message.reply_preview}
                        </span>
                      )}
                    </button>
                  );
                })()}

              {/* Message body */}
              {message.message_type === "image" ? (
                (() => {
                  const imageUrl = message.image_url as
                    | string
                    | null
                    | undefined;
                  const blurHash = message.image_blur_hash as
                    | string
                    | null
                    | undefined;
                  // Normalise both legacy (plain URL) and new (JSON array) formats into arrays
                  const urls =
                    parseJsonArray(imageUrl) ??
                    (imageUrl ? [imageUrl] : [message.content]);
                  // For legacy single-image messages the blur hash is a plain string, not a JSON array
                  const lqips =
                    parseJsonArray(blurHash) ??
                    urls.map((_, i) => (i === 0 ? (blurHash ?? null) : null));
                  // Don't re-display a bare image URL as a caption — only show user-typed text
                  const caption =
                    message.content && !message.content.startsWith("http")
                      ? message.content
                      : null;
                  return (
                    <>
                      <MultiImageGrid
                        urls={urls}
                        lqips={lqips}
                        onTap={(src) => {
                          setPreviewSrc(src);
                          setPreviewOpen(true);
                        }}
                      />
                      {caption && (
                        <p
                          className="font-body font-normal text-[14px] text-secondary leading-[1.5] w-full select-none"
                          style={{
                            fontVariationSettings: '"opsz" 14',
                            WebkitUserSelect: "none",
                            overflowWrap: "break-word",
                            minWidth: 0,
                          }}
                        >
                          {caption}
                        </p>
                      )}
                    </>
                  );
                })()
              ) : (
                <p
                  className="font-body font-normal text-[14px] text-secondary leading-[1.5] w-full select-none"
                  style={{
                    fontVariationSettings: '"opsz" 14',
                    WebkitUserSelect: "none",
                    overflowWrap: "break-word",
                    minWidth: 0,
                  }}
                >
                  {message.message_type === "text" &&
                  (definitions.length || memberUsernames.size)
                    ? renderMessageContent(
                        message.content,
                        definitions,
                        memberUsernames,
                        mentionAliases,
                        setActiveDefinition,
                      )
                    : message.content}
                </p>
              )}

              {/* ── OG link preview ──────────────────────────────────────────────── */}
              {!ogLoading && ogPreview && (
                <LinkPreviewCard preview={ogPreview} />
              )}
            </div>

            {/* ── Reaction chips ────────────────────────────────────────────────── */}
            <AnimatePresence>
              {sortedReactions.length > 0 && (
                <motion.div
                  key="reaction-chips"
                  className="relative flex flex-wrap items-center"
                  style={{ gap: "var(--x2)", marginTop: "var(--x2)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  {/* Hype Man heal float */}
                  <AnimatePresence>
                    {healFloat && (
                      <motion.div
                        key={healFloat.id}
                        initial={{ opacity: 0, y: 0 }}
                        animate={{
                          opacity: [0, 1, 1, 0],
                          y: [0, -8, -22, -36],
                        }}
                        transition={{
                          duration: 1.2,
                          ease: "easeOut",
                          times: [0, 0.15, 0.65, 1],
                        }}
                        onAnimationComplete={() => setHealFloat(null)}
                        className="pointer-events-none absolute -top-3 left-0 z-10"
                      >
                        <span
                          className="font-pixel text-[10px] font-bold"
                          style={{
                            color: "#66bb6a",
                            textShadow: "0 0 8px rgba(102,187,106,0.8)",
                          }}
                        >
                          +{healFloat.amount} HEAL
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <MsgReactionPills
                    reactions={sortedReactions}
                    currentUserId={currentUserId}
                    onReact={handleReactionTap}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>{" "}
        {/* slide wrapper */}
      </div>

      {/* ── Full-screen image preview ─────────────────────────────────────── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {previewOpen && previewSrc && (
              <ImagePreviewOverlay
                src={previewSrc}
                blurDataURL={undefined}
                alt="Shared image"
                onClose={() => setPreviewOpen(false)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* ── Definition view sheet — Figma 402:9855 ──────────────────────────── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {activeDefinition && (
              <BottomSheet
                onClose={() => setActiveDefinition(null)}
                zIndex={80}
              >
                <div
                  className="flex flex-col items-center w-full"
                  style={{
                    gap: "var(--x5)",
                    paddingLeft: "var(--md)",
                    paddingRight: "var(--md)",
                    paddingBottom:
                      "max(env(safe-area-inset-bottom), var(--x8))",
                  }}
                >
                  {/* Details — Figma 402:9856: flex-col gap-x3 items-start justify-center */}
                  <div
                    className="flex flex-col items-start justify-center w-full"
                    style={{ gap: "var(--x3)" }}
                  >
                    {/* Aliases — Silkscreen mini tertiary leading-none */}
                    <p
                      className="font-silkscreen text-tertiary leading-none w-full"
                      style={{ fontSize: "var(--mini)" }}
                    >
                      {parseAliases(activeDefinition.word).join(", ")}
                    </p>
                    {/* Word + definition — Figma 402:9858: flex-col gap-x2 items-center justify-center */}
                    <div
                      className="flex flex-col items-center justify-center w-full"
                      style={{ gap: "var(--x2)" }}
                    >
                      {/* Word — DM Sans Bold md primary leading-none */}
                      <p
                        className="font-body font-bold text-primary leading-none w-full"
                        style={{
                          fontSize: "var(--md)",
                          fontVariationSettings: '"opsz" 14',
                        }}
                      >
                        {(activeDefinition.actual_word as string | null) ||
                          parseAliases(activeDefinition.word)[0]}
                      </p>
                      {/* Definition — DM Sans Regular 14px secondary leading-[1.5] overflow-hidden text-ellipsis */}
                      <p
                        className="font-body font-normal text-secondary leading-[1.5] overflow-hidden text-ellipsis w-full"
                        style={{
                          fontSize: "14px",
                          fontVariationSettings: '"opsz" 14',
                        }}
                      >
                        {activeDefinition.definition}
                      </p>
                    </div>
                    {/* Author — DM Sans Light 12px tertiary leading-none overflow-hidden text-ellipsis */}
                    {activeDefinition.creator_username && (
                      <p
                        className="font-body font-light text-tertiary leading-none overflow-hidden text-ellipsis w-full"
                        style={{
                          fontSize: "12px",
                          fontVariationSettings: '"opsz" 14',
                        }}
                      >
                        Author : {activeDefinition.creator_username}
                      </p>
                    )}
                  </div>
                </div>
              </BottomSheet>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* ── Pin duration sheet ──────────────────────────────────────────────── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {pinSheetOpen && (
              <PinDurationSheet
                message={message}
                onClose={() => setPinSheetOpen(false)}
                onPinned={(patch) => updateMessage(message.id, patch)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* ── ChatSheetReact — reaction + action bottom sheet ─────────────────── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {sheetOpen && (
              <ChatSheetReact
                onClose={() => setSheetOpen(false)}
                reactions={displayReactions}
                currentUserId={currentUserId}
                onReact={(emoji) => handleReactionTap(emoji)}
                onReply={() => {
                  setSheetOpen(false);
                  setReplyTo({ ...message }, groupId);
                }}
                isOwn={isOwn}
                onEdit={
                  isOwn && message.message_type === "text"
                    ? () => {
                        setSheetOpen(false);
                        setEditTo({ ...message });
                      }
                    : undefined
                }
                onCopy={handleCopy}
                copied={copied}
                canPin={isCreator}
                onOpenPin={() => {
                  setSheetOpen(false);
                  setPinSheetOpen(true);
                }}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

export const MessageBubble = React.memo(MessageBubbleImpl, areEqual);

function BirthdayMessage({ content }: { content: string }) {
  const parts = content.slice("BIRTHDAY:".length).split(":");
  const username = parts[0] ?? "";
  const dateStr = parts[1] ?? "";
  const label = parts.slice(2).join(":");
  const dotIdx = label.indexOf("·");
  const labelA = dotIdx >= 0 ? label.slice(0, dotIdx + 1).trim() : label;
  const labelB = dotIdx >= 0 ? label.slice(dotIdx + 1).trim() : "";
  return (
    <div style={{ marginTop: "var(--space-6)" }}>
      <div
        className="flex items-center w-full rounded-[8px] overflow-hidden border border-[var(--color-purple)] bg-[rgba(17,17,17,0.9)] shadow-[0px_0px_20px_12px_rgba(0,0,0,0.10)]"
        style={{ padding: 16, gap: 16 }}
      >
        <Cake
          style={{
            width: 16,
            height: 16,
            color: "var(--color-secondary)",
            flexShrink: 0,
          }}
        />
        <div className="flex flex-1 flex-col" style={{ gap: 4, minWidth: 1 }}>
          <p
            className="font-silkscreen leading-none w-full"
            style={{ fontSize: "var(--text-mini)" }}
          >
            <span style={{ color: "var(--color-tertiary)" }}>{labelA}</span>
            {labelB && (
              <span style={{ color: "var(--color-secondary)" }}> {labelB}</span>
            )}
          </p>
          <p
            className="font-body font-normal leading-none w-full overflow-hidden text-ellipsis whitespace-nowrap"
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-secondary)",
              fontVariationSettings: '"opsz" 14',
            }}
          >
            @{username}
            {dateStr && ` · ${dateStr}`}
          </p>
        </div>
      </div>
    </div>
  );
}

function JoinMessage({ content }: { content: string }) {
  const rest = content.slice("JOIN:".length);
  const sepIdx = rest.indexOf(":");
  const username = sepIdx >= 0 ? rest.slice(0, sepIdx) : rest;
  const inviter = sepIdx >= 0 ? rest.slice(sepIdx + 1) : "";
  return (
    <div
      style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-6)" }}
    >
      <div
        className="flex items-center w-full rounded-[8px] overflow-hidden border border-[var(--color-purple)] bg-[rgba(17,17,17,0.9)] shadow-[0px_0px_20px_12px_rgba(0,0,0,0.10)]"
        style={{ padding: 16, gap: 16 }}
      >
        <PartyPopper
          style={{
            width: 16,
            height: 16,
            color: "var(--color-secondary)",
            flexShrink: 0,
          }}
        />
        <div className="flex flex-col" style={{ gap: 4, minWidth: 1 }}>
          <p
            className="font-silkscreen leading-none"
            style={{
              fontSize: "var(--text-mini)",
              color: "var(--color-tertiary)",
            }}
          >
            New Squad Member Joined!
          </p>
          <p
            className="font-body font-normal leading-none w-full overflow-hidden text-ellipsis whitespace-nowrap"
            style={{
              fontSize: "var(--text-sm)",
              fontVariationSettings: '"opsz" 14',
            }}
          >
            <span style={{ color: "var(--color-purple)" }}>@{username}</span>
            {inviter ? (
              <>
                <span style={{ color: "var(--color-secondary)" }}>
                  {" "}
                  invited by{" "}
                </span>
                <span style={{ color: "var(--color-primary)" }}>
                  @{inviter}
                </span>
              </>
            ) : (
              <span style={{ color: "var(--color-secondary)" }}>
                {" "}
                joined the squad
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function SystemMessage({ message }: { message: MessageWithProfile }) {
  const content = message.content;
  if (content.startsWith("BIRTHDAY:"))
    return <BirthdayMessage content={content} />;
  if (content.startsWith("JOIN:")) return <JoinMessage content={content} />;
  let bg = "bg-surface border-border";
  let icon = "⚙️";
  if (content.startsWith("🎂")) {
    bg = "bg-[#1a0d2e] border-purple/30";
    icon = "";
  } else if (content.includes("XP") || content.includes("xp")) {
    bg = "bg-[#1a1400] border-[#ffd700]/40";
    icon = "⭐";
  }
  return (
    <div
      className="flex justify-center"
      style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-6)" }}
    >
      <div className={`border px-4 py-2 max-w-[85%] text-center ${bg}`}>
        <p className="font-pixel text-[9px] text-tertiary leading-relaxed">
          {icon ? `${icon} ` : ""}
          {content}
        </p>
      </div>
    </div>
  );
}
