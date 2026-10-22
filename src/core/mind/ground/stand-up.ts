import { SERVO_SECONDS, type BodyView } from "../../body.ts";
import type { MindKit } from "../kit.ts";
import { locomotion } from "../../skills/locomotion.ts";
import type { Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { Clock } from "../../clock.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { flatten } from "./flatten.ts";
import { choose, graphWork, type GraphFailure, type GraphTechnique, type RouteStep } from "./graph.ts";
import { standReady, type Position } from "./reading.ts";
import { poseDrive, type TechniqueConfig, type TechniqueEnd, type TechniquePart, type TechniqueRun } from "./technique.ts";
import type { PartLookup } from "../lookup.ts";

/** Protective flexion keeps the chin tucked and the forearms before the face while falling. */
const BRACE = deepFreeze({ "cervical flexion": .3, "shoulder.left flexion": .8, "shoulder.right flexion": .8,
  "elbow.left flexion": 1.7, "elbow.right flexion": 1.7, "hip.left flexion": .8, "hip.right flexion": .8,
  "knee.left flexion": 1.2, "knee.right flexion": 1.2 });
/** Bounded settling, retry and log limits prevent unobserved waits and unlimited history. */
const BRACE_LIMIT = 1, STEADY_LIMIT = 2, BACKOFF = 2, RETRIES = 2, LOG_SIZE = 32;
type Mode = "execute" | "brace" | "steady" | "reposition" | "stuck";
interface Attempt { technique: string; side: Side; from: Position; to: Position; seconds: number }
interface Entry extends Attempt { end: TechniqueEnd | "ready" | "steady-limit" }

/** Preferred contracts for recovering the feet, in player order. */
export interface StandUpConfig { readonly kind: "stand-up"; readonly techniques: readonly TechniqueConfig[] }

/** The techniques a stand-up repositions the body by where no route stands it up: onto its back from its front, else onto its front. */
const REPOSITION = deepFreeze([{ kind: "roll" }, { kind: "roll-back" }]);

/** The techniques `config` routes through and those it repositions by, by kind, as `parts` finds them. */
export const techniquesOf = (parts: PartLookup, config: StandUpConfig): Readonly<Record<string, TechniquePart>> =>
  Object.fromEntries([...config.techniques, ...REPOSITION].map((technique) => [technique.kind, parts.of("technique", technique)]));

/** A supervisor retries contracts from the body as read; no successful reposition clears a failure. */
export function standUp(own: OwnBody, view: BodyView, clock: Clock, config: StandUpConfig, kit: MindKit,
  registry: Readonly<Record<string, TechniquePart>> = techniquesOf(kit.parts, config)): SubMind {
  const runs: Record<string, TechniqueRun> = {}, graph: Record<string, GraphTechnique> = {}, order: readonly string[] = config.techniques.map((technique) => technique.kind);
  for (const [name, spec] of Object.entries(registry)) if (spec.fits(own.spec, spec.defaults, kit.parts) === null) {
    const run = spec.make(own, view, clock, order.includes(name), kit); runs[name] = run;
    graph[name] = { sides: spec.sides, edges: spec.edges, admits: (g, side) => run.admits(g, side) };
  }
  runs.flatten = flatten(own, view);
  const drive = poseDrive(own.muscles), work = graphWork(), legs = locomotion(null);
  const motor = kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist);
  const state = { active: false, mode: "brace" as Mode, time: 0, ready: 0, braceUsed: false,
    current: null as Attempt | null, route: [] as RouteStep[], failures: [] as GraphFailure[],
    reposition: [] as string[], steadyTried: [] as Position[], log: [] as Entry[], omitted: 0,
    handBack: null as "ready" | "steady-limit" | null,
    techniques: Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, run.state])),
    motor: motor.state, legs: legs.state,
    command: { activation: new Float64Array(own.muscles.channels.length), velocity: new Float64Array(own.muscles.channels.length) } };
  const clear = () => { state.failures.length = 0; state.reposition.length = 0; state.steadyTried.length = 0; state.route.length = 0; };
  const log = (entry: Entry) => { if (state.log.length >= LOG_SIZE) { state.log.shift(); state.omitted++; } state.log.push(entry); };
  const mode = (next: Mode) => { state.mode = next; state.time = 0; };
  const remember = () => { state.command.activation.set(own.muscles.activation); state.command.velocity.set(own.muscles.velocity); };
  const carry = () => { own.muscles.activation.set(state.command.activation); own.muscles.velocity.set(state.command.velocity); };
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
      const tumbling = g.velocity.lengthSquared() > .25 || g.spin > 1;
      if (tumbling && !state.braceUsed) {
        if (state.mode !== "brace") mode("brace");
        drive(BRACE, .3, 2, .4); remember(); state.time += dt;
        if (state.time >= BRACE_LIMIT) state.braceUsed = true;
        return;
      }
      if ((g.position === "standing" || g.position === "crouch") && !state.steadyTried.includes(g.position)) {
        if (state.mode !== "steady") {
          mode("steady"); motor.stance.read(); legs.resume({ ...view, stance: motor.stance.reading });
        }
        motor.stance.read();
        motor.setStance(legs.goal({ ...view, stance: motor.stance.reading }, null, legs.heading, dt));
        motor.control(own.muscles, dt); remember(); state.time += dt;
        if (state.ready >= .1) handBack("ready");
        else if (state.time >= STEADY_LIMIT) {
          if (g.position === "standing" && !view.down) handBack("steady-limit");
          else { state.steadyTried.push(g.position); mode("execute"); }
        }
        return;
      }
      const route = choose(order, g, graph, state.failures, state.route, work, RETRIES);
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
      const started = state.current as Attempt | null;
      if (started) {
        carry(); const end = runs[started.technique]!.step(g, senses, dt); started.seconds += dt; remember();
        if (end) { finish(end); carry(); }
      } else { mode("stuck"); drive(BRACE, .4, 1, .2); remember(); }
    },
  };
}
