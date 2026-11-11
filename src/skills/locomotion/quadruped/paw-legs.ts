import type { GaitLimits, LegsDrive, Locomotion } from "../../framework/locomotion-part.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { supportHeight } from "../../../control/support-reference.ts";
import { Quaternion, Vector3 } from "../../../core/math/vector.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import type { SupportGoal } from "../../../control/supported-motor.ts";
import { rootFrameToRef, intoFrameToRef } from "../../../control/kinematics.ts";
import { withinSupport } from "../../../control/support.ts";
import type { StanceEnvelope } from "../../../control/stance/stance-envelope.ts";
import { cos, hypot, sin } from "../../../core/math/real.ts";
import { slotOne, type PartConfig } from "../../../parts/parts.ts";
import { motionAtToRef } from "../../../core/bodies/read-motion.ts";
import type { LocomotionPart } from "../../framework/locomotion-part.ts";
import type { LegsAsked } from "../../framework/skill.ts";
import { derive } from "../../../core/quantity.ts";
import { deepFreeze } from "../../../core/state.ts";
import { soleGoal } from "../../../control/quadruped/motion.ts";
import { STAND_TRAVEL, type TravelOrders } from "./travel.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { type Gait, type GaitReach } from "./parts.ts";
import { pawEndpoints, pawReader, pawView } from "../../../control/quadruped/paws.ts";
import { REPTILE_CRAWL, REPTILE_TROT } from "./tuning.ts";
import { pawsOf } from "../../../core/bodies/spec/body.ts";

/** **The paw legs**' config: the gait it travels by and the one it crawls by (`PawGaitPart`), the stock ones where it names none. */
interface PawMoveConfig { readonly kind: "paw-move"; readonly trot?: PartConfig; readonly crawl?: PartConfig }

/** The stock gaits: the trot to travel, the crawl close in and while the paws are placed again. */
const STOCK = deepFreeze({ trot: { kind: "paw-trot" }, crawl: { kind: "paw-crawl" } });

/** The gaits the paw legs go by, by name (`LegsGoal.gait`), in the order a walk offers them. */
const GAIT_NAMES = Object.freeze(["trot", "crawl"] as const);
type PawGaitName = typeof GAIT_NAMES[number];

/** What each gait is called. */
const LABELS: Readonly<Record<PawGaitName, string>> = Object.freeze({ trot: "Trot", crawl: "Crawl" });

/** The way `reach` carries the body as the speed rule and a walk read it (`StanceEnvelope`): forward at its travel, aside and back at its share of it, turning at its turn. */
function envelopeOf(name: PawGaitName, reach: GaitReach): StanceEnvelope {
  const forward = derive("m/s", `the ${name}'s fastest travel forward`, [], () => reach.forward);
  const aside = derive("m/s", `the ${name}'s travel aside and back: its share of its travel forward`, [forward], (f) => f * reach.aside);
  const turn = derive("rad/s", `the ${name}'s fastest turn`, [], () => reach.turn);
  return deepFreeze({ ways: { forward, right: aside, back: aside, left: aside }, turns: [{ speed: forward, turn }], tried: null });
}

/**
 * **The paw legs** of `body`: its paws (`pawEndpoints`) carried by its gaits, the trot to travel and
 * the crawl to creep, each step's support goal (`SupportGoal`) the body's paw motor carries out.
 *
 * - **The walk asked** (m/s, along the heading and to its right) is the gait's travel, a share of
 *   its selected gait's travel speed (`Gait.travel`), and the facing asked its heading. A gait named is the
 *   one it goes by, changing to it once the one it goes by settles; none named, it trots to walk
 *   and keeps its gait to stand. The crawl carries the body at the height asked, a share of its
 *   standing height (`BodyView.standing`), its own where none is asked.
 * - **A centre asked** is leaned toward where every paw but one bears, held within their support
 *   (`withinSupport`, `REPTILE_CRAWL.leanInset`).
 * - **Each paw** that bears and touches is the support's; any other is carried along its path to
 *   its place (`soleGoal`), in the root frame: the trot's kept on the ground from where it left the
 *   floor, against the trunk's motion there.
 * - **Finding its footing** (`resume`): back from another, it crawls, standing where it stands, until
 *   each paw has been placed again and every paw bears flat and the body is slow for
 *   `REPTILE_TROT.resumeHold` s.
 *
 * It holds the body still (the motor's holding response) crawling or standing settled, and travels
 * else. Its heading is the body's facing, it stops at the trot's acceleration and goes on nothing
 * once asked to slow, and it has placed its paws once its gait has settled and it is not finding
 * its footing. Its memory is its gaits', the gait it goes by, its footing and each paw's path.
 */
