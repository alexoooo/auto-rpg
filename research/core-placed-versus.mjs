/**
 * **A recipe against a placed blow, by the target's height**: one body standing as built, its
 * right hand's blow at a target 1.3 m ahead of where it was built and `--ups` m over its head as
 * it stands, thrown twice: with a recipe of the hand's whatever the height (every window's height
 * opened, so the one whose place is nearest in height), and placed (no repertoire). What each did
 * to the dummy hung at the target is the lab's reading (`readTarget`, `src/lab/targets.ts`).
 *
 *   node research/core-placed-versus.mjs [--models workshop-fighter,workshop-rogue] [--held empty,club]
 *     [--ups 0.2,0.14,0.1,0.06,0,-0.04,-0.08,-0.14,-0.2,-0.3,-0.5,-0.8]
 *
 * Prints, per body, thing held and height: which of the two the skill itself throws there
 * (`recipeFor`), and for each of the two the dummy's damage (HP), the blow's energy (J)
 * and closing speed (m/s), the part or item that landed it, and how near the hand's body passed
 * (cm). Node core stand, Rapier, 120 Hz, no assist, the arena's rules.
 */
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { recipeFor, REPERTOIRE } from "../src/core/skills/strikes.ts";
import { labActor } from "../src/lab/actor.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { readTarget } from "../src/lab/targets.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;
const { values } = parseArgs({ options: {
  models: { type: "string", default: "workshop-fighter,workshop-rogue" }, held: { type: "string", default: "empty,club" },
  ups: { type: "string", default: "0.2,0.14,0.1,0.06,0,-0.04,-0.08,-0.14,-0.2,-0.3,-0.5,-0.8" },
} });
const RULES = rulebook("arena");
/** The repertoire with every window's height opened: a recipe is thrown whatever the target's height, the nearest in height. */
const ANY = REPERTOIRE.map((recipe) => ({ ...recipe, window: { ...recipe.window, up: [-Infinity, Infinity] } }));
/** Seconds the body stands before its head's height is read. */
const STOOD = 1.5;

/** One blow of `loadout`'s right hand at a target `up` m over its standing head, under `repertoire`. */
async function one(loadout, up, repertoire) {
  const stand = await coreStand(loadoutSpec(loadout), { ground: true });
  const actor = labActor(stand.built, stand.world);
  let target = null, open = null, reading = null, thrown = 0, time = 0;
  actor.drive({ name: "attack", decide: ({ view }) => {
    if (!target && time >= STOOD) target = { at: [0, view.head.y + up, 1.3], stratum: "control" };
    return { move: null, face: 0, guard: NO_COVER, attack: target && !thrown ? { kind: "blow", hand: "right", target: target.at } : null };
  } }, { skills: { repertoire }, watch(sight, dt) {
    time += dt;
    thrown = sight.report.strike.thrown.right;
    if (!target || reading) return;
    open ??= readTarget(actor, target, "right", RULES);
    reading = open.step(sight);
  } });
  try {
    for (let i = 0; i < stand.seconds(20) && !reading && !actor.body.view.down; i++) stand.step(1);
    return reading ?? open?.fall() ?? null;
  } finally { open?.dispose(); actor.dispose(); stand.dispose(); }
}

const cells = (r) => {
  if (!r) return "- | - | - | unread | -";
  const by = r.gave ? r.gave.item ?? r.gave.segment : r.fell ? "fell" : r.hung ? "-" : "crowded";
  return `${(r.took?.damage ?? 0).toFixed(3)} | ${(r.blow?.energy ?? 0).toFixed(1)} | ${r.blow ? r.blow.closing.toFixed(2) : "-"} | ${by} | ${r.nearest === null ? "-" : (100 * r.nearest).toFixed(1)}`;
};

console.log("A recipe against a placed blow by the target's height over the standing head, the target 1.3 m ahead; Node core stand, Rapier, 120 Hz, no assist, the arena's rules.\n");
console.log("| Body | Held | Up, cm | The skill throws | Recipe: HP | J | m/s | by | nearest, cm | Placed: HP | J | m/s | by | nearest, cm |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const model of values.models.split(",")) {
  for (const right of values.held.split(",")) {
    const loadout = { model, right, left: "empty" };
    const spec = loadoutSpec(loadout);
    for (const up of values.ups.split(",").map(Number)) {
      const [recipe, placed] = await Promise.all([one(loadout, up, ANY), one(loadout, up, [])]);
      const chosen = recipeFor(REPERTOIRE, spec, "right", up), thrown = chosen ? `${chosen.recipe.band} recipe` : "placed";
      console.log(`| ${model} | ${right} | ${(100 * up).toFixed(0)} | ${thrown} | ${cells(recipe)} | ${cells(placed)} |`);
    }
  }
}
