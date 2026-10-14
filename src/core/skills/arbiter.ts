import type { Intent } from "../mind/intent.ts";
import type { Tactics } from "../mind/tactics.ts";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import { bodyEffectors } from "../control/effectors.ts";
import type { EffectorGoal, MusclePush } from "../control/motor.ts";
import type { StanceGoal } from "../control/stance.ts";
import { footStatesOf } from "../control/support.ts";
import type { HandPose, Side } from "../spec/body.ts";
import type { ActionAround, ActionClaim, CommandPatch } from "./action.ts";
import { actionInstances, type ActionBinding, type ActionContact, type ExecutorBinding } from "./action-instances.ts";
import { actionResources } from "./action-resources.ts";
import { guardPosture, type GuardSkill } from "./guard.ts";
import { STANCE_LOWER, type Locomotion } from "./locomotion.ts";
import type { SupportSkill } from "./support-fold.ts";

/** Continuous services surround the independently owned action instances. */
export interface SkillParts {
  readonly executors: readonly ExecutorBinding[];
  readonly actions: readonly ActionBinding[];
  readonly legs: Locomotion;
  readonly guard: GuardSkill;
  readonly support?: SupportSkill | null;
}

/** One owner per concrete control, with defaults named and actions identified by instance id. */
export type Holders = Record<string, number | "default">;

