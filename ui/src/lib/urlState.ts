import type { Filter } from "../types";

// Compact, human-readable URL state. Example:
//   ?v=utci_day&s=mean&p=1,2,3&a=2&f=utci_day,median,gt,26;dew_point,mean,bt,12,20
// v=variable, s=stat, p=locked periods, a=active period, f=filters.

const OP_TO_CODE: Record<Filter["operator"], string> = { "<": "lt", ">": "gt", between: "bt" };
const CODE_TO_OP: Record<string, Filter["operator"]> = { lt: "<", gt: ">", bt: "between" };

export interface UrlState {
  variable?: string;
  stat?: string;
  locked?: number[];
  active?: number | null;
  filters?: Omit<Filter, "id">[];
}

function encodeFilter(f: Filter | Omit<Filter, "id">): string {
  const parts = [f.variable, f.stat, OP_TO_CODE[f.operator] ?? "gt", String(f.value)];
  if (f.operator === "between" && f.value2 != null) parts.push(String(f.value2));
  return parts.join(",");
}

function decodeFilter(s: string): Omit<Filter, "id"> | null {
  const [variable, stat, code, v, v2] = s.split(",");
  const operator = CODE_TO_OP[code];
  const value = Number(v);
  if (!variable || !stat || !operator || !Number.isFinite(value)) return null;
  const filter: Omit<Filter, "id"> = { variable, stat, operator, value };
  if (operator === "between") {
    const value2 = Number(v2);
    filter.value2 = Number.isFinite(value2) ? value2 : value;
  }
  return filter;
}

export function encodeState(state: {
  variable: string;
  stat: string;
  locked: number[];
  active: number | null;
  filters: Filter[];
}): string {
  // Built by hand (not URLSearchParams) so commas/semicolons stay readable —
  // all values are plain identifiers or numbers, so no escaping is needed.
  const parts: string[] = [];
  if (state.variable) parts.push(`v=${state.variable}`);
  if (state.stat) parts.push(`s=${state.stat}`);
  if (state.locked.length) {
    parts.push(`p=${state.locked.slice().sort((a, b) => a - b).join(",")}`);
  }
  if (state.active != null) parts.push(`a=${state.active}`);
  if (state.filters.length) parts.push(`f=${state.filters.map(encodeFilter).join(";")}`);
  return parts.join("&");
}

export function parseState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const out: UrlState = {};

  const v = params.get("v");
  if (v) out.variable = v;

  const s = params.get("s");
  if (s) out.stat = s;

  const p = params.get("p");
  if (p) {
    const locked = p.split(",").map(Number).filter((n) => Number.isInteger(n));
    if (locked.length) out.locked = locked;
  }

  const a = params.get("a");
  if (a != null && a !== "") {
    const n = Number(a);
    if (Number.isInteger(n)) out.active = n;
  }

  const f = params.get("f");
  if (f) {
    const filters = f.split(";").map(decodeFilter).filter((x): x is Omit<Filter, "id"> => x !== null);
    if (filters.length) out.filters = filters;
  }

  return out;
}
