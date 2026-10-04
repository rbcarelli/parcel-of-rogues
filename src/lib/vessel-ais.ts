import { createServerFn } from "@tanstack/react-start";
import { VESSEL_MMSI, type AisSnapshot, type TrackPoint } from "@/lib/chart-format";

const BASE = "https://ais.openwaters.io/v1/vessels";
const FINDER = "https://www.shipfinder.com/ship/detail/mmsi";
const STORE_MS = 12 * 60 * 60 * 1000;
const DRAW_MS = 6 * 60 * 60 * 1000;
const TTL_MS = 15_000;

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

type LiveFix = { lon: number; lat: number; sog: number | null; cog: number | null; seen: string };

function parseDegrees(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)[-\s°]+(\d+(?:\.\d+)?)\s*([NSEW])/i);
  if (!match) return null;
  const value = Number(match[1]) + Number(match[2]) / 60;
  const hemi = match[3]!.toUpperCase();
  return hemi === "S" || hemi === "W" ? -value : value;
}

function parseFinderTime(text: string): string | null {
  const match = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  let ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
  // ShipFinder prints Beijing time. A stamp hours ahead of UTC is that clock, not a future sight.
  if (ms - Date.now() > 20 * 60 * 1000) ms -= 8 * 60 * 60 * 1000;
  if (ms - Date.now() > 20 * 60 * 1000) return null;
  if (Date.now() - ms > 12 * 60 * 60 * 1000) return null;
  return new Date(ms).toISOString();
}

function field(html: string, id: string): string | null {
  const match = html.match(new RegExp(`id="${id}"[^>]*>([^<]+)`, "i"));
  if (!match) return null;
  return match[1]!.replace(/&#176;|&deg;/g, "°").replace(/\s+/g, " ").trim();
}

async function readShipFinder(mmsi: number): Promise<LiveFix | null> {
  const res = await fetch(`${FINDER}/${mmsi}`, {
    headers: {
      accept: "text/html",
      "user-agent": "Mozilla/5.0 (compatible; ParcelChart/1.0)",
    },
    signal: AbortSignal.timeout(8_000),
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();
  const latText = field(html, "ais-_lat");
  const lonText = field(html, "ais-_lon");
  if (!latText || !lonText) return null;
  const lat = parseDegrees(latText);
  const lon = parseDegrees(lonText);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const stamp = html.match(/reported at\s*<span[^>]*>([^<]+)/i)?.[1] ?? "";
  const seen = parseFinderTime(stamp);
  if (!seen) return null;
  const courseText = field(html, "ais-course_f");
  const speedText = field(html, "ais-_sog");
  const cog = courseText ? num(Number(courseText.match(/-?\d+(?:\.\d+)?/)?.[0])) : null;
  const sog = speedText ? num(Number(speedText.match(/-?\d+(?:\.\d+)?/)?.[0])) : null;
  return { lon, lat, sog, cog, seen };
}

function newerThan(candidate: string, current: string | null): boolean {
  if (!current) return true;
  return new Date(candidate).getTime() > new Date(current).getTime() + 30_000;
}

export const getVesselAis = createServerFn({ method: "GET" }).handler(async (): Promise<AisSnapshot> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const now = new Date();
  const from = new Date(now.getTime() - STORE_MS);
  const vesselUrl = `${BASE}/${VESSEL_MMSI}`;
  const trackUrl = `${vesselUrl}/track?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}&interval=5m`;

  try {
    const [vesselRaw, trackRaw, finder] = await Promise.all([
      readJson(vesselUrl),
      readJson(trackUrl).catch(() => null),
      readShipFinder(VESSEL_MMSI).catch(() => null),
    ]);
    const vessel = asRecord(vesselRaw);
    const geometry = asRecord(vessel?.geometry);
    const props = asRecord(vessel?.properties);
    const coords = geometry?.coordinates;
    let lon = Array.isArray(coords) ? num(coords[0]) : null;
    let lat = Array.isArray(coords) ? num(coords[1]) : null;
    if (lon == null || lat == null || !props) {
      throw new Error("The AIS feed has no position for Parcel of Rogues.");
    }
    let sog = num(props.sog);
    let cog = num(props.cog);
    let seen = str(props.seen);
    const attribution = [
      ...attributionOf(vessel?.attribution),
      ...attributionOf(asRecord(trackRaw)?.attribution),
    ].filter((line, i, all) => all.indexOf(line) === i);

    if (finder && newerThan(finder.seen, seen)) {
      const miles = Math.hypot((finder.lat - lat) * 60, (finder.lon - lon) * 60 * Math.cos((lat * Math.PI) / 180));
      const ageMs = seen ? Date.now() - new Date(seen).getTime() : STORE_MS;
      const reach = Math.min(250, 30 + (ageMs / 3_600_000) * 12);
      if (miles <= reach) {
        lon = finder.lon;
        lat = finder.lat;
        sog = finder.sog ?? sog;
        cog = finder.cog ?? cog;
        seen = finder.seen;
        attribution.push("Latest sight via ShipFinder");
      }
    }

    const archive = (trackRaw ? parseTrack(trackRaw) : []).filter((point) => {
      if (!point.time) return false;
      const at = new Date(point.time).getTime();
      return Number.isFinite(at) && at >= now.getTime() - STORE_MS;
    });
    const { rememberHours } = await import("@/lib/track-log.server");
    const history = await rememberHours(
      [...archive, { lon, lat, time: seen, sog, cog }],
      now.getTime(),
    );
    const track = withLiveFix(history, lon, lat, seen, sog, cog);

    const data: AisSnapshot = {
      name: str(props.name) ?? "PARCEL OF ROGUES",
      mmsi: VESSEL_MMSI,
      callsign: str(props.callsign),
      flag: str(props.flag),
      lengthM: num(props.length),
      beamM: num(props.beam),
      lon,
      lat,
      sog,
      cog,
      seen,
      track,
      attribution,
      fetchedAt: now.toISOString(),
      windowStart: new Date(now.getTime() - DRAW_MS).toISOString(),
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
