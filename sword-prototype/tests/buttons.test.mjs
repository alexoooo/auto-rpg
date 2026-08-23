import test from "node:test";
import assert from "node:assert/strict";

import {
  AUXILIARY,
  PRIMARY,
  SECONDARY,
  maskOfButton,
  nextSpent,
  poseFromButtons,
} from "../src/buttons.ts";

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;

/**
 * A stand-in for the pointer listeners in `src/input.ts`, which hold no logic of
 * their own beyond this: clear the arriving button's spent bit on a press, pay
 * out the actions that press owes, then take the pose from `event.buttons`. It
 * carries its own idea of what the browser would report in `buttons` so that a
 * test can take that away again -- `loseUp` is a release the browser decided not
 * to deliver, which is the failure this whole module exists to survive.
 */
function hand({ picksTarget = () => false } = {}) {
  let spent = 0;
  let held = 0;
  let lockToggles = 0;
  const state = { thrust: false, guard: false };

  const apply = (swallowed = 0) => {
    spent = nextSpent(spent, held, swallowed);
    const pose = poseFromButtons(held, spent);
    state.thrust = pose.thrust;
    state.guard = pose.guard;
  };

  return {
    state,
    get lockToggles() {
      return lockToggles;
    },

    /** `pointerdown`. */
    down(button) {
      const arriving = maskOfButton(button);
      held |= arriving;
      spent &= ~arriving;

      const pressed = poseFromButtons(held & arriving, spent);
      let swallowed = 0;
      if (pressed.thrust && picksTarget()) swallowed |= PRIMARY;
      if (pressed.lockToggle) {
        lockToggles += 1;
        swallowed |= AUXILIARY;
      }
      apply(swallowed);
    },

    /** `pointerup`. */
    up(button) {
      held &= ~maskOfButton(button);
      apply();
    },

    /** The button is physically up, but no event says so. */
    loseUp(button) {
      held &= ~maskOfButton(button);
    },

    /** `pointermove`, which is the event that repairs a lost release. */
    move() {
      apply();
    },

    /** `pointercancel`: the pointer is gone and nothing more is coming. */
    cancel() {
      held = 0;
      spent = 0;
      state.thrust = false;
      state.guard = false;
    },
  };
}

const open = { thrust: false, guard: false };

/** Every way two-or-more press/release pairs can be shuffled without a release overtaking its press. */
function interleavings(...streams) {
  const live = streams.filter((stream) => stream.length > 0);
  if (live.length === 0) return [[]];
  return live.flatMap((stream) =>
    interleavings(...streams.map((other) => (other === stream ? other.slice(1) : other))).map(
      (rest) => [stream[0], ...rest],
    ),
  );
}

const press = (button) => [
  ["down", button],
  ["up", button],
];

test("the buttons bit for a button index, including the ones that own none", () => {
  assert.equal(maskOfButton(LEFT), PRIMARY);
  assert.equal(maskOfButton(RIGHT), SECONDARY);
  // The crossover: `button` counts middle second, `buttons` counts it last.
  assert.equal(maskOfButton(MIDDLE), AUXILIARY);
  // `pointercancel` and an idle `pointermove` both report -1, which is how
  // aliasing cancel to the pointerup handler came to clear nothing at all.
  assert.equal(maskOfButton(-1), 0);
  assert.equal(maskOfButton(4), 0);
});

test("the pose is exactly what the bitmask says, for all eight combinations", () => {
  for (let buttons = 0; buttons < 8; buttons += 1) {
    assert.deepEqual(poseFromButtons(buttons, 0), {
      thrust: (buttons & PRIMARY) !== 0,
      guard: (buttons & SECONDARY) !== 0,
      lockToggle: (buttons & AUXILIARY) !== 0,
    });
  }
});

test("the reported gesture ends with the hand open", () => {
  const h = hand();
  const table = [
    [() => h.down(RIGHT), { thrust: false, guard: true }],
    [() => h.down(LEFT), { thrust: true, guard: true }],
    [() => h.up(RIGHT), { thrust: true, guard: false }],
    [() => h.up(LEFT), open],
  ];
  for (const [step, expected] of table) {
    step();
    assert.deepEqual({ ...h.state }, expected);
  }
});

test("every ordering of press and release across left and right ends with the hand open", () => {
  const orders = interleavings(press(LEFT), press(RIGHT));
  assert.equal(orders.length, 6, "all six interleavings of two presses");

  for (const order of orders) {
    const h = hand();
    const down = new Set();
    for (const [edge, button] of order) {
      if (edge === "down") {
        h.down(button);
        down.add(button);
      } else {
        h.up(button);
        down.delete(button);
      }
      const trace = order.map(([e, b]) => `${e}${b}`).join(" ");
      assert.equal(h.state.thrust, down.has(LEFT), `thrust after ${edge}${button} of ${trace}`);
      assert.equal(h.state.guard, down.has(RIGHT), `guard after ${edge}${button} of ${trace}`);
    }
    assert.deepEqual({ ...h.state }, open);
  }
});

