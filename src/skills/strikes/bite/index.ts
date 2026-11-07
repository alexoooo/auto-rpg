import { segmentResource, LEG_RESOURCE, TRUNK_RESOURCE } from "../../framework/action.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { supportHeight } from "../../../control/support-reference.ts";
import { Quaternion, Vector3 } from "../../../core/math/vector.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import { channelName } from "../../../core/bodies/muscle/driver.ts";
import { pointAtToRef, rootFrameToRef, intoFrameToRef, type Frame } from "../../../control/kinematics.ts";
import type { EffectorGoal, FreedomPath } from "../../../control/motor.ts";
import { effectorFeedback } from "../../../control/effector-feedback.ts";
import { unintendedContact } from "../contact-response.ts";
import { scalarPathToRef } from "../../../control/point-path.ts";
import { nearestSurface } from "../../perception/targets.ts";
import { sensedActionTarget } from "../../framework/action-aim.ts";
import { atan2, cos, hypot, sin } from "../../../core/math/real.ts";
import { motionAtToRef, pointOfToRef, turnOfToRef } from "../../../core/bodies/read-motion.ts";
import type { BodyRef, ReadSegment } from "../../../core/bodies/read-body.ts";
import { advanceStrike, strikeTransition, STRIKE_EVENT, type StrikeCycleState } from "../strike-cycle.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, Window } from "../../framework/action.ts";
import type { ExecutorPart, ExecutorMaking } from "../../framework/executor-part.ts";
import type { LegsGoal } from "../../framework/skill.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import { gapePoints, jawOf, mouthOf, mouthToRef, fitsJaw } from "./jaw.ts";
import { pawReader } from "../../../control/quadruped/paws.ts";
import meta from "../../../../assets/skills/strikes/bite/bite.meta.json" with { type: "json" };
import { dataOf } from "../../../core/data/store.ts";
import { fitsAll, type PartConfig } from "../../../parts/parts.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../../framework/records.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";

/** Backward travel asked while the bite withdraws, m/s. */
const WITHDRAW_SPEED = 1.15;

/** The bite's settings, by name: `docs/reference/reptile.md#controller-settings`. */
const BITE_SETTINGS = Object.freeze(["prepare", "snap", "release", "open", "jawError", "jawClosed", "biteTimeout", "biteEntry", "bitePrepareNear",
  "biteElevation", "biteNear", "biteSlow", "biteHold", "biteReturnLimit", "contactAt", "closeRate", "biteResponse", "biteAlign", "biteShift",
  "contactSeconds", "biteSamples", "biteLead", "neckRetract"] as const);

/** **The bite's settings** (`BITE_SETTINGS`): the jaw's path, its reach and the strike cycle's limits, a body's record (`dataOf("bite")`). */
type BiteTuning = { readonly [K in (typeof BITE_SETTINGS)[number]]: number };

declare module "../../../core/data/store.ts" {
  interface DataOf {
    /** Every body's bite settings. */
    "bite": SkillRecords<BiteTuning>;
  }
}

/** Whether each setting `tuning` names is a known one, finite and nonnegative. */
const validBite = (tuning: Partial<BiteTuning>): boolean =>
  !!tuning && typeof tuning === "object" && !Array.isArray(tuning) && Object.entries(tuning).every(([key, value]) => (BITE_SETTINGS as readonly string[]).includes(key) && Number.isFinite(value) && value! >= 0
    && (key !== "prepare" && key !== "snap" || value! > 0));

/** Whether `tuning` holds every bite setting, each valid (`validBite`). */
export const wholeBite = (tuning: Partial<BiteTuning>): boolean => validBite(tuning) && BITE_SETTINGS.every((key) => Object.hasOwn(tuning, key));

/** Whether a body of `spec` has a bite, its jaw (`fitsJaw`) and its record of the bite, or a whole research `tuning` in its place. */
export const fitsBite = fitsAll<PartConfig & { readonly tuning?: Partial<BiteTuning> }>(fitsJaw, recordFault("bite", deepFreeze(meta.bodies), wholeBite),
  (spec, config) => wholeBite(biteSettings(spec, config)) ? null : "invalid bite settings");

/** The bite's settings on a body of `spec`: its record's, with `config`'s research tuning over them. */
export const biteSettings = (spec: BodySpec, config: { readonly tuning?: Partial<BiteTuning> }): BiteTuning => tunedSettings(dataOf("bite"), spec, config);

