import { useReducer, useMemo, useCallback } from "react";

interface State {
  locked: Set<number>;
  active: number | null;
}

type Action =
  | { type: "CLICK"; period: number }
  | { type: "SET_ACTIVE"; period: number }
  | { type: "INIT"; period: number }
  | { type: "LOCK_ALL"; periods: number[] }
  | { type: "CLEAR_LOCKED" }
  | { type: "CLEAR_ACTIVE" }
  | { type: "TOGGLE_GROUP"; periods: number[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT": {
      if (state.active !== null || state.locked.size > 0) return state;
      return { ...state, active: action.period };
    }

    case "SET_ACTIVE": {
      return { ...state, active: action.period };
    }

    case "CLICK": {
      const p = action.period;

      if (state.locked.has(p)) {
        const next = new Set(state.locked);
        next.delete(p);
        if (next.size === 0 && state.active === null) {
          return { locked: next, active: p };
        }
        return { ...state, locked: next };
      }

      if (state.active === p) {
        const next = new Set(state.locked);
        next.add(p);
        return { locked: next, active: null };
      }

      return { ...state, active: p };
    }

    case "LOCK_ALL": {
      return { locked: new Set(action.periods), active: null };
    }

    case "CLEAR_LOCKED": {
      const first = state.active ?? (state.locked.size > 0 ? Math.min(...state.locked) : null);
      return { locked: new Set(), active: first };
    }

    // Drop the preview period (e.g. after Play stops, so the animation's
    // landing point doesn't silently join a locked selection).
    case "CLEAR_ACTIVE": {
      if (state.active === null) return state;
      if (state.locked.size === 0) return state; // keep something selected
      return { ...state, active: null };
    }

    // Lock a whole group (month) at once; if all already locked, unlock them.
    case "TOGGLE_GROUP": {
      const allLocked = action.periods.every((p) => state.locked.has(p));
      const next = new Set(state.locked);
      if (allLocked) {
        for (const p of action.periods) next.delete(p);
        if (next.size === 0 && state.active === null) {
          return { locked: next, active: action.periods[0] };
        }
        return { ...state, locked: next };
      }
      for (const p of action.periods) next.add(p);
      const active = state.active !== null && next.has(state.active) ? null : state.active;
      return { locked: next, active };
    }

    default:
      return state;
  }
}

export function usePeriodSelection(initial?: { locked?: number[]; active?: number | null }) {
  const [state, dispatch] = useReducer(reducer, initial, (i) => ({
    locked: new Set<number>(i?.locked ?? []),
    active: i?.active ?? null,
  }));

  const selectedPeriods = useMemo(() => {
    const s = new Set(state.locked);
    if (state.active !== null) s.add(state.active);
    return Array.from(s).sort((a, b) => a - b);
  }, [state.locked, state.active]);

  const clickPeriod = useCallback((p: number) => dispatch({ type: "CLICK", period: p }), []);
  const setActive = useCallback((p: number) => dispatch({ type: "SET_ACTIVE", period: p }), []);
  const init = useCallback((p: number) => dispatch({ type: "INIT", period: p }), []);
  const lockAll = useCallback((periods: number[]) => dispatch({ type: "LOCK_ALL", periods }), []);
  const clearLocked = useCallback(() => dispatch({ type: "CLEAR_LOCKED" }), []);
  const clearActive = useCallback(() => dispatch({ type: "CLEAR_ACTIVE" }), []);
  const toggleGroup = useCallback((periods: number[]) => dispatch({ type: "TOGGLE_GROUP", periods }), []);

  return {
    lockedPeriods: state.locked,
    activePeriod: state.active,
    selectedPeriods,
    clickPeriod,
    setActive,
    init,
    lockAll,
    clearLocked,
    clearActive,
    toggleGroup,
  };
}
