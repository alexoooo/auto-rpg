import { partOf, PARTS, treeFaults, treeFits, withoutTuning } from "../core/mind/catalog.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { BodySpec } from "../core/spec/body.ts";

/** A mind a link carries, as a panel shows it: its config and what is wrong with it (`treeFaults`). */
export interface LinkedMind {
  readonly config: MindConfig;
  readonly faults: readonly string[];
}

/**
 * **The mind `text` carries** (`writeMind`), for a body of `spec`, faults and all; null for text
 * that is no tree rooted in a mind. Any research `tuning` in it is dropped: a link carries a
 * person's settings and no experiment's.
 */
export function parseMind(text: string | null, spec: BodySpec): LinkedMind | null {
  if (text === null) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(PARTS, kind) || partOf({ kind }).role !== "mind") return null;
  const config = withoutTuning(value as MindConfig), faults = treeFaults(config);
  return { config, faults: faults.length > 0 || treeFits(spec, config) ? faults : ["the mind does not fit this body"] };
}

/** `config` as a link carries it: its tree as JSON, with no part's `tuning`. */
export const writeMind = (config: MindConfig): string => JSON.stringify(withoutTuning(config));
