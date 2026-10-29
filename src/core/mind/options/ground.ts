import type { TargetRef } from "../../skills/action.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import { awaits, firstEdges, graphWork, toStanding, type GraphFailure, type GraphTechnique } from "../ground/graph.ts";
import { GROUND_MODES, sideEffector, type GroundExecutor, type GroundMode } from "../ground/held.ts";
import type { GroundReading, Position } from "../ground/reading.ts";
import { standReady, tumbling } from "../ground/reading.ts";
import { STAND_UP_PART } from "../ground/stand-up-part.ts";
import { BACKOFF, BRACE_LIMIT, LANDING, READY_HOLD, RETRIES, STEADY_LIMIT, type Mode } from "../ground/stand-up.ts";
import type { TechniqueConfig, TechniqueEnd, TechniquePart } from "../ground/technique.ts";
import { edgeExpected } from "../profile.ts";
import { downTerms, type DownModel } from "./down.ts";
import { brace } from "./rest.ts";
import { asking, blocked, READY, WHOLE, type GroundOption, type Situation } from "./option.ts";

/** What a rise is priced at where no route it takes is measured to standing: Stand up's own price (`SubMindPart.down`). */
const { name: _, ...BY_HAND } = STAND_UP_PART.down!;

/** A ground action's target: none; the body acts on itself. */
const HERE: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/** What the rise offers an option this step: the side it is begun on, where it goes, its expected seconds to standing (NaN, unpriced) and whether it repositions the body. */
interface Offered { readonly side: Side; readonly from: Position; readonly to: Position; readonly seconds: number; readonly reposition: boolean }

/** An edge or a reposition under way, the instance that carries it out (null until it is asked). */
interface Attempt { readonly technique: string; readonly side: Side; readonly from: Position; readonly to: Position; id: number | null }

/** **The ground's options and what they read**: the options (`GroundOption`), the rise's price (`DownModel`), and the situation as the rise reads it (`read`). */
export interface Ground {
  readonly options: readonly GroundOption[];
  /** The rest option down (`brace`): the ground's brace, priced as the rise that never stands. */
  readonly rest: GroundOption;
  /** What a fall is priced at, getting up (`downCost`). */
  readonly down: DownModel;
  /** How the rise is priced, a sentence: each edge of its route measured, or not and why (`edgeExpected`). */
  readonly priced: string;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
  /** `now`, the body down while its rise runs, though up on its feet: what its options and the others' are chosen by. */
  read(now: Situation): Situation;
}

/**
 * **The rise as options**: the edges of `techniques`, in their order (their rank), the repositions
 * and flatten, and the ground's modes (`GROUND_MODES`), each an option the policy takes, carried
 * out by the ground executor (`groundExecutor`) as its action. Each is on offer where the body as
 * it lies admits it (`offered`, read once a control step, as Stand up's supervisor reads it,
 * `standUp`): a rise begins when the body goes down and ends handed back from its steady; a
 * technique begun runs to its end; without a ground reading, brace; tumbling, every edge whose
 * entry reads motion (`TechniquePart.moving`) that admits it, else brace, for no longer than
 * `BRACE_LIMIT`; on its feet, steady, handed back once standing ready (`READY_HOLD`), or after
 * `STEADY_LIMIT` on its feet standing up, else tried elsewhere; still landing, land; else every
 * edge that admits it on a route to standing (`firstEdges`), else a reposition, else back off for
 * `BACKOFF`. An edge fails `RETRIES` times from a position before it is given up there. Each mode
 * counts its time against its limit as it runs (`modeStep`). A mode yields; a technique where its
 * run says it may (`TechniqueRun.yields`: before its point of no return, or ended).
 *
 * Each is priced as a fall is (`downTerms`): an edge at its expected seconds to standing through it
 * (`firstEdges`, by the edges' profiles, `EDGE_PROFILES`), so the policy takes the cheapest; the
 * rest by the rise's price (`down`): its expected seconds to standing from the back, where its edges
 * are measured to standing, else by hand, as Stand up is, so that unmeasured, as on toes, they go by
 * rank. The rest option down, brace (`Ground.rest`), is the ground's brace priced as the cheapest
 * offer that never stands. Its memory is the rise's: whether it runs, its mode and time in it, the
 * attempt under way, the failures, the repositions and steadies tried.
 */