function pawLegs(body: Body, trot: Gait, creep: Gait): Locomotion {
  const { built, view } = body, paws = pawEndpoints(built), reading = pawReader(built).state, seen = pawView(built, view);
  const root = body.muscles.dynamics.root.segment, gaits: Readonly<Record<PawGaitName, Gait>> = { trot, crawl: creep };
  const envelopes: Readonly<Record<PawGaitName, StanceEnvelope>> = { trot: envelopeOf("trot", trot.reach), crawl: envelopeOf("crawl", creep.reach) };
  const limits: Readonly<Record<PawGaitName, GaitLimits>> = Object.freeze({ trot: Object.freeze({ envelope: envelopes.trot, stopping: trot.travel.stopping, lag: 0 }),
    crawl: Object.freeze({ envelope: envelopes.crawl, stopping: creep.travel.stopping, lag: 0 }) });
  const state = {
    kind: "trot" as PawGaitName, reacquire: false, homeAt: 0, stable: 0, pace: 0,
    /** The support's count (`SupportGoal.sequence`): a gait changed or the footing sought afresh. */
    support: 0,
    // Where each paw's travel path began, on the ground, and which path that was (its gait's sequence, twice, and whether it bears).
    swing: { key: paws.map(() => -1), start: paws.map(() => [0, 0, 0] as [number, number, number]) },
    trot: trot.state, crawl: creep.state,
  };
  const frame = { position: new Vector3(), rotation: new Quaternion() }, target = new Vector3(), inverse = new Quaternion(), desired = new Quaternion();
  const flat = new Quaternion(), lift = new Vector3(), descending = new Vector3(), still = new Vector3(), carried = new Vector3(), spin = new Vector3();
  const origin = new Vector3(), drift = new Vector3(), grounded = { origin, drift, firm: false, response: 0 };
  const support = paws.map(() => ({ corners: [new Vector3()] })), loaded: typeof support = [];
  const resumeGaits = (): void => { trot.resume(seen); creep.resume(seen); state.support++; };
  /** The orders `goal` asks of a gait: its walk a share of that gait's travel, world, and its facing. */
  const ordersOf = (goal: LegsAsked, heading: number, speed: number): TravelOrders => {
    const walk = goal.walk, s = sin(heading), c = cos(heading);
    return { move: walk ? { x: (walk[0] * s + walk[1] * c) / speed, z: (walk[0] * c - walk[1] * s) / speed } : null,
      face: { x: sin(goal.face), z: cos(goal.face) } };
  };
  const goalOf = (view: BodyView, goal: LegsAsked, dt: number): SupportGoal => {
    const placing = creep.state.placed < state.homeAt;
    if (state.reacquire && !placing && creep.state.phase === "settle") {
      const stable = seen.feet.every((foot) => foot.contact && foot.flat) && seen.velocity.lengthSquared() < REPTILE_TROT.resumeSpeed * REPTILE_TROT.resumeSpeed;
      state.stable = stable ? state.stable + dt : 0;
      if (state.stable >= REPTILE_TROT.resumeHold) state.reacquire = false;
    }
    const named = goal.gait === "trot" || goal.gait === "crawl" ? goal.gait : null;
    const wanted: PawGaitName = state.reacquire ? "crawl" : named ?? (goal.walk ? "trot" : state.kind);
    const asked = ordersOf(goal, view.stance.facing, gaits[wanted].travel.speed);
    const movement: TravelOrders = state.reacquire ? placing ? { move: { x: 0, z: 0 }, face: asked.face } : STAND_TRAVEL : asked;
    let active = gaits[state.kind];
    if (wanted !== state.kind && active.state.phase === "settle") {
      state.kind = wanted; active = gaits[wanted];
      active.resume(seen); state.support++;
    }
    const T = active.settings, walking = wanted !== state.kind ? STAND_TRAVEL : movement;
    state.pace = walking.move ? hypot(walking.move.x, walking.move.z) * active.travel.speed : 0;
    const command = state.kind === "crawl" ? creep.command(seen, walking, dt, goal.height === undefined ? creep.settings.crawlHeight : goal.height / supportHeight(view))
      : trot.command(seen, walking, dt);
    const centre: [number, number, number] = [command.centre[0], command.centre[1], command.centre[2]];
    if (goal.centre) {
      let bearing = 0;
      support.forEach((sole, i) => { if (reading.endpoints[i]!.contact) { sole.corners[0]!.copyFrom(reading.endpoints[i]!.at); loaded[bearing++] = sole; } });
      loaded.length = bearing;
      if (bearing >= support.length - 1) {
        const placed = withinSupport(loaded, goal.centre[0], goal.centre[1], REPTILE_CRAWL.leanInset);
        centre[0] = placed[0]; centre[2] = placed[1];
      }
    }
    rootFrameToRef(root, frame);
    desired.set(...command.rotation).multiplyToRef(Quaternion.InverseToRef(root.rest, inverse), desired);
    Quaternion.InverseToRef(frame.rotation, inverse).multiplyToRef(desired, flat).normalize();
    lift.set(0, T.lift, 0).applyRotationQuaternionToRef(inverse, lift);
    descending.set(0, -T.plantSpeed, 0).applyRotationQuaternionToRef(inverse, descending);
    const ends = command.endpoints.map((end, i) => {
      const paw = paws[i]!, swing = state.swing;
      if (end.bearing && reading.endpoints[i]!.contact) { swing.key[i] = -1; return { target: end.target, bearing: end.bearing, rotation: end.rotation, swing: null }; }
      const kept = state.kind === "trot" && T.swingResponse !== undefined;
      if (state.kind === "trot") motionAtToRef(root, target.set(...end.target), carried, spin);
      if (kept) {
        // Kept on the ground: the path begins where the paw left the floor and moves through
        // the root frame against the root's motion at the target.
        const key = active.state.sequence * 2 + (end.bearing ? 1 : 0), foot = reading.endpoints[i]!.at;
        if (swing.key[i] !== key) { swing.key[i] = key; swing.start[i]!.splice(0, 3, foot.x, foot.y, foot.z); }
        intoFrameToRef(frame, swing.start[i]!, origin);
        drift.copyFrom(carried).scaleInPlace(-1).applyRotationQuaternionToRef(inverse, drift);
        grounded.firm = !end.bearing; grounded.response = T.swingResponse!;
      } else if (state.kind === "trot") descending.set(-carried.x, -T.plantSpeed - carried.y, -carried.z).applyRotationQuaternionToRef(inverse, descending);
      intoFrameToRef(frame, end.target, target);
      return { target: end.target, bearing: end.bearing, rotation: end.rotation,
        swing: soleGoal(paw.point, target, end.bearing ? T.plant : T.swing, active.state.sequence, descending, flat, end.bearing ? still : lift, kept ? grounded : undefined) };
    });
    const hold = state.kind === "crawl" || active.state.standing && active.state.phase === "settle";
    return { centre, velocity: [command.velocity[0], command.velocity[1], command.velocity[2]], rotation: command.rotation, ends, hold, sequence: state.support };
  };
  return {
    state,
    supports: Object.freeze(pawsOf(built.spec).map(paw => paw.name)),
    lower: 0,
    get heading() { return view.stance.facing; },
    get stopping() { return gaits[state.kind].travel.stopping; },
    lag: 0,
    get pace() { return state.pace; },
    get placed() { return !state.reacquire && gaits[state.kind].state.phase === "settle"; },
    get gait() { return state.kind; },
    get envelope() { return envelopes[state.kind]; },
    gaits: GAIT_NAMES,
    limitsOf: (name) => name === "trot" || name === "crawl" ? limits[name] : null,
    resume() {
      resumeGaits();
      state.kind = "crawl"; state.reacquire = true; state.homeAt = creep.state.placed + paws.length; state.stable = 0;
    },
    goal(view: BodyView, goal: LegsAsked, dt: number): LegsDrive {
      return { kind: "support", goal: goalOf(view, goal, dt) };
    },
  };
}

