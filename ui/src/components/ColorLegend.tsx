import { getGradientCSS, SAFETY_COLORS } from "../lib/colorScale";

interface Props {
  variable: string;
  stat?: string;
  min: number;
  max: number;
  units: string;
  filterCount: number;
  categorical?: boolean;
}

const SAFETY_LABELS: [number, string][] = [
  [1, "Normal"],
  [2, "Caution"],
  [3, "Reconsider"],
  [4, "Do Not Travel"],
];

export default function ColorLegend({ variable, stat, min, max, units, filterCount, categorical }: Props) {
  if (categorical) {
    return (
      <div className="absolute bottom-4 left-2 md:left-4 z-10 rounded-lg bg-white/70 backdrop-blur-sm px-2.5 md:px-3 py-1.5 shadow-md max-w-[calc(100vw-1rem)]">
        <div className="flex items-center gap-1 md:gap-1.5">
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
            <span className="text-[10px] text-gray-400 shrink-0 hidden sm:inline ml-1">
              · {filterCount} filter{filterCount > 1 ? "s" : ""} (gray = excluded)
            </span>
          )}
        </div>
      </div>
    );
  }

  const gradient = getGradientCSS(variable, min, max, 20, stat);

  return (
    <div className="absolute bottom-4 left-2 md:left-4 z-10 rounded-lg bg-white/70 backdrop-blur-sm px-2.5 md:px-3 py-1.5 shadow-md max-w-[calc(100vw-1rem)]">
      <div className="flex items-center gap-1.5 md:gap-2">
        <span className="text-[10px] md:text-xs text-gray-500 shrink-0">
          {units}
        </span>
        <span className="text-[10px] md:text-xs font-mono text-gray-500 shrink-0">
          {min.toFixed(min < 10 ? 1 : 0)}
        </span>
        <div
          className="h-2.5 md:h-3 w-28 md:w-44 rounded shrink-0"
          style={{ background: gradient }}
        />
        <span className="text-[10px] md:text-xs font-mono text-gray-500 shrink-0">
          {max.toFixed(max < 10 ? 1 : 0)}
        </span>
        {filterCount > 0 && (
          <span className="text-[10px] text-gray-400 shrink-0 hidden sm:inline">
            · {filterCount} filter{filterCount > 1 ? "s" : ""} (gray = excluded)
          </span>
        )}
      </div>
    </div>
  );
}
