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
  onLockAll: () => void;
  onClearLocked: () => void;
  onClearActive: () => void;
  onToggleMonth: (periods: number[]) => void;
  onToggleFilters: () => void;
  loadingPeriods: Set<number>;
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5 text-gray-600 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
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
  onLockAll,
  onClearLocked,
  onClearActive,
  onToggleMonth,
  onToggleFilters,
  loadingPeriods,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const hasLocked = lockedPeriods.size > 0;

  const togglePlay = () => {
    // Stopping playback: drop the animation's landing period so it doesn't
    // silently pollute a locked selection.
    if (playing) onClearActive();
    setPlaying(!playing);
  };

  return (
    <div className="shrink-0 bg-white border-b border-gray-200 px-2 md:px-4 py-1.5 md:py-0 md:pt-4 md:pb-5">
      {/* Mobile: 2 rows (controls / months). Desktop: single row. */}
      <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-4">
        {/* Row 1: logo (desktop) + filters (desktop) + layer/stat + play + select-all (mobile) */}
        <div className="flex items-center gap-1.5 md:gap-4 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}goldilocks.svg`}
            alt="Goldilocks"
            className="hidden md:block h-8 w-8 shrink-0"
          />

          <div className="hidden md:block h-5 w-px bg-gray-300" />

          {/* Filters toggle lives in the header on desktop; on mobile it's a
              floating button over the map (see App.tsx). */}
          <button
            onClick={onToggleFilters}
            className="hidden md:flex shrink-0 items-center gap-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 px-2.5 py-1 text-sm transition-colors"
            title="Toggle filters"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span>Filters</span>
            {filterCount > 0 && (
              <span className="rounded-full bg-blue-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center leading-none">
                {filterCount}
              </span>
            )}
          </button>

          <div className="hidden md:block h-5 w-px bg-gray-300" />

          <DisplaySelector
            variable={displayVariable}
            stat={displayStat}
            manifest={manifest}
            onVariableChange={onDisplayVariableChange}
            onStatChange={onDisplayStatChange}
          />

          {/* Mobile: one contextual button. Play when nothing's locked, Pause
              while playing, Clear (with count) when periods are locked — we
              don't offer Play during a multi-period selection. */}
          {(() => {
            const mode = playing ? "pause" : hasLocked ? "clear" : "play";
            return (
              <button
                onClick={mode === "clear" ? onClearLocked : togglePlay}
                className="md:hidden relative flex shrink-0 w-9 h-9 items-center justify-center rounded border border-gray-300 bg-white active:bg-gray-100 transition-colors"
                title={mode === "pause" ? "Pause" : mode === "clear" ? "Clear selected periods" : "Play"}
                aria-label={mode === "pause" ? "Pause" : mode === "clear" ? "Clear selected periods" : "Play"}
              >
                {mode === "clear" ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span className="absolute -top-1 -right-1 rounded-full bg-blue-600 text-white text-[9px] font-bold min-w-4 h-4 px-1 flex items-center justify-center leading-none">
                      {lockedPeriods.size}
                    </span>
                  </>
                ) : (
                  <PlayIcon playing={mode === "pause"} />
                )}
              </button>
            );
          })()}
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
            onTogglePlay={togglePlay}
            onClickPeriod={(p) => { setPlaying(false); onClickPeriod(p); }}
            onSetActive={onSetActivePeriod}
            onLockAll={onLockAll}
            onClearLocked={onClearLocked}
            onToggleMonth={onToggleMonth}
            loadingPeriods={loadingPeriods}
          />
        </div>
      </div>
    </div>
  );
}
