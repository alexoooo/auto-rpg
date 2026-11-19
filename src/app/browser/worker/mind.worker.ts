import { replyBox } from "../../apart/box.ts";
import { encodeExact } from "../../apart/codec.ts";
import { mindBatches } from "../../apart/thread.ts";
import type { Batch } from "../../apart/wire.ts";
import type { MindWorkerReady, MindWorkerStart } from "./minds.ts";

/**
 * **A minds' worker in the browser** (`browserMindWorkers`, `minds.ts`): told its counters, reply box
 * and arena first, then each batch by message, answered in order (`mindBatches`) in the box
 * (`encodeExact`). The numbers it makes anew are made in the arena, one after another, and cross
 * by where they lie.
 */
const scope = self as unknown as { onmessage: ((event: MessageEvent<MindWorkerStart>) => void) | ((event: MessageEvent<Batch>) => void) | null; postMessage(message: MindWorkerReady): void; close(): void };

scope.onmessage = ({ data: { control, box: shared, arena } }: MessageEvent<MindWorkerStart>) => {
  const box = replyBox(shared);
  let made = 0;
  const allocate = (length: number): Float64Array => {
    if (8 * (made + length) > arena.byteLength) throw new Error(`a minds' worker made more numbers than its arena of ${arena.byteLength} bytes holds`);
    const numbers = new Float64Array(arena, 8 * made, length);
    made += length;
    return numbers;
  };
  const answer = mindBatches({ allocate, control, send: (reply) => box.put(encodeExact(reply, (numbers) => {
    if (numbers.buffer !== arena) throw new Error("a minds' worker answered with numbers outside its arena");
    return { offset: numbers.byteOffset / 8, length: numbers.length };
  })) });
  let chain: Promise<void> = Promise.resolve();
  scope.onmessage = ({ data: batch }: MessageEvent<Batch>) => { chain = chain.then(() => batch.stop ? scope.close() : answer(batch)); };
  scope.postMessage({ kind: "ready" });
};
