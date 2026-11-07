import type { MindKit } from "../../framework/mind-kit.ts";
import { MOTOR_SUPPORT } from "../../../control/motor-part.ts";
import { bilateralBindings } from "../bilateral.ts";
import type { BodyControl } from "../../../core/bodies/body-control.ts";
import { Quaternion, Vector3 } from "../../../core/math/vector.ts";
import meta from "../../../../assets/skills/recovery/righting/righting.meta.json" with { type: "json" };
import type { BodyView } from "../../../control/body.ts";
import type { Clock } from "../../../core/world/clock.ts";
import type { Position } from "../../../control/ground-reading.ts";
import { chainTo, rootFrameToRef, intoFrameToRef } from "../../../control/kinematics.ts";
import { carries } from "../../../control/motor.ts";
import { servo } from "../../../control/servo.ts";
import { groundContact } from "../../../control/support.ts";
import type { EffectorGoal } from "../../../control/motor.ts";
import type { SupportGoal } from "../../../control/supported-motor.ts";
import { dataOf } from "../../../core/data/store.ts";
import { atan2, cos, hypot, sin } from "../../../core/math/real.ts";
import type { OwnBody } from "../../../core/bodies/own-body.ts";
import { channelName } from "../../../core/bodies/muscle/driver.ts";
import { fitsAll, fitsWhen, type KeysOf } from "../../../parts/parts.ts";
import { turnOfToRef } from "../../../core/bodies/read-motion.ts";
import type { TechniqueEnd, TechniquePart, TechniqueRun } from "../technique.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../../framework/records.ts";
import { pawsOf, segmentOf, type BodySpec, type DofSpec } from "../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { pawEndpoints, pawReader } from "../../../control/quadruped/paws.ts";
import { REPTILE_MOTOR } from "../../../control/quadruped/tuning.ts";
import { REPTILE_RECOVERY as T } from "./tuning.ts";
import { type Side, SIDES } from "../../../core/bodies/bilateral.ts";

/** The lowered posture and planting speed used while righting. */
const LOWERED = Object.freeze({ height: .85, plantSpeed: .05 });

/**
 * One pose of a righting recipe: each freedom's angle by its channel's name, the rest at their
 * reference angle. It gives way to the next once the trunk is up to `up`, or after `hold` s.
 */
export interface RightingFrame { readonly targets: Readonly<Record<string, number>>; readonly hold: number; readonly up: number }

/**
 * **A body's righting recipe**: the poses its freedoms are servoed through to bring it from lying
 * to its paws, found for the body offline (`scripts/skills/recovery/righting/righting.mjs`). `side`'s poses are
 * for the body on its right side; on its left they are mirrored.
 */
export interface RightingRecipe {
  /** Seconds at the reference pose before it reads how it lies. */
  readonly settle: number;
  /** The servo's time to a pose, s. */
  readonly servo: number;
  /** The trunk's up (the cosine of its tilt) and the centre of mass's speed, m/s, that the last pose holds for `still` s to hand the body back. */
  readonly upright: number;
  readonly calm: number;
  readonly still: number;
  /** Seconds of poses after which it has timed out. */
  readonly limit: number;
  readonly side: readonly RightingFrame[];
  /** On its back, the trunk's up under -.5; without them, `side`'s. */
  readonly back?: readonly RightingFrame[];
}

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's righting recipe. */
    "righting": SkillRecords<RightingRecipe>;
  }
}

/** Whether `recipe` can be played: poses on its side, none or some on its back, every number finite, and its servo's time positive. */
export function wholeRecipe(recipe: Partial<RightingRecipe>): boolean {
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return false;
  const side = recipe.side, back = recipe.back;
  if (!Array.isArray(side) || side.length === 0 || back !== undefined && (!Array.isArray(back) || back.length === 0)) return false;
  const frames = [...side, ...back ?? []];
  if (!frames.every(f => f && typeof f === "object" && f.targets && typeof f.targets === "object" && !Array.isArray(f.targets))) return false;
  const numbers = [recipe.settle, recipe.servo, recipe.upright, recipe.calm, recipe.still, recipe.limit, ...frames.flatMap((f) => [f.hold, f.up, ...Object.values(f.targets)])];
  return numbers.every((n) => typeof n === "number" && Number.isFinite(n)) && recipe.servo! > 0;
}

