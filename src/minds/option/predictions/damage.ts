import { heldAt, type BodySpec, segmentOf } from "../../../core/bodies/spec/body.ts";
import { impactEnergy } from "../../../combat/impact.ts";
import { lifeFactor } from "../../../combat/pool.ts";
import { sideDamage, type Rulebook } from "../../../combat/rulebook.ts";
import { secondShare } from "../../../combat/share.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import { distance } from "../../../core/bodies/spec/vec.ts";
import { rigidPoints } from "../../../core/bodies/build/rigid.ts";
import { effectorAim } from "../../../control/effectors.ts";

/** Each spec's striking masses by limb, found once: a spec is immutable. */
const limbs = new WeakMap<BodySpec, Map<string, number>>();

/**
 * The mass `limb` of `spec` (an effector's segment, `hand.left`, `foot.right`) strikes with, kg:
 * its chain's segments, from its effector's base out, and what they hold; 0 for no effector.
 */
function strikingMass(spec: BodySpec, limb: string): number {
  let masses = limbs.get(spec);
  if (!masses) limbs.set(spec, masses = new Map());
  const known = masses.get(limb);
  if (known !== undefined) return known;
  const effector = spec.effectors?.find((e) => e.segment === limb);
  let total = 0;
  if (effector) for (let at: string | undefined = effector.segment; at !== undefined && at !== effector.base; at = spec.joints.find((joint) => joint.child === at)?.parent) {
    const name = at;
    total += segmentOf(spec, name)?.mass.value ?? 0;
    for (const item of spec.held ?? []) if (item.segment === name) total += item.item.mass.value;
  }
  masses.set(limb, total);
  return total;
}

/** Each spec's reach by limb, found once: a spec is immutable. */
const REACHES = new WeakMap<BodySpec, Map<string, number>>();

/**
 * **How far `limb` of `spec` reaches**, m across the ground ahead of its centre of mass, as its spec
 * builds it: the joint its effector's chain leaves its base by (`EffectorSpec.base`), and the chain
 * from there out to the point it strikes with (`effectorAim`: what it holds, else its own) laid
 * straight ahead; 0 for a limb that is no effector.
 */
export function limbReach(spec: BodySpec, limb: string): number {
  let reaches = REACHES.get(spec);
  if (!reaches) REACHES.set(spec, reaches = new Map());
  const known = reaches.get(limb);
  if (known !== undefined) return known;
  const effector = spec.effectors?.find((e) => e.segment === limb), segment = segmentOf(spec, limb);
  let reach = 0;
  if (effector && segment) {
    const joints: Vec3[] = [];
    for (let at = effector.segment; at !== effector.base;) {
      const joint = spec.joints.find((one) => one.child === at);
      if (!joint) break;
      joints.unshift(joint.centre.value);
      at = joint.parent;
    }
    const point = rigidPoints(spec, segment).get(effectorAim(spec, limb))?.value;
    if (point && joints.length) {
      let length = distance(joints[joints.length - 1]!, point), mass = 0, ahead = 0;
      for (let i = 1; i < joints.length; i++) length += distance(joints[i - 1]!, joints[i]!);
      for (const one of spec.segments) { mass += one.mass.value; ahead += one.mass.value * one.centreOfMass.value[2]; }
      reach = Math.max(0, joints[0]![2] - ahead / mass + length);
    }
  }
  reaches.set(limb, reach);
  return reach;
}

/** The mass of `spec`'s segment `at`, kg; the body's with no such segment. */
const segmentMass = (spec: BodySpec, at: string): number => segmentOf(spec, at)?.mass.value ?? spec.mass.value;

/** The energy of a blow of `limb` of `striker` on `struck`'s segment `at`, J: as the rules price an impact (`impactEnergy`), closing at `closing` m/s. */
function blowEnergy(striker: BodySpec, limb: string, struck: BodySpec, at: string, closing: number): number {
  const mass = strikingMass(striker, limb);
  return mass > 0 ? impactEnergy(mass, segmentMass(struck, at), closing) : 0;
}

/** How stiff the face `limb` of `spec` strikes with is, N/m: the limb's own, or null for an item it holds, which is rigid. */
function strikingStiffness(spec: BodySpec, limb: string): number | null {
  return heldAt(spec, limb) ? null : segmentOf(spec, limb)?.surface.stiffness.value ?? null;
}

/**
 * **The life a blow of `limb` of `striker` takes from `struck`'s segment `at`** (`limb` an
 * effector's segment, `hand.left` or `foot.right`; `at` its head, its `marks.high`, unless named),
 * by `rules`: its energy closing at `closing` m/s into that segment (`blowEnergy`), the segment's
 * share of it by the two faces' stiffness (`energyShares`, `secondShare`), priced blunt as the rules price a
 * side's damage (`sideDamage`) at the segment's cost in life (`lifeFactor`), over the struck body's
 * full life. An edge or a point is priced as its blunt impact, the limb's own model. A search asks
 * it at every state a strike is priced by hand, so it takes its arguments by place.
 */
export function blowLife(rules: Rulebook, striker: BodySpec, limb: string, struck: BodySpec, closing: number, at = struck.marks.high): number {
  const face = segmentOf(struck, at)?.surface?.stiffness.value ?? null;
  const share = secondShare(strikingStiffness(striker, limb), face);
  return sideDamage(rules, "blunt", blowEnergy(striker, limb, struck, at, closing), share, 0) * lifeFactor(rules, struck, at) / struck.wounds.hp.value;
}
