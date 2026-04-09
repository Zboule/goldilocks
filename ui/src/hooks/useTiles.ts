import { useState, useEffect, useRef } from "react";
import type { TileRequest } from "../types";
import { fetchTile, getCached, getManifestVersion } from "../lib/tileCache";

export function useTiles(requests: TileRequest[], period: number, manifestReady = false) {
  const [tiles, setTiles] = useState<Map<string, Float32Array>>(new Map());
  const [loading, setLoading] = useState(true);
  const versionRef = useRef(0);

  useEffect(() => {
    if (requests.length === 0) {
      setTiles(new Map());
      setLoading(false);
      return;
    }

    const version = ++versionRef.current;
    setLoading(true);

    const alreadyCached = new Map<string, Float32Array>();
    const toFetch: TileRequest[] = [];

    for (const req of requests) {
      const key = `${req.variable}/${req.stat}`;
      const cached = getCached(req.variable, req.stat, period);
      if (cached) {
        alreadyCached.set(key, cached);
      } else {
        toFetch.push(req);
      }
    }

    if (toFetch.length === 0) {
      setTiles(alreadyCached);
      setLoading(false);
      return;
    }

    Promise.all(
      toFetch.map((req) =>
        fetchTile(req.variable, req.stat, period).then(
          (data) => [req, data] as const,
        ),
      ),
    ).then((results) => {
      if (version !== versionRef.current) return;
      const merged = new Map(alreadyCached);
      for (const [req, data] of results) {
        merged.set(`${req.variable}/${req.stat}`, data);
      }
      setTiles(merged);
      setLoading(false);
    });
  }, [requests, period, manifestReady]);

  return { tiles, loading, allLoaded: !loading };
}
