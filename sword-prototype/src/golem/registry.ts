import type { Striking } from "../combat.ts";
import type { HandIntent, Intent } from "../mind.ts";
import { formatLocomotion, locomotionCommand } from "./locomotion.ts";
import { bipedModule } from "./locomotion/biped.ts";
import { effectorModule } from "./effectors/effector.ts";
import { noneChain } from "./effectors/chains/none.ts";
import { pitchChain } from "./effectors/chains/pitch.ts";
import { reachChain } from "./effectors/chains/reach.ts";
import { wristChain } from "./effectors/chains/wrist.ts";
import { bladeTerminal } from "./effectors/terminals/blade.ts";
import {
  effectorSlot,
  type BuiltModule,
  type ChainId,
  type EffectorChainDefinition,
  type EffectorTerminalDefinition,
  type EffectorView,
  type GolemModuleDefinition,
  type GolemPart,
  type GolemSlot,
  type ModuleBuild,
  type ModuleEnvelope,
  type TerminalId,
} from "./module.ts";

/**
 * Everything the bench can show, and the one place a later session adds to.
 *
 * **The bench carries no list of its own.** `src/bench/main.ts` reads `GOLEM_MODULES` and
 * builds its picker from it, so Session 03's two chains, Session 04's three terminals, Session
 * 05's locomotion modules and Session 07's torso and head appear on the page by registration
 * alone. The order of that array is the order of the number keys.
 *
 * **The seam is one line.** A session adds its file and appends one entry to `GOLEM_MODULES`
 * (plus, for a chain or a terminal, one line to `EFFECTOR_CHAINS` or `EFFECTOR_TERMINALS`).
 * Nothing in the middle of this file, and nothing at all in `src/bench/main.ts`, has to change
 * -- which is what lets Sessions 05 and 07 run in parallel.
 */

/**
 * What kind of thing is on the stand.
 *
 * Declared as a union with a `never`-defaulted label below, so a mode added without a label is
 * a compile error rather than a picker heading that silently says nothing. The bench's own
 * behaviour does **not** switch on it: an option is driven through `command(intent)` whatever
 * its mode, and the readout is drawn when `view()` is non-null. That is deliberate -- a
 * dispatch on mode would be the thing Session 05 and Session 07 both had to edit.
 */
export type GolemBenchMode = "effector" | "locomotion" | "torso" | "head";

export const benchModeLabel = (mode: GolemBenchMode): string => {
  switch (mode) {
    case "effector": return "effectors";
    case "locomotion": return "locomotion";
    case "torso": return "torsos";
    case "head": return "heads";
    // A union switched on gets a `never` default, so a mode without a label fails to compile
    // instead of falling through to a plausible-looking neighbour.
    default: {
      const unlabelled: never = mode;
      throw new Error(`no bench label for mode ${String(unlabelled)}`);
    }
  }
};

/**
 * What a module offers the *bench* beyond the module contract, or null when it offers nothing.
 *
 * Appended by Session 05, and it is a generalisation rather than a special case. The bench draws
 * its readout from `view()` and drives everything through `command(intent)`, both of which are
 * exactly right for an effector and empty for a module with no tip: a locomotion module's readout
 * is a support state, a carrier speed and a foot slip, and none of those is an `EffectorView`
 * field. A dispatch on `GolemBenchMode` in `src/bench/main.ts` would be the thing Sessions 05, 06
 * and 07 all had to edit, which is what the mode's own comment says must not happen -- so the
 * *module* says what extra the bench should show and what extra key it answers to, and the bench
 * shows and calls it without knowing what kind of thing it is.
 *
 * Both members exist because the session plan names both: "Readout: commanded versus actual
 * carrier speed, support state, posture evidence, foot slip while planted, rise time", and "a key
 * applies a measured shove (a specific impulse, not a force) to the torso so knockdown can be seen
 * on demand".
 */
export interface BenchFixture {
  /** Extra readout lines, appended under the instrument's own. */
  lines(): readonly string[];
  /** What the bench's shove key does, or null for a module that cannot be knocked down. */
  readonly shove: (() => void) | null;
}

/**
 * A built module with its command channel already bound to the whole `Intent`.
 *
 * This is the seam that keeps the bench free of per-mode dispatch. A registration says how a
 * person's command reaches its module -- an effector takes `intent.primary` or
 * `intent.secondary` depending on which socket it was built into, a locomotion module will take
 * the movement axes and the crouch, a head will take `intent.natural` -- and the bench simply
 * hands the whole command over. `Intent` is not widened by any of that: the adapter narrows,
 * which is the direction the one-seam rule allows.
 */
export interface BenchModule {
  readonly parts: readonly GolemPart[];
  readonly strikers: readonly Striking[];
  /** Null for a module with nothing to add to the bench. Every effector answers null. */
  readonly fixture: BenchFixture | null;
  command(intent: Intent): void;
  step(dt: number): void;
  envelope(): ModuleEnvelope;
  view(): EffectorView | null;
  sever(): void;
  dispose(): void;
}

export interface GolemBenchOption {
  readonly id: string;
  readonly label: string;
  readonly mode: GolemBenchMode;
  readonly slots: readonly GolemSlot[];
  readonly massKg: number;
  build(ctx: ModuleBuild): BenchModule;
}

