/**
 * **The quadruped's stubs**: its paw motor, its trot and its bite, each the stock part under a kind
 * of its own, its state tagged with that kind and its steps counted, so a test can read that each
 * part a quadruped's config names is the one its mind runs; and the strike that throws the stub
 * bite (`STUB_BITE`), with the jaw.
 */
import { JAW_BITE } from "../../../src/core/reptile/bite.ts";
import { PAW_MOTOR } from "../../../src/core/reptile/paw-motor.ts";
import { TROT_PART } from "../../../src/core/reptile/trot.ts";
import { BITE_OPTION, strikeKind } from "../../../src/core/option/kinds.ts";

/** `state` tagged as `kind`'s, its steps from none. */
const tagged = (state, kind) => Object.assign(state, { stub: kind, steps: 0 });

/** The stock `part` under `kind`, fitting and striking as the stock part's defaults do, made by `make`. */
const stub = (part, kind, make) => Object.freeze({
  ...part, label: `${part.label} (stub)`, stage: "experimental", fields: [], slots: [], tuning: undefined,
  defaults: Object.freeze({ kind }), keys: Object.freeze({ kind: true }), faults: () => [],
  fits: (spec, _config, parts) => part.fits(spec, part.defaults, parts),
  ...part.strikesWith ? { strikesWith: (spec, _config, effector) => part.strikesWith(spec, part.defaults, effector) } : {},
  make,
});

/** `made` with its method `name` counted in its state, tagged as `kind`'s. */
const counted = (made, kind, name) => {
  const state = tagged(made.state, kind);
  return Object.create(made, { [name]: { value: (...asked) => { state.steps++; return made[name](...asked); }, enumerable: true } });
};

export const STUB_PAW_MOTOR = stub(PAW_MOTOR, "swap:stub-paw-motor", () => (...built) => counted(PAW_MOTOR.make(PAW_MOTOR.defaults)(...built), "swap:stub-paw-motor", "read"));

export const STUB_TROT = stub(TROT_PART, "swap:stub-trot", (built, root, paws, names) => counted(TROT_PART.make(built, root, paws, names, TROT_PART.defaults), "swap:stub-trot", "command"));

export const STUB_JAW = stub(JAW_BITE, "swap:stub-jaw", (making, _config, actions) => counted(JAW_BITE.make(making, JAW_BITE.defaults, actions), "swap:stub-jaw", "update"));

/** The strike by the stub bite (`strikeKind`), with the jaw, as the stock bite strikes: a kind of the swap entrant's own. */
const BITTEN = strikeKind("swap:stub-jaw", "Stub bite", "jaw");
export const STUB_BITE = Object.freeze({ ...BITTEN, stage: "experimental",
  defaults: Object.freeze({ ...BITE_OPTION.defaults, kind: "swap:strike-stub-jaw", skill: STUB_JAW.defaults, regions: [{ kind: "mark", mark: "any" }], aim: { kind: "first-exposed" } }) });
