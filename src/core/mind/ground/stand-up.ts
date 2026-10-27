import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { carrying } from "../../control/motor.ts";
import type { StanceGoal } from "../../control/stance.ts";
import { turnOfToRef } from "../../control/support.ts";
import { atan2, cos, sin } from "../../math/real.ts";
import { SERVO_SECONDS, type BodyView } from "../../body.ts";
import type { MindKit } from "../kit.ts";
import { locomotion, STANCE_LOWER } from "../../skills/locomotion.ts";
import type { Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { Clock } from "../../clock.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { flatten } from "./flatten.ts";
import { awaits, choose, graphWork, type GraphFailure, type GraphTechnique, type RouteStep } from "./graph.ts";
import { edgeProfile } from "./profiles.ts";
import { quietOnFeet, standReady, tumbling, type GroundReading, type Position } from "./reading.ts";
import type { Senses } from "../senses.ts";
import { poseDrive, type TechniqueConfig, type TechniqueEnd, type TechniquePart, type TechniqueRun } from "./technique.ts";
import type { PartLookup } from "../lookup.ts";

/** Protective flexion keeps the chin tucked and the forearms before the face while falling. */
const BRACE = deepFreeze({ "cervical flexion": .3, "shoulder.left flexion": .8, "shoulder.right flexion": .8,
  "elbow.left flexion": 1.7, "elbow.right flexion": 1.7, "hip.left flexion": .8, "hip.right flexion": .8,
  "knee.left flexion": 1.2, "knee.right flexion": 1.2 });
/** Bounded settling, retry and log limits prevent unobserved waits and unlimited history. */
const BRACE_LIMIT = 1, STEADY_LIMIT = 2, BACKOFF = 2, RETRIES = 2, LOG_SIZE = 32;
/**
 * **The climb** from a crouch quiet on both feet (`quietOnFeet`, lower than `below` of standing
 * height): the centre of mass carried from where it is, at its speed, to standing height over the
 * feet's middle at rest on a quintic over `seconds`, the pelvis from its pitch to upright, the
 * posture from the crouch's angles to the guard's on a minimum-jerk path, the feet planted
 * (`StanceGoal.pose`, followed at `response` s); then the stance's own goal at standing height
 * (`docs/reference/rising.md#a-planned-climb`).
 */
const CLIMB = deepFreeze({ seconds: .6, response: .08, below: .9 });
/** Both feet. */
const BOTH: readonly Side[] = deepFreeze(["left", "right"]);
type Mode = "execute" | "brace" | "land" | "steady" | "reposition" | "stuck";
/** A body read with no support (`between`) is still landing while faster than this, m/s. */
const LANDING = .1;
interface Attempt { technique: string; side: Side; from: Position; to: Position; seconds: number }
interface Entry extends Attempt { end: TechniqueEnd | "ready" | "steady-limit" }

/** Preferred contracts for recovering the feet, in player order. */
export interface StandUpConfig { readonly kind: "stand-up"; readonly techniques: readonly TechniqueConfig[] }

/** The techniques a stand-up repositions the body by where no route stands it up: onto its back from its front, else onto its front. */
export const REPOSITION = deepFreeze([{ kind: "roll" }, { kind: "roll-back" }]);

/** The techniques `config` routes through and those it repositions by, by kind, as `parts` finds them. */
export const techniquesOf = (parts: PartLookup, config: StandUpConfig): Readonly<Record<string, TechniquePart>> =>
  Object.fromEntries([...config.techniques, ...REPOSITION].map((technique) => [technique.kind, parts.of("technique", technique)]));

/** A supervisor retries contracts from the body as read; no successful reposition clears a failure. */
export function standUp(own: OwnBody, view: BodyView, clock: Clock, config: StandUpConfig, kit: MindKit,
  given?: Readonly<Record<string, TechniquePart>>): SubMind {
  const registry = given ?? techniquesOf(kit.parts, config);
  const runs: Record<string, TechniqueRun> = {}, graph: Record<string, GraphTechnique> = {}, order: readonly string[] = config.techniques.map((technique) => technique.kind);
  // `moving`: the graph a tumbling body is routed on, its first edge one whose entry reads motion (`TechniquePart.moving`).
  const moving: Record<string, GraphTechnique> = {};
  // `waits`: it routes through an edge whose entry reads motion, so a body still landing is held for one rather than routed.
  let waits = false;
  for (const [name, spec] of Object.entries(registry)) if (spec.fits(own.spec, spec.defaults, kit.parts) === null) {
    const run = spec.make(own, view, clock, order.includes(name), kit); runs[name] = run;
    waits ||= spec.moving && order.includes(name);
    const profile = edgeProfile(own.spec.model, name);
    graph[name] = { sides: spec.sides, edges: spec.edges, raw: spec.moving, profile, admits: (g, side) => run.admits(g, side) };
    moving[name] = { sides: spec.sides, edges: spec.edges, raw: spec.moving, profile, admits: (g, side) => spec.moving && run.admits(g, side) };
  }
  runs.flatten = flatten(own, view);
  const drive = poseDrive(own.muscles), work = graphWork(), legs = locomotion(null);
  const motor = carrying(kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist), ["stance"], "the stand-up");
  const state = { active: false, mode: "brace" as Mode, time: 0, ready: 0, braceUsed: false,
    current: null as Attempt | null, route: [] as RouteStep[], failures: [] as GraphFailure[],
    reposition: [] as string[], steadyTried: [] as Position[], log: [] as Entry[], omitted: 0,
    handBack: null as "ready" | "steady-limit" | null,
    climb: { on: false, done: false, time: 0, centre: [0, 0], velocity: [0, 0], to: [0, 0], height: 0, rise: 0, pitch: 0,
      from: new Float64Array(own.muscles.channels.length) },
    techniques: Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, run.state])),
    motor: motor.state, legs: legs.state,
    command: { activation: new Float64Array(own.muscles.channels.length), velocity: new Float64Array(own.muscles.channels.length) } };
  const clear = () => { state.failures.length = 0; state.reposition.length = 0; state.steadyTried.length = 0; state.route.length = 0; };
  const log = (entry: Entry) => { if (state.log.length >= LOG_SIZE) { state.log.shift(); state.omitted++; } state.log.push(entry); };
  const mode = (next: Mode) => { state.mode = next; state.time = 0; };
  const remember = () => { state.command.activation.set(own.muscles.activation); state.command.velocity.set(own.muscles.velocity); };
  const carry = () => { own.muscles.activation.set(state.command.activation); own.muscles.velocity.set(state.command.velocity); };
  const turn = new Quaternion(), up = new Vector3(), climbPose: Record<string, number> = {};
  /** The steady's goal this step: `goal`, or the climb's while it runs (`CLIMB`), beginning it where the body allows. */
  const climbing = (goal: StanceGoal, dt: number): StanceGoal => {
    const c = state.climb, r = motor.stance.reading, h = legs.heading, top = view.standing - STANCE_LOWER;
    if (c.done) return { ...goal, height: top };
    if (!c.on) {
      const g = view.ground;
      if (!g || !quietOnFeet(g) || g.height >= CLIMB.below) return goal;
      turnOfToRef(motor.root, turn);
      up.set(0, 1, 0).applyRotationQuaternionToRef(turn, up);
      c.on = true; c.time = 0;
      c.centre[0] = r.centre.x; c.centre[1] = r.centre.z; c.velocity[0] = r.velocity.x; c.velocity[1] = r.velocity.z;
      c.to[0] = r.support.x; c.to[1] = r.support.z; c.height = r.centre.y - r.support.y; c.rise = r.velocity.y;
      c.pitch = atan2(up.x * sin(h) + up.z * cos(h), up.y);
      for (let i = 0; i < c.from.length; i++) c.from[i] = own.muscles.angle(i);
    }
    if (c.time >= CLIMB.seconds) { c.on = false; c.done = true; motor.setPosture(kit.posture); return { ...goal, height: top }; }
    const u = c.time / CLIMB.seconds, k = u * u * u * (10 - 15 * u + 6 * u * u), T = CLIMB.seconds;
    own.muscles.channels.forEach((channel, i) => { climbPose[channel.name] = c.from[i]! + ((kit.posture[channel.name] ?? 0) - c.from[i]!) * k; });
    motor.setPosture(climbPose);
    const at = c.time;
    c.time += dt;
    return { feet: BOTH, heading: h, centre: [quintic(c.centre[0]!, c.velocity[0]!, c.to[0]!, T, at), quintic(c.centre[1]!, c.velocity[1]!, c.to[1]!, T, at)],
      height: quintic(c.height, c.rise, top, T, at), pose: { pitch: quintic(c.pitch, 0, 0, T, at), seconds: CLIMB.response } };
  };
  const begin = (step: RouteStep, reposition: boolean) => {
    state.current = { ...step, seconds: 0 }; runs[step.technique]!.begin(step.side);
    mode(reposition ? "reposition" : "execute");
  };
  const finish = (end: TechniqueEnd) => {
    const attempt = state.current!;
    log({ ...attempt, end });
    if (state.mode === "execute") {
      if (end === "done") state.route = state.route.slice(1);
      else {
        const failed = state.failures.find(f => f.technique === attempt.technique && f.side === attempt.side && f.from === attempt.from);
        if (failed) state.failures[state.failures.indexOf(failed)] = { ...failed, count: failed.count + 1 }; else state.failures.push({ technique: attempt.technique, side: attempt.side, from: attempt.from, count: 1 });
        state.route.length = 0;
      }
    }
    state.current = null; state.braceUsed = false; state.time = 0;
  };
  /** The first step of the attempt just begun. */
  const first = (g: GroundReading, senses: Senses, dt: number) => {
    const started = state.current!;
    carry(); const end = runs[started.technique]!.step(g, senses, dt); started.seconds += dt; remember();
    if (end) { finish(end); carry(); }
  };
  const handBack = (end: "ready" | "steady-limit") => {
    log({ technique: "steady", side: view.ground?.side ?? "left", from: view.ground?.position ?? "between",
      to: "standing", seconds: state.time, end });
    state.handBack = end; state.active = false; clear();
  };
  return { state,
    get name() { return `stand up: ${state.current ? `${state.current.technique}.${runs[state.current.technique]!.phase}` : state.mode}`; },
    wants: () => state.active || view.down,
    holds: () => state.active && state.current !== null && !runs[state.current.technique]!.yields,
    begin() { state.active = true; clear(); state.current = null; state.braceUsed = false; state.ready = 0; state.handBack = null;
      mode("brace"); motor.reset(); remember(); },
    end() { if (state.current) { runs[state.current.technique]!.end(); finish("interrupted"); }
      state.active = false; motor.reset(); },
    step(senses, dt) {
      const g = view.ground;
      if (!g) { drive(BRACE, .3, 2, .4); remember(); return; }
      if (state.current) {
        state.current.seconds += dt;
        carry();
        const end = runs[state.current.technique]!.step(g, senses, dt);
        remember();
        if (end) { finish(end); carry(); }
        return;
      }
      state.ready = standReady(view) ? state.ready + dt : 0;
      if (state.mode === "stuck") {
        drive(BRACE, .4, 1, .2); remember(); state.time += dt;
        if (state.time >= BACKOFF) { clear(); state.braceUsed = false; mode("brace"); }
        return;
      }
      // A body steadying on its feet is the stance's to catch: bracing it would fold the legs under it.
      const onFeet = g.position === "standing" || g.position === "crouch";
      if (tumbling(g) && !state.braceUsed && !(onFeet && state.mode === "steady")) {
        // A tumbling body is braced unless an edge whose entry reads motion admits it as it moves.
        const route = g.settled ? choose(order, g, moving, state.failures, state.route, work, RETRIES) : null;
        if (route) { state.route = route; begin(route[0]!, false); first(g, senses, dt); return; }
        if (state.mode !== "brace") mode("brace");
        drive(BRACE, .3, 2, .4); remember(); state.time += dt;
        if (state.time >= BRACE_LIMIT) state.braceUsed = true;
        return;
      }
      if (onFeet && !state.steadyTried.includes(g.position)) {
        if (state.mode !== "steady") {
          mode("steady"); state.climb.on = false; state.climb.done = false; motor.setPosture(kit.posture);
          motor.stance.read(); legs.resume({ ...view, stance: motor.stance.reading });
        }
        motor.stance.read();
        const goal = legs.goal({ ...view, stance: motor.stance.reading }, null, legs.heading, dt);
        motor.setStance(goal && climbing(goal, dt));
        motor.control(own.muscles, dt); remember(); state.time += dt;
        if (state.climb.on) return;
        if (state.ready >= .1) handBack("ready");
        else if (state.time >= STEADY_LIMIT) {
          if (g.position === "standing" && !view.down) handBack("steady-limit");
          else { state.steadyTried.push(g.position); mode("execute"); }
        }
        return;
      }
      // An edge that reads motion and admits the body is taken first. Short of one, no edge is chosen
      // on a body whose position has not been read yet, or, where one of them is listed, on a body
      // still landing with no support or one it is begun from but too fast for: the commands carry
      // on, once for no longer than a brace.
      const ready = g.settled && waits ? choose(order, g, moving, state.failures, state.route, work, RETRIES) : null;
      if (!ready && (!g.settled || waits && !state.braceUsed && (g.raw === "between" && g.velocity.lengthSquared() > LANDING * LANDING
        || awaits(order, g, moving, state.failures, RETRIES)))) {
        if (state.mode !== "land") mode("land");
        carry(); state.time += dt;
        if (state.time >= BRACE_LIMIT) state.braceUsed = true;
        return;
      }
      const route = ready ?? choose(order, g, graph, state.failures, state.route, work, RETRIES);
      if (route) { state.route = route; begin(route[0]!, false); }
      else {
        const candidates = ["flatten", g.lie === "front" ? "roll-back" : "roll"];
        for (const name of candidates) {
          const key = `${g.position}:${name}`, run = runs[name];
          if (!run || state.reposition.includes(key)) continue;
          state.reposition.push(key);
          const sides: readonly Side[] = name === "flatten" ? [g.side ?? "left"] : registry[name]!.sides;
          const side = sides.find(side => run.admits(g, side));
          if (side) { begin({ technique: name, side, from: g.position, to: name === "flatten" ? g.lie : name === "roll" ? "front" : "back" }, true); break; }
        }
      }
      if (state.current as Attempt | null) first(g, senses, dt);
      else { mode("stuck"); drive(BRACE, .4, 1, .2); remember(); }
    },
  };
}

/** A quintic from `x0` at speed `v0`, no acceleration, to `x1` at rest over `T` s: its place at `t`. */
function quintic(x0: number, v0: number, x1: number, T: number, t: number): number {
  const D = x1 - x0 - v0 * T, u = t / T;
  return x0 + v0 * t + u * u * u * ((10 * D + 4 * v0 * T) + u * ((-15 * D - 7 * v0 * T) + u * (6 * D + 3 * v0 * T)));
}
