import { useRef, useState, useLayoutEffect, useMemo, useEffect, useCallback, Fragment } from "react";
import type { HoveredCell, Manifest, CellStats, CountryInfo } from "../types";
import { formatLat, formatLon } from "../lib/gridGeometry";
import { getColor, FIXED_DISPLAY_RANGE, SAFETY_COLORS } from "../lib/colorScale";
import { VARIABLE_GROUPS, SHORT_LABELS } from "../lib/variableMetadata";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  hoveredCell: HoveredCell | null;
  manifest: Manifest;
  displayVariable: string;
  displayStat: string;
  pinned?: boolean;
  onUnpin?: () => void;
  /** Mobile: clear both pin and hover so the card can be closed. */
  onDismiss?: () => void;
}

const STAT_ORDER = ["min", "p10", "mean", "median", "p90", "max", "ystd"];
const STAT_LABELS: Record<string, string> = {
  mean: "Mean",
  median: "Med",
  min: "Min",
  max: "Max",
  p10: "P10",
  p90: "P90",
  ystd: "σyr",
};

const COLS = STAT_ORDER.length + 1;

const SOURCE_NAMES: Record<string, string> = {
  us: "US",
  de: "Germany",
  ca: "Canada",
};

const LEVEL_SHORT_LABELS: Record<number, string> = {
  1: "Normal",
  2: "Caution",
  3: "Reconsider",
  4: "Avoid",
};

function formatValue(v: number | null, decimals = 1): string {
  if (v === null) return "—";
  return v.toFixed(decimals);
}

function levelTextColor(level: number): string {
  if (level >= 4) return "text-red-600";
  if (level >= 3) return "text-orange-600";
  if (level >= 2) return "text-yellow-700";
  return "text-green-700";
}

function levelBadgeBg(level: number): string {
  const c = SAFETY_COLORS[level] ?? [200, 200, 200, 180];
  return `rgba(${c[0]},${c[1]},${c[2]},0.2)`;
}

function levelBadgeBorder(level: number): string {
  const c = SAFETY_COLORS[level] ?? [200, 200, 200, 180];
  return `rgba(${c[0]},${c[1]},${c[2]},0.6)`;
}

function SafetySourceLinks({ country, pinned }: { country: CountryInfo; pinned?: boolean }) {
  const sources = country.sources ?? {};
  const entries = Object.entries(sources) as [string, { level: number; label: string; url: string }][];

  if (entries.length === 0) return <span className="text-gray-400">No advisory data</span>;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {entries.map(([key, src]) => {
        const badge = (
          <span
            className={`inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-medium border ${levelTextColor(src.level)}`}
            style={{ backgroundColor: levelBadgeBg(src.level), borderColor: levelBadgeBorder(src.level) }}
          >
            <span className="text-gray-500 font-normal">{SOURCE_NAMES[key] ?? key}</span>
            {LEVEL_SHORT_LABELS[src.level] ?? `L${src.level}`}
          </span>
        );

        if (pinned && src.url) {
          return (
            <a
              key={key}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto hover:opacity-75 transition-opacity"
            >
              {badge}
            </a>
          );
        }
        return <span key={key}>{badge}</span>;
      })}
    </div>
  );
}

