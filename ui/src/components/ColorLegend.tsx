import { useState } from "react";
import { getGradientCSS, getColor, SAFETY_COLORS } from "../lib/colorScale";
import { VARIABLE_DETAILS } from "../lib/variableMetadata";

interface Props {
  variable: string;
  stat?: string;
  min: number;
  max: number;
  units: string;
  filterCount: number;
  categorical?: boolean;
  /** Notifies the parent so overlapping chrome (filter FAB) can yield. */
  onExpandChange?: (expanded: boolean) => void;
}

/** Context line for stats whose expanded legend has no reference ranges. */
const STAT_NOTES: Record<string, string> = {
  ystd: "Year-to-year variability (σ) of this period's typical value. Lower = more consistent from one year to the next.",
  min: "Lowest value observed across all years (2013–2023) for the selected period(s).",
  max: "Highest value observed across all years for the selected period(s).",
  p10: "10th percentile — only 1 in 10 days falls below this.",
  p90: "90th percentile — the typical high end; 1 in 10 days exceeds it.",
};

const SAFETY_LABELS: [number, string][] = [
  [1, "Normal"],
  [2, "Caution"],
  [3, "Reconsider"],
  [4, "Do Not Travel"],
];

function fmt(v: number): string {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
}

export default function ColorLegend({ variable, stat, min, max, units, filterCount, categorical, onExpandChange }: Props) {
  const [expanded, setExpandedState] = useState(false);
  const setExpanded = (updater: (v: boolean) => boolean) => {
    setExpandedState((v) => {
      const next = updater(v);
      onExpandChange?.(next);
      return next;
    });
  };

  if (categorical) {
    return (
      <div className="absolute bottom-4 left-2 md:left-4 z-10 rounded-lg bg-white/80 backdrop-blur-sm px-2.5 md:px-3 py-1.5 shadow-md max-w-[calc(100vw-9rem)] md:max-w-[calc(100vw-1rem)] overflow-hidden">
        <div className="flex items-center gap-1 md:gap-1.5 flex-wrap">
          {SAFETY_LABELS.map(([level, label]) => {
            const c = SAFETY_COLORS[level];
            return (
              <div key={level} className="flex items-center gap-0.5 md:gap-1">
                <div
                  className="w-3 h-2.5 md:w-4 md:h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: `rgba(${c[0]},${c[1]},${c[2]},0.85)` }}
                />
                <span className="text-[9px] md:text-[10px] text-gray-600 shrink-0">{label}</span>
              </div>
            );
          })}
          {filterCount > 0 && (
            <span className="text-[9px] md:text-[10px] text-gray-400 shrink-0">
              <span className="inline-block w-2 h-2 rounded-sm bg-gray-300 align-middle mr-0.5" />= filtered out
            </span>
          )}
        </div>
      </div>
    );
  }

  const gradient = getGradientCSS(variable, min, max, 20, stat);
  const ranges = stat === "ystd" ? undefined : VARIABLE_DETAILS[variable]?.ranges;
  // 5 evenly spaced tick values across the display range
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));

  return (
    <div
      className={`absolute bottom-4 left-2 md:left-4 z-10 rounded-lg bg-white/85 backdrop-blur-sm shadow-md overflow-hidden
        ${expanded ? "max-w-[calc(100vw-1rem)] md:max-w-xs" : "max-w-[calc(100vw-9rem)] md:max-w-[calc(100vw-1rem)]"}`}
    >
      {/* Collapsed pill shows the mini gradient; expanded header is just a title
          + collapse chevron (the full graduated bar sits in the panel below). */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 w-full text-left active:bg-gray-50"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse legend" : "Expand legend"}
      >
        <span className="text-[10px] md:text-xs text-gray-500 shrink-0">{units}</span>
        {!expanded && (
          <>
            <span className="text-[10px] md:text-xs font-mono text-gray-500 shrink-0">{fmt(min)}</span>
            <div className="h-2.5 md:h-3 w-24 md:w-44 rounded shrink-0" style={{ background: gradient }} />
            <span className="text-[10px] md:text-xs font-mono text-gray-500 shrink-0">{fmt(max)}</span>
            {filterCount > 0 && (
              <span className="inline-block w-2 h-2 rounded-sm bg-gray-300 shrink-0" title="gray = filtered out" />
            )}
          </>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180 ml-auto" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {/* Expanded: graduated scale + reference ranges */}
      {expanded && (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-gray-100 max-h-[45dvh] overflow-y-auto overscroll-contain">
          <div className="h-3 w-full rounded" style={{ background: gradient }} />
          <div className="flex justify-between mt-0.5">
            {ticks.map((t, i) => (
              <span key={i} className="text-[9px] font-mono text-gray-500">
                {fmt(t)}
              </span>
            ))}
          </div>

          {ranges && ranges.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {ranges.map((r) => {
                const [cr, cg, cb] = getColor(variable, r.value, min, max, stat);
                return (
                  <div key={r.range} className="flex items-center gap-1.5 text-[10px]">
                    <span
                      className="w-3 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: `rgba(${cr},${cg},${cb},0.9)` }}
                    />
                    <span className="font-mono text-gray-500 w-16 shrink-0">{r.range}</span>
                    <span className="text-gray-600 truncate">{r.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {(!ranges || ranges.length === 0) && stat && STAT_NOTES[stat] && (
            <p className="mt-1.5 text-[10px] text-gray-500 leading-snug max-w-[260px]">
              {STAT_NOTES[stat]}
            </p>
          )}

          {filterCount > 0 && (
            <div className="mt-1.5 text-[10px] text-gray-400">
              <span className="inline-block w-2 h-2 rounded-sm bg-gray-300 align-middle mr-1" />
              gray = excluded by {filterCount} filter{filterCount > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
