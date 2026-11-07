/**
 * **What a case's code names**: the kind of world it plays, the kinds of mind it plays, the parts
 * their trees hold and the mind data they read, each of which adds its own code to the environment
 * in the case's `code` (`caseCoder`, `scripts/build-identity.mjs`).
 */
import type { MindConfig } from "../minds/catalog/config.ts";
import type { CaseWorld, Subject, WorldKind } from "./evaluation.ts";
import { createWorlds } from "./world-builders.ts";
import { type GameContext } from "../game/arena/context.ts";

/** The kind of world (a case's, none for a subject), the kinds of mind, the kinds of part in their trees and the mind data keys a case or a subject names. */
interface CodeNames {
  readonly world?: CaseWorld["kind"];
  readonly kinds: readonly string[];
  readonly parts: readonly string[];
  readonly data: readonly string[];
}

export function createCode(context: GameContext) {
  const { treeData, treeKinds } = context.catalog;
  const { WORLD_BUILDERS } = createWorlds(context);

  const namesOf = (minds: readonly MindConfig[]): CodeNames =>
    ({ kinds: [...new Set(minds.map((mind) => mind.kind))], parts: [...new Set(minds.flatMap((mind) => treeKinds(mind)))],
      data: [...new Set(minds.flatMap((mind) => treeData(mind)))] });

  /** `world`'s kind (`WorldKind`). */
  const kindOf = (world: CaseWorld): WorldKind => WORLD_BUILDERS[world.kind] as unknown as WorldKind;

  /** What `world` names: its kind, the kinds of its minds, the parts of their trees and its other parts, Commanders and end rules (each one's own code cut as a part's), as its kind names them (`WorldKind`), and the data they read. */
  const caseNames = (world: CaseWorld): CodeNames => {
    const kind = kindOf(world), minds = namesOf(kind.minds(world));
    return { world: world.kind, ...minds, parts: [...new Set([...minds.parts, ...kind.parts?.(world) ?? []])] };
  };

  /** The component configurations each subject part declares, including every dependency its tree reads. */
  const partNames = (parts: Subject["parts"]): CodeNames => {
    const kinds: string[] = [], components: string[] = [], data: string[] = [];
    for (const { component } of parts) {
      if (!component) continue;
      const { role, config } = component;
      switch (role) {
        case "mind": kinds.push(config.kind); components.push(...treeKinds(config)); data.push(...treeData(config)); break;
        case "part": components.push(...treeKinds(config)); data.push(...treeData(config)); break;
        case "commander": components.push(config.kind); break;
        default: { const never: never = role; throw new Error(`no component role ${String(never)}`); }
      }
    }
    return { kinds: [...new Set(kinds)], parts: [...new Set(components)], data: [...new Set(data)] };
  };

  return { caseNames, partNames };
}
