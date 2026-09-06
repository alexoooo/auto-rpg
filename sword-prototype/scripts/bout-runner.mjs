// The bout runner: one real bout under real Havok, headless, from the setup screen to the banner.
//
// Extracted from `scripts/measure.mjs` on 2026-09-06 so that the tournament
// (`scripts/tournament.mjs`, one of these per worker thread) and the measure run the
// *same* bout rather than two implementations of one. Nothing in here moved when it
// moved: the measure's golem section was rerun before and after the extraction and
// printed the same tables to the digit. Tests import it through `scripts/measure.mjs`,
// which re-exports `freshHavok` and `runBout`, so nothing that already used the bench
// as a library had to change.
//
// Everything here obeys the two traps that have already cost this directory time. It
// never calls `scene.render()` to drive the world -- `getDeltaTime()` is near zero
// between immediate calls and the simulation crawls -- and it advances
// `scene._renderId` once per simulated frame, because Babylon's world-matrix cache is
// keyed on it and a harness that never renders otherwise freezes every matrix at its
// first sample. The readings it takes are `Fighter.view`'s, which are cache-free by
// construction and are the ones the policies are actually being shown.
//
// **The bout cap is the caller's.** `runBout` defaults `maxSeconds` to
// `CONFIG.bout.capSeconds`, which the page sets to 600 and the measure sets to 60 at
// the top of its own file, where the argument for 60 lives. A caller that wants a cap
// passes one; this module sets none.
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
import { ROOM_WALL_COLLIDERS } from "../src/arena-room.ts";
import { Fighter, stepPair } from "../src/fighter.ts";
import { isArticulatedCombatant, policyForUnit, unitDefinition } from "../src/units.ts";
import { Combat } from "../src/combat.ts";
import { policyMind } from "../src/mind.ts";
import { advance, begin, selectScreen } from "../src/bout.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { BoutRecorder, ENGAGEMENT_INSTRUMENT_VERSION, combatRecorder, sampleBoutRecorder,
  wireBoutRecorder } from "../src/recorder.ts";

export const FIXED = 1 / CONFIG.world.physicsHz;
export const FRAME = 1 / 60;

const wasmPath = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

