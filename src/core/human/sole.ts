import type { BodySpec } from "../spec/body.ts";
import { derive, si, sourced, type Quantity } from "../spec/quantity.ts";

/** A shoe's midsole under test (`hoogkamer-2018`, the conventional racing shoe): the peak force, how far it gave, the load's time and the energy it returned. */
const TEST = Object.freeze({
  force: sourced(2000, "N", "hoogkamer-2018", "force-constrained midsole test, peak force"),
  deformation: si(sourced(6.1, "mm", "hoogkamer-2018", "Nike Zoom Streak 6, midsole deformation")),
  seconds: sourced(0.185, "s", "hoogkamer-2018", "force-constrained midsole test, contact time"),
  returned: si(sourced(65.5, "%", "hoogkamer-2018", "Nike Zoom Streak 6, energy return")),
});

/**
 * **A shoe's sole**, as a layer against the floor (`SurfaceSpec.sole`):
 * - its spring, the test's peak force over how far the sole gave, at the peak, where it is still;
 * - its dashpot, that of a spring and dashpot side by side loaded and unloaded on a half sine over
 *   the test's time: the energy it loses is c X^2 pi^2 / (2 T), and the share it returns
 *   (k X^2 / 2 - loss / 2) / (k X^2 / 2 + loss / 2), so c = 2 k T (1 - r) / (pi^2 (1 + r));
 * - the deepest it gives, how far it gave under the test's force.
 */
const SHOE_SOLE: { readonly stiffness: Quantity<number>; readonly damping: Quantity<number>; readonly depth: Quantity<number> } = (() => {
  const stiffness = derive("N/m", "peak force over the deformation at it", [TEST.force, TEST.deformation], (f, x) => f / x);
  const damping = derive("N s/m", "a spring and dashpot on a half-sine load returning the test's share",
    [stiffness, TEST.seconds, TEST.returned], (k, t, r) => 2 * k * t * (1 - r) / (Math.PI * Math.PI * (1 + r)));
  return Object.freeze({ stiffness, damping, depth: TEST.deformation });
})();

/** `spec` shod: each foot's surface gives as a shoe's sole against the floor (`SHOE_SOLE`). */
export function withSoles(spec: BodySpec): BodySpec {
  return { ...spec, segments: spec.segments.map((segment) => segment.name.startsWith("foot.")
    ? { ...segment, surface: { ...segment.surface, sole: SHOE_SOLE } } : segment) };
}
