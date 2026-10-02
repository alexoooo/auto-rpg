/**
 * What a strike search's candidate stands for with the wooden club in the hand: a chambered blow
 * by a core human, thrown as `core-strike.mjs`'s are and decoded by the same rule (`decodeBy`).
 * The wrist is pushed here, all three of its freedoms: a club is swung with it.
 * `research/core-blow.mjs` throws it and scores it.
 */

/** The freedoms a club blow with `hand` may push, and those its chamber poses. */
const clubPushed = (hand) => [
  "thoracic rotation right", "lumbar rotation right", "thoracic flexion", "thoracic lateral flexion right", "lumbar flexion",
  `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`,
  `elbow.${hand} flexion`, `wrist.${hand} flexion`, `wrist.${hand} radial deviation`, `wrist.${hand} pronation`,
];
const clubChambered = (hand) => [
  "thoracic rotation right", `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`,
  `elbow.${hand} flexion`, `wrist.${hand} flexion`, `wrist.${hand} radial deviation`, `wrist.${hand} pronation`,
];

/** The search's bounds, each mapped from [-1, 1]; a chamber goal spans its freedom's range. */
const BOUNDS = { chamberSeconds: [0.1, 0.6], from: [0, 0.3], length: [0, 0.3], distance: [0.4, 1.4] };

/** A club blow's row (`decodeBy`, `research/core-strike.mjs`). */
export const CLUB_BLOW = { pushed: clubPushed, chambered: clubChambered, bounds: BOUNDS, name: (hand) => `searched ${hand} club blow` };
