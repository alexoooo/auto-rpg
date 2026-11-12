import type { StanceGoal } from "../../control/stance/goal.ts";
import type { Clearance } from "./navigation.ts";
import type { GaitLimits, Locomotion } from "./locomotion-part.ts";
import { kitOf, menuOf, type SpotFinder } from "./menu.ts";
import type { Intent } from "./intent.ts";
import type { Body, BodyCommand, BodyView } from "../../control/body.ts";
import { bodyEffectors } from "../../control/effectors.ts";
import type { EffectorGoal, FreedomPath, MusclePush, PointTask } from "../../control/motor.ts";
import type { SupportGoal } from "../../control/supported-motor.ts";
import type { ConfigurationName } from "../../core/bodies/spec/body.ts";
import { LEG_RESOURCE, type ActionAround, type ActionClaim } from "./action.ts";
import { actionInstances, type ActionBinding, type ActionContact, type ExecutorBinding } from "./action-instances.ts";
import { actionResources } from "./action-resources.ts";
import type { GuardSkill } from "./guard.ts";
import type { LowSupportSkill } from "./low-support.ts";
import type { NavigationSight, Navigator } from "./navigation.ts";
import { ALL_MET, type LegsAsked, type LegsGoal, type GaitName } from "./skill.ts";
import type { StanceEnvelope } from "../../control/stance/stance-envelope.ts";
import { directMovement } from "./movement.ts";
import { cos, hypot, sin } from "../../core/math/real.ts";
import { chainTo } from "../../control/kinematics.ts";
import { channelName } from "../../core/bodies/muscle/driver.ts";
import { attachment } from "../../core/bodies/read-body.ts";

/** Continuous services surround the independently owned action instances. */
interface SkillParts {
  readonly aims?: readonly object[];
  readonly executors: readonly ExecutorBinding[];
  readonly actions: readonly ActionBinding[];
  readonly legs: Locomotion;
  readonly guard: GuardSkill;
  /**
   * What turns the mind's movement requests into walks and keeps a walk asked clear of what is
   * sensed (`navigatorOf`); none, a movement request is refused and a walk goes as asked.
   */
  readonly navigation: Navigator | null;
  /** The supplied clearance policy; a navigator may supply its own. */
  readonly clearance: Clearance;
  /** Where the body stands to act on a window, for the menu's spots. */
  readonly spot: SpotFinder;
  readonly support?: LowSupportSkill | null;
}

/** One owner per concrete control, with defaults named and actions identified by instance id. */
export type Holders = Record<string, number | "default">;

/** Continuous command services attributed by the runtime that composes their writes. */
export type DefaultOwners = Record<string, "motor" | "guard" | "locomotion" | "support">;

