import { useEffect, useRef } from "react";
import type { Filter, Manifest } from "../../types";
import FilterPanel from "./FilterPanel";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useBottomSheet } from "../../hooks/useBottomSheet";
import { useThemeColorDim } from "../../hooks/useThemeColorDim";

interface Props {
  open: boolean;
  manifest: Manifest;
  filters: Filter[];
  onAdd: (defaults?: Partial<Filter>) => void;
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
  const isMobile = useIsMobile();
  const sheet = useBottomSheet(open && isMobile, onClose);

  // Ease iOS Safari's chrome along with the dim backdrop (matches the 300ms
  // opacity fade below). `opened` is recomputed in the mobile branch too.
  const opened = sheet.translateClass === "translate-y-0";
  useThemeColorDim(isMobile && opened);

  // Always open scrolled to the top (Presets first).
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
      }, 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Desktop sidebar: plain conditional render. Mobile: animated sheet.
  if (!isMobile && !open) return null;
  if (isMobile && !sheet.mounted) return null;

  const panel = (
    <FilterPanel
      filters={filters}
      manifest={manifest}
      onAdd={onAdd}
      onRemove={onRemove}
      onUpdate={onUpdate}
      onClear={onClear}
      onLoadPreset={onLoadPreset}
    />
  );

  if (!isMobile) {
    return (
      <div className="bg-white flex flex-col overflow-hidden z-40 shrink-0 w-[362px] border-r border-gray-200">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-700">Filters</h2>
          <button
            onClick={onClose}
            aria-label="Close filters"
            className="w-8 h-8 -mr-2 flex items-center justify-center text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">{panel}</div>
      </div>
    );
  }

  // Mobile bottom sheet — tall, with a dimming backdrop (the map underneath
  // doesn't need to stay visible while editing filters). `opened` is computed
  // above (it also drives the theme-color easing).
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-30 transition-opacity duration-300 ${opened ? "opacity-100" : "opacity-0"}`}
        onClick={sheet.requestClose}
      />
    <div
      className={[
        "bg-white flex flex-col overflow-hidden z-40",
        "fixed inset-x-0 bottom-0 top-[max(env(safe-area-inset-top),0.75rem)] rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.18)]",
        "pb-[env(safe-area-inset-bottom)]",
        sheet.dragging ? "" : "transition-transform duration-300 ease-out",
        sheet.translateClass,
      ].join(" ")}
      style={sheet.style}
      onTransitionEnd={sheet.onTransitionEnd}
    >
      {/* Drag handle doubles as the header — no title label, close sits top-right */}
      <div className="relative flex justify-center pt-2 pb-1.5 touch-none cursor-grab shrink-0" {...sheet.handleProps}>
        <div className="w-10 h-1 rounded-full bg-gray-300" />
        <button
          onClick={sheet.requestClose}
          aria-label="Close filters"
          className="absolute right-1 top-0 w-9 h-9 flex items-center justify-center text-gray-400 active:text-gray-600 text-xl leading-none"
        >
          ×
        </button>
      </div>
      <div ref={contentRef} className="px-4 pb-3 overflow-y-auto overscroll-contain flex-1">{panel}</div>
      {/* Sticky footer: the sheet is non-modal, so Apply just dismisses it to
          reveal the map result. */}
      <div className="shrink-0 border-t border-gray-100 px-4 py-2.5">
        <button
          onClick={sheet.requestClose}
          className="w-full rounded-lg bg-blue-500 active:bg-blue-600 text-white font-semibold py-3 text-sm transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
    </>
  );
}