test("the middle button joins any ordering without disturbing the pose", () => {
  const orders = interleavings(press(LEFT), press(RIGHT), press(MIDDLE));
  assert.equal(orders.length, 90, "all ninety interleavings of three presses");

  for (const order of orders) {
    const h = hand();
    const down = new Set();
    for (const [edge, button] of order) {
      if (edge === "down") {
        h.down(button);
        down.add(button);
      } else {
        h.up(button);
        down.delete(button);
      }
      assert.equal(h.state.thrust, down.has(LEFT));
      assert.equal(h.state.guard, down.has(RIGHT));
    }
    assert.deepEqual({ ...h.state }, open);
    assert.equal(h.lockToggles, 1, "one press of middle is one toggle, whoever else is held");
  }
});

test("a release the browser never delivers is repaired by the next event", () => {
  const h = hand();
  h.down(RIGHT);
  h.down(LEFT);
  h.loseUp(RIGHT);
  assert.deepEqual({ ...h.state }, { thrust: true, guard: true }, "still stale, nothing has arrived");

  h.move();
  assert.deepEqual({ ...h.state }, { thrust: true, guard: false }, "a twitch of the mouse repairs it");

  h.up(LEFT);
  assert.deepEqual({ ...h.state }, open);
});

test("a release lost with nothing else held is repaired the same way", () => {
  const h = hand();
  h.down(RIGHT);
  h.loseUp(RIGHT);
  h.move();
  assert.deepEqual({ ...h.state }, open);
});

test("a press whose release was lost is a fresh press, not a continuing one", () => {
  const picked = [true, false];
  const h = hand({ picksTarget: () => picked.shift() ?? false });

  h.down(LEFT);
  assert.equal(h.state.thrust, false, "the click was spent choosing a target");
  h.loseUp(LEFT);
  // No `pointermove` to repair the level: the very next event is the next press.
  h.down(LEFT);
  assert.equal(h.state.thrust, true, "a down edge settles whatever the last press owed");
});

test("a pointercancel mid-chord opens the hand", () => {
  const h = hand();
  h.down(RIGHT);
  h.down(LEFT);
  h.cancel();
  assert.deepEqual({ ...h.state }, open);

  h.down(LEFT);
  assert.equal(h.state.thrust, true, "the pointer coming back is a working hand again");
});

test("a click spent on selecting a target does not become a thrust when the mouse moves", () => {
  let selecting = true;
  const h = hand({
    picksTarget: () => {
      const swallow = selecting;
      selecting = false;
      return swallow;
    },
  });

  h.down(LEFT);
  assert.equal(h.state.thrust, false);
  h.move();
  h.move();
  assert.equal(h.state.thrust, false, "a level derived from buttons alone would have raised it");

  // Chording a guard onto the spent click must not raise the thrust either.
  h.down(RIGHT);
  assert.deepEqual({ ...h.state }, { thrust: false, guard: true });
  h.up(RIGHT);

  h.up(LEFT);
  h.down(LEFT);
  assert.equal(h.state.thrust, true, "the next click is a thrust");
  h.move();
  assert.equal(h.state.thrust, true, "and stays one for the whole hold");
  h.up(LEFT);
  assert.deepEqual({ ...h.state }, open);
});

test("the middle button asks for a lock toggle once per press, not for as long as it is held", () => {
  const h = hand();
  h.down(MIDDLE);
  assert.equal(h.lockToggles, 1);
  assert.deepEqual({ ...h.state }, open, "the lock toggle is an action, and moves no part of the arm");

  h.move();
  h.down(LEFT);
  assert.equal(h.lockToggles, 1, "still one press, however many events it spans");

  h.up(LEFT);
  h.up(MIDDLE);
  h.down(MIDDLE);
  assert.equal(h.lockToggles, 2);
});

test("a spent bit lasts exactly as long as the button that owes it", () => {
  const held = nextSpent(0, PRIMARY, PRIMARY);
  assert.equal(held, PRIMARY);
  assert.equal(nextSpent(held, PRIMARY | SECONDARY, 0), PRIMARY, "kept while the button is down");
  assert.equal(nextSpent(held, SECONDARY, 0), 0, "forgotten as soon as buttons says it is up");
  assert.equal(poseFromButtons(PRIMARY, held).thrust, false);
});
