import type { Gait, PawGaitBody } from "../../shared/quadruped/parts.ts";
import { Vector3 } from "../../../../core/math/vector.ts";
import { withinSupport } from "../../../../control/support.ts";
import { cos, sin } from "../../../../core/math/real.ts";
import { REPTILE_CRAWL } from "../../shared/quadruped/tuning.ts";
import type { PawView } from "../../../../control/quadruped/paws.ts";
import { anchorAt, completeSettings, gaitPoser, gaitStart, headingError, meanOf, overMean, settledCentre } from "../../shared/quadruped/gait.ts";

/**
 * One paw moves after the centre enters the other three paws' support triangle: a gait of `body`
 * by the settings `T`.
 */
export function crawl(body: PawGaitBody, T: typeof REPTILE_CRAWL): Gait {
  if (!validCrawl(T)) throw new Error("invalid crawl settings");
  const { names } = body, start = gaitStart(body), { nominal, reference } = start;
  const over = overMean(reference, nominal.map(n => [n[0], n[2]] as const));
  const state = {
    phase: "settle" as "settle" | "shift" | "swing" | "land" | "return", time: 0, paw: 0, steps: 0, placed: 0, sequence: 0, yaw: 0, align: 0, standing: false, lifted: false,
    centre: start.centre,
    anchors: start.anchors,
    from: [0, 0, 0] as [number, number, number], to: [0, 0, 0] as [number, number, number],
    command: start.command,
  };
  const pose = gaitPoser(body), support = names.map(() => ({ corners: [new Vector3()] }));
  const resume = (view: PawView) => {
    state.phase = "settle"; state.time = 0; state.sequence++; state.yaw = view.yaw; state.standing = false; state.align = 0;
    state.centre[0] = view.centre.x; state.centre[2] = view.centre.z;
    view.feet.forEach((e, i) => anchorAt(state.anchors[i]!, e));
  };
  // A paw's step takes its settle, its shift, its swing and its plant; each paw steps once a stride, and a heading turns a yaw step a stride. It steps any way.
  const stride = names.length * (T.settle + T.shift + T.swing + T.plant), forward = T.stride / stride;
  return {
    state, resume, settings: T, grounded: null, holding: true,
    reach: { forward, aside: 1, turn: T.yawStep / stride },
    travel: { speed: forward, stopping: forward / stride },
    command(view, intent, dt) {
      const face = intent.face ?? intent.move, error = headingError(intent, state.yaw);
      const moving = !!intent.move || Math.abs(error) > T.turnError || state.align > 0 && !!face;
      state.time += dt;
      view.feet.forEach((e, i) => { if (e.contact && (i !== state.paw || state.phase === "settle" || state.phase === "shift")) anchorAt(state.anchors[i]!, e); });
      const average = meanOf(state.anchors), ground = average[1]!;
      state.command.centre[1] = ground + reference[1] * (state.phase === "settle" ? 1 : (intent.height ?? T.height));
      if (state.phase === "settle") {
        if (moving || !state.standing) settledCentre(state, average, over);
        state.standing = !moving;
        state.command.centre[0] = state.centre[0]; state.command.centre[2] = state.centre[2];
        if (moving && state.time >= T.settle && view.feet.every(e => e.contact)) {
          if (state.paw === 0) state.yaw += Math.max(-T.yawStep, Math.min(T.yawStep, error));
          if (Math.abs(error) > T.turnError) state.align = names.length;
          else state.align = Math.max(0, state.align - 1);
          state.phase = "shift"; state.time = 0; state.standing = false;
          const anchor = state.anchors[state.paw]!;
          state.from.splice(0, 3, ...anchor);
          let dx = 0, dz = 0;
          if (intent.move) { const length = Math.sqrt(intent.move.x * intent.move.x + intent.move.z * intent.move.z); if (length) { dx = intent.move.x / Math.max(1, length); dz = intent.move.z / Math.max(1, length); } }
          const n = nominal[state.paw]!, c = cos(state.yaw), s = sin(state.yaw), x = n[0] - reference[0], z = n[2] - reference[2];
          state.to[0] = view.centre.x + c * x + s * z + dx * T.stride;
          state.to[1] = ground; state.to[2] = view.centre.z - s * x + c * z + dz * T.stride;
        }
      }
      if (state.phase === "shift" || state.phase === "swing" || state.phase === "land" || state.phase === "return") {
        let x = 0, z = 0;
        const otherSupport = support.filter((_p, i) => i !== state.paw);
        for (let i = 0; i < names.length; i++) {
          support[i]!.corners[0]!.set(...state.anchors[i]!);
          if (i !== state.paw) { x += state.anchors[i]![0] / (names.length - 1); z += state.anchors[i]![2] / (names.length - 1); }
        }
        const inside = withinSupport(otherSupport, x, z, T.inset);
        state.command.centre[0] = inside[0]; state.command.centre[2] = inside[1];
        if (state.phase === "shift") {
          const projected = withinSupport(otherSupport, view.centre.x, view.centre.z, T.supportInset);
          const dx = projected[0] - view.centre.x, dz = projected[1] - view.centre.z;
          if (state.time >= T.shift && dx * dx + dz * dz < T.shiftError * T.shiftError && view.feet.every(e => e.contact)) {
            state.phase = "swing"; state.time = 0; state.sequence++; state.lifted = false;
          }
        } else if (state.phase === "swing") {
          if (!view.feet[state.paw]!.contact && view.feet[state.paw]!.low - view.feet[state.paw]!.ground > T.liftConfirm) state.lifted = true;
          if (state.time >= T.swing) { state.phase = "land"; state.time = 0; }
        } else if (state.phase === "land" && view.feet[state.paw]!.contact) {
          // A paw that bears has landed, whether it cleared the floor or never left it (dragged, or
          // already at its target): it is placed; only one that cleared the floor counts a step.
          anchorAt(state.anchors[state.paw]!, view.feet[state.paw]!);
          state.placed++;
          if (state.lifted) state.steps++;
          state.paw = (state.paw + 1) % names.length; state.phase = "settle"; state.time = 0;
        } else if ((state.phase === "land" || state.phase === "return") && state.time >= T.placementLimit) {
          if (view.feet[state.paw]!.contact) { state.phase = "settle"; state.time = 0; }
          else {
            state.phase = "return"; state.time = 0; state.sequence++; state.lifted = false;
            state.to.splice(0, 3, ...state.from);
          }
        } else if (state.phase === "return" && state.time >= T.plant && view.feet[state.paw]!.contact) {
          state.phase = "settle"; state.time = 0;
        }
      }
      const swinging = state.phase === "swing" || state.phase === "land" || state.phase === "return";
      return pose(state, (i) => swinging && i === state.paw ? state.to : null);
    },
  };
}

/** The crawl's complete settings keep travel and every consumed time divisor positive. */
export function validCrawl(settings: typeof REPTILE_CRAWL): boolean {
  return completeSettings(REPTILE_CRAWL, settings) && settings.stride > 0 && settings.settle + settings.shift + settings.swing + settings.plant > 0;
}
