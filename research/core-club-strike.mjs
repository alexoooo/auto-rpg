/**
 * One club blow by a core human, scored by the energy it brings to an opponent's head: the damage
 * unit's reading (stage 5 of `docs/plans/2026-09-28-core-foundation.md`).
 *
 * The human holds the wooden club in one hand (`armed`, `woodenClub`), stands on its own feet on
 * the core stand and throws the blow from there, as `core-strike.mjs`'s straights are thrown
 * (`throwBlow` in `src/core-lab/blow.ts`): it stands in the lab's guard, holds a chamber pose, then
 * pushes a chosen set of freedoms, each from a chosen moment for a chosen time at a chosen
 * activation; every other freedom is servoed to the guard, and the legs are the stance's. The wrist
 * is pushed here, all three of its freedoms: a club is swung with it.
 *
 * The blow is read as it lands by `watchClubBlow` (`src/core-lab/club-blow.ts`), which the lab's
 * Blow scenario reads too: the target, where the club's swell first touches it, the closing speed,
 * the masses the contact meets and the energy. A search's `score` is that energy, or, for a club
 * that never arrives, minus how far its swell passed from the sphere, or, for a body that falls
 * first, `FELL`.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { STAND, throwBlow } from "../src/core-lab/blow.ts";
import { watchClubBlow } from "../src/core-lab/club-blow.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { FELL, perturbed } from "./core-strike.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

export const CORE_CLUB_HARNESS = "Node core stand, standing on its feet as built, ground on; a club blow into a head-sized sphere";

/** Seconds to watch after the chamber. */
const WINDOW = 0.5;

/** The freedoms a club blow with `hand` may push, and those its chamber poses. */
export const clubPushed = (hand) => [
  "thoracic rotation right", "lumbar rotation right", "thoracic flexion", "thoracic lateral flexion right", "lumbar flexion",
  `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`,
  `elbow.${hand} flexion`, `wrist.${hand} flexion`, `wrist.${hand} radial deviation`, `wrist.${hand} pronation`,
];
export const clubChambered = (hand) => [
  "thoracic rotation right", `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`,
  `elbow.${hand} flexion`, `wrist.${hand} flexion`, `wrist.${hand} radial deviation`, `wrist.${hand} pronation`,
];

/** The search's bounds, each mapped from [-1, 1]; a chamber goal spans its freedom's range. */
const BOUNDS = { chamberSeconds: [0.1, 0.6], from: [0, 0.3], length: [0, 0.3], distance: [0.4, 1.4] };
const OFF = 0.1;

export const clubDimensions = (hand) => 1 + clubChambered(hand).length + 3 * clubPushed(hand).length + 1;

const map = (u, [lo, hi]) => lo + (Math.max(-1, Math.min(1, u)) + 1) / 2 * (hi - lo);

/** The blow and the target distance that `unit` (numbers in [-1, 1]) stands for, on `spec`. */
export function decodeClub(unit, spec, hand = "right") {
  const ranges = new Map(spec.joints.flatMap((j) => j.dofs.map((d) => [`${j.name} ${d.positive}`, [d.min.value, d.max.value]])));
  let k = 0;
  const seconds = map(unit[k++], BOUNDS.chamberSeconds);
  const pose = Object.fromEntries(clubChambered(hand).map((name) => [name, map(unit[k++], ranges.get(name))]));
  const pushes = [];
  for (const channel of clubPushed(hand)) {
    const level = Math.max(-1, Math.min(1, unit[k++])), from = map(unit[k++], BOUNDS.from), length = map(unit[k++], BOUNDS.length);
    if (Math.abs(level) >= OFF && length > 0) pushes.push({ channel, sense: level > 0 ? 1 : -1, from, to: from + length, level: Math.abs(level) });
  }
  const distance = map(unit[k++], BOUNDS.distance);
  return { strike: { name: `searched ${hand} club blow`, hand, chamber: { seconds, pose }, pushes }, distance };
}

/**
 * Run a club blow on `model` at `hz`: the one `unit` stands for, or a given `strike` at `distance`.
 * Returns the score, the energy and its parts, when it landed after the chamber, and the swell
 * end's peak speed before it.
 */
export async function evaluateClubStrike({ model = "workshop-fighter", unit, hz = 120, hand = "right", perturbation, groundSize, ...given }) {
  const spec = armed(humanSpec(model), hand, woodenClub());
  const decoded = unit ? decodeClub(unit, spec, hand) : given;
  const strike = perturbation ? perturbed(decoded.strike, perturbation) : decoded.strike, distance = decoded.distance;
  const chamber = strike.chamber ?? { seconds: 0 };
  const stand = await coreStand(spec, { ground: true, groundSize, hz });
  const blow = throwBlow(stand.built, stand.world, strike);
  const watch = watchClubBlow(stand.built, stand.world, blow, distance, hand);
  try {
    for (let i = 0; i < stand.seconds(STAND + chamber.seconds + WINDOW) && !watch.landed && !watch.fell; i++) stand.step(1);
  } finally { watch.dispose(); blow.dispose(); stand.dispose(); }
  const score = watch.fell ? FELL : watch.landed ? watch.landed.energy : -watch.nearest;
  return { score, ...(watch.landed ?? { energy: 0, closing: 0, at: null }), peak: watch.peak, distance, strike, fell: watch.fell };
}
