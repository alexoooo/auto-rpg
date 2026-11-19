import { receiveMessageOnPort, workerData, type MessagePort } from "node:worker_threads";
import { mindBatches } from "../apart/thread.ts";
import { POSTED, SHARED_NUMBERS, waitPast, type Batch } from "../apart/wire.ts";

/**
 * **A minds' thread in Node** (`mindWorkers`, `src/app/node/minds.ts`): it waits for each batch the
 * world posts and counts, and answers it (`mindBatches`) on its port, until it is told to stop.
 */
const { port, control } = workerData as { readonly port: MessagePort; readonly control: Int32Array };
const answer = mindBatches({ allocate: SHARED_NUMBERS, control, send: (reply) => port.postMessage(reply) });

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

for (let seq = 1; ; seq++) {
  const batch = next(seq);
  if (batch.stop) break;
  await answer(batch);
}
port.close();
