import type { BodySpec, LimbSpec, ShapeSpec } from "../core/bodies/spec/body.ts";
import type { BuiltBody } from "../core/bodies/build/build-body.ts";
import { derive, type Quantity, type Vec3 } from "../core/quantity.ts";
import type { Mechanism, Rulebook } from "./rulebook.ts";

/**
 * **A body's life and its limbs** (`owner-life` in `src/core/sources.ts`).
 *
 * - **Life** is the body's hit points (`WoundSpec.hp`). A blow takes from it its damage times the
 *   factor of the struck part's group (`Rulebook.life`): vital, trunk or limb (`woundGroups`).
 * - **A limb's bar** is its share of full life (`LimbSpec.share`). A blow on the limb takes its
 *   whole damage from the bar too; at 0 the limb is crippled, its muscles weaker (`crippleLimb`),
 *   and further blows take only life.
 * - **A cut takes a limb off**: an edge or axe blow worth at least `Rulebook.severBlow` of the
 *   limb's full bar that leaves the bar at 0 takes off the struck segment and every one beyond it.
 *   **A lethal cut beheads**: an edge or axe blow on a vital part not `whole` that spends life
 *   takes it off the same way. Either costs `Rulebook.severLoss` of full life beside the blow. A
 *   point never cuts, nor does a blunt blow; the trunk never comes off.
 * - **The body is out** when a vital part comes off (`beheaded`), a limb whose loss is `out` loses
 *   any of it (`maimed`), or its life is spent (`slain`). The first ending stands.
 *
 * A segment cut off takes no more blows. The bar a page shows is life over full life.
 */

/** How a body's fight ended by its wounds: life spent (`slain`), a vital part off (`beheaded`), a limb that ends the fight off (`maimed`). */
type Ending = "slain" | "beheaded" | "maimed";

/** A segment's group: vital (and whether it never comes off), a limb, or the trunk. */
type WoundGroup =
  | { readonly kind: "vital"; readonly whole: boolean }
  | { readonly kind: "trunk" }
  | { readonly kind: "limb"; readonly limb: LimbSpec };

/** Each spec's groups, found once a spec (`woundGroups`). */
const GROUPS = new WeakMap<BodySpec, ReadonlyMap<string, WoundGroup>>();

/**
 * **Each segment of `spec` in its group** (`WoundSpec`). A spec is refused where a group names a
 * segment it has not, a segment is in two groups, a `whole` part is not vital, a limb's share is
 * not a share of life over 0, or a segment beyond one of a limb's is not in it.
 */
export function woundGroups(spec: BodySpec): ReadonlyMap<string, WoundGroup> {
  const known = GROUPS.get(spec);
  if (known) return known;
  const { vital, whole, limbs } = spec.wounds, groups = new Map<string, WoundGroup>();
  const refuse = (why: string): never => { throw new Error(`${spec.model}'s wounds: ${why}`); };
  const place = (segment: string, group: WoundGroup) => {
    if (!spec.segments.some((one) => one.name === segment)) refuse(`it has no segment ${segment}`);
    if (groups.has(segment)) refuse(`${segment} is in two groups`);
    groups.set(segment, group);
  };
  for (const name of whole) if (!vital.includes(name)) refuse(`${name} is whole and not vital`);
  for (const name of vital) place(name, Object.freeze({ kind: "vital", whole: whole.includes(name) }));
  for (const limb of limbs) {
    if (limb.share.unit !== "1" || !(limb.share.value > 0 && Number.isFinite(limb.share.value))) refuse(`${limb.name}'s share is no share of life over 0`);
    const group = Object.freeze({ kind: "limb" as const, limb });
    for (const segment of limb.segments) place(segment, group);
  }
  for (const segment of spec.segments) if (!groups.has(segment.name)) groups.set(segment.name, Object.freeze({ kind: "trunk" }));
  for (const joint of spec.joints) {
    const parent = groups.get(joint.parent)!;
    if (parent.kind === "limb" && groups.get(joint.child) !== parent) refuse(`${joint.child} is beyond ${parent.limb.name} and not in it`);
  }
  GROUPS.set(spec, groups);
  return groups;
}

/** **What a blow on `segment` of `spec` costs life** for each hit point of its damage (`Rulebook.life`). */
export function lifeFactor(rules: Rulebook, spec: BodySpec, segment: string): number {
  const group = woundGroups(spec).get(segment);
  if (!group) throw new Error(`${spec.model} has no segment ${segment}`);
  return rules.life[group.kind].value;
}

/**
 * **A crippled limb is weaker**: the muscles of every joint of `body` whose child is in the limb
 * named `limb` keep `Rulebook.crippled` of their peak torques.
 */
export function crippleLimb(body: Pick<BuiltBody, "spec" | "strength">, limb: string, rules: Rulebook): void {
  const segments = body.spec.wounds.limbs.find((one) => one.name === limb)?.segments;
  if (!segments) throw new Error(`${body.spec.model} has no limb ${limb}`);
  weaken(body, segments, rules.crippled.value);
}

