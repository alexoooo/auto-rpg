import { NOTHING_SENSED, OFF_BODY, shownSegments, type Senses, type BodySense } from "../bodies/senses.ts";
import { Vector3 } from "../math/vector.ts";
import type { BuiltBody, BuiltSegment } from "../bodies/build/build-body.ts";
import { centreOfToRef } from "../bodies/read-motion.ts";
import { attachment } from "../bodies/read-body.ts";

import type { World } from "./world.ts";

import type { SolidSense } from "../bodies/object-senses.ts";

/** A body the senses carry: who it is, whether it is out of the fight, whether it is down and its life, each asked once a step, and the fixed geometry it is granted. */
interface Sensed {
  readonly id: string;
  readonly side: string;
  readonly built: BuiltBody;
  out(): boolean;
  /** Whether it is down; never, unless given. */
  down?(): boolean;
  /** Its life, a fraction of its full life (`Pool.bar`); whole, unless given. */
  life?(): number;
  readonly solids?: readonly SolidSense[];
}

export interface SensesHub {
  /**
   * Carry `sensed`. Returns what it senses: every body carried but itself, whether added before
   * it or after. Until the next step the others see it as it stands now, in the fight.
   */
  add(sensed: Sensed): () => Senses;
  /** Stop carrying a body before its physics is disposed. */
  remove(id: string): void;
  /** Its memory (`src/core/world/state.ts`): each body's frames and which of them is shown, by the body's id. */
  readonly state: object;
  /**
   * Show every body again from its frames. What the others are shown of a body is written each
   * step from its frames; after a load of the state it would show the step before the load until
   * the next step, so whoever loads the state calls this.
   */
  show(): void;
  dispose(): void;
}

/** Senses that tell the time and nothing else: a body alone on a stand. */
export function clockSenses(world: World): () => Senses {
  const senses = { ...NOTHING_SENSED };
  return () => { senses.time = world.time; return senses; };
}

/**
 * How many numbers one reading of a body of `segments` holds, in the order `read` writes them and
 * `show` takes them: each segment's position, turn, centre, velocity, spin and hand pose or
 * `OFF_BODY`, then the centre of the parts on the body, its velocity, whether it is out, whether
 * it is down, its life and its observation time.
 */
function frameLength(segments: number): number { return (3 + 4 + 3 + 3 + 3 + 1) * segments + 3 + 3 + 1 + 1 + 1 + 1; }

/**
 * **The one layer between the world and every mind's `Senses`.** In the step's sensing phase
 * (`World.sense`) it reads every body it carries as the last solver step left it, and shows each
 * to the others `delay` steps late. Every mind in a step therefore sees the same moment, and none
 * sees another through its view.
 *
 * `delay` is whole steps, 0 unless given; `clock`, when the fight's clock started and when it gives
 * its verdict at the latest (`Senses.begins`, `Senses.ends`), none unless given. The frames a body's delay holds are its memory
 * (`Remembered`), plain numbers, and the hub's state.
 */
