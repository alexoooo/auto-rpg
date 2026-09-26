import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "./config";
import { horizontalForward, orbitFraming } from "./camera";
import { buildArena } from "./arena";
import { refreshShadowCasters, type RoomOcclusionTarget } from "./arena-room";
import { stepPair } from "./fighter";
import { Combat } from "./combat";
import { Hud, type CommandReadout, type CommandSideReadout } from "./hud";
import { Controls } from "./input";
import { AimIndicator } from "./aim";
import { OrderDisplay } from "./targeting";
import { DamageFeedback } from "./damage-feedback";
import { advanceFight, FightEnd } from "./fight-end";
import { BoutRecorder, ENGAGEMENT_INSTRUMENT_VERSION, combatRecorder, sampleBoutRecorder,
  wireBoutRecorder } from "./recorder";
import { advanceActiveHostTimers, ArenaPresentation, pauseHost, presentRebuiltFrame, restartHost, resumeHost,
  runHostFrame, SKIM_SPEEDS, type RunningHost } from "./host-run";
import type { GolemDriven } from "./golem/tactics-v4";
import { GOLEM_TACTICS } from "./golem/tactics";
import { setLiveStrokeRow } from "./golem/stroke-rows";
import { strokeLink } from "./golem/stroke-link";
import { SetupScreen } from "./setup";
import {
  defaultGolemSetup,
  golemEffector,
  golemEffectorOption,
  golemSetupRefusal,
  isGolemEffectorOption,
} from "./golem/build";
import {
  browserPartsBinStorage,
  partsBinLoot,
  PartsBin,
  type FittedPart,
  type PartsBinTake,
} from "./golem/parts-bin";
import { flatSupportedWorldRegistry } from "./supported-locomotion-production";
import type { Side } from "./physics";
import { POLICIES, type Mind } from "./mind";
import {
  attackMoveOrder,
  autoCommander,
  fightOrder,
  holdOrder,
  moveOrder,
  StandingOrders,
  steerPoint,
  type GroundPoint,
  type Orders,
} from "./orders";
import { policyLine } from "./policy-lines.ts";
import {
  loadoutForUnit,
  locomotionModeForPair,
  supportsLoadoutForUnit,
  unitDefinition,
  UNIT_REGISTRY,
  type Combatant,
} from "./units";
import { randomSeed } from "./rng";
import { MENU_HREF } from "./app-route";
import { fittedPolicy, randomCorner } from "./random-corner.ts";
import {
  begin,
  commandAction,
  commanderOf,
  commandSide,
  golemMatchup,
  humanSide,
  matchupFromQuery,
  matchupQuery,
  MATCHUP_PARAM,
  pauseAction,
  selectScreen,
  standDown,
  toSelect,
  withGolemEffector,
  type Matchup,
  type Ring,
  type SideSetup,
} from "./bout";

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

/** The nudge that says orders exist, for the first seconds of a bout. See `hintLeft`. */
const HINT_TEXT = "Command a side from the readout &mdash; then click to give it orders (? for the keys)";

/** What the banner says a commanded side is doing, from its orders alone. */
const ordersText = (orders: Orders | null): string => {
  if (!orders || (orders.target === null && orders.destination === null)) {
    return "ORDERS &mdash; none: fighting the nearest";
  }
  if (orders.destination) return typeof orders.target === "string"
    ? "ORDERS &mdash; fight the enemy from the ring"
    : "ORDERS &mdash; hold the ring";
  if (typeof orders.target === "string") return "ORDERS &mdash; attack the enemy";
  return "ORDERS &mdash; attack-move";
};

