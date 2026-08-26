// The tuple-key vocabulary lives in `options.ts` beside the five tables it is
// over. Keeping one owner matters more than saving this import: the frozen
// tournament reader and the option executor must parse exactly the same rows.
import { FREE_CHOICE_HEADS, FREE_CHOICE_TABLES, TACTIC_KEY_HEADS, parseTacticCountKey, tacticKeyFailure,
  tacticTargets, type FreeChoiceHead, type TacticTuple } from "../options.ts";
import { RESEARCH_ALGORITHMS, artifactChecksum, canonicalJson, type ResearchAlgorithm } from "./artifact.ts";
import { OPPORTUNITY_WINDOW_SECONDS, STALL_WINDOW_SECONDS } from "./engagement.ts";
import { MAX_FIRST_ATTACK_P90_SECONDS, MAX_NEAR_RANGE_STALL_SHARE, MAX_SPECIALIST_GAP,
  MAX_SYMMETRIC_TIME_CAP_RATE, MIN_ACTION_SHARE, MIN_ATTACK_CONTACT_RATE, MIN_DIVERSE_ACTIONS,
  MIN_OPPORTUNITY_ATTACK_RATE, engagementGates, gatePassed, type GateRow } from "./gates.ts";
export { MAX_FIRST_ATTACK_P90_SECONDS, MAX_NEAR_RANGE_STALL_SHARE, MAX_SPECIALIST_GAP,
  MAX_SYMMETRIC_TIME_CAP_RATE, MIN_ACTION_SHARE, MIN_ATTACK_CONTACT_RATE, MIN_DIVERSE_ACTIONS,
  MIN_OPPORTUNITY_ATTACK_RATE } from "./gates.ts";
// The dwell record, from a leaf with no imports of its own. It cannot come from
// `meta.ts`, which owns the grid's other reader: this file is already cyclic
// with `options.ts`, and `meta.ts` reads `options.ts`'s tables at module scope,
// so that edge would close the cycle through a partially-initialised binding.
import { emptyPersistenceCounts, mergePersistenceCounts, persistenceRecordFailure,
  type PersistenceCounts } from "./persistence.ts";
import type { ResearchMatrixJob } from "./research-matrix.ts";

export { OPPORTUNITY_WINDOW_SECONDS, STALL_WINDOW_SECONDS } from "./engagement.ts";
/**
 * The behaviour record names the whole tuple, and it is one joint map rather
 * than five marginal ones.
 *
 * The record counted `label.action` alone from the day it was written, which was
 * the whole decision while the output contract was thirteen wide. It is 26 now
 * -- movement x action x effector x target x stance, plus a scalar persistence
 * -- and an action-only count says nothing whatever about the other four heads,
 * which is reason enough on its own to key on the tuple.
 *
 * **It was written down as "this now separates a learned effector head from a
 * body that only offered one hand", and that is an overclaim.** The separation
 * exists, but only where the body offers a second hand for the action chosen,
 * and `headUtilisation`'s docstring carries the measured table: 2 of the 13
 * research cells, both of them the weaponless ones. No armed loadout gives an
 * attacking action two legal effectors. What the tuple key buys unconditionally
 * is the other four heads and the joint structure -- whether the low cuts and
 * the left slips were the same decisions -- and that is the claim to make for it.
 *
 * The joint map *is* the five marginals: `tacticMarginal` projects any head out
 * of it, and nothing is recoverable from five separate maps that is not
 * recoverable from this one, while the converse is false -- five marginals
 * cannot say whether the low cuts and the left slips were the same decisions. It
 * also carries the target head's legality denominator for free, because
 * `tacticTargets` is a pure table lookup on the *action*: a key that names its
 * action names how many targets were legal when it was chosen.
 *
 * **Four of the five heads therefore need no map of their own, and `action` is
 * the one that stopped needing one.** Movement and stance are legal on every
 * body; target is derived from the action; and every body that can decide at all
 * offers two or more actions, so a free-action count is exactly the action
 * marginal. `FREE_CHOICE_HEADS` in `options.ts` carries that theorem, the
 * coverage space of the sweeps behind it, and the head-by-head check -- along
 * with the key format and its delimiter. The effector is the one head a joint
 * map cannot answer for, because a key names the hand that acted and no key says
 * how many were offered.
 *
 * **The sixth head is not in this key and is not going to be.** A decision names
 * a dwell as well as a tuple, and adding it would multiply a key that entry 17
 * of the found-not-fixed register already measures as too sparse for joint
 * questions -- 555 occupied cells of 2,520 at 2.39 counts each -- by eight. The
 * dwell is a *marginal* carried beside this map, in `PersistenceCounts`, which is
 * the shape `freeChoiceCounts` already is and for the same reason: it is a fact
 * about a decision that no projection of the joint key can recover.
 */
export type TacticCounts = Readonly<Record<string, number>>;
export type FreeChoiceCounts = Readonly<Record<FreeChoiceHead, Readonly<Record<string, number>>>>;

/** One head projected out of the joint record. Every marginal sums to the same total. */
export function tacticMarginal(counts: TacticCounts, head: keyof TacticTuple): Readonly<Record<string, number>> {
  const marginal: Record<string, number> = {};
  for (const [key, count] of Object.entries(counts)) {
    const name = parseTacticCountKey(key)[head];
    marginal[name] = (marginal[name] ?? 0) + count;
  }
  return Object.freeze(marginal);
}

/**
 * Both halves of the behaviour record, summed over a set of rows.
 *
 * **The only production aggregation of the free-choice statistic**, which is why
 * it is a named function with a test rather than four lines inside
 * `candidateFromRawRows`: deleting the free-choice half leaves every candidate
 * reporting `freeChoiceDecisions: 0` on every head, and a report saying "the
 * body never offered a second hand" for a whole tournament is indistinguishable
 * from a true one. It is also what `scripts/evaluate-ai.mjs` calls to group by
 * cell, which `candidateFromRawRows` cannot answer because it folds the cell
 * keys away.
 */
