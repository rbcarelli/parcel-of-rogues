import { createServerFn } from "@tanstack/react-start";
import { VESSEL_MMSI, type AisSnapshot, type TrackPoint } from "@/lib/chart-format";

const BASE = "https://ais.openwaters.io/v1/vessels";
const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const TTL_MS = 40_000;

type Cache = { at: number; data: AisSnapshot };
let cache: Cache | null = null;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attributionOf(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const lines = Object.values(raw as Record<string, unknown>).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return [...new Set(lines)];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function readJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/geo+json, application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`AIS feed answered ${res.status}`);
  return res.json();
}

function parseTrack(raw: unknown): TrackPoint[] {
  const root = asRecord(raw);
  const geometry = asRecord(root?.geometry);
  const props = asRecord(root?.properties);
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords)) return [];
  const times = Array.isArray(props?.times) ? props.times : [];
  const sogs = Array.isArray(props?.sog) ? props.sog : [];
  const cogs = Array.isArray(props?.cog) ? props.cog : [];
  const points: TrackPoint[] = [];
  for (let i = 0; i < coords.length; i++) {
    const pair = coords[i];
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lon = num(pair[0]);
    const lat = num(pair[1]);
    if (lon == null || lat == null) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    points.push({
      lon,
      lat,
      time: str(times[i]),
      sog: num(sogs[i]),
      cog: num(cogs[i]),
    });
  }
  return points;
}

function withLiveFix(track: TrackPoint[], lon: number, lat: number, seen: string | null, sog: number | null, cog: number | null): TrackPoint[] {
  const last = track[track.length - 1];
  if (!last) return [{ lon, lat, time: seen, sog, cog }];
  const sameSpot = Math.abs(last.lon - lon) < 0.0004 && Math.abs(last.lat - lat) < 0.0004;
  if (sameSpot) return track;
  return [...track, { lon, lat, time: seen, sog, cog }];
}

export const getVesselAis = createServerFn({ method: "GET" }).handler(async (): Promise<AisSnapshot> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_MS);
  const vesselUrl = `${BASE}/${VESSEL_MMSI}`;
  const trackUrl = `${vesselUrl}/track?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}&interval=2m`;

  try {
    const [vesselRaw, trackRaw] = await Promise.all([
      readJson(vesselUrl),
      readJson(trackUrl).catch(() => null),
    ]);
    const vessel = asRecord(vesselRaw);
    const geometry = asRecord(vessel?.geometry);
    const props = asRecord(vessel?.properties);
    const coords = geometry?.coordinates;
    const lon = Array.isArray(coords) ? num(coords[0]) : null;
    const lat = Array.isArray(coords) ? num(coords[1]) : null;
    if (lon == null || lat == null || !props) {
      throw new Error("The AIS feed has no position for Parcel of Rogues.");
    }

    const track = withLiveFix(
      trackRaw ? parseTrack(trackRaw) : [],
      lon,
      lat,
      str(props.seen),
      num(props.sog),
      num(props.cog),
    );

    const data: AisSnapshot = {
      name: str(props.name) ?? "PARCEL OF ROGUES",
      mmsi: VESSEL_MMSI,
      callsign: str(props.callsign),
      flag: str(props.flag),
      lengthM: num(props.length),
      beamM: num(props.beam),
      lon,
      lat,
      sog: num(props.sog),
      cog: num(props.cog),
      seen: str(props.seen),
      track,
      attribution: [
        ...attributionOf(vessel?.attribution),
        ...attributionOf(asRecord(trackRaw)?.attribution),
      ].filter((line, i, all) => all.indexOf(line) === i),
      fetchedAt: now.toISOString(),
      windowStart: from.toISOString(),
      windowEnd: now.toISOString(),
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    if (cache) return cache.data;
    const message = error instanceof Error ? error.message : "AIS lookup failed";
    throw new Error(message);
  }
});
