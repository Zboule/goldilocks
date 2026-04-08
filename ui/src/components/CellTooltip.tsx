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

  const left = Math.min(x + 12, window.innerWidth - 300);
  const top = Math.min(y + 12, window.innerHeight - 400);

  return (
    <div
      className="fixed z-50 pointer-events-none bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 px-3 py-2 text-xs max-w-[280px]"
      style={{ left, top }}
    >
      <div className="font-medium text-gray-700 mb-1.5">
        {formatLat(lat)}, {formatLon(lon)}
      </div>

      {data.map((varData) => (
        <div key={varData.variable} className="mb-1.5">
          <div className="font-medium text-gray-600">
            {varData.label}{" "}
            <span className="text-gray-400 font-normal">({varData.units})</span>
          </div>
          <div className="grid grid-cols-6 gap-x-1 mt-0.5">
            {STAT_ORDER.map((stat) => {
              const filterKey = `${varData.variable}/${stat}`;
              const filter = filterMap.get(filterKey);
              let cellClass = "text-gray-500";
              if (filter) {
                cellClass = filter.passes
                  ? "text-green-600 font-semibold"
                  : "text-red-400";
              }
              return (
                <div key={stat} className="text-center">
                  <div className="text-[10px] text-gray-400">
                    {STAT_LABELS[stat]}
                  </div>
                  <div className={`tabular-nums ${cellClass}`}>
                    {formatValue(varData.stats[stat])}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
