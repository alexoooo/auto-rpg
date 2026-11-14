import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import type { TravelOrders } from "./travel.ts";
import { Quaternion, Vector3 } from "../../../core/math/vector.ts";
import type { Skill } from "../../framework/skill.ts";
import type { SupportedCommand } from "../../../control/supported-motor.ts";

import type { ReadBody, ReadSegment } from "../../../core/bodies/read-body.ts";
import { withinSupport } from "../../../control/support.ts";
import { atan2, cos, sin } from "../../../core/math/real.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import { REPTILE_CRAWL } from "./tuning.ts";
import { deepFreeze } from "../../../core/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { type PawGaitPart } from "./parts.ts";
import type { PawReading, PawView } from "../../../control/quadruped/paws.ts";

/**
 * Where a body standing on its `paws` at the reference pose carries its centre of mass, body
 * frame, from the paws' mean: a settled stance puts the centre there, wherever the legs meet the
 * trunk.
 */
function overPaws(built: ReadBody, paws: readonly string[]): readonly [number, number] {
  const mass = built.spec.mass.value, centre = built.spec.segments.reduce((c, p) => {
    const m = p.mass.value / mass, at = p.centreOfMass.value;
    return [c[0] + m * at[0], c[1] + m * at[2]] as [number, number];
  }, [0, 0] as [number, number]);
  let x = 0, z = 0;
  for (const name of paws) { const sole = built.segments.get(name)!.spec.points!.sole!.value; x += sole[0]; z += sole[2]; }
  return [centre[0] - x / paws.length, centre[1] - z / paws.length];
}

/**
 * One paw moves after the centre enters the other three paws' support triangle: a gait of the body
 * `built`, its trunk `root`, on its paws `names` as `paws` reads them.
 */
