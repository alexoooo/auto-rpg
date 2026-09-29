import type { Timeline } from "./timeline.ts";

/**
 * **The lab's player**: where the page is on the timeline, and moving it. The timeline is the
 * routine's current loop (`timeline.ts`); behind its live frame is the recording, ahead of it is
 * what the world has not done yet. The world is never rewound, so the player has four places:
 *
 * - live: the world runs at its own pace and is shown;
 * - held: a recorded frame, paused;
 * - replaying: the recording plays on from a frame behind the live one, at the world's pace, and
 *   hands over to the world at the live frame (`carry` is the replay's unspent time, ms);
 * - seeking: the world runs ahead, by hand and as fast as the budget allows, to a frame it has
 *   not reached, and holds there.
 */
export type Playhead =
  | { readonly kind: "live" }
  | { readonly kind: "held"; readonly frame: number }
  | { readonly kind: "replaying"; readonly frame: number; readonly carry: number }
  | { readonly kind: "seeking"; readonly frame: number };

/** Paused, or on the way to a pause: Play resumes. */
export const isPaused = (playhead: Playhead): boolean => playhead.kind === "held" || playhead.kind === "seeking";

/** What the player drives. */
export interface World {
  readonly timeline: Pick<Timeline, "seconds" | "live" | "show">;
  /** Let the world step by itself at its pace, or hold it. */
  run(running: boolean): void;
  /** Hand the held world one physics step's time; it takes the steps then due. */
  advance(): void;
}

export interface Player {
  readonly playhead: Playhead;
  /** `isPaused` of the playhead. */
  isPaused(): boolean;
  /** The recorded frame shown instead of the world, if one is. */
  shownFrame(): number | null;
  /** Show `frame` of the loop, held: from the recording up to the live frame, by running the world past it. */
  seek(frame: number): void;
  /** Pause where the player is, or play on from the frame shown. */
  setPaused(on: boolean): void;
  /** Move on by `ms` of page time: a replay through the recording, a seek by running the world until `until` (clock ms). */
  tick(ms: number, until: number): void;
}

/**
 * A player on `world`, put live: the world runs. `changed` hears every change of place, this first
 * one too; `clock` is the time a seek's budget is read against, ms.
 */
export function createPlayer(world: World, changed: (playhead: Playhead) => void, clock: () => number): Player {
  const { timeline } = world;
  let playhead: Playhead = { kind: "live" };
  // A replay does not leap for a page that stalled: a hidden tab can hand over seconds at once.
  const REPLAY_CATCH_UP_MS = 100;

  const shownFrame = (): number | null =>
    playhead.kind === "held" || playhead.kind === "replaying" ? playhead.frame : null;

  /** Go to `next`. A recorded frame goes on the nodes while shown; the live one goes back before the world steps. */
  const go = (next: Playhead): void => {
    playhead = next;
    world.run(next.kind === "live");
    timeline.show(shownFrame() ?? timeline.live());
    changed(next);
  };

  go(playhead);
  return {
    get playhead() { return playhead; },
    isPaused: () => isPaused(playhead),
    shownFrame,
    seek(frame) {
      go(frame <= timeline.live() ? { kind: "held", frame } : { kind: "seeking", frame });
    },
    setPaused(on) {
      const live = timeline.live();
      switch (playhead.kind) {
        case "live": if (on) go({ kind: "held", frame: live }); break;
        case "replaying": if (on) go({ kind: "held", frame: playhead.frame }); break;
        // Paused, a seek holds where the world has got to; played, the world runs on from there.
        case "seeking": go(on ? { kind: "held", frame: live } : { kind: "live" }); break;
        case "held":
          if (!on) go(playhead.frame >= live ? { kind: "live" } : { kind: "replaying", frame: playhead.frame, carry: 0 });
          break;
        default: { const never: never = playhead; throw new Error(`unknown playhead ${JSON.stringify(never)}`); }
      }
    },
    tick(ms, until) {
      if (playhead.kind === "replaying") {
        const step = timeline.seconds * 1000;
        const carry = Math.min(playhead.carry + ms, REPLAY_CATCH_UP_MS), whole = Math.floor(carry / step);
        const frame = playhead.frame + whole;
        if (frame >= timeline.live()) go({ kind: "live" });
        else {
          playhead = { kind: "replaying", frame, carry: carry - whole * step };
          if (whole > 0) timeline.show(frame);
        }
      } else if (playhead.kind === "seeking") {
        const target = playhead.frame;
        let last = timeline.live();
        while (last < target && clock() < until) {
          world.advance();
          // Every frame of a loop comes before the next loop starts; if one did start, hold there.
          if (timeline.live() < last) break;
          last = timeline.live();
        }
        if (timeline.live() >= target || timeline.live() < last) go({ kind: "held", frame: timeline.live() });
      }
    },
  };
}
