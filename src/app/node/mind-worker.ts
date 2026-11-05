import { receiveMessageOnPort, workerData, type MessagePort } from "node:worker_threads";
import { mindThread } from "../apart/thread.ts";
import { loadBatchData } from "../apart/load-data.ts";
import { ANSWERED, DONE, POSTED, SHARED_NUMBERS, waitPast, type Batch, type Reply } from "../apart/wire.ts";

/**
 * **A minds' thread in Node** (`mindWorkers`, `src/app/node/minds.ts`): it waits for each batch the
 * world posts and counts, carries it out (`mindThread`), and answers on its port, what a seat says
 * with each step's answer before the answer is counted, until it is told to stop. Only the data of each batch's new minds loads before they are constructed.
 */
const { port, control } = workerData as { readonly port: MessagePort; readonly control: Int32Array };
const thread = mindThread(SHARED_NUMBERS, { say: (reply) => port.postMessage(reply), answered: count });

/** Count `steps` step asks answered (`ANSWERED`). */
function count(steps: number): void {
  Atomics.store(control, ANSWERED, steps);
  Atomics.notify(control, ANSWERED);
}

/** How a minds' thread waits for the world, ms: spinning longer than a step, so it is awake for the next step's asks, then sleeping for as long as the world pauses. */
const WAITING = Object.freeze({ spin: 12, timeout: Infinity });

/** The next batch, once posted: a message the world posts before it counts it. */
function next(seq: number): Batch {
  waitPast(control, POSTED, seq - 1, WAITING);
  for (;;) {
    const got = receiveMessageOnPort(port);
    if (got) return got.message as Batch;
  }
}

let failed: string | null = null, totalAnswered = 0;
for (let seq = 1; ; seq++) {
  const batch = next(seq);
  if (batch.stop) break;
  let reply: Reply;
  let answered = totalAnswered + batch.asks.filter(({ ask }) => ask.kind === "step").length;
  try {
    if (failed) reply = { seq: batch.seq, said: [], error: failed };
    else { await loadBatchData(batch); reply = thread.handle(batch); answered = thread.steps; }
    if (reply.error) failed = reply.error;
  }
  catch (error) {
    failed = String((error as Error)?.stack ?? error);
    reply = { seq: batch.seq, said: [], error: failed };
  }
  // What each seat says crosses by copy: a value that cannot be copied fails the batch, said as its error.
  try { port.postMessage(reply); } catch (error) { port.postMessage({ seq, said: [], error: String((error as Error)?.stack ?? error) } satisfies Reply); }
  totalAnswered = answered;
  count(answered);
  Atomics.store(control, DONE, seq);
  Atomics.notify(control, DONE);
}
port.close();
