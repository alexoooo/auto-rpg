/** Experimental, browser-compatible policies. Not admitted to the normal picker. */
import type { FighterView, Intent, Mind } from "../mind.ts";
import { originalMind as policyMind } from "./lab-baselines.ts";
import { canAttack, freshGolemIntent } from "./tactics.ts";
import { golemDriven, GOLEM_TACTICS_V4, COMMAND_FIELDS, COMMAND_RANGES, freshCommand } from "./tactics-v4.ts";
import { golemStyled, GOLEM_TACTICS_V3, type StyleOption } from "./tactics-v3.ts";
import { golemPlanner } from "./planner.ts";
import type { DuelModelTables } from "./duel-model.ts";
import { WEAPON_KINDS } from "../hands.ts";
import { pairedMind, adaptiveMind, mixtureMind, type MixtureSpec } from "./lab-bespoke.ts";
import { terminalModelMind, type TerminalModel } from "./lab-model.ts";
import { mulberry32 } from "../rng.ts";
import { needleMind } from "./lab-needle.ts";

export const LAB_VERSION = 2;
export const HANDS = ["primary", "secondary"] as const;
const AXES = ["pointerX", "pointerY", "reach", "roll", "wristBend"] as const;
export type LabSurface = "pilot" | "direct" | "residual";
export const DIRECT_FIELDS = ["forward", "strafe", "turn", "lean", "twist", "crouch",
  ...HANDS.flatMap((h) => [...AXES, "thrust", "guard"].map((a) => `${h}.${a}`)), "natural.thrust", "natural.guard"];
export const LEGACY_OBSERVATION_NAMES = ["measure", "clock", "opponentX", "opponentZ", "bearingSin", "bearingCos",
  ...["self", "opponent"].flatMap((side) => ["vitality", "reach", "crouch", "lean", "twist",
    ...HANDS.flatMap((h) => ["lost", "reach", "tipX", "tipY", "tipZ", "velocityX", "velocityY", "velocityZ"]
      .map((k) => `${h}.${k}`))].map((k) => `${side}.${k}`))];
// Append rather than reorder: archived v1 students retain their exact 48-feature contract.
export const OBSERVATION_NAMES = [...LEGACY_OBSERVATION_NAMES,
  ...["self", "opponent"].flatMap((side) => ["crownHeight", "vitalHeight", "collisionRadius",
    "healthMin", "healthMean", "partsLostFraction", "naturalCount", "naturalReach", "naturalReady", "naturalActive",
    ...HANDS.flatMap((h) => ["shoulderX", "shoulderY", "shoulderZ", "outboard",
      ...WEAPON_KINDS.map((w) => `weapon.${w}`)].map((k) => `${h}.${k}`))].map((k) => `${side}.${k}`))];
export const observationNames = (version: number): string[] => {
  if (version === 1) return LEGACY_OBSERVATION_NAMES;
  if (version === LAB_VERSION) return OBSERVATION_NAMES;
  throw new Error("unsupported observation version");
};
export const clamp = (x: number, lo = -1, hi = 1): number => Math.max(lo, Math.min(hi, x));