function crawl(built: ReadBody, root: ReadSegment, paws: PawReading, names: readonly string[], T = REPTILE_CRAWL) {
  if (!validCrawl(T)) throw new Error("invalid crawl settings");
  const nominal = names.map(name => built.segments.get(name)!.spec.points!.sole!.value);
  const mass = built.spec.mass.value, reference = built.spec.segments.reduce((c, p) => {
    const m = p.mass.value / mass, at = p.centreOfMass.value;
    return [c[0] + m * at[0], c[1] + m * at[1], c[2] + m * at[2]] as Vec3;
  }, [0, 0, 0] as Vec3);
  const over = overPaws(built, names), q = root.pose.rotation;
  const state = {
    phase: "settle" as "settle" | "shift" | "swing" | "land" | "return", time: 0, paw: 0, steps: 0, placed: 0, sequence: 0, yaw: 0, align: 0, standing: false, lifted: false,
    centre: [paws.centre.x, reference[1], paws.centre.z] as [number, number, number],
    anchors: paws.feet.map(e => [e.at.x, e.ground, e.at.z] as [number, number, number]),
    from: [0, 0, 0] as [number, number, number], to: [0, 0, 0] as [number, number, number],
    command: {
      centre: [paws.centre.x, reference[1], paws.centre.z] as [number, number, number],
      velocity: [0, 0, 0] as [number, number, number], rotation: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      endpoints: paws.feet.map((e, i) => ({ target: [e.at.x, nominal[i]![1], e.at.z] as [number, number, number],
        bearing: true, rotation: [0, 0, 0, 1] as [number, number, number, number] })),
      posture: {} as Record<string, number>,
    },
  };
  const rotation = new Quaternion(), turned = new Quaternion(), support = names.map(() => ({ corners: [new Vector3()] }));
  const resume = (view: PawView) => {
    state.phase = "settle"; state.time = 0; state.sequence++; state.yaw = view.yaw; state.standing = false; state.align = 0;
    state.centre[0] = view.centre.x; state.centre[2] = view.centre.z;
    view.feet.forEach((e, i) => { state.anchors[i]![0] = e.at.x; state.anchors[i]![1] = e.ground; state.anchors[i]![2] = e.at.z; });
  };
  const skill: Skill<PawView> & { readonly state: typeof state; command(view: PawView, intent: TravelOrders, dt: number, height?: number): SupportedCommand } = {
    state, resume,
    command(view, intent, dt, height = T.crawlHeight) {
      const face = intent.face ?? intent.move;
      let error = 0;
      if (face && (face.x * face.x + face.z * face.z) > 0) {
        const angle = atan2(face.x, face.z), d = angle - state.yaw;
        error = atan2(sin(d), cos(d));

      }
      const moving = !!intent.move || Math.abs(error) > T.turnError || state.align > 0 && !!face;
      state.time += dt;
      view.feet.forEach((e, i) => {
        if (e.contact && (i !== state.paw || state.phase === "settle" || state.phase === "shift")) {
          state.anchors[i]![0] = e.at.x; state.anchors[i]![1] = e.ground; state.anchors[i]![2] = e.at.z;
        }
      });
      const average = [0, 0, 0];
      for (const anchor of state.anchors) for (let k = 0; k < 3; k++) average[k] += anchor[k]! / names.length;
      const ground = average[1]!;
      state.command.centre[1] = ground + reference[1] * (state.phase === "settle" ? 1 : height);
      if (state.phase === "settle") {
        if (moving || !state.standing) {
          const c = cos(state.yaw), s = sin(state.yaw);
          state.centre[0] = average[0]! + c * over[0] + s * over[1];
          state.centre[2] = average[2]! - s * over[0] + c * over[1];
        }
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
          state.anchors[state.paw]![0] = view.feet[state.paw]!.at.x;
          state.anchors[state.paw]![1] = view.feet[state.paw]!.ground;
          state.anchors[state.paw]![2] = view.feet[state.paw]!.at.z;
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
      rotation.set(0, sin(state.yaw / 2), 0, cos(state.yaw / 2));
      rotation.multiplyToRef(root.rest, turned);
      state.command.rotation.splice(0, 4, turned.x, turned.y, turned.z, turned.w);
      state.command.endpoints.forEach((goal, i) => {
        rotation.multiplyToRef(built.segments.get(names[i]!)!.rest, turned);
        goal.rotation.splice(0, 4, turned.x, turned.y, turned.z, turned.w);
        goal.target.splice(0, 3, ...state.anchors[i]!); goal.bearing = true;
        if (i === state.paw && (state.phase === "swing" || state.phase === "land" || state.phase === "return")) {
          goal.target.splice(0, 3, ...state.to);
          goal.bearing = false;
        }
      });
      return state.command;
    },
  };
  return skill;
}

/** The crawl's complete settings keep travel and every consumed time divisor positive. */
function validCrawl(settings: typeof REPTILE_CRAWL): boolean {
  return !!settings && typeof settings === "object" && !Array.isArray(settings)
    && Object.keys(REPTILE_CRAWL).every(key => Object.hasOwn(settings, key))
    && Object.entries(settings).every(([key, value]) => Object.hasOwn(REPTILE_CRAWL, key) && Number.isFinite(value) && value >= 0)
    && settings.stride > 0 && settings.settle + settings.shift + settings.swing + settings.plant > 0;
}

/** **The crawl**'s config: research settings over `REPTILE_CRAWL`, none in the game. */
interface CrawlConfig extends Varied { readonly kind: "paw-crawl"; readonly tuning?: Partial<typeof REPTILE_CRAWL> }

/** The crawl's variations: the crawl. */
const VARIATIONS = {
  "paw-crawl"(built: ReadBody, root: ReadSegment, reading: PawReading, paws: readonly string[], config: CrawlConfig) {
    const settings = { ...REPTILE_CRAWL, ...config.tuning }, skill = crawl(built, root, reading, paws, settings);
    // A paw's step takes its settle, its shift, its swing and its plant; each paw steps once a stride, and a heading turns a yaw step a stride. It steps any way.
    const stride = paws.length * (settings.settle + settings.shift + settings.swing + settings.plant);
    const reach = { forward: settings.stride / stride, aside: 1, turn: settings.yawStep / stride };
    return { state: skill.state, settings, reach, travel: { speed: reach.forward, stopping: reach.forward / stride }, resume: skill.resume, command: skill.command };
  },
};

/** **The crawl** as a gait: the quadruped's close and careful steps. */
export const CRAWL_PART = deepFreeze<PawGaitPart<CrawlConfig>>({
  role: "paw-gait", label: "Crawl", stage: "game", fields: [], slots: [], defaults: { kind: "paw-crawl" }, keys: { kind: true, variation: true, tuning: true },
  tuning: Object.keys(REPTILE_CRAWL), fits: (spec, config) => variationFault("paw-crawl", "crawl", VARIATIONS)(spec, config)
    ?? fitsPaws(spec) ?? (validCrawl({ ...REPTILE_CRAWL, ...config.tuning }) ? null : "invalid crawl settings"),
  faults: (config: CrawlConfig) => config.tuning === undefined || !!config.tuning && typeof config.tuning === "object" && !Array.isArray(config.tuning)
    && validCrawl({ ...REPTILE_CRAWL, ...config.tuning }) ? [] : ["invalid crawl settings"],
  make: variedMake("paw-crawl", VARIATIONS, (built, _root, _reading, _paws, config) => [built.spec, config]),
  variations: Object.keys(VARIATIONS),
});

declare module "./parts.ts" {
  interface PawGaitConfigs {
    readonly "paw-crawl": CrawlConfig;
  }
}
