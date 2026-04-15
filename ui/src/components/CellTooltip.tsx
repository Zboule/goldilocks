import { useRef, useState, useLayoutEffect, useMemo, useEffect, useCallback, Fragment } from "react";
import type { HoveredCell, Manifest, CellStats, CountryInfo } from "../types";
import { formatLat, formatLon } from "../lib/gridGeometry";
import { getColor, FIXED_DISPLAY_RANGE, SAFETY_COLORS } from "../lib/colorScale";
import { VARIABLE_GROUPS } from "../lib/variableMetadata";

interface Props {
  hoveredCell: HoveredCell | null;
  manifest: Manifest;
  pinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
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

        let bg: string | undefined;
        if (hasValue) {
          const varInfo = manifest.variables[varData.variable];
          const fixedRange = FIXED_DISPLAY_RANGE[varData.variable];
          const dMin = fixedRange?.[0] ?? varInfo?.display_min ?? 0;
          const dMax = fixedRange?.[1] ?? varInfo?.display_max ?? 1;
          const [r, g, b] = getColor(varData.variable, value!, dMin, dMax, stat);
          bg = `rgba(${r},${g},${b},0.25)`;
        }

        return (
          <div
            key={`${varData.variable}-${stat}`}
            className={`text-center tabular-nums rounded-sm ${cellClass}`}
            style={bg ? { backgroundColor: bg } : undefined}
          >
            {formatValue(value ?? null)}
          </div>
        );
      })}
    </>
  );
}

export default function CellTooltip({ hoveredCell, manifest, pinned, onPin, onUnpin }: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 100 });

  useEffect(() => {
    if (!pinned) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onUnpin?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pinned, onUnpin]);

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

  return (
    <div
      ref={tooltipRef}
      className={`fixed z-50 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 
                 max-md:bottom-[80px] max-md:left-4 max-md:right-4 max-md:top-auto
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
      <div className="font-medium text-gray-700 mb-1.5 flex items-center gap-2">
        <span>
          {country?.name && (
            <span className="text-gray-900">{country.name} · </span>
          )}
          {formatLat(lat)}, {formatLon(lon)}
        </span>
        {loading && (
          <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        )}
        {pinned && (
          <button
            onClick={onUnpin}
            className="ml-auto text-gray-400 hover:text-gray-600 text-sm leading-none px-1 pointer-events-auto"
            title="Unpin (Esc)"
          >
            ×
          </button>
        )}
        {!pinned && (
          <span className="ml-auto text-[9px] text-gray-300 hidden md:inline">click to pin</span>
        )}
      </div>

      {data.length > 0 && (
        <div
          className="grid gap-x-1.5 sm:gap-x-2 gap-y-px items-center w-full overflow-x-auto"
          style={{ gridTemplateColumns: `auto repeat(${STAT_ORDER.length}, minmax(28px, 40px))` }}
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
                        {varData.label}
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
      )}
    </div>
  );
}
