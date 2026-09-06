import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { Striking } from "../../combat.ts";
import type { HandIntent } from "../../mind.ts";
import {
  EFFECTOR_SLOTS,
  type BuiltChain,
  type BuiltModule,
  type BuiltTerminal,
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
export function effectorModule(
  chain: EffectorChainDefinition,
  terminal: EffectorTerminalDefinition | null,
): GolemModuleDefinition<HandIntent> {
  const id = terminal ? `effector.${chain.id}.${terminal.id}` : `effector.${chain.id}`;
  const sockets = terminal?.sockets ?? 1;
  return Object.freeze({
    id,
    slots: EFFECTOR_SLOTS,
    label: terminal ? `${chain.label} + ${terminal.label}` : chain.label,
    sockets,
    // Both chains, for a terminal that claims both sockets. A mass that counted one arm would
    // be a picker line saying a two-armed weapon weighs what a one-armed one does.
    massKg: chain.massKg * sockets + (terminal?.massKg ?? 0),

    build(ctx: ModuleBuild): BuiltModule<HandIntent> {
      const built = chain.build(ctx, terminal?.limits ?? null, null, terminal?.massKg ?? 0);

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
              null, terminal.crossing, terminal.massKg,
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
          if (terminal && built.weld) made = terminal.build(ctx, built.weld, second?.weld ?? null);
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
        ...built.parts, ...(trailing?.parts ?? []), ...end.parts,
      ]);
      const strikers: readonly Striking[] = Object.freeze([...end.strikers]);
      // The business end, which is the first striker by contract: the tip and the edge are read
      // from it, and a whip's is its last segment rather than the one nearest the wrist.
      const business = end.strikers[0];
      // How far the business end is from the socket: the chain's own reach out to the weld,
      // plus the terminal's length beyond it. Fixed at build, because both halves are.
      const tipToSocket = built.reach + end.tipOffset;
      const chainEnvelope = built.envelope();
      const envelope: ModuleEnvelope = Object.freeze({
        axes: chainEnvelope.axes,
        reach: tipToSocket,
        // The chain's, unchanged: what a module can be *asked* for and what it can *reach* are
        // both the chain's business, and a terminal that altered either behind the chain's back
        // would be a terminal contributing to control. A two-socket terminal does alter them --
        // and it does so by *declaring* `limits`, which the chain above was built with and has
        // already folded into what it publishes here. The one field the pairing changes on its
        // own is the reach, because that is the one thing the terminal's own length is part of.
        strokes: chainEnvelope.strokes,
        reachable: chainEnvelope.reachable,
        settledBand: chainEnvelope.settledBand,
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
      };

      let severed = false;
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
            trailing.commandWeldTo?.(built.commandedEnd(built.reach));
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
      });
    },
  });
}
