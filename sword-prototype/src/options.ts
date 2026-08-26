import { cutsBothWays, HANDS, handsFor, hasHeldWeapon, hasPoint, isHeldStriker, isShooting, isStriking, otherHand, type HandName, type Striker, type WeaponKind } from "./hands.ts";
import { ACTION_STROKE_TIMING, ACTION_TUNING, actionAimAt, actionArcherAim, actionAzimuthOf, actionCoverAt, actionCursorForAzimuth, actionDistance, actionShotPhase,
  actionStrokePose, actionStrokeReading, actionStrokeRoll, applyActionPosture, bareCrowdDistance, bareHoldDistance, blankThreat, boundIntent, clampAction,
  freshIntent, selectThreat, type ActionPoint, type ThreatView } from "./action-primitives.ts";
import type { FighterView, Intent, Mind } from "./mind.ts";
import { attackOpportunity, engagementRecord, EngagementTracker, type EngagementRecord } from "./learning/engagement.ts";

export type MovementName = "close" | "hold" | "circle-left" | "circle-right" | "disengage";
export type HandActionName = "cover" | "cut" | "thrust" | "punch" | "shoot" | "bite" | "recover";
export type OptionName = MovementName | HandActionName;
export const MOVEMENT_NAMES: readonly MovementName[] = Object.freeze(["close", "hold", "circle-left", "circle-right", "disengage"]);
export const HAND_ACTION_NAMES: readonly HandActionName[] = Object.freeze(["cover", "cut", "thrust", "punch", "shoot", "bite", "recover"]);
export const TACTIC_NAMES: readonly OptionName[] = Object.freeze([...MOVEMENT_NAMES, ...HAND_ACTION_NAMES]);
export const ATTACK_OPTION_NAMES: readonly OptionName[] = Object.freeze(["cut", "thrust", "punch", "shoot", "bite"]);

/**
 * Tactic v2: an action is not a decision until it says *what* performs it, at
 * *what*, and *how the body stands* while it does.
 *
 * Action v1 named an action and nothing else, and three ambiguities rode on
 * that. A dual wielder could not ask for its off sword -- `requireHand` searched
 * `[preferred, other]` and silently answered with whichever hand could, so a
 * request for the primary was executed on the secondary and nothing said so. An
 * attack could not choose a height; every one of them replayed one fixed aim at
 * the opponent's shoulder line. And crouch, lean and twist were animation
 * welded to the action name rather than anything a controller could choose.
 *
 * The three tables below, and the two above them, are **ordered and frozen**,
 * and that is the contract rather than decoration: `META_OUTPUT_LAYOUT` lays 26
 * network outputs over the five of them by index -- 5 movement, 7 action, 3
 * effector, 4 target, 6 stance and 1 persistence -- and an offset inferred from
 * object-key iteration order is an offset that moves the day somebody adds a
 * name in the middle. Nothing infers one.
 *
 * **The production reader arrived in stage C2a and this note says which it is**,
 * because it was named as "coming" for a whole session:
 * `RESEARCH_ARTIFACT_CONTRACT` carries `tacticVersion` beside `featureVersion`,
 * so an artifact trained against the thirteen-output vocabulary is refused by
 * name at decode rather than deployed against a table it cannot index. The test
 * copy is still there and still earns its place --
 * `the_tactic_v2_vocabulary_is_ordered_frozen_and_never_inferred` is the
 * hand-written duplicate of all five tables that fails if a name moves -- but it
 * is no longer the only thing that would notice.
 */
export const TACTIC_VERSION = 2;
export type EffectorName = "primary" | "secondary" | "natural";
export type TargetName = "vital" | "high" | "low" | "threat";
export type StanceName = "action-default" | "upright" | "compact" | "extended" | "slip-left" | "slip-right";
export const EFFECTOR_NAMES: readonly EffectorName[] = Object.freeze(["primary", "secondary", "natural"]);
export const TARGET_NAMES: readonly TargetName[] = Object.freeze(["vital", "high", "low", "threat"]);
export const STANCE_NAMES: readonly StanceName[] = Object.freeze([
  "action-default", "upright", "compact", "extended", "slip-left", "slip-right",
]);

/**
 * One decision written as one string, and the one place that spelling lives.
 *
 * The tournament's behaviour record keys on this (`learning/tournament.ts`), the
 * bout harness writes keys with `tacticCountKey` (`scripts/research-havok.mjs`)
 * and the row validator reads them back with `parseTacticCountKey` after a
 * round trip through JSON. Producer and validator are in different files and
 * different languages' worth of type checking, so a second spelling of the key
 * format is exactly the "caller holding its own copy of a rule" defect this
 * directory has a written rule about. There is one.
 *
 * **It lives here rather than beside its reader, and the reason is an import
 * cycle rather than taste.** `options.ts` imports `learning/engagement.ts`,
 * which imports `OPPORTUNITY_WINDOW_SECONDS` from `learning/tournament.ts`, so
 * those two modules are cyclic; a frozen table built at `tournament.ts`'s module
 * scope out of `MOVEMENT_NAMES` threw `Cannot access 'MOVEMENT_NAMES' before
 * initialization` from every test whose first import was `options.ts`. Here, the
 * table is beside the five it is over and there is no cycle to lose a race with.
 *
 * **The delimiter is `"|"` and it is not a free choice.** Three of the
 * twenty-five names contain a hyphen -- `circle-left`, `slip-left`,
 * `action-default` -- so a hyphen cannot separate them unambiguously, and none
 * contains a vertical bar. `the_tuple_key_delimiter_appears_in_no_option_name`
 * reads all five tables and says so, so a name added with a bar in it fails
 * rather than silently splitting a key into six parts. It is also what
 * `meta.ts`'s `tacticKey` and `lookahead.ts`'s `legalTacticKey` already use for
 * the three-field tuple, which makes this that spelling widened rather than a
 * fourth convention.
 */
export const TACTIC_KEY_DELIMITER = "|";

export interface TacticTuple {
  readonly movement: MovementName;
  readonly action: HandActionName;
  readonly effector: EffectorName;
  readonly target: TargetName;
  readonly stance: StanceName;
}

/** The five frozen tables in contract order -- the order `META_OUTPUT_LAYOUT` lays its 26 outputs in. */
export const TACTIC_KEY_HEADS: readonly (readonly [keyof TacticTuple, readonly string[]])[] = Object.freeze([
  ["movement", MOVEMENT_NAMES], ["action", HAND_ACTION_NAMES], ["effector", EFFECTOR_NAMES],
  ["target", TARGET_NAMES], ["stance", STANCE_NAMES],
] as const);
const TACTIC_KEY_ORDER = TACTIC_KEY_HEADS.map(([head]) => head).join(TACTIC_KEY_DELIMITER);

export const tacticCountKey = (tuple: Readonly<Record<keyof TacticTuple, string>>): string =>
  TACTIC_KEY_HEADS.map(([head]) => tuple[head]).join(TACTIC_KEY_DELIMITER);

/**
 * Why this key is not a tactic, or null when it is.
 *
 * A phrase and not a boolean, in the shape `unsupportedTactic` below already
 * uses and for the same reason: `a movement of close, hold, circle-left,
 * circle-right, disengage, not "cover"` and `5 names in
 * movement|action|effector|target|stance order, not 4` are different repairs, and
 * a record refused from a file somebody has to fix by hand has to say which.
 */
export function tacticKeyFailure(key: string): string | null {
  const parts = key.split(TACTIC_KEY_DELIMITER);
  if (parts.length !== TACTIC_KEY_HEADS.length) {
    return `${TACTIC_KEY_HEADS.length} names in ${TACTIC_KEY_ORDER} order, not ${parts.length}`;
  }
  for (let at = 0; at < TACTIC_KEY_HEADS.length; at += 1) {
    const [head, table] = TACTIC_KEY_HEADS[at] as readonly [keyof TacticTuple, readonly string[]];
    if (!table.includes(parts[at] as string)) return `${headArticle(head)} of ${table.join(", ")}, not "${parts[at]}"`;
  }
  return null;
}

/** `an action`, `a movement`. Two of the five head names begin with a vowel. */
export const headArticle = (head: string): string => `${"aeiou".includes(head[0] as string) ? "an" : "a"} ${head}`;

export function parseTacticCountKey(key: string): TacticTuple {
  const failure = tacticKeyFailure(key);
  if (failure) throw new Error(`tactic key "${key}" requires ${failure}`);
  const [movement, action, effector, target, stance] = key.split(TACTIC_KEY_DELIMITER) as
    [MovementName, HandActionName, EffectorName, TargetName, StanceName];
  return Object.freeze({ movement, action, effector, target, stance });
}

