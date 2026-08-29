import type { ConstructControlGraph } from "../actions.ts";
import type { ConstructBlueprint } from "../blueprint.ts";
import type { ActionCapability } from "../capabilities.ts";
import { jointSensorChannels, type SensorSpec, type SensorValue } from "../sensors.ts";
import { CONSTRUCT_GRAPH_LIMITS, CONSTRUCT_OBSERVATION_VERSION } from "./contract.ts";
import { mirrorConstructId } from "./mirror.ts";

export type ConstructNodeType = "part" | "joint" | "module" | "sensor" | "group" | "action";
export type ConstructEdgeType = "physical" | "socket" | "group-member" | "action-group" | "sensor-source" | "resource";

export interface ConstructGraphNode {
  readonly type: ConstructNodeType;
  readonly id: string;
  readonly features: readonly number[];
}

export interface ConstructGraphEdge {
  readonly type: ConstructEdgeType;
  readonly from: number;
  readonly to: number;
}

export interface ConstructGraphObservation {
  readonly version: 2;
  readonly nodes: readonly ConstructGraphNode[];
  readonly edges: readonly ConstructGraphEdge[];
}

export interface ConstructDynamicState {
  readonly partHealth: Readonly<Record<string, number>>;
  readonly attachedParts: ReadonlySet<string>;
  readonly jointIntegrity: Readonly<Record<string, number>>;
  readonly jointAngleRad: Readonly<Record<string, number>>;
  readonly jointSpeedRadS: Readonly<Record<string, number>>;
  readonly installedModules: ReadonlySet<string>;
  readonly sensors: readonly SensorValue[];
  readonly capabilities: readonly ActionCapability[];
  readonly partRelativePositionM?: Readonly<Record<string, readonly [number, number, number]>>;
  readonly partLinearVelocityMps?: Readonly<Record<string, readonly [number, number, number]>>;
  readonly partAngularVelocityRadS?: Readonly<Record<string, readonly [number, number, number]>>;
  readonly partLocalForward?: Readonly<Record<string, readonly [number, number, number]>>;
  readonly partLocalUp?: Readonly<Record<string, readonly [number, number, number]>>;
  readonly moduleHealth?: Readonly<Record<string, number>>;
  readonly moduleContact?: ReadonlySet<string>;
  readonly resourceChargeFraction?: number;
  readonly resourceHeatFraction?: number;
  readonly ammunitionFraction?: Readonly<Record<string, number>>;
  readonly activeActions?: ReadonlySet<string>;
}

const TYPES: readonly ConstructNodeType[] = ["part", "joint", "module", "sensor", "group", "action"];
const EDGE_TYPES: readonly ConstructEdgeType[] = ["physical", "socket", "group-member", "action-group", "sensor-source", "resource"];
const compareId = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const unit = (value: number): number => Math.max(0, Math.min(1, value));
const signed = (value: number): number => Math.max(-1, Math.min(1, value));
const sensorFeature = (sensor: SensorSpec, value: number | boolean): number => typeof value === "boolean" ? (value ? 1 : 0)
  : signed(value / (sensor.unit === "metres" ? 10 : sensor.unit === "metres-per-second" ? 20 :
    sensor.unit === "radians" ? Math.PI : sensor.unit === "radians-per-second" ? 20 :
      sensor.unit === "seconds" ? 10 : sensor.unit === "joules" ? 5_000 : sensor.unit === "watts" ? 1_000 : 1));

