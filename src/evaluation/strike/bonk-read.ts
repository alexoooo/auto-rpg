import { Quaternion, Vector3 } from "../../core/math/vector.ts";
import { acos } from "../../core/math/real.ts";
import { wrap } from "../../core/math/turn.ts";
import { isRefused } from "../../core/refusal.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { jointAngles } from "../../core/bodies/build/joint-state.ts";
import { rigidPoints } from "../../core/bodies/build/rigid.ts";
import { selfClearance, type SelfClearance } from "../../core/bodies/build/clearance.ts";
import { attachment, rootSegment } from "../../core/bodies/read-body.ts";
import { motionAtToRef, pointOfToRef, turnOfToRef } from "../../core/bodies/read-motion.ts";
import { bonkModel, BONK_LIMITS, type BonkCourse, type BonkFrame, type BonkModel, type BonkPhase, type BonkPose, type BonkTechnique, type BonkTurn } from "../../skills/strikes/bonk-course.ts";
import { handConfiguration } from "../../skills/strikes/held-strike.ts";
import type { ActionStatus } from "../../skills/framework/action.ts";
import type { BuiltBout } from "../bout.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import { uprightness } from "../../control/ground.ts";
import type { BonkFixtureReading } from "./bonk-fixture.ts";
import { describeMind } from "../../minds/description.ts";
import { senseDelayOf } from "../../game/arena/duel.ts";

type StrokeEnd = { readonly at: number; readonly reason: "endpoint" | "impact withdrawal" | "stroke deadline" | "preparation deadline" | "cancelled" };
type AssistRead = { force: number; moment: number; ceilingForce: number; ceilingMoment: number };
type Physical = { time: number; pose: BonkPose; frame: BonkFrame; relativeHand: Vec3; relativeSwell: Vec3; relativeClub: BonkTurn;
  handSpeed: number; swellSpeed: number; velocity: Vec3; impulse: boolean; touching: boolean;
  normal: Vec3 | null; contact: { shape: number; on: string; impulse: number }[]; clearance: SelfClearance; down: boolean; grip: boolean;
  assists: { left: AssistRead; right: AssistRead } };
type Sample = Physical & { phase: BonkPhase; reference: BonkCourse | null };
type PhaseReading = { phase: BonkPhase; from: number | null; to: number | null; steps: number; exemptSteps: number;
  handError: number; swellError: number; clubError: number; chestError: number; clubTravel: number; chestTravel: number;
  rawHandError: number; rawSwellError: number; rawClubError: number; rawChestError: number;
  shaftTravel: number; outsideShaftTravel: number;
  outsideClubTravel: number; outsideChestTravel: number; declaredClubTravel: number; declaredChestTravel: number;
  wristReversals: number[]; outsideWristReversals: number[]; backward: number; rawBackward: number; tilt: number };

export type BonkReading = {
  readonly fixture?: BonkFixtureReading;
  readonly effectiveness?: { readonly committed: number | null; readonly contact: BonkReading["contact"] };
  readonly limits: typeof BONK_LIMITS;
  readonly harness: { readonly engine: string; readonly hz: number; readonly commandDelay: number; readonly decisionRate: number | null; readonly observationDelay: number };
  readonly coverage: { readonly course: boolean; readonly nativeSteps: boolean; readonly clearance: boolean;
    readonly unreferencedSteps: number;
    readonly entryWindow: boolean; readonly fixtures: boolean; readonly repetition: false; readonly cancellationBoundary: false };
  readonly course: BonkCourse | null;
  readonly shape: ReturnType<BonkModel["shape"]> | null;
  readonly courseFault: string | null;
  readonly admitted: number | null; readonly committed: number | null; readonly physicalEnd: StrokeEnd | null;
  readonly recovered: number | null; readonly ownerEnded: number | null;
  readonly chamberHold: number; readonly chamberAbove: number | null; readonly guardHold: number; readonly settledAtRelease: boolean | null;
  readonly handovers: readonly { readonly at: number; readonly resources: readonly string[]; readonly settled: boolean }[];
  readonly collision: { readonly first: number | null; readonly last: number | null; readonly until: number | null; readonly prolonged: boolean };
  readonly contact: { readonly time: number; readonly shape: number; readonly on: string; readonly energy: number; readonly descent: number } | null;
  readonly phases: readonly PhaseReading[];
  readonly safety: { readonly least: number | null; readonly pair: SelfClearance["pair"]; readonly pairsPerStep: number;
    readonly exclusions: SelfClearance["excluded"];
    readonly at: number | null; readonly down: boolean; readonly gripped: boolean;
    readonly assists: { readonly left: AssistRead & { readonly balance: number }; readonly right: AssistRead & { readonly balance: number } };
    readonly watchedAfterRecovery: number };
  readonly gates: { readonly preparation: boolean; readonly stroke: boolean; readonly control: boolean; readonly contact: boolean;
    readonly recovery: boolean; readonly safety: boolean; readonly coverage: false };
  readonly failures: readonly string[];
  readonly passed: false;
};

