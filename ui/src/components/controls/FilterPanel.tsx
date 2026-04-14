import { useState, useCallback } from "react";
import type { Filter, Manifest } from "../../types";
import { PRESETS, SAFETY_FILTER } from "../../lib/filterPresets";
import FilterRow from "./FilterRow";

interface Props {
  filters: Filter[];
  manifest: Manifest;
  onAdd: (defaults?: Partial<Filter>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Filter>) => void;
  onClear: () => void;
  onLoadPreset: (filters: Omit<Filter, "id">[]) => void;
}

export default function FilterPanel({
  filters,
  manifest,
  onAdd,
  onRemove,
  onUpdate,
  onClear,
  onLoadPreset,
}: Props) {
  const [safeOnly, setSafeOnly] = useState(true);
  const hasSafetyVariable = "travel_safety" in manifest.variables;

  const handlePresetClick = useCallback(
    (presetFilters: Omit<Filter, "id">[]) => {
      const base = presetFilters.filter((f) => f.variable !== "travel_safety");
      onLoadPreset(safeOnly && hasSafetyVariable ? [...base, SAFETY_FILTER] : base);
    },
    [safeOnly, hasSafetyVariable, onLoadPreset],
  );

  const handleSafeToggle = useCallback(() => {
    setSafeOnly((prev) => {
      const next = !prev;
      if (next && hasSafetyVariable) {
        const alreadyHas = filters.some((f) => f.variable === "travel_safety");
        if (!alreadyHas) onAdd(SAFETY_FILTER);
      } else {
        const safetyFilter = filters.find((f) => f.variable === "travel_safety");
        if (safetyFilter) onRemove(safetyFilter.id);
      }
      return next;
    });
  }, [filters, hasSafetyVariable, onAdd, onRemove]);

  return (
    <div className="flex flex-col gap-3">
      {/* Presets + Safe toggle */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Presets
          </span>
          {hasSafetyVariable && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <span className="text-[10px] text-gray-500">Safe countries</span>
              <button
                role="switch"
                aria-checked={safeOnly}
                onClick={handleSafeToggle}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${safeOnly ? "bg-green-500" : "bg-gray-300"}`}
              >
                <span
                  className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${safeOnly ? "translate-x-3.5" : "translate-x-0.5"}`}
                />
              </button>
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePresetClick(preset.filters)}
              title={preset.description}
              className="cursor-pointer rounded border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-[11px] px-2 py-1.5 transition-colors text-center truncate"
            >
              {preset.emoji} {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Active Filters
          </span>
          <button
            onClick={() => onAdd()}
            className="rounded bg-blue-500 hover:bg-blue-600 text-white text-[10px] px-1.5 py-0.5 transition-colors leading-tight"
          >
            + Add
          </button>
          {filters.length > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
            >
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
          </div>
        )}
      </div>
    </div>
  );
}
