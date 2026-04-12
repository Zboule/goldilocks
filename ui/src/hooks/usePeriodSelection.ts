import { useReducer, useMemo, useCallback } from "react";

interface State {
  locked: Set<number>;
  active: number | null;
}

type Action =
  | { type: "CLICK"; period: number }
  | { type: "SET_ACTIVE"; period: number }
  | { type: "INIT"; period: number };

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

    default:
      return state;
  }
}

export function usePeriodSelection() {
  const [state, dispatch] = useReducer(reducer, {
    locked: new Set<number>(),
    active: null,
  });

  const selectedPeriods = useMemo(() => {
    const s = new Set(state.locked);
    if (state.active !== null) s.add(state.active);
    return Array.from(s).sort((a, b) => a - b);
  }, [state.locked, state.active]);

  const clickPeriod = useCallback((p: number) => dispatch({ type: "CLICK", period: p }), []);
  const setActive = useCallback((p: number) => dispatch({ type: "SET_ACTIVE", period: p }), []);
  const init = useCallback((p: number) => dispatch({ type: "INIT", period: p }), []);

  return {
    lockedPeriods: state.locked,
    activePeriod: state.active,
    selectedPeriods,
    clickPeriod,
    setActive,
    init,
  };
}
