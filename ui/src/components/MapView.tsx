import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Deck } from "@deck.gl/core";
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
  onReady?: () => void;
}

const MapView = forwardRef<MapViewHandle, Props>(({ onHover, onReady }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const onHoverRef = useRef(onHover);
  const onReadyRef = useRef(onReady);
  const cellsRef = useRef<StaticCell[]>([]);
  const colorsRef = useRef<Uint8Array | null>(null);
  const colorVersionRef = useRef(0);
  onHoverRef.current = onHover;
  onReadyRef.current = onReady;

  useImperativeHandle(ref, () => ({
    setPolygons(cells: StaticCell[]) {
      cellsRef.current = cells;
      if (deckRef.current && colorsRef.current) {
        updateDeckLayer();
      }
    },
    updateColors(colors: Uint8Array, version: number) {
      colorsRef.current = colors;
      colorVersionRef.current = version;
      if (deckRef.current && cellsRef.current.length > 0) {
        updateDeckLayer();
      }
    },
  }), []);

  function updateDeckLayer() {
    if (!deckRef.current) return;
    const cells = cellsRef.current;
    const colors = colorsRef.current;
    const version = colorVersionRef.current;

    deckRef.current.setProps({
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
          updateTriggers: {
            getFillColor: [version],
          },
        }),
      ],
    });
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [20, 20],
      zoom: 2,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      const deck = new Deck({
        parent: containerRef.current!,
        style: {
          position: "absolute",
          top: "0",
          left: "0",
          pointerEvents: "none",
        },
        viewState: {
          longitude: map.getCenter().lng,
          latitude: map.getCenter().lat,
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        },
        controller: false,
        layers: [],
        getTooltip: () => null,
      });

      map.on("move", () => {
        deck.setProps({
          viewState: {
            longitude: map.getCenter().lng,
            latitude: map.getCenter().lat,
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch(),
          },
        });
      });

      map.getCanvas().addEventListener("mousemove", (e) => {
        const picked = deck.pickObject({
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

      deckRef.current = deck;
      mapRef.current = map;
      onReadyRef.current?.();
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current!);

    return () => {
      resizeObserver.disconnect();
      deckRef.current?.finalize();
      map.remove();
      mapRef.current = null;
      deckRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full relative" />;
});

MapView.displayName = "MapView";
export default MapView;