/** The body lying, on its back, a side or its front. */
const LYING: readonly Position[] = Object.freeze(["back", "left", "right", "front"]);

/** Edges to standing from each of `from`. */
const toStanding = (from: readonly Position[]) => deepFreeze(from.map((one) => ({ from: one, to: "standing" as const })));

/** The sides a righting is begun on: it reads how the body lies itself. */
const BOTH: readonly Side[] = SIDES;

/**
 * **Righting by recipe**: the body held at its reference pose for `settle` s, then servoed through
 * its recipe's poses for how it lies, and done once its last pose has held the trunk upright and
 * calm for `still` s; timed out after `limit` s of poses. Lying on its left, each freedom takes its
 * mirror image's angle: the freedom of the same name on the other side, its sense kept about the
 * body's x axis and turned about y and z, as a mirror in the body's x turns a rotation. It yields
 * while it settles.
 */
function rightingByRecipe(own: OwnBody, recipe: RightingRecipe): TechniqueRun {
  const channels = own.muscles.channels, names = channels.map((c) => c.name), root = own.muscles.dynamics.root.segment;
  const mirror = channels.map((c, i) => {
    const other = names.indexOf(names[i]!.replace(/\.left\b/, ".@").replace(/\.right\b/, ".left").replace(".@", ".right"));
    const a = c.joint.spec.dofs[c.index]!.axis.value;
    return { other: other < 0 ? i : other, sense: a[0] * a[0] - a[1] * a[1] - a[2] * a[2] };
  });
  const state = { phase: "idle" as "idle" | "settle" | "play", time: 0, frame: 0, since: 0, mirrored: false, lie: "side" as "side" | "back", still: -1 };
  const turn = new Quaternion(), up = new Vector3(), side = new Vector3();
  const readTurn = () => { turnOfToRef(root, turn); up.set(0, 1, 0).applyRotationQuaternionToRef(turn, up); side.set(1, 0, 0).applyRotationQuaternionToRef(turn, side); };
  return {
    state, get phase() { return state.phase; }, get yields() { return state.phase === "settle"; },
    admits: () => true,
    reached: (g, to) => g.position === to,
    begin() { state.phase = "settle"; state.time = 0; state.frame = 0; state.since = 0; state.still = -1; },
    end() { state.phase = "idle"; },
    step(g, _senses, control, dt): TechniqueEnd | null {
      state.time += dt;
      readTurn();
      if (state.phase === "settle") {
        servo(own.muscles, control.muscles, () => 0, recipe.servo, dt);
        if (state.time < recipe.settle) return null;
        // How it lies: on its back, or on a side, its right where the body's +x points down.
        state.lie = up.y < -.5 && recipe.back ? "back" : "side"; state.mirrored = side.y > 0;
        state.phase = "play"; state.time = 0; state.frame = 0; state.since = 0;
      }
      const frames = recipe[state.lie] ?? recipe.side, last = frames.length - 1;
      if (state.frame < last && (state.time - state.since >= frames[state.frame]!.hold || up.y >= frames[state.frame]!.up)) { state.frame++; state.since = state.time; }
      const calm = state.frame === last && state.time - state.since >= frames[last]!.hold && up.y >= recipe.upright && g.velocity.lengthSquared() <= recipe.calm * recipe.calm;
      if (!calm) state.still = -1;
      else if (state.still < 0) state.still = state.time;
      if (calm && state.time - state.still >= recipe.still) { state.phase = "idle"; return "done"; }
      if (state.time >= recipe.limit) { state.phase = "idle"; return "timed-out"; }
      const targets = frames[state.frame]!.targets;
      servo(own.muscles, control.muscles, (i) => {
        if (!state.mirrored) return targets[names[i]!] ?? 0;
        const m = mirror[i]!;
        return (targets[names[m.other]!] ?? 0) * m.sense;
      }, recipe.servo, dt);
      return null;
    },
  };
}