export function mergeBehaviourRecord(rows: readonly Pick<TournamentRawRow, "tacticCounts" | "freeChoiceCounts" | "persistenceCounts">[]):
  { readonly tacticCounts: TacticCounts; readonly freeChoiceCounts: FreeChoiceCounts; readonly persistenceCounts: PersistenceCounts } {
  const tacticCounts: Record<string, number> = {};
  const freeChoiceCounts: Record<FreeChoiceHead, Record<string, number>> = { effector: {} };
  for (const row of rows) {
    for (const [key, count] of Object.entries(row.tacticCounts)) tacticCounts[key] = (tacticCounts[key] ?? 0) + count;
    for (const head of FREE_CHOICE_HEADS) {
      for (const [name, count] of Object.entries(row.freeChoiceCounts[head] ?? {})) {
        freeChoiceCounts[head][name] = (freeChoiceCounts[head][name] ?? 0) + count;
      }
    }
  }
  return Object.freeze({ tacticCounts: Object.freeze(tacticCounts),
    freeChoiceCounts: Object.freeze({ effector: Object.freeze(freeChoiceCounts.effector) }),
    // The third half of the record, folded by the module that owns its shape.
    // Deleting this line leaves every candidate reporting an empty dwell
    // marginal, which reads exactly like a tournament in which nobody decided --
    // the same failure the free-choice fold's own note records, one head over.
    persistenceCounts: mergePersistenceCounts(rows.map((row) => row.persistenceCounts)) });
}

export interface TournamentCell {
  readonly name: string;
  readonly meaningfulEngagement: number;
  readonly opportunityAttackRate: number;
  readonly attackContactRate: number;
  readonly nearRangeStallShare: number;
  readonly firstAttackP90Seconds: number;
  readonly symmetricTimeCapRate: number;
  readonly score: number;
  readonly specialistScore: number;
}

export interface TournamentCandidate {
  readonly name: string;
  readonly algorithm: ResearchAlgorithm;
  readonly artifactBytes: number;
  readonly meanScore: number;
  readonly confidenceLow: number;
  readonly confidenceHigh?: number;
  readonly scriptedScore: number;
  readonly randomScore: number;
  readonly cells: readonly TournamentCell[];
  readonly tacticCounts: TacticCounts;
  readonly freeChoiceCounts: FreeChoiceCounts;
  readonly persistenceCounts: PersistenceCounts;
  readonly safety: {
    readonly finiteAnatomical: boolean;
    readonly capabilities: boolean;
    readonly postVerdict: boolean;
    readonly stuckActions: boolean;
    readonly lifecycle: boolean;
  };
}

