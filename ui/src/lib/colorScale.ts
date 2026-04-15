type RGBA = [number, number, number, number];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(c1: number[], c2: number[], t: number): RGBA {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
    200,
  ];
}

function makeScaleFromStops(stops: number[][]): (t: number) => RGBA {
  return (t: number) => {
    t = Math.max(0, Math.min(1, t));
    const n = stops.length - 1;
    const idx = t * n;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, n);
    const frac = idx - lo;
    return lerpColor(stops[lo], stops[hi], frac);
  };
}

// Temperature palette aligned to comfort zones:
// < 0 freezing (deep blue) → 0-10 cold (light blue) → 10-18 cool (teal/cyan)
// → 18-25 comfortable (green) → 25-32 warm (yellow/orange) → 32-40 hot (red)
// → > 40 extreme (dark maroon)
const TEMP_COLOR_STOPS: [number, number, number, number][] = [
  [-50, 8,   48, 107],   // deep blue
  [-20, 33, 102, 172],   // medium blue
  [  0, 67, 147, 195],   // freezing boundary — steel blue
  [ 10, 130, 200, 220],  // cold/cool boundary — light cyan
  [ 18, 60, 180,  90],   // cool/comfortable boundary — green
  [ 22, 100, 195,  60],  // mid comfortable — bright green
  [ 25, 180, 200,  50],  // comfortable/warm boundary — lime
  [ 29, 240, 180,  40],  // warm — golden yellow
  [ 32, 230, 120,  50],  // warm/hot boundary — orange
  [ 36, 214,  70,  60],  // hot — red-orange
  [ 40, 178,  24,  43],  // hot/extreme boundary — deep red
  [ 50, 103,   0,  31],  // extreme — dark maroon
];

// Purple -> Teal -> Yellow
const viridis = makeScaleFromStops([
  [68, 1, 84],
  [59, 82, 139],
  [33, 144, 140],
  [93, 201, 98],
  [253, 231, 37],
]);

// White -> Blue
const blues = makeScaleFromStops([
  [240, 249, 255],
  [189, 215, 231],
  [107, 174, 214],
  [49, 130, 189],
  [8, 81, 156],
  [8, 48, 107],
]);

// White -> Purple (wind)
const windScale = makeScaleFromStops([
  [250, 245, 255],
  [203, 180, 228],
  [158, 120, 195],
  [118, 68, 170],
  [84, 39, 143],
  [63, 0, 110],
]);

// White -> Dark grey
const greys = makeScaleFromStops([
  [255, 255, 255],
  [189, 189, 189],
  [130, 130, 130],
  [82, 82, 82],
  [37, 37, 37],
]);

// Blue-green diverging: dry blue -> comfortable green -> muggy red
const dewPointScale = makeScaleFromStops([
  [49, 130, 189],
  [107, 174, 214],
  [100, 190, 130],
  [230, 180, 40],
  [214, 96, 77],
  [178, 24, 43],
]);

// Brown -> Teal (dry -> humid)
const humidityScale = makeScaleFromStops([
  [166, 115, 38],
  [210, 180, 120],
  [220, 220, 200],
  [130, 190, 180],
  [0, 130, 130],
]);

// Orange sequential: small range light -> large range dark
const orangeSeq = makeScaleFromStops([
  [255, 247, 220],
  [253, 212, 158],
  [240, 170, 80],
  [214, 120, 40],
  [170, 70, 10],
]);

// Dark -> Yellow (low -> high solar)
const solarScale = makeScaleFromStops([
  [50, 40, 60],
  [100, 80, 120],
  [180, 150, 50],
  [240, 210, 40],
  [255, 250, 150],
]);

// Volatility: white below normal, ramps purple above notable
const purpleRamp = makeScaleFromStops([
  [250, 245, 255],
  [200, 170, 230],
  [150, 100, 200],
  [110, 50, 170],
  [70, 10, 140],
  [45, 0, 95],
]);

// "normal" = below this fraction of max → white; "notable" = above this → purple ramps
const YSTD_NORMAL_FRAC = 0.4;

function volatilityToColor(value: number, min: number, max: number): RGBA {
  if (max <= min) return [255, 255, 255, 200];
  const normalThreshold = min + (max - min) * YSTD_NORMAL_FRAC;
  if (value <= normalThreshold) return [255, 255, 255, 200];
  const t = (value - normalThreshold) / (max - normalThreshold);
  return purpleRamp(Math.min(t, 1));
}

