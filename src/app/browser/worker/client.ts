import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { Puppet } from "../render/puppet.ts";
import { BODY_HEAD, SEGMENT_ROW, frameLayout, type RosterBody } from "../../worker/frame.ts";
import { configurationAt } from "../../../core/bodies/build/configurations.ts";
import type { FromWorker, TapeEntry, ToWorker, WorldInput } from "../../worker/protocol.ts";
import type { StageNews } from "../../worker/stage.ts";

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
  /** Tell the stage what a person does, or what the page looks at (`DuelInput`, `CryptInput`), before its next step. */
  input(input: WorldInput): void;
  /** The stage's tape as the worker has it now. */
  tape(): Promise<readonly TapeEntry[]>;
  /** Make each step at least `ms` dearer in the worker. */
  burden(ms: number): void;
  /** The frames to draw between at `now`, ms on `performance.now()`'s clock. */
  between(now: number): Between;
  /** The steps sent since the last call, and the worker's time for them, ms. */
  received(): { readonly steps: number; readonly ms: number };
  /** Called with each piece of news as it arrives, with its frame or between frames, and with a fault's message. */
  listen(listener: { readonly news?: (news: StageNews) => void; readonly fault?: (message: string) => void }): void;
  dispose(): void;
}

/** Build, in a worker of its own, the world `start` names; resolved once it is built. */
export function openWorld<Card>(start: Extract<ToWorker, { readonly kind: "team" | "duel" | "crypt" }>, signal: AbortSignal): Promise<WorldLink<Card>> {
  signal.throwIfAborted();
  const worker = new Worker(new URL("./world.worker.ts", import.meta.url), { type: "module" });
  let closed: { readonly reason: unknown } | null = null;
  const frames: Float64Array[] = [];
  const listeners: { news?: (news: StageNews) => void; fault?: (message: string) => void }[] = [];
  /** News that came before anything listened, told to each listener as it listens. */
  const early: StageNews[] = [];
  const tell = (news: StageNews) => {
    if (!listeners.length) { early.push(news); return; }
    for (const listener of listeners) listener.news?.(news);
  };
  const clock = { shown: 0, last: -1 }, tally = { steps: 0, ms: 0 };
  const stepped = new Map<number, { resolve(): void; reject(reason: unknown): void }>();
  const taped = new Map<number, { resolve(tape: readonly TapeEntry[]): void; reject(reason: unknown): void }>();
  let request = 0;
  let link: WorldLink<Card> | null = null;
  return new Promise<WorldLink<Card>>((resolve, reject) => {
    const end = (reason: unknown) => {
      if (closed) return;
      closed = { reason };
      signal.removeEventListener("abort", abort);
      worker.terminate();
      for (const pending of stepped.values()) pending.reject(reason);
      for (const pending of taped.values()) pending.reject(reason);
      stepped.clear(); taped.clear();
      if (!link) reject(reason);
    };
    const fail = (message: string) => {
      if (closed) return;
      end(new Error(message));
      for (const listener of listeners) listener.fault?.(message);
    };
    const send = (message: ToWorker) => {
      if (closed) throw closed.reason;
      try { worker.postMessage(message); }
      catch (error) {
        end(error);
        const message = error instanceof Error ? error.message : String(error);
        for (const listener of listeners) listener.fault?.(message);
        throw error;
      }
    };
    const abort = () => end(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    worker.addEventListener("error", (event) => fail(event.message || "the world's worker failed to start"));
    worker.addEventListener("messageerror", () => fail("the world's worker sent an unreadable message"));
    worker.addEventListener("message", ({ data }: MessageEvent<FromWorker>) => {
      if (closed) return;
      switch (data.kind) {
        case "ready": {
          frames.push(data.frame);
          clock.shown = data.frame[0]!;
          const { offsets } = frameLayout(data.roster);
          link = {
            hz: data.hz, roster: data.roster as readonly RosterBody<Card>[], offsets,
            get newest() { return frames.at(-1)!; },
            run: (running) => send({ kind: "run", running }),
            step: (steps) => new Promise((done, refused) => {
              if (closed) { refused(closed.reason); return; }
              const id = request++;
              stepped.set(id, { resolve() { clock.shown = frames.at(-1)![0]!; done(); }, reject: refused });
              send({ kind: "step", steps, request: id });
            }),
            input: (input) => send({ kind: "input", input }),
            tape: () => new Promise((done, refused) => {
              if (closed) { refused(closed.reason); return; }
              const id = request++;
              taped.set(id, { resolve: done, reject: refused }); send({ kind: "tape", request: id });
            }),
            burden: (ms) => send({ kind: "burden", ms }),
            between: (now) => between(frames, clock, now, 1 / data.hz),
            received() { const out = { ...tally }; tally.steps = tally.ms = 0; return out; },
            listen(listener) { listeners.push(listener); for (const news of early) listener.news?.(news); },
            dispose() { end(new Error("the world's worker was disposed")); },
          };
          resolve(link);
          return;
        }
        case "frame":
          frames.push(data.frame);
          if (frames.length > FRAMES_HELD) frames.splice(0, frames.length - FRAMES_HELD);
          tally.steps += 1; tally.ms += data.frame[3]!;
          if (data.news) tell(data.news);
          return;
        case "news":
          tell(data.news);
          return;
        case "stepped": {
          const waiting = stepped.get(data.request);
          stepped.delete(data.request);
          waiting?.resolve();
          return;
        }
        case "tape": {
          const waiting = taped.get(data.request);
          taped.delete(data.request);
          waiting?.resolve(data.tape);
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

/** Pose `puppet`, the body at `offset` in a frame, between `at`'s two frames; its hands, toes and attachment as the later frame has them. */
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
    if (segment.configuration && pose >= 0) segment.configuration.applied = configurationAt(segment.spec, pose);
    if (segment.toes) segment.toes.bend = to[k + 8]!;
    segment.attached = to[k + 9] === 1;
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
