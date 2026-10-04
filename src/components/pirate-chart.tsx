import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Route } from "lucide-react";
import { drawChartInk } from "@/components/chart-ink";
import { type AisSnapshot } from "@/lib/chart-format";
import { vintageStyle } from "@/lib/vintage-style";
import { getVesselAis } from "@/lib/vessel-ais";
import "maplibre-gl/dist/maplibre-gl.css";

type LngLatBoundsLike = [[number, number], [number, number]];

type MapHandle = {
  resize: () => void;
  remove: () => void;
  project: (lngLat: [number, number]) => { x: number; y: number };
  getBounds: () => { getWest: () => number; getSouth: () => number; getEast: () => number; getNorth: () => number };
  fitBounds: (bounds: LngLatBoundsLike, options: Record<string, unknown>) => void;
  jumpTo: (options: { center: [number, number]; zoom: number }) => void;
  zoomIn: (options?: { duration: number }) => void;
  zoomOut: (options?: { duration: number }) => void;
  panBy: (offset: [number, number], options?: { duration: number }) => void;
  getZoom: () => number;
  unproject: (point: [number, number]) => { lng: number; lat: number };
  easeTo: (options: {
    zoom?: number;
    around?: { lng: number; lat: number };
    duration?: number;
  }) => void;
  stop: () => void;
  on: (event: string, handler: () => void) => void;
  once: (event: string, handler: () => void) => void;
  touchZoomRotate: { disableRotation: () => void };
};

function sheetPadding() {
  const narrow = window.innerWidth < 720;
  if (narrow) return { top: 88, bottom: 36, left: 28, right: 28 };
  return { top: 72, bottom: 64, left: 48, right: 140 };
}

function wakeBounds(snap: AisSnapshot): LngLatBoundsLike {
  const coords = snap.track.map((p) => [p.lon, p.lat] as [number, number]);
  coords.push([snap.lon, snap.lat]);
  let west = coords[0]![0];
  let east = west;
  let south = coords[0]![1];
  let north = south;
  for (const [lon, lat] of coords) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const padLon = Math.max(0.42, (east - west) * 1.6);
  const padLat = Math.max(0.32, (north - south) * 1.4);
  return [
    [west - padLon, south - padLat],
    [east + padLon * 0.45, north + padLat],
  ];
}

