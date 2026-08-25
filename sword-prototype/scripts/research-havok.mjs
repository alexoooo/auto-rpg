import { CONFIG } from "../src/config.ts";
import { EngagementTracker, opportunityForAction, opportunityKeyForContact } from "../src/learning/engagement.ts";
import { randomMetaMind } from "../src/learning/meta.ts";
import { ATTACK_OPTION_NAMES, scriptedMetaMind } from "../src/options.ts";
import { policyMind } from "../src/mind.ts";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("./measure.mjs");

const LOADOUTS = Object.freeze({
  "sword+empty": { primary: "sword", secondary: "empty" },
  "sword+shield": { primary: "sword", secondary: "shield" },
  "sword+buckler": { primary: "sword", secondary: "buckler" },
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
  const tracker = new EngagementTracker(); let decisions = 0; let attacks = 0; let contacts = 0; let damage = 0;
  const actionCounts = {};
  let latestView = null;
  const actorMind = makeActorMind((view, _features, label) => {
    decisions += 1; latestView = view;
    actionCounts[label.action] = (actionCounts[label.action] ?? 0) + 1;
    // **The hand the label named, not the first hand holding the right weapon.**
    // This read `label.action` alone and took `[0]` of the matching rows, which on
    // a two-fisted body attributed every `punch|secondary` to the primary fist and
    // dropped the secondary's damaging contact on the floor -- `opportunityForAction`
    // carries the measurement. `label` has carried `effector` since stage C2b; the
    // fix is to read the field rather than to re-derive the hand.
    //
    // `ATTACK_OPTION_NAMES` rather than the same five names spelled again: the
    // list was a verbatim copy of that constant, and a sixth attack added to the
    // vocabulary would have been counted by the option layer and not here.
    if (ATTACK_OPTION_NAMES.includes(label.action)) {
      attacks += 1;
      const opportunity = opportunityForAction(view, label.action, label.effector);
      if (opportunity) tracker.attack(opportunity.key, view.clock);
    }
  });
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
      onSample({ left, right, dt, clock }) { latestView = (actorLeft ? left : right).view; tracker.sample(latestView, dt);
        hooks.onSample?.({ view: latestView, dt, clock }); },
      onEvent(event) {
        hooks.onEvent?.({ actorEvent: (event.side === "left") === actorLeft, event });
        if ((event.side === "left") !== actorLeft) return;
        contacts += 1; damage += event.report.damage;
        tracker.contact(opportunityKeyForContact(event.hand, event.report.weapon), event.report.at, event.report.damage);
      },
    });
    const solverSteps = Math.min(solverStepLimit, Math.round(result.seconds * CONFIG.world.physicsHz));
    return { index: job.index, solverSteps, result, decisions, attacks, contacts, damage, actionCounts,
      engagement: tracker.record, lastClock: latestView?.clock ?? 0,
      lastPublished: latestView ? { selfVitality: latestView.self.vitality, opponentVitality: latestView.opponent.vitality,
        measure: latestView.measure } : null };
  } finally { CONFIG.bout.capSeconds = oldCap; }
}
