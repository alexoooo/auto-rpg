import type { World } from "../core/world.ts";

/**
 * **The lab's player**: where the page is on a recording, and moving it. The recording is a
 * scenario's last seconds (`history.ts`); up to its live frame is what was recorded, and after it
 * is what the world has not done yet. The player is the only thing that steps the page's world,
 * and the world is never rewound, so the player has four places:
 *
 * - live: the world runs at its own pace and is shown;
 * - held: a recorded frame, paused;
 * - replaying: the recording plays on from a frame behind the live one, at the world's pace, and
 *   hands over to the world at the live frame (`carry` is the replay's unspent time, ms);
 * - seeking: the world runs ahead, by hand and as fast as the budget allows, the steps to a frame
 *   it has not reached (`steps` still to take), and holds there. A seek counts steps, not frames:
 *   a rolling recording's live frame stays at its end.
 */
export type Playhead =
  | { readonly kind: "live" }
  | { readonly kind: "held"; readonly frame: number }
  | { readonly kind: "replaying"; readonly frame: number; readonly carry: number }
  | { readonly kind: "seeking"; readonly steps: number };

/** Paused, or on the way to a pause: Play resumes. */
export const isPaused = (playhead: Playhead): boolean => playhead.kind === "held" || playhead.kind === "seeking";

/**
 * The most page time one frame plays, ms: neither the world nor a replay leaps for a page that
 * stalled, since a hidden tab can hand over seconds at once. Behind by more, the page runs slow and
 * the time is dropped. What a frame sounds of is bounded by it too (`sound-log.ts`).
 */
export const CATCH_UP_MS = 100;

/** What the player drives: the world, and its recording. */
interface Stage {
  readonly world: Pick<World, "dt" | "step" | "advance">;
  readonly recording: Recording;
}

/** A recording of the world: `history.ts`'s is. */
interface Recording {
  /** The frame the world is at now; every frame up to it is recorded. */
  live(): number;
  /** Put the body as it was at recorded `frame` on the nodes. */
  show(frame: number): unknown;
}

export interface Player {
  readonly playhead: Playhead;
  /** `isPaused` of the playhead. */
  isPaused(): boolean;
  /** The recorded frame shown instead of the world, if one is. */
  shownFrame(): number | null;
  /** Show `frame`, held: from the recording up to the live frame, by running the world past it. */
  seek(frame: number): void;
  /** Pause where the player is, or play on from the frame shown. */
  setPaused(on: boolean): void;
  /** Leave any recorded frame, and let the world run on from where it is. */
  goLive(): void;
  /**
   * Move on by `ms` of page time: live, the world by the steps it owes; replaying, the recording;
   * seeking, the world as many steps as fit before `until` (clock ms).
   */
  tick(ms: number, until: number): void;
}

/**
 * A player on `stage`, put live. `changed` hears every change of place, this first one too;
 * `clock` is the time a seek's budget is read against, ms.
 */
export function createPlayer({ world, recording }: Stage, changed: (playhead: Playhead) => void, clock: () => number): Player {
  let playhead: Playhead = { kind: "live" };
  const step = world.dt * 1000;

  const shownFrame = (): number | null =>
    playhead.kind === "held" || playhead.kind === "replaying" ? playhead.frame : null;

  /** Go to `next`. A recorded frame goes on the nodes while shown; the live one goes back before the world steps. */
  const go = (next: Playhead): void => {
    playhead = next;
    recording.show(shownFrame() ?? recording.live());
    changed(next);
  };

  go(playhead);
  return {
    get playhead() { return playhead; },
    isPaused: () => isPaused(playhead),
    shownFrame,
    seek(frame) {
      const live = recording.live();
      go(frame <= live ? { kind: "held", frame } : { kind: "seeking", steps: frame - live });
    },
    goLive: () => go({ kind: "live" }),
    setPaused(on) {
      const live = recording.live();
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
      if (playhead.kind === "live") world.advance(ms / 1000, Math.ceil(CATCH_UP_MS / step));
      else if (playhead.kind === "replaying") {
        const carry = Math.min(playhead.carry + ms, CATCH_UP_MS), whole = Math.floor(carry / step);
        const frame = playhead.frame + whole;
        if (frame >= recording.live()) go({ kind: "live" });
        else {
          playhead = { kind: "replaying", frame, carry: carry - whole * step };
          if (whole > 0) recording.show(frame);
        }
      } else if (playhead.kind === "seeking") {
        let { steps } = playhead;
        while (steps > 0 && clock() < until) { world.step(); steps -= 1; }
        if (steps === 0) go({ kind: "held", frame: recording.live() });
        else playhead = { kind: "seeking", steps };
      }
    },
  };
}
