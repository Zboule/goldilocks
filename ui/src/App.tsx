import { useState, useEffect, useRef, useCallback } from "react";
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

  const {
    lockedPeriods,
    activePeriod,
    selectedPeriods,
    clickPeriod,
    setActive,
    init: initPeriod,
    lockAll,
    clearLocked,
  } = usePeriodSelection();

  useEffect(() => {
    if (manifest) {
      setManifest(manifest);
      if (manifest.periods.length > 0) {
        initPeriod(manifest.periods[0]);
      }
    }
  }, [manifest, initPeriod]);

  const { filters, addFilter, removeFilter, updateFilter, clearFilters, loadPreset } =
    useFilters();

  const staticCells = useStaticGrid(manifest);
  const inflightPeriods = useInflightPeriods();

  const { colors, version, loading: colorsLoading } = useColorBuffer(
    manifest,
    staticCells,
    displayVariable,
    displayStat,
    filters,
    selectedPeriods,
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

  const [pinnedCell, setPinnedCell] = useState<typeof hoveredCell>(null);

  const handleMapClick = useCallback(() => {
    if (pinnedCell) {
      setPinnedCell(null);
    } else if (hoveredCell && !hoveredCell.loading) {
      setPinnedCell(hoveredCell);
    }
  }, [pinnedCell, hoveredCell]);

  const handleUnpin = useCallback(() => setPinnedCell(null), []);

  const displayedCell = pinnedCell ?? hoveredCell;

  if (manifestLoading || !manifest || selectedPeriods.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading...
      </div>
    );
  }

  const varInfo = manifest.variables[displayVariable];

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden">
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
            pinned={!!pinnedCell}
            onPin={handleMapClick}
            onUnpin={handleUnpin}
          />

          <ColorLegend
            variable={displayVariable}
            stat={displayStat}
            min={displayStat === "ystd" ? 0 : (FIXED_DISPLAY_RANGE[displayVariable]?.[0] ?? varInfo.display_min)}
            max={displayStat === "ystd" ? (YSTD_DISPLAY_MAX[displayVariable] ?? 5) : (FIXED_DISPLAY_RANGE[displayVariable]?.[1] ?? varInfo.display_max)}
            units={varInfo.units}
            filterCount={filters.length}
            categorical={varInfo.categorical}
          />

          {colorsLoading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded bg-black/60 px-3 py-1 text-sm text-white">
              Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
