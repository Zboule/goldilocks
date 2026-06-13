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
  /** Optional "About" content for the selected value. On mobile it opens as an in-sheet sub-page with a back button. */
  renderInfo?: () => ReactNode;
  /** Title for the in-sheet About sub-page (e.g. the layer name). */
  infoTitle?: string;
  /** Per-option "About" content. When it returns non-null, that row shows an (i) opening the same sub-page for that option (mobile only). */
  renderOptionInfo?: (value: string) => ReactNode;
  /** Title for a per-option About sub-page (defaults to the option label). */
  optionInfoTitle?: (value: string) => string;
}

export default function CustomSelect({ value, onChange, options, groups, className, minWidth = "120px", label, shortLabels, renderInfo, infoTitle, renderOptionInfo, optionInfoTitle }: Props) {
  const [open, setOpen] = useState(false);
  // Holds the About sub-page to show (selected value or a tapped option); null = option list.
  const [info, setInfo] = useState<{ node: ReactNode; title: string } | null>(null);
  // Drives the slide-in: mount the panel off-screen, then flip on the next frame.
  // `infoShown` (not `info`) drives the header so it reverts the instant you tap
  // back; `info` lingers only to keep the panel content mounted while it slides.
  const [infoShown, setInfoShown] = useState(false);
  const infoCloseTimer = useRef<number | null>(null);

  const clearInfoTimer = () => {
    if (infoCloseTimer.current !== null) {
      clearTimeout(infoCloseTimer.current);
      infoCloseTimer.current = null;
    }
  };

  const openInfoPage = (node: ReactNode, title: string) => {
    clearInfoTimer();
    setInfo({ node, title });
    requestAnimationFrame(() => requestAnimationFrame(() => setInfoShown(true)));
  };
  const closeInfoPage = () => {
    setInfoShown(false);
    // Unmount the panel after the slide-out. transitionend clears it too, but
    // that event is unreliable on mobile Safari, so this guarantees cleanup.
    clearInfoTimer();
    infoCloseTimer.current = window.setTimeout(() => {
      setInfo(null);
      infoCloseTimer.current = null;
    }, 350);
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const sheet = useBottomSheet(open && isMobile, () => setOpen(false));

  // Always return to the option list when the sheet (re)opens or closes.
  useEffect(() => {
    if (!open) {
      setInfo(null);
      setInfoShown(false);
      clearInfoTimer();
    }
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

  // Per-row (i) is mobile-only (desktop has its own inline info button); only
  // shown when renderOptionInfo returns content for that option.
  const renderItem = (opt: SelectOption) => {
    const infoNode = isMobile ? renderOptionInfo?.(opt.value) : null;
    return (
      <Item
        key={opt.value}
        opt={opt}
        selected={opt.value === value}
        mobile={isMobile}
        onSelect={select}
        onShowInfo={
          infoNode != null
            ? () => openInfoPage(infoNode, optionInfoTitle?.(opt.value) ?? opt.label)
            : undefined
        }
      />
    );
  };

  const optionList = groups ? (
    groups.map((group) => (
      <div key={group.label}>
        <div className="px-4 md:px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          {group.label}
        </div>
        {group.options.map(renderItem)}
      </div>
    ))
  ) : (
    allOptions.map(renderItem)
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
            className={`fixed inset-x-0 bottom-0 z-[80] bg-white rounded-t-2xl shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)]
                        ${renderInfo || renderOptionInfo ? "h-[70dvh]" : "max-h-[70dvh]"}
                        ${sheet.dragging ? "" : "transition-transform duration-300 ease-out"} ${sheet.translateClass}`}
            style={sheet.style}
            onTransitionEnd={sheet.onTransitionEnd}
          >
            <div className="flex justify-center pt-2 pb-0.5 touch-none cursor-grab shrink-0" {...sheet.handleProps}>
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Persistent header: the close button keeps the same size and
                position whether or not the back button is showing — only the
                left side and body change. */}
            <div
              className="flex items-center px-2 py-1.5 border-b border-gray-100 shrink-0"
              {...(infoShown ? {} : sheet.handleProps)}
            >
              {/* Back button: always mounted, animates its width so the title
                  slides left when it appears and right when it leaves. */}
              <button
                onClick={closeInfoPage}
                aria-label="Back"
                tabIndex={infoShown ? 0 : -1}
                className={`h-9 flex items-center justify-center text-gray-500 active:text-gray-800 shrink-0 overflow-hidden transition-all duration-300 ease-out ${infoShown ? "w-9 opacity-100" : "w-0 opacity-0"}`}
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="min-w-0 flex-1 px-2">
                {infoShown ? (
                  <>
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 leading-none">About</div>
                    <div className="text-sm font-semibold text-gray-800 truncate">{info?.title}</div>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-gray-700">{label ?? "Select"}</span>
                )}
              </div>
              {!infoShown && renderInfo && !renderOptionInfo && (
                <button
                  onClick={() => openInfoPage(renderInfo(), infoTitle ?? label ?? "About")}
                  className="flex items-center gap-1 rounded-full border border-gray-300 text-gray-500 active:text-blue-600 active:border-blue-300 px-2 h-7 text-xs shrink-0 mr-1"
                >
                  <span className="w-4 h-4 rounded-full border border-current text-[10px] leading-none flex items-center justify-center">i</span>
                  About
                </button>
              )}
              <button
                onClick={sheet.requestClose}
                aria-label="Close"
                className="w-9 h-9 flex items-center justify-center text-gray-400 active:text-gray-600 text-xl leading-none shrink-0"
              >
                ×
              </button>
            </div>

            {/* Body: option list, with the About page sliding in over it. */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
              <div role="listbox" className="absolute inset-0 overflow-y-auto overscroll-contain py-1">
                {optionList}
              </div>
              {info && (
                <div
                  className={`absolute inset-0 bg-white overflow-y-auto overscroll-contain px-4 py-3 shadow-[-8px_0_24px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-out ${infoShown ? "translate-x-0" : "translate-x-full"}`}
                  onTransitionEnd={(e) => {
                    if (e.propertyName === "transform" && !infoShown) {
                      clearInfoTimer();
                      setInfo(null);
                    }
                  }}
                >
                  {info.node}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Item({ opt, selected, mobile, onSelect, onShowInfo }: { opt: SelectOption; selected: boolean; mobile: boolean; onSelect: (v: string) => void; onShowInfo?: () => void }) {
  return (
    <div
      className={`flex items-center ${mobile ? "pr-3" : "pr-2"}
        ${selected ? "bg-blue-50" : "hover:bg-gray-50 active:bg-gray-100"}`}
    >
      <button
        role="option"
        aria-selected={selected}
        onClick={() => onSelect(opt.value)}
        className={`flex-1 min-w-0 text-left cursor-pointer truncate
          ${mobile ? "pl-4 py-2.5 text-[15px]" : "pl-3 py-1.5 text-sm"}
          ${selected ? "text-blue-700 font-medium" : "text-gray-700"}`}
      >
        <span className="block truncate">{opt.label}</span>
      </button>
      {selected && (
        <svg className="w-4 h-4 shrink-0 ml-2 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {onShowInfo && (
        <button
          onClick={onShowInfo}
          aria-label={`About ${opt.label}`}
          title="About"
          className="shrink-0 ml-1 w-9 h-9 flex items-center justify-center text-gray-300 active:text-blue-600 transition-colors"
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="11" x2="12" y2="16" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      )}
    </div>
  );
}
