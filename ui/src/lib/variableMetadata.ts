export interface ReferenceRange {
  range: string;
  label: string;
  /** Representative value for this range, used to sample the color palette */
  value: number;
}

export interface VariableDetail {
  id: string;
  source: string;
  rawVariable: string;
  derivation: string;
  temporalAgg: string;
  stats: string;
  ranges?: ReferenceRange[];
}

export interface VariableGroup {
  label: string;
  variables: string[];
}

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: "Temperature",
    variables: [
      "apparent_temperature_day",
      "apparent_temperature_night",
      "temperature_day",
      "temperature_night",
      "diurnal_range",
    ],
  },
  {
    label: "Humidity",
    variables: ["dew_point", "relative_humidity"],
  },
  {
    label: "Wind",
    variables: ["wind_speed"],
  },
  {
    label: "Precipitation & Cloud",
    variables: ["precipitation", "cloud_cover", "solar_radiation"],
  },
  {
    label: "Event Frequencies",
    variables: [
      "rainy_days",
      "heavy_rain_days",
      "muggy_days",
      "hot_days",
      "windy_days",
    ],
  },
];

export const VARIABLE_DETAILS: Record<string, VariableDetail> = {
  temperature_day: {
    id: "temperature_day",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023, 11 years)",
    rawVariable: "2m_temperature (6-hourly, 0.25° grid)",
    derivation:
      "Converted from Kelvin to °C. Daily maximum computed from 4 six-hourly readings per day.",
    temporalAgg:
      "Each year is split into 36 periods (Early/Mid/Late for each month: days 1–10, 11–20, 21–end). For a given period, all daily max values across all 11 years are pooled (~110 values).",
    stats:
      "Pooled stats (mean, median, min, max, P10, P90) computed over the full pool. Year Std (ystd): the standard deviation of per-year period means, measuring how much the typical temperature varies from year to year.",
    ranges: [
      { range: "< 0°C", label: "Freezing", value: -10 },
      { range: "0–10°C", label: "Cold", value: 5 },
      { range: "10–18°C", label: "Cool", value: 14 },
      { range: "18–25°C", label: "Comfortable", value: 21 },
      { range: "25–32°C", label: "Warm to hot", value: 28 },
      { range: "32–40°C", label: "Very hot", value: 36 },
      { range: "> 40°C", label: "Extreme heat", value: 45 },
    ],
  },
  temperature_night: {
    id: "temperature_night",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023, 11 years)",
    rawVariable: "2m_temperature (6-hourly, 0.25° grid)",
    derivation:
      "Converted from Kelvin to °C. Daily minimum computed from 4 six-hourly readings per day.",
    temporalAgg:
      "Same 36-period structure. All daily min values across 11 years pooled per period.",
    stats:
      "Pooled stats over the full pool. Year Std measures interannual variability of per-year period means.",
    ranges: [
      { range: "< -10°C", label: "Severe frost", value: -20 },
      { range: "-10–0°C", label: "Freezing nights", value: -5 },
      { range: "0–10°C", label: "Cold — heating needed", value: 5 },
      { range: "10–18°C", label: "Cool — comfortable for sleep", value: 14 },
      { range: "18–24°C", label: "Warm nights", value: 21 },
      { range: "> 24°C", label: "Tropical nights — hard to sleep", value: 27 },
    ],
  },
  apparent_temperature_day: {
    id: "apparent_temperature_day",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable:
      "2m_temperature, relative_humidity at 1000 hPa, 10m u/v wind (6-hourly)",
    derivation:
      "Australian BOM apparent temperature formula: AT = T + 0.33×e − 0.70×ws − 4.00, where e = RH × 6.105 × exp(17.27×T/(237.7+T)) is vapor pressure (hPa), ws = √(u²+v²) is wind speed (m/s). The −4.00 constant represents baseline body heat loss in shade. Daily maximum of 4 six-hourly AT values.",
    temporalAgg: "36 periods, daily max AT pooled across 11 years. Computed year-by-year for memory efficiency.",
    stats:
      "Pooled stats + Year Std. AT < T is normal in temperate conditions; AT > T only in hot, humid, calm conditions.",
    ranges: [
      { range: "< 5°C", label: "Very cold — heavy clothing", value: -5 },
      { range: "5–12°C", label: "Cold — jacket needed", value: 8 },
      { range: "12–18°C", label: "Cool — light layers", value: 15 },
      { range: "18–24°C", label: "Comfortable for most people", value: 21 },
      { range: "24–28°C", label: "Warm — still pleasant", value: 26 },
      { range: "28–35°C", label: "Hot — uncomfortable for many", value: 31 },
      { range: "> 35°C", label: "Very hot — heat stress risk", value: 40 },
    ],
  },
  apparent_temperature_night: {
    id: "apparent_temperature_night",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable:
      "2m_temperature, relative_humidity at 1000 hPa, 10m u/v wind (6-hourly)",
    derivation:
      "Same BOM formula as day. Daily minimum of 4 six-hourly AT values.",
    temporalAgg: "36 periods, daily min AT pooled across 11 years.",
    stats: "Pooled stats + Year Std.",
    ranges: [
      { range: "< 0°C", label: "Freezing feels-like", value: -10 },
      { range: "0–8°C", label: "Very cold", value: 4 },
      { range: "8–15°C", label: "Cool — comfortable for sleep", value: 11 },
      { range: "15–22°C", label: "Warm night", value: 18 },
      { range: "> 22°C", label: "Hot night — hard to sleep", value: 27 },
    ],
  },
  diurnal_range: {
    id: "diurnal_range",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "2m_temperature (6-hourly)",
    derivation:
      "Daily temperature range: max(4 six-hourly values) − min(4 six-hourly values) per day, in °C. Measures the daily swing from night to day.",
    temporalAgg: "36 periods, daily range values pooled across 11 years.",
    stats: "Pooled stats + Year Std. Low values = stable conditions; high values = large day/night swings.",
    ranges: [
      { range: "< 5°C", label: "Very small swing — oceanic/tropical", value: 2.5 },
      { range: "5–10°C", label: "Moderate — typical coastal", value: 7.5 },
      { range: "10–15°C", label: "Large — continental climate", value: 12.5 },
      { range: "15–25°C", label: "Very large — desert/arid", value: 20 },
      { range: "> 25°C", label: "Extreme — high-altitude desert", value: 30 },
    ],
  },
  dew_point: {
    id: "dew_point",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "2m_temperature + relative_humidity at 1000 hPa (6-hourly)",
    derivation:
      "Derived via inverse Magnus formula: γ = ln(RH) + 17.625×T/(243.04+T), then Td = 243.04×γ/(17.625−γ). RH is from the 1000 hPa pressure level (near-surface). Daily mean of 4 six-hourly dew point values.",
    temporalAgg: "36 periods, daily mean dew point pooled across 11 years.",
    stats:
      "Pooled stats + Year Std.",
    ranges: [
      { range: "< 5°C", label: "Very dry — desert-like", value: -5 },
      { range: "5–10°C", label: "Dry — very comfortable", value: 7.5 },
      { range: "10–16°C", label: "Comfortable", value: 13 },
      { range: "16–18°C", label: "Starting to feel humid", value: 17 },
      { range: "18–21°C", label: "Sticky — somewhat uncomfortable", value: 19.5 },
      { range: "21–24°C", label: "Oppressive", value: 22.5 },
      { range: "> 24°C", label: "Extremely muggy — tropical", value: 27 },
    ],
  },
  relative_humidity: {
    id: "relative_humidity",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "relative_humidity at 1000 hPa pressure level (6-hourly, 0–1 fraction)",
    derivation:
      "Loaded directly from ERA5 at the 1000 hPa level (near-surface approximation). Converted from 0–1 fraction to 0–100%. Daily mean of 4 six-hourly values.",
    temporalAgg: "36 periods, daily mean RH pooled across 11 years.",
    stats:
      "Pooled stats + Year Std. Note: RH is temperature-dependent — 60% at 15°C feels different from 60% at 35°C. Use dew point for absolute moisture.",
    ranges: [
      { range: "< 25%", label: "Very dry — skin/respiratory discomfort", value: 12 },
      { range: "25–40%", label: "Dry — comfortable in cool temps", value: 32 },
      { range: "40–60%", label: "Comfortable range", value: 50 },
      { range: "60–75%", label: "Moderately humid", value: 67 },
      { range: "75–90%", label: "Humid — can feel sticky if warm", value: 82 },
      { range: "> 90%", label: "Very humid — foggy, tropical", value: 95 },
    ],
  },
  wind_speed: {
    id: "wind_speed",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "10m u/v wind components (6-hourly)",
    derivation:
      "Wind speed = √(u² + v²) computed at each 6-hourly timestep. Not daily-aggregated — all 6-hourly values used directly.",
    temporalAgg:
      "36 periods, all 6-hourly speed values (~440 per period) pooled across 11 years.",
    stats: "Pooled stats + Year Std.",
    ranges: [
      { range: "< 2 m/s", label: "Calm", value: 1 },
      { range: "2–5 m/s", label: "Light breeze", value: 3.5 },
      { range: "5–8 m/s", label: "Gentle to moderate breeze", value: 6.5 },
      { range: "8–12 m/s", label: "Fresh breeze — noticeably windy", value: 10 },
      { range: "12–17 m/s", label: "Strong — uncomfortable outdoors", value: 14.5 },
      { range: "> 17 m/s", label: "Gale force — dangerous", value: 22 },
    ],
  },
  precipitation: {
    id: "precipitation",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "total_precipitation_6hr (6-hourly, meters of water equivalent)",
    derivation:
      "Converted from meters to mm. Daily sum of 4 six-hourly accumulations.",
    temporalAgg: "36 periods, daily precipitation totals pooled across 11 years.",
    stats: "Pooled stats + Year Std.",
    ranges: [
      { range: "< 1 mm/day", label: "Dry", value: 0.5 },
      { range: "1–5 mm/day", label: "Light rain", value: 3 },
      { range: "5–15 mm/day", label: "Moderate rain", value: 10 },
      { range: "15–30 mm/day", label: "Heavy rain", value: 22 },
      { range: "> 30 mm/day", label: "Very heavy — flooding risk", value: 40 },
    ],
  },
  cloud_cover: {
    id: "cloud_cover",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "total_cloud_cover (6-hourly, 0–1 fraction)",
    derivation: "Used directly. 0 = clear sky, 1 = fully overcast.",
    temporalAgg: "36 periods, all 6-hourly values pooled across 11 years.",
    stats: "Pooled stats + Year Std.",
    ranges: [
      { range: "< 0.20", label: "Mostly clear", value: 0.1 },
      { range: "0.20–0.40", label: "Partly cloudy", value: 0.3 },
      { range: "0.40–0.60", label: "Partly sunny", value: 0.5 },
      { range: "0.60–0.80", label: "Mostly cloudy", value: 0.7 },
      { range: "> 0.80", label: "Overcast", value: 0.9 },
    ],
  },
  solar_radiation: {
    id: "solar_radiation",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2021, 9 years — older dataset)",
    rawVariable: "toa_incident_solar_radiation_6hr (J/m², top-of-atmosphere)",
    derivation:
      "Top-of-atmosphere incoming solar energy, converted from J/m² to W/m² by dividing by 21600 (6 hours in seconds). Captures latitude and seasonal effects but not cloud absorption. Daily mean of 4 six-hourly values.",
    temporalAgg: "36 periods, daily mean radiation pooled across 9 years (dataset ends 2021).",
    stats:
      "Pooled stats + Year Std. Values represent clear-sky solar potential — actual surface radiation is lower due to clouds (see cloud cover).",
    ranges: [
      { range: "< 50 W/m²", label: "Very low — polar winter", value: 25 },
      { range: "50–150 W/m²", label: "Low — high latitudes / winter", value: 100 },
      { range: "150–250 W/m²", label: "Moderate", value: 200 },
      { range: "250–350 W/m²", label: "High — subtropical / summer", value: 300 },
      { range: "> 350 W/m²", label: "Very high — tropical / desert", value: 400 },
    ],
  },
  rainy_days: {
    id: "rainy_days",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "total_precipitation_6hr (6-hourly)",
    derivation:
      "A day is 'rainy' if ≥3 of 4 six-hourly intervals have precipitation >0.5 mm. This captures sustained all-day rain, not brief showers. For each period and year, the fraction of rainy days is computed.",
    temporalAgg:
      "Year-normalized: for each period, a per-year fraction (0–1) is computed first, then statistics are taken across the ~11 yearly fractions. This measures interannual reliability, not daily variability.",
    stats:
      "Stats are across yearly fractions: mean = typical fraction, P10/P90 = worst/best years. Year Std = how much the rainy-day fraction varies year-to-year.",
    ranges: [
      { range: "< 0.05", label: "Rare — almost no all-day rain", value: 0.02 },
      { range: "0.05–0.15", label: "Occasional", value: 0.10 },
      { range: "0.15–0.30", label: "Frequent", value: 0.22 },
      { range: "0.30–0.50", label: "Very frequent", value: 0.40 },
      { range: "> 0.50", label: "Most days — monsoon-like", value: 0.70 },
    ],
  },
  heavy_rain_days: {
    id: "heavy_rain_days",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "total_precipitation_6hr (6-hourly)",
    derivation:
      "A day is 'heavy rain' if daily total precipitation >10 mm. Per-year fraction computed for each period.",
    temporalAgg: "Year-normalized (same as rainy_days). Stats across ~11 yearly fractions.",
    stats: "Same year-normalized interpretation as rainy days.",
    ranges: [
      { range: "< 0.02", label: "Very rare", value: 0.01 },
      { range: "0.02–0.10", label: "Occasional", value: 0.06 },
      { range: "0.10–0.25", label: "Frequent — plan for it", value: 0.17 },
      { range: "> 0.25", label: "Very frequent — wet season", value: 0.35 },
    ],
  },
  muggy_days: {
    id: "muggy_days",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "2m_temperature + relative_humidity at 1000 hPa (6-hourly)",
    derivation:
      "Dew point derived from T + RH via inverse Magnus formula. A day is 'muggy' if daily mean dew point >18°C. Per-year fraction computed for each period.",
    temporalAgg: "Year-normalized. Stats across ~11 yearly fractions.",
    stats: "Same year-normalized interpretation. 0.15 = muggy ~15% of days in this period.",
    ranges: [
      { range: "0", label: "Never muggy", value: 0 },
      { range: "0.01–0.10", label: "Rare — dry climate", value: 0.05 },
      { range: "0.10–0.30", label: "Sometimes muggy", value: 0.20 },
      { range: "0.30–0.60", label: "Often muggy", value: 0.45 },
      { range: "> 0.60", label: "Mostly muggy — tropical", value: 0.80 },
    ],
  },
  hot_days: {
    id: "hot_days",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "2m_temperature (6-hourly)",
    derivation:
      "Daily max temperature >35°C. Per-year fraction computed for each period.",
    temporalAgg: "Year-normalized. Stats across ~11 yearly fractions.",
    stats: "Same year-normalized interpretation.",
    ranges: [
      { range: "0", label: "Never exceeds 35°C", value: 0 },
      { range: "0.01–0.10", label: "Rare heat spikes", value: 0.05 },
      { range: "0.10–0.30", label: "Regular hot days", value: 0.20 },
      { range: "0.30–0.60", label: "Frequently above 35°C", value: 0.45 },
      { range: "> 0.60", label: "Persistent extreme heat", value: 0.80 },
    ],
  },
  windy_days: {
    id: "windy_days",
    source: "ERA5 reanalysis via WeatherBench2 (2013–2023)",
    rawVariable: "10m u/v wind components (6-hourly)",
    derivation:
      "Daily max wind speed (from 4 six-hourly values) >8 m/s. Per-year fraction computed for each period.",
    temporalAgg: "Year-normalized. Stats across ~11 yearly fractions.",
    stats: "Same year-normalized interpretation.",
    ranges: [
      { range: "< 0.05", label: "Rarely windy — sheltered", value: 0.02 },
      { range: "0.05–0.20", label: "Sometimes windy", value: 0.12 },
      { range: "0.20–0.40", label: "Often windy", value: 0.30 },
      { range: "0.40–0.70", label: "Very windy — exposed/coastal", value: 0.55 },
      { range: "> 0.70", label: "Persistently windy", value: 0.85 },
    ],
  },
};
