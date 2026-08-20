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
//     was refused for a live fight and offered only for a recorded one. It
//     briefly had one -- v2-ui-08's first half split an inference-only
//     `learn-core`, landed policy code 4 and shipped `checkpoints/v2-probe.ckpt`
//     at a URL -- and then lost it again in the same session's second half,
//     because moving `#/arena` onto `PolicyKind` moved it onto a
//     registry with no `learned` entry and no room for a checkpoint in a policy
//     byte. So `learned` is not a picker policy at all now, live or recorded.
//     `lab trace --policy learned` still writes one, and a *trace* loaded
//     through `?trace=` still names it in its header -- which is why
//     `checkpointCopy` survives with its recording arm and not its live one.
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
const HANDS = ["empty", "sword", "shield", "club", "bow"] as const;
export type HandCode = (typeof HANDS)[number];

export interface PolicyOption {
  /** A `PolicyKind::name`, and the token `lab trace` writes into a header. */
  readonly code: string;
  readonly label: string;
  /**
   * Whether the live driver can run it. See the header note.
   *
   * **True of all five, and kept anyway.** It was `false` for `learned` before
   * there was browser inference, and the refusal it drives is the only thing
   * standing between "this build offers an option" and "this build runs it".
   * A field that is constant today is cheap; a picker that offers a policy the
   * driver refuses, with nothing to say so, is the shape two reviews of this
   * repository found ten instances of.
   */
  readonly live: boolean;
  /**
   * Whether running it live needs a file this build has to fetch first.
   *
   * **Nothing sets it since v2-ui-08.** It was `learned`'s and only `learned`'s,
   * and `learned` is not a `PolicyKind`. It is kept for `live`'s reason
   * one field up: the day a policy needs an asset, the note belongs here rather
   * than in a new mechanism, and `review` already says the sentence.
   */
  readonly fetches?: string;
}

/**
 * The five policies, in `PolicyKind` code order.
 *
 * The labels carry the constraint rather than a tooltip carrying it, because a
 * disabled-looking option a reader has to hover to understand is an option they
 * will assume is broken.
 *
 * **The order is load-bearing twice over**: `ARENA_POLICY_NAMES` is indexed by
 * code, and `populatePolicies` fills both dropdowns from this table, so a row
 * out of order would put a label on the wrong fighter.
 */
export const POLICIES: readonly PolicyOption[] = [
  { code: "neutral", label: "neutral (stands still)", live: true },
  { code: "scripted", label: "scripted", live: true },
  { code: "scripted-level", label: "scripted-level (no elevation term)", live: true },
  { code: "tactical", label: "tactical (aims at a region)", live: true },
  { code: "tactical-fixed-guard", label: "tactical-fixed-guard (guard does not read)", live: true },
];

export type PolicyCode = string;

/** Which arena context is asking for checkpoint and validation copy. */
export type FightMode = "recording" | "live";

