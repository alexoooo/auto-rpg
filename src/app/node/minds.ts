import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from "node:worker_threads";
import type { MindPlace } from "../../minds/apart.ts";
import { mindThreads, type ThreadLink } from "../apart/host.ts";
import { ANSWERED, COUNTERS, DONE, POSTED, waitPast, type Reply } from "../apart/wire.ts";

/**
 * How the world waits on a minds' thread, ms: spinning `spin` first, about a step, since it has
 * nothing else to do and a mind's answer comes within it, and calling the thread stopped after
 * `timeout`, far beyond any step's thinking.
 */
const WAITING = Object.freeze({ spin: 8, timeout: 120_000 });

/**
 * **Minds apart in Node's worker threads** (`mindThreads`, `src/app/apart/host.ts`): `threads` threads
 * (`src/app/node/mind-worker.ts`), each sent its batches by message on a port of its own and counted on
 * counters both share (`POSTED`, `DONE`, `ANSWERED`), its answers taken from the port as they are counted.
 */
export function mindWorkers(threads: number): MindPlace {
  if (!(Number.isInteger(threads) && threads >= 1)) throw new Error(`minds run on a whole number of threads, one or more, not ${threads}`);
  const workers: Worker[] = [], ports: MessagePort[] = [];
  let complete = false;
  try {
  const links = Array.from({ length: threads }, (): ThreadLink => {
    const { port1: port, port2 } = new MessageChannel();
    ports.push(port, port2);
    const control = new Int32Array(new SharedArrayBuffer(4 * COUNTERS));
    const worker = new Worker(new URL("./mind-worker.ts", import.meta.url), { workerData: { port: port2, control }, transferList: [port2] });
    workers.push(worker);
    worker.unref();
    return {
      post(batch) {
        port.postMessage(batch);
        Atomics.store(control, POSTED, batch.seq);
        Atomics.notify(control, POSTED);
      },
      wait: (seq) => waitPast(control, DONE, seq - 1, WAITING),
      answered: (steps) => waitPast(control, ANSWERED, steps - 1, WAITING),
      *replies() { for (let got = receiveMessageOnPort(port); got; got = receiveMessageOnPort(port)) yield got.message as Reply; },
      stop() {
        port.close();
        void worker.terminate();
      },
    };
  });
  const place = mindThreads(links);
  complete = true;
  return place;
  } finally {
    if (!complete) {
      for (const port of ports) port.close();
      for (const worker of workers) void worker.terminate();
    }
  }
}