/** Where the body lies for the routes to roll it: on its back or a side. */
const ROLLED: readonly Position[] = Object.freeze(["back", "left", "right"]);

/** A leg's joints by their place in the chain from the trunk out to its paw. */
const HIP = 0, KNEE = 1;

/**
 * **Righting by routes**: grounded righting, clear leg routes, and a quiet supported rise, each leg
 * the chain from the trunk out to its paw (`pawEndpoints`): a hip, a knee and an ankle; its side
 * and its end where its paw is in the reference pose (+x the body's right, +z its front).
 *
 * - **Rolled upright**: the loaded hips push the trunk toward upright (`rightingGain`,
 *   `rightingDamping`), the rest of the body at its reference pose, until the ground reads it on
 *   its front or crouched (`Position`): a leg caught under the trunk tilts it short of upright.
 * - **Placed**: one paw at a time is routed clear round the trunk (swept, folded, unwound, unfolded)
 *   and pressed down, each placed paw held where it landed; turned onto its back or a side
 *   (`ROLLED`), it is rolled again and places every paw afresh.
 * - **Risen**: the mind's motor (`MindKit.motor`) carries the body up over its placed paws to the
 *   crawl's height, each paw not bearing brought down where it stands, and it is done once the body
 *   is up (`recoveryHeight`), on every paw flat and slow (`recoveredSpeed`) for `recovered` s.
 *
 * A route that takes too long (`routeLimit`) is tried the other way round the trunk; it times out
 * after `recoveryLimit` s. It yields until its paws are placed.
 */
