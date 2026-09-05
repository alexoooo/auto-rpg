// Explicit `.ts` extensions, and this file is the reason the convention exists
// as much as it is a follower of it: `tests/bout.test.mjs` imports this module
// directly under Node, with no DOM and no Babylon anywhere in its graph. The
// only value import here is `config.ts`, which imports nothing at all; `Side`
// and `HitKind` are types and erase. Nothing in this file may become a value
// import from a module that touches Babylon without moving the test with it.
import { CONFIG } from "./config.ts";
// `hands.ts` imports nothing at all, which is the only reason this file may have
// it: `tests/bout.test.mjs` runs this module under Node with no DOM and no
// Babylon anywhere in its graph, and that property is not negotiable.
import { handsFor, isWeaponKind, type WeaponKind } from "./hands.ts";
import type { Side } from "./physics.ts";
import type { HitKind } from "./scoring.ts";

/**
 * The bout, as state and rules rather than as wiring.
 *
 * `src/main.ts` renders what is in here and owns every Babylon object in the
 * arena; this file owns what a bout *is* -- who is fighting whom, which of the
 * three phases it is in, when it is finished and who won. The split is the same
 * one `src/scoring.ts` already earns its keep with, and for the same reason:
 * "when does a fight end" is a rule worth arguing with, and an argument you can
 * only have by starting a browser and waiting ninety seconds is an argument
 * nobody has.
 *
 * Everything here is plain data and pure functions. The transitions return a new
 * state rather than mutating one, so a test can hold both sides of a transition
 * at once and so a transition that was refused is visibly the same object it was
 * handed.
 */

/**
 * Where a bout is.
 *
 * `select` is the screen, `fight` is the arena, and `over` is a fight that has
 * been decided. `over` deliberately does **not** stop the world: the fighters go
 * on being driven by their minds and the solver goes on solving, and all that
 * changes is what the banner says and where `R` takes you. Freezing would need
 * either a branch in `Fighter` for "the bout is over" -- which is the same shape
 * of branch as "is this one the player", and the whole point of the seam is that
 * there is not one -- or a keyframed torso left holding its last velocity, which
 * would slide it across the arena forever.
 *
 * Because `over` keeps a world, it is a phase you can **pause**, and that is not
 * a detail: it used to be the one phase where `Space` meant something else, and
 * the something else was "throw this bout away". See `pauseAction`.
 */
export type Phase = "select" | "fight" | "over";

/** What `Space` (and `Esc`, and the Resume button) does from where you are. */
export type PauseAction = "pause" | "resume" | "nothing";

/**
 * The pause rule, which is a rule and therefore lives here.
 *
 * It is a **mode inside a live arena**, and the only question worth asking is
 * whether there is an arena and whether it is running. Both `fight` and `over`
 * have one -- `over` does not stop the world, see `Phase` -- so both pause and
 * both resume. `select` has no bodies in an arena at all, so `Space`
 * there is honestly nothing rather than a no-op that pretends.
 *
 * **It never returns a phase.** The bug this replaces was a hook that changed
 * the phase on its way past: from `over`, `Space` ran `toSelect`, which put you
 * on the selector -- "the game is gone" -- and from `select` the resume branch
 * was then unreachable forever, so `Space` was dead -- "pause doesn't un-pause".
 * The host now presents that state as a compact overlay while continuing to
 * render the frozen arena; presentation still never changes this rule.
 * Leaving a bout is the pause overlay's Setup action; a key that pauses and an
 * action that abandons must not be the same action.
 */
export function pauseAction(phase: Phase, running: boolean): PauseAction {
  if (phase === "select") return "nothing";
  return running ? "pause" : "resume";
}

/** Whether a side reads a policy or a person. */
export type Control = "mind" | "you";

/** One corner of the setup screen. */
/**
 * What a hand can be given, and what the picker offers.
 *
 * Same `{ name, label }` shape as `UNITS` and `POLICIES`, because `setup.ts`
 * builds every `select` from one of these and an option that is offered is then
 * provably an option the code has.
 *
 * `name` is a `WeaponKind` rather than a `string`, which makes the guarantee run
 * the other way too: an entry the code does *not* have will not compile. What
 * the type cannot say is that every kind appears, so `tests/bout.test.mjs`
 * checks this against `WEAPON_KINDS` -- and that is the reader that list spent
 * three sessions without.
 */
