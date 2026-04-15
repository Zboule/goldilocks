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
    label: "Feels Like",
    variables: [
      "utci_day",
      "utci_night",
      "apparent_temperature_day",
      "apparent_temperature_night",
    ],
  },
  {
    label: "Temperature",
    variables: [
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
    variables: ["precipitation", "rainy_hours_day", "rainy_hours_night", "rainy_hours", "cloud_cover", "solar_radiation"],
  },
  {
    label: "Safety",
    variables: ["travel_safety"],
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
  utci_day: {
    id: "utci_day",
    source: "ERA5-HEAT v1.1, Copernicus Climate Data Store (2013–2022)",
    rawVariable:
      "Pre-computed UTCI from ERA5 air temperature, humidity, 10m wind, and surface radiation (mean radiant temperature)",
    derivation:
      "Universal Thermal Climate Index — a thermo-physiological model simulating human body response (sweat, shivering, skin blood flow). Accounts for radiation via Mean Radiant Temperature, unlike simpler indices. Daily maximum from hourly UTCI values.",
    temporalAgg: "36 periods, daily max UTCI pooled across 10 years.",
    stats: "Pooled stats + Year Std.",
    ranges: [
      { range: "< −13°C", label: "Strong cold stress", value: -20 },
      { range: "−13 to 0°C", label: "Moderate cold stress", value: -6 },
      { range: "0–9°C", label: "Slight cold stress", value: 4 },
      { range: "9–26°C", label: "No thermal stress (comfortable)", value: 18 },
      { range: "26–32°C", label: "Moderate heat stress", value: 29 },
      { range: "32–38°C", label: "Strong heat stress", value: 35 },
      { range: "> 38°C", label: "Very strong heat stress", value: 42 },
    ],
  },
  utci_night: {
    id: "utci_night",
    source: "ERA5-HEAT v1.1, Copernicus Climate Data Store (2013–2022)",
    rawVariable:
      "Pre-computed UTCI from ERA5 air temperature, humidity, 10m wind, and surface radiation (mean radiant temperature)",
    derivation:
      "Same UTCI model as day. Daily minimum from hourly UTCI values — represents nighttime thermal comfort.",
    temporalAgg: "36 periods, daily min UTCI pooled across 10 years.",
    stats: "Pooled stats + Year Std.",
    ranges: [
      { range: "< −27°C", label: "Strong cold stress", value: -35 },
      { range: "−27 to −13°C", label: "Moderate cold stress", value: -20 },
      { range: "−13 to 0°C", label: "Slight cold stress", value: -6 },
      { range: "0–9°C", label: "No thermal stress", value: 4 },
      { range: "9–20°C", label: "Comfortable night", value: 14 },
      { range: "> 20°C", label: "Warm night — moderate heat stress", value: 25 },
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
    source: "ERA5 reanalysis via WeatherBench2 (2013–2021, 9 years)",
    rawVariable: "toa_incident_solar_radiation_6hr (J/m², top-of-atmosphere)",
    derivation:
      "How much sunlight energy reaches the top of the atmosphere above each location. Higher values mean longer, stronger sunshine (depends on latitude and season). Does not account for clouds — combine with Cloud Cover for a full picture.",
    temporalAgg: "36 periods, daily mean pooled across 9 years.",
    stats:
      "Pooled stats + Year Std. Higher = more potential sunshine. Actual ground-level sunshine depends on cloud cover.",
    ranges: [
      { range: "< 50 W/m²", label: "Very weak — polar winter, little daylight", value: 25 },
      { range: "50–150 W/m²", label: "Weak — short days or high latitude", value: 100 },
      { range: "150–250 W/m²", label: "Moderate — typical mid-latitude", value: 200 },
      { range: "250–350 W/m²", label: "Strong — long sunny days", value: 300 },
      { range: "> 350 W/m²", label: "Very strong — tropical / desert sun", value: 400 },
    ],
  },
  rainy_hours: {
    id: "rainy_hours",
    source: "ERA5 hourly reanalysis via CDS (2013–2022)",
    rawVariable: "total_precipitation (hourly, 0.25°)",
    derivation:
      "Fraction of all 24 hours per day with precipitation > 0.1mm (WMO trace threshold). 0.25 means ~6 hours of rain per day.",
    temporalAgg: "36 periods, daily fractions pooled across 10 years.",
    stats: "Pooled stats + Year Std. Median = typical day's rain fraction.",
    ranges: [
      { range: "< 0.05", label: "Very dry — under 1h rain/day", value: 0.02 },
      { range: "0.05–0.15", label: "Light — 1-3.5h rain/day", value: 0.10 },
      { range: "0.15–0.30", label: "Moderate — 3.5-7h rain/day", value: 0.22 },
      { range: "0.30–0.50", label: "Wet — 7-12h rain/day", value: 0.40 },
      { range: "> 0.50", label: "Very wet — over half the day", value: 0.70 },
    ],
  },
  rainy_hours_day: {
    id: "rainy_hours_day",
    source: "ERA5 hourly reanalysis via CDS (2013–2022)",
    rawVariable: "total_precipitation (hourly, 0.25°)",
    derivation:
      "Fraction of daytime hours (7AM–7PM local solar time) with precipitation > 0.1mm. Local solar time = UTC + lon/15. Most relevant for outdoor activities.",
    temporalAgg: "36 periods, daily fractions pooled across 10 years.",
    stats: "Pooled stats + Year Std.",
    ranges: [
      { range: "< 0.05", label: "Dry daytimes — under 30min rain", value: 0.02 },
      { range: "0.05–0.15", label: "Light — 1-2h daytime rain", value: 0.10 },
      { range: "0.15–0.30", label: "Moderate — 2-3.5h daytime rain", value: 0.22 },
      { range: "0.30–0.50", label: "Wet — 3.5-6h daytime rain", value: 0.40 },
      { range: "> 0.50", label: "Very wet daytimes", value: 0.70 },
    ],
  },
  rainy_hours_night: {
    id: "rainy_hours_night",
    source: "ERA5 hourly reanalysis via CDS (2013–2022)",
    rawVariable: "total_precipitation (hourly, 0.25°)",
    derivation:
      "Fraction of nighttime hours (7PM–7AM local solar time) with precipitation > 0.1mm.",
    temporalAgg: "36 periods, daily fractions pooled across 10 years.",
    stats: "Pooled stats + Year Std.",
    ranges: [
      { range: "< 0.05", label: "Dry nights", value: 0.02 },
      { range: "0.05–0.15", label: "Light — occasional night rain", value: 0.10 },
      { range: "0.15–0.30", label: "Moderate night rain", value: 0.22 },
      { range: "> 0.30", label: "Frequent night rain", value: 0.40 },
    ],
  },
  travel_safety: {
    id: "travel_safety",
    source: "Composite of US State Dept, Germany (Auswärtiges Amt), and Canada (Global Affairs)",
    rawVariable: "Advisory level 1–4 per country (averaged across sources)",
    derivation:
      "Each country is assigned advisory levels by three governments. The Goldilocks composite is the average of available sources, rounded to the nearest integer. Grid cells inherit the composite level of their country via spatial join on Natural Earth admin-0 boundaries. Border cells use the maximum risk among overlapping countries.",
    temporalAgg: "Static — does not vary by period. Same value for all time periods.",
    stats:
      "Single value per cell (all statistics are identical). Use in filters: e.g., travel_safety < 3 to exclude Level 3 and 4 countries.",
    ranges: [
      { range: "1", label: "Exercise Normal Precautions", value: 1 },
      { range: "2", label: "Exercise Increased Caution", value: 2 },
      { range: "3", label: "Reconsider Travel", value: 3 },
      { range: "4", label: "Do Not Travel", value: 4 },
    ],
  },
};
