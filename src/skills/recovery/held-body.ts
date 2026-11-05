import type { Body } from "../../control/body.ts";
import type { BodyControl } from "../../core/bodies/body-control.ts";
import { Vector3 } from "../../core/math/vector.ts";
import type { OwnBody } from "../../core/bodies/own-body.ts";

/** Saved commands a skill holds while it drives the whole body. */
export function heldCommand(channels: number) {
  return {
    activation: new Float64Array(channels), velocity: new Float64Array(channels),
    assist: { force: new Vector3(), moment: new Vector3() }, assistAsked: false,
  };
}

/** A body's readings beside a skill's own saved command arrays and assist request. */
export function heldBody(body: Pick<Body, "built" | "muscles" | "assist" | "view" | "delay" | "dt" | "readCommand">,
  command: ReturnType<typeof heldCommand>) {
  const muscles = { activation: command.activation, velocity: command.velocity };
  const snapshot = { muscles, assist: command.assist };
  const control: BodyControl = {
    muscles,
    get assist() { command.assistAsked = true; return command.assist; },
    hands: { request() { throw new Error("a held body asks no hand a pose"); } },
  };
  const own: OwnBody = { spec: body.built.spec, dt: body.dt, delay: body.delay,
    built: body.built, muscles: body.muscles, assist: body.assist, first: body.view.senses };
  return {
    own, control,
    /** Start a fast step; a step that asks no assist leaves its host's request alone. */
    reset(): void { command.assistAsked = false; },
    /** Take the host's current command when this skill first takes the body. */
    take(): void { body.readCommand(snapshot); command.assistAsked = false; },
  };
}
