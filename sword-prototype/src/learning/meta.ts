import { hasPoint, isShooting, isStriking, type WeaponKind } from "../hands.ts";
import { freshIntent } from "../action-primitives.ts";
import { ATTACK_OPTION_NAMES, OPTION_NAMES, combatOption, type BehaviourRecord, type CombatOption, type OptionName } from "../options.ts";
import type { FighterView, Intent, Mind } from "../mind.ts";
import { Checkpoint } from "./checkpoint.ts";
import { FEATURE_COLUMNS, FeatureWriter } from "./features.ts";
import { Network } from "./network.ts";
import { SeededRng } from "./rng.ts";

export const DECISION_SECONDS = 0.10;
export const MIN_PERSISTENCE = 0.10;
export const MAX_PERSISTENCE = 0.80;
export const META_OUTPUT_NAMES = Object.freeze([...OPTION_NAMES, "persistence"]);

const has = (view: FighterView, predicate: (kind: WeaponKind) => boolean): boolean =>
  Object.values(view.self.hands).some((hand) => !hand.lost && predicate(hand.weapon));
export function supportedOptions(view: FighterView): ReadonlySet<OptionName> {
  if (!Object.values(view.self.hands).some((hand) => !hand.lost)) return new Set<OptionName>();
  const values = new Set<OptionName>(["close", "disengage", "cover", "recover"]);
  if (has(view, (kind) => isStriking(kind) && kind !== "empty")) values.add("cut");
  if (has(view, hasPoint)) values.add("thrust");
  if (has(view, (kind) => kind === "empty")) values.add("punch");
  if (has(view, isShooting)) values.add("shoot");
  return values;
}

export interface MetaLogit {
  readonly option: OptionName;
  readonly value: number;
}

export interface MetaDiagnostic {
  readonly option: OptionName;
  readonly persistenceSeconds: number;
  readonly persistenceRemaining: number;
  readonly topLogits: readonly MetaLogit[];
}

export interface MetaMind extends Mind {
  readonly selected: OptionName;
  readonly switches: number;
  readonly entries: Readonly<Record<OptionName, number>>;
  /** A frozen reading of the last decision. Reading it never runs the policy. */
  diagnostic(): MetaDiagnostic;
}

const EMPTY_LOGITS: readonly MetaLogit[] = Object.freeze([]);
const diagnosticSnapshot = (
  option: OptionName,
  persistenceSeconds: number,
  persistenceRemaining: number,
  logits: readonly MetaLogit[],
): MetaDiagnostic => Object.freeze({
  option,
  persistenceSeconds,
  persistenceRemaining,
  topLogits: Object.freeze(logits.map((row) => Object.freeze({ ...row }))),
});

export function networkMetaMind(network: Network): MetaMind {
  const expectedOutputs = OPTION_NAMES.length + 1;
  if (network.nodes.filter((node) => node.kind === "input").length !== FEATURE_COLUMNS.length ||
      network.nodes.filter((node) => node.kind === "output").length !== expectedOutputs) {
    throw new Error(`meta network shape must be ${FEATURE_COLUMNS.length} inputs and ${expectedOutputs} outputs`);
  }
  const writer = new FeatureWriter(); let current: CombatOption | null = null; let selected: OptionName = "recover";
  let decisionClock = -Infinity; let persistUntil = -Infinity; let switches = 0;
  let persistenceSeconds = 0; let observedClock = 0; let topLogits: readonly MetaLogit[] = EMPTY_LOGITS;
  const entries = Object.fromEntries(OPTION_NAMES.map((name) => [name, 0])) as Record<OptionName, number>;
  const choose = (view: FighterView, maySwitch = true): void => {
    const output = network.run(writer.write(view)); const allowed = supportedOptions(view); let best: OptionName = "recover"; let score = -Infinity;
    OPTION_NAMES.forEach((name, index) => { if (allowed.has(name) && (output[index] as number) > score) { best = name; score = output[index] as number; } });
    if (output.some((value) => !Number.isFinite(value))) throw new Error("learned meta-policy produced a non-finite output");
    topLogits = OPTION_NAMES.map((name, index) => ({ option: name, value: output[index] as number }))
      .sort((a, b) => b.value - a.value || OPTION_NAMES.indexOf(a.option) - OPTION_NAMES.indexOf(b.option))
      .slice(0, 3);
    const persistenceRaw = Math.max(-1, Math.min(1, output[OPTION_NAMES.length] as number));
    const persistence = MIN_PERSISTENCE + (MAX_PERSISTENCE - MIN_PERSISTENCE) * ((persistenceRaw + 1) / 2);
    persistenceSeconds = persistence;
    if (maySwitch) {
      if (!current || best !== selected || current.done(view)) {
        if (current && best !== selected) switches += 1; selected = best; current = combatOption(best); current.enter(view);
        entries[best] += 1;
      }
      persistUntil = view.clock + persistence;
    }
    decisionClock = view.clock;
  };
  return { name: "learned-meta", get selected() { return selected; }, get switches() { return switches; }, entries,
    diagnostic() { return diagnosticSnapshot(selected, persistenceSeconds, Math.max(0, persistUntil - observedClock), topLogits); },
    decide(view, dt): Intent {
    observedClock = view.clock;
    if (supportedOptions(view).size === 0) { current = null; if (selected !== "recover") switches += 1; selected = "recover"; return freshIntent(); }
    const unavailable = current ? !supportedOptions(view).has(current.name) : true;
    if (!current || unavailable || view.clock - decisionClock >= DECISION_SECONDS) {
      choose(view, !current || unavailable || current.done(view) || view.clock >= persistUntil);
    }
    return (current as CombatOption).decide(view, dt);
  } };
}

