import { configurationCode, configurationAt } from "../bodies/build/configurations.ts";
import { NOTHING_SENSED, OFF_BODY, sensedSpec, shownSegments, type Senses, type BodySense } from "../bodies/senses.ts";
import { Vector3 } from "../math/vector.ts";
import type { BuiltBody, BuiltSegment } from "../bodies/build/build-body.ts";
import type { BodySpec } from "../bodies/spec/body.ts";
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
   * it or after, each as late as its reaction time (`reactionSteps`). Until the next step the
   * others see it as it stands now, in the fight.
   */
  add(sensed: Sensed): () => Senses;
  /** Stop carrying a body before its physics is disposed. */
  remove(id: string): void;
  /** Its memory (`src/core/state.ts`): each body's frames and which of them is shown, by the body's id. */
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

/** How many whole steps late a body of `spec` sees every other body in a world stepping `hz` times a second: its reaction time (`AttributeSpec.reaction`), to the nearest step. */
export function reactionSteps(spec: BodySpec, hz: number): number {
  return Math.round(spec.attributes.reaction.value * hz);
}

/**
 * How many numbers one reading of a body of `segments` holds, in the order `read` writes them and
 * `show` takes them: each segment's position, turn, centre, velocity, spin and configuration or
 * `OFF_BODY`, then the centre of the parts on the body, its velocity, whether it is out, whether
 * it is down, its life and its observation time.
 */
function frameLength(segments: number): number { return (3 + 4 + 3 + 3 + 3 + 1) * segments + 3 + 3 + 1 + 1 + 1 + 1; }

/**
 * **The one layer between the world and every mind's `Senses`.** In the step's sensing phase
 * (`World.sense`) it reads every body it carries as the last solver step left it, and shows each
 * to every other as late as that other's reaction time (`reactionSteps`). Every mind of one
 * reaction time in a step therefore sees the same moment, and none sees another through its view.
 *
 * `clock` is when the fight's clock started and when it gives its verdict at the latest
 * (`Senses.begins`, `Senses.ends`), none unless given. Each body's frames are its memory
 * (`Remembered`), plain numbers, and the hub's state.
 */
