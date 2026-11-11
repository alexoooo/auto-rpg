import { recordingKey } from "../../core/world/recording.ts";
import { seatHost, type ReportNow, type SeatAsk } from "../../minds/seat/apart.ts";
import type { MirrorChannel } from "../../minds/seat/mirror-channel.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { MIND_CATALOGS } from "./catalogs.ts";
import type { AskCrossing, Batch, Reply, Said, SpecNumber, ToldCrossing } from "./wire.ts";
import { deriveSensed } from "../../skills/perception/openings.ts";
import { specDigest } from "../../skills/framework/profile.ts";

/**
 * **A minds' thread, whatever carries its batches** (`mindThreads`, `src/app/apart/host.ts`): a host of
 * seats (`seatHost`) that carries out each batch's asks in order on the channels' shared numbers.
 * Each step ask it carries out as far as its answer (`SeatHost.handle`), says what its seat says
 * then, its numbers made anew with it (`say`), and counts it to `answered`; each step's decision
 * waits until the world says the step's asks are all in (`Batch.decide`) or the seat is asked
 * again, so the thread moves every body asked before any mind decides, and the world carries out
 * the commands and reads what the minds said while they decide. It answers the batch (`steps`) with what each seat
 * it was asked to make says, and each menu it was asked for. A spec sent is derived as it arrives
 * (`deriveSpec`). Numbers it makes anew are made by `allocate`, in memory the world shares.
 * Each batch's new minds have their declared data loaded before construction (the transport's to await).
 */
export function mindThread(allocate: (length: number) => Float64Array, { say, answered }: { say(reply: Reply): void; answered(steps: number): void }): { handle(batch: Batch): Reply; readonly steps: number } {
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
  // What each seat's thread last sent of its kit and its gaits, which cross only when they change.
  const sent = new Map<number, { kit: ReportNow["kit"]; gaits: string; outbound: Float64Array }>();
  // The step asks carried out, ever: every one of a batch once it is answered, failed or not.
  let steps = 0;
  // The seats whose step is answered and whose decision waits, in the order asked.
  const deciding: number[] = [];
  const decide = (seat: number) => { deciding.splice(deciding.indexOf(seat), 1); host.decide(seat); };
  // What `seat` says as it stands, its kit and gaits where they changed since it last said them, its engagement where `shown`, and its numbers where made anew.
  const saying = (seat: number, shown: boolean): Said => {
    const says = host.says(seat), last = sent.get(seat)!, channel = channels.get(seat)!, report = says.report;
    let kit: ReportNow["kit"] | undefined, gaits: ReportNow["gaits"] | undefined;
    if (report && report.kit !== last.kit) kit = last.kit = report.kit;
    if (report) {
      const value = report.gaits, key = recordingKey(value);
      if (key !== last.gaits) { last.gaits = key; gaits = JSON.parse(JSON.stringify(value)) as ReportNow["gaits"]; }
    }
    const outbound = channel.outbound !== last.outbound ? (last.outbound = channel.outbound) : undefined;
    return { seat, has: says.has,
      report: report ? { ...(shown ? { engagement: report.engagement } : {}), prospects: report.prospects, heading: report.heading, navigation: report.navigation, actions: report.actions, ended: report.ended } : null,
      ...(kit !== undefined ? { kit } : {}), ...(gaits !== undefined ? { gaits } : {}), ...(outbound ? { outbound } : {}) };
  };
  return {
    get steps() { return steps; },
    handle(batch) {
      let end = steps;
      for (const { ask } of batch.asks) if (ask.kind === "step") end += 1;
      // What each seat says crosses by copy: a value that cannot be copied fails the batch, said as its error.
      try {
        const said: Said[] = [];
        for (const [number, spec] of batch.specs ?? []) { specs.set(number, spec); deriveSpec(spec); }
        for (const { seat, ask: crossing, told: tells, inbound, outbound } of batch.asks) {
          const ask = asked(crossing);
          let channel = channels.get(seat);
          if (!channel) {
            if (ask.kind !== "make" || !inbound || !outbound) throw new Error(`seat ${seat} is asked before it is made`);
            channel = { inbound, outbound, told: [], heard: 0, allocate };
            channels.set(seat, channel);
            sent.set(seat, { kit: null, gaits: recordingKey(null), outbound });
          }
          if (deciding.includes(seat)) decide(seat);
          if (tells) for (const entry of tells) channel.told.push(told(entry));
          if (inbound) channel.inbound = inbound;
          host.handle(seat, ask, channel);
          switch (ask.kind) {
            case "make": said.push(saying(seat, true)); break;
            case "step":
              steps += 1;
              say({ seq: batch.seq, said: [saying(seat, ask.shown === true)] });
              answered(steps);
              deciding.push(seat);
              break;
            case "menu": said.push({ seat, menu: host.menu(seat) }); break;
            case "dispose": channels.delete(seat); sent.delete(seat); break;
            case "idle": break;
            default: { const never: never = ask; throw new Error(`no ask ${JSON.stringify(never)}`); }
          }
        }
        if (batch.decide) while (deciding.length > 0) decide(deciding[0]!);
        return { seq: batch.seq, said };
      } catch (error) {
        return { seq: batch.seq, said: [], error: String((error as Error)?.stack ?? error) };
      } finally {
        steps = end;
      }
    },
  };
}

/**
 * **Derive what a mind derives of a body's spec alone**, where a spec arrives in a thread: its
 * shapes as sensing reads them (`deriveSensed`) and its digest, which names the profiles measured on
 * it (`specDigest`). Each is cached by the spec's own objects, so no step of a mind that first
 * senses a body of it pays for it.
 */
export function deriveSpec(spec: BodySpec): void {
  deriveSensed(spec);
  specDigest(spec);
}
