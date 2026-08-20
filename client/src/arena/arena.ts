// The Battle Arena: two loadouts, one fight, and five viewpoints of it.
//
// This is `web/fight.html` moved inside the studio shell and rewritten against
// `FightSource`, and the rewrite is the point of the session. The old page read
// a `Trace` -- a JSON file with every frame in it -- and threaded that object
// through every panel, so the panels knew they were looking at a recording.
// Nothing here does. `frameAt(i)` and `frameCount()` are the only two questions
// asked about time, and session 07 answers them from a worker's transferred pose
// buffers without a panel changing.
//
// **The numbers on screen are the simulation's own.** Where a value is derived --
// the chase error, the arm extension ratio -- the derivation is one subtraction
// over two published points, and it says so.
//
// **What the shell requires of this module.** `mount` is handed the cloned
// `<template id="route-arena">` subtree, not the document, so every lookup here
// is scoped to that element: the shell can have a stale route's nodes still
// attached while a new one mounts, and `document.getElementById` would happily
// find the wrong one. `dispose` gives back everything that outlives the subtree:
// the rAF loop, the `ResizeObserver`, the `window` keydown listener and the
// download still in flight. The old page leaked all four and got away with it
// only because a page unload is the crudest possible teardown.
//
// **`mount` resolves before the fight does.** It has to: a fight is either an
// 8-9 MB fetch or four tenths of a second of simulation in a worker, and a
// handle the shell cannot hold for the duration of either is a route it cannot
// take down. So this returns an empty arena that says what it is waiting for,
// and the fight arrives into a route that is already mounted or is already gone.
//
// **[Run selected fight] runs the fight, since v2-ui-07.** It was a recording loader for two
// sessions and the picker said so in words; it now writes 120 bytes of
// configuration, hands them to a worker, and adopts the pose, region and
// combat-event buffers that come back. A trace is still watchable through the
// `?trace=` deep link, and that is not legacy: `lab trace` writes the contact
// velocities, the impulses and the group alphas that the published event row
// does not carry, so a recorded fight is the only place `closureSpeed()` has an
// answer.

import type { RouteHandle } from "../studio.js";
import { buildSeries, drawChart, frameAt as frameAtClick, type Series } from "../fight/chart.js";
import { loadTraceSource, type FightFrame, type FightHeader, type FightSource } from "../fight/source.js";
import {
  at, closureSpeed, length, share, sub, TraceSchemaMismatch, TraceUnavailable,
  type Contact, type Pose, type V3,
} from "../fight/trace.js";
import {
  bodyColours, contactColour, drawScene, elevationCamera, planCamera, type Options,
} from "../fight/view.js";
import { ArenaClient, ArenaRefused } from "../runtime/arena-client.js";
import { ANATOMIES } from "../runtime/arena-config.js";
import { ARENA_STREAM_LEAD_TICKS, TICKS_PER_SECOND } from "../protocol/messages.js";
import { createSimWorker } from "../runtime/sim-worker.js";
import {
  arenaConfigOf, checkpointCopy, missingRecording, pickerControls, populatePolicies, readMatchup,
  humanArmOf, recordingMismatch, resolveRecording, review, showOffHandRows, showPolicies, summariseMatchup,
} from "./picker.js";
// Type-only, and that matters: a value import of `./scene.js` would pull Babylon
// into this route's first chunk and make the 8 MB recording wait behind it.
import type { ArenaMode, ArenaStage } from "./scene.js";
import { ArenaInput, TOUCH_PINCH_SPREAD_RATIO } from "./arena-input.js";
import { ControlledClock } from "./controlled-clock.js";
import { createHandReticle } from "./hand-reticle.js";

const ONE = 65536;

function element<T extends HTMLElement>(root: HTMLElement, id: string): T {
  const found = root.querySelector(`#${id}`);
  if (found === null) throw new Error(`#${id} is missing from the arena template`);
  return found as T;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error(`#${canvas.id} has no 2d context`);
  return ctx;
}

/**
 * Match the backing store to the panel, and draw in CSS pixels regardless.
 *
 * A canvas left at its attribute size and stretched by CSS resamples every line
 * it draws, which here would blur exactly the thing being looked at: a blade a
 * fortieth of a unit thick, against a body a third of a unit wide.
 */
function prepare(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): readonly [number, number] {
  const bounds = canvas.getBoundingClientRect();
  const density = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  if (canvas.width !== width * density || canvas.height !== height * density) {
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
  }
  ctx.setTransform(density, 0, 0, density, 0, 0);
  return [width, height];
}

function units(raw: number, digits = 3): string {
  return (raw / ONE).toFixed(digits);
}

/** A body-relative arm velocity plus its body's, which is what the hand does. */
function handSpeed(pose: Pose, limb: 0 | 1): number {
  const arm = pose.arms[limb];
  return length([
    pose.vel[0] + arm.vel[0], pose.vel[1] + arm.vel[1], pose.vel[2] + arm.vel[2],
  ]);
}

