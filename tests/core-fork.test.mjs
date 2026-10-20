/**
 * **A fork is a load**: a stand loaded with a save (`saveStand`: the physics' bytes and the
 * modules' states, `src/core/state.ts`) goes on as the stand it was saved from went on, whatever
 * step its controllers were at when it was loaded. Node stand, Rapier, 120 Hz.
 *
 * Each field of the state is sorted: one a fork is shown to need (`NEEDED`, under the fixture
 * that shows it: loaded with it as another step left it, some fork differs), or one that is not
 * memory (`NOT_MEMORY`, with why).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { turnAt } from "../src/core/control/stance-envelope.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { armed } from "../src/core/human/grip.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { walkingTactics, pointTactics, committedRecords } from "./fixtures/action-tactics.mjs";
import { NO_COVER, standIntent } from "../src/core/mind/intent.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { subMindsOf } from "../src/core/mind/sub-minds.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { STANCE_LOWER } from "../src/core/skills/locomotion.ts";
import { RUN } from "../src/core/skills/run.ts";
import { STRIDE } from "../src/core/skills/stride.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { labActor } from "../src/lab/actor.ts";
import { LAB_PRESETS } from "../src/lab/scenarios.ts";
import { stagedRise } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { REPERTOIRE } from "../src/core/skills/strikes.ts";
import { deepFreeze } from "../src/core/state.ts";
import { createWorld } from "../src/core/world.ts";
import { riserOf, toppled } from "../research/core-rise-trials.mjs";
import { coreStand, freshEngine } from "./harness/core-stand.mjs";
import { assertForks, fieldsOf, forgetting, forks, PHYSICS_ALONE, shows, STATE_ALONE, unsorted } from "./harness/fork.mjs";
import { rootSegment } from "../src/core/read-body.ts";

const fighter = armed(humanSpec("workshop-fighter"), "right", woodenClub());

const BOTH = Object.freeze(["left", "right"]);
const NO_PUSHES = Object.freeze([]);
const WRIST = deepFreeze([{ channel: "wrist.left flexion", sense: 1, level: 0.5 }]);
const BENT = Object.freeze({ ...GUARD, "wrist.left flexion": 0.3 });
const NO_POINTS = Object.freeze([]);
const LIFT = deepFreeze([{ segment: "hand.left", point: "knuckles", accel: [0, 1, 0] }]);

/**
 * The Warrior, club in hand, under a command that is a function of the view's time alone, given
 * every fourth step and kept between. It stands a second; walks forward 1.5 s at its envelope's
 * pace; walks 2.5 s more as its heading turns a quarter to its right, at the rate its envelope
 * holds; and stands, but for the two commands from 6.81 s, which leave its legs to its posture. Meanwhile
 * its left hand reaches from 1.5 s to 4 s and its right, with the club, from 3 s to 5 s, each
 * given another place 0.3 s into its reach of 0.4 s; its posture bends a wrist from 3.5 s;
 * that wrist is pushed from 4.5 s to 5 s; and its left knuckles are driven up from 5.5 s to 6.5 s.
 */
