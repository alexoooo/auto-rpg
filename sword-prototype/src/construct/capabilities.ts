import type { ConstructControlGraph } from "./actions.ts";
import type { ResourceView } from "./resources.ts";

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
