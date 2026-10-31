import type { Body } from "../body.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { OwnBody } from "./mind.ts";

/**
 * **A body held whole**: `body` as a part that drives every muscle itself sees it (`OwnBody`),
 * reading its muscles as they are and commanding them in `activation` and `velocity`, its own,
 * which its host carries to the muscles as pushes. It asks no hand a pose; it senses what the
 * view last read (`BodyView.senses`) and observes the physics as `body` does.
 */
export function heldBody(body: Pick<Body, "built" | "muscles" | "assist" | "view" | "afterPhysics">, activation: Float64Array, velocity: Float64Array): OwnBody {
  const real = body.muscles;
  const muscles: MuscleDriver = {
    channels: real.channels, activation, velocity, dynamics: real.dynamics, ceiling: real.ceiling, bounds: real.bounds, pulled: real.pulled,
    get state() { return real.state; }, get level() { return real.level; },
    angle: (i) => real.angle(i), rate: (i) => real.rate(i), speed: (i) => real.speed(i), turning: (i, k) => real.turning(i, k),
    strength: (i, sense) => real.strength(i, sense), channel: (name) => real.channel(name),
    setLevel() { throw new Error("a held body's level is its host's"); },
    dispose() { throw new Error("a held body is its host's to dispose"); },
  };
  return { spec: body.built.spec, built: body.built, muscles, assist: body.assist, requestHandPoses() { throw new Error("a held body asks no hand a pose"); },
    senses: () => body.view.senses, afterPhysics: body.afterPhysics };
}
