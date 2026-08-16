// The loadout picker: two fighters, a seed, and the rules about which pairs of
// them exist at all.
//
// **Built against session 04's constraints in the session before it.** The
// failure this avoids is 04 inheriting a control that cannot express its own
// rules -- a picker that offers an empty-handed fighter is a picker whose only
// honest answer to [Run selected fight] is a `CombatSpecError` from Rust, arriving after the
// reader has already committed. Two rules are decided by code that is already
// written, so they are encoded here rather than discovered later:
//
//   - `Loadout.primary` is an `ActionKind` and not an `Option<ActionKind>`
//     (`crates/sim/src/loadout.rs`), so `loadout.slot(0)` is always `Some`, and
//     `validate_rows` (`crates/sim/src/combat/spec.rs`) returns
//     `LoadoutMismatch` for any slot where the articulated row and the loadout
//     disagree about whether something is there. Both hands empty is therefore
//     not a fighter this simulation can build, and the refusal says that rather
//     than saying "invalid".
//   - `learned` had no browser inference path when this file was written, so it
//     was refused for a live fight and offered only for a recorded one. **That
//     is over**: v2-ui-08 split an inference-only `learn-core`, landed policy
//     code 4 and shipped `checkpoints/v2-probe.ckpt` at a URL, and v2-ui-07
//     wired the fetch. Every policy now runs live. What is left of the old
//     rule is a *note* rather than a refusal -- the weights are a fetch, and a
//     fetch can fail in ways the other four cannot.
//
// A third rule is visible in the same Rust and deliberately not encoded yet: the
// equipment table binds each action to a hand (`Sword` right, `Shield` left,
// `Club` right at `spec.rs:522`), so a sword in the left hand is a pairing
// session 04 will have to either honour or widen. It is left alone here because
// this session cannot test the answer, and a guess would be a rule a reader
// could not act on.
//
// Everything that decides is a pure function over a `Matchup`, so sessions 04
// and 07 can reuse it and a test can call it with no DOM at all.

import type { FightHeader } from "../fight/source.js";
import type { BodyInfo } from "../fight/trace.js";
import {
  ANATOMY_CODES, ARENA_MAX_TICKS, HAND_ITEMS, SHIPPED_SPAWNS, policyCodeOf,
  type ArenaConfig,
} from "../runtime/arena-config.js";

/** The anatomies the template offers, as `BodyInfo.kind` lowercased. */
const ANATOMIES = ["fighter", "brute"] as const;
export type AnatomyCode = (typeof ANATOMIES)[number];

/** What a hand can hold, as `Carried.action` lowercased, plus nothing. */
const HANDS = ["empty", "sword", "shield", "club"] as const;
export type HandCode = (typeof HANDS)[number];

export interface PolicyOption {
  /** The code session 05 lands, and the token `lab trace` writes into a header. */
  readonly code: string;
  readonly label: string;
  /** Whether the live articulated driver can run it. See the header note. */
  readonly live: boolean;
  /**
   * Whether running it live needs a file this build has to fetch first.
   *
   * True of `learned` and of nothing else. A trained fighter is a kind *plus
   * fifteen kilobytes of weights*, and the weights are deliberately not compiled
   * into the wasm -- so this option can fail for a reason the other four cannot,
   * and the picker says so before the button is pressed rather than after.
   */
  readonly fetches?: string;
}

/**
 * The six policies, in append-only code order.
 *
 * The labels carry the constraint rather than a tooltip carrying it, because a
 * disabled-looking option a reader has to hover to understand is an option they
 * will assume is broken.
 */
export const POLICIES: readonly PolicyOption[] = [
  { code: "neutral", label: "neutral", live: true },
  { code: "composed", label: "composed", live: true },
  { code: "windmill", label: "windmill", live: true },
  { code: "attack-moves", label: "attack-moves", live: true },
  { code: "learned", label: "learned (fetches a checkpoint)", live: true, fetches: "/checkpoints/v2-probe.ckpt" },
  { code: "tactical", label: "tactical", live: true },
  { code: "openings", label: "openings (aims off the shield)", live: true },
];

export type PolicyCode = string;

/** Which arena context is asking for checkpoint and validation copy. */
export type FightMode = "recording" | "live";