/** Fixed scaling, no dataset statistics or private simulator/controller state. */
export function labObservation(view: FighterView, version = LAB_VERSION): number[] {
  observationNames(version);
  const s = Math.sin(view.self.facing), c = Math.cos(view.self.facing);
  const local = (x: number, z: number): number[] => [x * c - z * s, x * s + z * c];
  const offset = local(view.opponent.ground.x - view.self.ground.x, view.opponent.ground.z - view.self.ground.z);
  const out = [view.measure / 4, view.clock / 150, offset[0] / 4, offset[1] / 4,
    Math.sin(view.opponent.facing - view.self.facing), Math.cos(view.opponent.facing - view.self.facing)];
  for (const body of [view.self, view.opponent]) {
    out.push(body.vitality, body.reach / 3, body.crouch, body.trunkLean, body.trunkTwist);
    for (const hand of HANDS) {
      const h = body.hands[hand];
      const p = local(h.tip.x - body.ground.x, h.tip.z - body.ground.z);
      const v = local(h.tipVelocity.x, h.tipVelocity.z);
      out.push(h.lost ? 1 : 0, h.reach / 3, ...(h.lost ? [0, 0, 0, 0, 0, 0]
        : [p[0] / 3, (h.tip.y - body.ground.y) / 3, p[1] / 3, v[0] / 30, h.tipVelocity.y / 30, v[1] / 30]));
    }
  }
  if (version >= 2) for (const body of [view.self, view.opponent]) {
    const health = Object.values(body.health), natural = Object.values(body.naturalAttacks);
    out.push(body.crownHeight / 3, body.vitalHeight / 3, body.collisionRadius,
      health.length ? Math.min(...health) : 0,
      health.reduce((sum, x) => sum + x, 0) / Math.max(1, health.length),
      health.filter((x) => x <= 0).length / Math.max(1, health.length), natural.length / 4,
      Math.max(0, ...natural.map((n) => n.reach)) / 3,
      natural.some((n) => n.ready) ? 1 : 0, natural.some((n) => n.active) ? 1 : 0);
    for (const hand of HANDS) {
      const h = body.hands[hand], p = local(h.shoulder.x - body.ground.x, h.shoulder.z - body.ground.z);
      out.push(p[0] / 3, (h.shoulder.y - body.ground.y) / 3, p[1] / 3, h.outboard,
        ...WEAPON_KINDS.map((w) => h.weapon === w ? 1 : 0));
    }
  }
  if (out.some((v) => !Number.isFinite(v))) throw new Error("non-finite lab observation");
  return out.map((v) => clamp(v, -5, 5));
}
export function actionSize(surface: LabSurface): number {
  if (surface === "pilot") return COMMAND_FIELDS.length;
  if (surface === "direct" || surface === "residual") return DIRECT_FIELDS.length;
  throw new Error("unknown lab action surface");
}
export function validateAction(surface: LabSurface, action: number[]): void {
  if (!Array.isArray(action) || action.length !== actionSize(surface)
    || action.some((v) => !Number.isFinite(v) || Math.abs(v) > 1)) throw new Error("invalid lab action");
}
export function pilotCommand(action: number[]) {
  validateAction("pilot", action);
  const command = freshCommand();
  COMMAND_FIELDS.forEach((key, i) => {
    const [lo, hi] = COMMAND_RANGES[key];
    command[key] = lo + (action[i] + 1) * (hi - lo) / 2;
  });
  return command;
}
export function directIntent(action: number[], view: FighterView, base?: Intent): Intent {
  validateAction(base ? "residual" : "direct", action);
  const intent = base ? structuredClone(base) : freshGolemIntent();
  let i = 0;
  const value = (old: number, lo = -1, hi = 1) => base ? clamp(old + 0.25 * action[i++], lo, hi)
    : lo + (action[i++] + 1) * (hi - lo) / 2;
  const gate = (old: boolean) => { const a = action[i++]; return base && Math.abs(a) < 0.5 ? old : a > 0; };
  intent.forward = value(intent.forward); intent.strafe = value(intent.strafe); intent.turn = value(intent.turn);
  intent.posture.trunkLean = value(intent.posture.trunkLean);
  intent.posture.trunkTwist = value(intent.posture.trunkTwist);
  intent.posture.crouch = value(intent.posture.crouch, 0, 1);
  for (const hand of HANDS) {
    for (const axis of AXES) intent[hand][axis] = axis === "roll" ? value(intent[hand][axis], -Math.PI, Math.PI)
      : axis === "wristBend" ? value(intent[hand][axis], 0, 1) : value(intent[hand][axis]);
    intent[hand].thrust = gate(intent[hand].thrust); intent[hand].guard = gate(intent[hand].guard);
    if (view.self.hands[hand].lost) intent[hand] = freshGolemIntent()[hand];
  }
  intent.natural.thrust = gate(intent.natural.thrust); intent.natural.guard = gate(intent.natural.guard);
  if (!base || (intent.actingHand !== null && view.self.hands[intent.actingHand].lost)) {
    intent.actingHand = !view.self.hands.primary.lost ? "primary" : !view.self.hands.secondary.lost ? "secondary" : null;
  }
  return intent;
}

