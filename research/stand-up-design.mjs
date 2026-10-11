import { modelSpec } from '../src/core/models.ts';
import { withSoles } from '../src/core/human/sole.ts';

/** Explicit exploratory bounds, using the existing physique rules and sourced shoe material. */
export const RECOVERY_DESIGN_BOUNDS = Object.freeze({ strength: Object.freeze([1, 3]), speed: Object.freeze([1, 2]), weight: Object.freeze([.6, 1]) });

/** A separate physical body; no global specification or numerical solver setting is changed. */
export function recoveryDesign({ model = 'workshop-fighter', contact = 'baseline', strength = 1, speed = 1, weight = 1 } = {}) {
  if (!['baseline', 'shoe'].includes(contact)) throw new Error('unknown recovery contact candidate');
  const attributes = { strength, speed, weight }, physique = {};
  for (const [name, value] of Object.entries(attributes)) {
    const [lo, hi] = RECOVERY_DESIGN_BOUNDS[name];
    if (!Number.isFinite(value) || value < lo || value > hi) throw new Error(`recovery ${name} outside declared design bounds`);
    if (value !== 1) physique[name] = value;
  }
  const spec = modelSpec(model, Object.keys(physique).length ? physique : undefined);
  return contact === 'shoe' ? withSoles(spec) : spec;
}

/** Before/after envelopes to accompany each explicitly altered muscle/body candidate. */
export function recoveryDesignTable(configuration) {
  const before = recoveryDesign({ model: configuration.model }), after = recoveryDesign(configuration);
  const channels = spec => spec.joints.flatMap(j => j.dofs.map(d => ({ name: `${j.name} ${d.positive}`,
    positive: d.muscle.peakPositive.value, negative: d.muscle.peakNegative.value,
    positiveSpeed: d.muscle.speedPositive.unloadedSpeed.value, negativeSpeed: d.muscle.speedNegative.unloadedSpeed.value })));
  return { configuration, bounds: RECOVERY_DESIGN_BOUNDS, before: { mass: before.mass.value, channels: channels(before) },
    after: { mass: after.mass.value, channels: channels(after) } };
}