function poseOf(frame: FightFrame, body: number): Pose | undefined {
  return frame.poses.find((pose) => pose.id[0] === body);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function describeContact(fight: FightHeader, contact: Contact): string {
  const kind = fight.contactKinds[contact.kind] ?? `kind ${contact.kind}`;
  const region = contact.region === fight.noRegion
    ? "no region"
    : fight.regionNames[contact.region] ?? `region ${contact.region}`;
  const slot = (id: readonly [number, number], value: number): string =>
    `${id[0]}${value === fight.bodySlot ? " body" : `/${value}`}`;
  const wound = contact.cut + contact.thrust;
  const allocated = share(contact);
  const closing = closureSpeed(contact);
  return [
    `<span style="color:${contactColour(contact.kind)}">${kind}</span>`,
    `${slot(contact.a, contact.aSlot)} &rarr; ${slot(contact.b, contact.bSlot)} (${region})`,
    // The per-fact share and the floor it is charged, side by side, because the
    // difference between them is the whole question this panel was opened to ask.
    // The group ledger is printed after and named as a group, so nobody reads
    // its much larger number as this contact's.
    // **Unavailable rather than zero on a live fight.** `ContactResolution`
    // carries a velocity per side and the published 32-word event row carries
    // neither, so a live source answers null -- and a zero closing speed is a
    // measurement, not an absence. Growing the row would move
    // `COMBAT_EVENT_LAYOUT_VERSION` and `ARTICULATED_STREAM_DIGEST`, which
    // belongs to a session that wants the columns.
    closing === null ? '<span class="muted">closing: not published</span>' : `closing ${units(closing)}`,
    allocated === 0
      ? "no wound channel"
      : `share ${allocated} vs floor ${fight.contactEnergyFloor}`,
    `cut ${contact.cut} thrust ${contact.thrust} pressure ${contact.pressure}`,
    `<span class="muted">group ${contact.groupBefore} &rarr; ${contact.groupAfter}</span>`,
    wound > 0 ? "<b>wounding</b>" : "",
    contact.severed ? "<b>SEVERED</b>" : "",
  ].filter((part) => part !== "").join(" &middot; ");
}

function describeBody(fight: FightHeader, frame: FightFrame, index: number): string {
  const pose = poseOf(frame, index);
  const info = fight.bodies[index];
  if (pose === undefined || info === undefined) return "";
  const colour = bodyColours(index);
  // `World::health_fraction` is a **faction** aggregate -- every slot of that
  // faction over that faction's total maxima. On this fixture there is one body
  // a side so it reads as a per-body number, and on any fixture with two it
  // would not. Labelled as what it is, with this body's own published integrity
  // and wound rows underneath, which are per body and per region.
  const faction = index === 0 ? frame.health[0] : frame.health[1];

  const arms = pose.arms.map((arm, limb) => {
    const hint = fight.hintNames[at(pose.hints, limb)] ?? "?";
    // How far the actuator is from where it was told to be. The commanded hand
    // and the actual hand are both published, so this is a difference and not a
    // model of one -- and it is the number that says whether the arm can keep up.
    const chase = length(sub(arm.target, arm.hand));
    // The arm capsule is shoulder to hand, so its own length is the extension.
    // Divided by the anatomy's arm length, this is the ratio the v2-17 ledger
    // has open: `reach` is horizontal only, so a low hand stretches the limb.
    const region = pose.regions[limb === 0 ? 2 : 3];
    const extension = region === undefined
      ? 0
      : length(sub(region.upper, region.lower)) / info.anatomy.armLength;
    const weapon = pose.weapons[limb];
    return [
      `  arm ${limb === 0 ? "left " : "right"} ${hint.padEnd(9)}`,
      `chase ${units(chase)}`,
      `speed ${units(handSpeed(pose, limb === 0 ? 0 : 1))}`,
      `reach ${extension.toFixed(2)}x`,
      `fatigue ${units(arm.fatigue, 2)}`,
      weapon === null || weapon === undefined ? "" : `tip z ${units(weapon.tip[2], 2)}`,
    ].filter((part) => part !== "").join("  ");
  });

  const severed = fight.regionNames
    .filter((_, part) => (pose.severed & (1 << part)) !== 0)
    .join(", ");

  // Per region and per body, unlike the faction fraction above. A region reads
  // `intact` only when it has lost neither structure nor blood to an open wound.
  const regions = fight.regionNames.map((name, part) => {
    const integrity = pose.integrity[part] ?? 0;
    const open = pose.wound[part] ?? 0;
    if (integrity >= ONE && open === 0) return "";
    return `${name} ${units(integrity, 2)}${open === 0 ? "" : ` (wound ${units(open, 2)})`}`;
  }).filter((part) => part !== "");

  // **Which policy is driving this body**, from the header rather than from the
  // slot number. It is one word and it is the difference between watching a
  // fight and watching *the learned policy's* fight: with a checkpoint on one
  // side and a script on the other, "why did it do that" has two completely
  // different answers depending on which body is being asked about.
  const driver = info.faction === "Heroes" ? fight.heroes : fight.monsters;
  return [
    `<b style="color:${colour.edge}">${escapeHtml(info.kind)}</b> `
      + `<span class="muted">${escapeHtml(info.faction)}, slot ${index}, `
      + `driven by ${escapeHtml(driver)}</span>`,
    `  faction health ${units(faction)}  blood ${units(pose.blood, 2)}`
      + `  shock ${units(pose.shock, 2)}`
      + `  intent ${pose.intent}${pose.target === null ? "" : ` ${pose.target[0]}`}`,
    `  at ${units(pose.body[0], 2)}, ${units(pose.body[1], 2)}`
      + `  yaw ${((pose.yaw / ONE) * 360).toFixed(0)}deg`
      + `  speed ${units(length(pose.vel))}`,
    ...arms,
    regions.length === 0 ? "  every region intact" : `  ${regions.join("  ")}`,
    severed === "" ? "" : `  <b>severed: ${severed}</b>`,
  ].filter((line) => line !== "").join("\n");
}

/** The one line that says which fight this is, from the header alone. */
function describeFight(fight: FightHeader): string {
  // **Both sides, always, even when they are the same.** A learned fight is the
  // first trace whose two bodies are driven by different things, and "learned"
  // alone would leave a reader to assume the opponent was the composed script
  // when it might have been the windmill or a phase-randomised control. The
  // checkpoint digest rides along for the same reason: it is what says *which*
  // learned policy, and two checkpoints an hour apart are not the same fighter.
  const sides = fight.heroes === fight.monsters
    ? escapeHtml(fight.heroes)
    : `${escapeHtml(fight.heroes)} <span class="muted">vs</span> ${escapeHtml(fight.monsters)}`;
  return [
    `<b>${escapeHtml(fight.scenario)}</b> seed ${fight.seed}, ${sides}`,
    fight.checkpoint === null ? "" : `checkpoint ${escapeHtml(fight.checkpoint.slice(0, 12))}`,
    fight.mirrored ? "mirrored" : `fingerprint ${escapeHtml(fight.fingerprint ?? "none")}`,
    // **A fight in progress reports no outcome rather than inventing one.**
    // `header.outcome` is `null` until the producer says the fight stopped, and
    // the two dishonest alternatives are both worse: a default string claims a
    // result that has not happened, and printing the absent field puts the word
    // `undefined` in front of a reader. `sim` has no word for an undecided
    // fight either -- `World::outcome` answers `None` -- so this sentence is
    // the studio's own and does not pretend to be an `Outcome`.
    fight.outcome === null
      ? `still fighting at tick ${fight.ticks}`
      : `${escapeHtml(fight.outcome)} at tick ${fight.ticks}`,
    fight.outcome === null
      ? ""
      : (fight.timedOut ? "<b>the clock decided it</b>" : "a body decided it"),
    fight.truncated ? `<b>recording truncated to ${fight.frameCount} frames</b>` : "",
  ].filter((part) => part !== "").join(" &middot; ");
}

interface State {
  frame: number;
  playing: boolean;
  rate: number;
  span: number;
  azimuth: number;
}

/** A fight and the two time series built over it, which change together. */
interface Loaded {
  readonly source: FightSource;
  /**
   * Extended rather than replaced as a streamed fight grows.
   *
   * Mutable because `buildSeries` appends to the object it is given: rebuilding
   * from frame 0 once a chunk is what makes the chart quadratic in the number of
   * chunks, which at `ARENA_STREAM_CHUNK_TICKS` is 121 of them a duel.
   */
  series: Series;
}

export async function mount(container: HTMLElement, params: URLSearchParams,
  testStage?: () => Promise<ArenaStage>): Promise<RouteHandle> {
  const status = element<HTMLElement>(container, "status");

  const plan = element<HTMLCanvasElement>(container, "plan");
  const elevation = element<HTMLCanvasElement>(container, "elevation");
  const chart = element<HTMLCanvasElement>(container, "chart");
  // Deliberately no `getContext("2d")` on this one. A canvas that has handed out
  // a 2D context can never hand out a `webgl2` one, so v2-ui-01's placeholder
  // fill was a one-way door and this session walks through it rather than
  // drawing beside it.
  let stageCanvas = element<HTMLCanvasElement>(container, "arena-3d");
  const foundStageHost = stageCanvas.parentElement;
  if (foundStageHost === null) throw new Error("#arena-3d has no stage host");
  const stageHost: HTMLElement = foundStageHost;
  const stageLabel = element<HTMLElement>(container, "label-three-quarter");
  const planCtx = context(plan);
  const elevationCtx = context(elevation);
  const chartCtx = context(chart);

  const scrub = element<HTMLInputElement>(container, "scrub");
  const readout = element<HTMLElement>(container, "readout");
  const contactList = element<HTMLElement>(container, "contacts");
  const tickLabel = element<HTMLElement>(container, "tick");
  const playButton = element<HTMLButtonElement>(container, "play");
  const rateInput = element<HTMLSelectElement>(container, "rate");
  const spanInput = element<HTMLInputElement>(container, "span");
  const spanOwner = element<HTMLElement>(container, "arena-span-owner");
  const followInput = element<HTMLSelectElement>(container, "arena-follow");
  const viewInput = element<HTMLSelectElement>(container, "arena-view");
  const refitButton = element<HTMLButtonElement>(container, "arena-refit");
  const azimuthInput = element<HTMLInputElement>(container, "azimuth");
  const fightButton = element<HTMLButtonElement>(container, "fight");
  const pickerMessage = element<HTMLElement>(container, "picker-message");
  const pickerSides = element<HTMLElement>(container, "picker-sides");
  const pickerFooter = element<HTMLElement>(container, "picker-footer");
  const pickerSummary = element<HTMLElement>(container, "picker-summary");
  const matchupSummary = element<HTMLElement>(container, "matchup-summary");
  const changeMatchup = element<HTMLButtonElement>(container, "change-matchup");
  const modeTexture = element<HTMLButtonElement>(container, "mode-texture");
  const modeGeometry = element<HTMLButtonElement>(container, "mode-geometry");
  const takeControls = element<HTMLButtonElement>(container, "take-controls");
  const controlStatus = element<HTMLElement>(container, "control-status");
  const eyesButton = element<HTMLButtonElement>(container, "arena-eyes");
  const plansButton = element<HTMLButtonElement>(container, "arena-plans");
  const replayButton = element<HTMLButtonElement>(container, "arena-replay");
  const detailsButton = element<HTMLButtonElement>(container, "arena-details");
  const plansPanel = element<HTMLElement>(container, "arena-plans-panel");
  const replayPanel = element<HTMLElement>(container, "arena-replay-panel");
  const replayControls = element<HTMLElement>(container, "arena-replay-controls");
  const detailsPanel = element<HTMLElement>(container, "arena-details-panel");
  const healthA = element<HTMLProgressElement>(container, "arena-health-a");
  const healthB = element<HTMLProgressElement>(container, "arena-health-b");
  const cameraModeInput = element<HTMLSelectElement>(container, "arena-camera-mode");
  const timeLimitInput = element<HTMLSelectElement>(container, "arena-time-limit");
  const resetPreviewButton = element<HTMLButtonElement>(container, "arena-reset-preview");

  const toggles = {
    showRegions: element<HTMLInputElement>(container, "show-regions"),
    showTargets: element<HTMLInputElement>(container, "show-targets"),
    showVelocity: element<HTMLInputElement>(container, "show-velocity"),
    showContacts: element<HTMLInputElement>(container, "show-contacts"),
  };

  const state: State = { frame: 0, playing: false, rate: 1, span: 6 * ONE, azimuth: 0 };
  let loaded: Loaded | null = null;
  /**
   * The worker is still making frames for the fight on screen.
   *
   * A page-level flag rather than `source.finished`, and the difference is a
   * cancel: a stopped fight never receives an `arenaFinished`, so a playhead
   * that waited on the source alone would say "being produced" for as long as
   * the route stayed open. This is false the moment `run` settles, however it
   * settled.
   */
  let producing = false;
  /**
   * Production is behind the playhead, and the page says so rather than
   * stuttering.
   *
   * A page that silently stops advancing is indistinguishable from one that
   * crashed, which is why this is shown and not hidden.
   */
  let starving = false;
  /** A chunk has landed since the last draw, so a paused chart is stale. */
  let grown = false;
  /** Milliseconds from the press to the first drawn frame, and to the last. */
  let firstFrameMs: number | null = null;
  let producedMs: number | null = null;
  /** The 3D panels, once their engine exists. Null while it is being built. */
  let stage: ArenaStage | null = null;
  /**
   * Which of `[Texture]`/`[Geometry]` is pressed, whether or not there is a
   * stage to have heard about it.
   *
   * **The buttons answer before the stage exists and the answer has to survive
   * until it does.** `startStage` is a dynamic chunk import plus an adapter
   * request, so there is a real window between `setMode("geometry")` at the
   * bottom of this route and `stage = built`; a press landing in it used to set
   * `aria-pressed` and reach nothing, leaving `[Texture]` reading pressed over a
   * `[Geometry]` scene -- and pressing it again did nothing, because the button
   * already said pressed. So the pressed mode is held here and applied to the
   * stage the moment there is one.
   */
  let mode: ArenaMode = "geometry";
  /**
   * The load in flight, or null.
   *
   * One controller per load and not one per route, because [Run selected fight] pressed
   * twice is the same problem as a navigation: the second 8 MB fetch must
   * cancel the first rather than race it into `adopt`.
   */
  let inFlight: AbortController | null = null;
  let disposed = false;
  /**
   * The worker that records live fights, built on the first [Run selected fight] and reused.
   *
   * One per mounted route rather than one per fight: instantiating `web.wasm`
   * and warming `init` costs more than the fight does. Null until
   * something asks for a fight, so a reader who only ever opens a trace never
   * pays for a wasm instantiation at all.
   */
  let arena: ArenaClient | null = null;
  const arenaInput = new ArenaInput();
  const handReticle = createHandReticle(stageHost);
  let capture: "none" | "pending" | "mouse" | "touch" = "none";
  let pendingCapture: "mouse" | "touch" | null = null;
  let pendingMatchup: string | null = null;
  let captureRequest = 0;
  let primaryArmLost = false;
  let pointerLockTimer: number | null = null;
  const touchPoints = new Map<number, readonly [number, number]>();
  let touchCentroid: readonly [number, number] | null = null;
  let touchSpread = 0;
  let touchMode: "cut" | "extend" | "pinch" | null = null;
  let touchPinchEligible = false;
  const touchContributors = new Set<number>();
  let touchWindowStarted = 0;
  const controlledClock = new ControlledClock(performance.now());
  let controlledFaction: 0 | 1 | null = null;
  let controlledStopped = true;
  let stagingNeutral: Promise<number> | null = null;
  /** One token per [Run selected fight]. Only the newest press may write to the panels. */
  let fightAttempt = 0;

  function setPickerValue(id: string, value: string): void {
    element<HTMLInputElement | HTMLSelectElement>(container, id).value = value;
  }

  /** The two-handed checkboxes carry state in `checked`, not `value`. */
  function clearTwoHanded(): void {
    for (const id of ["a-two-handed", "b-two-handed"]) {
      element<HTMLInputElement>(container, id).checked = false;
    }
  }

  /**
   * The controls the page opens with.
   *
   * **`tactical` against `scripted`, and the pairing is the point.** It was
   * `attack-moves` on both sides, then `tactical` on both sides from v2-ui-08 --
   * the argument each time being that a first look should not open on the entry
   * least likely to land a blow, which is why `tactical` is on the left and
   * stays there: of the five embodied entries it is the one that *aims*, naming
   * a body region, pricing the sweep that would cross it and spending a commit
   * on the best one.
   *
   * What changed is the right-hand side. This page's whole subject is watching
   * the same room go differently when the selection moves, and two copies of one
   * mind is the one pairing that shows a reader nothing about the selection --
   * it is a mirror match, and a mirror match reads as "the fight looks like
   * this" rather than as "this is what the choice buys you". `scripted` is the
   * control `tactical` was built to beat, so the opening screen is the
   * comparison rather than a sample of it.
   *
   * **`#/game` opens on `tactical` on both sides and that is not an
   * inconsistency**: the dungeon is a room a reader came to watch a fight in and
   * should show the shipped fighter on both sides of it. `Sim::try_on` in
   * `crates/web/src/lib.rs` carries the other half of this argument.
   *
   * **It was `selectCustomFight` and had a sibling.** `selectControlledPreset`
   * filled these same controls with the Smart101 demonstration and disabled
   * every one of them; v2-ui-08 deleted the preset it drove, so the `demo`
   * dropdown, its two options and the `disabled` sweep went with it. The
   * re-enabling loop below is gone for the same reason: nothing disables them.
   */
  function selectCustomFight(): void {
    setPhase("select");
    setPickerValue("a-anatomy", "fighter");
    setPickerValue("a-left", "shield");
    setPickerValue("a-right", "sword");
    setPickerValue("b-anatomy", "brute");
    setPickerValue("b-left", "empty");
    setPickerValue("b-right", "club");
    setPickerValue("arena-seed", "3");
    setPickerValue("arena-time-limit", "3600");
    clearTwoHanded();
    populatePolicies(container, "tactical", "scripted");
    setPickerValue("a-control", "tactical");
    setPickerValue("b-control", "scripted");
    showOffHandRows(container);
  }

  /**
   * Which half of `#/arena` the reader is looking at.
   *
   * **Two phases of one route and not two routes.** The route already owns the
   * Babylon stage, the lazily built Worker, the `ResizeObserver`s over four
   * canvases and the window keydown handler; a second route would need a second
   * copy of the mount and dispose discipline that
   * `every_registration_that_outlives_the_route_subtree_is_released_in_the_same_file`
   * exists to hold, for a screen that is the same screen with different things
   * shown.
   *
   * **The stage is deliberately *not* hidden in `select`, and that departs from
   * the plan's sketch on purpose.** `startStage` builds a Babylon engine over
   * `#arena-3d` at mount, and an engine constructed over a `display: none`
   * canvas is a 0x0 drawing buffer, a `ResizeObserver` whose first callback
   * renders into nothing, and a WebGPU-to-WebGL2 fallback that swaps a canvas
   * that is not laid out -- three failures that no test in this repository can
   * see and that only show up at a browser. arena-03 puts a per-side 3D preview
   * in these two columns and has to touch the stage lifecycle anyway; hiding
   * the arena stage belongs in that change, beside the engine it would have to
   * start lazily.
   */
  type Phase = "select" | "fight";
  let phase: Phase = "select";
  let eyesOpen = false;
  let plansOpen = false;
  let replayOpen = false;
  let detailsOpen = false;

  function updatePreview(): void {
    if (stage === null || phase !== "select") return;
    const matchup = readMatchup(container);
    stage.showPreview(0, matchup.a);
    stage.showPreview(1, matchup.b);
  }

  function setPhase(next: Phase): void {
    phase = next;
    container.setAttribute("data-phase", next);
    timeLimitInput.disabled = next === "fight";
    pickerSides.hidden = next === "fight";
    pickerFooter.hidden = next === "fight";
    pickerSummary.hidden = next === "select";
    if (next === "select") pickerSides.prepend(stageCanvas);
    else stageHost.prepend(stageCanvas);
    stage?.setPhase(next);
    if (next === "fight") {
      eyesOpen = plansOpen = replayOpen = detailsOpen = false;
      stage?.setEyes?.(false);
      for (const [button, panel] of [[plansButton, plansPanel], [detailsButton, detailsPanel]] as const) {
        button.setAttribute("aria-expanded", "false"); panel.hidden = true;
      }
      eyesButton.setAttribute("aria-expanded", "false");
      replayButton.setAttribute("aria-expanded", "false");
      replayPanel.hidden = replayControls.hidden = true;
    }
    if (next === "select") updatePreview();
  }

  const toggleDrawer = (button: HTMLButtonElement, panel: HTMLElement,
    read: () => boolean, write: (open: boolean) => void): void => {
    const open = !read();
    write(open); panel.hidden = !open; button.setAttribute("aria-expanded", String(open));
    if (open) render();
  };
  eyesButton.addEventListener("click", () => {
    eyesOpen = !eyesOpen;
    eyesButton.setAttribute("aria-expanded", String(eyesOpen));
    stage?.setEyes?.(eyesOpen);
    render();
  });
  plansButton.addEventListener("click", () => toggleDrawer(plansButton, plansPanel,
    () => plansOpen, (open) => { plansOpen = open; }));
  replayButton.addEventListener("click", () => {
    replayOpen = !replayOpen;
    replayButton.setAttribute("aria-expanded", String(replayOpen));
    replayPanel.hidden = replayControls.hidden = !replayOpen;
    if (replayOpen) render();
  });
  detailsButton.addEventListener("click", () => toggleDrawer(detailsButton, detailsPanel,
    () => detailsOpen, (open) => { detailsOpen = open; }));
  resetPreviewButton.addEventListener("click", () => stage?.resetPreview());

  // ---------------------------------------------------------------- the panels

  const THREE_QUARTER = "3/4 view";

  /**
   * `?stage=paired` -- the frame-time measurement, as `docs/performance/README.md`
   * asks for it. (`AGENTS.md` stated those rules until 2026-08-18 and now carries
   * the one-line rule and a link.)
   *
   * Three rules there, and the third is the one a query string alone cannot
   * keep: *compare paired frames, not paired runs*. `?stage=off` satisfies the
   * first -- it removes the work rather than hiding it, and a hidden or detached
   * canvas still rasterises every pixel -- but two page loads are two runs, and
   * a run-versus-run difference measures the machine's drift as much as the
   * feature. (This used to name core migration as the mechanism; that was a
   * property of a hybrid-core laptop this project no longer runs on. Warming
   * within a run is not, and it is enough on its own.)
   *
   * So this mode interleaves the two configurations inside **one** run over one
   * scene: the three viewports draw on every other animation frame while the
   * plan, the elevation, the chart, the readout and the whole transport draw on
   * all of them -- which is why playback below also stops reading the clock and
   * advances one tick a frame. The frame intervals then arrive as two
   * populations a single tick apart, and the difference between the even-indexed
   * and odd-indexed ones is what the three viewports cost. Which parity is which
   * does not need saying: the larger one is the one that drew them.
   *
   * Only while playing, so that scrubbing and the sliders stay usable, and named
   * on the panel's own label so a number taken in this mode is never read as the
   * shipped frame time.
   *
   * Two things it cannot see, both here and in `docs/performance/v2-arena-matrix.md`,
   * which also carries the fallback for each. A cost that fits inside
   * the refresh interval does not move either population off vsync, so the
   * difference is zero until the headroom is taken away. And a driver that
   * pipelines a frame's GPU work into the next interval smears the two
   * populations into each other -- they come back equally inflated, which is a
   * recognisable failure rather than a wrong answer.
   */
  const pairedProbe = params.get("stage") === "paired";
  let pairedDraws = true;

  /**
   * The three 3D panels, or the sentence explaining why there are none.
   *
   * The label under the 3/4 panel is where the backend and the mesh counts go.
   * A reader who wants to know whether they are looking at WebGPU or at a
   * fallback should not have to open a console for it, and a mesh count that has
   * quietly doubled is the first symptom of a registry that stopped retiring.
   */
  function describeStage(): void {
    const line = stage === null
      ? THREE_QUARTER
      : `${THREE_QUARTER} -- ${stage.description()}`
        + (pairedProbe ? " -- paired-frame probe, viewports on alternate frames" : "");
    // Written only when it changes. This runs once a rendered frame, and the
    // counts are the same string for thousands of them in a row; assigning
    // `textContent` unconditionally would dirty layout sixty times a second to
    // say what the panel already says.
    if (stageLabel.textContent !== line) stageLabel.textContent = line;
  }

  /**
   * The 3D stage, built once per mount and torn down with the route.
   *
   * **Started and not awaited**, for the same reason the recording is: an engine
   * is a WebGPU adapter request and a Babylon module graph, and a `mount` that
   * waited for it would leave the shell holding no handle for a route that has
   * already registered its listeners. The import is dynamic so that Babylon is
   * not in this route's first chunk at all -- the 8 MB fetch should not queue
   * behind a renderer, and a reader who leaves before either arrives should pay
   * for neither.
   */
  async function startStage(): Promise<void> {
    if (testStage !== undefined) {
      const built = await testStage();
      if (disposed) { built.dispose(); return; }
      stage = built;
      built.follow(followInput.value === "a" ? 0 : followInput.value === "b" ? 1 : "both");
      built.promote(viewInput.value as "threeQuarter" | "firstPersonA" | "firstPersonB");
      built.setEyes?.(eyesOpen);
      built.setPhase(phase);
      refreshPicker();
      return;
    }
    // **`?stage=off` is the baseline for the frame-time measurement**, and it is
    // here rather than in a console snippet because the probe method is specific
    // about
    // why: rendering cost has to be measured by *removing* the work, not by
    // hiding it, and a hidden or detached canvas still rasterises every pixel.
    // This is the only switch that takes the three viewports out of the frame
    // entirely while leaving the plan, the elevation, the chart and the whole
    // transport exactly as they were -- `?stage=paired` above removes the same
    // work on alternate frames instead, which is the comparison that method says
    // survives. It doubles as the way to use this page on a machine whose WebGL2
    // is broken.
    if (params.get("stage") === "off") {
      stageLabel.textContent = `${THREE_QUARTER} -- off (?stage=off); the 2D panels are unaffected`;
      return;
    }
    try {
      const module = await import("./scene.js");
      if (disposed) return;
      const built = await module.createArenaStage(stageCanvas, params, {
        // The engine replaces the canvas when WebGPU initialisation fails, and
        // an observer left on the element that just left the document reports
        // nothing at all -- so the panel would freeze at whatever size it
        // happened to have when the fallback happened.
        onCanvasReplaced: (previous, replacement) => {
          stageCanvas = replacement;
          // **After `dispose` this must do nothing.** The fallback can land
          // arbitrarily late -- it is a WebGPU adapter request that failed --
          // and `dispose` has already disconnected this observer and handed the
          // route back. Re-observing here would re-arm an observer the route no
          // longer owns, and because a `ResizeObserver` delivers an initial
          // callback for every newly observed element, it would also run one
          // `render()` against detached canvases on the way.
          if (disposed) return;
          observer.unobserve(previous);
          observer.observe(replacement);
        },
        onTerminal: (message) => {
          stageLabel.textContent = `${THREE_QUARTER} -- renderer lost: ${message}`;
          // Renderer loss removes the camera basis that direct-hand input is
          // defined in. It is a terminal capability loss, not merely a reason
          // to hide the reticle: park the authoritative producer as well and
          // make a later picker refresh unable to advertise the dead stage.
          stage = null;
          stopControlledFight(performance.now());
          takeControls.disabled = true;
        },
        onPreviewDress: (side, description) => {
          element<HTMLElement>(container, side === 0 ? "a-preview-dress" : "b-preview-dress").textContent = description;
        },
      });
      if (disposed) {
        built.dispose();
        return;
      }
      stage = built;
      refreshPicker();
      built.follow(followInput.value === "a" ? 0 : followInput.value === "b" ? 1 : "both");
      built.promote(viewInput.value as "threeQuarter" | "firstPersonA" | "firstPersonB");
      built.setEyes?.(eyesOpen);
      stageHost.dataset.mainView = viewInput.value;
      built.setPhase(phase);
      if (phase === "select") updatePreview();
      // **A press that landed while this was building.** The stage always starts
      // in `[Geometry]`, so only the other mode has anything to apply -- and it
      // has to be applied here rather than left to the reader's next press, which
      // a button already reading `aria-pressed="true"` would never send. Through
      // the route's own `setMode` so the label and the failure path stay in one
      // place; `describeStage` below then runs against the mode that is on.
      if (mode !== built.mode()) setMode(mode);
      describeStage();
      showCameraOwnership();
      if (loaded === null) built.clear();
      else render();
    } catch (error) {
      if (disposed) return;
      // The three 3D panels are the only thing lost. The plan, the elevation,
      // the chart and every number in the readout are 2D and keep working, so
      // this says what went wrong where it happened rather than taking over
      // `#status`, which is describing the fight.
      stageLabel.textContent = `${THREE_QUARTER} -- unavailable: ${String(error)}`;
    }
  }

  function centre(frame: FightFrame): V3 {
    let x = 0;
    let y = 0;
    for (const pose of frame.poses) {
      x += pose.body[0];
      y += pose.body[1];
    }
    const count = Math.max(1, frame.poses.length);
    return [x / count, y / count, 0];
  }

  function options(): Options {
    return {
      showRegions: toggles.showRegions.checked,
      showTargets: toggles.showTargets.checked,
      showVelocity: toggles.showVelocity.checked,
      showContacts: toggles.showContacts.checked,
    };
  }

  /**
   * The three 3D panels alone, at a fraction of a tick past the decided one.
   *
   * Separate from `render` because it is the only thing that moves between two
   * ticks. At 0.1x a tick lasts ten display frames, and redrawing the plan, the
   * elevation, the chart and the whole readout ten times to show the same
   * decided numbers would be ten times the work for no new information -- while
   * the bodies, which do have somewhere to be in between, would stutter.
   *
   * `alpha` never reaches 1, so the tick every panel names is always the tick
   * the readout and the two orthographic panels are drawing.
   */
  function drawStage(alpha: number, cameraDt = 0): void {
    if (stage === null || loaded === null) return;
    if (pairedProbe && state.playing && !pairedDraws) return;
    const { source } = loaded;
    const frame = source.frameAt(state.frame);
    const next = source.frameAt(Math.min(source.frameCount() - 1, state.frame + 1));
    stage.show({
      header: source.header, frame, next, alpha, cameraDt, focus: centre(frame),
      span: state.span, azimuth: state.azimuth, contacts: toggles.showContacts.checked,
    });
    describeStage();
  }

  function render(cameraDt = 0): void {
    if (loaded === null) return;
    const { source, series } = loaded;
    const header = source.header;
    const frame = source.frameAt(state.frame);
    const focus = centre(frame);
    const chosen = options();
    drawStage(0, cameraDt);
    if (phase !== "fight" || plansOpen) {
      const [planWidth, planHeight] = prepare(plan, planCtx);
      const [sideWidth, sideHeight] = prepare(elevation, elevationCtx);
      drawScene(planCtx, planCamera(planWidth, planHeight, focus, state.span), header, frame, chosen);
      drawScene(elevationCtx,
        elevationCamera(sideWidth, sideHeight, focus, state.span, state.azimuth),
        header, frame, chosen);
    }
    if (phase !== "fight" || replayOpen) {
      const [chartWidth, chartHeight] = prepare(chart, chartCtx);
      drawChart(chartCtx, header, series, state.frame, chartWidth, chartHeight);
    }
    healthA.value = Math.max(0, frame.health[0] ?? 0);
    healthB.value = Math.max(0, frame.health[1] ?? 0);

    tickLabel.textContent = `tick ${frame.t} / ${header.ticks}`;
    if (phase !== "fight" || detailsOpen) {
      readout.innerHTML = header.bodies
        .map((_, index) => describeBody(header, frame, index))
        .join("\n\n");
      contactList.innerHTML = frame.contacts.length === 0
        ? '<span class="muted">no contact this tick</span>'
        : frame.contacts.map((contact) => describeContact(header, contact)).join("<br>");
    }
    if (scrub.valueAsNumber !== state.frame) scrub.value = String(state.frame);
  }

  function go(frame: number, cameraDt = 0): void {
    if (loaded === null) return;
    state.frame = Math.min(loaded.source.frameCount() - 1, Math.max(0, frame));
    render(cameraDt);
  }

  /** The next frame carrying a contact, so a 3600-tick fight can be skimmed. */
  function seekContact(direction: 1 | -1, woundingOnly: boolean): void {
    if (loaded === null) return;
    const { source, series } = loaded;
    for (let f = state.frame + direction; f >= 0 && f < source.frameCount(); f += direction) {
      if (source.frameAt(f).contacts.length === 0) continue;
      if (woundingOnly && !at(series.wounding, f)) continue;
      go(f);
      return;
    }
  }

  // ---------------------------------------------------------------- the picker

  /**
   * Whether what is on screen came out of a file rather than out of the worker.
   *
   * The two are the same `FightSource` to every panel, which is the point of the
   * seam -- but the *picker* has to tell them apart, because a recorded fight's
   * loadout was fixed when it was written and the controls above it describe a
   * different fight.
   */
  let showingTrace = false;

  function matchupName(heroes: string, monsters: string, seed: number): string {
    return `${heroes} vs ${monsters}, seed ${seed}`;
  }

  function refreshPicker(): void {
    const matchup = readMatchup(container);
    // Before anything reads the matchup back: a side handed to a keyboard
    // reveals its off-hand row, and a side handed back to a policy hides it and
    // disables it, so the disabled control cannot answer a question nobody
    // asked it.
    showOffHandRows(container);
    // The collapsed line the `fight` phase shows instead of the two columns.
    // Written from the same read as everything else here, so it cannot become a
    // memory of a matchup nobody has selected.
    matchupSummary.textContent = summariseMatchup(matchup);
    // The button always runs the controls, even while the panels play a trace.
    // Its validation and checkpoint note therefore stay live independently of
    // the provenance of the fight already on screen.
    const verdict = review(matchup, "live");
    const hasHuman = matchup.a.control === "human" || matchup.b.control === "human";
    takeControls.disabled = stage === null || !hasHuman || (producing && !controlledStopped);
    // **Live while a recording runs**, so a second press cancels the first
    // rather than being swallowed. `ArenaClient.run` cancels and waits, and the
    // worker refuses a concurrent start by name -- a button that greyed itself
    // out for four tenths of a second would make the cancel path unreachable
    // from the page, which is how a tested path becomes a dead one.
    const needsCapture = hasHuman && capture !== "mouse" && capture !== "touch";
    fightButton.disabled = verdict.refusal !== null || needsCapture;
    pickerMessage.classList.toggle("refused", verdict.refusal !== null);
    if (verdict.refusal !== null) {
      pickerMessage.textContent = verdict.refusal;
      return;
    }
    if (needsCapture) {
      pickerMessage.textContent = stage === null
        ? "Direct hand control needs the 3D stage; wait for it to become ready."
        : "Press Take controls before starting this Human fight.";
      return;
    }
    // **Every sentence here is recomputed from the live controls**, and none of
    // it is remembered from the last [Run selected fight] or the last load. A remembered
    // sentence is one that goes on naming a policy nobody has selected: the
    // reader changes the control that caused it, the message stays, and the
    // picker has started describing a matchup that no longer exists.
    const parts: string[] = [];
    if (loaded !== null) {
      const header = loaded.source.header;
      parts.push(`${showingTrace ? "Viewing recording" : "Viewing live fight"}: `
        + `${matchupName(header.heroes, header.monsters, header.seed)}.`);
      if (showingTrace && (header.heroes === "learned" || header.monsters === "learned")) {
        parts.push(checkpointCopy("recording"));
      }
    }
    parts.push(`Next fight: ${matchupName(matchup.a.policy, matchup.b.policy, matchup.seed)}.`);
    parts.push(...verdict.notes);
    // Only while a *trace* is on screen. A live recording was built from these
    // exact controls, so a mismatch is impossible and printing "the recording's
    // own loadout is what is on screen" would be describing a disagreement that
    // cannot happen -- and the `lab trace` command beside it would be advice to
    // record by hand a fight the button just ran.
    if (showingTrace && loaded !== null) {
      const mismatch = recordingMismatch(matchup, loaded.source.header);
      if (mismatch !== null) parts.push(mismatch);
      if (resolveRecording(matchup) === null) parts.push(missingRecording(matchup));
    }
    pickerMessage.textContent = parts.join(" ");
  }

  /**
   * The one line that says what is on screen, from the header and the clock.
   *
   * **One writer, because two would fight over the same element.** The sentence
   * gains a phrase as the fight goes: the header while it is being produced, a
   * note when the playhead has caught the producer, and the two timings that are
   * this session's own measurements. Appending to `status.innerHTML` from three
   * places is how the line ended up describing a fight that was no longer on
   * screen the last time this page had a memory in it.
   */
  /**
   * Say the playhead has caught the producer, or stop saying it.
   *
   * Written through one function because it rewrites `#status`, and rewriting it
   * on every animation frame would be a hundred string builds a second for a
   * sentence that changes twice a chunk at most.
   */
  function setStarving(next: boolean): void {
    if (starving === next) return;
    starving = next;
    showStatus();
  }

  function showStatus(): void {
    if (loaded === null) return;
    const parts = [describeFight(loaded.source.header)];
    if (producing) {
      parts.push(starving
        ? "<b>waiting for the fight to be produced</b>"
        : '<span class="muted">still being produced</span>');
    }
    if (firstFrameMs !== null) {
      parts.push(`<span class="muted">first frame in ${firstFrameMs} ms</span>`);
    }
    if (!producing && producedMs !== null) {
      parts.push(`<span class="muted">produced in ${producedMs} ms</span>`);
    }
    status.innerHTML = parts.join(" &middot; ");
  }

  /**
   * A chunk landed on a fight already on screen.
   *
   * The series is extended rather than rebuilt and the panels are left to the
   * animation frame: redrawing here would draw 121 times over a fight the reader
   * is watching at sixty frames a second anyway, and `grown` is what tells a
   * *paused* page that its chart has more to show.
   */
  function grow(): void {
    if (loaded === null) return;
    loaded.series = buildSeries(loaded.source, loaded.series);
    scrub.max = String(Math.max(0, loaded.source.frameCount() - 1));
    grown = true;
    showStatus();
  }

  function adopt(source: FightSource): void {
    const header = source.header;
    loaded = { source, series: buildSeries(source) };
    // There is a fight to watch, so the two columns collapse to the one line
    // that names what is being watched. [Change] is what brings them back.
    setPhase("fight");
    showTransport();
    showStatus();
    status.classList.remove("error");
    scrub.max = String(source.frameCount() - 1);
    state.frame = 0;
    state.playing = false;
    playButton.textContent = "Play";
    // The picker follows the fight, because a control that says `composed` over
    // a windmill fight is a control that has stopped describing anything. On a
    // live fight this is a no-op by construction -- the fight was built from
    // these controls -- which is exactly why it can stay one line.
    showPolicies(container, header.heroes, header.monsters);

    // The default azimuth looks along the line the two bodies started on, which
    // is the elevation that answers "did that reach" without being told to. The
    // default span holds both of them: the fixture spawns about eleven units
    // apart, and a viewer that opens on an empty panel is a viewer nobody trusts.
    const first = source.frameAt(0);
    const a = poseOf(first, 0);
    const b = poseOf(first, 1);
    if (a !== undefined && b !== undefined) {
      state.azimuth = Math.atan2(b.body[1] - a.body[1], b.body[0] - a.body[0]);
      azimuthInput.value = String(Math.round((state.azimuth * 180) / Math.PI));
      const apart = Math.hypot(b.body[0] - a.body[0], b.body[1] - a.body[1]) / ONE;
      state.span = Math.min(Number(spanInput.max), Math.ceil(apart) + 4) * ONE;
      spanInput.value = String(state.span / ONE);
    }
    render();
  }

  /**
   * What went wrong, in the reader's terms rather than the fetch's.
   *
   * Three failures and three sentences, because the difference between them is
   * the difference between "this build carries no fixtures", "your fixture is
   * stale" and "the load broke". Collapsing them -- appending the `lab trace`
   * command to every error, which is what this did first -- tells a reader on a
   * shipped build to re-record a file that build was never going to carry, and
   * leaves them thinking the application is broken when it is behaving exactly
   * as designed.
   */
  function explain(url: string, error: unknown): string {
    if (error instanceof TraceUnavailable) {
      return `No recorded fight is served at ${url}. Recordings are a development fixture rather `
        + `than part of the application: npm run trace writes one into web/, .gitignore excludes `
        + `them because a fight is eight or nine megabytes of JSON, and the production bundle `
        + `deliberately carries the shell, the wasm and the room assets only. Nothing here is `
        + `broken -- press Run selected fight and this page will run the fight instead of loading one.`;
    }
    if (error instanceof TraceSchemaMismatch) {
      // The refusal names the two-file contract it is half of; the command
      // completes it into something a reader can run.
      return `${String(error)} -- run: cargo run --release -p lab -- trace --seed 3 --out web/fight.json`;
    }
    return `${url} could not be read: ${String(error)}`;
  }

  async function load(url: string): Promise<void> {
    inFlight?.abort();
    const attempt = new AbortController();
    inFlight = attempt;
    showingTrace = true;
    // A file is finished by definition, so nothing about it is waited on: the
    // lead check below must not hold a playhead against a producer there is not
    // one of.
    producing = false;
    starving = false;
    firstFrameMs = null;
    producedMs = null;
    status.textContent = `Loading ${url}...`;
    status.classList.remove("error");
    fightButton.disabled = true;
    try {
      const source = await loadTraceSource(url, attempt.signal);
      // An aborted load is one nobody is waiting for: either the route is down
      // or a newer [Run selected fight] owns these panels now, and both outcomes -- the
      // fight and the failure -- would be a stale answer overwriting the live
      // one. The abort is checked rather than `disposed` because the second
      // case is not a disposal at all.
      if (attempt.signal.aborted) return;
      adopt(source);
    } catch (error) {
      if (attempt.signal.aborted) return;
      loaded = null;
      // The bodies go with the fight. Left standing, they would be the last
      // tick of a recording this page has just said it could not read.
      stage?.clear();
      showTransport();
      status.textContent = explain(url, error);
      status.classList.add("error");
    } finally {
      if (inFlight === attempt) {
        inFlight = null;
        if (!disposed) refreshPicker();
      }
    }
  }

  let neutralPending = false;
  let controlledInput: Promise<number> | null = null;
  let controlGeneration = 0;

  async function stageNeutralAfterStop(generation: number, faction: number): Promise<void> {
    const previous = controlledInput;
    if (previous !== null) {
      try { await previous; } catch { /* The stop still deserves its neutral stage. */ }
    }
    if (generation !== controlGeneration || !controlledStopped || !neutralPending
      || controlledFaction !== faction || arena === null || !producing) return;
    const human = latestHumanPose();
    if (human === undefined) return;
    arenaInput.synchronize(human);
    const request = arena.input(faction, arenaInput.encode(null, human.yaw), 0);
    stagingNeutral = request;
    controlledInput = request;
    try {
      await request;
      if (generation === controlGeneration) neutralPending = false;
    } catch (error) {
      if (generation === controlGeneration) {
        status.textContent = `neutral input could not be staged: ${String(error)}`;
        status.classList.add("error");
      }
    } finally {
      if (controlledInput === request) controlledInput = null;
      // Request ownership and generation answer different races. This request
      // always releases its own in-flight latch; only its generation may alter
      // stop state after an immediate resume or a newer stop.
      if (stagingNeutral === request) stagingNeutral = null;
    }
  }

  function releaseDirectControls(): void {
    captureRequest += 1;
    if (pointerLockTimer !== null) window.clearTimeout(pointerLockTimer);
    pointerLockTimer = null;
    const previous = capture;
    capture = "none";
    pendingCapture = null;
    pendingMatchup = null;
    for (const pointerId of [...touchPoints.keys()]) {
      if (stageCanvas.hasPointerCapture(pointerId)) stageCanvas.releasePointerCapture(pointerId);
    }
    touchPoints.clear();
    touchCentroid = null;
    touchMode = null;
    touchPinchEligible = false;
    touchContributors.clear();
    touchWindowStarted = 0;
    arenaInput.buttonTransition("cut", false);
    arenaInput.buttonTransition("extend", false);
    takeControls.setAttribute("aria-pressed", "false");
    controlStatus.textContent = "Controls released";
    handReticle.clear();
    if (previous === "mouse" && document.pointerLockElement === stageCanvas) {
      void document.exitPointerLock?.();
    }
    if (!disposed) refreshPicker();
  }

  function losePrimaryArm(): void {
    if (primaryArmLost) return;
    primaryArmLost = true;
    releaseDirectControls();
    arenaInput.releaseArm();
    status.textContent = "CONTROL_PRIMARY_ARM_UNAVAILABLE: the controlled hand is severed or absent; body control continues";
    status.classList.add("error");
  }

  function stopControlledFight(now = performance.now(), stageNeutral = true): void {
    releaseDirectControls();
    if (controlledFaction === null) return;
    const faction = controlledFaction;
    const generation = (controlGeneration += 1);
    arenaInput.clear();
    primaryArmLost = false;
    controlledStopped = true;
    neutralPending = stageNeutral;
    controlledClock.stop(now);
    state.playing = false;
    playButton.textContent = "Play";
    if (stageNeutral) void stageNeutralAfterStop(generation, faction);
  }

  function resumeControlledFight(now = performance.now()): void {
    if (controlledFaction === null) return;
    controlGeneration += 1;
    controlledStopped = false;
    neutralPending = false;
    controlledClock.resume(now);
    state.playing = true;
    playButton.textContent = "Pause";
  }

  function opponentOf(frame: FightFrame): readonly [number, number] | null {
    if (controlledFaction === null) return null;
    return poseOf(frame, controlledFaction === 0 ? 1 : 0)?.id ?? null;
  }

  function humanPoseOf(frame: FightFrame) {
    return controlledFaction === null ? undefined : poseOf(frame, controlledFaction);
  }

  function latestHumanPose() {
    if (loaded === null || loaded.source.frameCount() === 0) return undefined;
    return humanPoseOf(loaded.source.frameAt(loaded.source.frameCount() - 1));
  }

  /**
   * [Fight]: run the fight the picker describes, and watch it as it happens.
   *
   * **The whole series was for this one interaction.** 120 bytes of
   * configuration, one `arena_start`, and the fight posted in chunks as it is
   * produced -- the first frame is on screen inside a hundredth of a second,
   * against eight megabytes of JSON and a command line.
   *
   * **What was here before was a wait.** The worker drove the whole duel and
   * transferred it once, so this function set the status line to "Recording..."
   * and nothing was drawn for 0.67 to 0.94 s on the pairing the picker opens on.
   * Two numbers are printed beside the fight rather than logged, because they are
   * what this session is judged on and a reader should not need a console: how
   * long until something was drawn, and how long the whole fight took.
   */
  async function onFight(): Promise<void> {
    const matchup = readMatchup(container);
    if (review(matchup, "live").refusal !== null) {
      // Nothing to say that `refreshPicker` does not already say from these same
      // controls, and saying it twice is how the message became a memory.
      refreshPicker();
      return;
    }
    const hasHuman = matchup.a.control === "human" || matchup.b.control === "human";
    if (hasHuman && capture !== "mouse" && capture !== "touch") {
      pickerMessage.textContent = "CONTROL_POINTER_LOCK_UNAVAILABLE: Take controls before starting a Human fight.";
      pickerMessage.classList.add("refused");
      return;
    }
    controlledFaction = matchup.a.control === "human" ? 0
      : matchup.b.control === "human" ? 1 : null;
    takeControls.disabled = true;
    arenaInput.clear();
    neutralPending = false;
    controlledStopped = controlledFaction !== null;
    controlledClock.stop(performance.now());
    // A trace still downloading is a stale answer for these panels; the second
    // [Fight] is cancelled inside `ArenaClient.run`, which waits for the first
    // to answer before posting.
    inFlight?.abort();
    arena ??= new ArenaClient(createSimWorker);
    // **One token per press, and only the newest one writes.** A cancelled
    // attempt still settles -- with the worker's `cancelled` refusal -- and it
    // must say nothing at all, or it would overwrite the status of the press
    // that cancelled it. This is `inFlight`'s abort check in the other shape:
    // the reason is the same and the mechanism cannot be, because a fight is
    // not a `fetch`.
    const attempt = (fightAttempt += 1);
    const current = (): boolean => !disposed && attempt === fightAttempt;
    showingTrace = false;
    status.classList.remove("error");
    status.textContent = "Starting the fight...";
    const started = performance.now();
    firstFrameMs = null;
    producedMs = null;
    starving = false;
    producing = true;
    try {
      const config = arenaConfigOf(matchup);
      if (controlledFaction !== null) {
        const side = controlledFaction === 0 ? matchup.a : matchup.b;
        const limb = humanArmOf(side) === "left" ? 0 : 1;
        const anatomy = ANATOMIES[config.fighters[controlledFaction].anatomy];
        if (anatomy === undefined) throw new RangeError("CONTROL_PRIMARY_ARM_UNAVAILABLE: anatomy is not shipped");
        // The minimum arrives with `arenaOpened`; initialize at the old safe
        // floor and replace it before the first controlled tick below.
        arenaInput.configureArm(limb, anatomy, ONE / 4);
      }
      const source = await arena.run(config, {
        // Before a single frame exists: there is nothing to draw and everything
        // to say, so the line that names the fight replaces the line that named
        // the wait.
        onOpened: (streaming) => {
          if (!current()) return;
          if (controlledFaction !== null && streaming.armMinReach !== undefined) {
            const side = controlledFaction === 0 ? matchup.a : matchup.b;
            const limb = humanArmOf(side) === "left" ? 0 : 1;
            const anatomy = ANATOMIES[config.fighters[controlledFaction].anatomy];
            if (anatomy !== undefined) arenaInput.configureArm(limb, anatomy, streaming.armMinReach);
          }
          // The fight on screen is the *last* one until this one has a frame, so
          // it is dropped here rather than left to be replaced: a transport that
          // stayed enabled over no fight answers a click with nothing at all,
          // which is the state this route was in on a production build.
          loaded = null;
          showTransport();
          status.innerHTML = describeFight(streaming.header);
        },
        onChunk: (streaming) => {
          if (!current()) return;
          if (loaded === null) {
            firstFrameMs = Math.round(performance.now() - started);
            adopt(streaming);
            // **Playing, and that is what "watch the fight happen" means.** The
            // old page adopted a finished recording and waited to be told to
            // play it, which is the right default for a file and the wrong one
            // for a fight that is still being fought.
            state.playing = true;
            playButton.textContent = "Pause";
            if (controlledFaction !== null) {
              followInput.value = controlledFaction === 0 ? "a" : "b";
              stage?.follow(controlledFaction);
              if (capture === "mouse" || capture === "touch") {
                resumeControlledFight(performance.now());
              } else {
                controlledStopped = true;
                state.playing = false;
                playButton.textContent = "Play";
                controlStatus.textContent = "Take controls again before body input resumes";
                refreshPicker();
              }
            }
            return;
          }
          grow();
        },
      });
      if (!current()) return;
      producing = false;
      if (controlledFaction !== null) stopControlledFight(performance.now(), false);
      controlledFaction = null;
      takeControls.disabled = true;
      neutralPending = false;
      producedMs = Math.round(performance.now() - started);
      // The last chunk and the finish arrive together, so this is the sentence
      // that gains the outcome the header could not carry until now.
      if (loaded !== null) grow();
      else adopt(source);
      showStatus();
    } catch (error) {
      if (!current()) return;
      producing = false;
      if (controlledFaction !== null) stopControlledFight(performance.now(), false);
      controlledFaction = null;
      takeControls.disabled = true;
      neutralPending = false;
      // **A cancelled or failed fight keeps the frames it already delivered.**
      // The chunks that arrived are the part of the fight the reader watched,
      // and throwing them away because the last one never came would be the
      // page forgetting something it had already shown.
      const sentence = error instanceof ArenaRefused
        // A refusal names a fighter, a hand or a policy code, and a failure
        // names the worker. Both are sentences a reader can act on, which is
        // what the module's twenty-seven refusal codes exist to make possible.
        ? String(error.message)
        : `the fight could not be produced: ${String(error)}`;
      if (loaded === null) {
        status.textContent = sentence;
        status.classList.add("error");
        stage?.clear();
        showTransport();
      } else {
        state.playing = false;
        playButton.textContent = "Play";
        showStatus();
        status.innerHTML += ` &middot; <b>${escapeHtml(sentence)}</b>`;
      }
    } finally {
      if (current()) refreshPicker();
    }
  }

  // ---------------------------------------------------------------- the wiring

  playButton.addEventListener("click", () => {
    if (controlledFaction !== null && producing) {
      if (state.playing) stopControlledFight();
      else if (capture === "mouse" || capture === "touch") resumeControlledFight();
      else {
        takeControls.disabled = stage === null;
        controlStatus.textContent = "Take controls again to resume the Human fight";
      }
      return;
    }
    state.playing = !state.playing;
    playButton.textContent = state.playing ? "Pause" : "Play";
  });
  // Every control that acts on a fight, in one list, so that "there is no
  // fight" can be said by the bar itself. A transport that stays enabled while
  // nothing is loaded answers a click with nothing at all, which is the state
  // this route was in on a production build: not obviously broken, just inert,
  // and a reader cannot tell those apart. The picker stays live either way --
  // choosing a matchup is the one useful thing left to do here.
  const transport: (HTMLButtonElement | HTMLInputElement | HTMLSelectElement)[] = [
    playButton, scrub, followInput, viewInput, refitButton,
  ];
  for (const [id, action] of [
    ["step-back", () => go(state.frame - 1)],
    ["step-forward", () => go(state.frame + 1)],
    ["prev-contact", () => seekContact(-1, false)],
    ["next-contact", () => seekContact(1, false)],
    ["prev-wound", () => seekContact(-1, true)],
    ["next-wound", () => seekContact(1, true)],
  ] as const) {
    const button = element<HTMLButtonElement>(container, id);
    button.addEventListener("click", action);
    transport.push(button);
  }
  function showTransport(): void {
    for (const control of transport) control.disabled = loaded === null;
  }

  scrub.addEventListener("input", () => go(scrub.valueAsNumber));
  rateInput.addEventListener("change", () => { state.rate = Number(rateInput.value); });
  spanInput.addEventListener("input", () => {
    state.span = Number(spanInput.value) * ONE;
    render();
  });
  function showCameraOwnership(): void {
    spanOwner.textContent = stage?.cameraMode() === "fit"
      ? "(all five panels)" : "(plan + elevation; Refit restores 3/4)";
  }
  followInput.addEventListener("change", () => {
    const target = followInput.value === "a" ? 0 : followInput.value === "b" ? 1 : "both";
    stage?.follow(target);
    render();
    showCameraOwnership();
  });
  cameraModeInput.addEventListener("change", () => {
    const refusal = stage?.setRelative(cameraModeInput.value === "relative") ?? null;
    if (refusal !== null) {
      cameraModeInput.value = "fixed";
      status.textContent = refusal;
      status.classList.add("error");
    } else render();
  });
  viewInput.addEventListener("change", () => {
    const view = viewInput.value as "threeQuarter" | "firstPersonA" | "firstPersonB";
    stage?.promote(view);
    stageHost.dataset.mainView = view;
  });
  refitButton.addEventListener("click", () => {
    followInput.value = "both";
    stage?.follow("both");
    stage?.refit();
    render();
    showCameraOwnership();
  });
  const stagePoint = (event: MouseEvent): readonly [number, number] | null => {
    const rect = stageCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  };
  const hitsThreeQuarter = (event: MouseEvent): boolean => {
    const point = stagePoint(event);
    return point !== null && stage?.containsThreeQuarterPoint(point[0], point[1]) === true;
  };
  let previewPointer: { id: number; side: 0 | 1 } | null = null;
  pickerSides.addEventListener("pointerdown", (event) => {
    if (phase !== "select" || event.target !== stageCanvas || event.button !== 0) return;
    const point = stagePoint(event);
    if (point === null) return;
    previewPointer = { id: event.pointerId, side: point[0] < 0.5 ? 0 : 1 };
    stageCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  pickerSides.addEventListener("pointermove", (event) => {
    if (previewPointer?.id !== event.pointerId || phase !== "select") return;
    stage?.orbitPreview(previewPointer.side, event.movementX, event.movementY);
    event.preventDefault();
  });
  const releasePreview = (event: PointerEvent): void => {
    if (previewPointer?.id !== event.pointerId) return;
    if (stageCanvas.hasPointerCapture(event.pointerId)) stageCanvas.releasePointerCapture(event.pointerId);
    previewPointer = null;
  };
  pickerSides.addEventListener("pointerup", releasePreview);
  pickerSides.addEventListener("pointercancel", releasePreview);
  pickerSides.addEventListener("wheel", (event) => {
    if (phase !== "select" || event.target !== stageCanvas) return;
    const point = stagePoint(event);
    if (point === null) return;
    stage?.zoomPreview(point[0] < 0.5 ? 0 : 1, event.deltaY);
    event.preventDefault();
  });
  let cameraPointer: number | null = null;
  let cameraGesture: "orbit" | "pan" | null = null;
  stageHost.addEventListener("pointerdown", (event) => {
    if (event.target !== stageCanvas) return;
    if (capture === "touch" && event.pointerType !== "touch" && (event.button === 0 || event.button === 2)) {
      controlStatus.textContent = "CONTROL_POINTER_LOCK_UNAVAILABLE: mouse input cannot enter a touch-owned capture";
      controlStatus.classList.add("error");
      stopControlledFight();
      return;
    }
    if (event.pointerType === "touch" && (capture === "touch"
      || (capture === "pending" && pendingCapture === "touch"))) {
      if (capture === "pending" && pendingMatchup !== summariseMatchup(readMatchup(container))) {
        refuseCapture("the selected matchup changed while touch controls were pending");
        return;
      }
      capture = "touch";
      pendingCapture = null;
      pendingMatchup = null;
      takeControls.setAttribute("aria-pressed", "true");
      controlStatus.textContent = "Touch hand controls active";
      refreshPicker();
      touchPoints.set(event.pointerId, [event.clientX, event.clientY]);
      const downPoints = [...touchPoints.values()];
      touchCentroid = [
        downPoints.reduce((sum, point) => sum + point[0], 0) / downPoints.length,
        downPoints.reduce((sum, point) => sum + point[1], 0) / downPoints.length,
      ];
      touchSpread = downPoints.length < 2 ? 0
        : Math.hypot(downPoints[0]![0] - downPoints[1]![0], downPoints[0]![1] - downPoints[1]![1]);
      touchMode = null;
      touchContributors.clear();
      touchWindowStarted = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
      lastWeaponAt = performance.now();
      if (touchPoints.size === 2 && stage !== null) {
        const points = [...touchPoints.values()];
        const rect = stageCanvas.getBoundingClientRect();
        const x = ((points[0]![0] + points[1]![0]) / 2 - rect.left) / Math.max(1, rect.width);
        const y = ((points[0]![1] + points[1]![1]) / 2 - rect.top) / Math.max(1, rect.height);
        touchPinchEligible = stage.containsThreeQuarterPoint(x, y);
      } else touchPinchEligible = false;
      stageCanvas.setPointerCapture(event.pointerId);
      arenaInput.buttonTransition("cut", false);
      arenaInput.buttonTransition("extend", false);
      event.preventDefault();
      if (producing && controlledStopped) resumeControlledFight();
      else if (!producing) void onFight();
      return;
    }
    if (event.button === 1 && hitsThreeQuarter(event)) {
      cameraPointer = event.pointerId;
      cameraGesture = event.shiftKey ? "pan" : "orbit";
      stageCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.button === 0 && controlledFaction === null && loaded !== null && hitsThreeQuarter(event)) {
      cameraPointer = event.pointerId;
      cameraGesture = "pan";
      stageCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (capture === "mouse" && (event.button === 0 || event.button === 2)) {
      arenaInput.buttonTransition(event.button === 0 ? "cut" : "extend", true);
      event.preventDefault();
    }
  });
  let lastWeaponAt = performance.now();
  stageHost.addEventListener("pointermove", (event) => {
    if (event.target !== stageCanvas) return;
    if (event.pointerType !== "touch" && event.buttons === 0 && capture !== "mouse" && stage !== null) {
      const bounds = stageCanvas.getBoundingClientRect();
      stage.hover?.([
        (event.clientX - bounds.left) / Math.max(1, bounds.width),
        (event.clientY - bounds.top) / Math.max(1, bounds.height),
      ]);
    }
    if (capture === "touch" && touchPoints.has(event.pointerId) && stage !== null) {
      touchPoints.set(event.pointerId, [event.clientX, event.clientY]);
      touchContributors.add(event.pointerId);
      const eventAt = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
      if (touchWindowStarted === 0) touchWindowStarted = eventAt;
      const points = [...touchPoints.values()];
      const centroid: readonly [number, number] = [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
      ];
      const spread = points.length < 2 ? 0
        : Math.hypot(points[0]![0] - points[1]![0], points[0]![1] - points[1]![1]);
      // Waiting briefly lets the second event of a parallel two-finger drag
      // arrive, while the bounded deadline still classifies a gesture whose
      // other finger is deliberately anchored.
      const gestureReady = points.length === 1 || touchContributors.size === 2
        || eventAt - touchWindowStarted >= 40;
      if (touchCentroid !== null && gestureReady) {
        const dx = centroid[0] - touchCentroid[0];
        const dy = centroid[1] - touchCentroid[1];
        const spreadDelta = spread - touchSpread;
        const travel = Math.hypot(dx, dy);
        const pose = latestHumanPose();
        if (pose === undefined) return;
        if (!arenaInput.synchronize(pose)) {
          losePrimaryArm();
          return;
        }
        if (touchMode === null) {
          touchMode = points.length === 1 ? "cut"
            : Math.abs(spreadDelta) > travel * TOUCH_PINCH_SPREAD_RATIO ? "pinch" : "extend";
          arenaInput.buttonTransition("cut", touchMode === "cut");
          arenaInput.buttonTransition("extend", touchMode === "extend");
        }
        if (touchMode === "pinch") {
          lastWeaponAt = performance.now();
          if (touchPinchEligible) stage.zoom(-spreadDelta * 10);
          else controlStatus.textContent = "CONTROL_TOUCH_PINCH_CAMERA_UNAVAILABLE: pinch began outside the 3/4 view";
        } else {
          const now = performance.now();
          arenaInput.moveWeapon(dx, dy, now - lastWeaponAt,
            stageCanvas.getBoundingClientRect().height, stage.cameraBasis(),
            touchMode);
          lastWeaponAt = now;
        }
        const desired = arenaInput.desiredHand();
        if (desired !== null) handReticle.update(stage.projectHand(desired), true);
        touchCentroid = centroid;
        touchSpread = spread;
        touchWindowStarted = eventAt;
      }
      event.preventDefault();
      return;
    }
    if (event.pointerId === cameraPointer) {
      const consumed = cameraGesture === "pan"
        ? stage?.pan(event.movementX, event.movementY, stageCanvas.getBoundingClientRect().height)
        : stage?.orbit(event.buttons, event.movementX, event.movementY);
      if (consumed !== true) return;
      showCameraOwnership();
      event.preventDefault();
      return;
    }
    if (capture !== "mouse" || document.pointerLockElement !== stageCanvas || stage === null) return;
    const pose = latestHumanPose();
    if (pose === undefined) return;
    if (!arenaInput.synchronize(pose)) {
      losePrimaryArm();
      return;
    }
    const now = performance.now();
    arenaInput.moveWeapon(event.movementX, event.movementY, now - lastWeaponAt,
      stageCanvas.getBoundingClientRect().height, stage.cameraBasis());
    lastWeaponAt = now;
    // The transition belongs to the next delta. This event was consumed by
    // the owner that existed when it arrived.
    arenaInput.buttonTransition("cut", (event.buttons & 1) !== 0);
    arenaInput.buttonTransition("extend", (event.buttons & 2) !== 0);
    const desired = arenaInput.desiredHand();
    if (desired !== null) handReticle.update(stage.projectHand(desired), true);
    event.preventDefault();
  });
  const releaseCameraPointer = (event: PointerEvent): void => {
    if (event.pointerId !== cameraPointer) return;
    cameraPointer = null;
    cameraGesture = null;
    if (stageCanvas.hasPointerCapture(event.pointerId)) stageCanvas.releasePointerCapture(event.pointerId);
  };
  const releaseTouchPointer = (event: PointerEvent): void => {
    if (!touchPoints.delete(event.pointerId)) return;
    if (stageCanvas.hasPointerCapture(event.pointerId)) stageCanvas.releasePointerCapture(event.pointerId);
    const remaining = [...touchPoints.values()];
    touchCentroid = remaining.length === 0 ? null : [
      remaining.reduce((sum, point) => sum + point[0], 0) / remaining.length,
      remaining.reduce((sum, point) => sum + point[1], 0) / remaining.length,
    ];
    touchSpread = remaining.length < 2 ? 0
      : Math.hypot(remaining[0]![0] - remaining[1]![0], remaining[0]![1] - remaining[1]![1]);
    touchMode = null;
    touchPinchEligible = false;
    touchContributors.clear();
    touchWindowStarted = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    arenaInput.buttonTransition("cut", false);
    arenaInput.buttonTransition("extend", false);
  };
  stageHost.addEventListener("pointerup", releaseCameraPointer);
  stageHost.addEventListener("pointercancel", releaseCameraPointer);
  stageHost.addEventListener("pointerup", releaseTouchPointer);
  stageHost.addEventListener("pointercancel", releaseTouchPointer);
  stageHost.addEventListener("lostpointercapture", (event) => {
    if (capture === "touch" && touchPoints.has(event.pointerId)) {
      touchPoints.delete(event.pointerId);
      stopControlledFight();
    }
  });
  stageHost.addEventListener("pointerup", (event) => {
    if (capture !== "mouse") return;
    if (event.button === 0) arenaInput.buttonTransition("cut", false);
    if (event.button === 2) arenaInput.buttonTransition("extend", false);
  });
  stageHost.addEventListener("contextmenu", (event) => {
    if (capture === "mouse" && event.target === stageCanvas) event.preventDefault();
  });
  stageHost.addEventListener("pointerleave", (event) => {
    if (event.target === stageCanvas) stage?.clearHover?.();
  });
  stageHost.addEventListener("wheel", (event) => {
    if (event.target !== stageCanvas || stage === null || !hitsThreeQuarter(event)) return;
    const bounds = stageCanvas.getBoundingClientRect();
    stage.zoom(event.deltaY, [
      (event.clientX - bounds.left) / Math.max(1, bounds.width),
      (event.clientY - bounds.top) / Math.max(1, bounds.height),
    ]);
    showCameraOwnership();
    // Reaching a clamp does not transfer this wheel gesture to page scrolling.
    event.preventDefault();
  }, { passive: false });
  azimuthInput.addEventListener("input", () => {
    state.azimuth = (Number(azimuthInput.value) * Math.PI) / 180;
    render();
  });
  for (const toggle of Object.values(toggles)) {
    toggle.addEventListener("change", () => render());
  }
  chart.addEventListener("click", (event) => {
    if (loaded === null) return;
    go(frameAtClick(loaded.series, chart, event.clientX));
  });

  // **`tactical` against `scripted`**, and the reason the aiming entry is on the
  // left is the reason the old default was chosen: a first look at this page
  // should not open on the entry least likely to land a blow. `attack-moves` was
  // that choice among the articulated scripts -- it was the twelve-phase script
  // with its four attack phases moving the feet, against a plain script that
  // spent 68.6% of its ticks with the blade stopped and decided 2.0% of duels
  // where closing footwork decided 14.5%. That vocabulary is gone. Of the five
  // embodied entries, `tactical` is the only one that *aims*: it names a body
  // region, prices the sweep that would cross it and spends a commit on the best
  // one, where the two scripted entries answer "what should a body be doing"
  // without asking where the opponent is soft.
  //
  // The right-hand side is `scripted` and was `tactical`, because a mirror match
  // is the one pairing that shows nothing about the dropdown this page exists
  // for. See `selectCustomFight` for the whole of that argument.
  //
  // `selectCustomFight` writes the same pair, and the duplication is on purpose:
  // this call is the page opening and that one is a reset, and a reset that
  // silently differed from the opening state is a control nobody can trust.
  populatePolicies(container, "tactical", "scripted");
  for (const control of pickerControls(container)) {
    control.addEventListener("change", () => {
      refreshPicker();
      updatePreview();
    });
  }
  fightButton.addEventListener("click", () => { void onFight(); });
  // **Back to the two columns, and it does not stop the fight.** The panels go
  // on holding whatever they were holding: a reader who opens the picker to
  // compare a dropdown against the fight in front of them has not asked for the
  // fight to end, and `refreshPicker` already says which fight is on screen and
  // which one the controls now describe.
  changeMatchup.addEventListener("click", () => {
    stopControlledFight();
    setPhase("select");
    refreshPicker();
  });

  /**
   * `[Texture]` against `[Geometry]`, pressed one at a time.
   *
   * **Nearly the whole of the switch is one call into the stage**, because the
   * mode is a property of the scene rather than of a panel: all three 3D panels
   * change together, no camera moves, and nothing here is rebuilt. What this
   * route keeps is the `aria-pressed` pair and the pressed mode itself, so the
   * buttons say which one is on when the stage has not been built yet --
   * `?stage=off`, or a machine with no WebGL2 -- rather than answering a press
   * with nothing at all.
   *
   * **The mode is kept and not only shown, and that is a correction.** The
   * sentence here used to be that a press with no stage chooses a mode "for the
   * panels they will have next time", which nothing in this file implemented:
   * `startStage` never read the buttons, so a press landing between the
   * `setMode("geometry")` at the bottom of this route and `stage = built` -- a
   * dynamic chunk import plus an adapter request, so a real window -- left
   * `[Texture]` reading pressed over a `[Geometry]` scene, with the button that
   * would have fixed it already saying pressed. `startStage` now applies
   * whatever `mode` holds the moment it has a stage. With `?stage=off` there is
   * never a stage and the claim really is only about the buttons, which is the
   * one case where "for nothing" was the honest reading.
   *
   * The label under the 3/4 panel is where the answer shows up: it names the
   * mode, and in `[Texture]` it names which floor the reader is looking at, since
   * the authored room is a hashed fetch that may not arrive.
   */
  function setMode(next: ArenaMode): void {
    mode = next;
    modeTexture.setAttribute("aria-pressed", String(next === "texture"));
    modeGeometry.setAttribute("aria-pressed", String(next === "geometry"));
    // **The stage first and the label second**, because everything in
    // `setMode` up to its own first `await` runs synchronously: the mode has
    // already changed and the frame has already been drawn by the time this
    // returns, so a label written before it would name the mode that has just
    // stopped being on the screen for as long as the room takes to fetch.
    //
    // The promise settles when the authored room has landed or failed, which is
    // the only part of a press that is not immediate; the label is rewritten
    // then so a reader sees which floor they got rather than guessing. A missing
    // room is not a rejection -- it is a procedural floor the label names -- so
    // the second branch is for a renderer that broke while the press was in
    // flight, and it reports where it happened rather than taking over `#status`,
    // which is describing the fight.
    const settled = stage?.setMode(next);
    // **Only when there is a stage to describe.** With `?stage=off`, or after a
    // build that failed, the label is carrying `startStage`'s explanation of why
    // there are no panels, and `describeStage` would overwrite it with the bare
    // heading -- turning a page that says why it is empty into one that is just
    // empty. The press is not lost either way: `mode` above is what a stage
    // arriving later reads.
    if (settled !== undefined) describeStage();
    void settled?.then(describeStage, (error: unknown) => {
      stageLabel.textContent = `${THREE_QUARTER} -- unavailable: ${String(error)}`;
    });
  }
  modeTexture.addEventListener("click", () => setMode("texture"));
  modeGeometry.addEventListener("click", () => setMode("geometry"));
  setMode("geometry");

  function refuseCapture(detail: string): void {
    releaseDirectControls();
    controlStatus.textContent = `CONTROL_POINTER_LOCK_UNAVAILABLE: ${detail}`;
    controlStatus.classList.add("error");
  }
  let touchActivation = false;
  takeControls.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    const matchup = readMatchup(container);
    if (stage === null || (producing && !controlledStopped)
      || (matchup.a.control !== "human" && matchup.b.control !== "human")) {
      refuseCapture("a ready stage and selected Human side are required");
      return;
    }
    touchActivation = true;
    captureRequest += 1;
    capture = "pending";
    pendingCapture = "touch";
    pendingMatchup = summariseMatchup(matchup);
    controlStatus.classList.remove("error");
    controlStatus.textContent = "Touch the fight view to take hand controls";
    event.preventDefault();
  });
  takeControls.addEventListener("click", () => {
    if (touchActivation) { touchActivation = false; return; }
    const matchup = readMatchup(container);
    if (stage === null || (producing && !controlledStopped)
      || (matchup.a.control !== "human" && matchup.b.control !== "human")) {
      refuseCapture("a ready stage and selected Human side are required");
      return;
    }
    const requestPointerLock = stageCanvas.requestPointerLock;
    if (typeof requestPointerLock !== "function") {
      refuseCapture("this browser has no relative pointer-lock API");
      return;
    }
    const token = (captureRequest += 1);
    capture = "pending";
    pendingCapture = "mouse";
    pendingMatchup = summariseMatchup(matchup);
    controlStatus.classList.remove("error");
    controlStatus.textContent = "Taking controls...";
    // This call stays synchronously inside the activation handler. Its promise
    // is not acquisition; pointerlockchange owns that answer.
    try {
      const requested = requestPointerLock.call(stageCanvas);
      pointerLockTimer = window.setTimeout(() => {
        if (token === captureRequest && capture === "pending" && pendingCapture === "mouse") {
          refuseCapture("no pointer-lock change arrived after activation");
        }
      }, 1_000);
      if (requested !== undefined) void requested.catch((error: unknown) => {
        if (token === captureRequest && capture === "pending" && pendingCapture === "mouse") {
          refuseCapture(String(error));
        }
      }).finally(() => {
        if ((disposed || token !== captureRequest) && document.pointerLockElement === stageCanvas) {
          void document.exitPointerLock?.();
        }
      });
    } catch (error) {
      if (token === captureRequest) refuseCapture(String(error));
    }
  });

  // A `ResizeObserver` and not a window `resize` listener. The first layout this
  // route gets is not its last -- a scrollbar arriving, a font settling, the
  // readout growing under the panels all move the canvas boxes without the
  // window changing size at all. Sizing the backing store once against a layout
  // that then reflowed leaves the scene drawn into a corner of the buffer and
  // stretched over the panel, which is a picture that lies about every distance
  // on it. Observing the elements themselves catches every case.
  const observer = new ResizeObserver(() => {
    // The 3D panels resize through the engine rather than through `prepare`:
    // Babylon owns that canvas's backing store and its swapchain, and writing
    // width and height behind it clears the target without necessarily making
    // it rebuild one.
    stage?.resize();
    render();
  });
  observer.observe(plan);
  observer.observe(elevation);
  observer.observe(chart);
  observer.observe(stageCanvas);

  function onKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === " ") { playButton.click(); event.preventDefault(); }
    else if (phase === "fight" && producing && controlledFaction !== null && arenaInput.keyDown(event.code)) {
      if (controlledStopped && (capture === "mouse" || capture === "touch")) resumeControlledFight();
      else if (controlledStopped) controlStatus.textContent = "Take controls again before body input resumes";
      event.preventDefault();
    }
    else if (event.key === "ArrowLeft") go(state.frame - (event.shiftKey ? 10 : 1));
    else if (event.key === "ArrowRight") go(state.frame + (event.shiftKey ? 10 : 1));
    else if (event.key === "[") seekContact(-1, false);
    else if (event.key === "]") seekContact(1, false);
  }
  function onKeyup(event: KeyboardEvent): void {
    if (producing && controlledFaction !== null && arenaInput.keyUp(event.code)) event.preventDefault();
  }
  const onBlur = (): void => stopControlledFight();
  const onVisibility = (): void => { if (document.visibilityState === "hidden") stopControlledFight(); };
  const onPointerLock = (): void => {
    if (document.pointerLockElement === stageCanvas && capture === "pending" && pendingCapture === "mouse") {
      if (pendingMatchup !== summariseMatchup(readMatchup(container))) {
        refuseCapture("the selected matchup changed while pointer lock was pending");
        return;
      }
      if (pointerLockTimer !== null) window.clearTimeout(pointerLockTimer);
      pointerLockTimer = null;
      capture = "mouse";
      pendingCapture = null;
      pendingMatchup = null;
      takeControls.setAttribute("aria-pressed", "true");
      controlStatus.classList.remove("error");
      controlStatus.textContent = "Relative hand controls active";
      refreshPicker();
      lastWeaponAt = performance.now();
      if (producing && controlledStopped) resumeControlledFight();
      else if (!producing) void onFight();
      return;
    }
    if (document.pointerLockElement === stageCanvas && capture !== "mouse") {
      void document.exitPointerLock?.();
      return;
    }
    // A different component may own pointer lock. Only loss of this route's
    // acquired lock is a stop; unrelated lock changes are ignored.
    if (capture === "mouse" && document.pointerLockElement !== stageCanvas) stopControlledFight();
  };
  const onPointerLockError = (): void => {
    if (capture === "pending" && pendingCapture === "mouse") {
      refuseCapture("the browser refused this activation");
    }
  };
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("keyup", onKeyup);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("pointerlockchange", onPointerLock);
  document.addEventListener("pointerlockerror", onPointerLockError);

  // Playback advances by wall-clock rather than one frame per animation frame,
  // so 1x is the simulation's own 60 ticks a second on any display.
  //
  // The handle is retained, which the old page did not do: it rescheduled
  // unconditionally and had nothing to cancel with, so the loop outlived
  // anything short of a document unload. Inside a shell that swaps routes, that
  // is a callback running forever against detached canvases.
  let frameRequest = 0;
  let last = performance.now();
  let carry = 0;
  let cameraElapsed = 0;
  let previewFrame = 0;

  /** Drain elapsed control time one freshly sampled authoritative tick at a time. */
  function drainControlledTicks(): void {
    if (controlledFaction === null || !producing || loaded === null || arena === null
      || controlledStopped || stagingNeutral || neutralPending || !controlledClock.beginTick()) return;
    const latest = loaded.source.frameAt(loaded.source.frameCount() - 1);
    const human = humanPoseOf(latest);
    if (human === undefined) {
      controlledClock.settleBatch(0);
      stopControlledFight(performance.now(), false);
      return;
    }
    if (!arenaInput.synchronize(human)) {
      losePrimaryArm();
    }
    const bytes = arenaInput.encode(opponentOf(latest), human.yaw);
    const request = arena.input(controlledFaction, bytes, 1);
    controlledInput = request;
    void request.then((stepped) => {
      if (stepped !== 1) {
        controlledClock.settleBatch(stepped);
        stopControlledFight(performance.now(), false);
        return;
      }
      controlledClock.settleTick();
      // At 30 Hz two ticks normally become due together. The second is sampled
      // only after the first acknowledgement, so yaw and future arm input have
      // the same sequence as a 60/120/144 Hz display.
      drainControlledTicks();
    }, (error: unknown) => {
      controlledClock.settleBatch(0);
      // A user stop may already be waiting to stage neutral behind this
      // rejection. Do not invalidate that stop's generation on its behalf.
      if (!controlledStopped) stopControlledFight(performance.now(), false);
      status.textContent = `arena input was refused: ${String(error)}`;
      status.classList.add("error");
    }).finally(() => {
      if (controlledInput === request) controlledInput = null;
    });
  }

  function loop(now: number): void {
    const elapsed = now - last;
    last = now;
    if (controlledFaction !== null && producing && loaded !== null && arena !== null) {
      controlledClock.advance(now);
      drainControlledTicks();
    }
    if (state.playing && loaded !== null) {
      cameraElapsed += elapsed / 1000;
      // **The probe advances one tick a display frame and ignores Speed.** The
      // two populations have to differ in exactly one thing, and a wall-clock
      // carry does not deliver that: at 1x on a 120 Hz display `carry` gains
      // 0.5 a frame, so the tick -- and with it every panel, since they all draw
      // out of `go` -- advances on every *other* frame. That is the same period
      // as the alternation and phase-locked to it, so every drawn frame would
      // land in one population and the difference would be the whole page's
      // draw cost or none of it. Driving the transport by display frame instead
      // makes the 2D panels draw on every frame and the 3D panels on every
      // other one, which is the comparison this mode exists to offer.
      if (pairedProbe) {
        pairedDraws = !pairedDraws;
        if (state.frame + 1 >= loaded.source.frameCount() - 1) {
          state.playing = false;
          playButton.textContent = "Play";
        }
        go(state.frame + 1, cameraElapsed);
        if (pairedDraws) cameraElapsed = 0;
        frameRequest = window.requestAnimationFrame(loop);
        return;
      }
      carry += (elapsed / 1000) * TICKS_PER_SECOND * state.rate;
      const steps = Math.floor(carry);
      if (steps > 0) {
        carry -= steps;
        const produced = loaded.source.frameCount();
        const wanted = state.frame + steps;
        if (producing && wanted + ARENA_STREAM_LEAD_TICKS > produced) {
          // **Production is behind the display. Hold the frame rather than
          // clamping to it.** Clamping runs the playhead up against the producer
          // and stutters one frame at a time, which reads as a broken renderer
          // rather than as a slow fight -- and it would do so at every chunk
          // boundary, 121 times a duel, which is what the lead exists to stop.
          //
          // The carry is spent rather than banked: a fight is watched at 1x, so
          // a stall that lasted a second must not be paid off by running the
          // next second at 2x.
          setStarving(true);
        } else {
          setStarving(false);
          // Only once nothing more is coming. While the worker is still
          // producing, the end of the buffer is not the end of the fight, and
          // stopping there would pause playback at the first chunk boundary.
          if (!producing && wanted >= produced - 1) {
            state.playing = false;
            playButton.textContent = "Play";
          }
          go(wanted, cameraElapsed);
          cameraElapsed = 0;
        }
      } else if (state.rate < 1) {
        // Below 1x a tick spans several display frames, and `carry` is already
        // exactly how far into it playback has got. Handing that fraction to
        // the 3D panels is the whole of the interpolation this page needs: two
        // known ticks and a lerp against a fractional index, with no timeline
        // to guess at an arrival rate that a recorded buffer does not have.
        drawStage(carry, cameraElapsed);
        cameraElapsed = 0;
      }
    } else cameraElapsed = 0;
    // A paused page whose fight is still growing still has a wider chart to
    // draw, and nothing else would ask for it: every other draw hangs off `go`.
    if (!state.playing && grown && loaded !== null) {
      grown = false;
      render();
    }
    if (phase === "select") {
      stage?.drawPreview(previewFrame);
      previewFrame += 1;
    }
    if ((capture === "mouse" || capture === "touch") && stage !== null) {
      const desired = arenaInput.desiredHand();
      if (desired !== null) handReticle.update(stage.projectHand(desired), true);
    }
    frameRequest = window.requestAnimationFrame(loop);
  }

  describeStage();
  setPhase("select");
  refreshPicker();
  showTransport();
  frameRequest = window.requestAnimationFrame(loop);
  void startStage();

  // The deep link `web/fight.html?trace=...` had, now read out of the hash route
  // instead: with hash routing `location.search` is empty, so a module that
  // reached for it would silently see no options at all.
  //
  // **Started, and deliberately not awaited.** The fetch is 8-9 MB and the parse
  // is not free either, so awaiting it here would leave `mount` unresolved --
  // and the shell's `handle` null -- for seconds, with this route's keydown
  // listener, `ResizeObserver` and rAF loop already registered. A reader who
  // leaves inside that window would take the listener with them onto the next
  // route and leave a loop rendering into detached canvases, and a reader who
  // came back would start a second load beside the first with nothing able to
  // stop either. The route mounts empty, says so, and fills in.
  //
  // A recording is an explicit route choice. Plain `#/arena` is useful in a
  // production build, where the large development-only JSON fixtures do not
  // exist, and starts empty rather than making a doomed request for one.
  if (params.has("trace")) {
    const trace = params.get("trace") ?? "";
    if (trace === "") {
      status.textContent = "The trace query is empty; name a recording URL or remove trace to run a fight.";
      status.classList.add("error");
    } else {
      void load(trace);
    }
  } else {
    status.textContent = "Run a fight.";
  }
  return {
    dispose(): void {
      // Idempotent, because the shell disposes on navigation *and* on
      // `pagehide`, and a back/forward-cached page can be handed both.
      if (disposed) return;
      releaseDirectControls();
      handReticle.dispose();
      disposed = true;
      inFlight?.abort();
      window.cancelAnimationFrame(frameRequest);
      observer.disconnect();
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("keyup", onKeyup);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerlockchange", onPointerLock);
      document.removeEventListener("pointerlockerror", onPointerLockError);
      // The engine, its scene, its meshes and its GPU buffers, which are the
      // largest thing this route holds and the one thing a dropped subtree
      // cannot collect on its own. A build still in flight sees `disposed` and
      // disposes itself on arrival instead.
      stage?.dispose();
      stage = null;
      // The recording worker, its wasm instance and its linear memory. A
      // recording in flight is cancelled by the disposal rather than left to
      // finish into a route that no longer exists -- and a worker that outlived
      // its route would go on holding a `web.wasm` instance for every arena the
      // reader ever opened.
      arena?.dispose();
      arena = null;
      // Nothing else needs releasing: every other listener is on an element
      // inside `container`, and the shell drops that whole subtree.
    },
  };
}
