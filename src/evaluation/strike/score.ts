/**
 * **The bar's score of a Strike drill trial**, as the punch's searches and its trainer score it.
 */
import { BAR, type Hand, type StrikeReading } from "./read.ts";

/**
 * A trial's score: a landed blow above 9 by how far inside each of the bar's tests it is, each
 * margin a share of its limit's room up to the test's best, so a search moves off every test's
 * edge, the ones its blows scatter most across included; else up to 8 by how
 * near it came to each test, its speed counted twice, none past the bar, so no test is traded for
 * another's margin, the mass counted `heavier` times within those 8; -1 nothing on the mark; -3 a fall.
 */
export function barScore(reading: StrikeReading, hand: Hand, heavier = 1): number {
  if (reading.down) return -3;
  const hit = reading.hit;
  if (!hit) return reading.outcome === "elsewhere" || reading.outcome === "guarded" ? -0.5 : -1;
  const speed = (hit.speed ?? 0) / BAR.speed[hand], mass = hit.kg / BAR.mass[hand];
  const cone = Math.cos(BAR.cone * Math.PI / 180), wide = Math.cos(2 * BAR.cone * Math.PI / 180), unit = (v: number) => Math.max(0, Math.min(1, v));
  if (reading.outcome === "landed") {
    const room = (value: number, limit: number, best: number) => Math.min(1, Math.max(0, (value - limit) / (best - limit)));
    const along = Math.cos(BAR.along * Math.PI / 180), rad = Math.PI / 180;
    return 9 + room(speed, 1, 1.5) + room(mass, 1, 2) + room(hit.straight ?? -Infinity, cone, 1) + room(hit.along ?? -Infinity, along, 1)
      + room(-hit.bend, -BAR.bend * rad, 0) + room(-hit.lean, -BAR.lean * rad, 0) + room(-(hit.time - reading.began!), -BAR.within, 0);
  }
  const towards = (cosine: number | null) => cosine === null ? 0 : unit((cosine - wide) / (cone - wide));
  const within = (angle: number, limit: number) => unit(1 - Math.max(0, angle - limit * Math.PI / 180) / (limit * Math.PI / 180));
  const late = reading.began === null ? 1 : Math.max(0, hit.time - reading.began - BAR.within);
  const lined = (cosine: number | null) => cosine === null ? 0 : unit((cosine - Math.cos(2 * BAR.along * Math.PI / 180)) / (Math.cos(BAR.along * Math.PI / 180) - Math.cos(2 * BAR.along * Math.PI / 180)));
  return (2 * Math.min(1, speed) + heavier * Math.min(1, mass) + towards(hit.straight) + lined(hit.along) + within(hit.bend, BAR.bend) + within(hit.lean, BAR.lean)
    + Math.max(0, 1 - late / 0.3)) * 8 / (7 + heavier) - (reading.ended === null ? 0.5 : 0);
}
