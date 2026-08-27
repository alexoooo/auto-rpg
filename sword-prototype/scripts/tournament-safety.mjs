import { CONFIG } from "../src/config.ts";
import { deployableTactics } from "../src/learning/meta.ts";
import { TOURNAMENT_SAFETY_NAMES } from "../src/learning/safety.ts";

/**
 * The historical promotion evaluator's stuck-option thresholds, preserved
 * across the factorized controller. The legacy controller selected one
 * `OptionName`; this one selects movement and action together, so either head
 * occupying an uninterrupted run for the same five seconds / 95% fails. That
 * is a deliberate strengthening of the old semantics, not a threshold tuned
 * from a held-out tournament.
 */
export const STUCK_MIN_SECONDS = 5;
export const STUCK_BOUT_SHARE = 0.95;

const signed = (value) => typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
const unsigned = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const flag = (value) => typeof value === "boolean";

/** Every controller field the body consumes, including its anatomical bounds. */
export function finiteAnatomicalIntent(intent) {
  if (!intent || typeof intent !== "object" || !signed(intent.forward) || !signed(intent.strafe) || !signed(intent.turn) ||
      !intent.posture || !signed(intent.posture.trunkLean) || !signed(intent.posture.trunkTwist) ||
      !unsigned(intent.posture.crouch) || !intent.natural || !flag(intent.natural.thrust) ||
      !flag(intent.natural.guard) || !["primary", "secondary", null].includes(intent.actingHand)) return false;
  for (const name of ["primary", "secondary"]) {
    const hand = intent[name];
    if (!hand || !signed(hand.pointerX) || !signed(hand.pointerY) ||
        typeof hand.roll !== "number" || !Number.isFinite(hand.roll) ||
        hand.roll < CONFIG.arm.rollMin || hand.roll > CONFIG.arm.rollMax ||
        !unsigned(hand.wristBend) || !flag(hand.thrust) || !flag(hand.guard)) return false;
  }
  return true;
}

const legalTacticKey = ({ action, effector, target }) => `${action}|${effector}|${target}`;

/**
 * Observe one complete tournament bout at the same seams that drive its body.
 *
 * The observer never repairs a failure. The tournament row receives the five
 * booleans exactly as observed: emitted controller commands, chosen legal
 * tuples, the verdict edge and its live tail, uninterrupted tactic occupancy,
 * and a monotonic bout lifecycle that returned from the harness teardown path.
 */
export function tournamentSafetyObserver({ requireTacticEvidence = true } = {}) {
  let finiteAnatomical = true;
  let capabilities = true;
  let postVerdict = true;
  let lifecycle = true;
  let verdictSeen = false;
  let completed = false;
  let samples = 0;
  let postVerdictSamples = 0;
  let intents = 0;
  let tacticDecisions = 0;
  let lastClock = -Infinity;
  const optionRuns = {
    movement: { current: null, since: 0, longest: 0 },
    action: { current: null, since: 0, longest: 0 },
  };

  const observeClock = (clock) => {
    if (typeof clock !== "number" || !Number.isFinite(clock) || clock < 0 || clock + Number.EPSILON < lastClock) {
      lifecycle = false;
      return;
    }
    lastClock = clock;
  };

  return Object.freeze({
    postVerdictFrames: 3,
    observeIntent(view, intent) {
      intents += 1;
      observeClock(view?.clock);
      if (verdictSeen) postVerdict = false;
      if (!finiteAnatomicalIntent(intent)) finiteAnatomical = false;
    },
    observeTactic(view, label) {
      tacticDecisions += 1;
      observeClock(view?.clock);
      const legal = new Set(deployableTactics(view).map(legalTacticKey));
      const capabilityKey = legalTacticKey(label ?? {});
      if (!legal.has(capabilityKey)) capabilities = false;
      for (const head of Object.keys(optionRuns)) {
        const run = optionRuns[head]; const selected = label?.[head];
        if (run.current === null) { run.current = selected; run.since = view.clock; }
        else if (selected !== run.current) {
          run.longest = Math.max(run.longest, view.clock - run.since);
          run.current = selected; run.since = view.clock;
        }
      }
    },
    observeSample({ clock }) {
      samples += 1;
      observeClock(clock);
      if (verdictSeen) postVerdictSamples += 1;
    },
    observeVerdict() { verdictSeen = true; },
    /** Called only after `runBout` has returned from its teardown path; this is not a resource census. */
    finish(result) {
      if (completed) throw new Error("tournament safety evidence was finalized twice");
      completed = true;
      const seconds = result?.seconds;
      if (typeof seconds === "number" && Number.isFinite(seconds)) {
        for (const run of Object.values(optionRuns)) if (run.current !== null) {
          run.longest = Math.max(run.longest, seconds - run.since);
        }
      }
      const longestOption = Math.max(...Object.values(optionRuns).map((run) => run.longest));
      const stuckActions = !(typeof seconds === "number" && Number.isFinite(seconds) && seconds >= STUCK_MIN_SECONDS &&
        longestOption >= Math.max(STUCK_MIN_SECONDS, seconds * STUCK_BOUT_SHARE));
      lifecycle &&= samples > 0 && intents > 0 && verdictSeen && postVerdictSamples > 0 &&
        Number.isFinite(seconds) && seconds >= 0 && result.ending !== "unfinished";
      capabilities &&= !requireTacticEvidence || tacticDecisions > 0;
      return Object.freeze({ finiteAnatomical, capabilities, postVerdict, stuckActions, lifecycle });
    },
  });
}

/** Missing, invented or non-boolean evidence is a refused row, never a pass. */
export function tournamentSafetyFromBout(bout) {
  const evidence = bout?.safetyEvidence;
  if (!evidence || typeof evidence !== "object" ||
      Object.keys(evidence).sort().join("|") !== [...TOURNAMENT_SAFETY_NAMES].sort().join("|") ||
      TOURNAMENT_SAFETY_NAMES.some((name) => typeof evidence[name] !== "boolean")) {
    throw new Error("tournament bout has no complete measured safety evidence");
  }
  return Object.freeze(Object.fromEntries(TOURNAMENT_SAFETY_NAMES.map((name) => [name, evidence[name]])));
}
