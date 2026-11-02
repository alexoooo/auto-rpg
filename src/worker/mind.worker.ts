import { replyBox } from "../apart/box.ts";
import { encodeExact } from "../apart/codec.ts";
import { mindThread } from "../apart/thread.ts";
import { ANSWERED, DONE, type Batch } from "../apart/wire.ts";
import { DATA_KEYS, loadData } from "../core/data/store.ts";
import type { MindWorkerStart } from "./minds.ts";

/**
 * **A minds' worker in the browser** (`browserMindWorkers`, `minds.ts`): told its counters, reply box
 * and arena first, then each batch by message, in order; each answered in the box (`encodeExact`),
 * then counted done. Every mind's data loads before its first batch is carried out. The numbers it
 * makes anew are made in the arena, one after another, and cross by where they lie.
 */
const scope = self as unknown as { onmessage: ((event: MessageEvent<MindWorkerStart | Batch>) => void) | null; close(): void };
const ready = loadData(DATA_KEYS);
let started: { readonly control: Int32Array; readonly put: (text: string) => void; readonly arena: SharedArrayBuffer; readonly count: (steps: number) => void; readonly thread: ReturnType<typeof mindThread> } | null = null;
let made = 0, chain: Promise<void> = ready;

scope.onmessage = ({ data }) => {
  if ("kind" in data) {
    const { arena } = data, box = replyBox(data.box);
    const allocate = (length: number): Float64Array => {
      if (8 * (made + length) > arena.byteLength) throw new Error(`a minds' worker made more numbers than its arena of ${arena.byteLength} bytes holds`);
      const numbers = new Float64Array(arena, 8 * made, length);
      made += length;
      return numbers;
    };
    const control = data.control;
    const count = (steps: number): void => { Atomics.store(control, ANSWERED, steps); Atomics.notify(control, ANSWERED); };
    started = { control, put: (text) => box.put(text), arena, count, thread: mindThread(allocate, count) };
    return;
  }
  const batch = data;
  chain = chain.then(() => {
    const { control, put, arena, count, thread } = started!;
    if (batch.stop) { scope.close(); return; }
    const reply = thread.handle(batch);
    let text: string;
    try {
      text = encodeExact(reply, (numbers) => {
        if (numbers.buffer !== arena) throw new Error("a minds' worker answered with numbers outside its arena");
        return { offset: numbers.byteOffset / 8, length: numbers.length };
      });
    } catch (error) { text = encodeExact({ seq: batch.seq, said: [], error: String((error as Error)?.stack ?? error) }, () => { throw new Error("no numbers"); }); }
    put(text);
    count(thread.steps);
    Atomics.store(control, DONE, batch.seq);
    Atomics.notify(control, DONE);
  });
};
