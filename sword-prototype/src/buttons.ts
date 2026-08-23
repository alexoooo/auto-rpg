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
 * target and toggling the lock are clicks, not states. That is what `spent` is
 * for. When a press has already been paid out as an action its bit goes into
 * the spent mask and is subtracted from the level for as long as the button is
 * held, so a click swallowed by target selection does not turn into a thrust
 * the instant the mouse moves.
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
  /**
   * Middle held and not yet paid for. Unlike the other two this is meant to be
   * read on a press edge only, because a lock toggle is an action rather than a
   * state; carrying it in the pose anyway is what lets the spent mask keep one
   * press from toggling twice when a second button joins the chord.
   */
  lockToggle: boolean;
}

/** The pose the held buttons ask for, less whatever those presses already paid for. */
export function poseFromButtons(buttons: number, spent: number): ButtonPose {
  const live = buttons & ~spent;
  return {
    thrust: (live & PRIMARY) !== 0,
    guard: (live & SECONDARY) !== 0,
    lockToggle: (live & AUXILIARY) !== 0,
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
