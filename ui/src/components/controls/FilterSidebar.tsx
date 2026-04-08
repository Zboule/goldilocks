import type { Filter, Manifest } from "../../types";
import FilterPanel from "./FilterPanel";

interface Props {
  open: boolean;
  manifest: Manifest;
  filters: Filter[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Filter>) => void;
  onClear: () => void;
  onLoadPreset: (filters: Omit<Filter, "id">[]) => void;
  onClose: () => void;
}

export default function FilterSidebar({
  open,
  manifest,
  filters,
  onAdd,
  onRemove,
  onUpdate,
  onClear,
  onLoadPreset,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="shrink-0 w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden z-10">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0">
        <h2 className="text-sm font-semibold text-gray-700">Filters</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
        >
          ×
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1">
        <FilterPanel
          filters={filters}
          manifest={manifest}
          onAdd={onAdd}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onClear={onClear}
          onLoadPreset={onLoadPreset}
        />
      </div>
    </div>
  );
}
