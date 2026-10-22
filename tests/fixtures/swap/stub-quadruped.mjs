/**
 * **The quadruped's stubs**: its paw motor, trot, jaw and stalk, each the stock part under a kind
 * of its own, its state tagged with that kind and its steps counted, so a test can read that each
 * part a quadruped's config names is the one its mind runs.
 */
import { JAW_PART } from "../../../src/core/reptile/bite.ts";
import { PAW_MOTOR_PART } from "../../../src/core/reptile/paw-motor.ts";
import { STALK_PART } from "../../../src/core/reptile/tactics.ts";
import { TROT_PART } from "../../../src/core/reptile/trot.ts";

/** `state` tagged as `kind`'s, its steps from none. */
const tagged = (state, kind) => Object.assign(state, { stub: kind, steps: 0 });

/** The stock `part` under `kind`: it fits and strikes as the stock part's defaults do, and makes what `wrap` makes of the stock part's make. */
const stub = (part, kind, wrap) => Object.freeze({
  ...part, label: `${part.label} (stub)`, stage: "experimental", fields: [], slots: [],
  defaults: Object.freeze({ kind }), keys: Object.freeze({ kind: true }), faults: () => [],
  fits: (spec, _config, parts) => part.fits(spec, part.defaults, parts),
  ...part.strikes ? { strikes: (spec, _config, parts) => part.strikes(spec, part.defaults, parts) } : {},
  make: (...made) => wrap(part.make(...made.slice(0, -1), part.defaults), kind),
});

export const STUB_PAW_MOTOR = stub(PAW_MOTOR_PART, "stub-paw-motor", (made, kind) => {
  const state = tagged(made.motor.state, kind);
  return { ...made, motor: Object.create(made.motor, { read: { value: () => { state.steps++; made.motor.read(); }, enumerable: true } }) };
});

/** A gait, or a bite, its `command` counted. */
const commanded = (made, kind) => {
  const state = tagged(made.state, kind);
  return Object.create(made, { command: { value: (...asked) => { state.steps++; return made.command(...asked); }, enumerable: true } });
};

export const STUB_TROT = stub(TROT_PART, "stub-trot", commanded);
export const STUB_JAW = stub(JAW_PART, "stub-jaw", commanded);

export const STUB_STALK = stub(STALK_PART, "stub-stalk", (made, kind) => {
  const state = tagged(made.state, kind);
  return Object.create(made, { decide: { value: (...asked) => { state.steps++; return made.decide(...asked); }, enumerable: true } });
});
