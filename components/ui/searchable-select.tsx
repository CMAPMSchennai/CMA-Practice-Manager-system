"use client";

/**
 * SearchableSelect — a type-ahead picker for long lists (for example clients).
 * The user types part of a name and only the few matches are listed underneath, so
 * there is nothing long to scroll. Picking one returns its id.
 */

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

const MAX_SHOWN = 6;

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [text, setText] = React.useState("");
  const selected = options.find((o) => o.value === value);

  const q = text.trim().toLowerCase();
  const matches = React.useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : []),
    [options, q],
  );
  const shown = matches.slice(0, MAX_SHOWN);

  if (selected) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm",
          className,
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Check className="size-4 shrink-0 text-green-700" />
          <span className="truncate">{selected.label}</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            onChange("");
            setText("");
          }}
        >
          <X className="size-4 mr-1" /> Change
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the only match instead of submitting the form.
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length === 1) onChange(matches[0].value);
            }
          }}
          placeholder={searchPlaceholder || placeholder}
          className="pl-9"
          autoComplete="off"
        />
      </div>
      {!q ? (
        <p className="text-xs text-muted-foreground">{placeholder}. Start typing to see matches.</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">No match for &quot;{text.trim()}&quot;.</p>
      ) : (
        <div className="rounded-md border border-border divide-y divide-border">
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setText("");
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
            >
              {o.label}
            </button>
          ))}
          {matches.length > shown.length && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {matches.length - shown.length} more. Keep typing to narrow the list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