/** **The paw legs** (`pawLegs`) as a kind of locomotion: a body on three paws or more (`fitsPaws`), its gaits the parts its config names (`PawGaitPart`). */
export const PAW_MOVE: LocomotionPart<PawMoveConfig> = deepFreeze({
  role: "locomotion", requires: [SUPPORT_REFERENCE], label: "Paw gaits", stage: "game", fields: [], defaults: { kind: "paw-move" }, keys: { kind: true, trot: true, crawl: true },
  slots: [slotOne("trot", "Trot", "paw-gait", true, STOCK.trot), slotOne("crawl", "Crawl", "paw-gait", true, STOCK.crawl)],
  fits: fitsPaws, faults: () => [],
  gaits: (config) => GAIT_NAMES.map((name) => ({ name, label: LABELS[name], legs: config[name] ?? STOCK[name] })),
  make(body, config, legs) {
    const built = body.built, root = body.muscles.dynamics.root.segment, reading = pawReader(built).state, names = pawEndpoints(built).map((paw) => paw.segment);
    const reads = { centre: reading.centre, velocity: reading.velocity, feet: reading.endpoints };
    const gait = (name: PawGaitName): Gait => {
      const given = config[name] ?? STOCK[name];
      return legs.parts.of("paw-gait", given).make(built, root, reads, names, given);
    };
    return pawLegs(body, gait("trot"), gait("crawl"));
  },
});
