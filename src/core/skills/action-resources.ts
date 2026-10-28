import type { BodyCommand } from "../body.ts";
import type { EffectorModel } from "../control/effectors.ts";
import { deepFreeze } from "../state.ts";
import type { ActionClaim, Resource } from "./action.ts";

/** One compiled map serves both admission conflicts and command-write validation. */
export interface ResourceMap {
  readonly footprints: Readonly<Record<Resource, readonly string[]>>;
  overlap(a: readonly Resource[], b: readonly Resource[]): boolean;
  controls(resources: readonly Resource[]): readonly string[];
  validate(resources: readonly Resource[], claim: ActionClaim): void;
  validatePatch(resources: readonly Resource[], patch: Partial<BodyCommand>): void;
}

/** Compile anatomical chains, the posable hands (by segment) and the stance's support limbs into concrete control slots. */
export function actionResources(channels: readonly string[], effectors: readonly EffectorModel[], support: readonly string[], posable: readonly string[]): ResourceMap {
  const footprints: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>, limbChannels = new Set<string>();
  for (const effector of effectors) {
    if (effector.segment === "legs" || effector.segment === "trunk" || footprints[effector.segment]) throw new Error("duplicate or reserved effector resource");
    for (const channel of effector.channels) {
      if (!channels.includes(channel)) throw new Error(`unknown effector channel ${channel}`);
      limbChannels.add(channel);
    }
    footprints[effector.segment] = [`effector:${effector.segment}`, ...effector.channels.map(c => `channel:${c}`),
      ...posable.includes(effector.segment) ? [`pose:${effector.segment}`] : []];
  }
  footprints.trunk = channels.filter(c => !limbChannels.has(c)).map(c => `channel:${c}`);
  footprints.legs = ["stance", ...support.flatMap(name => {
    const footprint = footprints[name];
    if (!footprint) throw new Error(`unknown support resource ${name}`);
    return footprint;
  })];
  deepFreeze(footprints);
  const controls = (resources: readonly Resource[]): readonly string[] => {
    const result: string[] = [];
    // Indexed: it runs for each action's readiness many times a step, and an iterator is garbage.
    for (let r = 0; r < resources.length; r++) {
      const resource = resources[r]!, footprint = footprints[resource];
      if (!footprint) throw new Error(`unknown resource ${resource}`);
      for (let c = 0; c < footprint.length; c++) { const control = footprint[c]!; if (!result.includes(control)) result.push(control); }
    }
    return result;
  };
  const writes = (held: readonly string[], patch: Partial<BodyCommand>): void => {
    const owns = (slot: string): void => { if (!held.includes(slot)) throw new Error(`undeclared action write ${slot}`); };
    for (const channel in patch.posture) owns(`channel:${channel}`);
    for (const push of patch.pushes ?? []) owns(`channel:${push.channel}`);
    for (const segment in patch.effectors) owns(`effector:${segment}`);
    for (const task of patch.points ?? []) owns(`effector:${task.segment}`);
    for (const segment of support) if (patch.effectors?.[segment] && !held.includes("stance")) throw new Error("a support effector needs legs");
    for (const segment in patch.handPoses) owns(`pose:${segment}`);
    if (patch.stance !== undefined) owns("stance");
    if (patch.stance) for (const side of patch.stance.feet) {
      if (patch.effectors?.[`foot.${side}`]) throw new Error(`two controllers own foot.${side}`);
    }
  };
  return {
    footprints, controls,
    overlap(a, b) {
      for (const left of a) for (const right of b) {
        const one = footprints[left], two = footprints[right];
        if (!one || !two) throw new Error(`unknown resource ${!one ? left : right}`);
        if (one.some(control => two.includes(control))) return true;
      }
      return false;
    },
    validate(resources, claim) {
      const held = controls(resources);
      writes(held, claim);
      if (claim.legs !== undefined && !held.includes("stance")) throw new Error("action has no legs");
      if (claim.support !== undefined && (!resources.includes("legs") || !resources.includes("trunk"))) throw new Error("support needs legs and trunk");
      for (const control of controls(claim.delegate ?? [])) if (!held.includes(control)) throw new Error(`unowned delegation ${control}`);
      const delegated = controls(claim.delegate ?? []);
      writes(held.filter(control => !delegated.includes(control)), claim);
      for (const effector of effectors) if (support.includes(effector.segment) && claim.effectors?.[effector.segment] && !resources.includes("legs")) throw new Error("a support effector needs legs");
    },
    validatePatch(resources, patch) { writes(controls(resources), patch); },
  };
}
