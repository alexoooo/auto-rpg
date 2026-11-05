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

/**
 * **Minds apart in the browser's workers** (`mindThreads`, `src/app/apart/host.ts`), from a world's own
 * worker: `threads` module workers (`mind.worker.ts`), each sent its batches by message and answering
 * in a reply box in shared memory (`replyBox`), since the world's thread waits for an answer without
 * returning to take a message; the numbers a thread makes anew lie in an arena both share and
 * cross by where they lie. The same bout as on one thread.
 */
export function browserMindWorkers(threads: number): MindPlace {
  if (!(Number.isInteger(threads) && threads >= 1)) throw new Error(`minds run on a whole number of threads, one or more, not ${threads}`);
  const links = Array.from({ length: threads }, (): ThreadLink => {
    const worker = new Worker(new URL("./mind.worker.ts", import.meta.url), { type: "module" });
    const control = new Int32Array(new SharedArrayBuffer(4 * COUNTERS)), box = replyBox(BOX_BYTES), arena = new SharedArrayBuffer(ARENA_BYTES);
    worker.postMessage({ kind: "start", control, box: box.buffer, arena } satisfies MindWorkerStart);
    const unshelve = ({ offset, length }: { readonly offset: number; readonly length: number }) => new Float64Array(arena, 8 * offset, length);
    return {
      post: (batch) => worker.postMessage(batch),
      wait: (seq) => waitPast(control, DONE, seq - 1, WAITING),
      answered: (steps) => waitPast(control, ANSWERED, steps - 1, WAITING),
      *replies() { for (let text = box.take(); text !== null; text = box.take()) yield decodeExact(text, unshelve) as Reply; },
      stop: () => worker.terminate(),
    };
  });
  return mindThreads(links);
}

/** How many minds' threads a page's world runs: its machine's processors less the page's and the world's, at most 4, at least 1. */
const mindThreadCount = (): number => Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 2));

/**
 * **Where a page's fight runs its minds**: apart, on the browser's workers (`browserMindWorkers`),
 * where the page is cross-origin isolated and so may share memory; else in the world's own thread
 * (none), the same bout. Its fight disposes it.
 */
export const pageMinds = (): MindPlace | undefined => globalThis.crossOriginIsolated === true ? browserMindWorkers(mindThreadCount()) : undefined;
