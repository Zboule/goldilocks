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
  loadingPeriods,
}: Props) {
  const activePeriodRef = useRef(activePeriod);
  activePeriodRef.current = activePeriod;

  // Mobile: which month is expanded — managed as explicit state
  // so locking doesn't collapse it
  const [expandedMonth, setExpandedMonth] = useState<number>(0);

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

  const label =
    selectedPeriods.length === 1
      ? periodToLabel(selectedPeriods[0], periodLabels)
      : `${selectedPeriods.length} periods`;

  // Does a month have any selected/locked periods?
  const monthHasSelection = (monthIdx: number) => {
    for (let s = 0; s < 3; s++) {
      const p = periods[monthIdx * 3 + s];
      if (p !== undefined && (lockedPeriods.has(p) || p === activePeriod)) return true;
    }
    return false;
  };

  const monthHasLoading = (monthIdx: number) => {
    for (let s = 0; s < 3; s++) {
      const p = periods[monthIdx * 3 + s];
      if (p !== undefined && loadingPeriods.has(p)) return true;
    }
    return false;
  };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {/* Desktop only: play button inline */}
      <button
        onClick={onTogglePlay}
        className="hidden md:flex shrink-0 w-7 h-7 items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
        title={playing ? "Stop" : "Play"}
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

      {/* ── Mobile: month grid with expandable sub-periods ── */}
      <div className="flex md:hidden flex-col flex-1 min-w-0 gap-0">
        <div className="flex items-stretch gap-px">
          {MONTHS.map((m, mi) => {
            const isExpanded = expandedMonth === mi;
            const hasSelection = monthHasSelection(mi);

            if (isExpanded) {
              // Show 3 sub-period buttons for this month — visually distinct
              return (
                <div key={m} className="flex flex-col flex-[3] gap-px">
                  <div className="flex gap-px p-px rounded bg-gray-300/50">
                    {[0, 1, 2].map((s) => {
                      const pIdx = mi * 3 + s;
                      const p = periods[pIdx];
                      if (p === undefined) return null;
                      const isLocked = lockedPeriods.has(p);
                      const isActive = p === activePeriod;
                      const isLoading = loadingPeriods.has(p);
                      return (
                        <button
                          key={p}
                          onClick={() => { onClickPeriod(p); }}
                          title={periodToLabel(p, periodLabels)}
                          className={`
                            flex-1 h-6 rounded text-[9px] font-semibold transition-all duration-150 relative
                            ${isLocked
                              ? "bg-blue-700 text-white shadow-sm"
                              : isActive
                                ? "bg-blue-500 text-white shadow-sm"
                                : "bg-white text-gray-500 hover:bg-blue-100"
                            }
                            ${isLoading ? "animate-pulse" : ""}
                          `}
                        >
                          {PERIOD_POS[s]}
                          {isLocked && !isLoading && (
                            <div className="absolute inset-x-0 bottom-0 flex justify-center">
                              <div className="w-1 h-1 rounded-full bg-white/80" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-center text-[8px] text-blue-500 font-semibold leading-tight">
                    {m}
                  </div>
                </div>
              );
            }

            // Collapsed month: one tappable cell
            const isMonthLoading = monthHasLoading(mi);
            return (
              <div key={m} className="flex flex-col flex-1 gap-px">
                <button
                  onClick={() => {
                    setExpandedMonth(mi);
                    const midP = periods[mi * 3 + 1];
                    if (midP !== undefined) {
                      onSetActive(midP);
                    }
                  }}
                  className={`
                    h-7 rounded-sm transition-all duration-150 relative
                    ${hasSelection
                      ? "bg-blue-500 shadow-sm"
                      : "bg-gray-200 hover:bg-blue-200"
                    }
                    ${isMonthLoading ? "animate-pulse" : ""}
                  `}
                  title={m}
                >
                  {/* Show dot for months with locked periods */}
                  {(() => {
                    const hasLock = [0, 1, 2].some((s) => {
                      const p = periods[mi * 3 + s];
                      return p !== undefined && lockedPeriods.has(p);
                    });
                    if (hasLock) {
                      return (
                        <div className="absolute inset-x-0 bottom-0.5 flex justify-center">
                          <div className="w-1 h-1 rounded-full bg-white/80" />
                        </div>
                      );
                    }
                    return null;
                  })()}
                </button>
                <div className="text-center text-[8px] text-gray-400 leading-tight">
                  {m}
                </div>
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
        className="shrink-0 ml-1 w-8 h-8 md:w-7 md:h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
        title={hasLocked ? "Clear all locked periods" : "Select all periods"}
      >
        {hasLocked ? (
          <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        )}
      </button>
    </div>
  );
}
