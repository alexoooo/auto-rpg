import type { GolemSlot } from "./module.ts";

/**
 * What a beaten golem leaves behind, and where the winner keeps it.
 *
 * This is the One Must Fall loop at prototype scale: a module severed in a bout survives the
 * verdict as a thing, the winner keeps the ones that came off intact, and the next bout's setup
 * offers them as options to fit. Modding the unit replaces finding equipment.
 *
 * **Nothing here imports a value.** `GolemSlot` arrives as a type and erases, so this module has
 * no Babylon in its graph at all and `tests/golem-loot.test.mjs` can argue with the rule and the
 * codec under Node without an engine -- the same property `src/bout.ts` guards for the bout rules
 * and for the same reason. The shelf is handed in as a predicate rather than imported for exactly
 * that: `src/golem/build.ts` is Babylon from its first import.
 *
 * ## The loot rule, and the existing facts it reads
 *
 * **A severed module is loot if its socket joint broke and the module's own parts still have
 * health above zero. A module cut to pieces is debris.** That rule adds no damage model; it reads
 * three facts that already exist:
 *
 * - **Which joint broke.** `Golem.sever` breaks a module's socket joint when a blow destroys any
 *   piece of it, and `Golem.die` breaks the locomotion module's when the body stops being a golem.
 *   Only the first is a part coming off; the second is a stone body falling apart under its own
 *   weight, and a pair of legs collected from every corpse would be a reward for winning rather
 *   than for cutting something off.
 * - **What was left of it at that instant.** `severs` in `src/scoring.ts` refuses to sever a piece
 *   whose health is still above zero, so the struck piece is *always* at zero when the socket
 *   breaks -- which is why the rule cannot be read as "every part". It is read as **every part but
 *   the one the blow destroyed**: cut an arm off at the shoulder and the forearm and the blade are
 *   still worth having; hack the same arm to pieces and two of them are down, which is debris.
 * - **How worn it is.** The remaining fraction of the module's own health, which is the number
 *   `PROCEDURAL_DAMAGE_WEAR_V1` already knows how to draw.
 *
 * The loot unit is the whole module, chain and terminal together. A terminal snapped off its chain
 * is not loot, because **no weld has health yet** -- there is no fact to read, and inventing one
 * would be the new damage model this session is forbidden.
 *
 * ## What the bin stores, and what it deliberately does not
 *
 * A list of module option ids with their remaining durability, checksummed, in `localStorage`, per
 * browser. It does **not** store a build, a matchup, a bout, a shell, a part-by-part health record
 * or which piece the blow found: a bin entry is "one of these, this worn", and everything else
 * about the module is rebuilt from the shelf. There is no import and no export, because losing the
 * bin costs nothing that cannot be rebuilt by winning another bout, and a prototype's save format
 * that can be mailed around is a format somebody has to keep compatible.
 */

// -------------------------------------------------------------------------------- what a golem says

/**
 * One of a golem's five modules, as the verdict reads it.
 *
 * Published by `Golem.moduleReport`, which is the only accessor this session added to that file.
 * Two readers, and both of them need a different half: the loot rule reads `severedIntact` and the
 * durability that goes with it, and the bin's own settlement reads the live durability of a module
 * that was fitted from the bin and is still on the body.
 */
export interface GolemModuleReport {
  readonly slot: GolemSlot;
  /** The module option id, e.g. `effector.wrist.blade`. The same string a bin entry holds. */
  readonly id: string;
  /** Whether its socket joint has been broken, by a blow or by the body coming apart. */
  readonly severed: boolean;
  /**
   * The fraction of its own health it has left: live now, or as it was at the instant a blow
   * broke its socket. Never negative and never above one.
   */
  readonly durability: number;
  /**
   * Whether a **blow** broke its socket and every part but the one that blow destroyed still had
   * health above zero at that instant.
   *
   * False for a module still attached, and false for one that came off because the golem died --
   * so this field is the whole of "its socket joint broke and it is not in pieces", answered where
   * the facts are still there to answer it.
   */
  readonly severedIntact: boolean;
}

/**
 * Which slots a salvaged module can come from and be fitted back into.
 *
 * The two effector sockets and no others, and that is the plan's own scope rather than a
 * limitation invented here: the loot unit is "the whole module, chain and terminal together",
 * which is what an effector is, and the arm is the thing the human gate asks about -- lose a module
 * in one bout and fit the enemy's in the next. A severed torso is a golem coming apart rather than
 * a part somebody picks up, and a bin entry no picker could fit would be a stored field with no
 * reader.
 */