/** One bite under way: its request, the heading it bites along, its strike cycle and where it drives the jaw, the head and the lean this step. */
interface Live {
  request: ActionRequest;
  heading: number;
  cycle: StrikeCycleState;
  /** Where it aims, world: as the aim last gave it, held from the stroke's launch. */
  target: Vec3;
  /** Where the mouth goes, world: the target less the tooth's offset from the mouth, held through the stroke. */
  aim: Vec3;
  /** The tooth that meets the target, by its contact region's name; none, the jaw's bite point. */
  tooth: string | null;
  /** The head's path's count (`EffectorGoal.sequence`): a launch begins another. */
  reach: number;
  returnPitch: number;
  /** The centre of mass where the bite began, and the lean from it toward the aim, ground (x, z). */
  anchor: [number, number];
  shift: [number, number];
  /** The jaw's path: its count and whether it opens, its clock, where it started and how fast, and this step's angle, rate and acceleration. */
  jaw: { sequence: number; opening: boolean; time: number; start: number; rate: number; sample: [number, number, number] };
  neck: number;
  ending: ActionEnding;
  withdrawn: boolean;
}

/**
 * **The bite** of `body`'s jaw (`jawOf`), its actions `actions`, each aimed by `aim`: a finite
 * physical jaw stroke on the shared measured chamber, contact and withdrawal cycle
 * (`advanceStrike`), at `T`'s settings.
 *
 * - **Ready** where its aim gives a point (the first surface along the jaw's arc, for the stock
 *   one); else the body walks into its window: the target's nearest surface at the mouth's height
 *   (`biteElevation`) ahead of the mouth by the jaw's entry (the half-open bite point's reach from
 *   the lips and `biteEntry`), within `biteShift` either way.
 * - **The chamber** opens the jaw and brings the mouth over its aim, the body crouched no lower than
 *   standing on the crawl, leaning toward it within the paws' support (`biteShift`); **the stroke**
 *   closes the jaw, the head and the lean still driving the mouth onto the aim held from the launch;
 *   **the return** opens the jaw clear of what it bit, the neck drawn back while the head or the jaw
 *   still touches, and backs away on the crawl once it has had time to let go.
 * - It reads its jaw's and head's touch (`effectorFeedback`): a touch of anything but the target
 *   ends the stroke as blocked.
 *
 * It ends completed once the jaw is back; stalled at a deadline; interrupted where the body goes
 * down or the stroke lost its support; lost where the target is no longer aimed at before the
 * stroke; cancelled where its request is withdrawn before it.
 */
