import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  /** Main line shown in the list and on the trigger when selected. */
  label: string;
  /** Secondary muted line (e.g. phone number) to tell similar entries apart. */
  description?: string;
  /** Extra text to match when typing (label + description always match). */
  keywords?: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Type to search…",
  emptyText = "No matches.",
  disabled = false,
  triggerClassName,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", triggerClassName)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0"
        align="start"
      >
        <Command
          filter={(itemValue, search, keywords) => {
            const haystack = `${itemValue} ${(keywords ?? []).join(" ")}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          {/* max-h keeps long lists on screen; the list scrolls within it. */}
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  keywords={[o.description ?? "", o.keywords ?? ""].filter(Boolean)}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="truncate">{o.label}</div>
                    {o.description && (
                      <div className="truncate text-xs text-muted-foreground">
                        {o.description}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