// The ordinary benchmark shares one Havok module because it measures throughput.
// We previously claimed disposed worlds made repeated bouts independent. The
// session-11 specialist/meta brackets disproved that claim: allocator/solver history
// could flip a winner even though every command was equal. Comparisons which
// promise same-input parity therefore request `freshHavok()` per bout below.
export const havok = await HavokPhysics({ wasmBinary: await readFile(wasmPath) });
/** A separate wasm instance for comparisons which must not inherit allocator/solver history. */
export async function freshHavok() {
  return HavokPhysics({ wasmBinary: await readFile(wasmPath) });
}

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
export function buildArena(physics = havok) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, physics);
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
    arrowAccent: mat("arrow-accent"),
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

  for (const wall of ROOM_WALL_COLLIDERS) {
    const mesh = MeshBuilder.CreateBox(wall.name, {
      width: wall.width, height: wall.height, depth: wall.depth,
    }, scene);
    mesh.position.set(...wall.position);
    const body = new PhysicsAggregate(mesh, PhysicsShapeType.BOX,
      { mass: 0, friction: 0.3, restitution: 0.05 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD;
    body.shape.filterCollideMask = COLLIDES.WORLD;
  }

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
export function seedFor(runSeed, bout, slot) {
  let x = (runSeed ^ Math.imul(bout + 1, 0x9e3779b9) ^ Math.imul(slot + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** Everything one side of one bout is worth remembering. */
export function sideRecord(policy) {
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
    punches: 0,
    blocks: 0,
    damage: 0,
    severs: 0,
    punchAttempts: 0,
    approach: 0,
    insidePunchRange: 0,
    retreatTime: 0,
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
export function runBout({
  left: leftPolicy, right: rightPolicy, seeds, leftLoadout, rightLoadout,
  leftUnit = "warrior", rightUnit = "warrior",
  leftGolem = undefined, rightGolem = undefined,
  locomotionMode = undefined,
  leftMind = null, rightMind = null, onSample = null, onEvent = null,
  onVerdict = null, postVerdictFrames = 0, postVerdictActionProbe = false, physics = havok,
  maxSeconds = CONFIG.bout.capSeconds,
}) {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) {
    throw new Error("runBout maxSeconds must be a positive finite number");
  }
  const { engine, scene, materials } = buildArena(physics);
  const F = CONFIG.fighter;

  // **`locomotionMode` is opt-in and its default is unchanged**, which is the whole of why it is a
  // parameter rather than something derived here. `src/main.ts` computes it from the pair, and a
  // bench that did the same would move every Warrior-versus-Warrior number in
  // `docs/measurements.md` from legacy locomotion onto the supported carrier -- a change to shared
  // execution-layer code with no bout either side of it, which is the one thing `AGENTS.md` says
  // must not happen quietly. A golem's locomotion *is* the physical supported port, so a bout with
  // one in it passes "supported" and gets a Warrior on the same carrier; `stepControlledPair`
  // refuses a pair where only one side has a physical V1 port, which is the check that makes this
  // impossible to get half right.
  const locomotionWorld = locomotionMode === "supported" ? flatSupportedWorldRegistry() : undefined;

  const left = unitDefinition(leftUnit).build({
      scene,
      side: "left", origin: Vector3.Zero(), facing: 0,
      mind: leftMind ?? policyMind(policyForUnit(leftUnit, leftPolicy), seeds[0]), loadout: leftLoadout,
      golem: leftGolem,
      materials,
      locomotionMode,
      locomotionWorld,
    });
  const right = unitDefinition(rightUnit).build({
      scene,
      side: "right",
      origin: new Vector3(0, 0, F.separation),
      facing: Math.PI,
      mind: rightMind ?? policyMind(policyForUnit(rightUnit, rightPolicy), seeds[1]),
      loadout: rightLoadout,
      golem: rightGolem,
      materials,
      locomotionMode,
      locomotionWorld,
    });

  const leftRecord = sideRecord(leftPolicy);
  const rightRecord = sideRecord(rightPolicy);
  const recorder = new BoutRecorder();
  wireBoutRecorder(recorder, left, right);
  const sides = [
    // `weapons`, not `sword`: a fighter has two hands and `Combat` watches all
    // of what is in them. This said `left.sword` until the hands were split, and
    // a `Combat` handed one weapon where it wanted a list threw on construction
    // -- which is to say `npm run measure` has not run since.
    { fighter: left, combat: new Combat("left", left.strikers,
      combatRecorder(recorder, "left", (event) => onEvent?.({ side: "left", ...event }))), record: leftRecord, last: null },
    { fighter: right, combat: new Combat("right", right.strikers,
      combatRecorder(recorder, "right", (event) => onEvent?.({ side: "right", ...event }))), record: rightRecord, last: null },
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

  let decided = false;
  scene.onBeforePhysicsObservable.add(() => {
    const now = sides[0].combat.now;
    if (decided) {
      left.stepProjectiles(FIXED);
      right.stepProjectiles(FIXED);
      // Opt-in safety probe only. Ordinary decided worlds keep aging their
      // projectiles without returning to the body update seam. A tournament
      // tail asks that seam again after `stopFighting`: a correctly revoked
      // body returns before its mind, while a missing revocation emits a real
      // post-verdict command for the observer to reject.
      if (postVerdictActionProbe) stepPair(left, right, FIXED, now);
    } else {
      stepPair(left, right, FIXED, now);
      sampleBoutRecorder(recorder, left, right, FIXED, now);
    }
    // The records ride along so a sampler can read damage dealt as it stands; the tournament
    // worker's exchange log (Session 06 of the matchup set) is the one that does.
    if (onSample) onSample({ left, right, dt: FIXED, clock: now, records: { left: leftRecord, right: rightRecord } });
    const struck = Math.max(
      sides[0].combat.lastHit ? sides[0].combat.lastHit.at : -Infinity,
      sides[1].combat.lastHit ? sides[1].combat.lastHit.at : -Infinity,
    );
    const quiet = now > WARMUP && now - struck > SETTLE;
    for (const side of sides) {
      const speed = side.fighter.view.self.tipSpeed;
      if (speed > side.record.peakTip) side.record.peakTip = speed;
      if (quiet && (!isArticulatedCombatant(side.fighter) || side.fighter.armed) && speed > side.record.peakTipDriven) {
        side.record.peakTipDriven = speed;
      }
    }
  });

  // Exactly the matchup the setup screen would hand `main.ts`, driven through
  // the same two transitions, so the bout this bench runs is the bout the page
  // runs and not a second implementation of one.
  const matchup = {
    left: { unit: leftUnit, policy: leftPolicy, control: "mind", golem: leftGolem },
    right: { unit: rightUnit, policy: rightPolicy, control: "mind", golem: rightGolem },
  };
  let state = begin(selectScreen(matchup), matchup);
  const ring = () => ({
    left: { parts: left.limbs, lastBlow: sides[0].combat.lastWound },
    right: { parts: right.limbs, lastBlow: sides[1].combat.lastWound },
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
      if (hit.weapon === "empty" && hit.damage > 0) side.record.punches += 1;
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
  const limit = Math.ceil((maxSeconds + 1) * 60);
  let frames = 0;
  while (state.phase === "fight" && state.clock < maxSeconds && frames < limit) {
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(1000 * FRAME);
    for (const side of sides) side.combat.advance(FRAME);
    for (const side of sides) drain(side);
    const before = state.phase;
    state = advance(state, ring(), FRAME);
    if (before === "fight" && state.phase === "over") {
      decided = true;
      left.stopFighting();
      right.stopFighting();
      for (const side of sides) side.combat.stop();
      // The opt-in tail probes command revocation, not behaviour recording.
      // Its samples are outside the decided bout, so release the recorder seam
      // before revisiting `update`; the tracked mind / tournament wrapper is
      // the authority observer here.
      if (postVerdictActionProbe) { left.intentObserver = null; right.intentObserver = null; }
      onVerdict?.();
    }
    frames += 1;
  }

  // Tests may keep the decided world alive for a few render frames, just as the
  // browser does beneath its verdict banner. The default remains the measured
  // bout itself. With `postVerdictActionProbe`, this tail also revisits the body
  // update seam so revocation is observed rather than inferred from this loop.
  for (let frame = 0; frame < postVerdictFrames; frame += 1) {
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(1000 * FRAME);
    for (const side of sides) side.combat.advance(FRAME);
  }

  const outcome = state.outcome ?? { winner: null, ending: "time", text: "unfinished" };
  leftRecord.blocks = recorder.records.left.blocks;
  rightRecord.blocks = recorder.records.right.blocks;
  const result = {
    winner: outcome.winner,
    ending: outcome.ending,
    text: outcome.text,
    deathRegion: outcome.blow?.limb ?? "none",
    seconds: state.clock,
    left: sides[0].record,
    right: sides[1].record,
    behaviour: recorder.records,
    engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
  };

  for (const side of sides) side.combat.dispose();
  left.dispose();
  right.dispose();
  scene.dispose();
  engine.dispose();
  return result;
}
