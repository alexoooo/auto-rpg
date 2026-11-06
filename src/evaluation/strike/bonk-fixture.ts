import { Vector3 } from "../../core/math/vector.ts";
import { sin, cos } from "../../core/math/real.ts";
import { physicalReading, centreReading } from "../../control/observation.ts";
import { shapeGeometry, poseGeometry } from "../../core/bodies/spec/clearance.ts";
import { isRefused } from "../../core/refusal.ts";
import { deepFreeze, loadState, saveState } from "../../core/world/state.ts";
import { bodyClearance } from "../../skills/locomotion/navigation/sensed-bounds.ts";
import { CROWDED } from "../../skills/strikes/strike-window.ts";
import { skillOf } from "../../skills/framework/menu.ts";
import { directMovement } from "../../skills/intent/movement.ts";
import { SETTLED, settledAt, windowArrival } from "../../skills/intent/action-window.ts";
import { massCentreToRef } from "../../core/bodies/read-motion.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { SegmentSpec, ShapeSpec } from "../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import type { Orders } from "../../skills/intent/orders.ts";
import type { BuiltBout } from "../bout.ts";

/** Frozen entry geometry of the club's standing use, with native fixture placement precision. */
export const BONK_ENTRY = deepFreeze({ reach: .48554877761411536, band: .15, aside: .15, pace: 1.021, precision: .00001 });
/** A controlled half-metre entry walk, requested at the confirmation suite's pace. */
export const BONK_APPROACH = deepFreeze({ pace: .5, distance: .5 });
/** Initial sideways centre-of-mass speed of the unassisted target at its central crossing. */
export const BONK_CROSSING = deepFreeze({ speed: .3 });

/** Trusted standing fixture: normalized entry, an unobstructed miss, or an early precommit withdrawal. */
export type BonkFixtureConfig = {
  readonly kind: "bonk"; readonly hand: "left" | "right"; readonly skill: string;
  readonly u: number; readonly v: number; readonly heading: number;
  readonly mode: "contact" | "miss" | "cancel";
  readonly cancellation?: "last-preparation";
  readonly entryMotion?: "approach";
  readonly crossing?: "left" | "right";
  readonly settled: number; readonly patience: number;
};

export const validBonkFixture = (value: unknown): value is BonkFixtureConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fixture = value as Partial<BonkFixtureConfig>;
  return fixture.kind === "bonk" && (fixture.hand === "left" || fixture.hand === "right") && typeof fixture.skill === "string" && fixture.skill.length > 0
    && [fixture.u, fixture.v, fixture.heading, fixture.settled, fixture.patience].every(Number.isFinite)
    && fixture.u! >= 0 && fixture.u! <= 1 && Math.abs(fixture.v!) <= 1 && fixture.settled! >= 0 && fixture.patience! > 0
    && (fixture.mode === "contact" || fixture.mode === "miss" || fixture.mode === "cancel")
    && (fixture.cancellation === undefined || fixture.mode === "cancel" && fixture.cancellation === "last-preparation")
    && (fixture.entryMotion === undefined || fixture.mode === "contact" && fixture.entryMotion === "approach")
    && (fixture.crossing === undefined || fixture.mode === "contact" && fixture.entryMotion === undefined
      && fixture.u === .5 && fixture.v === 0 && (fixture.crossing === "left" || fixture.crossing === "right"));
};

type Window = { readonly at: Vec3; readonly heading: number; readonly along: readonly [number, number]; readonly across: readonly [number, number] };
type BonkBoundary = { readonly preparationStep: number | null; readonly commitmentStep: number | null };
/** Whether a counterfactual reaches commitment on the native step after its last preparation. */
export const validBonkBoundary = (boundary: BonkBoundary | null | undefined): boundary is { readonly preparationStep: number; readonly commitmentStep: number } =>
  boundary != null && Number.isSafeInteger(boundary.preparationStep) && Number.isSafeInteger(boundary.commitmentStep)
    && boundary.preparationStep! >= 0 && boundary.preparationStep === boundary.commitmentStep! - 1;
