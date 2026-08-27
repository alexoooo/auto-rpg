import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "./config";
import { horizontalForward, orbitFraming } from "./camera";
import { buildArena } from "./arena";
import { refreshShadowCasters, type RoomOcclusionTarget } from "./arena-room";
import { Fighter, stepPair } from "./fighter";
import { prepareWarriorFigure } from "./figure";
import { Arrow } from "./arrow";
import { Combat } from "./combat";
import { Hud } from "./hud";
import { Controls } from "./input";
import { AimIndicator } from "./aim";
import { Takeover, Targeting } from "./targeting";
import { RigView } from "./rigview";
import { Blood } from "./blood";
import { advanceFight, FightEnd } from "./fight-end";
import { BoutRecorder, ENGAGEMENT_INSTRUMENT_VERSION, combatRecorder, sampleBoutRecorder,
  wireBoutRecorder } from "./recorder";
import { advanceActiveHostTimers, ArenaPresentation, pauseHost, restartHost, resumeHost,
  runActiveHostFrame, type RunningHost } from "./host-run";
import { SetupScreen } from "./setup";
import { GuidedPlaytest } from "./playtest";
import type { Side } from "./physics";
import {
  HANDS,
  cursorForPose,
  handover,
  humanMind,
  policyMind,
  poseShiftMm,
  splitMind,
  type ArmPose,
  type Mind,
} from "./mind";
import { isArticulatedCombatant, loadoutForUnit, policyForUnit, unitDefinition, type Combatant } from "./units";
import { metaDiagnostic } from "./learning/meta";
import { engagementGates, engagementMetrics, formatEngagementGateTable } from "./learning/gates";
import { loadChampionSoFarMind, requireLiveResearchBout, type ChampionSource } from "./learning/deployment";
import {
  begin,
  defaultMatchup,
  humanSide,
  pauseAction,
  selectScreen,
  takeBody,
  toSelect,
  type Matchup,
  type Ring,
  type SideSetup,
} from "./bout";

/**
 * Where the point of a fighter's primary weapon is, or its fist if it has none.
 *
 * The takeover readings are millimetre comparisons across one control step, and
 * a hand holding nothing still has a place -- so this answers with the knuckles
 * rather than refusing. Every call allocates, and every call is on a takeover
 * rather than in a loop.
 */
const tipOf = (fighter: Fighter): Vector3 =>
  fighter.sword
    ? fighter.sword.tipPositionToRef(new Vector3())
    : fighter.hand.mesh.position.clone();

const need = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
};

/**
 * Whom the camera follows.
 *
 * `placeCamera` takes one of these rather than closing over one fighter, because
 * session 07 hands the player either fighter mid-bout and the camera has to go
 * with them: as a parameter that is a change at the call site, and as a closure
 * it is a refactor. It is written as the slice of a fighter the camera actually
 * reads -- a facing it does not own, and a point on the ground it follows -- so
 * anything else shaped like a fighter satisfies it without having to be one.
 */
type CameraSubject = Combatant;

const MODE_TEXT: Record<string, string> = {
  free: "",
  selecting: "SELECT TARGET &mdash; click an enemy, or L to cancel",
  locked: "LOCKED &mdash; strafe to circle, Q/E to break",
};

/** The takeover's own level, worded to match `SELECT TARGET` because it is the
 *  same gesture with a wider choice. */
const TAKE_TEXT = "TAKE A BODY &mdash; click either fighter, or C to cancel";

/** The nudge that says the gesture above exists. See `hintLeft`. */
const HINT_TEXT = "C to take a body &mdash; either one, at any point in the fight";

/** Which hand the mouse just moved to. `F` swaps; the other goes to its policy. */
const HAND_A_TEXT = "MOUSE ON THE PRIMARY HAND &mdash; F to swap";
const HAND_B_TEXT = "MOUSE ON THE SECONDARY HAND &mdash; F to swap";

/**
 * One body changing hands, and what the change cost.
 *
 * Both figures are millimetres and both are taken across the first control step
 * after the swap, which is the step the plan's acceptance calls the takeover
 * frame. They are two different questions and only one of them has a threshold.
 *
 * `commandMm` is the hand's *commanded* position, in the torso's own frame,
 * before and after -- so it is the discontinuity the handover introduced and
 * nothing else. A blade mid-swing legitimately moves 42 mm in a single 240 Hz
 * substep, and both policies sweep the cursor fast enough to move the commanded
 * point by a millimetre or two in the same time, so this is the reading that can
 * carry a 20 mm acceptance without arguing about what the fighter was doing at
 * the time. Unseeded, it is the width of whatever the cursor happened to be
 * across from the pose, and a full-envelope miss is around 700 mm.
 *
 * `tipMm` is how far the point of the blade actually went over that step, which
 * is the literal reading and is reported because somebody will want it -- but it
 * contains the swing as well as the handover and must not be compared against 20
 * mm unless the body was standing still. Take that one at rest.
 */
interface HandReading {
  side: Side;
  /** The mind that was driving, by name. */
  from: string;
  /** The mind that has it now, by the same. */
  to: string;
  /** False when there was no pose to seed from. `refused` says why. */
  seeded: boolean;
  refused: string | null;
  /** Both are NaN until the control step after the swap has filled them in. */
  commandMm: number;
  tipMm: number;
}

/** A takeover: the body taken, and the body given back, if there was one. */
interface TakeoverReading {
  /** Simulation seconds, on `Combat`'s clock -- the one `HitReport.at` uses. */
  at: number;
  taken: HandReading;
  released: HandReading | null;
}