/** **What `wound` does to `body`**: the limb it crippled weaker (`crippleLimb`), the parts it cut off off (`cutOff`). */
export function woundBody(body: Pick<BuiltBody, "spec" | "strength" | "joints">, wound: Wound, rules: Rulebook): void {
  if (wound.crippled) crippleLimb(body, wound.limb!.name, rules);
  if (wound.cut.length > 0) cutOff(body, wound.cut);
}

/**
 * **A cut part comes off**: the muscles of every joint of `body` whose child is among `segments`
 * (a wound's `cut`) give nothing, and each joint that holds one of them to a part left on is
 * released (`EngineJoint.release`): the part falls free, with what its hand holds.
 */
export function cutOff(body: Pick<BuiltBody, "spec" | "strength" | "joints">, segments: readonly string[]): void {
  weaken(body, segments, 0);
  for (const joint of body.joints.values()) {
    if (segments.includes(joint.child.spec.name) && !segments.includes(joint.parent.spec.name)) joint.joint.release();
  }
}

/** The muscles of every joint of `body` whose child is among `segments` at `share` of their peak torques (`BuiltBody.strength`, its spec's joints' freedoms in order). */
function weaken(body: Pick<BuiltBody, "spec" | "strength">, segments: readonly string[], share: number): void {
  let channel = 0;
  for (const joint of body.spec.joints) {
    if (segments.includes(joint.child)) body.strength.fill(share, channel, channel + joint.dofs.length);
    channel += joint.dofs.length;
  }
}

interface Blow {
  /** The segment struck. */
  readonly part: string;
  /** Hit points the blow does, in the rulebook's unit. */
  readonly damage: number;
  /** How it wounds: only an edge or an axe cuts. */
  readonly mechanism: Mechanism;
}

/** What one blow did. */
export interface Wound {
  /** The life it took, HP: its damage at its part's factor, and a cut's loss, no more than the body had. */
  readonly life: number;
  /** The limb it struck and what it took from the limb's bar, HP; null for a part in no limb. */
  readonly limb: { readonly name: string; readonly bar: number } | null;
  /** Whether it emptied its limb's bar. */
  readonly crippled: boolean;
  /** The segments it took off, the struck one first; empty if none. */
  readonly cut: readonly string[];
  /** How the fight ended, if it has; the first ending stands. */
  readonly ending: Ending | null;
}

/** A limb as its pool holds it: its bar and full bar, HP, whether the bar is empty, and whether any of it is off. */
interface LimbReading {
  readonly bar: number;
  readonly full: number;
  readonly crippled: boolean;
  readonly cut: boolean;
}

export interface Pool {
  /** The body's full life, HP. */
  readonly total: number;
  /** Its life, HP. */
  life(): number;
  /** Its life over its full life: 1 whole, 0 spent. */
  bar(): number;
  /** The limb named `name` (`LimbSpec.name`). */
  limb(name: string): LimbReading;
  /** The name of the limb `segment` is in; null for a part in none. */
  limbOf(segment: string): string | null;
  /** Whether `segment` is on the body. */
  attached(segment: string): boolean;
  ending(): Ending | null;
  wound(blow: Blow): Wound;
  /** End the body's fight with its life spent, as a scripted death does. */
  slay(): void;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
}

/** **What a pool remembers**: the body's life, each limb's bar, the segments cut off, and how the fight ended, once it has. */
interface PoolState {
  life: number;
  readonly bars: Map<string, number>;
  readonly cut: Set<string>;
  ending: Ending | null;
}

/** Power iterations that settle a 3 by 3 covariance's leading axis (`leastWidth`). */
const ITERATIONS = 64;

/** The unit axis `matrix` (3 by 3, symmetric, row-major) stretches most, by power iteration from its largest column; null where it stretches none. */
function leadingAxis(matrix: readonly number[]): Vec3 | null {
  let best = -1, v: number[] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const column = [matrix[c]!, matrix[3 + c]!, matrix[6 + c]!], n = column[0]! * column[0]! + column[1]! * column[1]! + column[2]! * column[2]!;
    if (n > best) { best = n; v = column; }
  }
  if (!(best > 0)) return null;
  for (let i = 0; i < ITERATIONS; i++) {
    const w = [0, 1, 2].map((r) => matrix[3 * r]! * v[0]! + matrix[3 * r + 1]! * v[1]! + matrix[3 * r + 2]! * v[2]!);
    const n = Math.sqrt(w[0]! * w[0]! + w[1]! * w[1]! + w[2]! * w[2]!);
    if (!(n > 0)) break;
    v = w.map((x) => x / n);
  }
  const n = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);
  return [v[0]! / n, v[1]! / n, v[2]! / n];
}

/**
 * **A shape's least width**, m: a capsule's or a sphere's diameter, a box's least side, and a
 * hull's extent along the axis its points spread along least (the third of their covariance's
 * principal axes, normal to the first two); a hull of points on a line or one point has none.
 */
