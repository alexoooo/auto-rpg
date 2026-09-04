import type { Striking } from "../combat.ts";
import type { HandIntent, Intent } from "../mind.ts";
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

function benchOption<Command>(
  definition: GolemModuleDefinition<Command>,
  mode: GolemBenchMode,
  adapt: (intent: Intent, ctx: ModuleBuild) => Command,
): GolemBenchOption {
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    mode,
    slots: definition.slots,
    massKg: definition.massKg,
    build(ctx: ModuleBuild): BenchModule {
      const built: BuiltModule<Command> = definition.build(ctx);
      return Object.freeze({
        parts: built.parts,
        strikers: built.strikers,
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
  // Session 05: locomotion.biped and its siblings, with mode "locomotion".
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
