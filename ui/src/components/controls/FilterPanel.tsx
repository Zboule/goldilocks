import type { Filter, Manifest } from "../../types";
import { PRESETS } from "../../lib/filterPresets";
import FilterRow from "./FilterRow";

interface Props {
  filters: Filter[];
  manifest: Manifest;
  onAdd: () => void;
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
  return (
    <div className="flex flex-col gap-3">
      {/* Presets */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Presets
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onLoadPreset(preset.filters)}
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
            onClick={onAdd}
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
