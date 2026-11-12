import type { Json, Reader } from "../evaluation.ts";
import { loadoutKey } from "../../core/bodies/items/held.ts";
import type { BuiltLone } from "../lone.ts";
import { Vector3, Quaternion } from "../../core/math/vector.ts";
import { massCentreToRef, massOf } from "../../core/bodies/read-motion.ts";
import { rootSegment } from "../../core/bodies/read-body.ts";
import { uprightness } from "../../control/ground.ts";
import { footStatesOf, groundContact } from "../../control/support.ts";
import { atan2, hypot, sin, cos } from "../../core/math/real.ts";
import { TRAVEL, travelPlaced, travelScript, travelTurns, type TravelCondition } from "./protocol.ts";
import { orderTime } from "../order-time.ts";

export type TravelReading = { readonly met: boolean; readonly short: readonly string[]; readonly firstLeg: "left" | "right" | null;
  readonly fromRest: boolean; readonly reachedAt: number | null; readonly entryMade: boolean; readonly entryHeld: number | null;
  readonly held: number | null; readonly turnedAt: number | null; readonly corridor: number | null;
  readonly lag: number | null; readonly facingError: number | null; readonly route: number | null;
  readonly stopEntered: boolean; readonly stoppedAt: number | null; readonly fellAt: number | null; readonly seconds: number;
  /** The seconds lost against the orders, and how long the body had been down at the end (`orderTime`). */
  readonly lost: number; readonly downFor: number | null };
type Sample = { time: number; x: number; z: number; speed: number; projected: number; yaw: number; heading: number; standing: boolean };
const wrap = (angle: number): number => atan2(sin(angle), cos(angle));

