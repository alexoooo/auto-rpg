/**
 * **What a case's code names**: the kind of world it plays, the kinds of mind it plays, the parts
 * their trees hold and the mind data they read, each of which adds its own code to the environment
 * in the case's `code` (`caseCoder`, `scripts/build-identity.mjs`).
 */
import { SIDES } from "../arena/duel.ts";
import { treeData, treeKinds } from "../core/mind/catalog.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { modelInfo } from "../core/models.ts";
import { RUN_COMMANDERS, runParticipants } from "../dungeon/run.ts";
import { cryptMap } from "./crypt.ts";
import type { CaseWorld, Subject } from "./evaluation.ts";

/** The kind of world (a case's, none for a subject), the kinds of mind, the kinds of part in their trees and the mind data keys a case or a subject names. */
export interface CodeNames {
  readonly world?: CaseWorld["kind"];
  readonly kinds: readonly string[];
  readonly parts: readonly string[];
  readonly data: readonly string[];
}

const namesOf = (minds: readonly MindConfig[]): CodeNames =>
  ({ kinds: [...new Set(minds.map((mind) => mind.kind))], parts: [...new Set(minds.flatMap((mind) => treeKinds(mind)))],
    data: [...new Set(minds.flatMap((mind) => treeData(mind)))] });

/** The minds `world` plays: a bout's sides', each its recipe's or else its model's (`modelInfo`); a fall's riser; a Crypt run's party's, and its enemies' own. */
function mindsOf(world: CaseWorld): MindConfig[] {
  switch (world.kind) {
    case "bout": return SIDES.map((side) => world.recipe.minds?.[side] ?? modelInfo(world.recipe[side]).mind);
    case "fall": return [world.fall.mind];
    case "crypt": {
      const { crypt } = world, [hero, ...companions] = crypt.party;
      return runParticipants(cryptMap(crypt.layout), { hero: hero!.model, companions: companions.map((one) => one.model) })
        .map((one) => one.side === "party" ? crypt.mind ?? modelInfo(one.model).mind : modelInfo(one.model).mind);
    }
    default: {
      const never: never = world;
      throw new Error(`no case world ${JSON.stringify(never)}`);
    }
  }
}

/** The Commanders `world` plays, by kind: a Crypt run's two sides', each its case's or the run's own (`RUN_COMMANDERS`). */
function commandersOf(world: CaseWorld): string[] {
  switch (world.kind) {
    case "bout": case "fall": return [];
    case "crypt": return [world.crypt.commanders?.party?.kind ?? RUN_COMMANDERS.party.kind, world.crypt.commanders?.enemies?.kind ?? RUN_COMMANDERS.enemies.kind];
    default: {
      const never: never = world;
      throw new Error(`no case world ${JSON.stringify(never)}`);
    }
  }
}

/** What `world` names: its kind, the kinds of its minds, the parts of their trees and its Commanders (a Commander's own code is cut as a part's), and the data they read. */
export const caseNames = (world: CaseWorld): CodeNames => {
  const minds = namesOf(mindsOf(world));
  return { world: world.kind, ...minds, parts: [...new Set([...minds.parts, ...commandersOf(world)])] };
};

/** What `parts` name: the kinds and data of the minds among them (`mind:` parts), and the kinds of the Commanders (`commander:` parts). */
export const partNames = (parts: Subject["parts"]): CodeNames => {
  const minds = namesOf(parts.filter((part) => part.id.startsWith("mind:")).map((part) => part.value as unknown as MindConfig));
  const commanders = parts.filter((part) => part.id.startsWith("commander:")).map((part) => (part.value as { kind: string }).kind);
  return { ...minds, parts: [...new Set([...minds.parts, ...commanders])] };
};