export const EQUIPMENT: readonly { name: WeaponKind; label: string }[] = [
  { name: "sword", label: "Sword" },
  { name: "axe", label: "Axe" },
  { name: "bow", label: "Bow (two-handed)" },
  { name: "shield", label: "Shield" },
  { name: "buckler", label: "Buckler" },
  { name: "club", label: "Club (two-handed)" },
  { name: "empty", label: "Bare fist" },
];

/**
 * One effector socket's pick: a chain from the ladder and a terminal on the end of it.
 *
 * Two strings and not one, because the overview's whole design for an effector is that the chain
 * and the terminal are chosen **independently** -- the chain owns motion and the terminal owns
 * what is on the end, and a single id would be a picker offering a fixed shelf of pairs somebody
 * had to write down. `"none"` is the terminal of a chain that carries its own cap; see
 * `NO_TERMINAL` in `src/golem/build.ts`, which is where the legal pairs live.
 */
export interface GolemEffectorSetup {
  chain: string;
  terminal: string;
}

/**
 * A golem corner: one module id per slot of the fixed five-slot body plan.
 *
 * Plain strings, and declared here rather than beside the modules, for exactly the reason the
 * comment at the top of this file gives: `tests/bout.test.mjs` runs this module under Node with no
 * DOM and no Babylon anywhere in its graph, and `src/golem/` is Babylon from its first import. The
 * *rules* about a build -- which pairs exist, which slot a two-socket terminal spends -- live in
 * `src/golem/build.ts` beside the definitions they are about; what lives here is the shape a
 * matchup carries and the reducers a screen edits it through.
 *
 * A `UnitLoadout` is what fills a Warrior's two hands, and this is what replaces it for a golem:
 * a golem has no held equipment at all, because a golem's weapons are its body. Modding the unit
 * is choosing equipment.
 */
export interface GolemSetup {
  locomotion: string;
  torso: string;
  head: string;
  primary: GolemEffectorSetup;
  secondary: GolemEffectorSetup;
}

/** Which of a golem's slots a reducer is being pointed at. */
export type GolemSlotName = "locomotion" | "torso" | "head";

export interface SideSetup {
  /** Which body. One kind for now; see `UNITS`. */
  unit: string;
  /** Which policy, by `Policy.name` in `mind.ts`. */
  policy: string;
  control: Control;
  /** The primary hand -- the one the mouse starts on. */
  handA: string;
  /** The secondary. `empty` is a choice rather than an absence. */
  handB: string;
  /**
   * The five-slot build, for a unit that is assembled rather than equipped.
   *
   * Optional, and absent for every unit that has hands: a Warrior's two pickers say what it is
   * carrying and a golem's five say what it is *made of*, and a field that was present-but-ignored
   * on three quarters of the registry would be a field nothing reads on the bodies that have it.
   * `withUnit` installs the unit's own default when a corner becomes a golem.
   */
  golem?: GolemSetup;
}

const copyGolem = (setup: GolemSetup): GolemSetup => ({
  locomotion: setup.locomotion,
  torso: setup.torso,
  head: setup.head,
  primary: { ...setup.primary },
  secondary: { ...setup.secondary },
});

export interface Matchup {
  left: SideSetup;
  right: SideSetup;
}

/**
 * The pure part of a unit definition needed when its picker row is selected.
 *
 * `units.ts` also owns meshes and Babylon builders, so this module cannot
 * import that registry without giving up its DOM-free, engine-free test graph.
 * The setup screen already has the definition in hand and passes this narrow
 * structural view across the boundary instead.
 */
export interface UnitSelectionRules {
  readonly loadouts: readonly {
    readonly primary: string;
    readonly secondary: string;
  }[];
  readonly defaultLoadout: {
    readonly primary: string;
    readonly secondary: string;
  };
  /** Null means every policy is compatible. */
  readonly compatiblePolicies: readonly string[] | null;
  readonly defaultPolicy: string;
  /**
   * The build a corner gets when it becomes this unit, or absent for a unit that is not assembled.
   *
   * The golem's answer to `defaultLoadout`, and it arrives through the same narrow structural view
   * for the same reason: `units.ts` owns meshes and Babylon builders and this module cannot import
   * it without giving up its engine-free test graph, so the screen passes the definition's own
   * answer across the boundary rather than the definition.
   */
  readonly defaultGolem?: GolemSetup;
}

/**
 * The units on offer.
 *
 * One of them, and it is still a list feeding a `select` rather than a label,
 * because the day there are two the control that has to change is the one that
 * already exists -- and because a label is a promise that the choice does not
 * matter, which is not what is meant here.
 */