function biteExecutor(body: Body, actions: readonly string[], T: BiteTuning, aim: ExecutorMaking["aim"]): Executor {
  if (!wholeBite(T)) throw new Error("invalid bite settings");
  const built = body.built, muscles = body.muscles, jaw = jawOf(built.spec), { lower, hinge, head, neck, teeth } = mouthOf(built);
  const effector = jaw.head.name, footprint = Object.freeze([segmentResource(effector), LEG_RESOURCE, TRUNK_RESOURCE]);
  const jawName = channelName(hinge, 0), jawChannel = muscles.channel(jawName), tip = lower.spec.points!.bite!.value;
  const neckName = channelName(neck, 1), neckChannel = muscles.channel(neckName), retract = Math.max(neck.dofs[1]!.spec.min.value, -T.neckRetract);
  const paws = pawReader(built).state.endpoints, own = new Set<BodyRef>([...built.segments.values()].map((part) => part.body));
  const feedback = effectorFeedback(built, [lower.spec.name, head.spec.name], body.contactIdentity, undefined,
    { [lower.spec.name]: { point: "bite", regions: teeth.map((tooth) => tooth.name) }, [head.spec.name]: { point: "mouth" } });
  const frame: Frame = { position: new Vector3(), rotation: new Quaternion() }, root: Frame = { position: new Vector3(), rotation: new Quaternion() };
  const at = new Vector3(), point = new Vector3(), velocity = new Vector3(), carried = new Vector3(), spin = new Vector3(), inverse = new Quaternion();
  const offset = new Vector3(), mouth = new Vector3(), lips = jaw.mouth;
  const chamberPoint = pointAtToRef([hinge], [[T.open]], tip, new Vector3()), chamber: Vec3 = [chamberPoint.x, chamberPoint.y, chamberPoint.z];
  const strikePoint = new Vector3(), gape = gapePoints(lower, hinge, T.open);
  // The jaw's entry: how far ahead of the lips the half-open bite point meets a surface, and `biteEntry` past it.
  const contact = pointAtToRef([hinge], [[T.open * T.contactAt]], tip, new Vector3());
  const entry = hypot(contact.x - lips[0], contact.z - lips[2]) + T.biteEntry;
  const touching = (part: ReadSegment) => built.physics.contactsOf(part.body).some((c) => (!c.other || !own.has(c.other)) && c.impulse > 0);
  const state = { live: null as Live | null, launched: 0, returned: 0, failed: 0, aborted: 0, feedback: feedback.state };
  const accept = (y: number) => (at: Vec3) => Math.abs(at[1] - y) <= T.biteElevation;
  const withdrawing = (live: Live) => live.cycle.phase === "return" && live.cycle.time >= T.prepare + T.release && (touching(head) || touching(lower));
  const finish = (ending: ActionEnding): LifecycleUpdate => {
    const id = state.live!.request.id;
    state.live = null;
    return { id, ending };
  };
  const supported = (live: Live): boolean => {
    let loaded = 0;
    for (const paw of paws) if (paw.contact) loaded++;
    return loaded >= (live.cycle.phase === "swing" || live.cycle.phase === "return" ? paws.length - 1 : paws.length);
  };
  /** The stroke this step: the cycle advanced on the jaw as measured, and where it drives the jaw, the neck, the head and the lean. */
  const advance = (view: BodyView, live: Live, target: Vec3 | null, placed: boolean, dt: number): void => {
    const cycle = live.cycle, jawFeedback = feedback.state[lower.spec.name], headFeedback = feedback.state[head.spec.name];
    rootFrameToRef(head, frame); pointOfToRef(lower, tip, at);
    motionAtToRef(lower, at, velocity, spin); motionAtToRef(head, at, carried, spin);
    velocity.subtractInPlace(carried).applyRotationQuaternionToRef(Quaternion.InverseToRef(frame.rotation, inverse), velocity);
    const rate: Vec3 = [velocity.x, velocity.y, velocity.z];
    intoFrameToRef(frame, [at.x, at.y, at.z], point);
    const measured: Vec3 = [point.x, point.y, point.z];
    if (cycle.phase === "chamber" && target) live.target = [...target];
    const strokeTip = teeth.find((tooth) => tooth.name === live.tooth)?.tip ?? tip;
    const ground = Math.min(...paws.map((paw) => paw.ground));
    let openingFloor = Infinity;
    for (const low of gape) {
      point.set(...low.at).applyRotationQuaternionToRef(frame.rotation, point).addInPlace(frame.position);
      openingFloor = Math.min(openingFloor, point.y - low.radius);
    }
    pointAtToRef([hinge], [[T.open * T.contactAt]], strokeTip, strikePoint);
    offset.set(strikePoint.x - lips[0], strikePoint.y - lips[1], strikePoint.z - lips[2]).applyRotationQuaternionToRef(frame.rotation, offset);
    if (cycle.phase !== "swing") live.aim = [live.target[0] - offset.x, live.target[1] - offset.y, live.target[2] - offset.z];
    const angle = muscles.angle(jawChannel), clear = !touching(head) && !touching(lower);
    pointOfToRef(head, lips, mouth);
    const dx = mouth.x - live.aim[0], dy = mouth.y - live.aim[1], dz = mouth.z - live.aim[2];
    const ready = placed && supported(live);
    if ((cycle.phase === "chamber" || cycle.phase === "swing") && ready) {
      live.shift[0] -= dx * dt / T.prepare; live.shift[1] -= dz * dt / T.prepare;
      const distance = Math.sqrt(live.shift[0] * live.shift[0] + live.shift[1] * live.shift[1]);
      if (distance > T.biteShift) { live.shift[0] *= T.biteShift / distance; live.shift[1] *= T.biteShift / distance; }
    } else if (cycle.phase !== "chamber" && cycle.phase !== "swing") live.shift.fill(0);
    const prepared = openingFloor > ground + T.biteEntry && angle >= T.open - T.jawError && dx * dx + dy * dy + dz * dz <= T.biteAlign * T.biteAlign;
    const complete = cycle.phase === "swing" && cycle.time >= T.snap && angle < T.jawClosed;
    const foe = live.request.target.body, touch = jawFeedback?.contact, identity = touch?.target, obstruction = jawFeedback?.obstruction?.target;
    const blocked = unintendedContact(jawFeedback, foe) || unintendedContact(headFeedback, foe)
      || !!obstruction && !(obstruction.kind === "body" && obstruction.body === foe);
    const intended = !blocked && (touch ? identity?.kind === "body" && identity.body === foe : !jawFeedback?.impulse);
    if (touch) velocity.set(...touch.normal).applyRotationQuaternionToRef(Quaternion.InverseToRef(turnOfToRef(lower, inverse), inverse), velocity);
    const direction = jaw.piercing.direction;
    const aligned = !touch || velocity.x * direction[0] + velocity.y * direction[1] + velocity.z * direction[2] >= jaw.piercing.alignment;
    const phase = cycle.phase;
    const event = advanceStrike(cycle, { at: measured, velocity: rate, home: chamber, chamber: prepared ? measured : chamber,
      requested: !!target && !blocked, complete, down: view.down, supported: ready, prepared,
      released: clear && cycle.time >= T.release && angle >= T.open - T.jawError && Math.abs(muscles.angle(neckChannel)) <= T.jawError,
      touching: jawFeedback ? jawFeedback.impulse > 0 : touching(lower), intended, aligned,
      contactVelocity: rate, closing: muscles.rate(jawChannel) < 0, seconds: T.snap },
      { near: T.biteNear, slow: T.biteSlow, hold: T.biteHold, prepareLimit: T.biteTimeout, returnLimit: T.biteReturnLimit, followSeconds: T.snap,
        impact: { impactSeconds: T.contactSeconds } }, dt);
    if (event & STRIKE_EVENT.launch) { state.launched++; cycle.touching = false; live.reach = cycle.sequence; }
    if (event & STRIKE_EVENT.returned) state.returned++;
    if (event & STRIKE_EVENT.failed) {
      state.failed++;
      live.ending = { kind: "stalled", reason: phase === "chamber" ? "chamber deadline" : "withdrawal deadline" };
    }
    if (event & STRIKE_EVENT.aborted) { state.aborted++; live.ending = { kind: "interrupted", reason: "stroke lost support or met blocking contact" }; }
    if (phase === "chamber" && cycle.phase === "return" && !(event & STRIKE_EVENT.failed))
      live.ending = live.withdrawn ? { kind: "cancelled" } : { kind: "lost", reason: target ? "blocked before the stroke" : "target is no longer aimed at" };
    if (phase !== "return" && cycle.phase === "return") live.returnPitch = muscles.angle(neckChannel);
    const opening = cycle.phase === "chamber" || cycle.phase === "return", path = live.jaw;
    if (path.sequence !== cycle.sequence || path.opening !== opening) {
      path.sequence = cycle.sequence; path.opening = opening; path.time = 0; path.start = angle; path.rate = muscles.rate(jawChannel);
    } else path.time += dt;
    scalarPathToRef(path.start, path.rate, opening ? T.open : 0, path.time, opening ? T.prepare : T.snap, path.sample, cycle.phase === "swing" ? -T.closeRate : 0);
    live.neck = cycle.phase === "return" && !clear ? cycle.time >= T.prepare || openingFloor <= ground + T.biteEntry ? retract : live.returnPitch : 0;
  };
  return {
    state,
    needs: () => footprint,
    readiness(view, action, limb, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (limb !== effector) return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.live) return { kind: "waiting", reason: "a bite is under way" };
      mouthToRef(view, jaw, mouth);
      const centre = view.stance.centre, heading = around.heading, s = sin(heading), c = cos(heading);
      const ahead = (mouth.x - centre.x) * s + (mouth.z - centre.z) * c, across = (mouth.x - centre.x) * c - (mouth.z - centre.z) * s;
      const aimed = aim(view, target, action, limb);
      const near = aimed ? null : target.kind === "body" ? nearestSurface(view.senses, [mouth.x, mouth.y, mouth.z], accept(mouth.y), target.body, target.region) : null;
      const surface = aimed?.at ?? near?.at;
      if (!surface) return { kind: "blocked", reason: "no surface of the target at the jaw's height" };
      // The window: the surface ahead of the mouth by the jaw's entry, within its shift either way, faced within the angle the shift makes there.
      const along = ahead + entry;
      const window: Window = { at: surface, along: [along - T.biteShift, along + T.biteShift], across: [across - T.biteShift, across + T.biteShift],
        facing: atan2(T.biteShift, along), speed: T.biteSlow, ...(target.body === undefined ? {} : { on: target.body }) };
      return aimed ? { kind: "ready", window } : { kind: "position", window };
    },
    resume() { state.live = null; },
    start(view, request, around) {
      if (state.live) throw new Error("bite executor already owns an instance");
      const aimed = aim(view, request.target, request.action, request.effector);
      if (!aimed) throw new Error("bite target has no aim");
      const cycle: StrikeCycleState = { phase: null, time: 0, ready: 0, sequence: 0, velocity: [0, 0, 0], touching: false, impact: null };
      strikeTransition(cycle, "chamber", [0, 0, 0]);
      // The lean is measured from the centre of mass where the bite began, not from the gait's, which may trail it.
      state.live = { request: { ...request }, heading: around.heading, cycle, target: [...aimed.at], aim: [...aimed.at], tooth: aimed.with ?? null,
        reach: cycle.sequence, returnPitch: 0, anchor: [view.stance.centre.x, view.stance.centre.z], shift: [0, 0],
        jaw: { sequence: -1, opening: false, time: 0, start: 0, rate: 0, sample: [0, 0, 0] }, neck: 0, ending: { kind: "completed" }, withdrawn: false };
    },
    update(view, continued, around, dt) {
      feedback.read();
      const live = state.live;
      if (!live) return [];
      if (view.down) return [finish({ kind: "interrupted", reason: "body is down" })];
      const request = continued.find((one) => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      let target: Vec3 | null = null;
      if (live.cycle.phase === "chamber") {
        const aimed = live.withdrawn ? null : aim(view, live.request.target, live.request.action, live.request.effector);
        if (aimed) { target = aimed.at; live.tooth = aimed.with ?? live.tooth; }
      } else if (sensedActionTarget(view, live.request.target)) target = live.target;
      advance(view, live, target, around.placed, dt);
      if (live.cycle.phase === null) return [finish(live.ending)];
      const phase = live.cycle.phase === "chamber" ? "prepare" : live.cycle.phase === "swing" ? "commit" : "release";
      return [{ id: live.request.id, phase, stage: live.cycle.phase, holds: footprint, aim: live.target }];
    },
    command(view, id) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`bite executor has no instance ${id}`);
      const cycle = live.cycle, striking = cycle.phase === "chamber" || cycle.phase === "swing";
      let goal: EffectorGoal | null = null;
      if (striking) {
        rootFrameToRef(muscles.dynamics.root.segment, root); intoFrameToRef(root, live.aim, point);
        goal = { places: [{ point: "mouth", position: [point.x, point.y, point.z] }], seconds: cycle.phase === "swing" ? T.snap : T.prepare, follows: true, sequence: live.reach };
      }
      const sample = live.jaw.sample;
      const path: FreedomPath = { angle: sample[0], rate: sample[1], acceleration: sample[2],
        ...(cycle.phase === "swing" || cycle.phase === "return" ? { seconds: T.biteResponse } : {}) };
      const legs: LegsGoal = { walk: withdrawing(live) ? [-WITHDRAW_SPEED, 0] : null, face: live.heading, gait: "crawl", height: supportHeight(view),
        ...(striking ? { centre: [live.anchor[0] + live.shift[0], live.anchor[1] + live.shift[1]] as const } : {}) };
      return { posture: { [jawName]: sample[0], [neckName]: live.neck }, paths: { [jawName]: path }, effectors: { [effector]: goal }, legs };
    },
  };
}

/** **The bite**'s config: its kind, and an experiment's research `tuning` over its body's record, which a link does not carry. */
interface JawBiteConfig {
  readonly kind: "jaw-bite";
  readonly tuning?: Partial<BiteTuning>;
}

/**
 * **The bite** (`biteExecutor`): a stroke of the jaw of a body with one (`fitsJaw`), struck with its
 * head, which carries it, at a point its aim gives; its teeth pierce (`meets` "point").
 */
export const JAW_BITE: ExecutorPart<JawBiteConfig> = {
  role: "executor", requires: [SUPPORT_REFERENCE], label: "Bite", stage: "game", defaults: { kind: "jaw-bite" }, keys: { kind: true, tuning: true }, fields: [], slots: [],
  tuning: [...BITE_SETTINGS], fits: fitsBite, fitReads: ["bite"], reads: () => ["bite"],
  faults: (config) => config.tuning === undefined || validBite(config.tuning) ? [] : ["invalid bite tuning"],
  effectors: ["head"], aims: true, meets: "point",
  strikesWith: (spec, _config, effector) => jawOf(spec).head.name === effector,
  make: ({ body, aim }, config, actions) => biteExecutor(body, actions.map((action) => action.name), biteSettings(body.built.spec, config), aim),
};
