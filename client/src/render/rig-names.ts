// The representative combatant semantic node names, as pure data with no
// Babylon in it.
//
// `docs/reference/combatant-asset-contract.md` and the generated
// `web/assets3d/combatants.json` sidecar own the durable closure;
// `combatant-asset-contract.ts` refuses a sidecar that disagrees with this
// runtime mirror. `#/arena`'s geometry proxy and `#/game`'s procedural fallback
// hang their meshes off the same nodes as the authored Fighter and Brute. The
// lists live apart from the Babylon hierarchy builder (`rig-nodes.ts`) because
// `arena/geometry.ts` re-exports them and that file's contract is "no Babylon
// in it" -- a name list must not drag a scene graph into arithmetic modules.
//
// The three order-sensitive facts, written down because a list of strings
// hides them: `RIG_REGIONS` is in `regionNames` order, so `RIG_REGIONS[i]` is
// the node for `pose.regions[i]`; `arm_left`/`hand_left` are limb 0 and
// `arm_right`/`hand_right` limb 1, which is `LimbSlot`'s own order; and
// `RIG_NODES` concatenates the four lists in the sidecar's `semanticNames`
// order, which the runtime/asset contract test checks directly against the
// pinned sidecar bytes.

export const RIG_BONES = Object.freeze([
  "root", "pelvis", "torso", "head", "arm_left", "hand_left", "arm_right", "hand_right",
] as const);

export const RIG_SOCKETS = Object.freeze([
  "socket_weapon_left", "socket_weapon_right", "socket_shield",
] as const);

/** In `regionNames` order: head, torso, leftArm, rightArm, legs. */
export const RIG_REGIONS = Object.freeze([
  "region_head", "region_torso", "region_left_arm", "region_right_arm", "region_legs",
] as const);

/**
 * The four cosmetic clip slots the shipped consumers can select.
 *
 * `idle` and `walk` are chosen from published movement. `stagger` and `fall`
 * begin only from published combat events; animation sampling never invents a
 * reaction or feeds presentation state back into the simulation.
 */
export const RIG_CLIPS = Object.freeze(["idle", "walk", "stagger", "fall"] as const);

export type RigClip = (typeof RIG_CLIPS)[number];

/** Every node name, in the pinned sidecar's semantic closure order. */
export const RIG_NODES: readonly string[] = Object.freeze([
  ...RIG_BONES, ...RIG_SOCKETS, ...RIG_REGIONS, ...RIG_CLIPS,
]);