/**
 * What the screen opens on.
 *
 * The left side is yours. The plan's sketch of the screen draws both sides on
 * `mind`, and this deliberately differs: the page as it stands hands you the
 * left fighter the moment you press the button, and a session that adds a screen
 * should not also quietly take the sword away. Choosing `mind` on the left is one
 * click, and the idle-versus-idle pairing the plan asks for is two.
 */
export function defaultMatchup(): Matchup {
  return {
    // A sword and an empty hand, which is what every fighter carried before
    // there was a choice -- so the default matchup is the body every number in
    // `docs/measurements.md` was taken from, and a bout opened without touching
    // the pickers is still that measurement's bout.
    left: { unit: "warrior", policy: "idle", control: "you", handA: "sword", handB: "empty" },
    right: { unit: "warrior", policy: "idle", control: "mind", handA: "sword", handB: "empty" },
  };
}

/** Which side the person is on, or null when two policies are fighting. */
export function humanSide(matchup: Matchup): Side | null {
  if (matchup.left.control === "you") return "left";
  if (matchup.right.control === "you") return "right";
  return null;
}

const other = (side: Side): Side => (side === "left" ? "right" : "left");

const copySide = (side: SideSetup): SideSetup => ({
  ...side,
  ...(side.golem ? { golem: copyGolem(side.golem) } : {}),
});

const copy = (matchup: Matchup): Matchup => ({
  left: copySide(matchup.left),
  right: copySide(matchup.right),
});

export function withUnit(
  matchup: Matchup,
  side: Side,
  unit: string,
  rules?: UnitSelectionRules,
): Matchup {
  const next = copy(matchup);
  next[side].unit = unit;
  if (rules !== undefined) {
    const loadoutIsAllowed = rules.loadouts.some((loadout) =>
      loadout.primary === next[side].handA && loadout.secondary === next[side].handB
    );
    if (!loadoutIsAllowed) {
      next[side].handA = rules.defaultLoadout.primary;
      next[side].handB = rules.defaultLoadout.secondary;
    }
    // A build, on the other hand, is not a saved user choice about *this* unit: a golem's five
    // slots mean nothing to a Warrior and a Warrior's two hands mean nothing to a golem, so a
    // corner that becomes an assembled unit is given that unit's own default and a corner that
    // stops being one keeps its build in case it comes back. The asymmetry with the policy above
    // is the point -- a policy names something both bodies could have, and a build does not.
    if (rules.defaultGolem && !next[side].golem) next[side].golem = copyGolem(rules.defaultGolem);
    // A policy is a saved user choice, not body repair. An incompatible one
    // remains visible and blocks Fight until the player chooses a real driver.
  }
  return next;
}

/**
 * Put one module in one of a golem's three single-socket slots.
 *
 * Refused, by returning exactly the matchup it was handed, for a corner that is not an assembled
 * unit at all. A screen cannot offer this control for a Warrior and a harness that reached for it
 * would be asking a body with two hands which torso it would like.
 */
export function withGolemSlot(
  matchup: Matchup,
  side: Side,
  slot: GolemSlotName,
  id: string,
): Matchup {
  if (!matchup[side].golem) return matchup;
  const next = copy(matchup);
  const build = next[side].golem;
  if (!build) return matchup;
  build[slot] = id;
  return next;
}

/**
 * Put a chain and a terminal in one of a golem's two effector sockets.
 *
 * **The two-socket rule lives here, and it is the club's rule with a different subject.** A mace
 * is one weapon that claims both effector sockets, exactly as a club is one weapon that takes both
 * hands -- so choosing a two-socket terminal in either socket fills both, and choosing anything
 * else in a socket whose partner is holding half a mace moves that partner onto the pair being
 * chosen. It moves rather than emptying, which is where this parts company with the hand rule:
 * `empty` is a real thing to hold and a golem has no empty socket -- every socket carries a
 * module, and the nearest thing to nothing is rung 0's capped socket, which is a choice somebody
 * makes rather than a fallback. `withEquipment` above states the same rule for hands and says why it is here
 * rather than in the DOM: the screen re-reads the whole matchup after every change precisely
 * because a change to one control can legitimately move another.
 *
 * `twoSocket` is passed in rather than looked up, for the reason the whole file is written this
 * way: which terminals claim two sockets is a fact about `src/golem/`, and this module may not
 * import it without dragging Babylon into a test graph that has none. `src/setup.ts` and
 * `src/golem/build.ts` are where the predicate comes from, and `golemSetupRefusal` states the same
 * rule again where a build that never went near a screen is checked.
 */