export function groundOptions(spec: BodySpec, hz: number, executor: GroundExecutor, techniques: readonly TechniqueConfig[],
  registry: Readonly<Record<string, TechniquePart>>): Ground {
  const order: readonly string[] = techniques.map((technique) => technique.kind), runs = executor.runs;
  const graph: Record<string, GraphTechnique> = {}, moving: Record<string, GraphTechnique> = {};
  let waits = false;
  const unpriced: string[] = [];
  for (const [name, part] of Object.entries(registry)) {
    const run = runs[name];
    if (!run) continue;
    waits ||= part.moving && order.includes(name);
    const { expected: profile, priced: why } = edgeExpected(spec, techniques.find((technique) => technique.kind === name) ?? { kind: name }, hz);
    if (!profile && order.includes(name)) unpriced.push(`${name}: ${why}`);
    graph[name] = { sides: part.sides, edges: part.edges, raw: part.moving, profile, admits: (g, side) => run.admits(g, side) };
    moving[name] = { sides: part.sides, edges: part.edges, raw: part.moving, profile, admits: (g, side) => part.moving && run.admits(g, side) };
  }
  const work = graphWork(), dt = 1 / hz;
  const priced = toStanding(order, "back", graph, [], RETRIES, work);
  const down: DownModel = Number.isFinite(priced) ? { seconds: priced, stands: 1, shelter: 0 } : BY_HAND;
  const why = unpriced.length ? `; unmeasured ${unpriced.join("; ")}` : "";
  const pricedBy = Number.isFinite(priced) ? `measured from the back${why}` : `by hand, no route measured to standing${why}`;
  const state = {
    active: false, mode: "brace" as Mode, time: 0, ready: 0, braceUsed: false, steadied: false,
    current: null as Attempt | null, failures: [] as GraphFailure[], reposition: [] as string[], steadyTried: [] as Position[],
  };
  // What is on offer this step, by option name.
  const lie = { read: -Infinity, offers: new Map<string, Offered>() };
  const clear = (): void => { state.failures.length = 0; state.reposition.length = 0; state.steadyTried.length = 0; };
  const mode = (next: Mode): void => { state.mode = next; state.time = 0; };
  const finish = (end: TechniqueEnd): void => {
    const attempt = state.current!;
    if (state.mode === "execute" && end !== "done") {
      const failed = state.failures.find((f) => f.technique === attempt.technique && f.side === attempt.side && f.from === attempt.from);
      if (failed) failed.count++; else state.failures.push({ technique: attempt.technique, side: attempt.side, from: attempt.from, count: 1 });
    }
    state.current = null; state.braceUsed = false; state.time = 0;
  };
  const handBack = (): void => { state.active = false; clear(); };
  const offerMode = (name: GroundMode, g: GroundReading | null): void => {
    const at = g?.position ?? "between";
    lie.offers.set(name, { side: "left", from: at, to: at, seconds: NaN, reposition: false });
  };
  const offerEdges = (techniques: Readonly<Record<string, GraphTechnique>>, g: GroundReading): void => {
    for (const edge of firstEdges(order, g, techniques, state.failures, RETRIES, work)) lie.offers.set(edge.technique, { ...edge, reposition: false });
  };
  /**
   * What the rise offers at `now`, once a step. First what happened since the last: the attempt
   * under way ended or was let go; the steady's last step handed the body back standing ready, or
   * after its limit standing up, or left that position tried; the body went down. Then, while the
   * rise runs: the attempt under way alone; without a ground reading, brace; backing off, back off;
   * tumbling, the edges whose entry reads motion that admit it, else brace; on its feet, steady;
   * the edges whose entry reads motion that admit it; still landing, land; the edges that admit it;
   * a reposition; else back off.
   */
  const offered = (now: Situation): ReadonlyMap<string, Offered> => {
    if (lie.read === now.time) return lie.offers;
    lie.read = now.time; lie.offers.clear();
    const view = now.sight.view, g = view.ground;
    if (state.current && state.current.id !== null) {
      const live = now.sight.report.actions.find((action) => action.id === state.current!.id);
      if (!live) finish("interrupted");
      else if (live.stage.startsWith("ended:")) finish(live.stage.slice("ended:".length) as TechniqueEnd);
    }
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
      if (!view.down) return lie.offers;
      state.active = true; clear(); state.current = null; state.braceUsed = false; state.ready = 0; mode("brace");
    }
    if (state.current) { lie.offers.set(state.current.technique, { ...state.current, seconds: NaN, reposition: state.mode === "reposition" }); return lie.offers; }
    if (!g) { offerMode("brace", g); return lie.offers; }
    state.ready = standReady(view) ? state.ready + dt : 0;
    if (state.mode === "stuck") { offerMode("back off", g); return lie.offers; }
    // A body steadying on its feet is the stance's to catch: bracing it would fold the legs under it.
    const onFeet = g.position === "standing" || g.position === "crouch";
    if (tumbling(g) && !state.braceUsed && !(onFeet && state.mode === "steady")) {
      if (g.settled) offerEdges(moving, g);
      if (lie.offers.size === 0) offerMode("brace", g);
      return lie.offers;
    }
    if (onFeet && !state.steadyTried.includes(g.position)) { offerMode("steady", g); return lie.offers; }
    // An edge that reads motion and admits the body is taken first. Short of one, no edge is offered
    // on a body whose position has not been read yet, or, where one of them is listed, on a body
    // still landing with no support or one it is begun from but too fast for: the command carries
    // on, once for no longer than a brace.
    if (g.settled && waits) offerEdges(moving, g);
    if (lie.offers.size) return lie.offers;
    if (!g.settled || waits && !state.braceUsed && (g.raw === "between" && g.velocity.lengthSquared() > LANDING * LANDING
      || awaits(order, g, moving, state.failures, RETRIES))) { offerMode("land", g); return lie.offers; }
    offerEdges(graph, g);
    if (lie.offers.size) return lie.offers;
    // A reposition is tried once from a position, and given up there where it does not admit the body.
    for (const name of ["flatten", g.lie === "front" ? "roll-back" : "roll"]) {
      const key = `${g.position}:${name}`, run = runs[name];
      if (!run || state.reposition.includes(key)) continue;
      const sides: readonly Side[] = name === "flatten" ? [g.side ?? "left"] : registry[name]!.sides;
      const side = sides.find((one) => run.admits(g, one));
      if (!side) { state.reposition.push(key); continue; }
      lie.offers.set(name, { side, from: g.position, to: name === "flatten" ? g.lie : name === "roll" ? "front" : "back", seconds: NaN, reposition: true });
      return lie.offers;
    }
    offerMode("back off", g);
    return lie.offers;
  };
  const byHand = downTerms(down);
  /** What an offer is worth: a fall's terms at its expected seconds to standing where priced, else at the rise's price. */
  const termsOf = (offer: Offered | undefined) => offer && Number.isFinite(offer.seconds) ? downTerms({ seconds: offer.seconds, stands: 1, shelter: 0 }) : byHand;
  /** What a mode does as it runs a step: its time counted against its limit. */
  const modeStep = (name: GroundMode, now: Situation): void => {
    switch (name) {
      case "brace":
        if (!now.sight.view.ground) return;
        if (state.mode !== "brace") mode("brace");
        state.time += dt;
        if (state.time >= BRACE_LIMIT) state.braceUsed = true;
        return;
      case "land":
        if (state.mode !== "land") mode("land");
        state.time += dt;
        if (state.time >= BRACE_LIMIT) state.braceUsed = true;
        return;
      case "steady":
        if (state.mode !== "steady") mode("steady");
        state.time += dt; state.steadied = true;
        return;
      case "back off":
        if (state.mode !== "stuck") { mode("stuck"); return; }
        state.time += dt;
        if (state.time >= BACKOFF) { clear(); state.braceUsed = false; mode("brace"); }
        return;
      default: { const never: never = name; throw new Error(`unknown ground mode ${never}`); }
    }
  };
  const isMode = (name: string): name is GroundMode => (GROUND_MODES as readonly string[]).includes(name);
  const option = (name: string): GroundOption => {
    const memory = { id: null as number | null };
    const UNOFFERED = blocked(`the rise does not offer ${name} now`);
    const live = (now: Situation) => memory.id === null ? undefined : now.sight.report.actions.find((action) => action.id === memory.id);
    return {
      name, posture: "ground", claims: WHOLE, state: memory,
      entry: (now) => offered(now).has(name) ? READY : UNOFFERED,
      exit: () => null,
      yields: () => isMode(name) || state.current?.technique === name && runs[name]!.yields,
      ended: (now) => live(now)?.stage.startsWith("ended:") ?? false,
      begin(now) {
        memory.id = null;
        if (isMode(name) || state.current?.technique === name) return;
        const offer = offered(now).get(name)!;
        if (offer.reposition) state.reposition.push(`${offer.from}:${name}`);
        state.current = { technique: name, side: offer.side, from: offer.from, to: offer.to, id: null };
        mode(offer.reposition ? "reposition" : "execute");
      },
      end() { memory.id = null; },
      model: (now) => termsOf(offered(now).get(name))(now),
      step(now) {
        const picked = offered(now).get(name)!;
        if (isMode(name)) modeStep(name, now);
        if (memory.id === null) {
          memory.id = now.sight.instance();
          if (state.current?.technique === name && state.current.id === null) state.current.id = memory.id;
        }
        return { move: null, face: now.sight.report.heading, actions: [{ id: memory.id, action: name, effector: sideEffector(picked.side), target: HERE }] };
      },
      holds: asking,
    };
  };
  /** The rise at its cheapest offer now: a fall's price at the least expected seconds to standing on offer, else the rise's. */
  const cheapest = (now: Situation): DownModel => {
    let seconds = Infinity;
    for (const offer of offered(now).values()) if (offer.seconds < seconds) seconds = offer.seconds;
    return Number.isFinite(seconds) ? { seconds, stands: 1, shelter: 0 } : down;
  };
  const options = [...order, ...Object.keys(runs).filter((name) => !order.includes(name)), ...GROUND_MODES].map(option);
  return {
    options, rest: brace(cheapest, { action: "brace", effector: sideEffector("left") }), down, priced: pricedBy, state: { plan: state, options: options.map((one) => one.state) },
    read(now) { offered(now); return state.active && !now.down ? { ...now, down: true } : now; },
  };
}
