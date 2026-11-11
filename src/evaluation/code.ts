/**
 * **What a case's code names**: the kind of world it plays, the kinds of mind it plays, the parts
 * their trees hold and the mind data they read, each of which adds its own code to the environment
 * in the case's `code` (`caseCoder`, `scripts/build-identity.mjs`).
 */
import type { MindConfig } from "../minds/catalog/config.ts";
import type { CaseWorld, WorldKind } from "./evaluation.ts";
import { createWorlds } from "./world-builders.ts";
import { type GameContext } from "../game/arena/context.ts";

/** The kind of world, the kinds of mind, the kinds of part in their trees and the mind data keys a case names. */
interface CodeNames {
  readonly world: CaseWorld["kind"];
  readonly kinds: readonly string[];
  readonly parts: readonly string[];
  readonly data: readonly string[];
}

export function createCode(context: GameContext) {
  const { treeData, treeKinds } = context.catalog;
  const { WORLD_BUILDERS } = createWorlds(context);

  const namesOf = (minds: readonly MindConfig[]): Omit<CodeNames, "world"> =>
    ({ kinds: [...new Set(minds.map((mind) => mind.kind))], parts: [...new Set(minds.flatMap((mind) => treeKinds(mind)))],
      data: [...new Set(minds.flatMap((mind) => treeData(mind)))] });

  /** `world`'s kind (`WorldKind`). */
  const kindOf = (world: CaseWorld): WorldKind => WORLD_BUILDERS[world.kind] as unknown as WorldKind;

  /** What `world` names: its kind, the kinds of its minds, the parts of their trees and its other parts, Commanders and end rules (each one's own code cut as a part's), as its kind names them (`WorldKind`), and the data they read. */
  const caseNames = (world: CaseWorld): CodeNames => {
    const kind = kindOf(world), minds = namesOf(kind.minds(world));
    return { world: world.kind, ...minds, parts: [...new Set([...minds.parts, ...kind.parts?.(world) ?? []])],
      data: [...new Set([...minds.data, ...kind.data?.(world) ?? []])] };
  };

  return { caseNames };
}
