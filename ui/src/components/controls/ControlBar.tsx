import type { Manifest } from "../../types";
import DisplaySelector from "./DisplaySelector";
import PeriodSlider from "./PeriodSlider";

interface Props {
  manifest: Manifest;
  displayVariable: string;
  displayStat: string;
  period: number;
  filterCount: number;
  onDisplayVariableChange: (v: string) => void;
  onDisplayStatChange: (s: string) => void;
  onPeriodChange: (p: number) => void;
  onToggleFilters: () => void;
}

export default function ControlBar({
  manifest,
  displayVariable,
  displayStat,
  period,
  filterCount,
  onDisplayVariableChange,
  onDisplayStatChange,
  onPeriodChange,
  onToggleFilters,
}: Props) {
  return (
    <div className="shrink-0 bg-white border-b border-gray-200 px-4 pt-4 pb-5 flex items-center gap-4 z-10">
      <button
        onClick={onToggleFilters}
        className="shrink-0 flex items-center gap-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 px-2.5 py-1 text-sm transition-colors"
        title="Toggle filters"
      >
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        Filters
        {filterCount > 0 && (
          <span className="rounded-full bg-blue-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center leading-none">
            {filterCount}
          </span>
        )}
      </button>

      <div className="h-5 w-px bg-gray-300" />

      <DisplaySelector
        variable={displayVariable}
        stat={displayStat}
        manifest={manifest}
        onVariableChange={onDisplayVariableChange}
        onStatChange={onDisplayStatChange}
      />

      <div className="h-5 w-px bg-gray-300" />

      <PeriodSlider
        period={period}
        periods={manifest.periods}
        periodLabels={manifest.period_labels}
        onChange={onPeriodChange}
      />
    </div>
  );
}
