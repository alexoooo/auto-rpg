import { modelSpec } from "../src/core/models.ts";
import { randomStream } from "../src/core/math/random.ts";
import { deepFreeze } from "../src/core/state.ts";

/** A fixed, nonzero actor over the bare mind's channel and body inputs (`bareLayout`). */
export function seededBareRecipe(model = "workshop-fighter") {
  const channels = modelSpec(model).joints.reduce((count, joint) => count + joint.dofs.length, 0);
  const inputs = channels * 2 + 21, random = randomStream(0xba7e);
  const network = { actions: channels, layers: [{
    weights: Array.from({ length: channels }, () => Array.from({ length: inputs }, () => (random.next() * 2 - 1) * 0.01)),
    bias: Array.from({ length: channels }, () => (random.next() * 2 - 1) * 0.4),
  }] };
  const mind = deepFreeze({ kind: "bare:mind", network, every: 2 });
  return { left: model, right: model, loadouts: { left: { left: "empty", right: "empty" }, right: { left: "empty", right: "empty" } }, minds: { left: mind, right: mind } };
}
