// The policy measurement harness: real bouts, real Havok, no browser.
//
//     npm run measure                    -- the stroke, then the three matchups
//     npm run measure -- --bouts 20      -- fewer, while you are iterating
//     npm run measure -- --only swing    -- the swinger's stroke on its own
//     npm run measure -- --only duelist-swinger --verbose
//     npm run measure -- --seed 777001   -- a second, independent corpus
//     npm run measure -- --selftest      -- one bout twice, to prove the bench
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
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics, LAYER, COLLIDES } from "../src/physics.ts";
import { Fighter, stepPair } from "../src/fighter.ts";
import { Combat } from "../src/combat.ts";
import { policyMind } from "../src/mind.ts";
import { advance, begin, selectScreen } from "../src/bout.ts";

const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME = 1 / 60;

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
const wasmPath = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

// One Havok module, many worlds. `new HavokPlugin(...)` creates its own world
// and disposing the scene frees it, so the wasm instance is shared and nothing
// crosses between bouts. `--selftest` is what says so rather than this comment:
// it runs one bout twice in the same process and asserts the two agree.
const havok = await HavokPhysics({ wasmBinary: await readFile(wasmPath) });

/**
 * The arena as the page builds it, less everything that only matters to an eye.
 *
 * The ground and the fourteen posts are here so that a fighter's bodies land on
 * the same indices in Havok's list that they do in the page. That is not
 * cosmetic: Havok's solver is iterative, and session 04 measured the arm's peak
 * transient moving 9.5 % purely from where its bodies sat in that list. What is
 * left out -- costumes, lights, shadows, the aim indicator, the post-processing
 * pipeline -- creates no body and no constraint.
 *
 * Even so, **a number from this bench is not comparable with a number from the
 * page**, and session 04's close-out is emphatic about it: the two harnesses
 * disagree by about 9 % on the arm's peak transient with identical code, and why
 * is not established. Every figure this file prints is a figure taken here.
 */
function buildArena() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, havok);
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);

  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"),
    cloth: mat("cloth"),
    steel: mat("steel"),
    leather: mat("leather"),
    brass: mat("brass"),
    hide: mat("hide"),
    wood: mat("wood"),
  };

  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  const groundBody = new PhysicsAggregate(
    ground,
    PhysicsShapeType.BOX,
    { mass: 0, friction: 0.9, restitution: 0.02 },
    scene,
  );
  groundBody.shape.filterMembershipMask = LAYER.WORLD;
  groundBody.shape.filterCollideMask = COLLIDES.WORLD;

  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const post = MeshBuilder.CreateCylinder(
      `post${i}`,
      { height: 1.5, diameter: 0.17, tessellation: 8 },
      scene,
    );
    post.position.set(Math.sin(angle) * 9.5, 0.75, Math.cos(angle) * 9.5);
    const body = new PhysicsAggregate(post, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD;
    body.shape.filterCollideMask = COLLIDES.WORLD;
  }

  return { engine, scene, materials };
}

/**
 * A seed per policy per bout, from the run's own seed and the bout number.
 *
 * Two policies in one bout must not share a stream, or a mirror match is two
 * fighters doing the same thing at the same instant forever; and bout N must be
 * reproducible from the run seed alone, so that a surprising outcome can be
 * replayed rather than argued about. Splitmix64's finaliser on a mixed integer,
 * which is enough for what it is being asked to do.
 */
