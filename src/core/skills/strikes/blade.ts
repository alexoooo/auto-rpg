import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../../body.ts";
import type { Pose } from "../../spec/pose.ts";
import { heldFrame } from "../../build/rigid.ts";
import { intoFrameToRef } from "../../control/kinematics.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { effectorStrike, type StrikeCourse } from "./effector-strike.ts";
import { STRIKE_EVENT } from "./strike-cycle.ts";
import { placedHeightFits, placedReach } from "./arm-reach.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetResolver } from "../framework/action.ts";
import { withinActionWindow } from "../../intent/action-window.ts";

/** Freely tuned trajectory and lifecycle limits for physical blade actions, in metres and seconds. */
export const BLADE_STRIKE = Object.freeze({ chamberSeconds: .4, swingSeconds: .45, returnSeconds: .5, contactSpeed: .8,
  windup: .18, through: .04, near: .06, slow: .6, hold: .05, prepareLimit: 2, returnLimit: 2.5, followSeconds: .04 });
export type BladeSettings = { readonly [K in keyof typeof BLADE_STRIKE]: number };

/** Blade settings retain finite positive times, speeds and physical readiness tolerances. */
export function validBladeSettings(settings: BladeSettings): boolean {
  return Object.values(settings).every(value => Number.isFinite(value) && value >= 0)
    && [settings.chamberSeconds, settings.swingSeconds, settings.returnSeconds, settings.contactSpeed,
      settings.near, settings.slow, settings.hold, settings.prepareLimit, settings.returnLimit].every(value => value > 0);
}

/** A region's same-named point is the physical endpoint its executor controls. */
function endpoint(spec: BodySpec, effector: string, mechanism: "edge" | "point") {
  const held = spec.held?.find(held => held.segment === effector);
  const region = held?.item.contacts?.find(region => region.surface.directed?.mechanism === mechanism && held.item.points[region.name]);
  if (!held || !region) return null;
  const frame = heldFrame(held), d = region.surface.directed!.direction.value;
  const at = held.item.points[region.name]!.value, norm = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  let rear: string | null = null, span = 0;
  for (const [name, point] of Object.entries(held.item.points)) {
    const difference = at.map((value, k) => value - point.value[k]!), distance = Math.sqrt(difference.reduce((sum, value) => sum + value * value, 0));
    const forward = difference.reduce((sum, value, k) => sum + value * d[k]!, 0);
    if (distance > span && forward / (distance * norm) >= 1 - 1e-8) { rear = name; span = distance; }
  }
  if (!rear) return null;
  const direction: Vec3 = [0, 1, 2].map(k => frame.x[k]! * d[0] + frame.y[k]! * d[1] + frame.z[k]! * d[2]) as unknown as Vec3;
  return { point: region.name, direction, rear, span, alignment: region.surface.directed!.alignment.value };
}

/** Whether a held item supplies the directed region and named point this blade action requires. */
export const strikesWithBlade = (spec: BodySpec, effector: string, mechanism: "edge" | "point"): boolean => endpoint(spec, effector, mechanism) !== null;


