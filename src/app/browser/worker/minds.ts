import type { MindPlace } from "../../../minds/apart.ts";
import { replyBox } from "../../apart/box.ts";
import { decodeExact } from "../../apart/codec.ts";
import { mindThreads, type ThreadLink } from "../../apart/host.ts";
import { ANSWERED, COUNTERS, DONE, waitPast, type Reply } from "../../apart/wire.ts";

/** How the world waits on a minds' thread, ms: spinning about a step, then sleeping; a thread silent past `timeout` is a defect. */
const WAITING = Object.freeze({ spin: 8, timeout: 120_000 });

/** The room a thread's answers have, bytes, and the numbers it may make anew, bytes: far beyond a fight's. */
const BOX_BYTES = 4 << 20, ARENA_BYTES = 4 << 20;

/** What a minds' worker is told first (`mind.worker.ts`): its counters, its reply box and the memory it makes numbers in. */
export interface MindWorkerStart { readonly kind: "start"; readonly control: Int32Array; readonly box: SharedArrayBuffer; readonly arena: SharedArrayBuffer }
export interface MindWorkerReady { readonly kind: "ready" }

/**
 * **Minds apart in the browser's workers** (`mindThreads`, `src/app/apart/host.ts`), from a world's own
 * worker: `threads` module workers (`mind.worker.ts`), all initialized before the pool is returned,
 * each sent its batches by message and answering
 * in a reply box in shared memory (`replyBox`), since the world's thread waits for an answer without
 * returning to take a message; the numbers a thread makes anew lie in an arena both share and
 * cross by where they lie. The same bout as on one thread.
 */
export async function browserMindWorkers(threads: number): Promise<MindPlace> {
  if (!(Number.isInteger(threads) && threads >= 1)) throw new Error(`minds run on a whole number of threads, one or more, not ${threads}`);
  const workers: Worker[] = [];
  const ready: Promise<void>[] = [];
  let complete = false;
  try {
  const links = Array.from({ length: threads }, (): ThreadLink => {
    const worker = new Worker(new URL("./mind.worker.ts", import.meta.url), { type: "module" });
    workers.push(worker);
    ready.push(new Promise((resolve, reject) => {
      const clean = () => { worker.removeEventListener("message", initialized); worker.removeEventListener("error", failed); };
      const initialized = (event: MessageEvent<MindWorkerReady>) => { if (event.data.kind === "ready") { clean(); resolve(); } };
      const failed = (event: ErrorEvent) => { clean(); reject(new Error(event.message || "a minds' worker failed to start")); };
      worker.addEventListener("message", initialized); worker.addEventListener("error", failed);
    }));
    const control = new Int32Array(new SharedArrayBuffer(4 * COUNTERS)), box = replyBox(BOX_BYTES), arena = new SharedArrayBuffer(ARENA_BYTES);
    worker.postMessage({ kind: "start", control, box: box.buffer, arena } satisfies MindWorkerStart);
    const unshelve = ({ offset, length }: { readonly offset: number; readonly length: number }) => new Float64Array(arena, 8 * offset, length);
    const received: Reply[] = [];
    const drain = () => { for (let text = box.take(); text !== null; text = box.take()) received.push(decodeExact(text, unshelve) as Reply); };
    const waiting = { ...WAITING, drain };
    return {
      post: (batch) => worker.postMessage(batch),
      wait: (seq) => waitPast(control, DONE, seq - 1, waiting),
      answered: (steps) => waitPast(control, ANSWERED, steps - 1, waiting),
      *replies() { drain(); yield* received.splice(0); },
      stop: () => worker.terminate(),
    };
  });
  await Promise.all(ready);
  const place = mindThreads(links);
  complete = true;
  return place;
  } finally { if (!complete) for (const worker of workers) worker.terminate(); }
}

/** How many minds' threads a page's world runs: its machine's processors less the page's and the world's, at most 4, at least 1. */
const mindThreadCount = (): number => Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 2));

/**
 * **Where a page's fight runs its minds**: apart, on the browser's workers (`browserMindWorkers`),
 * where the page is cross-origin isolated and so may share memory; else in the world's own thread
 * (none), the same bout. Its fight disposes it.
 */
export const pageMinds = (): Promise<MindPlace> | undefined => globalThis.crossOriginIsolated === true ? browserMindWorkers(mindThreadCount()) : undefined;
