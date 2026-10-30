import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBody } from "../core/build/build-body.ts";
import type { Fighter } from "../core/rules/blows.ts";
import { createPool } from "../core/rules/pool.ts";
import type { Rulebook } from "../core/rules/rulebook.ts";
import type { BodySpec, ShapeSpec } from "../core/spec/body.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import type { World } from "../core/world.ts";
export { dummySpec } from "./dummy-spec.ts";

/**
 * **The lab's targets**: bodies hung in the air and struck under the rule a fight wounds by
 * (`watchBlows`, `src/core/rules/blows.ts`): a ball of a part of a body, its head unless another
 * is named (`dummySpec`), held up against its own weight and nothing else (`hangDummy`).
 */

/** A dummy's one segment's name and its ball, from its spec. */
export function ballOf(spec: BodySpec): { readonly part: string; readonly ball: Extract<ShapeSpec, { readonly kind: "sphere" }> } {
  const segment = spec.segments[0];
  if (spec.segments.length !== 1 || segment?.shape.kind !== "sphere") throw new Error(`${spec.model} is no dummy`);
  return { part: segment.name, ball: segment.shape };
}

/** A hung dummy. */
export interface Dummy {
  /** What a blow watch takes, on a side of its own. */
  readonly fighter: Fighter;
  /** The ball's centre, world: its node's own place, as the last step left it. */
  readonly centre: Vector3;
  readonly radius: number;
  dispose(): void;
}

/**
 * Hang a dummy at `at` in `world`: held up by a force equal to its weight through each step and
 * nothing else, so it stays where it hangs and gives way to a blow as a head on no neck does.
 * A force lasts one step, and a hook added while the world steps first runs in the next: the step
 * the dummy is hung in or before has its force from here, and the hook leaves that step alone.
 * `fighter` is what a blow watch takes (`Fighter`), on a side of its own.
 */
export function hangDummy(world: World, spec: BodySpec, at: Vec3, rules: Rulebook): Dummy {
  const { part, ball } = ballOf(spec), radius = ball.radius.value, built = buildBody(spec, world, { position: at });
  const { body, node, rigid } = built.segments.get(part)!, g = world.physics.gravity;
  const weight = new Vector3(-g[0] * rigid.mass, -g[1] * rigid.mass, -g[2] * rigid.mass);
  const hold = (): void => body.applyForce(weight, node.position), hung = world.steps;
  hold();
  const held = world.beforeStep(() => {
    if (world.steps !== hung) hold();
  });
  return {
    fighter: { id: "dummy", side: "dummy", built, pool: createPool(spec, rules) },
    centre: node.position, radius,
    dispose() {
      held.dispose();
      built.dispose();
    },
  };
}