/**
 * The one head whose free set a behaviour record has to *carry*, because it is
 * the only one that cannot be recovered from the joint map.
 *
 * Checked head by head against the executor rather than assumed, because a
 * second would change what a behaviour record has to carry.
 *
 * - `movement`: `movementIntent`'s only gate is `knownMovement`, a name test,
 *   and `deployableTactics` does not enumerate movement at all. All five are
 *   legal on every body that can decide anything.
 * - `stance`: `handActionOption`'s only gate is `knownStance`, and
 *   `applyTacticStance` is total over the six names on every body -- `extended`
 *   falls back to body-relative +1 when no hand is acting, which is the branch a
 *   `bite` and an armless `recover` take.
 * - `target`: `unsupportedTactic` reads `AIMED_TARGETS[action]`, which takes no
 *   view. Pure lookup on the action, so how many targets were legal is
 *   recoverable from the recorded action and needs no separate map. (`bite` is
 *   the only action with a single row, so it is the only one with no choice.)
 * - `action`: **free on every recorded decision -- see the theorem below.**
 * - `effector`: body-dependent, through `tacticEffectors(view, action)`, and the
 *   only head of the five a joint map cannot answer for. `cut` reaches one hand
 *   on a `sword+shield` body and two on nothing at all; the key names the hand
 *   that was used and no key says how many were offered.
 *
 * **How much that last one is worth is smaller than it sounds**, and the measured
 * per-loadout table is in `headUtilisation`'s docstring in
 * `learning/tournament.ts`: no armed loadout in the research matrix gives an
 * *attacking* action two legal effectors, so on 8 of the 13 cells this count is
 * "how often did it choose `cover` or `recover`" and on 3 more it is
 * structurally zero. It is also conditioned on the action just chosen, which
 * makes it post-treatment. Read that docstring before drawing a conclusion from
 * this map.
 *
 * ## The action head is free on every decision that can be recorded
 *
 * **Claim.** Every body for which `onDecision` can fire has two or more legal
 * hand actions, so a `freeChoiceCounts.action` map would be identically
 * `tacticMarginal(tacticCounts, "action")` -- a second copy of a projection of
 * the joint map. It was carried for one session and is deleted.
 *
 * **Proof sketch.** `supportedOptions` (`learning/meta.ts`) answers the empty
 * set for a body with no attached hand *and* no natural attack, and on the empty
 * mask `researchLabelMind` (`learning/research-policy.ts`) and `lookaheadMind`
 * (`learning/lookahead.ts`) both return `freshIntent()` **without calling
 * `onDecision`**. So every recorded decision comes from a body in one of two
 * states. With at least one attached hand: `accepts` answers `() => true` for
 * both `cover` and `recover`, so `tacticEffectors` is non-empty for both and
 * `deployableActions` deletes `cover` only when no hand is attached -- two.
 * With no hand and a published bite: `tacticEffectors` answers the natural
 * effector for `bite` and, by its no-hand branch, for `recover` -- two.
 *
 * **Measured 2026-08-25, and the coverage space is stated because the review
 * that proposed the deletion had one sweep that was exact over the wrong
 * space** -- 288 synthetic bodies varying "bite on/off", which is the one axis
 * that cannot reach the counterexample below.
 * `.review/rem26/theorem.mjs` enumerates all 7 `WEAPON_KINDS` in each hand,
 * ordered, x attached/lost for each hand, x bite present/absent = 392 synthetic
 * bodies, plus 8 edge shapes (`hands: {}` with and without a bite, an armless
 * warrior with and without one, `naturalAttacks` absent entirely, and the two
 * below). 348 of the 400 can decide. `.review/rem26/cells.mjs` runs 39 real
 * Havok bouts -- all 13 (unit, loadout) cells x all 3 `RESEARCH_OPPONENTS`,
 * seed 310013, 1200 solver steps each, 1771 decisions -- and samples the mask at
 * every one: the smallest legal-action count seen is 2, and the free-action map
 * came out byte-identical to the action marginal on all 39. Neither sweep is in
 * `npm test` -- one needs a hand-rolled body table and the other 39 Havok bouts
 * -- so `every_body_that_can_decide_offers_two_or_more_legal_actions` is the
 * cheap live reader, on the two bodies closest to the boundary.
 *
 * **The boundary, which is the part a future edit has to read.** Two of the 400
 * shapes *do* decide with exactly one legal action, and both are the same shape:
 * a body with no attached hand whose only entry in `naturalAttacks` is **not**
 * named `bite`. `supportedOptions` gates on `Object.keys(naturalAttacks).length`
 * -- any natural attack means "this body can decide" -- while `tacticEffectors`
 * hardcodes the name `bite`, so such a body is offered `recover` and nothing
 * else. Nothing in the tree can build one: the only two writers of the field are
 * `NO_NATURAL_ATTACKS` in `fighter.ts` and the centipede's `{ bite }`. A review
 * that swept "bite on/off" cannot see it, because the axis that breaks the
 * theorem is the *name* and not the presence. **Add a second natural attack and
 * this map has to come back** -- and the larger bug to fix first is that a body
 * would then be able to decide without being able to perform its own attack.
 */
export const FREE_CHOICE_HEADS = Object.freeze(["effector"] as const);
export type FreeChoiceHead = (typeof FREE_CHOICE_HEADS)[number];
export const FREE_CHOICE_TABLES: Readonly<Record<FreeChoiceHead, readonly string[]>> =
  Object.freeze({ effector: EFFECTOR_NAMES });

/**
 * Where an aimed skill points: a named body region, or the line the scripted
 * specialists were measured against.
 *
 * **`"as-measured"` is deliberately not in `TARGET_NAMES`.** It is not a region
 * and no learned output can *name* it -- `TARGET_NAMES` is the table an argmax
 * indexes and this is not in it. That is not the same as saying it is
 * unreachable, which is what this note claimed until the routes were traced.
 * `threat` is a `TargetName` a learned controller can emit and is not a height,
 * so wherever a height is wanted the measured line is what stands in for it. The
 * two skills that may name `threat` -- `cover` and `recover` -- consume it as a
 * moving point before any height is asked for, and every other action is refused
 * it at construction, which is what keeps "no named target reaches the measured
 * line" a property of the code rather than an accident of which rows of
 * `AIMED_TARGETS` happen to list it today.
 *
 * What it *is*, is the aim `duelist`, `swinger` and `archer` were tuned at and
 * that every figure in `docs/measurements.md` was taken through -- the
 * opponent's shoulder line for a point, twenty centimetres above it for the
 * centre of a stroke's arc, twelve below it for a shaft. That twenty-centimetre
 * stroke lift is added **only** here and not to a named region, which is most of
 * why a named region does not move where a `cut` lands: see
 * `docs/measurements.md` under "Session 17 Stage B".
 * Naming a real region instead moves all three: `vital` is
 * 14 cm below the shoulder line on a warrior and `high` is near the old entry
 * aim. Whether the scripted policies should move onto one of them is a
 * *measurement*, not a tidiness question, and Stage B has no bout that can
 * answer it -- `npm run measure`'s matchups are built from `policies.ts`, which
 * never enters an option at all, and `scriptedMetaMind`'s only gate is a
 * zero-delta parity sweep against the specialists it replaces. So the scripted
 * callers keep the line they were measured at and say so by name.
 */
export type TacticAim = TargetName | "as-measured";

/**
 * The three exact choices an option needs beside its name.
 *
 * A `TacticDecision` interface sat here for the whole of Stage B -- the complete
 * six-part decision, movement and persistence included -- with **no reader at
 * all**, test or production, on the strength of Stage C coming. It is gone, and
 * this is what is left: the three fields `handActionOption` actually takes. Stage
 * C's decision is these three plus a movement name and a persistence, and the
 * two vocabularies it will index are already frozen above; declaring the record
 * before anything fills one in is how a shape that nobody has had to use yet
 * ends up not fitting the first thing that does.
 */
export interface TacticExecution {
  readonly effector: EffectorName;
  readonly target: TacticAim;
  readonly stance: StanceName;
}

/** What every scripted caller asks for: today's hand search, today's aim, today's pose. */
export const asMeasured = (effector: EffectorName): TacticExecution =>
  ({ effector, target: "as-measured", stance: "action-default" });

export interface CombatOption { readonly name: OptionName; enter(view: FighterView): void; decide(view: FighterView, dt: number): Intent; done(view: FighterView): boolean }
const knownMovement = (value: string): value is MovementName => (MOVEMENT_NAMES as readonly string[]).includes(value);
const knownHandAction = (value: string): value is HandActionName => (HAND_ACTION_NAMES as readonly string[]).includes(value);
const knownEffector = (value: string): value is EffectorName => (EFFECTOR_NAMES as readonly string[]).includes(value);
const knownAim = (value: string): value is TacticAim => value === "as-measured" || (TARGET_NAMES as readonly string[]).includes(value);
const knownStance = (value: string): value is StanceName => (STANCE_NAMES as readonly string[]).includes(value);
const gap = (view: FighterView): number => actionDistance(view.self.shoulder, view.opponent.shoulder);
/**
 * The one threat, from `action-primitives.ts` and no longer from here.
 *
 * This was a hand-rolled lead-versus-off pick, byte-identical to the copy in
 * `policies.ts` and disagreeing with the one in `learning/features.ts` -- so the
 * cover skill and the learned perception could be watching different hands.
 * `selectThreat` is the reconciliation; what is left here is the scratch record
 * it writes into, which is read before the next call exactly as `FighterView`
 * is. It is module-level rather than per option, because two fighters decide
 * synchronously and neither keeps what it is handed.
 */
const threatScratch = blankThreat();
const threat = (view: FighterView): ThreatView => selectThreat(view, threatScratch);
const handFor = (view: FighterView, accepts: (kind: WeaponKind) => boolean): HandName | null => {
  for (const name of ["primary", "secondary"] as const) if (!view.self.hands[name].lost && accepts(view.self.hands[name].weapon)) return name;
  return null;
};
const refuse = (name: OptionName, need: string): never => { throw new Error(`option "${name}" requires ${need}`); };
const turnToward = (view: FighterView): number => {
  const dx = view.opponent.ground.x - view.self.ground.x; const dz = view.opponent.ground.z - view.self.ground.z;
  let delta = Math.atan2(dx, dz) - view.self.facing;
  while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2;
  return clampAction(delta * 2.4);
};

/**
 * What a hand must be holding for each action, which is the one copy of that
 * table.
 *
 * The `cut` row read `isStriking(kind) && kind !== "empty"` and is now
 * `isHeldStriker`, which is the same predicate spelled as a property of the
 * `GRIPS` row rather than as a name to exclude -- and the same one the refusal
 * below has always called "a held striking weapon". Over `WeaponKind` the two
 * agree on every member, so this moves nothing; it exists because
 * `learning/tactical-teacher.ts` needed the same question for its cover
 * preference and a second spelling of a rule is the defect `hands.ts`' own note
 * on this predicate records.
 */
const accepts = (action: HandActionName): (kind: WeaponKind) => boolean =>
  action === "shoot" ? isShooting : action === "punch" ? (kind: WeaponKind) => kind === "empty"
    : action === "thrust" ? hasPoint : action === "cut" ? isHeldStriker
      : () => true;
