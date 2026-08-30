import type { ActionSpec, ControlGroupSpec } from "./actions.ts";
import type { ConstructBlueprint, JointSpec } from "./blueprint.ts";
import { StagedSupportedLocomotionPort, type LocomotionResolution,
  type LocomotionRequest, type SupportedLocomotionSample } from "../supported-locomotion.ts";
import { SUPPORTED_LOCOMOTION_V1 } from "../supported-locomotion-state.ts";
import type { LocomotionAuthorityToken, LocomotionSchedulerPort,
  LocomotionSubmission } from "./scheduler.ts";

export interface ResolvedSupportBinding {
  readonly role: string;
  readonly jointIds: readonly string[];
  readonly moduleId: string;
  readonly socketId: string;
  readonly terminalPartId: string;
}

/** Static topology evidence. Every ID in this record must still be checked against live damage. */
export interface ResolvedSupportCarrier {
  readonly carrierPartId: string;
  readonly rootPartId: string;
  readonly carrierToRootJointIds: readonly string[];
  readonly supportBindings: readonly ResolvedSupportBinding[];
  readonly criticalJointIds: readonly string[];
  readonly criticalModuleIds: readonly string[];
  readonly criticalPartIds: readonly string[];
}

const named = (group: ControlGroupSpec, detail: string): Error =>
  new Error(`locomotion group "${group.id}" ${detail}`);

/**
 * Resolve support from the saved topology, never from a chassis name or profile hint.
 *
 * A blueprint proves only what was assembled. `supportCarrierIsLive` is deliberately a second
 * operation because damage may detach any edge after this result was produced.
 */
export function resolveSupportCarrier(
  blueprint: ConstructBlueprint,
  group: ControlGroupSpec,
): ResolvedSupportCarrier {
  const joints = new Map(blueprint.joints.map((joint) => [joint.id, joint]));
  const sockets = new Map(blueprint.sockets.map((socket) => [socket.id, socket]));
  const modules = new Map(blueprint.modules.map((module) => [module.id, module]));
  const parentByChild = new Map(blueprint.joints.map((joint) => [joint.childPart, joint]));
  const supports: ResolvedSupportBinding[] = [];

  for (const [role, binding] of Object.entries(group.bindings)) {
    const contactModules = binding.modules.filter((id) => modules.get(id)?.kind === "contact-sensor");
    if (contactModules.length === 0) continue;
    if (binding.modules.length !== 1 || contactModules.length !== 1) {
      throw named(group, `support binding "${role}" must contain exactly one contact module`);
    }
    if (binding.joints.length === 0) throw named(group, `support binding "${role}" has no joint chain`);
    const chain = binding.joints.map((id) => {
      const joint = joints.get(id);
      if (!joint) throw named(group, `support binding "${role}" references missing joint "${id}"`);
      return joint;
    });
    for (let index = 1; index < chain.length; index += 1) {
      if (chain[index - 1].childPart !== chain[index].parentPart) {
        throw named(group, `support binding "${role}" is discontinuous between joints ` +
          `"${chain[index - 1].id}" and "${chain[index].id}"`);
      }
    }
    const module = modules.get(contactModules[0]);
    const socket = module ? sockets.get(module.socket) : undefined;
    if (!module || !socket) {
      throw named(group, `support binding "${role}" has detached contact module "${contactModules[0]}"`);
    }
    const terminalPartId = chain[chain.length - 1].childPart;
    if (socket.part !== terminalPartId) {
      throw named(group, `support binding "${role}" contact module "${module.id}" is attached to ` +
        `"${socket.part}" instead of terminal part "${terminalPartId}"`);
    }
    supports.push(Object.freeze({ role, jointIds: Object.freeze(chain.map(({ id }) => id)),
      moduleId: module.id, socketId: socket.id, terminalPartId }));
  }
  if (supports.length === 0) throw named(group, "has no support bindings with contact modules");

  const first = joints.get(supports[0].jointIds[0]) as JointSpec;
  const carrierPartId = first.parentPart;
  for (const support of supports.slice(1)) {
    const candidate = joints.get(support.jointIds[0]) as JointSpec;
    if (candidate.parentPart !== carrierPartId) {
      throw named(group, `support bindings resolve mixed carrier parents "${carrierPartId}" and ` +
        `"${candidate.parentPart}"`);
    }
  }

  const carrierToRoot: string[] = [];
  const pathParts = [carrierPartId];
  let cursor = carrierPartId;
  while (cursor !== blueprint.rootPart) {
    const edge = parentByChild.get(cursor);
    if (!edge) {
      throw named(group, `carrier "${carrierPartId}" is disconnected from blueprint root "${blueprint.rootPart}"`);
    }
    carrierToRoot.push(edge.id);
    cursor = edge.parentPart;
    pathParts.push(cursor);
  }

  const supportJointIds = supports.flatMap(({ jointIds }) => jointIds);
  const supportPartIds = supportJointIds.flatMap((id) => {
    const joint = joints.get(id) as JointSpec;
    return [joint.parentPart, joint.childPart];
  });
  return Object.freeze({
    carrierPartId,
    rootPartId: blueprint.rootPart,
    carrierToRootJointIds: Object.freeze(carrierToRoot),
    supportBindings: Object.freeze(supports),
    criticalJointIds: Object.freeze([...new Set([...carrierToRoot, ...supportJointIds])]),
    criticalModuleIds: Object.freeze(supports.map(({ moduleId }) => moduleId)),
    criticalPartIds: Object.freeze([...new Set([...pathParts, ...supportPartIds])]),
  });
}

