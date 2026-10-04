import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TrackPoint } from "@/lib/chart-format";

const SLOT_MS = 15 * 60 * 1000;
const STORE_MS = 12 * 60 * 60 * 1000;
const DRAW_MS = 6 * 60 * 60 * 1000;
const FILE = path.join(process.cwd(), "data", "vessel-hours.json");

type StoredFix = TrackPoint & { slot: number; time: string };

const memory = globalThis as typeof globalThis & { __vesselSlots?: StoredFix[] };

function slotOf(iso: string): number | null {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.floor(at / SLOT_MS);
}

function normalize(row: {
  time?: string | null;
  lon?: number;
  lat?: number;
  sog?: number | null;
  cog?: number | null;
}): StoredFix | null {
  if (!row.time || typeof row.lon !== "number" || typeof row.lat !== "number") return null;
  const slot = slotOf(row.time);
  if (slot == null) return null;
  return {
    slot,
    lon: row.lon,
    lat: row.lat,
    time: row.time,
    sog: typeof row.sog === "number" ? row.sog : null,
    cog: typeof row.cog === "number" ? row.cog : null,
  };
}

async function readLog(): Promise<StoredFix[]> {
  if (memory.__vesselSlots) return memory.__vesselSlots;
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8")) as { slots?: unknown[]; hours?: unknown[] };
    const rows = Array.isArray(raw.slots) ? raw.slots : Array.isArray(raw.hours) ? raw.hours : [];
    memory.__vesselSlots = rows
      .map((row) => (row && typeof row === "object" ? normalize(row as StoredFix) : null))
      .filter((row): row is StoredFix => row != null);
    return memory.__vesselSlots;
  } catch {
    memory.__vesselSlots = [];
    return memory.__vesselSlots;
  }
}

async function writeLog(slots: StoredFix[]): Promise<void> {
  memory.__vesselSlots = slots;
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify({ slots }));
  } catch {
    /* the in-memory log still serves this process */
  }
}

/** Keep one fix per 15 minutes for 12 hours. Return the last 6 hours, oldest first. */
export async function rememberHours(points: TrackPoint[], nowMs: number): Promise<TrackPoint[]> {
  const minSlot = Math.floor((nowMs - STORE_MS) / SLOT_MS);
  const bySlot = new Map<number, StoredFix>();
  for (const row of await readLog()) {
    const fresh = normalize(row);
    if (fresh && fresh.slot >= minSlot) bySlot.set(fresh.slot, fresh);
  }
  for (const point of points) {
    const fresh = normalize(point);
    if (!fresh || fresh.slot < minSlot) continue;
    const prev = bySlot.get(fresh.slot);
    if (prev && prev.time > fresh.time) continue;
    bySlot.set(fresh.slot, fresh);
  }
  const kept = [...bySlot.values()].sort((a, b) => a.slot - b.slot);
  await writeLog(kept);
  const drawAfter = nowMs - DRAW_MS;
  return kept
    .filter((row) => new Date(row.time).getTime() >= drawAfter)
    .map(({ lon, lat, time, sog, cog }) => ({ lon, lat, time, sog, cog }));
}
