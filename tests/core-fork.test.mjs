/**
 * **A fork is a load**: a stand loaded with a save (`saveStand`: the physics' bytes and the
 * modules' states, `src/core/state.ts`) goes on as the stand it was saved from went on, whatever
 * step its controllers were at when it was loaded. Node stand, Rapier, 120 Hz.
 *
 * Each field of the state is sorted: one a fork is shown to need (`NEEDED`, under the fixture
 * that shows it: loaded without it, some fork differs), or one that is not memory (`NOT_MEMORY`,
 * with why).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { turnAt } from "../src/core/control/stance-envelope.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { STANCE_LOWER } from "../src/core/skills/locomotion.ts";
import { deepFreeze } from "../src/core/state.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { fieldsOf, forgetting, forks, PHYSICS_ALONE, STATE_ALONE, unsorted } from "./harness/fork.mjs";

const fighter = armed(humanSpec("workshop-fighter"), "right", woodenClub());

/**
 * What a body's readers show: its view, its muscles' readings and its assist's. Its senses aside:
 * on a stand they are the clock's, an object the step writes as it reads it, so between a load
 * and a step they tell the time of whatever step that stand took last.
 */
const readers = ({ view, muscles, assist }) => () => ({
  view: { ...view, senses: null },
  muscles: {
    activation: muscles.activation, velocity: muscles.velocity, ceiling: muscles.ceiling,
    joints: muscles.channels.map((_, i) => [muscles.angle(i), muscles.rate(i), muscles.speed(i), muscles.turning(i, 0), muscles.turning(i, 1), muscles.turning(i, 2)]),
  },
  assist: { on: assist.on, withdrawn: assist.withdrawn, given: assist.given, meter: assist.meter },
});

const BOTH = Object.freeze(["left", "right"]);
const NO_PUSHES = Object.freeze([]);
const WRIST = deepFreeze([{ channel: "wrist.left flexion", sense: 1, level: 0.5 }]);
const BENT = Object.freeze({ ...GUARD, "wrist.left flexion": 0.3 });

/**
 * The Warrior, club in hand, under a command that is a function of the view's time alone, given
 * every fourth step and kept between. It stands a second; walks forward 1.5 s at its envelope's
 * pace; walks 2.5 s more as its heading turns a quarter to its right, at the rate its envelope
 * holds; and stands, but for the two commands from 6.81 s, which leave its legs to its posture. Meanwhile
 * its left hand reaches from 1.5 s to 4 s and its right, with the club, from 3 s to 5 s, each
 * given another place 0.3 s into its reach of 0.4 s; its posture bends a wrist from 3.5 s; and
 * that wrist is pushed from 4.5 s to 5 s.
 */
async function walker() {
  const stand = await coreStand(fighter);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const pace = body.envelope.walk.value, rate = turnAt(body.envelope, pace);
  const height = body.view.stance.centre.y - body.view.stance.support.y - STANCE_LOWER;
  const reach = (hand, by) => deepFreeze({ position: body.view.knuckles[hand].add(by).asArray(), seconds: 0.4 });
  const left = [reach("left", new Vector3(0, 0.1, 0.25)), reach("left", new Vector3(0.1, 0.2, 0.15))];
  const right = [reach("right", new Vector3(-0.1, 0.15, 0.2)), reach("right", new Vector3(0, 0.25, 0.1))];
  const hand = (goals, time, from, to) => time >= from && time < to ? goals[time < from + 0.3 ? 0 : 1] : null;
  body.drive(({ time }) => {
    if (Math.round(time * stand.world.hz) % 4 !== 2) return null;
    const heading = Math.max(0, Math.min(Math.PI / 2, (time - 2.5) * rate));
    const walk = time >= 1 && time < 5 ? [pace * Math.sin(heading), pace * Math.cos(heading)] : null;
    return {
      posture: time < 3.5 ? GUARD : BENT,
      hands: { left: hand(left, time, 1.5, 4), right: hand(right, time, 3, 5) },
      pushes: time >= 4.5 && time < 5 ? WRIST : NO_PUSHES,
      stance: time >= 6.81 && time < 6.875 ? null : { feet: BOTH, centre: null, height, heading, walk },
    };
  });
  const seen = { strides: 0, phases: new Set(), centre: [0, 0], rolled: 0 };
  return {
    world: stand.world, builts: [stand.built], states: { body: body.state }, seen,
    advance: () => stand.step(), read: readers(body),
    watch() {
      seen.strides = body.view.stance.strides;
      seen.phases.add(body.view.stance.phase);
      seen.centre = [body.view.stance.centre.x, body.view.stance.centre.z];
      if (body.state.mind.motor.stance.feet.some((foot) => foot.rolled)) seen.rolled += 1;
    },
    dispose() { body.dispose(); stand.dispose(); },
  };
}

/**
 * The Warrior, unarmed, standing under a command; from its world's step 120 to its step 360 it is
 * pulled at its root's centre of mass along +z, an impulse before each advance of a tenth of its
 * weight for as long as the advance takes, and then stands on.
 *
 * `ceiling` is its assist's, or none: with none it steps to catch itself. `frame`, if given, is
 * the seconds each advance takes of a clock that is not the world's (`World.advance`), so the
 * world owes time between them. From its world's step `withdraw` its assist is withdrawn.
 */
