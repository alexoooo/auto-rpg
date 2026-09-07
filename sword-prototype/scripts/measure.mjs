// The policy measurement harness: real bouts, real Havok, no browser.
//
//     npm run measure                    -- the stroke, then the three matchups
//     npm run measure -- --bouts 20      -- fewer, while you are iterating
//     npm run measure -- --only swing    -- the swinger's stroke on its own
//     npm run measure -- --only duelist-swinger --verbose
//     npm run measure -- --only golem      -- the golem mind, its control and the build sweep
//     npm run measure -- --seed 777001   -- a second, independent corpus
//     npm run measure -- --selftest      -- one bout twice in isolated solvers
//
// It is **not** in `npm test` and that is deliberate. The pure half of session
// 06 -- what `decide` returns when it is shown a view -- is in
// `tests/minds.test.mjs` and costs milliseconds; this runs the solver for
// minutes, and a default test run that takes minutes is a test run nobody runs.
//
// Everything here obeys the two traps that have already cost this directory
// time. It never calls `scene.render()` to drive the world -- `getDeltaTime()`
// is near zero between immediate calls and the simulation crawls -- and it
// advances `scene._renderId` once per simulated frame, because Babylon's
// world-matrix cache is keyed on it and a harness that never renders otherwise
// freezes every matrix at its first sample. The readings it takes are
// `Fighter.view`'s, which are cache-free by construction and are the ones the
// policies are actually being shown.
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
// The posture bench stands one fighter up by hand rather than through `runBout`, so it is
// the one section of this file that needs the class itself. Its three call sites had been
// reaching for a name nothing imported since the harness was split, which is why a bare
// `npm run measure` threw at the first bench while every `--only` cell past it worked.
import { Fighter } from "../src/fighter.ts";
import { policyMind } from "../src/mind.ts";
import { blankIntent } from "../src/policies.ts";
import { ACTION_TUNING } from "../src/action-primitives.ts";
import { defaultGolemSetup, golemChainOptions, golemHeadOptions, golemLocomotionOptions,
  golemSetupRefusal, golemTerminalOptions, golemTorsoOptions } from "../src/golem/build.ts";
import { FIXED, FRAME, buildArena, freshHavok, runBout, seedFor } from "./bout-runner.mjs";

// The library surface tests and scratch harnesses import: the runner's, re-exported so a
// caller that learned this module's name before the runner existed still has it.
export { freshHavok, runBout };

/**
 * The bench's bout cap, in seconds of simulation time. Sixty, and the argument
 * for sixty is entirely about running a lot of them.
 *
 * A policy here is reported as a distribution over N bouts. Headless Babylon
 * runs at about 250x real time -- 10 s of simulated time in 39 ms -- so a
 * hundred *capped* bouts cost about twenty-five seconds of wall clock at 60 s
 * and four minutes at the 600 s the page ships. The only bouts that ever reach
 * the cap are the ones that were never going to end, and they are the ones being
 * paid for, so 60 over 90 or 120 is bought and not guessed.
 *
 * It lives here rather than in `config.ts` because the page is not running a
 * hundred bouts, it is running one, with a person in it -- and 60 s in the page
 * ended a fight underneath whoever was having it. `CONFIG.bout.capSeconds` says
 * the rest.
 */
CONFIG.bout.capSeconds = 60;

/**
 * One swinger, swinging at nothing, so the stroke can be read on its own.
 *
 * The fourth claim -- that the policy's blade clears `combat.referenceSpeed` --
 * is about the swing and not about the fight, and inside a bout it is hard to
 * read: against `idle` the swinger's blade is in near-permanent contact with a
 * body that never moves, so a window in which the blade is being driven rather
 * than shoved almost never opens, and the in-bout figure starves to about
 * 4 m/s. That is a fact about the instrument rather than about the policy.
 *
 * So: the real `swingerMind`, driving a real arm through the real solver, shown
 * a **written-out view** of an opponent standing at its engage range that does
 * not exist in the arena. Nothing is ever struck, and every sample is the
 * blade's own. It is not a bout and is not reported as one; it answers one
 * question, which is how fast this stroke gets the point of the blade.
 *
 * Cycles are cut on the roll changing, because `swingerMind` sets its roll once
 * per swing and never touches it again -- so a new roll is a new swing, and the
 * harness gets its cycle boundaries from the policy's own behaviour rather than
 * from a copy of its cadence that could drift out of step with it.
 */