async function boot(): Promise<void> {
  const canvas = need<HTMLCanvasElement>("stage");
  const curtain = need("curtain");
  const pauseMenu = need("pause-menu");
  const beginButton = need<HTMLButtonElement>("begin");
  const resumeButton = need<HTMLButtonElement>("resume");
  const restartButton = need<HTMLButtonElement>("restart");
  const randomReplayButton = need<HTMLButtonElement>("random-replay");
  const boutEnd = need("bout-end");
  const boutEndReplay = need<HTMLButtonElement>("bout-end-replay");
  const boutEndRandom = need<HTMLButtonElement>("bout-end-random");
  const boutEndLeave = need<HTMLButtonElement>("bout-end-leave");
  const leaveButton = need<HTMLButtonElement>("leave");
  need<HTMLButtonElement>("to-menu").addEventListener("click", () => window.location.assign(MENU_HREF));
  const helpPanel = need("help");
  const helpClose = need<HTMLButtonElement>("help-close");
  const helpOpen = need<HTMLButtonElement>("help-open");
  const helpPolicies = need("help-policies");
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
  /**
   * What the screen opens on: the link's matchup if the page was opened from one, and the
   * showcase pair otherwise.
   *
   * A link is refused twice before it is trusted, and each refusal is named on the boot note
   * rather than swallowed. `matchupFromQuery` refuses by shape; a well-shaped link whose ids the
   * registry does not have is refused by `golemSetupRefusal` *here*, before any body is built
   * from it, because the showcase builds its bodies at boot and `buildBout` throws on a build it
   * cannot assemble -- a page that died on a stale link would be a page nobody could open.
   */
  const query = new URLSearchParams(window.location.search);
  const linked = matchupFromQuery(window.location.search);
  const linkRefusal = linked === null
    // `has` rather than "is there any query at all", because there are other parameters: one of
    // those on its own used to report the *matchup* as malformed, which is a refusal of
    // something nobody wrote.
    ? (query.has(MATCHUP_PARAM) ? "the link's matchup was not the right shape" : null)
    : [linked.left, linked.right]
      // A unit the registry no longer has -- every link from before the Warrior was cut names
      // one -- or a policy it no longer offers is refused by name like a stale part id, because
      // `unitDefinition` and the unit's policy factory both throw on one.
      .map(({ unit, policy, handA, handB, golem }) => !Object.hasOwn(UNIT_REGISTRY, unit)
        ? `there is no "${unit}" unit any more`
        : !unitDefinition(unit).driverOptions.some((driver) => driver.name === policy)
          ? `a ${unit} has no "${policy}" policy`
        // `buildBout` asks the unit for this pair of hands, and throws on one it does not carry.
        : !supportsLoadoutForUnit(unit, handA, handB) ? `a ${unit} cannot hold ${handA} and ${handB}`
        : golem ? golemSetupRefusal(golem) : null)
      .find((refusal) => refusal !== null) ?? null;

  /**
   * `?drawFraction=` -- the physics dial, overridden for the length of one page.
   *
   * **This exists for one job: letting the owner watch the same seed under two damage laws.**
   * `CONFIG.combat.drawFraction` is how much of a cut's sliding speed an aligned edge is paid
   * for, it ships at 0.3 on the owner's 2026-09-17 ruling, and 0 is the law every measurement
   * before that date was taken under. Comparing them by eye used to mean editing the constant and
   * waiting for a rebuild, which is a comparison nobody makes twice; two tabs on the same matchup
   * link is a comparison somebody actually makes.
   *
   * **It says so on the boot note, loudly, whenever it is not the shipped number.** A screen
   * running physics that is not the tree's physics and does not admit it is a screen that will
   * eventually be used to report a bug that does not exist. Anything unparseable is refused and
   * named rather than silently treated as zero, for the reason the matchup codec gives: a link
   * that half-decodes is a link that lies about what was fought.
   */
  /**
   * The link for a matchup, carrying whatever else the page was opened with.
   *
   * `matchupQuery` builds a query string from the matchup alone, and the three places below hand
   * it straight to `replaceState`, which replaces the *whole* query. So every parameter that is
   * not the matchup -- `drawFraction`, `tactic` -- was silently
   * dropped from the address bar the first time anybody touched the setup screen. The running page
   * was unaffected, because all four are read once at boot, which is exactly what made it hard to
   * notice: the screen kept doing what the link asked while the link stopped saying so, and a URL
   * copied out of that bar into a second tab quietly became a different page.
   */
  const bootExtras = [...query.entries()].filter(([key]) => key !== MATCHUP_PARAM);
  const linkFor = (matchup: Matchup): string => {
    const base = matchupQuery(matchup);
    if (bootExtras.length === 0) return base;
    return `${base}&${new URLSearchParams(bootExtras).toString()}`;
  };

  const SHIPPED_DRAW = CONFIG.combat.drawFraction;
  let drawNote = "";
  const drawAsked = query.get("drawFraction");
  if (drawAsked !== null) {
    const value = Number(drawAsked);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      drawNote = `The drawFraction link was refused -- "${drawAsked}" is not a number in 0..1.`
        + ` Running the shipped ${SHIPPED_DRAW}.`;
    } else if (value !== SHIPPED_DRAW) {
      CONFIG.combat.drawFraction = value;
      drawNote = `PHYSICS OVERRIDDEN: drawFraction ${value}, not the shipped ${SHIPPED_DRAW}.`
        + ` Cuts are paid for ${value === 0 ? "none" : `${Math.round(value * 100)} %`}`
        + ` of their slide. This is not what the tree ships.`;
    }
  }

  /**
   * `?tactic=chamberReach:-0.15,cutRoll:0` -- the sword's stroke shape, for the length of one page.
   *
   * **The same job as `?drawFraction=`, for the eight rows the tuner cannot reach.** Those rows are
   * read live out of `GOLEM_TACTICS` by `STROKE_SHAPES.sword`, which is exactly why no automatic
   * process re-reads them and why every sweep of them in `docs/measurements.md` had to be run by
   * hand. Three of them now move the alignment statistic by more than two standard deviations, and
   * none of that is a reason to change a constant: the phase's own finding is that better-aligned
   * is not the same as more dangerous, `strokeSeconds` being cleanly anti-correlated. A table
   * cannot settle that. The owner watching the same seed under two strokes might.
   *
   * **Every refusal is named and nothing half-applies.** An unknown row, a non-number, or a
   * duration at or below zero refuses the whole link rather than applying the rest of it, because a
   * page running three of the four numbers somebody asked for is a page that will be used to report
   * a result nobody can reproduce.
   *
   * **It says which minds it reaches, because it does not reach all of them.** A v2 mind --
   * `golem-fencer`, the matchup every measurement here is taken on -- reads the shape at stroke
   * time and sees this. A v3 mind on a committed arc runs `COMMITTED_SHAPES`, which spread the
   * getters at module load and so froze whatever the table held before this ran. See
   * `src/golem/stroke-rows.ts`; the note below says it on screen rather than leaving it to be
   * discovered by someone comparing two tabs that were never different.
   */
  const tactic = strokeLink(query.get("tactic"), (row) => GOLEM_TACTICS[row]);
  for (const { row, value } of tactic.apply) setLiveStrokeRow(GOLEM_TACTICS, row, value);
  const tacticNote = tactic.note;

  const opening = linked && linkRefusal === null ? linked : golemMatchup(defaultGolemSetup());
  let state = selectScreen(opening);
  /**
   * The parts bin: what this browser has taken off beaten golems, and nothing else.
   *
   * Built before the setup screen because the screen offers what is in it, and handed the shelf's
   * own predicate because `decodePartsBin` refuses a stored module id this build cannot make rather
   * than dropping it. `browserPartsBinStorage` answers null in every context that has no
   * `localStorage` or refuses to hand one over, and every read and write inside the bin is wrapped
   * -- a private window, cleared site data and a full quota are three failures with one honest
   * answer, which is an empty bin and a sentence on the screen.
   */
  const partsBin = new PartsBin(browserPartsBinStorage(), isGolemEffectorOption);
  /**
   * The screen's answer to "what should the arena show now".
   *
   * Every change a person makes on the screen lands here with the whole matchup. The state takes
   * it -- the screen is the phase's editor and `begin` reads the screen's selection anyway --
   * and the bodies standing between the panels are rebuilt **only when a body changed**: a
   * policy is a fact about who drives, and rebuilding two golems for it would be a flicker for
   * nothing. The link is rewritten on every change, so the address bar is always the pair on
   * screen and copying it is copying the matchup. Refused builds are not rebuilt, because
   * `buildBout` would throw on them; the Fight button is already disabled with the reason.
   */
  const bodies = (matchup: Matchup): string => JSON.stringify([
    matchup.left.unit, matchup.left.golem, matchup.left.handA, matchup.left.handB,
    matchup.right.unit, matchup.right.golem, matchup.right.handA, matchup.right.handB,
  ]);
  const onSelection = (matchup: Matchup): void => {
    if (state.phase !== "select") return;
    const changed = bodies(matchup) !== bodies(state.matchup);
    state = selectScreen(matchup);
    window.history.replaceState(null, "", linkFor(matchup));
    if (changed && setup.refusal === null) rebuild();
  };
  const setup = new SetupScreen(need("matchup"), state.matchup, beginButton, partsBin, onSelection);

  const controls = new Controls(canvas, {
    onReset: () => {
      // `R` means "this bout again" in both live and decided arenas. Behind the
      // setup screen it means nothing because there is no bout to rebuild. Setup
      // is an explicit pause-overlay action, not a phase-dependent second
      // meaning for this key.
      restartBout({ resume: true });
    },
    onToggleReadout: () => hud.toggle(),
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
    onOrderClick: (button, x, y) => {
      // A click orders the side a person commands, and nothing when nobody does: with two
      // policies fighting there is nobody to order, and the display draws no outline to say so.
      if (humanSide(state.matchup) === null) return;
      if (button === "primary" && orderDisplay.enemyAt(x, y)) {
        giveOrders(fightOrder(enemySide()));
        return;
      }
      const ground = orderDisplay.groundAt(x, y);
      if (!ground) return;
      giveOrders(button === "primary" ? moveOrder(person.current, ground) : attackMoveOrder(ground));
    },
    onHold: () => {
      if (humanSide(state.matchup) === null) return;
      giveOrders(holdOrder(person.current, groundOf(yours())));
    },
    onClearOrders: () => {
      if (humanSide(state.matchup) === null) return;
      giveOrders(null);
    },
  });

  /**
   * The person's orders, as a commander: one `StandingOrders` for the page, installed on whichever
   * side the matchup says a person commands and read by that body's driver at every decision.
   * Every other side takes its own auto-commander (`SideSetup.commander`), which by default is
   * attack-nearest and hands over no orders at all -- the bout without orders, to the bit.
   */
  const person = new StandingOrders();
  /** True while the steering keys are held, so their release can turn into a hold. */
  let steering = false;

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
  const damageFeedback = new DamageFeedback(arena.scene);
  const buildBout = (matchup: Matchup) => {
    const F = CONFIG.fighter;
    const leftDefinition = unitDefinition(matchup.left.unit);
    const rightDefinition = unitDefinition(matchup.right.unit);
    // Pair-atomic and decided before either body exists: a live pair never enables the supported
    // carrier on one side only.
    const locomotionMode = locomotionModeForPair(leftDefinition, rightDefinition);
    const locomotionWorld = locomotionMode === "supported" ? flatSupportedWorldRegistry() : undefined;
    const leftContext = {
        scene: arena.scene,
        side: "left",
        origin: Vector3.Zero(),
        facing: 0,
        policyName: matchup.left.policy,
        loadout: loadoutFor(matchup.left),
        golem: matchup.left.golem,
        materials: arena.materials,
        locomotionMode,
        locomotionWorld,
      } as const;
    const left = leftDefinition.build(leftContext);
    const rightContext = {
        scene: arena.scene,
        side: "right",
        origin: new Vector3(0, 0, F.separation),
        facing: Math.PI,
        policyName: matchup.right.policy,
        loadout: loadoutFor(matchup.right),
        golem: matchup.right.golem,
        materials: arena.materials,
        locomotionMode,
        locomotionWorld,
      } as const;
    let right;
    try {
      right = rightDefinition.build(rightContext);
    } catch (error) {
      // Pair mode is atomic before construction, but a backend/asset failure can still happen while
      // building the second body. A throwing constructor leaves no bout owner to release the first.
      left.dispose();
      throw error;
    }
    const leftStrikers = left.strikers;
    const rightStrikers = right.strikers;
    const recorder = new BoutRecorder();
    wireBoutRecorder(recorder, left, right);
    const sides = [
      { fighter: left, combat: new Combat("left", leftStrikers, combatRecorder(recorder, "left", event => damageFeedback.report(event, right))) },
      { fighter: right, combat: new Combat("right", rightStrikers, combatRecorder(recorder, "right", event => damageFeedback.report(event, left))) },
    ];
    // Each blade is pointed at the other body. The collision layers already say
    // the same thing in the solver; this says it again in the scoring.
    sides[0].combat.attach(right);
    sides[1].combat.attach(left);
    // Built once with the bout. Every point is a live Vector3 already owned by a body, so the
    // render loop follows both fighters without minting a target list every frame.
    const occlusionTargets: RoomOcclusionTarget[] = [
      ...left.occlusionPoints().map((point) => ({ point })),
      ...right.occlusionPoints().map((point) => ({ point })),
    ];
    return { left, right, sides, recorder, ending: new FightEnd(sides), occlusionTargets };
  };

  let bout = buildBout(state.matchup);

  /**
   * Who hands each body its orders, from the matchup: the person on the side they command, and the
   * side's auto-commander everywhere else. Called wherever the matchup or the bodies can move -- a
   * rebuild, taking command, standing down -- and it replaces both commanders every time, so a
   * `HoldHere` stood down from and taken up again holds where the body is now.
   */
  const installCommanders = (): void => {
    for (const side of ["left", "right"] as const) {
      const body = side === "left" ? bout.left : bout.right;
      body.control.commander = state.matchup[side].control === "you"
        ? person
        : autoCommander(commanderOf(state.matchup[side]));
    }
  };
  installCommanders();
  // The showcase is the arena with physics off, from the first frame: two bodies standing at
  // their marks exactly as built, with no gravity to sag them and no mind to move them, until
  // Fight enables the solver through `resumeHost`. `leave` puts it back this way.
  arena.scene.physicsEnabled = false;

  /**
   * The fighter you are looking through, and the one opposite it.
   *
   * Asked as a question every time rather than held, because both answers move:
   * the bout is rebuilt on every start, and which side is yours is a property of
   * the matchup rather than of the arena. Two policies default to the left one.
   */
  const observedSide = (): Side => humanSide(state.matchup) ?? "left";
  const yours = (): Combatant => (observedSide() === "right" ? bout.right : bout.left);
  const theirs = (): Combatant => (observedSide() === "right" ? bout.left : bout.right);

  const enemySide = (): Side => (observedSide() === "right" ? "left" : "right");
  /** A body's ground point, copied out of the `Vector3` so an order never holds a live one. */
  const groundOf = (body: Combatant): GroundPoint => {
    const feet = body.feetPosition();
    return { x: feet.x, z: feet.z };
  };
  /** The orders the commanded side is under, written by every gesture. */
  const giveOrders = (orders: Orders | null): void => {
    person.current = orders;
    steering = false;
  };

  /**
   * The diagnostics skim: extra fixed steps a frame, off by default.
   *
   * A `let` on the host rather than a number in `CONFIG`, because `AGENTS.md` has the rule and the
   * scar for it -- a constant tuned for one harness does not become a player's by living in
   * `config.ts` -- and this is neither a tuning surface nor a thing a bout should inherit. It is
   * put back to 1 by `leave`, so a fight started after a skimmed one runs in real time whether or
   * not anybody remembered to turn it off.
   */
  let skimSpeed = 1;
  const hud = new Hud(need("hud"), (speed) => {
    skimSpeed = SKIM_SPEEDS.includes(speed) ? speed : 1;
  }, (side) => {
    // Who commands is a choice made in the game, at any point of a bout -- a pause included, where
    // it only swaps commanders and nothing steps until resume. The button is "Stand down" on the
    // side you command.
    if (commandAction(humanSide(state.matchup), side) === "stand-down") standDownNow();
    else commandNow(side);
  });
  const aim = new AimIndicator(arena.scene);
  const orderDisplay = new OrderDisplay(arena.scene);
  const commandedBody = (): Combatant | null => humanSide(state.matchup) === null ? null : yours();
  orderDisplay.attach(commandedBody(), theirs());
  refreshShadowCasters(arena.scene, arena.shadows);

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
    // Before the bodies go: a stump's emitter is parented to the severed part's
    // mesh, and a node whose parent has been disposed does not go with it. It
    // stays exactly where it last stood, bleeding, for the rest of the run.
    damageFeedback.clear();
    hintLeft = CONFIG.bout.hintSeconds;

    for (const side of bout.sides) side.combat.dispose();
    bout.left.dispose();
    bout.right.dispose();
    bout = buildBout(state.matchup);
    // The bout again from nothing, orders included: a hold point from the last bout is a point on a
    // floor this one has not been told about.
    giveOrders(null);
    installCommanders();
    orderDisplay.attach(commandedBody(), theirs());
    refreshShadowCasters(arena.scene, arena.shadows);
    presentRebuiltFrame({
      placeCamera: () => placeCamera(yours(), 0, true),
      updateRoomOcclusion: () => arena.updateRoomOcclusion(bout.occlusionTargets),
      render: () => arena.scene.render(),
    });
  };

  /**
   * Taking command of a side, and standing down.
   *
   * Neither touches a mind: the body's own policy goes on driving it, and what moves is who hands
   * it orders. So there is nothing to seed and no handover to measure -- the continuity a puppet
   * takeover had to buy (`handover` in `mind.ts`) does not arise when the thing that changes is a
   * commander. A side taken up starts with no orders, which is the bout as it was.
   */
  const commandNow = (side: Side): void => {
    if (state.phase === "select") return;
    state = commandSide(state, side);
    giveOrders(null);
    installCommanders();
    orderDisplay.attach(commandedBody(), theirs());
  };

  const standDownNow = (): void => {
    if (state.phase === "select") return;
    state = standDown(state);
    giveOrders(null);
    installCommanders();
    orderDisplay.attach(commandedBody(), theirs());
  };

  /** The bout as the rules read it: two bodies, and the last blow each landed. */
  const ring = (): Ring => ({
    left: { parts: bout.left.limbs, lastBlow: bout.sides[0].combat.lastWound },
    right: { parts: bout.right.limbs, lastBlow: bout.sides[1].combat.lastWound },
  });

  /** What the last verdict handed over, for the banner. Empty when nothing was taken. */
  let salvageNotice = "";

  /**
   * The One Must Fall loop, closed at the verdict.
   *
   * **No in-arena pickup**, which is the session's own frozen choice: the winner collects here,
   * once, when the bout is decided. Picking a part up mid-bout is a later idea and is written down
   * as one in `docs/design.md` rather than built.
   *
   * Three things happen and they are deliberately in this order. Every bin entry that was **fitted**
   * onto the person's own golem reports what is left of it, so wear carries forward and a part
   * worn to nothing leaves the bin. If the person **won**, the beaten body's own module report is
   * put through the loot rule and whatever qualifies is appended. Then the matchup's own sockets
   * are re-pointed at what the bin now holds, so `R` refights with the arm as it is rather than as
   * it was -- and a socket whose entry is *gone* keeps its stale key on purpose, because the setup
   * screen refuses a build naming one by name and quietly making it a fresh module is the
   * substitution this whole session is written against.
   *
   * Only when a person is in the ring. "The winner collects" needs somebody to collect for, and a
   * bout of two policies has nobody.
   */
  const collectSalvage = (): void => {
    salvageNotice = "";
    const mine = humanSide(state.matchup);
    if (!mine) return;
    const ours = mine === "left" ? bout.left : bout.right;
    const theirs = mine === "left" ? bout.right : bout.left;
    const build = state.matchup[mine].golem;
    const ourModules = ours.moduleReport?.() ?? [];

    const fitted: FittedPart[] = [];
    const counted = new Set<string>();
    for (const socket of ["primary", "secondary"] as const) {
      const key = build?.[socket].salvage;
      // A two-socket terminal is one module named by both sockets, so the same entry must be
      // reported once. `counted` is what makes a mace one part rather than two.
      if (key === undefined || counted.has(key)) continue;
      counted.add(key);
      const found = ourModules.find((module) => module.slot === socket);
      if (!found) continue;
      fitted.push({ key, durability: found.durability, severed: found.severed });
    }

    const won = state.outcome?.winner === mine;
    const taken: readonly PartsBinTake[] = won ? partsBinLoot(theirs.moduleReport?.() ?? []) : [];
    partsBin.settle({ fitted, taken });

    let next = state.matchup;
    for (const socket of ["primary", "secondary"] as const) {
      const pick = build?.[socket];
      if (!pick || pick.salvage === undefined) continue;
      const held = partsBin.entry(pick.salvage);
      if (!held) continue;
      next = withGolemEffector(next, mine, socket, { ...pick, durability: held.durability },
        (candidate) => (golemEffector(candidate.chain, candidate.terminal)?.sockets ?? 1) === 2);
    }
    state = { ...state, matchup: next };

    if (taken.length > 0) {
      salvageNotice = `TAKEN &mdash; ${taken
        .map((part) => `${golemEffectorOption(part.id)?.label ?? part.id} at ${Math.round(part.durability * 100)}%`)
        .join(", ")}`;
    }
  };

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
      // Both command drivers are stopped. A projectile already away belongs to
      // the world after the verdict, while a surviving compound body may keep
      // an explicitly presentation-only whole-assembly hold. That seam cannot
      // submit an Action or move only one root out from under its joints.
      bout.left.stepProjectiles(FIXED_STEP);
      bout.right.stepProjectiles(FIXED_STEP);
      bout.left.stepPostVerdictPresentation?.(FIXED_STEP);
      bout.right.stepPostVerdictPresentation?.(FIXED_STEP);
    }
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
    get speed() { return skimSpeed; },
    setPhysics: (enabled) => { arena.scene.physicsEnabled = enabled; },
    startControls: () => controls.start(),
    pauseControls: () => controls.pauseCombat(),
    showPaused: (paused) => {
      damageFeedback.setPaused(paused);
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
    state = restartHost(state, runningHost, shouldResume);
  };

  /**
   * Replay against somebody new: the corner you drive stays exactly as it stands -- salvage and
   * all -- and the other one is redrawn, by the same `randomCorner` the setup screen's Randomize
   * uses. With nobody driving, the right corner is the one redrawn, because the left is the one
   * the camera follows. What waves mode used to be, as a click at the end of a bout rather than
   * a mode chosen before one; the queue, the run and the carried wear went with the mode.
   */
  const randomReplay = (): void => {
    if (state.phase === "select") return;
    const theirs: Side = humanSide(state.matchup) === "right" ? "left" : "right";
    const drawn = randomCorner(state.matchup, theirs, randomSeed());
    state = { ...state, matchup: fittedPolicy(drawn, theirs) };
    window.history.replaceState(null, "", linkFor(state.matchup));
    restartBout({ resume: true });
  };

  /** Back to the setup screen, from wherever you were. */
  const leave = (): void => {
    state = toSelect(state);
    // The skim is a thing you turn on to watch one bout, not a setting. Left standing it would
    // make the next fight -- possibly one somebody is playing -- run at four times the rate with
    // nothing on screen saying why, which is the shape of defect the pause/curtain entry in
    // `AGENTS.md` is about: a mode that outlives the screen it was chosen on.
    skimSpeed = 1;
    controls.pause();
    arena.scene.physicsEnabled = false;
    setup.show(state.matchup);
    presentation.showPaused(false);
    presentation.showSetup(true);
  };

  beginButton.addEventListener("click", () => {
    // `begin` refuses anywhere but the screen, so this phase test decides
    // whether a fresh bout has to be built rather than whether the transition is
    // allowed -- the rule and the wiring answer separately and agree.
    if (state.phase === "select") {
      const refusal = setup.refusal;
      if (refusal) {
        beginButton.title = refusal;
        return;
      }
      const chosen = setup.selection;
      state = begin(state, chosen);
      window.history.replaceState(null, "", linkFor(state.matchup));
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
  randomReplayButton.addEventListener("click", randomReplay);
  // Each verdict-bar button gives its focus straight back, or the next Enter or held Space presses
  // it again in the bout it just started.
  const once = (button: HTMLButtonElement, act: () => void): void => {
    button.addEventListener("click", () => {
      button.blur();
      act();
    });
  };
  once(boutEndReplay, () => restartBout({ resume: true }));
  once(boutEndRandom, randomReplay);
  once(boutEndLeave, leave);
  // Kept from `Controls`, which listens on the window: a press on the verdict bar is not an order
  // on the arena behind it. The release is let through, so a camera drag begun on the canvas still
  // ends over the bar.
  for (const kind of ["pointerdown", "pointermove"]) {
    boutEnd.addEventListener(kind, (event) => event.stopPropagation());
  }

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
  // The setup screen's How to play is the same sheet. Blurred on the way, for the reason the
  // arena's buttons are: a focused button is pressed again by Enter or a held Space.
  helpOpen.addEventListener("click", () => {
    helpOpen.blur();
    toggleHelp();
  });
  // What each policy fights like, one line apiece -- the glossary that used to sit on the setup
  // screen, now every policy the pickers can offer rather than two of them.
  helpPolicies.replaceChildren(...POLICIES.flatMap((policy) => {
    const name = document.createElement("dt");
    name.textContent = policy.label;
    const line = document.createElement("dd");
    line.textContent = policyLine(policy.name) ?? "";
    return [name, line];
  }));

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

  /**
   * Phase of the showcase camera's shallow sway, radians; see `placeCamera`.
   * It starts side-on with the left fighter on the left of the frame, which is the one bearing
   * at which the two contender panels and the two bodies between them read as the same pair.
   */
  let showcaseOrbit = 0;
  const showcaseMid = new Vector3();

  const placeCamera = (follow: CameraSubject, dt: number, snap: boolean): void => {
    const C = CONFIG.camera;
    const P = C[C.mode];

    // **The showcase framing, by phase and not by mode.** On the setup screen there is no fight to
    // follow, so the camera looks at the midpoint of the two fighters' feet and sways around
    // them, and `C.mode` -- a person's choice of how to watch a fight -- is not read and not
    // touched. The gesture state still applies: the wheel and an orbit drag work on the pair
    // exactly as they work on one fighter. The bearing carries over from frame to frame, so a
    // Randomize, whose rebuild snaps the camera, snaps it to where it already was.
    if (state.phase === "select") {
      const W = C.showcase;
      showcaseOrbit += dt * (Math.PI * 2) / W.orbitSeconds;
      const gesture = controls.camera;
      // A shallow sway keeps both contenders readable; manual orbit still covers every angle.
      const bearing = -Math.PI * .5 + Math.sin(showcaseOrbit) * .18 + gesture.yaw;
      forward.set(Math.sin(bearing), 0, Math.cos(bearing));
      const leftFeet = bout.left.feetPosition();
      const rightFeet = bout.right.feetPosition();
      showcaseMid.set(
        (leftFeet.x + rightFeet.x) / 2 + gesture.panX, 0, (leftFeet.z + rightFeet.z) / 2 + gesture.panZ,
      );
      orbitFraming(gesture, W.distance, W.height, orbit);
      cameraGoal
        .copyFrom(showcaseMid)
        .subtractInPlace(forward.scale(orbit.distance))
        .addInPlaceFromFloats(0, orbit.height, 0);
      lookGoal.copyFrom(showcaseMid).addInPlaceFromFloats(0, W.lookHeight, 0);
      const blend = snap ? 1 : 1 - Math.exp(-C.followResponse * dt);
      arena.camera.position.addInPlace(cameraGoal.subtract(arena.camera.position).scale(blend));
      focus.addInPlace(lookGoal.subtract(focus).scale(blend));
      arena.camera.setTarget(focus);
      return;
    }

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
      const world = follow.chaseRoot?.()?.getWorldMatrix() ?? null;
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
   * are doing. The commanded side's orders own the line as a level: they stand
   * for as long as they are in force, and with nobody commanding there is no
   * such line. The camera has no level worth showing -- which camera you are
   * looking through is the one piece of state already in front of you -- so it
   * borrows the line as a notice that expires.
   *
   * The colour follows the verdict alone. One banner, one colour.
   */
  let cameraNotice = "";
  let noticeLeft = 0;
  /**
   * Seconds left on the orders hint.
   *
   * A key on a screen you dismissed to start playing is a key nobody has, so the hint shows for a
   * few seconds at the start of each bout while nobody commands a side, last in the banner's
   * priority list so it can never cover a verdict, and it is gone by the time anything is happening.
   */
  let hintLeft = 0;
  let shownBanner = "";

  const announceCamera = (): void => {
    const C = CONFIG.camera;
    cameraNotice =
      C.mode === "fixed"
        ? `CAMERA FIXED &mdash; bearing ${Math.round((C.fixedBearing * 180) / Math.PI)}&deg;`
        : "CAMERA OVERHEAD &mdash; behind the fighter";
    noticeLeft = C.noticeSeconds;
  };

  /**
   * What each side is asking the executor for, for the readout.
   *
   * **Read off `GolemDriven` and off the bout's own engagement record, and nothing is computed
   * here.** The command is the one in force -- the last ask, clamped -- and the gap is the one the
   * pilot was handed on that ask, so the asked stand-off and the held stand-off are two readings
   * from the same instant rather than one from the mind and one from the world.
   *
   * A mind with no `driven` contributes no entry and its half of the panel is empty. That is every
   * hand-coded style below the fourth executor.
   */
  /**
   * The last ask count and the wall-clock instant it was read at, per side, and the rate between.
   *
   * A rate rather than an average, for the reason `CommandSideReadout.asksPerSecond` gives: the
   * mind is stepped by the physics observable and the bout clock is the clamped frame delta, so
   * the two disagree by however much this host is dropping. The smoothing is a plain one-pole
   * filter on a window that is one frame wide, and it is reset with the rest of the readout when a
   * body is rebuilt because the counter behind it belongs to a mind that no longer exists.
   */
  const askRate: Record<Side, { asks: number; at: number; rate: number }> = {
    left: { asks: 0, at: 0, rate: 0 },
    right: { asks: 0, at: 0, rate: 0 },
  };
  const askedPerSecond = (side: Side, asks: number): number => {
    const seen = askRate[side];
    const now = performance.now();
    if (seen.at === 0 || asks < seen.asks) {
      askRate[side] = { asks, at: now, rate: 0 };
      return 0;
    }
    const seconds = (now - seen.at) / 1000;
    if (seconds < 1e-3) return seen.rate;
    const sampled = (asks - seen.asks) / seconds;
    const rate = seen.rate === 0 ? sampled : seen.rate + (sampled - seen.rate) * 0.25;
    askRate[side] = { asks, at: now, rate };
    return rate;
  };

  const commandReadout = (): CommandReadout => {
    const sides: CommandSideReadout[] = [];
    for (const side of ["left", "right"] as const) {
      const body = side === "left" ? bout.left : bout.right;
      const mind = body.humanDriver?.mind as (Mind & { driven?: GolemDriven }) | undefined;
      const driven = mind?.driven;
      if (!mind || !driven) continue;
      const engagement = bout.recorder.engagement[side];
      const theirReach = driven.reading.theirReach;
      sides.push({
        side,
        mind: mind.name,
        standOff: driven.command.standOff,
        // The same coordinate the command is written in -- multiples of *their* published reach --
        // because the whole value of the pair is that the two numbers can be subtracted.
        heldOff: theirReach > 1e-6 ? driven.reading.gap / theirReach : 0,
        advance: driven.command.advance,
        strafe: driven.command.strafe,
        lean: driven.command.lean,
        commit: driven.command.commit,
        abort: driven.command.abort,
        parry: driven.command.parry,
        phase: driven.phase,
        stance: driven.stance,
        asksPerSecond: askedPerSecond(side, driven.asks),
        stallSeconds: engagement.nearRangeStallSeconds,
        outsideReachSeconds: engagement.retreatOutsideReachSeconds,
      });
    }
    return { skim: skimSpeed, sides };
  };

  engine.runRenderLoop(() => {
    const rawDeltaMs = engine.getDeltaTime();
    const dt = Math.min(rawDeltaMs / 1000, CONFIG.world.maxFrameSeconds);
    if (dt <= 0) return;

    runHostFrame(runningHost, (step) => {
      // The skim's extra steps, and the reason they cannot change the step.
      //
      // At speed 1 this branch never runs and the frame is the frame it always was: the work
      // below, then `scene.render()`, which advances physics off the engine's own delta. Above 1,
      // every run after the first has to advance the world itself, and it does it exactly as
      // `scripts/bout-runner.mjs` does -- bump the render id, then call the millisecond-valued
      // `_advancePhysicsEngineStep`, which runs Babylon's fixed sub-step accumulator and notifies
      // `onBeforePhysicsObservable` before each solver step. The solver's step is whatever
      // `setSubTimeStep` fixed it at and is untouched; what changes is how many of them a rendered
      // frame contains. `AGENTS.md`'s variable-timestep trap is the other thing, and it cost two
      // sessions: scaling the delta handed to the solver is measured at 40 mm of tip wander.
      //
      // The render id has to move with it, or every world matrix read this frame freezes at its
      // first sample -- the same trap the headless bench carries a line for.
      if (step > 0) {
        const internals = arena.scene as unknown as {
          _renderId: number;
          _advancePhysicsEngineStep(milliseconds: number): void;
        };
        internals._renderId += 1;
        internals._advancePhysicsEngineStep(1000 * dt);
      }
      const steer = controls.sample(dt);
      const commanded = commandedBody();
      if (commanded && (steer.forward !== 0 || steer.strafe !== 0)) {
        // WASD steers in the camera's frame: a destination a step ahead of the body, renewed every
        // frame the keys are held. The frame is the camera's own look direction on the floor.
        const point = steerPoint(groundOf(commanded),
          { x: focus.x - arena.camera.position.x, z: focus.z - arena.camera.position.z }, steer);
        if (point) {
          person.current = moveOrder(person.current, point);
          steering = true;
        }
      } else if (commanded && steering) {
        // Letting go of the keys holds the ground the body is on, rather than a point a step
        // beyond it that it would walk on to.
        giveOrders(holdOrder(person.current, groundOf(commanded)));
      }
      orderDisplay.update(dt, commanded ? person.current : null);
      for (const side of bout.sides) side.combat.advance(dt);
      // After `advance`, so a report filed this frame is already timestamped.
      damageFeedback.update(dt);
      // The rules get the rendered frame's delta, which is the same clock
      // `Combat` counts on, so the cap and a report's timestamp are comparable.
      // Only while the fight is actually running: an arena paused in place
      // must not quietly run out its ten-minute safety cap.
      const wasFighting = state.phase === "fight";
      state = advanceFight(state, ring(), dt, bout.ending);
      // The verdict edge, and the only place the parts bin is written. Read from the phase pair
      // rather than from the outcome, because an outcome stays set for as long as the bout is over
      // and collecting once per frame from then on would fill the bin with the same arm forever.
      if (wasFighting && state.phase === "over") {
        collectSalvage();
      }
      // Observers remain installed after the verdict: blood, corpse integration,
      // rendering and camera all continue after attack authority has ended.
      const driven = yours();
      aim.update(driven.feetPosition(), driven.aimPoint());
    }, () => {
      // Camera gestures remain presentation while paused. Their own clock is the
      // bounded render delta, never the bout clock, so orbit/pan/zoom can reframe
      // a screenshot without advancing a mind, a motor, blood or the timeout.
      if (!controls.isActive) controls.sampleCamera(dt);
      placeCamera(yours(), dt, false);
      arena.updateRoomOcclusion(bout.occlusionTargets);
    });
    arena.scene.render();

    const timers = advanceActiveHostTimers(runningHost, {
      camera: noticeLeft,
      hint: hintLeft,
      hand: 0,
    }, dt);
    noticeLeft = timers.camera;
    hintLeft = timers.hint;
    if (noticeLeft === 0) cameraNotice = "";

    const decided = state.outcome;
    // The verdict bar owns its own element and nothing else: it never touches the curtain, the
    // pause menu or a disclosure, and it is up for exactly as long as the bout is decided.
    boutEnd.classList.toggle("gone", state.phase !== "over");
    const banner = [
      decided
        ? `BOUT OVER &mdash; ${decided.text}`
        : "",
      // What the winner kept, beside the verdict that earned it and never without one.
      decided ? salvageNotice : "",
      // The commanded side's orders, as a level: they stand for as long as they are in force.
      !decided && humanSide(state.matchup) !== null ? ordersText(person.current) : "",
      cameraNotice,
      // Last, and silent the moment anything else has something to say.
      hintLeft > 0 && !decided && humanSide(state.matchup) === null ? HINT_TEXT : "",
    ]
      .filter((part) => part !== "")
      .join(" &middot; ");
    if (banner !== shownBanner) {
      shownBanner = banner;
      modeLine.innerHTML = banner;
      modeLine.classList.toggle("on", banner !== "");
      modeLine.classList.toggle("decided", decided !== null);
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

    const driven = yours();
    const strike = driven.strikeReadout?.() ?? null;
    hud.update(
      {
        fps: engine.getFps(),
        physicsMs,
        // Both from the body, which is what let the readout follow a golem without the host
        // learning what a golem's business end is. A body with nothing to report answers absent
        // and both gauges read zero, exactly as they did for a Warrior holding nothing.
        tipSpeed: strike?.tipSpeed ?? 0,
        edgeAlignment: strike?.edgeAlignment ?? 0,
        meshes: arena.scene.meshes.length,
        driving: humanSide(state.matchup),
        command: commandReadout(),
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
  // prototype. Anything the solver caches natively -- a motor ceiling, chiefly --
  // does not move until something re-applies it. `__sword.left.applyTuning()` was
  // the humanoid fighter's way of doing that and went with it on 2026-09-18; a
  // golem's `applyTuning` lives per arm chain on `AnchorDrive` and no one call
  // reaches every chain, so a rebuild with `R` is the reliable way for now.
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
  //     __sword.right.control.installPolicy("golem-duelist")
  //
  // `__sword.right.view` is what any such mind is being shown, and `__sword.orders` is the
  // person's orders: `__sword.orders.current = { target: null, destination: { x: 1, z: 2 } }`.
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
      /**
       * The raw engagement record for each side of the current bout.
       *
       * The gate rows and the human-facing table went with `src/learning/` on 2026-09-04;
       * the instrument itself is salvaged to `src/engagement.ts` and is what both the page
       * and the bench still record through, so this stays as the console's way of reading it.
       */
      get engagement() {
        return Object.freeze({ engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
          left: bout.recorder.records.left, right: bout.recorder.records.right });
      },
      /** Phase, matchup, clock and outcome -- the whole of what `bout.ts` owns. */
      get state() {
        return state;
      },
      /**
       * The person's orders, and who commands which side. `current` is what the commanded side's
       * body reads at its next decision; `command(side)` and `standDown()` are the HUD's buttons.
       */
      orders: {
        get current(): Orders | null {
          return person.current;
        },
        set current(orders: Orders | null) {
          giveOrders(orders);
        },
        command: (side: Side) => commandNow(side),
        standDown: () => standDownNow(),
        get commanders(): Record<Side, string | null> {
          return {
            left: bout.left.control.commander?.name ?? null,
            right: bout.right.control.commander?.name ?? null,
          };
        },
      },
      controls,
      setup,
      damageFeedback,
      config: CONFIG,
    },
  });

  bootNote.textContent = [
    linkRefusal === null
      ? "Havok ready."
      : `Havok ready. The link was refused and the showcase pair is shown instead: ${linkRefusal}`,
    drawNote,
    tacticNote,
  ].filter((part) => part !== "").join(" ");
  // Anything past "Havok ready." is a refused link or an overridden constant, and is read whole:
  // the footer's one quiet line becomes as many as it takes.
  bootNote.classList.toggle("notice", bootNote.textContent !== "Havok ready.");
  // Fight is the screen's to enable from here on, and a link can arrive refused.
  const refusal = setup.refusal;
  beginButton.disabled = refusal !== null;
  beginButton.title = refusal ?? "";
  presentation.showSetup(true);
  presentation.showPaused(false);
}

/** Called by `src/app.ts` once the arena's screen is mounted. Importing this module boots nothing. */
export function bootArena(): Promise<void> {
  return boot().catch((error: unknown) => {
    const note = document.getElementById("boot-note");
    if (note) {
      note.classList.add("error");
      note.textContent = error instanceof Error ? error.message : String(error);
    }
    // eslint-disable-next-line no-console
    console.error(error);
  });
}
