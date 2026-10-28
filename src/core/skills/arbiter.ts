import { stockClearance } from "../mind/clear-step.ts";
import type { Intent } from "../mind/intent.ts";
import type { Tactics } from "../mind/tactics.ts";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import { bodyEffectors } from "../control/effectors.ts";
import type { EffectorGoal, MusclePush, PointTask } from "../control/motor.ts";
import type { StanceGoal } from "../control/stance.ts";
import { footStatesOf } from "../control/support.ts";
import type { HandPose } from "../spec/body.ts";
import type { ActionAround, ActionClaim, CommandPatch } from "./action.ts";
import { actionInstances, type ActionBinding, type ActionContact, type ExecutorBinding } from "./action-instances.ts";
import { actionResources } from "./action-resources.ts";
import type { GuardSkill } from "./guard.ts";
import { STANCE_LOWER, type Locomotion } from "./locomotion.ts";
import type { SupportSkill } from "./support-fold.ts";
import type { NavigationSight, Navigator } from "../mind/navigator.ts";
import type { LegsAsked, LegsGoal } from "./skill.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import { directMovement } from "../mind/movement.ts";
import { cos, hypot, sin } from "../math/real.ts";

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
export function skillSet(body: Pick<Body, "built" | "muscles" | "view" | "envelope" | "afterPhysics">, tactics: Pick<Tactics, "state" | "engagement">, services: SkillParts) {
  const { executors, actions } = services;
  const { legs, guard } = services, support = services.support ?? null;
  const navigation = services.navigation;
  const models = bodyEffectors(body.built).map(e => e.model), feet = footStatesOf(body.built).map(f => f.segment.spec.name);
  const resources = actionResources(body.muscles.channels.map(c => c.name), models, feet, body.built.handPoses.model.map(hand => hand.segment));
  const allControls = resources.controls(Object.keys(resources.footprints)), supportControls = resources.controls(["legs", "trunk"]);
  const instances = actionInstances(executors, actions, resources), guarding = guard.posture;
  const state = { actions: instances.state, legs: legs.state, navigation: navigation?.state ?? null, guard: guard.state ?? null, support: support?.state ?? null, tactics: tactics.state ?? null,
    command: { posture: guarding, pushes: [], stance: null } as BodyCommand, owners: {} as Holders,
    reservations: {} as Record<string, number>,
    /** Whether the last step's owner of the stance let a walk through: what a route may ask of the legs now. */
    walkable: true };
  const claims: { id: number; claim: ActionClaim; controls: readonly string[]; delegated: readonly string[] }[] = [];
  const contacts: ActionContact[] = [];
  const around: ActionAround = { get heading() { return legs.heading; }, get placed() { return legs.placed ?? false; },
    support: support?.report ?? null, walk: null, lower: STANCE_LOWER };
  const context = (intent: Intent): ActionAround => ({ ...around, walk: intent.move, lower: intent.lower ?? STANCE_LOWER });
  const free = (slot: string): boolean => state.reservations[slot] === undefined;
  const available = (slot: string): boolean => {
    if (free(slot)) return true;
    for (const item of claims) if (item.id === state.reservations[slot] && item.delegated.includes(slot)) return true;
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
    get actions() { return instances.live; }, get ledger() { return instances.ledger; }, holders: state.owners, reservations: state.reservations,
    get engagement() { return tactics.engagement; },
    ...(navigation ? { navigation: navigation.report } : {}),
    ...(support ? { support: support.report } : {}),
  };
  const resume = (view: BodyView): void => {
    instances.resume(view); legs.resume(view); guard.resume(view); support?.resume(view); navigation?.resume();
  };
  return {
    state, report, resume, instance: instances.instance, readiness: instances.readiness, needs: instances.needs,
    clearance: navigation ?? stockClearance(body.built.spec),
    get envelope() { return legs.envelope ?? null; },
    gait: { get envelope() { return legs.envelope ?? null; }, get stopping() { return legs.stopping; } },
    release(view: BodyView, reason: "takeover" | "idle" | "replaced" = "takeover") {
      instances.interrupt(view, reason); legs.resume(view); guard.resume(view); support?.resume(view);
      navigation?.resume();
      if (reason === "replaced") stopObserving();
      for (const key in state.reservations) delete state.reservations[key];
      for (const control of allControls) state.owners[control] = "default";
      state.walkable = true;
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
        const controls = resources.controls(item.holds), delegated = resources.controls(claim.delegate ?? []);
        for (const control of controls) {
          if (!free(control)) throw new Error(`two instances own ${control}`);
          state.owners[control] = item.id;
          state.reservations[control] = item.id;
        }
        claims.push({ id: item.id, claim, controls, delegated });
      }
      const legsAsked = claims.find(item => item.controls.includes("stance"))?.claim.legs;
      state.walkable = legsAsked ? legsAsked.walk === undefined && legsAsked.footing === undefined : available("stance");
      const posture: Record<string, number> = {}, pushes: MusclePush[] = [], points: PointTask[] = [], effectors: Record<string, EffectorGoal | null> = {};
      const handPoses: Partial<Record<string, HandPose>> = {};
      for (const [channel, angle] of Object.entries(guarding)) if (available(`channel:${channel}`)) posture[channel] = angle;
      const covers = guard.command(view, intent.guard);
      for (const hand of guard.hands) {
        if (available(`effector:${hand}`)) effectors[hand] = covers[hand] ?? null;
        const pose = available(`pose:${hand}`) ? guard.handPose?.(hand) ?? null : null;
        if (pose) handPoses[hand] = pose;
        const held = !effectors[hand] && available(`effector:${hand}`) ? guard.hold?.(hand) : null;
        if (held) points.push(held);
      }
      const legOwner = claims.find(item => item.controls.includes("stance"));
      const supportOwner = claims.find(item => item.claim.support !== undefined);
      const supportFree = supportControls.every(free);
      const supporting = support && (supportOwner || supportFree);
      const asked = legOwner?.claim.legs ?? (available("stance") ? {} : null);
      let stance: StanceGoal | null = null;
      let driven = false;
      if (asked) {
        // A fold under way holds the legs where they stand: a walk asked waits for it to rise.
        const goal = legsGoal(asked, intent, view, legs.heading, { waiting: !!support && !support.walks(), folding: !!supporting });
        const drive = legs.goal(view, goal, dt);
        switch (drive.kind) {
          case "stance": stance = drive.goal; break;
          case "drive": {
            for (const [channel, angle] of Object.entries(drive.posture)) {
              if (!allControls.includes(`channel:${channel}`)) throw new Error(`unknown locomotion channel ${channel}`);
              if (available(`channel:${channel}`)) posture[channel] = angle;
            }
            resources.validatePatch(["legs"], { pushes: drive.pushes });
            pushes.push(...drive.pushes);
            driven = true;
            break;
          }
          default: { const never: never = drive; throw new Error(`unknown locomotion command ${JSON.stringify(never)}`); }
        }
      }
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
      if (support && supporting) {
        // Legs a walk drives leave no stance to fold from: the fold waits for the walk to give them back.
        support.tick(view, supportOwner?.claim.support ?? intent.lower ?? STANCE_LOWER, (supportOwner ? false : !!intent.move) || driven, dt);
        const supportedPosture = Object.fromEntries(Object.entries(posture).filter(([channel]) => supportControls.includes(`channel:${channel}`)));
        const laid = support.apply(stance, supportedPosture);
        resources.validatePatch(["legs", "trunk"], laid);
        stance = laid.stance; Object.assign(posture, laid.posture);
      }
      let base: Readonly<BodyCommand> | null = null;
      const overlays: { id: number; patch: CommandPatch }[] = [];
      for (const item of instances.live) {
        const executor = instances.executor(item.id);
        if (!executor.overlay) continue;
        base ??= immutableCommand({ posture, pushes, points, effectors, handPoses, stance });
        const patch = executor.overlay(view, item.id, base, near);
        if (patch) { resources.validatePatch(item.holds, patch); overlays.push({ id: item.id, patch }); }
      }
      const command: BodyCommand = { posture, pushes, points, effectors, handPoses, stance };
      for (const { id, patch } of overlays) {
        Object.assign(command.posture, patch.posture); Object.assign(command.effectors!, patch.effectors); Object.assign(command.handPoses!, patch.handPoses);
        if (patch.pushes) {
          const replaced = new Set(patch.pushes.map(p => p.channel));
          (command as { pushes: readonly MusclePush[] }).pushes = [...command.pushes.filter(p => !replaced.has(p.channel)), ...patch.pushes];
        }
        if (patch.points) {
          const replaced = new Set(patch.points.map(p => p.segment));
          (command as { points: readonly PointTask[] }).points = [...(command.points ?? []).filter(p => !replaced.has(p.segment)), ...patch.points];
        }
        if (patch.stance !== undefined) (command as { stance: StanceGoal | null }).stance = patch.stance;
        if (!instances.live.some(item => item.id === id)) throw new Error("composition ended an action");
      }
      if (command.stance) for (const side of command.stance.feet) if (command.effectors?.[`foot.${side}`]) throw new Error(`two controllers own foot.${side}`);
      for (const control of allControls) if (available(control)) state.owners[control] = "default";
      state.command = immutableCommand(command);
      instances.snapshot();
      return state.command;
    },
  };
}

