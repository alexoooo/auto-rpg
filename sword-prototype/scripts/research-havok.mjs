import { CONFIG } from "../src/config.ts";
import { randomMetaMind } from "../src/learning/meta.ts";
import { ATTACK_OPTION_NAMES, scriptedMetaMind, tacticCountKey, tacticEffectors } from "../src/options.ts";
import { policyMind } from "../src/mind.ts";
import { persistenceBinKey, persistenceOptionsOf } from "../src/learning/persistence.ts";
import { stanceOptionsForBody } from "../src/learning/stance.ts";
process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("./measure.mjs");

const LOADOUTS = Object.freeze({
  "sword+empty": { primary: "sword", secondary: "empty" },
  "sword+shield": { primary: "sword", secondary: "shield" },
  "sword+buckler": { primary: "sword", secondary: "buckler" },
  // Two one-handed strikers of different kinds: the one loadout in the matrix
  // where an attacking action reaches both hands. `HUMANOID_RESEARCH_LOADOUTS`
  // carries the measurement and the reason.
  "sword+axe": { primary: "sword", secondary: "axe" },
  "axe+empty": { primary: "axe", secondary: "empty" },
  "bow+empty": { primary: "bow", secondary: "empty" },
  "empty+empty": { primary: "empty", secondary: "empty" },
  "natural:bite": { primary: "empty", secondary: "empty" },
});

const opponentMind = (kind, seed) => kind === "random-meta" ? randomMetaMind(seed) :
  kind === "scripted-meta" ? scriptedMetaMind("duelist", seed) : policyMind("swinger", seed);

