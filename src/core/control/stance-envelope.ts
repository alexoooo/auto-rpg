import measured from "../../../assets/core/stance-envelope.json" with { type: "json" };
import type { BodySpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";

/**
 * **What the stance can do with a body**, measured, so that a caller asks for "your fastest walk"
 * and not for a number that held on one engine. The numbers are
 * `assets/core/stance-envelope.json`, which `research/core-stance-envelope.mjs --write` writes from
 * the gait battery (`research/core-stance-trials.mjs`' walk, five ways at each speed) and the turn
 * battery (its turn: half round each way at each rate, walking at each of the gait battery's speeds
 * up to the fastest walk), and which names the harness and rate it was measured on;
 * `tests/core-stance-envelope.test.mjs` fails when the harness it names is not the core's, so a
 * change of engine or rate re-measures it.
 *
 * A turn is read at each speed because it depends on it: a body may turn several times faster a
 * little below its fastest walk than at it, so one turn for all speeds would make a run crawl round
 * a bend.
 *
 * Measured on the body unarmed, at the rate the asset names: a held club, or another rate, is a
 * body the table did not see.
 */
export interface StanceEnvelope {
  /** The fastest walk the stance held, m/s (`fastestHeld`). */
  readonly walk: Quantity<number>;
  /**
   * At each speed of the gait battery up to `walk`, slowest first: the fastest the heading turned
   * while the body walked at that speed, and held, rad/s (`fastestHeld`).
   */
  readonly turns: readonly { readonly speed: Quantity<number>; readonly turn: Quantity<number> }[];
}

/**
 * A battery's trials at each speed (a walk's, or a turn's rate): how many ways of `ways` held (did
 * not fall).
 */
interface GaitTable {
  readonly speeds: readonly number[];
  readonly ways: number;
  readonly held: readonly number[];
}

/**
 * The rule: the fastest speed of the battery at which every way held, as it did at every slower
 * one; 0 if none. A speed that held after a slower one fell does not count.
 */
export function fastestHeld({ speeds, ways, held }: GaitTable): number {
  let fastest = 0;
  for (let i = 0; i < speeds.length; i++) {
    if (held[i]! < ways) break;
    fastest = speeds[i]!;
  }
  return fastest;
}

/**
 * The fastest turn `envelope` holds walking at `speed`, rad/s: that of the slowest speed of its table
 * at or above `speed`, taking a turn held at a walk as held at any slower one; past its fastest walk,
 * the fastest walk's.
 */
export function turnAt(envelope: StanceEnvelope, speed: number): number {
  const turns = envelope.turns;
  return (turns.find((t) => t.speed.value >= speed) ?? turns[turns.length - 1]!).turn.value;
}

/**
 * The fastest pace at which `envelope`'s turns carry the body round a bend of `radius` m, m/s: over
 * its table, the most of each speed or what its turn carries round the bend, whichever is less
 * (walking no faster than a speed, the body turns as fast as it turned there: `turnAt`).
 */
export function paceRound(envelope: StanceEnvelope, radius: number): number {
  return Math.max(0, ...envelope.turns.map((t) => Math.min(t.speed.value, t.turn.value * radius)));
}

/** The measured envelope of `spec`'s model. */
export function stanceEnvelope(spec: BodySpec): StanceEnvelope {
  const models: Readonly<Record<string, { readonly walk: number; readonly turns: readonly number[] }>> = measured.models;
  const entry = models[spec.model];
  if (!entry) throw new Error(`the stance's envelope was not measured on ${spec.model}`);
  return {
    walk: sourced(entry.walk, "m/s", "core-stance-envelope", `/models/${spec.model}/walk`),
    turns: entry.turns.map((turn, i) => ({
      speed: sourced(measured.speeds[i]!, "m/s", "core-stance-envelope", `/speeds/${i}`),
      turn: sourced(turn, "rad/s", "core-stance-envelope", `/models/${spec.model}/turns/${i}`),
    })),
  };
}