/**
 * Why a checkpoint matters in each of the arena's two independent contexts.
 *
 * **Only the recording arm has a caller since v2-ui-08.** `learned` left the
 * picker with the arena's move to `PolicyKind`, so no live fight loads
 * weights; `arena.ts` still reaches the recording arm, driven by a *loaded trace
 * header* saying "learned", which `lab trace --policy learned` still writes. The
 * live sentence is kept beside it because the two are one decision -- what a
 * checkpoint means here -- and splitting them would leave the surviving half
 * looking like a fact about recordings rather than half of a contrast.
 */
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
          + `equipment slot is empty against it. Give ${label} a sword, a shield, a club or Bow in `
          + `one hand.`,
        notes: [],
      };
    }
  }

  // Bow has one canonical browser representation: the sole right-hand item,
  // with the Both marker set. Refuse every other spelling here, before the
  // configuration buffer reaches wasm, and name Bow rather than letting the
  // generic grip prose make it sound interchangeable with a sword or club.
  for (const [label, side] of sides(matchup)) {
    if (side.left === "bow") {
      return {
        refusal: `${label} carries Bow in its left hand, but Bow is canonical only as the sole `
          + `right-hand item with two-handed selected. Move Bow to ${label}'s right hand, empty `
          + `the left hand, and tick two-handed.`,
        notes: [],
      };
    }
    if (side.right !== "bow") continue;
    if (side.left !== "empty") {
      return {
        refusal: `${label} carries Bow while its left hand carries ${side.left}, but Bow must be `
          + `the sole right-hand item. Empty ${label}'s left hand and keep two-handed selected.`,
        notes: [],
      };
    }
    if (!side.twoHanded) {
      return {
        refusal: `${label} carries Bow one-handed, but Bow requires the canonical two-handed `
          + `right-hand grip. Tick two-handed for ${label}.`,
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
          + `to sit on: give ${label} a sword, a club or Bow in the right hand, or untick two-handed.`,
        notes: [],
      };
    }
    if (side.right === "shield") {
      return {
        refusal: `${label} is set two-handed on a shield, and a plate cannot be gripped in both `
          + `hands: validate_equipment refuses a Both-bound shield as a grip conflict. Put a `
          + `sword, a club or Bow in the right hand, or untick two-handed.`,
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
      // **The count comes from the table.** It read "the six articulated policy
      // codes" while `POLICIES` had seven rows and then five, and the verbatim
      // assertion in `studio-shell.test.mjs` kept passing through both -- which
      // is the third time this exact trap has been recorded here. A sentence
      // built from `POLICIES.length` cannot go stale when a row is appended.
      return {
        refusal: `${label} is set to ${side.policy}, which is not one of the `
          + `${POLICIES.length} embodied policy codes `
          + `(${POLICIES.map((option) => option.code).join(", ")}). The picker and `
          + `PolicyKind are two halves of one vocabulary, so this means one of `
          + `them moved.`,
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

  // **Two notes about what this arena cannot show, and both were measured
  // rather than reasoned.** Driving `arena_start` through the wasm ABI on
  // 2026-08-19 with the shipped loadout, seed 3, over the page's own 3,600-tick
  // clock: two `neutral` fighters moved **no pose word at all** -- 0 of 132 --
  // and resolved no contact, and `scripted` against `scripted-level` produced
  // the same state hash `0x29b33ddb1e73ea23` to the bit.
  //
  // Neither is a bug and neither may be silent. A dropdown that offers a choice
  // and then shows the reader the same fight, or no fight, is the shape
  // `AGENTS.md` describes: a control that accepted an input it could not act on
  // and said nothing. It cannot be a refusal -- both requests are honoured
  // exactly as specified -- so it is converted into a sentence, which is the
  // other half of that rule.
  const codes = sides(matchup).map(([, side]) => side.policy);
  if (codes.every((code) => code === "neutral")) {
    notes.push("Both fighters are neutral, which is the control condition: arms slack, feet "
      + "still. Measured over the whole 3,600-tick clock it moves no pose word and resolves "
      + "no contact. Give at least one side another policy to see a fight.");
  }
  if (codes.includes("scripted-level")) {
    notes.push("scripted-level is scripted with the elevation term switched off, and this "
      + "arena's floor is flat -- so on this fixture the two are the same fight, byte for "
      + "byte. The difference they exist to measure is on sculpted ground: "
      + "cargo run --release -p lab -- embodied --slope.");
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
    if (policy === null) throw new Error(`${side.policy} is not an embodied policy code`);
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
 * The recorded fights `lab trace` writes into `web/`.
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
  { url: "/fight.json", heroes: "scripted", monsters: "scripted" },
  { url: "/fight-tactical.json", heroes: "tactical", monsters: "tactical" },
];

/** The recording whose two sides are the two policies picked, if one exists. */
export function resolveRecording(matchup: Matchup): Recording | null {
  return RECORDINGS.find(
    (row) => row.heroes === matchup.a.policy && row.monsters === matchup.b.policy,
  ) ?? null;
}

/**
 * The policies `lab` can put on one named side.
 *
 * **It is `POLICIES`' own list since v2-ui-08, which is the point.** It used to
 * be a copy of `MATCHUP_SCRIPTS` in `crates/lab/src/main.rs` -- a second
 * vocabulary, with `neutral` deliberately absent because the browser could
 * select it and `lab` could not spell it, so a command naming it would exit 2.
 * That step deleted `Script` and put `lab trace --policy`,
 * `--hero-policy`/`--monster-policy` on `PolicyKind::from_name`, which
 * is the same registry this picker reads. So the two halves cannot disagree,
 * and deriving the list is what keeps that true when a policy is appended
 * rather than restating it and hoping.
 */
const TRACEABLE_SCRIPTS: readonly string[] = POLICIES.map((option) => option.code);

/**
 * The `lab trace` command that would record this pairing, or null if none does.
 *
 * `--policy` puts **one policy on both sides** -- that is what makes a symmetric
 * trace a control -- and `--hero-policy`/`--monster-policy` name a driver per
 * side, so a mixed pairing has a command too.
 *
 * **It can no longer answer null from the picker, and the `null` stays.** Every
 * `POLICIES` code is a `lab` policy since v2-ui-08, so the two branches below
 * that could refuse are unreachable from the controls -- but they are reachable
 * from a `?trace=` header, from a saved matchup and from a test, and the
 * alternative to refusing is printing a command that exits 2 at the reader's
 * shell. `missingRecording` prints whatever this answers.
 *
 * The `learned` arm went with the picker's `learned` entry. `lab trace --policy
 * learned --opponent <policy>` still exists; nothing here can spell the pairing
 * it records, because no side of this picker can be set to `learned`.
 */
export function recordingCommand(matchup: Matchup): string | null {
  const a = matchup.a.policy;
  const b = matchup.b.policy;
  const base = `cargo run --release -p lab -- trace --seed ${matchup.seed}`;
  if (!TRACEABLE_SCRIPTS.includes(a) || !TRACEABLE_SCRIPTS.includes(b)) return null;
  if (a !== b) return `${base} --hero-policy ${a} --monster-policy ${b}`;
  return `${base} --policy ${a}`;
}

/** What to say when no recording matches the controls, naming what would make one. */
export function missingRecording(matchup: Matchup): string {
  const pairing = `No recording pairs ${matchup.a.policy} on Fighter A against `
    + `${matchup.b.policy} on Fighter B`;
  const command = recordingCommand(matchup);
  if (command === null) {
    return `${pairing}, and no lab trace command produces one: --hero-policy and `
      + `--monster-policy take ${TRACEABLE_SCRIPTS.join(", ")}. `
      + `Press Run selected fight to run this pairing live instead.`;
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
    // **And the select's own value, which `selected` alone does not reliably
    // set.** In a browser the two are the same thing; `HTMLSelectElement.value`
    // is the property every reader here goes through -- `readMatchup`,
    // `setPickerValue`, the picker's own tests -- and leaving it to be derived
    // meant the route opened with `a-policy` reading the empty string under any
    // DOM that does not model the derivation. Written after the loop so it
    // cannot be undone by a later `selected`.
    target.value = chosen;
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
