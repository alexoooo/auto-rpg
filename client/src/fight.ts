// The fight viewer: a trace, two projections, a time chart and a readout.
//
// **A detour and not a milestone.** v2-17 closed with the mechanical gate
// failing by roughly a factor of fifty, and with three successive explanations
// of why refuted by later measurement. The closure's first instruction to a
// successor is to go and look at a fight before calibrating anything else, and
// this page is the cheapest honest way to do that: it talks to no worker,
// instantiates no wasm and touches no generated ABI, so nothing about it can
// pin a decision the physics has not earned yet. Checkpoint C is still the
// production path; this is allowed to be deleted in the commit that lands it.
//
// The numbers on screen are the simulation's own. Where a value is derived --
// the chase error, the arm extension ratio -- the derivation is one subtraction
// over two published points, and it says so.

import { buildSeries, drawChart, frameAt } from "./fight/chart.js";
import {
  at, closureSpeed, length, loadTrace, share, sub,
  type Contact, type Frame, type Pose, type Trace, type V3,
} from "./fight/trace.js";
import {
  bodyColours, contactColour, drawScene, elevationCamera, planCamera, type Options,
} from "./fight/view.js";

const ONE = 65536;
/** The simulation's own clock, for turning a playback rate into frames. */
const TICKS_PER_SECOND = 60;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`#${id} is missing from the page`);
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
 * it draws, which on this page would blur exactly the thing being looked at: a
 * blade a fortieth of a unit thick, against a body a third of a unit wide.
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