export const BESPOKE = ["punisher", "interceptor", "feinter", "coordinator", "rush", "turtle", "circle", "paired", "adaptive", "needle"] as const;
export type Bespoke = typeof BESPOKE[number];
export function bespokeMind(kind: Bespoke, seed: number): Mind {
  if (!(BESPOKE as readonly string[]).includes(kind)) throw new Error("unknown bespoke policy");
  if (kind === "paired") return pairedMind(seed);
  if (kind === "adaptive") return adaptiveMind(seed);
  if (kind === "needle") return needleMind(seed);
  let feinted = -Infinity;
  const executor = golemStyled(seed, GOLEM_TACTICS_V3, (available, r, view) => {
    const choose = (...options: StyleOption[]) => options.find((o) => available.includes(o)) ?? available[0];
    const canPunish = r.theirs === "recover" || (r.sinceTheirCommit > 0.2 && r.sinceTheirCommit < 0.65);
    if (kind === "rush") return choose("ram", "shove", "cut", "strike", "close");
    if (kind === "turtle") return choose("parry", "wait", "hold");
    if (kind === "circle") return choose("circle", "cut", "close");
    if (kind === "interceptor" && r.intercept !== null) return choose("parry", "void", "withdraw");
    if (kind === "feinter" && view.clock - feinted > 1.5 && available.includes("feint")) {
      feinted = view.clock; return "feint";
    }
    if (kind === "coordinator" && r.spareCanCover && r.theirs === "commit") return choose("parry", "thrust", "cut");
    if (canPunish) return choose("thrust", "cut", "strike", "close");
    if (r.theirs === "commit") return choose("void", "parry", "withdraw");
    return kind === "punisher" ? choose("wait", "close", "hold") : choose("cut", "strike", "close");
  });
  return { name: `lab-${kind}`, decide: (v, dt) => executor.decide(v, dt) };
}

export interface DenseLayer { weights: number[][]; bias: number[]; activation: "tanh" | "linear" }
export interface NetworkArtifact {
  version: number; surface: LabSurface; hz: number; observationNames: string[];
  baseline?: string;
  /** Optional PPO diagonal Gaussian; noise is applied before action clipping. */
  samplingStd?: number[];
  /** Narrow deployment hypothesis; unsupported bodies receive the exact residual baseline. */
  scope?: "dual-strikers" | "twin-blades";
  residualMode?: "aim-reach";
  layers: DenseLayer[];
  /** Feed-forward NEAT graph, evaluated in topological order. */
  graph?: { outputs: number[]; nodes: { id: number; bias: number; response: number; links: [number, number][] }[] };
}
export function validateNetwork(model: NetworkArtifact): void {
  const names = observationNames(model.version);
  if (model.residualMode !== undefined && (model.residualMode !== "aim-reach" || model.surface !== "residual")) throw new Error("invalid residual mode");
  if (model.scope !== undefined && (!["dual-strikers", "twin-blades"].includes(model.scope) || model.surface !== "residual")) {
    throw new Error("invalid network scope");
  }
  if (model.baseline !== undefined && !["golem-driver", "golem-duelist"].includes(model.baseline)) throw new Error("invalid network baseline");
  if (JSON.stringify(model.observationNames) !== JSON.stringify(names)
    || ![12, 30, 60].includes(model.hz)) throw new Error("incompatible lab network");
  const size = actionSize(model.surface);
  if (model.samplingStd !== undefined && (!Array.isArray(model.samplingStd)
    || model.samplingStd.length !== size || model.samplingStd.some((x) => !Number.isFinite(x) || x < 0))) {
    throw new Error("invalid network sampling deviation");
  }
  if (model.graph) {
    const known = new Set(names.map((_, i) => -i - 1));
    for (const n of model.graph.nodes) {
      if (!Number.isInteger(n.id) || known.has(n.id) || !Number.isFinite(n.bias) || !Number.isFinite(n.response)
        || n.links.some(([id, w]) => !known.has(id) || !Number.isFinite(w))) throw new Error("invalid network graph");
      known.add(n.id);
    }
    if (model.graph.outputs.length !== size || model.graph.outputs.some((id) => !known.has(id))) throw new Error("invalid graph outputs");
  } else {
    let width = names.length;
    for (const layer of model.layers) {
      if (!["tanh", "linear"].includes(layer.activation) || !layer.bias.length || layer.bias.some((x) => !Number.isFinite(x))
        || layer.weights.length !== layer.bias.length || layer.weights.some((r) => r.length !== width || r.some((x) => !Number.isFinite(x)))) {
        throw new Error("invalid dense network");
      }
      width = layer.bias.length;
    }
    if (!model.layers.length || width !== size) throw new Error("invalid network outputs");
  }
}
function rawInference(model: NetworkArtifact, observation: number[]): number[] {
  if (observation.length !== model.observationNames.length || observation.some((x) => !Number.isFinite(x))) throw new Error("invalid network input");
  if (model.graph) {
    const values = new Map(observation.map((x, i) => [-i - 1, x]));
    for (const n of model.graph.nodes) {
      const sum = n.links.reduce((s, [id, w]) => s + values.get(id)! * w, 0);
      values.set(n.id, Math.tanh(clamp(2.5 * (n.bias + n.response * sum), -60, 60)));
    }
    return model.graph.outputs.map((id) => clamp(values.get(id)!));
  }
  let values = observation;
  for (const layer of model.layers) values = layer.bias.map((b, i) => {
    const x = b + layer.weights[i].reduce((sum, w, j) => sum + w * values[j], 0);
    return layer.activation === "tanh" ? Math.tanh(x) : x;
  });
  return values;
}
export function infer(model: NetworkArtifact, observation: number[]): number[] {
  return rawInference(model, observation).map((v) => clamp(v));
}
export function sampleNetwork(model: NetworkArtifact, observation: number[], random: () => number): number[] {
  const values = rawInference(model, observation);
  return values.map((mean, i) => {
    const deviation = model.samplingStd?.[i] ?? 0;
    if (deviation === 0) return clamp(mean);
    const normal = Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, random()))) * Math.cos(2 * Math.PI * random());
    return clamp(mean + deviation * normal);
  });
}