const attachedHand = (view: FighterView, name: HandName) => {
  // A centipede publishes `hands` as a frozen empty object, so the slot is
  // genuinely absent rather than present and lost. Both readings mean "no arm".
  const hand = view.self.hands[name];
  return hand && !hand.lost ? hand : null;
};
/**
 * The hand a two-handed weapon leaves free to act, or null when none is held.
 *
 * `Fighter.update` drives `intent[this.twoHanded]` and sends the other arm to a
 * point on the same haft, ignoring its half of the command outright -- so an
 * action named on the trailing hand is posed and then thrown away. That is the
 * silent redirection tactic v2 exists to kill: an option asked for the off hand
 * of a bow is refused by name instead of being executed by the bow hand, and
 * `punch` stops being advertised on a body whose only empty hand is welded to a
 * haft. The look-ahead schedule already knew this -- `LOADOUT_TACTICS` in
 * `scripts/train-lookahead.mjs` has never offered `punch` for a bow cell -- so
 * this is the runtime mask catching up with the training one rather than a new
 * rule.
 *
 * **The traffic went the other way too, and only one direction was noticed at
 * the time.** That same schedule also withheld `punch` from `sword+empty` and
 * `axe+empty`, where the off hand is genuinely free and this function answers
 * null -- so on those two the *schedule* was the wrong one and the runtime was
 * right. It was corrected there rather than here; `LOADOUT_TACTICS` carries the
 * argument.
 */
const twoHandedHolder = (view: FighterView): HandName | null => {
  for (const name of HANDS) {
    const hand = attachedHand(view, name);
    if (hand && handsFor(hand.weapon) === 2) return name;
  }
  return null;
};

/**
 * Every effector that can legally perform this action on this body, in hand order.
 *
 * The single legality rule for the **executor**. `supportedHandAction` below
 * asks it whether the set is empty, `meta.ts`'s `supportedOptions` asks it the
 * same question for the deployment mask, and `handActionOption` asks it whether
 * the *exact* effector a decision named is in the set -- so an offered tuple can
 * always be entered, which is the failure `deployableActions`' own note records
 * three copies of.
 *
 * **`recover` with no attached hand answers `natural`.** It is the fix the last
 * exhaustive look-ahead run bought (`docs/measurements.md`, the 42,240-step
 * run): a capability-neutral recovery and a hand-required cover, so a *centipede*
 * -- which publishes no hands and a bite -- still has a legal set and
 * `maskedArgmax` has something to choose.
 *
 * **It is not an invariant, and the note here said it was.** The claim was that
 * "a body that has lost both arms still has a legal set", and the body that
 * falsifies it is the only one that has arms to lose: an armless *warrior*
 * publishes both hand slots with `lost` true and no natural attack at all, and
 * `supportedOptions`' first line answers the empty set for it -- so
 * `deployableActions` and `deployableTactics` are empty while this function
 * still answers `natural` for `recover` and the executor still accepts it. The
 * two are not in conflict, they answer different questions: this one is "who
 * could perform it", and the mask's extra gate is "does this body have any
 * capability at all". Nothing today takes an argmax over an empty set --
 * `randomMetaMind` and `scriptedMetaMind` both go inert at that boundary and
 * `lookaheadMind` refuses -- and whoever gives a learned controller an
 * armless-warrior cell has to decide which of the two answers it wants.
 */
export function tacticEffectors(view: FighterView, action: HandActionName): readonly EffectorName[] {
  if (action === "bite") return view.self.naturalAttacks?.bite ? EFFECTOR_NAMES.slice(2) : [];
  const attached = HANDS.filter((name) => attachedHand(view, name));
  if (!attached.length) return action === "recover" ? EFFECTOR_NAMES.slice(2) : [];
  const holder = twoHandedHolder(view);
  const able = accepts(action);
  return attached.filter((name) => (holder === null || name === holder) &&
    able((view.self.hands[name] as { weapon: WeaponKind }).weapon));
}

/**
 * The effector a scripted caller will use, named at the call site.
 *
 * This is `requireHand`'s old search -- preferred first, then the other hand --
 * lifted out of the option and made the caller's decision, which is the whole of
 * the exact-effector change from the scripted side. The option no longer
 * searches: it executes what it was handed or refuses it by name. Null when
 * nothing can, so the caller refuses rather than the option quietly answering
 * with a hand nobody asked for.
 */
export function chooseEffector(view: FighterView, action: HandActionName, preferred: HandName = "primary"): EffectorName | null {
  const legal = tacticEffectors(view, action);
  if (!legal.length) return null;
  for (const candidate of [preferred, otherHand(preferred)]) if (legal.includes(candidate)) return candidate;
  return legal[0] as EffectorName;
}

/**
 * Which regions each action may be aimed at.
 *
 * `cover` and `recover` answer the threat or the vitals and nothing else: a
 * guard placed at head height while a blade comes in low is not a guard, and the
 * two heights a defensive hand has any business at are "where the thing is" and
 * "in front of my chest". Attacks choose freely between the three body regions,
 * except `punch`, which cannot reach a knee from a shoulder socket.
 */
/**
 * The two skills that answer a moving point, and the one row they share.
 *
 * `cover` and `recover` are the only branches below that consume `threat`, and
 * both hand it to `actionCoverAt` -- the only thing in the tree that can answer
 * a point which moves. Every other action asks for a **height**, and `threat` is
 * not one.
 *
 * These are one list and one row because the table and the branches used to be
 * two facts: an action whose row grew `threat` and whose branch had no case for
 * it would have been handed `"as-measured"` silently, which is the opponent's
 * shoulder line -- a real aim, correct for nobody, requested by nothing. The
 * refusal in `handActionOption` reads this list, so a row and a branch cannot
 * come apart without something saying so.
 */
const DEFENSIVE_ACTIONS: readonly HandActionName[] = Object.freeze(["cover", "recover"]);
const DEFENSIVE_TARGETS: readonly TargetName[] = Object.freeze(["threat", "vital"]);
const AIMED_TARGETS: Readonly<Record<HandActionName, readonly TargetName[]>> = Object.freeze({
  cover: DEFENSIVE_TARGETS,
  cut: Object.freeze(["vital", "high", "low"] as const),
  thrust: Object.freeze(["vital", "high", "low"] as const),
  punch: Object.freeze(["vital", "high"] as const),
  shoot: Object.freeze(["vital", "high", "low"] as const),
  bite: Object.freeze(["vital"] as const),
  recover: DEFENSIVE_TARGETS,
});

/** The regions this action may be aimed at, in frozen order. */
export const tacticTargets = (action: HandActionName): readonly TargetName[] => AIMED_TARGETS[action];

/**
 * How far above and below the vitals `high` and `low` sit, as a fraction of the
 * body's own vitals-to-crown span.
 *
 * A fraction and not a distance, because the rule has to work on a centipede.
 * `BodyView` publishes `vitalHeight` and `crownHeight` and nothing else about
 * where a body's parts are, so the span between them is the only measuring stick
 * available.
 *
 * **The argument is anatomical, and it is a band rather than a point.** `high`
 * has to land on the head capsule and `low` inside the pelvis, which pins the
 * fraction from both ends. On a warrior (vitals 1.280, crown 1.765, span 0.485,
 * head 1.555-1.765, pelvis 0.830-1.090) that band is **0.567 to 0.928**: below
 * 0.567 `high` slides off the head and into the torso, which runs 1.020-1.540,
 * and above 0.928 `low` drops out of the pelvis into the thighs. A broot is a
 * uniform 1.18x scale of the same skeleton, so its band is the same two numbers
 * -- verified rather than assumed, because a rule that happened to work on one
 * body would be a rule about that body. 0.75 is essentially the midpoint of it
 * (0.747), which is the whole of why it is 0.75 and not 0.70 or 0.80.
 *
 * **The single-bout measurement beside it was recorded wrong and does not choose
 * this value.** `docs/measurements.md` and the session overview said half the
 * span "does not move the contact distribution at all". Measured, it moves it a
 * great deal: at 0.50 a `thrust` aimed `low` takes a 0.71 low share against the
 * measured aim's 0.118, a six-fold move. What actually fails at 0.50 is the
 * contact-count floor -- `low` lands 31 body contacts where the test wants more
 * than 40 -- together with `high` reaching only a 0.117 head share against the
 * 0.25 the test asks for. And the verdict is **not monotonic in this constant**:
 * swept through `a_thrust_at_a_named_high_or_low_target_reaches_that_body_region`
 * it passes at 0.60, 0.70, 0.75, 0.80, 0.90, 0.95 and 1.00 and fails at 0.50,
 * 0.55, 0.65 and 0.85. That is a cliff in a physics bout, not a curve, so the
 * test bounds the constant from neither side usefully and the anatomy above is
 * what the number rests on. The sweep is in `docs/measurements.md`.
 *
 * **Not reachable from `__sword.config`, and that is deliberate.** `options.ts`
 * may not import `config.ts` at all -- `options_and_features_have_no_mutable_config_backdoor`
 * pins it -- because a legality or aim rule a console command can move is a rule
 * an artifact can be trained against and deployed without. `ACTION_TUNING` in
 * `action-primitives.ts` is outside for the same reason and records it there.
 */
export const TARGET_SPAN_FRACTION = 0.75;

