/**
 * **A stub balance**: the stance, its commands counted. Its state names it, so a test can read that
 * the balance a motor's config names is the one the motor stands the body with.
 */
import { stanceControl } from "../../../src/core/control/stance.ts";
import { fitsSoles } from "../../../src/core/control/stance-balance.ts";

/** The stance as `stanceControl` makes it, each `command` counted in its state, everything else the stance's. */
function counted(...made) {
  const stance = stanceControl(...made), state = { stub: "swap:stub-balance", steps: 0, stance: stance.state };
  return {
    state, read: (feet) => stance.read(feet), ask: (driver) => stance.ask(driver), launch: (driver) => stance.launch(driver), reset: () => stance.reset(),
    command: (driver, goal, dt) => { state.steps++; stance.command(driver, goal, dt); },
    get owned() { return stance.owned; }, get reading() { return stance.reading; },
  };
}

export const STUB_BALANCE = Object.freeze({
  role: "balance", label: "Counted stance (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "swap:stub-balance" }), keys: Object.freeze({ kind: true }),
  fits: fitsSoles, faults: () => [],
  make: () => counted,
});
