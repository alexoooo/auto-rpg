/**
 * **The bar's score of a Strike drill trial**, as the punch's searches and its trainer score it.
 */
import type { Hand, Overhead, StrikeReading } from "./read.ts";

/** `value` held within 0 and 1. */
const unit = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * A bonk's score (`Overhead`, `Bar.overhead`), its elbow `bend` from straight, rad: landed, 9 and
 * up to 3 more as its energy goes from the bar to 1.5 times it, its descent from the bar's to
 * straight down and its elbow from the bar's bend to straight; else up to 8 by how near it came to
 * each test, none past it, its energy counted twice: the club hand from 0.3 m under the crown to
 * the bar's height over it, the swell's rise to the bar's, the sweep from 45 degrees outside the
 * bar's to within it, the reversal from 20 degrees past the bar's to within it, the descent to the
 * bar's, the swell first on the head, the elbow from twice the bar's bend to within it, and the hand
 * back at its guard; less 0.5 where its action did not end. `released`, read as the swing lets go:
 * the hand's return and the action's end are still to come, and count as met.
 */
function overheadScore(reading: StrikeReading, o: Overhead, bend: number, released = false): number {
  const bar = reading.bar.overhead, rad = Math.PI / 180, room = (value: number, limit: number, best: number) => unit((value - limit) / (best - limit));
  const formed = reading.hit?.faced !== false && o.short.every((test) => test === "back to guard");
  if (reading.outcome === "landed" || released && reading.outcome === "weak" && formed)
    return 9 + room(o.share, 1, 1.5) + room(o.descent, bar.descent * rad, 90 * rad) + room(-bend, -reading.bar.bend * rad, 0);
  const near = unit(1 + (o.hand - bar.hand) / .3) + unit(o.rise / bar.rise)
    + 1 - unit(Math.max(bar.sweep[0] * rad - o.sweep, o.sweep - bar.sweep[1] * rad) / (45 * rad)) + 1 - unit((o.reversal - bar.reversal * rad) / (20 * rad))
    + unit(o.descent / (bar.descent * rad)) + (o.swell ? 1 : 0) + 1 - unit((bend - reading.bar.bend * rad) / (reading.bar.bend * rad))
    + 2 * Math.min(1, o.share) + (o.back || released ? 1 : 0);
  return 8 * near / 10 - (reading.ended === null && !released ? .5 : 0);
}

/**
 * **A bonk's score as its swing lets go** (`overheadScore`): what a steer that stops at the
 * release is trained on, the hand's return and the action's end counted as met; a fall till then
 * -3, nothing on the mark -1, as `barScore`. The trial played to its end is read by `barScore`.
 */
export function releasedScore(reading: StrikeReading): number {
  if (reading.down) return -3;
  const hit = reading.hit;
  if (!hit) return reading.outcome === "elsewhere" || reading.outcome === "guarded" ? -0.5 : -1;
  return hit.overhead ? overheadScore(reading, hit.overhead, hit.bend!, true) : -1;
}

/**
 * A trial's score, `hand` the hand it struck with, null a foot: a landed
 * blow 9, and a hand's above 9 by how far inside each of the bar's tests it is, each
 * margin a share of its limit's room up to the test's best, so a search moves off every test's
 * edge, the ones its blows scatter most across included; else up to 8 by how
 * near it came to each test, its speed counted twice, none past the bar, so no test is traded for
 * another's margin, the mass counted `heavier` times within those 8 (8 for another limb's on the mark),
 * less 0.5 where its action did not end; -1 nothing on the mark; -3 a fall. A foot's blow, which the
 * bar tests by its speed (`Bar.foot`, `StrikeHit.foot`), scores alike: landed, 9 and up to 1 more as
 * the speed goes from the bar to 1.5 times it; else up to 8 by its share of the bar. A held item's blow,
 * which the bar tests by its energy, a point's by its closing speed, an edge's by its far end's speed, and its face (`Bar.held`,
 * `StrikeHit.held`, `StrikeHit.faced`), scores a landed action as 8 plus its share of the
 * bar, capped at 2; else up to 8, half by its share of the bar and half for meeting with its face. A bonk's scores
 * by its own tests (`overheadScore`). The bar is the reading's, its striker's
 * (`StrikeReading.bar`).
 */
export function barScore(reading: StrikeReading, hand: Hand | null, heavier = 1): number {
  const BAR = reading.bar;
  if (reading.down) return -3;
  const hit = reading.hit;
  if (!hit) return reading.outcome === "elsewhere" || reading.outcome === "guarded" ? -0.5 : -1;
  if (hand === null) {
    const share = hit.foot ? hit.foot.speed / hit.foot.bar : 0;
    return reading.outcome === "landed" ? 9 + Math.min(1, Math.max(0, (share - 1) / .5)) : 8 * Math.min(1, share) - (reading.ended === null ? 0.5 : 0);
  }
  if (hit.overhead) return overheadScore(reading, hit.overhead, hit.bend!);
  if (hit.held) {
    const share = hit.held.value / hit.held.bar;
    return reading.outcome === "landed" ? 9 + Math.min(1, share - 1) : 4 * (Math.min(1, share) + (hit.faced === false ? 0 : 1)) - (reading.ended === null ? 0.5 : 0);
  }
  const speed = (hit.speed ?? 0) / BAR.speed[hand], mass = hit.kg / BAR.mass[hand];
  const cone = Math.cos(BAR.cone * Math.PI / 180), wide = Math.cos(2 * BAR.cone * Math.PI / 180), unit = (v: number) => Math.max(0, Math.min(1, v));
  if (reading.outcome === "landed") {
    const room = (value: number, limit: number, best: number) => Math.min(1, Math.max(0, (value - limit) / (best - limit)));
    const along = Math.cos(BAR.along * Math.PI / 180), rad = Math.PI / 180;
    return 9 + room(speed, 1, 1.5) + room(mass, 1, 2) + room(hit.straight ?? -Infinity, cone, 1) + room(hit.along ?? -Infinity, along, 1)
      + room(-hit.bend!, -BAR.bend * rad, 0) + room(-hit.lean!, -BAR.lean * rad, 0) + room(-(hit.time - reading.began!), -BAR.within, 0);
  }
  const towards = (cosine: number | null) => cosine === null ? 0 : unit((cosine - wide) / (cone - wide));
  const within = (angle: number, limit: number) => unit(1 - Math.max(0, angle - limit * Math.PI / 180) / (limit * Math.PI / 180));
  const late = reading.began === null ? 1 : Math.max(0, hit.time - reading.began - BAR.within);
  const lined = (cosine: number | null) => cosine === null ? 0 : unit((cosine - Math.cos(2 * BAR.along * Math.PI / 180)) / (Math.cos(BAR.along * Math.PI / 180) - Math.cos(2 * BAR.along * Math.PI / 180)));
  return (2 * Math.min(1, speed) + heavier * Math.min(1, mass) + towards(hit.straight) + lined(hit.along) + within(hit.bend!, BAR.bend) + within(hit.lean!, BAR.lean)
    + Math.max(0, 1 - late / 0.3)) * 8 / (7 + heavier) - (reading.ended === null ? 0.5 : 0);
}