async function walker() {
  const stand = await coreStand(fighter);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const pace = body.envelope.walk.value, rate = turnAt(body.envelope, pace);
  const height = body.view.stance.centre.y - body.view.stance.support.y - STANCE_LOWER;
  const reach = (hand, by) => deepFreeze({ places: [{ point: "knuckles", position: body.view.effectors[`hand.${hand}`].points.knuckles.add(by).asArray() }], seconds: 0.4 });
  const left = [reach("left", new Vector3(0, 0.1, 0.25)), reach("left", new Vector3(0.1, 0.2, 0.15))];
  const right = [reach("right", new Vector3(-0.1, 0.15, 0.2)), reach("right", new Vector3(0, 0.25, 0.1))];
  const hand = (goals, time, from, to) => time >= from && time < to ? goals[time < from + 0.3 ? 0 : 1] : null;
  body.drive(({ time }) => {
    if (Math.round(time * stand.world.hz) % 4 !== 2) return null;
    const heading = Math.max(0, Math.min(Math.PI / 2, (time - 2.5) * rate));
    const walk = time >= 1 && time < 5 ? [pace * Math.sin(heading), pace * Math.cos(heading)] : null;
    return {
      posture: time < 3.5 ? GUARD : BENT,
      effectors: { "hand.left": hand(left, time, 1.5, 4), "hand.right": hand(right, time, 3, 5) },
      pushes: time >= 4.5 && time < 5 ? WRIST : NO_PUSHES,
      points: time >= 5.5 && time < 6.5 ? LIFT : NO_POINTS,
      stance: time >= 6.81 && time < 6.875 ? null : { feet: BOTH, centre: null, height, heading, walk },
    };
  });
  const seen = { strides: 0, phases: new Set(), centre: [0, 0], rolled: 0 };
  return {
    world: stand.world, builts: [stand.built], states: { body: body.state }, seen,
    advance: () => stand.step(), read: () => shows(body),
    watch() {
      seen.strides = body.view.stance.strides;
      seen.phases.add(body.view.stance.phase);
      seen.centre = [body.view.stance.centre.x, body.view.stance.centre.z];
      if (body.state.mind.host.motor.stance.feet.some((foot) => foot.rolled)) seen.rolled += 1;
    },
    dispose() { body.dispose(); stand.dispose(); },
  };
}

/**
 * The Warrior, unarmed, standing under a command; from its world's step 120 to its step `until` it
 * is pulled at its root's centre of mass along +z, an impulse before each advance of `share` of its
 * weight for as long as the advance takes, and then stands on: a tenth of its weight for 2 s
 * unless told, which it holds.
 *
 * `ceiling` is its assist's, or none: with none it steps to catch itself. `frame`, if given, is
 * the seconds each advance takes of a clock that is not the world's (`World.advance`), so the
 * world owes time between them. From its world's step `withdraw` its assist is withdrawn. `subs`
 * are the sub-minds its command layers hand it to. `levels` are the levels it is put at, each from
 * its world's step.
 */
const pulled = ({ ceiling = null, frame = null, withdraw = Infinity, share = 0.1, until = 360, subs = [], levels = [] }) => async () => {
  const stand = await coreStand(humanSpec("workshop-fighter"));
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, subs, ...(ceiling ? { assist: ceiling } : {}) });
  const height = body.view.stance.centre.y - body.view.stance.support.y - STANCE_LOWER;
  const command = deepFreeze({ posture: GUARD, pushes: [], stance: { feet: BOTH, centre: null, height, heading: 0, walk: null } });
  body.drive(() => command);
  const root = rootSegment(body.built), at = new Vector3();
  const weight = [...stand.built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0) * -stand.built.physics.gravity[1];
  const pull = new Vector3(0, 0, weight * share * (frame ?? stand.world.dt));
  const seen = { recoveries: 0, given: 0, withdrawn: false, steps: new Set(), has: [], down: null, levels: [] };
  return {
    world: stand.world, builts: [stand.built], states: { body: body.state }, seen,
    advance() {
      const before = stand.world.steps;
      if (before >= 120 && before < until) root.body.applyImpulse(pull, centreOfToRef(root, at));
      if (before >= withdraw) body.assist.withdraw();
      for (const [from, level] of levels) if (before === from) body.setLevel(level);
      if (frame === null) stand.step();
      else stand.world.advance(frame);
      seen.steps.add(stand.world.steps - before);
    },
    read: () => ({ ...shows(body), has: body.has }),
    watch() {
      seen.recoveries = body.view.stance.recoveries; seen.given = body.assist.meter.force; seen.withdrawn = body.assist.withdrawn;
      if (seen.has.at(-1) !== body.has) seen.has.push(body.has);
      if (body.view.down) seen.down ??= stand.world.steps;
      if (seen.levels.at(-1)?.[1] !== body.level) seen.levels.push([stand.world.steps, body.level]);
    },
    dispose() { body.dispose(); stand.dispose(); },
  };
};
/** A forward shove during an explicit foot shift replaces it with a catch that must run to landing. */
async function catching() {
  const stand = await coreStand(humanSpec("workshop-fighter"));
  const body = createBody(stand.built, stand.world, { servoSeconds: .1 });
  const height = body.view.standing - .03, root = rootSegment(body.built);
  body.drive(view => ({ posture: GUARD, pushes: [], stance: { feet: BOTH, centre: null, height, heading: 0,
    ...(view.time > .5 ? { swing: { foot: "left", to: [-.15, .3], seconds: .5, lift: .05 } } : {}) } }));
  const seen = { caught: false };
  return { world: stand.world, builts: [stand.built], states: { body: body.state }, seen,
    advance() { if (stand.world.steps === 64) root.body.applyImpulse(new Vector3(0, 0, 70), root.node.position); stand.step(); },
    read: () => shows(body),
    watch() { seen.caught ||= body.state.mind.host.motor.stance.step.catching; },
    dispose() { body.dispose(); stand.dispose(); } };
}

