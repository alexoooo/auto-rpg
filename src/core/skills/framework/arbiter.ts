import { kitOf, menuOf } from "./menu.ts";
import type { GaitName } from "../locomotion/gaits.ts";
import { stockClearance } from "../../navigation/clear-step.ts";
import type { Intent } from "../../intent/intent.ts";
import type { Body, BodyCommand, BodyView } from "../../body.ts";
import { bodyEffectors } from "../../control/effectors.ts";
import type { EffectorGoal, MusclePush, PointTask } from "../../control/motor.ts";
import type { StanceGoal } from "../../control/stance.ts";
import { footStatesOf } from "../../control/support.ts";
import type { HandPose } from "../../spec/body.ts";
import type { ActionAround, ActionClaim } from "./action.ts";
import { actionInstances, type ActionBinding, type ActionContact, type ExecutorBinding } from "./action-instances.ts";
import { actionResources } from "./action-resources.ts";
import type { GuardSkill } from "../guard/guard.ts";
import { STANCE_LOWER, type Locomotion } from "../locomotion/locomotion.ts";
import { foldCarries, type SupportSkill } from "../locomotion/support-fold.ts";
import type { NavigationSight, Navigator } from "../../navigation/navigator.ts";
import { ALL_MET, type LegsAsked, type LegsGoal } from "./skill.ts";
import type { StanceEnvelope } from "../../control/stance-envelope.ts";
import { directMovement } from "../../intent/movement.ts";
import { cos, hypot, sin } from "../../math/real.ts";

/** Continuous services surround the independently owned action instances. */
export interface SkillParts {
  readonly executors: readonly ExecutorBinding[];
  readonly actions: readonly ActionBinding[];
  readonly legs: Locomotion;
  readonly guard: GuardSkill;
  /**
   * What turns the tactics' movement requests into walks and keeps a walk asked clear of what is
   * sensed (`navigatorOf`); none, a movement request is refused and a walk goes as asked.
   */
  readonly navigation: Navigator | null;
  readonly support?: SupportSkill | null;
}

/** One owner per concrete control, with defaults named and actions identified by instance id. */
export type Holders = Record<string, number | "default">;