export const LOOTABLE_SLOTS: readonly GolemSlot[] = Object.freeze(["primary", "secondary"]);

export const isLootableSlot = (slot: GolemSlot): boolean => LOOTABLE_SLOTS.includes(slot);

/** The narrowest thing durability is computed from. A `Limb` satisfies it structurally. */
export interface DurablePart {
  readonly health: number;
  readonly maxHealth: number;
}

/**
 * How much of a module is left, as a fraction of what it was built with.
 *
 * Summed over the module's own parts rather than averaged over them, so a big slab counts for more
 * than a bearing, and clamped at both ends because a part can be driven past zero by the blow that
 * finished it. A module with no parts reads as whole, which is the same answer `vitality` gives an
 * empty body and for the same reason: there is nothing here to be worn.
 */
export function moduleDurability(parts: readonly DurablePart[]): number {
  let left = 0;
  let full = 0;
  for (const part of parts) {
    if (!Number.isFinite(part.maxHealth) || part.maxHealth <= 0) {
      throw new Error(`a golem module part declares maxHealth ${part.maxHealth}`);
    }
    left += Math.max(0, Number.isFinite(part.health) ? part.health : 0);
    full += part.maxHealth;
  }
  if (full <= 0) return 1;
  const ratio = left / full;
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
}

// ------------------------------------------------------------------------------------- the bin

/** One salvaged module: which option it is, and how worn. */
export interface PartsBinEntry {
  /** This entry's own name inside this bin, so a setup screen can name the one it fitted. */
  readonly key: string;
  /** The module option id, exactly as `src/golem/build.ts` spells it. */
  readonly id: string;
  /** What is left of it, greater than zero and at most one. */
  readonly durability: number;
}

/** A module about to enter the bin: an option and a durability, with no key yet. */
export interface PartsBinTake {
  readonly id: string;
  readonly durability: number;
}

/**
 * The loot rule, applied to what a beaten golem says about its own modules.
 *
 * Every clause reads a published fact and none of them invents one. A module that is still
 * attached is not loot; a module that came off because the body died is not loot; a module that was
 * cut to pieces is not loot; a module worn to nothing is not loot, because a part at zero durability
 * is a part that has already reached zero.
 */
export function partsBinLoot(report: readonly GolemModuleReport[]): readonly PartsBinTake[] {
  return Object.freeze(report
    .filter((module) => module.severedIntact && isLootableSlot(module.slot) && module.durability > 0)
    .map((module) => Object.freeze({ id: module.id, durability: module.durability })));
}

// --------------------------------------------------------------------------------------- the codec

export const PARTS_BIN_VERSION = 1 as const;

/** Where the bin lives in a browser's own storage. The version is in the key as well as in the payload. */
export const PARTS_BIN_KEY = "sword.golem.parts-bin.v1";

/**
 * FNV-1a over the payload text, hex.
 *
 * A checksum and deliberately not a signature: it is here to catch a bin that was damaged, not one
 * that was edited on purpose. A person with a console can rewrite both halves and is welcome to;
 * what this stops is a half-written value, a truncated quota write or another build's format being
 * read back as a plausible list of parts.
 */