/** Why a checkpoint matters in each of the arena's two independent contexts. */
export function checkpointCopy(mode: FightMode): string {
  return mode === "live"
    ? "Live learned fighter: loads checkpoints/v2-probe.ckpt and runs those weights."
    : "Recorded fight: playback does not run AI; the digest identifies the weights used "
      + "when the recording was made.";
}

export interface SideChoice {
  readonly anatomy: AnatomyCode;
  readonly left: HandCode;
  readonly right: HandCode;
  /**
   * The right hand's item held in both hands, `GripBinding::Both`. The rules
   * about which pairings exist are the module's, restated by `review` so the
   * refusal arrives before the button is pressed: a full right hand, an empty
   * left one, and never a shield.
   */
  readonly twoHanded: boolean;
  readonly policy: PolicyCode;
}

export interface Matchup {
  readonly a: SideChoice;
  readonly b: SideChoice;
  readonly seed: number;
}

/** The two rows as the template labels them, so a refusal names a control. */
const SIDE_LABELS = ["Fighter A", "Fighter B"] as const;

function sides(matchup: Matchup): readonly (readonly [string, SideChoice])[] {
  return [[SIDE_LABELS[0], matchup.a], [SIDE_LABELS[1], matchup.b]];
}

export interface Review {
  /** The one sentence that stops the fight, or null when it can go ahead. */
  readonly refusal: string | null;
  /** True of the matchup and worth knowing, but not disqualifying. */
  readonly notes: readonly string[];
}

/**
 * Everything this module has to say about a matchup, in one pure call.
 *
 * One entry point rather than a validator and a separate advisor, because the
 * two questions share every input and a caller that asked only the first would
 * ship an arena that refuses nothing and explains nothing.
 */
export function review(matchup: Matchup, mode: FightMode): Review {
  for (const [label, side] of sides(matchup)) {
    if (side.left === "empty" && side.right === "empty") {
      return {
        refusal: `${label} has both hands empty, and that is not a fighter this simulation can `
          + `build: Loadout.primary is an ActionKind rather than an Option, so slot 0 always `
          + `carries something, and validate_rows refuses an articulated row whose first `
          + `equipment slot is empty against it. Give ${label} a sword, a shield or a club in `
          + `one hand.`,
        notes: [],
      };
    }
  }

  // The three grips the simulation refuses, said here so the refusal names a
  // control rather than arriving as an `arena_start` reason byte after the
  // button. The rules are `Scenario::duel_from`'s and its validators', not this
  // file's: a grip needs a right-hand item to sit on, `validate_bindings`
  // refuses `Both` beside a second carried item, and `validate_equipment`
  // refuses a `Both` plate.
  for (const [label, side] of sides(matchup)) {
    if (!side.twoHanded) continue;
    if (side.right === "empty") {
      return {
        refusal: `${label} is set two-handed with an empty right hand, and a grip needs an item `
          + `to sit on: give ${label} a sword or a club in the right hand, or untick two-handed.`,
        notes: [],
      };
    }
    if (side.right === "shield") {
      return {
        refusal: `${label} is set two-handed on a shield, and a plate cannot be gripped in both `
          + `hands: validate_equipment refuses a Both-bound shield as a grip conflict. Put a `
          + `sword or a club in the right hand, or untick two-handed.`,
        notes: [],
      };
    }
    if (side.left !== "empty") {
      return {
        refusal: `${label} is set two-handed while its left hand carries ${side.left}, and a `
          + `two-handed grip is one item occupying two hands: validate_bindings refuses Both `
          + `beside a second carried item. Empty ${label}'s left hand, or untick two-handed.`,
        notes: [],
      };
    }
  }

  const notes: string[] = [];
  for (const [label, side] of sides(matchup)) {
    const policy = POLICIES.find((option) => option.code === side.policy);
    if (policy === undefined) {
      return {
        refusal: `${label} is set to ${side.policy}, which is not one of the six articulated `
          + `policy codes. The picker and ArticulatedPolicyKind are two halves of one `
          + `vocabulary, so this means one of them moved.`,
        notes: [],
      };
    }
    if (!policy.live) {
      return {
        refusal: `${label} is set to ${policy.code}, which no live fight can run.`,
        notes: [],
      };
    }
    // **A note and not a refusal**, said once however many sides ask for it: a
    // sentence printed twice reads as two different problems. The fetch can fail
    // -- a shipped build serves the file and a fresh clone does too, but a proxy
    // or a stale service worker can answer neither -- and `arena_start` then
    // refuses with ARENA_NO_CHECKPOINT, which is "fetch one" rather than
    // "rebuild the module". Saying which file is what makes that actionable.
    if (policy.fetches !== undefined && notes.length === 0 && mode === "live") {
      notes.push(checkpointCopy("live"));
    }
    if (policy.fetches !== undefined && notes.length === 0 && mode === "recording") {
      notes.push(checkpointCopy("recording"));
    }
  }
  return { refusal: null, notes };
}