/**
 * How far a stroke aimed at a named region sweeps above and below it, as a
 * fraction of the spacing between two adjacent named regions.
 *
 * **Half, because half is what "separable" means here.** The three regions are
 * `TARGET_SPAN_FRACTION` of the vitals-to-crown span apart -- 364 mm on a
 * warrior -- so a stroke that sweeps half that either side reaches exactly to
 * the midpoint between its own region and the next, and two strokes aimed at
 * adjacent regions therefore never sweep through each other's aim point. Any
 * larger and a cut aimed `high` rakes the region below it as readily as its own,
 * which is what it did: `enter` swept a flat `+-0.50` in cursor Y about the aim,
 * which at the range a cut is delivered is about +-0.85 m -- more than twice the
 * distance between two regions and most of the height of a body.
 *
 * **It is a fraction of a spacing rather than a number of cursor units, for the
 * same reason `TARGET_SPAN_FRACTION` is a fraction of a span**: the rule has to
 * work on a broot, which is a 1.18x warrior, and at whatever range the stroke is
 * entered at. Cursor elevation is not linear in height (`actionAimAt` divides by
 * 1.25 above the shoulder line and 1.05 below it, after an `asin`), so the two
 * ends are resolved by aiming at the neighbouring heights and reading the cursor
 * back, rather than by adding a constant to the aim. The extent is therefore
 * asymmetric about the aim, and correctly so.
 *
 * **"A broot, which is a 1.18x warrior" is the whole of the portability this was
 * checked over, and `TARGET_SPAN_FRACTION`'s own argument in `DESIGN.md` reaches
 * a 0.38 m centipede. Here is what happens down there.** A centipede publishes
 * `crownHeight` 0.38 and `vitalHeight` 0.209, so a region spacing is 128 mm and
 * a half-spacing is 64 mm. Measured from a warrior's shoulder
 * (`.review/rem2/smallbody.mjs`), the resulting arc is **0.041 to 0.057 cursor
 * units** at 1.0 to 2.2 m, against the measured line's 0.77 to 1.00 -- a stroke
 * about a twentieth as tall as the one the game was tuned on. **At 0.6 m the
 * span of a `vital` or a `low` cut is exactly 0.000**: both ends of the arc
 * resolve below the elevation envelope and `clampAction` pins them together, so
 * a named cut at a crawler underfoot is a chop with no sweep at all. `high`
 * survives at 0.042 because its aim sits highest.
 *
 * **It is not a damage regression and that is the surprising half.** Four bouts
 * a cell against `crawler` (`.review/rem2/centipede.mjs`): damage per four bouts
 * goes 545.5 -> 769.5 for `high`, 491.2 -> 519.5 for `vital`, 400.8 -> 505.5 for
 * `low`, with more contacts and *slower* ones -- mean contact speed 8.76 -> 6.93
 * and 15.22 -> 7.85. A small body is close to the floor, so the part of the old
 * arc this removes was mostly swinging at the ground. `"as-measured"` is
 * byte-identical, as it is everywhere.
 *
 * So the floor is stated rather than guarded: **a named stroke degenerates
 * toward a point as the target's vitals-to-crown span shrinks, and reaches an
 * exact zero on a 0.17 m span inside about 0.6 m.** No constant clamps it,
 * deliberately -- a minimum in cursor units would be the flat `+-0.50` this
 * replaced, in a smaller costume, and the measurement says the degenerate case
 * is not the one that hurts. If a future body makes it hurt, the repair is a
 * floor in *metres* on the region spacing, in `targetHeight` where the spacing
 * is computed, not here.
 *
 * **What it costs, measured** (`.review/arcfinal.mjs`, 40 seeded bouts a cell
 * against an idle warrior): a `cut` separates `high` from `low` by 8.7x on head
 * share where it separated by 2.9x, and pays about a fifth of its damage *rate*
 * for it -- the blade travels less vertical distance in the same commit, so it
 * arrives at 7.8 m/s rather than 10.1 and lands more, slower contacts. The full
 * before/after tables are in `docs/measurements.md` under "Session 18".
 *
 * **Biasing the commit point instead was swept and refused, and it was the
 * likelier-looking repair.** Contact is not concentrated anywhere in the stroke
 * -- over one bout, 31 scoring contacts split chamber 10, commit 8, recover 13,
 * spread evenly from 0.08 to 0.95 of the sweep -- so there is no moment of likely
 * contact to point at. Measured, moving the commit point from the centre of a
 * full-width arc to near the aim raises a `high` cut's head share from 0.128 to
 * 0.176 and a `low` cut's from 0.044 to 0.072 together, which lifts the whole
 * distribution rather than pointing any of it: the ratio between them *falls*,
 * 2.9 to 2.4. Narrowing is what separates regions.
 *
 * **The measured line is not a named region and keeps its own extent.** A cut
 * asked for `"as-measured"` still sweeps `+-0.50` about the aim, because that
 * aim *is* the centre of an arc by definition -- it is the shoulder line plus the
 * twenty-centimetre stroke lift the scripted specialists were tuned with, and
 * `aimHeight` already treats it differently for exactly this reason. A named
 * region is a place on a body; the two are different things being named and get
 * different extents. That is also what keeps the scripted parity sweep and the
 * `duelist-swinger` null control out of this change entirely.
 */
export const NAMED_STROKE_SPAN = 0.5;

/** The cursor elevation that sends this hand at a height on the line to the target. */
const SCRATCH_AIM = { pointerX: 0, pointerY: 0 };
const aimPointerY = (view: FighterView, hand: HandName, y: number): number => {
  actionAimAt(view, { x: view.opponent.ground.x, y, z: view.opponent.ground.z }, SCRATCH_AIM, hand,
    (view.self.hands[hand] as { shoulder: ActionPoint }).shoulder);
  return SCRATCH_AIM.pointerY;
};

/** Where a named region is on the body in front, from published facts alone. */
export function targetHeight(view: FighterView, target: Exclude<TargetName, "threat">): number {
  const vital = view.opponent.vitalHeight;
  const span = Math.max(0, view.opponent.crownHeight - vital);
  if (target === "high") return vital + span * TARGET_SPAN_FRACTION;
  if (target === "low") return vital - span * TARGET_SPAN_FRACTION;
  return vital;
}

/**
 * The height an aim resolves to, and the one asymmetry in it.
 *
 * `measuredLift` is added to the measured shoulder line and **not** to a named
 * region, which is deliberate -- it is the twenty centimetres the scripted
 * stroke was tuned with and a named region is a real place on a body, not a
 * place plus an offset. On a warrior the measured entry aim is therefore 1.62 m
 * while `high` is 1.644 -- twenty-four millimetres apart -- and `vital` and
 * `low` are 340 and 704 mm *below* it.
 *
 * **That twenty-four millimetres is also why `high` against `as-measured` is not
 * a test of whether a cut obeys its aim, and Stage B ran exactly that test.**
 * The two aims are 0.012 cursor units apart on the measurement fixture: the same
 * stroke, twice. Stage B compared them over one bout of 22 to 35 scoring
 * contacts and reported the difference -- `cut` 0.071 -> 0.045 head share,
 * `punch` 0.200 -> 0.121 -- as a rule the two actions did not obey. Pooled over
 * **forty** seeded bouts the pair a rule is actually about, `high` against
 * `low`, separated before the change too: 0.128 against 0.044 on a cut, a 2.9x
 * ratio. What was true is that the separation was weak and the stroke raked
 * everything under the aim on the way past -- a `high` cut still put **31 %** of
 * its contacts in the legs -- and `NAMED_STROKE_SPAN` is the repair, which takes
 * the ratio to 8.9x and the leg share to 24 %. Session 18's tables are in
 * `docs/measurements.md`; Stage B's are superseded there rather than deleted.
 *
 * The two figures here were "0.072 against 0.009" and "45 %" until the
 * remediation pass, quoted as sixteen-seed readings from `.review/aimdist.mjs`.
 * That harness cannot produce them: they were taken under a pause convention it
 * now comments out, and nothing in the pair reproduces. Four places carried
 * them; all four carry the forty-seed table now.
 *
 * `thrust` and `shoot` send a point where the aim says and take no arc at all,
 * which is why they were the two that obeyed and why neither moved.
 */
const aimHeight = (view: FighterView, aim: Exclude<TacticAim, "threat">, measuredLift = 0): number =>
  aim === "as-measured" ? view.opponent.shoulder.y + measuredLift : targetHeight(view, aim);

/**
 * Why this exact tuple cannot be performed, or null when it can.
 *
 * A phrase rather than a boolean, because a control that cannot honour a request
 * has to say which part of it was the problem: `an empty secondary hand` and
 * `a punch target of vital, high, not "low"` are different repairs.
 */
function unsupportedTactic(view: FighterView, action: HandActionName,
  effector: EffectorName, target: TacticAim): string | null {
  if (!tacticEffectors(view, action).includes(effector)) return unsupportedEffector(view, action, effector);
  if (target !== "as-measured" && !AIMED_TARGETS[action].includes(target)) {
    return `a ${action} target of ${AIMED_TARGETS[action].join(", ")}, not "${target}"`;
  }
  return null;
}

const unsupportedEffector = (view: FighterView, action: HandActionName, effector: EffectorName): string => {
  if (action === "bite") {
    return effector === "natural" ? "a published natural attack named bite"
      : `the natural effector, not the ${effector} hand -- jaws are not a hand`;
  }
  if (effector === "natural") {
    return action === "recover"
      ? "an attached hand rather than the natural effector, which recover uses only when no hand is left"
      : "the primary or secondary hand, not the natural effector";
  }
  if (!attachedHand(view, effector)) return `an attached ${effector} hand`;
  const holder = twoHandedHolder(view);
  if (holder !== null && holder !== effector) {
    return `the ${holder} hand, which is the only one a two-handed ` +
      `${(view.self.hands[holder] as { weapon: WeaponKind }).weapon} leaves free to act`;
  }
  return action === "shoot" ? `a bow in the ${effector} hand`
    : action === "punch" ? `an empty ${effector} hand`
      : action === "thrust" ? `a pointed weapon in the ${effector} hand`
        : action === "cut" ? `a held striking weapon in the ${effector} hand`
          : `an attached ${effector} hand`;
};

/** The action-level question `composeTactic` asks: can this body do this at all? */
const supportedHandAction = (view: FighterView, action: HandActionName): string | null => {
  if (tacticEffectors(view, action).length > 0) return null;
  if (action === "bite") return "a published natural attack named bite";
  if (!HANDS.some((name) => attachedHand(view, name))) return "an attached hand";
  const holder = twoHandedHolder(view);
  const free = holder === null ? "" : ` in the ${holder} hand, which is the only one a two-handed ` +
    `${(view.self.hands[holder] as { weapon: WeaponKind }).weapon} leaves free to act`;
  return (action === "shoot" ? "a bow" : action === "punch" ? "an empty hand"
    : action === "thrust" ? "a pointed weapon" : action === "cut" ? "a held striking weapon"
      : "an attached hand") + free;
};

