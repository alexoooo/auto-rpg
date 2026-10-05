import type { BodyObservation } from "../observation.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { pointMotion } from "./point-motion.ts";
import { pointPath } from "./point-path.ts";
import type { MotionCommand, MotionModel } from "./tasks.ts";

type Frame = MotionCommand["frames"][number]["frame"];
interface Sample { readonly time: number; readonly position: Vec3; readonly velocity: Vec3 }
interface Plane { readonly point: Vec3; readonly normal: Vec3 }
const ZERO: Vec3 = Object.freeze([0, 0, 0]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const distance = (a: Vec3, b: Vec3) => Math.sqrt(a.reduce((sum, v, k) => sum + (v - b[k]!) * (v - b[k]!), 0));

/** Earliest closing plane crossing under a measured constant acceleration, with sample-age compensation. */
export function predictIntercept(sample: Sample, acceleration: Vec3, plane: Plane, now: number, horizon: number) {
  const age = Math.max(0, now - sample.time);
  const position = sample.position.map((v, k) => v + sample.velocity[k]! * age + acceleration[k]! * age * age / 2) as unknown as Vec3;
  const velocity = sample.velocity.map((v, k) => v + acceleration[k]! * age) as unknown as Vec3;
  const offset = position.map((v, k) => v - plane.point[k]!) as unknown as Vec3;
  const d = dot(offset, plane.normal), v = dot(velocity, plane.normal), a = dot(acceleration, plane.normal);
  if (!(d > 0 && v < 0 && horizon > 0)) return null;
  const discriminant = v * v - 2 * a * d;
  if (discriminant < 0) return null;
  const seconds = 2 * d / (-v + Math.sqrt(discriminant));
  if (!(seconds > 0 && seconds <= horizon) || v + a * seconds >= 0) return null;
  return { seconds, position: position.map((p, k) => p + velocity[k]! * seconds + acceleration[k]! * seconds * seconds / 2) as unknown as Vec3 };
}

interface Effector {
  readonly id: string;
  readonly frame: Frame;
  readonly at: Vec3;
  readonly guard: Vec3;
  readonly threat: { readonly id: string; readonly point: string; readonly contact?: string };
  readonly plane: Plane;
  /** Necessary reach sphere, not a certificate that the joints can attain the candidate. */
  readonly reach: { readonly frame: Frame; readonly at: Vec3; readonly distance: number };
  /** Planning filter on remaining distance/time; physical speed is still limited by muscles. */
  readonly travelSpeed: number;
  readonly braceRotation: boolean;
}
interface Settings {
  /** Disabled policies retain the same guard and posture while ignoring incoming objects. */
  readonly enabled?: boolean;
  readonly effectors: readonly Effector[];
  readonly joints: MotionCommand["joints"];
  readonly hold: MotionCommand["frames"];
  readonly centres?: MotionCommand["centres"];
  readonly seconds: number;
  readonly weight: number;
  readonly horizon: number;
  readonly contactImpulse: number;
  readonly braceWeight: number;
  readonly returnSeconds: number;
  readonly retreatDistance: number;
  readonly marginFraction: number;
  readonly marginWeight: number;
}

/**
 * Optional interception reference over named points. Delayed samples estimate acceleration;
 * a closing candidate must meet explicit reach and travel-time filters. A quintic path aims
 * at that candidate. Matched contact can brace the measured rotation; retreat or loss of the
 * observed threat returns from measured motion. Contact is feedback, never hit authority.
 */
export function intercept(settings: Settings, model: MotionModel, equipment: readonly { readonly id: string; readonly centre: Vec3 }[] = []) {
  const vector = (v: Vec3) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (!settings.effectors.length || ![settings.seconds, settings.weight, settings.horizon, settings.contactImpulse,
    settings.braceWeight, settings.returnSeconds, settings.retreatDistance].every((v) => Number.isFinite(v) && v > 0)
    || !(settings.marginFraction >= 0 && settings.marginFraction < 0.5)
    || !(Number.isFinite(settings.marginWeight) && settings.marginWeight >= 0)) throw new Error("invalid interception settings");
  if (settings.enabled !== undefined && typeof settings.enabled !== "boolean") throw new Error("invalid interception enable flag");
  const ids = new Set<string>();
  for (const e of settings.effectors) {
    if (!e.id || ids.has(e.id) || !e.threat.id || !e.threat.point || ![e.at, e.guard, e.plane.point, e.plane.normal, e.reach.at].every(vector)
      || !(dot(e.plane.normal, e.plane.normal) > 0) || ![e.reach.distance, e.travelSpeed].every((v) => Number.isFinite(v) && v > 0)
      || typeof e.braceRotation !== "boolean") throw new Error("invalid interception effector");
    ids.add(e.id);
  }
  const config = deepFreeze(structuredClone(settings)), motion = pointMotion(equipment);
  const planes = config.effectors.map((e) => ({ point: e.plane.point,
    normal: e.plane.normal.map((v) => v / Math.sqrt(dot(e.plane.normal, e.plane.normal))) as unknown as Vec3 }));
  const channels = new Map(model.channels.map((c) => [c.name, { ...c }]));
  const state = { effectors: config.effectors.map((e) => ({
    phase: "guard" as "guard" | "intercept" | "hold" | "return", target: e.guard as Vec3,
    start: { position: e.guard as Vec3, velocity: ZERO }, begin: 0, duration: 0,
    previous: null as { time: number; velocity: Vec3; acceleration: Vec3 } | null,
    brace: null as readonly [number, number, number, number] | null,
    rejectedCandidates: 0,
  })) };
  const feedback = (target: Vec3) => ({ target, velocity: ZERO, acceleration: ZERO, seconds: config.seconds, weight: config.weight });
  return { name: "interception-reference", state,
    idle() { for (const memory of state.effectors) { memory.phase = "return"; memory.duration = 0; memory.previous = null; memory.brace = null; } },
    step(observation: BodyObservation): MotionCommand {
      const frames = config.effectors.map((e, i): MotionCommand["frames"][number] => {
        const memory = state.effectors[i]!, plane = planes[i]!, own = motion.own(observation, e.frame, e.at);
        const object = config.enabled === false ? undefined : observation.senses.objects?.find((o) => o.id === e.threat.id), at = object?.points[e.threat.point];
        const returning = () => { memory.phase = "return"; memory.start = own; memory.begin = observation.time;
          memory.duration = config.returnSeconds; memory.target = e.guard; memory.brace = null; };
        if (memory.phase === "return" && memory.duration === 0) returning();
        if (!object || !at) {
          memory.previous = null;
          if (memory.phase === "intercept" || memory.phase === "hold") returning();
        } else {
          const sample = motion.object(object, at), previous = memory.previous;
          const acceleration: Vec3 = previous && sample.time > previous.time
            ? sample.velocity.map((v, k) => (v - previous.velocity[k]!) / (sample.time - previous.time)) as unknown as Vec3
            : previous && sample.time === previous.time ? previous.acceleration : ZERO;
          memory.previous = { time: sample.time, velocity: sample.velocity, acceleration };
          const contactId = e.threat.contact ?? e.threat.id;
          const contacts = (() => {
            const frame = e.frame;
            switch (frame.kind) {
              case "segment": return observation.contacts.filter((c) => c.segment === frame.name);
              case "item": return observation.equipment!.find((item) => item.id === frame.id)!.contacts;
              default: { const never: never = frame; throw new Error(`unknown interception frame ${JSON.stringify(never)}`); }
            }
          })();
          const touched = contacts.some((c) => c.other === contactId && c.impulse >= config.contactImpulse);
          if (touched && memory.phase !== "hold" && (memory.phase === "intercept" || dot(sample.velocity, plane.normal) < 0)) {
            memory.phase = "hold";
            if (e.braceRotation) memory.brace = [...motion.part(observation, e.frame).rotation];
          }
          if (memory.phase !== "hold") {
            const candidate = predictIntercept(sample, acceleration, plane, observation.time, config.horizon);
            if (candidate) {
              const origin = motion.own(observation, e.reach.frame, e.reach.at).position;
              if (distance(origin, candidate.position) <= e.reach.distance && distance(own.position, candidate.position) <= e.travelSpeed * candidate.seconds) {
                if (memory.phase !== "intercept") { memory.start = own; memory.begin = observation.time; memory.duration = candidate.seconds; }
                else memory.duration = Math.min(memory.duration, observation.time - memory.begin + candidate.seconds);
                memory.phase = "intercept"; memory.target = candidate.position; memory.brace = null;
              } else memory.rejectedCandidates++;
            }
          }
          const separation = sample.position.map((v, k) => v - plane.point[k]!) as unknown as Vec3;
          if (!touched && (memory.phase === "intercept" || memory.phase === "hold")
            && dot(separation, plane.normal) > config.retreatDistance && dot(sample.velocity, plane.normal) > 0) returning();
        }
        let translation = feedback(memory.target);
        if (memory.phase === "intercept" || memory.phase === "return") {
          const elapsed = Math.max(0, observation.time - memory.begin);
          translation = { ...translation, ...pointPath(memory.start, memory.target, elapsed, memory.duration) };
          if (memory.phase === "return" && elapsed >= memory.duration) memory.phase = "guard";
        }
        return { id: e.id, frame: e.frame, at: e.at, translation,
          ...(memory.brace ? { orientation: { ...feedback(ZERO), target: memory.brace, weight: config.braceWeight } } : {}) };
      });
      const joints = config.joints.map((goal) => {
        if (config.marginFraction === 0 || config.marginWeight === 0) return goal;
        const channel = channels.get(goal.channel), reading = observation.joints.find((j) => j.name === goal.channel);
        if (!channel || !reading || !(channel.max > channel.min)) throw new Error("interception posture has no observed channel");
        const margin = config.marginFraction * (channel.max - channel.min);
        const proximity = Math.max(0, Math.min(1, 1 - Math.min(reading.angle - channel.min, channel.max - reading.angle) / margin));
        return { ...goal, weight: goal.weight + config.marginWeight * proximity };
      });
      return { joints, frames: [...config.hold, ...frames], grips: [], ...(config.centres ? { centres: config.centres } : {}) };
    },
  };
}