const framed = pulled({ frame: 0.011 });
const helped = pulled({ ceiling: { force: 0.25, moment: 0.065 }, withdraw: 300 });
/**
 * Pulled at its whole weight for a quarter second, to its world's step `FELLED.until`, it falls; its
 * mind is the game's, which lies where it fell. Saved at every step from the pull's end until
 * `FELLED.after` steps after it is down, or until its world's step `FELLED.cap` if it never is.
 */
const FELLED = { until: 150, after: 10, cap: 400 };
const felled = pulled({ share: 1, until: FELLED.until, subs: subMindsOf(RECIPE_FIGHTER.subs) });
const fellen = ({ seen, world }) => seen.down !== null ? world.steps >= seen.down + FELLED.after : world.steps >= FELLED.cap;
/** Unpulled, it is let go limp, held where it is, and given its body back; saved every 5 steps from step 80, 26 times. */
const LEVELLED = { levels: [[100, "limp"], [140, "held"], [180, "full"]], from: 80, count: 26 };
const levelled = pulled({ until: 0, levels: LEVELLED.levels });

/**
 * How many advances after its topple `rising` is first saved, how often after, and how many
 * times: from the middle of `prop`, through `fours` and the slack after it.
 */
const RISING = { from: 560, every: 10, count: 30 };

/** The game's rise (`RISE`) as far as its knees and hands (`fours`), and over there. */
const TO_FOURS = { ...RISE, rise: RISE.rise.slice(0, RISE.rise.findIndex((stage) => stage.name === "fours") + 1) };

/**
 * The Warrior, unarmed, toppled stiff onto its front on the arena's ground (`toppled`), under the
 * game's rise to its knees and hands (`stagedRise`, `TO_FOURS`): it lies slack until it is
 * still, plays the pose stages, comes to its knees and hands in `fours`, and lies slack again.
 */
async function rising() {
  const { world, built, body, dispose } = await toppled({ model: "workshop-fighter", held: "empty", degrees: 0 }, [(own, view) => stagedRise(own, view, TO_FOURS)]);
  const riser = riserOf(body), seen = { stages: [], bore: 0, tries: 0 };
  return {
    world, builts: [built], states: { body: body.state }, seen, dispose,
    advance: () => world.step(), read: () => ({ ...shows(body), has: body.has }),
    watch() {
      const stage = riser.phase === "rise" ? TO_FOURS.rise[riser.stage].name : riser.phase;
      if (seen.stages.at(-1) !== stage) seen.stages.push(stage);
      if (riser.bear.tasks.some((task) => task.on) && riser.bear.tasks.every((task) => task.bearing || !task.on)) seen.bore += 1;
      seen.tries = riser.tries;
    },
  };
}

/**
 * The world's steps through which `taken`'s sub-mind holds its body, a foot in the air; its walk's
 * pace ordered, m/s, under the speed past which a resumed walk does not square its feet
 * (`locomotion`'s `SQUARE_STILL`); and how often it is saved, from when: until its feet are
 * squared and its rise is over, or until its world's step `cap` if they never are.
 */
const TAKEN = { held: [249, 255], pace: 0.2, every: 10, from: 230, cap: 700 };
const squared = ({ seen, world, states }) => seen.squared > 0 && !states.skills.legs.squaring && !states.skills.legs.rising || world.steps >= TAKEN.cap;

