import type { Filter, TileRequest } from "../types";

export function evaluateFilter(
  filter: Filter,
  value: number | null,
): boolean {
  if (value === null || Number.isNaN(value)) return false;
  if (filter.operator === "between")
    return value >= filter.value && value <= (filter.value2 ?? filter.value);
  return filter.operator === "<" ? value < filter.value : value > filter.value;
}

export function evaluateAllFilters(
  filters: Filter[],
  getTileValue: (variable: string, stat: string, index: number) => number | null,
  cellIndex: number,
): { allPass: boolean; results: { filterId: string; passes: boolean }[] } {
  const results = filters.map((f) => {
    const value = getTileValue(f.variable, f.stat, cellIndex);
    return { filterId: f.id, passes: evaluateFilter(f, value) };
  });
  const allPass = results.every((r) => r.passes);
  return { allPass, results };
}

export function getFilterTileRequests(filters: Filter[]): TileRequest[] {
  const seen = new Set<string>();
  const requests: TileRequest[] = [];
  for (const f of filters) {
    const key = `${f.variable}/${f.stat}`;
    if (!seen.has(key)) {
      seen.add(key);
      requests.push({ variable: f.variable, stat: f.stat });
    }
  }
  return requests;
}

export function describeFilter(
  filter: Filter,
  variableLabel: string,
  statLabel: string,
  units: string,
): string {
  if (filter.operator === "between")
    return `${variableLabel} ${statLabel} ${filter.value}–${filter.value2 ?? "?"} ${units}`;
  return `${variableLabel} ${statLabel} ${filter.operator} ${filter.value} ${units}`;
}
