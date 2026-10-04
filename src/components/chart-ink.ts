import { courseLabel, formatSpeed, type AisSnapshot, type TrackPoint } from "@/lib/chart-format";
import { SEA_BEASTS } from "@/lib/sea-beasts";

export type Projector = (lon: number, lat: number) => { x: number; y: number } | null;

const CYCLE_MS = 6000;

export function penPhase(now: number, reduceMotion: boolean): { progress: number; alpha: number } {
  if (reduceMotion) return { progress: 1, alpha: 1 };
  const phase = (now % CYCLE_MS) / CYCLE_MS;
  const eased = 1 - (1 - phase) ** 2;
  return { progress: eased, alpha: 1 };
}

function niceStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const target = span / 4;
  const pow = 10 ** Math.floor(Math.log10(target));
  const n = target / pow;
  const f = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return f * pow;
}

type Pt = { x: number; y: number };

function trackFromNow(data: AisSnapshot): TrackPoint[] {
  const newestFirst = [...data.track].reverse();
  const head = newestFirst[0];
  const here: TrackPoint = { lon: data.lon, lat: data.lat, time: data.seen, sog: data.sog, cog: data.cog };
  if (!head || Math.abs(head.lon - here.lon) > 1e-5 || Math.abs(head.lat - here.lat) > 1e-5) {
    return [here, ...newestFirst];
  }
  return newestFirst;
}

function screenTrack(points: TrackPoint[], project: Projector): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const s = project(p.lon, p.lat);
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - s.x, prev.y - s.y) < 0.5) continue;
    out.push(s);
  }
  return out;
}

function lengths(pts: Pt[]): { seg: number[]; total: number } {
  const seg: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    seg.push(total);
  }
  return { seg, total };
}

function pointAt(pts: Pt[], seg: number[], dist: number): Pt {
  if (dist <= 0) return pts[0]!;
  for (let i = 1; i < pts.length; i++) {
    if (seg[i]! >= dist) {
      const start = seg[i - 1]!;
      const span = seg[i]! - start || 1;
      const t = (dist - start) / span;
      return {
        x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * t,
        y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * t,
      };
    }
  }
  return pts[pts.length - 1]!;
}

export function drawChartInk(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  project: Projector,
  bounds: { west: number; south: number; east: number; north: number } | null,
  data: AisSnapshot,
  ship: HTMLImageElement | null,
  beasts: Array<HTMLImageElement | null>,
  now: number,
  reduceMotion: boolean,
): number {
  ctx.clearRect(0, 0, width, height);
  if (bounds) drawGraticule(ctx, width, height, project, bounds);
  drawRhumbs(ctx, width, height);
  drawBeasts(ctx, width, height, project, bounds, beasts);

  const pts = screenTrack(trackFromNow(data), project);
  const { progress, alpha } = penPhase(now, reduceMotion);
  if (pts.length >= 2) drawWake(ctx, pts, progress, alpha);

  const shipPt = project(data.lon, data.lat);
  if (shipPt) drawShip(ctx, shipPt, data.cog, data.sog, ship, data.name);
  return progress;
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  project: Projector,
  bounds: { west: number; south: number; east: number; north: number },
) {
  const lonSpan = Math.abs(bounds.east - bounds.west);
  const latSpan = Math.abs(bounds.north - bounds.south);
  const step = Math.min(niceStep(lonSpan), niceStep(latSpan));
  ctx.save();
  ctx.strokeStyle = "rgba(42, 33, 24, 0.18)";
  ctx.fillStyle = "rgba(42, 33, 24, 0.55)";
  ctx.lineWidth = 1;
  ctx.font = "12px 'IM Fell English', Palatino, serif";
  ctx.setLineDash([1, 4]);

  const lon0 = Math.ceil(bounds.west / step) * step;
  for (let lon = lon0; lon < bounds.east; lon += step) {
    const a = project(lon, bounds.south);
    const b = project(lon, bounds.north);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const label = formatTick(lon, true);
    ctx.setLineDash([]);
    ctx.fillText(label, Math.min(width - 72, Math.max(8, a.x + 4)), height - 8);
    ctx.setLineDash([1, 4]);
  }
  const lat0 = Math.ceil(bounds.south / step) * step;
  for (let lat = lat0; lat < bounds.north; lat += step) {
    const a = project(bounds.west, lat);
    const b = project(bounds.east, lat);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(formatTick(lat, false), 8, Math.min(height - 16, Math.max(16, a.y - 4)));
    ctx.setLineDash([1, 4]);
  }
  ctx.restore();
}