/**
 * The Warrior, unarmed, walking forward at `TAKEN.pace` under a fighter's tactics, whose body a sub-mind holds
 * stiff where it is for the steps `TAKEN.held`, mid-step; handed back with its feet closer than
 * its stance's width, it steps them apart and walks on (`locomotion`'s resume).
 */
async function taken() {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  const [from, to] = TAKEN.held;
  const hold = (own) => ({
    name: "hold",
    wants: () => stand.world.steps >= from && stand.world.steps < to,
    begin() {}, end() {},
    step() { own.muscles.activation.fill(1); own.muscles.velocity.fill(0); },
  });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, subs: [hold] });
  const skills = driveBy(body, walkingTactics(stand.built.spec, () => ({ move: { x: 0, z: 1 }, face: null, pace: TAKEN.pace })));
  const seen = { has: [], squared: 0, rose: 0, fallen: false };
  return {
    world: stand.world, builts: [stand.built], states: { body: body.state, skills: skills.state }, seen,
    advance: () => stand.step(), read: () => ({ ...shows(body), report: skills.report }),
    watch() {
      if (seen.has.at(-1) !== body.has) seen.has.push(body.has);
      if (skills.state.legs.squaring) seen.squared += 1;
      if (skills.state.legs.rising) seen.rose += 1;
      seen.fallen ||= body.view.down;
    },
    dispose() { body.dispose(); stand.dispose(); },
  };
}

const EAST = Object.freeze({ x: 1, z: 0 }), NORTH = Object.freeze({ x: 0, z: 1 }), WEST = Object.freeze({ x: -1, z: 0 });
const walking = (move, face = null) => deepFreeze({ move, face });
const ORDERS = { east: walking(EAST), eastFacingNorth: walking(EAST, NORTH), west: walking(WEST) };

/**
 * The Warrior, club in hand, under a fighter's tactics (`actionTactics`) and orders that are a
 * function of the view's time alone. It stands a second; walks east 2 s, facing its walk, so its
 * heading turns a quarter to its right once the walk is under way; walks on east 1.5 s facing
 * north, at the pace that holds, its heading turning back; walks west, turning a quarter to its
 * left, and 0.6 s on is ordered to stand, its heading part way round.
 */
async function ordered() {
  const stand = await coreStand(fighter);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  const skills = driveBy(body, walkingTactics(stand.built.spec, ({ view: { time } }) =>
    time < 1 ? STAND_ORDERS : time < 3 ? ORDERS.east : time < 4.5 ? ORDERS.eastFacingNorth : time < 5.1 ? ORDERS.west : STAND_ORDERS));
  const seen = { strides: 0, headings: [0, 0], paces: new Set(), fallen: false };
  return {
    world: stand.world, builts: [stand.built], states: { body: body.state, skills: skills.state }, seen,
    advance: () => stand.step(), read: () => ({ ...shows(body), report: skills.report }),
    watch() {
      const { heading, pace } = skills.report, fallen = body.view.down;
      seen.strides = body.view.stance.strides;
      seen.headings = [Math.min(seen.headings[0], heading), Math.max(seen.headings[1], heading)];
      seen.paces.add(pace);
      seen.fallen = fallen;
    },
    dispose() { body.dispose(); stand.dispose(); },
  };
}

/**
 * `spec` with a tendon in series with each ankle's plantar flexors, of a stiffness in the range
 * Hof 1998 measured about the ankle (250 to 400 N m/rad at 100 N m).
 */
const tendoned = (spec) => ({ ...spec, joints: spec.joints.map((joint) => !joint.name.startsWith("ankle.") ? joint : {
  ...joint, dofs: joint.dofs.map((dof, k) => k !== 0 ? dof : { ...dof, muscle: { ...dof.muscle,
    tendonNegative: { stiffness: sourced(325, "N m/rad", "de-leva-1996", "a stand-in for an ankle tendon's stiffness in a fork's fixture") } } }) }) });

/**
 * The Warrior, unarmed, under the Lab's script with `locomotion`, told `move` (`Intent.move`)
 * from 1 s on and to stand before it.
 */
