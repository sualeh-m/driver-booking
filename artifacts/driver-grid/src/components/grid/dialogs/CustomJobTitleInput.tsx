import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  useListJobTitles,
  getListJobTitlesQueryKey,
} from "@workspace/api-client-react";

// Free-text job title input for the "Other" role with live suggestions from
// previously used titles. Filtering is case-insensitive and client-side; the
// list is small (distinct titles typed so far). Picking a suggestion reuses
// its exact stored casing so the same title never exists twice.
export function CustomJobTitleInput({
  value,
  onChange,
  onBlur,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const { data: titles } = useListJobTitles({
    query: { queryKey: getListJobTitlesQueryKey() },
  });

  const trimmed = value.trim().toLowerCase();
  const all = titles ?? [];
  const matches = trimmed
    ? all.filter((t) => t.toLowerCase().includes(trimmed))
    : all;
  // Hide the list once the typed value exactly matches a stored title.
  const exact = trimmed !== "" && all.some((t) => t.toLowerCase() === trimmed);
  const show = focused && !exact && matches.length > 0;

  return (
    <div className="relative">
      <Input
        placeholder="e.g. Recovery Driver"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay so a click on a suggestion registers before the list hides.
          setTimeout(() => setFocused(false), 150);
          onBlur?.();
        }}
      />
      {show && (
        <ul className="absolute z-50 mt-1 max-h-40 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {matches.map((t) => (
            <li key={t}>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent"
                // onMouseDown fires before the input's blur, so the pick wins.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(t);
                  setFocused(false);
                }}
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
