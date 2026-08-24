import { hasPoint, isShooting, isStriking, type WeaponKind } from "../hands.ts";
import { freshIntent } from "../action-primitives.ts";
import { ATTACK_OPTION_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, TACTIC_NAMES, composeTactic, handActionOption, movementIntent,
  type BehaviourRecord, type CombatOption, type HandActionName, type MovementName, type OptionName } from "../options.ts";
import type { FighterView, Intent, Mind } from "../mind.ts";
import { Checkpoint } from "./checkpoint.ts";
import { FEATURE_COLUMNS, FeatureWriter } from "./features.ts";
import { Network } from "./network.ts";
import { SeededRng } from "./rng.ts";

export const DECISION_SECONDS = 0.10;
export const MIN_PERSISTENCE = 0.10;
export const MAX_PERSISTENCE = 0.80;
export const META_OUTPUT_NAMES = Object.freeze([...MOVEMENT_NAMES, ...HAND_ACTION_NAMES, "persistence"]);

const has = (view: FighterView, predicate: (kind: WeaponKind) => boolean): boolean =>
  Object.values(view.self.hands).some((hand) => !hand.lost && predicate(hand.weapon));
export function supportedOptions(view: FighterView): ReadonlySet<OptionName> {
  if (!Object.values(view.self.hands).some((hand) => !hand.lost) && !Object.keys(view.self.naturalAttacks ?? {}).length) return new Set<OptionName>();
  const values = new Set<OptionName>([...MOVEMENT_NAMES, "recover"]);
  if (Object.values(view.self.hands).some((hand) => !hand.lost)) values.add("cover");
  if (has(view, (kind) => isStriking(kind) && kind !== "empty")) values.add("cut");
  if (has(view, hasPoint)) values.add("thrust");
  if (has(view, (kind) => kind === "empty")) values.add("punch");
  if (has(view, isShooting)) values.add("shoot");
  if (view.self.naturalAttacks?.bite) values.add("bite");
  return values;
}

export interface MetaLogit {
  readonly option: OptionName;
  readonly value: number;
}

export interface MetaDiagnostic {
  readonly option: OptionName;
  readonly movement: MovementName;
  readonly action: HandActionName;
  readonly persistenceSeconds: number;
  readonly persistenceRemaining: number;
  readonly topLogits: readonly MetaLogit[];
}

export interface MetaMind extends Mind {
  readonly selected: OptionName;
  readonly selectedMovement: MovementName;
  readonly selectedAction: HandActionName;
  readonly switches: number;
  readonly entries: Readonly<Record<OptionName, number>>;
  /** A frozen reading of the last decision. Reading it never runs the policy. */
  diagnostic(): MetaDiagnostic;
}

const EMPTY_LOGITS: readonly MetaLogit[] = Object.freeze([]);
const diagnosticSnapshot = (
  option: OptionName, movement: MovementName, action: HandActionName,
  persistenceSeconds: number,
  persistenceRemaining: number,
  logits: readonly MetaLogit[],
): MetaDiagnostic => Object.freeze({
  option,
  movement,
  action,
  persistenceSeconds,
  persistenceRemaining,
  topLogits: Object.freeze(logits.map((row) => Object.freeze({ ...row }))),
});