/**
 * The matchup as the 120-byte configuration buffer spells it.
 *
 * The picker's vocabulary is words a reader picked from a dropdown; the buffer's
 * is codes and 16.16 raws. This is the one place the two meet, and it is here
 * rather than in `arena.ts` so that a test can call it with no DOM -- which is
 * the property the header of this file claims for everything that decides.
 *
 * The spawns and the tick limit are `DuelConfigV1::shipped()`'s and are not a
 * choice: both reach `Scenario::fingerprint`, so a live fight that moved either
 * would stop being the fight `lab trace` records for the same pairing.
 */
export function arenaConfigOf(matchup: Matchup): ArenaConfig {
  const fighter = (side: SideChoice, index: 0 | 1) => {
    const policy = policyCodeOf(side.policy);
    // `review` refuses an unknown policy before [Run selected fight] is enabled, so this is
    // unreachable from the controls -- and it throws rather than defaulting,
    // because a silent `0` would run `neutral` under another name's label.
    if (policy === null) throw new Error(`${side.policy} is not an articulated policy code`);
    return {
      anatomy: ANATOMY_CODES[side.anatomy],
      policy,
      spawn: SHIPPED_SPAWNS[index],
      hands: [HAND_ITEMS[side.left], HAND_ITEMS[side.right]] as const,
      twoHanded: side.twoHanded,
    };
  };
  return {
    fighters: [fighter(matchup.a, 0), fighter(matchup.b, 1)],
    maxTicks: ARENA_MAX_TICKS,
    seed: matchup.seed,
  };
}

export interface Recording {
  readonly url: string;
  /** `Trace.heroes` and `Trace.monsters`, which is what the file itself says. */
  readonly heroes: string;
  readonly monsters: string;
}

/**
 * The three recorded fights `lab trace` writes into `web/`.
 *
 * **Development fixtures, and this table is the only thing that assumes they
 * exist.** `.gitignore` excludes `web/fight*.json` and the production build's
 * copy allowlist carries none of them, so these URLs 404 in a shipped build and
 * in a fresh clone alike.
 *
 * **[Run selected fight] does not read this table**, since v2-ui-07: it runs the fight the
 * picker describes. What is left for these to serve is the `?trace=` deep link,
 * which is how a fight recorded by `lab trace` -- with its contact velocities,
 * its impulses and its group alphas, none of which the published event row
 * carries -- is still watched beside a live one.
 *
 * The tokens are copied from the files' own headers, and the viewer prints the
 * loaded header's `heroes`/`monsters` in the status line -- so a table that
 * drifts from the files shows up on screen as a disagreement rather than as a
 * fight quietly attributed to the wrong policy.
 */
export const RECORDINGS: readonly Recording[] = [
  { url: "/fight.json", heroes: "composed", monsters: "composed" },
  { url: "/fight-windmill.json", heroes: "windmill", monsters: "windmill" },
  { url: "/fight-learned.json", heroes: "learned", monsters: "composed" },
];

/** The recording whose two sides are the two policies picked, if one exists. */
export function resolveRecording(matchup: Matchup): Recording | null {
  return RECORDINGS.find(
    (row) => row.heroes === matchup.a.policy && row.monsters === matchup.b.policy,
  ) ?? null;
}

/**
 * The scripts `lab` can put on one named side.
 *
 * `neutral` is absent on purpose: it is an `ArticulatedPolicyKind` the browser
 * can select and **not** a `lab` script, so a command naming it would exit 2.
 * The list mirrors `MATCHUP_SCRIPTS` in `crates/lab/src/main.rs`.
 */
