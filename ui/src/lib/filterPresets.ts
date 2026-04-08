import type { Filter } from "../types";

export interface FilterPreset {
  id: string;
  label: string;
  description: string;
  emoji: string;
  filters: Omit<Filter, "id">[];
}

export const PRESETS: FilterPreset[] = [
  {
    id: "enjoyable",
    label: "Enjoyable Climate",
    description: "Pleasant days (14-28°C), mild nights (>7°C), moderate wind, <35% all-day rain",
    emoji: "🌤",
    filters: [
      { variable: "temperature_day", stat: "p10", operator: ">", value: 14 },
      { variable: "temperature_day", stat: "p90", operator: "<", value: 28 },
      { variable: "temperature_night", stat: "p10", operator: ">", value: 7 },
      { variable: "wind_speed", stat: "p90", operator: "<", value: 10 },
      { variable: "rainy_days", stat: "mean", operator: "<", value: 0.35 },
    ],
  },
];
