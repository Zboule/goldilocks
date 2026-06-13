import { useState, useEffect, useRef } from "react";
import { periodToLabel } from "../../lib/gridGeometry";

interface Props {
  selectedPeriods: number[];
  lockedPeriods: Set<number>;
  activePeriod: number | null;
  periods: number[];
  periodLabels: string[];
  playing: boolean;
  onTogglePlay: () => void;
  onClickPeriod: (p: number) => void;
  onSetActive: (p: number) => void;
  onLockAll: () => void;
  onClearLocked: () => void;
  onToggleMonth: (periods: number[]) => void;
  loadingPeriods: Set<number>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PERIOD_POS = ["E", "M", "L"]; // Early, Mid, Late — sub-period labels

export default function PeriodSlider({
  selectedPeriods,
  lockedPeriods,
  activePeriod,
  periods,
  periodLabels,
  playing,
  onTogglePlay,
  onClickPeriod,
  onSetActive,
  onLockAll,
  onClearLocked,
  onToggleMonth,
  loadingPeriods,
}: Props) {
  const activePeriodRef = useRef(activePeriod);
  activePeriodRef.current = activePeriod;

  // Mobile: which month is expanded — managed as explicit state
  // so locking doesn't collapse it
  const [expandedMonth, setExpandedMonth] = useState<number>(0);

  // Tapping a month previews its mid period. The blue highlight should move to
  // the new month at the START of the expand animation, but the heavy map
  // recompute that `onSetActive` triggers must wait until the animation is done
  // (else it stutters). So we move the highlight instantly via `previewActive`
  // and defer the real `onSetActive` (the map update) by the animation length.
  const [previewActive, setPreviewActive] = useState<number | null>(null);
  const effectiveActive = previewActive ?? activePeriod;
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPreview = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  };
  // Once the real active period catches up, drop the optimistic preview.
  useEffect(() => { setPreviewActive(null); }, [activePeriod]);
  useEffect(() => cancelPreview, []);

  const expandMonth = (mi: number) => {
    setExpandedMonth(mi);
    const midP = periods[mi * 3 + 1];
    cancelPreview();
    if (midP !== undefined) {
      setPreviewActive(midP); // move the blue highlight now
      previewTimerRef.current = setTimeout(() => {
        previewTimerRef.current = null;
        onSetActive(midP); // map catches up after the animation
      }, 320);
    }
  };

  useEffect(() => {
    if (!playing) return;

    const id = setInterval(() => {
      const current = activePeriodRef.current ?? periods[0];
      const idx = periods.indexOf(current);
      const nextIdx = (idx + 1) % periods.length;
      onSetActive(periods[nextIdx]);
    }, 500);

    return () => clearInterval(id);
  }, [playing, periods, onSetActive]);

  // Auto-expand month when active period changes (e.g. during playback or
  // when tapping a collapsed month). But NOT when clicking sub-period buttons
  // within the already-expanded month (those fire onClickPeriod, not onSetActive).
  const prevActivePeriodRef = useRef(activePeriod);
  useEffect(() => {
    if (activePeriod !== null && activePeriod !== prevActivePeriodRef.current) {
      const idx = periods.indexOf(activePeriod);
      if (idx >= 0) {
        const month = Math.floor(idx / 3);
        setExpandedMonth(month);
      }
    }
    prevActivePeriodRef.current = activePeriod;
  }, [activePeriod, periods]);

  const hasLocked = lockedPeriods.size > 0;

  // Does a month have any selected/locked periods?
  const monthLockState = (monthIdx: number) => {
    let locked = false;
    let active = false;
    for (let s = 0; s < 3; s++) {
      const p = periods[monthIdx * 3 + s];
      if (p === undefined) continue;
      if (lockedPeriods.has(p)) locked = true;
      if (p === effectiveActive) active = true;
    }
    return { locked, active };
  };

  const monthAllLocked = (monthIdx: number) => {
    for (let s = 0; s < 3; s++) {
      const p = periods[monthIdx * 3 + s];
      if (p !== undefined && !lockedPeriods.has(p)) return false;
    }
    return true;
  };

