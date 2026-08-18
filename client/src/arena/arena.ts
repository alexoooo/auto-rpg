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
import { LiveFightSource } from "../fight/live.js";
import {
  at, closureSpeed, length, share, sub, TraceSchemaMismatch, TraceUnavailable,
  type Contact, type Pose, type V3,
} from "../fight/trace.js";
import {
  bodyColours, contactColour, drawScene, elevationCamera, planCamera, type Options,
} from "../fight/view.js";
import { ArenaClient, ArenaRefused } from "../runtime/arena-client.js";
import { robustStrikeArenaConfig } from "../runtime/arena-config.js";
import { createSimWorker } from "../runtime/sim-worker.js";
import {
  arenaConfigOf, checkpointCopy, missingRecording, pickerControls, populatePolicies, readMatchup,
  recordingMismatch, resolveRecording, review, showPolicies,
} from "./picker.js";
// Type-only, and that matters: a value import of `./scene.js` would pull Babylon
// into this route's first chunk and make the 8 MB recording wait behind it.
import type { ArenaMode, ArenaStage } from "./scene.js";

const ONE = 65536;
/** The simulation's own clock, for turning a playback rate into frames. */
const TICKS_PER_SECOND = 60;

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
    `${escapeHtml(fight.outcome)} at tick ${fight.ticks}`,
    fight.timedOut ? "<b>the clock decided it</b>" : "a body decided it",
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
  readonly series: Series;
}

