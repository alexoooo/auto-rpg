import type { Side } from "../../spec/body.ts";
import type { Expected } from "../profile.ts";
import type { GroundReading, Position } from "./reading.ts";

/** The chooser needs only declared edges and the live run's admission predicate. */
export interface GraphTechnique {
  readonly sides: readonly Side[];
  readonly edges: readonly { readonly from: Position; readonly to: Position }[];
  /** Its entry reads the raw position (`GroundReading.raw`), not the settled one. */
  readonly raw: boolean;
  /** What its drill found of it on this body (`edgeExpected`); null for none, or one measured on another body, which prices no route. */
  readonly profile: Expected | null;
  admits(reading: GroundReading, side: Side): boolean;
}
export interface GraphFailure { readonly technique: string; readonly side: Side; readonly from: Position; count: number }
export interface RouteStep { readonly technique: string; readonly side: Side; readonly from: Position; readonly to: Position }

/** Every position, in the order `graphWork`'s `time` keeps them. */
const POSITIONS: readonly Position[] = Object.freeze(["standing", "crouch", "half-kneel", "kneeling", "fours", "sitting", "front", "back", "left", "right", "between"]);
const index = (at: Position): number => POSITIONS.indexOf(at);

/**
 * Search scratch is per supervisor and carries no choice between calls: `time` holds each position's
 * expected seconds to standing while a route is priced (`price`).
 */
export function graphWork() { return { visited: [] as Position[], route: [] as RouteStep[], time: new Float64Array(POSITIONS.length) }; }
type Work = ReturnType<typeof graphWork>;
type Registry = Readonly<Record<string, GraphTechnique>>;

function failed(failures: readonly GraphFailure[], name: string, side: Side, from: Position, retries: number): boolean {
  return failures.some(failure => failure.technique === name && failure.side === side && failure.from === from && failure.count >= retries);
}

/** Whether `name` may still be begun from `from` on a side whose failures there are short of `retries`. */
function usable(technique: GraphTechnique, name: string, from: Position, failures: readonly GraphFailure[], retries: number): boolean {
  return technique.sides.some(side => !failed(failures, name, side, from, retries));
}

/**
 * **An edge's expected seconds to standing**, `time` each position's: a trial's seconds, then the
 * route on from its posture in the share it is done, and from where its failures come to rest in
 * theirs; a failure that rests where it began, or where no route is priced, is tried again.
 * Infinity for an edge never done.
 */
function cost(profile: Expected, from: Position, to: Position, time: Float64Array): number {
  let sum = profile.seconds + (profile.done > 0 ? profile.done * time[index(to)]! : 0), again = 0;
  for (const fail of profile.ends) {
    const at = POSITIONS.indexOf(fail.at as Position);
    if (at < 0 || fail.at === from || !Number.isFinite(time[at]!)) again += fail.share; else sum += fail.share * time[at]!;
  }
  return again >= 1 - 1e-9 ? Infinity : sum / (1 - again);
}

/**
 * **Each position's expected seconds to standing** (`docs/reference/rising.md#routes-priced`), into
 * `time`: the least of the costs (`cost`) of the edges from it that have a profile and a side short
 * of their failures, found again until none falls; Infinity where no priced route goes.
 */
function price(order: readonly string[], techniques: Registry, failures: readonly GraphFailure[], retries: number, time: Float64Array): void {
  time.fill(Infinity); time[index("standing")] = 0;
  for (let round = 0; round < 2 * POSITIONS.length; round++) {
    let fell = false;
    for (const name of order) {
      const technique = techniques[name];
      if (!technique?.profile) continue;
      for (const edge of technique.edges) {
        if (!usable(technique, name, edge.from, failures, retries)) continue;
        const k = index(edge.from), seconds = cost(technique.profile, edge.from, edge.to, time);
        if (seconds < time[k]! - 1e-9) { time[k] = seconds; fell = true; }
      }
    }
    if (!fell) break;
  }
}

/**
 * **The expected seconds to standing from `from`** (`price`), Infinity where no priced route goes:
 * what a rise from there is priced at.
 */
export function toStanding(order: readonly string[], from: Position, techniques: Registry, failures: readonly GraphFailure[], retries: number, work: Work): number {
  price(order, techniques, failures, retries, work.time);
  return work.time[index(from)]!;
}

/**
 * **The priced route**, into `work.route`: the edge that admits the body as it is read with the
 * least expected seconds to standing (`price`), the first in `order` of equals, then the cheapest
 * edge on from each posture it reaches; false, the route left empty, where no priced edge admits it
 * or the route on is not priced to standing.
 */
