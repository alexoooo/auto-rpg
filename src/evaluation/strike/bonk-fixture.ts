import { Vector3 } from "../../core/math/vector.ts";
import { sin, cos } from "../../core/math/real.ts";
import { physicalReading, centreReading } from "../../control/observation.ts";
import { shapeGeometry, poseGeometry } from "../../core/bodies/spec/clearance.ts";
import { isRefused } from "../../core/refusal.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { bodyClearance } from "../../skills/locomotion/navigation/sensed-bounds.ts";
import { CROWDED } from "../../skills/strikes/strike-window.ts";
import { skillOf } from "../../skills/framework/menu.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import type { Orders } from "../../skills/intent/orders.ts";
import type { BuiltBout } from "../bout.ts";

/** Frozen entry geometry of the club's standing use, with native fixture placement precision. */
export const BONK_ENTRY = deepFreeze({ reach: .48554877761411536, band: .15, aside: .15, pace: 1.021, precision: .00001 });

/** Trusted standing fixture: normalized entry, an unobstructed miss, or an early precommit withdrawal. */
export type BonkFixtureConfig = {
  readonly kind: "bonk"; readonly hand: "left" | "right"; readonly skill: string;
  readonly u: number; readonly v: number; readonly heading: number;
  readonly mode: "contact" | "miss" | "cancel";
  readonly settled: number; readonly patience: number;
};

export const validBonkFixture = (value: unknown): value is BonkFixtureConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fixture = value as Partial<BonkFixtureConfig>;
  return fixture.kind === "bonk" && (fixture.hand === "left" || fixture.hand === "right") && typeof fixture.skill === "string" && fixture.skill.length > 0
    && [fixture.u, fixture.v, fixture.heading, fixture.settled, fixture.patience].every(Number.isFinite)
    && fixture.u! >= 0 && fixture.u! <= 1 && Math.abs(fixture.v!) <= 1 && fixture.settled! >= 0 && fixture.patience! > 0
    && (fixture.mode === "contact" || fixture.mode === "miss" || fixture.mode === "cancel");
};

type Window = { readonly at: Vec3; readonly along: readonly [number, number]; readonly across: readonly [number, number] };
export type BonkFixtureReading = {
  readonly kind: "bonk"; readonly requested: BonkFixtureConfig; readonly entryRule: typeof BONK_ENTRY;
  readonly requestedAt: number | null; readonly admittedAt: number | null; readonly committedAt: number | null;
  readonly placed: { readonly at: number; readonly window: Window; readonly normalized: readonly [number, number]; readonly shift: readonly [number, number] } | null;
  readonly admission: { readonly window: Window; readonly normalized: readonly [number, number]; readonly standing: boolean } | null;
  readonly missAt: number | null; readonly missImpulses: number;
  readonly cancelledAt: number | null; readonly precommit: boolean | null;
  readonly faults: readonly string[];
};

/** World projection of current anatomical collider geometry; held items do not set the entry window. */
function anatomy(body: BuiltBody) {
  return [...body.segments.values()].flatMap(segment => segment.rigid.shapes.flatMap((shape, index) => {
    if (segment.rigid.owners[index]!.kind === "held") return [];
    const local = shapeGeometry(segment.spec, shape);
    if (isRefused(local)) throw new Error(local.refused);
    return [{ name: segment.spec.name, segment, local }];
  }));
}

/** The support interval of posed geometry along a world-ground direction. */
function interval(geometry: ReturnType<typeof anatomy>, ax: number, az: number, names?: ReadonlySet<string>): readonly [number, number] {
  let low = Infinity, high = -Infinity;
  for (const { name, segment, local } of geometry) {
    if (names && !names.has(name)) continue;
    const p = segment.pose.position, q = segment.pose.rotation;
    const shape = poseGeometry(local, segment.frame, [p.x, p.y, p.z], [q.x, q.y, q.z, q.w]);
    const project = (at: Vec3) => at[0] * ax + at[2] * az;
    let near: number, far: number;
    switch (shape.kind) {
      case "capsule": near = Math.min(project(shape.from), project(shape.to)) - shape.radius; far = Math.max(project(shape.from), project(shape.to)) + shape.radius; break;
      case "box": {
        const centre = project(shape.centre), radius = shape.axes.reduce((sum, axis, k) => sum + Math.abs(project(axis)) * shape.half[k]!, 0);
        near = centre - radius; far = centre + radius; break;
      }
      case "hull": { const places = shape.points.map(project); near = Math.min(...places); far = Math.max(...places); break; }
      default: { const never: never = shape; throw new Error(`unknown entry geometry ${String(never)}`); }
    }
    low = Math.min(low, near); high = Math.max(high, far);
  }
  return [low, high];
}

