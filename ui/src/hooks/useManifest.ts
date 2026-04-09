import { useState, useEffect } from "react";
import type { Manifest } from "../types";

let cached: Manifest | null = null;

export function useManifest() {
  const [manifest, setManifest] = useState<Manifest | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    fetch(`${import.meta.env.BASE_URL}tiles/manifest.json`)
      .then((r) => r.json())
      .then((m: Manifest) => {
        cached = m;
        setManifest(m);
        setLoading(false);
      });
  }, []);

  return { manifest, loading };
}
