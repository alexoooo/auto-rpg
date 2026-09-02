import type { ConstructControlGraph } from "./actions.ts";
import type { ResourceView } from "./resources.ts";
import { supportedLocomotionControllerDescriptor } from "./controllers.ts";

export interface ActionCapability {
  readonly action: string;
  readonly group: string;
  readonly available: boolean;
  readonly reason: string | null;
  readonly parameterBounds: Readonly<Record<string, readonly [number, number]>>;
}

export interface HardwareAvailability {
  readonly joints: ReadonlySet<string>;
  readonly modules: ReadonlySet<string>;
  readonly sensors: ReadonlySet<string>;
  readonly resources: ResourceView;
}

/** Stable precedence: hardware, ammunition, power, then heat. */
export function deriveCapabilities(
  graph: ConstructControlGraph,
  hardware: HardwareAvailability,
): readonly ActionCapability[] {
  return graph.actions.map((action): ActionCapability => {
    const group = graph.groups.find((candidate) => candidate.id === action.group);
    if (!group) throw new Error(`action "${action.id}" references missing group "${action.group}"`);
    const missingJoint = group.joints.find((joint) => !hardware.joints.has(joint));
    const missingModule = group.modules.find((module) => !hardware.modules.has(module));
    const ammoClaim = action.claims.find((claim) => claim.startsWith("resource:ammo-"));
    const sensorClaim = action.claims.find((claim) => claim.startsWith("resource:sensor-"));
    const powerClaim = action.claims.find((claim) => claim.startsWith("resource:power-"));
    let reason: string | null = null;
    if (missingJoint) reason = `missing joint "${missingJoint}"`;
    else if (missingModule) reason = `missing module "${missingModule}"`;
    else if (sensorClaim && !hardware.sensors.has(sensorClaim.slice("resource:sensor-".length))) {
      reason = `missing sensor "${sensorClaim.slice("resource:sensor-".length)}"`;
    } else if (ammoClaim && (hardware.resources.ammunition[ammoClaim.slice("resource:ammo-".length)] ?? 0) <= 0) {
      reason = `ammunition "${ammoClaim.slice("resource:ammo-".length)}" exhausted`;
    } else if (ammoClaim && (hardware.resources.reloadS[ammoClaim.slice("resource:ammo-".length)] ?? 0) > 0) {
      reason = `ammunition "${ammoClaim.slice("resource:ammo-".length)}" is reloading`;
    } else if (powerClaim && hardware.resources.chargeJ <= 0) reason = "power charge exhausted";
    else if (powerClaim && hardware.resources.overheated) reason = "thermal limit reached";
    const parameterBounds: Readonly<Record<string, readonly [number, number]>> = Object.freeze(
      Object.fromEntries(Object.entries(action.parameters)
        .flatMap(([name, spec]) => spec.kind === "number"
          ? [[name, Object.freeze([spec.min, spec.max]) as readonly [number, number]]]
          : [])),
    );
    return Object.freeze({ action: action.id, group: action.group, available: reason === null, reason, parameterBounds });
  });
}

/**
 * Descriptor-owned full/fallback exclusion.
 *
 * Hardware availability remains all-members-required in `deriveCapabilities`. This second pure
 * pass says which of those exact groups may spend the one balance resource. It never picks a
 * fallback by utility, request order or array order.
 */
export function applySupportedLocomotionAlternatives(
  graph: ConstructControlGraph,
  capabilities: readonly ActionCapability[],
  requestedActions: readonly string[] = [],
): readonly ActionCapability[] {
  const actionById = new Map(graph.actions.map((action) => [action.id, action]));
  const descriptorByAction = new Map(graph.actions.flatMap((action) => {
    const descriptor = supportedLocomotionControllerDescriptor(action.controller);
    return descriptor?.alternative ? [[action.id, descriptor.alternative] as const] : [];
  }));
  const capabilityByAction = new Map(capabilities.map((row) => [row.action, row]));
  const families = new Set([...descriptorByAction.values()].map(({ family }) => family));
  const requested = new Set(requestedActions);
  const reasonByAction = new Map<string, string>();

  for (const family of [...families].sort()) {
    // The graph's canonical action order declares which of several equivalent primary actions
    // names the live carrier in a human-facing refusal. Tactical aliases such as `dodge-left`
    // share the same physical carrier as `move`; alphabetising them made a healthy biped claim
    // that its *dodge* was the primary locomotion action. Fallback arbitration below remains
    // identifier-sorted, so a request order or a graph reformat cannot select a limp.
    const membersInGraphOrder = [...descriptorByAction]
      .filter(([, descriptor]) => descriptor.family === family);
    const livePrimary = membersInGraphOrder.filter(([, descriptor]) => descriptor.rank === "primary")
      .map(([id]) => capabilityByAction.get(id)).find((row) => row?.available);
    if (livePrimary) {
      for (const [id, descriptor] of membersInGraphOrder) if (descriptor.rank === "fallback") {
        reasonByAction.set(id, `primary locomotion action "${livePrimary.action}" remains available`);
      }
      continue;
    }
    const requestedFallbacks = [...membersInGraphOrder].sort(([left], [right]) => left.localeCompare(right))
      .filter(([id, descriptor]) =>
      descriptor.rank === "fallback" && requested.has(id)).map(([id]) => id);
    if (requestedFallbacks.length > 1) {
      const reason = `fallback locomotion actions "${requestedFallbacks.join('", "')}" were requested together; ` +
        `one "resource:balance" fallback must be named`;
      for (const id of requestedFallbacks) {
        const own = capabilityByAction.get(id)?.reason;
        reasonByAction.set(id, own ? `${reason}; ${own}` : reason);
      }
    }
  }

  return Object.freeze(capabilities.map((row) => {
    if (!actionById.has(row.action)) throw new Error(`capability references unknown action "${row.action}"`);
    const reason = reasonByAction.get(row.action);
    return reason ? Object.freeze({ ...row, available: false, reason }) : row;
  }));
}