export function partsBinChecksum(text: string): string {
  let value = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    value ^= byte;
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** Durability is rounded on the way out, so a stored bin is legible and a round trip is exact. */
const storedDurability = (durability: number): number => Math.round(durability * 1e6) / 1e6;

export function encodePartsBin(entries: readonly PartsBinEntry[]): string {
  const parts = entries.map((entry) => ({
    key: entry.key, id: entry.id, durability: storedDurability(entry.durability),
  }));
  const payload = JSON.stringify(parts);
  return JSON.stringify({ bin: PARTS_BIN_VERSION, sum: partsBinChecksum(payload), parts });
}

/**
 * What came back out of storage: entries, or a refusal that names what was wrong with them.
 *
 * **Never both, and never a repair.** The precedent is the guided playtest's save, which refused a
 * stale or malformed record rather than silently repairing it, and the defect the shape avoids is
 * the one `AGENTS.md` calls the shield that shipped as a club: a chain of tests with a default
 * branch at the end quietly substitutes a plausible value for a damaged one, compiles, passes, and
 * hands somebody a bin they did not earn. Every clause below returns a sentence naming the field it
 * refused; nothing falls through to a default.
 */
export type PartsBinReading =
  | { readonly entries: readonly PartsBinEntry[]; readonly refusal: null }
  | { readonly entries: null; readonly refusal: string };

const refuse = (refusal: string): PartsBinReading => Object.freeze({ entries: null, refusal });

/**
 * Read a stored bin back, refusing damaged data rather than substituting defaults.
 *
 * `knownOption` is required rather than defaulted, and that is the same rule again: an optional
 * predicate defaulting to "everything is known" would make an unrecognised module id pass through
 * into a picker, which is a saved id with no builder behind it. Every caller says what its shelf
 * is.
 */
export function decodePartsBin(
  text: string,
  knownOption: (id: string) => boolean,
): PartsBinReading {
  if (typeof text !== "string" || text.length === 0) {
    return refuse("the stored parts bin is empty text");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return refuse(`the stored parts bin is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return refuse("the stored parts bin is not a record");
  }
  const record = raw as Record<string, unknown>;
  if (record.bin !== PARTS_BIN_VERSION) {
    return refuse(`the stored parts bin is version ${JSON.stringify(record.bin)}, and this build writes version ${PARTS_BIN_VERSION}`);
  }
  if (typeof record.sum !== "string") {
    return refuse("the stored parts bin carries no checksum");
  }
  if (!Array.isArray(record.parts)) {
    return refuse("the stored parts bin's part list is not an array");
  }
  const hashed = partsBinChecksum(JSON.stringify(record.parts));
  if (hashed !== record.sum) {
    return refuse(`the stored parts bin's checksum is ${record.sum} and its contents hash to ${hashed}`);
  }
  const entries: PartsBinEntry[] = [];
  const seen = new Set<string>();
  for (const [index, item] of record.parts.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return refuse(`parts bin entry ${index} is not a record`);
    }
    const entry = item as Record<string, unknown>;
    // A positive integer, as `mintKey` writes them. Narrower than "a non-empty string" on purpose:
    // this value is interpolated into an `<option value>` by the setup screen, and a format that
    // admits arbitrary text is a format that admits markup out of a browser's own storage.
    if (typeof entry.key !== "string" || !/^[1-9][0-9]*$/.test(entry.key)) {
      return refuse(`parts bin entry ${index} has key ${JSON.stringify(entry.key)}, which is not a positive integer`);
    }
    if (seen.has(entry.key)) {
      return refuse(`parts bin entry ${index} repeats the key "${entry.key}"`);
    }
    seen.add(entry.key);
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      return refuse(`parts bin entry "${entry.key}" names no module`);
    }
    if (!knownOption(entry.id)) {
      return refuse(`parts bin entry "${entry.key}" names module "${entry.id}", which this build does not offer`);
    }
    if (typeof entry.durability !== "number" || !Number.isFinite(entry.durability) ||
        entry.durability <= 0 || entry.durability > 1) {
      return refuse(`parts bin entry "${entry.key}" has durability ${JSON.stringify(entry.durability)}, which is not a fraction above zero`);
    }
    entries.push(Object.freeze({ key: entry.key, id: entry.id, durability: entry.durability }));
  }
  return Object.freeze({ entries: Object.freeze(entries), refusal: null });
}

// ------------------------------------------------------------------------------- what a bout settles

/** One bin entry that was fitted onto a body this bout, and what became of it. */
export interface FittedPart {
  readonly key: string;
  /** What is left of it now, 0..1. */
  readonly durability: number;
  /** Whether its socket broke during the bout: it is on the arena floor, not in the bin. */
  readonly severed: boolean;
}

export interface BoutSalvage {
  /** Entries fitted onto the collecting side's own golem, with what is left of them. */
  readonly fitted: readonly FittedPart[];
  /** What came off the beaten body intact. Empty when nobody won or the collector lost. */
  readonly taken: readonly PartsBinTake[];
}

/** The smallest positive integer not already spoken for, as a string. */
const mintKey = (used: Set<string>): string => {
  for (let candidate = 1; ; candidate += 1) {
    const key = String(candidate);
    if (!used.has(key)) {
      used.add(key);
      return key;
    }
  }
};

/**
 * The bin after a bout: what wore out, what is gone, and what was taken.
 *
 * Three rules, in this order and no other. A fitted entry that came off is **gone** -- it is lying
 * in the arena, and the plan's collection walks the loser's severed modules rather than the
 * winner's. A fitted entry worn to nothing is gone too, which is the plan's "a part that reaches
 * zero in a bout is gone from the bin". Everything else that was fitted carries its new durability
 * forward, which is what makes a second-hand blade get more second-hand. Then the take is appended,
 * with keys minted against what survived, so a taken part can never collide with one already held.
 */