export function withGolemEffector(
  matchup: Matchup,
  side: Side,
  socket: "primary" | "secondary",
  pick: GolemEffectorSetup,
  twoSocket: (pick: GolemEffectorSetup) => boolean,
): Matchup {
  if (!matchup[side].golem) return matchup;
  const next = copy(matchup);
  const build = next[side].golem;
  if (!build) return matchup;
  const other = socket === "primary" ? "secondary" : "primary";
  build[socket] = { ...pick };
  if (twoSocket(pick)) build[other] = { ...pick };
  else if (twoSocket(build[other])) build[other] = { ...pick };
  return next;
}

export function withPolicy(matchup: Matchup, side: Side, policy: string): Matchup {
  const next = copy(matchup);
  next[side].policy = policy;
  return next;
}

/**
 * Choosing who you are, which is also choosing who you are not.
 *
 * There is one of you, so taking a side gives the other one back to its policy.
 * Two radio groups cannot say that on their own -- each only knows its own two
 * buttons -- so the rule lives here where it can be tested, and the screen
 * re-reads both groups from the answer. Letting the DOM own it instead is how
 * you get a setup screen that offers two humans and an arena that has one.
 */
/**
 * Put something in a hand.
 *
 * The club is one weapon and takes two hands, so choosing it in either hand
 * fills both, and choosing anything else in a hand that was holding half a club
 * empties the other. The rule lives here rather than in the DOM for exactly the
 * reason "there is one of you" does: `setup.ts` re-reads the whole screen from
 * the matchup after every change, precisely because a change to one control can
 * legitimately move another.
 *
 * `Fighter` enforces the same rule again when it builds a body, because a
 * harness that makes a fighter directly never goes near this screen.
 */
export function withEquipment(
  matchup: Matchup,
  side: Side,
  hand: "handA" | "handB",
  kind: string,
): Matchup {
  const next = copy(matchup);
  const other = hand === "handA" ? "handB" : "handA";
  next[side][hand] = kind;
  // "It takes two hands", asked of the table rather than spelled as the name of
  // the one kind that does today. The prose above says two-handed and the code
  // said `club`, which is the shape of every other hole this session closed.
  const twoHanded = (k: string) => isWeaponKind(k) && handsFor(k) === 2;
  if (twoHanded(kind)) next[side][other] = kind;
  else if (twoHanded(next[side][other])) next[side][other] = "empty";
  return next;
}

export function withControl(matchup: Matchup, side: Side, control: Control): Matchup {
  const next = copy(matchup);
  next[side].control = control;
  if (control === "you") next[other(side)].control = "mind";
  return next;
}

/**
 * Taking a body in the middle of a bout.
 *
 * It is `withControl` and nothing else, which is the point rather than a
 * shortcut. Who is driving which fighter is already a property of the matchup --
 * it is what the setup screen edits, what `humanSide` answers, and what
 * `main.ts` reads to decide whom the camera follows, which body the aim
 * indicator draws for and which pair `Targeting` is pointed at. Stepping into a
 * body mid-fight is the same fact arriving through a different door, so it is
 * the same field, and everything downstream retargets without being told.
 *
 * Two consequences worth stating because they are load-bearing rather than
 * incidental. There is one of you, so `withControl` gives the body you left back
 * to `mind` in the same breath -- the arena never has to work out who was
 * displaced, because the matchup has already said. And the change persists past
 * the bout: `restart` keeps the matchup and `toSelect` carries it back to the
 * screen, so a bout you fought out from the right-hand body opens the screen
 * again with the right-hand body yours. That is the same argument `toSelect`
 * already makes for keeping the matchup at all -- the thing you want after a
 * bout is the same bout again -- applied to a choice you made with a click
 * instead of with a radio button.
 *
 * Refused from the screen, by returning exactly the state it was handed. There
 * is no body to take there, the radio buttons already own the same field, and a
 * takeover armed behind the curtain would be a click on a fighter nobody can
 * see. `over` is allowed: a decided bout deliberately does not stop the world --
 * see `Phase` -- so there are still two bodies being driven, and refusing to let
 * somebody pick one up while the verdict is on screen would be a rule invented
 * to protect a banner.
 */