function rightingByRoutes(own: OwnBody, view: BodyView, clock: Clock, kit: MindKit): TechniqueRun {
  const motor = kit.motor.make(own.built, own.muscles, clock.dt);
  if (!carries(motor, "support")) throw new Error("righting by routes needs a motor that carries a support over its paws");
  const reading = pawReader(own.built).state, feet = reading.endpoints, endpoints = pawEndpoints(own.built), root = own.muscles.dynamics.root.segment;
  const names = endpoints.map((e) => e.segment), paws = names.map((name) => own.built.segments.get(name)!);
  const legs = paws.map((paw) => chainTo(own.built, paw));
  const supports = legs.map((chain) => chain.map((joint) => joint.child).reverse());
  const parts = [...own.built.segments.values()];
  const hip = legs.map((chain) => own.muscles.channel(channelName(chain[HIP]!, 2))), knee = legs.map((chain) => own.muscles.channel(channelName(chain[KNEE]!, 0)));
  const sign = paws.map((paw) => paw.frame.origin[0] < 0 ? 1 : -1), fore = paws.map((paw) => paw.frame.origin[2] > 0 ? 1 : -1);
  const channels = own.muscles.channels.map((channel) => {
    const leg = legs.findIndex((chain) => chain.includes(channel.joint));
    return { leg, joint: leg < 0 ? -1 : legs[leg]!.indexOf(channel.joint), axis: channel.index };
  });
  const reference = own.spec.segments.reduce((sum, part) => sum + part.mass.value * part.centreOfMass.value[1], 0) / own.spec.mass.value;
  const state = { motor: motor.state, phase: "idle" as "idle" | "roll" | "place" | "rise", route: "start" as "start" | "sweep" | "fold" | "unwind" | "unfold" | "press",
    time: 0, elapsed: 0, stable: 0, paw: 0, yaw: 0, ground: 0, sequence: 0,
    placed: names.map(() => false), held: names.map(() => 0), loaded: names.map(() => false), direction: [...fore],
    centre: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number],
    targets: names.map(() => [0, 0, 0] as [number, number, number]), turns: names.map(() => [0, 0, 0, 1] as [number, number, number, number]) };
  const turn = new Quaternion(), heading = new Quaternion(), inverse = new Quaternion(), flat = new Quaternion();
  const vertical = new Vector3(0, 1, 0), lateral = new Vector3(1, 0, 0), forward = new Vector3(0, 0, 1), up = new Vector3(), side = new Vector3(), front = new Vector3(), spin = new Vector3(), moment = new Vector3();
  const point = new Vector3(), descending = new Vector3(), frame = { position: new Vector3(), rotation: new Quaternion() };
  const readTurn = () => { turnOfToRef(root, turn); vertical.applyRotationQuaternionToRef(turn, up); lateral.applyRotationQuaternionToRef(turn, side); forward.applyRotationQuaternionToRef(turn, front); };
  const start = () => {
    motor.reset(); state.phase = "roll";
    state.route = "start"; state.time = 0; state.elapsed = 0; state.stable = 0; state.paw = 0; state.sequence++;
    state.placed.fill(false); state.held.fill(0);
  };
  const nextRoute = (route: typeof state.route) => { state.route = route; state.time = 0; };
  const startRise = () => {
    state.phase = "rise"; state.time = 0; state.elapsed = 0; state.sequence++; motor.reset(); state.yaw = view.stance.facing;
    heading.set(0, sin(state.yaw / 2), 0, cos(state.yaw / 2)).multiplyToRef(root.rest, turn);
    state.rotation.splice(0, 4, turn.x, turn.y, turn.z, turn.w);
    state.centre[0] = feet.reduce((sum, foot) => sum + foot.at.x / names.length, 0);
    state.centre[2] = feet.reduce((sum, foot) => sum + foot.at.z / names.length, 0);
    state.targets.forEach((target, i) => {
      heading.multiplyToRef(paws[i]!.rest, turn); state.turns[i]!.splice(0, 4, turn.x, turn.y, turn.z, turn.w);
      target.splice(0, 3, feet[i]!.at.x, state.ground, feet[i]!.at.z);
    });
  };
  const swings = endpoints.map(endpoint => ({ places: [{ point: endpoint.point, position: [0, 0, 0] as [number, number, number] }],
    seconds: T.recoveryPath, follows: true, sequence: 0, terminalVelocity: [0, 0, 0] as [number, number, number],
    orientation: { target: [0, 0, 0, 1] as [number, number, number, number], seconds: T.recoveryPath } }));
  const riseEnds = state.targets.map((target, i) => ({ target, bearing: false, rotation: state.turns[i]!, swing: null as EffectorGoal | null }));
  const riseGoal = { centre: state.centre, velocity: [0, 0, 0] as [number, number, number], rotation: state.rotation, hold: true, sequence: 0, ends: riseEnds } satisfies SupportGoal;
  /** The rise this step: the body carried up over its placed paws, each not bearing brought down where it stands; whether it is done. */
  const rise = (control: BodyControl, dt: number): TechniqueEnd | null => {
    state.centre[1] = state.ground + reference * LOWERED.height;
    rootFrameToRef(root, frame); Quaternion.InverseToRef(frame.rotation, inverse);
    inverse.multiplyToRef(heading.set(0, sin(state.yaw / 2), 0, cos(state.yaw / 2)), flat).normalize();
    descending.set(0, -LOWERED.plantSpeed, 0).applyRotationQuaternionToRef(inverse, descending);
    riseGoal.sequence = state.sequence;
    for (let i = 0; i < riseEnds.length; i++) {
      const end = riseEnds[i]!, swing = swings[i]!;
      end.bearing = feet[i]!.contact;
      end.swing = end.bearing ? null : swing;
      if (end.bearing) continue;
      intoFrameToRef(frame, state.targets[i]!, point);
      swing.places[0]!.position[0] = point.x; swing.places[0]!.position[1] = point.y; swing.places[0]!.position[2] = point.z;
      swing.sequence = state.sequence;
      swing.terminalVelocity[0] = descending.x; swing.terminalVelocity[1] = descending.y; swing.terminalVelocity[2] = descending.z;
      swing.orientation.target[0] = flat.x; swing.orientation.target[1] = flat.y; swing.orientation.target[2] = flat.z; swing.orientation.target[3] = flat.w;
    }
    motor.setSupport(riseGoal); motor.control(own.muscles, control, dt);
    const stable = !view.down && reading.centre.y - state.ground >= reference * T.recoveryHeight && feet.every((foot) => foot.contact && foot.flat)
      && reading.velocity.lengthSquared() < T.recoveredSpeed * T.recoveredSpeed;
    state.stable = stable ? state.stable + dt : 0;
    if (state.stable >= T.recovered) return "done";
    return state.elapsed >= T.recoveryLimit ? "timed-out" : null;
  };
  return {
    state, get phase() { return state.phase === "place" ? `place:${state.route}` : state.phase; }, get yields() { return state.phase === "roll"; },
    admits: () => true,
    reached: (g, to) => g.position === to,
    begin() { start(); },
    end() { state.phase = "idle"; motor.reset(); },
    step(g, _senses, control, dt): TechniqueEnd | null {
      state.time += dt; state.elapsed += dt;
      motor.read();
      let ground = 0, contacts = 0;
      for (const part of parts) for (const contact of own.built.physics.contactsOf(part.body))
        if (groundContact(contact, REPTILE_MOTOR.supportNormal)) { ground += contact.point[1]; contacts++; }
      if (contacts) state.ground = ground / contacts;
      supports.forEach((chain, i) => { state.loaded[i] = chain.some((part) => own.built.physics.contactsOf(part.body)
        .some((contact) => groundContact(contact, REPTILE_MOTOR.supportNormal))); });
      readTurn();
      if (state.phase === "roll" && (g.position === "front" || g.position === "crouch")) { state.phase = "place"; state.time = 0; state.elapsed = 0; }
      else if (state.phase === "place" && ROLLED.includes(g.position)) { state.phase = "roll"; state.paw = 0; state.placed.fill(false); nextRoute("start"); }
      if (state.phase === "rise") return rise(control, dt);
      const size = hypot(up.x, up.z), angle = atan2(size, up.y), gain = size > T.rightingEpsilon ? T.rightingGain * angle / size : 0;
      root.body.angularVelocityToRef(spin);
      // A hip's child torque gives the opposite moment to the trunk. Only a loaded leg supplies
      // this grounded push; the ordinary servo solves the other freedoms around it.
      const bank = size <= T.rightingEpsilon && up.y < 0 ? T.rightingGain * atan2(0, -1) : 0;
      moment.set(gain * up.z + bank * front.x + T.rightingDamping * spin.x, T.rightingDamping * spin.y,
        -gain * up.x + bank * front.z + T.rightingDamping * spin.z);
      const roll = atan2(side.y, up.y), moving = state.phase === "place" ? state.paw : -1;
      if (moving >= 0 && state.route === "start") nextRoute(sign[moving]! * own.muscles.angle(hip[moving]!) < T.wrappedHip ? "unfold" : "sweep");
      servo(own.muscles, control.muscles, (i) => {
        const { leg, joint, axis } = channels[i]!;
        if (leg < 0) return state.phase === "roll" ? 0 : own.muscles.angle(i);
        const s = sign[leg]!, direction = state.direction[leg]!, h = own.muscles.angle(hip[leg]!), k = own.muscles.angle(knee[leg]!);
        if (state.placed[leg]) {
          if (joint === HIP) return axis === 2 ? state.held[leg]! : 0;
          if (joint === KNEE) return s * T.plantedKnee;
          return axis === 1 ? -state.held[leg]! - k - roll : 0;
        }
        if (leg === moving) {
          let yaw = 0, pitch = 0, hipGoal = h, kneeGoal = s * T.plantedKnee;
          switch (state.route) {
            case "start": break;
            case "sweep": yaw = -s * direction * T.sweepYaw; kneeGoal = k; break;
            case "fold": yaw = -s * direction * T.sweepYaw; pitch = -direction * T.foldHip; kneeGoal = s * T.foldKnee; break;
            case "unwind":
              yaw = s * direction * T.sweepYaw * (1 - 2 * Math.max(0, Math.min(1, (s * h + T.foldHip) / (T.unwindHip + T.foldHip))));
              pitch = -direction * T.foldHip; hipGoal = -s * T.foldHip; kneeGoal = s * T.foldKnee; break;
            case "unfold": hipGoal = -s * T.foldHip; break;
            case "press": hipGoal = h + s * (feet[leg]!.at.y - state.ground + T.pressDepth) / T.pressLever; break;
            default: { const never: never = state.route; throw new Error(`unknown placement route ${never}`); }
          }
          if (joint === HIP) return axis === 0 ? yaw : axis === 1 ? pitch : hipGoal;
          if (joint === KNEE) return kneeGoal;
          return axis === 1 ? -h - k - roll : 0;
        }
        if (joint === HIP && state.loaded[leg]) {
          const axis = own.muscles.dynamics.axis(i), torque = moment.x * axis[0] + moment.y * axis[1] + moment.z * axis[2];
          const sense = torque >= 0 ? 1 : -1, strength = own.muscles.strength(i, sense);
          control.muscles.velocity[i] = sense * Infinity; control.muscles.activation[i] = strength > 0 ? Math.min(1, Math.abs(torque) / strength) : 0;
          return undefined;
        }
        return state.phase === "roll" ? 0 : own.muscles.angle(i);
      }, state.phase === "roll" ? REPTILE_MOTOR.posture : T.recoveryServo, dt,
      { seconds: (i) => channels[i]!.leg === moving ? T.placementServo : state.phase === "roll" ? REPTILE_MOTOR.posture : T.recoveryServo, rate: () => 0, acceleration: () => 0 });
      if (moving >= 0) {
        const s = sign[moving]!, near = (joint: number, axis: number, target: number) =>
          Math.abs(own.muscles.angle(own.muscles.channel(channelName(legs[moving]![joint]!, axis))) - target) < T.placementError;
        if (state.route === "sweep" && state.time >= T.foldWait && near(HIP, 0, -s * state.direction[moving]! * T.sweepYaw)) nextRoute("fold");
        else if (state.route === "fold" && state.time >= T.foldWait && !feet[moving]!.contact && feet[moving]!.low - state.ground > REPTILE_MOTOR.contactMargin) nextRoute("unwind");
        else if (state.route === "unwind" && near(HIP, 2, -s * T.foldHip)) nextRoute("unfold");
        else if (state.route === "unfold" && near(KNEE, 0, s * T.plantedKnee) && near(HIP, 1, 0)) nextRoute("press");
        if (state.route === "press" && state.time >= T.pressWait && feet[moving]!.contact) {
          state.placed[moving] = true; state.held[moving] = own.muscles.angle(hip[moving]!); state.paw++; nextRoute("start");
          if (state.paw === names.length) startRise();
        }
        if (state.phase === "place" && state.time >= T.routeLimit) { state.direction[moving] *= -1; nextRoute("sweep"); }
      }
      return state.elapsed >= T.recoveryLimit ? "timed-out" : null;
    },
  };
}