function benchOption<Command, Built extends BuiltModule<Command> = BuiltModule<Command>>(
  // The intersection is what keeps `fixture` honest: a definition whose `build` returns something
  // richer than `BuiltModule` -- a locomotion module returns a `BuiltLocomotion` -- infers `Built`
  // as that richer type, so the hook sees the module's own surface without a cast and an effector
  // that passes no hook is unaffected.
  definition: Omit<GolemModuleDefinition<Command>, "build"> & { build(ctx: ModuleBuild): Built },
  mode: GolemBenchMode,
  adapt: (intent: Intent, ctx: ModuleBuild) => Command,
  /** What this module offers the bench beyond the contract. Absent for every effector. */
  fixture?: (built: Built) => BenchFixture,
): GolemBenchOption {
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    mode,
    slots: definition.slots,
    massKg: definition.massKg,
    build(ctx: ModuleBuild): BenchModule {
      const built: Built = definition.build(ctx);
      return Object.freeze({
        parts: built.parts,
        strikers: built.strikers,
        fixture: fixture ? fixture(built) : null,
        command: (intent: Intent) => built.command(adapt(intent, ctx)),
        step: (dt: number) => built.step(dt),
        envelope: () => built.envelope(),
        view: () => built.view(),
        sever: () => built.sever(),
        dispose: () => built.dispose(),
      });
    },
  });
}

/** An effector reads the hand channel of the socket it was built into, and nothing else. */
const handChannel = (intent: Intent, ctx: ModuleBuild): HandIntent => {
  const hand = effectorSlot(ctx.socket.slot);
  if (!hand) throw new Error(`an effector cannot be built into the ${ctx.socket.slot} slot`);
  return intent[hand];
};

/**
 * The chain ladder, as far as it has actually been built.
 *
 * `satisfies` over a partial `Record` keyed by `ChainId` is what makes this a table rather than
 * a list: a key that is not a rung of the ladder fails to compile, and so does a definition
 * whose own `id` disagrees with the key it is filed under -- which is the drift that turns a
 * registry into a lie. What it deliberately does **not** do is demand every rung be present:
 * rungs 2 and 3 are Session 03's and the ladder is an order of construction.
 */
export const EFFECTOR_CHAINS = {
  none: noneChain,
  pitch: pitchChain,
  reach: reachChain,
  wrist: wristChain,
} as const satisfies { readonly [K in ChainId]?: EffectorChainDefinition & { readonly id: K } };

/** The terminal shelf, same rule. Session 04 appends `plate`, `mace` and `whip`. */
export const EFFECTOR_TERMINALS = {
  blade: bladeTerminal,
} as const satisfies {
  readonly [K in TerminalId]?: EffectorTerminalDefinition & { readonly id: K };
};

export type BuiltChainId = keyof typeof EFFECTOR_CHAINS;
export type BuiltTerminalId = keyof typeof EFFECTOR_TERMINALS;

/**
 * Every option the bench offers, in picker order.
 *
 * Built from the two tables above rather than from free-hand strings, so an option's id is
 * composed from definitions that exist and cannot name a chain or terminal that does not. That
 * is the "unbuilt option fails to compile" rule as far as it can honestly go here: the ladder
 * unions are the *design* and are deliberately ahead of the code, so completeness is enforced
 * over what is built rather than over what is planned. `tests/golem-bench.test.mjs` asserts
 * that every registered id is unique and composes from its own definitions, which is the half
 * a type cannot state.
 */
export const GOLEM_MODULES: readonly GolemBenchOption[] = Object.freeze([
  benchOption(effectorModule(EFFECTOR_CHAINS.none, null), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.pitch, EFFECTOR_TERMINALS.blade), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.reach, EFFECTOR_TERMINALS.blade), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.wrist, EFFECTOR_TERMINALS.blade), "effector", handChannel),
  // Session 04: each accepted chain against plate, mace and whip.
  // Session 05: the locomotion contract's first module. One line, and the bench's own dispatch
  // is untouched -- what is new is the fixture hook, which any later non-effector module uses.
  benchOption(bipedModule, "locomotion", locomotionCommand, (built) => Object.freeze({
    lines: () => formatLocomotion(built.readout(), built.evidence()),
    shove: () => built.shove(),
  })),
  // Session 06: locomotion.wheel and locomotion.multileg.
  // Session 07: torso.plain, torso.plated, head.plain, head.ram.
]);

export const golemModule = (id: string): GolemBenchOption | null =>
  GOLEM_MODULES.find((option) => option.id === id) ?? null;

/** The modes that actually have something registered, in the order they first appear. */
export const golemBenchModes = (): readonly GolemBenchMode[] => {
  const seen: GolemBenchMode[] = [];
  for (const option of GOLEM_MODULES) if (!seen.includes(option.mode)) seen.push(option.mode);
  return Object.freeze(seen);
};

export const golemModulesForMode = (mode: GolemBenchMode): readonly GolemBenchOption[] =>
  Object.freeze(GOLEM_MODULES.filter((option) => option.mode === mode));