/** Install after building the duel; call beforeSense from a hook registered before the duel's senses. */
export function bonkFixture({ world, duel }: Pick<BuiltBout, "world" | "duel">, given: BonkFixtureConfig) {
  const config = deepFreeze({ ...given });
  const left = duel.duelists.left, right = duel.duelists.right, skills = left.minded.skills;
  if (!skills) throw new Error("a bonk fixture needs published skills");
  const limbs = new Set(left.built.spec.effectors?.map(one => one.segment));
  const read = physicalReading(left.built), foeRead = physicalReading(right.built), mark = centreReading(right.built, right.built.spec.marks.high);
  const ax = sin(config.heading), az = cos(config.heading), acrossX = az, acrossZ = -ax;
  const stand: Orders = deepFreeze({ move: null, face: { x: ax, z: az }, firm: true });
  const strike: Orders = deepFreeze({ ...stand, skill: config.skill, limb: `hand.${config.hand}`, foe: right.id, region: { kind: "mark", mark: "high" } });
  const state = { requestedAt: null as number | null, admittedAt: null as number | null, admittedStep: null as number | null, committedAt: null as number | null,
    placed: null as BonkFixtureReading["placed"], admission: null as BonkFixtureReading["admission"],
    missAt: null as number | null, missImpulses: 0, cancelledAt: null as number | null, precommit: null as boolean | null,
    id: null as number | null, faults: [] as string[] };
  const velocity = new Vector3(), spin = new Vector3();
  const currentWindow = (): Window => {
    const physical = read(); mark.update();
    const centre = physical.centre, head = physical.head, at: Vec3 = [mark.centre.x, mark.centre.y, mark.centre.z];
    const headAhead = (head.x - centre.x) * ax + (head.z - centre.z) * az;
    const headAcross = (head.x - centre.x) * acrossX + (head.z - centre.z) * acrossZ;
    const ownAhead = Math.max(bodyClearance(left.built.spec), interval(anatomy(left.built), ax, az, limbs)[1] - centre.x * ax - centre.z * az);
    const foeNear = interval(anatomy(right.built), ax, az)[0] - at[0] * ax - at[2] * az;
    const near = Math.max(BONK_ENTRY.reach + headAhead, ownAhead - foeNear + CROWDED);
    return { at, along: [near - CROWDED, near + BONK_ENTRY.band], across: [headAcross - BONK_ENTRY.aside, headAcross + BONK_ENTRY.aside] };
  };
  const normalized = (window: Window): readonly [number, number] => {
    const centre = read().centre, dx = window.at[0] - centre.x, dz = window.at[2] - centre.z;
    return [(dx * ax + dz * az - window.along[0]) / (window.along[1] - window.along[0]),
      ((dx * acrossX + dz * acrossZ) - (window.across[0] + window.across[1]) / 2) / BONK_ENTRY.aside * (config.hand === "left" ? -1 : 1)];
  };
  const active = () => skills.report.actions.find(action => action.effector === `hand.${config.hand}` && skillOf(skills.kit, action.action) === config.skill);
  duel.order("left", stand); duel.order("right", { ...stand, face: { x: -ax, z: -az } });
  const control = world.beforeStep(() => {
    const action = active();
    if (action && state.admittedAt === null) {
      state.id = action.id; state.admittedAt = world.time; state.admittedStep = world.steps;
      const window = currentWindow();
      state.admission = { window, normalized: normalized(window), standing: !read().down && !foeRead().down };
    }
    if (action?.phase === "commit" && state.committedAt === null) {
      state.committedAt = world.time;
      if (config.mode === "miss") {
        state.missAt = world.time;
        for (const segment of left.built.segments.values()) world.physics.setCollisionGroups(segment.body, { membership: 1, filter: 0xffff ^ 2 });
        for (const segment of right.built.segments.values()) world.physics.setCollisionGroups(segment.body, { membership: 2, filter: 0xffff });
      }
    }
  });
  const observed = world.afterPhysics(() => {
    if (state.missAt !== null) {
      const other = new Set([...right.built.segments.values()].map(segment => segment.body.id));
      for (const segment of left.built.segments.values()) for (const contact of world.physics.contactsOf(segment.body, body => body !== null && other.has(body.id))) state.missImpulses += contact.impulse;
    }
  });
  return {
    state,
    beforeSense() {
      if (state.id !== null && !active()) duel.order("left", stand);
      if (state.admittedAt === null && world.time >= config.settled && world.time <= config.settled + config.patience) {
        const window = currentWindow(), centre = read().centre;
        const along = window.along[0] + config.u * (window.along[1] - window.along[0]);
        const across = (window.across[0] + window.across[1]) / 2 + config.v * BONK_ENTRY.aside * (config.hand === "left" ? -1 : 1);
        const dx = centre.x + along * ax + across * acrossX - window.at[0], dz = centre.z + along * az + across * acrossZ - window.at[2];
        for (const segment of right.built.segments.values()) {
          const p = segment.pose.position, q = segment.pose.rotation;
          segment.body.linearVelocityToRef(velocity); segment.body.angularVelocityToRef(spin);
          world.physics.placeBody(segment.body, { position: [p.x + dx, p.y, p.z + dz], rotation: [q.x, q.y, q.z, q.w],
            velocity: [velocity.x, velocity.y, velocity.z], spin: [spin.x, spin.y, spin.z] });
        }
        const placed = currentWindow();
        state.placed = { at: world.time, window: placed, normalized: normalized(placed), shift: [dx, dz] };
        if (state.requestedAt === null) { state.requestedAt = world.time; duel.order("left", strike); }
      }
      if (config.mode === "cancel" && state.admittedStep !== null && state.cancelledAt === null && world.steps - state.admittedStep >= Math.round(.05 * world.hz)) {
        state.cancelledAt = world.time; state.precommit = active()?.phase === "prepare";
        duel.order("left", stand);
      }
    },
    reading(): BonkFixtureReading {
      const faults = [...state.faults];
      if (!state.placed) faults.push("entry was not placed");
      if (state.requestedAt === null) faults.push("strike was not requested");
      if (state.admittedAt === null) faults.push("strike was not admitted");
      if (state.admission?.standing !== true) faults.push("entry was not standing");
      if (state.admission && (Math.abs(state.admission.normalized[0] - config.u) * (state.admission.window.along[1] - state.admission.window.along[0]) > BONK_ENTRY.precision
        || Math.abs(state.admission.normalized[1] - config.v) * BONK_ENTRY.aside > BONK_ENTRY.precision)) faults.push("normalized entry was not reached");
      if (config.mode === "miss" && (state.missAt === null || state.missImpulses > 0)) faults.push("unobstructed miss was not reached");
      if (config.mode === "cancel" && (state.cancelledAt === null || state.precommit !== true || state.committedAt !== null)) faults.push("precommit cancellation was not reached");
      return { kind: "bonk", requested: config, entryRule: BONK_ENTRY, requestedAt: state.requestedAt, admittedAt: state.admittedAt, committedAt: state.committedAt,
        placed: state.placed, admission: state.admission, missAt: state.missAt, missImpulses: state.missImpulses, cancelledAt: state.cancelledAt, precommit: state.precommit, faults };
    },
    dispose() { control.dispose(); observed.dispose(); },
  };
}

export type BonkFixture = ReturnType<typeof bonkFixture>;
