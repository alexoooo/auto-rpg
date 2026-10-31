import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { Puppet } from "../render/puppet.ts";
import { BODY_HEAD, HAND_POSES, SEGMENT_ROW, frameLayout, type RosterBody } from "./frame.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";
import type { StageNews } from "./stage.ts";
import type { OrdersEntry } from "../arena/duel.ts";
import type { Orders } from "../core/intent/orders.ts";
import type { Side } from "../core/spec/body.ts";

/** How fast the shown moment is drawn back toward one step behind the newest frame, a share a second. */
const SHOWN_CORRECTION = 5;

/** The most frames a page holds: past them the oldest are let go, as when a hidden tab draws nothing. */
const FRAMES_HELD = 64;

/** The two frames to draw between, and how far from the first to the second, 0 to 1. */
export interface Between {
  readonly from: Float64Array;
  readonly to: Float64Array;
  readonly share: number;
}

/**
 * **A page's world in a worker** (`serve`, `world.worker.ts`): what the page asked built, its
 * bodies (`roster`, each at `offsets` in a frame), and the frames it has sent. The page draws
 * between the last two it holds about the moment it shows (`between`), which follows the
 * world's speed one step behind its newest frame, so motion is smooth at the display's rate
 * whatever a step costs.
 */
export interface WorldLink<Card = unknown> {
  readonly hz: number;
  readonly roster: readonly RosterBody<Card>[];
  readonly offsets: readonly number[];
  /** The newest frame. */
  readonly newest: Float64Array;
  /** Run the world in real time, or hold it. */
  run(running: boolean): void;
  /** Take `steps` steps now and show the newest: a console's step, resolved once the frames are here. */
  step(steps: number): Promise<void>;
  /** Order `side` of a duel from the next step on, kept on its tape: what a person does. */
  order(side: Side, orders: Orders | null): void;
  /** The bout's tape as the worker has it now. */
  tape(): Promise<readonly OrdersEntry[]>;
  /** Make each step at least `ms` dearer in the worker. */
  burden(ms: number): void;
  /** The frames to draw between at `now`, ms on `performance.now()`'s clock. */
  between(now: number): Between;
  /** The steps sent since the last call, and the worker's time for them, ms. */
  received(): { readonly steps: number; readonly ms: number };
  /** Called with each piece of news as its frame arrives, and with a fault's message. */
  listen(listener: { readonly news?: (news: StageNews) => void; readonly fault?: (message: string) => void }): void;
  dispose(): void;
}

