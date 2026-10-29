/**
 * **How the Strike drill reads a trial**: the striker's one action from its request to its end, and
 * each touch of the asked hand on the target, judged by the bar a person's punch sets (`BAR`).
 * Every rung reads its trials so.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { pointOfToRef, turnOfToRef } from "../../core/control/support.ts";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { rigidPoints } from "../../core/build/rigid.ts";
import { jointAngles } from "../../core/build/joint-state.ts";
import { regionSegments } from "../../core/mind/action-aim.ts";
import type { DrillPhase } from "../../core/mind/drill-tactics.ts";
import { sensedPhase } from "../../core/mind/options/percepts.ts";
import { centreReading } from "../../core/observation.ts";
import { aimOf } from "../../core/skills/strikes.ts";
import { acos, cos } from "../../core/math/real.ts";
import type { Duel } from "../../arena/duel.ts";
import type { World } from "../../core/world.ts";
import type { BodySpec } from "../../core/spec/body.ts";
import type { Reader } from "../evaluation.ts";

export type Mark = "high" | "middle" | "legs";

/** The segment `steps` joints above `segment` in `spec`'s tree: a hand's forearm at 1, its upper arm at 2. */
function limbAbove(spec: BodySpec, segment: string, steps: number): string | undefined {
  let at: string | undefined = segment;
  for (let k = 0; k < steps && at !== undefined; k++) at = spec.joints.find((joint) => joint.child === at)?.parent;
  return at;
}
export type Hand = "left" | "right";

/**
 * **The bar a blow meets to land**, the untrained adult man's fist less one SD (Adamec et al. 2021,
 * Table 3, male, fist; [human strike reference](../../../docs/reference/human-strike-reference.md#1-punches-straight-jabcross-hook)):
 * its speed over its last `run` m before contact, m/s, and the effective mass it meets on its own
 * side, kg, by hand: the right is the guard's rear hand (dominant 8.0 ± 1.2 m/s, 2.93 ± 0.81 kg),
 * the left its lead (non-dominant 6.2 ± 0.9 m/s, 3.27 ± 0.93 kg). Its last `run` m come in within
 * `cone` degrees of the surface's normal, as the punch competency's straight blow does, and it
 * meets the target within `within` s of the action's start
 * ([thresholds](../../../docs/reference/competencies.md#thresholds)).
 *
 * And it is a punch, as the owner asked (2026-10-24, "I want the punch to be a punch"): its last
 * `run` m come out more along the arm than across it, within `along` degrees of the line from the
 * striking shoulder to the strike point at contact (a thrust runs along that line, a swing across
 * it; an elbow near straight opens mostly across it, so a person's punch is not held nearer); the
 * elbow is within `bend` degrees of straight (its range's end) at contact; and the chest is within
 * `lean` degrees of upright then.
 */
export const BAR = Object.freeze({
  speed: Object.freeze({ right: 6.8, left: 5.3 }),
  mass: Object.freeze({ right: 2.12, left: 2.34 }),
  run: .1, cone: 20, within: .5, along: 45, bend: 30, lean: 30,
});
export type Bar = typeof BAR;

/** A touch of the striker's on the target: when, by which of its segments on which of the target's, and in the rules' units. */
export type StrikeContact = {
  readonly time: number; readonly by: string; readonly on: string; readonly closing: number; readonly energy: number; readonly damage: number;
  /** The effective mass the striking segment met on its own side, kg. */
  readonly kg: number;
};

/** How the asked hand's touch on the mark measured against the bar. */
export type StrikeHit = StrikeContact & {
  /** Its strike point's speed over its last `run` m, m/s; null where it travelled less. */
  readonly speed: number | null;
  /** The cosine between that travel and the surface's normal; null where it travelled less. */
  readonly straight: number | null;
  /** The cosine between that travel and the line from the shoulder to the strike point at contact; null where it travelled less. */
  readonly along: number | null;
  /** How far the elbow was from straight at contact, and the chest from upright, rad. */
  readonly bend: number; readonly lean: number;
  /** Which of the bar's tests it met. */
  readonly fast: boolean; readonly heavy: boolean; readonly square: boolean; readonly soon: boolean;
  readonly lined: boolean; readonly extended: boolean; readonly upright: boolean;
};

