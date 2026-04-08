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

// Temperature palette defined at fixed °C values
// Each entry: [temperature, R, G, B]
const TEMP_COLOR_STOPS: [number, number, number, number][] = [
  [-50, 8,   48,  107],
  [-20, 33,  102, 172],
  [ -5, 67,  147, 195],
  [  5, 146, 197, 222],
  [ 12, 100, 190, 130],
  [ 17, 45,  160, 75],
  [ 22, 120, 185, 50],
  [ 27, 230, 180, 40],
  [ 32, 214, 96,  77],
  [ 38, 178, 24,  43],
  [ 50, 103, 0,   31],
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

// Dark -> Orange -> Yellow (sunshine)
const ylOrBr = makeScaleFromStops([
  [100, 80, 60],
  [166, 115, 38],
  [230, 171, 2],
  [253, 212, 98],
  [255, 247, 188],
]);

// White -> Dark grey
const greys = makeScaleFromStops([
  [255, 255, 255],
  [189, 189, 189],
  [130, 130, 130],
  [82, 82, 82],
  [37, 37, 37],
]);

const PALETTES: Record<string, (t: number) => RGBA> = {
  wind_speed: viridis,
  precipitation: blues,
  rainy_days: blues,
  sunshine: ylOrBr,
  cloud_cover: greys,
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

export function getColor(
  variable: string,
  value: number,
  min: number,
  max: number,
): RGBA {
  if (variable === "temperature_day" || variable === "temperature_night")
    return temperatureToColor(value);
  const palette = PALETTES[variable] ?? viridis;
  const t = max === min ? 0.5 : (value - min) / (max - min);
  return palette(t);
}

export const GRAY_COLOR: RGBA = [245, 245, 245, 160];

export function getGradientCSS(variable: string, min?: number, max?: number, steps = 20): string {
  const colors: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    let r: number, g: number, b: number;
    if ((variable === "temperature_day" || variable === "temperature_night") && min != null && max != null) {
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