/** Admit, update and compose all commitments through the same anatomical ownership map. */
export function skillSet(body: Pick<Body, "built" | "muscles" | "view" | "envelope" | "afterPhysics">, services: SkillParts) {
  const { executors, actions } = services;
  const { legs, guard } = services, support = services.support ?? null;
  const navigation = services.navigation;
  const models = bodyEffectors(body.built).map(e => e.model), feet = footStatesOf(body.built).map(f => f.segment.spec.name);
  const resources = actionResources(body.muscles.channels.map(c => c.name), models, feet, body.built.handPoses.model.map(hand => hand.segment));
  const allControls = resources.controls(Object.keys(resources.footprints)), legsControls = resources.controls(["legs"]);
  const instances = actionInstances(executors, actions, resources), guarding = guard.posture;
  const chains: Readonly<Record<string, readonly string[]>> = Object.fromEntries(models.map((model) => [model.segment, model.channels]));
  const state = { actions: instances.state, legs: legs.state, navigation: navigation?.state ?? null, guard: guard.state ?? null, support: support?.state ?? null,
    command: { posture: guarding, pushes: [], stance: null } as BodyCommand, owners: {} as Holders,
    reservations: {} as Record<string, number>,
    /** The hands a cover drove at the last step (`SkillReport.covering`). */
    covering: [] as string[],
    /** Whether last step an action held the legs with no stance (`ActionClaim.legs` null): the services resume when none does. */
    unstanced: false,
    /** Whether the last step's owner of the stance let a walk through: what a route may ask of the legs now. */
    walkable: true };
  const claims: { id: number; claim: ActionClaim; controls: readonly string[]; unwritten: readonly string[] }[] = [];
  const contacts: ActionContact[] = [];
  const around: ActionAround = { get heading() { return legs.heading; }, get placed() { return legs.placed ?? false; },
    support: support?.report ?? null, walk: null, lower: STANCE_LOWER };
  const context = (intent: Intent): ActionAround => ({ ...around, walk: intent.move, lower: intent.lower ?? STANCE_LOWER });
  const free = (slot: string): boolean => state.reservations[slot] === undefined;
  /** Whether the defaults write `slot`: no action holds it, or the one that holds it leaves it unwritten. */
  const available = (slot: string): boolean => {
    if (free(slot)) return true;
    for (const item of claims) if (item.id === state.reservations[slot] && item.unwritten.includes(slot)) return true;
    return false;
  };
  const stopObserving = body.afterPhysics((step, time) => {
    contacts.length = 0;
    for (const [effector, observation] of Object.entries(body.view.effectors)) for (const pair of observation.feedback?.pairs ?? []) {
      contacts.push({ effector, target: pair.target, loaded: pair.loaded, onset: pair.onset });
    }
    instances.observe(step, time, contacts);
  });
  const report = {
    get heading() { return legs.heading; }, get pace() { return legs.pace; }, get reference() { return legs.reference ?? null; },
    get legs() { return legs.unmet ?? ALL_MET; },
    get actions() { return instances.live; }, get ledger() { return instances.ledger; }, get covering() { return state.covering; }, holders: state.owners, reservations: state.reservations,
    ...(navigation ? { navigation: navigation.report } : {}),
    ...(support ? { support: support.report } : {}),
  };
  const resume = (view: BodyView): void => {
    instances.resume(view); legs.resume(view); guard.resume(view); support?.resume(view); navigation?.resume();
  };
  const kit = kitOf(executors, actions);
  return {
    state, report, resume, instance: instances.instance, readiness: instances.readiness, needs: instances.needs,
    kit, menu: () => menuOf(kit, body.view, around, instances.readiness),
    clearance: navigation ?? stockClearance(body.built.spec),
    get envelope() { return legs.envelope ?? null; },
    gait: { get envelope() { return legs.envelope ?? null; }, get stopping() { return legs.stopping; } },
    envelopeOf: (gait: GaitName) => legs.envelopeOf?.(gait) ?? null,
    release(view: BodyView, reason: "takeover" | "idle" | "replaced" = "takeover") {
      instances.interrupt(view, reason); legs.resume(view); guard.resume(view); support?.resume(view);
      navigation?.resume();
      if (reason === "replaced") stopObserving();
      for (const key in state.reservations) delete state.reservations[key];
      for (const control of allControls) state.owners[control] = "default";
      state.walkable = true;
      state.unstanced = false;
    },
    command(view: BodyView, requested: Intent, dt: number): BodyCommand {
      if (!navigation && requested.movement) throw new Error("a movement request to a skill set with no navigation");
      const intent = navigated(navigation, { view, report }, legs, body.envelope, requested, dt, state.walkable && (!support || support.walks()));
      const near = context(intent);
      if (intent.interrupt?.length) instances.stop(view, intent.interrupt, "its mind took what it held");
      instances.step(view, intent.actions, near, dt);
      for (const key in state.owners) delete state.owners[key];
      for (const key in state.reservations) delete state.reservations[key];
      claims.length = 0;
      for (const item of instances.live) {
        const claim = instances.executor(item.id).command(view, item.id, near);
        resources.validate(item.holds, claim);
        const controls = resources.controls(item.holds), unwritten = controls.filter((control) => !writes(claim, control, resources.footprints.legs, chains));
        for (const control of controls) {
          if (!free(control)) throw new Error(`two instances own ${control}`);
          state.owners[control] = item.id;
          state.reservations[control] = item.id;
        }
        claims.push({ id: item.id, claim, controls, unwritten });
      }
      const legsAsked = claims.find(item => item.controls.includes("stance"))?.claim.legs;
      state.walkable = legsAsked ? legsAsked.walk === undefined && legsAsked.footing === undefined : available("stance");
      const posture: Record<string, number> = {}, pushes: MusclePush[] = [], points: PointTask[] = [], effectors: Record<string, EffectorGoal | null> = {};
      const handPoses: Partial<Record<string, HandPose>> = {};
      for (const [channel, angle] of Object.entries(guarding)) if (available(`channel:${channel}`)) posture[channel] = angle;
      const covers = guard.command(view, intent.guard);
      state.covering.length = 0;
      for (const hand of guard.hands) {
        if (available(`effector:${hand}`)) effectors[hand] = covers[hand] ?? null;
        if (effectors[hand]) state.covering.push(hand);
        const pose = available(`pose:${hand}`) ? guard.handPose?.(hand) ?? null : null;
        if (pose) handPoses[hand] = pose;
        const held = !effectors[hand] && available(`effector:${hand}`) ? guard.hold?.(hand) : null;
        if (held) points.push(held);
      }
      const legOwner = claims.find(item => item.controls.includes("stance"));
      const asked = legOwner?.claim.legs !== undefined ? legOwner.claim.legs : available("stance") ? {} : null;
      const unstanced = legOwner?.claim.legs === null;
      if (state.unstanced && !unstanced) { legs.resume(view); guard.resume(view); support?.resume(view); navigation?.resume(); }
      state.unstanced = unstanced;
      let stance: StanceGoal | null = null, held: number | undefined;
      if (asked) {
        // A fold under way holds the legs where they stand: a walk asked waits for it to rise.
        let goal = legsGoal(asked, intent, view, legs.heading, { waiting: !!support && !support.walks() });
        if (support && foldCarries(goal)) {
          support.tick(view, goal.height, !!goal.walk, dt);
          goal = support.lay(view, goal);
        }
        const drive = legs.goal(view, goal, dt);
        switch (drive.kind) {
          case "stance": stance = drive.goal; break;
          case "drive": {
            for (const [channel, angle] of Object.entries(drive.posture)) {
              if (!allControls.includes(`channel:${channel}`)) throw new Error(`unknown locomotion channel ${channel}`);
              if (available(`channel:${channel}`)) posture[channel] = angle;
            }
            // The legs push their own channels, and any other no action holds: legs that hold the body whole.
            for (const push of drive.pushes) if (legsControls.includes(`channel:${push.channel}`) || available(`channel:${push.channel}`)) pushes.push(push);
            held = drive.held;
            break;
          }
          default: { const never: never = drive; throw new Error(`unknown locomotion command ${JSON.stringify(never)}`); }
        }
      }
      // The fold's trunk, where no action holds it.
      if (support) for (const channel in support.report.posture) if (available(`channel:${channel}`)) posture[channel] = support.report.posture[channel]!;
      const swung = legs.arms?.(view);
      if (swung) for (const model of models) {
        if (!guard.hands.includes(model.segment) || !available(`effector:${model.segment}`) || effectors[model.segment]) continue;
        for (const channel of model.channels) if (swung[channel] !== undefined && available(`channel:${channel}`)) posture[channel] = swung[channel]!;
      }
      for (const { claim } of claims) {
        Object.assign(posture, claim.posture);
        pushes.push(...claim.pushes ?? []);
        points.push(...claim.points ?? []);
        Object.assign(effectors, claim.effectors);
        Object.assign(handPoses, claim.handPoses);
      }
      const command: BodyCommand = { posture, pushes, points, effectors, handPoses, stance, ...(held === undefined ? {} : { held }) };
      if (command.stance) for (const side of command.stance.feet) if (command.effectors?.[`foot.${side}`]) throw new Error(`two controllers own foot.${side}`);
      for (const control of allControls) if (available(control)) state.owners[control] = "default";
      state.command = immutableCommand(command);
      instances.snapshot();
      return state.command;
    },
  };
}

