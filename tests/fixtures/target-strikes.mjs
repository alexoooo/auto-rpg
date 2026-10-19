/**
 * **A body striking at the lab's targets** (`src/lab/targets.ts`): a stand whose right hand attacks
 * each of a list of places in turn, and a reading's record without its measures. The recipes are
 * the fixture's (`tests/fixtures/strikes.mjs`).
 */
import { pointScript } from "./point-script.mjs";
import { rulebook } from "../../src/core/rules/rulebook.ts";
import { energyShares } from "../../src/core/rules/share.ts";
import { labActor } from "../../src/lab/actor.ts";
import { loadoutSpec } from "../../src/lab/loadout.ts";
import { readTarget } from "../../src/lab/targets.ts";
import { FIXTURE_REPERTOIRE } from "./strikes.mjs";
import { coreStand } from "../harness/core-stand.mjs";

/** The rules a reading reads its blow by: the arena's. */
export const RULES = rulebook("arena");

/**
 * A body of `loadout` standing as built, its right hand attacking each of `places` in turn (each
 * from the head's height), a target's reading closed before the next is asked for: what each read,
 * with the time its strike began, where its ball was at each step before that, and the heading
 * the body had as the reading closed. Its recipes are the fixture's; `skills` is an experiment's
 * besides.
 */
export async function strikeAt(loadout, places, skills) {
  const stand = await coreStand(loadoutSpec(loadout), { ground: true });
  const actor = labActor(stand.built, stand.world);
  const head = actor.body.view.head.y;
  const targets = places.map((place) => ({ at: place(head), stratum: "control" }));
  const readings = [];
  let open = null, began = null, before = [];
  const tactics = pointScript(() => readings.length < targets.length
    ? { key: readings.length, action: "strike", effector: "hand.right", target: { kind: "point", at: targets[readings.length].at, body: "dummy" } } : null);
  actor.drive(tactics, { contactIdentity: other => open?.identify(other) ?? null, skills: { repertoire: FIXTURE_REPERTOIRE, ...skills }, watch(sight) {
    if (readings.length >= targets.length) return;
    open ??= readTarget(actor, targets[readings.length], "right", RULES, undefined, { repertoire: FIXTURE_REPERTOIRE, ...skills });
    const live = sight.report.actions[0];
    if (began === null && live) began = stand.world.time;
    if (began === null) before.push(open.ball);
    const reading = open.step(sight);
    if (!reading) return;
    readings.push({ ...reading, began, ended: stand.world.time, before, heading: sight.report.heading });
    open.dispose();
    open = null; began = null; before = [];
  } });
  try {
    for (let i = 0; i < stand.seconds(15 * targets.length) && readings.length < targets.length && !actor.body.view.down; i++) stand.step(1);
    return { head, readings, down: actor.body.view.down };
  } finally { open?.dispose(); actor.dispose(); stand.dispose(); }
}

/** A blow's side without its measures. */
export const sideOf = ({ fighter, segment, item, share }) => [fighter, segment, item, share];
export const CLUB = { model: "workshop-fighter", right: "club", left: "empty" }, BARE = { model: "workshop-fighter", right: "empty", left: "empty" };
/**
 * A reading's record without its measures: what was struck at, with what, and whether anything was
 * read: its blow's two sides, and which of them the dummy's and the body's are.
 */
export const record = ({ target, hand, strike, hung, fell, blow, took, gave }) => ({
  target, hand, strike: strike?.name ?? null, hung, fell,
  blow: blow && blow.sides.map(sideOf), took: took && blow.sides.indexOf(took), gave: gave && blow.sides.indexOf(gave),
});
/** The club's blow on a dummy: the club's side takes none of it, the dummy's head all. */
export const CLUBBED = { blow: [["attacker", "hand.right", "wooden club", 0], ["dummy", "head", null, 1]], took: 1, gave: 0 }, UNSTRUCK = { blow: null, took: null, gave: null };
/**
 * How far under the head's height as built a target stands where the club's recipe lands, m: the
 * fixture's recipe, searched on another body, strikes a target on the Warrior from 0.1 to 0.4 m
 * under it, 1.3 m off.
 */
export const CLUB_UNDER = 0.22;
/** A bare part's blow on a dummy, the body of `loadout`: the two surfaces share it by their compliance. */
export const bared = (part, loadout = BARE) => {
  const stiffness = (name) => loadoutSpec(loadout).segments.find((segment) => segment.name === name).surface.stiffness.value;
  const shares = energyShares([stiffness(part), stiffness("head")]);
  return { blow: [["attacker", part, null, shares[0]], ["dummy", "head", null, shares[1]]], took: 1, gave: 0 };
};
export const FISTED = bared("hand.right");