type ApproachReading = { readonly requested: typeof BONK_APPROACH; readonly began: number | null; readonly stopOrdered: number | null; readonly settled: number | null;
  readonly forward: number; readonly peakSpeed: number; readonly paceSeen: boolean; readonly fell: boolean; readonly admissionSpeed: number | null };
/** Whether the requested entry walk physically travels and settles before its admitted strike. */
export const validBonkApproach = (approach: ApproachReading | undefined, requestedAt: number | null, admittedAt: number | null): boolean =>
  approach !== undefined && approach.began !== null && approach.stopOrdered !== null && approach.stopOrdered > approach.began && approach.settled !== null
    && approach.settled > approach.stopOrdered && approach.forward >= BONK_APPROACH.distance && approach.paceSeen && !approach.fell
    && requestedAt !== null && requestedAt >= approach.settled && admittedAt !== null && admittedAt > approach.stopOrdered
    && approach.admissionSpeed !== null && approach.admissionSpeed <= SETTLED;
type CrossingReading = { readonly at: number; readonly standing: boolean; readonly velocity: readonly [number, number];
  readonly normalized: readonly [number, number]; readonly depth: number; readonly from: Vec3;
  readonly travel: number; readonly peakSpeed: number; readonly samples: number };
/** Whether the target crosses central entry at the strike request, at the declared physical speed. */
export const validBonkCrossing = (crossing: CrossingReading | undefined, requestedAt: number | null, direction: "left" | "right"): boolean =>
  crossing !== undefined && crossing.at === requestedAt && crossing.standing && crossing.samples > 0
    && Math.abs(crossing.velocity[0]) <= BONK_ENTRY.precision
    && Math.abs(crossing.velocity[1] - (direction === "left" ? -1 : 1) * BONK_CROSSING.speed) <= BONK_ENTRY.precision
    && Math.abs(crossing.normalized[0] - .5) * crossing.depth <= BONK_ENTRY.precision
    && Math.abs(crossing.normalized[1]) * BONK_ENTRY.aside <= BONK_ENTRY.precision;
export type BonkFixtureReading = {
  readonly kind: "bonk"; readonly requested: BonkFixtureConfig; readonly entryRule: typeof BONK_ENTRY;
  readonly requestedAt: number | null; readonly admittedAt: number | null; readonly committedAt: number | null;
  readonly placed: { readonly at: number; readonly window: Window; readonly normalized: readonly [number, number]; readonly shift: readonly [number, number] } | null;
  readonly admission: { readonly window: Window; readonly normalized: readonly [number, number]; readonly standing: boolean } | null;
  readonly missAt: number | null; readonly missImpulses: number;
  readonly cancelledAt: number | null; readonly precommit: boolean | null;
  readonly boundary?: { readonly preparationStep: number | null; readonly commitmentStep: number | null; readonly reached: boolean };
  readonly approach?: ApproachReading & { readonly reached: boolean };
  readonly crossing?: CrossingReading & { readonly reached: boolean };
  readonly faults: readonly string[];
};

/** Immutable local geometry is shared across readings of a segment's current shape. */
const LOCAL = new WeakMap<SegmentSpec, WeakMap<ShapeSpec, Exclude<ReturnType<typeof shapeGeometry>, { readonly refused: string }>>>();

