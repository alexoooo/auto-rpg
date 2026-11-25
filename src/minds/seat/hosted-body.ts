import type { Body, LayerOptions } from "../../control/body.ts";
import type { PhysicalBody } from "./physical-body.ts";
import type { Embodying } from "./embodiment.ts";
import type { Drive } from "../scripted-mind.ts";
/**
 * **A body under the command layers as a fight or a screen holds it**, whichever Mind commands it
 * (`commandedOver`, `src/minds/seat/host.ts`): the built body under it (`PhysicalBody`), the layers' view of it, and the body
 * under the command layers (`commanded`, a `Body`), which reads the built body through its read
 * view and is the one to hand a mind's skills, a skill or a script.
 */
export type CommandedBody = PhysicalBody & Pick<Body, "view" | "envelope" | "afterPhysics"> & { readonly commanded: Body };

/** **A scripted body as the one who built it holds it** (`commandedBody`): a `CommandedBody`, and how its driver is registered (`Drive`). */
export type HostedBody = CommandedBody & { readonly drive: Drive };

/**
 * **What a body built outside a fight under the command layers takes** (`commandedBody`): their
 * options and what a body is given beside its mind (`Embodying`: its senses, the clock alone
 * unless given; its assist's ceiling, `steadinessCeiling`, none unless given; its contact labels;
 * where its order sheets are written).
 */
export type BodyOptions = LayerOptions & Embodying;
