import { buildBout } from "../../research/bout.mjs";
import { CLASSIC, FIGHTING } from "../../src/core/mind/config.ts";
import { behaving } from "./minds.mjs";

/** A Warrior standing in guard, throwing nothing. */
const STANDS = { ...CLASSIC, tactics: { kind: "stand" }, actions: [], executors: [] };

/** A fighter that only flees, and one that only closes to 0.6 m. */
export const RUNNER = behaving([{ kind: "flee" }]), CHARGER = behaving([{ kind: "close-in", metres: .6 }]);
const ACTION_BEHAVIOURS = { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "pose" }] };
/** The Classic fighter's actions thrown with the left hand alone, and a fighter whose only action is a kick of either foot. */
export const LEFT_HAND = { ...CLASSIC, tactics: ACTION_BEHAVIOURS, actions: CLASSIC.actions.map(action => ({ ...action, effectors: ["hand.left"] })) };
export const KICKS_ONLY = { ...CLASSIC, tactics: ACTION_BEHAVIOURS, executors: [{ name: "kick", kind: "front-kick" }],
  actions: [{ name: "kick", executor: "kick", effectors: ["foot.right", "foot.left"], regions: [{ kind: "mark", mark: "legs" }], aim: { kind: "leg-height", height: .4 } }] };

/**
 * An Arena bout of `mind`, a Warrior, against a Warrior standing in guard, `gap` m off if given,
 * for `seconds` (Node, core world, Rapier, 120 Hz): the gap between their stances after the first
 * step and at the end, every effector whose action committed, whole protocol records read beyond
 * the ledger's eviction, and whether `mind`'s body is down at the end.
 */
export async function againstStanding(mind, seconds, gap) {
  const { world, duel, dispose } = await buildBout({ left: "workshop-fighter", right: "workshop-fighter", minds: { left: mind, right: STANDS }, ...(gap ? { gap } : {}) });
  try {
    const { left, right } = duel.duelists, skills = left.minded.skills, begun = new Set(), effectors = [];
    const gapOf = () => { const a = left.body.view.stance.centre, b = right.body.view.stance.centre; return Math.hypot(a.x - b.x, a.z - b.z); };
    world.step();
    const opened = gapOf();
    while (world.time < seconds) {
      world.step();
      for (const instance of [...skills.report.actions, ...skills.report.ledger]) if (!begun.has(instance.id) && (instance.phase === "commit" || instance.committed)) { begun.add(instance.id); effectors.push(instance.effector); }
    }
    return { opened, gap: gapOf(), effectors, down: left.body.view.down };
  } finally { dispose(); }
}
