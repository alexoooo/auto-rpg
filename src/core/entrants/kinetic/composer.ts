import type { Body, BodyCommand, BodyView } from "../../body.ts";
import { bodyEffectors } from "../../control/effectors.ts";
import type { EffectorGoal, MusclePush, PointTask } from "../../control/motor.ts";
import type { StanceGoal } from "../../control/stance.ts";
import { footStatesOf } from "../../control/support.ts";
import { stockClearance } from "../../mind/clear-step.ts";
import type { Intent } from "../../mind/intent.ts";
import type { Navigator } from "../../mind/navigator.ts";
import type { Tactics } from "../../mind/tactics.ts";
import type { HandPose } from "../../spec/body.ts";
import type { ActionAround, ActionClaim, Resource } from "../../skills/action.ts";
import { actionInstances, type ActionBinding, type ActionContact, type ExecutorBinding } from "../../skills/action-instances.ts";
import { actionResources } from "../../skills/action-resources.ts";
import { navigated, type Holders } from "../../skills/arbiter.ts";
import type { GuardSkill } from "../../skills/guard.ts";
import { STANCE_LOWER, type Locomotion } from "../../skills/locomotion.ts";
import type { LegsAsk } from "../../skills/skill.ts";
import type { Skills } from "../../skills/skills.ts";

/**
 * **A body's parts, as Kinetic gives them out**: the legs, the trunk, and each arm with its hand.
 * Each has one owner a step: the commitment that holds it, or the defaults.
 */
export type BodyPart = "legs" | "trunk" | "arm.left" | "arm.right";

const PARTS: readonly BodyPart[] = Object.freeze(["legs", "trunk", "arm.left", "arm.right"]);

/** A write the composer refused this step: whose (an action's name, or `"tactics"`), on what, and why. */
export interface Refusal {
  readonly by: string;
  readonly write: string;
  readonly reason: string;
}

/** What Kinetic's body layer is made from: its legs, guard, navigation, and the executors its actions are carried out by. */
export interface KineticParts {
  readonly legs: Locomotion;
  readonly guard: GuardSkill;
  readonly navigation: Navigator | null;
  readonly executors: readonly ExecutorBinding[];
  readonly actions: readonly ActionBinding[];
}

/** The part a resource an executor holds is (`Executor.needs`): a hand's arm, a foot's legs; null for one Kinetic does not give out. */
function partOfResource(resource: Resource): BodyPart | null {
  if (resource === "legs" || resource === "trunk") return resource;
  if (resource === "hand.left") return "arm.left";
  if (resource === "hand.right") return "arm.right";
  if (resource === "foot.left" || resource === "foot.right") return "legs";
  return null;
}

/** Why the composer refuses a write to `part` by one that holds `held`, or null where it takes it. */
function refusalOf(part: BodyPart, held: readonly BodyPart[]): string | null {
  if (!held.includes(part)) return `it does not hold the ${part}`;
  if (part === "legs") return "the legs go only through the stance";
  return null;
}

/**
 * **Kinetic's body layer**: the action lifecycle the game's skills share (`actionInstances`: its
 * admission, ledger and contacts), under a composer of its own that makes each step's
 * `BodyCommand` part by part (`BodyPart`).
 *
 * - A live action holds the parts its executor needs; the rest are the defaults'. Two actions on
 *   one part is a defect.
 * - An action's claim writes only the parts it holds, and the legs only through the stance: its
 *   walk, its facing turned by its `steer`, how low it stands, a footing. A posture, push, point or
 *   goal on a leg's channel or on a part it does not hold is refused, not written, and the
 *   refusal is reported (`refused`); so are a low support and a delegation, which it does not give.
 * - The defaults: the legs walk and face as the intent asks, its movement made a walk by the
 *   navigation (`navigated`); each free arm holds the guard, covers as the intent asks, takes its
 *   free hand's pose and hold, and swings with the walk where the walk swings it.
 *
 * The legs' walk is the stance's (`Locomotion.goal`): a gait that would drive the legs itself is
 * walked in the stance. Its report is the skills' (`SkillReport`), with each part's holder.
 */
