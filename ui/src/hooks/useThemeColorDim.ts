import { useEffect, useRef } from "react";

// iOS Safari tints its chrome (status bar behind the notch + address bar) from
// the <meta name="theme-color"> tag. A dim backdrop only fades the webview, so
// the chrome stays white and Safari later snaps it to gray in one discrete step.
// Easing theme-color alongside the backdrop makes the chrome follow smoothly.

const BASE = "#ffffff";
// Composite of the sheet's bg-black/30 over white: round(255 * 0.7) = 178.
const LIGHT = [255, 255, 255];
const DIM = [178, 178, 178];

function mix(p: number): string {
  return (
    "#" +
    LIGHT.map((l, i) =>
      Math.round(l + (DIM[i] - l) * p)
        .toString(16)
        .padStart(2, "0"),
    ).join("")
  );
}

/**
 * Animates the theme-color meta tag between white and the dim-backdrop gray so
 * iOS Safari's chrome tracks a dimming sheet instead of flipping in one step.
 * `active` drives the direction; `duration` should match the backdrop fade.
 */
export function useThemeColorDim(active: boolean, duration = 300) {
  const progressRef = useRef(0); // 0 = light, 1 = dim

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;

    const from = progressRef.current;
    const to = active ? 1 : 0;
    let start: number | null = null;
    let raf = 0;

    const step = (ts: number) => {
      if (start === null) start = ts;
      const linear = Math.min(1, (ts - start) / duration);
      // ease-in-out (smoothstep) ≈ Tailwind's default transition curve
      const eased = linear * linear * (3 - 2 * linear);
      const p = from + (to - from) * eased;
      progressRef.current = p;
      meta.setAttribute("content", mix(p));
      if (linear < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, duration]);

  // Restore the base color if the owner unmounts mid-transition (the close
  // fade can race the sheet's unmount).
  useEffect(
    () => () => {
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", BASE);
    },
    [],
  );
}