const going = (spec, locomotion, move) => async () => {
  const stand = await coreStand(spec);
  const actor = labActor(stand.built, stand.world, { mind: { ...LAB_PRESETS.script.config, locomotion } });
  const skills = actor.drive({ name: "going", decide: ({ view }) => ({ move: view.time < 1 ? null : move, face: 0, guard: NO_COVER, actions: [] }) });
  const body = actor.body, seen = { phases: new Set(), fallen: false, stretched: false };
  return {
    world: stand.world, builts: [stand.built], states: { body: body.state, skills: skills.state }, seen,
    advance: () => stand.step(), read: () => ({ ...shows(body), report: skills.report }),
    watch() {
      seen.phases.add(body.view.stance.phase);
      seen.fallen ||= body.view.down;
      seen.stretched ||= body.state.muscles.stretch.negative.some((x) => x > 0);
    },
    dispose() { actor.dispose(); stand.dispose(); },
  };
};

/** The Warrior, its ankles' plantar flexors each in series with a tendon (`tendoned`), running on the spot (`RUN`): each step a flight. */
const runner = going(tendoned(humanSpec("workshop-fighter")), { kind: "run", ...RUN }, [0, 0]);
/** The Warrior walking ahead by the stride, each swing going on from the sole's velocity as it lifts (`StrideSettings.momentum`). */
const launched = going(humanSpec("workshop-fighter"), { kind: "stride", ...STRIDE, momentum: true }, [0.5, 0]);

/**
 * How often `striker` is saved, in steps; the steps through which its Warrior's left foot is
 * pushed as it swings, and through which the Warrior is pushed over; and the steps about the one
 * at which its feet are first placed, when it is saved at every step: the skill holds that they
 * are placed for one step. The strike settles its stance from step 453, places its feet from 686
 * to 889, chambers from 1071 and swings from 1138, and the shove fells the Warrior at 1223.
 */
const STRIKER = { every: 20, nudged: [470, 495], shoved: [1142, 1172], placed: [870, 910] };

/**
 * A Warrior with a club and, 1.4 m ahead of it, a skeleton, on a ground in a bare world. The
 * Warrior is under a fighter's tactics ordered to attack the skeleton's head, so the strike skill
 * walks it to the blow's place, sets its feet, stands it, chambers and swings; the skeleton is
 * under skills that stand it. Nothing watches for blows: the club strikes and nobody is wounded.
 *
 * Twice it is pushed from outside. As its left foot swings to its place, the foot is pushed to
 * its left at 10 N (`STRIKER.nudged`), so it lands more than `PLACING.near` off and the feet are
 * placed by having stepped, not by standing square. As its swing ends, the Warrior is pushed at its
 * root's centre of mass along +z, an impulse of its weight through each step of `STRIKER.shoved`,
 * and falls.
 */
async function striker() {
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = createWorld(scene, await freshEngine());
  world.physics.addFixedBox([0, -0.5, 0], [20, 1, 20]);
  const make = (spec, z) => {
    const built = buildBody(spec, world, { position: [0, 0, z] });
    return { built, body: createBody(built, world, { servoSeconds: SERVO_SECONDS }) };
  };
  const warrior = make(fighter, 0), skeleton = make(modelSpec("crypt-skeleton"), 1.4);
  const skills = driveBy(warrior.body, pointTactics(warrior.built.spec, () => {
    const head = skeleton.body.view.head;
    return [head.x, head.y, head.z];
  }));
  const foe = driveBy(skeleton.body, { name: "stand", decide: () => standIntent(0) });
  const root = rootSegment(warrior.body.built), at = new Vector3();
  const weight = [...warrior.built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0) * -warrior.built.physics.gravity[1];
  const shove = new Vector3(0, 0, weight * world.dt);
  const foot = warrior.built.segments.get("foot.left"), nudge = new Vector3(-10 * world.dt, 0, 0);
  const seen = { thrown: 0, atSaves: new Set(), phases: new Set(), placed: false, placedAt: null, fallen: false, repertoire: JSON.stringify(REPERTOIRE) };
  return {
    world, builts: [warrior.built, skeleton.built], seen,
    states: { body: warrior.body.state, skills: skills.state, foe: skeleton.body.state, foeSkills: foe.state },
    advance() {
      if (world.steps >= STRIKER.nudged[0] && world.steps < STRIKER.nudged[1]) foot.body.applyImpulse(nudge, centreOfToRef(foot, at));
      if (world.steps >= STRIKER.shoved[0] && world.steps < STRIKER.shoved[1]) root.body.applyImpulse(shove, centreOfToRef(root, at));
      world.step();
    },
    read: () => ({ ...shows(warrior.body), report: skills.report, foe: shows(skeleton.body), foeReport: foe.report }),
    watch() {
      const strike = skills.report.actions[0], fallen = warrior.body.view.down;
      seen.thrown = committedRecords(skills.report).length;
      seen.phases.add(strike?.stage ?? null);
      if (world.steps % STRIKER.every === 0) seen.atSaves.add(strike?.stage ?? null);
      if (skills.state.legs.placed) { seen.placed = true; seen.placedAt ??= world.steps; }
      seen.fallen = fallen;
    },
    dispose() {
      warrior.body.dispose(); skeleton.body.dispose(); warrior.built.dispose(); skeleton.built.dispose();
      world.dispose(); scene.dispose(); engine.dispose();
    },
  };
}

