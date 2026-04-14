export interface VariableInfo {
  units: string;
  label: string;
  min: number;
  max: number;
  display_min: number;
  display_max: number;
  encode_min?: number;
  encode_max?: number;
}

export interface Manifest {
  grid: { width: number; height: number; resolution_deg: number };
  lon_range: [number, number];
  lat_range: [number, number];
  periods: number[];
  period_labels: string[];
  stats: string[];
  variables: Record<string, VariableInfo>;
  encoding?: "float32" | "uint16" | "uint8-land-only";
  land_cells?: number;
  chunk_size?: number;
  variable_order?: string[];
}

export interface Filter {
  id: string;
  variable: string;
  stat: string;
  operator: "<" | ">" | "between";
  value: number;
  value2?: number;
}

export interface TileRequest {
  variable: string;
  stat: string;
}

export interface GridCell {
  lon: number;
  lat: number;
  index: number;
  value: number;
  color: [number, number, number, number];
  polygon: [number, number][];
  passesFilter: boolean;
}

export interface CellStats {
  variable: string;
  label: string;
  units: string;
  stats: Record<string, number | null>;
}

export interface HoveredCell {
  x: number;
  y: number;
  lon: number;
  lat: number;
  index: number;
  data: CellStats[];
  filterResults: { filterId: string; variable: string; stat: string; label: string; passes: boolean }[];
  loading?: boolean;
}
