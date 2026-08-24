/**
 * What the mouse buttons are currently asking the hand to do.
 *
 * Pure, free of Babylon and free of the DOM, so that the question "which
 * buttons are down and what does that mean" can be argued with in
 * `tests/buttons.test.mjs` rather than only by holding two buttons at once and
 * watching the arm. `src/input.ts` keeps nothing but the listeners.
 *
 * The rule this module exists to enforce is **edges for actions, levels for
 * poses**. A guard is not an event, it is a state of the hand, and a state
 * maintained by counting `pointerdown` against `pointerup` is permanently
 * wrong from the moment one of those edges goes missing -- which happens when
 * the browser takes the pointer and fires `pointercancel`, when a button is
 * released over another window, and when the tab is hidden mid-hold. It was a
 * lost release that produced the reported bug: hold right, add left, release
 * right, release left, and the arm stayed in the guard pose with nothing held.
 *
 * Every pointer event carries `buttons`, a live bitmask of what is held *now*,
 * so deriving the pose from that bitmask on every event -- `pointermove`
 * included -- makes a lost release self-correcting. The hand is wrong until the
 * player next moves the mouse, which is milliseconds, rather than until they
 * next press and release exactly the right button.
 *
 * Actions cannot be levels, because they must happen once per press: picking a
 * target is a click, not a state. That is what `spent` is
 * for. When a press has already been paid out as an action its bit goes into
 * the spent mask and is subtracted from the level for as long as the button is
 * held, so a click swallowed by target selection does not turn into a thrust
 * the instant the mouse moves.
 *
 * `nextDraw` at the bottom is the same rule one layer up, which is why it is
 * here rather than in `arrow.ts`. A bow's draw is a **level** -- how long the
 * button has been down -- and its loose is the **edge** where that level ends.
 * Keeping it in this file rather than beside the arrows buys two things: it is
 * pure, so it has a test that costs microseconds; and it is fed the level rather
 * than the button, so a *policy* holding `thrust` draws a bow exactly the way a
 * person holding the left button does, with nothing anywhere asking which of
 * them it was.
 */

/** The `PointerEvent.buttons` bits, under the names the DOM gives them. */
export const PRIMARY = 1;
export const SECONDARY = 2;
export const AUXILIARY = 4;

/**
 * The `buttons` bit belonging to a `button` index.
 *
 * The two are not the same numbering, and the middle button is where they cross
 * over: `button` counts 0, 1, 2 for left, middle, right, while the `buttons`
 * bits run 1, 2, 4 for left, right, middle. Everything else owns no bit at all,
 * including the -1 that a `pointermove` with no button change reports and the
 * -1 that made `pointercancel` clear nothing when it was aliased to the
 * `pointerup` handler.
 */
export function maskOfButton(button: number): number {
  switch (button) {
    case 0:
      return PRIMARY;
    case 1:
      return AUXILIARY;
    case 2:
      return SECONDARY;
    default:
      return 0;
  }
}

export interface ButtonPose {
  /** Left held: drive the point out. */
  thrust: boolean;
  /** Right held: pull the blade in close. */
  guard: boolean;
}

/** The pose the held buttons ask for, less whatever those presses already paid for. */
export function poseFromButtons(buttons: number, spent: number): ButtonPose {
  const live = buttons & ~spent;
  return {
    thrust: (live & PRIMARY) !== 0,
    guard: (live & SECONDARY) !== 0,
  };
}

/**
 * The spent mask to carry into the next event.
 *
 * `swallowed` is whatever this event has just paid out as an action. A spent
 * bit survives only while its button is still held, because letting go is what
 * re-arms the press. Deciding that against `buttons` rather than against a
 * remembered `pointerup` is the same self-correction as the pose itself: a
 * press whose release never arrived stops being owed the moment any event
 * reports the button as no longer down.
 */
export function nextSpent(spent: number, buttons: number, swallowed: number): number {
  return (spent | swallowed) & buttons;
}

/** What a bow does with the time the button is held. `CONFIG.arrow` satisfies it. */
export interface DrawTuning {
  /** Seconds from nothing to a full draw. */
  drawSeconds: number;
  /** Below this fraction, letting go abandons the shot instead of taking it. */
  minDraw: number;
  /** What a bow at exactly `minDraw` looses at, and what a full one does. */
  speedMin: number;
  speedMax: number;
}

export interface DrawStep {
  /** Where the string is now, 0 to 1. */
  draw: number;
  /** The speed to loose at, or **0** for "nothing left the string this step". */
  loose: number;
}

/**
 * One control step of a bow.
 *
 * Hold, and the draw grows. Let go, and either an arrow goes or it does not:
 * below `minDraw` the shot is abandoned, which is what letting go of a
 * quarter-drawn bow does and is the reason a draw is worth *holding* rather than
 * a button worth tapping. There is no partial credit below the bar and no free
 * shot above it -- the speed ramps from `speedMin` at the bar to `speedMax` at
 * full, so every fraction of the hold past it is paid for.
 *
 * Pure and total, which is the point of it being here. The state is one number,
 * the caller owns it, and both the person's button and a policy's `thrust` flag
 * arrive as the same boolean -- so `archer` charges a bow through exactly the
 * code a hand on a mouse does, and the arena has no way to tell them apart.
 *
 * Returning the *speed* rather than a boolean and a fraction is deliberate: the
 * caller has an arrow to launch and no business re-deriving how hard. It also
 * makes "did anything happen" a single test against zero, which is what `Arm`
 * asks.
 */
export function nextDraw(draw: number, held: boolean, dt: number, t: DrawTuning): DrawStep {
  if (held) {
    const grown = draw + dt / t.drawSeconds;
    return { draw: grown > 1 ? 1 : grown, loose: 0 };
  }
  if (draw < t.minDraw) return { draw: 0, loose: 0 };
  // `minDraw` is a *floor on the shot*, not a dead zone that is then ignored: a
  // bow released exactly at the bar looses at `speedMin`, and the ramp runs from
  // there. Guarded because a `minDraw` of 1 is a legal thing to type into the
  // console and an infinity is not a legal thing to hand a solver.
  const span = 1 - t.minDraw;
  const across = span > 1e-6 ? (draw - t.minDraw) / span : 1;
  return { draw: 0, loose: t.speedMin + across * (t.speedMax - t.speedMin) };
}