/** Full/limp registrations may share a carrier; a body may not silently register two. */
export function resolveSupportCarrierSet(blueprint: ConstructBlueprint,
  groups: readonly ControlGroupSpec[]): ResolvedSupportCarrier {
  if (groups.length === 0) throw new Error("locomotion controller registration has no support groups");
  const resolved = groups.map((group) => ({ group, support: resolveSupportCarrier(blueprint, group) }));
  const first = resolved[0];
  const mismatch = resolved.slice(1).find(({ support }) =>
    support.carrierPartId !== first.support.carrierPartId);
  if (mismatch) {
    throw new Error(`locomotion groups "${first.group.id}" and "${mismatch.group.id}" resolve different ` +
      `carriers "${first.support.carrierPartId}" and "${mismatch.support.carrierPartId}"`);
  }
  return first.support;
}

export interface LiveSupportAvailability {
  readonly livingJointIds: ReadonlySet<string>;
  readonly installedModuleIds: ReadonlySet<string>;
  isPartAttached(id: string): boolean;
}

export interface LiveSupportValidation {
  readonly live: boolean;
  readonly reason: string | null;
}

/** The safe-boundary check run after `LiveConstructState` has reconciled queued detachments. */
export function supportCarrierIsLive(
  support: ResolvedSupportCarrier,
  availability: LiveSupportAvailability,
): LiveSupportValidation {
  const lostPart = support.criticalPartIds.find((id) => !availability.isPartAttached(id));
  if (lostPart) return Object.freeze({ live: false, reason: `critical locomotion part "${lostPart}" is detached` });
  const lostJoint = support.criticalJointIds.find((id) => !availability.livingJointIds.has(id));
  if (lostJoint) return Object.freeze({ live: false, reason: `critical locomotion joint "${lostJoint}" is not live` });
  const lostModule = support.criticalModuleIds.find((id) => !availability.installedModuleIds.has(id));
  if (lostModule) return Object.freeze({ live: false, reason: `critical locomotion module "${lostModule}" is not live` });
  return Object.freeze({ live: true, reason: null });
}

export interface LocomotionControllerDescriptor {
  readonly controller: string;
  readonly gaitStabilityScale: number;
  readonly brace: boolean;
}

/** Runtime-only authority. It is intentionally absent from every saved command and controller API. */
export interface LocomotionAuthority {
  readonly actionId: string;
  readonly groupId: string;
  readonly carrierPartId: string;
  readonly carrierToRootJointIds: readonly string[];
  readonly supportBindings: readonly ResolvedSupportBinding[];
  readonly balanceChainJointIds: readonly string[];
  readonly braceCapacityMultiplier: number;
  readonly gaitStabilityScale: number;
}

const continuousChain = (blueprint: ConstructBlueprint, ids: readonly string[], carrierPartId: string,
  rootPartId: string, context: string): void => {
  if (ids.length === 0) throw new Error(`${context} must name an ordered balance chain`);
  const joints = new Map(blueprint.joints.map((joint) => [joint.id, joint]));
  const chain = ids.map((id) => {
    const joint = joints.get(id);
    if (!joint) throw new Error(`${context} references missing balance joint "${id}"`);
    return joint;
  });
  let cursor = carrierPartId;
  let crossedRoot = cursor === rootPartId;
  for (const joint of chain) {
    if (joint.parentPart === cursor) cursor = joint.childPart;
    else if (joint.childPart === cursor) cursor = joint.parentPart;
    else throw new Error(`${context} is discontinuous at balance joint "${joint.id}"`);
    crossedRoot ||= cursor === rootPartId;
  }
  if (!crossedRoot) throw new Error(`${context} does not cross blueprint root "${rootPartId}"`);
};

