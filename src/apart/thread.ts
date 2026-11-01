import { deriveSpec, seatHost, type ReportNow, type SeatAsk } from "../core/mind/apart.ts";
import type { MirrorChannel } from "../core/mind/mirror.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { MIND_CATALOGS } from "./catalogs.ts";
import type { AskCrossing, Batch, Reply, Said, SpecNumber, ToldCrossing } from "./wire.ts";

/**
 * **A minds' thread, whatever carries its batches** (`mindThreads`, `src/apart/host.ts`): a host of
 * seats (`seatHost`) that carries out each batch's asks in order on the channels' shared numbers
 * and answers with what each seat it was asked of says. A spec sent is derived as it arrives
 * (`deriveSpec`). Numbers it makes anew are made by `allocate`, in memory the world shares.
 * Every mind's data is loaded before its first batch (`loadData`, its transport's to await).
 */
export function mindThread(allocate: (length: number) => Float64Array): { handle(batch: Batch): Reply } {
  const host = seatHost(MIND_CATALOGS), channels = new Map<number, MirrorChannel>();
  // The specs the world has sent, by their numbers.
  const specs = new Map<SpecNumber, BodySpec>();
  const specOf = (number: SpecNumber): BodySpec => {
    const spec = specs.get(number);
    if (!spec) throw new Error(`no spec ${number} was sent`);
    return spec;
  };
  const asked = (ask: AskCrossing): SeatAsk => ask.kind === "make" ? { ...ask, recipe: { ...ask.recipe, statics: { ...ask.recipe.statics, spec: specOf(ask.recipe.statics.spec) } } } : ask;
  const told = (entry: ToldCrossing): MirrorChannel["told"][number] => entry.kind === "other" ? { ...entry, spec: specOf(entry.spec) } : entry;
  // What each seat's thread last sent of its kit and its gait, which cross only when they change.
  const sent = new Map<number, { kit: ReportNow["kit"]; gait: ReportNow["gait"]; outbound: Float64Array }>();
  return {
    handle(batch) {
      // What each seat says crosses by copy: a value that cannot be copied fails the batch, said as its error.
      try {
        for (const [number, spec] of batch.specs ?? []) { specs.set(number, spec); deriveSpec(spec); }
        const touched = new Set<number>();
        for (const { seat, ask: crossing, told: tells, inbound, outbound } of batch.asks) {
          const ask = asked(crossing);
          let channel = channels.get(seat);
          if (!channel) {
            if (ask.kind !== "make" || !inbound || !outbound) throw new Error(`seat ${seat} is asked before it is made`);
            channel = { inbound, outbound, told: [], heard: 0, allocate };
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
        return { seq: batch.seq, said };
      } catch (error) {
        return { seq: batch.seq, said: [], error: String((error as Error)?.stack ?? error) };
      }
    },
  };
}
