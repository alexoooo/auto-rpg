import type { TargetRef } from "../../skills/action.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import { awaits, choose, graphWork, toStanding, type GraphFailure, type GraphTechnique, type RouteStep } from "../ground/graph.ts";
import { GROUND_MODES, sideEffector, type GroundExecutor } from "../ground/held.ts";
import type { Position } from "../ground/reading.ts";
import { standReady, tumbling } from "../ground/reading.ts";
import { STAND_UP_PART } from "../ground/stand-up-part.ts";
import { BACKOFF, BRACE_LIMIT, LANDING, READY_HOLD, RETRIES, STEADY_LIMIT, type Mode } from "../ground/stand-up.ts";
import type { TechniqueConfig, TechniqueEnd, TechniquePart } from "../ground/technique.ts";
import { EDGE_PROFILES, measuredOn, profileFor, techniqueDigest } from "../profile.ts";
import { downTerms, type DownModel } from "./down.ts";
import { asking, blocked, READY, type GroundOption, type Situation } from "./option.ts";

/** What a rise is priced at where no route it takes is measured to standing: Stand up's own price (`SubMindPart.down`). */
const { name: _, ...BY_HAND } = STAND_UP_PART.down!;

/** A ground action's target: none; the body acts on itself. */
const HERE: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/** What the rise does this step: the action and the side it is begun on. */
interface Pick { readonly action: string; readonly side: Side }

/** An edge or a reposition under way, the instance that carries it out (null until it is asked). */
interface Attempt { readonly technique: string; readonly side: Side; readonly from: Position; readonly to: Position; id: number | null }

/** **The ground's options and what they read**: the options (`GroundOption`), the rise's price (`DownModel`), and the situation as the rise reads it (`read`). */
export interface Ground {
  readonly options: readonly GroundOption[];
  /** What a fall is priced at, getting up (`downCost`). */
  readonly down: DownModel;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
  /** `now`, the body down while its rise runs, though up on its feet: what its options and the others' are chosen by. */
  read(now: Situation): Situation;
}

/**
 * **The rise as a chain of options**: the edges of `techniques`, in their order, the repositions
 * and flatten, and the ground's modes (`GROUND_MODES`), each an option the chooser takes, carried
 * out by the ground executor (`groundExecutor`) as its action. One plan, read once a control step,
 * picks which is on offer, as Stand up's supervisor picks what it runs (`standUp`): a rise begins
 * when the body goes down and ends handed back from its steady; a technique begun runs to its end;
 * without a ground reading the body braces; a tumbling body takes an edge whose entry reads motion
 * (`TechniquePart.moving`) where one admits it, else braces, for no longer than `BRACE_LIMIT`; on
 * its feet, it steadies, handed back once standing ready (`READY_HOLD`), or after `STEADY_LIMIT`
 * on its feet standing up, else tries elsewhere; still landing, it carries its command on; else it
 * takes the route to standing (`choose`, priced by the edges' profiles, `EDGE_PROFILES`), else a
 * reposition, else it backs off for `BACKOFF`. An edge fails `RETRIES` times from a position before
 * it is given up there. None yields: one is let go only for the next the plan picks.
 *
 * Each is priced as a fall is (`downTerms`) by the rise's price (`down`): its expected seconds to
 * standing from the back, where its edges are measured to standing; else by hand, as Stand up is.
 * Its memory is the plan's.
 */
