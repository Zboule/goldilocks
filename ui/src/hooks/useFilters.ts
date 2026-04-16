import { useState, useCallback } from "react";
import type { Filter } from "../types";

let nextId = 1;

export function useFilters() {
  const [filters, setFilters] = useState<Filter[]>([]);

  const addFilter = useCallback(
    (defaults?: Partial<Filter>) => {
      const id = `f${nextId++}`;
      setFilters((prev) => [
        ...prev,
        {
          id,
          variable: "utci_day",
          stat: "mean",
          operator: ">",
          value: 0,
          ...defaults,
        },
      ]);
    },
    [],
  );

  const removeFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateFilter = useCallback((id: string, patch: Partial<Filter>) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, []);

  const loadPreset = useCallback((presetFilters: Omit<Filter, "id">[]) => {
    setFilters(
      presetFilters.map((f) => ({ ...f, id: `f${nextId++}` })),
    );
  }, []);

  return { filters, addFilter, removeFilter, updateFilter, clearFilters, loadPreset };
}