export function networkMetaMind(network: Network): MetaMind {
  const expectedOutputs = MOVEMENT_NAMES.length + HAND_ACTION_NAMES.length + 1;
  if (network.nodes.filter((node) => node.kind === "input").length !== FEATURE_COLUMNS.length ||
      network.nodes.filter((node) => node.kind === "output").length !== expectedOutputs) {
    throw new Error(`meta network shape must be ${FEATURE_COLUMNS.length} inputs and ${expectedOutputs} outputs`);
  }
  const writer = new FeatureWriter(); let current: CombatOption | null = null;
  let selectedMovement: MovementName = "hold"; let selectedAction: HandActionName = "recover";
  let decisionClock = -Infinity; let persistUntil = -Infinity; let switches = 0;
  let persistenceSeconds = 0; let observedClock = 0; let topLogits: readonly MetaLogit[] = EMPTY_LOGITS;
  const entries = Object.fromEntries(TACTIC_NAMES.map((name) => [name, 0])) as Record<OptionName, number>;
  const choose = (view: FighterView, maySwitch = true): void => {
    writer.setTactic(selectedMovement, selectedAction, view.clock);
    const output = network.run(writer.write(view)); const allowed = supportedOptions(view);
    let bestMovement: MovementName = "hold"; let movementScore = -Infinity;
    MOVEMENT_NAMES.forEach((name, index) => { if ((output[index] as number) > movementScore) { bestMovement = name; movementScore = output[index] as number; } });
    let bestAction: HandActionName = "recover"; let actionScore = -Infinity;
    HAND_ACTION_NAMES.forEach((name, offset) => { const index = MOVEMENT_NAMES.length + offset;
      if (allowed.has(name) && (output[index] as number) > actionScore) { bestAction = name; actionScore = output[index] as number; } });
    if (output.some((value) => !Number.isFinite(value))) throw new Error("learned meta-policy produced a non-finite output");
    topLogits = [...MOVEMENT_NAMES, ...HAND_ACTION_NAMES.filter((name) => allowed.has(name))]
      .map((name) => ({ option: name, value: output[name === "close" || name === "hold" || name === "circle-left" || name === "circle-right" || name === "disengage"
        ? MOVEMENT_NAMES.indexOf(name) : MOVEMENT_NAMES.length + HAND_ACTION_NAMES.indexOf(name as HandActionName)] as number }))
      .sort((a, b) => b.value - a.value || TACTIC_NAMES.indexOf(a.option) - TACTIC_NAMES.indexOf(b.option))
      .slice(0, 3);
    const persistenceRaw = Math.max(-1, Math.min(1, output[MOVEMENT_NAMES.length + HAND_ACTION_NAMES.length] as number));
    const persistence = MIN_PERSISTENCE + (MAX_PERSISTENCE - MIN_PERSISTENCE) * ((persistenceRaw + 1) / 2);
    if (maySwitch) {
      persistenceSeconds = persistence;
      if (!current || bestMovement !== selectedMovement || bestAction !== selectedAction || current.done(view)) {
        if (current && (bestMovement !== selectedMovement || bestAction !== selectedAction)) switches += 1;
        selectedMovement = bestMovement; selectedAction = bestAction; current = handActionOption(bestAction); current.enter(view);
        entries[bestMovement] += 1; entries[bestAction] += 1; writer.setTactic(bestMovement, bestAction, view.clock);
      }
      persistUntil = view.clock + persistence;
    }
    decisionClock = view.clock;
  };
  return { name: "learned-meta", get selected() { return selectedAction; }, get selectedMovement() { return selectedMovement; },
    get selectedAction() { return selectedAction; }, get switches() { return switches; }, entries,
    diagnostic() { return diagnosticSnapshot(selectedAction, selectedMovement, selectedAction, persistenceSeconds, Math.max(0, persistUntil - observedClock), topLogits); },
    decide(view, dt): Intent {
    observedClock = view.clock;
    if (supportedOptions(view).size === 0) {
      current = null; if (selectedAction !== "recover" || selectedMovement !== "hold") switches += 1;
      selectedMovement = "hold"; selectedAction = "recover"; writer.reset();
      persistenceSeconds = 0; persistUntil = view.clock; topLogits = EMPTY_LOGITS; return freshIntent();
    }
    const unavailable = current ? !supportedOptions(view).has(selectedAction) : true;
    if (!current || unavailable || view.clock - decisionClock >= DECISION_SECONDS) {
      choose(view, !current || unavailable || current.done(view) || view.clock >= persistUntil);
    }
    const action = (current as CombatOption).decide(view, dt);
    return composeTactic(view, selectedMovement, selectedAction, movementIntent(selectedMovement, view), action);
  } };
}