/** **Righting by recipe**'s config: its kind, and an experiment's research `tuning`, a whole recipe in place of its body's, which a link does not carry. */
interface RecipeConfig { readonly kind: "righting-recipe"; readonly tuning?: Partial<RightingRecipe> }

/** What the rightings share: begun on either side, from where the body lies as it moves, to standing. */
const RIGHTING = { bindings: (spec: BodySpec) => bilateralBindings(spec, BOTH), role: "technique", stage: "game", moving: true, starts: BOTH, fields: [], slots: [] } as const;

/**
 * **Righting by recipe** (`rightingByRecipe`) as a way up from lying (`LYING`): a body on paws
 * (`fitsPaws`) with a righting record of its own (`assets/skills/recovery/righting/righting.json`,
 * `dataOf("righting")`), or a whole research recipe in its place. It is done once its last pose
 * holds the trunk upright and still, wherever its legs bear.
 */
export const RIGHTING_RECIPE: TechniquePart<RecipeConfig> = deepFreeze({
  ...RIGHTING, edges: toStanding(LYING), label: "Right by recipe", defaults: { kind: "righting-recipe" }, keys: { kind: true, tuning: true } as KeysOf<RecipeConfig>, tuning: ["settle", "servo", "upright", "calm", "still", "limit", "side", "back"],
  fits: fitsAll<RecipeConfig>(fitsPaws, recordFault("righting", deepFreeze(meta.bodies), wholeRecipe)),
  faults: (config: RecipeConfig) => config.tuning === undefined || wholeRecipe(config.tuning) ? [] : ["invalid righting recipe"],
  reads: () => ["righting"],
  make: (own: OwnBody, _view: BodyView, _clock: Clock, _kit: MindKit, config: RecipeConfig) =>
    rightingByRecipe(own, tunedSettings(dataOf("righting"), own.spec, config)),
});