const TRACEABLE_SCRIPTS: readonly string[] = [
  "composed", "windmill", "attack-moves", "tactical", "openings",
];

/**
 * The `lab trace` command that would record this pairing, or null if none does.
 *
 * `--policy` still puts **one script on both sides** -- that is what makes a
 * scripted trace a control -- but `--hero-policy`/`--monster-policy` name a
 * driver per side, so a mixed scripted pairing now has a command where it used
 * to have none. `--policy learned` keeps its own `--opponent` spelling, which is
 * the older and narrower door to the same asymmetry.
 */
export function recordingCommand(matchup: Matchup): string | null {
  const a = matchup.a.policy;
  const b = matchup.b.policy;
  const base = `cargo run --release -p lab -- trace --seed ${matchup.seed}`;
  if (a === "learned" && (b === "composed" || b === "windmill" || b === "attack-moves")) {
    return `${base} --policy learned --checkpoint checkpoints/v2-probe.ckpt --opponent ${b}`;
  }
  if (!TRACEABLE_SCRIPTS.includes(a) || !TRACEABLE_SCRIPTS.includes(b)) return null;
  if (a !== b) return `${base} --hero-policy ${a} --monster-policy ${b}`;
  if (a === "attack-moves") return `${base} --policy composed --attack-moves`;
  return `${base} --policy ${a}`;
}

/** What to say when no recording matches the controls, naming what would make one. */
export function missingRecording(matchup: Matchup): string {
  const pairing = `No recording pairs ${matchup.a.policy} on Fighter A against `
    + `${matchup.b.policy} on Fighter B`;
  const command = recordingCommand(matchup);
  if (command === null) {
    return `${pairing}, and no lab trace command produces one: --hero-policy and `
      + `--monster-policy take ${TRACEABLE_SCRIPTS.join(", ")}, and neutral is a browser policy `
      + `rather than a lab script. Press Run selected fight to run this pairing live instead.`;
  }
  const pair = matchup.a.policy === matchup.b.policy
    ? matchup.a.policy
    : `${matchup.a.policy}-vs-${matchup.b.policy}`;
  const file = `web/fight-${pair}.json`;
  return `${pairing}. Record one with: ${command} --out ${file} -- then open it with `
    + `#/arena?trace=/${file.slice("web/".length)}. Press Run selected fight to run this pairing live instead.`;
}

export interface RecordedSide {
  readonly anatomy: string;
  readonly left: string;
  readonly right: string;
  readonly twoHanded: boolean;
}

/**
 * What a recorded body actually brought, from the trace's own body header.
 *
 * `GripBinding::Both` is one item on the right hand plus the flag -- the same
 * three values the picker's own controls read -- rather than the item copied
 * into both hands, which is what this used to answer and what made a recorded
 * two-handed club incomparable with the controls that describe one.
 */
export function recordedLoadout(body: BodyInfo): RecordedSide {
  let left = "empty";
  let right = "empty";
  let twoHanded = false;
  for (const item of body.carried) {
    if (item === null) continue;
    const action = item.action.toLowerCase();
    if (item.binding === "Left") left = action;
    if (item.binding === "Right") right = action;
    if (item.binding === "Both") {
      right = action;
      twoHanded = true;
    }
  }
  return { anatomy: body.kind.toLowerCase(), left, right, twoHanded };
}

function describeSide(label: string, side: RecordedSide): string {
  return side.twoHanded
    ? `${label} is a ${side.anatomy} holding ${side.right} in both hands`
    : `${label} is a ${side.anatomy} holding ${side.left} left and ${side.right} right`;
}

/**
 * How the picked matchup disagrees with the fight actually on screen, or null.
 *
 * A recording's loadout and seed were fixed when it was written, so leaving the
 * anatomy and hand controls live without saying this would let a reader change a
 * dropdown, see the picture not change, and reasonably conclude the arena is
 * broken. The controls are live because that is what exercises the validation
 * this module exists for.
 */
