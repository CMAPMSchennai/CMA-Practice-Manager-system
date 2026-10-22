"use client";

/**
 * CreatableCombobox — Command-based popover that:
 * 1. Lists existing options fetched from /api/reference-data?type=<category>
 * 2. Lets the user type to filter
 * 3. Lets the user add a NEW value inline (POSTs to /api/reference-data)
 *
 * Props:
 *   category     — the reference_data.type value (e.g. "fee_basis", "entity_type")
 *   value        — currently selected label string (NOT id — for text fields)
 *   onChange     — callback with the selected/created label
 *   placeholder  — trigger button placeholder text
 *   disabled     — disables the trigger
 *
 * For entity_type_id (FK-based), use valueMode="id" which passes back the record id.
 */

import * as React from "react";
import { Check, ChevronsUpDown, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

interface ReferenceItem {
  id: string;
  code: string;
  label: string;
  type: string;
  sort_order: number;
  is_active: boolean;
}

interface CreatableComboboxProps {
  /** The reference_data.type category to load and create into */
  category: string;
  /** Current value — id when valueMode="id", label string when valueMode="label" */
  value: string;
  /** Called with the new value (id or label depending on valueMode) */
  onChange: (value: string) => void;
  /** "id" — value is the reference_data.id (for FK columns like entity_type_id)
   *  "label" — value is the label string (for plain text columns like fee_basis)
   *  Default: "label"
   */
  valueMode?: "id" | "label";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CreatableCombobox({
  category,
  value,
  onChange,
  valueMode = "label",
  placeholder = "Select or add…",
  disabled = false,
  className,
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<ReferenceItem[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // Load options on mount
  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/reference-data?type=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d?.reference_data) ? d.reference_data : []);
      })
      .catch(() => {
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [category]);

  // Derive display label for the trigger
  const displayLabel = React.useMemo(() => {
    if (!value) return "";
    if (valueMode === "id") {
      const found = items.find((i) => i.id === value);
      return found ? found.label : value;
    }
    return value;
  }, [value, items, valueMode]);

  // Filtered list
  const filtered = React.useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q),
    );
  }, [items, search]);

  // Show "Add …" option when typed text doesn't exactly match an existing label
  const showCreate =
    search.trim().length > 0 &&
    !items.some((i) => i.label.toLowerCase() === search.trim().toLowerCase());

  async function handleCreate() {
    if (!search.trim() || creating) return;
    const newLabel = search.trim();
    const newCode = newLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    setCreating(true);
    try {
      const res = await fetch("/api/reference-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: category,
          code: newCode,
          label: newLabel,
          sort_order: items.length + 1,
          is_active: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to create option");
        return;
      }
      const created: ReferenceItem = json.reference_data;
      setItems((prev) => [...prev, created]);
      onChange(valueMode === "id" ? created.id : created.label);
      setSearch("");
      setOpen(false);
      toast.success(`"${newLabel}" added`);
    } catch {
      toast.error("Failed to create option");
    } finally {
      setCreating(false);
    }
  }

  function handleSelect(item: ReferenceItem) {
    const newVal = valueMode === "id" ? item.id : item.label;
    onChange(newVal === value ? "" : newVal);
    setSearch("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !displayLabel && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type to add…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <CommandEmpty>Loading…</CommandEmpty>
            )}
            {!loading && filtered.length === 0 && !showCreate && (
              <CommandEmpty>No options found.</CommandEmpty>
            )}
            {!loading && filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((item) => {
                  const isSelected =
                    valueMode === "id" ? item.id === value : item.label === value;
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => handleSelect(item)}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {item.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {showCreate && (
              <>
                {filtered.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  <CommandItem
                    value={`__create__${search}`}
                    onSelect={handleCreate}
                    disabled={creating}
                    className="text-primary"
                  >
                    <PlusCircle className="mr-2 size-4" />
                    {creating ? "Adding…" : `Add "${search.trim()}"`}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
