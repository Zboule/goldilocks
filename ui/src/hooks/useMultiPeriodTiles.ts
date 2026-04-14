import { useState, useEffect, useRef } from "react";
import type { TileRequest } from "../types";
import { fetchTile, getCached } from "../lib/tileCache";

/**
 * Fetches tiles for multiple periods in parallel.
 * Returns a map of "variable/stat" → Float32Array[] (one per period, in order).
 */
export function useMultiPeriodTiles(
  requests: TileRequest[],
  periods: number[],
  manifestReady: boolean,
) {
  const [tilesPerPeriod, setTilesPerPeriod] = useState<Map<string, Float32Array[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const versionRef = useRef(0);

  useEffect(() => {
    if (requests.length === 0 || periods.length === 0 || !manifestReady) {
      setLoading(false);
      return;
    }

    // Fast sync path: if everything is cached, skip async entirely
    let allCached = true;
    const grouped = new Map<string, Float32Array[]>();
    for (const req of requests) {
      const key = `${req.variable}/${req.stat}`;
      const tilesForReq: Float32Array[] = [];
      for (const period of periods) {
        const cached = getCached(req.variable, req.stat, period);
        if (cached) {
          tilesForReq.push(cached);
        } else {
          allCached = false;
          break;
        }
      }
      if (!allCached) break;
      grouped.set(key, tilesForReq);
    }

    if (allCached) {
      setTilesPerPeriod(grouped);
      setLoading(false);
      return;
    }

    // Async path: some tiles need fetching
    const version = ++versionRef.current;
    setLoading(true);

    const allPromises: Promise<{ req: TileRequest; period: number; data: Float32Array }>[] = [];

    for (const req of requests) {
      for (const period of periods) {
        const cached = getCached(req.variable, req.stat, period);
        if (cached) {
          allPromises.push(Promise.resolve({ req, period, data: cached }));
        } else {
          allPromises.push(
            fetchTile(req.variable, req.stat, period).then((data) => ({
              req,
              period,
              data,
            })),
          );
        }
      }
    }

    Promise.all(allPromises).then((results) => {
      if (version !== versionRef.current) return;

      const asyncGrouped = new Map<string, Float32Array[]>();
      for (const req of requests) {
        const key = `${req.variable}/${req.stat}`;
        const tilesForReq: Float32Array[] = [];
        for (const period of periods) {
          const match = results.find(
            (r) => r.req.variable === req.variable && r.req.stat === req.stat && r.period === period,
          );
          if (match) tilesForReq.push(match.data);
        }
        asyncGrouped.set(key, tilesForReq);
      }

      setTilesPerPeriod(asyncGrouped);
      setLoading(false);
    });
  }, [requests, periods, manifestReady]);

  return { tilesPerPeriod, loading };
}
