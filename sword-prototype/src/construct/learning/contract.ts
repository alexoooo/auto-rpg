import { canonicalIntegrityJson, integrityDigest } from "../integrity.ts";

export const CONSTRUCT_OBSERVATION_VERSION = 2 as const;
export const CONSTRUCT_GRAPH_LIMITS = Object.freeze({
  maxParts: 128,
  maxJoints: 127,
  maxModules: 256,
  maxGroups: 128,
  maxActions: 256,
  maxSensors: 256,
  maxNodes: 1_151,
  maxJointEndpointEdges: 254,
  maxModuleSocketEdges: 256,
  maxGroupMemberEdges: 8_192,
  maxActionGroupEdges: 256,
  maxSensorSourceEdges: 256,
  maxActionClaimEdges: 20_480,
  maxEdges: 29_694,
  maxCanonicalBytes: 1_000_000,
});

export const CONSTRUCT_GRAPH_CONTRACT = Object.freeze({
  version: CONSTRUCT_OBSERVATION_VERSION,
  nodeTypes: Object.freeze(["part", "joint", "module", "sensor", "group", "action"]),
  edgeTypes: Object.freeze(["physical", "socket", "group-member", "action-group", "sensor-source", "resource"]),
  limits: CONSTRUCT_GRAPH_LIMITS,
  order: "node-type-then-stable-id; edge-type-then-endpoints",
  edgeStorage: "one-canonical-row; message-passing-gathers-both-endpoints",
  candidates: "available-action-group-pairs-sorted-by-action-then-group",
  concurrentDistribution: "autoregressive-categorical-over-claim-compatible-candidates-plus-STOP",
  featureLayout: "part-health-attachment-mass-vitality-fatal-local-pose-polar-linear-axial-angular; joint-integrity-plus-fixed-xyz-axis-mask-angle-speed-min-max-speed-limit-torque-parity; module-health-contact-resources; installed-sensor; group; capability-active-action",
  translation: "core-relative-metres",
  mirror: "x-plane-reflection: polar-x-negated; axial-yz-negated; declared-joint-axis-parity; symmetric-ids-candidates-commands-involutive",
});

export const CONSTRUCT_GRAPH_CONTRACT_DIGEST = integrityDigest(canonicalIntegrityJson(CONSTRUCT_GRAPH_CONTRACT));