const xyz = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const xyzw = (q: Quaternion): BonkTurn => [q.x, q.y, q.z, q.w];
const length = (v: Vec3): number => Math.sqrt(v.reduce((sum, value) => sum + value * value, 0));
const distance = (a: Vec3, b: Vec3): number => length(a.map((v, k) => v - b[k]!) as unknown as Vec3);
const angle = (a: BonkTurn, b: BonkTurn): number => 2 * acos(Math.min(1, Math.abs(a.reduce((sum, v, k) => sum + v * b[k]!, 0))));
const degreesOfFreedom = (model: BonkModel, body: BuiltBout["duel"]["duelists"]["left"]["built"]): number[][] =>
  model.channels.map(channels => {
    const joint = [...body.joints.values()].find(one => channels[0]?.startsWith(`${one.spec.name} `));
    return joint ? [...jointAngles(joint)] : [];
  });

/** Physical bonk readings against an independently constructed course, including motion after executor release. */
export function readBonk(built: Pick<BuiltBout, "world" | "duel" | "catalog" | "fixture">, effector: string, skill: string | undefined, fallback: BonkTechnique, seconds: number) {
  const { world, duel, catalog, fixture } = built, left = duel.duelists.left, foe = duel.duelists.right, body = left.built;
  const stepOf = (time: number): number => Math.round(time * world.hz);
  const elapsed = (time: number, since: number): number => (stepOf(time) - stepOf(since)) / world.hz;
  const checkedModel = bonkModel(body.spec, effector);
  if (isRefused(checkedModel)) throw new Error(checkedModel.refused);
  const model: BonkModel = checkedModel;
  const mind = duel.recipe.minds?.left;
  if (!mind) throw new Error("a bonk reference needs its striker's mind configuration");
  const configured = describeMind(catalog, body.spec, mind)?.executors.filter(config => config.kind === skill).flatMap(config => {
    const reference = catalog.partLookup.of("executor", config).reference?.(body.spec, config, effector);
    return reference ? [reference] : [];
  }) ?? [];
  if (configured.length > 1) throw new Error("a bonk reading needs one declared motion reference");
  const reference = configured[0];
  const technique = reference ? reference.technique : fallback;
  const guard = catalog.controllerOf(mind).builtIn(body.spec, mind, catalog.partLookup);
  const limb = body.segments.get(effector)!, description = body.spec.effectors!.find(one => one.segment === effector)!;
  const chest = body.segments.get(description.base)!, root = rootSegment(body);
  const point = rigidPoints(body.spec, limb.spec).get("swell")!.value;
  const clearance = selfClearance(body), attached = attachment(body), grip = handConfiguration(body.spec, effector, "grip");
  const upright = uprightness(body);
  const otherSegments = new Map([...foe.built.segments].map(([name, one]) => [one.body.id, name]));
  const swellShapes = new Set(limb.rigid.owners.flatMap((owner, index) => {
    if (owner.kind !== "held") return [];
    const own = limb.rigid.owners.slice(0, index).filter(one => one.kind === "held" && one.held === owner.held).length;
    const shape = owner.held.item.shapes[own], from = owner.held.item.points.swellFrom?.value, to = owner.held.item.points.swellTo?.value;
    return shape?.kind === "capsule" && from && to && shape.from.value.every((v, k) => v === from[k]) && shape.to.value.every((v, k) => v === to[k]) ? [index] : [];
  }));
  const p = new Vector3(), q = new Quaternion(), inverse = new Quaternion(), relative = new Vector3(), velocity = new Vector3(), spin = new Vector3();
  const state = { previous: null as Physical | null, entry: null as Physical | null, course: null as BonkCourse | null,
    courseFault: null as string | null, samples: [] as Sample[], committed: null as number | null, end: null as StrokeEnd | null,
    returnCourse: null as BonkCourse | null, returnStart: null as readonly (readonly number[])[] | null,
    guardReference: null as null | { hand: Vec3; swell: Vec3; turn: BonkTurn },
    chamberHold: 0, chamberSince: null as number | null, preparedHold: 0, chamberAbove: null as number | null,
    guardHold: 0, guardSince: null as number | null, recovered: null as number | null, ownerEnded: null as number | null, settledAtRelease: null as boolean | null,
    firstContact: null as number | null, lastContact: null as number | null, contactClosed: false, stopped: false,
    contactNormal: null as Vec3 | null,
    hit: null as BonkReading["contact"], effectiveness: { committed: null as number | null, contact: null as BonkReading["contact"] },
    ownership: { held: [] as string[], handovers: [] as { at: number; resources: string[]; settled: boolean }[] } };
  const ownership = state.ownership;
  function physical(tracking: boolean): Physical {
    const hand = xyz(pointOfToRef(limb, limb.frame.origin, p)), swell = xyz(pointOfToRef(limb, point, p));
    const chestAt = xyz(pointOfToRef(chest, chest.frame.origin, p)), chestTurn = xyzw(turnOfToRef(chest, q));
    const club = xyzw(turnOfToRef(limb, q));
    const relativePoint = (at: Vec3): Vec3 => {
      Quaternion.InverseToRef(q.copyFromFloats(...chestTurn), inverse);
      return xyz(relative.set(at[0] - chestAt[0], at[1] - chestAt[1], at[2] - chestAt[2]).applyRotationQuaternionToRef(inverse, relative));
    };
    const relativeHand = relativePoint(hand), relativeSwell = relativePoint(swell);
    const relativeClub = xyzw(inverse.multiply(q.copyFromFloats(...club)));
    const contacts = world.physics.contactsOf(limb.body), manifolds = world.physics.contactManifoldsOf(limb.body);
    const contact = contacts.flatMap(one => one.pairs.filter(pair => pair.impulse > 0).map(pair => ({ shape: pair.mine,
      on: one.other ? otherSegments.get(one.other.id) ?? one.other.pose.name : "world", impulse: pair.impulse })));
    const first = contacts.find(one => one.impulse > 0), dt = world.dt;
    motionAtToRef(limb, p.set(...swell), velocity, spin);
    const rootAt = root.pose.position, frame: BonkFrame = { origin: root.frame.origin, at: [rootAt.x, rootAt.y, rootAt.z], turn: xyzw(turnOfToRef(root, q)) };
    const shaftA = rigidPoints(body.spec, limb.spec).get("swellFrom")!.value, shaftB = rigidPoints(body.spec, limb.spec).get("swellTo")!.value;
    const a = xyz(pointOfToRef(limb, shaftA, p)), b = xyz(pointOfToRef(limb, shaftB, p)), shaftLength = distance(a, b);
    const assistOf = (one: typeof left): AssistRead => ({ force: one.body.assist.given.force.length(), moment: one.body.assist.given.moment.length(),
      ceilingForce: one.body.assist.most.force, ceilingMoment: one.body.assist.most.moment });
    return { time: world.time, frame, pose: { hand, swell, club, chest: chestTurn, chestAt, joints: degreesOfFreedom(model as BonkModel, body),
      shaft: a.map((v, k) => (b[k]! - v) / shaftLength) as unknown as Vec3 }, relativeHand, relativeSwell, relativeClub,
      handSpeed: state.previous ? distance(relativeHand, state.previous.relativeHand) / dt : 0,
      swellSpeed: state.previous ? distance(relativeSwell, state.previous.relativeSwell) / dt : 0,
      velocity: xyz(velocity), impulse: !!first, touching: manifolds.some(one => one.points.some(point => point.distance <= 0)), normal: first?.normal ?? null,
      contact, clearance: tracking ? clearance() : { least: null, pair: null, pairs: 0, excluded: [] }, down: upright.fallen(), grip: attached(limb) && (grip === null || limb.configuration?.applied === grip),
      assists: { left: assistOf(left), right: assistOf(foe) } };
  }
  const quiet = (now: Physical, target: BonkPose): boolean => distance(now.pose.hand, target.hand) <= BONK_LIMITS.chamberNear
    && distance(now.pose.swell, target.swell) <= BONK_LIMITS.chamberNear && now.handSpeed <= BONK_LIMITS.still && now.swellSpeed <= BONK_LIMITS.still
    && angle(now.pose.club, target.club) <= BONK_LIMITS.settledAngle;
  function finish(now: Physical, reason: StrokeEnd["reason"]): void {
    state.end = { at: now.time, reason }; state.returnStart = now.pose.joints;
    if (state.course) state.returnCourse = deepFreeze({ ...state.course, frame: now.frame });
  }
  function nearest(course: BonkCourse, phase: BonkPhase, now: Physical): { progress: number; pose: BonkPose } {
    if (phase === "stroke") return (model as BonkModel).nearest(course, now.pose.swell);
    const duration = phase === "prepare" ? technique.prepareSeconds : technique.returnSeconds;
    const at = (u: number): BonkPose => {
      const pose = model.sample(course, phase, u * duration, phase === "return" ? state.returnStart ?? undefined : undefined);
      if (phase !== "return") return pose;
      const undo = Quaternion.Inverse(new Quaternion(...pose.chest)), carry = new Quaternion(...now.pose.chest);
      const point = (at: Vec3): Vec3 => {
        const local = new Vector3(at[0] - pose.chestAt[0], at[1] - pose.chestAt[1], at[2] - pose.chestAt[2]);
        local.applyRotationQuaternionToRef(undo, local).applyRotationQuaternionToRef(carry, local);
        return [local.x + now.pose.chestAt[0], local.y + now.pose.chestAt[1], local.z + now.pose.chestAt[2]];
      };
      return { ...pose, hand: point(pose.hand), swell: point(pose.swell),
        club: xyzw(carry.multiply(undo).multiply(new Quaternion(...pose.club))), chestAt: now.pose.chestAt };
    };
    let best = { progress: 0, pose: at(0), distance: Infinity };
    for (let i = 0; i <= 48; i++) {
      const pose = at(i / 48), apart = distance(pose.swell, now.pose.swell);
      if (apart < best.distance) best = { progress: i / 48, pose, distance: apart };
    }
    let low = Math.max(0, best.progress - 1 / 48), high = Math.min(1, best.progress + 1 / 48);
    for (let i = 0; i < 8; i++) {
      const a = low + (high - low) / 3, b = high - (high - low) / 3;
      if (distance(at(a).swell, now.pose.swell) <= distance(at(b).swell, now.pose.swell)) high = b; else low = a;
    }
    const progress = (low + high) / 2, pose = at(progress);
    return distance(pose.swell, now.pose.swell) < best.distance ? { progress, pose } : best;
  }
  return {
    afterStep(action: ActionStatus | null): void {
      const now = physical(action !== null || state.entry !== null), was = state.previous;
      state.previous = now;
      if (!state.entry && !action) return;
      state.entry ??= was ?? now;
      const target = action?.aim ?? fixture?.state.admission?.window.at;
      if (target && state.committed === null && state.end === null) {
        const made = (model as BonkModel).make(state.entry.frame, guard, target, technique);
        if (isRefused(made)) { state.courseFault = made.refused; state.course = null; }
        else {
          state.courseFault = null; state.course = made;
          if (!state.guardReference) {
            const rest = model.pose(made, made.guard), inv = Quaternion.Inverse(new Quaternion(...rest.chest));
            const relativeToChest = (point: Vec3): Vec3 => xyz(new Vector3(point[0] - rest.chestAt[0], point[1] - rest.chestAt[1], point[2] - rest.chestAt[2])
              .applyRotationQuaternionToRef(inv, new Vector3()));
            state.guardReference = { hand: relativeToChest(rest.hand), swell: relativeToChest(rest.swell), turn: xyzw(inv.multiply(new Quaternion(...rest.club))) };
          }
        }
      }
      if (action?.phase === "commit" && state.committed === null && !state.end) {
        state.committed = was?.time ?? now.time; state.preparedHold = state.chamberHold;
        state.chamberAbove = state.course ? (was ?? now).pose.swell[1] - state.course.target[1] : null;
      }
      if (action?.phase === "commit") state.effectiveness.committed ??= was?.time ?? now.time;
      let intended: BonkReading["contact"] = null;
      for (const contact of now.contact) if (swellShapes.has(contact.shape) && contact.on === foe.built.spec.marks.high) {
        const blow = duel.blows.find(blow => blow.kind === "impact" && blow.time === now.time
          && blow.sides.some(side => side.fighter === left.id && side.segment === effector && side.item !== null)
          && blow.sides.some(side => side.fighter === foe.id && side.segment === contact.on && (side.mechanism ?? "blunt") === "blunt"));
        if (blow?.kind === "impact") {
          const before = was?.velocity ?? [0, 0, 0], speed = length(before), horizontal = Math.sqrt(before[0] * before[0] + before[2] * before[2]);
          const descent = speed > 0 ? Math.sign(-before[1]) * acos(Math.min(1, horizontal / speed)) : 0;
          intended = { time: now.time, shape: contact.shape, on: contact.on, energy: blow.energy, descent }; break;
        }
      }
      if (!state.effectiveness.contact && intended && action?.phase === "commit" && state.effectiveness.committed !== null
        && elapsed(now.time, state.effectiveness.committed) <= BONK_LIMITS.stroke) state.effectiveness.contact = intended;
      if (state.committed === null && !state.end) {
        const settled = state.course && quiet(now, (model as BonkModel).pose(state.course, state.course.chamber));
        state.chamberSince = settled ? state.chamberSince ?? world.steps : null;
        state.chamberHold = state.chamberSince === null ? 0 : (world.steps - state.chamberSince) / world.hz;
        const cancelledAt = fixture?.state.cancelledAt;
        if (cancelledAt !== undefined && cancelledAt !== null && now.time >= cancelledAt) finish(was && was.time >= cancelledAt ? was : now, "cancelled");
        else if (!action) finish(now, "cancelled");
        else if (elapsed(now.time, state.entry.time) >= BONK_LIMITS.prepare) finish(now, "preparation deadline");
      }
      if (state.committed !== null && !state.end && now.impulse && state.firstContact === null) { state.firstContact = now.time; state.contactNormal = now.normal; }
      if (state.firstContact !== null && !state.contactClosed) {
          if (now.touching || now.impulse) state.lastContact = now.time;
          else state.contactClosed = true;
      }
      if (state.contactNormal && now.velocity.reduce((sum, v, k) => sum + v * state.contactNormal![k]!, 0) <= 0) state.stopped = true;
      if (state.committed !== null && !state.end) {
        state.hit ??= intended;
        if (state.course) {
          const nearest = (model as BonkModel).nearest(state.course, now.pose.swell);
          if (nearest.progress === 1 && nearest.distance <= BONK_LIMITS.swellError && distance(now.pose.hand, nearest.pose.hand) <= BONK_LIMITS.handError) finish(now, "endpoint");
          else if (state.stopped && was && state.firstContact !== null && state.guardReference && distance(now.relativeSwell, state.guardReference.swell) < distance(was.relativeSwell, state.guardReference.swell)
            && distance(now.pose.swell, was.pose.swell) > 0 && !now.touching) finish(now, "impact withdrawal");
        }
        if (!state.end && elapsed(now.time, state.committed) >= BONK_LIMITS.stroke) finish(now, "stroke deadline");
      }
      if (state.end) {
        const rest = state.guardReference;
        const settled = rest !== null && distance(now.relativeHand, rest.hand) <= BONK_LIMITS.chamberNear
          && distance(now.relativeSwell, rest.swell) <= BONK_LIMITS.chamberNear && now.handSpeed <= BONK_LIMITS.still
          && now.swellSpeed <= BONK_LIMITS.still && angle(now.relativeClub, rest.turn) <= BONK_LIMITS.settledAngle;
        state.guardSince = settled ? state.guardSince ?? world.steps : null;
        state.guardHold = state.guardSince === null ? 0 : (world.steps - state.guardSince) / world.hz;
        if (state.guardHold >= BONK_LIMITS.guardHold) state.recovered ??= now.time;
      }
      if (!action && state.ownerEnded === null) { state.ownerEnded = now.time; state.settledAtRelease = state.guardHold >= BONK_LIMITS.guardHold; }
      const held = action?.holds.map(resource => `${resource.kind}:${resource.name}`) ?? [];
      const released = ownership.held.filter(resource => !held.includes(resource));
      if (released.length) ownership.handovers.push({ at: now.time, resources: released, settled: state.guardHold >= BONK_LIMITS.guardHold });
      ownership.held = held;
      const phase: BonkPhase = state.end && state.end.at < now.time ? "return" : state.committed !== null ? "stroke" : "prepare";
      state.samples.push({ ...now, phase, reference: phase === "return" ? state.returnCourse : state.course });
    },
    get ended(): boolean {
      return world.time >= seconds || state.end !== null && (state.recovered === null
        ? elapsed(world.time, state.end.at) >= BONK_LIMITS.return + BONK_LIMITS.after : elapsed(world.time, state.recovered) >= BONK_LIMITS.after);
    },
    reading(): BonkReading {
      const fixtureReading = fixture?.reading();
      const until = state.firstContact === null ? null : Math.min(stepOf(state.firstContact) + stepOf(BONK_LIMITS.collision), stepOf(state.lastContact ?? state.firstContact) + stepOf(BONK_LIMITS.recoil)) / world.hz;
      const exempt = (time: number) => state.firstContact !== null && until !== null && time >= state.firstContact && time <= until;
      const prolonged = state.firstContact !== null && state.lastContact !== null && elapsed(state.lastContact, state.firstContact) > BONK_LIMITS.collision;
      const phases: PhaseReading[] = (["prepare", "stroke", "return"] as const).map(phase => {
        const result: PhaseReading = { phase, from: null, to: null, steps: 0, exemptSteps: 0, handError: 0, swellError: 0, clubError: 0, chestError: 0,
          rawHandError: 0, rawSwellError: 0, rawClubError: 0, rawChestError: 0,
          shaftTravel: 0, outsideShaftTravel: 0,
          clubTravel: 0, chestTravel: 0, outsideClubTravel: 0, outsideChestTravel: 0, declaredClubTravel: 0, declaredChestTravel: 0,
          wristReversals: [0, 0, 0], outsideWristReversals: [0, 0, 0], backward: 0, rawBackward: 0, tilt: 0 };
        let previous: Sample | null = null, progress: number | null = null;
        for (const sample of state.samples) {
          if (sample.phase !== phase) { previous = sample; continue; }
          result.from ??= previous?.time ?? sample.time; result.to = sample.time; result.steps++;
          const masked = exempt(sample.time);
          result.exemptSteps += Number(masked);
          const up = new Vector3(0, 1, 0).applyRotationQuaternionToRef(new Quaternion(...sample.pose.chest), new Vector3());
          result.tilt = Math.max(result.tilt, acos(Math.max(-1, Math.min(1, up.y))));
          const course = sample.reference;
          if (course) {
            const expected = nearest(course, phase, sample);
            const errors = { hand: distance(sample.pose.hand, expected.pose.hand), swell: distance(sample.pose.swell, expected.pose.swell),
              club: angle(sample.pose.club, expected.pose.club), chest: angle(sample.pose.chest, expected.pose.chest) };
            result.rawHandError = Math.max(result.rawHandError, errors.hand); result.rawSwellError = Math.max(result.rawSwellError, errors.swell);
            result.rawClubError = Math.max(result.rawClubError, errors.club); result.rawChestError = Math.max(result.rawChestError, errors.chest);
            if (!masked) {
              result.handError = Math.max(result.handError, errors.hand); result.swellError = Math.max(result.swellError, errors.swell);
              result.clubError = Math.max(result.clubError, errors.club); result.chestError = Math.max(result.chestError, errors.chest);
            }
            if (phase === "stroke" && progress !== null) {
              const backward = Math.max(0, progress - expected.progress) * (model as BonkModel).length(course);
              result.rawBackward += backward; if (!masked) result.backward += backward;
            }
            progress = expected.progress;
            if (previous) {
              const from = phase === "prepare" ? course.guard : phase === "return" ? state.returnStart ?? course.follow : course.contact;
              const to = phase === "prepare" ? course.chamber : phase === "return" ? course.guard : course.contact;
              result.wristReversals.forEach((_, k) => {
                const delta = wrap(sample.pose.joints[(model as BonkModel).wrist]![k]! - previous!.pose.joints[(model as BonkModel).wrist]![k]!);
                const direction = Math.sign(to[(model as BonkModel).wrist]![k]! - from[(model as BonkModel).wrist]![k]!);
                const reversal = direction === 0 ? Math.abs(delta) : Math.max(0, -direction * delta);
                result.wristReversals[k]! += reversal; if (!masked) result.outsideWristReversals[k]! += reversal;
              });
            }
          }
          if (previous) {
            const club = angle(previous.pose.club, sample.pose.club), chest = angle(previous.pose.chest, sample.pose.chest);
            const shaft = acos(Math.max(-1, Math.min(1, previous.pose.shaft.reduce((sum, v, k) => sum + v * sample.pose.shaft[k]!, 0))));
            result.shaftTravel += shaft; if (!masked) result.outsideShaftTravel += shaft;
            result.clubTravel += club; result.chestTravel += chest;
            if (!masked) { result.outsideClubTravel += club; result.outsideChestTravel += chest; }
          }
          previous = sample;
        }
        const course = phase === "return" ? state.returnCourse : state.course;
        if (course) {
          const duration = phase === "prepare" ? technique.prepareSeconds : phase === "stroke" ? technique.strokeSeconds : technique.returnSeconds;
          let was = (model as BonkModel).sample(course, phase, 0, phase === "return" ? state.returnStart ?? undefined : undefined);
          for (let k = 1; k <= 96; k++) {
            const next = (model as BonkModel).sample(course, phase, duration * k / 96, phase === "return" ? state.returnStart ?? undefined : undefined);
            result.declaredClubTravel += angle(was.club, next.club); result.declaredChestTravel += angle(was.chest, next.chest); was = next;
          }
        }
        return result;
      });
      const least = state.samples.reduce<Sample | null>((a, b) => b.clearance.least !== null && (a?.clearance.least == null || b.clearance.least < a.clearance.least) ? b : a, null);
      const down = state.samples.some(one => one.down), gripped = state.samples.every(one => one.grip);
      const assistFor = (side: "left" | "right"): AssistRead & { balance: number } => ({
        balance: duel.recipe.balance?.[side] ?? duel.duelists[side].built.spec.attributes.balance.value,
        ...Object.fromEntries((["force", "moment", "ceilingForce", "ceilingMoment"] as const).map(key => [key, Math.max(0, ...state.samples.map(one => one.assists[side][key]))])) as AssistRead,
      });
      const assists = { left: assistFor("left"), right: assistFor("right") };
      const assisted = Object.values(assists).some(one => one.balance !== 0 || one.force !== 0 || one.moment !== 0 || one.ceilingForce !== 0 || one.ceilingMoment !== 0);
      const after = state.recovered === null ? 0 : elapsed(world.time, state.recovered);
      const shape = state.course ? (model as BonkModel).shape(state.course) : null;
      const unreferenced = state.samples.filter(one => one.reference === null).length;
      const gates = {
        preparation: state.entry !== null && state.committed !== null && elapsed(state.committed, state.entry.time) <= BONK_LIMITS.prepare && state.preparedHold >= BONK_LIMITS.chamberHold
          && state.chamberAbove !== null && state.chamberAbove >= BONK_LIMITS.chamberAbove,
        stroke: state.committed !== null && state.end !== null && ["endpoint", "impact withdrawal"].includes(state.end.reason)
          && elapsed(state.end.at, state.committed) <= BONK_LIMITS.stroke && !prolonged && phases[1]!.handError <= BONK_LIMITS.handError
          && phases[1]!.swellError <= BONK_LIMITS.swellError && phases[1]!.backward <= BONK_LIMITS.backward
          && phases[1]!.outsideShaftTravel >= BONK_LIMITS.sweep[0] && phases[1]!.outsideShaftTravel <= BONK_LIMITS.sweep[1],
        control: state.course !== null && unreferenced === 0 && phases.every(one => one.steps > 0 && one.clubError <= BONK_LIMITS.angleError && one.chestError <= BONK_LIMITS.angleError && one.tilt <= BONK_LIMITS.tilt
          && one.outsideClubTravel - one.declaredClubTravel <= BONK_LIMITS.excessTurn && one.outsideChestTravel - one.declaredChestTravel <= BONK_LIMITS.excessTurn
          && one.outsideWristReversals.every(value => value <= BONK_LIMITS.wristReversal)),
        contact: state.hit !== null && state.hit.descent >= BONK_LIMITS.descent,
        recovery: state.end !== null && state.recovered !== null && elapsed(state.recovered, state.end.at) <= BONK_LIMITS.return
          && state.ownerEnded !== null && state.settledAtRelease === true && ownership.handovers.every(one => one.settled),
        safety: !down && gripped && !assisted && least !== null && least.clearance.least !== null && least.clearance.least >= 0 && after >= BONK_LIMITS.after,
        coverage: false as const,
      };
      return { ...fixtureReading ? { fixture: fixtureReading } : {}, effectiveness: { ...state.effectiveness }, limits: BONK_LIMITS, harness: { engine: world.physics.engine, hz: world.hz, commandDelay: world.delay / world.hz,
        decisionRate: (duel.recipe.minds?.left as { readonly rate?: number } | undefined)?.rate ?? null, observationDelay: senseDelayOf(duel.recipe) },
        coverage: { course: state.course !== null && !state.courseFault && unreferenced === 0 && shape?.failures.length === 0, nativeSteps: state.samples.length > 0, unreferencedSteps: unreferenced,
          clearance: state.samples.length > 0 && state.samples.every(one => one.clearance.pairs > 0),
          entryWindow: Boolean(fixtureReading?.admission?.standing && fixtureReading.placed && !fixtureReading.faults.includes("normalized entry was not reached")),
          fixtures: fixtureReading !== undefined && fixtureReading.faults.length === 0, repetition: false, cancellationBoundary: false },
        course: state.course, shape, courseFault: state.courseFault, admitted: state.entry?.time ?? null, committed: state.committed, physicalEnd: state.end,
        recovered: state.recovered, ownerEnded: state.ownerEnded, chamberHold: state.preparedHold, chamberAbove: state.chamberAbove, guardHold: state.guardHold, settledAtRelease: state.settledAtRelease,
        handovers: ownership.handovers,
        collision: { first: state.firstContact, last: state.lastContact, until, prolonged }, contact: state.hit, phases,
        safety: { least: least?.clearance.least ?? null, pair: least?.clearance.pair ?? null, pairsPerStep: state.samples[0]?.clearance.pairs ?? 0,
          exclusions: state.samples[0]?.clearance.excluded ?? [],
          at: least?.time ?? null, down, gripped, assists, watchedAfterRecovery: after }, gates,
        failures: [...Object.entries(gates).filter(([, passed]) => !passed).map(([gate]) => gate), ...state.courseFault ? [state.courseFault] : [], ...fixtureReading?.faults ?? []], passed: false };
    },
  };
}
