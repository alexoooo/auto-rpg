/**
 * **One reading of what a body's step allocates**, KiB, printed: `stepAllocation`
 * (`tests/harness/garbage.mjs`) runs it in a process of its own. Node, the core world, Rapier,
 * 120 Hz.
 *
 *   node tests/harness/step-allocation.mjs standing|standing-array|bout
 *
 * - `standing`: two skeletons standing (`standBodies`), 240 steps read from 3 s.
 * - `standing-array`: the same, with one `new Array(4096)` made first in every step.
 * - `bout`: the Warrior against the Rogue with clubs, 480 steps read from 2 s.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { buildBout } from "../../research/bout.mjs";
import { allocatedIn, standBodies } from "./garbage.mjs";

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

async function bout() {
  const steps = 480, { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-rogue" });
  try {
    world.step(2 * world.hz);
    const { bytes } = await allocatedIn(() => world.step(steps));
    if (duel.verdict) throw new Error("the bout ended inside the steps read");
    return bytes / steps / 2 / 1024;
  } finally { dispose(); }
}

/** What the hook keeps, so its array is not taken away unmade. */
let kept = null;
const fixture = process.argv[2];
const kib = fixture === "standing" ? await standing() : fixture === "standing-array" ? await standing(() => { kept = new Array(4096); })
  : fixture === "bout" ? await bout() : null;
if (kib === null) throw new Error(`no fixture ${fixture}`);
if (fixture === "standing-array" && !kept) throw new Error("the hook never ran");
process.stdout.write(String(kib));