export function PirateChart({ initial }: { initial: AisSnapshot }) {
  const mapNode = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const dataRef = useRef(initial);
  const shipRef = useRef<HTMLImageElement | null>(null);
  const [data, setData] = useState(initial);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const img = new Image();
    img.src = "/chart/sloop.png";
    shipRef.current = img;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let map: MapHandle | null = null;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const fit = (duration: number) => {
      const current = mapRef.current;
      if (!current) return;
      const snap = dataRef.current;
      if (snap.track.length < 2) {
        current.jumpTo({ center: [snap.lon, snap.lat], zoom: 10 });
        return;
      }
      current.fitBounds(wakeBounds(snap), { padding: sheetPadding(), maxZoom: 11.2, duration });
    };

    const draw = (time: number) => {
      const canvas = canvasRef.current;
      const current = mapRef.current;
      const frame = frameRef.current;
      if (!canvas || !current) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const b = current.getBounds();
      drawChartInk(
        ctx,
        rect.width,
        rect.height,
        (lon, lat) => current.project([lon, lat]),
        { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        dataRef.current,
        shipRef.current,
        time,
        reduce,
      );
      if (frame) {
        frame.dataset.zoom = current.getZoom().toFixed(2);
        frame.dataset.west = b.getWest().toFixed(3);
      }
    };

    const loop = (time: number) => {
      draw(time);
      raf = window.requestAnimationFrame(loop);
    };

    void (async () => {
      const maplibregl = await import("maplibre-gl");
      maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
      if (cancelled || !mapNode.current) return;
      const snap = dataRef.current;
      const created = new maplibregl.Map({
        container: mapNode.current,
        style: vintageStyle,
        center: [snap.lon, snap.lat],
        zoom: 9,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 0,
        maxZoom: 16,
        minZoom: 2,
      });
      created.touchZoomRotate.disableRotation();
      map = created;
      mapRef.current = created;
      created.once("load", () => {
        if (cancelled) return;
        created.resize();
        fit(0);
      });
      raf = window.requestAnimationFrame(loop);
    })();

    const onResize = () => mapRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    const pull = async () => {
      try {
        const next = await getVesselAis();
        if (stopped) return;
        dataRef.current = next;
        setData(next);
      } catch {
        /* keep the last good sight */
      }
    };
    const id = window.setInterval(() => void pull(), 60_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  const showWake = () => {
    const map = mapRef.current;
    if (!map) return;
    const snap = dataRef.current;
    if (snap.track.length < 2) {
      map.jumpTo({ center: [snap.lon, snap.lat], zoom: 10 });
      return;
    }
    map.fitBounds(wakeBounds(snap), { padding: sheetPadding(), maxZoom: 12, duration: 700 });
  };

  const gestureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = gestureRef.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number } | null = null;

    const pointInMap = (clientX: number, clientY: number): [number, number] => {
      const rect = el.getBoundingClientRect();
      return [clientX - rect.left, clientY - rect.top];
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      el.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinch = {
          dist: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) || 1,
          zoom: mapRef.current?.getZoom() ?? 8,
        };
      }
    };

    const onMove = (event: PointerEvent) => {
      const prev = pointers.get(event.pointerId);
      if (!prev) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const map = mapRef.current;
      if (!map) return;
      if (pointers.size >= 2 && pinch) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) || 1;
        const zoom = Math.min(16, Math.max(2, pinch.zoom + Math.log2(dist / pinch.dist)));
        const midX = (pts[0]!.x + pts[1]!.x) / 2;
        const midY = (pts[0]!.y + pts[1]!.y) / 2;
        map.stop();
        map.easeTo({
          zoom,
          around: map.unproject(pointInMap(midX, midY)),
          duration: 0,
        });
        return;
      }
      map.panBy([prev.x - event.clientX, prev.y - event.clientY], { duration: 0 });
    };

    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const map = mapRef.current;
      if (!map) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const zoom = Math.min(16, Math.max(2, map.getZoom() - event.deltaY * unit * 0.0016));
      map.stop();
      map.easeTo({
        zoom,
        around: map.unproject(pointInMap(event.clientX, event.clientY)),
        duration: 0,
      });
    };

    const onDouble = (event: MouseEvent) => {
      event.preventDefault();
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({
        zoom: Math.min(16, map.getZoom() + 1),
        around: map.unproject(pointInMap(event.clientX, event.clientY)),
        duration: 220,
      });
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDouble);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDouble);
    };
  }, []);

  return (
    <main className="chart-app">
      <section ref={frameRef} className="chart-sheet">
        <div ref={mapNode} className="chart-map" />
        <div className="chart-stain" aria-hidden="true" />
        <canvas ref={canvasRef} className="chart-ink" />
        <img className="chart-serpent" src="/chart/serpent.png" alt="" />
        <img className="chart-compass" src="/chart/compass.png" alt="" />
        <div className="chart-frame" aria-hidden="true" />
        <div ref={gestureRef} className="chart-gestures" aria-label="Chart. Drag to pan, scroll or pinch to zoom." />

        <div className="chart-tools">
          <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn({ duration: 200 })}>
            <Plus aria-hidden="true" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut({ duration: 200 })}>
            <Minus aria-hidden="true" />
          </button>
          <button type="button" aria-label="Show the wake" onClick={showWake}>
            <Route aria-hidden="true" />
          </button>
        </div>

        <p className="chart-credit">
          AIS broadcasts
          {data.attribution[0] ? ` · ${data.attribution[0]}` : " · AISHub via Open Waters"}
          {" · Chart © OpenMapTiles © OpenStreetMap"}
        </p>
      </section>
    </main>
  );
}
