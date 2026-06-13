import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useBottomSheet } from "../../hooks/useBottomSheet";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  className?: string;
  minWidth?: string;
  /** Sheet title on mobile (e.g. "Map layer"). */
  label?: string;
  /** Compact label shown on the trigger button on mobile (full label stays in the sheet). */
  shortLabels?: Record<string, string>;
  /** Optional "About" content. On mobile it opens as an in-sheet sub-page with a back button. */
  renderInfo?: () => ReactNode;
  /** Title for the in-sheet About sub-page (e.g. the layer name). */
  infoTitle?: string;
}

export default function CustomSelect({ value, onChange, options, groups, className, minWidth = "120px", label, shortLabels, renderInfo, infoTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const sheet = useBottomSheet(open && isMobile, () => setOpen(false));

  // Always return to the option list when the sheet (re)opens or closes.
  useEffect(() => {
    if (!open) setShowInfo(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Desktop dropdown closes on outside click; the mobile sheet has its own backdrop.
    if (!isMobile) document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, isMobile]);

  const allOptions = groups
    ? groups.flatMap((g) => g.options)
    : options ?? [];
  const currentLabel = allOptions.find((o) => o.value === value)?.label ?? value;
  const triggerLabel = isMobile ? shortLabels?.[value] ?? currentLabel : currentLabel;

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const optionList = groups ? (
    groups.map((group) => (
      <div key={group.label}>
        <div className="px-4 md:px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          {group.label}
        </div>
        {group.options.map((opt) => (
          <Item key={opt.value} opt={opt} selected={opt.value === value} mobile={isMobile} onSelect={select} />
        ))}
      </div>
    ))
  ) : (
    allOptions.map((opt) => (
      <Item key={opt.value} opt={opt} selected={opt.value === value} mobile={isMobile} onSelect={select} />
    ))
  );

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className ?? ""}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={isMobile ? undefined : { minWidth }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="appearance-none rounded border border-gray-300 bg-white active:bg-gray-50 pl-2 pr-7 text-sm relative cursor-pointer w-full md:w-auto
                   flex items-center h-9 md:h-auto py-0 md:py-1
                   bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]
                   bg-[length:16px] bg-[right_6px_center] bg-no-repeat"
      >
        <span className="block truncate min-w-0">{triggerLabel}</span>
      </button>

      {open && !isMobile && (
        <div
          role="listbox"
          className="absolute top-full left-0 mt-1 min-w-full w-max bg-white border border-gray-200 rounded-lg shadow-xl z-[60] py-1 max-h-[70vh] overflow-y-auto"
        >
          {optionList}
        </div>
      )}

      {isMobile && sheet.mounted && (
        <>
          <div
            className={`fixed inset-0 bg-black/30 z-[70] transition-opacity duration-300 ${sheet.translateClass === "translate-y-0" ? "opacity-100" : "opacity-0"}`}
            onClick={sheet.requestClose}
          />
          <div
            className={`fixed inset-x-0 bottom-0 z-[80] bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[70dvh] pb-[env(safe-area-inset-bottom)]
                        ${sheet.dragging ? "" : "transition-transform duration-300 ease-out"} ${sheet.translateClass}`}
            style={sheet.style}
            onTransitionEnd={sheet.onTransitionEnd}
          >
            <div className="flex justify-center pt-2 pb-0.5 touch-none cursor-grab shrink-0" {...sheet.handleProps}>
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {showInfo && renderInfo ? (
              <>
                {/* About sub-page: back returns to the list, drawer stays open */}
                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 shrink-0">
                  <button
                    onClick={() => setShowInfo(false)}
                    aria-label="Back"
                    className="w-9 h-9 flex items-center justify-center text-gray-500 active:text-gray-800 shrink-0"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 leading-none">About</div>
                    <div className="text-sm font-semibold text-gray-800 truncate">{infoTitle ?? label}</div>
                  </div>
                  <button
                    onClick={sheet.requestClose}
                    aria-label="Close"
                    className="w-9 h-9 flex items-center justify-center text-gray-400 active:text-gray-600 text-xl leading-none shrink-0"
                  >
                    ×
                  </button>
                </div>
                <div className="overflow-y-auto overscroll-contain px-4 py-3 flex-1 min-h-0">
                  {renderInfo()}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0" {...sheet.handleProps}>
                  <span className="text-sm font-semibold text-gray-700">{label ?? "Select"}</span>
                  <div className="flex items-center gap-1">
                    {renderInfo && (
                      <button
                        onClick={() => setShowInfo(true)}
                        className="flex items-center gap-1 rounded-full border border-gray-300 text-gray-500 active:text-blue-600 active:border-blue-300 px-2 h-7 text-xs"
                      >
                        <span className="w-4 h-4 rounded-full border border-current text-[10px] leading-none flex items-center justify-center">i</span>
                        About
                      </button>
                    )}
                    <button
                      onClick={sheet.requestClose}
                      aria-label="Close"
                      className="w-8 h-8 -mr-1 flex items-center justify-center text-gray-400 active:text-gray-600 text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div role="listbox" className="overflow-y-auto overscroll-contain py-1 flex-1 min-h-0">
                  {optionList}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Item({ opt, selected, mobile, onSelect }: { opt: SelectOption; selected: boolean; mobile: boolean; onSelect: (v: string) => void }) {
  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(opt.value)}
      className={`w-full text-left cursor-pointer truncate flex items-center justify-between gap-2
        ${mobile ? "px-4 py-2.5 text-[15px]" : "px-3 py-1.5 text-sm"}
        ${selected ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"}`}
    >
      <span className="truncate">{opt.label}</span>
      {selected && (
        <svg className="w-4 h-4 shrink-0 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}
