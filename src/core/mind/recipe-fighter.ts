import { createBody, SERVO_SECONDS } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { recipeSkills } from "../skills/skills.ts";
import type { World } from "../world.ts";
import type { RecipeFighterConfig } from "./config.ts";
import { fighterTactics, seekFoe, STRAFE } from "./fighter.ts";
import type { MindWiring } from "./minds.ts";
import { subMindsOf } from "./sub-minds.ts";
import { driveBy } from "./tactics.ts";

/** What is wrong with `config`, each a sentence; none for a config a recipe fighter can be made of. */
export function recipeFaults(config: RecipeFighterConfig): readonly string[] {
  const edge = config.tuning?.edge;
  return edge && !(Number.isFinite(edge.band) && edge.band >= 0 && Number.isFinite(edge.patience) && edge.patience >= 0)
    ? ["the edge needs a finite nonnegative band and patience"] : [];
}

/** A recipe fighter left to itself seeks its foe (`seekFoe`): the one conduct there is. */
export function createRecipeFighter(built: BuiltBody, world: World, config: RecipeFighterConfig, wiring: MindWiring) {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist, subs: subMindsOf(config.subs) });
  const skills = driveBy(body, fighterTactics(wiring.name, (sight) => wiring.orders(sight.view.senses) ?? seekFoe(sight, config.aim, config.range, config.tuning?.edge), STRAFE, config.guard, config.tuning?.threat),
    (made, tactics) => recipeSkills(made, tactics, { cover: config.tuning?.covering }));
  return { kind: "recipe-fighter" as const, body, skills, state: skills.state };
}