/**
 * How a trial came out: `landed`, a touch of the hand on the mark that meets the bar while its
 * action ran, the striker up and its action ended; `weak`, on the mark short of the bar;
 * `guarded`, the hand on the target's arms alone, its guard; `elsewhere`, the hand on the
 * target's body but not the mark; `missed`, committed and nothing of the
 * hand's on the target; `abandoned`, begun and ended before committing; `outside`, never in its
 * window; `refused` or `waiting`, never admitted for the reason its readiness gave; `fell`, the
 * striker down at any time of the trial; `unreached`, a fight that never came to its moment.
 */
export type StrikeOutcome = "landed" | "weak" | "guarded" | "elsewhere" | "missed" | "abandoned" | "outside" | "refused" | "waiting" | "fell" | "unreached";

/** What a trial came to. */
export type StrikeReading = {
  readonly outcome: StrikeOutcome;
  /** The drill's last phase before its action, and the reason its readiness last gave. */
  readonly phase: DrillPhase;
  /**
   * The target's phase as the striker sensed it (the `phase` percept, `sensedPhase`) where its
   * trial began: the step the drill was first ready to ask or its action began, whichever came
   * first, else the step the drill had the body; null where it never had it.
   */
  readonly foePhase: string | null;
  readonly reason: string;
  /** When the drill had the body, s: the bout's start, or the moment its fight was handed to it; null where it never was. */
  readonly handed: number | null;
  /** When the drill was first ready to ask (its readiness said ready, or it asked), s; null where it never was. */
  readonly ready: number | null;
  /** At the action's start: which feet bore on the ground, and the centre of mass's speed over it, m/s; null where it did not start. */
  readonly asked: { readonly bearing: readonly Hand[]; readonly speed: number } | null;
  /** When the action began, committed, released and ended, s; null where it did not. */
  readonly began: number | null; readonly committed: number | null; readonly released: number | null; readonly ended: number | null;
  readonly ending: string | null;
  /** The hand's first touch on the mark that meets the bar, or else its fastest; null where none. */
  readonly hit: StrikeHit | null;
  /** Every touch of the striker's on the target. */
  readonly contacts: readonly StrikeContact[];
  /** The hit points the striker lost in its contacts with the target over the trial, any part on any part. */
  readonly taken: number;
  /**
   * Where the drill let its action go (`DrillTacticsConfig.letGo`): when it let it go and when the
   * hand was back at its guard (`BACK`), s (null where it was not by the trial's end), and the hit
   * points the striker lost from the let-go until then; absent where it did not let one go.
   */
  readonly letGo?: { readonly at: number; readonly again: number | null; readonly opening: number };
  readonly down: boolean;
  readonly seconds: number;
};

/**
 * **The hand back at its guard**, as the body reads it: its strike point within `within` m of where
 * it was, against the chest and turned with it, when its action began, and moving against the
 * chest at no more than `still` m/s.
 */
export const BACK = Object.freeze({ within: .05, still: .3 });

/** When a trial ends: the protocol's longest, how long it runs on after the action's end, and how long the striker may wait to be admitted `settled` s after the drill has the body. */
export interface Ending { readonly seconds: number; readonly settle: number; readonly settled: number; readonly patience: number }

/**
 * The reader of a trial in which the striker, the bout's left side, asks one action with `hand` at
 * the right side's `mark`, ending as `ending` says and judged by `bar`. The striker's actions while
 * its drill is fighting (`DrillPhase`) are the fight's, not the drill's.
 */