const SAFETY_COLORS: Record<number, RGBA> = {
  1: [34, 197, 94, 180],    // green
  2: [234, 179, 8, 180],    // yellow
  3: [249, 115, 22, 180],   // orange
  4: [220, 38, 38, 180],    // red
};

const PALETTES: Record<string, (t: number) => RGBA> = {
  wind_speed: windScale,
  precipitation: blues,
  rainy_hours: blues,
  rainy_hours_day: blues,
  rainy_hours_night: blues,
  cloud_cover: greys,
  dew_point: dewPointScale,
  relative_humidity: humidityScale,
  diurnal_range: orangeSeq,
  solar_radiation: solarScale,
};

function temperatureToColor(value: number): RGBA {
  const stops = TEMP_COLOR_STOPS;
  if (value <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3], 200];
  if (value >= stops[stops.length - 1][0])
    return [stops[stops.length - 1][1], stops[stops.length - 1][2], stops[stops.length - 1][3], 200];

  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      const [t0, r0, g0, b0] = stops[i - 1];
      const [t1, r1, g1, b1] = stops[i];
      const frac = (value - t0) / (t1 - t0);
      return [
        Math.round(r0 + frac * (r1 - r0)),
        Math.round(g0 + frac * (g1 - g0)),
        Math.round(b0 + frac * (b1 - b0)),
        200,
      ];
    }
  }
  return [103, 0, 31, 200];
}

const TEMP_VARIABLES = new Set([
  "temperature_day", "temperature_night",
  "apparent_temperature_day", "apparent_temperature_night",
  "utci_day", "utci_night",
  "dew_point",
]);

export const FIXED_DISPLAY_RANGE: Record<string, [number, number]> = {
  temperature_day: [-30, 45],
  temperature_night: [-30, 45],
  apparent_temperature_day: [-30, 45],
  apparent_temperature_night: [-30, 45],
  utci_day: [-30, 45],
  utci_night: [-30, 45],
  dew_point: [-30, 45],
  travel_safety: [1, 4],
};

export const YSTD_DISPLAY_MAX: Record<string, number> = {
  temperature_day: 4,
  temperature_night: 4,
  apparent_temperature_day: 4,
  apparent_temperature_night: 4,
  utci_day: 4,
  utci_night: 4,
  dew_point: 4,
  diurnal_range: 3,
  relative_humidity: 12,
  wind_speed: 2.5,
  precipitation: 5,
  cloud_cover: 0.10,
  solar_radiation: 30,
  rainy_hours: 0.12,
  rainy_hours_day: 0.12,
  rainy_hours_night: 0.12,
};

export function getColor(
  variable: string,
  value: number,
  min: number,
  max: number,
  stat?: string,
): RGBA {
  if (stat === "ystd") {
    return volatilityToColor(value, min, max);
  }
  if (variable === "travel_safety") {
    const level = Math.round(value);
    return SAFETY_COLORS[level] ?? [200, 200, 200, 160];
  }
  if (TEMP_VARIABLES.has(variable))
    return temperatureToColor(value);
  const palette = PALETTES[variable] ?? viridis;
  const t = max === min ? 0.5 : (value - min) / (max - min);
  return palette(t);
}

export { SAFETY_COLORS };

export const GRAY_COLOR: RGBA = [245, 245, 245, 160];

export function getGradientCSS(variable: string, min?: number, max?: number, steps = 20, stat?: string): string {
  const colors: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    let r: number, g: number, b: number;
    if (stat === "ystd") {
      const v = (min ?? 0) + frac * ((max ?? 5) - (min ?? 0));
      [r, g, b] = volatilityToColor(v, min ?? 0, max ?? 5);
    } else if (TEMP_VARIABLES.has(variable) && min != null && max != null) {
      const value = min + frac * (max - min);
      [r, g, b] = temperatureToColor(value);
    } else {
      const palette = PALETTES[variable] ?? viridis;
      [r, g, b] = palette(frac);
    }
    colors.push(`rgb(${r},${g},${b})`);
  }
  return `linear-gradient(to right, ${colors.join(", ")})`;
}
