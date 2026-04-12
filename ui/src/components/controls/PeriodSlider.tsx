import { useState, useEffect, useRef } from "react";
import { periodToLabel } from "../../lib/gridGeometry";

interface Props {
  selectedPeriods: number[];
  lockedPeriods: Set<number>;
  activePeriod: number | null;
  periods: number[];
  periodLabels: string[];
  onClickPeriod: (p: number) => void;
  onSetActive: (p: number) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PeriodSlider({
  selectedPeriods,
  lockedPeriods,
  activePeriod,
  periods,
  periodLabels,
  onClickPeriod,
  onSetActive,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const activePeriodRef = useRef(activePeriod);
  activePeriodRef.current = activePeriod;

  useEffect(() => {
    if (!playing) return;

    const id = setInterval(() => {
      const current = activePeriodRef.current ?? periods[0];
      const idx = periods.indexOf(current);
      const nextIdx = (idx + 1) % periods.length;
      onSetActive(periods[nextIdx]);
    }, 500);

    return () => clearInterval(id);
  }, [playing, periods, onClickPeriod]);

  const label =
    selectedPeriods.length === 1
      ? periodToLabel(selectedPeriods[0], periodLabels)
      : `${selectedPeriods.length} periods`;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <button
        onClick={() => setPlaying((p) => !p)}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
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

      <div className="relative flex-1 min-w-0">
        <div className="flex h-7 items-stretch">
          {periods.map((p, i) => {
            const isLocked = lockedPeriods.has(p);
            const isActive = p === activePeriod;
            const isSelected = isLocked || isActive;
            const isMonthStart = i > 0 && i % 3 === 0;
            return (
              <button
                key={p}
                onClick={() => { setPlaying(false); onClickPeriod(p); }}
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
                `}
              >
                {isLocked && (
                  <div className="absolute inset-x-0 bottom-0.5 flex justify-center">
                    <div className="w-1 h-1 rounded-full bg-white/80" />
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

      <span className="w-16 text-left text-xs text-gray-600 shrink-0 whitespace-nowrap font-medium ml-1">
        {label}
      </span>
    </div>
  );
}
