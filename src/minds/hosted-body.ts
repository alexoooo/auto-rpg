import type { Body, LayerOptions } from "../control/body.ts";
import type { PhysicalBody } from "./physical-body.ts";
import type { Embodying } from "./embodiment.ts";
/**
 * **A body under the command layers as the one who built it holds it** (`commandedBody`): the
 * built body under it (`PhysicalBody`), its view, its drive, and the body its drivers have
 * (`driver`), which reads the built body through its read view and is the one to hand a decider's
 * skills, a skill or a script.
 */
export type HostedBody = PhysicalBody & Pick<Body, "view" | "envelope" | "drive" | "afterPhysics"> & { readonly driver: Body };

/**
 * **What a body built outside a fight under the command layers takes** (`commandedBody`): their
 * options and what a body is given beside its mind (`Embodying`: its senses, the clock alone
 * unless given; its assist's ceiling, `balanceCeiling`, none unless given; its contact labels;
 * where its order sheets are written).
 */
export type BodyOptions = LayerOptions & Embodying;