export function randomMetaMind(seed: number): MetaMind {
  const rng = new SeededRng(seed); let selectedMovement: MovementName = "hold"; let selectedAction: HandActionName = "recover";
  let current: CombatOption | null = null; let until = -1; let switches = 0;
  const entries = Object.fromEntries(TACTIC_NAMES.map((name) => [name, 0])) as Record<OptionName, number>;
  let persistenceSeconds = 0; let observedClock = 0;
  return { name: "random-meta-control", get selected() { return selectedAction; }, get selectedMovement() { return selectedMovement; },
    get selectedAction() { return selectedAction; }, get switches() { return switches; }, entries,
    diagnostic() { return diagnosticSnapshot(selectedAction, selectedMovement, selectedAction, persistenceSeconds, Math.max(0, until - observedClock), EMPTY_LOGITS); },
    decide(view, dt) {
    observedClock = view.clock;
    if (supportedOptions(view).size === 0) { current = null; if (selectedAction !== "recover" || selectedMovement !== "hold") switches += 1;
      selectedMovement = "hold"; selectedAction = "recover"; return freshIntent(); }
    if (!current || current.done(view) || view.clock >= until || !supportedOptions(view).has(selectedAction)) {
      const nextMovement = rng.choose(MOVEMENT_NAMES); const actions = HAND_ACTION_NAMES.filter((name) => supportedOptions(view).has(name));
      const nextAction = rng.choose(actions); if (current && (nextMovement !== selectedMovement || nextAction !== selectedAction)) switches += 1;
      selectedMovement = nextMovement; selectedAction = nextAction; current = handActionOption(selectedAction); current.enter(view);
      entries[selectedMovement] += 1; entries[selectedAction] += 1;
      persistenceSeconds = MIN_PERSISTENCE + rng.next() * (MAX_PERSISTENCE - MIN_PERSISTENCE); until = view.clock + persistenceSeconds;
    }
    return composeTactic(view, selectedMovement, selectedAction, movementIntent(selectedMovement, view), current.decide(view, dt));
  } };
}

/** Build the runtime policy only from a checkpoint that passes the complete codec contract. */
export function learnedMetaMind(source: Checkpoint | Uint8Array | null | undefined): MetaMind {
  if (source === null || source === undefined) throw new Error("learned-v1 checkpoint is missing");
  try {
    const checkpoint = source instanceof Checkpoint ? source : Checkpoint.fromBytes(source);
    if (checkpoint.featureVersion !== 3) throw new Error(`feature v${checkpoint.featureVersion} checkpoint cannot run as feature v3`);
    return networkMetaMind(checkpoint.network());
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`learned-v1 checkpoint is corrupt or incompatible${detail}`, { cause: error });
  }
}

export function metaDiagnostic(mind: Mind): MetaDiagnostic | null {
  const candidate = mind as Partial<MetaMind>;
  return typeof candidate.diagnostic === "function" ? candidate.diagnostic() : null;
}

export interface FitnessComponents { feasible: boolean; win: number; vitality: number; efficiency: number; survival: number; switchCost: number; total: number }
export function fitnessComponents(record: BehaviourRecord, opponentVitality: number, switches: number): FitnessComponents {
  // A time-cap draw and a loss are both terminal failures. Elapsed survival
  // previously paid a healthy runner for avoiding the fight; it is retained as
  // a zero-valued report field only so old experiment readers refuse no rows.
  const win = record.win ? 4 : -4; const vitality = Math.max(-0.5, Math.min(0.5, (record.vitality - opponentVitality) * 0.5));
  const efficiency = Math.min(0.5, record.damage / Math.max(1, record.damage + (1 - record.vitality) * 300) * 0.5);
  const survival = 0;
  const feasible = record.engagement.attacksInWindow > 0 ||
    (record.engagement.viableOpportunities === 0 && record.engagement.retreatOutsideReachSeconds === 0);
  const switchCost = Math.min(0.5, switches * 0.01); return { feasible, win, vitality, efficiency, survival, switchCost,
    total: (feasible ? 0 : -100) + win + vitality + efficiency - switchCost };
}

export function noveltyDescriptor(record: BehaviourRecord): number[] {
  const seconds = Math.max(record.seconds, 1e-9); const attacks = ATTACK_OPTION_NAMES.reduce((sum, name) => sum + record.attackAttempts[name], 0);
  return [...record.rangeBins.map((value) => value / seconds), Math.min(1, record.blocks / Math.max(1, attacks * 10)),
    record.contacts.primary / Math.max(1, record.contacts.primary + record.contacts.secondary),
    Math.min(1, Object.keys(record.transitions).length / Math.max(1, attacks)), record.crouchTime / seconds,
    Math.min(1, record.trunkTwistSignChanges / seconds)];
}

export function noveltyScore(descriptor: readonly number[], archive: readonly (readonly number[])[], neighbours = 5): number {
  if (!archive.length) return 0;
  const distances = archive.map((other) => Math.hypot(...descriptor.map((value, index) => value - (other[index] ?? 0)))).sort((a, b) => a - b);
  const nearest = distances.slice(0, Math.min(neighbours, distances.length)); return nearest.reduce((a, b) => a + b, 0) / nearest.length;
}
