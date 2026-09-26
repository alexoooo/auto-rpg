import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { Striking } from "../../combat.ts";
import type { HandIntent } from "../../mind.ts";
import { isTopological } from "../../forkable.ts";
import { attributeOf, SIZE_LAW_POWER, withSize, type SizeLaws } from "../attributes.ts";
import {
  EFFECTOR_SLOTS,
  rodInertia,
  type BuiltChain,
  type BuiltModule,
  type BuiltTerminal,
  type ChainCrossing,
  type ChainLimits,
  type EffectorAxisView,
  type EffectorChainDefinition,
  type EffectorStroke,
  type EffectorTerminalDefinition,
  type EffectorView,
  type GolemModuleDefinition,
  type GolemPart,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../module.ts";

/**
 * How a terminal's narrowing of the chain, and a two-socket terminal's crossing, follow the body's
 * size stat (`SizeLaw` in `../attributes.ts`). **The terminal is an item and keeps its size; what
 * it narrows is the arm.** Its metres are metres of arm -- the plate's floor on reach, the maul's
 * window, the inboard carry -- so they go with the arm the way `onBoneArm` in
 * `../skeleton/body.ts` fits them onto a shorter one, and its radians are radians on any arm.
 */
export const CHAIN_LIMITS_SIZE: SizeLaws<ChainLimits> = {
  reachMin: "length", reachMax: "length", swingMin: "one", swingMax: "one", liftMin: "one",
  liftMax: "one", carryMin: "length", rollMax: "one", bendMax: "one",
};
export const CHAIN_CROSSING_SIZE: SizeLaws<ChainCrossing> = { swingMin: "one", carryMin: "length" };

/**
 * An effector module is a chain and a terminal, chosen independently.
 *
 * This function is the whole of the glue, and it deliberately switches on nothing. The chain
 * owns motion -- driven axes, drive, envelope, mouse mapping, strokes -- and the terminal owns
 * a collider, a mass, a striker kind, a layer and a shell, so there is no third thing for a
 * pairing to decide and therefore no branch here that could quietly substitute one option for
 * another. That matters because a ternary chain with a default branch is exactly how a shield
 * shipped as a club in this directory: it compiled, passed `tsc`, passed the build, and put a
 * shield-shaped thing in the arena that scored crushing blows and severed limbs.
 *
 * The one thing this does decide is a **refusal**, and it is a refusal rather than a fallback:
 * a chain that carries its own terminal cannot be given one, a chain that hands out a weld has
 * to be given one, a two-socket terminal has to be given a second socket, and a terminal has to
 * offer at least one striker. All four throw, at build, naming the pair.
 *
 * ## The two-socket seam
 *
 * Session 03 left this file pairing one chain with one terminal, and
 * `EffectorTerminalDefinition.sockets` declared but unread. Session 04's mace read it and built
 * the second chain **unmotorised**, held to a bar at a second grip, on the club's measured
 * lesson that two position motors on one rigid body fight (`CONFIG.club.trailingGrip`). That
 * was true and it was also the whole of why the mace did nothing: a carried arm adds no force,
 * a second grip on straight arms pins the swing, the roll and the bend, and the weapon scored
 * 8.3 damage a bout against a blade's 72.6.
 *
 * The matchup set's Session 02 replaced it with the maul, and the seam is now the other thing
 * the club's sweep could not try: **two motors, one point.** The fight in that sweep was two
 * anchors asked for poses their chains disagreed about; two anchors asked for the *same* point
 * are two force budgets pulling one way.
 *
 * - the chain in `ctx.socket` is built with the terminal's `limits` and is the one that is
 *   commanded, published and measured -- it carries the weld;
 * - the chain in `ctx.companion` is built with no narrowing, keeps its drive, and is sent every
 *   step to the driven chain's **commanded** weld point through `BuiltChain.commandWeldTo`. It
 *   is never handed a cursor: what it follows is where the first hand has been told to be, not
 *   where it is, so a lagging driven hand is not a target that lags with it;
 * - the terminal is welded to the first chain's weld and takes its second grip on the second
 *   chain itself, once that hand arrives (`BuiltTerminal.step`). The two chains are built
 *   mirrored, so at construction the second hand is a socket-separation away from the grip and a
 *   constraint built then would be born violated.
 *
 * A chain that cannot bring its hand to a point -- rung 1, with one axis -- cannot share a grip,
 * and a two-socket terminal on one is refused at build by name rather than built with a second
 * hand waving somewhere near the haft.
 */
/**
 * One chain's built links at a body factor, under the terminal it carries. Every chain carries the
 * whole terminal's mass, as `build` hands it to both chains of a paired grip.
 */
function chainMassAt(chain: EffectorChainDefinition, terminal: EffectorTerminalDefinition | null, body: number): number {
  return chain.massAtKg ? chain.massAtKg(terminal?.massKg ?? 0, body) : chain.massKg * body;
}

export function effectorModule(
  chain: EffectorChainDefinition,
  selectedTerminal: EffectorTerminalDefinition | null,
): GolemModuleDefinition<HandIntent> {
  const terminal = selectedTerminal && chain.fitTerminal ? chain.fitTerminal(selectedTerminal) : selectedTerminal;
  const id = terminal ? `effector.${chain.id}.${terminal.id}` : `effector.${chain.id}`;
  const sockets = terminal?.sockets ?? 1;
  return Object.freeze({
    id,
    slots: EFFECTOR_SLOTS,
    label: terminal ? `${chain.label} + ${terminal.label}` : chain.label,
    sockets,
    // Both chains, for a terminal that claims both sockets. A mass that counted one arm would
    // be a picker line saying a two-armed weapon weighs what a one-armed one does.
    massKg: chainMassAt(chain, terminal, 1) * sockets + (terminal?.massKg ?? 0),
    itemMassKg: terminal?.massKg ?? 0,
    massAtKg: (body: number): number => chainMassAt(chain, terminal, body) * sockets + (terminal?.massKg ?? 0),

    build(ctx: ModuleBuild): BuiltModule<HandIntent> {
      const size = attributeOf(ctx, "size");
      const limits = terminal?.limits ? withSize(terminal.limits, CHAIN_LIMITS_SIZE, size) : null;
      const built = chain.build(ctx, limits, null, terminal?.massKg ?? 0);

      // The trailing chain is built before the terminal, because the terminal needs its weld --
      // and everything built here is taken down again if any of the four refusals fires, which
      // is the transaction rule a throwing constructor otherwise breaks: it leaves its caller no
      // object to dispose, and the last time that happened in this directory it leaked 44
      // meshes, 22 animation groups and 19 physics bodies.
      const { trailing, end } = ((): {
        readonly trailing: BuiltChain | null;
        readonly end: BuiltTerminal;
      } => {
        let second: BuiltChain | null = null;
        try {
          if (terminal && !built.weld) {
            throw new Error(`${id}: chain "${chain.id}" carries its own terminal and cannot take "${terminal.id}"`);
          }
          if (sockets === 2 && terminal) {
            const companion = ctx.companion ?? null;
            if (!companion) {
              throw new Error(`${id}: this terminal claims both effector sockets and the build offers one`);
            }
            if (companion.slot === ctx.socket.slot) {
              throw new Error(`${id}: the ${companion.slot} socket was handed over twice`);
            }
            // The same chain definition, mirrored by its own socket's `outboard`, and built with
            // no narrowing: it is sent to a point rather than a cursor, so what bounds it is its
            // own shell and the narrowing is the *driven* chain's business -- the terminal's
            // `limits` are what keep the shared grip inside this chain's reach.
            if (!terminal.crossing) {
              throw new Error(`${id}: terminal "${terminal.id}" claims both sockets and grants its second hand no crossing`);
            }
            // The whole mass again, not half: which hand the bar leans on depends on the pose,
            // and a ring cast for half a maul is a ring that sags whenever it is the one holding it.
            second = chain.build(
              { ...ctx, name: `${ctx.name}.trailing`, socket: companion },
              null, withSize(terminal.crossing, CHAIN_CROSSING_SIZE, size), terminal.massKg,
            );
            if (!second.weld) {
              throw new Error(`${id}: chain "${chain.id}" hands out no weld for a trailing grip`);
            }
            if (!second.commandWeldTo) {
              throw new Error(
                `${id}: chain "${chain.id}" cannot bring its hand to a point, so it cannot share a grip`,
              );
            }
          }

          let made: BuiltTerminal | null = null;
          if (terminal && built.weld) {
            const mount = terminal.attachment ?? "socket";
            const onto = built.attachment?.(mount) ?? built.weld;
            if ((onto.kind ?? "socket") !== mount) throw new Error(`${id}: incompatible ${mount} equipment attachment`);
            made = terminal.build(ctx, onto, second?.weld ?? null);
          }
          else made = built.ownTerminal;
          if (!made) {
            throw new Error(`${id}: chain "${chain.id}" hands out a weld and has to be paired with a terminal`);
          }
          if (made.strikers.length === 0) {
            made.dispose();
            throw new Error(`${id}: this terminal offers no striker, so nothing it hits would score`);
          }
          return { trailing: second, end: made };
        } catch (failure) {
          second?.dispose();
          built.dispose();
          throw failure;
        }
      })();

      const parts: readonly GolemPart[] = Object.freeze([
        ...built.parts, ...(trailing?.parts ?? []), ...end.parts.map(part => terminal?.partRole
          ? { ...part, combatRole: terminal.partRole, ...(terminal.appearance ? { appearance: terminal.appearance } : {}),
              ...(terminal.partRole === "equipment" ? { vitalityWeight: 0 } : {}) } : part),
      ]);
      const strikers: readonly Striking[] = Object.freeze([...end.strikers]);
      // The business end, which is the first striker by contract: the tip and the edge are read
      // from it, and a whip's is its last segment rather than the one nearest the wrist.
      const business = end.strikers[0];
      // How far the business end is from the socket: the chain's own reach out to the weld,
      // plus the terminal's length beyond it. Fixed at build, because both halves are.
      const tipToSocket = built.reach + end.tipOffset;
      // **And told to the chain, once, because a chain that can bend aims through its terminal.**
      // Rung 3's bend hinge swings the tip off the radial line by an arc the whole length of what
      // is welded on, and the mind's reach model has the overhang collinear -- so without this the
      // chain is asked for a point and silently delivers a different one. Every rung below points
      // its terminal straight out of the forearm and declines the call.
      // **Gated on the edge, and the gate is load-bearing rather than tidy.** The correction models
      // the terminal as a rigid stick the bend swings about the ring, and it aims the *tip*. That
      // is a true model of a sword and a false one of everything else on the shelf: a whip's lash
      // is not rigid, and a plate's tip is not what anybody aims -- a shield is pointed by its
      // face. Ungated, this moved both: the whip's crack fell from 25.78 m/s to 20.41 and stopped
      // outrunning its own drop, and a bout where one side carries a plate ended in 0.7 s having
      // carried no shield at all. The blade is the only `edge` on the shelf, which is the same
      // gate the edge-squaring law takes and for the same reason.
      if (terminal?.bite === "edge") built.aimThrough?.(tipToSocket);
      // **And what it weighs to turn, which is a different number from what it weighs.**
      // Read off the built bodies rather than derived, because the terminal already told the
      // solver its own shape and a formula here would be a second opinion about it. The largest
      // principal inertia across the terminal's parts is the one the weld has to hold: a blade
      // is 5.3e-2 about the two axes across it and 2.2e-4 along, and it is the across that
      // throws a 1.3e-3 link. Ungated, unlike the aim above -- every terminal on the shelf is
      // welded through the same locked constraint, and a fist is simply already under the floor.
      let carriedInertia = 0;
      for (const piece of end.parts) {
        const spread = piece.part.body.getMassProperties().inertia;
        if (spread) carriedInertia = Math.max(carriedInertia, spread.x, spread.y, spread.z);
      }
      built.castToCarried?.(carriedInertia);
      const chainEnvelope = built.envelope();
      // What this pair costs to swing about its socket, kg m2. The chain states its own links --
      // it is the only thing that knows how its mass is laid out along itself -- and the terminal's
      // share is computed here from three numbers this scope already holds: its mass, how far the
      // weld is from the socket, and how far it reaches beyond the weld. A terminal therefore
      // declares nothing new and stays a collider, a mass, a striker kind, a layer and a shell,
      // which is the rule the top of this file exists to keep.
      //
      // `sockets` multiplies the chain and not the terminal, for the same reason `massKg` above
      // does: a two-handed bar is carried by two arms and there is still one bar.
      //
      // The body's weight stat multiplies the chain's share and not the terminal's, which is an
      // item (`withWeight`); every link is a rod whose inertia is linear in its mass. Its size stat
      // multiplies the chain's share by its law, a mass times a length squared (`SizeLaw`), and
      // reaches the terminal's through `built.reach`, the sized arm it hangs from.
      const swingInertia = chain.swingInertia * sockets * attributeOf(ctx, "weight")
        * size ** SIZE_LAW_POWER.inertia
        + rodInertia(terminal?.massKg ?? 0, built.reach, tipToSocket);
      const envelope: ModuleEnvelope = Object.freeze({
        ...(chainEnvelope.fullOrientation ? { fullOrientation: true } : {}),
        axes: chainEnvelope.axes,
        reach: tipToSocket,
        swingInertia,
        // The chain's, unchanged: what a module can be *asked* for and what it can *reach* are
        // both the chain's business, and a terminal that altered either behind the chain's back
        // would be a terminal contributing to control. A two-socket terminal does alter them --
        // and it does so by *declaring* `limits`, which the chain above was built with and has
        // already folded into what it publishes here. The one field the pairing changes on its
        // own is the reach, because that is the one thing the terminal's own length is part of.
        strokes: chainEnvelope.strokes,
        reachable: chainEnvelope.reachable,
        settledBand: chainEnvelope.settledBand,
        // The chain's, like the axes: what the arm's build did to its drive (`ArmDrive`). The
        // terminal's share of the load is in `swingInertia` above.
        ...(chainEnvelope.drive ? { drive: chainEnvelope.drive } : {}),
      });

      // The view is one object with getters, allocated once and never replaced. Each getter
      // returns a ref its owner keeps, so publishing this 240 times a second allocates
      // nothing -- and every one of them reaches the world transform through `mesh.position`
      // and `mesh.rotationQuaternion` alone. See `RigidStrike` for why that is not optional.
      const slot = ctx.socket.slot;
      // **Whether there is an edge to report is the terminal's answer, not the chain's.** A
      // capped socket bites with mass, so an edge alignment taken off it would be a number with
      // no meaning that a readout would nonetheless print -- and a number that means nothing is
      // exactly what this plan set exists to stop being quoted. Settled once, at build, from the
      // definition's own bite row. A plate, a mace and a whip all answer null here.
      const hasEdge = terminal?.bite === "edge";
      const view: EffectorView = {
        slot,
        get tip(): Vector3 { return business.tipPosition(); },
        get commandedTip(): Vector3 { return built.commandedEnd(tipToSocket); },
        get axes(): readonly EffectorAxisView[] { return built.axes(); },
        get stroke(): EffectorStroke { return built.stroke(); },
        get anchor(): Vector3 | null { return built.anchor(); },
        get anchorStray(): number | null { return built.anchorStray(); },
        get edge(): Vector3 | null { return hasEdge ? business.edgeDirection() : null; },
        get gripStray(): number | null { return end.gripStray(); },
        get orientation() { return built.orientation?.(); },
      };

      let severed = false;
      // The pieces whose ruin takes the arm: the chains', and never the terminal's. A blade beaten
      // to nothing is still a blade on a working arm; a forearm beaten to nothing is not an arm.
      const limbIds = new Set([...built.parts, ...(trailing?.parts ?? [])].map((part) => part.id));
      let limp = false;
      return Object.freeze({
        parts,
        strikers,
        command: (next: HandIntent) => built.command(next),
        step: (dt: number) => {
          built.step(dt);
          if (trailing) {
            // **To the commanded weld, not the achieved one.** `commandedEnd` at the chain's own
            // reach is where the driven weld has been told to be after the rate limit, which is
            // the one point both anchors can agree on; the achieved weld is wherever the mass
            // has let the first hand get to so far, and a second hand chasing that would arrive
            // late by construction and pull the first one back toward where it already was.
            trailing.commandWeldTo?.(built.commandedEnd(built.reach + (terminal?.trailingGripOffsetM ?? 0)), built.commandedOrientation?.());
            trailing.step(dt);
          }
          // After both chains, so that a grip taken this step is taken against where the hands
          // are after their drives have been written.
          end.step?.(dt);
        },
        envelope: () => envelope,
        view: () => view,
        // The driven chain's, and never the trailing one's. A maul's second arm follows the
        // first's commanded point rather than a cursor of its own, so it has no pose of its own
        // to seed and asking it would hand a takeover the cursor for an arm nobody drives.
        cursor: () => built.cursor(),
        // **Both chains, whichever was struck.** A maul's second hand holds the same haft, so a
        // ruined link on either arm is the end of wielding it; and a trailing arm left driven
        // after the first went slack would haul the weapon on its own.
        ruin: (partId: string) => {
          if (severed || limp || !limbIds.has(partId)) return;
          limp = true;
          built.limp();
          trailing?.limp();
        },
        sever: () => {
          if (severed) return;
          severed = true;
          // The terminal first: it becomes debris and stops scoring, and only then does the
          // chain let go of it. The other order leaves a live striker on a body nothing is
          // holding for the length of one call.
          end.sever();
          built.sever();
          trailing?.sever();
        },
        dispose: () => {
          // The terminal before the chains: its welds are anchored into their last links, and
          // disposing a link's body first would leave a constraint pointing at a freed Havok
          // body. `PhysicsBody.dispose` walks straight past whatever is constraining it.
          end.dispose();
          built.dispose();
          trailing?.dispose();
        },
        // A fork of the world (`src/forkable.ts`): every let and private object this closure steps on,
        // and the terminal's topology -- a maul's second grip is a joint made mid-bout.
        captureTopology: (): unknown => (isTopological(end) ? end.captureTopology() : null),
        restoreTopology: (topology: unknown): void => {
          if (topology !== null && isTopological(end)) end.restoreTopology(topology);
        },
        captureState: (): Record<string, unknown> => ({
          severed, limp, built, trailing, end, ctx, view, limbIds, limits, envelope,
        }),
        restoreState: (state: Record<string, unknown>): void => {
          ({ severed, limp } = state as never);
        },
      });
    },
  });
}
