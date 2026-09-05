import type { GolemSetup } from "../bout.ts";
import type { WeaponKind } from "../hands.ts";
import {
  CHAIN_PITCH,
  CHAIN_REACH,
  CHAIN_WRIST,
  HEAD_NECK,
  HEAD_RAM,
  TERMINAL_BLADE,
  TORSO_PLAIN,
  TORSO_PLATED,
} from "./config.ts";
import { effectorModule } from "./effectors/effector.ts";
import { headPlain } from "./head/plain.ts";
import { headRam } from "./head/ram.ts";
import { bipedModule } from "./locomotion/biped.ts";
import { multilegModule } from "./locomotion/multileg.ts";
import { wheelModule } from "./locomotion/wheel.ts";
import type { LocomotionModuleDefinition } from "./locomotion.ts";
import type {
  ChainId,
  EffectorChainDefinition,
  EffectorTerminalDefinition,
  GolemModuleDefinition,
  TerminalId,
} from "./module.ts";
import { EFFECTOR_CHAINS, EFFECTOR_TERMINALS, GOLEM_MODULES } from "./registry.ts";
import { torsoPlain } from "./torso/plain.ts";
import { torsoPlated } from "./torso/plated.ts";
import type { TorsoModuleDefinition } from "./torso/torso.ts";
import type { HeadModuleDefinition } from "./head/head.ts";

/**
 * What an assembly may put in each slot, and the plain-data build that names one option per slot.
 *
 * **The list of options is the registry's; only the definitions are resolved here**, and the split
 * is deliberate. `GOLEM_MODULES` is where a session adds a module and it is the one list the bench
 * reads, so a second hand-written list of what a golem may be built from would be a second copy of
 * the ladder -- exactly the drift a `Record` over legal options exists to stop. So this file walks
 * the registry, parses each registered id, and resolves it to the definition that produced it.
 *
 * What it cannot get from the registry is the *typed* definition. `GolemBenchOption.build` returns
 * a `BenchModule`, which is the module contract plus a command adapter, and that is everything an
 * assembly needs for a torso, a head and an effector -- but not for locomotion, which owes a port,
 * a root, a footprint and the two halves of a substep either side of the pair resolution. Those
 * live on `BuiltLocomotion` and are the reason `GOLEM_LOCOMOTION` below names definitions rather
 * than bench options.
 *
 * **A registered module this file cannot resolve is dropped and named**, by
 * `unresolvedGolemModules` -- not silently ignored, because an option that exists and is not
 * offered is the shape of hole this directory keeps paying for. Session 06's wheel and multileg
 * append one line each to `GOLEM_LOCOMOTION`, and `tests/golem-arena.test.mjs` is what says so.
 */

/** Which of a golem's five slots the assembly asks about by name. */
export type GolemBuildSlot = "locomotion" | "torso" | "head" | "primary" | "secondary";

/** One thing a picker can offer for one slot. */
export interface GolemSlotOption {
  readonly id: string;
  readonly label: string;
}

const idsForMode = (mode: string): readonly string[] =>
  GOLEM_MODULES.filter((option) => option.mode === mode).map((option) => option.id);

const optionOf = (id: string): GolemSlotOption => {
  const registered = GOLEM_MODULES.find((option) => option.id === id);
  if (!registered) throw new Error(`golem module "${id}" is not registered`);
  return Object.freeze({ id, label: registered.label });
};

// --------------------------------------------------------------------- locomotion, torso, head

/**
 * Every locomotion definition an assembly can stand on.
 *
 * Named rather than derived, for the reason the file docstring gives: a locomotion module's own
 * surface is what an assembly drives, and the registry hands out the narrower bench view. The
 * gate that keeps this honest is a test rather than a type -- `golem-arena` asserts this list and
 * the registry's `locomotion` mode name the same set, and fails naming any that is missing.
 */
export const GOLEM_LOCOMOTION: readonly LocomotionModuleDefinition[] =
  Object.freeze([bipedModule, wheelModule, multilegModule]);

const TORSOS: readonly TorsoModuleDefinition[] = Object.freeze([torsoPlain, torsoPlated]);
const HEADS: readonly HeadModuleDefinition[] = Object.freeze([headPlain, headRam]);

const byId = <T extends { readonly id: string }>(list: readonly T[], id: string): T | null =>
  list.find((entry) => entry.id === id) ?? null;

export const golemLocomotion = (id: string): LocomotionModuleDefinition | null =>
  byId(GOLEM_LOCOMOTION, id);
export const golemTorso = (id: string): TorsoModuleDefinition | null => byId(TORSOS, id);
export const golemHead = (id: string): HeadModuleDefinition | null => byId(HEADS, id);

// ------------------------------------------------------------------------------- the effectors

