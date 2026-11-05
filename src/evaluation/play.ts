import { isRefused, type Refused } from "../core/refusal.ts";
import { recordingKey } from "../core/world/recording.ts";
import type { CaseWorld, Json, Reader, BuiltCase, WorldKind } from "./evaluation.ts";
import { traceOf } from "./trace.ts";
import { createWorlds } from "./world-builders.ts";
import { type GameContext } from "../game/arena/context.ts";

/** What a case came to: its reading, the digest of every pose it passed through (`traceOf`), and how long it played, simulated s. */
interface Played<R extends Json = Json> {
  readonly reading: R;
  readonly digest: string;
  readonly played: number;
}

/**
 * A case's row: its reading and digest, or its fault. A case's own error is an `error`; a reading
 * that is not finite JSON is `invalid`. Both are results, recorded and reused.
 */
export interface Row<R extends Json = Json> {
  readonly key: string;
  readonly reading: R | null;
  readonly digest: string | null;
  /** How long the case played until its reader ended, simulated s (its world kind's clock): where a watcher stops it. Null for an error, and on a record line without it. */
  readonly played: number | null;
  readonly fault: { readonly kind: "error" | "invalid" | "refused"; readonly message: string } | null;
}

/** How far past its `seconds` a case may run before it is an error, simulated s. */
const OVERRUN = 1;

export function createPlay(context: GameContext) {
  const { WORLD_BUILDERS } = createWorlds(context);

  /** Play `world` until `read`'s reader says it ended; an error once it runs `seconds` and `OVERRUN` more. Every kind of world is stepped and traced the same way (`WorldKind`). */
  async function playCase<R extends Json>(world: CaseWorld, seconds: number, read: (built: BuiltCase) => Reader<R>): Promise<Played<R> | Refused> {
    const kind = WORLD_BUILDERS[world.kind] as unknown as WorldKind;
    const built = await kind.build(world);
    if (isRefused(built)) return built;
    try {
      const reader = read(built), trace = traceOf(kind.traced(built));
      kind.start?.(built, world);
      while (!reader.ended) {
        if (kind.clock(built) > seconds + OVERRUN) throw new Error(`the case ran past ${seconds} s without ending`);
        built.world.step();
        trace.take();
        reader.afterStep();
      }
      return { reading: reader.reading(), digest: trace.digest(), played: kind.clock(built) };
    } finally { built.dispose(); }
  }

  /** `playCase` as a row under `key`: what it threw is its fault. */
  async function playRow<R extends Json>(key: string, world: CaseWorld, seconds: number, read: (built: BuiltCase) => Reader<R>): Promise<Row<R>> {
    let played: Played<R> | Refused;
    try { played = await playCase(world, seconds, read); }
    catch (error) { return { key, reading: null, digest: null, played: null, fault: { kind: "error", message: String((error as Error)?.message ?? error) } }; }
    if (isRefused(played)) return { key, reading: null, digest: null, played: null, fault: { kind: "refused", message: played.refused } };
    try { recordingKey(played.reading); }
    catch { return { key, reading: null, digest: played.digest, played: played.played, fault: { kind: "invalid", message: "the reading is not finite JSON" } }; }
    return { key, reading: played.reading, digest: played.digest, played: played.played, fault: null };
  }

  return { playCase, playRow };
}
