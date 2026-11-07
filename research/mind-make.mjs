import { rulebook } from "../src/combat/rulebook.ts";
/**
 * What making a body's Crypt mind costs (`createMind`, `defaultMind`), warm: each model's body built
 * `--makes` times beside the last on a stand, and its mind made on it, timed alone. The first make
 * reads its data and compiles; the median and the least of the rest are the warm make.
 *
 *   node research/mind-make.mjs [--makes 60]
 *
 * Node, core world, Rapier, 120 Hz. Pin it to the performance cores to read it against a record.
 */
import "../tests/harness/preload-data.mjs";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { GAME, defaultMind } from "../src/app/catalog.ts";
import { createMind } from "../src/minds/seat/create-mind.ts";
import { STAND_ORDERS } from "../src/minds/orders.ts";
import { modelHolding } from "../src/core/bodies/models.ts";
import { buildBody } from "../src/core/bodies/build/build-body.ts";

const { values } = parseArgs({ options: { makes: { type: "string", default: "60" } } });
const makes = Number(values.makes), WARM = 3;
/** Each model the Crypt makes a mind for, and what it holds there. */
const BODIES = [["workshop-fighter", { left: "empty", right: "club" }], ["crypt-skeleton", { left: "empty", right: "empty" }]];

for (const [model, loadout] of BODIES) {
  const spec = modelHolding(model, loadout), config = defaultMind(model), stand = await coreStand(spec, { engine: "rapier" });
  try {
    const times = [];
    for (let i = 0; i < makes; i++) {
      const built = buildBody(spec, stand.world, { position: [3 * (i + 1), 0, 0] });
      const start = performance.now();
      createMind(GAME, built, stand.world, config, { rules: rulebook("arena"), name: `${model} ${i}`, orders: () => STAND_ORDERS });
      times.push(performance.now() - start);
    }
    const warm = times.slice(WARM).sort((a, b) => a - b);
    console.log(`${model}: the first make ${times[0].toFixed(1)} ms; warm, the median ${warm[warm.length >> 1].toFixed(2)}, the least ${warm[0].toFixed(2)}`);
  } finally { stand.dispose(); }
}
