/**
 * What a strike search's candidate stands for with an empty hand: a straight, or a chambered blow,
 * by a core human (`src/core/`). The body stands on its own feet on the core stand and throws the
 * blow from there (`throwBlow` in `src/lab/blow.ts`): it stands in the lab's guard, holds a
 * chamber pose, then pushes a chosen set of freedoms, each from a chosen moment for a chosen time
 * at a chosen activation; every other freedom is servoed to the guard, and the legs are the
 * stance's. Every torque is its muscles'. `research/core-blow.mjs` throws it and scores it.
 *
 * **The wrist is not pushed; it is servoed to the guard like every freedom not pushed.** A punch
 * lands on a fist held in line with the forearm; a search free to push the wrist finds a flick of
 * the hand instead.
 *
 * **One blow is chaotic; a search scores several.** Scaling every push's activation by 0.9999
 * moves a strike's peak fist speed by percents, mostly through the arm meeting its own body, and
 * one physics rate does not reproduce another's single blow, though 120 Hz is not biased. A search
 * that takes the best single run of thousands takes the luckiest. `perturbed` gives a strike the
 * variation a mind cannot remove, and the search scores a candidate by its mean over several.
 */

/** The freedoms a straight with `hand` may push, and those its chamber poses. */
export const pushed = (hand) => [
  "thoracic rotation right", "lumbar rotation right", "thoracic flexion", "thoracic lateral flexion right",
  `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`,
  `elbow.${hand} flexion`,
];
export const chambered = (hand) => [
  "thoracic rotation right", `shoulder.${hand} flexion`, `shoulder.${hand} abduction`,
  `shoulder.${hand} internal rotation`, `elbow.${hand} flexion`,
];

/**
 * The search's bounds, each mapped from [-1, 1]. A chamber goal spans its freedom's range; a push's
 * level is its sense and activation together (under `OFF`, no push).
 */
export const BOUNDS = { chamberSeconds: [0.1, 0.6], from: [0, 0.3], length: [0, 0.3], distance: [0.3, 1] };
export const OFF = 0.1;

const map = (u, [lo, hi]) => lo + (Math.max(-1, Math.min(1, u)) + 1) / 2 * (hi - lo);
const unmap = (x, [lo, hi]) => Math.max(-1, Math.min(1, 2 * (x - lo) / (hi - lo) - 1));
const rangesOf = (spec) => new Map(spec.joints.flatMap((j) => j.dofs.map((d) => [`${j.name} ${d.positive}`, [d.min.value, d.max.value]])));

/**
 * The strike and the target's distance ahead that `unit` (numbers in [-1, 1]) stands for on
 * `spec`, by a loadout's `row`: the freedoms it may push and those its chamber poses, each for
 * `hand`, its `bounds` and its strike's `name`. With `guard` the strike has no chamber: it is
 * thrown from the lab's guard, as a straight is.
 */
export function decodeBy(row, unit, spec, hand = "right", guard = false) {
  const ranges = rangesOf(spec), { bounds } = row;
  let k = 0;
  const seconds = guard ? 0 : map(unit[k++], bounds.chamberSeconds);
  const pose = guard ? {} : Object.fromEntries(row.chambered(hand).map((name) => [name, map(unit[k++], ranges.get(name))]));
  const pushes = [];
  for (const channel of row.pushed(hand)) {
    const level = Math.max(-1, Math.min(1, unit[k++])), from = map(unit[k++], bounds.from), length = map(unit[k++], bounds.length);
    if (Math.abs(level) >= OFF && length > 0) pushes.push({ channel, sense: level > 0 ? 1 : -1, from, to: from + length, level: Math.abs(level) });
  }
  const distance = map(unit[k++], bounds.distance);
  const name = row.name(hand, guard);
  return { strike: guard ? { name, hand, pushes } : { name, hand, chamber: { seconds, pose }, pushes }, distance };
}

/** How many numbers a candidate of `row` takes: with a chamber, or (`guard`) thrown from the guard itself. */
export const dimensionsBy = (row, hand, guard = false) => (guard ? 0 : 1 + row.chambered(hand).length) + 3 * row.pushed(hand).length + 1;

/**
 * The numbers in [-1, 1] that stand for `strike` with its target `distance` ahead, on `spec`, by
 * `row`: what `decodeBy` reads back, to rounding, each number held to its bounds. A freedom the
 * strike does not push is given no level, and the middle of its bounds; a strike that pushes a
 * freedom the row has not, or poses one, is refused.
 */
export function encodeBy(row, strike, distance, spec) {
  const ranges = rangesOf(spec), { bounds } = row, { hand } = strike, guard = !strike.chamber, unit = [];
  const known = (names, given, what) => {
    for (const name of given) if (!names.includes(name)) throw new Error(`${strike.name} ${what} ${name}, which a search of ${row.name(hand, guard)} does not`);
  };
  if (!guard) {
    const names = row.chambered(hand);
    known(names, Object.keys(strike.chamber.pose), "poses");
    unit.push(unmap(strike.chamber.seconds, bounds.chamberSeconds));
    for (const name of names) {
      if (!(name in strike.chamber.pose)) throw new Error(`${strike.name}'s chamber does not pose ${name}`);
      unit.push(unmap(strike.chamber.pose[name], ranges.get(name)));
    }
  }
  const channels = row.pushed(hand);
  known(channels, strike.pushes.map((p) => p.channel), "pushes");
  for (const channel of channels) {
    const pushes = strike.pushes.filter((p) => p.channel === channel);
    if (pushes.length > 1) throw new Error(`${strike.name} pushes ${channel} twice`);
    const [p] = pushes;
    if (p) unit.push(p.sense * (p.level ?? 1), unmap(p.from, bounds.from), unmap(p.to - p.from, bounds.length));
    else unit.push(0, 0, 0);
  }
  unit.push(unmap(distance, bounds.distance));
  return unit;
}

/** A straight's row (`decodeBy`). */
export const STRAIGHT = { pushed, chambered, bounds: BOUNDS, name: (hand, guard) => guard ? `searched ${hand} straight` : `searched ${hand} blow` };

/**
 * `strike` with every push `shift` s later (none before the chamber's end) and its activation
 * times `scale` (at most 1): what a mind cannot hold exactly from one blow to the next.
 */
export function perturbed(strike, { shift = 0, scale = 1 }) {
  return { ...strike, pushes: strike.pushes.map((p) => ({ ...p, from: Math.max(0, p.from + shift), to: Math.max(0, p.to + shift),
    level: Math.min(1, (p.level ?? 1) * scale) })) };
}
