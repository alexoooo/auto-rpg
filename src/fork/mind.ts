/**
 * A mind on its own, snapshotted and restored: what a planner uses to ask "what would this mind do
 * from here" without a world around it (skill ceiling session 02).
 *
 * The same walk as the world's (`graph.ts`), rooted at the mind alone and with no world identities,
 * so it captures everything the mind keeps -- its cadence clocks, its reading of the other body, the
 * command it hands back -- and the position of every random stream it draws from, since each
 * `mulberry32` stream (`src/rng.ts`) is itself `Forkable`. A mind built from closures is covered by
 * the closure audit (`tests/harness/closure-audit.mjs`); a class mind needs nothing.
 *
 * **Restored in place, into a mind built by the same code.** The snapshot pairs by path, so the
 * target must be the same policy -- the same mind, or a fresh one from the same factory.
 *
 * **Reseeding** restores everything and then restarts each random stream from a seed derived from
 * the one given, in the order the walk met them: the same moment, a different future. Without it a
 * restored mind replays its stream exactly.
 */
import type { Mind } from "../mind.ts";
import { captureGraph, restoreGraph, type StateGraph } from "./graph.ts";
import { babylonStructure } from "./world.ts";

export interface MindSnapshot {
  readonly name: string;
  readonly graph: StateGraph;
}

const NO_IDENTITIES: ReadonlyMap<object, string> = new Map();
const NO_LOOKUP: ReadonlyMap<string, object> = new Map();

/** Capture a mind's whole state. Reads only. */
export function snapshotMind(mind: Mind): MindSnapshot {
  return { name: mind.name, graph: captureGraph({ mind }, { identities: NO_IDENTITIES, structural: babylonStructure }) };
}

export interface MindRestoreOptions {
  /** Restart every random stream the mind draws from, from seeds derived from this one. */
  readonly reseed?: number;
}

interface Reseedable { reseed(seed: number): void }
const reseedable = (value: unknown): value is Reseedable =>
  typeof value === "function" && typeof (value as Partial<Reseedable>).reseed === "function";

/** Write a snapshot into a mind of the same policy. */
export function restoreMind(mind: Mind, snapshot: MindSnapshot, options: MindRestoreOptions = {}): void {
  if (snapshot.name !== mind.name) throw new Error(`fork: a snapshot of "${snapshot.name}" cannot restore "${mind.name}"`);
  restoreGraph(snapshot.graph, { mind }, NO_LOOKUP);
  if (options.reseed === undefined) return;
  let index = 0;
  for (const stream of randomStreams(mind)) {
    stream.reseed(mixSeed(options.reseed, index));
    index += 1;
  }
}

/** Every random stream a mind reaches, in walk order. */
export function randomStreams(mind: Mind): Reseedable[] {
  const found: Reseedable[] = [];
  const seen = new Set<object>();
  captureGraph({ mind }, { identities: NO_IDENTITIES, structural: babylonStructure, seen });
  for (const value of seen) if (reseedable(value)) found.push(value);
  return found;
}

/** A 32-bit mix of a seed and a stream's index, so two streams never restart on one seed. */
function mixSeed(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
