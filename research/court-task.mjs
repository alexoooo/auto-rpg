/**
 * **The court task** (Node, core world, Rapier, 120 Hz, Balance 0): a striker with sword and buckler,
 * the Duellist unless given another mind (`MINDS`), starts on one of the obstacle
 * court's spawns, `gap` apart from a Warrior with empty hands behind the court's central column,
 * which stands (`still`) or walks to and fro across the line between them (`moving`). It is read
 * until its first swing begins, which is its arrival in the swing's window, or `seconds`: when it
 * arrived, how many steps any of its segments pushed on the court's furniture, and how often it
 * fell.
 *
 *   node research/court-task.mjs [--mind duellist] [--models workshop-fighter,workshop-rogue] [--gaps 4,6] [--sides left,right] [--targets still,moving] [--seconds 15]
 */
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { buildBout } from "../src/evaluation/bout.ts";
import { BOUT_ENGINE } from "./bout.mjs";
import { STANDS } from "./blade-task.mjs";
import { BEHAVIOURS } from "../src/core/mind/config.ts";
import { MINDS } from "../src/core/mind/controllers.ts";
import { LEVELS } from "../src/arena/levels.ts";
import { deepFreeze } from "../src/core/state.ts";

/** How fast the moving target walks across the line, m/s, and how long each way, s. */
const PACE = .4, LEG = 3;

/** The moving target: Behaviours' body of parts, doing only as it is ordered. */
const WALKS = deepFreeze({ ...BEHAVIOURS, tactics: { ...BEHAVIOURS.tactics, list: [{ kind: "follow-orders" }] }, executors: [], actions: [] });

const other = (side) => side === "left" ? "right" : "left";

/** The task for one striker `model` minded by `mind` on `side`, `gap` from a `target` that is `still` or `moving`. */
export async function courtTask({ mind = MINDS.duellist.config, model = "workshop-fighter", gap = 6, side = "left", target = "still", seconds = 15 } = {}) {
  const foe = other(side), minds = { [side]: mind, [foe]: target === "moving" ? WALKS : STANDS };
  const { world, duel, colliders, dispose } = await buildBout({ level: "obstacle-court", [side]: model, [foe]: "workshop-fighter", gap, capSeconds: seconds + 1, recoverySeconds: null,
    loadouts: { [side]: { left: "buckler", right: "sword" }, [foe]: { left: "empty", right: "empty" } }, minds }, { engine: BOUT_ENGINE });
  try {
    const furniture = new Set(LEVELS["obstacle-court"].furniture.map(({ solid }) => colliders.get(solid.name)));
    const legs = Math.ceil(seconds / LEG);
    duel.play(target === "moving" ? Array.from({ length: legs }, (_, k) => ({ step: Math.round(k * LEG * world.hz), side: foe,
      orders: { move: { kind: "direct", direction: { x: 0, z: (k % 2 ? -1 : 1) * PACE } }, face: null } })) : []);
    const striker = duel.duelists[side], skills = striker.minded.skills;
    let arrived = null, contactSteps = 0, falls = 0, down = false;
    while (arrived === null && world.time < seconds && !duel.verdict) {
      world.step();
      if (skills.report.actions.length > 0) arrived = world.time;
      if ([...striker.built.segments.values()].some((segment) => world.physics.contactsOf(segment.body)
        .some((touch) => touch.fixed !== null && furniture.has(touch.fixed) && touch.impulse > 0))) contactSteps++;
      if (striker.body.down && !down) falls++;
      down = striker.body.down;
    }
    return { model, gap, side, target, arrived, contactSteps, falls, seconds: world.time, harness: "Node, core world, Rapier, 120 Hz, Balance 0" };
  } finally { dispose(); }
}

async function main() {
  const { values } = parseArgs({ options: { mind: { type: "string", default: "duellist" }, models: { type: "string", default: "workshop-fighter,workshop-rogue" }, gaps: { type: "string", default: "4,6" },
    sides: { type: "string", default: "left,right" }, targets: { type: "string", default: "still,moving" }, seconds: { type: "string", default: "15" } } });
  console.log("Node, core world, Rapier, 120 Hz, Balance 0");
  console.log("| Striker | Gap, m | Side | Target | Arrived, s | Furniture contact steps | Falls |\n|---|---|---|---|---|---|---|");
  for (const model of values.models.split(",")) for (const gap of values.gaps.split(",").map(Number)) for (const side of values.sides.split(","))
    for (const target of values.targets.split(",")) {
      const row = await courtTask({ mind: MINDS[values.mind].config, model, gap, side, target, seconds: Number(values.seconds) });
      console.log(`| ${model} | ${gap} | ${side} | ${target} | ${row.arrived?.toFixed(2) ?? "never"} | ${row.contactSteps} | ${row.falls} |`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