export function takeBody(state: BoutState, side: Side): BoutState {
  if (state.phase === "select") return state;
  return { ...state, matchup: withControl(state.matchup, side, "you") };
}

/**
 * The part of a `Limb` the rules read. `Limb` satisfies it structurally, so
 * `Fighter.limbs` is handed straight in and there is no per-frame projection
 * between the body and the rule that decides it is finished.
 */
export interface PartState {
  key: string;
  health: number;
  maxHealth: number;
  severed: boolean;
  readonly vitalityWeight?: number;
  readonly fatal?: boolean;
}

/**
 * The part of a `HitReport` the ending reads, declared here rather than imported
 * so that nothing in this module's graph reaches Babylon. `HitReport` satisfies
 * it, and `tests/bout.test.mjs` can write one out by hand in four fields instead
 * of building three `Vector3`s it would never look at.
 */
export interface Blow {
  by: Side;
  /** The limb's label, as the readout spells it: "Head", "Sword arm". */
  limb: string;
  kind: HitKind;
  /** Speed of the blade at the contact point, m/s. */
  speed: number;
  /** Simulation time it landed at. */
  at: number;
}

/** One side of the ring as the rules see it. */
export interface SideState {
  parts: readonly PartState[];
  /** The last blow *this* side landed, which is what names it if it wins. */
  lastBlow: Blow | null;
}

export interface Ring {
  left: SideState;
  right: SideState;
}

/** How a bout finished. */
export type Ending = "exhausted" | "time";

export interface Outcome {
  /** Null is a draw. */
  winner: Side | null;
  ending: Ending;
  /** The blow that landed it, when there is one to name. */
  blow: Blow | null;
  /** The sentence the banner shows, built here so a test can argue with it. */
  text: string;
}

export interface BoutState {
  phase: Phase;
  matchup: Matchup;
  /** Simulation seconds since this bout began. Only runs while fighting. */
  clock: number;
  /** Set exactly when the phase becomes `over`, and cleared by every way out. */
  outcome: Outcome | null;
}

/**
 * Whether a body is finished.
 *
 * Exhaustion is one weighted reading of every local wound. A ruined head or
 * torso spends the whole bar; no single limb does, but serious injuries across
 * the body can. Severing and disability still read the local fields directly.
 */
export const VITAL_WEIGHT: Readonly<Record<string, number>> = CONFIG.body.vitalWeight;

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

function vitalWeight(key: string): number {
  if (!Object.prototype.hasOwnProperty.call(VITAL_WEIGHT, key)) {
    throw new Error(`unknown vital part "${key}"`);
  }
  return VITAL_WEIGHT[key];
}

/**
 * What the one whole-body bar reads.
 *
 * Local health remains authoritative for severing and disabled limbs; this is
 * only their anatomical consequence, derived afresh so there is no second hit
 * point pool for callers to keep in sync. A disposed fighter has no body to
 * judge and reads full rather than becoming dead through an empty sum.
 */
export function vitality(parts: readonly PartState[]): number {
  if (parts.length === 0) return 1;
  let injury = 0;
  for (const part of parts) {
    const weight = part.vitalityWeight ?? vitalWeight(part.key);
    if (!Number.isFinite(part.maxHealth) || part.maxHealth <= 0) {
      throw new Error(`invalid maxHealth for vital part "${part.key}"`);
    }
    if (!Number.isFinite(part.health)) {
      throw new Error(`invalid health for vital part "${part.key}"`);
    }
    const ratio = part.health / part.maxHealth;
    if (!Number.isFinite(ratio)) {
      throw new Error(`invalid health ratio for vital part "${part.key}"`);
    }
    const fraction = clamp(ratio, 0, 1);
    injury += (1 - fraction) * weight;
  }
  return clamp(1 - injury, 0, 1);
}

export function beaten(parts: readonly PartState[]): boolean {
  return parts.length > 0 && (
    parts.some((part) => part.fatal === true && (part.severed || part.health <= 0)) ||
    vitality(parts) === 0
  );
}

const KIND_NOUN: Record<HitKind, string> = {
  crush: "crushing blow",
  cut: "cut",
  thrust: "thrust",
  slap: "flat",
  weak: "shove",
};

/**
 * What the end of a bout is called.
 *
 * The winner and how, from the report of the blow that landed it, because a
 * fight that ends with a number on a bar teaches nothing, so exhaustion retains
 * the final blow and names where and how it landed.
 *
 * Plain ASCII with no markup: it is a rule's answer and the screen's business
 * what to do with it. `main.ts` puts it in the banner beside text that does
 * carry entities, which is why there is no dash in here to get wrong.
 */