export function validateConstructObservation(value: ConstructGraphObservation): ConstructGraphObservation {
  if ((value as { readonly version: number }).version !== CONSTRUCT_OBSERVATION_VERSION) {
    throw new Error(`construct observation version ${JSON.stringify((value as { readonly version: number }).version)} is unsupported`);
  }
  if (!Array.isArray(value.nodes) || value.nodes.length > CONSTRUCT_GRAPH_LIMITS.maxNodes ||
      !Array.isArray(value.edges) || value.edges.length > CONSTRUCT_GRAPH_LIMITS.maxEdges) {
    throw new Error("construct observation exceeds its node or edge limit");
  }
  const seen = new Set<string>();
  const nodeLimits: Readonly<Record<ConstructNodeType, number>> = { part: CONSTRUCT_GRAPH_LIMITS.maxParts,
    joint: CONSTRUCT_GRAPH_LIMITS.maxJoints, module: CONSTRUCT_GRAPH_LIMITS.maxModules,
    sensor: CONSTRUCT_GRAPH_LIMITS.maxSensors, group: CONSTRUCT_GRAPH_LIMITS.maxGroups,
    action: CONSTRUCT_GRAPH_LIMITS.maxActions };
  for (let index = 0; index < value.nodes.length; index += 1) {
    const node = value.nodes[index];
    if (!TYPES.includes(node.type) || typeof node.id !== "string" || !Array.isArray(node.features) ||
        node.features.some((feature: unknown) => typeof feature !== "number" || !Number.isFinite(feature))) {
      throw new Error(`construct observation node ${index} is invalid`);
    }
    const key = `${node.type}:${node.id}`;
    if (seen.has(key)) throw new Error(`construct observation has duplicate node "${key}"`);
    seen.add(key);
    const previous = value.nodes[index - 1];
    if (previous && (TYPES.indexOf(previous.type) > TYPES.indexOf(node.type) ||
        (previous.type === node.type && compareId(previous.id, node.id) >= 0))) {
      throw new Error("construct observation nodes are not in canonical order");
    }
  }
  for (const type of TYPES) if (value.nodes.filter((node) => node.type === type).length > nodeLimits[type]) {
    throw new Error(`construct observation exceeds its ${type} node limit`);
  }
  const edgeLimits: Readonly<Record<ConstructEdgeType, number>> = { physical: CONSTRUCT_GRAPH_LIMITS.maxJointEndpointEdges,
    socket: CONSTRUCT_GRAPH_LIMITS.maxModuleSocketEdges, "group-member": CONSTRUCT_GRAPH_LIMITS.maxGroupMemberEdges,
    "action-group": CONSTRUCT_GRAPH_LIMITS.maxActionGroupEdges, "sensor-source": CONSTRUCT_GRAPH_LIMITS.maxSensorSourceEdges,
    resource: CONSTRUCT_GRAPH_LIMITS.maxActionClaimEdges };
  for (let index = 0; index < value.edges.length; index += 1) {
    const edge = value.edges[index];
    if (!EDGE_TYPES.includes(edge.type) || !Number.isSafeInteger(edge.from) || !Number.isSafeInteger(edge.to) ||
        edge.from < 0 || edge.to < 0 || edge.from >= value.nodes.length || edge.to >= value.nodes.length) {
      throw new Error(`construct observation edge ${index} is invalid`);
    }
    const previous = value.edges[index - 1];
    if (previous && (EDGE_TYPES.indexOf(previous.type) > EDGE_TYPES.indexOf(edge.type) ||
        (previous.type === edge.type && (previous.from > edge.from ||
          (previous.from === edge.from && previous.to > edge.to))))) {
      throw new Error("construct observation edges are not in canonical order");
    }
  }
  for (const type of EDGE_TYPES) if (value.edges.filter((edge) => edge.type === type).length > edgeLimits[type]) {
    throw new Error(`construct observation exceeds its ${type} edge limit`);
  }
  if (JSON.stringify(value).length > CONSTRUCT_GRAPH_LIMITS.maxCanonicalBytes) {
    throw new Error(`construct observation exceeds ${CONSTRUCT_GRAPH_LIMITS.maxCanonicalBytes} canonical bytes`);
  }
  return value;
}