function cheapest(order: readonly string[], reading: GroundReading, techniques: Registry, failures: readonly GraphFailure[], retries: number, work: Work): boolean {
  price(order, techniques, failures, retries, work.time);
  let from: Position | null = null;
  for (let step = 0; step <= POSITIONS.length && from !== "standing"; step++) {
    let best = Infinity, pick: RouteStep | null = null;
    for (const name of order) {
      const technique = techniques[name];
      if (!technique?.profile) continue;
      const at: Position = from ?? (technique.raw ? reading.raw : reading.position);
      if (!technique.edges.some(edge => edge.from === at)) continue;
      const side = sideOf(technique, name, at, failures, retries, from === null ? reading : undefined);
      if (side === null) continue;
      for (const edge of technique.edges) {
        if (edge.from !== at) continue;
        const seconds = cost(technique.profile, at, edge.to, work.time);
        if (seconds < best) { best = seconds; pick = { technique: name, side, from: at, to: edge.to }; }
      }
    }
    if (pick === null) { work.route.length = 0; return false; }
    work.route.push(pick); from = pick.to;
  }
  if (from === "standing") return true;
  work.route.length = 0;
  return false;
}

function sideOf(technique: GraphTechnique, name: string, from: Position, failures: readonly GraphFailure[], retries: number,
  reading?: GroundReading): Side | null {
  for (let index = 0; index < 3; index++) {
    const side = index === 0 ? reading?.side : index === 1 ? "left" : "right";
    if (!side || index > 0 && side === reading?.side || !technique.sides.includes(side)) continue;
    if (!failed(failures, name, side, from, retries) && (!reading || technique.admits(reading, side))) return side;
  }
  return null;
}

function search(order: readonly string[], from: Position, techniques: Registry, failures: readonly GraphFailure[],
  retries: number, work: Work, reading?: GroundReading): boolean {
  if (from === "standing") return true;
  if (work.visited.includes(from)) return false;
  work.visited.push(from);
  for (const name of order) {
    const technique = techniques[name];
    if (!technique) continue;
    // The first edge is begun from where its entry reads the body: raw or settled.
    const at: Position = reading && technique.raw ? reading.raw : from;
    if (!technique.edges.some(edge => edge.from === at) || at !== from && work.visited.includes(at)) continue;
    const side = sideOf(technique, name, at, failures, retries, reading);
    if (side === null) continue;
    if (at !== from) work.visited.push(at);
    for (const edge of technique.edges) {
      if (edge.from !== at || work.visited.includes(edge.to)) continue;
      work.route.push({ technique: name, side, from: at, to: edge.to });
      if (search(order, edge.to, techniques, failures, retries, work)) return true;
      work.route.pop();
    }
    if (at !== from) work.visited.pop();
  }
  work.visited.pop();
  return false;
}

/**
 * The route the body is on, while it still holds; else the priced route (`cheapest`), where a
 * profiled edge admits the body; else the first admitting edge in player order whose simple route
 * reaches standing. Each is begun from the position its entry reads (`GraphTechnique.raw`).
 */
export function choose(order: readonly string[], reading: GroundReading, techniques: Registry, failures: readonly GraphFailure[],
  intention: readonly RouteStep[], work: Work, retries = 2): RouteStep[] | null {
  work.visited.length = 0; work.route.length = 0;
  if (reading.position === "standing") return null;
  let from: Position = reading.position;
  let retained = intention.length > 0;
  for (let index = 0; index < intention.length && retained; index++) {
    const step = intention[index]!, technique = techniques[step.technique];
    const here = index === 0 && technique?.raw ? reading.raw : from;
    if (!technique || !order.includes(step.technique) || step.from !== here || work.visited.includes(here)
      || !technique.edges.some(edge => edge.from === here && edge.to === step.to)) { retained = false; break; }
    const side = sideOf(technique, step.technique, here, failures, retries, index === 0 ? reading : undefined);
    if (side === null || work.visited.includes(step.to)) { retained = false; break; }
    work.visited.push(here); work.route.push({ ...step, side }); from = step.to;
  }
  if (retained && from === "standing") return work.route.slice();
  work.visited.length = 0; work.route.length = 0;
  if (cheapest(order, reading, techniques, failures, retries, work)) return work.route.slice();
  return search(order, reading.position, techniques, failures, retries, work, reading) ? work.route.slice() : null;
}

/**
 * Whether an edge whose entry reads the raw position (`GraphTechnique.raw`) is begun from where the
 * body is read, on a side whose failures there are short of `retries`, whatever its entry says of
 * the body's motion.
 */
export function awaits(order: readonly string[], reading: GroundReading, techniques: Registry, failures: readonly GraphFailure[], retries: number): boolean {
  return order.some(name => {
    const technique = techniques[name];
    return technique !== undefined && technique.raw && technique.edges.some(edge => edge.from === reading.raw)
      && technique.sides.some(side => !failed(failures, name, side, reading.raw, retries));
  });
}

/** Configuration reachability uses declared edges, without assuming future admission readings. */
export function reachable(order: readonly string[], from: Position, techniques: Registry, work: Work): boolean {
  work.visited.length = 0; work.route.length = 0;
  return search(order, from, techniques, [], 2, work);
}
