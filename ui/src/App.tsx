import { useState, useEffect, useRef, useCallback, useDeferredValue } from "react";
import { useManifest } from "./hooks/useManifest";
import { useFilters } from "./hooks/useFilters";
import { usePeriodSelection } from "./hooks/usePeriodSelection";
import { useStaticGrid } from "./hooks/useStaticGrid";
import { useColorBuffer } from "./hooks/useColorBuffer";
import { usePreloadPeriods } from "./hooks/usePreloadPeriod";
import { useHoveredCell } from "./hooks/useHoveredCell";
import { setManifest } from "./lib/tileCache";
import { FIXED_DISPLAY_RANGE, YSTD_DISPLAY_MAX } from "./lib/colorScale";
import { useInflightPeriods } from "./hooks/useInflightPeriods";
import { useIsMobile } from "./hooks/useIsMobile";

import ControlBar from "./components/controls/ControlBar";
import FilterSidebar from "./components/controls/FilterSidebar";
import MapView, { type MapViewHandle } from "./components/MapView";
import CellTooltip from "./components/CellTooltip";
import ColorLegend from "./components/ColorLegend";

export default function App() {
  const { manifest, loading: manifestLoading } = useManifest();
  const mapRef = useRef<MapViewHandle>(null);

  const [displayVariable, setDisplayVariable] = useState("utci_day");
  const [displayStat, setDisplayStat] = useState("mean");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);

  const {
    lockedPeriods,
    activePeriod,
    selectedPeriods,
    clickPeriod,
    setActive,
    init: initPeriod,
    lockAll,
    clearLocked,
    clearActive,
    toggleGroup,
  } = usePeriodSelection();

  useEffect(() => {
    if (manifest) {
      setManifest(manifest);
      if (manifest.periods.length > 0) {
        initPeriod(manifest.periods[0]);
      }
      const vars = manifest.variable_order ?? Object.keys(manifest.variables);
      setDisplayVariable((prev) => (prev && manifest.variables[prev] ? prev : vars[0]));
    }
  }, [manifest, initPeriod]);

  const { filters, addFilter, removeFilter, updateFilter, clearFilters, loadPreset } =
    useFilters();

  const staticCells = useStaticGrid(manifest);
  const inflightPeriods = useInflightPeriods();

  // Deferred: a burst of period/filter taps coalesces into fewer 384K-cell
  // color rebuilds, keeping the controls responsive.
  const deferredFilters = useDeferredValue(filters);
  const deferredPeriods = useDeferredValue(selectedPeriods);
  const { colors, version, loading: colorsLoading } = useColorBuffer(
    manifest,
    staticCells,
    displayVariable,
    displayStat,
    deferredFilters,
    deferredPeriods,
  );

  useEffect(() => {
    if (mapReady && mapRef.current && staticCells) {
      mapRef.current.setPolygons(staticCells);
    }
  }, [mapReady, staticCells]);

  useEffect(() => {
    if (mapRef.current && colors && staticCells) {
      mapRef.current.updateColors(colors, version);
    }
  }, [colors, version, staticCells]);

  usePreloadPeriods(selectedPeriods, manifest, displayVariable, displayStat, filters);

  const { hoveredCell, onCellHover } = useHoveredCell(
    manifest,
    selectedPeriods,
    displayVariable,
    filters,
  );

  const isMobile = useIsMobile();
  const [pinnedCell, setPinnedCell] = useState<typeof hoveredCell>(null);
  const [pendingPin, setPendingPin] = useState<number | null>(null);

  const closeCell = useCallback(() => {
    setPinnedCell(null);
    setPendingPin(null);
    onCellHover(null);
  }, [onCellHover]);

  // Click handler gets the actually-clicked cell (picked in MapView), so
  // pinning never depends on a stale React hover value.
  const handleMapClick = useCallback(
    (info: { index: number; x: number; y: number } | null) => {
      if (!info) { closeCell(); return; }
      if (pinnedCell && pinnedCell.index === info.index) { closeCell(); return; }
      // Resolve the cell's data, then pin it via the effect below.
      onCellHover(info);
      setPendingPin(info.index);
    },
    [pinnedCell, onCellHover, closeCell],
  );

  // Pin as soon as the resolving cell matches the pending tap (even while its
  // data is still loading — the card shows a skeleton, then fills in).
  useEffect(() => {
    if (pendingPin !== null && hoveredCell && hoveredCell.index === pendingPin) {
      setPinnedCell(hoveredCell);
      setPendingPin(null);
    }
  }, [hoveredCell, pendingPin]);

  // Keep the pinned card's data fresh while it resolves.
  useEffect(() => {
    if (
      pinnedCell?.loading &&
      hoveredCell &&
      hoveredCell.index === pinnedCell.index &&
      !hoveredCell.loading
    ) {
      setPinnedCell(hoveredCell);
    }
  }, [hoveredCell, pinnedCell]);

  // Outline the pinned cell on the map so the card stays anchored to a place.
  useEffect(() => {
    mapRef.current?.setPinnedIndex(pinnedCell?.index ?? null);
  }, [pinnedCell]);

  const handleUnpin = useCallback(() => closeCell(), [closeCell]);

  // Desktop follows the hover; mobile only shows a card on an explicit tap
  // (no hover), so it's always pinned → captures touches (no zoom passthrough).
  const displayedCell = pinnedCell ?? (isMobile ? null : hoveredCell);

  if (manifestLoading || !manifest || selectedPeriods.length === 0 || !displayVariable) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading...
      </div>
    );
  }

  const varInfo = manifest.variables[displayVariable];
  if (!varInfo) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Unknown variable: {displayVariable}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <ControlBar
        manifest={manifest}
        displayVariable={displayVariable}
        displayStat={displayStat}
        selectedPeriods={selectedPeriods}
        lockedPeriods={lockedPeriods}
        activePeriod={activePeriod}
        filterCount={filters.length}
        onDisplayVariableChange={setDisplayVariable}
        onDisplayStatChange={setDisplayStat}
        onClickPeriod={clickPeriod}
        onSetActivePeriod={setActive}
        onLockAll={() => lockAll(manifest.periods)}
        onClearLocked={clearLocked}
        onClearActive={clearActive}
        onToggleMonth={toggleGroup}
        loadingPeriods={inflightPeriods}
        onToggleFilters={() => setSidebarOpen((v) => !v)}
      />

      <div className="flex flex-1 min-h-0">
        <FilterSidebar
          open={sidebarOpen}
          manifest={manifest}
          filters={filters}
          onAdd={addFilter}
          onRemove={removeFilter}
          onUpdate={updateFilter}
          onClear={clearFilters}
          onLoadPreset={loadPreset}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 relative min-w-0">
          <MapView
            ref={mapRef}
            onHover={onCellHover}
            onClick={handleMapClick}
            onReady={() => setMapReady(true)}
          />

          <CellTooltip
            hoveredCell={displayedCell}
            manifest={manifest}
            displayVariable={displayVariable}
            displayStat={displayStat}
            pinned={!!pinnedCell}
            onUnpin={handleUnpin}
            onDismiss={closeCell}
          />

          <ColorLegend
            variable={displayVariable}
            stat={displayStat}
            min={displayStat === "ystd" ? 0 : (FIXED_DISPLAY_RANGE[displayVariable]?.[0] ?? varInfo.display_min)}
            max={displayStat === "ystd" ? (YSTD_DISPLAY_MAX[displayVariable] ?? 5) : (FIXED_DISPLAY_RANGE[displayVariable]?.[1] ?? varInfo.display_max)}
            units={varInfo.units}
            filterCount={filters.length}
            categorical={varInfo.categorical}
            onExpandChange={setLegendExpanded}
          />

          {colorsLoading && (
            <div className="loading-pill absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded bg-black/60 px-3 py-1 text-sm text-white">
              Loading...
            </div>
          )}

          {/* Mobile: floating filters button, thumb-reachable over the map */}
          {!sidebarOpen && !legendExpanded && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-3 z-20 flex items-center gap-1.5 rounded-full bg-white shadow-lg border border-gray-200 pl-3 pr-3.5 h-11 text-sm font-medium text-gray-700 active:bg-gray-50"
              aria-label="Open filters"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              Filters
              {filters.length > 0 && (
                <span className="rounded-full bg-blue-500 text-white text-[10px] font-bold min-w-4 h-4 px-1 flex items-center justify-center leading-none">
                  {filters.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