/** Derive the private envelope from registration plus the action selected by the scheduler. */
export function deriveLocomotionAuthority(
  blueprint: ConstructBlueprint,
  group: ControlGroupSpec,
  action: ActionSpec,
  descriptor: LocomotionControllerDescriptor,
): LocomotionAuthority {
  if (action.group !== group.id) throw new Error(`action "${action.id}" does not belong to group "${group.id}"`);
  if (action.controller !== descriptor.controller) {
    throw new Error(`action "${action.id}" controller does not match its locomotion descriptor`);
  }
  if (!action.claims.includes("resource:balance")) {
    throw new Error(`locomotion action "${action.id}" must claim "resource:balance"`);
  }
  if (!Number.isFinite(descriptor.gaitStabilityScale) || descriptor.gaitStabilityScale <= 0 ||
      descriptor.gaitStabilityScale > 1) {
    throw new Error(`locomotion controller "${descriptor.controller}" stability scale must be within (0, 1]`);
  }
  const support = resolveSupportCarrier(blueprint, group);
  const balance = group.bindings["balance-chain"];
  if (!balance || balance.modules.length !== 0) {
    throw new Error(`locomotion group "${group.id}" must declare a module-free "balance-chain" binding`);
  }
  continuousChain(blueprint, balance.joints, support.carrierPartId,
    blueprint.rootPart, `locomotion controller "${descriptor.controller}"`);
  return Object.freeze({ actionId: action.id, groupId: group.id, carrierPartId: support.carrierPartId,
    carrierToRootJointIds: support.carrierToRootJointIds, supportBindings: support.supportBindings,
    balanceChainJointIds: Object.freeze([...balance.joints]),
    braceCapacityMultiplier: descriptor.brace ? SUPPORTED_LOCOMOTION_V1.BRACE_CAPACITY_MULTIPLIER : 1,
    gaitStabilityScale: descriptor.gaitStabilityScale });
}

/**
 * Construct bridge between the scheduler's private envelope and the pair command buffer.
 * Matching by action/group prevents cancellation of yesterday's low-priority action from
 * erasing the winning request that was staged earlier in today's priority walk.
 */
export class ConstructLocomotionPort implements LocomotionSchedulerPort {
  private readonly staged = new StagedSupportedLocomotionPort();
  private readonly resolveAuthority: (action: ActionSpec, group: ControlGroupSpec) => LocomotionAuthorityToken | null;
  private owner: string | null = null;

  constructor(resolveAuthority: (action: ActionSpec,
    group: ControlGroupSpec) => LocomotionAuthorityToken | null = () => null) {
    this.resolveAuthority = resolveAuthority;
  }

  authority(action: ActionSpec, group: ControlGroupSpec): LocomotionAuthorityToken | null {
    return this.resolveAuthority(action, group);
  }

  beginControlStep(): void { this.owner = null; this.staged.beginControlStep(); }
  request(value: LocomotionRequest): void { this.owner = "direct"; this.staged.request(value); }
  sample(): SupportedLocomotionSample { return this.staged.sample(); }
  commit(resolution: LocomotionResolution): void { this.staged.commit(resolution); }
  clear(reason: string): void { this.owner = null; this.staged.clear(reason); }
  clearAll(reason: string): void { this.clear(reason); }
  snapshot(): ReturnType<StagedSupportedLocomotionPort["snapshot"]> { return this.staged.snapshot(); }
  queueStabilityEvent(event: import("../supported-locomotion-state.ts").StabilityEvent): void {
    this.staged.queueStabilityEvent(event);
  }

  stage(submission: LocomotionSubmission): void {
    this.owner = `${submission.group}/${submission.action}`;
    this.staged.request(submission.request);
  }

  priorSample(_authority: LocomotionAuthorityToken): SupportedLocomotionSample {
    return Object.freeze({ request: this.staged.snapshot().committed?.allowed ?? null });
  }

  clearSubmission(action: string, group: string, _authority: LocomotionAuthorityToken, reason: string): void {
    if (this.owner !== `${group}/${action}`) return;
    this.owner = null;
    this.staged.clear(reason);
  }
}