export function groundOptions(spec: BodySpec, hz: number, executor: GroundExecutor, techniques: readonly TechniqueConfig[],
  registry: Readonly<Record<string, TechniquePart>>): Ground {
  const order: readonly string[] = techniques.map((technique) => technique.kind), runs = executor.runs;
  const graph: Record<string, GraphTechnique> = {}, moving: Record<string, GraphTechnique> = {};
  let waits = false;
  for (const [name, part] of Object.entries(registry)) {
    const run = runs[name];
    if (!run) continue;
    waits ||= part.moving && order.includes(name);
    const found = profileFor(EDGE_PROFILES, measuredOn(spec, techniqueDigest(techniques.find((technique) => technique.kind === name) ?? { kind: name }), hz, null));
    const profile = found && found.stale === null ? found.profile.cells[0] ?? null : null;
    graph[name] = { sides: part.sides, edges: part.edges, raw: part.moving, profile, admits: (g, side) => run.admits(g, side) };
    moving[name] = { sides: part.sides, edges: part.edges, raw: part.moving, profile, admits: (g, side) => part.moving && run.admits(g, side) };
  }
  const work = graphWork(), dt = 1 / hz;
  const priced = toStanding(order, "back", graph, [], RETRIES, work);
  const down: DownModel = Number.isFinite(priced) ? { seconds: priced, stands: 1, shelter: 0 } : BY_HAND;
  const state = {
    active: false, mode: "brace" as Mode, time: 0, ready: 0, braceUsed: false, steadied: false,
    current: null as Attempt | null, route: [] as RouteStep[], failures: [] as GraphFailure[], reposition: [] as string[], steadyTried: [] as Position[],
    decided: -Infinity, pick: null as Pick | null,
  };
  const clear = (): void => { state.failures.length = 0; state.reposition.length = 0; state.steadyTried.length = 0; state.route.length = 0; };
  const mode = (next: Mode): void => { state.mode = next; state.time = 0; };
  const pick = (action: string, side: Side = "left"): Pick => ({ action, side });
  const begin = (step: RouteStep, reposition: boolean): Pick => {
    state.current = { ...step, id: null };
    mode(reposition ? "reposition" : "execute");
    return pick(step.technique, step.side);
  };
  const finish = (end: TechniqueEnd): void => {
    const attempt = state.current!;
    if (state.mode === "execute") {
      if (end === "done") state.route = state.route.slice(1);
      else {
        const failed = state.failures.find((f) => f.technique === attempt.technique && f.side === attempt.side && f.from === attempt.from);
        if (failed) failed.count++; else state.failures.push({ technique: attempt.technique, side: attempt.side, from: attempt.from, count: 1 });
        state.route.length = 0;
      }
    }
    state.current = null; state.braceUsed = false; state.time = 0;
  };
  const handBack = (): void => { state.active = false; clear(); };
  /** What the rise does at `now`, once a step: what Stand up's supervisor would run (`standUp`). */
  const planAt = (now: Situation): Pick | null => {
    const view = now.sight.view, g = view.ground;
    // The attempt under way ended, or was let go, last step.
    if (state.current && state.current.id !== null) {
      const live = now.sight.report.actions.find((action) => action.id === state.current!.id);
      if (!live) finish("interrupted");
      else if (live.stage.startsWith("ended:")) finish(live.stage.slice("ended:".length) as TechniqueEnd);
    }
    // The steady's last step: handed back standing ready, or after its limit standing up; else tried elsewhere.
    if (state.steadied) {
      state.steadied = false;
      if (!executor.steady.climb.on && g) {
        if (state.ready >= READY_HOLD) handBack();
        else if (state.time >= STEADY_LIMIT) {
          if (g.position === "standing" && !view.down) handBack();
          else { state.steadyTried.push(g.position); mode("execute"); }
        }
      }
    }
    if (!state.active) {
      if (!view.down) return null;
      state.active = true; clear(); state.current = null; state.braceUsed = false; state.ready = 0; mode("brace");
    }
    if (state.current) return pick(state.current.technique, state.current.side);
    if (!g) return pick("brace");
    state.ready = standReady(view) ? state.ready + dt : 0;
    if (state.mode === "stuck") {
      state.time += dt;
      if (state.time >= BACKOFF) { clear(); state.braceUsed = false; mode("brace"); }
      return pick("back off");
    }
    // A body steadying on its feet is the stance's to catch: bracing it would fold the legs under it.
    const onFeet = g.position === "standing" || g.position === "crouch";
    if (tumbling(g) && !state.braceUsed && !(onFeet && state.mode === "steady")) {
      // A tumbling body is braced unless an edge whose entry reads motion admits it as it moves.
      const route = g.settled ? choose(order, g, moving, state.failures, state.route, work, RETRIES) : null;
      if (route) { state.route = route; return begin(route[0]!, false); }
      if (state.mode !== "brace") mode("brace");
      state.time += dt;
      if (state.time >= BRACE_LIMIT) state.braceUsed = true;
      return pick("brace");
    }
    if (onFeet && !state.steadyTried.includes(g.position)) {
      if (state.mode !== "steady") mode("steady");
      state.time += dt; state.steadied = true;
      return pick("steady");
    }
    // An edge that reads motion and admits the body is taken first. Short of one, no edge is chosen
    // on a body whose position has not been read yet, or, where one of them is listed, on a body
    // still landing with no support or one it is begun from but too fast for: the command carries
    // on, once for no longer than a brace.
    const ready = g.settled && waits ? choose(order, g, moving, state.failures, state.route, work, RETRIES) : null;
    if (!ready && (!g.settled || waits && !state.braceUsed && (g.raw === "between" && g.velocity.lengthSquared() > LANDING * LANDING
      || awaits(order, g, moving, state.failures, RETRIES)))) {
      if (state.mode !== "land") mode("land");
      state.time += dt;
      if (state.time >= BRACE_LIMIT) state.braceUsed = true;
      return pick("land");
    }
    const route = ready ?? choose(order, g, graph, state.failures, state.route, work, RETRIES);
    if (route) { state.route = route; return begin(route[0]!, false); }
    for (const name of ["flatten", g.lie === "front" ? "roll-back" : "roll"]) {
      const key = `${g.position}:${name}`, run = runs[name];
      if (!run || state.reposition.includes(key)) continue;
      state.reposition.push(key);
      const sides: readonly Side[] = name === "flatten" ? [g.side ?? "left"] : registry[name]!.sides;
      const side = sides.find((one) => run.admits(g, one));
      if (side) return begin({ technique: name, side, from: g.position, to: name === "flatten" ? g.lie : name === "roll" ? "front" : "back" }, true);
    }
    mode("stuck");
    return pick("back off");
  };
  const plan = (now: Situation): Pick | null => {
    if (state.decided !== now.time) { state.decided = now.time; state.pick = planAt(now); }
    return state.pick;
  };
  const terms = downTerms(down);
  const option = (name: string): GroundOption => {
    const memory = { id: null as number | null };
    const UNPICKED = blocked(`the rise does not take ${name} now`);
    const live = (now: Situation) => memory.id === null ? undefined : now.sight.report.actions.find((action) => action.id === memory.id);
    return {
      name, posture: "ground", layer: "commitment", state: memory,
      entry: (now) => plan(now)?.action === name ? READY : UNPICKED,
      exit: () => null,
      yields: () => false,
      ended: (now) => live(now)?.stage.startsWith("ended:") ?? false,
      begin() { memory.id = null; },
      end() { memory.id = null; },
      models: { "hand-built": terms },
      step(now) {
        const picked = plan(now)!;
        if (memory.id === null) {
          memory.id = now.sight.instance();
          if (state.current?.technique === name && state.current.id === null) state.current.id = memory.id;
        }
        return { move: null, face: now.sight.report.heading, actions: [{ id: memory.id, action: name, effector: sideEffector(picked.side), target: HERE }] };
      },
      holds: asking,
    };
  };
  const options = [...order, ...Object.keys(runs).filter((name) => !order.includes(name)), ...GROUND_MODES].map(option);
  return {
    options, down, state: { plan: state, options: options.map((one) => one.state) },
    read(now) { plan(now); return state.active && !now.down ? { ...now, down: true } : now; },
  };
}