export function readStrike({ world, duel }: { readonly world: World; readonly duel: Duel }, { mark, hand }: { readonly mark: Mark; readonly hand: Hand },
  ending: Ending, bar: Bar = BAR): Reader<StrikeReading> {
  const left = duel.duelists.left, skills = left.minded.skills;
  if (!skills) throw new Error("the striker runs no skills");
  const target = duel.duelists.right.built.spec, marked = new Set(regionSegments(target, { kind: "mark", mark })), effector = `hand.${hand}`;
  /** The target's arms, hand to upper arm: what a guard meets a blow with. */
  const arms = new Set((["left", "right"] as const).flatMap((side) => [0, 1, 2].map((steps) => limbAbove(target, `hand.${side}`, steps))).filter((name) => name !== undefined));
  const limb = left.built.segments.get(effector);
  if (!limb) throw new Error(`the striker has no ${effector}`);
  const aim = rigidPoints(left.built.spec, limb.spec).get(aimOf(left.built.spec, hand))!.value, point = new Vector3();
  const spec = left.built.spec, shoulderJoint = spec.joints.find((joint) => joint.child === limbAbove(spec, effector, 2));
  const upperArm = shoulderJoint && left.built.segments.get(shoulderJoint.child), chest = left.built.segments.get("upperTrunk");
  const elbowJoint = spec.joints.find((joint) => joint.child === limbAbove(spec, effector, 1));
  if (!shoulderJoint || !upperArm || !chest || !elbowJoint) throw new Error(`the striker's ${effector} has no shoulder, elbow or chest to read a punch's form by`);
  const elbow = left.built.joints.get(elbowJoint.name), straightElbow = elbowJoint.dofs[0]!.min.value, angles: number[] = [];
  if (!elbow) throw new Error(`the striker has no built ${elbowJoint.name}`);
  const shoulder = new Vector3(), turn = new Quaternion(), up = new Vector3(), chestAt = new Vector3(), ORIGIN = [0, 0, 0] as const;
  /** The strike point against the chest, turned with it, where its action began; and as the last step left it. */
  const rest = new Vector3(), held = new Vector3(), was = new Vector3();
  /** The strike point against the chest, in the chest's turn, into `out`. */
  const againstChest = (out: Vector3): Vector3 => {
    pointOfToRef(limb, aim, point); pointOfToRef(chest, ORIGIN, chestAt); turnOfToRef(chest, turn);
    return point.subtractToRef(chestAt, out).applyRotationQuaternionToRef(turn.conjugateInPlace(), out);
  };
  /** The strike point's path, world, a step at a time: time, the strike point's x, y, z, the shoulder's x, y, z, the elbow's bend and the chest's lean, rad. */
  const path: number[] = [];
  const STRIDE = 9;
  const times = { began: null as number | null, committed: null as number | null, released: null as number | null, ended: null as number | null };
  const coneCosine = cos(bar.cone * Math.PI / 180), alongCosine = cos(bar.along * Math.PI / 180), bend = bar.bend * Math.PI / 180, lean = bar.lean * Math.PI / 180;
  let id: number | null = null, phase: DrillPhase = "lost", reason = "", down = false, handed: number | null = null, fought = false, ready: number | null = null;
  let letAt: number | null = null, again: number | null = null;
  let asked: StrikeReading["asked"] = null, foePhase: string | null = null, atHand: string | null = null;
  const head = centreReading(left.built, "head"), centre = new Vector3();
  /** The target's phase as the striker senses it now (`sensedPhase`). */
  const sensed = (): string => {
    head.update();
    const at = left.body.observe().centre;
    return sensedPhase({ senses: left.senses(), head: head.centre, stance: { centre: centre.set(at[0], at[1], at[2]) } }, duel.duelists.right.id);
  };
  const velocity = new Vector3(), segments = [...left.built.segments.values()], mass = segments.reduce((sum, segment) => sum + segment.rigid.mass, 0);
  /** Which feet bear on the ground, and the centre of mass's speed over it, as this step left them. */
  const footing = (): NonNullable<StrikeReading["asked"]> => {
    let x = 0, z = 0;
    for (const segment of segments) { segment.body.linearVelocityToRef(velocity); x += segment.rigid.mass * velocity.x; z += segment.rigid.mass * velocity.z; }
    const contacts = left.body.observe().contacts;
    const bearing = (["left", "right"] as const).filter((side) => contacts.some((contact) => contact.segment === `foot.${side}` && contact.fixed !== null && contact.impulse > 0));
    return { bearing, speed: Math.sqrt(x * x + z * z) / mass };
  };
  /** The actions the fight asked before the drill had the body. */
  const before = new Set<number>();
  /** The last step before `time`'s place in `path`, or -1. */
  const stepBefore = (time: number): number => {
    let end = path.length - STRIDE;
    while (end >= 0 && path[end]! >= time) end -= STRIDE;
    return end;
  };
  /** The strike point's travel over its last `bar.run` m before `time`: its speed and its direction, or null where it travelled less. */
  const approach = (time: number): { speed: number; direction: [number, number, number] } | null => {
    const end = stepBefore(time);
    if (end < 0) return null;
    const ex = path[end + 1]!, ey = path[end + 2]!, ez = path[end + 3]!;
    for (let k = end - STRIDE; k >= 0; k -= STRIDE) {
      const dx = ex - path[k + 1]!, dy = ey - path[k + 2]!, dz = ez - path[k + 3]!, far = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (far < bar.run) continue;
      const next = k + STRIDE, nx = ex - path[next + 1]!, ny = ey - path[next + 2]!, nz = ez - path[next + 3]!, near = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const f = far === near ? 0 : (far - bar.run) / (far - near), at = path[k]! + f * (path[next]! - path[k]!);
      const sx = path[k + 1]! + f * (path[next + 1]! - path[k + 1]!), sy = path[k + 2]! + f * (path[next + 2]! - path[k + 2]!), sz = path[k + 3]! + f * (path[next + 3]! - path[k + 3]!);
      const tx = ex - sx, ty = ey - sy, tz = ez - sz, length = Math.sqrt(tx * tx + ty * ty + tz * tz);
      return { speed: bar.run / (path[end]! - at), direction: [tx / length, ty / length, tz / length] };
    }
    return null;
  };
  return {
    afterStep() {
      if (skills.report.engagement?.phase === "fighting") {
        fought = true;
        for (const one of skills.report.actions) before.add(one.id);
        return;
      }
      if (handed === null) { handed = fought ? world.time : 0; atHand = sensed(); }
      const action = skills.report.actions.find((one) => !before.has(one.id));
      if (action && id === null) { id = action.id; times.began = world.time; asked = footing(); foePhase ??= sensed(); againstChest(rest); }
      if (action && action.id === id) {
        if (action.phase === "commit" && times.committed === null) times.committed = world.time;
        if (action.phase === "release" && times.released === null) times.released = world.time;
      }
      if (id !== null && times.ended === null && !skills.report.actions.some((one) => one.id === id)) times.ended = world.time;
      const drill = skills.report.engagement?.phase;
      if (drill === "let go" && letAt === null) { letAt = world.time; againstChest(was); }
      else if (letAt !== null && again === null) {
        againstChest(held);
        const moved = Vector3.Distance(held, was) / world.dt;
        if (Vector3.Distance(held, rest) <= BACK.within && moved <= BACK.still) again = world.time;
        was.copyFrom(held);
      }
      if (id === null) {
        const engagement = skills.report.engagement;
        phase = (engagement?.phase ?? "lost") as DrillPhase;
        if ((phase === "ready" || phase === "striking") && ready === null) { ready = world.time; foePhase ??= sensed(); }
        reason = engagement?.details?.find((detail) => detail.label === "readiness")?.value ?? "";
      }
      if (id !== null && times.ended === null) {
        pointOfToRef(limb, aim, point);
        pointOfToRef(upperArm, shoulderJoint.centre.value, shoulder);
        up.set(0, 1, 0).applyRotationQuaternionToRef(turnOfToRef(chest, turn), up);
        path.push(world.time, point.x, point.y, point.z, shoulder.x, shoulder.y, shoulder.z,
          jointAngles(elbow, angles)[0]! - straightElbow, acos(Math.max(-1, Math.min(1, up.y))));
      }
      down ||= left.body.down;
    },
    get ended() {
      return world.time >= ending.seconds || times.ended !== null && world.time >= times.ended + ending.settle && (letAt === null || again !== null)
        || id === null && handed !== null && world.time >= handed + ending.settled + ending.patience;
    },
    reading() {
      let taken = 0, opening = 0;
      for (const blow of duel.blows) for (const side of blow.sides)
        if (side.fighter === "left" && blow.sides.some((other) => other.fighter === "right")) {
          taken += side.damage;
          if (letAt !== null && blow.time >= letAt && blow.time <= (again ?? world.time)) opening += side.damage;
        }
      const touches = duel.blows.flatMap((blow) => {
        if (blow.kind !== "impact") return [];
        const k = blow.sides.findIndex((side) => side.fighter === "left"), by = blow.sides[k], on = blow.sides[1 - k];
        if (!by || !on || on.fighter !== "right" || on.item !== null) return [];
        const sign = k === 0 ? 1 : -1, normal = [blow.normal[0] * sign, blow.normal[1] * sign, blow.normal[2] * sign] as const;
        return [{ contact: { time: blow.time, by: by.segment, on: on.segment, closing: blow.closing, energy: blow.energy, damage: on.damage, kg: by.kg }, normal }];
      });
      const live = (time: number) => times.began !== null && time >= times.began && time <= (times.ended ?? world.time);
      const byHand = touches.filter(({ contact }) => contact.by === effector && live(contact.time));
      const hits = byHand.filter(({ contact }) => marked.has(contact.on)).map(({ contact, normal }): StrikeHit => {
        const travel = approach(contact.time), at = stepBefore(contact.time);
        const straight = travel && travel.direction[0] * normal[0] + travel.direction[1] * normal[1] + travel.direction[2] * normal[2];
        const ax = path[at + 1]! - path[at + 4]!, ay = path[at + 2]! - path[at + 5]!, az = path[at + 3]! - path[at + 6]!, arm = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        const along = travel && (travel.direction[0] * ax + travel.direction[1] * ay + travel.direction[2] * az) / arm;
        const bent = at < 0 ? Math.PI : path[at + 7]!, leaning = at < 0 ? Math.PI : path[at + 8]!;
        return { ...contact, speed: travel?.speed ?? null, straight, along, bend: bent, lean: leaning,
          fast: travel !== null && travel.speed >= bar.speed[hand], heavy: contact.kg >= bar.mass[hand], square: straight !== null && straight >= coneCosine,
          soon: times.began !== null && contact.time - times.began <= bar.within,
          lined: along !== null && along >= alongCosine, extended: bent <= bend, upright: leaning <= lean };
      });
      const meets = (hit: StrikeHit) => hit.fast && hit.heavy && hit.square && hit.soon && hit.lined && hit.extended && hit.upright;
      const hit = hits.find(meets) ?? hits.reduce<StrikeHit | null>((best, one) => best === null || (one.speed ?? 0) > (best.speed ?? 0) ? one : best, null);
      const ledger = id === null ? undefined : skills.report.ledger.find((record) => record.id === id);
      const outcome: StrikeOutcome = handed === null ? "unreached" : down ? "fell" : hit ? meets(hit) && times.ended !== null ? "landed" : "weak"
        : byHand.length ? byHand.every(({ contact }) => arms.has(contact.on)) ? "guarded" : "elsewhere"
        : times.committed !== null ? "missed" : id !== null ? "abandoned" : phase === "position" ? "outside" : phase === "waiting" ? "waiting" : "refused";
      return { outcome, phase, foePhase: foePhase ?? atHand, reason, handed, ready: ready ?? times.began, asked, ...times, ending: ledger?.ending.kind ?? null, hit, contacts: touches.map(({ contact }) => contact), taken,
        ...(letAt === null ? {} : { letGo: { at: letAt, again, opening } }), down, seconds: world.time };
    },
  };
}
