/**
 * **What a case's code names**: the kind of world it plays, the kinds of mind it plays, the parts
 * their trees hold and the mind data they read, each of which adds its own code to the environment
 * in the case's `code` (`caseCoder`, `scripts/build-identity.mjs`).
 */
import { treeData, treeKinds } from "../entrants/game.ts";
import type { MindConfig } from "../core/mind/config.ts";
import type { CaseWorld, Subject, WorldKind } from "./evaluation.ts";
import { WORLD_BUILDERS } from "./worlds.ts";

/** The kind of world (a case's, none for a subject), the kinds of mind, the kinds of part in their trees and the mind data keys a case or a subject names. */
interface CodeNames {
  readonly world?: CaseWorld["kind"];
  readonly kinds: readonly string[];
  readonly parts: readonly string[];
  readonly data: readonly string[];
}

const namesOf = (minds: readonly MindConfig[]): CodeNames =>
  ({ kinds: [...new Set(minds.map((mind) => mind.kind))], parts: [...new Set(minds.flatMap((mind) => treeKinds(mind)))],
    data: [...new Set(minds.flatMap((mind) => treeData(mind)))] });

/** `world`'s kind (`WorldKind`). */
const kindOf = (world: CaseWorld): WorldKind => WORLD_BUILDERS[world.kind] as unknown as WorldKind;

/** What `world` names: its kind, the kinds of its minds, the parts of their trees and its other parts, Commanders and end rules (each one's own code cut as a part's), as its kind names them (`WorldKind`), and the data they read. */
export const caseNames = (world: CaseWorld): CodeNames => {
  const kind = kindOf(world), minds = namesOf(kind.minds(world));
  return { world: world.kind, ...minds, parts: [...new Set([...minds.parts, ...kind.parts?.(world) ?? []])] };
};

/** What `parts` name: the kinds and data of the minds among them (`mind:` parts), and the kinds of the Commanders (`commander:` parts). */
export const partNames = (parts: Subject["parts"]): CodeNames => {
  const minds = namesOf(parts.filter((part) => part.id.startsWith("mind:")).map((part) => part.value as unknown as MindConfig));
  const commanders = parts.filter((part) => part.id.startsWith("commander:")).map((part) => (part.value as { kind: string }).kind);
  return { ...minds, parts: [...new Set([...minds.parts, ...commanders])] };
};