/**
 * Whether every leg of a body of `spec` can take the routes' poses (`rightingByRoutes`): each
 * freedom the routes servo ranges over the angles they ask of it on its side, the hip's yaw to
 * either `sweepYaw`, its pitch to either `foldHip`, its roll from `-foldHip` to `unwindHip` and the
 * knee to `plantedKnee` and `foldKnee`. A leg that cannot is held short of a route's goal, and the
 * route never ends.
 */
const holdsRoutes = (spec: BodySpec): boolean => pawsOf(spec).every((paw) => {
  const above = (segment: string) => spec.joints.find((joint) => joint.child === segment)!;
  const knee = above(above(paw.segment).parent), hip = above(knee.parent), s = segmentOf(spec, paw.segment)!.proximal.value[0] < 0 ? 1 : -1;
  const holds = (dof: DofSpec | undefined, ...angles: number[]) =>
    dof !== undefined && angles.every((angle) => dof.min.value <= angle && angle <= dof.max.value);
  return holds(hip.dofs[0], -T.sweepYaw, T.sweepYaw) && holds(hip.dofs[1], -T.foldHip, T.foldHip) && holds(hip.dofs[2], -s * T.foldHip, s * T.unwindHip)
    && holds(knee.dofs[0], s * T.plantedKnee, s * T.foldKnee);
});

/**
 * **Righting by routes** (`rightingByRoutes`) as a way up from lying, crouched on its paws or
 * between: a body on paws (`fitsPaws`) whose legs take the routes' poses (`holdsRoutes`), carried
 * up by its mind's motor.
 */
export const RIGHTING_ROUTES: TechniquePart<{ readonly kind: "righting-routes" }> = deepFreeze({
  ...RIGHTING, requires: [MOTOR_SUPPORT], edges: toStanding([...LYING, "crouch", "between"]), label: "Right by routes", defaults: { kind: "righting-routes" }, keys: { kind: true },
  fits: fitsAll(fitsPaws, fitsWhen(holdsRoutes, "needs legs whose ranges hold the righting routes' poses")), faults: () => [],
  make: (own: OwnBody, view: BodyView, clock: Clock, kit: MindKit) => rightingByRoutes(own, view, clock, kit),
});
