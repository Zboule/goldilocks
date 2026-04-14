import { useState, useEffect } from "react";
import { onInflightChange, getInflightPeriods } from "../lib/tileCache";

export function useInflightPeriods(): Set<number> {
  const [periods, setPeriods] = useState<Set<number>>(() => getInflightPeriods());

  useEffect(() => {
    return onInflightChange(() => {
      setPeriods(getInflightPeriods());
    });
  }, []);

  return periods;
}
