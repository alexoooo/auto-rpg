import type { BodyCommand } from "../../control/body.ts";
import type { EffectorModel } from "../../control/effectors.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { hasResource, LEG_RESOURCE, segmentResource, poseResource, ASSIST_RESOURCE, TRUNK_RESOURCE, type ActionClaim, type Resource } from "./action.ts";
import type { BearingEnd } from "../../core/bodies/spec/body.ts";

/** One compiled map serves both admission conflicts and command-write validation. */
export interface ResourceMap {
  readonly all: readonly Resource[];
  overlap(a: readonly Resource[], b: readonly Resource[]): boolean;
  controls(resources: readonly Resource[]): readonly string[];
  validate(resources: readonly Resource[], claim: ActionClaim): void;
  validatePatch(resources: readonly Resource[], patch: Partial<BodyCommand>): void;
}

/**
 * Compile anatomical chains, segment configuration actuators and the stance's support limbs (its
 * feet, each by its end's name and its segment) into concrete control slots.
 */
export function actionResources(channels: readonly string[], effectors: readonly EffectorModel[], feet: readonly { readonly name: BearingEnd; readonly segment: string; readonly channels: readonly string[] }[],
  posable: readonly string[], segments: readonly { readonly segment: string; readonly channels: readonly string[] }[] = []): ResourceMap {
  const support = feet.map((foot) => foot.segment);
  const all: Resource[] = [];
  const put = (resource: Resource, controls: readonly string[]): void => {
    if (Object.hasOwn(footprints[resource.kind], resource.name)) throw new Error(`duplicate ${resource.kind} resource ${resource.name}`);
    footprints[resource.kind][resource.name] = controls; all.push(resource);
  };
  const footprints: Record<Resource["kind"], Record<string, readonly string[]>> = { segment: Object.create(null), pose: Object.create(null), service: Object.create(null) };
  const limbChannels = new Set<string>();
  for (const effector of effectors) {
    for (const channel of effector.channels) {
      if (!channels.includes(channel)) throw new Error(`unknown effector channel ${channel}`);
      limbChannels.add(channel);
    }
    put(segmentResource(effector.segment), [`effector:${effector.segment}`, ...effector.channels.map(c => `channel:${c}`),
      ...posable.includes(effector.segment) ? [`pose:${effector.segment}`] : []]);
  }
  for (const foot of feet) {
    if (!Object.hasOwn(footprints.segment, foot.segment)) put(segmentResource(foot.segment), [`effector:${foot.segment}`, ...foot.channels.map(channel => `channel:${channel}`),
      ...posable.includes(foot.segment) ? [`pose:${foot.segment}`] : []]);
  }
  for (const segment of segments) if (!Object.hasOwn(footprints.segment, segment.segment)) {
    put(segmentResource(segment.segment), [`effector:${segment.segment}`, ...segment.channels.map(channel => `channel:${channel}`),
      ...posable.includes(segment.segment) ? [`pose:${segment.segment}`] : []]);
  }
  for (const segment of posable) put(poseResource(segment), [`pose:${segment}`]);
  put(ASSIST_RESOURCE, ["assist"]);
  const supportChannels = new Set(feet.flatMap(foot => foot.channels));
  put(TRUNK_RESOURCE, channels.filter(c => !limbChannels.has(c) && !supportChannels.has(c)).map(c => `channel:${c}`));
  put(LEG_RESOURCE, ["stance", ...feet.flatMap(foot => [`effector:${foot.segment}`, ...foot.channels.map(channel => `channel:${channel}`),
    ...posable.includes(foot.segment) ? [`pose:${foot.segment}`] : []])]);
  deepFreeze(footprints);
  const controls = (resources: readonly Resource[]): readonly string[] => {
    const result: string[] = [];
    // Indexed: it runs for each action's readiness many times a step, and an iterator is garbage.
    for (let r = 0; r < resources.length; r++) {
      const resource = resources[r]!, footprint = footprints[resource.kind][resource.name];
      if (!footprint) throw new Error(`unknown resource ${resource}`);
      for (let c = 0; c < footprint.length; c++) { const control = footprint[c]!; if (!result.includes(control)) result.push(control); }
    }
    return result;
  };
  const writes = (held: readonly string[], patch: Partial<BodyCommand>): void => {
    const owns = (slot: string): void => { if (!held.includes(slot)) throw new Error(`undeclared action write ${slot}`); };
    for (const channel in patch.posture) owns(`channel:${channel}`);
    for (const channel in patch.paths) owns(`channel:${channel}`);
    for (const push of patch.pushes ?? []) owns(`channel:${push.channel}`);
    for (const segment in patch.effectors) owns(`effector:${segment}`);
    for (const task of patch.points ?? []) owns(`effector:${task.segment}`);
    for (const segment of support) if (patch.effectors?.[segment] && !held.includes("stance")) throw new Error("a support effector needs legs");
    for (const segment in patch.configurations) owns(`pose:${segment}`);
    if (patch.assist !== undefined) owns("assist");
    if (patch.stance !== undefined) owns("stance");
    if (patch.stance) for (const end of patch.stance.feet) {
      const segment = feet.find((foot) => foot.name === end)?.segment;
      if (segment !== undefined && patch.effectors?.[segment]) throw new Error(`two controllers own ${segment}`);
    }
  };
  return {
    all: deepFreeze(all), controls,
    overlap(a, b) {
      for (const left of a) for (const right of b) {
        const one = footprints[left.kind][left.name], two = footprints[right.kind][right.name];
        if (!one || !two) throw new Error(`unknown resource ${!one ? left : right}`);
        if (one.some(control => two.includes(control))) return true;
      }
      return false;
    },
    validate(resources, claim) {
      const held = controls(resources);
      writes(held, claim);
      if (claim.legs !== undefined && !held.includes("stance")) throw new Error("action has no legs");
      for (const effector of effectors) if (support.includes(effector.segment) && claim.effectors?.[effector.segment] && !hasResource(resources, LEG_RESOURCE)) throw new Error("a support effector needs legs");
    },
    validatePatch(resources, patch) { writes(controls(resources), patch); },
  };
}