function runSwingBench({ seed = 1, seconds = 20 } = {}) {
  const { engine, scene, materials } = buildArena();
  const swinger = policyMind("swinger", seed);

  const PARTS = [
    "torso", "head", "pelvis", "upperArm", "forearm", "hand",
    "offUpperArm", "offForearm", "thighL", "shinL", "thighR", "shinR",
  ];
  const whole = () => Object.fromEntries(PARTS.map((key) => [key, 1]));
  const at = 1.2;

  /**
   * Both hands, because a policy plans both and reads what each is holding.
   *
   * A hand-written view has to carry every field the real one does or the policy
   * reads `undefined` off it, and this one threw on the first substep the day
   * `FighterView` grew hands -- exactly as `tests/minds.test.mjs`'s fixture did,
   * and exactly as both of them did again the day it grew `projectiles`. They
   * are no longer the only two: `tests/fixtures/view.mjs` now carries the field
   * list and the check, and `tests/view.test.mjs` holds that list against a real
   * published view. A hand-written view in `scripts/` is outside that net, which
   * is the argument for keeping this one honest by hand.
   *
   * The loadout is the fighter's below: a sword in the primary and nothing in
   * the other hand. `shoulder` is the body's for both, which is the same
   * simplification the rest of this phantom makes.
   */
  const bothHands = (shoulder, tip, sign) => ({
    primary: {
      weapon: "sword",
      shoulder,
      tip,
      tipSpeed: 0,
      // The direction beside the magnitude. `describeFighter` derives the second
      // from the first, and `selectThreat` ranks a hand by its speed only while
      // the point is closing -- so a phantom carrying a speed and no direction
      // describes a blade that is not going anywhere.
      tipVelocity: new Vector3(0, 0, 0),
      // The same arithmetic `Arm.strikeReach` does, because a policy shifts its
      // ranges by it and a phantom that omitted it would hand `NaN` to every
      // distance comparison in the file.
      reach: CONFIG.arm.reachNeutral + (CONFIG.sword.gripLength / 2 + CONFIG.sword.bladeLength),
      lost: false,
      outboard: 1,
    },
    secondary: {
      weapon: "empty",
      shoulder,
      tip: new Vector3(shoulder.x, shoulder.y, shoulder.z + sign * CONFIG.arm.reachNeutral),
      tipSpeed: 0,
      tipVelocity: new Vector3(0, 0, 0),
      reach: CONFIG.arm.reachNeutral,
      lost: false,
      outboard: -1,
    },
  });
  /**
   * The five body facts a hand carries none of.
   *
   * Taken from `config.ts` rather than invented, the same way `reach` above is:
   * `Fighter.describeFighter` fills them from the body profile, `selectThreat`
   * measures every threat's closest approach to `(ground.x, vitalHeight,
   * ground.z)` and gates a shaft on `collisionRadius`, and feature v4 publishes
   * all five.
   */
  const shape = () => ({
    unit: "warrior",
    reach: CONFIG.arm.reachNeutral,
    crownHeight: CONFIG.body.headCentre + CONFIG.body.headRadius,
    vitalHeight: CONFIG.body.torsoCentre,
    collisionRadius: CONFIG.body.pelvisRadius,
    naturalAttacks: {},
  });
  const mySocket = new Vector3(0, 1.42, 0);
  const theirSocket = new Vector3(0, 1.42, at);
  const myTip = new Vector3(0, 1.42, 1.3);
  const theirTip = new Vector3(0, 1.42, at - 1.3);
  const phantom = {
    self: {
      ...shape(),
      ground: new Vector3(0, 0, 0),
      facing: 0,
      shoulder: mySocket,
      tip: myTip,
      tipSpeed: 0,
      hands: bothHands(mySocket, myTip, 1),
      crouch: 0,
      trunkLean: 0,
      trunkTwist: 0,
      vitality: 1,
      health: whole(),
    },
    opponent: {
      ...shape(),
      ground: new Vector3(0, 0, at),
      facing: Math.PI,
      shoulder: theirSocket,
      tip: theirTip,
      tipSpeed: 0,
      hands: bothHands(theirSocket, theirTip, -1),
      crouch: 0,
      trunkLean: 0,
      trunkTwist: 0,
      vitality: 1,
      health: whole(),
    },
    // Nothing is ever in the air in this sweep, and the array is published
    // rather than omitted because a `FighterView` always carries it.
    projectiles: [],
    measure: at - 0.4,
    clock: 0,
  };

  let asked = null;
  const fighter = new Fighter(
    scene,
    {
      side: "left",
      origin: Vector3.Zero(),
      facing: 0,
      mind: {
        name: "swinger",
        decide: (_view, dt) => {
          asked = swinger.decide(phantom, dt);
          return asked;
        },
      },
    },
    materials,
  );

  let lastRoll = null;
  let peak = 0;
  const peaks = [];
  const tip = new Vector3();
  scene.onBeforePhysicsObservable.add(() => {
    phantom.clock += FIXED;
    // `observe` is skipped deliberately: this fighter's mind reads the written
    // view above and never `this.view`, and there is no opponent in the arena
    // for `observe` to be handed.
    fighter.update(FIXED);
    fighter.sword.tipPositionToRef(tip);
    peak = Math.max(peak, fighter.sword.speedAt(tip));
    // The driven hand's roll, not the intent's: `roll` moved onto the hand when
    // the intent grew two of them, so this read `undefined` every step and the
    // stroke counter therefore counted no strokes at all.
    const roll = asked[asked.actingHand].roll;
    if (lastRoll !== null && roll !== lastRoll) {
      peaks.push(peak);
      peak = 0;
    }
    lastRoll = roll;
  });

  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) {
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(1000 * FRAME);
  }

  scene.dispose();
  engine.dispose();
  // The first entry covers everything from the build to the first roll, which
  // is the anchor snapping the arm up from the hip and not a swing.
  return peaks.slice(1);
}