/** Admit, update and compose all commitments through the same anatomical ownership map. */
export function skillSet(body: Pick<Body, "built" | "muscles" | "view" | "envelope" | "afterPhysics">, tactics: Pick<Tactics, "state" | "engagement">, services: SkillParts) {
  const { executors, actions } = services;
  const { legs, guard } = services, support = services.support ?? null;
  const models = bodyEffectors(body.built).map(e => e.model), feet = footStatesOf(body.built).map(f => f.segment.spec.name);
  const resources = actionResources(body.muscles.channels.map(c => c.name), models, feet);
  const allControls = resources.controls(Object.keys(resources.footprints)), supportControls = resources.controls(["legs", "trunk"]);
  const instances = actionInstances(executors, actions, resources), guarding = guardPosture(body.built.spec);
  const state = { actions: instances.state, legs: legs.state, support: support?.state ?? null, tactics: tactics.state ?? null,
    command: { posture: guarding, pushes: [], stance: null } as BodyCommand, owners: {} as Holders,
    reservations: {} as Record<string, number> };
  const claims: { id: number; claim: ActionClaim; controls: readonly string[]; delegated: readonly string[] }[] = [];
  const contacts: ActionContact[] = [];
  const around: ActionAround = { get heading() { return legs.heading; }, get placed() { return legs.placed; },
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
    get heading() { return legs.heading; }, get pace() { return legs.pace; }, get reference() { return legs.reference; },
    get actions() { return instances.live; }, get ledger() { return instances.ledger; }, holders: state.owners, reservations: state.reservations,
    get engagement() { return tactics.engagement; },
    ...(support ? { support: support.report } : {}),
  };
  const resume = (view: BodyView): void => {
    instances.resume(view); legs.resume(view); guard.resume(view); support?.resume(view);
  };
  return {
    state, report, resume, instance: instances.instance, readiness: instances.readiness,
    get envelope() { return legs.envelope; },
    release(view: BodyView, reason: "takeover" | "idle" | "replaced" = "takeover") {
      instances.interrupt(view, reason); legs.resume(view); guard.resume(view); support?.resume(view);
      if (reason === "replaced") stopObserving();
      for (const key in state.reservations) delete state.reservations[key];
      for (const control of allControls) state.owners[control] = "default";
    },
    command(view: BodyView, intent: Intent, dt: number): BodyCommand {
      const near = context(intent);
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
      const posture: Record<string, number> = {}, pushes: MusclePush[] = [], effectors: Record<string, EffectorGoal | null> = {};
      const handPoses: Partial<Record<Side, HandPose>> = {};
      for (const [channel, angle] of Object.entries(guarding)) if (available(`channel:${channel}`)) posture[channel] = angle;
      const covers = guard.command(view, intent.guard, null);
      for (const side of ["left", "right"] as const) {
        if (available(`effector:hand.${side}`)) effectors[`hand.${side}`] = covers[side];
        if (available(`pose:${side}`) && body.built.spec.segments.find(s => s.name === `hand.${side}`)?.handPoses) handPoses[side] = "open";
      }
      const legOwner = claims.find(item => item.controls.includes("stance"));
      const supportOwner = claims.find(item => item.claim.support !== undefined);
      const supportFree = supportControls.every(free);
      const supporting = support && (supportOwner || supportFree);
      const ask = legOwner?.claim.legs ?? (available("stance") ? { kind: "free" as const } : null);
      const lower = supporting ? STANCE_LOWER : legOwner?.claim.lower ?? intent.lower;
      let stance: StanceGoal | null = null;
      let moving: { walk: readonly [number, number] | null; face: number } | null = null;
      if (ask) switch (ask.kind) {
        case "free": moving = { walk: intent.move, face: intent.face }; break;
        case "hold": moving = { walk: null, face: intent.face }; break;
        case "walk": moving = { walk: ask.walk, face: ask.face }; break;
        case "place": stance = legs.place(view, ask.footing, lower); break;
        default: { const never: never = ask; throw new Error(`unknown legs ask ${JSON.stringify(never)}`); }
      }
      if (moving) {
        const drive = legs.drive?.(view, moving.walk, moving.face, dt, lower, intent.destination)
          ?? { kind: "stance" as const, goal: legs.goal(view, moving.walk, moving.face, dt, lower, intent.destination) };
        switch (drive.kind) {
          case "stance": stance = drive.goal; break;
          case "drive": {
            for (const [channel, angle] of Object.entries(drive.posture)) {
              if (!allControls.includes(`channel:${channel}`)) throw new Error(`unknown locomotion channel ${channel}`);
              if (available(`channel:${channel}`)) posture[channel] = angle;
            }
            resources.validatePatch(["legs"], { pushes: drive.pushes });
            pushes.push(...drive.pushes);
            break;
          }
          default: { const never: never = drive; throw new Error(`unknown locomotion command ${JSON.stringify(never)}`); }
        }
      }
      if (stance && legOwner?.claim.steer) stance = { ...stance, heading: stance.heading + legOwner.claim.steer };
      const swung = legs.arms?.(view);
      if (swung) for (const model of models) {
        if (!model.segment.startsWith("hand.") || !available(`effector:${model.segment}`) || effectors[model.segment]) continue;
        for (const channel of model.channels) if (swung[channel] !== undefined && available(`channel:${channel}`)) posture[channel] = swung[channel]!;
      }
      for (const { claim } of claims) {
        Object.assign(posture, claim.posture);
        pushes.push(...claim.pushes ?? []);
        Object.assign(effectors, claim.effectors);
        Object.assign(handPoses, claim.handPoses);
      }
      if (support && supporting) {
        support.tick(view, supportOwner?.claim.support ?? intent.lower ?? STANCE_LOWER, supportOwner ? false : !!intent.move, dt);
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
        base ??= immutableCommand({ posture, pushes, effectors, handPoses, stance });
        const patch = executor.overlay(view, item.id, base, near);
        if (patch) { resources.validatePatch(item.holds, patch); overlays.push({ id: item.id, patch }); }
      }
      const command: BodyCommand = { posture, pushes, effectors, handPoses, stance };
      for (const { id, patch } of overlays) {
        Object.assign(command.posture, patch.posture); Object.assign(command.effectors!, patch.effectors); Object.assign(command.handPoses!, patch.handPoses);
        if (patch.pushes) {
          const replaced = new Set(patch.pushes.map(p => p.channel));
          (command as { pushes: readonly MusclePush[] }).pushes = [...command.pushes.filter(p => !replaced.has(p.channel)), ...patch.pushes];
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