/**
 * The learned whole-body pose, applied over whatever the skill established.
 *
 * **After `applyActionPosture` and before `boundIntent`, and there is only one
 * legal slot.** `applyActionPosture` zeroes all three posture axes on every
 * call, so a stance applied before it is erased without trace; `boundIntent`
 * clamps the axes, so a stance applied after it is unbounded. The constants are
 * initial and are not claims -- session 23's held-out result decides whether
 * they earn their place, and it should decide knowing that **`extended` is very
 * nearly the existing `commit` posture**: 0.10/+0.30/0.55 x outboard against
 * `commit`'s 0.12/0.30/0.68 x outboard. During any committing action the
 * six-name stance head therefore offers five distinguishable choices, not six.
 *
 * `outboard` is the acting arm's side, so `extended` twists toward the hand that
 * is working. A command that names no hand takes body-relative +1, which is the
 * only reading available when there is nothing to be outboard of -- and that is
 * a rule about keeping `extended` total, not a claim about a creature. This note
 * used to say "a centipede's `extended` is its own right", which describes an
 * effect that cannot happen: `Centipede.update` reads the movement axes and the
 * two natural buttons and never looks at `input.posture` at all, and
 * `Centipede.describe` publishes zero crouch, lean and twist. The +1 branch is
 * reached by a `bite`, whose posture nothing consumes, and by `recover` on a
 * body whose arms are both gone -- an armless *warrior*, which does read posture
 * and is where the twist is visible.
 */
function applyTacticStance(view: FighterView, stance: StanceName, into: Intent): Intent {
  if (stance === "action-default") return into;
  if (stance === "upright") { into.posture.crouch = 0; into.posture.trunkLean = 0; into.posture.trunkTwist = 0; return into; }
  if (stance === "compact") { into.posture.crouch = 0.55; into.posture.trunkLean = -0.20; into.posture.trunkTwist = 0; return into; }
  if (stance === "extended") {
    const acting = into.actingHand === null ? null : attachedHand(view, into.actingHand);
    into.posture.crouch = 0.10; into.posture.trunkLean = 0.30; into.posture.trunkTwist = 0.55 * (acting?.outboard ?? 1);
    return into;
  }
  into.posture.crouch = 0.25; into.posture.trunkLean = -0.10;
  into.posture.trunkTwist = stance === "slip-left" ? -0.65 : 0.65;
  return into;
}

/** The movement head owns exactly the three locomotion axes. */
export function movementIntent(requested: MovementName | string, view: FighterView): Intent {
  if (!knownMovement(requested)) throw new Error(`unknown movement "${requested}" -- known movements are ${MOVEMENT_NAMES.join(", ")}`);
  const intent = freshIntent(); intent.turn = turnToward(view);
  if (requested === "close") intent.forward = 1;
  else if (requested === "disengage") intent.forward = -0.8;
  else if (requested === "circle-left") intent.strafe = -0.55;
  else if (requested === "circle-right") intent.strafe = 0.55;
  return intent;
}

const neutralHands = (intent: Intent): boolean => {
  const blank = freshIntent();
  return intent.actingHand === blank.actingHand &&
    intent.natural.thrust === blank.natural.thrust && intent.natural.guard === blank.natural.guard &&
    (["primary", "secondary"] as const).every((hand) =>
      Object.keys(blank[hand]).every((field) => intent[hand][field as keyof Intent[typeof hand]] === blank[hand][field as keyof Intent[typeof hand]]));
};
const neutralPosture = (intent: Intent): boolean => intent.posture.trunkLean === 0 && intent.posture.trunkTwist === 0 && intent.posture.crouch === 0;

/**
 * The only tactic merge. Movement, hands and posture each have one owner; a
 * contaminated partial is refused instead of depending on spread order.
 *
 * A movement partial owns exactly `forward`, `strafe` and `turn`, and the first
 * refusal below is the one that holds it to them -- it rejects a movement partial
 * that wrote a hand or a posture. The second refusal, on the action partial, is
 * where a fourth test used to sit: `zoom !== 1`, which read as extra rigour and
 * was the opposite. That sentinel could only ever catch a camera write, and a
 * camera factor was never something a hand action could do anything with. The
 * three axes are the whole of what a movement head decides.
 */
export function composeTactic(view: FighterView, movement: MovementName | string, action: HandActionName | string,
  movementPart: Intent, actionPart: Intent): Intent {
  if (!knownMovement(movement)) throw new Error(`illegal tactic movement "${movement}" with hand action "${action}"`);
  if (!knownHandAction(action)) throw new Error(`illegal tactic movement "${movement}" with hand action "${action}"`);
  const unsupported = supportedHandAction(view, action);
  if (unsupported) throw new Error(`illegal tactic "${movement}" + "${action}": hand action "${action}" requires ${unsupported}`);
  if (!neutralHands(movementPart) || !neutralPosture(movementPart)) {
    throw new Error(`illegal tactic "${movement}" + "${action}": movement "${movement}" wrote hand or posture fields`);
  }
  if (actionPart.forward !== 0 || actionPart.strafe !== 0 || actionPart.turn !== 0) {
    throw new Error(`illegal tactic "${movement}" + "${action}": hand action "${action}" wrote movement fields`);
  }
  const result = freshIntent(); result.forward = movementPart.forward; result.strafe = movementPart.strafe;
  result.turn = movementPart.turn; result.actingHand = actionPart.actingHand;
  Object.assign(result.natural, actionPart.natural);
  Object.assign(result.posture, actionPart.posture); Object.assign(result.primary, actionPart.primary);
  Object.assign(result.secondary, actionPart.secondary); return boundIntent(result);
}
const aimAt = (view: FighterView, intent: Intent, name: HandName, y = view.opponent.shoulder.y): void => {
  actionAimAt(view, { x: view.opponent.ground.x, y, z: view.opponent.ground.z }, intent[name], name,
    (view.self.hands[name] as { shoulder: ActionPoint }).shoulder);
};

/** Stateful hand skill with locomotion stripped before the one legal merge. */
export interface FactorizedHandAction extends CombatOption { readonly movement: Readonly<{ forward: number; strafe: number; turn: number }> }

/**
 * The one canonical arm skill: an action, the exact effector that performs it,
 * the exact thing it points at, and the stance the body holds while it does.
 *
 * **This is the merge, and it is not a pure move.** There were two doors into
 * the same skill. `combatOption` took twelve names, five of which were movements
 * that reached a hand skill and did locomotion inside it, and one of which --
 * `bite` -- it accepted, constructed, and then silently did nothing with,
 * because the real bite skill only ever existed here. Asking for an action now
 * either does the action or is refused by name; there is no third answer, and
 * `movementIntent` is the only door to a movement.
 *
 * The other thing that died with `combatOption` is `requireHand`'s
 * `[preferred, otherHand(preferred)].find(...)`. A request for the primary is
 * executed on the primary or refused; it is never quietly executed on the
 * secondary. Scripted callers make the search themselves, by name, through
 * `chooseEffector`.
 *
 * **There was a third parameter and it was born dead.** `start` offered the
 * pointer the hand was last commanded to, and `enter` copied it into the
 * stroke's chamber origin -- which `decide` then overwrote on the entry step
 * with the covering guard, unconditionally, before the first read. Removing it
 * moved not one leaf of the 408-cell command surface, and neither did handing
 * it `undefined` at the only caller that ever threaded a live value into it.
 * `scripted-meta` kept a whole `previousIntent` field alive to feed it. The
 * stroke *does* start from the guard on purpose -- that is what
 * `actionStrokePose`'s `start` argument is for and it is a real pose -- so this
 * was a second, silent answer to a question already answered, and the two
 * disagreed with nobody there to see it. Reviving it is a behaviour change and
 * needs its own measurement, not a parameter list.
 */
