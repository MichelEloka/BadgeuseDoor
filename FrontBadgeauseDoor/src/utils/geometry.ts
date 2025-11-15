import type { Wall, ZonePoint } from "@/types/floor";

export const uid = () => Math.random().toString(36).slice(2, 9);

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const snap = (v: number, grid = 10) => Math.round(v / grid) * grid;

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Projection d'un point P sur un segment AB. */
export function projectPointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return { x: ax, y: ay, t: 0, angle: 0, d: Math.hypot(px - ax, py - ay) };
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * abx;
  const y = ay + t * aby;
  const angle = Math.atan2(aby, abx);
  const d = Math.hypot(px - x, py - y);
  return { x, y, t, angle, d };
}

export function nearestWallSnap(
  walls: Wall[],
  px: number,
  py: number
): null | { x: number; y: number; angle: number; wallId: string } {
  if (!walls.length) return null;
  let best: (ReturnType<typeof projectPointOnSegment> & { wallId: string }) | null = null;
  for (const w of walls) {
    const proj = projectPointOnSegment(px, py, w.x1, w.y1, w.x2, w.y2);
    if (!best || proj.d < best.d) best = { ...proj, wallId: w.id };
  }
  return best ? { x: best.x, y: best.y, angle: best.angle, wallId: best.wallId } : null;
}

export function pointInPolygon(point: ZonePoint, polygon: ZonePoint[]) {
  if (polygon.length < 3) return false;
  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-7) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distancePointToPolygon(px: number, py: number, polygon: ZonePoint[]) {
  if (polygon.length === 0) return Infinity;
  if (polygon.length === 1) return Math.hypot(px - polygon[0].x, py - polygon[0].y);
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const proj = projectPointOnSegment(px, py, a.x, a.y, b.x, b.y);
    if (proj.d < best) best = proj.d;
  }
  return best;
}

