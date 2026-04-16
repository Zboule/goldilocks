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
    description: "Pleasant typical days (14–30°C), comfortable nights, not too dry, little daytime rain, not too windy",
    emoji: "🌤",
    filters: [
      { variable: "utci_day", stat: "median", operator: "between", value: 14, value2: 30 },
      { variable: "utci_day", stat: "p90", operator: "<", value: 32 },
      { variable: "utci_day", stat: "p10", operator: ">", value: 5 },
      { variable: "temperature_night", stat: "median", operator: "between", value: 8, value2: 26 },
      { variable: "utci_night", stat: "p90", operator: "<", value: 26 },
      { variable: "dew_point", stat: "mean", operator: ">", value: 0 },
      { variable: "rainy_hours_day", stat: "median", operator: "<", value: 0.15 },
      { variable: "wind_speed", stat: "p90", operator: "<", value: 10 },
    ],
  },
  {
    id: "beach",
    label: "Beach Holiday",
    description: "Warm typical days (>26°C), dry daytimes, tropical but breathable, sunny",
    emoji: "🏖",
    filters: [
      { variable: "utci_day", stat: "median", operator: ">", value: 26 },
      { variable: "utci_day", stat: "p90", operator: "<", value: 40 },
      { variable: "dew_point", stat: "mean", operator: "between", value: 12, value2: 20 },
      { variable: "rainy_hours_day", stat: "median", operator: "<", value: 0.10 },
      { variable: "solar_radiation", stat: "mean", operator: ">", value: 200 },
    ],
  },
  {
    id: "hiking",
    label: "Hiking / Trekking",
    description: "Comfortable for exertion (13–27°C), calm, dry daytimes, no heavy rain",
    emoji: "🥾",
    filters: [
      { variable: "utci_day", stat: "median", operator: "between", value: 13, value2: 27 },
      { variable: "utci_day", stat: "p90", operator: "<", value: 33 },
      { variable: "wind_speed", stat: "p90", operator: "<", value: 8 },
      { variable: "rainy_hours_day", stat: "median", operator: "<", value: 0.10 },
      { variable: "precipitation", stat: "p90", operator: "<", value: 15 },
    ],
  },
  {
    id: "nomad",
    label: "Digital Nomad",
    description: "Warm & comfortable (18–32°C), not oppressively humid, mostly dry daytimes",
    emoji: "💻",
    filters: [
      { variable: "utci_day", stat: "median", operator: "between", value: 18, value2: 32 },
      { variable: "utci_day", stat: "p90", operator: "<", value: 36 },
      { variable: "dew_point", stat: "p90", operator: "<", value: 20 },
      { variable: "rainy_hours_day", stat: "median", operator: "<", value: 0.12 },
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
    description: "Pleasant in every period — select all periods first",
    emoji: "🌍",
    filters: [
      { variable: "utci_day", stat: "median", operator: "between", value: 14, value2: 30 },
      { variable: "utci_day", stat: "p90", operator: "<", value: 35 },
      { variable: "utci_day", stat: "p10", operator: ">", value: 5 },
      { variable: "temperature_night", stat: "median", operator: "between", value: 8, value2: 26 },
      { variable: "utci_night", stat: "p90", operator: "<", value: 26 },
      { variable: "rainy_hours_day", stat: "median", operator: "<", value: 0.20 },
      { variable: "wind_speed", stat: "p90", operator: "<", value: 11 },
    ],
  },
];
