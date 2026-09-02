"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  LIFE_AREA_COLOURS,
  lifeAreaColourLabel,
} from "@/lib/life-area-colours";
import type { Database } from "@/types/database";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];

export function LifeAreaRow({
  area,
  goalCount,
  onRename,
  onRecolour,
  onRequestDelete,
}: {
  area: LifeArea;
  goalCount: number;
  onRename: (name: string) => void;
  onRecolour: (colour: string) => void;
  onRequestDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: area.id });

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(area.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function commitRename() {
    setIsEditing(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== area.name) {
      onRename(trimmed);
    } else {
      setDraftName(area.name);
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card ring-foreground/10 flex items-center gap-2 rounded-lg p-2 ring-1",
        isDragging && "opacity-50",
      )}
    >
      {/* P5.5's mobile pass: both buttons below measured under the 44px
          tap-target floor (16x16 and 20x20). max-md: keeps desktop's
          compact row density untouched — this settings page has no
          separate mobile layout the way the timeline does, so the fix
          has to live in the shared markup itself. The drag handle gets
          a straightforward bigger invisible box (flex-centring the
          icon inside it, same technique llama-message.tsx's dismiss
          button already uses); the colour swatch can't grow the same
          way without visually enlarging the dot itself (its own
          background-color fills the whole button), so it gets an
          absolutely-positioned, transparent ::after instead — the
          visible 20px swatch stays exactly as small, only the invisible
          hit area around it grows. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${area.name}`}
        className="text-muted-foreground hover:text-foreground flex cursor-grab touch-none items-center justify-center active:cursor-grabbing max-md:size-11"
      >
        <GripVertical className="size-4" />
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Colour: ${lifeAreaColourLabel(area.colour)}`}
            className="ring-foreground/10 relative size-5 shrink-0 rounded-full ring-1 max-md:after:absolute max-md:after:inset-[-12px] max-md:after:content-['']"
            style={{ backgroundColor: area.colour }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto">
          <div className="grid grid-cols-4 gap-1.5">
            {LIFE_AREA_COLOURS.map((c) => (
              <button
                key={c.hex}
                type="button"
                aria-label={c.label}
                aria-pressed={c.hex === area.colour}
                onClick={() => onRecolour(c.hex)}
                className={cn(
                  "ring-foreground/10 size-6 rounded-full ring-1 transition-transform hover:scale-110",
                  c.hex === area.colour && "ring-ring ring-2",
                )}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {isEditing ? (
        <Input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            }
            if (e.key === "Escape") {
              setDraftName(area.name);
              setIsEditing(false);
            }
          }}
          className="h-7 flex-1"
        />
      ) : area.is_system ? (
        <span className="flex-1 truncate text-sm">{area.name}</span>
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex-1 truncate text-left text-sm hover:underline"
        >
          {area.name}
        </button>
      )}

      {goalCount > 0 && (
        <Badge variant="outline" className="shrink-0">
          {goalCount}
        </Badge>
      )}

      {!area.is_system && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          // max-md: same 44px-floor fix as the two buttons above —
          // overrides icon-sm's shared 28px on mobile only.
          className="max-md:size-11"
          aria-label={`Delete ${area.name}`}
          onClick={onRequestDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </li>
  );
}
