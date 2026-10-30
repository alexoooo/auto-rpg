import type { Controller, MindPreset } from "../mind/controller.ts";
import type { Part } from "./parts.ts";

/**
 * **An entrant**: one AI, as a folder above the core (`src/entrants/<name>/index.ts`) and a line in
 * the game's list. Every kind it registers, of mind or part, is its own, scoped `<name>:<kind>`
 * (`scopeOf`); its presets are what a person may pick, by ids unique across entrants. A preset's
 * tree names the toolkit's kinds and its own entrant's, never another's (`Catalog.faults`).
 */
export interface Entrant {
  /** Its folder's name, and the scope of every kind it registers. */
  readonly name: string;
  /** Its kinds of mind, where it brings any; most entrants configure the toolkit's. */
  readonly minds?: readonly Controller[];
  /** Its parts below a mind, of any role. */
  readonly parts?: readonly Part[];
  /** Its named configs, by the id the Arena's picker and a link's `control=` use. */
  readonly presets: Readonly<Record<string, MindPreset>>;
}

/** The entrant whose kind `kind` is (`<entrant>:<kind>`), or null for the toolkit's. */
export const scopeOf = (kind: string): string | null => {
  const at = kind.indexOf(":");
  return at < 0 ? null : kind.slice(0, at);
};
