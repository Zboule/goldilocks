import { getGradientCSS } from "../lib/colorScale";

interface Props {
  variable: string;
  min: number;
  max: number;
  units: string;
  filterCount: number;
}

export default function ColorLegend({ variable, min, max, units, filterCount }: Props) {
  const gradient = getGradientCSS(variable, min, max);

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
