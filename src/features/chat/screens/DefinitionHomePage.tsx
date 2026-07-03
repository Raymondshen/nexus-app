"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlidePage, useSlideBack } from "@/app/layouts/SlidePage";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { Plus } from "pixelarticons/react/Plus";
import { createClient } from "@/shared/supabase/client";
import {
  createDefinitionAction,
  updateDefinitionAction,
  deleteDefinitionAction,
} from "@/app/(app)/chat/[crewId]/definitions/actions";
import { BottomSheet } from "@/shared/components/ui/BottomSheet";
import { DefinitionButton } from "@/shared/components/ui/DefinitionButton";
import { InputField, TextareaField } from "@/shared/components/ui/InputField";
import { MagicEdit } from "pixelarticons/react/MagicEdit";
import { Close } from "pixelarticons/react/Close";
import { Trash } from "pixelarticons/react/Trash";
import type {
  SquadDefinition,
  SquadDefinitionWithCreator,
  DefinitionSuggestion,
} from "@/types";

function BackButton() {
  const goBack = useSlideBack();
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: 24, height: 40 }}
    >
      <ChevronLeft
        style={{ width: 24, height: 24, color: "var(--color-primary)" }}
        aria-hidden="true"
      />
    </button>
  );
}

// ─── CreateDefinitionPage ─────────────────────────────────────────────────────
// Full-screen slide-in page (replaces the old bottom sheet).
// Slides in from the right using the same spring as SlidePage (380/36).

interface CreateDefinitionPageProps {
  crewId: string;
  mode: "create" | "edit";
  initialWord?: string;
  initialActualWord?: string;
  initialDefinition?: string;
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

  // Prevent SlidePage's left-edge swipe handler (and iOS native back gesture)
  // from firing through this fixed overlay. Touch events would otherwise bubble
  // up to the SlidePage container since fixed children still propagate natively.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.touches[0]?.clientX < 40) e.preventDefault();
    };
    el.addEventListener("touchstart", block, { passive: false });
    return () => el.removeEventListener("touchstart", block);
  }, []);

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

    const result =
      mode === "edit" && definitionId
        ? await updateDefinitionAction(
            definitionId,
            word,
            definition,
            actualWord,
          )
        : await createDefinitionAction(crewId, word, definition, actualWord);

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) onSaved(result.data);
    onClose();
  }

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-[80] bg-black flex flex-col"
      style={{ maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
    >
      {/* Header — matches DefinitionHomePage header spec */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{
          paddingLeft: "var(--md)",
          paddingRight: "var(--md)",
          paddingTop: "max(env(safe-area-inset-top), var(--x3))",
          paddingBottom: "var(--x3)",
        }}
      >
        <div className="flex items-center h-10" style={{ gap: "var(--x3)" }}>
          <button
            onClick={onClose}
            aria-label="Back"
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 24, height: 40 }}
          >
            <ChevronLeft
              style={{ width: 24, height: 24, color: "var(--color-primary)" }}
              aria-hidden="true"
            />
          </button>
          <h1
            className="font-silkscreen uppercase leading-none text-primary"
            style={{ fontSize: "var(--xl)" }}
          >
            {mode === "edit" ? "Edit Definition" : "Add Definition"}
          </h1>
        </div>
      </div>

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
        {error && (
          <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed">
            {error}
          </p>
        )}
      </div>

      {/* Sticky save button */}
      <div
        className="flex-shrink-0"
        style={{
          paddingLeft: "var(--md)",
          paddingRight: "var(--md)",
          paddingTop: "var(--x5)",
          paddingBottom: "max(env(safe-area-inset-bottom), var(--x5))",
        }}
      >
        <DefinitionButton
          variant="fill"
          onClick={handleSave}
          disabled={saving}
          loading={saving}
        >
          Save definition
        </DefinitionButton>
      </div>
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
      <div
        className="flex flex-col w-full"
        style={{
          gap: "var(--x5)",
          paddingLeft: "var(--md)",
          paddingRight: "var(--md)",
          paddingBottom: "max(env(safe-area-inset-bottom), 28px)",
        }}
      >
        {/* Definition details — Figma 402:9535 */}
        <div
          className="flex flex-col items-start justify-center w-full"
          style={{ gap: "var(--x3)" }}
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

        {/* Action buttons — Figma 402:9509 / 402:9507 */}
        <div className="flex flex-col w-full" style={{ gap: "var(--x5)" }}>
          {isCreator && (
            <DefinitionButton
              variant="stroke"
              color="purple"
              icon={
                <MagicEdit
                  style={{ width: 20, height: 20 }}
                  aria-hidden="true"
                />
              }
              onClick={onEdit}
            >
              Edit Definition
            </DefinitionButton>
          )}
          {isCreator && (
            <DefinitionButton
              variant="stroke"
              color="red"
              icon={
                <Trash style={{ width: 20, height: 20 }} aria-hidden="true" />
              }
              onClick={handleDelete}
              disabled={deleting}
              loading={deleting}
            >
              Delete Definition
            </DefinitionButton>
          )}
          {deleteError && (
            <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed">
              {deleteError}
            </p>
          )}
          <DefinitionButton
            variant="stroke"
            color="tertiary"
            icon={
              <Close style={{ width: 20, height: 20 }} aria-hidden="true" />
            }
            onClick={onClose}
          >
            Cancel
          </DefinitionButton>
        </div>
      </div>
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
            const { data: profile } = await supabase
              .from("profiles")
              .select("username")
              .eq("id", incoming.creator_id)
              .single();
            setDefinitions((prev) => {
              if (prev.some((d) => d.id === incoming.id)) return prev;
              return [
                {
                  ...incoming,
                  creator_username: profile?.username as string | undefined,
                },
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

  return (
    <SlidePage
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
      {/* Header — Figma 402:9394: px-md py-x3, heading h-40px justify-between */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{
          paddingLeft: "var(--md)",
          paddingRight: "var(--md)",
          paddingTop: "max(env(safe-area-inset-top), var(--x3))",
          paddingBottom: "var(--x3)",
        }}
      >
        <div className="flex items-center justify-between h-10">
          {/* Left container — icon+title gap-x3 (Figma I402:9394;189:2437) */}
          <div
            className="flex items-center h-full"
            style={{ gap: "var(--x3)" }}
          >
            <BackButton />
            <h1
              className="font-silkscreen uppercase leading-none text-primary"
              style={{ fontSize: "var(--xl)" }}
            >
              Definitions
            </h1>
          </div>
          {/* Right — add button (Figma I402:9394;189:2442) */}
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
        </div>
      </div>

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