/** Build, in a worker of its own, the world `start` names; resolved once it is built. */
export function openWorld<Card>(start: Extract<ToWorker, { readonly kind: "team" | "duel" }>, signal: AbortSignal): Promise<WorldLink<Card>> {
  signal.throwIfAborted();
  const worker = new Worker(new URL("./world.worker.ts", import.meta.url), { type: "module" });
  const send = (message: ToWorker) => worker.postMessage(message);
  const frames: Float64Array[] = [];
  const listeners: { news?: (news: StageNews) => void; fault?: (message: string) => void }[] = [];
  const clock = { shown: 0, last: -1 }, tally = { steps: 0, ms: 0 };
  let stepped: (() => void)[] = [], taped: ((tape: readonly OrdersEntry[]) => void)[] = [];
  let link: WorldLink<Card> | null = null;
  return new Promise<WorldLink<Card>>((resolve, reject) => {
    const fail = (message: string) => {
      if (!link) { worker.terminate(); reject(new Error(message)); return; }
      for (const listener of listeners) listener.fault?.(message);
    };
    const abort = () => { worker.terminate(); if (!link) reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    worker.addEventListener("error", (event) => fail(event.message || "the world's worker failed to start"));
    worker.addEventListener("message", ({ data }: MessageEvent<FromWorker>) => {
      switch (data.kind) {
        case "ready": {
          frames.push(data.frame);
          clock.shown = data.frame[0]!;
          const { offsets } = frameLayout(data.roster);
          link = {
            hz: data.hz, roster: data.roster as readonly RosterBody<Card>[], offsets,
            get newest() { return frames.at(-1)!; },
            run: (running) => send({ kind: "run", running }),
            step: (steps) => new Promise((done) => {
              stepped.push(() => { clock.shown = frames.at(-1)![0]!; done(); });
              send({ kind: "step", steps });
            }),
            order: (side, orders) => send({ kind: "order", side, orders }),
            tape: () => new Promise((done) => { taped.push(done); send({ kind: "tape" }); }),
            burden: (ms) => send({ kind: "burden", ms }),
            between: (now) => between(frames, clock, now, 1 / data.hz),
            received() { const out = { ...tally }; tally.steps = tally.ms = 0; return out; },
            listen(listener) { listeners.push(listener); },
            dispose() { signal.removeEventListener("abort", abort); worker.terminate(); },
          };
          resolve(link);
          return;
        }
        case "frame":
          frames.push(data.frame);
          if (frames.length > FRAMES_HELD) frames.splice(0, frames.length - FRAMES_HELD);
          tally.steps += 1; tally.ms += data.frame[3]!;
          if (data.news) for (const listener of listeners) listener.news?.(data.news);
          return;
        case "stepped": {
          const waiting = stepped;
          stepped = [];
          for (const done of waiting) done();
          return;
        }
        case "tape": {
          const waiting = taped;
          taped = [];
          for (const done of waiting) done(data.tape);
          return;
        }
        case "fault":
          fail(data.message);
          return;
        default: {
          const never: never = data;
          fail(`unknown message ${JSON.stringify(never)}`);
        }
      }
    });
    send(start);
  });
}

/**
 * The moment to show at `now`: the last moment shown carried on at the world's speed, drawn toward
 * one step behind the newest frame, and held between the oldest frame and the newest. The frames
 * older than the pair it falls between are let go.
 */
function between(frames: Float64Array[], clock: { shown: number; last: number }, now: number, dt: number): Between {
  const newest = frames.at(-1)!;
  const real = clock.last < 0 ? 0 : Math.min(0.1, (now - clock.last) / 1000);
  clock.last = now;
  clock.shown += real * newest[2]!;
  clock.shown += (newest[0]! - dt - clock.shown) * Math.min(1, real * SHOWN_CORRECTION);
  clock.shown = Math.max(frames[0]![0]!, Math.min(newest[0]!, clock.shown));
  let k = 0;
  while (k < frames.length - 2 && frames[k + 1]![0]! <= clock.shown) k++;
  if (k > 0) frames.splice(0, k);
  const from = frames[0]!, to = frames[1] ?? from, span = to[0]! - from[0]!;
  return { from, to, share: span > 0 ? Math.min(1, (clock.shown - from[0]!) / span) : 1 };
}

const work = { from: new Quaternion(), to: new Quaternion() };

/** Pose `puppet`, the body at `offset` in a frame, between `at`'s two frames; its hands and toes as the later frame has them. */
export function posePuppet(puppet: Puppet, offset: number, at: Between): void {
  const { from, to, share } = at, keep = 1 - share;
  let k = offset + BODY_HEAD;
  for (const segment of puppet.segments.values()) {
    const node = segment.node;
    node.position.set(from[k]! * keep + to[k]! * share, from[k + 1]! * keep + to[k + 1]! * share, from[k + 2]! * keep + to[k + 2]! * share);
    work.from.set(from[k + 3]!, from[k + 4]!, from[k + 5]!, from[k + 6]!);
    work.to.set(to[k + 3]!, to[k + 4]!, to[k + 5]!, to[k + 6]!);
    Quaternion.SlerpToRef(work.from, work.to, share, node.rotationQuaternion!);
    const pose = to[k + 7]!;
    if (segment.handPose && pose >= 0) segment.handPose.applied = HAND_POSES[pose]!;
    if (segment.toes) segment.toes.bend = to[k + 8]!;
    k += SEGMENT_ROW;
  }
}

/** The body at `offset`: its life, whether it is down and out, from the later frame, and its centre between the two. */
export function bodyBetween(offset: number, at: Between, centre: { set(x: number, y: number, z: number): unknown }) {
  const { from, to, share } = at, keep = 1 - share;
  centre.set(from[offset + 3]! * keep + to[offset + 3]! * share, from[offset + 4]! * keep + to[offset + 4]! * share,
    from[offset + 5]! * keep + to[offset + 5]! * share);
  return { life: to[offset]!, down: to[offset + 1]! === 1, out: to[offset + 2]! === 1 };
}