export function handActionOption(requested: HandActionName | string, execution: TacticExecution,
  initialShotRest = 0): FactorizedHandAction {
  if (!knownHandAction(requested)) throw new Error(`unknown hand action "${requested}" -- known hand actions are ${HAND_ACTION_NAMES.join(", ")}`);
  if (!knownEffector(execution.effector)) throw new Error(`unknown effector "${execution.effector}" -- known effectors are ${EFFECTOR_NAMES.join(", ")}`);
  if (!knownAim(execution.target)) throw new Error(`unknown target "${execution.target}" -- known targets are ${TARGET_NAMES.join(", ")}`);
  if (!knownStance(execution.stance)) throw new Error(`unknown stance "${execution.stance}" -- known stances are ${STANCE_NAMES.join(", ")}`);
  const name = requested; const effector = execution.effector; const stance = execution.stance;
  // A moving point is not a height, and an action with no case for one must not
  // be handed the measured shoulder line instead. This is a construction-time
  // refusal rather than a substitution because the substitution was invisible:
  // it produced a legal aim at a place nobody named.
  if (execution.target === "threat" && !DEFENSIVE_ACTIONS.includes(name)) {
    throw new Error(`hand action "${name}" cannot be aimed at "threat" -- ` +
      `only ${DEFENSIVE_ACTIONS.join(" and ")} answer a point that moves`);
  }
  // **One discriminant for both defensive skills**, which used to be two.
  // `cover` tested the collapsed `aimed` and `recover` tested `target`, so they
  // disagreed for `"as-measured"` -- `cover` covered the threat, `recover` aimed
  // at the opponent's shoulder -- and neither said so. The resolution is that
  // `cover`'s measured line *is* the threat line: `actionCoverAt` is what the
  // specialists were measured through, so a `cover` asked for the measured aim
  // is asking for `threat` and is normalised to it here, at the one place a
  // target is interpreted. `recover`'s measured aim is genuinely the shoulder
  // line and stays it. After this, both branches ask the same question.
  const target: TacticAim = name === "cover" && execution.target === "as-measured" ? "threat" : execution.target;
  const movement = { forward: 0, strafe: 0, turn: 0 };
  const intent = freshIntent();
  const refuseUnsupported = (view: FighterView): void => {
    const unsupported = unsupportedTactic(view, name, effector, target);
    if (unsupported) refuse(name, unsupported);
  };
  // What is left once `threat` is consumed: a height, or the measured line.
  // Neither defensive skill seeds a stroke envelope from one, so the measured
  // line standing in here reaches only `enter`'s unused stroke seed.
  const aimed: Exclude<TacticAim, "threat"> = target === "threat" ? "as-measured" : target;

  if (name === "bite") {
    let entered = 0; let sawActive = false;
    return { name, movement,
      enter(view) { refuseUnsupported(view); entered = view.clock; sawActive = false; },
      decide(view) {
        Object.assign(intent, freshIntent());
        // Not `primary`. A centipede publishes `hands` as an empty object and
        // was driven through `primary.thrust` anyway, so every reader
        // downstream had to know that one body's primary hand meant its head.
        intent.actingHand = null;
        const bite = view.self.naturalAttacks.bite;
        intent.natural.thrust = Boolean(bite?.ready && view.measure <= (bite.reach + view.opponent.collisionRadius));
        sawActive ||= Boolean(bite?.active);
        return boundIntent(applyTacticStance(view, stance, intent));
      },
      done(view) { return sawActive && !view.self.naturalAttacks.bite?.active || view.clock - entered >= 0.8; },
    };
  }
  if (effector === "natural") {
    // `recover`, and only `recover`: `unsupportedTactic` has already refused
    // every other action on the natural effector, and refuses this one too the
    // moment a hand is attached. Capability-neutral recovery is what leaves a
    // body that has lost both arms with a legal set at all.
    let entered = 0;
    return { name, movement,
      enter(view) { refuseUnsupported(view); entered = view.clock; },
      decide(view) {
        Object.assign(intent, freshIntent()); intent.actingHand = null;
        return boundIntent(applyTacticStance(view, stance, intent));
      },
      done(view) { return view.clock - entered >= 0.26; },
    };
  }

  const hand: HandName = effector;
  let started = 0; let elapsed = 0;
  let startX = 0; let startY = 0; let fromX = 0; let fromY = 0; let toX = 0; let toY = 0; let strokeRoll = 0;
  let strokePhase: "chamber" | "commit" | "recover" | "complete" = "chamber";
  let strokeElapsed = 0; let strokeEntry = true;
  let shotRest = Math.max(0, initialShotRest); let shotDrawn = -1; let shotReleasing = false; let shotComplete = false;
  const reset = (): void => {
    const clean = freshIntent();
    intent.forward = clean.forward; intent.strafe = clean.strafe; intent.turn = clean.turn;
    intent.actingHand = hand; Object.assign(intent.natural, clean.natural);
    Object.assign(intent.posture, clean.posture);
    Object.assign(intent.primary, clean.primary); Object.assign(intent.secondary, clean.secondary);
  };
  return {
    name, movement,
    enter(view) {
      refuseUnsupported(view); started = view.clock; elapsed = 0; strokePhase = "chamber"; strokeElapsed = 0; strokeEntry = true;
      shotDrawn = -1; shotReleasing = false; shotComplete = false;
      reset(); aimAt(view, intent, hand, aimHeight(view, aimed, 0.20));
      // How far the stroke sweeps above and below where it was pointed. The
      // measured line names the centre of an arc and keeps the extent it was
      // tuned with; a named region names a place on a body, and the arc reaches
      // halfway to its neighbours and no further. `NAMED_STROKE_SPAN` carries
      // the argument and what the change cost.
      let above = 0.50; let below = 0.50;
      if (aimed !== "as-measured") {
        const step = NAMED_STROKE_SPAN * TARGET_SPAN_FRACTION *
          Math.max(0, view.opponent.crownHeight - view.opponent.vitalHeight);
        const centre = aimHeight(view, aimed); const pointed = intent[hand].pointerY;
        above = Math.max(0, aimPointerY(view, hand, centre + step) - pointed);
        below = Math.max(0, pointed - aimPointerY(view, hand, centre - step));
      }
      fromX = clampAction(intent[hand].pointerX + 0.62 * view.self.hands[hand].outboard); fromY = clampAction(intent[hand].pointerY + above);
      toX = clampAction(intent[hand].pointerX - 0.62 * view.self.hands[hand].outboard); toY = clampAction(intent[hand].pointerY - below);
      strokeRoll = actionStrokeRoll(fromX, fromY, toX, toY, cutsBothWays(view.self.hands[hand].weapon), hand);
    },
    decide(view, dt) {
      // The arm this option named, checked on the step it is used rather than
      // only on the step it finishes. `done` has always answered true for a
      // severed hand, but `done` is the caller's courtesy: a controller that
      // reads it re-decides, and one that does not used to get its severed arm
      // posed and `actingHand` naming it. There is no repair available here --
      // switching hands is precisely the silent redirection this stage removes
      // -- so the refusal says the decision has to be taken again.
      if (!attachedHand(view, hand)) {
        refuse(name, `an attached ${hand} hand: the one this option named has been severed, so the decision must be taken again`);
      }
      elapsed += Math.max(0, dt); reset(); intent.turn = turnToward(view); const h = intent[hand];
      let actionPosture: "cover" | "commit" | "recover" | "draw" | "close" = "close";
      if (name === "cover") {
        if (target === "threat") actionCoverAt(view, threat(view), h, hand);
        else aimAt(view, intent, hand, aimHeight(view, aimed));
        h.guard = true;
      } else if (name === "cut" || name === "punch") {
        if (!strokeEntry) strokeElapsed += Math.max(0, dt);
        const offset = strokePhase === "commit" ? ACTION_STROKE_TIMING.chamber
          : strokePhase === "recover" ? ACTION_STROKE_TIMING.chamber + ACTION_STROKE_TIMING.commit : 0;
        const stroke = actionStrokeReading(offset + strokeElapsed); h.roll = strokeRoll;
        const guard = { pointerX: 0, pointerY: 0 }; actionCoverAt(view, threat(view), guard, hand);
        if (strokeEntry) { startX = guard.pointerX; startY = guard.pointerY; }
        const reading = strokeEntry ? { phase: "chamber" as const, fraction: 0 }
          : { phase: strokePhase === "complete" ? "recover" as const : strokePhase,
              fraction: stroke.phase === strokePhase ? stroke.fraction : 1 };
        const pose = actionStrokePose(reading, { pointerX: startX, pointerY: startY },
          { pointerX: fromX, pointerY: fromY }, { pointerX: toX, pointerY: toY }, guard);
        h.pointerX = pose.pointerX; h.pointerY = pose.pointerY;
        if (strokeEntry) {
          h.guard = true;
        } else if (strokePhase === "chamber") {
          intent.forward = 0.35;
        } else if (strokePhase === "commit") {
          h.thrust = name === "punch"; intent.forward = 0.2;
        } else {
          h.guard = true;
        }
        actionPosture = strokeEntry ? "cover" : strokePhase === "recover" || strokePhase === "complete" ? "recover" : "commit";
        // The entry step used to set `roll` and `wristBend` here as well, and
        // both were overwritten before anybody read them: `applyActionPosture`
        // rewrites the pair on every call, and the block below it puts the
        // stroke roll back for exactly this case. Neutralising them moved no
        // leaf of the 408-cell command surface.
        if (strokeEntry) {
          strokeEntry = false;
        } else if (stroke.phase !== strokePhase || stroke.fraction >= 1) {
          strokePhase = strokePhase === "chamber" ? "commit" : strokePhase === "commit" ? "recover" : "complete";
          strokeElapsed = 0;
        }
      } else if (name === "thrust") { aimAt(view, intent, hand, aimHeight(view, aimed)); h.thrust = true; intent.forward = 0.2; }
      else if (name === "shoot") { const d = gap(view);
        const wasDrawing = shotDrawn >= 0;
        // The named region is where the shaft should *arrive*; the ballistic
        // lift is added on top of it inside `actionArcherAim`, which is what
        // "the existing lift applied after target selection" has to mean. A
        // defender's crossing prediction reads the shaft rather than the aim, so
        // it follows a re-aimed shot without being told.
        actionArcherAim(view, hand, intent[hand], aimed === "as-measured"
          ? view.opponent.shoulder.y - ACTION_TUNING.arrowShoulderDrop : targetHeight(view, aimed));
        intent.forward = d < 3.2 ? -1 : d > 6 ? 1 : 0;
        if (shotReleasing) { shotReleasing = false; shotDrawn = -1; shotComplete = true; h.thrust = false; }
        else if (shotRest > 0) { shotRest -= Math.max(0, dt); h.thrust = false; }
        else {
          const bearing = Math.atan2(view.opponent.ground.x - view.self.ground.x,
            view.opponent.ground.z - view.self.ground.z);
          let delta = bearing - view.self.facing;
          while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) < 0.15) {
            shotDrawn = shotDrawn < 0 ? 0 : shotDrawn + Math.max(0, dt);
            if (actionShotPhase(shotDrawn) !== "draw") { shotReleasing = true; h.thrust = false; }
            else h.thrust = true;
          } else h.thrust = shotDrawn >= 0;
        }
        actionPosture = wasDrawing ? "draw" : d < 3.2 ? "cover" : "close";
      }
      else if (name === "recover") {
        if (target === "threat") actionCoverAt(view, threat(view), h, hand);
        else aimAt(view, intent, hand, aimHeight(view, aimed));
        h.guard = true;
      }
      if (name === "cover" || name === "cut" || name === "punch" || name === "recover") {
        const spare = hand === "primary" ? "secondary" : "primary";
        if (!view.self.hands[spare].lost) {
          actionCoverAt(view, threat(view), intent[spare], spare);
          intent[spare].guard = true;
        }
      }
      if (name === "cover") actionPosture = "cover";
      else if (name === "thrust") actionPosture = "commit"; else if (name === "recover") actionPosture = "recover";
      applyActionPosture(view, actionPosture, intent, threat(view));
      if ((name === "cut" || name === "punch") && actionPosture === "cover") {
        intent[hand].roll = strokeRoll; intent[hand].wristBend = 0.12;
      }
      if (name === "shoot") {
        // `roll` and `wristBend` and nothing else: `applyActionPosture` is the
        // only thing above here that writes them, and a `guard` clear would be
        // a second answer to what `reset()` already answered at the top of the
        // step -- neutralising one moved no leaf of the 408-cell command
        // surface, and setting it the other way moved sixteen.
        intent[hand].roll = 0; intent[hand].wristBend = 0;
        const spare = otherHand(hand);
        if (!view.self.hands[spare].lost && view.self.hands[spare].weapon === "empty") {
          // **The rest pose written whole, and the pointer pair is not
          // decoration.** `freshIntent` seeds `restPointerX/Y` on the
          // *secondary* alone -- a primary starts at (0, 0) -- so this is the
          // only thing that puts a spare **primary** at rest, which is the case
          // a bow in the off hand produces. A review sweep that carried no
          // such loadout read the pair as dead; it moves eight cells the moment
          // one is present. `thrust` and `guard` below it genuinely restate
          // what `reset()` did, and are kept because a rest pose stated in
          // parts is the shape that let the pointer pair look optional.
          intent[spare].pointerX = ACTION_TUNING.restPointerX;
          intent[spare].pointerY = ACTION_TUNING.restPointerY;
          intent[spare].roll = 0; intent[spare].wristBend = 0;
          intent[spare].thrust = false; intent[spare].guard = false;
        }
      }
      // The spare hand's *bend* is planned after the body response, never
      // before it. An empty covering fist therefore spends neither roll nor
      // bend on the acting hand's posture, and that order is observable in
      // every hold frame -- it is the order the scripted specialists were
      // measured against, so lifting this block above `applyActionPosture`
      // moves them.
      //
      // Its pointer is the one the cover above already placed. This block used
      // to call `actionCoverAt` a second time to recompute the identical
      // answer, and that superseded note is worth keeping rather than
      // deleting: a no-op recomputation changes nothing *except* when
      // something upstream has moved the pointer, in which case it silently
      // undoes it -- which is exactly how a mis-placed guard spread survived a
      // sweep. Neutralising the call moved no leaf of the 408-cell command
      // surface.
      const spare = hand === "primary" ? "secondary" : "primary";
      if ((name === "cover" || name === "cut" || name === "punch" || name === "recover") &&
          !view.self.hands[spare].lost && view.self.hands[spare].weapon === "empty") {
        intent[spare].roll = 0; intent[spare].wristBend = 0.08; intent[spare].guard = true;
      }
      // **The named hand leads a guard, and this is what makes naming one mean
      // anything.** Both defensive skills put a hand on the covering line and
      // then put the *other* hand on the same line, so `cover` executed on the
      // primary and `cover` executed on the secondary produced byte-identical
      // arm poses: measured, the whole difference between the two decisions was
      // the bookkeeping field `intent.actingHand`, and 24 bouts of each against
      // `swinger` on a `sword+shield` body agreed to the digit -- 294.7 damage
      // taken, 98.8 blocks, 18 deaths, both ways. A shield in the off hand could
      // therefore never lead a guard even when the decision named it. The
      // supporting hand steps outboard off the line the leader is holding, which
      // is `planOffHand`'s rule in `policies.ts`; `ACTION_TUNING.guardSpread`
      // carries the number and its table.
      //
      // Two exclusions, both deliberate, and both are conditions rather than
      // orderings. An **empty** supporting hand stays on the line -- a fist is
      // small and is already the nearest thing to it, which is what
      // `planOffHand` does with one, and it is the only case the scripted
      // parity sweep covers. `hasHeldWeapon` is exactly the complement of the
      // empty-fist block's own test, so the two never both fire and neither
      // depends on standing where it stands. **That was not true while the
      // fist block recomputed the pointer**: from above it, dropping this
      // exclusion would have been invisible, and the note here used to argue
      // the placement was what made the rule real. It is the condition that
      // makes it real, and
      // `only_the_two_defensive_skills_spread_the_supporting_hand` is what
      // holds it. And `cut` and `punch` are not here at all: their acting hand
      // is swinging rather than guarding, so there is no second guard for the
      // spare to be resting against -- widening this test to every action cost
      // a `sword+shield` fighter cutting `high` at `swinger` 157.8 damage a
      // bout against 81.9 over 24 bouts, and left all 537 tests green, which is
      // why the same test names them.
      if (DEFENSIVE_ACTIONS.includes(name) && !view.self.hands[spare].lost &&
          hasHeldWeapon(view.self.hands[spare].weapon)) {
        intent[spare].pointerX = actionCursorForAzimuth(
          actionAzimuthOf(intent[spare].pointerX, spare) +
            view.self.hands[spare].outboard * ACTION_TUNING.guardSpread, spare);
      }
      // The learned pose goes on last, over the skill's safe base. Anywhere
      // above `applyActionPosture` it is erased -- that function zeroes all
      // three axes on every call -- and anywhere below `boundIntent` it is
      // unbounded.
      applyTacticStance(view, stance, intent);
      boundIntent(intent);
      movement.forward = intent.forward; movement.strafe = intent.strafe; movement.turn = intent.turn;
      intent.forward = 0; intent.strafe = 0; intent.turn = 0;
      return intent;
    },
    done(view) {
      if (!attachedHand(view, hand)) return true;
      const age = Math.max(elapsed, view.clock - started);
      if (name === "cover") return age >= 0.30; if (name === "shoot") return shotComplete;
      if (name === "cut" || name === "punch") return strokePhase === "complete"; return age >= (name === "recover" ? 0.26 : 0.18);
    },
  };
}