/** World projection of current anatomical collider geometry; held items do not set the entry window. */
function anatomy(body: BuiltBody) {
  return [...body.segments.values()].flatMap(segment => segment.rigid.shapes.flatMap((shape, index) => {
    const owner = segment.rigid.owners[index]!.kind;
    if (owner !== "segment" && owner !== "region") return [];
    let shapes = LOCAL.get(segment.spec);
    if (!shapes) { shapes = new WeakMap(); LOCAL.set(segment.spec, shapes); }
    let local = shapes.get(shape);
    if (!local) {
      const geometry = shapeGeometry(segment.spec, shape);
      if (isRefused(geometry)) throw new Error(geometry.refused);
      local = geometry; shapes.set(shape, local);
    }
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
  const ax = sin(config.heading), az = cos(config.heading);
  const stand: Orders = deepFreeze({ move: null, face: { x: ax, z: az }, firm: true });
  const strike: Orders = deepFreeze({ ...stand, skill: config.skill, limb: `hand.${config.hand}`, foe: right.id, region: { kind: "mark", mark: "high" } });
  const walk: Orders = deepFreeze({ ...stand, move: directMovement(ax, az), pace: BONK_APPROACH.pace, walk: true });
  const state = { requestedAt: null as number | null, admittedAt: null as number | null, admittedStep: null as number | null, committedAt: null as number | null,
    placed: null as BonkFixtureReading["placed"], admission: null as BonkFixtureReading["admission"],
    missAt: null as number | null, missImpulses: 0, cancelledAt: null as number | null, precommit: null as boolean | null,
    id: null as number | null, expired: false, faults: [] as string[],
    probing: false, preparationStep: null as number | null, commitmentStep: null as number | null,
    boundary: null as BonkBoundary | null,
    crossing: null as CrossingReading | null,
    approach: { began: null as number | null, from: null as readonly [number, number] | null, stopOrdered: null as number | null, settled: null as number | null,
      forward: 0, peakSpeed: 0, paceSeen: false, fell: false, admissionSpeed: null as number | null, arrival: windowArrival() } };
  const velocity = new Vector3(), spin = new Vector3();
  const ownSegments = [...left.built.segments.values()], ownMass = ownSegments.reduce((sum, segment) => sum + segment.rigid.mass, 0);
  const centre = new Vector3(), centreWork = new Vector3(), centreVelocity = new Vector3();
  const foeSegments = [...right.built.segments.values()], foeMass = foeSegments.reduce((sum, segment) => sum + segment.rigid.mass, 0);
  const foeCentre = new Vector3(), foeCentreWork = new Vector3(), foeVelocity = new Vector3();
  const groundSpeed = () => {
    massCentreToRef(ownSegments, ownMass, centre, centreWork, centreVelocity);
    return Math.sqrt(centreVelocity.x * centreVelocity.x + centreVelocity.z * centreVelocity.z);
  };
  const currentWindow = (): Window => {
    const heading = skills.report.heading, ax = sin(heading), az = cos(heading), acrossX = az, acrossZ = -ax;
    const physical = read(); mark.update();
    const centre = physical.centre, head = physical.head, at: Vec3 = [mark.centre.x, mark.centre.y, mark.centre.z];
    const headAhead = (head.x - centre.x) * ax + (head.z - centre.z) * az;
    const headAcross = (head.x - centre.x) * acrossX + (head.z - centre.z) * acrossZ;
    const ownAhead = Math.max(bodyClearance(left.built.spec), interval(anatomy(left.built), ax, az, limbs)[1] - centre.x * ax - centre.z * az);
    const foeNear = interval(anatomy(right.built), ax, az)[0] - at[0] * ax - at[2] * az;
    const near = Math.max(BONK_ENTRY.reach + headAhead, ownAhead - foeNear + CROWDED);
    return { at, heading, along: [near - CROWDED, near + BONK_ENTRY.band], across: [headAcross - BONK_ENTRY.aside, headAcross + BONK_ENTRY.aside] };
  };
  const normalized = (window: Window): readonly [number, number] => {
    const ax = sin(window.heading), az = cos(window.heading), acrossX = az, acrossZ = -ax;
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
      if (config.entryMotion === "approach") state.approach.admissionSpeed = groundSpeed();
    }
    if (config.entryMotion === "approach" && state.approach.began !== null && state.approach.stopOrdered === null)
      state.approach.paceSeen ||= skills.report.pace === BONK_APPROACH.pace;
    if (action?.phase === "prepare") state.preparationStep = world.steps;
    if (action?.phase === "commit" && state.committedAt === null) {
      state.committedAt = world.time; state.commitmentStep = world.steps;
      if (config.mode === "miss") {
        state.missAt = world.time;
        for (const segment of left.built.segments.values()) world.physics.setCollisionGroups(segment.body, { membership: 1, filter: 0xffff ^ 2 });
        for (const segment of right.built.segments.values()) world.physics.setCollisionGroups(segment.body, { membership: 2, filter: 0xffff });
      }
    }
  });
  const observed = world.afterPhysics(() => {
    if (state.crossing) {
      massCentreToRef(foeSegments, foeMass, foeCentre, foeCentreWork, foeVelocity);
      const speed = foeVelocity.x * az - foeVelocity.z * ax;
      state.crossing = { ...state.crossing, samples: state.crossing.samples + 1,
        travel: (foeCentre.x - state.crossing.from[0]) * az - (foeCentre.z - state.crossing.from[2]) * ax,
        peakSpeed: Math.max(state.crossing.peakSpeed, Math.abs(speed)) };
    }
    if (state.missAt !== null) {
      const other = new Set([...right.built.segments.values()].map(segment => segment.body.id));
      for (const segment of left.built.segments.values()) for (const contact of world.physics.contactsOf(segment.body, body => body !== null && other.has(body.id))) state.missImpulses += contact.impulse;
    }
  });
  return {
    config,
    state,
    /** Probe public lifecycle phases, then restore the whole bout before a reader observes it. */
    prepareBoundary() {
      if (config.cancellation !== "last-preparation") return;
      const bout = duel.save(), saved = saveState(state);
      state.probing = true;
      while (state.committedAt === null && !state.expired && world.time <= config.settled + config.patience + 1
        && (state.admittedAt === null || active()?.phase === "prepare")) world.step();
      const boundary = { preparationStep: state.preparationStep, commitmentStep: state.commitmentStep };
      duel.load(bout); loadState(state, saved); state.boundary = boundary;
      if (!validBonkBoundary(boundary)) state.faults.push("last preparation boundary was not established");
    },
    beforeSense() {
      if (state.id !== null && !active()) duel.order("left", stand);
      if (state.admittedAt === null && !state.expired && world.time > config.settled + config.patience) {
        state.expired = true; state.faults.push("entry admission deadline expired"); duel.order("left", stand);
      }
      if (config.entryMotion === "approach" && state.admittedAt === null && !state.expired && world.time >= config.settled) {
        const approach = state.approach, speed = groundSpeed();
        approach.fell ||= read().down;
        if (approach.began === null) {
          approach.began = world.time; approach.from = [centre.x, centre.z]; duel.order("left", walk);
        }
        if (approach.stopOrdered === null) {
          approach.forward = (centre.x - approach.from![0]) * ax + (centre.z - approach.from![1]) * az;
          approach.peakSpeed = Math.max(approach.peakSpeed, speed);
          if (approach.forward >= BONK_APPROACH.distance) { approach.stopOrdered = world.time; duel.order("left", stand); }
        }
        if (approach.stopOrdered !== null && approach.settled === null && settledAt(approach.arrival, speed, world.time)) approach.settled = world.time;
      }
      const approached = config.entryMotion !== "approach" || state.approach.settled !== null;
      if (state.admittedAt === null && !state.expired && world.time >= config.settled && approached
        && (config.crossing === undefined || state.requestedAt === null)) {
        const window = currentWindow(), centre = read().centre;
        const ax = sin(window.heading), az = cos(window.heading), acrossX = az, acrossZ = -ax;
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
        if (config.entryMotion === "approach" || config.crossing !== undefined) {
          const ready = groundSpeed() <= SETTLED && skills.menu().some(entry => entry.skill === config.skill && entry.limb === `hand.${config.hand}`
            && entry.foe === right.id && entry.region?.kind === "mark" && entry.region.mark === "high" && entry.readiness.kind === "ready");
          if (ready) {
            state.requestedAt ??= world.time;
            if (config.crossing !== undefined) {
              // A placed initial velocity adds one uniform translation, preserving internal motion and spin.
              massCentreToRef(foeSegments, foeMass, foeCentre, foeCentreWork, foeVelocity);
              const sign = config.crossing === "left" ? -1 : 1, vx = sign * az * BONK_CROSSING.speed, vz = -sign * ax * BONK_CROSSING.speed;
              const dx = vx - foeVelocity.x, dz = vz - foeVelocity.z;
              for (const segment of foeSegments) {
                const p = segment.pose.position, q = segment.pose.rotation;
                segment.body.linearVelocityToRef(velocity); segment.body.angularVelocityToRef(spin);
                world.physics.placeBody(segment.body, { position: [p.x, p.y, p.z], rotation: [q.x, q.y, q.z, q.w],
                  velocity: [velocity.x + dx, velocity.y, velocity.z + dz], spin: [spin.x, spin.y, spin.z] });
              }
              massCentreToRef(foeSegments, foeMass, foeCentre, foeCentreWork, foeVelocity);
              state.crossing = { at: world.time, standing: !foeRead().down, velocity: [foeVelocity.x * ax + foeVelocity.z * az, foeVelocity.x * az - foeVelocity.z * ax],
                normalized: normalized(placed), depth: placed.along[1] - placed.along[0], from: [foeCentre.x, foeCentre.y, foeCentre.z], travel: 0, peakSpeed: 0, samples: 0 };
              duel.order("right", { ...stand, face: { x: -ax, z: -az }, move: directMovement(sign * az, -sign * ax), pace: BONK_CROSSING.speed, walk: true });
            }
            duel.order("left", strike);
          }
          else duel.order("left", stand);
        } else if (state.requestedAt === null) { state.requestedAt = world.time; duel.order("left", strike); }
      }
      const withdraw = config.cancellation === "last-preparation" ? validBonkBoundary(state.boundary) && state.boundary.preparationStep === world.steps
        : state.admittedStep !== null && world.steps - state.admittedStep >= Math.round(.05 * world.hz);
      if (config.mode === "cancel" && !state.probing && state.admittedStep !== null && state.cancelledAt === null && withdraw) {
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
      if (config.crossing === undefined && state.admission && (Math.abs(state.admission.normalized[0] - config.u) * (state.admission.window.along[1] - state.admission.window.along[0]) > BONK_ENTRY.precision
        || Math.abs(state.admission.normalized[1] - config.v) * BONK_ENTRY.aside > BONK_ENTRY.precision)) faults.push("normalized entry was not reached");
      if (config.mode === "miss" && (state.missAt === null || state.missImpulses > 0)) faults.push("unobstructed miss was not reached");
      if (config.mode === "cancel" && (state.cancelledAt === null || state.precommit !== true || state.committedAt !== null)) faults.push("precommit cancellation was not reached");
      const boundary = config.cancellation === "last-preparation" ? { preparationStep: state.boundary?.preparationStep ?? null,
        commitmentStep: state.boundary?.commitmentStep ?? null, reached: state.cancelledAt !== null && validBonkBoundary(state.boundary)
          && Math.round(state.cancelledAt * world.hz) === state.boundary.preparationStep && state.precommit === true && state.committedAt === null } : null;
      if (boundary && !boundary.reached) faults.push("last preparation cancellation was not reached");
      const approach = config.entryMotion === "approach" ? { requested: BONK_APPROACH, began: state.approach.began, stopOrdered: state.approach.stopOrdered,
        settled: state.approach.settled, forward: state.approach.forward, peakSpeed: state.approach.peakSpeed, paceSeen: state.approach.paceSeen,
        fell: state.approach.fell, admissionSpeed: state.approach.admissionSpeed } : null;
      const reachedApproach = approach === null ? null : { ...approach, reached: validBonkApproach(approach, state.requestedAt, state.admittedAt) };
      if (reachedApproach && !reachedApproach.reached) faults.push("controlled approach and stop were not reached");
      const crossing = config.crossing === undefined ? null : state.crossing && { ...state.crossing,
        reached: validBonkCrossing(state.crossing, state.requestedAt, config.crossing) };
      if (config.crossing !== undefined && !crossing?.reached) faults.push("moving target did not cross central entry at the strike request");
      return { kind: "bonk", requested: config, entryRule: BONK_ENTRY, requestedAt: state.requestedAt, admittedAt: state.admittedAt, committedAt: state.committedAt,
        placed: state.placed, admission: state.admission, missAt: state.missAt, missImpulses: state.missImpulses, cancelledAt: state.cancelledAt, precommit: state.precommit,
        ...boundary ? { boundary } : {}, ...reachedApproach ? { approach: reachedApproach } : {}, ...crossing ? { crossing } : {}, faults };
    },
    dispose() { control.dispose(); observed.dispose(); },
  };
}

export type BonkFixture = ReturnType<typeof bonkFixture>;
