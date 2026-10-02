/**
 * What a body's blow does a body that stands: an arena bout (`bout.mjs`) in which the right side is
 * ordered to stand, bare-handed, and the left is ordered to attack one point of it, where the
 * part of a height band is (`BANDS`) once both have stood a second. The strike skill walks the
 * left to its blow and throws it: its recipe whose window holds that height, or a placed blow.
 *
 *   node research/core-blow-standing.mjs [--models <every body>] [--foes workshop-fighter,workshop-rogue] [--held club,empty] [--gaps 2,2.5,3]
 *
 * It prints a row for each body, thing held, band and foe: how the blow was thrown at each gap (a
 * recipe's band, or placed), how high over the attacker's head the point stood, and, over the
 * gaps, the mean of the hit points the foe lost from the step the attack was ordered to a second
 * after the blow was thrown, of those the attacker lost, the surfaces of the hardest blow, and in
 * how many each was still up at the end. Each side's balance is its character's.
 */
import { parseArgs } from "node:util";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { DUEL_HELD } from "../src/arena/duel.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { BODY_MODELS } from "../src/core/human/spec.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { woundedIn } from "../src/core/rules/blows.ts";
import { BAND_NAMES, BANDS } from "../src/core/skills/strikes.ts";
import { BOUT_HARNESS, buildBout } from "./bout.mjs";

const { values } = parseArgs({ options: {
  models: { type: "string", default: BODY_MODELS.join(",") }, foes: { type: "string", default: "workshop-fighter,workshop-rogue" },
  held: { type: "string", default: "club,empty" }, gaps: { type: "string", default: "2,2.5,3" },
} });
const models = values.models.split(","), foes = values.foes.split(","), helds = values.held.split(","), gaps = values.gaps.split(",").map(Number);
for (const model of [...models, ...foes]) if (!BODY_MODELS.includes(model)) throw new Error(`no body is called ${model} (one of ${BODY_MODELS.join(", ")})`);
for (const held of helds) if (!DUEL_HELD.includes(held)) throw new Error(`--held is of ${DUEL_HELD.join(", ")}, not ${held}`);

/** Seconds both stand before the attack is ordered, the most the attack is given to be thrown, and those read after it is. */
const SETTLE = 1, WAIT = 20, AFTER = 1;

/** One bout: `model` with `held` ordered to attack the `band` part of `foe`, who stands `gap` m off. */
async function thrownAt(model, held, band, foe, gap) {
  const { world, duel, dispose } = await buildBout({ left: model, right: foe, gap, held: { left: held, right: "empty" } });
  try {
    const { left, right } = duel.duelists, at = new Vector3();
    duel.order("left", STAND_ORDERS);
    duel.order("right", STAND_ORDERS);
    while (duel.clock < SETTLE) world.step();
    const part = right.built.segments.get(BANDS[band]) ?? right.built.segments.get("head");
    centreOfToRef(part, at);
    const up = at.y - left.body.view.head.y, from = duel.blows.length, strike = () => left.minded.skills.report.strike;
    duel.order("left", { move: null, face: null, attack: at.asArray() });
    let thrown = null;
    while (duel.clock < SETTLE + WAIT && strike().thrown.right === 0) {
      world.step();
      const { blow, chosen } = strike();
      if (blow) thrown = blow === "placed" ? "placed" : chosen.recipe.band;
    }
    const threw = strike().thrown.right > 0;
    duel.order("left", STAND_ORDERS);
    for (const until = duel.clock + AFTER; duel.clock < until;) world.step();
    const blows = duel.blows.slice(from), lost = (side) => blows.reduce((sum, blow) => sum + (woundedIn(blow).find((one) => one.fighter === side)?.damage ?? 0), 0);
    const hardest = blows.reduce((best, blow) => !best || blow.energy > best.energy ? blow : best, null);
    const surface = (side) => { const met = hardest.sides.find((one) => one.fighter === side); return met.item ?? met.segment; };
    return {
      thrown: threw ? thrown : "not thrown", up, done: lost("right"), cost: lost("left"),
      met: hardest ? `${surface("left")} on ${surface("right")}, ${hardest.energy.toFixed(1)} J` : "nothing",
      up_left: !left.body.view.down, up_right: !right.body.view.down,
    };
  } finally { dispose(); }
}

const mean = (some) => some.reduce((sum, v) => sum + v, 0) / some.length;
console.log(`${BOUT_HARNESS}; each side's balance its character's; the foe stands, bare-handed; gaps ${gaps.join(", ")} m.`);
console.log("\n| Body | Held | Band | Foe | Thrown, by gap | Up, m | Foe lost, HP | by gap | Thrower lost, HP | Hardest blow, by gap | Thrower up | Foe up |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const model of models) for (const held of helds) for (const band of BAND_NAMES) for (const foe of foes) {
  const runs = [];
  for (const gap of gaps) runs.push(await thrownAt(model, held, band, foe, gap));
  console.log(`| ${model} | ${held} | ${band} | ${foe} | ${runs.map((run) => run.thrown).join("; ")} | ${mean(runs.map((run) => run.up)).toFixed(2)} | ${mean(runs.map((run) => run.done)).toFixed(3)} `
    + `| ${runs.map((run) => run.done.toFixed(3)).join(", ")} | ${mean(runs.map((run) => run.cost)).toFixed(3)} | ${runs.map((run) => run.met).join("; ")} `
    + `| ${runs.filter((run) => run.up_left).length} of ${runs.length} | ${runs.filter((run) => run.up_right).length} of ${runs.length} |`);
}