function formatTick(value: number, isLon: boolean): string {
  const hemi = isLon ? (value >= 0 ? "E" : "W") : value >= 0 ? "N" : "S";
  const abs = Math.abs(value);
  const rounded = Math.round(abs * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}°${hemi}`;
}

function drawRhumbs(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width * 0.62;
  const cy = height * 0.46;
  const radius = Math.hypot(width, height);
  ctx.save();
  ctx.strokeStyle = "rgba(42, 33, 24, 0.07)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const ang = (i * Math.PI) / 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(ang) * radius, cy - Math.cos(ang) * radius);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBeasts(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  project: Projector,
  bounds: { west: number; south: number; east: number; north: number } | null,
  beasts: Array<HTMLImageElement | null>,
) {
  const span = bounds ? Math.max(0.25, Math.abs(bounds.east - bounds.west)) : 1.2;
  const size = Math.min(168, Math.max(48, (width / span) * 0.14));
  for (let i = 0; i < SEA_BEASTS.length; i++) {
    const image = beasts[i];
    const spot = SEA_BEASTS[i];
    if (!image || !image.complete || image.naturalWidth < 1 || !spot) continue;
    const pt = project(spot.lon, spot.lat);
    if (!pt) continue;
    const w = size;
    const h = size * (image.naturalHeight / image.naturalWidth);
    if (pt.x < -w || pt.y < -h || pt.x > width + w || pt.y > height + h) continue;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(image, pt.x - w / 2, pt.y - h / 2, w, h);
    ctx.restore();
  }
}

function drawWake(ctx: CanvasRenderingContext2D, pts: Pt[], progress: number, alpha: number) {
  const { seg, total } = lengths(pts);
  if (total < 2) return;
  const visible = total * progress;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.strokeStyle = "#7a2e24";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) {
    if (seg[i]! <= visible) {
      ctx.lineTo(pts[i]!.x, pts[i]!.y);
      continue;
    }
    const tip = pointAt(pts, seg, visible);
    ctx.lineTo(tip.x, tip.y);
    break;
  }
  ctx.stroke();
  ctx.restore();
}

function drawShip(
  ctx: CanvasRenderingContext2D,
  pt: Pt,
  cog: number | null,
  sog: number | null,
  ship: HTMLImageElement | null,
  name: string,
) {
  const heading = ((cog ?? 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.rotate(heading);
  if (ship && ship.complete && ship.naturalWidth > 0) {
    const h = 39;
    const w = (ship.naturalWidth / ship.naturalHeight) * h;
    ctx.drawImage(ship, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = "#3a2a1c";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(3.5, 6);
    ctx.lineTo(0, 4);
    ctx.lineTo(-3.5, 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.font = "italic 15px 'IM Fell English', Palatino, serif";
  ctx.fillStyle = "#2a2118";
  ctx.strokeStyle = "rgba(243, 230, 196, 0.9)";
  ctx.lineWidth = 3;
  const lx = pt.x + 16;
  const ly = pt.y - 2;
  ctx.strokeText(name, lx, ly);
  ctx.fillText(name, lx, ly);
  ctx.font = "13px 'IM Fell English', Palatino, serif";
  const motion = `${courseLabel(cog)} · ${formatSpeed(sog)}`;
  ctx.strokeText(motion, lx, ly + 16);
  ctx.fillText(motion, lx, ly + 16);
  ctx.restore();
}