export function settlePartsBin(
  entries: readonly PartsBinEntry[],
  salvage: BoutSalvage,
): readonly PartsBinEntry[] {
  const fitted = new Map(salvage.fitted.map((part) => [part.key, part]));
  const kept: PartsBinEntry[] = [];
  for (const entry of entries) {
    const was = fitted.get(entry.key);
    if (!was) {
      kept.push(entry);
      continue;
    }
    if (was.severed || !(was.durability > 0)) continue;
    kept.push(Object.freeze({ key: entry.key, id: entry.id, durability: was.durability }));
  }
  const used = new Set(kept.map((entry) => entry.key));
  for (const take of salvage.taken) {
    if (!(take.durability > 0)) continue;
    kept.push(Object.freeze({ key: mintKey(used), id: take.id, durability: take.durability }));
  }
  return Object.freeze(kept);
}

// ------------------------------------------------------------------------------------ the store

/**
 * The slice of `Storage` this needs, so a test can hand over a map and the page can hand over
 * `window.localStorage`.
 */
export interface PartsBinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The per-browser parts bin, wrapped so that every way storage can fail is an empty bin with a
 * sentence rather than a thrown error on the setup screen.
 *
 * **`localStorage` can throw and can come back empty.** A private window, cleared site data, a
 * browser that blocks site data outright and a quota that is already full are four different
 * failures with one honest answer: there is no bin, say so, and go on working. So every read and
 * every write is wrapped, `storage` may be null outright, and a bin that has never been written
 * reads as empty with no refusal -- which is a different state from a bin that was written and
 * came back damaged, and the screen shows the difference.
 */
export class PartsBin {
  private readonly storage: PartsBinStorage | null;
  private readonly knownOption: (id: string) => boolean;
  private held: readonly PartsBinEntry[] = Object.freeze([]);
  /** Why the stored bin was refused, or null when there was nothing wrong with it. */
  private note: string | null = null;

  constructor(storage: PartsBinStorage | null, knownOption: (id: string) => boolean) {
    this.storage = storage;
    this.knownOption = knownOption;
    this.reload();
  }

  /** What is in the bin. Empty when there is no storage, nothing stored, or a refusal. */
  get entries(): readonly PartsBinEntry[] { return this.held; }

  /** Why what was stored was not used, or null. Read by the setup screen; see `PartsBin`. */
  get refusal(): string | null { return this.note; }

  entry(key: string): PartsBinEntry | null {
    return this.held.find((held) => held.key === key) ?? null;
  }

  /** Re-read storage. Called once at construction and by nothing else today. */
  reload(): void {
    this.held = Object.freeze([]);
    this.note = null;
    if (!this.storage) return;
    let stored: string | null;
    try {
      stored = this.storage.getItem(PARTS_BIN_KEY);
    } catch (error) {
      this.note = `this browser refused to read the parts bin: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }
    // Never written is not damaged. An empty bin with no sentence is the correct first run.
    if (stored === null || stored === undefined) return;
    const reading = decodePartsBin(stored, this.knownOption);
    if (reading.refusal !== null) {
      this.note = reading.refusal;
      return;
    }
    this.held = reading.entries;
  }

  /** Replace the whole bin and write it through. The refusal is cleared: this is a good bin now. */
  replace(entries: readonly PartsBinEntry[]): void {
    this.held = Object.freeze([...entries]);
    this.note = null;
    if (!this.storage) return;
    try {
      this.storage.setItem(PARTS_BIN_KEY, encodePartsBin(this.held));
    } catch (error) {
      this.note = `this browser refused to keep the parts bin: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /** What a bout leaves behind. See `settlePartsBin` for the three rules. */
  settle(salvage: BoutSalvage): readonly PartsBinTake[] {
    this.replace(settlePartsBin(this.held, salvage));
    return salvage.taken;
  }

  /**
   * Empty it, because a prototype without a reset is a prototype somebody has to clear from the
   * console.
   */
  reset(): void {
    this.held = Object.freeze([]);
    this.note = null;
    if (!this.storage) return;
    try {
      this.storage.removeItem(PARTS_BIN_KEY);
    } catch {
      // Nothing to say: the bin in hand is empty either way, and a browser that refuses to
      // remove a key it may also refuse to read is not a state a person can act on.
    }
  }
}

/** `window.localStorage`, or null in every context that has none or refuses to hand one over. */
export function browserPartsBinStorage(): PartsBinStorage | null {
  try {
    const storage = globalThis.localStorage;
    return storage ? storage : null;
  } catch {
    // Reading the accessor itself throws in a browser set to block site data.
    return null;
  }
}