/**
 * Whether `claim` writes `control`: a channel's posture or push; an effector's goal or point, or
 * any channel of its chain (`chains`, by segment), which a goal of the defaults' would take from
 * it; a hand's pose; a legs goal writes every control of the legs (`legs`, the stance and its
 * feet's chains), which the legs complete.
 */
function writes(claim: ActionClaim, control: string, legs: readonly string[], chains: Readonly<Record<string, readonly string[]>>): boolean {
  if (claim.legs !== undefined && legs.includes(control)) return true;
  const colon = control.indexOf(":"), kind = colon < 0 ? control : control.slice(0, colon), name = control.slice(colon + 1);
  switch (kind) {
    case "channel": return claim.posture?.[name] !== undefined || (claim.pushes ?? []).some((push) => push.channel === name);
    case "effector": return claim.effectors?.[name] !== undefined || (claim.points ?? []).some((task) => task.segment === name)
      || (chains[name] ?? []).some((channel) => writes(claim, `channel:${channel}`, legs, chains));
    case "pose": return claim.handPoses?.[name] !== undefined;
    case "stance": return claim.legs !== undefined;
    default: throw new Error(`no control ${control}`);
  }
}

/**
 * **The legs goal the legs are given** (`LegsAsked`): `asked`, its walk, facing and gait the
 * intent's where it leaves them out, and its height the intent's lowering under standing where it sets
 * none. A footing asked stands, facing the legs' `heading`. While a support fold is under way
 * (`waiting`) a walk waits for it to rise.
 */
