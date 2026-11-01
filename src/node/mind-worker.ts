import { receiveMessageOnPort, workerData, type MessagePort } from "node:worker_threads";
import { deriveSpec, seatHost, type ReportNow, type SeatAsk } from "../core/mind/apart.ts";
import type { BodySpec } from "../core/spec/body.ts";
import type { MirrorChannel } from "../core/mind/mirror.ts";
import { MIND_CATALOGS } from "./catalogs.ts";
import { DATA_KEYS, loadData } from "../core/data/store.ts";
import { DONE, POSTED, SHARED_NUMBERS, waitPast, type AskCrossing, type Batch, type Reply, type Said, type SpecNumber, type ToldCrossing } from "./wire.ts";

/**
 * **A minds' thread** (`mindWorkers`, `src/node/minds.ts`): a host of seats (`seatHost`) that waits
 * for each batch of asks the world posts, carries them out in order on the channels' shared numbers,
 * and answers with what each seat it was asked of says, until it is told to stop. Every mind's data
 * is loaded before the first batch is read (`loadData`); a spec sent is derived as it arrives
 * (`deriveSpec`).
 */
const { port, control: counters } = workerData as { readonly port: MessagePort; readonly control: Int32Array };
const control = counters, host = seatHost(MIND_CATALOGS);
const channels = new Map<number, MirrorChannel>();
// The specs the world has sent, by their numbers.
const specs = new Map<SpecNumber, BodySpec>();
const specOf = (number: SpecNumber): BodySpec => {
  const spec = specs.get(number);
  if (!spec) throw new Error(`no spec ${number} was sent`);
  return spec;
};
const asked = (ask: AskCrossing): SeatAsk => ask.kind === "make" ? { ...ask, recipe: { ...ask.recipe, statics: { ...ask.recipe.statics, spec: specOf(ask.recipe.statics.spec) } } } : ask;
const told = (entry: ToldCrossing): MirrorChannel["told"][number] => entry.kind === "other" ? { ...entry, spec: specOf(entry.spec) } : entry;
await loadData(DATA_KEYS);
// What each seat's thread last sent of its kit and its gait, which cross only when they change.
const sent = new Map<number, { kit: ReportNow["kit"]; gait: ReportNow["gait"]; outbound: Float64Array }>();

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
  let reply: Reply;
  // What each seat says crosses by copy: a value that cannot be copied fails the batch, said as its error.
  try {
    const touched = new Set<number>();
    for (const [number, spec] of batch.specs ?? []) { specs.set(number, spec); deriveSpec(spec); }
    for (const { seat, ask: crossing, told: tells, inbound, outbound } of batch.asks) {
      const ask = asked(crossing);
      let channel = channels.get(seat);
      if (!channel) {
        if (ask.kind !== "make" || !inbound || !outbound) throw new Error(`seat ${seat} is asked before it is made`);
        channel = { inbound, outbound, told: [], heard: 0, allocate: SHARED_NUMBERS };
        channels.set(seat, channel);
        sent.set(seat, { kit: null, gait: null, outbound });
      }
      if (tells) for (const entry of tells) channel.told.push(told(entry));
      if (inbound) channel.inbound = inbound;
      host.handle(seat, ask, channel);
      if (ask.kind === "dispose") { channels.delete(seat); sent.delete(seat); touched.delete(seat); }
      else touched.add(seat);
    }
    const said: Said[] = [];
    for (const seat of touched) {
      const says = host.says(seat), last = sent.get(seat)!, channel = channels.get(seat)!;
      const report = says.report;
      let kit: Said["kit"], gait: Said["gait"];
      if (report && report.kit !== last.kit) kit = last.kit = report.kit;
      if (report && report.gait !== last.gait) gait = last.gait = report.gait;
      const outbound = channel.outbound !== last.outbound ? (last.outbound = channel.outbound) : undefined;
      said.push({ seat, has: says.has, observes: says.observes,
        report: report ? { engagement: report.engagement, prospects: report.prospects, heading: report.heading, navigation: report.navigation, actions: report.actions, ended: report.ended } : null,
        ...(kit !== undefined ? { kit } : {}), ...(gait !== undefined ? { gait } : {}), ...(says.menu !== undefined ? { menu: says.menu } : {}), ...(outbound ? { outbound } : {}) });
    }
    reply = { seq, said };
    port.postMessage(reply);
  } catch (error) {
    reply = { seq, said: [], error: String((error as Error)?.stack ?? error) };
    port.postMessage(reply);
  }
  Atomics.store(control, DONE, seq);
  Atomics.notify(control, DONE);
}
port.close();
