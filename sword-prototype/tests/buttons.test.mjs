import test from "node:test";
import assert from "node:assert/strict";

import {
  AUXILIARY,
  PRIMARY,
  SECONDARY,
  applyButtonPose,
  maskOfButton,
  nextDraw,
  nextSpent,
  poseFromButtons,
  releaseButtons,
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
function hand({ picksTarget = () => false, acting = "primary" } = {}) {
  let spent = 0;
  let held = 0;
  // The three slots a press can land on, because that is what `Controls.state`
  // carries and what `applyButtonPose` writes. The stand-in used to keep one
  // `{ thrust, guard }` of its own and set the two fields inline, which was a
  // second copy of the mapping -- and it went on passing when the real one grew
  // a third slot and the host never wrote it.
  const channels = {
    natural: { thrust: false, guard: false },
    primary: { thrust: false, guard: false },
    secondary: { thrust: false, guard: false },
  };

  const apply = (swallowed = 0) => {
    spent = nextSpent(spent, held, swallowed);
    applyButtonPose(channels, acting, poseFromButtons(held, spent));
  };

  return {
    state: channels[acting],
    channels,
    /** `pointerdown`. */
    down(button) {
      const arriving = maskOfButton(button);
      held |= arriving;
      spent &= ~arriving;

      const pressed = poseFromButtons(held & arriving, spent);
      let swallowed = 0;
      if (pressed.thrust && picksTarget()) swallowed |= PRIMARY;
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
      releaseButtons(channels);
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
    });
  }
});

/**
 * One press, two effectors.
 *
 * A creature whose weapon is its head has no hand slot to be driven through, so
 * session 17 gave it `Intent.natural` -- and then wrote it from the policy side
 * only. `Controls.state.natural` was initialised once and never assigned again,
 * which is a command channel a person cannot press: the setup screen offers
 * "you" for either side whatever the unit, so somebody could take a centipede,
 * walk it around, and find the attack button dead.
 *
 * There is no second button to invent. A natural striker is aimed by turning
 * the body, so the left and right buttons mean the same two things to jaws that
 * they mean to a hand, and one mapping writes both. The body decides which of
 * them it reads; nothing here switches on the unit.
 */
test("one press reaches the acting hand and the natural striker together", () => {
  for (const acting of ["primary", "secondary"]) {
    const spare = acting === "primary" ? "secondary" : "primary";
    const h = hand({ acting });
    h.down(RIGHT);
    assert.deepEqual({ ...h.channels[acting] }, { thrust: false, guard: true });
    assert.deepEqual({ ...h.channels.natural }, { thrust: false, guard: true },
      "the guard is the same guard for jaws as for a hand");
    assert.deepEqual({ ...h.channels[spare] }, open, "the hand the cursor is not on is untouched");

    h.down(LEFT);
    assert.deepEqual({ ...h.channels.natural }, { thrust: true, guard: true });
    assert.deepEqual({ ...h.channels[spare] }, open);

    h.up(LEFT);
    h.up(RIGHT);
    assert.deepEqual({ ...h.channels.natural }, open, "letting go opens the jaws too");
  }
});

test("a cancelled gesture releases the jaws as well as both hands", () => {
  // `pointercancel` reports its button as -1, so nothing about it says which
  // effector was holding what. It has to drop the lot, and the natural channel
  // joined that list the moment it became a thing a person presses.
  const h = hand();
  h.down(LEFT);
  h.down(RIGHT);
  h.channels.secondary.guard = true;
  h.cancel();
  assert.deepEqual({ ...h.channels.natural }, open);
  assert.deepEqual({ ...h.channels.primary }, open);
  assert.deepEqual({ ...h.channels.secondary }, open);
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

test("the middle button never asks the hand reducer to toggle target lock", () => {
  const h = hand();
  h.down(MIDDLE);
  assert.deepEqual({ ...h.state }, open, "the camera gesture moves no part of the arm");

  h.move();
  h.down(LEFT);
  assert.deepEqual({ ...h.state }, { thrust: true, guard: false });

  h.up(LEFT);
  h.up(MIDDLE);
  h.down(MIDDLE);
  assert.deepEqual({ ...h.state }, open);
});

test("a spent bit lasts exactly as long as the button that owes it", () => {
  const held = nextSpent(0, PRIMARY, PRIMARY);
  assert.equal(held, PRIMARY);
  assert.equal(nextSpent(held, PRIMARY | SECONDARY, 0), PRIMARY, "kept while the button is down");
  assert.equal(nextSpent(held, SECONDARY, 0), 0, "forgotten as soon as buttons says it is up");
  assert.equal(poseFromButtons(PRIMARY, held).thrust, false);
});

/**
 * The bow's draw, which is the level-and-edge rule one layer up from the mouse.
 *
 * Pure, so these cost microseconds -- which is the whole argument for the rule
 * living in this file rather than beside the arrows.
 */
const BOW = { drawSeconds: 1.0, minDraw: 0.4, speedMin: 20, speedMax: 50 };

test("holding grows the draw and never looses on its own", () => {
  let draw = 0;
  for (let i = 0; i < 300; i += 1) {
    const step = nextDraw(draw, true, 1 / 60, BOW);
    assert.equal(step.loose, 0, "a held button never looses, however long it is held");
    draw = step.draw;
  }
  assert.equal(draw, 1, "and the draw stops at full rather than running past it");
});

test("letting go of a full draw looses at speedMax and empties the string", () => {
  const step = nextDraw(1, false, 1 / 60, BOW);
  assert.equal(step.loose, BOW.speedMax);
  assert.equal(step.draw, 0);
});

test("letting go below the bar abandons the shot rather than taking a weak one", () => {
  const step = nextDraw(BOW.minDraw - 0.001, false, 1 / 60, BOW);
  assert.equal(step.loose, 0, "nothing leaves the string");
  assert.equal(step.draw, 0, "and the draw is gone -- it is abandoned, not held");
});

test("the bar is a floor on the shot, not a dead zone that is then ignored", () => {
  // A bow released *exactly* at the bar looses, at speedMin. Getting this wrong
  // the obvious way -- ramping speed from a draw of 0 rather than from the bar
  // -- makes the weakest legal shot 40 % of speedMin instead of speedMin, and
  // nothing in the arena would say so.
  assert.equal(nextDraw(BOW.minDraw, false, 1 / 60, BOW).loose, BOW.speedMin);
  const half = nextDraw((1 + BOW.minDraw) / 2, false, 1 / 60, BOW).loose;
  assert.ok(
    Math.abs(half - (BOW.speedMin + BOW.speedMax) / 2) < 1e-9,
    `halfway up the ramp is halfway between the speeds; got ${half}`,
  );
});

test("a draw that is not held and not past the bar is simply nothing", () => {
  const step = nextDraw(0, false, 1 / 60, BOW);
  assert.equal(step.draw, 0);
  assert.equal(step.loose, 0);
});

test("a minDraw of 1 does not hand the solver an infinity", () => {
  // Legal to type at the console, so it has to have an answer.
  const step = nextDraw(1, false, 1 / 60, { ...BOW, minDraw: 1 });
  assert.equal(step.loose, BOW.speedMax);
  assert.ok(Number.isFinite(step.loose));
});
