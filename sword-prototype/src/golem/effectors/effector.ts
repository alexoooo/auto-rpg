import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { Striking } from "../../combat.ts";
import type { HandIntent } from "../../mind.ts";
import {
  EFFECTOR_SLOTS,
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
 * a chain that carries its own terminal cannot be given one, and a chain that hands out a weld
 * has to be given one. Both throw, at build, naming the pair.
 */
export function effectorModule(
  chain: EffectorChainDefinition,
  terminal: EffectorTerminalDefinition | null,
): GolemModuleDefinition<HandIntent> {
  const id = terminal ? `effector.${chain.id}.${terminal.id}` : `effector.${chain.id}`;
  return Object.freeze({
    id,
    slots: EFFECTOR_SLOTS,
    label: terminal ? `${chain.label} + ${terminal.label}` : chain.label,
    massKg: chain.massKg + (terminal?.massKg ?? 0),

    build(ctx: ModuleBuild): BuiltModule<HandIntent> {
      const built = chain.build(ctx);

      let end: BuiltTerminal;
      if (terminal) {
        if (!built.weld) {
          built.dispose();
          throw new Error(`${id}: chain "${chain.id}" carries its own terminal and cannot take "${terminal.id}"`);
        }
        end = terminal.build(ctx, built.weld);
      } else {
        if (!built.ownTerminal) {
          built.dispose();
          throw new Error(`${id}: chain "${chain.id}" hands out a weld and has to be paired with a terminal`);
        }
        end = built.ownTerminal;
      }

      const parts: readonly GolemPart[] = Object.freeze([...built.parts, ...end.parts]);
      const strikers: readonly Striking[] = Object.freeze([end.striker]);
      // How far the business end is from the socket: the chain's own reach out to the weld,
      // plus the terminal's length beyond it. Fixed at build, because both halves are.
      const tipToSocket = built.reach + end.tipOffset;
      const chainEnvelope = built.envelope();
      const envelope: ModuleEnvelope = Object.freeze({
        axes: chainEnvelope.axes,
        reach: tipToSocket,
        // The chain's, unchanged: what a module can be *asked* for and what it can *reach* are
        // both the chain's business, and a terminal that altered either would be a terminal
        // contributing to control. The one field the pairing changes is the reach, because that
        // is the one thing the terminal's own length is part of.
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
      // definition's own bite row.
      const hasEdge = terminal?.bite === "edge";
      const view: EffectorView = {
        slot,
        get tip(): Vector3 { return end.striker.tipPosition(); },
        get commandedTip(): Vector3 { return built.commandedEnd(tipToSocket); },
        get axes(): readonly EffectorAxisView[] { return built.axes(); },
        get stroke(): EffectorStroke { return built.stroke(); },
        get anchor(): Vector3 | null { return built.anchor(); },
        get anchorStray(): number | null { return built.anchorStray(); },
        get edge(): Vector3 | null { return hasEdge ? end.striker.edgeDirection() : null; },
      };

      let severed = false;
      return Object.freeze({
        parts,
        strikers,
        command: (next: HandIntent) => built.command(next),
        step: (dt: number) => built.step(dt),
        envelope: () => envelope,
        view: () => view,
        sever: () => {
          if (severed) return;
          severed = true;
          // The terminal first: it becomes debris and stops scoring, and only then does the
          // chain let go of it. The other order leaves a live striker on a body nothing is
          // holding for the length of one call.
          end.sever();
          built.sever();
        },
        dispose: () => {
          // The terminal before the chain: the weld is anchored into the chain's last link,
          // and disposing the link's body first would leave a constraint pointing at a freed
          // Havok body. `PhysicsBody.dispose` walks straight past whatever is constraining it.
          end.dispose();
          built.dispose();
        },
      });
    },
  });
}
