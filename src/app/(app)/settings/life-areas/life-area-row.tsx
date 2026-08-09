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
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${area.name}`}
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Colour: ${lifeAreaColourLabel(area.colour)}`}
            className="ring-foreground/10 size-5 shrink-0 rounded-full ring-1"
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
          aria-label={`Delete ${area.name}`}
          onClick={onRequestDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </li>
  );
}