/** Four-corner posture sweep in the headless real-solver harness. */
function runPostureBench() {
  const rows = [];
  for (const lean of [-1, 1]) {
    for (const twist of [-1, 1]) {
      const { engine, scene, materials } = buildArena();
      const intent = blankIntent();
      const fighter = new Fighter(scene, {
        side: "left", origin: Vector3.Zero(), facing: 0,
        mind: { name: "posture bench", decide: () => intent },
      }, materials);
      const waistParent = new Vector3(0, CONFIG.body.waist - CONFIG.body.pelvisCentre, 0);
      const waistChild = new Vector3(0, CONFIG.body.waist - CONFIG.body.torsoCentre, 0);
      const parentWorld = new Vector3();
      const childWorld = new Vector3();
      let peakWaistMm = 0;
      let peakHandMm = 0;
      let limitSamples = 0;
      let samples = 0;
      let recoveredWaistMm = 0;
      let clock = 0;
      scene.onBeforePhysicsObservable.add(() => {
        const active = clock >= 1 && clock < 4;
        intent.posture.trunkLean = active ? lean : 0;
        intent.posture.trunkTwist = active ? twist : 0;
        fighter.update(FIXED);
        clock += FIXED;
        waistParent.rotateByQuaternionToRef(fighter.pelvis.mesh.rotationQuaternion, parentWorld);
        parentWorld.addInPlace(fighter.pelvis.mesh.position);
        waistChild.rotateByQuaternionToRef(fighter.torso.mesh.rotationQuaternion, childWorld);
        childWorld.addInPlace(fighter.torso.mesh.position);
        peakWaistMm = Math.max(peakWaistMm, Vector3.Distance(parentWorld, childWorld) * 1000);
        // The first 0.6 s is the documented build-pose snap, not posture
        // tracking. Including it makes every corner answer the same 774 mm.
        if (clock >= 0.6) {
          for (const name of ["primary", "secondary"]) {
            peakHandMm = Math.max(
              peakHandMm,
              Vector3.Distance(fighter.arms[name].hand.mesh.position, fighter.arms[name].targetPosition()) * 1000,
            );
          }
        }
        const relative = fighter.pelvis.mesh.rotationQuaternion
          .conjugate()
          .multiply(fighter.torso.mesh.rotationQuaternion)
          .toEulerAngles();
        if (Math.abs(relative.x) >= CONFIG.body.trunkLeanMax * 0.95 ||
            Math.abs(relative.y) >= CONFIG.body.trunkTwistMax * 0.95) limitSamples += 1;
        if (clock >= 4.9) recoveredWaistMm = Vector3.Distance(parentWorld, childWorld) * 1000;
        samples += 1;
      });
      const started = performance.now();
      for (let frame = 0; frame < 5 * 60; frame += 1) {
        scene._renderId += 1;
        scene._advancePhysicsEngineStep(1000 * FRAME);
      }
      const physicsMs = performance.now() - started;
      rows.push({ lean, twist, peakWaistMm, peakHandMm, occupancy: limitSamples / samples, recoveredWaistMm, physicsMs });
      fighter.dispose();
      scene.dispose();
      engine.dispose();
    }
  }
  return rows;
}

/** Standing/walking crouch sweep through the real articulated leg chain. */
function runCrouchBench() {
  const rows = [];
  for (const moving of [false, true]) {
    for (const crouch of [0, 0.25, 0.5, 0.75, 1]) {
      const { engine, scene, materials } = buildArena();
      const intent = blankIntent();
      intent.forward = moving ? 1 : 0;
      intent.posture.crouch = crouch;
      const fighter = new Fighter(scene, {
        side: "left", origin: Vector3.Zero(), facing: 0,
        mind: { name: "crouch bench", decide: () => intent },
      }, materials);
      const limb = (key) => fighter.limbs.find((part) => part.key === key).part.mesh;
      const thighL = limb("thighL");
      const thighR = limb("thighR");
      const shinL = limb("shinL");
      const shinR = limb("shinR");
      const down = new Vector3(0, -CONFIG.body.shinLength / 2, 0);
      const endpoint = new Vector3();
      let pelvisSum = 0;
      let pelvisSamples = 0;
      let minFoot = Number.POSITIVE_INFINITY;
      let kneeLimits = 0;
      let kneeSamples = 0;
      let peakHandMm = 0;
      let clock = 0;
      scene.onBeforePhysicsObservable.add(() => {
        fighter.update(FIXED);
        clock += FIXED;
        if (clock < 0.6) return;
        if (clock >= 1.5) {
          pelvisSum += fighter.pelvis.mesh.position.y;
          pelvisSamples += 1;
        }
        for (const shin of [shinL, shinR]) {
          down.rotateByQuaternionToRef(shin.rotationQuaternion, endpoint);
          minFoot = Math.min(minFoot, shin.position.y + endpoint.y);
        }
        for (const [thigh, shin] of [[thighL, shinL], [thighR, shinR]]) {
          const knee = thigh.rotationQuaternion.conjugate()
            .multiply(shin.rotationQuaternion).toEulerAngles().x;
          if (knee <= CONFIG.body.kneeLimitMin + 0.05 ||
              knee >= CONFIG.body.kneeLimitMax - 0.05) kneeLimits += 1;
          kneeSamples += 1;
        }
        for (const name of ["primary", "secondary"]) {
          peakHandMm = Math.max(
            peakHandMm,
            Vector3.Distance(fighter.arms[name].hand.mesh.position, fighter.arms[name].targetPosition()) * 1000,
          );
        }
      });
      const started = performance.now();
      for (let frame = 0; frame < 2 * 60; frame += 1) {
        scene._renderId += 1;
        scene._advancePhysicsEngineStep(1000 * FRAME);
      }
      rows.push({
        moving, crouch,
        pelvis: pelvisSum / Math.max(1, pelvisSamples),
        minFoot,
        kneeOccupancy: kneeLimits / Math.max(1, kneeSamples),
        peakHandMm,
        physicsMs: performance.now() - started,
      });
      fighter.dispose();
      scene.dispose();
      engine.dispose();
    }
  }
  return rows;
}