function leastWidth(shape: ShapeSpec): number {
  switch (shape.kind) {
    case "capsule": case "sphere": return 2 * shape.radius.value;
    case "box": return Math.min(...shape.size.value);
    case "hull": {
      const points = shape.points.map((p) => p.value), mean = [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k]!, 0) / points.length);
      const covariance = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => points.reduce((sum, p) => sum + (p[r]! - mean[r]!) * (p[c]! - mean[c]!), 0)));
      const first = leadingAxis(covariance);
      if (!first) return 0;
      const spread = [0, 1, 2].reduce((sum, k) => sum + first[k]! * [0, 1, 2].reduce((t, j) => t + covariance[3 * k + j]! * first[j]!, 0), 0);
      const deflated = covariance.map((x, i) => x - spread * first[Math.floor(i / 3)]! * first[i % 3]!);
      const second = leadingAxis(deflated);
      if (!second) return 0;
      const third = [first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0]];
      const n = Math.sqrt(third[0]! * third[0]! + third[1]! * third[1]! + third[2]! * third[2]!);
      const along = points.map((p) => (p[0] * third[0]! + p[1] * third[1]! + p[2] * third[2]!) / n);
      return Math.max(...along) - Math.min(...along);
    }
    default: { const never: never = shape; throw new Error(`no width for ${JSON.stringify(never)}`); }
  }
}

/** **Each segment's thickness**, m: its collider's least width (`leastWidth`), how deep a point goes through it (`pointWound`). */
export function partThickness(spec: BodySpec): ReadonlyMap<string, Quantity<number>> {
  return new Map(spec.segments.map((segment) => {
    const shape = segment.shape, inputs: readonly Quantity[] = shape.kind === "hull" ? shape.points : shape.kind === "box" ? [shape.size] : [shape.radius];
    return [segment.name, derive("m", "a part's thickness: its collider's least width", inputs, () => leastWidth(shape))];
  }));
}

/** A fresh pool for a body built from `spec`, under `rules`. */
export function createPool(spec: BodySpec, rules: Rulebook): Pool {
  const groups = woundGroups(spec), total = spec.wounds.hp.value;
  const children = new Map<string, string[]>(spec.segments.map((segment) => [segment.name, []]));
  for (const joint of spec.joints) children.get(joint.parent)!.push(joint.child);
  const limbs = new Map(spec.wounds.limbs.map((limb) => [limb.name, limb]));
  const full = (limb: LimbSpec): number => limb.share.value * total;
  const state: PoolState = { life: total, bars: new Map(spec.wounds.limbs.map((limb) => [limb.name, full(limb)])), cut: new Set(), ending: null };

  const groupOf = (segment: string): WoundGroup => {
    const group = groups.get(segment);
    if (!group) throw new Error(`${spec.model} has no part ${segment}`);
    return group;
  };
  /** `segment` and every segment on the body beyond it, outward. */
  const beyond = (segment: string): string[] => [segment, ...children.get(segment)!.filter((c) => !state.cut.has(c)).flatMap(beyond)];
  const judge = (): Ending | null => {
    if (spec.wounds.vital.some((name) => state.cut.has(name))) return "beheaded";
    if (spec.wounds.limbs.some((limb) => limb.lost === "out" && limb.segments.some((name) => state.cut.has(name)))) return "maimed";
    return state.life === 0 ? "slain" : null;
  };

  return {
    total, state,
    life: () => state.life,
    bar: () => state.life / total,
    limb(name) {
      const limb = limbs.get(name);
      if (!limb) throw new Error(`${spec.model} has no limb ${name}`);
      const bar = state.bars.get(name)!;
      return { bar, full: full(limb), crippled: bar === 0, cut: limb.segments.some((segment) => state.cut.has(segment)) };
    },
    limbOf(segment) {
      const group = groupOf(segment);
      return group.kind === "limb" ? group.limb.name : null;
    },
    attached(segment) {
      groupOf(segment);
      return !state.cut.has(segment);
    },
    ending: () => state.ending,
    wound({ part, damage, mechanism }) {
      const group = groupOf(part);
      if (state.cut.has(part) || !(damage > 0)) return { life: 0, limb: null, crippled: false, cut: [], ending: state.ending };
      const had = state.life, cuts = mechanism === "edge" || mechanism === "axe", taken = damage * rules.life[group.kind].value;
      let limb: Wound["limb"] = null, crippled = false, cut: string[] = [];
      switch (group.kind) {
        case "limb": {
          const name = group.limb.name, before = state.bars.get(name)!, after = Math.max(0, before - damage);
          state.bars.set(name, after);
          limb = { name, bar: before - after };
          crippled = before > 0 && after === 0;
          if (cuts && after === 0 && damage >= rules.severBlow.value * full(group.limb)) cut = beyond(part);
          break;
        }
        case "vital":
          if (cuts && !group.whole && taken >= had) cut = beyond(part);
          break;
        case "trunk":
          break;
        default: { const never: never = group; throw new Error(`no group ${JSON.stringify(never)}`); }
      }
      for (const segment of cut) state.cut.add(segment);
      state.life = Math.max(0, had - taken - (cut.length ? rules.severLoss.value * total : 0));
      state.ending ??= judge();
      return { life: had - state.life, limb, crippled, cut, ending: state.ending };
    },
    slay() {
      state.life = 0;
      state.ending ??= "slain";
    },
  };
}
