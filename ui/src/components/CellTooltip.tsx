import { useRef, useState, useLayoutEffect, Fragment } from "react";
import type { HoveredCell } from "../types";
import { formatLat, formatLon } from "../lib/gridGeometry";

interface Props {
  hoveredCell: HoveredCell | null;
}

const STAT_ORDER = ["min", "p10", "mean", "median", "p90", "max"];
const STAT_LABELS: Record<string, string> = {
  mean: "Mean",
  median: "Med",
  min: "Min",
  max: "Max",
  p10: "P10",
  p90: "P90",
};

function formatValue(v: number | null, decimals = 1): string {
  if (v === null) return "—";
  return v.toFixed(decimals);
}

export default function CellTooltip({ hoveredCell }: Props) {
  if (!hoveredCell) return null;

  const { x, y, lon, lat, data, filterResults } = hoveredCell;

  const filterMap = new Map<string, { passes: boolean; label: string }>();
  for (const r of filterResults) {
    filterMap.set(`${r.variable}/${r.stat}`, { passes: r.passes, label: r.label });
  }

  const visibleData = data.filter((d) =>
    STAT_ORDER.some((s) => d.stats[s] !== null && d.stats[s] !== undefined),
  );
  if (visibleData.length === 0) return null;

  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 100 });

  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      if (Math.abs(rect.width - size.w) > 1 || Math.abs(rect.height - size.h) > 1) {
        setSize({ w: rect.width, h: rect.height });
      }
    }
  });

  const offset = 14;
  const fitsRight = x + offset + size.w < window.innerWidth;
  const fitsBelow = y + offset + size.h < window.innerHeight;

  const left = fitsRight ? x + offset : x - offset - size.w;
  const top = fitsBelow ? y + offset : y - offset - size.h;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 pointer-events-none bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 px-3 py-2 text-xs"
      style={{ left, top }}
    >
      <div className="font-medium text-gray-700 mb-1.5">
        {formatLat(lat)}, {formatLon(lon)}
      </div>

      {/* Single grid for header + all rows */}
      <div
        className="grid gap-x-2 gap-y-0.5 items-center"
        style={{ gridTemplateColumns: "auto repeat(6, 40px)" }}
      >
        {/* Header row */}
        <div />
        {STAT_ORDER.map((s) => (
          <div key={s} className="text-center text-[10px] text-gray-400">
            {STAT_LABELS[s]}
          </div>
        ))}

        {/* Data rows */}
        {visibleData.map((varData) => (
          <Fragment key={varData.variable}>
            <div className="text-gray-600 font-medium pr-1 whitespace-nowrap">
              {varData.label}
              <span className="text-gray-400 font-normal text-[10px] ml-0.5">
                {varData.units}
              </span>
            </div>
            {STAT_ORDER.map((stat) => {
              const value = varData.stats[stat];
              const filterKey = `${varData.variable}/${stat}`;
              const filter = filterMap.get(filterKey);
              let cellClass = "text-gray-500";
              if (filter) {
                cellClass = filter.passes
                  ? "text-green-600 font-semibold"
                  : "text-red-400";
              }
              return (
                <div
                  key={`${varData.variable}-${stat}`}
                  className={`text-center tabular-nums ${value === null || value === undefined ? "text-gray-300" : cellClass}`}
                >
                  {formatValue(value ?? null)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