/**
 * How a terminal describes itself to a mind, which is **not** how it scores.
 *
 * Two different questions with two different right answers, and collapsing them is the defect
 * this table exists to avoid. `Striking.kind` is the bite row -- what `src/scoring.ts` charges for
 * a contact -- and a golem plate takes the bare fist's row because a plate has no edge and no
 * point and is not meant to wound. `HandView.weapon` is what a *policy* reads to decide how to
 * plan a hand, and there the honest word for a plate is a shield: it is interposed rather than
 * swung, which is what `isShield` is asked about and what a plate is for.
 *
 * A `Record` over every terminal, so a terminal added without a description is a compile error
 * rather than a hand that silently reads as empty. The mace and the whip are both `club`, which is
 * their bite row as well: a mind planning either is planning a thing that arrives with mass.
 */
const TERMINAL_DESCRIPTION: Record<TerminalId, WeaponKind> = Object.freeze({
  blade: "sword",
  plate: "shield",
  mace: "club",
  whip: "club",
});

/** One chain-and-terminal pair the registry actually offers. */
export interface GolemEffectorOption extends GolemSlotOption {
  readonly chain: ChainId;
  /** Null for rung 0, which carries its own cap and pairs with no terminal. */
  readonly terminal: TerminalId | null;
  /** How many effector sockets it claims. Two for a mace and one for everything else. */
  readonly sockets: 1 | 2;
  /** What a mind reads off the hand. See `TERMINAL_DESCRIPTION`. */
  readonly weapon: WeaponKind;
  readonly massKg: number;
  readonly definition: GolemModuleDefinition<import("../mind.ts").HandIntent>;
}

const chainOf = (id: string): EffectorChainDefinition | null =>
  Object.hasOwn(EFFECTOR_CHAINS, id)
    ? (EFFECTOR_CHAINS as Record<string, EffectorChainDefinition>)[id]
    : null;
const terminalOf = (id: string): EffectorTerminalDefinition | null =>
  Object.hasOwn(EFFECTOR_TERMINALS, id)
    ? (EFFECTOR_TERMINALS as Record<string, EffectorTerminalDefinition>)[id]
    : null;

/**
 * Every effector option, composed from the two tables the registry itself composes from.
 *
 * `effector.<chain>` and `effector.<chain>.<terminal>` are the two spellings `effectorModule`
 * produces, so parsing them back is reading the registry's own naming rather than inventing a
 * second one. A pair the registry does not offer is not here, which is the picker's "hides pairs
 * the registry does not have" with no second list to keep in step.
 */
export const GOLEM_EFFECTORS: readonly GolemEffectorOption[] = Object.freeze(
  idsForMode("effector").flatMap((id): GolemEffectorOption[] => {
    const parts = id.split(".");
    if (parts[0] !== "effector" || parts.length < 2 || parts.length > 3) return [];
    const chain = chainOf(parts[1]);
    if (!chain) return [];
    const terminal = parts.length === 3 ? terminalOf(parts[2]) : null;
    if (parts.length === 3 && !terminal) return [];
    const definition = effectorModule(chain, terminal);
    if (definition.id !== id) return [];
    return [Object.freeze({
      id,
      label: optionOf(id).label,
      chain: chain.id,
      terminal: terminal ? terminal.id : null,
      sockets: definition.sockets ?? 1,
      weapon: terminal ? TERMINAL_DESCRIPTION[terminal.id] : "empty",
      massKg: definition.massKg,
      definition,
    })];
  }),
);

export const golemEffector = (chain: string, terminal: string): GolemEffectorOption | null =>
  GOLEM_EFFECTORS.find((option) =>
    option.chain === chain && (option.terminal ?? "none") === terminal) ?? null;

/**
 * One effector option by its own id, which is how the parts bin names a salvaged module.
 *
 * The bin stores the registry's own id -- `effector.wrist.blade` -- rather than a chain and a
 * terminal, because that string is what the registry already guarantees is unique and buildable.
 * This is the way back, and `isGolemEffectorOption` beside it is the shelf predicate
 * `decodePartsBin` refuses an unknown id against.
 */
export const golemEffectorOption = (id: string): GolemEffectorOption | null =>
  GOLEM_EFFECTORS.find((option) => option.id === id) ?? null;

export const isGolemEffectorOption = (id: string): boolean => golemEffectorOption(id) !== null;

/**
 * The spelling a `GolemSetup` uses for "this chain carries its own terminal".
 *
 * `null` would have been the honest type and is the wrong one for a `<select>` value and for a
 * matchup that has to survive `structuredClone` and a URL. One word, stated once.
 */
export const NO_TERMINAL = "none" as const;