  const monthHasLoading = (monthIdx: number) => {
    for (let s = 0; s < 3; s++) {
      const p = periods[monthIdx * 3 + s];
      if (p !== undefined && loadingPeriods.has(p)) return true;
    }
    return false;
  };

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Desktop: play inline; mobile gets its own row below so months span full width */}
        <button
          onClick={onTogglePlay}
          className="hidden md:flex shrink-0 w-7 h-7 items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
          title={playing ? "Stop" : "Play"}
          aria-label={playing ? "Stop" : "Play"}
        >
          {playing ? (
            <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-gray-600 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* ── Mobile: month grid with expandable sub-periods ──
            Each month is a STABLE element (never remounts on expand/collapse)
            so the width (flex-grow) animates and the collapsed bar crossfades
            with the expanded E/M/L group. */}
        <div className="flex md:hidden flex-col flex-1 min-w-0 gap-0">
          <div className="flex items-stretch gap-px">
            {MONTHS.map((m, mi) => {
              const isExpanded = expandedMonth === mi;
              const { locked: monthLocked, active: monthActive } = monthLockState(mi);
              const isMonthLoading = monthHasLoading(mi);
              const expand = () => expandMonth(mi);

              return (
                <div
                  key={m}
                  className={`flex flex-col gap-px min-w-0 transition-[flex-grow] duration-300 ease-out ${isExpanded ? "flex-[3]" : "flex-1"}`}
                >
                  <div className="relative h-8">
                    {/* Collapsed bar */}
                    <button
                      type="button"
                      onClick={expand}
                      tabIndex={isExpanded ? -1 : 0}
                      aria-hidden={isExpanded}
                      title={m}
                      className={`absolute inset-0 rounded-sm transition-opacity duration-200 ease-out
                        ${isExpanded ? "opacity-0 pointer-events-none" : "opacity-100"}
                        ${isExpanded
                          ? "bg-gray-200"
                          : monthLocked
                            ? "bg-blue-700 shadow-sm ring-2 ring-inset ring-white/60"
                            : monthActive
                              ? "bg-blue-500 shadow-sm"
                              : "bg-gray-200 active:bg-blue-200"}
                        ${isMonthLoading && !isExpanded ? "animate-pulse" : ""}`}
                    >
                      {monthLocked && (
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">✓</span>
                      )}
                    </button>

                    {/* Expanded E / M / L */}
                    <div
                      aria-hidden={!isExpanded}
                      className={`absolute inset-0 flex gap-1 transition-opacity duration-200 ease-out
                        ${isExpanded ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                    >
                      {[0, 1, 2].map((s) => {
                        const p = periods[mi * 3 + s];
                        if (p === undefined) return null;
                        const isLocked = lockedPeriods.has(p);
                        const isActive = p === effectiveActive;
                        const isLoading = loadingPeriods.has(p);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => { cancelPreview(); setPreviewActive(p); onClickPeriod(p); }}
                            tabIndex={isExpanded ? 0 : -1}
                            title={periodToLabel(p, periodLabels)}
                            className={`flex-1 min-w-[14px] h-8 rounded border text-[11px] font-semibold transition-colors duration-150 relative
                              ${isLocked
                                ? "bg-blue-700 text-white border-blue-700 shadow-sm"
                                : isActive
                                  ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                                  : "bg-white text-gray-600 border-gray-300 active:bg-blue-100"}
                              ${isLoading ? "animate-pulse" : ""}`}
                          >
                            {PERIOD_POS[s]}
                            {isLocked && (
                              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-700 ring-1 ring-white text-[8px] leading-3 text-white">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Label: tap to expand (collapsed) or lock/unlock the whole month (expanded) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isExpanded) { expand(); return; }
                      cancelPreview();
                      const monthPeriods = [0, 1, 2]
                        .map((s) => periods[mi * 3 + s])
                        .filter((p): p is number => p !== undefined);
                      onToggleMonth(monthPeriods);
                    }}
                    title={isExpanded ? `Lock/unlock all of ${m}` : m}
                    className={`text-center text-[9px] leading-tight tracking-tight py-0.5 -my-0.5 transition-colors duration-200
                      ${isExpanded
                        ? "text-blue-600 font-semibold active:text-blue-800"
                        : monthLocked
                          ? "text-blue-700 font-semibold"
                          : "text-gray-500"}`}
                  >
                    {m}{isExpanded && monthLocked && monthAllLocked(mi) ? " ✓" : ""}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Desktop: segment grid (unchanged) ── */}
        <div className="relative flex-1 min-w-0 hidden md:block">
          <div className="flex h-7 items-stretch">
            {periods.map((p, i) => {
              const isLocked = lockedPeriods.has(p);
              const isActive = p === activePeriod;
              const isLoading = loadingPeriods.has(p);
              const isMonthStart = i > 0 && i % 3 === 0;
              return (
                <button
                  key={p}
                  onClick={() => { onClickPeriod(p); }}
                  title={periodToLabel(p, periodLabels)}
                  className={`
                    flex-1 rounded-sm transition-all duration-150 cursor-pointer relative
                    ${isMonthStart ? "ml-1.5" : "ml-px"}
                    ${isLocked
                      ? "bg-blue-700 shadow-sm"
                      : isActive
                        ? "bg-blue-500 shadow-sm"
                        : "bg-gray-200 hover:bg-blue-300"
                    }
                    ${isLoading ? "animate-pulse" : ""}
                  `}
                >
                  {isLocked && !isLoading && (
                    <div className="absolute inset-x-0 bottom-0.5 flex justify-center">
                      <div className="w-1 h-1 rounded-full bg-white/80" />
                    </div>
                  )}
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/90 animate-ping" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="absolute left-0 right-0 top-full mt-0.5 flex pointer-events-none select-none">
            {MONTHS.map((m) => (
              <div key={m} className="flex-1 text-center text-[9px] text-gray-400">
                {m}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={hasLocked ? onClearLocked : onLockAll}
          className="shrink-0 ml-1 w-7 h-7 hidden md:flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
          title={hasLocked ? "Clear all locked periods" : "Select all periods"}
          aria-label={hasLocked ? "Clear all locked periods" : "Select all periods"}
        >
          {hasLocked ? <ClearIcon /> : <SelectAllIcon />}
        </button>
      </div>
    </div>
  );
}

function ClearIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SelectAllIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