// ---- statistics -----------------------------------------------------------

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function median(xs) {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const half = sorted.length >> 1;
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

const span = (xs) =>
  xs.length ? `${mean(xs).toFixed(2)} (${Math.min(...xs).toFixed(2)}-${Math.max(...xs).toFixed(2)})` : "--";

/**
 * N bouts of one pairing, with the sides swapped on every other one.
 *
 * Swapping cancels the arena. The two corners are not identical -- the left
 * fighter's bodies sit fifteen places further up Havok's list than the right's,
 * they start at different points on the floor, and each holds its sword on its
 * own side of a shared centre line -- and a win rate taken with one policy
 * always on the left would fold all of that into the answer.
 */
function runMatchup(a, b, bouts, runSeed, verbose) {
  const wins = { [a]: 0, [b]: 0, draw: 0 };
  const seconds = [];
  const stats = {
    [a]: { peaks: [], driven: [], alignments: [], speeds: [], hits: [], damage: [], severs: 0 },
    [b]: { peaks: [], driven: [], alignments: [], speeds: [], hits: [], damage: [], severs: 0 },
  };
  const endings = { exhausted: 0, time: 0 };
  const deathRegions = {};

  for (let i = 0; i < bouts; i += 1) {
    const swapped = i % 2 === 1;
    const leftPolicy = swapped ? b : a;
    const rightPolicy = swapped ? a : b;
    const seeds = [seedFor(runSeed, i, swapped ? 1 : 0), seedFor(runSeed, i, swapped ? 0 : 1)];

    const bout = runBout({ left: leftPolicy, right: rightPolicy, seeds });
    const winner = bout.winner ? (bout.winner === "left" ? leftPolicy : rightPolicy) : null;

    // A mirror match has one name on both sides, so a win by either is a win for
    // the policy and the two counters would double-count. Counted once.
    if (winner === null) wins.draw += 1;
    else wins[winner] += 1;
    endings[bout.ending] += 1;
    deathRegions[bout.deathRegion] = (deathRegions[bout.deathRegion] ?? 0) + 1;
    seconds.push(bout.seconds);

    for (const record of [bout.left, bout.right]) {
      const into = stats[record.policy];
      into.peaks.push(record.peakTip);
      into.driven.push(record.peakTipDriven);
      into.alignments.push(...record.alignments);
      into.speeds.push(...record.speeds);
      into.hits.push(record.hits);
      into.damage.push(record.damage);
      into.severs += record.severs;
    }

    if (verbose) {
      console.log(
        `  bout ${String(i).padStart(3)}  ${leftPolicy} vs ${rightPolicy}  ` +
          `${bout.seconds.toFixed(1)}s  ${bout.text}`,
      );
    }
  }

  return { a, b, bouts, wins, seconds, stats, endings, deathRegions };
}

function report(run) {
  const { a, b, bouts, wins, seconds, stats, endings } = run;
  const mirror = a === b;
  console.log(`\n=== ${a} vs ${b} -- ${bouts} bouts ===`);
  if (mirror) {
    console.log(`  decided ${endings.exhausted}/${bouts}, drawn at the cap ${endings.time}/${bouts}`);
  } else {
    const pct = (n) => `${((n / bouts) * 100).toFixed(1)} %`;
    console.log(`  ${a} ${wins[a]}/${bouts} = ${pct(wins[a])}   ` +
      `${b} ${wins[b]}/${bouts} = ${pct(wins[b])}   draw ${wins.draw}/${bouts} = ${pct(wins.draw)}`);
  }
  console.log(`  bout length, s      ${span(seconds)}`);
  console.log(`  final blow regions  ${Object.entries(run.deathRegions)
    .sort((a, b) => b[1] - a[1])
    .map(([region, count]) => `${region} ${count}`)
    .join(", ")}`);
  for (const name of mirror ? [a] : [a, b]) {
    const s = stats[name];
    // How many bouts the blade was demonstrably driven past the speed a cut
    // needs to do full damage. The claim it answers is a floor, so a count of
    // bouts that cleared it says more than an average that a starved sample can
    // drag down: the driven gate goes hungry in a pairing where the two bodies
    // are in constant contact, and a zero from it means "no window to look
    // through" rather than "a slow swing".
    const cleared = s.driven.filter((peak) => peak >= CONFIG.combat.referenceSpeed).length;
    console.log(
      `  ${name.padEnd(8)} peak tip driven ${span(s.driven)} m/s   struck ${span(s.peaks)}`,
    );
    console.log(
      `  ${" ".repeat(8)} driven past referenceSpeed (${CONFIG.combat.referenceSpeed} m/s) ` +
        `in ${cleared}/${s.driven.length} readings`,
    );
    console.log(
      `  ${" ".repeat(8)} contacts ${span(s.hits)}   damage ${span(s.damage)}   severs ${s.severs}`,
    );
    if (s.alignments.length === 0) {
      console.log(`  ${" ".repeat(8)} no scoring contact in ${bouts} bouts`);
      continue;
    }
    console.log(
      `  ${" ".repeat(8)} ${s.alignments.length} scoring contacts: edge alignment ` +
        `median ${median(s.alignments).toFixed(3)}, mean ${mean(s.alignments).toFixed(3)}, ` +
        `range ${Math.min(...s.alignments).toFixed(3)}-${Math.max(...s.alignments).toFixed(3)}`,
    );
    console.log(
      `  ${" ".repeat(8)} ${" ".repeat(String(s.alignments.length).length)} contact speed ` +
        `median ${median(s.speeds).toFixed(2)}, mean ${mean(s.speeds).toFixed(2)}, ` +
        `range ${Math.min(...s.speeds).toFixed(2)}-${Math.max(...s.speeds).toFixed(2)} m/s`,
    );
  }
}

const FIST_CELLS = [
  {
    name: "duelist-vs-duelist",
    a: { label: "duelist A", policy: "duelist", loadout: { primary: "empty", secondary: "empty" } },
    b: { label: "duelist B", policy: "duelist", loadout: { primary: "empty", secondary: "empty" } },
  },
  {
    name: "duelist-vs-sword",
    a: { label: "bare duelist", policy: "duelist", loadout: { primary: "empty", secondary: "empty" } },
    b: { label: "sword duelist", policy: "duelist", loadout: { primary: "sword", secondary: "empty" } },
  },
  {
    name: "unarmed-vs-idle",
    a: { label: "unarmed", policy: "swinger", loadout: { primary: "empty", secondary: "empty" } },
    b: { label: "idle", policy: "idle", loadout: { primary: "empty", secondary: "empty" } },
  },
  {
    name: "unarmed-vs-sword",
    a: { label: "unarmed", policy: "swinger", loadout: { primary: "empty", secondary: "empty" } },
    b: { label: "sword", policy: "swinger", loadout: { primary: "sword", secondary: "empty" } },
  },
  {
    name: "sword-plus-empty-vs-sword",
    a: { label: "sword+fist", policy: "duelist", loadout: { primary: "sword", secondary: "empty" } },
    b: { label: "sword", policy: "swinger", loadout: { primary: "sword", secondary: "empty" } },
  },
];

/** The session-06 cells: side-swapped loadouts, and fist-specific outcomes. */
function runFistCell(cell, count, seed) {
  const stats = Object.fromEntries([cell.a, cell.b].map((role) => [role.label, {
    punches: 0, attempts: 0, blocks: 0, damage: 0, deaths: 0, wins: 0,
    approach: 0, inside: 0, retreat: 0, duration: 0,
  }]));
  for (let i = 0; i < count; i += 1) {
    const swapped = i % 2 === 1;
    const left = swapped ? cell.b : cell.a;
    const right = swapped ? cell.a : cell.b;
    const attempts = { left: 0, right: 0 };
    const retreat = { left: 0, right: 0 };
    const tracked = (policy, side, policySeed) => {
      const inner = policyMind(policy, policySeed);
      const extended = { primary: false, secondary: false };
      return { name: inner.name, decide(view, dt) {
        const intent = inner.decide(view, dt);
        for (const hand of ["primary", "secondary"]) {
          if (intent[hand].thrust && !extended[hand] && view.self.hands[hand].weapon === "empty") attempts[side] += 1;
          extended[hand] = intent[hand].thrust;
        }
        if (intent.forward < -0.05) retreat[side] += dt;
        return intent;
      } };
    };
    const seeds = [seedFor(seed, i, swapped ? 1 : 0), seedFor(seed, i, swapped ? 0 : 1)];
    let initialGap = null; let minimumGap = Infinity; let inside = 0;
    const result = runBout({
      left: left.policy,
      right: right.policy,
      leftLoadout: left.loadout,
      rightLoadout: right.loadout,
      seeds,
      leftMind: tracked(left.policy, "left", seeds[0]),
      rightMind: tracked(right.policy, "right", seeds[1]),
      onSample({ left: leftFighter, dt }) {
        const gap = Math.hypot(
          leftFighter.view.self.shoulder.x - leftFighter.view.opponent.shoulder.x,
          leftFighter.view.self.shoulder.y - leftFighter.view.opponent.shoulder.y,
          leftFighter.view.self.shoulder.z - leftFighter.view.opponent.shoulder.z,
        );
        initialGap ??= gap; minimumGap = Math.min(minimumGap, gap);
        if (gap <= ACTION_TUNING.bareStrikeRange) inside += dt;
      },
    });
    for (const [side, role] of [["left", left], ["right", right]]) {
      const record = result[side];
      const into = stats[role.label];
      into.punches += record.punches;
      into.attempts += attempts[side];
      into.blocks += record.blocks;
      into.damage += record.damage;
      into.approach += Math.max(0, initialGap - minimumGap);
      into.inside += inside;
      into.retreat += retreat[side];
      into.duration += result.seconds;
      if (result.winner === side) into.wins += 1;
      else if (result.winner !== null) into.deaths += 1;
    }
  }
  return stats;
}

function reportFistCells(count, seed) {
  console.log(`\n=== bare hands -- ${count} side-swapped bouts per cell ===`);
  console.log("  cell                         role         attempts/landed  blocks  approach  in-range  retreat  damage/bout  result  duration");
  for (const cell of FIST_CELLS) {
    const stats = runFistCell(cell, count, seed);
    for (const role of [cell.a, cell.b]) {
      const s = stats[role.label];
      console.log(
        `  ${cell.name.padEnd(28)} ${role.label.padEnd(11)} ` +
        `${`${s.attempts}/${s.punches}`.padStart(15)}  ${String(s.blocks).padStart(6)}  ` +
        `${(s.approach / count).toFixed(2).padStart(8)}  ${(s.inside / count).toFixed(2).padStart(8)}  ` +
        `${(s.retreat / count).toFixed(2).padStart(7)}  ${(s.damage / count).toFixed(1).padStart(11)}  ` +
        `${`${s.wins}W/${s.deaths}L`.padStart(7)}  ${(s.duration / count).toFixed(1).padStart(8)}`,
      );
    }
  }
}

// ---- the golem's mind -------------------------------------------------------

/**
 * A golem bout is on the supported carrier, and it has to be asked for by name.
 *
 * `runBout` defaults `locomotionMode` to legacy on purpose -- every Warrior figure in
 * `docs/measurements.md` was taken there and a bench that quietly switched would move all of them.
 * A golem's locomotion *is* the physical V1 port, and `stepControlledPair` refuses a pair where
 * only one side has one, so a golem cell that forgot this line would not produce a wrong number:
 * it throws "supported locomotion pair construction produced only one physical V1 port" before the
 * first frame. That refusal is the reason this is a constant rather than a habit.
 */
const GOLEM_LOCOMOTION_MODE = "supported";

const SWORD = { primary: "sword", secondary: "empty" };

/** One side of a golem cell: a unit, a policy, and a build if the unit is a golem. */
const golemSide = (policy, golem) => ({ unit: "golem", policy, golem, loadout: undefined });
const warriorSide = (policy) => ({ unit: "warrior", policy, golem: undefined, loadout: SWORD });

/**
 * N side-swapped bouts of one pairing, reported per *side role* rather than per policy name.
 *
 * `runMatchup` above keys its statistics by policy name, which is exactly right when both corners
 * are Warriors and is wrong here twice over: a mirror golem cell has one name on both sides, and a
 * build sweep pits `golem-duelist` against `golem-duelist` with two different bodies under them.
 * What a reader of this section wants to know is what the *left role* did, so the roles carry the
 * labels and the swap is undone when the record is filed.
 */
function runGolemCell(a, b, count, seed) {
  const stats = Object.fromEntries([a, b].map((role) => [role.label, {
    wins: 0, damage: 0, hits: 0, severs: 0, vitality: 0, driven: [],
  }]));
  let drawn = 0;
  const seconds = [];
  for (let i = 0; i < count; i += 1) {
    const swapped = i % 2 === 1;
    const left = swapped ? b : a;
    const right = swapped ? a : b;
    const seeds = [seedFor(seed, i, swapped ? 1 : 0), seedFor(seed, i, swapped ? 0 : 1)];
    const ends = { left: 1, right: 1 };
    const result = runBout({
      left: left.policy, right: right.policy,
      leftUnit: left.unit, rightUnit: right.unit,
      leftGolem: left.golem, rightGolem: right.golem,
      leftLoadout: left.loadout, rightLoadout: right.loadout,
      locomotionMode: GOLEM_LOCOMOTION_MODE,
      seeds,
      onSample(sample) {
        ends.left = sample.left.view.self.vitality;
        ends.right = sample.right.view.self.vitality;
      },
    });
    seconds.push(result.seconds);
    if (result.winner === null) drawn += 1;
    for (const [side, role] of [["left", left], ["right", right]]) {
      const into = stats[role.label];
      const record = result[side];
      into.damage += record.damage;
      into.hits += record.hits;
      into.severs += record.severs;
      into.vitality += ends[side];
      into.driven.push(record.peakTipDriven);
      if (result.winner === side) into.wins += 1;
    }
  }
  return { stats, drawn, seconds };
}

const golemRow = (cell, role, stats, count) =>
  `  ${cell.padEnd(30)} ${role.padEnd(16)} ` +
  `${String(stats.wins).padStart(4)}/${count}  ` +
  `${(stats.damage / count).toFixed(1).padStart(11)}  ` +
  `${(stats.hits / count).toFixed(1).padStart(8)}  ` +
  `${String(stats.severs).padStart(6)}  ` +
  `${(stats.vitality / count).toFixed(3).padStart(7)}  ` +
  `${span(stats.driven).padStart(19)}`;

const GOLEM_COLUMNS =
  "  cell                           role              wins  damage/bout  contacts  severs  bar end  peak tip driven m/s";

/**
 * The one-slot variations of the default build.
 *
 * "Each accepted build" is a cross product of three locomotion modules, two torsos, two heads and
 * every chain-terminal pair in both sockets, which is four figures of bouts and would say nothing
 * a reader could hold. One slot moved at a time from the default *is* the comparison the sweep is
 * for: it attributes a difference to the module that was changed, which the cross product cannot
 * do. Every candidate goes through `golemSetupRefusal` rather than being trusted, so a pair the
 * registry stops offering drops out of this table instead of throwing in the middle of a run.
 */
function golemVariants(base) {
  const out = [];
  const push = (label, setup) => {
    if (golemSetupRefusal(setup) === null) out.push({ label, setup });
  };
  for (const option of golemLocomotionOptions()) {
    if (option.id !== base.locomotion) push(option.id, { ...base, locomotion: option.id });
  }
  for (const option of golemTorsoOptions()) {
    if (option.id !== base.torso) push(option.id, { ...base, torso: option.id });
  }
  for (const option of golemHeadOptions()) {
    if (option.id !== base.head) push(option.id, { ...base, head: option.id });
  }
  for (const chain of golemChainOptions()) {
    if (chain.id === base.primary.chain) continue;
    const terminals = golemTerminalOptions(chain.id);
    // The base's own terminal where the chain still offers it, and the chain's first otherwise --
    // so a chain row differs from the default in the chain alone wherever that is possible.
    const terminal = terminals.some((option) => option.id === base.primary.terminal)
      ? base.primary.terminal : terminals[0]?.id;
    if (terminal === undefined) continue;
    push(`primary ${chain.id}+${terminal}`, { ...base, primary: { chain: chain.id, terminal } });
  }
  for (const terminal of golemTerminalOptions(base.primary.chain)) {
    if (terminal.id === base.primary.terminal) continue;
    // A two-socket terminal claims both sockets, so the secondary follows it rather than the build
    // being dropped. That is the reducer in `src/bout.ts`'s rule, restated where a build that never
    // went near the screen is made.
    const primary = { chain: base.primary.chain, terminal: terminal.id };
    const alone = { ...base, primary };
    push(`primary ${base.primary.chain}+${terminal.id}`,
      golemSetupRefusal(alone) === null ? alone : { ...base, primary, secondary: primary });
  }
  return out;
}

function reportGolemCells(count, seed) {
  const base = defaultGolemSetup();
  const cell = (label, a, b) => {
    const { stats, drawn, seconds } = runGolemCell(a, b, count, seed);
    for (const role of [a, b]) console.log(golemRow(label, role.label, stats[role.label], count));
    console.log(`  ${" ".repeat(30)} drawn at the cap ${drawn}/${count}, bout length ${span(seconds)} s`);
  };

  console.log(`\n=== the golem against the Warrior duelist -- ${count} side-swapped bouts per cell ===`);
  console.log(GOLEM_COLUMNS);
  for (const policy of ["idle", "golem-duelist"]) {
    // `idle` first and in the same run, because it is the control every golem number in
    // `docs/measurements.md` is read against and a control taken on another day in another
    // harness is not one. Session 08 recorded 0/8 either way at 55.13 damage a bout.
    cell(`golem ${policy} vs duelist`,
      { ...golemSide(policy, base), label: `golem ${policy}` },
      { ...warriorSide("duelist"), label: "warrior duelist" });
  }

  console.log(`\n=== the golem against itself -- ${count} bouts, the default build on both sides ===`);
  console.log(GOLEM_COLUMNS);
  cell("default vs default",
    { ...golemSide("golem-duelist", base), label: "golem A" },
    { ...golemSide("golem-duelist", base), label: "golem B" });

  const variants = golemVariants(base);
  console.log(`\n=== the default build against one changed slot -- ${count} side-swapped bouts per cell, ` +
    `${variants.length} variations ===`);
  console.log(GOLEM_COLUMNS);
  for (const variant of variants) {
    cell(variant.label,
      { ...golemSide("golem-duelist", base), label: "default" },
      { ...golemSide("golem-duelist", variant.setup), label: "variant" });
  }
}

function reportShieldArcherCells(count, seed) {
  console.log(`\n=== shields against archer -- ${count} side-swapped bouts per cell ===`);
  console.log("  defence     shots  plate contacts  wounds  damage  vitality  defender wins");
  for (const kind of ["shield", "buckler", "empty"]) {
    const totals = { shots: 0, plates: 0, wounds: 0, damage: 0, vitality: 0, wins: 0 };
    for (let i = 0; i < count; i += 1) {
      const archerSide = i % 2 === 0 ? "left" : "right";
      const defenderSide = archerSide === "left" ? "right" : "left";
      const seeds = [seedFor(seed, i, 0), seedFor(seed, i, 1)];
      let held = false; let vitality = 1;
      const archer = policyMind("archer", seeds[archerSide === "left" ? 0 : 1]);
      const trackedArcher = { name: archer.name, decide(view, dt) {
        const intent = archer.decide(view, dt);
        const drawing = intent[intent.actingHand].thrust;
        if (held && !drawing) totals.shots += 1;
        held = drawing;
        return intent;
      } };
      const defender = policyMind("duelist", seeds[defenderSide === "left" ? 0 : 1]);
      const loadout = { primary: "sword", secondary: kind };
      const result = runBout({
        left: archerSide === "left" ? "archer" : "duelist",
        right: archerSide === "right" ? "archer" : "duelist",
        seeds,
        leftMind: archerSide === "left" ? trackedArcher : defender,
        rightMind: archerSide === "right" ? trackedArcher : defender,
        leftLoadout: archerSide === "left" ? { primary: "bow", secondary: "empty" } : loadout,
        rightLoadout: archerSide === "right" ? { primary: "bow", secondary: "empty" } : loadout,
        onEvent(event) {
          if (event.side !== archerSide || event.report.weapon !== "arrow") return;
          if (event.blocked && event.report.key === `block:${kind}`) totals.plates += 1;
          if (!event.blocked && event.report.damage > 0) totals.wounds += 1;
        },
        onSample(sample) { vitality = sample[defenderSide].view.self.vitality; },
      });
      totals.damage += result[archerSide].damage;
      totals.vitality += vitality;
      if (result.winner === defenderSide) totals.wins += 1;
    }
    console.log(
      `  ${kind.padEnd(10)} ${String(totals.shots).padStart(5)}  ${String(totals.plates).padStart(14)}  ` +
      `${String(totals.wounds).padStart(6)}  ${(totals.damage / count).toFixed(1).padStart(6)}  ` +
      `${(totals.vitality / count).toFixed(3).padStart(8)}  ${String(totals.wins).padStart(13)}/${count}`,
    );
  }
}

// ---- entry ----------------------------------------------------------------

// Importers use the exact same real-solver harness. They opt out of this CLI
// tail before dynamically importing the module; Havok and the arena recipe
// above remain shared rather than being copied into a second benchmark.
if (process.env.SWORD_MEASURE_LIBRARY !== "1") {
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const bouts = Number(flag("bouts", 40));
const runSeed = Number(flag("seed", 20260823)) >>> 0;
const only = flag("only", null);
const verbose = has("verbose");

// Refused by name rather than ignored. `--checkpoint <path> --bouts 24` was the
// five-loadout route for an unregistered experiment, and session 17 deleted it
// with the standalone codec it loaded. A flag this bench silently drops is worse
// than one it never had: the command still runs, still prints a full policy
// table, and the table is of the scripted policies rather than of the
// checkpoint somebody meant to measure. Same rule as `ai:evaluate`'s refusal of
// `--split train`.
if (has("checkpoint")) {
  throw new Error("--checkpoint is no longer available: the standalone checkpoint codec and the five-loadout " +
    "experimental route went with session 17. A learned controller reaches a fight as a research artifact " +
    "through the blind tournament; see docs/measurements.md, \"Session 17 Stage A\".");
}

if (has("selftest")) {
  // Distribution runs deliberately share one fast module; reproducibility
  // checks do not. Session 11 found retained solver history after disposal, so
  // this isolates the two worlds just as the option evaluator does.
  const seeds = [seedFor(runSeed, 0, 0), seedFor(runSeed, 0, 1)];
  const first = runBout({ left: "duelist", right: "swinger", seeds, physics: await freshHavok() });
  const second = runBout({ left: "duelist", right: "swinger", seeds, physics: await freshHavok() });
  const same =
    first.winner === second.winner &&
    Math.abs(first.seconds - second.seconds) < 1e-9 &&
    Math.abs(first.left.peakTip - second.left.peakTip) < 1e-9;
  console.log(`first  ${first.seconds.toFixed(4)}s  ${first.text}  peak ${first.left.peakTip.toFixed(4)}`);
  console.log(`second ${second.seconds.toFixed(4)}s  ${second.text}  peak ${second.left.peakTip.toFixed(4)}`);
  console.log(same ? "the bench repeats itself" : "THE BENCH DOES NOT REPEAT ITSELF");
  process.exit(same ? 0 : 1);
}

const MATCHUPS = [
  ["swinger", "idle"],
  ["duelist", "swinger"],
  ["duelist", "duelist"],
];

const started = Date.now();

if (!only || only === "posture") {
  console.log("\n=== articulated trunk -- four corners, 5 simulated seconds each ===");
  console.log("  lean twist  waist peak mm  hand peak mm  limit occupancy  recovered mm  physics ms");
  for (const row of runPostureBench()) {
    console.log(
      `  ${String(row.lean).padStart(4)} ${String(row.twist).padStart(5)}  ` +
      `${row.peakWaistMm.toFixed(2).padStart(13)}  ${row.peakHandMm.toFixed(2).padStart(12)}  ` +
      `${(row.occupancy * 100).toFixed(1).padStart(14)}%  ${row.recoveredWaistMm.toFixed(2).padStart(12)}  ` +
      `${row.physicsMs.toFixed(1).padStart(10)}`,
    );
  }
  console.log("\n=== articulated crouch -- 2 simulated seconds each ===");
  console.log("  motion crouch  pelvis m  min foot mm  knee limits  hand peak mm  physics ms");
  for (const row of runCrouchBench()) {
    console.log(
      `  ${(row.moving ? "walk" : "stand").padEnd(6)} ${row.crouch.toFixed(2).padStart(6)}  ` +
      `${row.pelvis.toFixed(3).padStart(8)}  ${(row.minFoot * 1000).toFixed(1).padStart(11)}  ` +
      `${(row.kneeOccupancy * 100).toFixed(1).padStart(10)}%  ${row.peakHandMm.toFixed(1).padStart(12)}  ` +
      `${row.physicsMs.toFixed(1).padStart(10)}`,
    );
  }
}

if (!only || only === "swing") {
  const swings = runSwingBench({ seed: runSeed, seconds: 30 });
  console.log(`\n=== the swinger's stroke, against nothing -- ${swings.length} swings ===`);
  console.log(`  peak tip speed      ${span(swings)} m/s`);
  console.log(
    `  at or above referenceSpeed (${CONFIG.combat.referenceSpeed} m/s) in ` +
      `${swings.filter((peak) => peak >= CONFIG.combat.referenceSpeed).length}/${swings.length}`,
  );
}

for (const [a, b] of MATCHUPS) {
  if (only && only !== `${a}-${b}`) continue;
  report(runMatchup(a, b, bouts, runSeed, verbose));
}
if (!only || only === "fists") reportFistCells(bouts, runSeed);
if (!only || only === "shield-archer") reportShieldArcherCells(bouts, runSeed);
if (!only || only === "golem") reportGolemCells(bouts, runSeed);
console.log(`\nseed ${runSeed}, ${((Date.now() - started) / 1000).toFixed(1)} s of wall clock`);
}
