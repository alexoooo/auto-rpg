/**
 * **The buckler task** (Node, core world, Rapier, 120 Hz, Balance 0): the Duellist with sword and
 * buckler stands where it is ordered to, facing `angle` degrees off the line to its attacker
 * (positive to its right), and covers as it does (`cover`, `ward`); with `own`, it also
 * throws its own actions at the attacker as it stands. The attacker is the blade
 * task's striker (`bladeStriker`, `research/blade-task.mjs`) with a sword alone, whose only blow is
 * its sword hand's swing at `at`: a mark (`high`, `middle`) or a segment of the defender's (its
 * sword arm, `upperArm.right`). Each of the attacker's swings that touches the defender is read
 * from its commitment to its end: whether the buckler met the blade before any of the defender's
 * body did, and the wound the defender took. `tuning` is both recipe strikes' executor's, over its
 * defaults.
 *
 *   node research/buckler-task.mjs [--models workshop-fighter,workshop-rogue] [--angles -45,0,45] [--at high,middle,upperArm.right] [--own] [--seconds 20]
 */
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { buildBout } from "./bout.mjs";
import { bladeStriker } from "./blade-task.mjs";
import { DUELLIST } from "../src/core/mind/config.ts";
import { deepFreeze } from "../src/core/state.ts";
import { cos, sin } from "../src/core/math/real.ts";

/** How far apart the two start, m: a step inside the swing's reach, so the attacker steps in to its window. */
const GAP = 1.6;

/** How long the task runs on past its time for the swing under way to end, s. */
const RETURN = 2;

/** How fast the defender is asked to sidestep while it turns, and for how long, m/s and s. */
const SIDESTEP = .05, TURNING = 2;

/** The defender: the Duellist standing to its orders and covering, throwing its own actions at its foe with `own`. */
export function defender(own, tuning) {
  const cover = DUELLIST.tactics.list.find((behaviour) => behaviour.kind === "cover");
  return deepFreeze({ ...DUELLIST, tactics: { ...DUELLIST.tactics, list: [{ kind: "follow-orders" }, ...(own ? [{ kind: "attack" }] : []), cover] },
    executors: own ? DUELLIST.executors.map((executor) => executor.kind === "recipe-strike" && tuning ? { ...executor, tuning } : executor) : [], actions: own ? DUELLIST.actions : [] });
}

/** The task for one defender `model`, facing `angle` degrees off its attacker, struck at `at`. */
export async function bucklerTask({ model = "workshop-fighter", angle = 0, at = "middle", own = false, seconds = 20, tuning } = {}) {
  const region = ["high", "middle", "legs"].includes(at) ? at : null;
  const attacker = region ? bladeStriker("swing", region, tuning) : (() => {
    const striker = bladeStriker("swing", "middle", tuning);
    return deepFreeze({ ...striker, actions: striker.actions.map((action) => ({ ...action, regions: [{ kind: "segment", segment: at }] })) });
  })();
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: model, gap: GAP, capSeconds: seconds + RETURN + 1, recoverySeconds: null,
    loadouts: { left: { left: "empty", right: "sword" }, right: { left: "buckler", right: "sword" } }, minds: { left: attacker, right: defender(own, tuning) } });
  try {
    const striking = duel.duelists.left, standing = duel.duelists.right, skills = striking.minded.skills, commits = new Map();
    // Facing `angle` off the line to the attacker, turned to the right for a positive angle; a
    // standing body turns only as it steps, so it sidesteps a little while it turns, then stops.
    const from = standing.body.view.head, to = striking.body.view.head, dx = to.x - from.x, dz = to.z - from.z, length = Math.sqrt(dx * dx + dz * dz);
    const turn = angle * Math.PI / 180, c = cos(turn), s = sin(turn), face = { x: (dx * c + dz * s) / length, z: (dz * c - dx * s) / length };
    const foe = own ? { foe: "left" } : {};
    duel.play([{ step: 0, side: "right", orders: { move: { kind: "direct", direction: { x: SIDESTEP * face.z, z: -SIDESTEP * face.x } }, face, ...foe } },
      { step: Math.round(TURNING * world.hz), side: "right", orders: { move: null, face, ...foe } }]);
    let stop = null;
    while (stop === null || (world.time < stop && skills.report.actions.length > 0)) {
      world.step();
      for (const action of skills.report.actions) if (action.phase === "commit" && !commits.has(action.id)) commits.set(action.id, world.time);
      if (stop === null && (world.time >= seconds || duel.verdict)) stop = world.time + RETURN;
    }
    const swings = skills.report.ledger.filter((record) => commits.has(record.id)).map((record) => {
      const contacts = duel.blows.filter((blow) => blow.time >= commits.get(record.id) && blow.time <= record.ended
        && blow.sides.some((side) => side.fighter === "left" && side.item === "short sword") && blow.sides.some((side) => side.fighter === "right"));
      const first = contacts[0]?.sides.find((side) => side.fighter === "right") ?? null;
      return { committed: commits.get(record.id), ended: record.ended, touched: first !== null, met: first?.item === "buckler",
        first: first ? first.item ?? first.segment : null, wound: contacts.reduce((sum, blow) => sum + (blow.sides.find((side) => side.fighter === "right")?.damage ?? 0), 0) };
    });
    return { model, angle, at, own, seconds: world.time, swings, down: standing.body.down, harness: "Node, core world, Rapier, 120 Hz, Balance 0" };
  } finally { dispose(); }
}

/** A cell's summary: its swings, those that touched the defender, those the buckler met first, and the wound taken. */
export function bucklerSummary(row) {
  const touched = row.swings.filter((swing) => swing.touched);
  return { model: row.model, angle: row.angle, at: row.at, own: row.own, swings: row.swings.length, touched: touched.length,
    met: touched.filter((swing) => swing.met).length, wound: row.swings.reduce((sum, swing) => sum + swing.wound, 0), firsts: touched.map((swing) => swing.first), down: row.down };
}

async function main() {
  const { values } = parseArgs({ options: { models: { type: "string", default: "workshop-fighter,workshop-rogue" }, angles: { type: "string", default: "-45,0,45" },
    at: { type: "string", default: "high,middle,upperArm.right" }, own: { type: "boolean", default: false }, seconds: { type: "string", default: "20" }, json: { type: "boolean", default: false } } });
  console.log("Node, core world, Rapier, 120 Hz, Balance 0");
  console.log("| Defender | Angle | At | Own cut | Swings | Touched | Met first | Wound, HP | First touches | Down |\n|---|---|---|---|---|---|---|---|---|---|");
  for (const model of values.models.split(",")) for (const angle of values.angles.split(",").map(Number)) for (const at of values.at.split(",")) {
    const row = await bucklerTask({ model, angle, at, own: values.own, seconds: Number(values.seconds) }), s = bucklerSummary(row);
    if (values.json) console.log(JSON.stringify(row));
    console.log(`| ${model} | ${angle} | ${at} | ${s.own} | ${s.swings} | ${s.touched} | ${s.met} | ${s.wound.toFixed(3)} | ${s.firsts.join(", ")} | ${s.down} |`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
