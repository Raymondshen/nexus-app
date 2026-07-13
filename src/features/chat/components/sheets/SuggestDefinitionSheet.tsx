"use client";

import { useState, useRef, useEffect } from "react";
import { suggestDefinitionAction } from "@/app/(app)/chat/[crewId]/definitions/actions";
import { BottomSheet } from "@/shared/components/ui/sheet/BottomSheet";
import { SheetFooter } from "@/shared/components/ui/sheet/SheetFooter";
import { Button } from "@/shared/components/ui/Button";
import { TextareaField } from "@/shared/components/ui/InputField";
import type { SquadDefinitionWithCreator } from "@/types";

interface SuggestDefinitionSheetProps {
  crewId: string;
  definition: SquadDefinitionWithCreator;
  onClose: () => void;
  onSaved?: () => void;
  /** z-index base — defaults to 90/100 to sit above chat portals */
  zBase?: number;
}

export function SuggestDefinitionSheet({
  crewId,
  definition,
  onClose,
  onSaved,
  zBase = 90,
}: SuggestDefinitionSheetProps) {
  const aliases = definition.word
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean)
    .join(", ");
  const displayWord =
    definition.actual_word || definition.word.split(",")[0].trim();

  const [suggestion, setSuggestion] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const suggestionRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    suggestionRef.current?.blur();
  }, []);

  async function handleSuggest() {
    if (!suggestion.trim()) {
      setError("Please write your suggestion.");
      return;
    }
    setSaving(true);
    setError("");
    const result = await suggestDefinitionAction(
      definition.id,
      crewId,
      suggestion,
    );
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved?.();
    onClose();
  }

  return (
    <BottomSheet
      onClose={onClose}
      zIndex={zBase + 10}
      maxHeight="90vh"
      className="overflow-y-auto"
    >
      <div
        className="flex flex-col"
        style={{
          gap: "var(--space-7)",
          paddingLeft: "var(--x5)",
          paddingRight: "var(--x5)",
        }}
      >
        {/* Title — DM Sans Bold 18px text-primary */}
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none flex-shrink-0"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Suggest New Definition
        </h2>

        {/* Existing definition preview */}
        <div
          className="flex flex-col items-start w-full flex-shrink-0"
          style={{ gap: "var(--space-5)" }}
        >
          <div
            className="flex flex-col items-start justify-center w-full"
            style={{ gap: "var(--space-3)" }}
          >
            <p
              className="font-silkscreen text-tertiary leading-none w-full"
              style={{ fontSize: "var(--text-mini)" }}
            >
              {aliases}
            </p>
            <div
              className="flex flex-col w-full"
              style={{ gap: "var(--space-2)" }}
            >
              <p
                className="font-body font-bold leading-none w-full"
                style={{
                  fontSize: "var(--text-md)",
                  color: "var(--color-blue)",
                  fontVariationSettings: '"opsz" 14',
                }}
              >
                {displayWord}
              </p>
              <p
                className="font-body text-secondary leading-normal overflow-hidden line-clamp-3 w-full"
                style={{ fontSize: "14px", fontVariationSettings: '"opsz" 14' }}
              >
                {definition.definition}
              </p>
            </div>
          </div>
          {definition.creator_username && (
            <p
              className="font-body text-tertiary leading-none"
              style={{
                fontSize: "var(--text-xxs)",
                fontVariationSettings: '"opsz" 14',
              }}
            >
              Created by : {definition.creator_username}
            </p>
          )}
        </div>

        {/* Suggestion textarea */}
        <div className="flex flex-col w-full flex-shrink-0">
          <TextareaField
            ref={suggestionRef}
            label="Suggest a new definition"
            value={suggestion}
            onChange={setSuggestion}
            maxLength={500}
            placeholder="What does it mean in your squad?"
            rows={3}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed flex-shrink-0">
            {error}
          </p>
        )}
      </div>

      {/* Buttons */}
      <SheetFooter>
        <Button
          onClick={handleSuggest}
          disabled={saving}
          loading={saving}
          className="w-full"
        >
          Suggest
        </Button>
        <Button
          variant="outlined"
          color="red"
          onClick={onClose}
          disabled={saving}
          className="w-full"
        >
          Cancel suggestion
        </Button>
      </SheetFooter>
    </BottomSheet>
  );
}
