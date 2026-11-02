import type { Body, BodyView } from "../../body.ts";
import type { MusclePush } from "../../control/motor.ts";
import { footStatesOf } from "../../control/support.ts";
import { cos, sin } from "../../math/real.ts";
import type { LegsDrive, Locomotion, LocomotionContext } from "../../skills/locomotion/locomotion.ts";
import { ALL_MET, FIELD_BIT, fieldsOf, type LegsAsked, type LegsUnmet } from "../../skills/framework/skill.ts";
import { heldBody } from "../../mind/held-body.ts";
import { stagedRise } from "./staged.ts";
import { LOWERINGS, stageFaults, type Lowering } from "./stages.ts";

/** What legs report of a goal whose ends they could not bear on: its feet. */
const FEET_UNMET: LegsUnmet = Object.freeze({ fields: fieldsOf(FIELD_BIT.feet), centre: 0, height: 0 });

/**
 * How long the body stands still on the feet its footing set before a lowering begins, s, and how
 * slow its centre of mass is to stand still, m/s: a step's end leaves it moving.
 */
const SETTLE = { seconds: 0.25, speed: 0.1 } as const;

/** Whether `asked` names the same ends as `ends`, in any order. */
const sameEnds = (asked: readonly string[], ends: readonly string[]): boolean => asked.length === ends.length && asked.every((end) => ends.includes(end));

/**
 * **Legs that bear on more than the feet**: `legs`, and, asked to bear on the ends a lowering of
 * `lowerings` ends on (`Lowering`), that lowering: `legs` set the feet at its footing, and once the
 * body stands still there (`SETTLE`), its
 * stages are played on the body held whole (`heldBody`, `stagedRise`), every muscle pushed as they
 * drive it, the arbiter keeping the pushes no action holds, its last stage held; the body is held
 * low there (`LegsDrive.held`). A lowering the body's spec cannot play is not offered. Asked any
 * other goal they are `legs` again; a lowering that fails (the player lets the body go slack)
 * hands the legs back too, reporting the ends unmet until a goal asks other ends, as legs that do
 * not say when their feet are placed (`Locomotion.placed`) do at once. Their memory is the lowering
 * under way and its command, beside `legs`' own (`legs`).
 */
export function lowering(body: Body, legs: Locomotion, lowerings: readonly Lowering[] = LOWERINGS): Locomotion {
  const n = body.muscles.channels.length, spec = body.built.spec;
  const command = { activation: new Float64Array(n), velocity: new Float64Array(n) };
  const own = heldBody(body, command.activation, command.velocity);
  const playable = lowerings.filter((one) => stageFaults(one.recipe, spec).length === 0);
  const players = playable.map((one) => stagedRise(own, body.view, one.recipe));
  const feet = footStatesOf(body.built);
  /** The side of the foot an end of the spec's bears on, or null for an end that is no foot. */
  const sideOf = (end: string) => {
    const segment = spec.ends?.find((one) => one.name === end && one.kind === "foot")?.segment;
    return feet.find((foot) => foot.segment.spec.name === segment)?.side ?? null;
  };
  const state = {
    /** What the legs do: their own, set the feet for a lowering, lower the body, or report a lowering failed. */
    phase: "legs" as "legs" | "placing" | "lowering" | "failed",
    /** The lowering under way, by its place among those offered, or -1. */
    lowering: -1,
    /** Where its footing sets each foot's end, world (x, z); how long the body has stood still there, s. */
    footing: {} as Record<string, readonly [number, number]>, still: 0,
    command, legs: legs.state, players: players.map((player) => player.state),
  };
  const back = (view: BodyView): void => {
    if (state.phase === "legs") return;
    state.phase = "legs";
    state.lowering = -1;
    legs.resume(view);
  };
  const pushes = (): MusclePush[] => {
    const out: MusclePush[] = [];
    for (let i = 0; i < n; i++) out.push({ channel: body.muscles.channels[i]!.name, sense: command.velocity[i]! < 0 ? -1 : 1, level: command.activation[i]!, speed: command.velocity[i]! });
    return out;
  };
  return {
    state,
    get heading() { return legs.heading; },
    get stopping() { return legs.stopping; },
    get pace() { return legs.pace; },
    get reference() { return legs.reference; },
    get envelope() { return legs.envelope; },
    get placed() { return legs.placed; },
    get gait() { return legs.gait; },
    get unmet() { return state.phase === "failed" ? FEET_UNMET : state.phase === "legs" ? legs.unmet : ALL_MET; },
    ...(legs.envelopeOf ? { envelopeOf: (gait) => legs.envelopeOf!(gait) } : {}),
    ...(legs.envelopeRunning ? { envelopeRunning: (may) => legs.envelopeRunning!(may) } : {}),
    ...(legs.arms ? { arms: (view) => state.phase === "legs" ? legs.arms!(view) : null } : {}),
    ...(legs.runs ? { runs: (may) => legs.runs!(may) } : {}),
    resume(view) {
      state.phase = "legs";
      state.lowering = -1;
      legs.resume(view);
    },
    goal(view: BodyView, goal: LegsAsked, dt: number, context?: LocomotionContext): LegsDrive {
      const asked = goal.feet === undefined ? -1 : playable.findIndex((one) => sameEnds(goal.feet!, one.ends));
      if (asked < 0 || state.phase !== "legs" && state.lowering !== asked) back(view);
      if (asked < 0) return legs.goal(view, goal, dt, context);
      if (state.phase === "failed") return legs.goal(view, { ...goal, feet: undefined }, dt, context);
      const chosen = playable[asked]!;
      if (state.phase === "legs" && legs.placed === undefined) {
        // Legs that do not say when their feet are placed cannot be waited on.
        state.phase = "failed";
        state.lowering = asked;
        return legs.goal(view, { ...goal, feet: undefined }, dt, context);
      }
      if (state.phase === "legs") {
        // Each foot's end set ahead of where its sole stands, along the way the legs face.
        const h = legs.heading, x = sin(h), z = cos(h);
        for (const [end, ahead] of Object.entries(chosen.footing)) {
          const side = sideOf(end);
          if (side === null) throw new Error(`a lowering sets ${end}, which is no foot`);
          const sole = view.stance.soles[side];
          state.footing[end] = [sole.x + ahead * x, sole.z + ahead * z];
        }
        state.phase = "placing";
        state.lowering = asked;
        state.still = 0;
      }
      if (state.phase === "placing") {
        const drive = legs.goal(view, { ...goal, walk: null, feet: undefined, footing: state.footing }, dt, context);
        const v = view.stance.velocity, still = legs.placed && view.stance.phase === "stand" && v.x * v.x + v.y * v.y + v.z * v.z < SETTLE.speed * SETTLE.speed;
        state.still = still ? state.still + dt : 0;
        if (state.still + dt / 2 < SETTLE.seconds) return drive;
        command.activation.set(body.muscles.activation);
        command.velocity.set(body.muscles.velocity);
        players[asked]!.beginRising();
        state.phase = "lowering";
      }
      const player = players[asked]!;
      player.step(view.senses, dt);
      if (player.state.phase !== "rise") {
        state.phase = "failed";
        legs.resume(view);
        return legs.goal(view, { ...goal, feet: undefined }, dt, context);
      }
      return { kind: "drive", posture: {}, pushes: pushes(), held: chosen.rests * view.standing };
    },
  };
}