const HAND = ["goal", "from", "time", "angles"];
const STANCE = "body > mind > host > motor > stance";
/** The fields a fork is shown to need, under the fixture that shows it. */
const NEEDED = {
  walker: [
    "world > steps",
    "body > physical",
    ...["activation", "velocity", "ceiling", "pulled", "bounds", "trackers"].map((field) => `body > muscles > ${field}`),
    ...["goals", "time", "angles", "fists", "root > position", "root > rotation", "head"].map((field) => `body > mind > host > ${field}`),
    ...["pose", "pushes", "points", "standing", "reach"].map((field) => `body > mind > host > motor > ${field}`),
    ...["left", "right"].flatMap((hand) => HAND.map((field) => `body > mind > host > motor > effectors > hand.${hand} > ${field}`)),
    ...["stride", "striding", "owned", "last", "pace", "reading", "feet"].map((field) => `${STANCE} > ${field}`),
    ...["swing", "lifted", "pivoted", "time", "held", "off", "recovering", "from", "lift", "drop"].map((field) => `${STANCE} > step > ${field}`),
    ...["now", "capture", "centre"].map((field) => `${STANCE} > step > shift > ${field}`),
    ...["on", "at", "velocity"].map((field) => `${STANCE} > plan > ${field}`),
  ],
  framed: ["world > owed"],
  catching: [`${STANCE} > step > catching`],
  helped: ["given", "meter", "withdrawn"].map((field) => `body > assist > ${field}`),
  felled: ["body > mind > has"],
  levelled: ["body > muscles > level"],
  rising: ["body > mind > subs"],
  ordered: ["heading", "pace"].map((field) => `skills > legs > ${field}`),
  taken: ["width", "squaring", "rising"].map((field) => `skills > legs > ${field}`),
  striker: ["skills > actions", "skills > tactics", "skills > legs > placing"],
  placed: ["skills > legs > placed"],
  runner: [...["on", "left", "from"].map((field) => `${STANCE} > flight > ${field}`), "body > muscles > stretch"],
  launched: [`${STANCE} > step > launch`],
};
/** The fields of the state that are not memory: no later step reads what a step left in one, and no reader of a body shows it. */
const NOT_MEMORY = {
  "body > assist > asked": "a step's ask is given, or dropped, in that step: between steps nothing is asked",
  "body > mind > host > down": "each step's look reads it from the body before any mind steps or any fight reads the view",
  "body > mind > host > resumed": "the step the body is handed back sets it and clears it: between steps it is false",
  ...Object.fromEntries(["left", "right"].flatMap((hand) => [
    [`body > mind > host > motor > effectors > hand.${hand} > started`, "a new goal clears it and that step's control sets it"],
    [`body > mind > host > motor > effectors > hand.${hand} > goals`, "each step clears it and fills it before reading it"],
    [`body > mind > host > motor > effectors > hand.${hand} > point`, "each step with a goal writes it; `MotorControl.path` shows it, and a body does not"],
  ])),
  [`${STANCE} > step > turn`]: "each step of a swing writes it before reading it",
  ...Object.fromEntries(["aim", "helped", "tasks", "pose"].map((field) =>
    [`${STANCE} > ${field}`, "the stance's `command` writes it each step, for `carry` and `bear` of that step"])),
  [`${STANCE} > crouch`]: "each command sets it from the walk's pace before it plans a height or a step",
  [`${STANCE} > plan > missed`]: "each command sets it from the last command's shortfall before the plan reads it",
  "skills > command": "each step the skills write its posture, effectors, pushes and stance before the body reads them: it is in the state for what the body's shares with it",
  "skills > owners": "every composition names the effective owners from current claims",
  "skills > reservations": "every composition rebuilds reservations from admitted resources",
  "skills > support": "the recipe fixture has no support service and retains null",
  "skills > legs > reference": "the immutable anatomical standing height is read again if the cached reference is empty",
  "body > mind > host > groundActive": "every look derives activity from current down and sub-mind ownership before reading the view",
};