/** One indexed job runs in a fresh Havok instance and reports only steps actually advanced. */
export async function runResearchBout(job, makeActorMind, solverStepLimit, makeOpponentMind = null, hooks = {}) {
  if (!Number.isSafeInteger(solverStepLimit) || solverStepLimit < 4 || solverStepLimit % 4 !== 0) {
    throw new Error("research bout solver-step limit must be a positive multiple of four");
  }
  let decisions = 0; let attacks = 0; let contacts = 0; let damage = 0;
  // **The whole tuple.** This was `actionCounts[label.action] += 1` -- the whole
  // decision while the output contract was thirteen wide, and a quarter of it
  // since it became 26. An action-only count says nothing at all about the other
  // four heads, and nothing about which decisions co-occurred.
  //
  // It was written down here as "an action-only count cannot tell a learned
  // effector head from a body that only ever offered one hand". True, but a much
  // smaller claim than it reads as: `headUtilisation`'s docstring carries the
  // measured table, and that distinction is available on 4 of the 15 research
  // cells -- the two `empty+empty` and, since it was added to the strata for
  // exactly this, the two `sword+axe`. It read "2 of the 13 cells, both
  // weaponless", which was the measurement that decided the widening. Do not put
  // weight on it without reading that table.
  //
  // `tacticCounts` is the joint record, keyed by `tacticCountKey` in
  // `options.ts` -- imported rather than spelled here, because the validator on
  // the other side of the JSON parses it with the matching `parseTacticCountKey`
  // and two spellings of one key is the defect this directory has a rule about.
  // (It lives beside the five frozen tables rather than beside its reader in
  // `learning/tournament.ts` because that file and `options.ts` are in an import
  // cycle; the docstring there carries the measurement.) All five *marginals*
  // project out of it (`tacticMarginal`); what does not is a head's free-choice
  // *denominator*, and three of the five need no map for that either -- movement
  // is legal on every body, the target's is a pure lookup on the recorded action
  // (`tacticTargets`), and the action's is the whole mask, which is never smaller
  // than two. Effector and stance are carried: the first depends on body/action,
  // while the second depends on controller architecture and whether the body
  // consumes posture.
  //
  // **A scripted probe's key does not parse, and that is deliberate.**
  // `asMeasured` names the target `"as-measured"`, which is the opponent's own
  // shoulder line and is kept out of `TARGET_NAMES` on purpose so no learned
  // output can name it. Exactly one caller of this function asks for it:
  // `tests/fixtures/label.mjs`'s `probeLabel`. So the key is written, is never
  // parsed there, and cannot reach a tournament row.
  //
  // **This paragraph used to name `research-rollout-worker.mjs`, `train-ppo.mjs`
  // and `train-lookahead.mjs` as the other askers, and all three were wrong.**
  // `grep -rn "asMeasured" scripts/` matches no call site in the directory at
  // all -- the four callers are `learning/evaluation.ts`, `learning/meta.ts`,
  // `options.ts` and that one test fixture. Worse, two of the three named
  // scripts write no key of any kind: `train-ppo.mjs` and `train-lookahead.mjs`
  // both pass `() => mind`, which discards `onDecision` outright, and
  // `train-lookahead.mjs` says in its own words that `"as-measured"` "leaves the
  // look-ahead path entirely". `research-rollout-worker.mjs` *does* wire
  // `onDecision`, in both its NEAT and its DAgger paths, so it writes these maps
  // and then returns aggregate metrics without reading them.
  //
  // The conclusion the paragraph was drawing is still right, and this is what
  // supports it: every labeler that can reach a tournament row takes its target
  // from `TARGET_NAMES` -- `selectDeployableTactic` argmaxes that table and
  // `tacticalTeacher` is typed `TargetName` -- and the three tournament controls
  // return `() => control`, discarding `onDecision`. Verified by wrapping
  // `tacticCountKey` itself and logging every write the whole suite makes
  // (`.review/rem26/keyspy-hooks.mjs`): **5,845 writes, 2,520 distinct, zero
  // containing `as-measured`.** The row validator refuses it by name if one ever
  // arrives, which is the right answer to "this record came from somewhere else".
  const tacticCounts = {};
  // The two tuple heads a joint map cannot answer for. Effector is counted only
  // where the body offered two or more hands. Stance is counted only where the
  // controller declared a real head and the body consumes posture; a look-ahead
  // constant and a centipede therefore both write an empty free marginal.
  //
  // **There is no `action` map here and its absence is a theorem, not an
  // omission.** Every body that can decide at all has two or more legal actions,
  // so a free-action count would be identically the action marginal of
  // `tacticCounts`. `FREE_CHOICE_HEADS` in `options.ts` carries the proof, the
  // coverage space of the two sweeps behind it, and the one unbuildable body
  // shape that would break it.
  const freeChoiceCounts = { effector: {}, stance: {} };
  // **The sixth head, which is not in the tuple key and never will be.** The
  // dwell is a decision like the other five and the joint map cannot hold it:
  // eight bins multiply a 2,520-cell key that is already 555 occupied cells at
  // 2.39 counts each. So it is a marginal carried beside the map, exactly as
  // `freeChoiceCounts.effector` is, and `learning/persistence.ts` owns the
  // grid, the bin names and the two-map shape.
  //
  // `freeBins` is the half that answers the question a marginal alone cannot:
  // whether the controller *had* a dwell to decide. `lookaheadMind` writes the
  // constant `UNLEARNED_PERSISTENCE` and has no clock term in its re-decision
  // condition at all, so a one-bin spike from it means "no head" while the same
  // spike from PPO means "a head that collapsed" -- and until this pair the two
  // printed nothing whatever, because `headUtilisation` reads the five-name
  // tuple key and the dwell is not one of its fields.
  const persistenceCounts = { bins: {}, freeBins: {} };
  let dwellOptions = 1; let stanceOptions = 1;
  let latestView = null;
  const safety = hooks.tournamentSafety ?? null;
  const baseActorMind = makeActorMind((view, _features, label) => {
    decisions += 1; latestView = view;
    safety?.observeTactic(view, label);
    const key = tacticCountKey(label);
    tacticCounts[key] = (tacticCounts[key] ?? 0) + 1;
    // Binned by distance rather than by equality, and keyed by the canonical
    // two-place name: `persistenceBin` carries why `indexOf` and `String()` both
    // lose two of the eight bins. Two of the four algorithms answer a continuous
    // dwell that is on no bin at all.
    const bin = persistenceBinKey(label.persistence);
    persistenceCounts.bins[bin] = (persistenceCounts.bins[bin] ?? 0) + 1;
    if (dwellOptions > 1) persistenceCounts.freeBins[bin] = (persistenceCounts.freeBins[bin] ?? 0) + 1;
    if (stanceOptions > 1) {
      freeChoiceCounts.stance[label.stance] = (freeChoiceCounts.stance[label.stance] ?? 0) + 1;
    }
    // **Conditioned on the action the policy just chose, which makes this
    // denominator a post-treatment variable.** A body's second hand is offered
    // for `cover` and `recover` and withheld from `cut` and `thrust`, so a
    // policy that cuts more moves this count without the effector head doing
    // anything different. `headUtilisation`'s docstring carries the measurement
    // and is where a reader of the number is told.
    if (tacticEffectors(view, label.action).length > 1) {
      freeChoiceCounts.effector[label.effector] = (freeChoiceCounts.effector[label.effector] ?? 0) + 1;
    }
    // `ATTACK_OPTION_NAMES` rather than the same five names spelled again: the
    // list was a verbatim copy of that constant, and a sixth attack added to the
    // vocabulary would have been counted by the option layer and not here. This
    // is a decision-count diagnostic only; factual attack windows are recorded
    // from the command edge by `BoutRecorder` inside `runBout`.
    if (ATTACK_OPTION_NAMES.includes(label.action)) {
      attacks += 1;
    }
  });
  const observedDecide = safety ? (view, dt) => {
    const intent = baseActorMind.decide(view, dt);
    safety.observeIntent(view, intent);
    return intent;
  } : null;
  // Preserve every declaration on a deployed controller -- especially its
  // dwell-head width -- while interposing on the one call a body actually
  // consumes. A copied object has already lost optional controller metadata in
  // this harness once; the proxy forwards it instead of spelling it again.
  const actorMind = safety ? new Proxy(baseActorMind, { get(target, property, receiver) {
    return property === "decide" ? observedDecide : Reflect.get(target, property, receiver);
  } }) : baseActorMind;
  // Read off the controller after it exists and before a decision can fire, so a
  // hook closing over it sees the declaration rather than the seed. Silence is
  // one, which is the direction that under-claims: `PersistenceHead` in
  // `learning/persistence.ts` carries why a declaration and not an inference.
  dwellOptions = persistenceOptionsOf(actorMind);
  stanceOptions = stanceOptionsForBody(actorMind, job.unit);
  const opponent = makeOpponentMind ? makeOpponentMind() : opponentMind(job.opponent, job.opponentSeed);
  const actorLeft = job.actorSide === "left"; const actorLoadout = LOADOUTS[job.loadout];
  if (!actorLoadout) throw new Error(`research harness has no loadout "${job.loadout}"`);
  const oldCap = CONFIG.bout.capSeconds;
  CONFIG.bout.capSeconds = Math.min(job.boutCapSeconds, solverStepLimit / CONFIG.world.physicsHz);
  try {
    const result = runBout({
      left: actorLeft ? "research" : "opponent", right: actorLeft ? "opponent" : "research",
      leftUnit: actorLeft ? job.unit : "warrior", rightUnit: actorLeft ? "warrior" : job.unit,
      seeds: actorLeft ? [job.actorSeed, job.opponentSeed] : [job.opponentSeed, job.actorSeed],
      leftLoadout: actorLeft ? actorLoadout : LOADOUTS["sword+empty"],
      rightLoadout: actorLeft ? LOADOUTS["sword+empty"] : actorLoadout,
      leftMind: actorLeft ? actorMind : opponent,
      rightMind: actorLeft ? opponent : actorMind,
      physics: await freshHavok(),
      onSample({ left, right, dt, clock }) { latestView = (actorLeft ? left : right).view;
        safety?.observeSample({ clock: latestView.clock });
        hooks.onSample?.({ view: latestView, dt, clock }); },
      onVerdict() { safety?.observeVerdict(); hooks.onVerdict?.(); },
      postVerdictFrames: safety?.postVerdictFrames ?? 0,
      postVerdictActionProbe: safety !== null,
      onEvent(event) {
        hooks.onEvent?.({ actorEvent: (event.side === "left") === actorLeft, event });
        if ((event.side === "left") !== actorLeft) return;
        contacts += 1; damage += event.report.damage;
      },
    });
    const solverSteps = Math.min(solverStepLimit, Math.round(result.seconds * CONFIG.world.physicsHz));
    const safetyEvidence = safety?.finish(result);
    return { index: job.index, solverSteps, result, decisions, attacks, contacts, damage, tacticCounts, freeChoiceCounts, persistenceCounts,
      engagement: result.behaviour[job.actorSide].engagement,
      engagementInstrumentVersion: result.engagementInstrumentVersion,
      safetyEvidence,
      lastClock: latestView?.clock ?? 0,
      lastPublished: latestView ? { selfVitality: latestView.self.vitality, opponentVitality: latestView.opponent.vitality,
        measure: latestView.measure } : null };
  } finally { CONFIG.bout.capSeconds = oldCap; }
}