function legsGoal(asked: LegsGoal, intent: Pick<Intent, "move" | "face" | "lower" | "destination" | "gait">, view: Pick<BodyView, "standing">, heading: number,
  fold: { readonly waiting: boolean }): LegsAsked {
  const height = asked.height ?? (intent.lower === undefined ? undefined : view.standing - intent.lower);
  const gait = asked.gait ?? intent.gait, named = gait === undefined ? {} : { gait };
  if (asked.footing) return { ...asked, walk: null, face: heading, height, ...named };
  return { ...asked, walk: fold.waiting ? null : asked.walk !== undefined ? asked.walk : intent.move, face: asked.face ?? intent.face, height,
    destination: asked.destination ?? intent.destination, ...named };
}

/**
 * **`requested` with its movement made a walk**: the walk `navigation` takes toward the movement
 * asked, or the walk asked as a movement along its way, at the speed rule's speed under the goal's
 * ceiling (its own pace, or the walk's speed; asked to walk, no faster than the plain walk forward
 * of `envelope`), facing as asked or along the route where it asks to; a walk asked with no
 * movement kept clear of the solids sensed. Nothing walks where the legs are not `available`, and
 * with no navigation the walk goes as asked.
 */
function navigated(navigation: Navigator | null, sight: NavigationSight, legs: Pick<Locomotion, "heading" | "envelope" | "stopping">, envelope: StanceEnvelope | null,
  requested: Intent, dt: number, available: boolean): Intent {
  const { view } = sight, h = legs.heading, velocity = requested.move;
  const request = requested.movement ?? (velocity ? directMovement(velocity[0] * sin(h) + velocity[1] * cos(h), velocity[0] * cos(h) - velocity[1] * sin(h)) : null);
  const ceiling = Math.min(requested.pace ?? (velocity && !requested.movement ? hypot(velocity[0], velocity[1]) : Infinity),
    requested.walk && envelope ? envelope.ways.forward.value : Infinity);
  const result = navigation?.step(sight, request, legs, ceiling, dt, available) ?? null;
  if (requested.movement && result) return { ...requested, move: result.move,
    face: requested.travelFacing ? result.face ?? requested.face : requested.face,
    ...(result.destination === undefined ? {} : { destination: result.destination }) };
  if (navigation && view.senses.solids?.length && velocity) return { ...requested, move: navigation.steer(view, h, velocity) };
  return requested;
}

/** The step's command frozen through: its readers share it without freezing an executor's own motion state. Its numbers are finite, but a push's speed, which may be unbounded (`MusclePush`). */
function immutableCommand(command: BodyCommand): Readonly<BodyCommand> {
  // `push`: the value is a push's, whose speed may be unbounded.
  const copy = <T>(value: T, push = false, unbounded = false): T => {
    if (typeof value === "number" && (unbounded ? Number.isNaN(value) : !Number.isFinite(value))) throw new Error("an action command needs finite numbers");
    if (Array.isArray(value)) return Object.freeze(value.map(item => copy(item, push))) as T;
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const key in value) if (Object.hasOwn(value, key)) result[key] = copy(value[key], key === "pushes", push && key === "speed");
      return Object.freeze(result) as T;
    }
    return value;
  };
  return copy(command);
}