export function recordingMismatch(matchup: Matchup, header: FightHeader): string | null {
  const differing: string[] = [];
  sides(matchup).forEach(([label, side], index) => {
    const body = header.bodies[index];
    if (body === undefined) return;
    const recorded = recordedLoadout(body);
    if (recorded.anatomy === side.anatomy && recorded.left === side.left
      && recorded.right === side.right && recorded.twoHanded === side.twoHanded) {
      return;
    }
    differing.push(describeSide(label, recorded));
  });
  const seedDiffers = matchup.seed !== header.seed;
  const policyDiffers = matchup.a.policy !== header.heroes || matchup.b.policy !== header.monsters;
  if (differing.length === 0 && !seedDiffers && !policyDiffers) return null;

  const parts: string[] = [];
  if (policyDiffers) {
    parts.push(`The recording still on screen is ${header.heroes} vs ${header.monsters}; `
      + `the controls describe ${matchup.a.policy} vs ${matchup.b.policy}`);
  }
  if (differing.length !== 0) {
    parts.push(`The recording's own loadout is what is on screen: ${differing.join(", and ")}`);
  }
  if (seedDiffers) parts.push(`The recording was run at seed ${header.seed}`);
  return `${parts.join(". ")}. A recorded `
    + `fight is fixed, so these controls describe a different fight from the one being played. `
    + `Press Run selected fight to run the one they describe.`;
}

function code<T extends string>(known: readonly T[], value: string, where: string): T {
  const found = known.find((entry) => entry === value);
  // The template and this module are two halves of one vocabulary, and the
  // useful failure is the one that names which half moved.
  if (found === undefined) throw new Error(`#${where} offers "${value}", which the picker does not know`);
  return found;
}

function select(root: HTMLElement, id: string): HTMLSelectElement {
  const found = root.querySelector(`#${id}`);
  if (!(found instanceof HTMLSelectElement)) throw new Error(`#${id} is missing from the picker`);
  return found;
}

function checkbox(root: HTMLElement, id: string): HTMLInputElement {
  const found = root.querySelector(`#${id}`);
  if (!(found instanceof HTMLInputElement)) throw new Error(`#${id} is missing from the picker`);
  return found;
}

/** Fill `#a-policy` and `#b-policy`, since the template deliberately leaves them empty. */
export function populatePolicies(root: HTMLElement, heroes: string, monsters: string): void {
  for (const [id, chosen] of [["a-policy", heroes], ["b-policy", monsters]] as const) {
    const target = select(root, id);
    target.replaceChildren();
    for (const option of POLICIES) {
      const node = document.createElement("option");
      node.value = option.code;
      node.textContent = option.label;
      node.selected = option.code === chosen;
      target.append(node);
    }
  }
}

/** Point every policy select at what the loaded recording says drove that side. */
export function showPolicies(root: HTMLElement, heroes: string, monsters: string): void {
  for (const [id, chosen] of [["a-policy", heroes], ["b-policy", monsters]] as const) {
    const target = select(root, id);
    if (POLICIES.some((option) => option.code === chosen)) target.value = chosen;
  }
}

/** The matchup the controls currently describe. */
export function readMatchup(root: HTMLElement): Matchup {
  const side = (prefix: string): SideChoice => ({
    anatomy: code(ANATOMIES, select(root, `${prefix}-anatomy`).value, `${prefix}-anatomy`),
    left: code(HANDS, select(root, `${prefix}-left`).value, `${prefix}-left`),
    right: code(HANDS, select(root, `${prefix}-right`).value, `${prefix}-right`),
    twoHanded: checkbox(root, `${prefix}-two-handed`).checked,
    policy: select(root, `${prefix}-policy`).value,
  });
  const seedInput = root.querySelector("#arena-seed");
  if (!(seedInput instanceof HTMLInputElement)) throw new Error("#arena-seed is missing from the picker");
  return { a: side("a"), b: side("b"), seed: seedInput.valueAsNumber || 0 };
}

/** Every control the picker owns, for one `addEventListener` sweep. */
export function pickerControls(root: HTMLElement): readonly HTMLElement[] {
  const ids = [
    "a-anatomy", "a-left", "a-right", "a-two-handed", "a-policy",
    "b-anatomy", "b-left", "b-right", "b-two-handed", "b-policy", "arena-seed",
  ];
  return ids.map((id) => {
    const found = root.querySelector(`#${id}`);
    if (!(found instanceof HTMLElement)) throw new Error(`#${id} is missing from the picker`);
    return found;
  });
}