export function createSenses(world: World, delay = 0, clock?: { readonly begins: number; readonly ends: number }): SensesHub {
  if (!Number.isInteger(delay) || delay < 0) throw new Error(`a delay is whole steps, not ${delay}`);
  const carried: Carried[] = [];
  const state: Record<string, Remembered> = {};
  const p = new Vector3(), v = new Vector3(), w = new Vector3();

  /** `entry`'s body as it stands, into `frame`: each segment, then the centre of the parts on it, its velocity, whether it is out, whether it is down, its life and its observation time. */
  const read = (entry: Carried, frame: Float64Array, out: boolean, down: boolean, life: number): void => {
    let k = 0, mass = 0, cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
    for (const segment of entry.segments) {
      const at = segment.pose.position, q = segment.pose.rotation, m = segment.rigid.mass;
      centreOfToRef(segment, p);
      segment.body.linearVelocityToRef(v);
      segment.body.angularVelocityToRef(w);
      frame[k++] = at.x; frame[k++] = at.y; frame[k++] = at.z;
      frame[k++] = q.x; frame[k++] = q.y; frame[k++] = q.z; frame[k++] = q.w;
      frame[k++] = p.x; frame[k++] = p.y; frame[k++] = p.z;
      frame[k++] = v.x; frame[k++] = v.y; frame[k++] = v.z;
      frame[k++] = w.x; frame[k++] = w.y; frame[k++] = w.z;
      if (!entry.attached(segment)) { frame[k++] = OFF_BODY; continue; }
      const pose = segment.handPose?.applied;
      switch (pose) {
        case undefined: frame[k++] = -1; break;
        case "open": frame[k++] = 0; break;
        case "fist": frame[k++] = 1; break;
        case "grip": frame[k++] = 2; break;
        default: { const never: never = pose; throw new Error(`unknown hand pose ${never}`); }
      }
      mass += m; cx += m * p.x; cy += m * p.y; cz += m * p.z; vx += m * v.x; vy += m * v.y; vz += m * v.z;
    }
    frame[k++] = cx / mass; frame[k++] = cy / mass; frame[k++] = cz / mass;
    frame[k++] = vx / mass; frame[k++] = vy / mass; frame[k++] = vz / mass;
    frame[k++] = out ? 1 : 0;
    frame[k++] = down ? 1 : 0;
    frame[k++] = life;
    frame[k++] = world.time;
  };
  /** `frame` into what the others are shown of `entry`. */
  const show = (entry: Carried, frame: Float64Array): void => {
    const { view } = entry;
    let k = 0;
    for (let i = 0; i < view.all.length; i++) {
      const s = view.all[i]!;
      s.position.set(frame[k++]!, frame[k++]!, frame[k++]!);
      s.rotation.set(frame[k++]!, frame[k++]!, frame[k++]!, frame[k++]!);
      s.centre.set(frame[k++]!, frame[k++]!, frame[k++]!);
      s.velocity.set(frame[k++]!, frame[k++]!, frame[k++]!);
      s.spin.set(frame[k++]!, frame[k++]!, frame[k++]!);
      const pose = frame[k++]!;
      view.mark(i, pose !== OFF_BODY);
      if (pose >= 0) s.handPose = pose === 1 ? "fist" : pose === 2 ? "grip" : "open";
    }
    entry.shown.segments = view.settle();
    entry.shown.centre.set(frame[k++]!, frame[k++]!, frame[k++]!);
    entry.shown.velocity.set(frame[k++]!, frame[k++]!, frame[k++]!);
    entry.shown.out = frame[k++] === 1;
    entry.shown.down = frame[k++] === 1;
    entry.shown.life = frame[k++]!;
    entry.shown.time = frame[k++]!;
  };

  const hook = world.sense(() => {
    for (const entry of carried) {
      // The newest frame goes where the oldest was; the one after it is now `delay` steps old.
      const memory = state[entry.sensed.id]!;
      read(entry, memory.frames[memory.at]!, entry.sensed.out(), entry.sensed.down?.() ?? false, entry.sensed.life?.() ?? 1);
      memory.at = (memory.at + 1) % memory.frames.length;
      show(entry, memory.frames[memory.at]!);
    }
  });

  return {
    state,
    remove(id) {
      const index = carried.findIndex((entry) => entry.sensed.id === id);
      if (index < 0) return;
      carried.splice(index, 1);
      delete state[id];
      for (const entry of carried) {
        const other = entry.others.findIndex((body) => body.id === id);
        if (other >= 0) entry.others.splice(other, 1);
      }
    },
    show() {
      for (const entry of carried) {
        const memory = state[entry.sensed.id]!;
        show(entry, memory.frames[memory.at]!);
      }
    },
    add(sensed) {
      if (sensed.id in state) throw new Error(`the senses carry a body called ${sensed.id} already`);
      const segments = [...sensed.built.segments.values()], view = shownSegments([...sensed.built.segments.keys()]);
      const shown = {
        id: sensed.id, side: sensed.side, spec: sensed.built.spec, out: false, down: false, life: 1, time: world.time,
        centre: new Vector3(), velocity: new Vector3(), segments: view.settle(),
      };
      const entry: Carried = { sensed, segments, attached: attachment(sensed.built), view, shown, others: [] };
      // Every frame starts as the body stands, in the fight, up and with the life it has: `out` and `down` are first asked at the next step.
      const standing = new Float64Array(frameLength(segments.length)), memory: Remembered = { at: 0, frames: [] };
      read(entry, standing, false, false, sensed.life?.() ?? 1);
      for (let i = 0; i <= delay; i++) memory.frames.push(standing.slice());
      state[sensed.id] = memory;
      show(entry, standing);
      for (const other of carried) { other.others.push(shown); entry.others.push(other.shown); }
      carried.push(entry);
      const senses: Senses = {
        get time() { return world.time; },
        side: sensed.side,
        get out() { return sensed.out(); },
        get life() { return sensed.life?.() ?? 1; },
        ...(clock === undefined ? {} : { begins: clock.begins, ends: clock.ends }),
        others: entry.others,
      };
      if (sensed.solids) Object.defineProperty(senses, "solids", { enumerable: true, get: () => sensed.solids });
      return () => senses;
    },
    dispose() { hook.dispose(); carried.length = 0; },
  };
}

interface Carried {
  readonly sensed: Sensed;
  readonly segments: readonly BuiltSegment[];
  /** Whether a segment is on the body (`attachment`). */
  readonly attached: (segment: BuiltSegment) => boolean;
  /** The senses the others are shown of its segments. */
  readonly view: ReturnType<typeof shownSegments>;
  /** What the others are shown of it. */
  readonly shown: { -readonly [K in keyof BodySense]: BodySense[K] };
  /** What it is shown: the others' `shown`. */
  readonly others: BodySense[];
}

/** **What the senses remember of a body**: `delay + 1` frames, and the one shown. The newest is the one before it. */
interface Remembered {
  readonly frames: Float64Array[];
  at: number;
}
