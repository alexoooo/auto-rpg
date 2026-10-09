import { partOf, PARTS, treeFaults, treeFits, withoutTuning } from "../core/mind/catalog.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { Provision } from "../core/mind/parts.ts";
import type { BodySpec } from "../core/spec/body.ts";

/** A mind a link carries, as a panel shows it: its config and what is wrong with it (`mindFaults`). */
export interface LinkedMind {
  readonly config: MindConfig;
  readonly faults: readonly string[];
}

/** Named minds a screen offers, by id: a link names one by its id. */
type Presets = Readonly<Record<string, { readonly config: MindConfig }>>;

/** What is wrong with `config` for a body of `spec` on a screen that `provides` what it does (`treeFaults`), or that it does not fit the body. */
export function mindFaults(config: MindConfig, spec: BodySpec, provides: readonly Provision[] = []): readonly string[] {
  const faults = treeFaults(config, provides);
  return faults.length > 0 || treeFits(spec, config) ? faults : ["the mind does not fit this body"];
}

/** The tree rooted in a mind that `text` holds as JSON, with any research `tuning` dropped; null for text that is none. */
function treeOf(text: string | null): MindConfig | null {
  if (text === null) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(PARTS, kind) || partOf({ kind }).role !== "mind") return null;
  return withoutTuning(value as MindConfig);
}

/**
 * **The mind `text` carries** (`writeMind`), for a body of `spec`, faults and all; null for text
 * that is no tree rooted in a mind. Any research `tuning` in it is dropped: a link carries a
 * person's settings and no experiment's.
 */
export function parseMind(text: string | null, spec: BodySpec): LinkedMind | null {
  const config = treeOf(text);
  return config && { config, faults: mindFaults(config, spec) };
}

/** `config` as a link carries it: its tree as JSON, with no part's `tuning`. */
export const writeMind = (config: MindConfig): string => JSON.stringify(withoutTuning(config));

/** The mind `text` names: one of `presets` by its id, or a whole tree (`parseMind`); null for neither. Its faults are its screen's to find. */
export function readMind(text: string | null, presets: Presets): MindConfig | null {
  return text !== null && Object.hasOwn(presets, text) ? presets[text]!.config : treeOf(text);
}

/** What a link writes for `config` (`readMind`): the id of the preset whose tree it is, or its whole tree. */
export function mindText(config: MindConfig, presets: Presets): string {
  const text = writeMind(config);
  return Object.keys(presets).find((id) => writeMind(presets[id]!.config) === text) ?? text;
}
