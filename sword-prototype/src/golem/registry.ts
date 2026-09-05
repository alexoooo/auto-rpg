import type { Striking } from "../combat.ts";
import type { HandIntent, Intent, NaturalIntent } from "../mind.ts";
import { formatLocomotion, locomotionCommand, type LocomotionHeightRange } from "./locomotion.ts";
import { bipedModule } from "./locomotion/biped.ts";
import { multilegModule } from "./locomotion/multileg.ts";
import { wheelModule } from "./locomotion/wheel.ts";
import { effectorModule } from "./effectors/effector.ts";
import { headPlain } from "./head/plain.ts";
import { headRam } from "./head/ram.ts";
import { torsoPlain } from "./torso/plain.ts";
import { torsoPlated } from "./torso/plated.ts";
import type { TorsoCommand } from "./torso/torso.ts";
import { noneChain } from "./effectors/chains/none.ts";
import { pitchChain } from "./effectors/chains/pitch.ts";
import { reachChain } from "./effectors/chains/reach.ts";
import { wristChain } from "./effectors/chains/wrist.ts";
import { bladeTerminal } from "./effectors/terminals/blade.ts";
import { maceTerminal } from "./effectors/terminals/mace.ts";
import { plateTerminal } from "./effectors/terminals/plate.ts";
import { whipTerminal } from "./effectors/terminals/whip.ts";
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
  type GolemSocket,
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
  /**
   * Where this module offers to carry another one, forwarded from the built module.
   *
   * Present on the bench's own view of a module because the bench is the first thing that wants
   * to stand one module on another: a torso carries a head, and the gate for Session 07 asks the
   * owner to lean a trunk *with a head on it*. Optional and slot-keyed, so nothing on the page has
   * to know what a torso is -- it asks whatever is on the stand whether it has a neck.
   */
  socket?(slot: GolemSlot): GolemSocket | null;
  sever(): void;
  dispose(): void;
}

export interface GolemBenchOption {
  readonly id: string;
  readonly label: string;
  readonly mode: GolemBenchMode;
  readonly slots: readonly GolemSlot[];
  readonly massKg: number;
  /**
   * How many of its slot's sockets this option claims. Two for a mace and one for everything
   * else, taken from the definition rather than written down here.
   *
   * The bench reads it and nothing else does yet: two-effector mode puts one module in each
   * socket, and a module that has already claimed both cannot share the stand with a second.
   */
  readonly sockets: 1 | 2;
  /**
   * Where this option's own socket stands above the floor, metres, or null for a module that does
   * not decide one. Appended by Session 06.
   *
   * Only a locomotion module answers it, because only a locomotion module *is* the thing between
   * the golem and the ground: the biped stands at 1.020 m, the wheel at 1.160 and the multileg at
   * 0.640, and that height is the trade rather than a detail -- a lower socket is a lower effector
   * and a lower head. The bench reads it to put the stand's block where the module under test
   * expects it; forwarded from the definition's own `heightRange` rather than written down here,
   * so a module and its stand cannot disagree.
   */
  readonly standHeightM: number | null;
  build(ctx: ModuleBuild): BenchModule;
}

