import type { Body, BodyView, LayerOptions } from "../body.ts";
import type { Clock } from "../clock.ts";
import { commandLayers } from "../control/command-layers.ts";
import type { Mind, OwnBody } from "./mind.ts";
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
  /** Keep a wanted body through a phase that cannot safely yield to a higher-ranked sub-mind. */
  holds?(): boolean;
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
  release(reason?: "takeover" | "idle"): void;
  /** The body is its own again from this step: it goes on from the body as it is. */
  resume(): void;
}

/**
 * What makes a sub-mind for a body, from what the mind that hands its body over gives it: its own
 * body (`OwnBody`, whose completed physics it may observe), its host's view of it, read each step
 * before the sub-mind is asked anything, and the world's clock.
 */
export type SubMindMaker = (own: OwnBody, view: BodyView, clock: Clock) => SubMind;

/** A host with its sub-minds, as one mind. */
interface Hosted extends Mind {
  /** The name of the mind that has the body: the host's, a sub-mind's, or `"nobody"` while the body is idle. */
  readonly has: string;
  idle(): void;
}

/** Who has the body, by a sub-mind's place in its list or one of these: numeric settings, codes that are no place in a list. */
const HOST = -1, NOBODY = -2;

/**
 * `host` with `subs`, in rank order: each step the host looks, then the first sub-mind that wants
 * the body steps in the host's place, or the host acts. Its memory is who has the body (the
 * sub-mind's place in `subs`, `HOST`, or `NOBODY`), the host's, and each sub-mind's.
 *
 * Idled (`Mind.idle`), the body is handed to nobody as it is handed to a sub-mind: the one that had
 * it ends, or the host is released. Its first step back is the one a sub-mind's end makes: the
 * host is resumed, or the sub-mind that wants the body begins.
 *
 * A hand-over changes only state (`release`, `begin`, `end`, `resume`): a load in the middle of
 * one puts who has the body and each mind's memory back, and calls none of them.
 */
export function hosting(host: HostMind, subs: readonly SubMind[]): Hosted {
  const state = { has: HOST, host: host.state ?? null, subs: subs.map((sub) => sub.state ?? null) };
  /** Whoever has the body gives it up. */
  const giveUp = (reason: "takeover" | "idle"): void => {
    if (state.has >= 0) subs[state.has]!.end();
    else if (state.has === HOST) host.release(reason);
  };
  return {
    name: host.name, state,
    get has() { return state.has === NOBODY ? "nobody" : state.has === HOST ? host.name : subs[state.has]!.name; },
    step(senses, dt) {
      host.look(senses);
      const holder = state.has >= 0 && subs[state.has]!.holds && subs[state.has]!.wants(senses) && subs[state.has]!.holds!() ? state.has : -1;
      const want = holder >= 0 ? holder : subs.findIndex((sub) => sub.wants(senses));
      if (want !== state.has) {
        giveUp("takeover");
        if (want >= 0) subs[want]!.begin();
        else host.resume();
        state.has = want;
      }
      if (want < 0) host.act(dt);
      else subs[want]!.step(senses, dt);
    },
    idle() {
      giveUp("idle");
      state.has = NOBODY;
    },
    dispose() {
      host.dispose?.();
      for (const sub of subs) sub.dispose?.();
    },
  };
}

/** A mind whose body is under the command layers, with the body its drivers have (`Body`). */
export interface CommandedMind extends Mind {
  readonly body: Body;
}

/**
 * **A mind under the command layers that hands its body over** (`hosting`): the layers over `own`
 * on `clock` as `options` make them (`commandLayers`), then the sub-minds of `subs` made over their
 * view, in rank order, then the layers' first look, so that what is made over the view finds the
 * body as built. The layers observe the physics first, then the sub-minds, then whatever is made
 * on the body after.
 */
export function commandedMind(own: OwnBody, options: LayerOptions, clock: Clock, subs: readonly SubMindMaker[] = []): CommandedMind {
  const layers = commandLayers(own, options, clock);
  const made = subs.map((make) => make(own, layers.view, clock));
  layers.firstLook();
  return Object.assign(hosting(layers, made), { body: layers.body });
}
