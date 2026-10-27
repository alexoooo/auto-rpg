import type { Side } from "../../spec/body.ts";
import type { GroundReading, Position } from "./reading.ts";

/** The chooser needs only declared edges and the live run's admission predicate. */
export interface GraphTechnique {
  readonly sides: readonly Side[];
  readonly edges: readonly { readonly from: Position; readonly to: Position }[];
  /** Its entry reads the raw position (`GroundReading.raw`), not the settled one. */
  readonly raw: boolean;
  admits(reading: GroundReading, side: Side): boolean;
}
export interface GraphFailure { readonly technique: string; readonly side: Side; readonly from: Position; count: number }
export interface RouteStep { readonly technique: string; readonly side: Side; readonly from: Position; readonly to: Position }

/** Search scratch is per supervisor and carries no choice between calls. */
export function graphWork() { return { visited: [] as Position[], route: [] as RouteStep[] }; }
type Work = ReturnType<typeof graphWork>;
type Registry = Readonly<Record<string, GraphTechnique>>;

function failed(failures: readonly GraphFailure[], name: string, side: Side, from: Position, retries: number): boolean {
  return failures.some(failure => failure.technique === name && failure.side === side && failure.from === from && failure.count >= retries);
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

/** The first admitting edge in player order wins when its simple route reaches standing; it is begun from the position its entry reads (`GraphTechnique.raw`). */
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