function poseOf(frame: Frame, body: number): Pose | undefined {
  return frame.poses.find((pose) => pose.id[0] === body);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function describeContact(trace: Trace, contact: Contact): string {
  const kind = trace.contactKinds[contact.kind] ?? `kind ${contact.kind}`;
  const region = contact.region === trace.noRegion
    ? "no region"
    : trace.regionNames[contact.region] ?? `region ${contact.region}`;
  const slot = (id: readonly [number, number], value: number): string =>
    `${id[0]}${value === trace.bodySlot ? " body" : `/${value}`}`;
  const wound = contact.cut + contact.thrust;
  const allocated = share(contact);
  return [
    `<span style="color:${contactColour(contact.kind)}">${kind}</span>`,
    `${slot(contact.a, contact.aSlot)} &rarr; ${slot(contact.b, contact.bSlot)} (${region})`,
    // The per-fact share and the floor it is charged, side by side, because the
    // difference between them is the whole question this page was opened to ask.
    // The group ledger is printed after and named as a group, so nobody reads
    // its much larger number as this contact's.
    `closing ${units(closureSpeed(contact))}`,
    allocated === 0
      ? "no wound channel"
      : `share ${allocated} vs floor ${trace.contactEnergyFloor}`,
    `cut ${contact.cut} thrust ${contact.thrust} pressure ${contact.pressure}`,
    `<span class="muted">group ${contact.groupBefore} &rarr; ${contact.groupAfter}</span>`,
    wound > 0 ? "<b>wounding</b>" : "",
    contact.severed ? "<b>SEVERED</b>" : "",
  ].filter((part) => part !== "").join(" &middot; ");
}

function describeBody(trace: Trace, frame: Frame, index: number): string {
  const pose = poseOf(frame, index);
  const info = trace.bodies[index];
  if (pose === undefined || info === undefined) return "";
  const colour = bodyColours(index);
  // `World::health_fraction` is a **faction** aggregate -- every slot of that
  // faction over that faction's total maxima. On this fixture there is one body
  // a side so it reads as a per-body number, and on any fixture with two it
  // would not. Labelled as what it is, with this body's own published integrity
  // and wound rows underneath, which are per body and per region.
  const faction = index === 0 ? frame.health[0] : frame.health[1];

  const arms = pose.arms.map((arm, limb) => {
    const hint = trace.hintNames[at(pose.hints, limb)] ?? "?";
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

  const severed = trace.regionNames
    .filter((_, part) => (pose.severed & (1 << part)) !== 0)
    .join(", ");

  // Per region and per body, unlike the faction fraction above. A region reads
  // `intact` only when it has lost neither structure nor blood to an open wound.
  const regions = trace.regionNames.map((name, part) => {
    const integrity = pose.integrity[part] ?? 0;
    const open = pose.wound[part] ?? 0;
    if (integrity >= ONE && open === 0) return "";
    return `${name} ${units(integrity, 2)}${open === 0 ? "" : ` (wound ${units(open, 2)})`}`;
  }).filter((part) => part !== "");

  return [
    `<b style="color:${colour.edge}">${escapeHtml(info.kind)}</b> `
      + `<span class="muted">${escapeHtml(info.faction)}, slot ${index}</span>`,
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

interface State {
  frame: number;
  playing: boolean;
  rate: number;
  span: number;
  azimuth: number;
}

async function main(): Promise<void> {
  const status = element<HTMLElement>("status");
  const parameters = new URLSearchParams(window.location.search);
  const source = parameters.get("trace") ?? "/fight.json";

  let trace: Trace;
  try {
    trace = await loadTrace(source);
  } catch (error) {
    status.textContent =
      `${String(error)} -- run: cargo run --release -p lab -- trace --seed 3 --out web/fight.json`;
    status.classList.add("error");
    return;
  }
  const series = buildSeries(trace);

  status.innerHTML = [
    `<b>${escapeHtml(trace.scenario)}</b> seed ${trace.seed}, ${escapeHtml(trace.script)}`,
    trace.mirrored ? "mirrored" : `fingerprint ${escapeHtml(trace.fingerprint ?? "none")}`,
    `${escapeHtml(trace.outcome)} at tick ${trace.ticks}`,
    trace.timedOut ? "<b>the clock decided it</b>" : "a body decided it",
    trace.truncated ? `<b>recording truncated to ${trace.frameCount} frames</b>` : "",
  ].filter((part) => part !== "").join(" &middot; ");

  const plan = element<HTMLCanvasElement>("plan");
  const elevation = element<HTMLCanvasElement>("elevation");
  const chart = element<HTMLCanvasElement>("chart");
  const planCtx = context(plan);
  const elevationCtx = context(elevation);
  const chartCtx = context(chart);

  const scrub = element<HTMLInputElement>("scrub");
  const readout = element<HTMLElement>("readout");
  const contactList = element<HTMLElement>("contacts");
  const tickLabel = element<HTMLElement>("tick");
  const playButton = element<HTMLButtonElement>("play");
  const rateInput = element<HTMLSelectElement>("rate");
  const spanInput = element<HTMLInputElement>("span");
  const azimuthInput = element<HTMLInputElement>("azimuth");

  const toggles = {
    showRegions: element<HTMLInputElement>("show-regions"),
    showTargets: element<HTMLInputElement>("show-targets"),
    showVelocity: element<HTMLInputElement>("show-velocity"),
    showContacts: element<HTMLInputElement>("show-contacts"),
  };

  const state: State = { frame: 0, playing: false, rate: 1, span: 6 * ONE, azimuth: 0 };
  scrub.max = String(trace.frames.length - 1);

  // The default azimuth looks along the line the two bodies started on, which
  // is the elevation that answers "did that reach" without being told to. The
  // default span holds both of them: the fixture spawns about eleven units
  // apart, and a viewer that opens on an empty panel is a viewer nobody trusts.
  const first = at(trace.frames, 0);
  const a = poseOf(first, 0);
  const b = poseOf(first, 1);
  if (a !== undefined && b !== undefined) {
    state.azimuth = Math.atan2(b.body[1] - a.body[1], b.body[0] - a.body[0]);
    azimuthInput.value = String(Math.round((state.azimuth * 180) / Math.PI));
    const apart = Math.hypot(b.body[0] - a.body[0], b.body[1] - a.body[1]) / ONE;
    state.span = Math.min(Number(spanInput.max), Math.ceil(apart) + 4) * ONE;
    spanInput.value = String(state.span / ONE);
  }

  function centre(frame: Frame): V3 {
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

  function render(): void {
    const frame = at(trace.frames, state.frame);
    const focus = centre(frame);
    const chosen = options();
    const [planWidth, planHeight] = prepare(plan, planCtx);
    const [sideWidth, sideHeight] = prepare(elevation, elevationCtx);
    const [chartWidth, chartHeight] = prepare(chart, chartCtx);
    drawScene(planCtx, planCamera(planWidth, planHeight, focus, state.span), trace, frame, chosen);
    drawScene(
      elevationCtx,
      elevationCamera(sideWidth, sideHeight, focus, state.span, state.azimuth),
      trace, frame, chosen,
    );
    drawChart(chartCtx, trace, series, state.frame, chartWidth, chartHeight);

    tickLabel.textContent = `tick ${frame.t} / ${trace.ticks}`;
    readout.innerHTML = trace.bodies
      .map((_, index) => describeBody(trace, frame, index))
      .join("\n\n");
    contactList.innerHTML = frame.contacts.length === 0
      ? '<span class="muted">no contact this tick</span>'
      : frame.contacts.map((contact) => describeContact(trace, contact)).join("<br>");
    if (scrub.valueAsNumber !== state.frame) scrub.value = String(state.frame);
  }

  function go(frame: number): void {
    state.frame = Math.min(trace.frames.length - 1, Math.max(0, frame));
    render();
  }

  /** The next frame carrying a contact, so a 3600-tick fight can be skimmed. */
  function seekContact(direction: 1 | -1, woundingOnly: boolean): void {
    for (let f = state.frame + direction; f >= 0 && f < trace.frames.length; f += direction) {
      const frame = at(trace.frames, f);
      if (frame.contacts.length === 0) continue;
      if (woundingOnly && !at(series.wounding, f)) continue;
      go(f);
      return;
    }
  }

  playButton.addEventListener("click", () => {
    state.playing = !state.playing;
    playButton.textContent = state.playing ? "Pause" : "Play";
  });
  element<HTMLButtonElement>("step-back").addEventListener("click", () => go(state.frame - 1));
  element<HTMLButtonElement>("step-forward").addEventListener("click", () => go(state.frame + 1));
  element<HTMLButtonElement>("prev-contact").addEventListener("click", () => seekContact(-1, false));
  element<HTMLButtonElement>("next-contact").addEventListener("click", () => seekContact(1, false));
  element<HTMLButtonElement>("prev-wound").addEventListener("click", () => seekContact(-1, true));
  element<HTMLButtonElement>("next-wound").addEventListener("click", () => seekContact(1, true));

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
  chart.addEventListener("click", (event) => go(frameAt(trace, chart, event.clientX)));

  // A `ResizeObserver` and not a window `resize` listener. The first layout this
  // page gets is not its last -- a scrollbar arriving, a font settling, the
  // readout growing under the panels all move the canvas boxes without the
  // window changing size at all. Sizing the backing store once against a layout
  // that then reflowed leaves the scene drawn into a corner of the buffer and
  // stretched over the panel, which is a picture that lies about every distance
  // on it. Observing the elements themselves catches every case.
  const observer = new ResizeObserver(() => render());
  observer.observe(plan);
  observer.observe(elevation);
  observer.observe(chart);

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === " ") { playButton.click(); event.preventDefault(); }
    else if (event.key === "ArrowLeft") go(state.frame - (event.shiftKey ? 10 : 1));
    else if (event.key === "ArrowRight") go(state.frame + (event.shiftKey ? 10 : 1));
    else if (event.key === "[") seekContact(-1, false);
    else if (event.key === "]") seekContact(1, false);
  });

  // Playback advances by wall-clock rather than one frame per animation frame,
  // so 1x is the simulation's own 60 ticks a second on any display.
  let last = performance.now();
  let carry = 0;
  function loop(now: number): void {
    const elapsed = now - last;
    last = now;
    if (state.playing) {
      carry += (elapsed / 1000) * TICKS_PER_SECOND * state.rate;
      const steps = Math.floor(carry);
      if (steps > 0) {
        carry -= steps;
        if (state.frame + steps >= trace.frames.length - 1) {
          state.playing = false;
          playButton.textContent = "Play";
        }
        go(state.frame + steps);
      }
    }
    window.requestAnimationFrame(loop);
  }

  render();
  window.requestAnimationFrame(loop);
}

void main();
