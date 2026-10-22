import { SIDES } from "../arena/duel.ts";
import { recordingKey } from "../core/recording.ts";
import { buildBout } from "./bout.ts";
import type { CaseWorld, Json, Reader, BuiltCase } from "./evaluation.ts";
import { buildFall } from "./fall.ts";
import { traceOf } from "./trace.ts";

/** What a case came to: its reading and the digest of every pose it passed through (`traceOf`). */
interface Played<R extends Json = Json> {
  readonly reading: R;
  readonly digest: string;
}

/**
 * A case's row: its reading and digest, or its fault. A case's own error is an `error`; a reading
 * that is not finite JSON is `invalid`. Both are results, recorded and reused.
 */
export interface Row<R extends Json = Json> {
  readonly key: string;
  readonly reading: R | null;
  readonly digest: string | null;
  readonly fault: { readonly kind: "error" | "invalid"; readonly message: string } | null;
}

/** How far past its `seconds` a case may run before it is an error, simulated s. */
const OVERRUN = 1;

/** Play `world` until `read`'s reader says it ended; an error once it runs `seconds` and `OVERRUN` more. */
export async function playCase<R extends Json>(world: CaseWorld, seconds: number, read: (built: BuiltCase) => Reader<R>): Promise<Played<R>> {
  switch (world.kind) {
    case "bout": {
      const built = await buildBout(world.recipe, { engine: world.engine });
      try {
        const { duel } = built, reader = read(built), trace = traceOf(SIDES.map((side) => duel.duelists[side].built));
        duel.play(world.tape);
        while (!reader.ended) {
          if (duel.clock > seconds + OVERRUN) throw new Error(`the case ran past ${seconds} s without ending`);
          built.world.step();
          trace.take();
          reader.afterStep();
        }
        return { reading: reader.reading(), digest: trace.digest() };
      } finally { built.dispose(); }
    }
    case "fall": {
      const built = await buildFall(world.fall, world.engine);
      try {
        const reader = read(built), trace = traceOf([built.body]);
        while (!reader.ended) {
          if (built.world.time > seconds + OVERRUN) throw new Error(`the case ran past ${seconds} s without ending`);
          built.world.step();
          trace.take();
          reader.afterStep();
        }
        return { reading: reader.reading(), digest: trace.digest() };
      } finally { built.dispose(); }
    }
    default: {
      const never: never = world;
      throw new Error(`no case world ${JSON.stringify(never)}`);
    }
  }
}

/** `playCase` as a row under `key`: what it threw is its fault. */
export async function playRow<R extends Json>(key: string, world: CaseWorld, seconds: number, read: (built: BuiltCase) => Reader<R>): Promise<Row<R>> {
  let played: Played<R>;
  try { played = await playCase(world, seconds, read); }
  catch (error) { return { key, reading: null, digest: null, fault: { kind: "error", message: String((error as Error)?.message ?? error) } }; }
  try { recordingKey(played.reading); }
  catch { return { key, reading: null, digest: played.digest, fault: { kind: "invalid", message: "the reading is not finite JSON" } }; }
  return { key, reading: played.reading, digest: played.digest, fault: null };
}
