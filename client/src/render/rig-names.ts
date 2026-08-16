// The v2-18 semantic node names, as pure data with no Babylon in it.
//
// `docs/plans/v2-18-combatant-integration.md` owns the list; `#/arena`'s proxy
// and `#/game`'s procedural figure both hang their meshes off nodes with
// exactly these names, so landing an authored rig is swapping what hangs under
// each node rather than rewriting a presentation layer. The lists live apart
// from the Babylon hierarchy builder (`rig-nodes.ts`) because
// `arena/geometry.ts` re-exports them and that file's contract is "no Babylon
// in it" -- a name list must not drag a scene graph into arithmetic modules.
//
// The three order-sensitive facts, written down because a list of strings
// hides them: `RIG_REGIONS` is in `regionNames` order, so `RIG_REGIONS[i]` is
// the node for `pose.regions[i]`; `arm_left`/`hand_left` are limb 0 and
// `arm_right`/`hand_right` limb 1, which is `LimbSlot`'s own order; and
// `RIG_NODES` concatenates the four lists in the order v2-18's own block lists
// them, which is what the contract test compares.

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
 * The four clip slots, of which the shipped consumers can honestly select two.
 *
 * `idle` and `walk` are chosen from published body speed. **`stagger` and
 * `fall` are left empty and are never selected**, because v2-18's rule is that
 * reactions begin only from events and no session has wired an event into
 * either consumer; the slots exist so that the session which starts a reaction
 * from an event finds the node already named, already parented and already
 * checked.
 */
export const RIG_CLIPS = Object.freeze(["idle", "walk", "stagger", "fall"] as const);

export type RigClip = (typeof RIG_CLIPS)[number];

/** Every node name, in the order v2-18 lists them. */
export const RIG_NODES: readonly string[] = Object.freeze([
  ...RIG_BONES, ...RIG_SOCKETS, ...RIG_REGIONS, ...RIG_CLIPS,
]);
