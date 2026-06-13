import { useCallback, useEffect, useRef } from "react";
import type { Filter, Manifest } from "../../types";
import { PRESETS, SAFETY_FILTER, matchingPresetId } from "../../lib/filterPresets";
import FilterRow from "./FilterRow";

interface Props {
  filters: Filter[];
  manifest: Manifest;
  onAdd: (defaults?: Partial<Filter>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Filter>) => void;
  onClear: () => void;
  onLoadPreset: (filters: Omit<Filter, "id">[]) => void;
  /** Called after a preset is applied (mobile closes the sheet so the result is visible). */
  onPresetApplied?: () => void;
}

export default function FilterPanel({
  filters,
  manifest,
  onAdd,
  onRemove,
  onUpdate,
  onClear,
  onLoadPreset,
  onPresetApplied,
}: Props) {
  const hasSafetyVariable = "travel_safety" in manifest.variables;
  // Derived, not stored: the toggle reflects what the filter list actually contains.
  const safeOnly = filters.some((f) => f.variable === "travel_safety");
  // Derived (not stored): survives sheet remounts and goes away if edited.
  const appliedPreset = matchingPresetId(filters);

  const handlePresetClick = useCallback(
    (presetFilters: Omit<Filter, "id">[]) => {
      const base = presetFilters.filter((f) => f.variable !== "travel_safety");
      onLoadPreset(safeOnly && hasSafetyVariable ? [...base, SAFETY_FILTER] : base);
      onPresetApplied?.();
    },
    [safeOnly, hasSafetyVariable, onLoadPreset, onPresetApplied],
  );

  const handleSafeToggle = useCallback(() => {
    if (!hasSafetyVariable) return;
    const safetyFilter = filters.find((f) => f.variable === "travel_safety");
    if (safetyFilter) {
      onRemove(safetyFilter.id);
    } else {
      onAdd(SAFETY_FILTER);
    }
  }, [filters, hasSafetyVariable, onAdd, onRemove]);

  // New rows can land below the sheet fold — bring them into view.
  const listEndRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(filters.length);
  useEffect(() => {
    if (filters.length > prevCountRef.current) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    prevCountRef.current = filters.length;
  }, [filters.length]);

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {/* Presets + Safe toggle */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Presets
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((preset) => {
            const isApplied = appliedPreset === preset.id && filters.length > 0;
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetClick(preset.filters)}
                title={preset.description}
                aria-pressed={isApplied}
                className={`cursor-pointer rounded-lg border px-3 py-2.5 md:py-2 transition-colors text-left flex items-center gap-1.5 min-w-0
                  ${isApplied
                    ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300"
                    : "border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 active:bg-blue-50"}`}
              >
                <span className="shrink-0">{preset.emoji}</span>
                <span className="text-sm md:text-[12px] font-medium truncate">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Global constraint — applies on its own, not tied to a preset */}
      {hasSafetyVariable && (
        <label className="flex items-center justify-between cursor-pointer select-none rounded-lg border border-gray-200 bg-white px-2.5 py-2 md:py-1.5">
          <span className="text-xs text-gray-600">
            Safe countries only
            <span className="block text-[9px] text-gray-400">Hide "reconsider travel" &amp; "do not travel" advisories</span>
          </span>
          <button
            role="switch"
            aria-checked={safeOnly}
            onClick={handleSafeToggle}
            className={`relative inline-flex h-5 w-9 md:h-4 md:w-7 items-center rounded-full transition-colors shrink-0 ${safeOnly ? "bg-green-500" : "bg-gray-300"}`}
          >
            <span
              className={`inline-block h-4 w-4 md:h-3 md:w-3 rounded-full bg-white transition-transform ${safeOnly ? "translate-x-4 md:translate-x-3.5" : "translate-x-0.5"}`}
            />
          </button>
        </label>
      )}

      {/* Active filters */}
      <div className="flex flex-col gap-1.5" data-active-filters>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Active Filters
          </span>
          <button
            onClick={() => onAdd()}
            className="rounded bg-blue-500 hover:bg-blue-600 active:bg-blue-600 text-white text-xs md:text-[10px] px-2.5 md:px-1.5 py-1 md:py-0.5 transition-colors leading-tight"
          >
            + Add
          </button>
          {filters.length > 0 && (
            <button
              onClick={onClear}
              className="ml-auto flex items-center gap-1 rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-100 text-xs font-medium px-2.5 py-1 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Clear all
            </button>
          )}
        </div>

        {filters.length === 0 ? (
          <span className="text-xs text-gray-400 italic">
            No filters — all land cells shown
          </span>
        ) : (
          <div className="flex flex-col gap-2">
            {filters.map((f) => (
              <FilterRow
                key={f.id}
                filter={f}
                manifest={manifest}
                onChange={(patch) => onUpdate(f.id, patch)}
                onRemove={() => onRemove(f.id)}
              />
            ))}
            <div ref={listEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