export const golemChainOptions = (): readonly GolemSlotOption[] => {
  const seen = new Map<string, string>();
  for (const option of GOLEM_EFFECTORS) {
    if (!seen.has(option.chain)) seen.set(option.chain, chainOf(option.chain)?.label ?? option.chain);
  }
  return Object.freeze([...seen].map(([id, label]) => Object.freeze({ id, label })));
};

/** Which terminals a chain is offered with, in registry order. `none` is rung 0's own cap. */
export const golemTerminalOptions = (chain: string): readonly GolemSlotOption[] =>
  Object.freeze(GOLEM_EFFECTORS
    .filter((option) => option.chain === chain)
    .map((option) => Object.freeze({
      id: option.terminal ?? NO_TERMINAL,
      label: option.terminal
        ? terminalOf(option.terminal)?.label ?? option.terminal
        : "its own cap",
    })));

export const golemLocomotionOptions = (): readonly GolemSlotOption[] =>
  Object.freeze(GOLEM_LOCOMOTION.map((definition) => optionOf(definition.id)));
export const golemTorsoOptions = (): readonly GolemSlotOption[] =>
  Object.freeze(TORSOS.map((definition) => optionOf(definition.id)));
export const golemHeadOptions = (): readonly GolemSlotOption[] =>
  Object.freeze(HEADS.map((definition) => optionOf(definition.id)));

/**
 * Every registered module this file cannot resolve to a definition, by id.
 *
 * The half a type cannot state, and the reason it is a function rather than a comment: a module
 * added to `GOLEM_MODULES` without a line here is offered on the bench and not in the arena, which
 * looks exactly like a module that was never registered. `tests/golem-arena.test.mjs` asserts this
 * is empty and prints whatever is in it.
 */
export const unresolvedGolemModules = (): readonly string[] => {
  const resolved = new Set<string>([
    ...GOLEM_EFFECTORS.map((option) => option.id),
    ...GOLEM_LOCOMOTION.map((definition) => definition.id),
    ...TORSOS.map((definition) => definition.id),
    ...HEADS.map((definition) => definition.id),
  ]);
  return Object.freeze(GOLEM_MODULES
    .filter((option) => !resolved.has(option.id))
    .map((option) => option.id));
};

// ------------------------------------------------------------------------------- a whole build

/**
 * The default golem: the top of the chain ladder in both sockets, a blade and a plate.
 *
 * Exactly what the session plan freezes -- "biped, plain torso, a blade on the ladder's top
 * chain, a plate on the same chain, plain head" -- and it is the build every number this session
 * recorded was taken from, so a bout opened without touching the pickers is that measurement's
 * bout. The ids are looked up rather than written, so a default naming a module the registry does
 * not have fails here rather than at the first build.
 */
export function defaultGolemSetup(): GolemSetup {
  const topChain: ChainId = golemEffector("wrist", "blade") ? "wrist" : "pitch";
  return {
    locomotion: GOLEM_LOCOMOTION[0].id,
    torso: TORSOS[0].id,
    head: HEADS[0].id,
    primary: { chain: topChain, terminal: "blade" },
    secondary: { chain: topChain, terminal: "plate" },
  };
}

/**
 * Why this build cannot be assembled, or null when it can.
 *
 * A refusal by name rather than a boolean, for the reason `AGENTS.md` states about ten instances
 * of one bug: a control that accepts an input it cannot act on and says nothing is *nearly*
 * right, which is the failure mode that survives review. Every sentence here names the offending
 * slot and the offending id.
 *
 * **The socket rule is the interesting one.** A golem has exactly two effector sockets, and a
 * mace claims both -- so a build that puts a two-socket terminal in one slot and anything else in
 * the other is asking for three sockets from a body that has two. The reducer in `bout.ts` fills
 * the other slot with the same pair when a two-socket terminal is picked, exactly as the club's
 * two-handed rule already does for a Warrior; this is the same rule stated where a build that
 * never went near the screen is checked.
 */
export function golemSetupRefusal(setup: GolemSetup): string | null {
  if (!golemLocomotion(setup.locomotion)) {
    return `no golem locomotion module "${setup.locomotion}"`;
  }
  if (!golemTorso(setup.torso)) return `no golem torso module "${setup.torso}"`;
  if (!golemHead(setup.head)) return `no golem head module "${setup.head}"`;
  const primary = golemEffector(setup.primary.chain, setup.primary.terminal);
  if (!primary) {
    return `no golem effector "${setup.primary.chain}" + "${setup.primary.terminal}" for the primary socket`;
  }
  const secondary = golemEffector(setup.secondary.chain, setup.secondary.terminal);
  if (!secondary) {
    return `no golem effector "${setup.secondary.chain}" + "${setup.secondary.terminal}" for the secondary socket`;
  }
  if (primary.sockets === 2 || secondary.sockets === 2) {
    if (primary.id !== secondary.id) {
      return `"${primary.id}" and "${secondary.id}" ask for three effector sockets and a golem has two`;
    }
  }
  // A salvaged module's durability, checked where a build that never went near the screen is
  // checked. Refused rather than clamped: a build asking for a blade at 1.4 is a build somebody
  // wrote by hand or a parts bin that got past its own codec, and quietly making it a fresh blade
  // is the substitution this session's codec exists to refuse.
  for (const socket of ["primary", "secondary"] as const) {
    const durability = setup[socket].durability;
    if (durability === undefined) continue;
    if (typeof durability !== "number" || !Number.isFinite(durability) ||
        durability <= 0 || durability > 1) {
      return `the ${socket} socket is fitted at durability ${JSON.stringify(durability)}, which is not a fraction above zero`;
    }
  }
  return null;
}