async function boot(): Promise<void> {
  const canvas = need<HTMLCanvasElement>("stage");
  const curtain = need("curtain");
  const pauseMenu = need("pause-menu");
  const beginButton = need<HTMLButtonElement>("begin");
  const resumeButton = need<HTMLButtonElement>("resume");
  const restartButton = need<HTMLButtonElement>("restart");
  const leaveButton = need<HTMLButtonElement>("leave");
  const helpPanel = need("help");
  const helpClose = need<HTMLButtonElement>("help-close");
  const bootNote = need("boot-note");
  const modeLine = need("mode");
  const playtestLaunch = need<HTMLButtonElement>("guided-playtest");
  const playtestHost = need("playtest");

  beginButton.disabled = true;

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

  // buildArena brings up Havok before it creates any bodies, and fixes the
  // sub-step so that stiff joints carrying a heavy lever behave the same on a
  // 144 Hz monitor as on a 60 Hz one.
  const arena = await buildArena(engine);
  // A skinned fighter has to publish its real meshes at construction time:
  // picking, shadows and the rig overlay all keep those identities. Parse the
  // shared source while the arena is already waiting on startup work, then both
  // fighters and every rebuild instantiate it synchronously.
  await prepareWarriorFigure(arena.scene);

  // Babylon's own input manager cancels `pointerdown`, and cancelling that
  // suppresses every compatibility mouse event for the rest of the gesture. It
  // costs nothing to turn off here, and leaving it on makes any future
  // mouse-event listener mysteriously deaf while a button is held.
  arena.scene.preventDefaultOnPointerDown = false;
  arena.scene.preventDefaultOnPointerUp = false;

  /**
   * The bout, in two halves that are deliberately not in one file.
   *
   * `src/bout.ts` owns what a bout *is*: the matchup, the three phases, when it
   * is finished and who won, as plain data and pure functions that
   * `tests/bout.test.mjs` argues with without a DOM and without Babylon. This
   * file owns the arena that stands for it. The split is the one `scoring.ts`
   * already earns its keep with, and the test it buys is worth more than the
   * indirection costs: "when does a fight end" is a rule, and a rule you can
   * only check by starting a browser and waiting a minute is a rule nobody
   * checks.
   */
  let state = selectScreen(defaultMatchup());
  const setup = new SetupScreen(need("matchup"), state.matchup);
  let guidedPolicySeeds: Readonly<Record<Side, number>> | null = null;
  let guidedOriginalMatchup: Matchup | null = null;

  let playtest: GuidedPlaytest | null = null;
  const controls = new Controls(canvas, {
    onReset: () => {
      // `R` means "this bout again" in both live and decided arenas. Behind the
      // setup screen it means nothing because there is no bout to rebuild. Setup
      // is an explicit pause-overlay action, not a phase-dependent second
      // meaning for this key.
      restartBout({ resume: true });
    },
    onToggleReadout: () => hud.toggle(),
    onToggleRig: () => rigview.toggle(),
    onToggleCamera: () => {
      // A mode, not a rebuild: the camera object, the scene and the engine are
      // untouched and the next frame's goals simply move somewhere else. Nothing
      // here has to be told about it either -- `placeCamera` reads the mode every
      // frame, so a change made from the console lands the same way this does.
      const C = CONFIG.camera;
      C.mode = C.mode === "fixed" ? "overhead" : "fixed";
      announceCamera();
    },
    onRotateCamera: (direction: number) => {
      const C = CONFIG.camera;
      // Quiet under Overhead. The bearing would still turn, and the camera would
      // still ignore it, so the key would read as broken rather than as
      // inapplicable -- and the banner would have to explain the difference every
      // time. The curtain's key list says which camera the brackets belong to.
      if (C.mode !== "fixed") return;
      // Wrapped rather than allowed to accumulate, so the announcement stays
      // inside one turn of the circle and so the number is legible when it is read
      // back off `__sword.config`. The double modulo is what makes a leftward
      // press from zero come out at 315 degrees instead of at -45.
      const turn = Math.PI * 2;
      C.fixedBearing = (((C.fixedBearing + direction * C.bearingStep) % turn) + turn) % turn;
      announceCamera();
    },
    onPause: () => {
      // A toggle, and the same one the Resume button is: pause is an in-arena
      // mode, and the two ways of leaving it must agree about what resume means.
      //
      // The *rule* is `pauseAction` in `bout.ts`, with a test, because this hook
      // used to carry it inline and got it wrong in a way no test could see:
      // from `over` it ran `toSelect` on its way past, which put the character
      // selector over a fight that was still standing, and from `select` the
      // resume branch was then unreachable, so the key was dead. Both bugs were
      // the same mistake -- a key that pauses deciding to also abandon.
      const action = pauseAction(state.phase, controls.isActive);
      if (action === "pause" && playtest && !playtest.permitManualPause()) return;
      switch (action) {
        case "resume":
          resume();
          break;
        case "pause":
          pause();
          break;
        case "nothing":
          break;
      }
    },
    onPauseOnly: () => pause(),
    onToggleHelp: () => toggleHelp(),
    onToggleLock: () => targeting.toggle(),
    onSwapHands: () => {
      // The mouse has already changed hands by the time this runs -- `Controls`
      // moves `actingHand` itself, because the state is its own. What is left is
      // to seed the hand it has arrived at from the pose that hand is actually
      // in, exactly as a takeover does: the cursor is absolute, so a hand taken
      // over without seeding snaps to wherever the mouse happens to be at the
      // full 850 N the grip can pull.
      const fighter = yours();
      if (!isArticulatedCombatant(fighter)) return;
      if (!fighter.armed) return;
      const seed = cursorForPose(fighter.armPoses()[controls.state.actingHand], controls.state.actingHand);
      const hand = controls.state[controls.state.actingHand];
      hand.pointerX = seed.pointerX;
      hand.pointerY = seed.pointerY;
      hand.roll = seed.roll;
      hand.wristBend = seed.wristBend;
      handNotice = controls.state.actingHand === "primary" ? HAND_A_TEXT : HAND_B_TEXT;
      handLeft = CONFIG.camera.noticeSeconds;
    },
    onToggleTakeover: () => {
      if (playtest?.boutIsRunning) {
        playtest.refuseTakeover();
        return;
      }
      // Arming the takeover drops a target choice that was still open. Two armed
      // modes would be two breathing rings under one cursor and a click that had
      // to decide which of them it belonged to, and the honest answer to that is
      // to not be in the state. A *lock* is left alone: a lock is a level rather
      // than a question, it survives a handover, and dropping it every time
      // somebody thought about changing bodies would be a trap of exactly the
      // kind `Targeting` was written to avoid.
      if (targeting.status === "selecting") targeting.toggle();
      takeover.toggle();
    },
    onPrimaryDown: () => {
      // The takeover gets first refusal, and swallows the click whether or not
      // it landed on a body: a click that both missed a fighter and started a
      // thrust would be a swing nobody asked for, delivered at the one moment
      // the player was thinking about something else.
      if (takeover.isArmed) {
        const picked = takeover.pick();
        if (picked) takeBodyNow(picked === bout.left ? "left" : "right");
        return true;
      }
      return targeting.primaryDown();
    },
  });

  /**
   * You, as a mind like any other.
   *
   * It hands back `controls.state` and nothing else, so a fighter driven by a
   * person and a fighter driven by a policy are indistinguishable from inside
   * `Fighter` -- which is the whole of what session 07 needs, and the reason
   * taking over a body will be a pointer swap rather than a mode.
   */
  const you = humanMind(controls);

  /**
   * Who drives a side, and what drives the hand you are not using.
   *
   * A person gets `splitMind`: their own feet and their own cursor hand, and the
   * side's *own policy* on the other. Not a second policy chosen separately --
   * the one already picked for that corner, which is what that fighter becomes
   * the moment you step out of it. So the spare hand fights the way the whole
   * body would, and there is nothing new to choose on the screen.
   */
  const mindFor = (sideName: Side, side: SideSetup): Mind => {
    const seed = guidedPolicySeeds?.[sideName];
    return side.control === "you"
      ? splitMind(you, policyMind(policyForUnit(side.unit, side.policy), seed), controls.ownership)
      : policyMind(policyForUnit(side.unit, side.policy), seed);
  };

  /**
   * What a corner's two pickers mean to a body.
   *
   * Checked rather than asserted. `as WeaponKind` was a promise about a string
   * that arrived from a `<select>`, and the promise held only because every
   * question about a kind used to have a default -- an unrecognised one was
   * quietly "one-handed, not a shield, not a striking weapon" and got as far as
   * `Weapon`'s builder before anything objected. The questions are table lookups
   * now, so the same string is a `TypeError` from inside `handsFor` instead. An
   * empty hand is the honest thing to put in a hand whose contents nobody
   * recognises, and it is what the picker's own default already is.
   */
  const loadoutFor = (side: SideSetup) => loadoutForUnit(side.unit, side.handA, side.handB);

  /**
   * Two fighters of the same kind, facing each other, one `Combat` per side
   * pointed at the other's body, and a mind each.
   *
   * Built by a function and held in a `let` because the whole thing is replaced
   * -- both fighters, not just the one being hit -- whenever a bout starts or
   * restarts. That is the honest reset: a fight resumed with one side's wounds
   * still on it is not the same fight over again.
   */
  const buildBout = (matchup: Matchup) => {
    const F = CONFIG.fighter;
    const leftDefinition = unitDefinition(matchup.left.unit);
    const rightDefinition = unitDefinition(matchup.right.unit);
    const left = leftDefinition.build({
        scene: arena.scene,
        side: "left",
        origin: Vector3.Zero(),
        facing: 0,
        mind: mindFor("left", matchup.left),
        loadout: loadoutFor(matchup.left),
        materials: arena.materials,
      });
    const right = rightDefinition.build({
        scene: arena.scene,
        side: "right",
        origin: new Vector3(0, 0, F.separation),
        facing: Math.PI,
        mind: mindFor("right", matchup.right),
        loadout: loadoutFor(matchup.right),
        materials: arena.materials,
      });
    const leftStrikers = left.strikers;
    const rightStrikers = right.strikers;
    const recorder = new BoutRecorder();
    wireBoutRecorder(recorder, left, right);
    const sides = [
      { fighter: left, combat: new Combat("left", leftStrikers, combatRecorder(recorder, "left")) },
      { fighter: right, combat: new Combat("right", rightStrikers, combatRecorder(recorder, "right")) },
    ];
    // Each blade is pointed at the other body. The collision layers already say
    // the same thing in the solver; this says it again in the scoring.
    sides[0].combat.attach(right);
    sides[1].combat.attach(left);
    // Built once with the bout. Every point is a live Vector3 already owned by
    // a body or pooled arrow, so the render loop follows both fighters and the
    // actual projectile trace without minting a target list every frame.
    const occlusionTargets: RoomOcclusionTarget[] = [
      ...left.occlusionPoints().map((point) => ({ point })),
      ...right.occlusionPoints().map((point) => ({ point })),
    ];
    for (const striker of [...leftStrikers, ...rightStrikers]) {
      if (!(striker instanceof Arrow)) continue;
      const live = () => striker.live;
      const traced = () => striker.live && striker.trail.visibility > 0;
      occlusionTargets.push(
        { point: striker.root.position, active: live },
        { point: striker.tracePoints[0], active: traced },
        { point: striker.tracePoints[striker.tracePoints.length - 1], active: traced },
      );
    }
    return { left, right, sides, recorder, ending: new FightEnd(sides), occlusionTargets };
  };

  let bout = buildBout(state.matchup);

  /**
   * The fighter you are looking through, and the one opposite it.
   *
   * Asked as a question every time rather than held, because both answers move:
   * the bout is rebuilt on every start, and which side is yours is a property of
   * the matchup rather than of the arena. A guided policy control follows the
   * recorded actor even when it is on the right; otherwise that mirror would put
   * the page clock and frame evidence behind a different camera workload from
   * the matching human row. Outside the instrument, two policies still default
   * to the left one.
   */
  const observedSide = (): Side => playtest?.recordingSide ?? humanSide(state.matchup) ?? "left";
  const yours = (): Combatant => (observedSide() === "right" ? bout.right : bout.left);
  const theirs = (): Combatant => (observedSide() === "right" ? bout.left : bout.right);

  const ownPosture = need<HTMLInputElement>("own-posture");
  const ownWrist = need<HTMLInputElement>("own-wrist");
  const seedOwnedChannels = (): void => {
    const fighter = yours();
    controls.state.posture.crouch = fighter.view.self.crouch;
    controls.state.posture.trunkLean = fighter.view.self.trunkLean;
    controls.state.posture.trunkTwist = fighter.view.self.trunkTwist;
    if (!isArticulatedCombatant(fighter)) return;
    const poses = fighter.armPoses();
    for (const name of HANDS) {
      controls.state[name].roll = poses[name].roll;
      controls.state[name].wristBend = poses[name].wristBend;
    }
  };
  const updateOwnership = (): void => {
    seedOwnedChannels();
    controls.ownership.posture = ownPosture.checked;
    controls.ownership.drivenWrist = ownWrist.checked;
  };
  ownPosture.addEventListener("change", updateOwnership);
  ownWrist.addEventListener("change", updateOwnership);

  const hud = new Hud(need("hud"));
  const aim = new AimIndicator(arena.scene);
  const targeting = new Targeting(arena.scene, yours());
  targeting.attach(yours(), theirs());
  const takeover = new Takeover(arena.scene);
  takeover.attach(bout.left, bout.right);
  const rigview = new RigView(arena.scene);
  const attachRig = (): void => {
    if (isArticulatedCombatant(bout.left) && isArticulatedCombatant(bout.right)) {
      rigview.attach(bout.sides as { fighter: Fighter; combat: Combat }[]);
    } else {
      rigview.attach([]);
    }
  };
  attachRig();
  const blood = new Blood(arena.scene);
  refreshShadowCasters(arena.scene, arena.shadows);

  /**
   * The last blow each side had been told about, so the same one is not drawn
   * twice and none is missed.
   *
   * Not `combat.lastHit`, which is a single slot: two contacts inside one
   * rendered frame -- and at 240 Hz there are four control steps in a frame to
   * have them in -- leave only the newer, and the one that goes missing is as
   * likely as not the one that took an arm off. `Combat.log` keeps two dozen,
   * newest first, so walking it back to the last timestamp this saw is both
   * complete and bounded.
   */
  const drawn: Record<Side, number> = { left: -1, right: -1 };

  const drawBlood = (): void => {
    for (const side of bout.sides) {
      const seen = drawn[side.combat.side];
      let newest = seen;
      for (const report of side.combat.log) {
        if (report.at <= seen) break;
        if (report.at > newest) newest = report.at;
        blood.spray(report.point, report.velocity, report.damage);
        if (!report.severed) continue;
        const limb = side.combat.body?.limbs.find((part) => part.key === report.key);
        if (limb) blood.stump(limb.part.mesh, report.point);
      }
      drawn[side.combat.side] = newest;
    }
  };

  /**
   * Handover readings waiting for the first control step after their swap.
   *
   * They cannot be taken at the moment of the swap, because what is being
   * measured is what the *new* mind commands and nothing has asked it yet. A
   * swap happens inside a pointer event or a console call, so the next
   * `stepPair` is the takeover frame and there is exactly one of them to wait
   * for.
   */
  const pending: {
    fighter: Fighter;
    reading: HandReading;
    pose: ArmPose;
    tip: Vector3;
  }[] = [];
  /** The last dozen takeovers, so "five times in one bout" is a thing you can
   *  read rather than a thing you have to watch for. */
  const takeovers: TakeoverReading[] = [];

  /**
   * Both fighters again, from nothing, with whatever minds the matchup asks for.
   *
   * The overlay comes down *before* anything is disposed and goes back up after.
   * It holds handles on bodies and on constraints, and taking it down hands both
   * back -- doing that in the other order would have it hiding constraints that
   * had already been freed, which is the one thing its teardown path cannot
   * survive.
   *
   * The camera snaps rather than blends, which is the one other place in this
   * file that uses the snap path. Every body in the arena has just been replaced,
   * so there is no continuity to preserve -- and taking the right-hand fighter
   * would otherwise start the bout with the camera swooping across the ring from
   * wherever it was watching the left one.
   */
  const rebuild = (): void => {
    const rigWasUp = rigview.isVisible;
    if (rigWasUp) rigview.hide();

    // Before the bodies go: a stump's emitter is parented to the severed part's
    // mesh, and a node whose parent has been disposed does not go with it. It
    // stays exactly where it last stood, bleeding, for the rest of the run.
    blood.clear();
    drawn.left = -1;
    drawn.right = -1;
    hintLeft = CONFIG.bout.hintSeconds;

    for (const side of bout.sides) side.combat.dispose();
    bout.left.dispose();
    bout.right.dispose();
    bout = buildBout(state.matchup);

    targeting.attach(yours(), theirs());
    takeover.attach(bout.left, bout.right);
    attachRig();
    if (rigWasUp) rigview.show();
    refreshShadowCasters(arena.scene, arena.shadows);
    placeCamera(yours(), 0, true);
    // Nothing in flight can be settled against bodies that no longer exist, and
    // a rebuild is the one moment where a pending reading's fighter is a
    // disposed one. What it leaves behind in `takeovers` keeps its NaN, which is
    // exactly what it is: a reading that was never taken.
    pending.length = 0;
  };

  /**
   * Taking a body, and giving one back.
   *
   * The swap itself is one assignment per fighter and the physics never notices
   * it, which is what session 05's seam bought: both a person and a policy hand
   * back the same `Intent`, so there is no authority to transfer and no branch
   * anywhere in `Fighter` for which of them is driving. What the rest of this
   * costs is entirely about *continuity* -- see `handover` in `mind.ts` for why
   * the seed alone is not enough -- and about measuring whether the continuity
   * worked.
   *
   * The mind a released body picks up is a **freshly built** policy rather than
   * the one that was driving before you stepped in. That is not laziness: the
   * old one stopped existing at the moment you took the body, its cadence was
   * its own state and nothing was ticking it, and handing it back mid-stroke
   * would have it resume a plan formed against a fight it had not seen for ten
   * seconds. Which policy it is comes from the matchup, which is what the setup
   * screen's still-enabled policy picker on your own side is for.
   */
  const handOver = (fighter: Fighter, side: Side, incoming: Mind): HandReading => {
    const reading: HandReading = {
      side,
      from: fighter.mind.name,
      to: incoming.name,
      seeded: false,
      refused: null,
      // Not a zero, because a zero is what a *good* handover reads and a reading
      // that has not been taken yet must not be able to pass for one. They stay
      // NaN until the next control step fills them in, and a reading discarded by
      // a rebuild before that step ever came stays NaN forever, which is the
      // truth about it.
      commandMm: Number.NaN,
      tipMm: Number.NaN,
    };

    if (fighter.armed) {
      const pose = fighter.armAngles();
      const poses = fighter.armPoses();
      // The person's own cursor is rebased as well as the mind's, and the two
      // are not the same act. Wrist orientation is an absolute policy output,
      // seeded with the cursor so the handover begins from one whole pose. The two pointer axes are absolute by
      // design, and `onPointerMove` writes the true cursor position back over
      // this on the very next mouse event; seeding them is what makes the
      // takeover frame itself exact, and `handover`'s rebase window is what
      // carries it across the frames after that.
      if (incoming === you) {
        controls.state.posture.crouch = fighter.view.self.crouch;
        controls.state.posture.trunkLean = fighter.view.self.trunkLean;
        controls.state.posture.trunkTwist = fighter.view.self.trunkTwist;
        // Both hands, because whichever one the cursor is not on is still being commanded
        // from a pose it knows nothing about.
        for (const name of HANDS) {
          const seed = cursorForPose(poses[name], name);
          const hand = controls.state[name];
          hand.pointerX = seed.pointerX;
          hand.pointerY = seed.pointerY;
          hand.roll = seed.roll;
          hand.wristBend = seed.wristBend;
        }
      }
      fighter.mind = handover(incoming, poses);
      reading.seeded = true;
      pending.push({
        fighter,
        reading,
        pose,
        tip: tipOf(fighter),
      });
    } else {
      // A severed arm cannot be taken over into a pose it no longer has.
      // `Fighter.update` returns before `aimArm` once the arm is lost, so there
      // is nothing commanding it and nothing to be continuous with: seeding from
      // the angles it happens to still be carrying would be writing a cursor
      // position that describes a pose that stopped existing when the limb came
      // off. The body is still worth taking -- it walks, it turns, it can be
      // hit -- so the refusal is of the seed and names itself, rather than of
      // the takeover.
      reading.refused = "the sword arm is off, so there is no pose to seed from";
      fighter.mind = incoming;
      pending.push({
        fighter,
        reading,
        pose: fighter.armAngles(),
        tip: tipOf(fighter),
      });
    }
    return reading;
  };

  const takeBodyNow = (side: Side): TakeoverReading | null => {
    if (state.phase === "select") return null;

    const before = humanSide(state.matchup);
    const target = side === "left" ? bout.left : bout.right;
    if (!isArticulatedCombatant(target)) return null;

    // No branch for "you already drive this one", deliberately, and it is the
    // same argument the seam itself rests on. Re-taking your own body seeds from
    // the pose you are commanding, which is the pose your cursor already means,
    // so the rebase is a walk of nothing at all -- and the reading proves it
    // rather than a special case promising it.
    const taken = handOver(target, side, you);

    let released: HandReading | null = null;
    if (before && before !== side) {
      const leaving = before === "left" ? bout.left : bout.right;
      if (!isArticulatedCombatant(leaving)) return null;
      // A whole policy, not a split one: nobody is driving that body any more, so
    // both of its hands go back to the mind the corner names.
    released = handOver(leaving, before, policyMind(state.matchup[before].policy));
    }

    state = takeBody(state, side);
    // Only when the side actually moved. `attach` drops the lock, and dropping
    // somebody's lock because they clicked the body they were already in would
    // be a punishment for reading the mode's own instructions.
    if (humanSide(state.matchup) !== before) targeting.attach(yours(), theirs());

    const reading: TakeoverReading = { at: bout.sides[0].combat.now, taken, released };
    takeovers.push(reading);
    // Enough to check "five times in one bout" against, and short enough that
    // holding it costs nothing.
    if (takeovers.length > 12) takeovers.shift();
    return reading;
  };

  const settlePending = (): void => {
    for (const read of pending) {
      read.reading.commandMm = poseShiftMm(read.pose, read.fighter.armAngles());
      // `tipPositionToRef` rather than `tipPosition`, for the reason `weapon.ts`
      // gives at length: the matrix-backed accessor stamps the render id as a
      // side effect and converts every later reader that frame into a reader of
      // this sample. A measurement must not move the thing it measures.
      read.reading.tipMm = Vector3.Distance(read.tip, tipOf(read.fighter)) * 1000;
    }
    pending.length = 0;
  };

  /** The bout as the rules read it: two bodies, and the last blow each landed. */
  const ring = (): Ring => ({
    left: { parts: bout.left.limbs, lastBlow: bout.sides[0].combat.lastWound },
    right: { parts: bout.right.limbs, lastBlow: bout.sides[1].combat.lastWound },
  });

  // The control loop runs on the physics clock, not the render clock.
  //
  // Babylon's accumulator takes several fixed solver steps per rendered frame,
  // and notifies this observable before each one. Driving the arm from the
  // render loop instead refreshed the anchor's target only on the first of
  // those steps, so the keyframed anchor kept coasting through the rest and the
  // arm wandered metres from where it was pointed.
  const FIXED_STEP = 1 / CONFIG.world.physicsHz;

  let physicsMs = 0;
  let physicsStart = 0;
  arena.scene.onBeforePhysicsObservable.add(() => {
    physicsStart = performance.now();
    if (!controls.isActive) return;
    // Both of them, on the same clock, through one call, each reading its own
    // mind. There is no longer any difference at all between the two sides here,
    // which is exactly what the seam bought: the line that used to hand the
    // right fighter a frozen module constant is gone, and with it the reason
    // session 04's cross-check of the arm could not be run.
    //
    // The clock is `Combat`'s, which is simulation seconds since this bout was
    // built and is the same clock every `HitReport` is stamped with -- so a mind
    // that wants to know how long ago it was hit can subtract.
    if (bout.ending.isActive) {
      stepPair(bout.left, bout.right, FIXED_STEP, bout.sides[0].combat.now);
      const clock = bout.sides[0].combat.now;
      sampleBoutRecorder(bout.recorder, bout.left, bout.right, FIXED_STEP, clock);
    } else {
      // A projectile already away belongs to the world after the verdict. The
      // arms no longer pose or shoot, but the pool must still age and recycle.
      bout.left.stepProjectiles(FIXED_STEP);
      bout.right.stepProjectiles(FIXED_STEP);
    }
    // Here rather than at the swap, because the quantity is what the *new* mind
    // commanded and this is the first step it has been asked.
    if (pending.length > 0) settlePending();
  });
  arena.scene.onAfterPhysicsObservable.add(() => {
    // Smoothed, because a raw per-frame number is unreadable at 60 Hz.
    physicsMs += (performance.now() - physicsStart - physicsMs) * 0.1;
  });

  // Setup is a screen in place of the arena. Pause is a small control surface
  // inside the arena. Keeping their elements behind a tested presentation
  // boundary is what makes a screenshot-triggered blur freeze the visible
  // fight instead of replacing it with another screen.
  const presentation = new ArenaPresentation(curtain, pauseMenu);

  const runningHost: RunningHost = {
    get active() { return controls.isActive; },
    setPhysics: (enabled) => { arena.scene.physicsEnabled = enabled; },
    startControls: () => controls.start(),
    pauseControls: () => controls.pause(),
    showPaused: (paused) => {
      blood.setPaused(paused);
      presentation.showPaused(paused);
    },
    rebuild,
  };

  /** The pause, and the three ways out of it, in one place so they agree. */
  const resume = (): void => {
    resumeHost(runningHost);
  };

  const pause = (): void => {
    pauseHost(runningHost);
  };

  const restartBout = ({ resume: shouldResume }: { resume: boolean }): void => {
    if (playtest && !playtest.permitRestart()) return;
    state = restartHost(state, runningHost, shouldResume);
  };

  /**
   * Back to the setup screen, from wherever you were.
   *
   * The takeover is cancelled *here* and no longer on a pause. An armed takeover
   * behind a pause is fine -- the bodies it points at are still standing and
   * still the ones you will be clicking on when the curtain lifts -- but behind
   * the setup screen it points at a pair about to be replaced, and `C` is gated
   * on `active` so it could not be cancelled by hand.
   */
  const leave = (): void => {
    if (playtest?.workflowIsOpen) {
      if (playtest.boutIsRunning) playtest.refuseAbandon();
      else playtest.refuseWorkflowNavigation();
      return;
    }
    state = toSelect(state);
    controls.pause();
    arena.scene.physicsEnabled = false;
    takeover.cancel();
    setup.show(state.matchup);
    presentation.showPaused(false);
    presentation.showSetup(true);
  };

  beginButton.addEventListener("click", () => {
    if (playtest?.workflowIsOpen) {
      playtest.refuseWorkflowNavigation();
      return;
    }
    // `begin` refuses anywhere but the screen, so this phase test decides
    // whether a fresh bout has to be built rather than whether the transition is
    // allowed -- the rule and the wiring answer separately and agree.
    if (state.phase === "select") {
      state = begin(state, setup.selection);
      rebuild();
    }
    presentation.showSetup(false);
    resume();
  });

  resumeButton.addEventListener("click", resume);
  restartButton.addEventListener("click", () => {
    restartBout({ resume: true });
  });
  leaveButton.addEventListener("click", leave);

  playtest = new GuidedPlaytest(playtestHost, playtestLaunch, {
    startBout: (matchup, policySeeds) => {
      // Guided bouts are fresh bouts, never a mutation of the setup screen's
      // selection or of the bodies still standing after the previous verdict.
      controls.pause();
      arena.scene.physicsEnabled = false;
      takeover.cancel();
      if (guidedOriginalMatchup === null) guidedOriginalMatchup = structuredClone(setup.selection);
      state = begin(selectScreen(matchup), matchup);
      guidedPolicySeeds = policySeeds;
      try {
        rebuild();
      } finally {
        guidedPolicySeeds = null;
      }
      presentation.showSetup(false);
      resume();
    },
    exitToSetup: () => {
      if (guidedOriginalMatchup) state = { ...state, matchup: guidedOriginalMatchup };
      guidedOriginalMatchup = null;
      leave();
    },
  });

  /**
   * The controls sheet.
   *
   * Not a `Screen`: it goes over whatever is already there, including a fight,
   * and it changes nothing about the world underneath. `?` opens and closes it
   * and so does the button, because a full-screen overlay with one way out is a
   * trap on a keyboard nobody has read the list on yet.
   */
  const toggleHelp = (): void => {
    helpPanel.classList.toggle("gone");
  };
  helpClose.addEventListener("click", toggleHelp);

  // Camera: a simple trailing chase, in two readings of the same arena. It lags
  // on purpose -- a rigid camera makes a swing look like the world is turning
  // rather than the arm.
  const cameraGoal = new Vector3();
  // Reused for the same reason `cameraGoal` is: `placeCamera` runs once per
  // rendered frame, and a fresh pair of numbers per frame is a fresh object per
  // frame.
  const orbit = { distance: 0, height: 0 };
  const lookGoal = new Vector3();
  const focus = new Vector3();
  const forward = new Vector3();

  const placeCamera = (follow: CameraSubject, dt: number, snap: boolean): void => {
    const C = CONFIG.camera;
    const P = C[C.mode];

    // The one thing the two modes disagree about, and the reason this is a mode
    // rather than a second camera.
    if (C.mode === "fixed") {
      // A constant world bearing, in the convention `fighter.ts` uses for a heading:
      // zero down +Z, turning toward +X. Nothing about the fighter is read at
      // all, which is exactly the property being bought -- Q and E turn the
      // fighter and move the camera's bearing by zero.
      forward.set(Math.sin(C.fixedBearing), 0, Math.cos(C.fixedBearing));
    } else {
      // `getWorldMatrix()` and deliberately not `computeWorldMatrix(true)`, which
      // is the opposite of the rule that holds everywhere else here. The matrix
      // short-circuits on the render id, so what this reads is the pelvis as of the
      // last `scene.render()` rather than as of the physics steps taken since --
      // one frame of extra lag on the facing, on top of the lag the follow blend
      // puts there on purpose. Forcing the recompute would tighten that and would
      // change how Overhead frames a turn, which this session is required not to
      // do. It is a one-line change and it belongs in one that can be judged on
      // its own.
      // Pelvis, not torso: leaning or twisting the chest must not roll the
      // camera or swing its bearing away from locomotion heading.
      const world = isArticulatedCombatant(follow) ? follow.pelvis.mesh.getWorldMatrix() : null;
      const horizontal = world
        ? horizontalForward(world.m[8], world.m[10], forward.x, forward.z)
        : horizontalForward(forward.x, forward.z, 0, 1);
      forward.set(horizontal.x, 0, horizontal.z);
    }

    const gesture = controls.camera;
    const bearing = Math.atan2(forward.x, forward.z) + gesture.yaw;
    forward.set(Math.sin(bearing), 0, Math.cos(bearing));

    // Both goals are built from the fighter's position on the ground, so the
    // framing does not shift when the torso's centre height is retuned. The
    // orbit distance, the orbit height and the zoom that scales both are
    // `camera.ts`'s, from the gesture state this host owns -- the command
    // `controls.sample` hands the fighter has no camera field to read.
    const feet = follow.feetPosition();
    feet.x += gesture.panX;
    feet.z += gesture.panZ;
    orbitFraming(gesture, P.distance, P.height, orbit);

    cameraGoal
      .copyFrom(feet)
      .subtractInPlace(forward.scale(orbit.distance))
      .addInPlaceFromFloats(0, orbit.height, 0);

    lookGoal
      .copyFrom(feet)
      .addInPlace(forward.scale(P.lookAhead))
      .addInPlaceFromFloats(0, P.lookHeight, 0);

    // `snap` is for the first frame of the page and for a bout rebuilt from
    // nothing, and for nothing else. Both of those are moments where there is no
    // continuity to preserve, because every body being followed is new. A mode
    // change is the opposite and must not use it: both goals move at once when
    // the forward vector is rebuilt, and letting the follow blend walk the
    // camera across is the whole of what keeps a switch taken mid-stride from
    // reading as a cut.
    const blend = snap ? 1 : 1 - Math.exp(-C.followResponse * dt);
    arena.camera.position.addInPlace(cameraGoal.subtract(arena.camera.position).scale(blend));
    focus.addInPlace(lookGoal.subtract(focus).scale(blend));
    arena.camera.setTarget(focus);
  };

  placeCamera(yours(), 0, true);

  /**
   * The `#mode` banner carries three different kinds of thing, and it composes
   * them rather than letting any one of them quietly win.
   *
   * The outcome comes first and is a *verdict*: it stands for as long as the
   * bout is over, which is until you leave it, and it is the one message that is
   * about something that has already happened rather than about something you
   * are doing. Targeting owns the line as a level: `SELECT TARGET` stands for as
   * long as the choice is armed, and `free` maps to an empty string on purpose
   * so the banner disappears in ordinary play. The camera has no level worth
   * showing -- which camera you are looking through is the one piece of state
   * already in front of you -- so it borrows the line as a notice that expires.
   *
   * The colour follows the verdict first and targeting second, so a lock left
   * armed when somebody's head came off does not paint the result red as though
   * it were an instruction. One banner, one colour.
   */
  let cameraNotice = "";
  let noticeLeft = 0;
  /**
   * Seconds left on the takeover hint.
   *
   * Which body is yours has been changeable mid-bout since session 07 and the
   * curtain has listed `C` the whole time, and it turns out that a key on a
   * screen you dismissed to start playing is a key nobody has. The feature was
   * not missing; the affordance was. It shows for a few seconds at the start of
   * each bout, last in the banner's priority list so it can never cover a
   * verdict or a mode line, and it is gone by the time anything is happening.
   */
  let hintLeft = 0;
  /** The `F` notice, on the same timer arrangement as the camera's. */
  let handNotice = "";
  let handLeft = 0;
  let shownBanner = "";
  let shownMode = "";

  const announceCamera = (): void => {
    const C = CONFIG.camera;
    cameraNotice =
      C.mode === "fixed"
        ? `CAMERA FIXED &mdash; bearing ${Math.round((C.fixedBearing * 180) / Math.PI)}&deg;`
        : "CAMERA OVERHEAD &mdash; behind the fighter";
    noticeLeft = C.noticeSeconds;
  };

  engine.runRenderLoop(() => {
    const rawDeltaMs = engine.getDeltaTime();
    const dt = Math.min(rawDeltaMs / 1000, CONFIG.world.maxFrameSeconds);
    if (dt <= 0) return;
    if (controls.isActive) playtest?.frame(rawDeltaMs, dt);

    runActiveHostFrame(runningHost, () => {
      controls.sample(dt);
      targeting.releaseIfSteering(controls.state.turn);
      // One owner of the cursor's outline at a time; see `Targeting.update`.
      targeting.update(dt, !takeover.isArmed);
      takeover.update(dt);
      for (const side of bout.sides) side.combat.advance(dt);
      // After `advance`, so a report filed this frame is already timestamped.
      drawBlood();
      blood.update(dt);
      // The rules get the rendered frame's delta, which is the same clock
      // `Combat` counts on, so the cap and a report's timestamp are comparable.
      // Only while the fight is actually running: an arena paused in place
      // must not quietly run out its ten-minute safety cap.
      const previousPhase = state.phase;
      state = advanceFight(state, ring(), dt, bout.ending);
      if (previousPhase === "fight" && state.phase === "over" && state.outcome) {
        const actorSide = playtest?.recordingSide;
        if (actorSide) {
          const record = bout.recorder.records[actorSide];
          playtest.completeBout(state.outcome, {
            engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
            matchup: state.matchup,
            record,
          });
        }
      }
      // The per-bout coordinator owns the one-shot edge and is rebuilt with the
      // bodies. Observers remain installed: blood, corpse integration,
      // rendering and camera all continue after attack authority has ended.
      // `advanceFight` delivers the old-to-new phase edge to that coordinator.
      const driven = yours();
      placeCamera(driven, dt, false);
      arena.updateRoomOcclusion(bout.occlusionTargets);

      aim.update(driven.feetPosition(), driven.aimPoint());
      // The overlay's three numbers follow whoever is being driven, and the panel
      // names the side, because they used to be the left fighter's by definition
      // and `C` made that a thing that can change under you.
      rigview.update(dt, humanSide(state.matchup));
    });
    arena.scene.render();

    const timers = advanceActiveHostTimers(runningHost, {
      camera: noticeLeft,
      hint: hintLeft,
      hand: handLeft,
    }, dt);
    noticeLeft = timers.camera;
    hintLeft = timers.hint;
    handLeft = timers.hand;
    if (noticeLeft === 0) cameraNotice = "";
    if (handLeft === 0) handNotice = "";

    const decided = state.outcome;
    const banner = [
      decided ? `BOUT OVER &mdash; ${decided.text} &mdash; R to restart` : "",
      // Ahead of the lock's own line, because it is the mode you just entered and
      // the one a click is about to be spent on.
      takeover.isArmed ? TAKE_TEXT : "",
      MODE_TEXT[targeting.status] ?? "",
      handNotice,
      cameraNotice,
      // Last, and silent the moment anything else has something to say.
      hintLeft > 0 && !decided && !takeover.isArmed ? HINT_TEXT : "",
    ]
      .filter((part) => part !== "")
      .join(" &middot; ");
    if (banner !== shownBanner || targeting.status !== shownMode) {
      shownBanner = banner;
      shownMode = targeting.status;
      modeLine.innerHTML = banner;
      modeLine.classList.toggle("on", banner !== "");
      modeLine.classList.toggle("decided", decided !== null);
      modeLine.classList.toggle("locked", decided === null && shownMode === "locked");
    }

    // The newer of the two sides' last blows, which is simply the last blow
    // struck by anybody. The report names who landed it, so one panel serves
    // both -- and a panel per side would spend a third of the readout saying
    // "nothing yet" for as long as one of them is not fighting back.
    const latest = bout.sides
      .map((side) => side.combat.lastHit)
      .reduce<typeof bout.sides[number]["combat"]["lastHit"]>(
        (best, hit) => (hit && (!best || hit.at > best.at) ? hit : best),
        null,
      );

    // Whether the mind publishes a reading, not what it is called. This gated on
    // `mind.name === "learned-meta"`, and `metaDiagnostic` already returns null
    // for a mind with nothing to say, so the name test was strictly narrower
    // than the capability test it sat in front of. That is why it went.
    //
    // **It did not go to keep the panel lit, and an earlier note here said it
    // did.** The panel has never lit in this page and does not light now:
    // `mindFor` builds minds only through `policyMind` and `splitMind`, the
    // five `POLICIES` entries are `idle`, `swinger`, `duelist`, `archer` and
    // `crawler`, and `typeof mind.diagnostic === "undefined"` for every one of
    // them -- measured, not assumed. `learnedMetaMind` had no constructor
    // anywhere in `src/` at all; its two were headless CLIs, both deleted.
    // The readout becomes reachable the day a page-constructible mind publishes
    // a diagnostic, which is session 19's page-side deployment path, and not
    // before.
    const learned = Object.fromEntries(
      (["left", "right"] as const).flatMap((side) => {
        const reading = metaDiagnostic(bout[side].mind);
        return reading ? [[side, reading] as const] : [];
      }),
    );
    const driven = yours();
    hud.update(
      {
        fps: engine.getFps(),
        physicsMs,
        tipSpeed: isArticulatedCombatant(driven) ? driven.sword?.tipSpeed() ?? 0 : 0,
        edgeAlignment: isArticulatedCombatant(driven) ? edgeAlignmentNow(driven) : 0,
        meshes: arena.scene.meshes.length,
        rig: rigview.readout(),
        driving: humanSide(state.matchup),
        learned: Object.keys(learned).length > 0 ? learned : null,
      },
      bout,
      latest,
      bout.sides[0].combat.now,
    );
  });

  window.addEventListener("resize", () => engine.resize());

  // A live handle on everything, for tuning from the console. CONFIG is
  // deliberately mutable, so `__sword.config.arm.linearMotorForce = 1600` takes
  // effect on the very next frame -- which is the whole point of a feel
  // prototype. Anything the solver caches natively needs `applyTuning()` on the
  // fighter it belongs to, and that now includes every joint of the body:
  // `__sword.left.applyTuning()`.
  //
  // `left` and `right` are getters rather than fields because `R` replaces
  // both fighters, and a console handle that quietly refers to a disposed body
  // is worse than no handle -- every reading taken through it would be of
  // something that is no longer in the world.
  //
  // The handle that matters most now is `mind`, on either fighter. Session 04
  // wanted the standard cursor sweep run on the *right* arm, whose bodies sit
  // fifteen places further down Havok's list than the left one's, and could not:
  // the right fighter read a frozen module constant, so an observer that swept
  // it drove it twice per step and inflated its tip speed from 10.67 m/s to
  // 13.41. It is now one assignment, and it takes effect on the next substep
  // with nothing to rebuild:
  //
  //     let x = 0.6;
  //     __sword.right.mind = { name: "sweep", decide: (view, dt) => {
  //       x = Math.max(-0.6, x - dt / 0.25 * 1.2);
  //       return { ...__sword.controls.state, pointerX: x, pointerY: 0 };
  //     } };
  //
  // and `__sword.right.mind = { name: "idle", decide: () => NEUTRAL }` puts it
  // back. `__sword.right.view` is what any such mind is being shown.
  Object.assign(window as unknown as Record<string, unknown>, {
    __sword: {
      engine,
      scene: arena.scene,
      camera: arena.camera,
      /** Room/body/resource census and named visual-to-collider pairs. */
      arena: { audit: arena.audit },
      get left() {
        return bout.left;
      },
      get right() {
        return bout.right;
      },
      get combats() {
        return bout.sides.map((side) => side.combat);
      },
      /** Raw records, exact gate rows and human-facing tables for the current bout. */
      get engagement() {
        const side = (name: Side) => {
          const record = bout.recorder.records[name];
          const gates = engagementGates(engagementMetrics(record.engagement, record.seconds));
          return Object.freeze({ record, gates, table: formatEngagementGateTable(gates) });
        };
        return Object.freeze({ engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
          left: side("left"), right: side("right") });
      },
      /** Phase, matchup, clock and outcome -- the whole of what `bout.ts` owns. */
      get state() {
        return state;
      },
      targeting,
      /**
       * Taking a body, from the console as well as from `C` and a click.
       *
       * `take(side)` is the whole of the takeover measurement's setup, and it is
       * here rather than only on the mouse because the interesting moment is
       * *mid-swing* -- which is not a moment you can reliably click on. Arm a
       * swinger on the left, wait for it to commit, and:
       *
       *     __sword.takeover.take("left"); __sword.takeover.last
       *
       * The reading arrives on the next control step, which is the takeover
       * frame. `taken.commandMm` is the hand's commanded jump in millimetres and
       * is the figure the acceptance is written against; `taken.tipMm` is how far
       * the blade itself went over the same step, which contains the swing as
       * well as the handover and is only comparable against 20 mm on a body that
       * was standing still. `released` is the same pair for the body handed back
       * to its policy, and is null when there was nobody to hand one back from.
       *
       * To see what the seed is worth, turn it off and take the same body again:
       * `__sword.config.takeover.rebaseSeconds = 0` leaves only the plan's
       * one-frame seed, and the takeover frame still reads clean while the frame
       * after it does not.
       */
      takeover: {
        get armed(): boolean {
          return takeover.isArmed;
        },
        cancel: () => takeover.cancel(),
        take: (side: Side) => takeBodyNow(side),
        /** The last handover, or null if nothing has changed hands yet. */
        get last(): TakeoverReading | null {
          return takeovers.length > 0 ? takeovers[takeovers.length - 1] : null;
        },
        /** The last dozen, oldest first. */
        get readings(): readonly TakeoverReading[] {
          return takeovers;
        },
      },
      controls,
      setup,
      /** Load a complete in-progress champion into one live body without registering a policy. */
      research: {
        load: async (source: ChampionSource, side: Side = "right") => {
          if (side !== "left" && side !== "right") throw new Error(`research champion side "${side}" is unknown`);
          requireLiveResearchBout(state.phase);
          const selected = state.matchup[side];
          const loadout = selected.unit === "centipede" ? "natural:bite" : `${selected.handA}+${selected.handB}`;
          const loaded = await loadChampionSoFarMind(source, `${selected.unit}/${loadout}`);
          bout[side].mind = loaded.mind;
          return Object.freeze({ side, algorithm: loaded.artifact.data.algorithm,
            runId: loaded.artifact.data.provenance.runId, status: loaded.artifact.data.provenance.status,
            championDigest: loaded.digest });
        },
      },
      // `__sword.rigview.audit()` is where the overlay's central boundary is
      // pinned -- that it creates no body, no shape and no constraint. It cannot
      // be pinned in `tests/`, which has no Babylon to run.
      rigview,
      /**
       * Blood, for looking at it without having to be hit.
       *
       *     __sword.blood.spray(__sword.left.centre(), new BABYLON.Vector3(0,1,0), 20)
       *     __sword.blood.count      // emitters alive; must fall back to 0
       *
       * The count is the leak check: every burst and every stump is collected a
       * particle lifetime after it stops feeding, so a bout that has finished
       * bleeding must read zero. It never rises during a rebuild either, because
       * `clear()` runs before the bodies the stumps hang on are disposed.
       */
      blood,
      config: CONFIG,
    },
  });

  bootNote.textContent = "Havok ready.";
  beginButton.disabled = false;
  presentation.showSetup(true);
  presentation.showPaused(false);
}

/**
 * How squarely the blade is moving into its own edge right now.
 *
 * Shown live rather than only on contact, because the useful skill is learning
 * to turn the wrist *before* the blade arrives, and a number that only appears
 * after a hit teaches that far more slowly.
 */
function edgeAlignmentNow(fighter: Fighter): number {
  const weapon = fighter.sword;
  if (!weapon) return 0;
  const tip = weapon.tipPosition();
  const velocity = weapon.velocityAt(tip);
  const speed = velocity.length();
  if (speed < 0.4) return 0;
  return Math.abs(Vector3.Dot(velocity.scale(1 / speed), weapon.edgeDirection()));
}

boot().catch((error: unknown) => {
  const note = document.getElementById("boot-note");
  if (note) {
    note.classList.add("error");
    note.textContent = error instanceof Error ? error.message : String(error);
  }
  // eslint-disable-next-line no-console
  console.error(error);
});