export interface CandidateVerdict {
  readonly name: string;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export interface TournamentVerdict {
  readonly candidates: readonly CandidateVerdict[];
  readonly promoted: string | null;
}

export interface TournamentRawRow {
  readonly manifestDigest: string;
  readonly index: number;
  readonly candidate: string;
  readonly job: ResearchMatrixJob;
  readonly outcome: "win" | "loss" | "draw";
  readonly seconds: number;
  readonly engagement: {
    readonly opportunities: number; readonly attacks: number; readonly contacts: number;
    readonly nearRangeStallSeconds: number; readonly firstAttackSeconds: number | null;
    readonly meaningful: number;
  };
  readonly tacticCounts: TacticCounts;
  readonly freeChoiceCounts: FreeChoiceCounts;
  readonly persistenceCounts: PersistenceCounts;
  readonly safety: TournamentCandidate["safety"];
}

export interface FrozenTournamentManifest {
  readonly version: 1;
  readonly split: "test";
  readonly selectedOn: "validation";
  readonly candidates: readonly { readonly name: string; readonly algorithm: ResearchAlgorithm;
    readonly artifactDigest: string; readonly artifactBytes: number }[];
  readonly controls: readonly ["scripted-meta-control", "random-meta-control", "specialist-control"];
  readonly jobs: readonly ResearchMatrixJob[];
  readonly thresholds: Readonly<Record<string, number>>;
  readonly priorTestRows: 0;
  readonly digest: string;
}

export const TOURNAMENT_THRESHOLDS = Object.freeze({
  opportunityWindowSeconds: OPPORTUNITY_WINDOW_SECONDS, stallWindowSeconds: STALL_WINDOW_SECONDS,
  maxNearRangeStallShare: MAX_NEAR_RANGE_STALL_SHARE, minOpportunityAttackRate: MIN_OPPORTUNITY_ATTACK_RATE,
  minAttackContactRate: MIN_ATTACK_CONTACT_RATE, maxFirstAttackP90Seconds: MAX_FIRST_ATTACK_P90_SECONDS,
  maxSymmetricTimeCapRate: MAX_SYMMETRIC_TIME_CAP_RATE, maxSpecialistGap: MAX_SPECIALIST_GAP,
  minActionShare: MIN_ACTION_SHARE, minDiverseActions: MIN_DIVERSE_ACTIONS,
});
export const TOURNAMENT_CONTROLS = Object.freeze(["scripted-meta-control", "random-meta-control", "specialist-control"] as const);

const manifestBody = (manifest: Omit<FrozenTournamentManifest, "digest">): string => canonicalJson(manifest);
export function freezeTournamentManifest(input: Omit<FrozenTournamentManifest, "version" | "split" | "selectedOn" |
  "controls" | "thresholds" | "priorTestRows" | "digest">): FrozenTournamentManifest {
  const body = Object.freeze({ version: 1 as const, split: "test" as const, selectedOn: "validation" as const,
    candidates: Object.freeze(input.candidates.map((candidate) => Object.freeze({ ...candidate }))),
    jobs: Object.freeze(input.jobs.map((job) => Object.freeze({ ...job }))), thresholds: TOURNAMENT_THRESHOLDS,
    controls: TOURNAMENT_CONTROLS, priorTestRows: 0 as const });
  return Object.freeze({ ...body, digest: artifactChecksum(manifestBody(body)) });
}

export function validateTournamentManifest(manifest: FrozenTournamentManifest): void {
  if (manifest.version !== 1) throw new Error(`tournament manifest version ${manifest.version} is unsupported`);
  if (manifest.split !== "test" || manifest.selectedOn !== "validation") throw new Error("tournament selection must use validation before test is opened");
  if (manifest.priorTestRows !== 0) throw new Error("test rows must be absent before the frozen candidate set is selected");
  const { digest, ...body } = manifest;
  if (artifactChecksum(manifestBody(body)) !== digest) throw new Error("tournament manifest changed after test was opened");
  const names = new Set<string>();
  for (const candidate of manifest.candidates) {
    if (names.has(candidate.name)) throw new Error(`duplicate tournament candidate "${candidate.name}"`);
    names.add(candidate.name);
    if (!(RESEARCH_ALGORITHMS as readonly string[]).includes(candidate.algorithm)) throw new Error(`${candidate.name} has unknown algorithm "${candidate.algorithm}"`);
    if (!Number.isSafeInteger(candidate.artifactBytes) || candidate.artifactBytes <= 0) throw new Error(`${candidate.name} has invalid artifact byte size`);
    if (!/^[a-f0-9]{64}$/.test(candidate.artifactDigest)) throw new Error(`${candidate.name} has an invalid artifact digest`);
  }
  if (!manifest.candidates.length) throw new Error("tournament manifest has no validation-selected candidates");
  if (!manifest.jobs.length || manifest.jobs.some((job) => job.split !== "test")) throw new Error("tournament manifest must contain test jobs only");
  const jobs = manifest.jobs.map(jobSignature);
  if (new Set(jobs).size !== jobs.length) throw new Error("tournament manifest contains duplicate jobs");
}

const jobSignature = (job: ResearchMatrixJob): string => canonicalJson(job);
const controllersFor = (manifest: FrozenTournamentManifest): readonly string[] =>
  Object.freeze([...manifest.candidates.map((candidate) => candidate.name), ...manifest.controls]);

/**
 * The behaviour record of one row, refused by name when it is malformed.
 *
 * **This is the deserialization guard, and that is why legality-by-construction
 * on the producer side does not make it redundant.** Every tuple that reaches
 * the record in this process is legal by construction -- `researchLabelMind`
 * calls `onDecision` (`research-policy.ts:98`) after `option.enter(view)` at
 * `:95` and after the `research policy produced unsupported action` throw at
 * `:54-56`, and `lookaheadMind` calls it (`lookahead.ts:294`) after its own
 * `option.enter(view)` at `:291` on a tuple drawn from `deployableTactics`. But
 * a row does not arrive from a live mind. It arrives as JSON a previous run
 * wrote and a person may have edited, resumed across a manifest freeze, and
 * merged; the producer's invariants say nothing about that file. So the counts
 * are checked here against the same five frozen tables the executor refuses by.
 *
 * The third check is the one that is not a spelling test. A free choice is a
 * *subset* of all choices of the same option, so a free-choice count can never
 * exceed that option's marginal in the joint map -- and two maps written by one
 * producer that disagree on that are two maps one of which is wrong. It catches
 * a producer that counted a free choice on a decision it did not record, or that
 * recorded the tuple against a different option name than it credited the free
 * choice to.
 *
 * The dwell record is refused by `persistenceRecordFailure` on the same terms,
 * with one check the tuple half cannot make: every decision names exactly one
 * dwell, so its `bins` map must sum to the joint map's own total. A row whose
 * dwell map folded nothing is therefore refused rather than read as a candidate
 * that never varied -- which is the failure `AGENTS.md` names as "a digest that
 * folds nothing reads exactly like a digest that folds everything".
 */
function validateTacticRecord(identity: string, row: Pick<TournamentRawRow, "tacticCounts" | "freeChoiceCounts" | "persistenceCounts">): void {
  if (!row.tacticCounts || typeof row.tacticCounts !== "object") throw new Error(`${identity} has no tactic counts`);
  if (!row.freeChoiceCounts || typeof row.freeChoiceCounts !== "object") throw new Error(`${identity} has no free-choice counts`);
  for (const [key, count] of Object.entries(row.tacticCounts)) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${identity} has an invalid tactic count for "${key}"`);
    const failure = tacticKeyFailure(key);
    if (failure) throw new Error(`${identity} has tactic key "${key}", which requires ${failure}`);
  }
  for (const head of Object.keys(row.freeChoiceCounts)) {
    if (!(FREE_CHOICE_HEADS as readonly string[]).includes(head)) {
      throw new Error(`${identity} has free-choice head "${head}", not ${FREE_CHOICE_HEADS.join(" or ")}`);
    }
  }
  for (const head of FREE_CHOICE_HEADS) {
    const table = FREE_CHOICE_TABLES[head]; const marginal = tacticMarginal(row.tacticCounts, head);
    for (const [name, count] of Object.entries(row.freeChoiceCounts[head] ?? {})) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${identity} has an invalid free-choice ${head} count for "${name}"`);
      if (!table.includes(name)) throw new Error(`${identity} has a free-choice ${head} of ${table.join(", ")}, not "${name}"`);
      if (count > (marginal[name] ?? 0)) {
        throw new Error(`${identity} recorded ${count} free ${head} choices of "${name}" against a tactic marginal of ${marginal[name] ?? 0}`);
      }
    }
  }
  // The dwell half, refused by the module that owns its grammar. Its arithmetic
  // check is **stronger** than the free-choice one above: every decision names
  // exactly one dwell, so this map has to sum to the joint map's own total, and
  // a dwell record that folded nothing cannot pass as a candidate that never
  // varied its dwell.
  const dwellFailure = persistenceRecordFailure(row.persistenceCounts,
    Object.values(row.tacticCounts).reduce((sum, count) => sum + count, 0));
  if (dwellFailure) throw new Error(`${identity} requires ${dwellFailure}`);
}