/** The two effectors a build asks for, and which sockets they take. */
export interface GolemEffectorPlan {
  /** The module built into the primary socket. Never null: every build fills both sockets. */
  readonly primary: GolemEffectorOption;
  /**
   * The module built into the secondary socket, or null when the primary claims both.
   *
   * Null is how a mace is expressed all the way through the assembly: one module, two sockets,
   * one drive and one trailing grip. `effectorModule` is what actually spends the second socket,
   * through `ModuleBuild.companion`; this is the plan that hands it over.
   */
  readonly secondary: GolemEffectorOption | null;
}

export function golemEffectorPlan(setup: GolemSetup): GolemEffectorPlan {
  const refusal = golemSetupRefusal(setup);
  if (refusal) throw new Error(refusal);
  const primary = golemEffector(setup.primary.chain, setup.primary.terminal);
  const secondary = golemEffector(setup.secondary.chain, setup.secondary.terminal);
  if (!primary || !secondary) throw new Error("golem effector plan lost an option it had just found");
  return Object.freeze({ primary, secondary: primary.sockets === 2 ? null : secondary });
}

/**
 * Roughly how big the default golem is, for the registry row that has to say so.
 *
 * `UnitDefinition` carries a reach, a crown height, a vital height and a collision radius, and
 * for a Warrior those four are facts about the unit. For a golem they are facts about the
 * **build**: a wheel is a different height from a biped and a whip is a different reach from a
 * plate, so a per-unit answer can only ever describe one build. This describes the default one,
 * which is the build every number this session recorded was taken from.
 *
 * **It is a second statement of arithmetic the modules already do**, which is the defect this
 * directory keeps paying for, so it comes with the gate that stops it drifting:
 * `tests/golem-arena.test.mjs` assembles a real default golem and asserts its published
 * `BodyView` agrees with every line here. The authority is the assembled body; this is the
 * registry's approximation of it, and the test is what makes that sentence checkable.
 */
export function defaultGolemDimensions(): {
  readonly reach: number;
  readonly crownHeight: number;
  readonly vitalHeight: number;
  readonly collisionRadius: number;
} {
  const setup = defaultGolemSetup();
  const locomotion = golemLocomotion(setup.locomotion);
  if (!locomotion) throw new Error(`the default golem names locomotion "${setup.locomotion}"`);
  const stand = locomotion.heightRange.standM;
  const torso = setup.torso === torsoPlated.id ? TORSO_PLATED : TORSO_PLAIN;
  const brow = setup.head === headRam.id
    ? HEAD_NECK.browOffset + HEAD_RAM.plateTipOffset
    : HEAD_NECK.browOffset;
  const chainReach = setup.primary.chain === "wrist"
    ? CHAIN_REACH.reachMax + CHAIN_WRIST.ringLength + CHAIN_WRIST.wristLength
    : setup.primary.chain === "reach" ? CHAIN_REACH.reachMax
      : setup.primary.chain === "pitch" ? CHAIN_PITCH.linkLength : 0;
  return Object.freeze({
    reach: chainReach + (setup.primary.terminal === "blade" ? TERMINAL_BLADE.tipOffset : 0),
    crownHeight: stand + torso.coreHeight / 2 + torso.neckHeight
      + HEAD_NECK.neckLength + HEAD_NECK.headHeight / 2 + brow,
    vitalHeight: stand + torso.coreHeight / 2,
    collisionRadius: locomotion.footprint.radiusM,
  });
}

/** Everything above the waist, kilograms: what the carrier is asked to hold up. */
export function golemUpperMassKg(setup: GolemSetup): number {
  const torso = golemTorso(setup.torso);
  const head = golemHead(setup.head);
  if (!torso || !head) throw new Error(golemSetupRefusal(setup) ?? "incomplete golem build");
  const plan = golemEffectorPlan(setup);
  return torso.massKg + head.massKg + plan.primary.massKg + (plan.secondary?.massKg ?? 0);
}