export function encodeConstructObservation(
  blueprint: ConstructBlueprint,
  control: ConstructControlGraph,
  sensorSpecs: readonly SensorSpec[],
  state: ConstructDynamicState,
): ConstructGraphObservation {
  const counts = [
    ["parts", blueprint.parts.length, CONSTRUCT_GRAPH_LIMITS.maxParts],
    ["joints", blueprint.joints.length, CONSTRUCT_GRAPH_LIMITS.maxJoints],
    ["modules", blueprint.modules.length, CONSTRUCT_GRAPH_LIMITS.maxModules],
    ["groups", control.groups.length, CONSTRUCT_GRAPH_LIMITS.maxGroups],
    ["actions", control.actions.length, CONSTRUCT_GRAPH_LIMITS.maxActions],
    ["sensors", sensorSpecs.length, CONSTRUCT_GRAPH_LIMITS.maxSensors],
  ] as const;
  for (const [kind, count, maximum] of counts) {
    if (count > maximum) throw new Error(`construct graph has ${count} ${kind}; maximum is ${maximum}`);
  }
  const nodes: ConstructGraphNode[] = [];
  for (const part of blueprint.parts) {
    const position = state.partRelativePositionM?.[part.id] ?? [0, 0, 0];
    const linear = state.partLinearVelocityMps?.[part.id] ?? [0, 0, 0];
    const angular = state.partAngularVelocityRadS?.[part.id] ?? [0, 0, 0];
    const forward = state.partLocalForward?.[part.id] ?? [0, 0, 1];
    const up = state.partLocalUp?.[part.id] ?? [0, 1, 0];
    nodes.push({ type: "part", id: part.id, features: [
      unit((state.partHealth[part.id] ?? part.health) / part.health),
      state.attachedParts.has(part.id) ? 1 : 0,
      unit(part.massKg / 200),
      part.vitalityWeight,
      part.fatal ? 1 : 0,
      ...position.map((value) => signed(value / 10)),
      ...linear.map((value) => signed(value / 20)),
      ...angular.map((value) => signed(value / 20)),
      ...forward,
      ...up,
    ] });
  }
  for (const joint of blueprint.joints) {
    const channels = new Map(jointSensorChannels(joint).map((channel) => [channel.axis, channel]));
    const axes = new Map(joint.angularAxes.map((axis) => [axis.id, axis]));
    const axisFeatures = (["x", "y", "z"] as const).flatMap((id) => {
      const axis = axes.get(id); const channel = channels.get(id);
      if (!axis || !channel) return [0, 0, 0, 0, 0, 0, 0, id === "x" ? 1 : -1];
      const maximumAngle = Math.max(Math.abs(axis.minRad), Math.abs(axis.maxRad), 1e-6);
      return [1,
        signed((state.jointAngleRad[channel.angle] ?? state.jointAngleRad[joint.id] ?? 0) / maximumAngle),
        signed((state.jointSpeedRadS[channel.speed] ?? state.jointSpeedRadS[joint.id] ?? 0) / axis.maxSpeedRadS),
        signed(axis.minRad / Math.PI), signed(axis.maxRad / Math.PI), unit(axis.maxSpeedRadS / 20),
        unit(axis.maxTorqueNm / 500), id === "x" ? 1 : -1];
    });
    nodes.push({ type: "joint", id: joint.id, features: [
      unit((state.jointIntegrity[joint.id] ?? joint.health) / joint.health),
      ...axisFeatures,
    ] });
  }
  for (const module of blueprint.modules) {
    nodes.push({ type: "module", id: module.id, features: [state.installedModules.has(module.id) ? 1 : 0,
      module.kind === "power-core" || module.kind === "launcher" ? 1 : 0,
      module.kind === "magazine" ? 1 : 0,
      unit((state.moduleHealth?.[module.id] ?? module.health) / module.health),
      state.moduleContact?.has(module.id) ? 1 : 0,
      module.kind === "power-core" ? unit(state.resourceChargeFraction ?? 0) : 0,
      module.kind === "launcher" ? unit(state.resourceHeatFraction ?? 0) : 0,
      module.kind === "magazine" ? unit(state.ammunitionFraction?.[module.id] ?? 0) : 0,
    ] });
  }
  const sensorValues = new Map(state.sensors.map((sensor) => [sensor.id, sensor]));
  for (const sensor of sensorSpecs) {
    const owners = blueprint.modules.filter((module) => module.sensorChannels?.includes(sensor.id));
    const hardwareAvailable = owners.length === 0 || owners.some((module) => state.installedModules.has(module.id));
    const value = hardwareAvailable ? sensorValues.get(sensor.id) : undefined;
    nodes.push({ type: "sensor", id: sensor.id, features: value
      ? [1, sensorFeature(sensor, value.value),
        sensor.source === "self" ? 1 : 0, sensor.source === "contact" ? 1 : 0, sensor.source === "opponent" ? 1 : 0]
      : [0, 0, sensor.source === "self" ? 1 : 0, sensor.source === "contact" ? 1 : 0,
        sensor.source === "opponent" ? 1 : 0] });
  }
  for (const group of control.groups) nodes.push({ type: "group", id: group.id,
    features: [group.joints.length / 64, group.modules.length / 64] });
  const capabilities = new Map(state.capabilities.map((capability) => [capability.action, capability]));
  for (const action of control.actions) nodes.push({ type: "action", id: action.id,
    features: [capabilities.get(action.id)?.available ? 1 : 0, action.claims.length / 16,
      state.activeActions?.has(`${action.id}/${action.group}`) ? 1 : 0] });

  nodes.sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || compareId(a.id, b.id));
  const index = new Map(nodes.map((node, at) => [`${node.type}:${node.id}`, at]));
  const edges: ConstructGraphEdge[] = [];
  const add = (type: ConstructEdgeType, from: string, to: string): void => {
    const left = index.get(from); const right = index.get(to);
    if (left === undefined || right === undefined) return;
    edges.push({ type, from: left, to: right });
  };
  for (const joint of blueprint.joints) {
    add("physical", `part:${joint.parentPart}`, `joint:${joint.id}`);
    add("physical", `joint:${joint.id}`, `part:${joint.childPart}`);
  }
  const sockets = new Map(blueprint.sockets.map((socket) => [socket.id, socket]));
  for (const module of blueprint.modules) {
    if (!state.installedModules.has(module.id)) continue;
    const socket = sockets.get(module.socket);
    if (socket) add("socket", `part:${socket.part}`, `module:${module.id}`);
    if (module.sensorChannels) {
      for (const sensor of sensorSpecs.filter((candidate) => module.sensorChannels?.includes(candidate.id))) {
        add("sensor-source", `module:${module.id}`, `sensor:${sensor.id}`);
      }
    }
  }
  for (const group of control.groups) {
    for (const joint of group.joints) add("group-member", `group:${group.id}`, `joint:${joint}`);
    for (const module of group.modules) if (state.installedModules.has(module)) {
      add("group-member", `group:${group.id}`, `module:${module}`);
    }
  }
  for (const action of control.actions) {
    add("action-group", `action:${action.id}`, `group:${action.group}`);
    const group = control.groups.find((candidate) => candidate.id === action.group);
    for (const claim of action.claims) {
      if (!claim.startsWith("resource:")) continue;
      const resource = claim.slice("resource:".length);
      if (resource.startsWith("ammo-")) {
        const moduleId = resource.slice("ammo-".length);
        const module = blueprint.modules.find((candidate) => candidate.id === moduleId && candidate.kind === "magazine");
        if (module && state.installedModules.has(module.id)) add("resource", `action:${action.id}`, `module:${module.id}`);
      } else if (resource.startsWith("sensor-")) {
        const fact = resource.slice("sensor-".length);
        for (const module of blueprint.modules.filter((candidate) => state.installedModules.has(candidate.id) &&
          candidate.sensorChannels?.includes(fact))) {
          add("resource", `action:${action.id}`, `module:${module.id}`);
        }
      } else if (resource.startsWith("power-")) {
        for (const moduleId of group?.modules ?? []) {
          const module = blueprint.modules.find((candidate) => candidate.id === moduleId);
          if (module && state.installedModules.has(module.id) &&
              (module.kind === "launcher" || module.kind === "sword")) {
            add("resource", `action:${action.id}`, `module:${module.id}`);
          }
        }
      }
    }
  }
  edges.sort((a, b) => EDGE_TYPES.indexOf(a.type) - EDGE_TYPES.indexOf(b.type) || a.from - b.from || a.to - b.to);
  if (nodes.length > CONSTRUCT_GRAPH_LIMITS.maxNodes) throw new Error(`construct graph has ${nodes.length} nodes; maximum is ${CONSTRUCT_GRAPH_LIMITS.maxNodes}`);
  if (edges.length > CONSTRUCT_GRAPH_LIMITS.maxEdges) throw new Error(`construct graph has ${edges.length} edges; maximum is ${CONSTRUCT_GRAPH_LIMITS.maxEdges}`);
  const edgeLimits: Readonly<Record<ConstructEdgeType, number>> = {
    physical: CONSTRUCT_GRAPH_LIMITS.maxJointEndpointEdges,
    socket: CONSTRUCT_GRAPH_LIMITS.maxModuleSocketEdges,
    "group-member": CONSTRUCT_GRAPH_LIMITS.maxGroupMemberEdges,
    "action-group": CONSTRUCT_GRAPH_LIMITS.maxActionGroupEdges,
    "sensor-source": CONSTRUCT_GRAPH_LIMITS.maxSensorSourceEdges,
    resource: CONSTRUCT_GRAPH_LIMITS.maxActionClaimEdges,
  };
  for (const type of EDGE_TYPES) {
    const count = edges.filter((edge) => edge.type === type).length;
    if (count > edgeLimits[type]) throw new Error(`construct graph has ${count} ${type} edges; maximum is ${edgeLimits[type]}`);
  }
  const result = Object.freeze({ version: CONSTRUCT_OBSERVATION_VERSION, nodes: Object.freeze(nodes), edges: Object.freeze(edges) });
  if (JSON.stringify(result).length > CONSTRUCT_GRAPH_LIMITS.maxCanonicalBytes) {
    throw new Error(`construct graph exceeds ${CONSTRUCT_GRAPH_LIMITS.maxCanonicalBytes} canonical bytes`);
  }
  return validateConstructObservation(result);
}

