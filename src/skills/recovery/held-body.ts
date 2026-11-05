import type { MuscleReading, MuscleCommand } from "../../core/bodies/muscle/driver.ts";
import type { MusclePush } from "../../control/motor.ts";
import type { Body } from "../../control/body.ts";
import type { ConfigurationName } from "../../core/bodies/spec/body.ts";
import type { BodyControl } from "../../core/bodies/body-control.ts";
import { Vector3 } from "../../core/math/vector.ts";
import type { OwnBody } from "../../core/bodies/own-body.ts";

/** Saved commands a skill holds while it drives the whole body. */
export function heldCommand(channels: number) {
  return {
    configurations: {} as Record<string, ConfigurationName>,
    activation: new Float64Array(channels), velocity: new Float64Array(channels),
    assist: { force: new Vector3(), moment: new Vector3() }, assistAsked: false,
  };
}

/** A body's readings beside a skill's own saved command arrays and assist request. */
export function heldBody(body: Pick<Body, "built" | "muscles" | "assist" | "view" | "delay" | "dt" | "readCommand" | "afterPhysics">,
  command: ReturnType<typeof heldCommand>) {
  const muscles = { activation: command.activation, velocity: command.velocity };
  const snapshot = { muscles, assist: command.assist };
  const control: BodyControl = {
    muscles,
    get assist() { command.assistAsked = true; return command.assist; },
    configurations: { request(segment, configuration) {
      if (!body.built.configurations.model.some(entry => entry.segment === segment && entry.configurations.includes(configuration)))
        throw new Error(`invalid configuration ${configuration} for segment ${segment}`);
      command.configurations[segment] = configuration;
    } },
  };
  const own: OwnBody = { spec: body.built.spec, dt: body.dt, delay: body.delay,
    built: body.built, muscles: body.muscles, assist: body.assist, first: body.view.senses };
  return {
    own, control, afterPhysics: body.afterPhysics,
    /** Start a fast step; a step that asks no assist leaves its host's request alone. */
    reset(): void { command.assistAsked = false; for (const segment in command.configurations) delete command.configurations[segment]; },
    /** Take the host's current command when this skill first takes the body. */
    take(): void { body.readCommand(snapshot); command.assistAsked = false; for (const segment in command.configurations) delete command.configurations[segment]; },
  };
}

/** A recovery's flat pushes, in one work array rewritten from its saved muscle commands. */
export function heldPushes(muscles: MuscleReading, command: MuscleCommand): () => readonly MusclePush[] {
  const pushes = muscles.channels.map(channel => ({ channel: channel.name, sense: 1 as 1 | -1, level: 0, speed: 0 }));
  return () => {
    for (let i = 0; i < pushes.length; i++) {
      const push = pushes[i]!;
      push.sense = command.velocity[i]! < 0 ? -1 : 1; push.level = command.activation[i]!; push.speed = command.velocity[i]!;
    }
    return pushes;
  };
}