function validatePartialTournamentRows(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest): void {
  validateTournamentManifest(manifest); const allowed = new Set(controllersFor(manifest)); const seen = new Set<string>();
  for (const row of rows) {
    if (!allowed.has(row.candidate)) throw new Error(`unknown tournament controller "${row.candidate}"`);
    if (row.manifestDigest !== manifest.digest) throw new Error(`${row.candidate} row ${row.index} belongs to a different frozen manifest`);
    if (!Number.isSafeInteger(row.index) || row.index < 0 || row.index >= manifest.jobs.length ||
        jobSignature(row.job) !== jobSignature(manifest.jobs[row.index]!)) throw new Error(`${row.candidate} has invalid tournament row index ${row.index}`);
    const identity = `${row.candidate}:${row.index}`; if (seen.has(identity)) throw new Error(`duplicate tournament row ${identity}`); seen.add(identity);
    if (row.outcome !== "win" && row.outcome !== "loss" && row.outcome !== "draw") throw new Error(`${identity} has invalid outcome`);
    if (!Number.isFinite(row.seconds) || row.seconds < 0 || row.seconds > row.job.boutCapSeconds + 1e-9) throw new Error(`${identity} has invalid bout seconds`);
    const engagement = row.engagement;
    for (const [name, value] of Object.entries({ opportunities: engagement.opportunities, attacks: engagement.attacks,
      contacts: engagement.contacts, meaningful: engagement.meaningful })) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${identity} has invalid engagement ${name}`);
    }
    if (engagement.attacks > engagement.opportunities || engagement.contacts > engagement.attacks) throw new Error(`${identity} has impossible engagement attribution`);
    if (!Number.isFinite(engagement.nearRangeStallSeconds) || engagement.nearRangeStallSeconds < 0 ||
        engagement.nearRangeStallSeconds > row.seconds + 1e-9) throw new Error(`${identity} has invalid stall seconds`);
    if (engagement.firstAttackSeconds !== null && (!Number.isFinite(engagement.firstAttackSeconds) ||
        engagement.firstAttackSeconds < 0 || engagement.firstAttackSeconds > row.seconds + 1e-9)) throw new Error(`${identity} has invalid first attack time`);
    validateTacticRecord(identity, row);
    if (Object.values(row.safety).some((value) => typeof value !== "boolean")) throw new Error(`${identity} has invalid safety evidence`);
  }
}
export function assertCommonTournamentMatrix(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest): void {
  validatePartialTournamentRows(rows, manifest);
  const expected = manifest.jobs.map(jobSignature);
  for (const controller of controllersFor(manifest)) {
    const actual = rows.filter((row) => row.candidate === controller).sort((a, b) => a.index - b.index);
    const indices = new Set(actual.map((row) => row.index));
    if (actual.length !== expected.length || indices.size !== expected.length ||
        actual.some((row, index) => row.index !== index || jobSignature(row.job) !== expected[index])) {
      throw new Error(`${controller} did not run the exact frozen cells, seeds, mirrors and opponents`);
    }
  }
}

export function missingTournamentRows(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest): readonly { candidate: string; index: number }[] {
  validatePartialTournamentRows(rows, manifest);
  const complete = new Set(rows.map((row) => `${row.candidate}:${row.index}`));
  const controllers = controllersFor(manifest);
  return Object.freeze(controllers.flatMap((candidate) => manifest.jobs.map((_, index) => ({ candidate, index })))
    .filter((row) => !complete.has(`${row.candidate}:${row.index}`)));
}

/** The sole scheduler for a held-out run: deterministic holes, never a fresh seed range. */
export function nextTournamentBatch(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest, maximum: number): readonly { candidate: string; index: number }[] {
  if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new Error("tournament batch size must be a positive integer");
  return Object.freeze(missingTournamentRows(rows, manifest).slice(0, maximum));
}

export function mergeTournamentRows(existing: readonly TournamentRawRow[], incoming: readonly TournamentRawRow[],
  manifest: FrozenTournamentManifest): readonly TournamentRawRow[] {
  const expected = nextTournamentBatch(existing, manifest, incoming.length || 1);
  if (!incoming.length || incoming.some((row, index) => row.candidate !== expected[index]?.candidate || row.index !== expected[index]?.index)) {
    throw new Error("tournament resume rows are unknown, duplicate or out of indexed order");
  }
  const merged = [...existing, ...incoming]; validatePartialTournamentRows(merged, manifest); return Object.freeze(merged);
}

/** A stopped run resumes indexed holes; a complete run cannot open test again. */
export function resumeTournament(rows: readonly TournamentRawRow[], manifest: FrozenTournamentManifest): readonly { candidate: string; index: number }[] {
  const missing = missingTournamentRows(rows, manifest);
  if (!missing.length) throw new Error("the frozen test tournament was already completed and cannot be opened twice");
  return missing;
}

export function assessTournamentCandidate(candidate: TournamentCandidate): CandidateVerdict {
  const failures: string[] = [];
  const safety = candidate.safety;
  if (!safety.finiteAnatomical) failures.push("finite/anatomical failure");
  if (!safety.capabilities) failures.push("capability failure");
  if (!safety.postVerdict) failures.push("post-verdict action failure");
  if (!safety.stuckActions) failures.push("stuck-action failure");
  if (!safety.lifecycle) failures.push("lifecycle failure");
  if (!(candidate.meanScore > candidate.scriptedScore)) failures.push("macro held-out score did not beat scripted meta");
  if (!(candidate.meanScore > candidate.randomScore)) failures.push("macro held-out score did not beat random meta");
  const failed = (gate: GateRow): boolean => gatePassed(gate) === false;
  for (const cell of candidate.cells) {
    if (cell.meaningfulEngagement <= 0) failures.push(`${cell.name}: zero meaningful engagement`);
    const gates = new Map(engagementGates({ opportunityAttackRate: cell.opportunityAttackRate,
      attackContactRate: cell.attackContactRate, nearRangeStallShare: cell.nearRangeStallShare,
      firstAttackP90Seconds: cell.firstAttackP90Seconds, symmetricTimeCapRate: cell.symmetricTimeCapRate,
      specialistGap: cell.specialistScore - cell.score }).map((gate) => [gate.name, gate]));
    if (failed(gates.get("opportunityAttackRate")!)) failures.push(`${cell.name}: opportunity attack rate below ${MIN_OPPORTUNITY_ATTACK_RATE}`);
    if (failed(gates.get("attackContactRate")!)) failures.push(`${cell.name}: attack contact rate below ${MIN_ATTACK_CONTACT_RATE}`);
    if (failed(gates.get("nearRangeStallShare")!)) failures.push(`${cell.name}: near-range stall share above ${MAX_NEAR_RANGE_STALL_SHARE}`);
    if (failed(gates.get("firstAttackP90Seconds")!)) failures.push(`${cell.name}: first-attack p90 above ${MAX_FIRST_ATTACK_P90_SECONDS}s`);
    if (failed(gates.get("symmetricTimeCapRate")!)) failures.push(`${cell.name}: symmetric cap rate above ${MAX_SYMMETRIC_TIME_CAP_RATE}`);
    if (failed(gates.get("specialistGap")!)) failures.push(`${cell.name}: specialist gap above ${MAX_SPECIALIST_GAP}`);
  }
  // **The action marginal, which keeps this gate's exact former meaning, and the
  // share is deliberately not fragmented across effectors.** A fighter that only
  // cuts, split across every tuple a cut can reach, is one action and must still
  // fail --
  // `a_cut_only_fighter_split_across_every_tuple_it_can_reach_still_fails_the_diversity_gate`
  // is the reader that says so, and it is named for the tuples rather than for
  // three effectors because `tacticEffectors(view, "cut")` reaches at most two.
  // The denominator is the total over the marginal,
  // which equals the total decision count because every decision names exactly
  // one action.
  //
  // `recover` is excluded by name, as it always was, and under tuple keying that
  // name means exactly one thing: the `recover` member of `HAND_ACTION_NAMES`.
  // It used to mean "whatever key was not the literal `recover`", and three test
  // fixtures put `close` -- a *movement* -- into the old map and were counted as
  // a diverse action by it. Nothing in production ever did: the producer keyed on
  // `label.action`, which is a `HandActionName`. So this is the fixtures being
  // corrected to a record that can exist, not the gate changing its answer.
  const actionMarginal = tacticMarginal(candidate.tacticCounts, "action");
  const total = Object.values(actionMarginal).reduce((sum, count) => sum + count, 0);
  const actionShares = Object.entries(actionMarginal).filter(([name]) => name !== "recover")
    .map(([, count]) => total > 0 ? count / total : 0).sort((a, b) => b - a);
  const diverse = actionShares.filter((share) => share >= MIN_ACTION_SHARE).length;
  const diversityGates = engagementGates({ minimumActionShare: actionShares[MIN_DIVERSE_ACTIONS - 1] ?? 0,
    diverseActions: diverse });
  if (diversityGates.some((gate) => (gate.name === "minimumActionShare" || gate.name === "diverseActions") && failed(gate))) {
    failures.push("fewer than three non-recover actions occupy at least 8% of decisions");
  }
  return Object.freeze({ name: candidate.name, passed: failures.length === 0, failures: Object.freeze(failures) });
}

/**
 * The six heads a utilisation record answers for: the five names of the joint
 * tuple key, plus the dwell, which is not one of them and is carried beside it.
 *
 * **A union and not `keyof TacticTuple`, because widening the tuple is the wrong
 * fix and entry 17 of the found-not-fixed register measured why.** The joint key
 * is 555 occupied cells of 2,520 at 2.39 counts each over a 39-job sweep, a third
 * of them singletons; multiplying it by eight dwell bins makes a table of ones.
 * The dwell is a marginal in `PersistenceCounts` and reaches this record through
 * `persistenceCounts`, not through `tacticCountKey`.
 */
export type UtilisationHead = keyof TacticTuple | "persistence";

/**
 * Five numbers over two different denominators, and which is which is the whole
 * point -- so every field says so rather than the type leaving it to be guessed.
 */
export interface HeadUtilisation {
  /** Every decision the candidate took. The same number for all six heads. */
  readonly decisions: number;
  /** Of those, the ones where this head had two or more legal options. */
  readonly freeChoiceDecisions: number;
  /** Distinct options of this head chosen over **all** `decisions`. */
  readonly chosen: number;
  /** The most-used option over **all** `decisions`, or null when there were none. */
  readonly modal: string | null;
  /** The modal option's share of `decisions` -- **not** of `freeChoiceDecisions`. */
  readonly modalShare: number;
  /** The most-used option over the `freeChoiceDecisions` alone. Null when there were none. */
  readonly freeModal: string | null;
  /** `freeModal`'s share of `freeChoiceDecisions` -- **not** of `decisions`. */
  readonly freeModalShare: number;
}

/**
 * Per head: how many decisions there were, how many of them this head could
 * actually decide, how many of its options were used, and how concentrated the
 * use was.
 *
 * **This is reported and never gated, and the measurement at the bottom of this
 * docstring is why.** A head that always picks the same option may simply be
 * right -- a `sword+shield` body's only cutting hand is the primary, so picking
 * it a thousand times is correct rather than lazy, and a stance head that
 * settles on `compact` may have found the best stance. Turning any of these into
 * a threshold would be a *balance* claim: it would refuse a candidate for
 * insufficient variety without anything having established that variety is worth
 * what it costs. Worse, the measured table below shows what it would actually
 * refuse a candidate for -- **its action mix**, because on 8 of the 15 cells the
 * free-effector denominator is exactly "how often did it choose `cover` or
 * `recover`", and the tournament's other gates reward the opposite.
 * `MIN_ACTION_SHARE` earns its place because a controller that only ever cuts is
 * not playing the game at all; "the effector head is 100% primary" has no such
 * argument behind it. This directory has just finished removing one decorative
 * gate. **Do not "fix" this into a threshold.**
 *
 * `freeChoiceDecisions` is what makes the statistic worth printing at all,
 * because it separates the two readings of a modal share of 1.0. Four of the
 * five tuple heads' free sets are *derived* and only the effector's is recorded:
 * movement and stance are legal on every body, `tacticTargets` is a table lookup
 * on the action so a key naming `bite` had one legal target and every other
 * action had at least two, and every body that can decide offers two or more
 * actions (the theorem beside `FREE_CHOICE_HEADS`). The effector is the one a
 * joint map cannot answer for.
 *
 * **The dwell's is recorded too, and for a different reason worth keeping
 * separate.** The effector's free set varies per decision, with the body and
 * with the action just chosen. The dwell's does not vary at all today: it is one
 * for a controller that names a constant and the grid width for one with a head,
 * so `freeChoiceDecisions` on this row is either zero or every decision. That is
 * the whole discrimination the row exists for, and `PersistenceHead` in
 * `learning/persistence.ts` carries who declares it and why it cannot be
 * inferred. It is recorded per decision anyway, so a masked dwell head -- the
 * obvious next thing to build here -- needs no schema change.
 *
 * **`modal`/`modalShare` and `freeModal`/`freeModalShare` can name different
 * options, and the second pair is the one this record exists to produce.**
 * Measured on a real `warrior/sword+shield` bout (`.review/rem26/inverted.mjs`;
 * seed 310013, opponent `specialist`, 2400 solver steps, a policy that cuts with
 * the sword hand on 7 of every 10 decisions and covers with the shield hand on
 * the other 3):
 *
 *     effector marginal  {"primary":69,"secondary":27}
 *     freeChoiceCounts   {"secondary":27}
 *     modal  primary   modalShare      0.719   -- over all 96 decisions
 *     freeModal secondary  freeModalShare 1.0  -- over the 27 it could decide
 *
 * Reporting only the first pair says the effector head favours the primary hand.
 * On every decision where it had a choice it took the secondary, every time. The
 * sum alone -- which is all this reported before -- cannot say that, because it
 * throws the per-option split away.
 *
 * **The free-choice denominator is conditioned on the action the policy just
 * chose, which makes it a post-treatment variable and not a property of the
 * body.** On this loadout a second hand is offered for `cover` and `recover` and
 * withheld from `cut` and `thrust`, so the action mix moves the denominator on
 * its own. (`sword+axe` is the one armed loadout in the matrix where that is not
 * wholly true -- `cut` reaches both hands there -- and the denominator is still
 * post-treatment on it, because `thrust` reaches one.)
 * Measured on one `warrior/sword+shield` body with an effector rule that
 * strictly alternates over whatever is legal -- the effector head doing exactly
 * the same thing in all four rows, only the action mix varied
 * (`.review/rem26/posttreatment.mjs`, same seed and cell, 2400 solver steps):
 *
 *     all cut        free denominator   0/96    0.0%   modalShare 1.000
 *     7 cut / 3 cover                  27/96   28.1%   modalShare 0.813
 *     5 cut / 5 cover                  45/90   50.0%   modalShare 0.700
 *     all cover                        96/96  100.0%   modalShare 0.500
 *
 * So do not read a low `freeChoiceDecisions` as "this body is one-handed". Read
 * it as "this policy spent its decisions on actions only one hand can do", which
 * is a fact about the candidate and the loadout jointly.
 *
 * ## What the effector head can actually be measured on, which is less than the
 * ## first version of this docstring claimed
 *
 * This file and `options.ts` both said the record "separates a learned effector
 * head from a body that only offered one hand". Measured over the whole matrix,
 * that separation is available on **4 of the 15 cells, and 2 of the 4 are
 * weapon-bearing**. Coverage space: `.review/sa27/cells.mjs`, 45 real Havok
 * bouts -- all 15 (unit, loadout) cells x all 3 `RESEARCH_OPPONENTS`, mirror 0,
 * split "train", seed 310013, 1200 solver steps each, 2058 decisions -- reading
 * `tacticEffectors` for every action at every physics sample, so a hand severed
 * mid-bout is inside the space. What it cannot see: mirror 1, seeds other than
 * 310013, and any body state a 5-second bout does not reach. `broot` is
 * identical to `warrior` row for row.
 *
 *     loadout          actions with >=2 legal effectors   with exactly 1
 *     sword+empty      cover, recover                     cut, thrust, punch
 *     sword+shield     cover, recover                     cut, thrust
 *     sword+buckler    cover, recover                     cut, thrust
 *     sword+axe        cover, cut, recover                thrust
 *     axe+empty        cover, recover                     cut, punch
 *     bow+empty        (none)                             cover, shoot, recover
 *     empty+empty      cover, punch, recover              (none)
 *     natural:bite     (none)                             bite, recover
 *
 * **`sword+axe` is the only armed loadout that gives an *attacking* action two
 * legal effectors, and it was added to the strata for that**; the other
 * two-effector attack in the table is `punch` on two empty fists.
 * `HUMANOID_RESEARCH_LOADOUTS` in `research-matrix.ts` carries the decision and
 * what it cost. The row is the sharp one rather than `sword+sword` because
 * `cut` reaches both hands and `thrust` only the sword hand, so the counterfactual
 * "would the answer have been the same with the other hand" has a negative case
 * beside its positive one.
 *
 * **The count of cover-or-recover-only cells did not fall, and saying "8 of 15"
 * rather than "8 of 13" is the whole of the honest difference.** The same eight
 * cells still have a denominator that is exactly "how often did it choose
 * `cover` or `recover`", and three more -- `bow+empty` twice and the centipede
 * -- are still structurally zero, so no effector statement about those three is
 * available at any sample size. What changed is that two cells were *added* on
 * which the question is answerable while the candidate is attacking.
 *
 * The consequence used to be stated as the uncomfortable half: **for a candidate
 * that fights well, this record says LESS about its effector head, not more.**
 * That is still true on eight cells of fifteen and is now false on two, which is
 * exactly as much as one loadout can buy. It remains the argument against ever
 * gating on this: a floor on effector variety would refuse a candidate for its
 * *action mix* on the eight, and the tournament's other gates actively reward
 * the mix that drives their denominator to zero.
 *
 * Two shares that used to be quoted here are deliberately absent, because they
 * are properties of the probing policy rather than of the matrix: the pooled
 * decision mass sitting in the three effector-blind cells, and the share of
 * free-effector decisions coming from the two `empty+empty` cells. An earlier
 * review measured 41% and 73%; the round-robin probe above measured 23.4% and
 * 28.5% on the 13 cells and measures 20.1% and 24.4% on the 15. Both are right
 * about their own harness, and the drift across a strata change is the second
 * reason not to quote them. The table is the part that does not move.
 *
 * **A head some algorithms do not have prints exactly like a head that
 * collapsed, and the `stance` row still does it.** `lookaheadMind` writes the
 * constant `UNLEARNED_STANCE` and has no stance head at all, so a lookahead
 * candidate's `stance` row is
 * `{chosen: 1, modal: "action-default", modalShare: 1, freeModalShare: 1}` --
 * indistinguishable from a learned stance head that settled on one option.
 * Nothing in this record can say which, so `scripts/evaluate-ai.mjs` puts
 * `algorithm` on every utilisation row and a reader has to use it. The stance
 * head is unmasked on every body, so there is no free set to record for it; what
 * it would take is the same declaration the dwell now carries.
 *
 * **The `persistence` row is that defect fixed rather than described, and it was
 * two defects.** PPO wrote `UNLEARNED_PERSISTENCE` one field over until its sixth
 * head landed and chooses a dwell from `PERSISTENCE_SECONDS` now; look-ahead
 * still names the constant. On top of that, until this row existed **no head here
 * was the persistence head at all** -- `TacticTuple` is the five-name joint key
 * and the dwell is not one of its fields, so a candidate whose dwell collapsed
 * onto one bin printed byte for byte what one sweeping the grid printed, for
 * every algorithm including the two that learn it. Both are answered by the same
 * pair of maps: `persistenceCounts.bins` is the marginal the joint key cannot
 * project, and `persistenceCounts.freeBins` is empty exactly when the controller
 * declared no dwell head. So `{chosen: 1, freeChoiceDecisions: 0}` is
 * "constant by construction" and `{chosen: 1, freeChoiceDecisions: n}` is "a head
 * that had the whole grid and used one bin of it", and a reader needs neither the
 * algorithm name nor its source to tell them apart.
 */
export function headUtilisation(candidate: Pick<TournamentCandidate, "tacticCounts" | "freeChoiceCounts" | "persistenceCounts">):
  Readonly<Record<UtilisationHead, HeadUtilisation>> {
  const counts = candidate.tacticCounts;
  const decisions = Object.values(counts).reduce((sum, count) => sum + count, 0);
  // The free *distribution*, not its sum: a head's free options and how often
  // each was taken. Derived from the joint map wherever the free set is a
  // function of the key -- which is four heads of five -- and read off the
  // recorded map for the effector.
  const freeMarginal = (head: keyof TacticTuple): Readonly<Record<string, number>> => {
    if (head === "effector") return candidate.freeChoiceCounts.effector ?? {};
    if (head === "target") {
      const free: Record<string, number> = {};
      for (const [key, count] of Object.entries(counts)) {
        const tuple = parseTacticCountKey(key);
        if (tacticTargets(tuple.action).length > 1) free[tuple.target] = (free[tuple.target] ?? 0) + count;
      }
      return free;
    }
    return tacticMarginal(counts, head);
  };
  // Sorted by count and then by name, so a tie between two equally-used options
  // reports the same modal option every time rather than whichever key iteration
  // happened to reach first. `b[1] - a[1]` and not `a[1] - b[1]`: this answers
  // the MOST-used option, and every fixture in the suite was a two-way tie or a
  // singleton until `the_modal_option_is_the_most_used_one_and_not_the_least`.
  const top = (distribution: Readonly<Record<string, number>>): readonly [string, number] | undefined =>
    Object.entries(distribution).filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  // One row from two distributions, so the sixth head is read by the same seven
  // lines as the other five rather than by a second copy of them that could
  // drift. `all` is over every decision and `free` over the ones this head could
  // decide; for the five tuple heads they come from the joint map, for the dwell
  // from the marginal carried beside it.
  const utilisation = (all: Readonly<Record<string, number>>, free: Readonly<Record<string, number>>): HeadUtilisation => {
    const marginal = Object.entries(all).filter(([, count]) => count > 0);
    const freeChoiceDecisions = Object.values(free).reduce((sum, count) => sum + count, 0);
    const overall = top(Object.fromEntries(marginal)); const freeTop = top(free);
    return Object.freeze({ decisions, freeChoiceDecisions, chosen: marginal.length,
      modal: overall ? overall[0] : null, modalShare: overall && decisions > 0 ? overall[1] / decisions : 0,
      freeModal: freeTop ? freeTop[0] : null,
      freeModalShare: freeTop && freeChoiceDecisions > 0 ? freeTop[1] / freeChoiceDecisions : 0 });
  };
  const rows = TACTIC_KEY_HEADS.map(([head]) => [head, utilisation(tacticMarginal(counts, head), freeMarginal(head))] as const);
  // `?? emptyPersistenceCounts()` and not a throw: this is the reporter and the
  // deserialization guard is `validateTacticRecord`, which refuses a row with no
  // dwell record by name. The same split is already here one head over --
  // `candidate.freeChoiceCounts.effector ?? {}` above.
  const dwell = candidate.persistenceCounts ?? emptyPersistenceCounts();
  return Object.freeze(Object.fromEntries([...rows,
    ["persistence", utilisation(dwell.bins, dwell.freeBins)] as const]) as Record<UtilisationHead, HeadUtilisation>);
}

export function tournamentVerdict(candidates: readonly TournamentCandidate[]): TournamentVerdict {
  const names = new Set<string>();
  for (const candidate of candidates) {
    if (names.has(candidate.name)) throw new Error(`duplicate tournament candidate "${candidate.name}"`);
    names.add(candidate.name);
  }
  const verdicts = candidates.map(assessTournamentCandidate).sort((a, b) => a.name.localeCompare(b.name));
  const passing = candidates.filter((candidate) => verdicts.find((row) => row.name === candidate.name)?.passed);
  if (!passing.length) return Object.freeze({ candidates: Object.freeze(verdicts), promoted: null });
  const topCandidate = [...passing].sort((a, b) => b.meanScore - a.meanScore || a.name.localeCompare(b.name))[0] as TournamentCandidate;
  const topLow = topCandidate.confidenceLow;
  const statisticallyTied = passing.filter((candidate) => (candidate.confidenceHigh ?? candidate.meanScore) >= topLow);
  const pool = statisticallyTied.length ? statisticallyTied : [topCandidate];
  const selected = [...pool].sort((a, b) => a.artifactBytes - b.artifactBytes ||
    a.algorithm.localeCompare(b.algorithm) || a.name.localeCompare(b.name))[0] as TournamentCandidate;
  return Object.freeze({ candidates: Object.freeze(verdicts), promoted: selected.name });
}

const percentile = (values: readonly number[], fraction: number): number => {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)] as number;
};

/** Rebuild all promotion inputs from raw mirrored rows; report aggregates have no authority. */
export function candidateFromRawRows(candidate: FrozenTournamentManifest["candidates"][number], rows: readonly TournamentRawRow[]): TournamentCandidate {
  const mine = rows.filter((row) => row.candidate === candidate.name);
  if (!mine.length) throw new Error(`${candidate.name} has no raw tournament rows`);
  const cellNames = [...new Set(mine.map((row) => `${row.job.unit}/${row.job.loadout}`))].sort();
  const scoreFor = (controller: string, cellName?: string): number => {
    const selected = rows.filter((row) => row.candidate === controller && (!cellName || `${row.job.unit}/${row.job.loadout}` === cellName));
    if (!selected.length) throw new Error(`${controller} has no raw tournament rows${cellName ? ` for ${cellName}` : ""}`);
    return selected.filter((row) => row.outcome === "win").length / selected.length;
  };
  const cells = cellNames.map((name) => {
    const cellRows = mine.filter((row) => `${row.job.unit}/${row.job.loadout}` === name);
    const opportunities = cellRows.reduce((sum, row) => sum + row.engagement.opportunities, 0);
    const attacks = cellRows.reduce((sum, row) => sum + row.engagement.attacks, 0);
    const caps = cellRows.filter((row) => row.outcome === "draw" && row.seconds >= row.job.boutCapSeconds - 1e-9).length;
    return Object.freeze({ name, meaningfulEngagement: cellRows.reduce((sum, row) => sum + row.engagement.meaningful, 0),
      opportunityAttackRate: attacks / Math.max(1, opportunities),
      attackContactRate: cellRows.reduce((sum, row) => sum + row.engagement.contacts, 0) / Math.max(1, attacks),
      nearRangeStallShare: cellRows.reduce((sum, row) => sum + row.engagement.nearRangeStallSeconds, 0) /
        Math.max(1e-9, cellRows.reduce((sum, row) => sum + row.seconds, 0)),
      firstAttackP90Seconds: percentile(cellRows.map((row) => row.engagement.firstAttackSeconds ?? Number.POSITIVE_INFINITY), 0.90),
      symmetricTimeCapRate: caps / cellRows.length,
      score: cellRows.filter((row) => row.outcome === "win").length / cellRows.length,
      specialistScore: scoreFor("specialist-control", name) });
  });
  const behaviour = mergeBehaviourRecord(mine);
  const safety = mine.reduce((value, row) => ({ finiteAnatomical: value.finiteAnatomical && row.safety.finiteAnatomical,
    capabilities: value.capabilities && row.safety.capabilities, postVerdict: value.postVerdict && row.safety.postVerdict,
    stuckActions: value.stuckActions && row.safety.stuckActions, lifecycle: value.lifecycle && row.safety.lifecycle }),
  { finiteAnatomical: true, capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true });
  const wins = mine.filter((row) => row.outcome === "win").length; const meanScore = wins / mine.length;
  const z = 1.959963984540054; const denominator = 1 + z * z / mine.length;
  const centre = (meanScore + z * z / (2 * mine.length)) / denominator;
  const margin = z * Math.sqrt(meanScore * (1 - meanScore) / mine.length + z * z / (4 * mine.length * mine.length)) / denominator;
  return Object.freeze({ name: candidate.name, algorithm: candidate.algorithm, artifactBytes: candidate.artifactBytes,
    meanScore, confidenceLow: Math.max(0, centre - margin), confidenceHigh: Math.min(1, centre + margin),
    scriptedScore: scoreFor("scripted-meta-control"), randomScore: scoreFor("random-meta-control"),
    cells: Object.freeze(cells), ...behaviour, safety: Object.freeze(safety) });
}

export function recomputeTournamentReport(report: { readonly manifest: FrozenTournamentManifest; readonly rawRows: readonly TournamentRawRow[] }): TournamentVerdict {
  assertCommonTournamentMatrix(report.rawRows, report.manifest);
  return tournamentVerdict(report.manifest.candidates.map((candidate) => candidateFromRawRows(candidate, report.rawRows)));
}
