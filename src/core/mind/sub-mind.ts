import type { Mind } from "./mind.ts";
import type { Senses } from "./senses.ts";

/**
 * **A sub-mind**: a mind that takes a body over from its host while it wants it. It is made with
 * the body (`OwnBody`) as any mind is, and drives it as any mind does (`Mind.step`).
 */
export interface SubMind extends Mind {
  /** Whether it wants the body this step: asked every step, before any mind steps. */
  wants(senses: Senses): boolean;
  /** The body is its own from this step: it starts from the body as it is. */
  begin(): void;
  /** The body is its own no longer: the host has it back, or a sub-mind of higher rank took it. */
  end(): void;
}

/**
 * **A mind that hands its body over** (`hosting`). Its step is in two halves, so that what it
 * reads of its body is of this step whoever drives, and a sub-mind may read it too.
 */
export interface HostMind extends Mind {
  /** Read the body on `senses`, and command nothing. */
  look(senses: Senses): void;
  /** Command the body on what `look` read: the rest of its step. */
  act(dt: number): void;
  /** The body is a sub-mind's from this step: what it was in the middle of is over, and what it shows of its own commands says so. */
  release(): void;
  /** The body is its own again from this step: it goes on from the body as it is. */
  resume(): void;
}

/** A host with its sub-minds, as one mind. */
interface Hosted extends Mind {
  /** The name of the mind that has the body: the host's, or a sub-mind's. */
  readonly has: string;
}

/**
 * `host` with `subs`, in rank order: each step the host looks, then the first sub-mind that wants
 * the body steps in the host's place, or the host acts. Its memory is who has the body (the
 * sub-mind's place in `subs`, or -1), the host's, and each sub-mind's.
 *
 * A hand-over changes only state (`release`, `begin`, `end`, `resume`): a load in the middle of
 * one puts who has the body and each mind's memory back, and calls none of them.
 */
export function hosting(host: HostMind, subs: readonly SubMind[]): Hosted {
  const state = { has: -1, host: host.state ?? null, subs: subs.map((sub) => sub.state ?? null) };
  return {
    name: host.name, state,
    get has() { return state.has < 0 ? host.name : subs[state.has]!.name; },
    step(senses, dt) {
      host.look(senses);
      const want = subs.findIndex((sub) => sub.wants(senses));
      if (want !== state.has) {
        if (state.has >= 0) subs[state.has]!.end();
        else host.release();
        if (want >= 0) subs[want]!.begin();
        else host.resume();
        state.has = want;
      }
      if (want < 0) host.act(dt);
      else subs[want]!.step(senses, dt);
    },
  };
}
