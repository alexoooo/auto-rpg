import type { BodyView } from "../../body.ts";
import type { MindKit } from "../../mind/kit.ts";
import type { Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { Clock } from "../../clock.ts";
import type { OwnBody } from "../../mind/mind.ts";
import type { SubMind } from "../../mind/sub-mind.ts";
import { flatten } from "./flatten.ts";
import { awaits, choose, graphWork, type GraphFailure, type GraphTechnique, type RouteStep } from "./graph.ts";
import { edgeExpected } from "../../skills/framework/profile.ts";
import { brace, steadying } from "./steady.ts";
import { standReady, tumbling, type GroundReading, type Position } from "./reading.ts";
import type { Senses } from "../../mind/senses.ts";
import { poseDrive, type TechniqueConfig, type TechniqueEnd, type TechniquePart, type TechniqueRun } from "./technique.ts";
import type { PartLookup } from "../../parts/lookup.ts";

/** Bounded settling, retry and log limits prevent unobserved waits and unlimited history: a rise's, s, and its tries of an edge from a position. */
const BRACE_LIMIT = 1, BACKOFF = 2, RETRIES = 2;
export const STEADY_LIMIT = 2;
const LOG_SIZE = 32;
/** What a rise is doing: an edge of its route or a reposition, or one of its modes. */
type Mode = "execute" | "brace" | "land" | "steady" | "reposition" | "stuck";
/** A body read with no support (`between`) is still landing while faster than this, m/s. */
const LANDING = .1;
/** A body standing ready this long (`standReady`) is handed back from the steady, s. */
const READY_HOLD = .1;
interface Attempt { technique: string; side: Side; from: Position; to: Position; seconds: number }
interface Entry extends Attempt { end: TechniqueEnd | "ready" | "steady-limit" }

/** Preferred contracts for recovering the feet, in player order. */
export interface StandUpConfig { readonly kind: "stand-up"; readonly techniques: readonly TechniqueConfig[] }

/**
 * **The game's Stand up**: the edges a body rises by on its toes
 * (`docs/reference/rising.md#the-sit-back`): the roll onto its front, then down onto hands and
 * knees and the sit-back, or the sit-back from the front, the route each body takes priced by its
 * edges' profiles.
 */
export const STAND_UP: StandUpConfig = deepFreeze({ kind: "stand-up", techniques: [{ kind: "staged-roll" }, { kind: "staged-down" }, { kind: "sit-back" }, { kind: "front-sit-back" }] });

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
  // `hz`: the world's rate, which an edge's profile names (`Measured`).
  const hz = Math.round(1 / clock.dt);
  for (const [name, spec] of Object.entries(registry)) if (spec.fits(own.spec, spec.defaults, kit.parts) === null) {
    const run = spec.make(own, view, clock, kit); runs[name] = run;
    waits ||= spec.moving && order.includes(name);
    const profile = edgeExpected(own.spec, config.techniques.find((technique) => technique.kind === name) ?? { kind: name }, hz).expected;
    graph[name] = { sides: spec.sides, edges: spec.edges, raw: spec.moving, profile, admits: (g, side) => run.admits(g, side) };
    moving[name] = { sides: spec.sides, edges: spec.edges, raw: spec.moving, profile, admits: (g, side) => spec.moving && run.admits(g, side) };
  }
  runs.flatten = flatten(own, view);
  const drive = poseDrive(own.muscles), work = graphWork(), steady = steadying(own, view, kit);
  const state = { active: false, mode: "brace" as Mode, time: 0, ready: 0, braceUsed: false,
    current: null as Attempt | null, route: [] as RouteStep[], failures: [] as GraphFailure[],
    reposition: [] as string[], steadyTried: [] as Position[], log: [] as Entry[], omitted: 0,
    handBack: null as "ready" | "steady-limit" | null,
    techniques: Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, run.state])),
    steady: steady.state,
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
      mode("brace"); steady.reset(); remember(); },
    end() { if (state.current) { runs[state.current.technique]!.end(); finish("interrupted"); }
      state.active = false; steady.reset(); },
    step(senses, dt) {
      const g = view.ground;
      if (!g) { brace(drive, "falling"); remember(); return; }
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
        brace(drive, "backing off"); remember(); state.time += dt;
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
        brace(drive, "falling"); remember(); state.time += dt;
        if (state.time >= BRACE_LIMIT) state.braceUsed = true;
        return;
      }
      if (onFeet && !state.steadyTried.includes(g.position)) {
        if (state.mode !== "steady") { mode("steady"); steady.begin(); }
        const climbing = steady.step(dt); remember(); state.time += dt;
        if (climbing) return;
        if (state.ready >= READY_HOLD) handBack("ready");
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
      else { mode("stuck"); brace(drive, "backing off"); remember(); }
    },
  };
}