function seedFor(runSeed, bout, slot) {
  let x = (runSeed ^ Math.imul(bout + 1, 0x9e3779b9) ^ Math.imul(slot + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** Everything one side of one bout is worth remembering. */
function sideRecord(policy) {
  return {
    policy,
    /**
     * Fastest the point of its blade ever went, m/s, sampled every substep.
     *
     * Two of them, because the raw number is not the one the claim is about. A
     * blade that is *struck* -- by the other blade, by a body it glances off, or
     * by the floor once the arm carrying it has been cut off -- spins far faster
     * than any motor could drive it: measured peaks over 100 m/s, against a grip
     * whose ceiling puts a driven swing in the twenties. `driven` therefore
     * gates the sample on the fighter still having its arm and on neither side
     * having registered a contact in the last quarter second, which is what
     * "peak tip speed of its swing" has to mean if it is to say anything about
     * whether the policy can cut. The raw figure is kept beside it rather than
     * thrown away, because the difference between the two is itself worth
     * seeing.
     */
    peakTip: 0,
    peakTipDriven: 0,
    /** Edge alignment of every contact the damage model scored, 0..1. */
    alignments: [],
    /**
     * Speed of the blade at each of those contacts, m/s.
     *
     * The number the damage model actually consumes, and the second reading of
     * the tip-speed claim: a policy whose blade is going 11 m/s when it bites is
     * doing full damage whatever its peak was between blows.
     */
    speeds: [],
    hits: 0,
    damage: 0,
    severs: 0,
  };
}

/**
 * One bout, from the setup screen to the banner.
 *
 * The loop is `src/main.ts`'s, with the render half taken out: `stepPair` on the
 * physics observable at 240 Hz, `Combat.advance` and `bout.advance` once per
 * rendered frame at 60. The two clocks matter -- a `HitReport`'s timestamp and
 * the bout's cap have to be the same clock, which they are only because both are
 * counted in frames.
 */
function runBout({ left: leftPolicy, right: rightPolicy, seeds }) {
  const { engine, scene, materials } = buildArena();
  const F = CONFIG.fighter;

  const left = new Fighter(
    scene,
    { side: "left", origin: Vector3.Zero(), facing: 0, mind: policyMind(leftPolicy, seeds[0]) },
    materials,
  );
  const right = new Fighter(
    scene,
    {
      side: "right",
      origin: new Vector3(0, 0, F.separation),
      facing: Math.PI,
      mind: policyMind(rightPolicy, seeds[1]),
    },
    materials,
  );

  const sides = [
    // `weapons`, not `sword`: a fighter has two hands and `Combat` watches all
    // of what is in them. This said `left.sword` until the hands were split, and
    // a `Combat` handed one weapon where it wanted a list threw on construction
    // -- which is to say `npm run measure` has not run since.
    { fighter: left, combat: new Combat("left", left.weapons), record: sideRecord(leftPolicy), last: null },
    { fighter: right, combat: new Combat("right", right.weapons), record: sideRecord(rightPolicy), last: null },
  ];
  sides[0].combat.attach(right);
  sides[1].combat.attach(left);

  // Sampled here rather than after the frame, because `observe` republishes the
  // view once per solver substep and the peak of a swing lives inside a frame:
  // reading it at 60 Hz misses up to three quarters of the samples that matter.
  /** Seconds after any contact during which no blade counts as driven. */
  const SETTLE = 0.25;
  /**
   * Seconds at the top of a bout during which no blade counts as driven.
   *
   * Both arms are built hanging straight down and the anchor keyframes itself
   * onto the commanded pose on the very first control step, so the grip drags
   * the hand and a 1.35 kg lever from the hip to the guard in one substep. That
   * snap takes the point of the blade to **77 m/s** in a fighter that never
   * swings at all -- `idle`'s figure, and identical to within 3 m/s across every
   * bout, which is the tell that it is construction and not tactics. It is real,
   * and the page does it too the moment you press Fight, but it is not a swing
   * and counting it would answer the tip-speed claim with an artefact.
   */
  const WARMUP = 0.6;

  scene.onBeforePhysicsObservable.add(() => {
    const now = sides[0].combat.now;
    stepPair(left, right, FIXED, now);
    const struck = Math.max(
      sides[0].combat.lastHit ? sides[0].combat.lastHit.at : -Infinity,
      sides[1].combat.lastHit ? sides[1].combat.lastHit.at : -Infinity,
    );
    const quiet = now > WARMUP && now - struck > SETTLE;
    for (const side of sides) {
      const speed = side.fighter.view.self.tipSpeed;
      if (speed > side.record.peakTip) side.record.peakTip = speed;
      if (quiet && side.fighter.armed && speed > side.record.peakTipDriven) {
        side.record.peakTipDriven = speed;
      }
    }
  });

  // Exactly the matchup the setup screen would hand `main.ts`, driven through
  // the same two transitions, so the bout this bench runs is the bout the page
  // runs and not a second implementation of one.
  const matchup = {
    left: { unit: "warrior", policy: leftPolicy, control: "mind" },
    right: { unit: "warrior", policy: rightPolicy, control: "mind" },
  };
  let state = begin(selectScreen(matchup), matchup);
  const ring = () => ({
    left: { parts: left.limbs, lastBlow: sides[0].combat.lastHit },
    right: { parts: right.limbs, lastBlow: sides[1].combat.lastHit },
  });

  // Contacts are drained by identity rather than by timestamp. `Combat` stamps
  // every report in one frame with the same clock, so "newer than the last one I
  // saw" cannot tell two of them apart; where the previous head sits in the log
  // can.
  const drain = (side) => {
    const log = side.combat.log;
    if (log.length === 0) return;
    const seen = side.last ? log.indexOf(side.last) : -1;
    const fresh = seen === -1 ? log.slice() : log.slice(0, seen);
    for (const hit of fresh) {
      side.record.hits += 1;
      side.record.damage += hit.damage;
      if (hit.severed) side.record.severs += 1;
      // `weak` is a contact below `combat.minCutSpeed`, which the model does not
      // compute an alignment for at all -- it reports a hard zero. Folding those
      // in would measure how often a blade brushed something, not how well it
      // was turned when it bit.
      if (hit.kind !== "weak") {
        side.record.alignments.push(hit.edgeAlignment);
        side.record.speeds.push(hit.speed);
      }
    }
    side.last = log[0];
  };

  // One frame more than the cap can need, so a rule that stopped ending bouts
  // shows up as a hang in the harness rather than as an infinite loop.
  const limit = Math.ceil((CONFIG.bout.capSeconds + 1) * 60);
  let frames = 0;
  while (state.phase === "fight" && frames < limit) {
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(1000 * FRAME);
    for (const side of sides) side.combat.advance(FRAME);
    for (const side of sides) drain(side);
    state = advance(state, ring(), FRAME);
    frames += 1;
  }

  const outcome = state.outcome ?? { winner: null, ending: "time", text: "unfinished" };
  const result = {
    winner: outcome.winner,
    ending: outcome.ending,
    text: outcome.text,
    seconds: state.clock,
    left: sides[0].record,
    right: sides[1].record,
  };

  for (const side of sides) side.combat.dispose();
  left.dispose();
  right.dispose();
  scene.dispose();
  engine.dispose();
  return result;
}

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
   * `FighterView` grew hands -- exactly as `tests/minds.test.mjs`'s fixture did.
   * The two are the only hand-written views in the tree and they fail the same
   * way, which is worth knowing before writing a third.
   *
   * The loadout is the fighter's below: a sword in the primary and nothing in
   * the other hand. `shoulder` is the body's for both, which is the same
   * simplification the rest of this phantom makes.
   */
  const bothHands = (shoulder, tip, sign) => ({
    primary: {
      weapon: "sword", shoulder, tip, tipSpeed: 0, lost: false, outboard: 1,
    },
    secondary: {
      weapon: "empty",
      shoulder,
      tip: new Vector3(shoulder.x, shoulder.y, shoulder.z + sign * CONFIG.arm.reachNeutral),
      tipSpeed: 0,
      lost: false,
      outboard: -1,
    },
  });
  const mySocket = new Vector3(0, 1.42, 0);
  const theirSocket = new Vector3(0, 1.42, at);
  const myTip = new Vector3(0, 1.42, 1.3);
  const theirTip = new Vector3(0, 1.42, at - 1.3);
  const phantom = {
    self: {
      ground: new Vector3(0, 0, 0),
      facing: 0,
      shoulder: mySocket,
      tip: myTip,
      tipSpeed: 0,
      hands: bothHands(mySocket, myTip, 1),
      reach: CONFIG.arm.reachNeutral,
      health: whole(),
    },
    opponent: {
      ground: new Vector3(0, 0, at),
      facing: Math.PI,
      shoulder: theirSocket,
      tip: theirTip,
      tipSpeed: 0,
      hands: bothHands(theirSocket, theirTip, -1),
      health: whole(),
    },
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
    const roll = asked[asked.driving].roll;
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
  const endings = { beaten: 0, time: 0 };

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

  return { a, b, bouts, wins, seconds, stats, endings };
}

function report(run) {
  const { a, b, bouts, wins, seconds, stats, endings } = run;
  const mirror = a === b;
  console.log(`\n=== ${a} vs ${b} -- ${bouts} bouts ===`);
  if (mirror) {
    console.log(`  decided ${endings.beaten}/${bouts}, drawn at the cap ${endings.time}/${bouts}`);
  } else {
    const pct = (n) => `${((n / bouts) * 100).toFixed(1)} %`;
    console.log(`  ${a} ${wins[a]}/${bouts} = ${pct(wins[a])}   ` +
      `${b} ${wins[b]}/${bouts} = ${pct(wins[b])}   draw ${wins.draw}/${bouts} = ${pct(wins.draw)}`);
  }
  console.log(`  bout length, s      ${span(seconds)}`);
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

// ---- entry ----------------------------------------------------------------

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

if (has("selftest")) {
  // The bench shares one Havok module across every world it builds, which is
  // the whole of why it is fast enough for a distribution. This is what says
  // that sharing costs nothing: the same bout, twice, in one process.
  const seeds = [seedFor(runSeed, 0, 0), seedFor(runSeed, 0, 1)];
  const first = runBout({ left: "duelist", right: "swinger", seeds });
  const second = runBout({ left: "duelist", right: "swinger", seeds });
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
console.log(`\nseed ${runSeed}, ${((Date.now() - started) / 1000).toFixed(1)} s of wall clock`);
