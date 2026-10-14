import type { Side } from "../../spec/body.ts";
import type { GroundReading, Position } from "./reading.ts";

/** The chooser needs only declared edges and the live run's admission predicate. */
export interface GraphTechnique {
  readonly sides: readonly Side[];
  readonly edges: readonly { readonly from: Position; readonly to: Position }[];
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
    if (!technique || !technique.edges.some(edge => edge.from === from)) continue;
    const side = sideOf(technique, name, from, failures, retries, reading);
    if (side === null) continue;
    for (const edge of technique.edges) {
      if (edge.from !== from || work.visited.includes(edge.to)) continue;
      work.route.push({ technique: name, side, from, to: edge.to });
      if (search(order, edge.to, techniques, failures, retries, work)) return true;
      work.route.pop();
    }
  }
  work.visited.pop();
  return false;
}

/** The first admitting edge in player order wins when its simple route reaches standing. */
export function choose(order: readonly string[], reading: GroundReading, techniques: Registry, failures: readonly GraphFailure[],
  intention: readonly RouteStep[], work: Work, retries = 2): RouteStep[] | null {
  work.visited.length = 0; work.route.length = 0;
  if (reading.position === "standing") return null;
  let from: Position = reading.position;
  let retained = intention.length > 0;
  for (let index = 0; index < intention.length && retained; index++) {
    const step = intention[index]!, technique = techniques[step.technique];
    if (!technique || !order.includes(step.technique) || step.from !== from || work.visited.includes(from)
      || !technique.edges.some(edge => edge.from === from && edge.to === step.to)) { retained = false; break; }
    const side = sideOf(technique, step.technique, from, failures, retries, index === 0 ? reading : undefined);
    if (side === null || work.visited.includes(step.to)) { retained = false; break; }
    work.visited.push(from); work.route.push({ ...step, side }); from = step.to;
  }
  if (retained && from === "standing") return work.route.slice();
  work.visited.length = 0; work.route.length = 0;
  return search(order, reading.position, techniques, failures, retries, work, reading) ? work.route.slice() : null;
}

/** Configuration reachability uses declared edges, without assuming future admission readings. */
export function reachable(order: readonly string[], from: Position, techniques: Registry, work: Work): boolean {
  work.visited.length = 0; work.route.length = 0;
  return search(order, from, techniques, [], 2, work);
}
