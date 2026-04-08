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
    <div className="absolute bottom-6 left-4 z-10 rounded-lg bg-white/90 backdrop-blur-sm px-3 py-2 shadow-md">
      <div className="text-xs text-gray-500 mb-1">
        {units}
        {filterCount > 0 && (
          <span className="ml-2 text-gray-400">
            ({filterCount} filter{filterCount > 1 ? "s" : ""} active — gray = excluded)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono w-12 text-right">
          {min.toFixed(min < 10 ? 1 : 0)}
        </span>
        <div
          className="h-3 w-48 rounded"
          style={{ background: gradient }}
        />
        <span className="text-xs font-mono w-12">
          {max.toFixed(max < 10 ? 1 : 0)}
        </span>
      </div>
    </div>
  );
}
