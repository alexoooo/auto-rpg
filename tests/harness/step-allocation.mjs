/**
 * **One reading of what a body's step allocates**, KiB, printed. Run each fixture in a process
 * of its own. Node, the core world, Rapier, 120 Hz.
 *
 *   node tests/harness/step-allocation.mjs standing|standing-array|down|fall|mind <id> <model> <held>
 *
 * - `standing`: two skeletons standing (`standBodies`), 240 steps read from 3 s.
 * - `standing-array`: the same, with one `new Array(4096)` made first in every step.
 * - `down`: the Warrior lying on its back, 240 steps read from 3 s, with the ground reader active.
 * - `fall`: the Skeleton's first fall of the stand-up target on the fall bed (`buildFall`), its
 *   stand verified as the evaluation verifies it (`standCheck`), 240 steps read from 3 s or its
 *   first later takeover, as it rises.
 * - `mind`: the mind `id` (`MINDS`) on both sides of a bout of `model`s 3 m apart, each holding
 *   `held` in its right hand under its preset's character, 240 steps read from 2 s.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { buildBout, buildFall, risingMind } from "../../src/app/node/evaluation.ts";
import { BOUT_ENGINE } from "../../research/bout.mjs";
import { GAME, MINDS } from "../../src/app/catalog.ts";
import { risingJobs } from "../../src/evaluation/rising.ts";
import { DEFAULT_ENGINE } from "../../src/core/physics/engines.ts";
import { isRefused } from "../../src/core/refusal.ts";
import { allocatedIn, downBody, standBodies } from "./garbage.mjs";

// Babylon greets every engine it makes on the console.
Logger.LogLevels = Logger.NoneLogLevel;

/** KiB a body's step allocates, two skeletons standing, with `hook`, where given, run first in every step. */
async function standing(hook) {
  const steps = 240, { world, bodies, dispose } = await standBodies(2);
  try {
    world.step(3 * world.hz);
    if (hook) world.beforeStep(hook);
    const { bytes } = await allocatedIn(() => world.step(steps));
    return bytes / steps / bodies.length / 1024;
  } finally { dispose(); }
}

async function mind(id, model, held) {
  const { config, character = {} } = MINDS[id], loadout = { left: "empty", right: held };
  const steps = 240, { world, duel, dispose } = await buildBout({ left: model, right: model, gap: 3, minds: { left: config, right: config },
    loadouts: { left: loadout, right: loadout }, attributes: { left: character, right: character } }, { engine: BOUT_ENGINE });
  try {
    world.step(2 * world.hz);
    const { bytes } = await allocatedIn(() => world.step(steps));
    if (duel.verdict) throw new Error("the bout ended inside the steps read");
    return bytes / steps / 2 / 1024;
  } finally { dispose(); }
}

async function down() {
  const steps = 240, { world, body, dispose } = await downBody();
  try {
    world.step(3 * world.hz);
    if (!body.view.down || body.view.ground?.position !== "back") throw new Error("the allocation fixture is not lying on its back");
    const { bytes } = await allocatedIn(() => world.step(steps));
    if (!body.view.down || body.view.ground?.position !== "back") throw new Error("the body left its ground reading during the measured steps");
    return bytes / steps / 1024;
  } finally { dispose(); }
}

async function fall() {
  await GAME.loadData(GAME.dataKeys);
  const job = risingJobs({ target: true }).find((one) => one.model === "skeleton");
  const built = await buildFall({ ...job, mind: risingMind(job.techniques) }, DEFAULT_ENGINE);
  if (isRefused(built)) throw new Error(built.refused);
  const steps = 240, step = () => { built.world.step(); built.afterStep(); };
  try {
    for (let i = 0; i < 3 * built.world.hz; i++) step();
    while (built.state.check.takeover === null && !built.ended) step();
    if (built.state.check.takeover === null) throw new Error("the allocation fixture never fell before its bed ended");
    const { bytes } = await allocatedIn(() => { for (let i = 0; i < steps; i++) step(); });
    if (built.ended || built.state.check.verified !== null) throw new Error("the fall was verified inside the steps read");
    return bytes / steps / 1024;
  } finally { built.dispose(); }
}

/** What the hook keeps, so its array is not taken away unmade. */
let kept = null;
const fixture = process.argv[2];
const kib = fixture === "standing" ? await standing() : fixture === "standing-array" ? await standing(() => { kept = new Array(4096); })
  : fixture === "mind" ? await mind(...process.argv.slice(3)) : fixture === "down" ? await down() : fixture === "fall" ? await fall() : null;
if (kib === null) throw new Error(`no fixture ${fixture}`);
if (fixture === "standing-array" && !kept) throw new Error("the hook never ran");
process.stdout.write(String(kib));