export function createSenses(world: World, clock?: { readonly begins: number; readonly ends: number }): SensesHub {
  const carried: Carried[] = [];
  const state = new Map<string, Remembered>();
  const p = new Vector3(), v = new Vector3(), w = new Vector3();
  // The longest reaction time of any body carried, steps: every body's frames hold that many steps back.
  let longest = 0;

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
      frame[k++] = configurationCode(segment.spec, segment.configuration?.applied);
      mass += m; cx += m * p.x; cy += m * p.y; cz += m * p.z; vx += m * v.x; vy += m * v.y; vz += m * v.z;
    }
    frame[k++] = cx / mass; frame[k++] = cy / mass; frame[k++] = cz / mass;
    frame[k++] = vx / mass; frame[k++] = vy / mass; frame[k++] = vz / mass;
    frame[k++] = out ? 1 : 0;
    frame[k++] = down ? 1 : 0;
    frame[k++] = life;
    frame[k++] = world.time;
  };
  /** `frame` of `entry` into what one of its showings (`Shown`) shows. */
  const show = (entry: Carried, frame: Float64Array, { view, sense }: Shown): void => {
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
      if (pose >= 0) s.configuration = configurationAt(entry.segments[i]!.spec, pose);
    }
    sense.segments = view.settle();
    sense.centre.set(frame[k++]!, frame[k++]!, frame[k++]!);
    sense.velocity.set(frame[k++]!, frame[k++]!, frame[k++]!);
    sense.out = frame[k++] === 1;
    sense.down = frame[k++] === 1;
    sense.life = frame[k++]!;
    sense.time = frame[k++]!;
  };
  /** Each of `entry`'s showings from the frame as many steps old as the reaction time it is shown at. */
  const showAll = (entry: Carried): void => {
    const memory = state.get(entry.sensed.id)!;
    for (const [steps, shown] of entry.shown) show(entry, aged(memory, steps), shown);
  };
  /** What `entry` is shown as to a body seeing `steps` late: made, and shown from its frames, the first time such a body is carried. */
  const shownAt = (entry: Carried, steps: number): BodySense => {
    let shown = entry.shown.get(steps);
    if (!shown) {
      const view = shownSegments(entry.names), { id, side } = entry.sensed;
      shown = { view, sense: { id, side, spec: entry.spec, out: false, down: false, life: 1, time: world.time, centre: new Vector3(), velocity: new Vector3(), segments: view.settle() } };
      entry.shown.set(steps, shown);
      show(entry, aged(state.get(id)!, steps), shown);
    }
    return shown.sense;
  };

  const hook = world.sense(() => {
    for (const entry of carried) {
      // The newest frame goes where the oldest was.
      const memory = state.get(entry.sensed.id)!;
      read(entry, memory.frames[memory.at]!, entry.sensed.out(), entry.sensed.down?.() ?? false, entry.sensed.life?.() ?? 1);
      memory.at = (memory.at + 1) % memory.frames.length;
      showAll(entry);
    }
  });

  return {
    state,
    remove(id) {
      const index = carried.findIndex((entry) => entry.sensed.id === id);
      if (index < 0) return;
      carried.splice(index, 1);
      state.delete(id);
      for (const entry of carried) {
        const other = entry.others.findIndex((body) => body.id === id);
        if (other >= 0) entry.others.splice(other, 1);
      }
    },
    show() { for (const entry of carried) showAll(entry); },
    add(sensed) {
      if (state.has(sensed.id)) throw new Error(`the senses carry a body called ${sensed.id} already`);
      const names = [...sensed.built.segments.keys()], segments = [...sensed.built.segments.values()], delay = reactionSteps(sensed.built.spec, world.hz);
      const entry: Carried = { sensed, names, segments, attached: attachment(sensed.built), spec: sensedSpec(sensed.built.spec), delay, shown: new Map(), others: [] };
      // A body that sees later than any before lengthens every body's frames by copies of its oldest: what was never kept is shown as the body stood when first kept.
      if (delay > longest) {
        for (const memory of state.values()) memory.frames.splice(memory.at, 0, ...Array.from({ length: delay - longest }, () => memory.frames[memory.at]!.slice()));
        longest = delay;
      }
      // Every frame starts as the body stands, in the fight, up and with the life it has: `out` and `down` are first asked at the next step.
      const standing = new Float64Array(frameLength(segments.length)), memory: Remembered = { at: 0, frames: [] };
      read(entry, standing, false, false, sensed.life?.() ?? 1);
      for (let i = 0; i <= longest; i++) memory.frames.push(standing.slice());
      state.set(sensed.id, memory);
      for (const other of carried) { other.others.push(shownAt(entry, other.delay)); entry.others.push(shownAt(other, delay)); }
      carried.push(entry);
      const senses: Senses = {
        get time() { return world.time; },
        side: sensed.side,
        get out() { return sensed.out(); },
        get life() { return sensed.life?.() ?? 1; },
        ...(clock === undefined ? {} : { begins: clock.begins, ends: clock.ends }),
        reaction: delay / world.hz,
        others: entry.others,
      };
      if (sensed.solids) Object.defineProperty(senses, "solids", { enumerable: true, get: () => sensed.solids });
      return () => senses;
    },
    dispose() { hook.dispose(); carried.length = 0; },
  };
}

/** **A body as the others of one reaction time are shown it**: its segments' view, and the sense that view is settled into. */
interface Shown {
  readonly view: ReturnType<typeof shownSegments>;
  readonly sense: { -readonly [K in keyof BodySense]: BodySense[K] };
}

interface Carried {
  readonly sensed: Sensed;
  readonly names: readonly string[];
  readonly segments: readonly BuiltSegment[];
  /** Whether a segment is on the body (`attachment`). */
  readonly attached: (segment: BuiltSegment) => boolean;
  /** Its spec as the others sense it (`sensedSpec`), the same in every showing. */
  readonly spec: BodySense["spec"];
  /** How late it sees the others, steps (`reactionSteps`). */
  readonly delay: number;
  /** What the others are shown of it, one showing for each reaction time among them, by its steps. */
  readonly shown: Map<number, Shown>;
  /** What it is shown: each other's showing at its own reaction time. */
  readonly others: BodySense[];
}

/** **What the senses remember of a body**: a frame for each step back to the longest reaction time carried, and the next to be written over, the oldest. The newest is the one before it. */
interface Remembered {
  readonly frames: Float64Array[];
  at: number;
}

/** The frame of `memory` written `steps` steps ago: the newest is the one before `at`. */
const aged = (memory: Remembered, steps: number): Float64Array => memory.frames[(memory.at + memory.frames.length - 1 - steps) % memory.frames.length]!;