export function kineticSkills(body: Pick<Body, "built" | "muscles" | "view" | "envelope" | "afterPhysics">, tactics: Pick<Tactics, "state" | "engagement">, parts: KineticParts) {
  const { legs, guard, navigation, executors, actions } = parts;
  const effectors = bodyEffectors(body.built).map((e) => e.model), feet = footStatesOf(body.built).map((f) => f.segment.spec.name);
  const resources = actionResources(body.muscles.channels.map((c) => c.name), effectors, feet, body.built.handPoses.model.map((hand) => hand.segment));
  const instances = actionInstances(executors, actions, resources);
  for (const action of actions) for (const effector of action.effectors) for (const need of instances.needs(action.name, effector)) {
    if (partOfResource(need) === null) throw new Error(`Kinetic gives out no ${need}, which ${action.name} holds`);
  }
  /** Each channel's part: an arm's chain, a foot's chain (the legs), or the trunk. */
  const channelPart = new Map<string, BodyPart>();
  const segmentPart = new Map<string, BodyPart>();
  for (const model of effectors) {
    const part = model.segment === "hand.left" ? "arm.left" : model.segment === "hand.right" ? "arm.right" : feet.includes(model.segment) ? "legs" : null;
    if (!part) continue;
    segmentPart.set(model.segment, part);
    for (const channel of model.channels) channelPart.set(channel, part);
  }
  for (const channel of body.muscles.channels) if (!channelPart.has(channel.name)) channelPart.set(channel.name, "trunk");
  const partOfSegment = (segment: string): BodyPart => segmentPart.get(segment) ?? "trunk";
  const state = { actions: instances.state, legs: legs.state, navigation: navigation?.state ?? null, guard: guard.state ?? null, tactics: tactics.state ?? null,
    /** Each part's holder this step, by part: an action's id, or the defaults. */
    owners: Object.fromEntries(PARTS.map((part) => [part, "default"])) as Holders,
    /** The writes refused this step (`Refusal`), and how many since the body was made. */
    refused: [] as Refusal[], refusals: 0,
    /** Whether the last step's legs let a walk through: what a route may ask of them now. */
    walkable: true };
  const contacts: ActionContact[] = [];
  const stopObserving = body.afterPhysics((step, time) => {
    contacts.length = 0;
    for (const [effector, observation] of Object.entries(body.view.effectors)) for (const pair of observation.feedback?.pairs ?? []) {
      contacts.push({ effector, target: pair.target, loaded: pair.loaded, onset: pair.onset });
    }
    instances.observe(step, time, contacts);
  });
  const report = {
    get heading() { return legs.heading; }, get pace() { return legs.pace; }, get reference() { return legs.reference ?? null; },
    get actions() { return instances.live; }, get ledger() { return instances.ledger; }, holders: state.owners, reservations: {} as Record<string, number>,
    get engagement() { return tactics.engagement; },
    /** The writes the composer refused this step (`Refusal`). */
    get refused(): readonly Refusal[] { return state.refused; },
    ...(navigation ? { navigation: navigation.report } : {}),
  };
  const refuse = (by: string, write: string, reason: string): void => { state.refused.push({ by, write, reason }); state.refusals += 1; };
  const resume = (view: BodyView): void => { instances.resume(view); legs.resume(view); guard.resume(view); navigation?.resume(); };
  const skills: Skills & { readonly report: typeof report } = {
    state, report, resume, instance: instances.instance, readiness: instances.readiness, needs: instances.needs,
    clearance: navigation ?? stockClearance(body.built.spec),
    get envelope() { return legs.envelope ?? null; },
    gait: { get envelope() { return legs.envelope ?? null; }, get stopping() { return legs.stopping; } },
    release(view, reason = "takeover") {
      instances.interrupt(view, reason); legs.resume(view); guard.resume(view); navigation?.resume();
      if (reason === "replaced") stopObserving();
      for (const part of PARTS) state.owners[part] = "default";
      state.walkable = true;
    },
    command(view, requested, dt) {
      state.refused.length = 0;
      let asked: Intent = requested;
      if (!navigation && requested.movement) {
        refuse("tactics", "movement", "it has no navigation");
        const { movement: _, ...rest } = requested;
        asked = rest;
      }
      const intent = navigated(navigation, { view, report }, legs, body.envelope, asked, dt, state.walkable);
      const around: ActionAround = { heading: legs.heading, placed: legs.placed ?? false, support: null, walk: intent.move, lower: intent.lower ?? STANCE_LOWER };
      if (intent.interrupt?.length) instances.stop(view, intent.interrupt, "its mind took what it held");
      instances.step(view, intent.actions, around, dt);
      for (const part of PARTS) state.owners[part] = "default";
      const claims: { readonly by: string; readonly held: readonly BodyPart[]; readonly claim: ActionClaim }[] = [];
      for (const item of instances.live) {
        const held: BodyPart[] = [];
        for (const resource of item.holds) {
          const part = partOfResource(resource)!;
          if (held.includes(part)) continue;
          if (state.owners[part] !== "default") throw new Error(`two actions hold the ${part}`);
          state.owners[part] = item.id;
          held.push(part);
        }
        claims.push({ by: item.action, held, claim: instances.executor(item.id).command(view, item.id, around) });
      }
      const free = (part: BodyPart): boolean => state.owners[part] === "default";
      const posture: Record<string, number> = {}, pushes: MusclePush[] = [], points: PointTask[] = [];
      const goals: Record<string, EffectorGoal | null> = {}, handPoses: Partial<Record<string, HandPose>> = {};
      // The free arms: the guard, its covers, its hands' poses and holds, and the walk's swing.
      for (const [channel, angle] of Object.entries(guard.posture)) if (free(channelPart.get(channel) ?? "trunk")) posture[channel] = angle;
      const covers = guard.command(view, intent.guard);
      for (const hand of guard.hands) {
        if (!free(partOfSegment(hand))) continue;
        goals[hand] = covers[hand] ?? null;
        const pose = guard.handPose?.(hand) ?? null;
        if (pose) handPoses[hand] = pose;
        const held = goals[hand] ? null : guard.hold?.(hand) ?? null;
        if (held) points.push(held);
      }
      const swung = legs.arms?.(view);
      if (swung) for (const model of effectors) {
        if (!guard.hands.includes(model.segment) || !free(partOfSegment(model.segment)) || goals[model.segment]) continue;
        for (const channel of model.channels) if (swung[channel] !== undefined) posture[channel] = swung[channel]!;
      }
      // The actions' claims, each on the parts it holds; the legs' only through the stance.
      let legsAsk: LegsAsk | null = null, lower = intent.lower, steer = 0;
      for (const { by, held, claim } of claims) {
        const take = (write: string, part: BodyPart): boolean => {
          const reason = refusalOf(part, held);
          if (reason) refuse(by, write, reason);
          return reason === null;
        };
        for (const [channel, angle] of Object.entries(claim.posture ?? {})) if (take(`posture ${channel}`, channelPart.get(channel) ?? "trunk")) posture[channel] = angle;
        for (const push of claim.pushes ?? []) if (take(`push ${push.channel}`, channelPart.get(push.channel) ?? "trunk")) pushes.push(push);
        for (const task of claim.points ?? []) if (take(`point ${task.segment}`, partOfSegment(task.segment))) points.push(task);
        for (const [segment, goal] of Object.entries(claim.effectors ?? {})) if (take(`goal ${segment}`, partOfSegment(segment))) goals[segment] = goal;
        for (const [segment, pose] of Object.entries(claim.handPoses ?? {})) if (take(`pose ${segment}`, partOfSegment(segment)) && pose) handPoses[segment] = pose;
        if (claim.support !== undefined) refuse(by, "support", "Kinetic gives no low support");
        if (claim.delegate?.length) refuse(by, "delegate", "Kinetic delegates nothing");
        if (held.includes("legs")) {
          legsAsk = claim.legs ?? { kind: "hold" };
          lower = claim.lower ?? lower;
          steer = claim.steer ?? 0;
        } else if (claim.legs !== undefined || claim.lower !== undefined || claim.steer !== undefined) refuse(by, "legs", "it does not hold the legs");
      }
      // The legs: the stance, as the action that holds them asks or the intent where none does.
      const ask: LegsAsk = legsAsk ?? { kind: "free" };
      let stance: StanceGoal | null;
      switch (ask.kind) {
        case "free": stance = legs.goal(view, intent.move, intent.face, dt, lower, intent.destination); break;
        case "hold": stance = legs.goal(view, null, intent.face, dt, lower, intent.destination); break;
        case "walk": stance = legs.goal(view, ask.walk, ask.face, dt, lower, intent.destination); break;
        case "place": stance = legs.place ? legs.place(view, ask.footing, lower) : legs.goal(view, null, legs.heading, dt, lower); break;
        default: { const never: never = ask; throw new Error(`unknown legs ask ${JSON.stringify(never)}`); }
      }
      if (stance && steer !== 0) stance = { ...stance, heading: stance.heading + steer };
      state.walkable = ask.kind === "free";
      const command: BodyCommand = { posture, pushes, points, effectors: goals, handPoses, stance };
      instances.snapshot();
      return command;
    },
  };
  return skills;
}
