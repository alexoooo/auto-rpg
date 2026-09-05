import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";

import { golemSurfaceSeed, type GolemSurfaceBinding } from "./procedural-surface.ts";

/**
 * What a worn module looks like: the salvaged damage-wear plugin, driven by remaining durability.
 *
 * **Presentation reads authority and never feeds it.** A binding is a plain record hanging off a
 * shell mesh's `metadata`, `GolemProceduralSurfacePlugin.bindForSubMesh` copies its `healthRatio`
 * into a uniform, and nothing in the game ever reads it back. So a fitted second-hand blade looks
 * second-hand and no rule anywhere is decided by how cracked something is drawn -- which is the
 * house rule "cosmetics never carry authority" pointed at the one cosmetic this session adds.
 *
 * `PROCEDURAL_DAMAGE_WEAR_V1` is the block that owns what "worn" means: cracks begin to darken
 * below a health ratio of 0.75 and reach their maximum at 0.10, the fresh-edge lightening comes up
 * with them and the normal gets stronger. Those numbers were salvaged from the construct tree with
 * the shader and are unchanged; what was missing was **anything at all that wrote the ratio**, so
 * the field had a reader and no writer until now.
 *
 * ## Reading the mesh
 *
 * `getBoundingInfo()` and not `computeWorldMatrix(true)`: it updates from `worldMatrixFromCache`
 * and stamps no render id, so seeding a binding at build time cannot silently convert a later
 * reader in the same frame into a reader of this sample -- the defect that has cost three sessions
 * here. The extents it takes are the mesh's own local half-size doubled, which is what the shader's
 * rune relief divides by; every module shell asks for `relief: "none"`, so the number is honest
 * rather than load-bearing.
 */

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** One part's shells, tied to the part whose health drives them. */
export interface GolemWearTie {
  /** Live: read every substep, so a module cracks as it is hacked at rather than only at a fit. */
  readonly of: { readonly health: number; readonly maxHealth: number; readonly severed: boolean };
  readonly bindings: readonly GolemSurfaceBinding[];
}

/**
 * Give one part's shell meshes a wear binding at the durability the module was fitted at.
 *
 * The seed is FNV-1a over authored semantic names alone -- the part id and the mesh's own name --
 * so two golems of the same build wear the same way and neither build order nor side nor health
 * enters it. That is `golemSurfaceSeed`'s own contract and this is the first caller to hold it.
 */
export function seedGolemWear(
  slot: string,
  partId: string,
  shell: readonly AbstractMesh[],
  durability: number,
): readonly GolemSurfaceBinding[] {
  const ratio = clamp01(durability);
  const bindings: GolemSurfaceBinding[] = [];
  for (const mesh of shell) {
    const box = mesh.getBoundingInfo().boundingBox;
    const binding: GolemSurfaceBinding = {
      targetKind: slot,
      targetId: partId,
      primitiveId: mesh.name,
      seed: golemSurfaceSeed(partId, mesh.name),
      extentsM: Object.freeze([
        Math.max(0.001, box.extendSize.x * 2),
        Math.max(0.001, box.extendSize.y * 2),
        Math.max(0.001, box.extendSize.z * 2),
      ]) as readonly [number, number, number],
      // No module shell asks for the core's rune face. A relief drawn on an arm would be a
      // decoration this session invented while claiming to be about durability.
      relief: "none",
      healthRatio: ratio,
    };
    // Merged rather than assigned: `applyGolemSurface` already writes a recipe and a faction onto
    // some shells, and replacing the record would drop them.
    mesh.metadata = { ...(mesh.metadata ?? {}), golemSurfaceBinding: binding };
    bindings.push(binding);
  }
  return Object.freeze(bindings);
}

/**
 * Push every tied part's live health ratio into its own bindings.
 *
 * Called once per substep from the assembly's own close-out rather than from `describe`, which runs
 * twice per substep per body -- once for the golem's own view and once for whatever is looking at
 * it. A severed part reads zero whatever its health says, which is what `BodyView.health` already
 * publishes for the same limb: a limb on the floor is fully spent however it got there.
 */
export function refreshGolemWear(ties: readonly GolemWearTie[]): void {
  for (const tie of ties) {
    const ratio = tie.of.severed || !(tie.of.maxHealth > 0)
      ? 0
      : clamp01(tie.of.health / tie.of.maxHealth);
    for (const binding of tie.bindings) binding.healthRatio = ratio;
  }
}