/** Cuts and thrusts share the bounded strike lifecycle, with an independent turn that aims the actual region. */
export function bladeExecutor(body: Body, guard: Pose, actions: readonly string[], mechanism: "edge" | "point", settings: BladeSettings,
  resolve: TargetResolver, contactDirection?: TargetResolver): Executor {
  if (!validBladeSettings(settings)) throw new Error("invalid blade strike settings");
  const spec = body.built.spec, hands = ["left", "right"] as const;
  const ends = { left: endpoint(spec, "hand.left", mechanism), right: endpoint(spec, "hand.right", mechanism) };
  const make = (hand: Side) => ends[hand] ? effectorStrike({ effector: `hand.${hand}`, point: ends[hand]!.point,
    limits: settings, chamberSeconds: settings.chamberSeconds, returnSeconds: settings.returnSeconds }) : null;
  const strikes = { left: make("left"), right: make("right") };
  interface Motion {
    request: ActionRequest; target: Vec3; home: Vec3; direction: Vec3; axisDirection: Vec3;
    homeRear: Vec3;
    homeTurn: readonly [number, number, number, number]; targetTurn: readonly [number, number, number, number];
    withdrawn: boolean; ending: ActionEnding;
  }
  const state = { lives: { left: null as Motion | null, right: null as Motion | null }, cycles: { left: strikes.left?.state ?? null, right: strikes.right?.state ?? null } };
  const handOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`a blade action cannot use ${effector}`);
  };
  const check = (action: string) => { if (!actions.includes(action)) throw new Error(`no blade action ${action}`); };
  const target = new Vector3(), direction = new Vector3(), inverse = new Quaternion();
  const courseOf = (view: BodyView, live: Motion): StrikeCourse => {
    intoFrameToRef(view.root, live.target, target);
    direction.set(...live.direction).applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), direction).normalize();
    const travel: Vec3 = [direction.x, direction.y, direction.z];
    return { home: live.home, chamber: [target.x - travel[0] * settings.windup, target.y - travel[1] * settings.windup, target.z - travel[2] * settings.windup],
      target: [target.x + travel[0] * settings.through, target.y + travel[1] * settings.through, target.z + travel[2] * settings.through],
      contactVelocity: travel.map(value => value * settings.contactSpeed) as unknown as Vec3, seconds: settings.swingSeconds };
  };
  const holds = (hand: Side) => strikes[hand]!.state.phase === "return" ? [`hand.${hand}`] : [`hand.${hand}`, "trunk", "legs"];
  return {
    state,
    needs(action, effector) { check(action); return [effector, "trunk", "legs"]; },
    readiness(view, action, effector, requested, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown blade action" };
      if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" };
      const hand = handOf(effector), end = ends[hand];
      if (!end) return { kind: "blocked", reason: "no directed held region with a named aiming point" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.lives[hand]) return { kind: "waiting", reason: "blade is occupied" };
      const at = resolve(view, requested, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      const up = at[1] - view.head.y;
      if (!placedHeightFits(spec, hand, up, end.point)) return { kind: "blocked", reason: "target is outside the blade's height band" };
      const reach = placedReach(spec, hand, up, end.point);
      const window = { at, along: [Math.max(.1, reach - .5), reach + .1] as const, across: [-.5, .5] as const, facing: .8, speed: .5 };
      return withinActionWindow(view, window, around.heading) ? { kind: "ready", window } : { kind: "position", window };
    },
    start(view, request) {
      check(request.action);
      const hand = handOf(request.effector), end = ends[hand], strike = strikes[hand];
      if (!end || !strike || state.lives[hand]) throw new Error("the blade hand is unsupported or occupied");
      const at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("blade target has no aim");
      const home = view.effectors[request.effector]!.points[end.point]!, rear = view.effectors[request.effector]!.points[end.rear]!;
      const rotation = view.effectors[request.effector]!.rotation;
      const requested = request.target.kind === "point" ? request.target.direction : contactDirection?.(view, request.target, request.action, request.effector);
      direction.set(...requested ?? [0, 0, 1]);
      if (!requested) direction.applyRotationQuaternionToRef(view.root.rotation, direction);
      if (!(direction.lengthSquared() > 0) || ![direction.x, direction.y, direction.z].every(Number.isFinite)) throw new Error("a blade needs a finite contact direction");
      direction.normalize();
      const worldDirection: Vec3 = [direction.x, direction.y, direction.z];
      direction.applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), direction);
      const from = new Vector3(...end.direction).applyRotationQuaternionToRef(rotation, new Vector3()).normalize();
      const dot = Vector3.Dot(from, direction), axis = Vector3.Cross(from, direction);
      const turn = dot > -.999999 ? new Quaternion(axis.x, axis.y, axis.z, 1 + dot).normalize()
        : new Quaternion(...(Math.abs(from.x) < .9 ? [0, -from.z, from.y, 0] : [-from.y, from.x, 0, 0]) as [number, number, number, number]).normalize();
      turn.multiplyInPlace(rotation).normalize();
      const actual = new Vector3(...end.direction).applyRotationQuaternionToRef(rotation, new Vector3())
        .applyRotationQuaternionToRef(view.root.rotation, new Vector3()).normalize();
      const intended = new Vector3(...worldDirection), forward = Vector3.Dot(actual, intended);
      // A thrust keeps the nearest comfortable tilt inside its surface's admitted cone, leaving roll free.
      const cosine = Math.max(end.alignment, .95);
      if (mechanism === "point" && forward < cosine) {
        const tangent = actual.subtract(intended.scale(forward));
        if (tangent.lengthSquared() > 1e-12) actual.copyFrom(intended.scale(cosine).add(tangent.normalize().scale(Math.sqrt(1 - cosine * cosine))));
        else actual.copyFrom(intended);
      } else if (mechanism === "edge") actual.copyFrom(intended);
      state.lives[hand] = { request: { ...request }, target: [...at], home: [home.x, home.y, home.z], direction: worldDirection,
        axisDirection: [actual.x, actual.y, actual.z],
        homeRear: [rear.x, rear.y, rear.z], homeTurn: [rotation.x, rotation.y, rotation.z, rotation.w],
        targetTurn: [turn.x, turn.y, turn.z, turn.w], withdrawn: false, ending: { kind: "completed" } };
      strike.state.previous = [home.x, home.y, home.z]; strike.begin("chamber", [0, 0, 0]);
    },
    update(view, continued, _around, dt) {
      const updates: LifecycleUpdate[] = [];
      for (const hand of hands) {
        const live = state.lives[hand], strike = strikes[hand];
        if (!live || !strike) continue;
        const velocity = strike.read(view, dt);
        if (view.down) { updates.push({ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } }); state.lives[hand] = null; strike.reset(); continue; }
        if (!continued.some(request => request.id === live.request.id)) { live.withdrawn = true; live.ending = { kind: "cancelled" }; }
        if (strike.state.phase === "chamber" && !resolve(view, live.request.target, live.request.action, live.request.effector)) {
          live.withdrawn = true; live.ending = { kind: "lost", reason: "target is no longer sensed" };
        }
        const course = courseOf(view, live), rotation = view.effectors[live.request.effector]!.rotation;
        direction.set(...ends[hand]!.direction).applyRotationQuaternionToRef(rotation, direction).normalize();
        const aligned = (direction.x * course.contactVelocity[0] + direction.y * course.contactVelocity[1] + direction.z * course.contactVelocity[2]) / settings.contactSpeed >= ends[hand]!.alignment;
        const event = strike.step(view, velocity, course, { requested: !live.withdrawn, down: false, supported: true,
          prepared: aligned, free: true, targetId: live.request.target.body }, dt);
        if (event & STRIKE_EVENT.failed) live.ending = { kind: "stalled", reason: strike.state.phase === null ? "blade return deadline" : "blade preparation deadline" };
        if (event & STRIKE_EVENT.finished) { updates.push({ id: live.request.id, ending: live.ending }); state.lives[hand] = null; strike.reset(); continue; }
        updates.push({ id: live.request.id, phase: strike.state.phase === "chamber" ? "prepare" : strike.state.phase === "swing" ? "commit" : "release",
          stage: strike.state.phase ?? "return", holds: holds(hand) });
      }
      return updates;
    },
    command(view, id) {
      const hand = hands.find(hand => state.lives[hand]?.request.id === id);
      if (!hand) throw new Error(`no blade instance ${id}`);
      const live = state.lives[hand]!, strike = strikes[hand]!, phase = strike.state.phase;
      const posture = Object.fromEntries(Object.entries(guard).filter(([name]) => name.startsWith(`shoulder.${hand} `) || name.startsWith(`elbow.${hand} `) || name.startsWith(`wrist.${hand} `)));
      const course = courseOf(view, live), goal = strike.goal(course), end = ends[hand]!;
      if (mechanism === "edge") return { posture, handPoses: { [`hand.${hand}`]: "grip" as const },
        effectors: { [live.request.effector]: strike.goal(course, { target: phase === "return" ? live.homeTurn : live.targetTurn,
          seconds: phase === "return" ? settings.returnSeconds : settings.chamberSeconds }) },
        ...(phase !== "return" ? { legs: { walk: null } } : {}) };
      direction.set(...live.axisDirection).applyRotationQuaternionToRef(Quaternion.InverseToRef(view.root.rotation, inverse), direction);
      const axis: Vec3 = [direction.x, direction.y, direction.z];
      const rear = phase === "return" ? live.homeRear : goal.places[0]!.position.map((value, k) => value - axis[k]! * end.span) as unknown as Vec3;
      return { posture, handPoses: { [`hand.${hand}`]: "grip" as const }, effectors: { [live.request.effector]: {
        places: [goal.places[0]!, { point: end.rear, position: rear }], seconds: goal.seconds, follows: true, sequence: goal.sequence } },
        ...(phase !== "return" ? { legs: { walk: null } } : {}) };
    },
    interrupt(_view, id) { for (const hand of hands) if (state.lives[hand]?.request.id === id) { state.lives[hand] = null; strikes[hand]?.reset(); } },
    resume() { for (const hand of hands) { state.lives[hand] = null; strikes[hand]?.reset(); } },
  };
}
