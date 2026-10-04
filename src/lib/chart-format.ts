export const VESSEL_MMSI = 368169720;

export type TrackPoint = {
  lon: number;
  lat: number;
  time: string | null;
  sog: number | null;
  cog: number | null;
};

export type AisSnapshot = {
  name: string;
  mmsi: number;
  callsign: string | null;
  flag: string | null;
  lengthM: number | null;
  beamM: number | null;
  lon: number;
  lat: number;
  sog: number | null;
  cog: number | null;
  seen: string | null;
  track: TrackPoint[];
  attribution: string[];
  fetchedAt: string;
  windowStart: string;
  windowEnd: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm} UTC`;
}

export function formatAge(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 48) return m ? `${h}h ${m}m ago` : `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function formatDms(value: number, pos: string, neg: string): string {
  const hemi = value >= 0 ? pos : neg;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}° ${String(min).padStart(2, "0")}′ ${sec.toFixed(0).padStart(2, "0")}″ ${hemi}`;
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function courseLabel(cog: number | null): string {
  if (cog == null || !Number.isFinite(cog)) return "—";
  const wrapped = ((cog % 360) + 360) % 360;
  const name = POINTS[Math.round(wrapped / 22.5) % 16];
  return `${name} ${wrapped.toFixed(0)}°`;
}

export function formatSpeed(sog: number | null): string {
  if (sog == null || !Number.isFinite(sog)) return "—";
  return `${sog.toFixed(1)} kn`;
}

export function haversineNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3440.065;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function trackDistanceNm(points: TrackPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineNm(points[i - 1]!, points[i]!);
  }
  return sum;
}

export function flagName(flag: string | null): string {
  if (!flag) return "unknown flag";
  const names: Record<string, string> = { US: "United States", USA: "United States" };
  return names[flag.toUpperCase()] ?? flag;
}
