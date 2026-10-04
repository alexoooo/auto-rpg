import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import { centreOfToRef } from "../control/support.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";

/**
 * **What a mind is told of the world**, each control step, as the last solver step left it. A
 * mind's own body is not here: it has that whole (`OwnBody`, `mind.ts`). Everything it knows of
 * another body is in `others`, and nothing of another mind is: not its memory, its command or
 * its orders.
 */
export interface Senses {
  /** Seconds of the world's clock. */
  readonly time: number;
  /** The side this body fights on; empty in no fight. */
  readonly side: string;
  /** Whether this body is out of the fight. Its own, so it knows at once, whatever the delay. */
  readonly out: boolean;
  /** Every other body the senses carry, as they pass it (`createSenses`): in the order added. */
  readonly others: readonly BodySense[];
}

/**
 * **Another body, as sensed**: everything physical of it, and whether it is still in the fight.
 * Not its hit points. `seekFoe` (`fighter.ts`) reads `side`, `out`, `centre` and the centre
 * of the part it attacks, and at the edge of a foe's reach the spec with what the body holds
 * (`rangeOf`); the segments' poses, velocities and spins are what a mind that attacks a moving
 * body, blocks or parries reads (`docs/roadmap.md`, The AI).
 */
export interface BodySense {
  readonly id: string;
  readonly side: string;
  /** What it is built from, with what it holds. */
  readonly spec: BodySpec;
  readonly out: boolean;
  /** Its centre of mass and that centre's velocity, world. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  /** Each segment, by name, in the order built. */
  readonly segments: ReadonlyMap<string, SegmentSense>;
}

