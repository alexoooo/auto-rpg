import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { HandIntent } from "../../../mind.ts";
import { CHAIN_REACH } from "../../config.ts";
import {
  defineChain,
  type BuiltChain,
  type ChainLimits,
  type ModuleBuild,
  type ModuleEnvelope,
} from "../../module.ts";
import { ARM_STROKES, LIMB_MOUNT, buildArmCore } from "./arm-core.ts";

/**
 * Rung 2, `reach`: three driven axes, one three-dimensional target, one pose.
 *
 * **This is the rung that decides whether the Warrior's anchor idea survives once its redundancy
 * is removed.** The recorded arm defects -- an elbow that wrapped around the back, a shield hand
 * that swung behind the trunk -- are the overview's *candidate* explanation of a seven-axis chain
 * asked for a six-axis pose: a spare axis means any command near the envelope's edge resolves to
 * the least-violation pose rather than to the pose anybody meant. A three-axis chain asked for a
 * point has no such freedom, and this rung exists to tell that candidate apart from the other
 * three by removing it and looking.
 *
 * The whole of the chain is in `arm-core.ts`, which rung 3 shares. What this file adds is one
 * sentence: **the terminal welds to the forearm's own end**, so a blade's edge follows the
 * forearm and a plate's face does too, and `roll` is a field this chain has no use for and
 * therefore ignores -- the frozen rule "a chain that has no use for a field ignores it" at its
 * second-largest extent after rung 0.
 *
 * That is also the rung's honest limitation and the reason rung 3 exists at all: with the pose
 * unique, *the edge direction is a function of the target*. There is no command that turns the
 * blade without moving the hand, so `src/scoring.ts`'s edge alignment is whatever the geometry
 * makes it. The bench readout prints it, and what it prints on this rung is a fact about the
 * chain rather than a thing a person did.
 */
export const reachChain = defineChain({
  id: "reach",
  axes: 3,
  label: "reach - yaw, pitch, elbow",
  massKg: CHAIN_REACH.collarMass + CHAIN_REACH.upperMass + CHAIN_REACH.foreMass,

  build(ctx: ModuleBuild, limits: ChainLimits | null): BuiltChain {
    const R = CHAIN_REACH;
    const core = buildArmCore(ctx, limits);
    // **The narrowed number, read back out of the core rather than out of `CHAIN_REACH`.** A
    // two-socket terminal takes reach away from this chain, and the weld point's own distance
    // from the socket is what `effector.ts` adds the terminal's length to. Reading the config
    // block here instead would publish a reach the mapping cannot command, which is a second
    // statement of the same shell -- the exact defect `CoreLimits` exists to prevent.
    const outerReach = core.reachable.reachMax;

    const envelope: ModuleEnvelope = Object.freeze({
      axes: core.envelopeAxes,
      reach: outerReach,
      strokes: ARM_STROKES,
      reachable: core.reachable,
      settledBand: R.settledBand,
    });

    const commandedEnd = new Vector3();

    return Object.freeze({
      parts: core.parts,

      weld: Object.freeze({
        link: core.fore,
        pivot: core.handPivot.clone(),
        world: core.handWorld.clone(),
        rotation: core.buildRotation.clone(),
        mount: LIMB_MOUNT,
      }),
      ownTerminal: null,
      // A chain's reach is how far its *weld point* is from the socket, and on this rung that
      // distance is commanded rather than fixed. The furthest is what is published, because
      // `effector.ts` adds the terminal's length to it once at build to get the tip distance --
      // and because "how far the business end travels at full extension" is what the envelope's
      // own field says it is.
      reach: outerReach,

      command: (next: HandIntent) => core.command(next),
      step: (dt: number) => core.step(dt),
      envelope: () => envelope,
      axes: () => core.axes,
      stroke: () => core.stroke(),
      anchor: () => core.anchorPoint(),
      anchorStray: () => core.anchorStray(),

      /**
       * Where the commanded tip is.
       *
       * The caller's distance is the chain's own `reach` plus whatever the terminal is long, and
       * the difference between the two is what is carried **along the commanded forearm** rather
       * than along the aim. Those two directions are not the same and the gap is not small: a
       * bent elbow puts the forearm up to 0.93 rad off the shoulder-to-hand line, which over a
       * 0.80 m blade is most of a blade's length. Reading the commanded tip off the aim instead
       * would make the overlay's error line -- whose length is the whole point of drawing it --
       * report a geometry error as a tracking error.
       */
      commandedEnd(distanceFromSocket: number): Vector3 {
        const beyond = distanceFromSocket - outerReach;
        return commandedEnd
          .copyFrom(core.commandedForearm())
          .scaleInPlace(beyond)
          .addInPlace(core.commandedHand());
      },

      unmotorise: () => core.unmotorise(),
      sever: () => core.sever(),
      dispose: () => core.dispose(),
    });
  },
});