function MobileSummary({
  dataMap, manifest, displayVariable, displayStat, filterResults,
}: {
  dataMap: Map<string, CellStats>;
  manifest: Manifest;
  displayVariable: string;
  displayStat: string;
  filterResults: { passes: boolean }[];
}) {
  const varData = dataMap.get(displayVariable);
  const varInfo = manifest.variables[displayVariable];
  // Headline mirrors what the map is currently colored by: variable + stat.
  const value = varData?.stats[displayStat];
  const passCount = filterResults.filter((r) => r.passes).length;
  const failCount = filterResults.length - passCount;

  return (
    <div className="flex items-center gap-2 text-[11px]">
      {varData && !varInfo?.categorical && (
        <span className="text-gray-600 truncate">
          {SHORT_LABELS[displayVariable] ?? varData.label} · {STAT_LABELS[displayStat] ?? displayStat}:{" "}
          <span className="font-semibold text-gray-800 tabular-nums">
            {value !== null && value !== undefined ? value.toFixed(1) : "—"}
          </span>{" "}
          <span className="text-gray-400">{varData.units}</span>
        </span>
      )}
      {filterResults.length > 0 && (
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {failCount === 0 ? (
            <span className="rounded-full bg-green-100 text-green-700 px-1.5 py-px font-medium">
              ✓ all {passCount} filters
            </span>
          ) : (
            <span className="rounded-full bg-red-100 text-red-600 px-1.5 py-px font-medium">
              ✗ fails {failCount}/{filterResults.length}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function StatCells({
  varData, filterMap, manifest,
}: {
  varData: CellStats;
  filterMap: Map<string, { passes: boolean; label: string }>;
  manifest: Manifest;
}) {
  return (
    <>
      {STAT_ORDER.map((stat) => {
        const value = varData.stats[stat];
        const filter = filterMap.get(`${varData.variable}/${stat}`);
        const hasValue = value !== null && value !== undefined;

        let cellClass = "text-gray-700";
        if (!hasValue) cellClass = "text-gray-300";
        else if (filter) {
          cellClass = filter.passes ? "text-green-700 font-semibold" : "text-red-500";
        }

        const varInfo = manifest.variables[varData.variable];
        // Quantization can produce small negatives ("-0.0 mm/day") on
        // physically non-negative variables — clamp for display.
        let shown = value ?? null;
        if (shown !== null && shown < 0 && (varInfo?.min ?? -1) >= 0) shown = 0;
        if (shown === 0) shown = 0; // normalize -0

        let bg: string | undefined;
        if (hasValue) {
          const fixedRange = FIXED_DISPLAY_RANGE[varData.variable];
          const dMin = fixedRange?.[0] ?? varInfo?.display_min ?? 0;
          const dMax = fixedRange?.[1] ?? varInfo?.display_max ?? 1;
          const [r, g, b] = getColor(varData.variable, shown!, dMin, dMax, stat);
          bg = `rgba(${r},${g},${b},0.25)`;
        }

        return (
          <div
            key={`${varData.variable}-${stat}`}
            className={`text-center tabular-nums rounded-sm ${cellClass}`}
            style={bg ? { backgroundColor: bg } : undefined}
          >
            {formatValue(shown)}
          </div>
        );
      })}
    </>
  );
}

export default function CellTooltip({ hoveredCell, manifest, displayVariable, displayStat, pinned, onUnpin, onDismiss }: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 100 });
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Show the bottom fade only while the expanded table has unscrolled rows.
  const updateMoreBelow = () => {
    const el = tableRef.current;
    if (!el) return;
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  };

  useEffect(() => {
    if (expanded) requestAnimationFrame(updateMoreBelow);
    else setMoreBelow(false);
  }, [expanded, hoveredCell?.index]);

  // Always open collapsed: reset when the card closes or shows a different cell.
  useEffect(() => { if (!pinned) setExpanded(false); }, [pinned]);
  useEffect(() => { setExpanded(false); }, [hoveredCell?.index]);

  useEffect(() => {
    if (!pinned) return;
    const close = () => (onDismiss ?? onUnpin)?.();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Clicks outside the card dismiss it — except on the map itself, where the
    // map's own click handler decides (switch to another cell, or close).
    const handleClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (tooltipRef.current?.contains(t)) return;
      if (t.closest?.(".maplibregl-map")) return;
      close();
    };
    window.addEventListener("keydown", handleKey);
    const id = window.setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.clearTimeout(id);
      document.removeEventListener("click", handleClick);
    };
  }, [pinned, onUnpin, onDismiss]);

  const filterResults = hoveredCell?.filterResults ?? [];
  const data = hoveredCell?.data ?? [];

  const filterMap = useMemo(() => {
    const m = new Map<string, { passes: boolean; label: string }>();
    for (const r of filterResults) m.set(`${r.variable}/${r.stat}`, { passes: r.passes, label: r.label });
    return m;
  }, [filterResults]);

  const dataMap = useMemo(() => {
    const m = new Map<string, CellStats>();
    for (const d of data) m.set(d.variable, d);
    return m;
  }, [data]);

  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      if (Math.abs(rect.width - size.w) > 1 || Math.abs(rect.height - size.h) > 1) {
        setSize({ w: rect.width, h: rect.height });
      }
    }
  });

  if (!hoveredCell) return null;

  const { x, y, lon, lat, loading, country } = hoveredCell;

  const offset = 14;
  const fitsRight = x + offset + size.w < window.innerWidth;
  const fitsBelow = y + offset + size.h < window.innerHeight;
  const left = fitsRight ? x + offset : x - offset - size.w;
  const top = fitsBelow ? y + offset : y - offset - size.h;

  const statsTable = (
    <div
      ref={tableRef}
      onScroll={updateMoreBelow}
      className="grid gap-x-1 sm:gap-x-2 gap-y-px items-center w-full overflow-x-auto max-md:max-h-[40dvh] max-md:overflow-y-auto max-md:overscroll-contain max-md:mt-1"
      style={{
        gridTemplateColumns: isMobile
          ? `minmax(76px, auto) repeat(${STAT_ORDER.length}, minmax(26px, 1fr))`
          : `auto repeat(${STAT_ORDER.length}, minmax(28px, 40px))`,
      }}
    >

          {/* Header */}
          <div />
          {STAT_ORDER.map((s) => (
            <div key={s} className="text-center text-[9px] sm:text-[10px] text-gray-400 pb-0.5">
              {STAT_LABELS[s]}
            </div>
          ))}

          {VARIABLE_GROUPS.map((group) => {
            const vars = group.variables.filter((v) => dataMap.has(v));
            if (vars.length === 0) return null;
            return (
              <Fragment key={group.label}>
                <div
                  className="text-[8px] font-semibold text-gray-400 uppercase tracking-wider pt-1"
                  style={{ gridColumn: `span ${COLS}` }}
                >
                  {group.label}
                </div>

                {vars.map((varKey) => {
                  const varData = dataMap.get(varKey)!;
                  const varInfo = manifest.variables[varKey];

                  if (varInfo?.categorical) {
                    return (
                      <Fragment key={varKey}>
                        <div className="text-gray-600 font-medium pr-1 whitespace-nowrap overflow-hidden text-ellipsis">
                          {varData.label}
                        </div>
                        <div style={{ gridColumn: `span ${STAT_ORDER.length}` }}>
                          {country ? (
                            country.level > 0 ? (
                              <SafetySourceLinks country={country} pinned={pinned} />
                            ) : (
                              <span className="text-gray-400 text-[10px]">No advisory data</span>
                            )
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {["US", "Germany", "Canada"].map((name) => (
                                <span
                                  key={name}
                                  className="inline-flex items-center rounded px-1 py-px text-[9px] text-gray-300 bg-gray-100 border border-gray-200"
                                >
                                  {name} ···
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Fragment>
                    );
                  }

                  return (
                    <Fragment key={varKey}>
                      <div className="text-gray-600 font-medium pr-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {isMobile ? SHORT_LABELS[varKey] ?? varData.label : varData.label}
                        {" "}
                        <span className="text-gray-400 font-normal text-[9px] sm:text-[10px]">
                          {varData.units}
                        </span>
                      </div>
                      <StatCells varData={varData} filterMap={filterMap} manifest={manifest} />
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
    </div>
  );

  return (
    <div
      ref={tooltipRef}
      className={`fixed z-50 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 
                 max-md:bottom-[calc(env(safe-area-inset-bottom)+76px)] max-md:left-4 max-md:right-4 max-md:top-auto
                 md:left-[var(--hover-left)] md:top-[var(--hover-top)] md:w-max
                 px-2.5 py-2 sm:px-3 sm:py-2 text-[10px] sm:text-xs overflow-hidden
                 ${pinned ? "pointer-events-auto ring-2 ring-blue-400/50" : "pointer-events-none"}`}
      style={
        {
          "--hover-left": `${left}px`,
          "--hover-top": `${top}px`,
        } as React.CSSProperties
      }
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`font-medium text-gray-700 flex items-center gap-2 ${isMobile && !expanded ? "mb-0.5" : "mb-1.5"}`}>
        <span className="truncate">
          {country?.name && (
            <span className="text-gray-900">{country.name} · </span>
          )}
          {formatLat(lat)}, {formatLon(lon)}
        </span>
        {loading && (
          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
        )}
        {isMobile && (
          <span className="ml-auto flex items-center gap-1 shrink-0 pointer-events-auto">
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Show less" : "Show all variables"}
              className="w-7 h-7 flex items-center justify-center text-gray-400 active:text-gray-600"
            >
              <svg
                className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              onClick={onDismiss ?? onUnpin}
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center text-gray-400 active:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </span>
        )}
        {!isMobile && pinned && (
          <button
            onClick={onUnpin}
            className="ml-auto text-gray-400 hover:text-gray-600 text-sm leading-none px-1 pointer-events-auto"
            title="Unpin (Esc)"
          >
            ×
          </button>
        )}
        {!isMobile && !pinned && (
          <span className="ml-auto text-[9px] text-gray-300 hidden md:inline">click to pin</span>
        )}
      </div>

      {/* Mobile: always-visible summary of the displayed layer + filter verdict */}
      {isMobile && (
        <MobileSummary
          dataMap={dataMap}
          manifest={manifest}
          displayVariable={displayVariable}
          displayStat={displayStat}
          filterResults={filterResults}
        />
      )}

      {/* Mobile: failing filters + table live in an animated 0fr->1fr container */}
      {isMobile && data.length > 0 && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
          aria-hidden={!expanded}
        >
          <div className="min-h-0 overflow-hidden">
            {filterResults.some((r) => !r.passes) && (
              <div className="mt-1 mb-0.5 text-[10px] leading-snug">
                {filterResults.filter((r) => !r.passes).map((r) => (
                  <div key={r.filterId} className="text-red-600 truncate">✗ {r.label}</div>
                ))}
              </div>
            )}
            <div className="relative">
              {statsTable}
              {moreBelow && (
                <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-white to-transparent" />
              )}
            </div>
            {filterResults.length > 0 && (
              <div className="mt-1 text-[9px] text-gray-400">
                <span className="text-green-700 font-semibold">green</span> = passes filter ·{" "}
                <span className="text-red-500">red</span> = fails filter
              </div>
            )}
          </div>
        </div>
      )}

      {!isMobile && data.length > 0 && statsTable}
    </div>
  );
}

