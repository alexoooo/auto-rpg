/**
 * **A stub motor control**: the whole-body solve, its steps counted. Its state names it, so a test
 * can read that the motor a config names is the one the body and its sub-minds were made with.
 */
import { motorControl } from "../../../src/core/control/motor.ts";
import { anyBody } from "../../../src/core/parts/parts.ts";

/** The whole-body solve as made by `motorControl`, its `control` counted in its state, everything else the solve's. */
function counted(...made) {
  const motor = motorControl(...made), state = { stub: "stub-motor", steps: 0, solve: motor.state };
  return Object.create(motor, {
    state: { value: state, enumerable: true },
    control: { value: (driver, dt) => { state.steps++; motor.control(driver, dt); }, enumerable: true },
  });
}

export const STUB_MOTOR = Object.freeze({
  role: "motor", label: "Counted solve (stub)", stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind: "stub-motor" }), keys: Object.freeze({ kind: true }),
  fits: anyBody, faults: () => [],
  make: () => counted,
});
