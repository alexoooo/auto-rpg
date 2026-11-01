import { catalogName, type MindPlace, type ReportNow, type Seat, type SeatAsk, type SeatSays } from "../core/mind/apart.ts";
import type { MirrorChannel, MirrorStatics } from "../core/mind/mirror.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { MIND_CATALOGS } from "./catalogs.ts";
import { SHARED_NUMBERS, type AskCrossing, type Batch, type Carried, type Reply, type SpecNumber, type ToldCrossing } from "./wire.ts";

/**
 * **One minds' thread as the world reaches it**, whatever carries the batches (Node's worker
 * threads, `src/node/minds.ts`; the browser's workers, `src/worker/minds.ts`).
 */
export interface ThreadLink {
  /** Post `batch` to the thread, after every batch before it. */
  post(batch: Batch): void;
  /** Wait until the thread has answered the batch counted `seq` and every one before it. */
  wait(seq: number): void;
  /** The answers the thread has made since last asked, in order. */
  replies(): Iterable<Reply>;
  /** Let the thread go, once the batch that tells it to stop is posted. */
  stop(): void;
}

/** One minds' thread as the world holds it: its link, the asks not yet sent and whose they are, and the batches posted. */
interface Thread {
  readonly link: ThreadLink;
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
 * **Minds apart on `links`** (`MindPlace`, `src/core/mind/apart.ts`): each link a host of seats
 * (`mindThread`, `src/apart/thread.ts`), the seats dealt to them in turn as they are made; which
 * bodies share a thread changes nothing of a bout. The channels' numbers are memory the threads
 * share. An ask to observe waits to go with the others the world makes after physics, in one batch
 * a thread, as the world dispatches them; every other ask goes at once, so a thread thinks for one
 * body while the world writes the next. The world waits on a seat only for the batch that carries
 * its last ask. A spec goes to every thread the first time any ask names it, in a batch of its own
 * ahead of that ask, so a thread has every spec a fight has named before a mind of it senses a body
 * of it, and derives what it needs of it as it arrives.
 */
export function mindThreads(links: readonly ThreadLink[]): MindPlace {
  if (links.length === 0) throw new Error("minds run apart on one thread or more");
  const pool: Thread[] = links.map((link) => ({ link, queue: [], asking: [], posted: 0 }));
  const seats = new Map<number, Held>(), specs = new Map<BodySpec, SpecNumber>();
  let next = 0, warming = -1, disposed = false;
  const send = (thread: Thread, batch: Omit<Batch, "seq">) => {
    thread.posted += 1;
    thread.link.post({ ...batch, seq: thread.posted });
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
    thread.link.wait(held.sent);
    for (const reply of thread.link.replies()) {
      if (reply.error) throw new Error(`a mind apart failed: ${reply.error}`);
      for (const said of reply.said) {
        const one = seats.get(said.seat);
        if (!one) continue;
        if (said.outbound) one.channel.outbound = said.outbound;
        if (said.kit !== undefined) one.kit = said.kit;
        if (said.gait !== undefined) one.gait = said.gait;
        one.says = { has: said.has, observes: said.observes, report: said.report ? { ...said.report, kit: one.kit, gait: one.gait } : null,
          ...(said.menu !== undefined ? { menu: said.menu } : {}) };
      }
    }
  };
  // `spec`'s number, sent to every thread first where no ask has named it before.
  const numbered = (spec: BodySpec): SpecNumber => {
    let number = specs.get(spec);
    if (number === undefined) {
      specs.set(spec, number = specs.size);
      for (const thread of pool) send(thread, { asks: [], specs: [[number, spec]] });
    }
    return number;
  };
  // Asks queued for `thread`, each spec they name by its number.
  const queue = (thread: Thread, asks: readonly { readonly seat: number; readonly ask: SeatAsk; readonly told?: readonly MirrorChannel["told"][number][]; readonly inbound?: Float64Array; readonly outbound?: Float64Array }[]) => {
    const statics = (of: MirrorStatics) => ({ ...of, spec: numbered(of.spec) });
    for (const { seat, ask, told, inbound, outbound } of asks) {
      const crossing: AskCrossing = ask.kind === "make" ? { ...ask, recipe: { ...ask.recipe, statics: statics(ask.recipe.statics) } } : ask;
      const tells = told?.map((entry): ToldCrossing => entry.kind === "other" ? { ...entry, spec: numbered(entry.spec) } : entry);
      thread.queue.push({ seat, ask: crossing, ...(tells ? { told: tells } : {}),
        ...(inbound ? { inbound } : {}), ...(outbound ? { outbound } : {}) });
    }
  };
  const carry = (seat: number, held: Held, ask: SeatAsk) => {
    const { channel } = held, told = channel.told.length > held.told ? channel.told.slice(held.told) : undefined;
    held.told = channel.told.length;
    const inbound = channel.inbound !== held.inbound ? (held.inbound = channel.inbound) : undefined;
    queue(held.thread, [{ seat, ask, ...(told ? { told } : {}), ...(inbound ? { inbound } : {}) }]);
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
      queue(thread, [{ seat, ask: { kind: "make", recipe: { ...recipe, catalog: catalogName(MIND_CATALOGS, catalog) }, at }, told: channel.told.slice(), inbound: channel.inbound, outbound: channel.outbound }]);
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
    warm(catalog, recipe, channel, at) {
      if (disposed) throw new Error("the minds' threads were stopped");
      const made = { ...recipe, catalog: catalogName(MIND_CATALOGS, catalog) };
      for (const thread of pool) {
        // A seat of its own, below every fight's, made, stepped once and let go in one batch that nothing waits on.
        const seat = warming--;
        queue(thread, [{ seat, ask: { kind: "make", recipe: made, at }, told: channel.told.slice(), inbound: channel.inbound, outbound: channel.outbound },
          { seat, ask: { kind: "step", at } }, { seat, ask: { kind: "dispose" } }]);
        flush(thread);
      }
    },
    dispatch() { for (const thread of pool) flush(thread); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const thread of pool) {
        flush(thread);
        send(thread, { asks: [], stop: true });
        thread.link.stop();
      }
      seats.clear();
    },
  };
}
