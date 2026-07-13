"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { SlidePage } from "@/app/layouts/SlidePage";
import { Plus } from "pixelarticons/react/Plus";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { PageFooter } from "@/shared/components/ui/PageFooter";
import { Button } from "@/shared/components/ui/Button";
import { createClient } from "@/shared/supabase/client";
import {
  createDefinitionAction,
  updateDefinitionAction,
  deleteDefinitionAction,
} from "@/app/(app)/chat/[crewId]/definitions/actions";
import { BottomSheet } from "@/shared/components/ui/sheet/BottomSheet";
import { SheetFooter } from "@/shared/components/ui/sheet/SheetFooter";
import { InputField, TextareaField } from "@/shared/components/ui/InputField";
import { Check } from "pixelarticons/react/Check";
import { TEXT_EFFECTS } from "@/features/chat/components/text-effects/registry";
import { TextEffectText } from "@/features/chat/components/text-effects/TextEffectText";
import type {
  SquadDefinition,
  SquadDefinitionWithCreator,
  DefinitionSuggestion,
  TextEffect,
} from "@/types";

function TextEffectToggleRow({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center w-full" style={{ gap: 8, height: 34 }}>
      <div
        className="flex flex-1 min-w-0 flex-col justify-center"
        style={{ gap: 8 }}
      >
        <p
          className="font-body font-medium leading-none"
          style={{
            fontSize: "var(--sm)",
            color: "var(--color-secondary)",
            fontVariationSettings: '"opsz" 14',
          }}
        >
          Text Effect
        </p>
        <p
          className="font-body font-light leading-none"
          style={{
            fontSize: "var(--xs)",
            color: "var(--color-tertiary)",
            fontVariationSettings: '"opsz" 14',
          }}
        >
          Apply text animation for this keyword.
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} text effect`}
        className="relative flex-shrink-0 appearance-none"
        style={{
          width: 48,
          height: 28,
          borderRadius: 40,
          background: enabled ? "var(--color-purple)" : "var(--color-muted)",
          transition: "background 0.2s",
        }}
      >
        <motion.span
          className="absolute rounded-full bg-white pointer-events-none"
          style={{ top: 4, width: 20, height: 20 }}
          animate={{ left: enabled ? 24 : 4 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      </button>
    </div>
  );
}

function TextEffectOptionCard({
  effect,
  label,
  selected,
  onSelect,
}: {
  effect: TextEffect;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="flex items-center justify-between w-full rounded-[var(--x3)] appearance-none"
      style={{
        padding: "var(--x5)",
        background: selected
          ? "var(--color-surface-elevated)"
          : "var(--color-surface-sheet)",
        border: `1px solid ${selected ? "var(--color-purple)" : "var(--color-border)"}`,
      }}
    >
      <span
        className="font-body font-medium text-white leading-none"
        style={{ fontSize: "var(--sm)", fontVariationSettings: '"opsz" 14' }}
      >
        <TextEffectText text={label} effect={selected ? effect : null} />
      </span>
      {selected ? (
        <Check
          style={{ width: 24, height: 24, color: "var(--color-purple)" }}
          aria-hidden="true"
        />
      ) : (
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 9999,
            border: "1px solid var(--color-border)",
          }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ─── CreateDefinitionPage ─────────────────────────────────────────────────────
// Full-screen slide-in overlay. Back button and left-edge swipe close the
// overlay (calls onClose) rather than navigating router history.

interface CreateDefinitionPageProps {
  crewId: string;
  mode: "create" | "edit";
  initialWord?: string;
  initialActualWord?: string;
  initialDefinition?: string;
  initialTextEffect?: TextEffect | null;
  definitionId?: string;
  onClose: () => void;
  onSaved: (def: SquadDefinition) => void;
}

function CreateDefinitionPage({
  crewId,
  mode,
  initialWord = "",
  initialActualWord = "",
  initialDefinition = "",
  initialTextEffect = null,
  definitionId,
  onClose,
  onSaved,
}: CreateDefinitionPageProps) {
  const [word, setWord] = useState(initialWord);
  const [actualWord, setActualWord] = useState(initialActualWord);
  const [definition, setDefinition] = useState(initialDefinition);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const controls = useAnimation();

  // Text effect controls — Figma 405:2634.
  const [textEffectEnabled, setTextEffectEnabled] = useState(
    initialTextEffect != null,
  );
  const [textEffect, setTextEffect] = useState<TextEffect>(
    initialTextEffect ?? "bouncy_text",
  );

  // Slide in on mount
  useEffect(() => {
    controls.start({
      x: 0,
      transition: { type: "spring", stiffness: 380, damping: 36 },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate off-screen then unmount — used by both the back button and swipe gesture.
  // This keeps navigation inside the overlay and never calls router.back().
  const handleBack = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    controls
      .start({
        x: "100%",
        transition: { type: "tween", ease: [0.32, 0, 0.67, 0], duration: 0.15 },
      })
      .then(() => onClose());
  }, [controls, onClose]);

  // Left-edge swipe-to-close: mirrors SlidePage's gesture but resolves to onClose.
  // Also calls e.preventDefault() on left-edge touchstart to block iOS native back gesture.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let startX = 0,
      startY = 0,
      lastX = 0,
      lastT = 0,
      active = false;

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastX = startX;
      lastT = Date.now();
      if (startX < 40) {
        active = true;
        e.preventDefault();
        controls.stop();
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!active) return;
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dy > dx || dx < 0) {
        active = false;
        controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 500, damping: 40 },
        });
        return;
      }
      e.preventDefault();
      lastX = e.touches[0].clientX;
      lastT = Date.now();
      controls.set({ x: dx });
    }
    function onTouchEnd(e: TouchEvent) {
      if (!active || exitingRef.current) {
        active = false;
        return;
      }
      active = false;
      const endX = e.changedTouches[0].clientX;
      const dx = endX - startX;
      const dt = Date.now() - lastT;
      const vel = dt > 0 ? ((endX - lastX) / dt) * 1000 : 0;
      if (dx > 80 || vel > 400) {
        handleBack();
      } else {
        controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 500, damping: 40 },
        });
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [controls, handleBack]);

  async function handleSave() {
    if (!word.trim()) {
      setError("Word is required.");
      return;
    }
    if (!definition.trim()) {
      setError("Definition is required.");
      return;
    }
    setSaving(true);
    setError("");

    const effectToSave = textEffectEnabled ? textEffect : null;

    try {
      const result =
        mode === "edit" && definitionId
          ? await updateDefinitionAction(
              definitionId,
              word,
              definition,
              actualWord,
              effectToSave,
            )
          : await createDefinitionAction(
              crewId,
              word,
              definition,
              actualWord,
              effectToSave,
            );

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) onSaved(result.data);
      handleBack();
    } catch {
      // The server action call itself can throw (dropped/suspended request,
      // or a stale PWA-cached build calling an action id the current
      // deployment no longer recognizes) — surface it instead of leaving
      // the button stuck mid-save with no feedback.
      setError("Failed to save — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    // No exit prop — handleBack animates off-screen before calling onClose,
    // so AnimatePresence sees an already-invisible element and unmounts immediately.
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-[80] bg-black flex flex-col"
      style={{ maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}
      initial={{ x: "100%" }}
      animate={controls}
    >
      <PageHeader
        title={mode === "edit" ? "Edit Definition" : "Add Definition"}
        onBack={handleBack}
      />

      {/* Scrollable form body */}
      <div
        className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap: "var(--x6)",
          paddingLeft: "var(--md)",
          paddingRight: "var(--md)",
          paddingTop: "var(--x5)",
          paddingBottom: "var(--x5)",
        }}
      >
        <InputField
          label="Words attached to definition"
          value={word}
          onChange={setWord}
          maxLength={100}
          placeholder="e.g. GG, gg, good game"
          helperText="Putting commas separates the word but will tie back to this definition when used. (e.g. GG, gg, good game will be the same definition.)"
          autoComplete="off"
          autoCapitalize="off"
        />
        <InputField
          label="Actual Word"
          value={actualWord}
          onChange={setActualWord}
          maxLength={100}
          placeholder="e.g. Good Game"
          helperText={
            'What the actual full word mean. (e.g. GG is "Good Game")'
          }
          autoComplete="off"
        />
        <TextareaField
          label="Definition"
          value={definition}
          onChange={setDefinition}
          maxLength={500}
          placeholder="What does it mean in your squad?"
          rows={5}
        />
        <div className="flex flex-col w-full" style={{ gap: "var(--x3)" }}>
          <TextEffectToggleRow
            enabled={textEffectEnabled}
            onToggle={() => setTextEffectEnabled((v) => !v)}
          />
          {textEffectEnabled && (
            <div className="flex flex-col w-full" style={{ gap: "var(--x5)" }}>
              {TEXT_EFFECTS.map((opt) => (
                <TextEffectOptionCard
                  key={opt.id}
                  effect={opt.id}
                  label={opt.label}
                  selected={textEffect === opt.id}
                  onSelect={() => setTextEffect(opt.id)}
                />
              ))}
            </div>
          )}
        </div>
        {error && (
          <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed">
            {error}
          </p>
        )}
      </div>

      <PageFooter>
        <Button onClick={handleSave} disabled={saving} loading={saving} className="w-full">
          Save definition
        </Button>
      </PageFooter>
    </motion.div>
  );
}

// ─── DefinitionPreviewSheet ───────────────────────────────────────────────────

interface DefinitionPreviewSheetProps {
  definition: SquadDefinitionWithCreator;
  isCreator: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function DefinitionPreviewSheet({
  definition,
  isCreator,
  onClose,
  onEdit,
  onDelete,
}: DefinitionPreviewSheetProps) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    const result = await deleteDefinitionAction(definition.id);
    setDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    onDelete();
  }
  const aliases = definition.word
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <BottomSheet onClose={onClose} zIndex={70}>
      {/* Definition details — Figma 402:9535 */}
      <div
        className="flex flex-col items-start justify-center w-full"
        style={{
          gap: "var(--x3)",
          paddingLeft: "var(--x5)",
          paddingRight: "var(--x5)",
          paddingBottom: isCreator
            ? undefined
            : "max(env(safe-area-inset-bottom), var(--x8))",
        }}
      >
        <p
          className="font-silkscreen text-tertiary leading-none w-full"
          style={{ fontSize: "var(--mini)" }}
        >
          {aliases}
        </p>
        <div className="flex flex-col w-full" style={{ gap: "var(--x2)" }}>
          <p
            className="font-body font-bold text-primary leading-none w-full"
            style={{
              fontSize: "var(--md)",
              fontVariationSettings: '"opsz" 14',
            }}
          >
            {definition.actual_word || definition.word.split(",")[0].trim()}
          </p>
          <p
            className="font-body text-secondary leading-[1.5] overflow-hidden text-ellipsis w-full"
            style={{ fontSize: "14px", fontVariationSettings: '"opsz" 14' }}
          >
            {definition.definition}
          </p>
        </div>
        {definition.creator_username && (
          <p
            className="font-body font-light text-tertiary leading-none overflow-hidden text-ellipsis w-full"
            style={{ fontSize: "12px", fontVariationSettings: '"opsz" 14' }}
          >
            Author : {definition.creator_username}
          </p>
        )}
      </div>

      {/* Action buttons — Figma 502:2783 */}
      {isCreator && (
        <SheetFooter>
          <Button
            variant="outlined"
            color="purple"
            onClick={onEdit}
            className="w-full"
          >
            Edit Definition
          </Button>
          <Button
            variant="outlined"
            color="red"
            onClick={handleDelete}
            disabled={deleting}
            loading={deleting}
            className="w-full"
          >
            Delete Definition
          </Button>
          {deleteError && (
            <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed">
              {deleteError}
            </p>
          )}
        </SheetFooter>
      )}
    </BottomSheet>
  );
}

// ─── DefinitionHomePage ───────────────────────────────────────────────────────

interface DefinitionHomePageProps {
  crewId: string;
  currentUserId: string;
  currentUsername: string;
  initialDefinitions: SquadDefinitionWithCreator[];
}

export function DefinitionHomePage({
  crewId,
  currentUserId,
  currentUsername,
  initialDefinitions,
}: DefinitionHomePageProps) {
  const [definitions, setDefinitions] =
    useState<SquadDefinitionWithCreator[]>(initialDefinitions);
  const [showCreate, setShowCreate] = useState(false);
  const [previewTarget, setPreviewTarget] =
    useState<SquadDefinitionWithCreator | null>(null);
  const [editTarget, setEditTarget] =
    useState<SquadDefinitionWithCreator | null>(null);

  // Cache of creator_id → username to avoid redundant profile fetches in Realtime.
  // Seeded from initial definitions so most INSERTs won't need a network round-trip.
  const profileCacheRef = useRef<Record<string, string>>({});
  useEffect(() => {
    profileCacheRef.current[currentUserId] = currentUsername;
    for (const def of initialDefinitions) {
      if (def.creator_id && def.creator_username) {
        profileCacheRef.current[def.creator_id] = def.creator_username;
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient();

    const defsChannel = supabase
      .channel(`squad-defs:${crewId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "squad_definitions",
          filter: `crew_id=eq.${crewId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as SquadDefinition;
            const cached = profileCacheRef.current[incoming.creator_id];
            let creatorUsername: string | undefined = cached;
            if (!cached) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("username")
                .eq("id", incoming.creator_id)
                .single();
              creatorUsername = profile?.username as string | undefined;
              if (creatorUsername)
                profileCacheRef.current[incoming.creator_id] = creatorUsername;
            }
            setDefinitions((prev) => {
              if (prev.some((d) => d.id === incoming.id)) return prev;
              return [
                { ...incoming, creator_username: creatorUsername },
                ...prev,
              ];
            });
          } else if (payload.eventType === "DELETE") {
            const gone = payload.old as { id: string };
            setDefinitions((prev) => prev.filter((d) => d.id !== gone.id));
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as SquadDefinition;
            setDefinitions((prev) =>
              prev.map((d) =>
                d.id === updated.id
                  ? {
                      ...d,
                      word: updated.word,
                      actual_word: updated.actual_word,
                      definition: updated.definition,
                      text_effect: updated.text_effect,
                    }
                  : d,
              ),
            );
          }
        },
      )
      .subscribe();

    const sugChannel = supabase
      .channel(`def-suggestions:${crewId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "definition_suggestions",
          filter: `crew_id=eq.${crewId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as DefinitionSuggestion;
            setDefinitions((prev) =>
              prev.map((d) =>
                d.id === row.definition_id
                  ? { ...d, suggestion_count: (d.suggestion_count ?? 0) + 1 }
                  : d,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as DefinitionSuggestion;
            setDefinitions((prev) =>
              prev.map((d) =>
                d.id === row.definition_id
                  ? {
                      ...d,
                      suggestion_count: Math.max(
                        0,
                        (d.suggestion_count ?? 0) - 1,
                      ),
                    }
                  : d,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(defsChannel);
      supabase.removeChannel(sugChannel);
    };
  }, [crewId]);

  const handleCreated = useCallback(
    (def: SquadDefinition) => {
      setDefinitions((prev) => {
        if (prev.some((d) => d.id === def.id)) return prev;
        return [{ ...def, creator_username: currentUsername }, ...prev];
      });
    },
    [currentUsername],
  );

  const handleUpdated = useCallback((def: SquadDefinition) => {
    setDefinitions((prev) =>
      prev.map((d) =>
        d.id === def.id
          ? {
              ...d,
              word: def.word,
              actual_word: def.actual_word,
              definition: def.definition,
              text_effect: def.text_effect,
            }
          : d,
      ),
    );
  }, []);

  const handleDeleted = useCallback((defId: string) => {
    setDefinitions((prev) => prev.filter((d) => d.id !== defId));
    setPreviewTarget(null);
  }, []);

  function handleCardTap(def: SquadDefinitionWithCreator) {
    setPreviewTarget(def);
  }

  function handlePreviewEdit() {
    if (!previewTarget) return;
    setEditTarget(previewTarget);
    setPreviewTarget(null);
  }

  // Disable SlidePage's custom swipe handler while CreateDefinitionPage overlay is
  // open — prevents it from intercepting left-edge swipes and calling router.back().
  const overlayOpen = showCreate || !!editTarget;

  return (
    <SlidePage
      nativeSwipe={overlayOpen}
      className="min-h-screen bg-black flex flex-col"
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: 480,
        marginLeft: "auto",
        marginRight: "auto",
        overflow: "hidden",
      }}
    >
      <PageHeader
        title="Definitions"
        right={
          <button
            onClick={() => setShowCreate(true)}
            aria-label="Add definition"
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 24, height: 40 }}
          >
            <Plus
              style={{ width: 24, height: 24, color: "var(--color-primary)" }}
              aria-hidden="true"
            />
          </button>
        }
      />

      {/* Body — Figma 402:9281: px-md py-x5 gap-x6 */}
      <div
        className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap: "var(--x6)",
          paddingLeft: "var(--md)",
          paddingRight: "var(--md)",
          paddingTop: "var(--x5)",
          paddingBottom: "max(env(safe-area-inset-bottom), var(--x5))",
        }}
      >
        {definitions.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <p className="font-silkscreen text-[8px] text-tertiary text-center leading-relaxed">
              NO DEFINITIONS YET
            </p>
            <p
              className="font-body text-[14px] text-muted text-center"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Tap + to create the first squad definition.
            </p>
          </div>
        ) : (
          definitions.map((def) => {
            const aliases = def.word
              .split(",")
              .map((w) => w.trim())
              .filter(Boolean)
              .join(", ");
            const isCreator = def.creator_id === currentUserId;
            return (
              <button
                key={def.id}
                onClick={() => handleCardTap(def)}
                className="w-full text-left active:opacity-80 transition-opacity flex-shrink-0"
              >
                {/* Card — Figma 402:9403 */}
                <div
                  className="flex flex-col items-start w-full rounded-[var(--x3)] bg-[var(--color-surface-sheet)]"
                  style={{ padding: "var(--x5)", gap: "var(--x5)" }}
                >
                  {/* Details — Figma 402:9404: flex-col gap-x3 items-start justify-center */}
                  <div
                    className="flex flex-col items-start justify-center w-full"
                    style={{ gap: "var(--x3)" }}
                  >
                    {/* Aliases — Figma 402:9405: Silkscreen mini tertiary leading-none */}
                    <p
                      className="font-silkscreen text-tertiary leading-none w-full"
                      style={{ fontSize: "var(--mini)" }}
                    >
                      {aliases}
                    </p>
                    {/* Word + definition — Figma 402:9406: flex-col gap-x2 items-center justify-center */}
                    <div
                      className="flex flex-col items-center justify-center w-full"
                      style={{ gap: "var(--x2)" }}
                    >
                      {/* Word — Figma 402:9407: DM Sans Bold md primary leading-none */}
                      <p
                        className="font-body font-bold text-primary leading-none w-full"
                        style={{
                          fontSize: "var(--md)",
                          fontVariationSettings: '"opsz" 14',
                        }}
                      >
                        {def.actual_word || def.word.split(",")[0].trim()}
                      </p>
                      {/* Definition — Figma 402:9408: DM Sans Regular 14px secondary leading-[1.5] overflow-hidden text-ellipsis */}
                      <p
                        className="font-body text-secondary overflow-hidden text-ellipsis w-full"
                        style={{
                          fontSize: "14px",
                          lineHeight: "1.5",
                          fontVariationSettings: '"opsz" 14',
                        }}
                      >
                        {def.definition}
                      </p>
                    </div>
                  </div>

                  {/* Creator + suggestion badge — Figma 402:9409: DM Sans Light xs tertiary leading-none */}
                  <div className="flex items-center justify-between w-full">
                    <p
                      className="font-body font-light leading-none"
                      style={{
                        fontSize: "var(--xs)",
                        color: isCreator
                          ? "var(--color-primary)"
                          : "var(--color-tertiary)",
                        fontVariationSettings: '"opsz" 14',
                      }}
                    >
                      {def.creator_username
                        ? `Created by : ${def.creator_username}`
                        : ""}
                    </p>
                    {(def.suggestion_count ?? 0) > 0 && (
                      <p
                        className="font-body font-light leading-none"
                        style={{
                          fontSize: "var(--xs)",
                          color: "#f59e0b",
                          fontVariationSettings: '"opsz" 14',
                        }}
                      >
                        {def.suggestion_count} New Suggestion
                        {(def.suggestion_count ?? 0) > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateDefinitionPage
            key="create"
            crewId={crewId}
            mode="create"
            onClose={() => setShowCreate(false)}
            onSaved={handleCreated}
          />
        )}
        {editTarget && (
          <CreateDefinitionPage
            key="edit"
            crewId={crewId}
            mode="edit"
            initialWord={editTarget.word}
            initialActualWord={editTarget.actual_word ?? ""}
            initialDefinition={editTarget.definition}
            initialTextEffect={editTarget.text_effect}
            definitionId={editTarget.id}
            onClose={() => setEditTarget(null)}
            onSaved={(def) => {
              handleUpdated(def);
              setEditTarget(null);
            }}
          />
        )}
        {previewTarget && (
          <DefinitionPreviewSheet
            key="preview"
            definition={previewTarget}
            isCreator={previewTarget.creator_id === currentUserId}
            onClose={() => setPreviewTarget(null)}
            onEdit={handlePreviewEdit}
            onDelete={() => handleDeleted(previewTarget.id)}
          />
        )}
      </AnimatePresence>
    </SlidePage>
  );
}