export async function mount(container: HTMLElement, params: URLSearchParams): Promise<RouteHandle> {
  const status = element<HTMLElement>(container, "status");

  const plan = element<HTMLCanvasElement>(container, "plan");
  const elevation = element<HTMLCanvasElement>(container, "elevation");
  const chart = element<HTMLCanvasElement>(container, "chart");
  // Deliberately no `getContext("2d")` on this one. A canvas that has handed out
  // a 2D context can never hand out a `webgl2` one, so v2-ui-01's placeholder
  // fill was a one-way door and this session walks through it rather than
  // drawing beside it.
  let stageCanvas = element<HTMLCanvasElement>(container, "arena-3d");
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
  const azimuthInput = element<HTMLInputElement>(container, "azimuth");
  const fightButton = element<HTMLButtonElement>(container, "fight");
  const presetInput = element<HTMLSelectElement>(container, "arena-preset");
  const pickerMessage = element<HTMLElement>(container, "picker-message");
  const modeTexture = element<HTMLButtonElement>(container, "mode-texture");
  const modeGeometry = element<HTMLButtonElement>(container, "mode-geometry");

  const toggles = {
    showRegions: element<HTMLInputElement>(container, "show-regions"),
    showTargets: element<HTMLInputElement>(container, "show-targets"),
    showVelocity: element<HTMLInputElement>(container, "show-velocity"),
    showContacts: element<HTMLInputElement>(container, "show-contacts"),
  };

  const state: State = { frame: 0, playing: false, rate: 1, span: 6 * ONE, azimuth: 0 };
  let loaded: Loaded | null = null;
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
  /** One token per [Run selected fight]. Only the newest press may write to the panels. */
  let fightAttempt = 0;

  const controlledPreset = (): boolean => presetInput.value === "robust-strike";

  function setPickerValue(id: string, value: string): void {
    element<HTMLInputElement | HTMLSelectElement>(container, id).value = value;
  }

  /** The two-handed checkboxes carry state in `checked`, not `value`. */
  function clearTwoHanded(): void {
    for (const id of ["a-two-handed", "b-two-handed"]) {
      element<HTMLInputElement>(container, id).checked = false;
    }
  }

  function selectControlledPreset(): void {
    setPickerValue("a-anatomy", "fighter");
    setPickerValue("a-left", "shield");
    setPickerValue("a-right", "sword");
    setPickerValue("a-policy", "tactical");
    setPickerValue("b-anatomy", "brute");
    setPickerValue("b-left", "empty");
    setPickerValue("b-right", "club");
    setPickerValue("b-policy", "neutral");
    setPickerValue("arena-seed", "0");
    clearTwoHanded();
    for (const control of pickerControls(container)) {
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
        control.disabled = true;
      }
    }
  }

  function selectCustomFight(): void {
    for (const control of pickerControls(container)) {
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
        control.disabled = false;
      }
    }
    setPickerValue("a-anatomy", "fighter");
    setPickerValue("a-left", "shield");
    setPickerValue("a-right", "sword");
    setPickerValue("b-anatomy", "brute");
    setPickerValue("b-left", "empty");
    setPickerValue("b-right", "club");
    setPickerValue("arena-seed", "3");
    clearTwoHanded();
    populatePolicies(container, "attack-moves", "attack-moves");
    setPickerValue("a-policy", "attack-moves");
    setPickerValue("b-policy", "attack-moves");
  }

  // ---------------------------------------------------------------- the panels

  const THREE_QUARTER = "3/4 view";

  /**
   * `?stage=paired` -- the frame-time measurement, as AGENTS.md asks for it.
   *
   * Three rules there, and the third is the one a query string alone cannot
   * keep: *compare paired frames, not paired runs*. `?stage=off` satisfies the
   * first -- it removes the work rather than hiding it, and a hidden or detached
   * canvas still rasterises every pixel -- but two page loads are two runs, and
   * a run-versus-run difference on a machine that migrates a thread onto an
   * E-core measures the scheduler.
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
    // **`?stage=off` is the baseline for the frame-time measurement**, and it is
    // here rather than in a console snippet because AGENTS.md is specific about
    // why: rendering cost has to be measured by *removing* the work, not by
    // hiding it, and a hidden or detached canvas still rasterises every pixel.
    // This is the only switch that takes the three viewports out of the frame
    // entirely while leaving the plan, the elevation, the chart and the whole
    // transport exactly as they were -- `?stage=paired` above removes the same
    // work on alternate frames instead, which is the comparison AGENTS.md says
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
        },
      });
      if (disposed) {
        built.dispose();
        return;
      }
      stage = built;
      // **A press that landed while this was building.** The stage always starts
      // in `[Geometry]`, so only the other mode has anything to apply -- and it
      // has to be applied here rather than left to the reader's next press, which
      // a button already reading `aria-pressed="true"` would never send. Through
      // the route's own `setMode` so the label and the failure path stay in one
      // place; `describeStage` below then runs against the mode that is on.
      if (mode !== built.mode()) setMode(mode);
      describeStage();
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
  function drawStage(alpha: number): void {
    if (stage === null || loaded === null) return;
    if (pairedProbe && state.playing && !pairedDraws) return;
    const { source } = loaded;
    const frame = source.frameAt(state.frame);
    const next = source.frameAt(Math.min(source.frameCount() - 1, state.frame + 1));
    stage.show({
      header: source.header, frame, next, alpha, focus: centre(frame),
      span: state.span, azimuth: state.azimuth, contacts: toggles.showContacts.checked,
    });
    describeStage();
  }

  function render(): void {
    if (loaded === null) return;
    const { source, series } = loaded;
    const header = source.header;
    const frame = source.frameAt(state.frame);
    const focus = centre(frame);
    const chosen = options();
    drawStage(0);
    const [planWidth, planHeight] = prepare(plan, planCtx);
    const [sideWidth, sideHeight] = prepare(elevation, elevationCtx);
    const [chartWidth, chartHeight] = prepare(chart, chartCtx);
    drawScene(planCtx, planCamera(planWidth, planHeight, focus, state.span), header, frame, chosen);
    drawScene(
      elevationCtx,
      elevationCamera(sideWidth, sideHeight, focus, state.span, state.azimuth),
      header, frame, chosen,
    );
    drawChart(chartCtx, header, series, state.frame, chartWidth, chartHeight);

    tickLabel.textContent = `tick ${frame.t} / ${header.ticks}`;
    readout.innerHTML = header.bodies
      .map((_, index) => describeBody(header, frame, index))
      .join("\n\n");
    contactList.innerHTML = frame.contacts.length === 0
      ? '<span class="muted">no contact this tick</span>'
      : frame.contacts.map((contact) => describeContact(header, contact)).join("<br>");
    if (scrub.valueAsNumber !== state.frame) scrub.value = String(state.frame);
  }

  function go(frame: number): void {
    if (loaded === null) return;
    state.frame = Math.min(loaded.source.frameCount() - 1, Math.max(0, frame));
    render();
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
    // The button always runs the controls, even while the panels play a trace.
    // Its validation and checkpoint note therefore stay live independently of
    // the provenance of the fight already on screen.
    const verdict = review(matchup, "live");
    // **Live while a recording runs**, so a second press cancels the first
    // rather than being swallowed. `ArenaClient.run` cancels and waits, and the
    // worker refuses a concurrent start by name -- a button that greyed itself
    // out for four tenths of a second would make the cancel path unreachable
    // from the page, which is how a tested path becomes a dead one.
    fightButton.disabled = verdict.refusal !== null;
    pickerMessage.classList.toggle("refused", verdict.refusal !== null);
    if (verdict.refusal !== null) {
      pickerMessage.textContent = verdict.refusal;
      return;
    }
    if (controlledPreset()) {
      pickerMessage.textContent = "Controlled demonstration: Tactical code 5 uses a Fighter shield and 2-unit sword from (9.5, 7) against the neutral Brute at (12, 8). It targets Legs with a 28 + 28 command schedule and stops on the certified impact at frame 53.";
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

  function adopt(source: FightSource): void {
    const header = source.header;
    loaded = { source, series: buildSeries(source) };
    showTransport();
    status.innerHTML = describeFight(header);
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

  /**
   * [Run selected fight]: run the fight the picker describes, and scrub it.
   *
   * **The whole series was for this one interaction.** 120 bytes of
   * configuration, one `arena_start`, one uninterrupted worker-side drive, and
   * one message transferring the buffers -- about four tenths of a second for a
   * fight that runs its whole 3,600 ticks, against eight megabytes of JSON and a
   * command line.
   *
   * The elapsed time is printed beside the fight rather than logged, because it
   * is the number this session is judged on and a reader should not need a
   * console to see it.
   */
  async function onFight(): Promise<void> {
    const matchup = readMatchup(container);
    if (review(matchup, "live").refusal !== null) {
      // Nothing to say that `refreshPicker` does not already say from these same
      // controls, and saying it twice is how the message became a memory.
      refreshPicker();
      return;
    }
    // A trace still downloading is a stale answer for these panels; the second
    // [Run selected fight] is cancelled inside `ArenaClient.run`, which waits for the first
    // to answer before posting.
    inFlight?.abort();
    arena ??= new ArenaClient(createSimWorker);
    // **One token per press, and only the newest one writes.** A cancelled
    // attempt still settles -- with the worker's `cancelled` refusal -- and it
    // must say nothing at all, or it would overwrite the status of the press
    // that cancelled it. This is `inFlight`'s abort check in the other shape:
    // the reason is the same and the mechanism cannot be, because a recording is
    // not a `fetch`.
    const attempt = (fightAttempt += 1);
    const current = (): boolean => !disposed && attempt === fightAttempt;
    showingTrace = false;
    status.classList.remove("error");
    status.textContent = "Recording...";
    const started = performance.now();
    try {
      const config = controlledPreset() ? robustStrikeArenaConfig() : arenaConfigOf(matchup);
      const fight = await arena.run(config, (ticksDone, ticksTotal) => {
        if (!current()) return;
        status.textContent = `Recording... tick ${ticksDone} of ${ticksTotal}`;
      });
      if (!current()) return;
      adopt(new LiveFightSource(fight));
      // Appended to what `adopt` already wrote, so the sentence that names the
      // fight and the number that says what it cost stay one line.
      const elapsed = Math.round(performance.now() - started);
      status.innerHTML += ` &middot; <span class="muted">recorded in ${elapsed} ms</span>`;
    } catch (error) {
      if (!current()) return;
      // A refusal names a fighter, a hand or a policy code, and a failure names
      // the worker. Both are sentences a reader can act on, which is what the
      // module's twenty-seven refusal codes exist to make possible.
      status.textContent = error instanceof ArenaRefused
        ? String(error.message)
        : `the fight could not be recorded: ${String(error)}`;
      status.classList.add("error");
      loaded = null;
      stage?.clear();
      showTransport();
    } finally {
      if (current()) refreshPicker();
    }
  }

  // ---------------------------------------------------------------- the wiring

  playButton.addEventListener("click", () => {
    state.playing = !state.playing;
    playButton.textContent = state.playing ? "Pause" : "Play";
  });
  // Every control that acts on a fight, in one list, so that "there is no
  // fight" can be said by the bar itself. A transport that stays enabled while
  // nothing is loaded answers a click with nothing at all, which is the state
  // this route was in on a production build: not obviously broken, just inert,
  // and a reader cannot tell those apart. The picker stays live either way --
  // choosing a matchup is the one useful thing left to do here.
  const transport: (HTMLButtonElement | HTMLInputElement)[] = [playButton, scrub];
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
  azimuthInput.addEventListener("input", () => {
    state.azimuth = (Number(azimuthInput.value) * Math.PI) / 180;
    render();
  });
  for (const toggle of Object.values(toggles)) {
    toggle.addEventListener("change", render);
  }
  chart.addEventListener("click", (event) => {
    if (loaded === null) return;
    go(frameAtClick(loaded.series, chart, event.clientX));
  });

  // **`attack-moves` rather than `composed`, since 2026-08-15.** Both are the
  // twelve-phase script; the difference is that this one's four attack phases
  // move the feet. The plain script was the default until the arm bearing rates
  // doubled and it turned out to convert almost none of the increase -- it
  // commands zero effort on eight of twelve phases and arrives inside the other
  // four, so it spends 68.6% of its ticks with the blade stopped, and it decides
  // 2.0% of duels where closing footwork decides 14.5% and takes the Brute to
  // half health. A first look at this page should not open on the one script
  // measured to be worst at landing a blow.
  populatePolicies(container, "attack-moves", "attack-moves");
  for (const control of pickerControls(container)) {
    control.addEventListener("change", refreshPicker);
  }
  fightButton.addEventListener("click", () => { void onFight(); });

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
    else if (event.key === "ArrowLeft") go(state.frame - (event.shiftKey ? 10 : 1));
    else if (event.key === "ArrowRight") go(state.frame + (event.shiftKey ? 10 : 1));
    else if (event.key === "[") seekContact(-1, false);
    else if (event.key === "]") seekContact(1, false);
  }
  window.addEventListener("keydown", onKeydown);

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
  function loop(now: number): void {
    const elapsed = now - last;
    last = now;
    if (state.playing && loaded !== null) {
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
        go(state.frame + 1);
        frameRequest = window.requestAnimationFrame(loop);
        return;
      }
      carry += (elapsed / 1000) * TICKS_PER_SECOND * state.rate;
      const steps = Math.floor(carry);
      if (steps > 0) {
        carry -= steps;
        if (state.frame + steps >= loaded.source.frameCount() - 1) {
          state.playing = false;
          playButton.textContent = "Play";
        }
        go(state.frame + steps);
      } else if (state.rate < 1) {
        // Below 1x a tick spans several display frames, and `carry` is already
        // exactly how far into it playback has got. Handing that fraction to
        // the 3D panels is the whole of the interpolation this page needs: two
        // known ticks and a lerp against a fractional index, with no timeline
        // to guess at an arrival rate that a recorded buffer does not have.
        drawStage(carry);
      }
    }
    frameRequest = window.requestAnimationFrame(loop);
  }

  describeStage();
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
  presetInput.addEventListener("change", () => {
    if (controlledPreset()) selectControlledPreset();
    else selectCustomFight();
    refreshPicker();
  });

  return {
    dispose(): void {
      // Idempotent, because the shell disposes on navigation *and* on
      // `pagehide`, and a back/forward-cached page can be handed both.
      if (disposed) return;
      disposed = true;
      inFlight?.abort();
      window.cancelAnimationFrame(frameRequest);
      observer.disconnect();
      window.removeEventListener("keydown", onKeydown);
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