test("a catch during an explicit shift forks and needs its retained ownership", async () => {
  const run = await forks(catching, 1, 10, 12, forgetting(NEEDED.catching), 62);
  assertForks(run, NEEDED.catching);
  assert.equal(run.seen.caught, true);
});

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

test("a_body_forks_as_it_goes_down_and_lying", async () => {
  const run = await forks(felled, 1, 5, fellen, forgetting(NEEDED.felled), FELLED.until);
  // The fixture reaches the hand-over: the command layers had the body, then the mind that lies, and it is saved on both sides of the step between.
  const { has, down } = run.seen;
  assert.ok(down !== null, `the fixture never went down, by step ${FELLED.cap}`);
  assert.deepEqual(has, ["command", "lie"]);
  assert.ok(down > run.steps[0] + 5 && down < run.steps.at(-1) - 5, `down at step ${down}, forked from ${run.steps[0]} to ${run.steps.at(-1)}`);
  assertForks(run, NEEDED.felled);
});

test("a_body_forks_as_its_level_changes", async () => {
  const run = await forks(levelled, 5, 10, LEVELLED.count, forgetting(NEEDED.levelled), LEVELLED.from);
  assertForks(run, NEEDED.levelled);
  // The fixture reaches each level, and is saved on both sides of each change.
  assert.deepEqual(run.seen.levels, [[0, "full"], [101, "limp"], [141, "held"], [181, "full"]]);
  assert.ok(run.steps[0] < 100 && run.steps.at(-1) > 180, `forked from ${run.steps[0]} to ${run.steps.at(-1)}`);
});

test("a_body_forks_as_it_rises", async () => {
  const run = await forks(rising, RISING.every, 20, RISING.count, forgetting(NEEDED.rising), RISING.from);
  assertForks(run, NEEDED.rising);
  // The fixture reaches the bearing stage from the pose before it, the stage's end, and the slack after: every limb it bears on bore, and one attempt was
  // played. Its riser does nothing until the body is its own, and again for the step its rise is over.
  const { stages, bore, tries } = run.seen;
  assert.deepEqual(stages, ["idle", "settle", "fold", "tuck", "prop", "fours", "idle", "settle"]);
  assert.ok(bore > 100 && tries === 1, `every limb bore in ${bore} steps, in ${tries} attempts`);
});

test("a_body_handed_back_mid_step_forks_as_it_squares_its_feet_and_rises", async () => {
  const run = await forks(taken, TAKEN.every, 20, squared, forgetting(NEEDED.taken), TAKEN.from);
  // The fixture is saved before the hold, through the step that squares its feet, and through its rise, and stays up.
  const { has, squared: squaring, rose, fallen } = run.seen;
  assert.deepEqual(has, ["command", "hold", "command"]);
  assert.ok(squaring > 30 && rose > 100 && !fallen, `squaring ${squaring} steps, rising ${rose}: the fixture did not reach its case`);
  assertForks(run, NEEDED.taken);
});