/**
 * **The legs goal the legs are given** (`LegsAsked`): `asked`, its walk and facing the intent's
 * where it leaves them out, and its height the intent's lowering under standing where it sets
 * none. A footing asked stands, facing the legs' `heading`. While a support fold is under way
 * (`waiting`) a walk waits for it to rise; while the fold lays the legs (`folding`,
 * `SupportSkill.apply`) the legs hold their own height.
 */
export function legsGoal(asked: LegsGoal, intent: Pick<Intent, "move" | "face" | "lower" | "destination">, view: Pick<BodyView, "standing">, heading: number,
  fold: { readonly waiting: boolean; readonly folding: boolean }): LegsAsked {
  const height = fold.folding ? undefined : asked.height ?? (intent.lower === undefined ? undefined : view.standing - intent.lower);
  if (asked.footing) return { ...asked, walk: null, face: heading, height };
  return { ...asked, walk: fold.waiting ? null : asked.walk !== undefined ? asked.walk : intent.move, face: asked.face ?? intent.face, height,
    destination: asked.destination ?? intent.destination };
}

/**
 * **`requested` with its movement made a walk**: the walk `navigation` takes toward the movement
 * asked, or the walk asked as a movement along its way, at the speed rule's speed under the goal's
 * ceiling (its own pace, or the walk's speed; asked to walk, no faster than the plain walk forward
 * of `envelope`), facing as asked or along the route where it asks to; a walk asked with no
 * movement kept clear of the solids sensed. Nothing walks where the legs are not `available`, and
 * with no navigation the walk goes as asked.
 */
export function navigated(navigation: Navigator | null, sight: NavigationSight, legs: Pick<Locomotion, "heading" | "envelope" | "stopping">, envelope: StanceEnvelope | null,
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

/** Overlay readers share immutable values without freezing an executor's own motion state. */
function immutableCommand(command: BodyCommand): Readonly<BodyCommand> {
  const copy = <T>(value: T): T => {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("an action command needs finite numbers");
    if (Array.isArray(value)) return Object.freeze(value.map(item => copy(item))) as T;
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const key in value) if (Object.hasOwn(value, key)) result[key] = copy(value[key]);
      return Object.freeze(result) as T;
    }
    return value;
  };
  return copy(command);
}