export type ScriptedKind = "duelist" | "archer";
export interface ScriptedMetaMind extends Mind { readonly selected: OptionName; readonly entries: Readonly<Record<OptionName, number>> }
export function scriptedMetaMind(kind: ScriptedKind, seed = 0): ScriptedMetaMind {
  let state = seed >>> 0; const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0; let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  let current: FactorizedHandAction | null = null; let selected: OptionName = "recover"; let prefer: HandName = "primary";
  let chosenHand: HandName = "primary";
  let attackFinished = false;
  let quiet = 0; let cooldown = 0; let sinceOpening = 0; let patience = 2.40;
  let circle = 1; let circleLeft = 1.2; let gapRate = 0; let lastGap = -1; let openingNow = false;
  if (kind === "archer") quiet = random() * 0.30;
  else {
    cooldown = 0.30 + random() * 0.80; sinceOpening = random() * 2.40;
    patience = 2.40 * (0.80 + random() * 0.40);
    circle = random() < 0.5 ? -1 : 1; circleLeft = 1.2 + random();
  }
  const entries = Object.fromEntries(TACTIC_NAMES.map((n) => [n, 0])) as Record<OptionName, number>;
  const selectAttackHand = (view: FighterView): HandName => {
    const spare = otherHand(prefer); const able = (hand: HandName) =>
      !view.self.hands[hand].lost && isStriking(view.self.hands[hand].weapon);
    const steel = (hand: HandName) => able(hand) && hasHeldWeapon(view.self.hands[hand].weapon);
    if (steel(prefer)) return prefer; if (steel(spare)) return spare;
    if (able(prefer) && able(spare)) {
      const seen = threat(view).tip; const gap2 = (hand: HandName) => {
        const tip = view.self.hands[hand].tip; return (tip.x - seen.x) ** 2 + (tip.y - seen.y) ** 2 + (tip.z - seen.z) ** 2;
      };
      return gap2(prefer) >= gap2(spare) ? prefer : spare;
    }
    if (able(prefer)) return prefer; if (able(spare)) return spare;
    return view.self.hands[prefer].lost && !view.self.hands[spare].lost ? spare : prefer;
  };
  const choose = (view: FighterView): OptionName => {
    const distance = gap(view);
    if (kind === "archer") return handFor(view, isShooting) ? "shoot" : distance < 3.2 ? "disengage" : "cover";
    const attack = selectAttackHand(view); chosenHand = attack;
    if (view.self.hands[attack].lost || !isStriking(view.self.hands[attack].weapon)) return "cover";
    const bare = view.self.hands[attack].weapon === "empty";
    const strike = bare ? ACTION_TUNING.bareStrikeRange : 1.48 + (view.self.hands[attack].reach - ACTION_TUNING.tunedSwordReach);
    return cooldown <= 0 && distance <= strike && (openingNow || sinceOpening > patience)
      ? bare ? "punch" : "cut" : "cover";
  };
  return { name: `scripted-meta-${kind}`, get selected() { return selected; }, entries,
    decide(view, dt) {
      const step = Math.max(0, dt);
      // A fighter can lose both arms without satisfying the bout's death rule.
      // There is then no legal option object to enter -- even recover needs a
      // hand to pose -- so remain inert just as the learned and random meta
      // controllers do at the same terminal capability boundary.
      if (!Object.values(view.self.hands).some((candidate) => !candidate.lost)) {
        current = null; selected = "recover";
        return freshIntent();
      }
      if (kind === "duelist") {
        const seen = threat(view); const tipGap = Math.hypot(seen.tip.x - view.self.shoulder.x,
          seen.tip.y - view.self.shoulder.y, seen.tip.z - view.self.shoulder.z);
        if (lastGap >= 0 && step > 0) { const rate = (tipGap - lastGap) / step;
          gapRate += (rate - gapRate) * (1 - Math.exp(-12 * step)); }
        lastGap = tipGap;
        const blade = { x: seen.tip.x - seen.shoulder.x, y: seen.tip.y - seen.shoulder.y, z: seen.tip.z - seen.shoulder.z };
        const toward = { x: view.self.shoulder.x - view.opponent.shoulder.x,
          y: view.self.shoulder.y - view.opponent.shoulder.y, z: view.self.shoulder.z - view.opponent.shoulder.z };
        const inLine = (blade.x * toward.x + blade.y * toward.y + blade.z * toward.z) /
          ((Math.hypot(blade.x, blade.y, blade.z) || 1) * (Math.hypot(toward.x, toward.y, toward.z) || 1));
        openingNow = inLine < 0.30 || (seen.tipSpeed > 5 && gapRate > 0.6);
        sinceOpening = openingNow ? 0 : sinceOpening + step; cooldown -= step;
        circleLeft -= step; if (circleLeft <= 0) { circle = -circle; circleLeft = 1.2 + random(); }
      }
      const candidate = kind === "duelist" ? choose(view) : null;
      const interruptCover = current?.name === "cover" && candidate !== "cover";
      if (!current || current.done(view) || interruptCover) {
        selected = candidate ?? choose(view);
        if (kind === "duelist" && ["cut", "punch", "thrust"].includes(selected)) {
          patience = 2.40 * (0.80 + random() * 0.40); sinceOpening = 0;
        }
        // The hand search that used to happen inside the option, made this
        // caller's decision by name. `chooseEffector` is `requireHand`'s old
        // `[preferred, other]` order, so the specialists it is measured against
        // get the hand they always got -- and the option below now executes
        // exactly that hand rather than searching again.
        const effector = chooseEffector(view, selected as HandActionName, chosenHand);
        if (effector === null) throw new Error(`option "${selected}" requires an effector this body has`);
        current = handActionOption(selected as HandActionName, asMeasured(effector),
          kind === "archer" && selected === "shoot" ? quiet : 0);
        if (kind === "archer" && selected === "shoot") quiet = 0.30;
        current.enter(view);
        attackFinished = false; entries[selected] += 1;
      }
      const actionPart = current.decide(view, dt);
      const movementPart = freshIntent();
      movementPart.forward = current.movement.forward; movementPart.strafe = current.movement.strafe;
      movementPart.turn = current.movement.turn;
      if (kind === "duelist") {
        // A warrior publishes no natural attack, so every option this mind can
        // enter names a hand; the coalesce is what the type asks for and not a
        // case that fires.
        const attacker = actionPart.actingHand ?? chosenHand; const reach = view.self.hands[attacker].reach;
        const bare = view.self.hands[attacker].weapon === "empty";
        const hold = bare ? bareHoldDistance() : 1.40 + (reach - ACTION_TUNING.tunedSwordReach); const distance = gap(view);
        const crowd = bare ? bareCrowdDistance(reach) : 0.85;
        const feet = view.measure < crowd ? -0.8 : distance > hold + 0.06
          ? clampAction((distance - hold) * 1.6, 0, 1) : distance < hold - 0.06
            ? clampAction((distance - hold) * 1.6, -1, 0) : 0;
        movementPart.forward = movementPart.forward > 0 ? Math.max(feet, movementPart.forward) : feet;
        movementPart.strafe = circle * 0.55;
      }
      if (kind === "duelist" && !attackFinished && ["cut", "punch", "thrust"].includes(current.name) && current.done(view)) {
        cooldown = 0.30; prefer = otherHand(prefer); attackFinished = true;
      }
      const movement: MovementName = movementPart.strafe < 0 ? "circle-left" : movementPart.strafe > 0 ? "circle-right"
        : movementPart.forward > 0 ? "close" : movementPart.forward < 0 ? "disengage" : "hold";
      return composeTactic(view, movement, selected as HandActionName, movementPart, actionPart);
    },
  };
}