export function mirrorConstructObservation(graph: ConstructGraphObservation): ConstructGraphObservation {
  const mirrorJoint = (features: readonly number[]): readonly number[] => {
    const result = [...features];
    for (let axis = 0; axis < 3; axis += 1) {
      const at = 1 + axis * 8; const parity = features[at + 7];
      result[at + 1] *= parity;
      result[at + 2] *= parity;
      if (parity < 0) {
        result[at + 3] = -features[at + 4];
        result[at + 4] = -features[at + 3];
      }
    }
    return Object.freeze(result);
  };
  const indexed = graph.nodes.map((node, oldIndex) => ({ oldIndex, node: Object.freeze({ ...node,
      id: mirrorConstructId(node.id),
      features: Object.freeze(node.type === "part" ? node.features.map((value, index) =>
        index === 5 || index === 8 || index === 12 || index === 13 || index === 14 || index === 17 ? -value : value) :
        node.type === "joint" ? mirrorJoint(node.features) : [...node.features]),
    }) })).sort((a, b) => TYPES.indexOf(a.node.type) - TYPES.indexOf(b.node.type) || compareId(a.node.id, b.node.id));
  const moved = new Map(indexed.map((row, newIndex) => [row.oldIndex, newIndex]));
  const edges = graph.edges.map((edge) => Object.freeze({ ...edge,
    from: moved.get(edge.from) as number, to: moved.get(edge.to) as number }))
    .sort((a, b) => EDGE_TYPES.indexOf(a.type) - EDGE_TYPES.indexOf(b.type) || a.from - b.from || a.to - b.to);
  return validateConstructObservation(Object.freeze({ version: graph.version,
    nodes: Object.freeze(indexed.map((row) => row.node)), edges: Object.freeze(edges) }));
}
