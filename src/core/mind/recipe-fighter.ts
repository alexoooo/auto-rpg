import { createBody, SERVO_SECONDS } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { recipeSkills } from "../skills/skills.ts";
import type { World } from "../world.ts";
import type { RecipeFighterConfig } from "./config.ts";
import { fighterTactics, seekFoe, STRAFE } from "./fighter.ts";
import type { MindWiring } from "./minds.ts";
import { subMindsOf } from "./sub-minds.ts";
import { driveBy } from "./tactics.ts";

/** A recipe fighter left to itself seeks its foe (`seekFoe`): the one conduct there is. */
export function createRecipeFighter(built: BuiltBody, world: World, config: RecipeFighterConfig, wiring: MindWiring) {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses: wiring.senses, assist: wiring.assist, subs: subMindsOf(config.subs) });
  const skills = driveBy(body, fighterTactics(wiring.name, (sight) => wiring.orders(sight.view.senses) ?? seekFoe(sight, config.aim, config.range, config.edge), STRAFE, config.guard, config.threat),
    (made, tactics) => recipeSkills(made, tactics, { cover: config.covering }));
  return { kind: "recipe-fighter" as const, body, skills, state: skills.state };
}