export interface CombatEvent {
  hand: HandName; weapon: Striker; damage: number; blocked: boolean;
  /** Optional only for old parity rows; factual evaluators always supply both. */
  at?: number; opportunityKey?: string; defending?: boolean; contactId?: string;
}
export interface BehaviourRecord {
  rangeBins: [number, number, number, number]; options: Record<OptionName, number>; transitions: Record<string, number>;
  attackAttempts: Record<OptionName, number>; contacts: Record<HandName, number>; contactsByKind: Partial<Record<Striker, number>>;
  blocks: number; crouchTime: number; trunkTwistSignChanges: number; damage: number; vitality: number; win: boolean; seconds: number;
  engagement: EngagementRecord; longestOptionOccupancySeconds: number;
  /** Private recorder state; durable reporters omit underscore-prefixed fields. */
  _engagement: EngagementTracker; _lastBlockAt: Record<string, number>; _blocksSeen: Set<string>;
}
/**
 * No non-test caller, and the reader is named rather than assumed.
 *
 * `evaluate-options.mjs` and `training-evaluator.mjs` were the two construction
 * sites and session 17 deleted both; the research path hand-rolls its own
 * `EngagementTracker` in `scripts/research-havok.mjs` instead. This survives
 * because session 18's `BoutRecorder` is built on exactly these three
 * recorders and drives them from both bout loops, which is the whole of that
 * session -- see `docs/plans/combat-followups-18-human-gate-feasibility.md`. If
 * that session lands without them, they go.
 */
export function behaviourRecord(): BehaviourRecord {
  const engagement = engagementRecord();
  const record = { rangeBins: [0, 0, 0, 0], options: Object.fromEntries(TACTIC_NAMES.map((n) => [n, 0])) as Record<OptionName, number>, transitions: {},
    attackAttempts: Object.fromEntries(TACTIC_NAMES.map((n) => [n, 0])) as Record<OptionName, number>, contacts: { primary: 0, secondary: 0 }, contactsByKind: {},
    blocks: 0, crouchTime: 0, trunkTwistSignChanges: 0, damage: 0, vitality: 1, win: false, seconds: 0,
    engagement, longestOptionOccupancySeconds: 0 } as BehaviourRecord;
  Object.defineProperties(record, {
    _engagement: { value: new EngagementTracker(engagement), enumerable: false },
    _lastBlockAt: { value: {}, enumerable: false },
    _blocksSeen: { value: new Set<string>(), enumerable: false },
  });
  return record;
}
export function recordCombatEvent(record: BehaviourRecord, event: CombatEvent): void {
  if (!event.defending) {
    record.contacts[event.hand] += 1; record.contactsByKind[event.weapon] = (record.contactsByKind[event.weapon] ?? 0) + 1;
    record.damage += event.damage;
  }
  if (event.blocked) {
    const key = `${event.hand}:${event.weapon}`; const previous = record._lastBlockAt[key] ?? -Infinity;
    const unseen = event.contactId === undefined || !record._blocksSeen.has(event.contactId);
    const separated = event.contactId !== undefined || event.at === undefined || event.at - previous >= 0.20;
    if (unseen && separated) {
      record.blocks += 1;
      if (event.contactId !== undefined) record._blocksSeen.add(event.contactId);
      if (event.at !== undefined) record._lastBlockAt[key] = event.at;
    }
  }
  if (event.at !== undefined) {
    const factualKey = event.weapon === "bite" ? "natural:bite"
      : `hand:${event.hand}:${event.weapon === "arrow" ? "bow" : event.weapon}`;
    record._engagement.contact(event.opportunityKey ?? factualKey, event.at, event.damage);
  }
}
export function recordIntentAttack(record: BehaviourRecord, view: FighterView, intent: Intent,
  previous: { thrust?: Record<HandName, boolean>; guard?: Record<HandName, boolean>; natural?: boolean }): void {
  previous.thrust ??= { primary: false, secondary: false };
  previous.guard ??= { primary: false, secondary: false };
  previous.natural ??= false;
  const opportunities = attackOpportunity(view).filter((row) => row.viable);
  for (const row of opportunities) {
    if (row.key.startsWith("natural:")) {
      // The natural channel, not `primary`. This read the primary hand's button
      // on a body that publishes no hands, which was the alias itself: the
      // exception lived here as a comment and in `Centipede.update` as a fact.
      if (intent.natural.thrust && !previous.natural) record._engagement.attack(row.key, view.clock);
      continue;
    }
    const [, handName] = row.key.split(":"); const hand = handName as HandName;
    const shot = row.striker === "bow" && previous.thrust[hand] && !intent[hand].thrust;
    const committed = row.striker !== "bow" && ((intent[hand].thrust && !previous.thrust[hand]) ||
      (previous.guard[hand] && !intent[hand].guard));
    if (shot || committed) record._engagement.attack(row.key, view.clock);
  }
  for (const hand of HANDS) { previous.thrust[hand] = intent[hand].thrust; previous.guard[hand] = intent[hand].guard; }
  previous.natural = intent.natural.thrust;
}
export function recordBehaviourSample(record: BehaviourRecord, view: FighterView, option: OptionName | null, dt: number,
  previous: { option?: OptionName | null; twistSign?: number; optionSince?: number }): void {
  const bin = view.measure < 0.7 ? 0 : view.measure < 1.2 ? 1 : view.measure < 1.8 ? 2 : 3; record.rangeBins[bin] += dt;
  if (option) record.options[option] += dt;
  record._engagement.sample(view, dt);
  if (option && previous.option !== option && ATTACK_OPTION_NAMES.includes(option)) {
    record.attackAttempts[option] += 1;
    const matching = attackOpportunity(view).filter((row) => row.viable && (
      option === "shoot" ? row.striker === "bow" : option === "bite" ? row.key === "natural:bite"
        : option === "punch" ? row.striker === "empty"
        : option === "cut" ? row.striker !== "empty" && row.striker !== "bow" : true));
    for (const row of matching) record._engagement.attack(row.key, view.clock);
  }
  if (option && previous.option && previous.option !== option) { const key = `${previous.option}->${option}`; record.transitions[key] = (record.transitions[key] ?? 0) + 1; }
  if (option !== previous.option) {
    if (previous.option !== undefined && previous.optionSince !== undefined) {
      record.longestOptionOccupancySeconds = Math.max(record.longestOptionOccupancySeconds, view.clock - previous.optionSince);
    }
    previous.optionSince = view.clock;
  } else if (option && previous.optionSince !== undefined) {
    record.longestOptionOccupancySeconds = Math.max(record.longestOptionOccupancySeconds, view.clock + dt - previous.optionSince);
  }
  const sign = Math.sign(view.self.trunkTwist); if (previous.twistSign && sign && previous.twistSign !== sign) record.trunkTwistSignChanges += 1;
  previous.option = option; if (sign) previous.twistSign = sign; record.crouchTime += view.self.crouch * dt; record.vitality = view.self.vitality; record.seconds += dt;
}