const pulled = ({ ceiling = null, frame = null, withdraw = Infinity }) => async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"));
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, ...(ceiling ? { assist: ceiling } : {}) });
  const height = body.view.stance.centre.y - body.view.stance.support.y - STANCE_LOWER;
  const command = deepFreeze({ posture: GUARD, hands: { left: null, right: null }, pushes: [], stance: { feet: BOTH, centre: null, height, heading: 0, walk: null } });
  body.drive(() => command);
  const root = body.muscles.dynamics.root.segment, at = new Vector3();
  const weight = [...stand.built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0) * -stand.built.physics.gravity[1];
  const pull = new Vector3(0, 0, weight / 10 * (frame ?? stand.world.dt));
  const seen = { recoveries: 0, given: 0, withdrawn: false, steps: new Set() };
  return {
    world: stand.world, builts: [stand.built], states: { body: body.state }, seen,
    advance() {
      const before = stand.world.steps;
      if (before >= 120 && before < 360) root.body.applyImpulse(pull, centreOfToRef(root, at));
      if (before >= withdraw) body.assist.withdraw();
      if (frame === null) stand.step();
      else stand.world.advance(frame);
      seen.steps.add(stand.world.steps - before);
    },
    read: readers(body),
    watch() { seen.recoveries = body.view.stance.recoveries; seen.given = body.assist.meter.force; seen.withdrawn = body.assist.withdrawn; },
    dispose() { body.dispose(); stand.dispose(); },
  };
};
const framed = pulled({ frame: 0.011 });
const helped = pulled({ ceiling: { force: 0.25, moment: 0.065 }, withdraw: 300 });

const HAND = ["goal", "from", "time", "angles"];
const STANCE = "body > mind > motor > stance";
/** The fields a fork is shown to need, under the fixture that shows it. */
const NEEDED = {
  walker: [
    "world > steps",
    ...["activation", "velocity", "ceiling", "trackers"].map((field) => `body > muscles > ${field}`),
    ...["goals", "time", "angles", "fists", "knuckles", "head"].map((field) => `body > mind > ${field}`),
    ...["pose", "pushes", "standing"].map((field) => `body > mind > motor > ${field}`),
    ...["left", "right"].flatMap((hand) => HAND.map((field) => `body > mind > motor > hands > ${hand} > ${field}`)),
    ...["stride", "striding", "owned", "last", "pace", "reading", "feet"].map((field) => `${STANCE} > ${field}`),
    ...["swing", "lifted", "time", "held", "from", "lift"].map((field) => `${STANCE} > step > ${field}`),
    ...["on", "at", "velocity"].map((field) => `${STANCE} > plan > ${field}`),
  ],
  framed: ["world > owed"],
  helped: ["given", "meter", "withdrawn"].map((field) => `body > assist > ${field}`),
};
/** The fields of the state that are not memory: no later step reads what a step left in one, and no reader of a body shows it. */
const NOT_MEMORY = {
  "body > assist > asked": "a step's ask is given, or dropped, in that step: between steps nothing is asked",
  ...Object.fromEntries(["left", "right"].flatMap((hand) => [
    [`body > mind > motor > hands > ${hand} > started`, "a new goal clears it and that step's control sets it"],
    [`body > mind > motor > hands > ${hand} > goals`, "each step clears it and fills it before reading it"],
    [`body > mind > motor > hands > ${hand} > point`, "each step with a goal writes it; `MotorControl.path` shows it, and a body does not"],
  ])),
  [`${STANCE} > step > turn`]: "each step of a swing writes it before reading it",
  ...Object.fromEntries(["aim", "helped", "held", "tasks"].map((field) =>
    [`${STANCE} > ${field}`, "the stance's `command` writes it each step, for `carry` and `bear` of that step"])),
};

/** `run` (a `forks`) forks without a difference, and differs under each of its controls. */
function assertForks(run, controls) {
  assert.deepEqual(run.differences, run.differences.map(() => null));
  assert.deepEqual(Object.keys(run.under), controls);
  assert.deepEqual(controls.filter((name) => run.under[name] === null), [], "a fork loaded without each of these differs somewhere");
}

test("a_standing_and_a_walking_body_fork", async () => {
  const run = await forks(walker, 25, 50, 36, { physics: PHYSICS_ALONE, state: STATE_ALONE, ...forgetting(NEEDED.walker) });
  assertForks(run, ["physics", "state", ...NEEDED.walker]);
  // The fixture reaches the walk and the turn: steps taken, every phase of a step, a heel lifted, and the body gone forward and then to its right.
  const { strides, centre, phases, rolled } = run.seen;
  assert.ok(strides >= 8 && centre[1] > 0.5 && centre[0] > 0.5 && rolled > 0, `${strides} strides, to (${centre}), a heel lifted in ${rolled} steps`);
  assert.deepEqual([...phases].sort(), ["shift", "stand", "swing"]);
});

test("a_pushed_body_forks_through_its_recovery_steps", async () => {
  const alone = await forks(framed, 30, 60, 16, forgetting(NEEDED.framed));
  assertForks(alone, NEEDED.framed);
  assert.ok(alone.seen.recoveries > 0 && alone.seen.given === 0, `it took ${alone.seen.recoveries} recovery steps`);
  assert.deepEqual([...alone.seen.steps].sort(), [1, 2], "its advances took one step or two, as the world owed");
  const run = await forks(helped, 30, 60, 16, forgetting(NEEDED.helped));
  assertForks(run, NEEDED.helped);
  assert.ok(run.seen.given > 0 && run.seen.withdrawn, "the assist gave, and was withdrawn");
});

test("every_field_of_a_bodys_state_is_sorted", async () => {
  const stand = await walker();
  try {
    assert.deepEqual(unsorted(fieldsOf(stand.world, stand.states), Object.values(NEEDED).flat(), Object.keys(NOT_MEMORY)), []);
  } finally { stand.dispose(); }
});
