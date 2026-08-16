// The v2-18 semantic rig, as one buildable hierarchy.
//
// **Extracted, not imported across.** `#/arena`'s proxy and `#/game`'s
// procedural figure both build this chain, and neither may import the other:
// the arena may not import worker- or wasm-shaped modules
// (`studio-shell.test.mjs` enforces the specifier list) and the greybox may
// not import the arena. The name lists themselves are pure data and live in
// `rig-names.ts`, because `arena/geometry.ts` re-exports them under a "no
// Babylon in it" contract; this module is the Babylon half.

import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";

export type RigNodes = Readonly<{
  root: TransformNode;
  nodes: ReadonlyMap<string, TransformNode>;
}>;

/**
 * Build the v2-18 parent chain: `pelvis` under `root` rather than beside it
 * because a rig's root is the placement and the pelvis is the first bone; the
 * arms hang off `torso` because a shoulder rides the chest; `socket_shield`
 * hangs off `root` so a consumer that reads the holder off published rows can
 * re-parent it, and one that nails it to a hand can do that instead. `extras`
 * (the arena's region and clip slots) hang off `root` in the order given.
 *
 * Every node gets an identity `rotationQuaternion`, so consumers orient with
 * quaternions uniformly rather than half through Euler `rotation`.
 */
export function buildRigNodes(scene: Scene, prefix: string, extras: readonly string[] = []): RigNodes {
  const nodes = new Map<string, TransformNode>();
  const make = (name: string, parent: TransformNode | null): TransformNode => {
    const node = new TransformNode(`${prefix}${name}`, scene);
    node.rotationQuaternion = Quaternion.Identity();
    if (parent !== null) node.parent = parent;
    nodes.set(name, node);
    return node;
  };
  const root = make("root", null);
  const pelvis = make("pelvis", root);
  const torso = make("torso", pelvis);
  make("head", torso);
  for (const limb of [0, 1] as const) {
    const arm = make(limb === 0 ? "arm_left" : "arm_right", torso);
    const hand = make(limb === 0 ? "hand_left" : "hand_right", arm);
    make(limb === 0 ? "socket_weapon_left" : "socket_weapon_right", hand);
  }
  make("socket_shield", root);
  for (const extra of extras) make(extra, root);
  return Object.freeze({ root, nodes });
}
