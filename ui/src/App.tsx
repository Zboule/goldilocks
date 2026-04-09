import { useState, useEffect } from "react";
import { useManifest } from "./hooks/useManifest";
import { useFilters } from "./hooks/useFilters";
import { useFilteredGrid } from "./hooks/useFilteredGrid";
import { usePreloadPeriod } from "./hooks/usePreloadPeriod";
import { useHoveredCell } from "./hooks/useHoveredCell";
import { setManifest } from "./lib/tileCache";
import ControlBar from "./components/controls/ControlBar";
import FilterSidebar from "./components/controls/FilterSidebar";
import MapView from "./components/MapView";
import CellTooltip from "./components/CellTooltip";
import ColorLegend from "./components/ColorLegend";

export default function App() {
  const { manifest, loading: manifestLoading } = useManifest();

  const [displayVariable, setDisplayVariable] = useState("temperature_day");
  const [displayStat, setDisplayStat] = useState("mean");
  const [period, setPeriod] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (manifest) {
      setManifest(manifest);
      if (manifest.periods.length > 0 && period === null) {
        setPeriod(manifest.periods[0]);
      }
    }
  }, [manifest, period]);

  const { filters, addFilter, removeFilter, updateFilter, clearFilters, loadPreset } =
    useFilters();

  const { cells, loading: gridLoading } = useFilteredGrid(
    manifest,
    displayVariable,
    displayStat,
    filters,
    period ?? 0,
  );

  usePreloadPeriod(period ?? 0, manifest, displayVariable, displayStat, filters);

  const { hoveredCell, onCellHover } = useHoveredCell(
    manifest,
    period ?? 0,
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
        onPeriodChange={setPeriod}
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
            cells={cells}
            resolution={manifest.grid.resolution_deg}
            onHover={onCellHover}
          />

          <CellTooltip hoveredCell={hoveredCell} />

          <ColorLegend
            variable={displayVariable}
            min={varInfo.display_min}
            max={varInfo.display_max}
            units={varInfo.units}
            filterCount={filters.length}
          />

          {gridLoading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded bg-black/60 px-3 py-1 text-sm text-white">
              Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