/** Physical COM motion after every step; no controller height flag can substitute for a fall. */
export function readTravel({ world, body }: BuiltLone, c: TravelCondition): Reader<TravelReading> {
  const p = travelScript(c), turning = travelTurns(c.mode), circle = c.mode === "circle", placed = travelPlaced(c.mode), hz = world.hz;
  const parts = [...body.built.segments.values()], mass = massOf(parts), root = rootSegment(body.built), upright = uprightness(body.built);
  const centre = new Vector3(), velocity = new Vector3(), work = new Vector3(), turn = new Quaternion(), inverse = Quaternion.Inverse(root.rest);
  const samples: Sample[] = [], absent = { left: 0, right: 0 };
  const feet = footStatesOf(body.built), orders = orderTime(p.cues, hz);
  let steps = 0, next = 0, direction = { x: sin(p.initial), z: cos(p.initial) }, projected = 0;
  let fellAt: number | null = null, firstLeg: TravelReading["firstLeg"] = null;
  const contacts = (side: "left" | "right") => feet.find(foot => foot.side === side)!.contactParts.some(part =>
    part.chain.every(joint => joint.attached())
    && body.built.physics.contactsOf(body.built.segments.get(part.segment.spec.name)!.body).some(contact => groundContact(contact, .5)));
  return {
    afterStep() {
      const before = steps++;
      while (next < p.cues.length && Math.round(p.cues[next]!.at * hz) <= before) {
        const move = p.cues[next++]!.orders?.move;
        if (move?.kind === "direct") direction = move.direction;
      }
      const time = steps / hz;
      massCentreToRef(parts, mass, centre, work, velocity);
      root.pose.rotation.multiplyToRef(inverse, turn);
      const yaw = atan2(2 * (turn.w * turn.y + turn.x * turn.z), 1 - 2 * (turn.x * turn.x + turn.y * turn.y));
      const down = upright.fallen();
      if (down && fellAt === null) fellAt = time;
      orders.step(centre, velocity, down);
      const touched = { left: contacts("left"), right: contacts("right") };
      if (time > TRAVEL.start && firstLeg === null) for (const side of ["left", "right"] as const) {
        absent[side] = touched[side] ? 0 : absent[side] + 1 / hz;
        const other = side === "left" ? "right" : "left";
        if (absent[side] >= TRAVEL.stepClear && touched[other]) { firstLeg = side; break; }
      }
      projected += (velocity.x * direction.x + velocity.z * direction.z) / hz;
      samples.push({ time, x: centre.x, z: centre.z, speed: Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z),
        projected, yaw, heading: atan2(velocity.x, velocity.z), standing: !down && !upright.down() && (touched.left || touched.right) });
    },
    get ended() { return steps >= Math.round(p.end * hz); },
    reading() {
      const empty: Sample = { time: 0, x: 0, z: 0, speed: 0, projected: 0, yaw: 0, heading: 0, standing: false };
      const at = (time: number) => samples[Math.max(0, Math.min(samples.length - 1, Math.round(time * hz) - 1))] ?? empty;
      const speedAt = (time: number) => at(time).projected - (Math.round(time * hz) > hz ? at(time - 1).projected : 0);
      const minimum = (from: number, to: number) => {
        let low = Infinity;
        for (let step = Math.round((from + 1) * hz); step <= Math.round(to * hz) && step <= samples.length; step++) low = Math.min(low, speedAt(step / hz));
        return Number.isFinite(low) ? low : null;
      };
      const reach = (from: number, within: number) => {
        for (let step = Math.round((from + 1) * hz); step <= Math.round((from + within) * hz) && step <= samples.length; step++)
          if (speedAt(step / hz) >= c.pace) return step / hz - from;
        return null;
      };
      const fromRest = at(TRAVEL.start).speed <= TRAVEL.still && at(TRAVEL.start).standing;
      const reachedAt = reach(p.begin, p.deadline);
      const entryHeld = turning ? circle ? speedAt(p.cue) : minimum(p.begin + p.deadline, p.cue) : null;
      // A walking start enters the run from the walk, not from rest.
      const entryMade = (fromRest || c.mode === "walking") && reachedAt !== null && (!turning || (entryHeld !== null && entryHeld >= c.pace));
      const turnedAt = turning && !circle ? reach(p.cue, p.transition) : null;
      const held = placed ? null : minimum(circle ? p.cue - 1 : p.holdFrom, p.stop);
      let corridor = 0, lag = 0, facingError = 0, route: number | null = null, rotation = 0, previous = at(p.cue).yaw;
      const origin = at(p.begin), change = at(p.cue);
      for (const sample of samples) {
        if (sample.time < p.begin) continue;
        if (c.mode === "facing") facingError = Math.max(facingError, Math.abs(wrap(sample.yaw - c.heading)));
        if (!circle && !placed && (!turning || sample.time <= p.cue || sample.time >= p.holdFrom)) {
          const start = turning && sample.time >= p.holdFrom ? change : origin;
          const angle = turning && sample.time >= p.holdFrom ? p.final : p.initial;
          corridor = Math.max(corridor, Math.abs((sample.x - start.x) * cos(angle) - (sample.z - start.z) * sin(angle)));
        }
        if (sample.time > p.cue && c.mode === "reverse") {
          rotation += wrap(sample.yaw - previous); previous = sample.yaw;
          if (route === null && Math.abs(rotation) >= Math.PI / 4) route = Math.sign(rotation);
        }
      }
      if (circle) {
        // Use the same quantized direction cues as the actual order script, without a heading-window delay.
        let cue = 0, angle = p.initial;
        for (let i = 0; i < samples.length; i++) {
          while (cue < p.cues.length && Math.round(p.cues[cue]!.at * hz) <= i) {
            const move = p.cues[cue++]!.orders?.move;
            if (move?.kind === "direct") angle = atan2(move.direction.x, move.direction.z);
          }
          if (samples[i]!.time < p.cue || samples[i]!.time > p.holdFrom) continue;
          const heading = samples[i]!.heading;
          lag = Math.max(lag, Math.abs(wrap(heading - angle)));
        }
      }
      const stopEntered = speedAt(p.stop) >= c.pace;
      let quietFrom: number | null = null, stoppedAt: number | null = null;
      for (const sample of samples) if (sample.time >= p.stop) {
        if (sample.speed < TRAVEL.still && sample.standing) quietFrom ??= sample.time;
        else quietFrom = null;
        if (quietFrom !== null && Math.round((sample.time - quietFrom) * hz) >= Math.round(TRAVEL.quiet * hz)
          && Math.round((quietFrom - p.stop) * hz) <= Math.round(TRAVEL.stop * hz)) { stoppedAt = quietFrom - p.stop; break; }
      }
      const short: string[] = [];
      if (samples.length < Math.round(p.end * hz)) short.push("incomplete");
      if (!entryMade) short.push("entry not reached");
      if (turning && !circle && turnedAt === null) short.push("turn deadline");
      if (!placed && (held === null || held < c.pace)) short.push("held speed");
      if (fellAt !== null) short.push("fall");
      if (!circle && !placed && corridor > TRAVEL.corridor) short.push("corridor");
      if (circle && lag > TRAVEL.angle) short.push("steering lag");
      if (c.mode === "facing" && facingError > TRAVEL.angle) short.push("facing");
      if (c.mode === "reverse" && route !== c.sense) short.push("turn route");
      // A place gives no stop to enter: it is to be stood at, within the corridor of its goal.
      if (!placed && !stopEntered) short.push("stop entry not reached");
      const last = at(p.end);
      if (p.goal && hypot(last.x - p.goal.x, last.z - p.goal.z) > TRAVEL.corridor) short.push("place not reached");
      if (stoppedAt === null) short.push("stop and settle");
      return { met: short.length === 0, short, firstLeg, fromRest, reachedAt, entryMade, entryHeld, held, turnedAt,
        corridor: circle || placed ? null : corridor, lag: circle ? lag : null, facingError: c.mode === "facing" ? facingError : null,
        route, stopEntered, stoppedAt, fellAt, seconds: steps / hz, ...orders.reading() };
    },
  };
}

/** Both first stepping legs must be demonstrated for each manoeuvre and air, not merely somewhere in a battery. */
export function travelLegCoverage(rows: readonly { readonly condition: Json; readonly reading: Json }[]): number {
  const groups = new Map<string, Set<string>>();
  for (const row of rows) {
    const c = row.condition as unknown as TravelCondition, r = row.reading as unknown as TravelReading;
    const key = `${c.model}/${loadoutKey(c.loadout)}/${c.mode}/${c.way}/${c.sense}/${c.gusts}`;
    let legs = groups.get(key); if (!legs) groups.set(key, legs = new Set());
    if (r.firstLeg !== null) legs.add(r.firstLeg);
  }
  return [...groups.values()].filter(legs => !legs.has("left") || !legs.has("right")).length;
}