/** Admit, update and compose all commitments through the same anatomical ownership map. */
export function skillSet(body: Pick<Body, "built" | "muscles" | "view" | "envelope" | "afterPhysics">, services: SkillParts) {
  const { executors, actions } = services;
  const { legs, guard } = services, support = services.support ?? null;
  const navigation = services.navigation;
  const models = bodyEffectors(body.built).map(e => e.model), feet = legs.supports.map(name => {
    const end = body.built.spec.ends?.find(end => end.name === name);
    if (!end) throw new Error(`unknown locomotion support ${name}`);
    const chain = chainTo(body.built, body.built.segments.get(end.segment)!);
    const from = "from" in end ? chain.findIndex(joint => joint.spec.name === end.from) : 0;
    return { name, segment: end.segment, channels: chain.slice(Math.max(0, from)).flatMap(joint => joint.dofs.map((_dof, k) => channelName(joint, k))) };
  });
  const resources = actionResources(body.muscles.channels.map(c => c.name), models, feet, body.built.configurations.model.map(hand => hand.segment),
    [...body.built.segments.values()].map(segment => ({ segment: segment.spec.name, channels: chainTo(body.built, segment).flatMap(joint => joint.dofs.map((_dof, k) => channelName(joint, k))) })));
  const allControls = resources.controls(resources.all), legsControls = resources.controls([LEG_RESOURCE]);
  const on = attachment(body.built);
  const instances = actionInstances(executors, actions, resources, { attached: (effector) => on(body.built.segments.get(effector)!) }), guarding = guard.posture;
  // The guard's posture is a constant: its channels are read once, not every step.
  const guardChannels = Object.keys(guarding), guardSlots = guardChannels.map((channel) => `channel:${channel}`);
  const chains: Readonly<Record<string, readonly string[]>> = Object.fromEntries(models.map((model) => [model.segment, model.channels]));
  const state = { actions: instances.state, aims: services.aims ?? [], legs: legs.state, navigation: navigation?.state ?? null, guard: guard.state ?? null, support: support?.state ?? null,
    command: { posture: guarding, pushes: [], stance: null } as BodyCommand, owners: {} as Holders, defaultOwners: {} as DefaultOwners,
    reservations: {} as Record<string, number>,
    /** The hands a cover drove at the last step (`GuardReport.covering`). */
    covering: [] as string[],
    /** Whether last step an action held the legs with no stance (`ActionClaim.legs` null): the services resume when none does. */
    unstanced: false,
    /** Whether the last step's owner of the stance let a walk through: what a route may ask of the legs now. */
    walkable: true };
  const claims: { id: number; claim: ActionClaim; controls: readonly string[]; unwritten: readonly string[] }[] = [];
  const contacts: ActionContact[] = [];
  const around: ActionAround = { get heading() { return legs.heading; }, get placed() { return legs.placed ?? false; },
    support: support?.report ?? null, walk: null, get lower() { return legs.lower; } };
  const context = (intent: Intent): ActionAround => ({ ...around, walk: intent.move, lower: intent.lower ?? legs.lower });
  const free = (slot: string): boolean => state.reservations[slot] === undefined;
  /** Whether the defaults write `slot`: no action holds it, or the one that holds it leaves it unwritten. */
  const available = (slot: string): boolean => {
    if (free(slot)) return true;
    for (let i = 0; i < claims.length; i++) { const item = claims[i]!; if (item.id === state.reservations[slot] && item.unwritten.includes(slot)) return true; }
    return false;
  };
  /** The claim that holds the stance this step, if any. */
  const stanceClaim = () => {
    for (let i = 0; i < claims.length; i++) if (claims[i]!.controls.includes("stance")) return claims[i];
    return undefined;
  };
  const stopObserving = body.afterPhysics((step, time) => {
    contacts.length = 0;
    for (const [effector, observation] of Object.entries(body.view.effectors)) for (const pair of observation.feedback?.pairs ?? []) {
      contacts.push({ effector, target: pair.target, loaded: pair.loaded, onset: pair.onset });
    }
    instances.observe(step, time, contacts);
  });
  const report = {
    legs: { get heading() { return legs.heading; }, get pace() { return legs.pace; }, get reference() { return legs.reference ?? null; }, get unmet() { return legs.unmet ?? ALL_MET; } },
    guard: { get covering() { return state.covering; } },
    get navigation() { return navigation?.report; },
    get actions() { return instances.live; }, get ledger() { return instances.ledger; }, holders: state.owners, defaultOwners: state.defaultOwners,
  };
  const resume = (view: BodyView): void => {
    instances.resume(view); legs.resume(view); guard.resume(view); support?.resume(view); navigation?.resume();
  };
  // The gaits' limits as last read: a new array where a limit has changed since, so a report holds what it read.
  // An envelope's quantities carry the rule that computed them, a function, so a gait's is copied as
  // data (as `structuredClone` copies, its enumerable fields) once for each envelope the legs give.
  let limits: readonly GaitLimits[] = [], envelopes: readonly (StanceEnvelope | null)[] = [];
  const gaitLimits = (): readonly GaitLimits[] => {
    const names = legs.gaits && legs.limitsOf ? legs.gaits : null, count = names ? names.length : 1;
    // A gait the legs have no limits for reads as none: no envelope, no stopping, no lag.
    const of = (i: number): Partial<GaitLimits> | null => names ? legs.limitsOf!(names[i]!) : legs;
    let same = limits.length === count;
    for (let i = 0; same && i < count; i++) {
      const was = limits[i]!, one = of(i);
      same = envelopes[i] === (one?.envelope ?? null) && Object.is(was.stopping, one?.stopping ?? 0) && Object.is(was.lag, one?.lag ?? 0);
    }
    if (!same) {
      const given = Array.from({ length: count }, (_, i) => of(i)?.envelope ?? null);
      limits = given.map((envelope, i) => {
        const one = of(i);
        return { envelope: envelope === envelopes[i] ? limits[i]!.envelope : envelope && structuredClone(envelope), stopping: one?.stopping ?? 0, lag: one?.lag ?? 0 };
      });
      envelopes = given;
    }
    return limits;
  };
  const kit = kitOf(executors, actions);
  return {
    state, report, resume,
    legs: {
      get envelope() { return legs.envelope ?? null; },
      limitsOf: (gait: GaitName) => legs.limitsOf?.(gait) ?? null,
      get gaits() { return gaitLimits(); },
    },
    navigation: { clearance: services.clearance },
    actions: {
      kit, menu: () => menuOf(kit, body.view, around, instances.readiness, services.spot, navigation?.report.request ?? null),
      instance: instances.instance, readiness: instances.readiness, needs: instances.needs, around,
    },
    release(view: BodyView, reason: "takeover" | "idle" | "replaced" = "takeover") {
      instances.interrupt(view, reason); legs.resume(view); guard.resume(view); support?.resume(view);
      navigation?.resume();
      if (reason === "replaced") stopObserving();
      for (const key in state.reservations) delete state.reservations[key];
      for (const control of allControls) { state.owners[control] = "default"; state.defaultOwners[control] = "motor"; }
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
      const live = instances.live;
      for (let i = 0; i < live.length; i++) {
        const item = live[i]!;
        const claim = instances.executor(item.id).command(view, item.id, near);
        resources.validate(item.holds, claim);
        const controls = resources.controls(item.holds), unwritten = controls.filter((control) => !writes(claim, control, legsControls, chains));
        for (let k = 0; k < controls.length; k++) {
          const control = controls[k]!;
          if (!free(control)) throw new Error(`two instances own ${control}`);
          state.owners[control] = item.id;
          state.reservations[control] = item.id;
        }
        claims.push({ id: item.id, claim, controls, unwritten });
      }
      const legOwner = stanceClaim(), legsAsked = legOwner?.claim.legs;
      state.walkable = legsAsked ? legsAsked.walk === undefined && legsAsked.footing === undefined : available("stance");
      const posture: Record<string, number> = {}, pushes: MusclePush[] = [], points: PointTask[] = [], effectors: Record<string, EffectorGoal | null> = {};
      const configurations: Partial<Record<string, ConfigurationName>> = {};
      for (let i = 0; i < allControls.length; i++) state.defaultOwners[allControls[i]!] = "motor";
      for (let i = 0; i < guardChannels.length; i++) {
        const channel = guardChannels[i]!, slot = guardSlots[i]!;
        if (available(slot)) { posture[channel] = guarding[channel]!; state.defaultOwners[slot] = "guard"; }
      }
      const covers = guard.command(view, intent.guard);
      state.covering.length = 0;
      for (let i = 0; i < guard.effectors.length; i++) {
        const hand = guard.effectors[i]!;
        if (available(`effector:${hand}`)) effectors[hand] = covers[hand] ?? null;
        if (effectors[hand]) { state.covering.push(hand); state.defaultOwners[`effector:${hand}`] = "guard"; }
        const pose = available(`pose:${hand}`) ? guard.configuration?.(hand) ?? null : null;
        if (pose) { configurations[hand] = pose; state.defaultOwners[`pose:${hand}`] = "guard"; }
        const held = !effectors[hand] && available(`effector:${hand}`) ? guard.hold?.(hand) : null;
        if (held) { points.push(held); state.defaultOwners[`effector:${hand}`] = "guard"; }
      }
      const asked = legOwner?.claim.legs !== undefined ? legOwner.claim.legs : available("stance") ? {} : null;
      const unstanced = legOwner?.claim.legs === null;
      if (state.unstanced && !unstanced) { legs.resume(view); guard.resume(view); support?.resume(view); navigation?.resume(); }
      state.unstanced = unstanced;
      let stance: StanceGoal | null = null, supported: SupportGoal | null = null, held: number | undefined;
      let assist: BodyCommand["assist"];
      for (let i = 0; i < claims.length; i++) { const claim = claims[i]!.claim; if (claim.assist) assist = claim.assist; }
      if (asked) {
        // A fold under way holds the legs where they stand: a walk asked waits for it to rise.
        let goal = legsGoal(asked, intent, view, legs.heading, { waiting: !!support && !support.walks() });
        if (support && support.carries(goal)) {
          support.tick(view, goal.height, !!goal.walk, dt);
          goal = support.lay(view, goal);
        }
        const drive = legs.goal(view, goal, dt, { idleSettle: !legOwner });
        if (drive.kind !== "drive" && drive.goal) for (let i = 0; i < legsControls.length; i++) if (available(legsControls[i]!)) state.defaultOwners[legsControls[i]!] = "locomotion";
        switch (drive.kind) {
          case "stance": stance = drive.goal; break;
          case "support": supported = drive.goal; break;
          case "drive": {
            if (drive.assist && available("assist")) { assist = drive.assist; state.defaultOwners.assist = "locomotion"; }
            for (const segment in drive.configurations) if (available(`pose:${segment}`)) { configurations[segment] = drive.configurations[segment]; state.defaultOwners[`pose:${segment}`] = "locomotion"; }
            for (const channel in drive.posture) {
              if (!Object.hasOwn(drive.posture, channel)) continue;
              if (!allControls.includes(`channel:${channel}`)) throw new Error(`unknown locomotion channel ${channel}`);
              if (available(`channel:${channel}`)) { posture[channel] = drive.posture[channel]!; state.defaultOwners[`channel:${channel}`] = "locomotion"; }
            }
            // The legs push their own channels, and any other no action holds: legs that hold the body whole.
            for (let i = 0; i < drive.pushes.length; i++) {
              const push = drive.pushes[i]!;
              if (legsControls.includes(`channel:${push.channel}`) || available(`channel:${push.channel}`)) { pushes.push(push); state.defaultOwners[`channel:${push.channel}`] = "locomotion"; }
            }
            held = drive.held;
            break;
          }
          default: { const never: never = drive; throw new Error(`unknown locomotion command ${JSON.stringify(never)}`); }
        }
      }
      // The fold's trunk, where no action holds it.
      if (support) for (const channel in support.report.posture) if (available(`channel:${channel}`)) { posture[channel] = support.report.posture[channel]!; state.defaultOwners[`channel:${channel}`] = "support"; }
      const swung = legs.arms?.(view);
      if (swung) for (let m = 0; m < models.length; m++) {
        const model = models[m]!;
        if (!guard.effectors.includes(model.segment) || !available(`effector:${model.segment}`) || effectors[model.segment]) continue;
        for (let i = 0; i < model.channels.length; i++) {
          const channel = model.channels[i]!;
          if (swung[channel] !== undefined && available(`channel:${channel}`)) { posture[channel] = swung[channel]!; state.defaultOwners[`channel:${channel}`] = "locomotion"; }
        }
      }
      const paths: Record<string, FreedomPath> = {};
      for (let i = 0; i < claims.length; i++) {
        const claim = claims[i]!.claim;
        Object.assign(posture, claim.posture);
        Object.assign(paths, claim.paths);
        pushes.push(...claim.pushes ?? []);
        points.push(...claim.points ?? []);
        Object.assign(effectors, claim.effectors);
        Object.assign(configurations, claim.configurations);
      }
      const command: BodyCommand = { posture, pushes, points, effectors, configurations, stance, ...(assist ? { assist } : {}), ...(supported ? { support: supported } : {}),
        ...(Object.keys(paths).length ? { paths } : {}), ...(held === undefined ? {} : { held }) };
      if (command.stance) for (let i = 0; i < command.stance.feet.length; i++) {
        const end = command.stance.feet[i]!;
        let k = 0;
        while (k < feet.length && feet[k]!.name !== end) k++;
        const segment = feet[k]?.segment;
        if (segment !== undefined && command.effectors?.[segment]) throw new Error(`two controllers own ${segment}`);
      }
      for (let i = 0; i < allControls.length; i++) { const control = allControls[i]!; if (available(control)) state.owners[control] = "default"; else delete state.defaultOwners[control]; }
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
    case "channel": return claim.posture?.[name] !== undefined || claim.paths?.[name] !== undefined || (claim.pushes ?? []).some((push) => push.channel === name);
    case "effector": return claim.effectors?.[name] !== undefined || (claim.points ?? []).some((task) => task.segment === name)
      || (chains[name] ?? []).some((channel) => writes(claim, `channel:${channel}`, legs, chains));
    case "pose": return claim.configurations?.[name] !== undefined;
    case "stance": return claim.legs !== undefined;
    case "assist": return claim.assist !== undefined;
    default: throw new Error(`no control ${control}`);
  }
}

/**
 * **The legs goal the legs are given** (`LegsAsked`): `asked`, its walk, facing and gait the
 * intent's where it leaves them out, and its height the intent's lowering under standing where it sets
 * none. A footing asked stands, facing the legs' `heading`. While a support fold is under way
 * (`waiting`) a walk waits for it to rise. Standing where a walk arrived (`Intent.rest`), on both
 * feet with no centre, pose or swing asked, the centre of mass is held over the place it arrived at.
 */
function legsGoal(asked: LegsGoal, intent: Pick<Intent, "move" | "face" | "lower" | "destination" | "gait" | "rest">, view: Pick<BodyView, "standing">, heading: number,
  fold: { readonly waiting: boolean }): LegsAsked {
  const height = asked.height ?? (intent.lower === undefined || view.standing === null ? undefined : view.standing - intent.lower);
  const gait = asked.gait ?? intent.gait, named = gait === undefined ? {} : { gait };
  if (asked.footing) return { ...asked, walk: null, face: heading, height, ...named };
  const walk = fold.waiting ? null : asked.walk !== undefined ? asked.walk : intent.move;
  const rests = walk === null && intent.rest !== undefined && asked.centre === undefined && asked.feet === undefined && asked.pose === undefined && asked.swing === undefined;
  return { ...asked, walk, face: asked.face ?? intent.face, height, destination: asked.destination ?? intent.destination, ...named,
    ...(rests ? { centre: intent.rest } : {}) };
}

/**
 * **`requested` with its movement made a walk**: the walk `navigation` takes toward the movement
 * asked, or the walk asked as a movement along its way, at the speed rule's speed under the goal's
 * ceiling (its own pace, or the walk's speed; asked to walk, no faster than the plain walk forward
 * of `envelope`), facing as asked or along the route where it asks to; a walk asked with no
 * movement kept clear of the solids sensed. Nothing walks where the legs are not `available`, and
 * with no navigation the walk goes as asked.
 */
function navigated(navigation: Navigator | null, sight: NavigationSight, legs: Pick<Locomotion, "heading" | "envelope" | "stopping" | "lag">, envelope: StanceEnvelope | null,
  requested: Intent, dt: number, available: boolean): Intent {
  const { view } = sight, h = legs.heading, velocity = requested.move;
  const request = requested.movement ?? (velocity ? directMovement(velocity[0] * sin(h) + velocity[1] * cos(h), velocity[0] * cos(h) - velocity[1] * sin(h)) : null);
  const ceiling = Math.min(requested.pace ?? (velocity && !requested.movement ? hypot(velocity[0], velocity[1]) : Infinity),
    requested.walk && envelope ? envelope.ways.forward.value : Infinity);
  const result = navigation?.step(sight, request, legs, ceiling, dt, available) ?? null;
  if (requested.movement && result) return { ...requested, move: result.move,
    face: requested.travelFacing ? result.face ?? requested.face : requested.face,
    ...(result.destination === undefined ? {} : { destination: result.destination }), ...(result.rest === undefined ? {} : { rest: result.rest }) };
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