export function verdict(winner: Side | null, ending: Ending, blow: Blow | null): string {
  if (ending === "time") {
    return `a draw: neither could finish it inside ${CONFIG.bout.capSeconds} s`;
  }
  if (!winner) return "a draw: both were exhausted together";
  if (!blow) return `${winner}, left standing as the other was exhausted`;
  const noun = KIND_NOUN[blow.kind];
  const where = blow.limb.toLowerCase();
  return `${winner}, as the other was exhausted by a ${noun} to the ${where} at ${blow.speed.toFixed(1)} m/s`;
}

/**
 * Whether the fight is over yet, and what to call it if so. Null while it is on.
 *
 * The cap is a draw whatever the state of the two bodies, and that is a decision
 * rather than an omission. Deciding a fight on accumulated damage means writing
 * a scoring rule, and a scoring rule invented in passing by the function that
 * needed a tie-break quietly becomes the balance of the game. `scoring.ts` is
 * where such a rule would belong, with a test, on the day somebody wants one.
 *
 * Both sides finished on the same step is a draw for the same reason: there is
 * no honest way to order two things that happened in one solver step, and
 * picking the left one because it is checked first is exactly the sort of
 * accident that ends up being called a rule.
 */
export function settle(ring: Ring, clock: number): Outcome | null {
  const leftDown = beaten(ring.left.parts);
  const rightDown = beaten(ring.right.parts);

  if (leftDown || rightDown) {
    const winner: Side | null = leftDown === rightDown ? null : leftDown ? "right" : "left";
    const blow = winner ? ring[winner].lastBlow : null;
    return { winner, ending: "exhausted", blow, text: verdict(winner, "exhausted", blow) };
  }

  if (clock >= CONFIG.bout.capSeconds) {
    return { winner: null, ending: "time", blow: null, text: verdict(null, "time", null) };
  }

  return null;
}

/** The screen, with a matchup on it. */
export function selectScreen(matchup: Matchup): BoutState {
  return { phase: "select", matchup, clock: 0, outcome: null };
}

/**
 * The Fight button.
 *
 * Takes the matchup from the screen rather than from the state it is handed,
 * because the screen is what the player has been editing and the state is only
 * where the last bout's copy of it was kept. Refused -- by returning exactly the
 * state it was given -- from anywhere but the screen, so that a click on a
 * button that says "Resume" cannot silently start a different fight.
 */
export function begin(state: BoutState, matchup: Matchup): BoutState {
  if (state.phase !== "select") return state;
  return { phase: "fight", matchup, clock: 0, outcome: null };
}

/**
 * `R` during a fight: the same bout again, from nothing.
 *
 * `Space` did this until `Space` became the pause, which is what a key beside
 * the thumb is for once you are driving a body rather than watching one. The
 * behaviour is unchanged and it is kept because it is the key you press when you
 * have made a mess of a limb and want to try the cut again. `main.ts` rebuilds
 * both fighters beside this; the clock going back to zero is this function's
 * whole share of it.
 */
export function restart(state: BoutState): BoutState {
  if (state.phase === "select") return state;
  return { phase: "fight", matchup: state.matchup, clock: 0, outcome: null };
}

/**
 * Back to the screen with the same matchup selected, because the thing you want
 * after a bout is usually the same bout again.
 *
 * Reached by the Setup button in the pause overlay. **Not by `Space`**, which it
 * used to be: a decided bout still has two bodies standing
 * in an arena, so it has something to pause, and a `Space` that threw them away
 * instead is the pause bug. See `pauseAction`.
 */
export function toSelect(state: BoutState): BoutState {
  if (state.phase === "select") return state;
  return selectScreen(state.matchup);
}

/**
 * One frame of the rules.
 *
 * Only the fight phase has a clock, so this is the one place time passes and the
 * one place a bout can end. `dt` is the rendered frame's delta rather than the
 * solver's substep, which is the same clock `Combat` stamps its reports with --
 * so `Outcome.blow.at` and `BoutState.clock` are comparable, which they would not
 * be if this counted substeps.
 */
export function advance(state: BoutState, ring: Ring, dt: number): BoutState {
  if (state.phase !== "fight") return state;
  const clock = state.clock + dt;
  const outcome = settle(ring, clock);
  if (!outcome) return { ...state, clock };
  return { ...state, clock, phase: "over", outcome };
}