/** Training and browser execution use exactly the same action adapter and hold cadence. */
export function aimReachResidual(action: number[]): number[] {
  validateAction("residual", action);
  return action.map((value, i) => /^(primary|secondary)\.(pointerX|pointerY|reach)$/.test(DIRECT_FIELDS[i]) ? value : 0);
}

export function controlledMind(surface: LabSurface, seed: number, source: (view: FighterView) => number[] | null,
  baseline = "golem-driver", residualMode?: "aim-reach"): Mind {
  const fallback = policyMind(baseline, seed);
  const driven = golemDriven(seed, GOLEM_TACTICS_V4, (_reading, view) => pilotCommand(source(view) ?? Array(12).fill(0)));
  return { name: `lab-${surface}`, decide(view, dt) {
    if (surface === "pilot") return driven.decide(view, dt);
    const base = fallback.decide(view, dt);
    const raw = source(view);
    const action = raw === null ? null : residualMode === "aim-reach" ? aimReachResidual(raw) : raw;
    return action === null ? base : directIntent(action, view, surface === "residual" ? base : undefined);
  } };
}
export function networkMind(model: NetworkArtifact, seed: number): Mind {
  validateNetwork(model);
  let nextAsk = -Infinity, action: number[] = [];
  const random = mulberry32(seed ^ 0x5a17c9e3);
  const inner = controlledMind(model.surface, seed, (view) => {
    if (model.scope) {
      const caps = view.self.capabilities;
      if (!caps || caps.pairedHands || HANDS.some((hand) => view.self.hands[hand].lost
        || !canAttack(caps.effectors[hand]) || !(model.scope === "twin-blades" ? ["sword"] : ["sword", "empty"]).includes(view.self.hands[hand].weapon))) return null;
    }
    return action;
  }, model.baseline ?? "golem-driver", model.residualMode);
  return { name: "lab-network", decide(view, dt) {
    if (view.clock + 1e-9 >= nextAsk) { nextAsk = view.clock + 1 / model.hz; action = sampleNetwork(model, labObservation(view, model.version), random); }
    return inner.decide(view, dt);
  } };
}
export type LabPolicy = { kind: "baseline"; name: string } | { kind: "bespoke"; name: Bespoke }
  | { kind: "network"; model: NetworkArtifact } | { kind: "refit"; tables: DuelModelTables }
  | { kind: "terminal-model"; model: TerminalModel } | MixtureSpec;
export function labMind(spec: LabPolicy, seed: number): Mind {
  switch (spec.kind) {
    case "baseline": return policyMind(spec.name, seed);
    case "bespoke": return bespokeMind(spec.name, seed);
    case "network": return networkMind(spec.model, seed);
    case "terminal-model": return terminalModelMind(spec.model, seed);
    case "mixture": return mixtureMind(spec, seed);
    case "refit": { const p = golemPlanner(seed, spec.tables); return { name: "lab-refit", decide: (v, dt) => p.decide(v, dt) }; }
    default: throw new Error("unknown lab policy");
  }
}
