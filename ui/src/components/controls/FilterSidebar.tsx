import { useEffect } from "react";
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
  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (!open) return;

    const mq = window.matchMedia("(max-width: 767px)");
    if (mq.matches) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Mobile: backdrop overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-30 md:hidden"
        onClick={onClose}
      />

      {/* Desktop: classic sidebar | Mobile: bottom sheet */}
      <div
        className={[
          // Shared
          "bg-white flex flex-col overflow-hidden z-40",
          // Mobile: bottom sheet
          "fixed inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl shadow-2xl",
          // Desktop: sidebar
          "md:static md:inset-auto md:max-h-none md:rounded-none md:shadow-none md:shrink-0 md:w-[362px] md:border-r md:border-gray-200",
        ].join(" ")}
      >
        {/* Drag handle (mobile only) */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

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
    </>
  );
}