export function randomMetaMind(seed: number): MetaMind {
  const rng = new SeededRng(seed); let selected: OptionName = "recover"; let current: CombatOption | null = null; let until = -1; let switches = 0;
  const entries = Object.fromEntries(OPTION_NAMES.map((name) => [name, 0])) as Record<OptionName, number>;
  let persistenceSeconds = 0; let observedClock = 0;
  return { name: "random-meta-control", get selected() { return selected; }, get switches() { return switches; }, entries,
    diagnostic() { return diagnosticSnapshot(selected, persistenceSeconds, Math.max(0, until - observedClock), EMPTY_LOGITS); },
    decide(view, dt) {
    observedClock = view.clock;
    if (supportedOptions(view).size === 0) { current = null; if (selected !== "recover") switches += 1; selected = "recover"; return freshIntent(); }
    if (!current || current.done(view) || view.clock >= until || !supportedOptions(view).has(selected)) {
      const next = rng.choose([...supportedOptions(view)]); if (current && next !== selected) switches += 1; selected = next;
      current = combatOption(selected); current.enter(view); entries[selected] += 1;
      persistenceSeconds = MIN_PERSISTENCE + rng.next() * (MAX_PERSISTENCE - MIN_PERSISTENCE); until = view.clock + persistenceSeconds;
    }
    return current.decide(view, dt);
  } };
}

/** Build the runtime policy only from a checkpoint that passes the complete codec contract. */
export function learnedMetaMind(source: Checkpoint | Uint8Array | null | undefined): MetaMind {
  if (source === null || source === undefined) throw new Error("learned-v1 checkpoint is missing");
  try {
    const checkpoint = source instanceof Checkpoint ? source : Checkpoint.fromBytes(source);
    return networkMetaMind(checkpoint.network());
  } catch (error) {
    throw new Error("learned-v1 checkpoint is corrupt or incompatible", { cause: error });
  }
}

export function metaDiagnostic(mind: Mind): MetaDiagnostic | null {
  const candidate = mind as Partial<MetaMind>;
  return typeof candidate.diagnostic === "function" ? candidate.diagnostic() : null;
}

export interface FitnessComponents { win: number; vitality: number; efficiency: number; survival: number; switchCost: number; total: number }
export function fitnessComponents(record: BehaviourRecord, opponentVitality: number, switches: number): FitnessComponents {
  const win = record.win ? 4 : 0; const vitality = record.vitality - opponentVitality;
  const efficiency = record.damage / Math.max(1, record.damage + (1 - record.vitality) * 300);
  const survival = record.seconds > 0 ? record.vitality * Math.min(1, record.seconds / 30) : 0;
  const switchCost = Math.min(0.5, switches * 0.01); return { win, vitality, efficiency, survival, switchCost,
    total: win + vitality + efficiency + survival - switchCost };
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
