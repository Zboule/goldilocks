import { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Deck } from "@deck.gl/core";
import { PolygonLayer } from "@deck.gl/layers";
import type { GridCell } from "../types";

interface HoverInfo {
  index: number;
  x: number;
  y: number;
}

interface Props {
  cells: GridCell[];
  resolution: number;
  onHover?: (info: HoverInfo | null) => void;
}

export default function MapView({ cells, resolution, onHover }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  const updateDeck = useCallback(() => {
    if (!deckRef.current) return;

    deckRef.current.setProps({
      layers: [
        new PolygonLayer<GridCell>({
          id: "heatmap",
          data: cells,
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.color,
          getLineWidth: 0,
          stroked: false,
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          extruded: false,
        }),
      ],
    });
  }, [cells, resolution]);

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
          const cell = picked.object as GridCell;
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
      updateDeck();
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

  useEffect(() => {
    updateDeck();
  }, [updateDeck]);

  return <div ref={containerRef} className="w-full h-full relative" />;
}
