import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)";

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/** True below Tailwind's `md` breakpoint — matches the CSS mobile layout. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
