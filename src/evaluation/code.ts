/**
 * **What a case's code names**: the kinds of mind it plays and the mind data they read, each of
 * which adds its own code to the environment in the case's `code` (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
import { SIDES } from "../arena/duel.ts";
import { treeData } from "../core/mind/catalog.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { modelInfo } from "../core/models.ts";
import { runParticipants } from "../dungeon/run.ts";
import { cryptMap } from "./crypt.ts";
import type { CaseWorld, Subject } from "./evaluation.ts";

/** The kinds of mind and the mind data keys a case or a subject names. */
export interface CodeNames {
  readonly kinds: readonly string[];
  readonly data: readonly string[];
}

const namesOf = (minds: readonly MindConfig[]): CodeNames =>
  ({ kinds: [...new Set(minds.map((mind) => mind.kind))], data: [...new Set(minds.flatMap((mind) => treeData(mind)))] });

/** The minds `world` plays: a bout's sides', each its recipe's or else its model's (`modelInfo`); a fall's riser; a Crypt run's party's, and its enemies' own. */
function mindsOf(world: CaseWorld): MindConfig[] {
  switch (world.kind) {
    case "bout": return SIDES.map((side) => world.recipe.minds?.[side] ?? modelInfo(world.recipe[side]).mind);
    case "fall": return [world.fall.mind];
    case "crypt": {
      const { crypt } = world, [hero, ...companions] = crypt.party;
      return runParticipants(cryptMap(crypt.layout), { hero: hero!.model, companions: companions.map((one) => one.model) })
        .map((one) => one.side === "party" ? crypt.mind : modelInfo(one.model).mind);
    }
    default: {
      const never: never = world;
      throw new Error(`no case world ${JSON.stringify(never)}`);
    }
  }
}

/** What `world` names: the kinds of its minds and the data they read. */
export const caseNames = (world: CaseWorld): CodeNames => namesOf(mindsOf(world));

/** What `parts` name: the kinds and data of the minds among them (`mind:` parts). */
export const partNames = (parts: Subject["parts"]): CodeNames =>
  namesOf(parts.filter((part) => part.id.startsWith("mind:")).map((part) => part.value as unknown as MindConfig));
