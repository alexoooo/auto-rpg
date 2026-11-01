import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from "node:worker_threads";
import { catalogName, type MindPlace, type ReportNow, type Seat, type SeatAsk, type SeatSays } from "../core/mind/apart.ts";
import type { MirrorChannel } from "../core/mind/mirror.ts";
import { MIND_CATALOGS } from "./catalogs.ts";
import { DONE, POSTED, SHARED_NUMBERS, waitPast, type Batch, type Carried, type Reply } from "./wire.ts";

/**
 * How the world waits on a minds' thread, ms: spinning `spin` first, about a step, since it has
 * nothing else to do and a mind's answer comes within it, and calling the thread stopped after
 * `timeout`, far beyond any step's thinking.
 */
const WAITING = Object.freeze({ spin: 8, timeout: 120_000 });

/** One minds' thread as the world holds it: the thread, its port and counters, the asks not yet sent and whose they are, the batches posted. */
interface Thread {
  readonly worker: Worker;
  readonly port: MessagePort;
  readonly control: Int32Array;
  readonly queue: Carried[];
  readonly asking: Held[];
  posted: number;
}

/** One seat as the world holds it: its thread, its channel, what of the channel its thread has, the batch its last ask went in or that it waits to be sent, and what its mind last said. */
interface Held {
  readonly thread: Thread;
  readonly channel: MirrorChannel;
  told: number;
  sent: number;
  queued: boolean;
  inbound: Float64Array;
  says: SeatSays;
  kit: ReportNow["kit"];
  gait: ReportNow["gait"];
}

/**
 * **Minds apart in Node's worker threads** (`MindPlace`, `src/core/mind/apart.ts`): `threads`
 * threads, each a host of seats (`src/node/mind-worker.ts`), the seats dealt to them in turn as they
 * are made; which bodies share a thread changes nothing of a bout. The channels' numbers are memory
 * the threads share. An ask to observe waits to go with the others the world makes after physics,
 * in one batch a thread, as the world dispatches them; every other ask goes at once, so a thread
 * thinks for one body while the world writes the next. The world waits on a seat only for the batch
 * that carries its last ask.
 */
export function mindWorkers(threads: number): MindPlace {
  if (!(Number.isInteger(threads) && threads >= 1)) throw new Error(`minds run on a whole number of threads, one or more, not ${threads}`);
  const pool: Thread[] = Array.from({ length: threads }, () => {
    const { port1, port2 } = new MessageChannel(), control = new Int32Array(new SharedArrayBuffer(8));
    const worker = new Worker(new URL("./mind-worker.ts", import.meta.url), { workerData: { port: port2, control }, transferList: [port2] });
    worker.unref();
    return { worker, port: port1, control, queue: [], asking: [], posted: 0 };
  });
  const seats = new Map<number, Held>();
  let next = 0, disposed = false;
  const send = (thread: Thread, batch: Omit<Batch, "seq">) => {
    thread.posted += 1;
    thread.port.postMessage({ ...batch, seq: thread.posted } satisfies Batch);
    Atomics.store(thread.control, POSTED, thread.posted);
    Atomics.notify(thread.control, POSTED);
  };
  const flush = (thread: Thread) => {
    if (thread.queue.length === 0) return;
    send(thread, { asks: thread.queue.splice(0) });
    for (const held of thread.asking.splice(0)) { held.sent = thread.posted; held.queued = false; }
  };
  // `held`'s last ask answered, and what the minds of its thread have said since heard.
  const join = (held: Held) => {
    const { thread } = held;
    if (held.queued) flush(thread);
    waitPast(thread.control, DONE, held.sent - 1, WAITING);
    for (let got = receiveMessageOnPort(thread.port); got; got = receiveMessageOnPort(thread.port)) {
      const reply = got.message as Reply;
      if (reply.error) throw new Error(`a mind apart failed: ${reply.error}`);
      for (const said of reply.said) {
        const held = seats.get(said.seat);
        if (!held) continue;
        if (said.outbound) held.channel.outbound = said.outbound;
        if (said.kit !== undefined) held.kit = said.kit;
        if (said.gait !== undefined) held.gait = said.gait;
        held.says = { has: said.has, observes: said.observes, report: said.report ? { ...said.report, kit: held.kit, gait: held.gait } : null,
          ...(said.menu !== undefined ? { menu: said.menu } : {}) };
      }
    }
  };
  const carry = (seat: number, held: Held, ask: SeatAsk) => {
    const { channel } = held, told = channel.told.length > held.told ? channel.told.slice(held.told) : undefined;
    held.told = channel.told.length;
    const inbound = channel.inbound !== held.inbound ? (held.inbound = channel.inbound) : undefined;
    held.thread.queue.push({ seat, ask, ...(told ? { told } : {}), ...(inbound ? { inbound } : {}) });
    if (!held.queued) { held.queued = true; held.thread.asking.push(held); }
    if (ask.kind !== "observe") flush(held.thread);
  };
  return {
    allocate: SHARED_NUMBERS,
    seat(catalog, recipe, channel, at) {
      if (disposed) throw new Error("the minds' threads were stopped");
      const seat = next++, thread = pool[seat % pool.length]!;
      const held: Held = { thread, channel, told: channel.told.length, sent: 0, queued: true, inbound: channel.inbound, says: { has: recipe.name, observes: false, report: null }, kit: null, gait: null };
      seats.set(seat, held);
      thread.queue.push({ seat, ask: { kind: "make", recipe: { ...recipe, catalog: catalogName(MIND_CATALOGS, catalog) }, at }, told: channel.told.slice(), inbound: channel.inbound, outbound: channel.outbound });
      thread.asking.push(held);
      // Sent at once: its thread makes it while the world goes on, and the world waits for it only where it needs it.
      flush(thread);
      const handle: Seat = {
        ask(ask) {
          carry(seat, held, ask);
          if (ask.kind === "dispose") seats.delete(seat);
        },
        says() {
          join(held);
          return held.says;
        },
      };
      return handle;
    },
    dispatch() { for (const thread of pool) flush(thread); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const thread of pool) {
        flush(thread);
        send(thread, { asks: [], stop: true });
        thread.port.close();
        void thread.worker.terminate();
      }
      seats.clear();
    },
  };
}
