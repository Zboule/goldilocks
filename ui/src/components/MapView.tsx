import { useRef, useState, useEffect, useImperativeHandle, forwardRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PolygonLayer } from "@deck.gl/layers";
import type { StaticCell } from "../hooks/useStaticGrid";

interface HoverInfo {
  index: number;
  x: number;
  y: number;
}

export interface MapViewHandle {
  setPolygons: (cells: StaticCell[]) => void;
  updateColors: (colors: Uint8Array, version: number) => void;
}

interface Props {
  onHover?: (info: HoverInfo | null) => void;
  onClick?: () => void;
  onReady?: () => void;
}

const MapView = forwardRef<MapViewHandle, Props>(({ onHover, onClick, onReady }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [attribOpen, setAttribOpen] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const onHoverRef = useRef(onHover);
  const onClickRef = useRef(onClick);
  const onReadyRef = useRef(onReady);
  const cellsRef = useRef<StaticCell[]>([]);
  const colorsRef = useRef<Uint8Array | null>(null);
  const colorVersionRef = useRef(0);
  onHoverRef.current = onHover;
  onClickRef.current = onClick;
  onReadyRef.current = onReady;

  useImperativeHandle(ref, () => ({
    setPolygons(cells: StaticCell[]) {
      cellsRef.current = cells;
      if (overlayRef.current && colorsRef.current) {
        updateDeckLayer();
      }
    },
    updateColors(colors: Uint8Array, version: number) {
      colorsRef.current = colors;
      colorVersionRef.current = version;
      if (overlayRef.current && cellsRef.current.length > 0) {
        updateDeckLayer();
      }
    },
  }), []);

  function updateDeckLayer() {
    if (!overlayRef.current) return;
    const cells = cellsRef.current;
    const colors = colorsRef.current;
    const version = colorVersionRef.current;

    overlayRef.current.setProps({
      layers: [
        new PolygonLayer<StaticCell>({
          id: "heatmap",
          data: cells,
          getPolygon: (d) => d.polygon,
          getFillColor: (_d, { index }) => {
            if (!colors) return [0, 0, 0, 0];
            const off = index * 4;
            return [colors[off], colors[off + 1], colors[off + 2], colors[off + 3]];
          },
          getLineWidth: 0,
          stroked: false,
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          extruded: false,
          // @ts-expect-error beforeId is valid for MapboxOverlay interleaved mode
          beforeId: firstLabelLayerRef.current ?? undefined,
          updateTriggers: {
            getFillColor: [version],
          },
        }),
      ],
    });
  }

  const firstLabelLayerRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    fetch("https://tiles.openfreemap.org/styles/positron")
      .then((res) => res.json())
      .then((style) => {
        if (cancelled || !containerRef.current) return;

        const englishName = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];

        for (const layer of style.layers) {
          if (layer.type !== "symbol" || !layer.layout?.["text-field"]) continue;
          layer.layout["text-field"] = englishName;

          const id = layer.id as string;
          if (id.startsWith("label_country")) {
            layer.layout["text-transform"] = "uppercase";
            layer.layout["text-letter-spacing"] = 0.15;
            layer.paint = {
              ...layer.paint,
              "text-color": "#333",
              "text-halo-color": "rgba(255,255,255,0.4)",
              "text-halo-width": 1.5,
              "text-halo-blur": 0,
            };
          } else if (id === "label_state") {
            layer.layout["visibility"] = "none";
          } else if (id.startsWith("label_city") || id === "label_town" || id === "label_village") {
            layer.paint = {
              ...layer.paint,
              "text-color": "#777",
              "text-halo-color": "rgba(255,255,255,0.4)",
              "text-halo-width": 1,
              "text-halo-blur": 0.5,
            };
          }
        }

        const firstSymbol = style.layers.find((l: { type: string }) => l.type === "symbol");
        if (firstSymbol) firstLabelLayerRef.current = firstSymbol.id;

        const MIN_LAT = -62;
        const MAX_LAT = 85;

        const latToMercY = (lat: number) =>
          0.5 - (0.25 * Math.log((1 + Math.sin(lat * Math.PI / 180)) / (1 - Math.sin(lat * Math.PI / 180)))) / Math.PI;

        const mercYToLat = (y: number) =>
          (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;

        const map = new maplibregl.Map({
          container: containerRef.current!,
          style,
          center: [20, 20],
          zoom: 2,
          attributionControl: false,
          transformConstrain: (lngLat, zoom) => {
            const viewportH = containerRef.current?.clientHeight ?? 600;

            const topY = latToMercY(MAX_LAT);
            const botY = latToMercY(MIN_LAT);
            const boundsSpan = botY - topY;

            const minZoomForBounds = Math.log2(viewportH / (boundsSpan * 512));
            const clampedZoom = Math.max(zoom, minZoomForBounds);

            const worldSize = 512 * Math.pow(2, clampedZoom);
            const mercOffset = (viewportH / 2) / worldSize;

            const minCenterY = topY + mercOffset;
            const maxCenterY = botY - mercOffset;

            let clampedLat: number;
            if (minCenterY >= maxCenterY) {
              clampedLat = mercYToLat((topY + botY) / 2);
            } else {
              const centerY = latToMercY(lngLat.lat);
              clampedLat = mercYToLat(Math.max(minCenterY, Math.min(maxCenterY, centerY)));
            }

            return {
              center: new maplibregl.LngLat(lngLat.lng, clampedLat),
              zoom: clampedZoom,
            };
          },
        });

        map.addControl(new maplibregl.NavigationControl(), "top-right");

        const overlay = new MapboxOverlay({
          interleaved: true,
          layers: [],
        });
        map.addControl(overlay);

        map.on("load", () => {
          map.getCanvas().addEventListener("mousemove", (e) => {
            const picked = overlay.pickObject({
              x: e.offsetX,
              y: e.offsetY,
              radius: 0,
            });
            if (picked?.object) {
              const cell = picked.object as StaticCell;
              onHoverRef.current?.({
                index: cell.index,
                x: e.clientX,
                y: e.clientY,
              });
            } else {
              onHoverRef.current?.(null);
            }
          });

          map.getCanvas().addEventListener("mouseleave", () => {
            onHoverRef.current?.(null);
          });

          map.getCanvas().addEventListener("click", () => {
            onClickRef.current?.();
          });

          overlayRef.current = overlay;
          mapRef.current = map;
          onReadyRef.current?.();
        });

        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(containerRef.current!);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (overlayRef.current) overlayRef.current.finalize();
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-0 right-0 z-10 flex items-end gap-1 p-1">
        {attribOpen && (
          <div className="bg-white/60 text-[10px] text-gray-500 px-2 py-1 rounded shadow">
            © <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline">OpenFreeMap</a>
            {" · "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap</a>
          </div>
        )}
        <button
          onClick={() => setAttribOpen((v) => !v)}
          className="w-6 h-6 bg-white/60 rounded-full text-gray-400 hover:text-gray-700 text-sm flex items-center justify-center shadow cursor-pointer"
          title="Attribution"
        >
          ⓘ
        </button>
      </div>
    </div>
  );
});

MapView.displayName = "MapView";
export default MapView;
