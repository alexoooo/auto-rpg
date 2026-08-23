import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";

import { CONFIG } from "./config";
import { buildArena } from "./arena";
import { Fighter, stepPair } from "./fighter";
import { Combat } from "./combat";
import { Hud } from "./hud";
import { Controls } from "./input";
import { AimIndicator } from "./aim";
import { Takeover, Targeting } from "./targeting";
import { RigView } from "./rigview";
import { Blood } from "./blood";
import { SetupScreen } from "./setup";
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
import type { WeaponKind } from "./weapon";
import {
  advance,
  begin,
  defaultMatchup,
  humanSide,
  restart,
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

/** Everything solid casts a shadow. Indicators and control frames do not. */
function refreshShadowCasters(scene: Scene, shadows: ShadowGenerator): void {
  const list = shadows.getShadowMap()?.renderList;
  if (!list) return;
  list.length = 0;
  for (const mesh of scene.meshes) {
    if (mesh.name === "ground") continue;
    if (!mesh.isVisible) continue;
    if (
      mesh.name.startsWith("aim.") ||
      mesh.name.startsWith("target.") ||
      mesh.name.startsWith("takeover.") ||
      mesh.name.startsWith("rig.")
    ) {
      continue;
    }
    list.push(mesh);
  }
}

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
type CameraSubject = Pick<Fighter, "torso" | "feetPosition">;

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
  const beginButton = need<HTMLButtonElement>("begin");
  const bootNote = need("boot-note");
  const modeLine = need("mode");

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

  const controls = new Controls(canvas, {
    onReset: () => {
      // `Space` means "this bout again", and what that costs depends on where
      // you are. Behind the screen it means nothing, because there is no bout
      // yet. During one it rebuilds both fighters, which is what it has always
      // done here and is the key you press after making a mess of a limb you
      // wanted to cut properly. After one has been decided it opens the screen,
      // with the same matchup still selected, because the thing you want after
      // a bout is the same bout again -- and because a decided fight rebuilt in
      // place would give you no chance to change your mind about it.
      if (state.phase === "select") return;
      if (state.phase === "over") {
        state = toSelect(state);
        controls.pause();
        // An armed takeover behind the curtain is a mode you cannot see, cannot
        // cancel -- `C` is gated on `active` -- and whose rings are drawn over a
        // pair of bodies that are about to be replaced.
        takeover.cancel();
        setup.show(state.matchup);
        showCurtain(true);
        return;
      }
      state = restart(state);
      rebuild();
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
      // `Esc` on a decided bout opens the same door `Space` does. There is
      // nothing left to resume, so pausing it would put a Resume button over a
      // fight that is not happening.
      if (state.phase === "over") {
        state = toSelect(state);
        setup.show(state.matchup);
      }
      controls.pause();
      takeover.cancel();
      showCurtain(true);
    },
    onToggleLock: () => targeting.toggle(),
    onSwapHands: () => {
      // The mouse has already changed hands by the time this runs -- `Controls`
      // moves `driving` itself, because the state is its own. What is left is
      // to seed the hand it has arrived at from the pose that hand is actually
      // in, exactly as a takeover does: the cursor is absolute, so a hand taken
      // over without seeding snaps to wherever the mouse happens to be at the
      // full 850 N the grip can pull.
      const fighter = yours();
      if (!fighter.armed) return;
      const seed = cursorForPose(fighter.armPoses()[controls.state.driving]);
      const hand = controls.state[controls.state.driving];
      hand.pointerX = seed.pointerX;
      hand.pointerY = seed.pointerY;
      hand.roll = seed.roll;
      handNotice = controls.state.driving === "primary" ? HAND_A_TEXT : HAND_B_TEXT;
      handLeft = CONFIG.camera.noticeSeconds;
    },
    onToggleTakeover: () => {
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
  const mindFor = (side: SideSetup): Mind =>
    side.control === "you" ? splitMind(you, policyMind(side.policy)) : policyMind(side.policy);

  /** What a corner's two pickers mean to a body. */
  const loadoutFor = (side: SideSetup) => ({
    primary: side.handA as WeaponKind,
    secondary: side.handB as WeaponKind,
  });

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
    const left = new Fighter(
      arena.scene,
      {
        side: "left",
        origin: Vector3.Zero(),
        facing: 0,
        mind: mindFor(matchup.left),
        loadout: loadoutFor(matchup.left),
      },
      arena.materials,
    );
    const right = new Fighter(
      arena.scene,
      {
        side: "right",
        origin: new Vector3(0, 0, F.separation),
        facing: Math.PI,
        mind: mindFor(matchup.right),
        loadout: loadoutFor(matchup.right),
      },
      arena.materials,
    );
    const sides = [
      { fighter: left, combat: new Combat("left", left.weapons) },
      { fighter: right, combat: new Combat("right", right.weapons) },
    ];
    // Each blade is pointed at the other body. The collision layers already say
    // the same thing in the solver; this says it again in the scoring.
    sides[0].combat.attach(right);
    sides[1].combat.attach(left);
    return { left, right, sides };
  };

  let bout = buildBout(state.matchup);

  /**
   * The fighter you are looking through, and the one opposite it.
   *
   * Asked as a question every time rather than held, because both answers move:
   * the bout is rebuilt on every start, and which side is yours is a property of
   * the matchup rather than of the arena. With two policies fighting, the camera
   * takes the left one and the aim indicator draws where its policy is pointing,
   * which is the most useful thing to be watching when nobody is playing.
   */
  const yours = (): Fighter => (humanSide(state.matchup) === "right" ? bout.right : bout.left);
  const theirs = (): Fighter => (humanSide(state.matchup) === "right" ? bout.left : bout.right);

  const hud = new Hud(need("hud"));
  const aim = new AimIndicator(arena.scene);
  const targeting = new Targeting(arena.scene, yours());
  targeting.attach(yours(), theirs());
  const takeover = new Takeover(arena.scene);
  takeover.attach(bout.left, bout.right);
  const rigview = new RigView(arena.scene);
  rigview.attach(bout.sides);
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
    rigview.attach(bout.sides);
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
      // are not the same act. `roll` is an *accumulator* -- `Controls.sample`
      // integrates the Z and X keys into it and nothing ever writes an absolute
      // value -- so seeding it is durable and the wrist simply continues from
      // where the previous driver left it. The two pointer axes are absolute by
      // design, and `onPointerMove` writes the true cursor position back over
      // this on the very next mouse event; seeding them is what makes the
      // takeover frame itself exact, and `handover`'s rebase window is what
      // carries it across the frames after that.
      if (incoming === you) {
        // Both hands, because the cursor drives one of them and the keys the
        // other's wrist, and whichever one it is not on is still being commanded
        // from a pose it knows nothing about.
        for (const name of HANDS) {
          const seed = cursorForPose(poses[name]);
          const hand = controls.state[name];
          hand.pointerX = seed.pointerX;
          hand.pointerY = seed.pointerY;
          hand.roll = seed.roll;
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

    // No branch for "you already drive this one", deliberately, and it is the
    // same argument the seam itself rests on. Re-taking your own body seeds from
    // the pose you are commanding, which is the pose your cursor already means,
    // so the rebase is a walk of nothing at all -- and the reading proves it
    // rather than a special case promising it.
    const taken = handOver(target, side, you);

    let released: HandReading | null = null;
    if (before && before !== side) {
      const leaving = before === "left" ? bout.left : bout.right;
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
      // `tipPositionToRef` rather than `tipPosition`, for the reason `sword.ts`
      // gives at length: the matrix-backed accessor stamps the render id as a
      // side effect and converts every later reader that frame into a reader of
      // this sample. A measurement must not move the thing it measures.
      read.reading.tipMm = Vector3.Distance(read.tip, tipOf(read.fighter)) * 1000;
    }
    pending.length = 0;
  };

  /** The bout as the rules read it: two bodies, and the last blow each landed. */
  const ring = (): Ring => ({
    left: { parts: bout.left.limbs, lastBlow: bout.sides[0].combat.lastHit },
    right: { parts: bout.right.limbs, lastBlow: bout.sides[1].combat.lastHit },
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
    stepPair(bout.left, bout.right, FIXED_STEP, bout.sides[0].combat.now);
    // Here rather than at the swap, because the quantity is what the *new* mind
    // commanded and this is the first step it has been asked.
    if (pending.length > 0) settlePending();
  });
  arena.scene.onAfterPhysicsObservable.add(() => {
    // Smoothed, because a raw per-frame number is unreadable at 60 Hz.
    physicsMs += (performance.now() - physicsStart - physicsMs) * 0.1;
  });

  /**
   * The curtain is two screens wearing one coat.
   *
   * Before a bout it is the setup screen and the button starts what is on it;
   * over a bout already running it is a pause and the button lifts it off again.
   * `paused` hides the matchup, because offering a choice the button will not
   * act on is worse than offering none -- and the label says which of the two
   * you are looking at, so the state is never something you have to remember.
   */
  const showCurtain = (show: boolean): void => {
    curtain.classList.toggle("gone", !show);
    const choosing = state.phase === "select";
    curtain.classList.toggle("paused", !choosing);
    beginButton.textContent = choosing ? "Fight" : "Resume";
  };

  beginButton.addEventListener("click", () => {
    // `begin` refuses anywhere but the screen, so this phase test decides
    // whether a fresh bout has to be built rather than whether the transition is
    // allowed -- the rule and the wiring answer separately and agree.
    if (state.phase === "select") {
      state = begin(state, setup.selection);
      rebuild();
    }
    showCurtain(false);
    controls.start();
  });

  // Camera: a simple trailing chase, in two readings of the same arena. It lags
  // on purpose -- a rigid camera makes a swing look like the world is turning
  // rather than the arm.
  const cameraGoal = new Vector3();
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
      // short-circuits on the render id, so what this reads is the torso as of the
      // last `scene.render()` rather than as of the physics steps taken since --
      // one frame of extra lag on the facing, on top of the lag the follow blend
      // puts there on purpose. Forcing the recompute would tighten that and would
      // change how Overhead frames a turn, which this session is required not to
      // do. It is a one-line change and it belongs in one that can be judged on
      // its own.
      const world = follow.torso.mesh.getWorldMatrix();
      forward.set(world.m[8], world.m[9], world.m[10]).normalize();
    }

    // Both goals are built from the fighter's position on the ground, so the
    // framing does not shift when the torso's centre height is retuned. Zoom
    // scales distance and height together, so the camera slides along its own
    // sight line and the angle you read the arena at never changes.
    const feet = follow.feetPosition();
    const zoom = controls.state.zoom;

    cameraGoal
      .copyFrom(feet)
      .subtractInPlace(forward.scale(P.distance * zoom))
      .addInPlaceFromFloats(0, P.height * zoom, 0);

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
   * bout is over, which is until `Space`, and it is the one message that is
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
    const dt = Math.min(engine.getDeltaTime() / 1000, CONFIG.world.maxFrameSeconds);
    if (dt <= 0) return;

    if (controls.isActive) {
      controls.sample(dt);
      targeting.releaseIfSteering(controls.state.turn);
      // One owner of the cursor's outline at a time; see `Targeting.update`.
      targeting.update(dt, !takeover.isArmed);
      takeover.update(dt);
    }

    for (const side of bout.sides) side.combat.advance(dt);
    // After `advance`, so a report filed this frame is already timestamped, and
    // outside the `isActive` guard above: a blow struck on the frame the window
    // lost focus should still finish bleeding rather than freeze in the air.
    drawBlood();
    blood.update(dt);
    // The rules get the rendered frame's delta, which is the same clock
    // `Combat` counts on, so the cap and a report's timestamp are comparable.
    // Only while the fight is actually running: a bout paused behind the curtain
    // must not quietly run out its sixty seconds.
    if (controls.isActive) state = advance(state, ring(), dt);

    const driven = yours();
    placeCamera(driven, dt, false);

    aim.update(driven.feetPosition(), driven.aimPoint());
    // The overlay's three numbers follow whoever is being driven, and the panel
    // names the side, because they used to be the left fighter's by definition
    // and `C` made that a thing that can change under you.
    rigview.update(dt, humanSide(state.matchup));
    arena.scene.render();

    if (noticeLeft > 0) {
      noticeLeft -= dt;
      if (noticeLeft <= 0) cameraNotice = "";
    }
    if (hintLeft > 0) hintLeft -= dt;
    if (handLeft > 0) {
      handLeft -= dt;
      if (handLeft <= 0) handNotice = "";
    }

    const decided = state.outcome;
    const banner = [
      decided ? `BOUT OVER &mdash; ${decided.text} &mdash; Space for the setup screen` : "",
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

    hud.update(
      {
        fps: engine.getFps(),
        physicsMs,
        tipSpeed: driven.sword?.tipSpeed() ?? 0,
        edgeAlignment: edgeAlignmentNow(driven),
        meshes: arena.scene.meshes.length,
        rig: rigview.readout(),
        driving: humanSide(state.matchup),
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
  // `left` and `right` are getters rather than fields because `Space` replaces
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
      get left() {
        return bout.left;
      },
      get right() {
        return bout.right;
      },
      get combats() {
        return bout.sides.map((side) => side.combat);
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
  showCurtain(true);
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
