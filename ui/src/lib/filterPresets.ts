import type { Filter } from "../types";

export const SAFETY_FILTER: Omit<Filter, "id"> = {
  variable: "travel_safety",
  stat: "mean",
  operator: "<",
  value: 3,
};

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
    description: "Pleasant days (12–27°C), comfortable nights, low humidity, some sun, moderate wind, few rainy days",
    emoji: "🌤",
    filters: [
      { variable: "apparent_temperature_day", stat: "p10", operator: ">", value: 12 },
      { variable: "apparent_temperature_day", stat: "p90", operator: "<", value: 27 },
      { variable: "apparent_temperature_night", stat: "p10", operator: ">", value: 5 },
      { variable: "apparent_temperature_night", stat: "p90", operator: "<", value: 24 },
      { variable: "dew_point", stat: "p90", operator: "<", value: 19 },
      { variable: "rainy_days", stat: "mean", operator: "<", value: 0.25 },
      { variable: "wind_speed", stat: "p90", operator: "<", value: 10 },
      { variable: "cloud_cover", stat: "mean", operator: "<", value: 0.70 },
    ],
  },
  {
    id: "beach",
    label: "Beach Holiday",
    description: "Warm days (>24°C), moderate humidity, sunny, rarely rains",
    emoji: "🏖",
    filters: [
      { variable: "apparent_temperature_day", stat: "p10", operator: ">", value: 24 },
      { variable: "dew_point", stat: "mean", operator: "between", value: 12, value2: 20 },
      { variable: "rainy_days", stat: "mean", operator: "<", value: 0.15 },
      { variable: "solar_radiation", stat: "mean", operator: ">", value: 200 },
    ],
  },
  {
    id: "hiking",
    label: "Hiking / Trekking",
    description: "Mild temps (12–26°C), calm wind, no heavy rain, moderate humidity",
    emoji: "🥾",
    filters: [
      { variable: "apparent_temperature_day", stat: "mean", operator: "between", value: 12, value2: 26 },
      { variable: "wind_speed", stat: "p90", operator: "<", value: 8 },
      { variable: "heavy_rain_days", stat: "mean", operator: "<", value: 0.05 },
      { variable: "relative_humidity", stat: "mean", operator: "<", value: 75 },
    ],
  },
  {
    id: "nomad",
    label: "Digital Nomad",
    description: "Warm & comfortable (18–30°C), few muggy days, manageable rain",
    emoji: "💻",
    filters: [
      { variable: "apparent_temperature_day", stat: "mean", operator: "between", value: 18, value2: 30 },
      { variable: "muggy_days", stat: "mean", operator: "<", value: 0.15 },
      { variable: "rainy_days", stat: "mean", operator: "<", value: 0.25 },
    ],
  },
  {
    id: "dry-sunny",
    label: "Dry & Sunny",
    description: "Low dew point, strong sunshine, clear skies",
    emoji: "☀️",
    filters: [
      { variable: "dew_point", stat: "mean", operator: "<", value: 10 },
      { variable: "solar_radiation", stat: "mean", operator: ">", value: 250 },
      { variable: "cloud_cover", stat: "mean", operator: "<", value: 0.30 },
    ],
  },
  {
    id: "year-round",
    label: "Best Year-Round",
    description: "Top 1% of land — pleasant in every period when all are selected. Select all periods first.",
    emoji: "🌍",
    filters: [
      { variable: "apparent_temperature_day", stat: "p10", operator: ">", value: 10 },
      { variable: "apparent_temperature_day", stat: "p90", operator: "<", value: 31 },
      { variable: "apparent_temperature_night", stat: "p10", operator: ">", value: 2 },
      { variable: "apparent_temperature_night", stat: "p90", operator: "<", value: 26 },
      { variable: "dew_point", stat: "mean", operator: ">", value: 3 },
      { variable: "dew_point", stat: "p90", operator: "<", value: 21 },
      { variable: "relative_humidity", stat: "mean", operator: ">", value: 30 },
      { variable: "rainy_days", stat: "mean", operator: "<", value: 0.35 },
      { variable: "wind_speed", stat: "p90", operator: "<", value: 11 },
      { variable: "cloud_cover", stat: "mean", operator: "<", value: 0.80 },
    ],
  },
];
