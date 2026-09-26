/**
 * What the mouse buttons are currently asking a hand on the module bench to do.
 *
 * **The bench's puppet, and nothing else's.** This was `src/buttons.ts`, the arena's mouse
 * adapter, until the arena went over to orders in skill ceiling session 06: a person there picks
 * whom to fight and where to go, and the mind drives the body. The module bench (`/bench.html`) is
 * the one place a person still drives a module by hand, so the adapter moved here beside
 * `PuppetControls`. The resting reach every command carries went to `HAND_REACH` in `src/hands.ts`.
 *
 * Pure, free of Babylon and free of the DOM, so that the question "which buttons are down and what
 * does that mean" can be argued with in `tests/buttons.test.mjs` rather than only by holding two
 * buttons at once and watching the arm.
 *
 * The rule this module exists to enforce is **edges for actions, levels for poses**. A guard is not
 * an event, it is a state of the hand, and a state maintained by counting `pointerdown` against
 * `pointerup` is permanently wrong from the moment one of those edges goes missing -- which happens
 * when the browser takes the pointer and fires `pointercancel`, when a button is released over
 * another window, and when the tab is hidden mid-hold. It was a lost release that produced the
 * reported bug: hold right, add left, release right, release left, and the arm stayed in the guard
 * pose with nothing held.
 *
 * Every pointer event carries `buttons`, a live bitmask of what is held *now*, so deriving the pose
 * from that bitmask on every event -- `pointermove` included -- makes a lost release
 * self-correcting. The hand is wrong until the player next moves the mouse, which is milliseconds,
 * rather than until they next press and release exactly the right button.
 *
 * Actions cannot be levels, because they must happen once per press. That is what `spent` is for.
 * When a press has already been paid out as an action its bit goes into the spent mask and is
 * subtracted from the level for as long as the button is held, so a swallowed click does not turn
 * into a thrust the instant the mouse moves.
 */
import { HAND_REACH } from "../hands.ts";

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

/**
 * The two effectors one press writes into.
 *
 * Structural, and deliberately not `Intent`: this file imports nothing but the leaf
 * `hands.ts`, which is what lets a Node test load it, and `ButtonPose` is already the shape both
 * slots need.
 */
export interface ButtonChannels {
  natural: ButtonPose;
  primary: HandButtonChannel;
  secondary: HandButtonChannel;
}

/**
 * A hand slot: the two buttons, and the reach they are asked to stand for.
 *
 * A hand has a reach axis and a set of jaws does not, which is the whole of why
 * this type exists and `natural` keeps the bare `ButtonPose`. `HandIntent`
 * satisfies it structurally, so the puppet's `Intent` is handed to
 * `applyButtonPose` without a translation.
 */
export interface HandButtonChannel extends ButtonPose {
  reach: number;
}

/**
 * The reach a held button asks for.
 *
 * `guard` beats `thrust`, which is the precedence the chain used to apply and
 * is what makes "hold guard and press thrust" a cut from a chambered hand
 * rather than an extension. It survives the move because it is a statement
 * about what the two buttons mean together, and that has always belonged to
 * whoever is pressing them.
 */
export const reachFromButtons = (pose: ButtonPose): number =>
  pose.guard ? HAND_REACH.guard : pose.thrust ? HAND_REACH.thrust : HAND_REACH.neutral;

/**
 * Put one press on the acting hand **and** on the natural striker.
 *
 * One vocabulary, two effectors: a natural striker is aimed by turning the body, so the same left
 * and right buttons mean the same two things to a head that they mean to a hand. Writing both
 * unconditionally rather than choosing by body is the point. A hand slot on a body with no hands
 * is inert, and `natural` is inert on a body that publishes no natural attack, so neither write
 * needs to know what it is driving.
 *
 * Here rather than in `puppet-controls.ts` because that file has the DOM in its graph, and a
 * mapping written there is a mapping no Node test can reach.
 */
export function applyButtonPose(into: ButtonChannels, hand: "primary" | "secondary", pose: ButtonPose): void {
  into[hand].thrust = pose.thrust;
  into[hand].guard = pose.guard;
  // The reach the press stands for, written on the hand only: a natural striker
  // has no reach axis, and inventing one for it would be the `zoom` mistake in
  // miniature -- a channel with a writer, no reader and every appearance of
  // being load-bearing.
  into[hand].reach = reachFromButtons(pose);
  into.natural.thrust = pose.thrust;
  into.natural.guard = pose.guard;
}

/**
 * Let go of everything, on every effector.
 *
 * Both hands and the jaws, not just the driven one, for the reason the whole
 * file is about: a lost release leaves a level standing that nobody is holding,
 * and which hand the cursor is on can change while the window is out of focus.
 * The natural channel joined that list the moment it became a thing a person
 * presses.
 */
export function releaseButtons(into: ButtonChannels): void {
  for (const slot of [into.primary, into.secondary, into.natural]) {
    slot.thrust = false;
    slot.guard = false;
  }
  // And the pose those buttons stood for. A hand left at `HAND_REACH.thrust`
  // with nothing held is the same class of bug as an arm left in the guard pose
  // after a lost release -- which is the reported bug this whole file exists to
  // make impossible -- only now it is a position rather than a level, so it
  // would persist until the next press instead of until the next mouse move.
  for (const slot of [into.primary, into.secondary]) slot.reach = HAND_REACH.neutral;
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
