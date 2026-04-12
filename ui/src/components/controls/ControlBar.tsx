import { useState } from "react";
import type { Manifest } from "../../types";
import DisplaySelector from "./DisplaySelector";
import PeriodSlider from "./PeriodSlider";

interface Props {
  manifest: Manifest;
  displayVariable: string;
  displayStat: string;
  selectedPeriods: number[];
  lockedPeriods: Set<number>;
  activePeriod: number | null;
  filterCount: number;
  onDisplayVariableChange: (v: string) => void;
  onDisplayStatChange: (s: string) => void;
  onClickPeriod: (p: number) => void;
  onSetActivePeriod: (p: number) => void;
  onToggleFilters: () => void;
}

export default function ControlBar({
  manifest,
  displayVariable,
  displayStat,
  selectedPeriods,
  lockedPeriods,
  activePeriod,
  filterCount,
  onDisplayVariableChange,
  onDisplayStatChange,
  onClickPeriod,
  onSetActivePeriod,
  onToggleFilters,
}: Props) {
  const [playing, setPlaying] = useState(false);

  const playButton = (
    <button
      onClick={() => setPlaying((p) => !p)}
      className="shrink-0 w-8 h-8 md:w-7 md:h-7 flex items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
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
  );

  return (
    <div className="shrink-0 bg-white border-b border-gray-200 px-3 md:px-4 py-2 md:py-0 md:pt-4 md:pb-5 z-10">
      {/* Desktop: single row | Mobile: two rows */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        {/* Row 1: Logo + Filters + spacer + Display selectors + spacer + Play (mobile) */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}goldilocks.svg`}
            alt="Goldilocks"
            className="h-7 w-7 md:h-8 md:w-8 shrink-0"
          />

          <div className="hidden md:block h-5 w-px bg-gray-300" />

          <button
            onClick={onToggleFilters}
            className="shrink-0 flex items-center gap-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 px-2.5 h-8 md:h-auto md:py-1 text-sm transition-colors"
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
            <span className="hidden sm:inline">Filters</span>
            {filterCount > 0 && (
              <span className="rounded-full bg-blue-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center leading-none">
                {filterCount}
              </span>
            )}
          </button>

          {/* Stretchable spacer before display selector (mobile only) */}
          <div className="flex-1 md:hidden" />

          <div className="hidden md:block h-5 w-px bg-gray-300" />

          <DisplaySelector
            variable={displayVariable}
            stat={displayStat}
            manifest={manifest}
            onVariableChange={onDisplayVariableChange}
            onStatChange={onDisplayStatChange}
          />

          {/* Stretchable spacer after display selector (mobile only) */}
          <div className="flex-1 md:hidden" />

          {/* Play button on mobile — on the right */}
          <div className="md:hidden">
            {playButton}
          </div>
        </div>

        {/* Row 2 on mobile / continuation on desktop: Period slider */}
        <div className="hidden md:block h-5 w-px bg-gray-300" />

        <div className="flex-1 min-w-0">
          <PeriodSlider
            selectedPeriods={selectedPeriods}
            lockedPeriods={lockedPeriods}
            activePeriod={activePeriod}
            periods={manifest.periods}
            periodLabels={manifest.period_labels}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onClickPeriod={onClickPeriod}
            onSetActive={onSetActivePeriod}
          />
        </div>
      </div>
    </div>
  );
}
