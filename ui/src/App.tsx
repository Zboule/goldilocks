import { useState, useEffect, useCallback, useRef } from "react";
import { useManifest } from "./hooks/useManifest";
import { useFilters } from "./hooks/useFilters";
import { useStaticGrid } from "./hooks/useStaticGrid";
import { useColorBuffer } from "./hooks/useColorBuffer";
import { usePreloadPeriod } from "./hooks/usePreloadPeriod";
import { useHoveredCell } from "./hooks/useHoveredCell";
import { setManifest } from "./lib/tileCache";

import ControlBar from "./components/controls/ControlBar";
import FilterSidebar from "./components/controls/FilterSidebar";
import MapView, { type MapViewHandle } from "./components/MapView";
import CellTooltip from "./components/CellTooltip";
import ColorLegend from "./components/ColorLegend";

export default function App() {
  const { manifest, loading: manifestLoading } = useManifest();
  const mapRef = useRef<MapViewHandle>(null);

  const [displayVariable, setDisplayVariable] = useState("temperature_day");
  const [displayStat, setDisplayStat] = useState("mean");
  const [period, setPeriod] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (manifest) {
      setManifest(manifest);
      if (manifest.periods.length > 0 && period === null) {
        setPeriod(manifest.periods[0]);
      }
    }
  }, [manifest, period]);

  const handlePeriodChange = useCallback((p: number) => {
    setPeriod(p);
  }, []);

  const { filters, addFilter, removeFilter, updateFilter, clearFilters, loadPreset } =
    useFilters();

  const staticCells = useStaticGrid(manifest);

  const { colors, version, loading: colorsLoading } = useColorBuffer(
    manifest,
    staticCells,
    displayVariable,
    displayStat,
    filters,
    period ?? 1,
  );

  // Send static polygons once when ready
  useEffect(() => {
    if (mapReady && mapRef.current && staticCells) {
      mapRef.current.setPolygons(staticCells);
    }
  }, [mapReady, staticCells]);

  // Update colors imperatively whenever they change
  useEffect(() => {
    if (mapRef.current && colors && staticCells) {
      mapRef.current.updateColors(colors, version);
    }
  }, [colors, version, staticCells]);

  usePreloadPeriod(period ?? 1, manifest, displayVariable, displayStat, filters);

  const { hoveredCell, onCellHover } = useHoveredCell(
    manifest,
    period ?? 1,
    displayVariable,
    filters,
  );

  if (manifestLoading || !manifest || period === null) {
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
        period={period}
        filterCount={filters.length}
        onDisplayVariableChange={setDisplayVariable}
        onDisplayStatChange={setDisplayStat}
        onPeriodChange={handlePeriodChange}
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
            onReady={() => setMapReady(true)}
          />

          <CellTooltip hoveredCell={hoveredCell} />

          <ColorLegend
            variable={displayVariable}
            min={varInfo.display_min}
            max={varInfo.display_max}
            units={varInfo.units}
            filterCount={filters.length}
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