function benchOption<Command, Built extends BuiltModule<Command> = BuiltModule<Command>>(
  // The intersection is what keeps `fixture` honest: a definition whose `build` returns something
  // richer than `BuiltModule` -- a locomotion module returns a `BuiltLocomotion` -- infers `Built`
  // as that richer type, so the hook sees the module's own surface without a cast and an effector
  // that passes no hook is unaffected.
  // `heightRange` is optional and only a locomotion definition carries one, which is why it is an
  // optional member of the parameter's own type rather than a second overload: every other slot's
  // definition stays assignable unchanged, and the field is forwarded rather than transcribed.
  definition: Omit<GolemModuleDefinition<Command>, "build"> & { build(ctx: ModuleBuild): Built }
    & { readonly heightRange?: LocomotionHeightRange },
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
    sockets: definition.sockets ?? 1,
    standHeightM: definition.heightRange?.standM ?? null,
    build(ctx: ModuleBuild): BenchModule {
      // `Built`, not `BuiltModule<Command>`: Session 05's fixture hook needs the module's own
      // richer surface (a locomotion module returns a `BuiltLocomotion`) and Session 07's socket
      // forwarding needs only the contract, so the narrower annotation would have cost the
      // fixture its type and bought nothing.
      const built: Built = definition.build(ctx);
      const hosts = built.socket;
      return Object.freeze({
        parts: built.parts,
        strikers: built.strikers,
        fixture: fixture ? fixture(built) : null,
        command: (intent: Intent) => built.command(adapt(intent, ctx)),
        step: (dt: number) => built.step(dt),
        envelope: () => built.envelope(),
        view: () => built.view(),
        // Forwarded rather than re-derived, and only when the module has one. A module that hosts
        // nothing keeps the field absent, which is what lets the bench ask every option the same
        // question without a table of which ones can answer it.
        ...(hosts ? { socket: (slot: GolemSlot) => hosts.call(built, slot) } : {}),
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
 * A trunk reads the posture channel, and only the two numbers of it that are its own.
 *
 * `Intent.posture` also carries `crouch`, which belongs to the locomotion module -- so this is a
 * narrowing and not a forwarding, which is the direction the one-seam rule allows. No allocation:
 * `PostureIntent` already satisfies `TorsoCommand` structurally, so the whole adapter is a field
 * read at a control boundary.
 */
const postureChannel = (intent: Intent): TorsoCommand => intent.posture;

/**
 * A head reads the natural channel: the two buttons a body with no hands is driven by.
 *
 * **This is the writer the rule is about.** A command channel with no writer is a button a person
 * cannot press, and it looks exactly like a body that does not work -- which is on record for
 * this exact channel: Session 17 gave a natural striker its own `Intent.natural`, the body side
 * moved onto it, every test drove it, and the *host* side was left behind, so somebody could take
 * a centipede, walk it around and find the attack button dead. The writers are
 * `applyButtonPose` in `src/buttons.ts` for a person and `Mind.decide` for a policy; this is
 * where what they wrote arrives.
 */
const naturalChannel = (intent: Intent): NaturalIntent => intent.natural;

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

/** The terminal shelf, same rule. Session 04 appended `plate`, `mace` and `whip`. */
export const EFFECTOR_TERMINALS = {
  blade: bladeTerminal,
  plate: plateTerminal,
  mace: maceTerminal,
  whip: whipTerminal,
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
  // Session 04's terminals, on every chain that can carry them. **The absences are the design
  // rather than a gap.** A pair that is not here is a pair that cannot be built: rung 0 hands out
  // no weld at all, so nothing pairs with it; and the whip is offered on the wrist chain alone,
  // because a lash's start is which way the roll points it and rungs 1 and 2 have no roll to
  // point with. The overview's terminal table is where both of those are argued.
  benchOption(effectorModule(EFFECTOR_CHAINS.pitch, EFFECTOR_TERMINALS.plate), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.reach, EFFECTOR_TERMINALS.plate), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.wrist, EFFECTOR_TERMINALS.plate), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.pitch, EFFECTOR_TERMINALS.mace), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.reach, EFFECTOR_TERMINALS.mace), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.wrist, EFFECTOR_TERMINALS.mace), "effector", handChannel),
  benchOption(effectorModule(EFFECTOR_CHAINS.wrist, EFFECTOR_TERMINALS.whip), "effector", handChannel),
  // Session 05: the locomotion contract's first module. One line, and the bench's own dispatch
  // is untouched -- what is new is the fixture hook, which any later non-effector module uses.
  benchOption(bipedModule, "locomotion", locomotionCommand, (built) => Object.freeze({
    lines: () => formatLocomotion(built.readout(), built.evidence()),
    shove: () => built.shove(),
  })),
  // Session 06: locomotion.wheel and locomotion.multileg, on the same one-line seam and with the
  // same fixture hook. The three differ in their config blocks and in nothing else here, which is
  // the contract doing its job -- the bench's own dispatch is still untouched.
  benchOption(wheelModule, "locomotion", locomotionCommand, (built) => Object.freeze({
    lines: () => formatLocomotion(built.readout(), built.evidence()),
    shove: () => built.shove(),
  })),
  benchOption(multilegModule, "locomotion", locomotionCommand, (built) => Object.freeze({
    lines: () => formatLocomotion(built.readout(), built.evidence()),
    shove: () => built.shove(),
  })),
  // Session 07's two trunks and two heads, on the same one-line seam as everything above.
  benchOption(torsoPlain, "torso", postureChannel),
  benchOption(torsoPlated, "torso", postureChannel),
  benchOption(headPlain, "head", naturalChannel),
  benchOption(headRam, "head", naturalChannel),
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