test("a_body_under_orders_forks_through_its_turns", async () => {
  const run = await forks(ordered, 25, 50, 28, forgetting(NEEDED.ordered));
  assertForks(run, NEEDED.ordered);
  // The fixture reaches the turns: a quarter each way and part of one back, at the walk's pace and at the pace that holds facing away.
  const { strides, headings, paces, fallen } = run.seen;
  assert.ok(strides >= 10 && headings[0] < -1 && headings[1] > 1.5 && paces.size >= 3 && !fallen, `${strides} strides, headings ${headings}, ${paces.size} paces`);
});

test("a_body_forks_in_the_middle_of_a_blow", async () => {
  const run = await forks(striker, STRIKER.every, 60, 60, forgetting(NEEDED.striker));
  assertForks(run, NEEDED.striker);
  // The fixture reaches the blow: every phase of a strike, its chamber and its swing at a save, the blow thrown; and the fall.
  const { thrown, atSaves, phases, fallen, repertoire } = run.seen;
  for (const phase of [null, "place", "settle", "chamber", "swing"]) assert.ok(phases.has(phase), JSON.stringify([...phases]));
  assert.ok(thrown > 0 && atSaves.has("chamber") && atSaves.has("swing") && fallen, `${thrown} thrown, saved in ${[...atSaves]}`);
  assert.ok(run.seen.placedAt !== null, "the feet reach verified placement");
  const placing = await forks(striker, 1, 5, 5, forgetting(NEEDED.placed), Math.max(0, run.seen.placedAt - 2));
  assertForks(placing, NEEDED.placed);
  // The searched strikes are a table no load wrote into.
  assert.ok(Object.isFrozen(REPERTOIRE) && REPERTOIRE.every((recipe) => Object.isFrozen(recipe.strike.pushes) && Object.isFrozen(recipe.window.along)));
  assert.equal(JSON.stringify(REPERTOIRE), repertoire);
});

test("a_body_forks_as_it_runs_on_its_tendons_and_as_its_swings_go_on_from_their_launch", async () => {
  // Saved at every step through a run's whole step: where the centre of mass was as a flight began is read the step after.
  const run = await forks(runner, 1, 10, 60, forgetting(NEEDED.runner), 150);
  assertForks(run, NEEDED.runner);
  // The fixture reaches the run's flights, its tendons stretched, and stays up.
  assert.ok(run.seen.phases.has("flight") && run.seen.stretched && !run.seen.fallen, JSON.stringify({ ...run.seen, phases: [...run.seen.phases] }));
  const walk = await forks(launched, 5, 40, 40, forgetting(NEEDED.launched), 150);
  assertForks(walk, NEEDED.launched);
  assert.ok(walk.seen.phases.has("swing") && !walk.seen.fallen, JSON.stringify({ ...walk.seen, phases: [...walk.seen.phases] }));
});

test("every_field_of_a_bodys_state_is_sorted", async () => {
  const stand = await walker(), struck = await striker();
  try {
    const fields = [...fieldsOf({ world: stand.world.state, ...stand.states }), ...fieldsOf({ skills: struck.states.skills })];
    // The feet's paths and every effector's observations are exercised and mutated in core-effectors.test.mjs.
    const effectors = ["effectors", "motor > effectors > foot.left", "motor > effectors > foot.right"].map(field => `body > mind > host > ${field}`);
    const rotations = ["left", "right"].map(hand => `body > mind > host > motor > effectors > hand.${hand} > fromRotation`);
    // Pose memory is exercised by physical opening/closure and fresh-world continuation in core-hand-poses.test.mjs.
    // Ground reading replay and host ownership are exercised in ground-reading and core-sub-mind.
    // A body's own start, written at its first view, is exercised on a world that has run in arena-fresh-start.test.mjs.
    assert.deepEqual(unsorted(fields, [...Object.values(NEEDED).flat(), "body > handPoses", "body > mind > host > ground", "body > mind > host > subOwned", "body > mind > host > born", ...effectors, ...rotations], Object.keys(NOT_MEMORY)), []);
  } finally { stand.dispose(); struck.dispose(); }
});
