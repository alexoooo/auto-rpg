import measured from "../../../assets/core/stance-envelope.json" with { type: "json" };
import type { BodySpec } from "../spec/body.ts";
import { sourced, type Quantity } from "../spec/quantity.ts";

/**
 * **What the stance can do with a body**, measured, so that a caller asks for "your fastest walk"
 * and not for a number that held on one engine. The numbers are
 * `assets/core/stance-envelope.json`, which `research/core-stance-envelope.mjs --write` writes from
 * the gait battery (`research/core-stance-trials.mjs`' walk, five ways at each speed) and which
 * names the harness and rate it was measured on; `tests/core-stance-envelope.test.mjs` fails when
 * the harness it names is not the core's, so a change of engine or rate re-measures it.
 *
 * Measured on the body unarmed, at the rate the asset names: a held club, or another rate, is a
 * body the table did not see.
 */
export interface StanceEnvelope {
  /** The fastest walk the stance held, m/s (`fastestHeld`). */
  readonly walk: Quantity<number>;
}

/** The gait battery's walks at each speed: how many ways of `ways` held (did not fall). */
export interface GaitTable {
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

/** The measured envelope of `spec`'s model. */
export function stanceEnvelope(spec: BodySpec): StanceEnvelope {
  const models: Readonly<Record<string, { readonly walk: number }>> = measured.models;
  const entry = models[spec.model];
  if (!entry) throw new Error(`the stance's envelope was not measured on ${spec.model}`);
  return { walk: sourced(entry.walk, "m/s", "core-stance-envelope", `/models/${spec.model}/walk`) };
}