interface SegmentSense {
  /** The segment frame's origin and turn, world: its node's. */
  readonly position: Vector3;
  readonly rotation: Quaternion;
  /** Its rigid body's centre of mass, with what it holds, world; that centre's velocity; its spin. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  readonly spin: Vector3;
}

/** A body the senses carry: who it is, and whether it is out of the fight, asked once a step. */
interface Sensed {
  readonly id: string;
  readonly side: string;
  readonly built: BuiltBody;
  out(): boolean;
}

export interface SensesHub {
  /**
   * Carry `sensed`. Returns what it senses: every body carried but itself, whether added before
   * it or after. Until the next step the others see it as it stands now, in the fight.
   */
  add(sensed: Sensed): () => Senses;
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

/** What a body senses before anything has been read for it: no time, no side, nobody. */
export const NOTHING_SENSED: Senses = Object.freeze({ time: 0, side: "", out: false, others: Object.freeze([]) });

/** Senses that tell the time and nothing else: a body alone on a stand. */
export function clockSenses(world: World): () => Senses {
  const senses = { ...NOTHING_SENSED };
  return () => { senses.time = world.time; return senses; };
}

/**
 * How many numbers one reading of a body of `segments` holds, in the order `read` writes them and
 * `show` takes them: each segment's position, turn, centre, velocity and spin, then the whole
 * body's centre, its velocity, and whether it is out.
 */
function frameLength(segments: number): number { return (3 + 4 + 3 + 3 + 3) * segments + 3 + 3 + 1; }

/**
 * **The one layer between the world and every mind's `Senses`.** In the step's sensing phase
 * (`World.sense`) it reads every body it carries as the last solver step left it, and shows each
 * to the others `delay` steps late. Every mind in a step therefore sees the same moment, and none
 * sees another through its view.
 *
 * `delay` is whole steps, 0 unless given. The frames a body's delay holds are its memory
 * (`Remembered`), plain numbers, and the hub's state.
 */
export function createSenses(world: World, delay = 0): SensesHub {
  if (!Number.isInteger(delay) || delay < 0) throw new Error(`a delay is whole steps, not ${delay}`);
  const carried: Carried[] = [];
  const state: Record<string, Remembered> = {};
  const p = new Vector3(), v = new Vector3(), w = new Vector3();

  /** `entry`'s body as it stands, into `frame`: each segment, then the whole body's centre, its velocity, and whether it is out. */
  const read = (entry: Carried, frame: Float64Array, out: boolean): void => {
    let k = 0, cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
    for (const segment of entry.segments) {
      const at = segment.node.position, q = segment.node.rotationQuaternion!, m = segment.rigid.mass;
      centreOfToRef(segment, p);
      segment.body.linearVelocityToRef(v);
      segment.body.angularVelocityToRef(w);
      frame[k++] = at.x; frame[k++] = at.y; frame[k++] = at.z;
      frame[k++] = q.x; frame[k++] = q.y; frame[k++] = q.z; frame[k++] = q.w;
      frame[k++] = p.x; frame[k++] = p.y; frame[k++] = p.z;
      frame[k++] = v.x; frame[k++] = v.y; frame[k++] = v.z;
      frame[k++] = w.x; frame[k++] = w.y; frame[k++] = w.z;
      cx += m * p.x; cy += m * p.y; cz += m * p.z; vx += m * v.x; vy += m * v.y; vz += m * v.z;
    }
    const mass = entry.mass;
    frame[k++] = cx / mass; frame[k++] = cy / mass; frame[k++] = cz / mass;
    frame[k++] = vx / mass; frame[k++] = vy / mass; frame[k++] = vz / mass;
    frame[k++] = out ? 1 : 0;
  };
  /** `frame` into what the others are shown of `entry`. */
  const show = (entry: Carried, frame: Float64Array): void => {
    let k = 0;
    for (const s of entry.shown.segments.values()) {
      s.position.set(frame[k++]!, frame[k++]!, frame[k++]!);
      s.rotation.set(frame[k++]!, frame[k++]!, frame[k++]!, frame[k++]!);
      s.centre.set(frame[k++]!, frame[k++]!, frame[k++]!);
      s.velocity.set(frame[k++]!, frame[k++]!, frame[k++]!);
      s.spin.set(frame[k++]!, frame[k++]!, frame[k++]!);
    }
    entry.shown.centre.set(frame[k++]!, frame[k++]!, frame[k++]!);
    entry.shown.velocity.set(frame[k++]!, frame[k++]!, frame[k++]!);
    entry.shown.out = frame[k++] === 1;
  };

  const hook = world.sense(() => {
    for (const entry of carried) {
      // The newest frame goes where the oldest was; the one after it is now `delay` steps old.
      const memory = state[entry.sensed.id]!;
      read(entry, memory.frames[memory.at]!, entry.sensed.out());
      memory.at = (memory.at + 1) % memory.frames.length;
      show(entry, memory.frames[memory.at]!);
    }
  });

  return {
    state,
    show() {
      for (const entry of carried) {
        const memory = state[entry.sensed.id]!;
        show(entry, memory.frames[memory.at]!);
      }
    },
    add(sensed) {
      if (sensed.id in state) throw new Error(`the senses carry a body called ${sensed.id} already`);
      const segments = [...sensed.built.segments.values()];
      const shown = {
        id: sensed.id, side: sensed.side, spec: sensed.built.spec, out: false,
        centre: new Vector3(), velocity: new Vector3(),
        segments: new Map([...sensed.built.segments.keys()].map((name) => [name,
          { position: new Vector3(), rotation: new Quaternion(), centre: new Vector3(), velocity: new Vector3(), spin: new Vector3() }])),
      };
      const entry: Carried = {
        sensed, segments, shown, others: [],
        mass: segments.reduce((sum, s) => sum + s.rigid.mass, 0),
      };
      // Every frame starts as the body stands, in the fight: `out` is first asked at the next step.
      const standing = new Float64Array(frameLength(segments.length)), memory: Remembered = { at: 0, frames: [] };
      read(entry, standing, false);
      for (let i = 0; i <= delay; i++) memory.frames.push(standing.slice());
      state[sensed.id] = memory;
      show(entry, standing);
      for (const other of carried) { other.others.push(shown); entry.others.push(other.shown); }
      carried.push(entry);
      const senses: Senses = {
        get time() { return world.time; },
        side: sensed.side,
        get out() { return sensed.out(); },
        others: entry.others,
      };
      return () => senses;
    },
    dispose() { hook.dispose(); carried.length = 0; },
  };
}

interface Carried {
  readonly sensed: Sensed;
  readonly segments: readonly BuiltSegment[];
  readonly mass: number;
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
