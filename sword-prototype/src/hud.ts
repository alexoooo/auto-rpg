import type { Fighter } from "./fighter";
import type { HitReport } from "./combat";
import type { Side } from "./physics";
import type { RigReadout } from "./rigview";

export interface Telemetry {
  fps: number;
  physicsMs: number;
  tipSpeed: number;
  edgeAlignment: number;
  /**
   * Meshes in the scene, and named for what it is.
   *
   * This read `bodies` until the rig overlay landed, and it was never a body
   * count -- it has always been `scene.meshes.length`. That was a harmless
   * inaccuracy right up until an overlay whose central promise is that it creates
   * no physics body started adding some thirty meshes to the scene while it is
   * up. A reader would have watched "bodies" jump on `G` and concluded the exact
   * opposite of the truth. `__sword.rigview.audit()` answers the real body count,
   * from the physics engine.
   */
  meshes: number;
  /** Present only while the rig overlay is up; null takes the panel away. */
  rig: RigReadout | null;
  /**
   * Which of the two bodies is yours, or null when two policies are fighting.
   *
   * It went on the readout when `C` made it something you can change mid-bout.
   * Before that it was decided once behind the curtain and could be worked out
   * by moving the mouse; now it can change five times in a fight, and every
   * other number in this panel -- the tip speed, the edge alignment, the rig
   * figures -- is taken from whichever body that is. A readout whose subject can
   * move silently is a readout you can misread with complete confidence.
   */
  driving: Side | null;
}

const KIND_LABEL: Record<HitReport["kind"], string> = {
  cut: "CUT",
  thrust: "THRUST",
  slap: "FLAT",
  weak: "TOO SLOW",
};

/**
 * The readout.
 *
 * This is a measuring instrument, not decoration. The prototype's question is
 * whether a physical sword feels good, and "feels good" is unarguable until the
 * numbers behind it are on screen: how fast the tip is actually moving, how
 * squarely the edge met the target, and what that combination was worth. When a
 * hit looks right and scores nothing, the readout is what tells you which of the
 * two is wrong.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly speedFill: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly edgeFill: HTMLElement;
  private readonly edgeValue: HTMLElement;
  private readonly hitPanel: HTMLElement;
  /**
   * One list per side, because a bout has two bodies and the interesting
   * question during one is which of them is losing. They are stacked in the same
   * panel rather than put on opposite sides of the screen: the readout is read
   * by glancing, and two columns a screen apart cannot be compared at a glance.
   */
  private readonly limbLists: Record<"left" | "right", HTMLElement>;
  private readonly limbTitles: Record<"left" | "right", HTMLElement>;
  private readonly perf: HTMLElement;
  private readonly rigPanel: HTMLElement;
  private readonly rigLabel: HTMLElement;
  private readonly rigError: HTMLElement;
  private readonly rigDrift: HTMLElement;
  private readonly rigTip: HTMLElement;
  private visible = true;

  constructor(host: HTMLElement) {
    this.root = host;
    host.innerHTML = `
      <div class="hud-col hud-left">
        <div class="gauge">
          <div class="gauge-label">Blade tip <span class="unit">m/s</span></div>
          <div class="gauge-track"><div class="gauge-fill" data-speed></div></div>
          <div class="gauge-value" data-speed-value>0.0</div>
        </div>
        <div class="gauge">
          <div class="gauge-label">Edge alignment</div>
          <div class="gauge-track"><div class="gauge-fill edge" data-edge></div></div>
          <div class="gauge-value" data-edge-value>&mdash;</div>
        </div>
        <div class="gauge" data-rig>
          <div class="gauge-label" data-rig-label>Rig <span class="unit">G</span></div>
          <table class="hit-rows">
            <tr><th>anchor error</th><td data-rig-error>&mdash;</td></tr>
            <tr><th>elbow drift 1 s</th><td data-rig-drift>&mdash;</td></tr>
            <tr><th>tip speed</th><td data-rig-tip>&mdash;</td></tr>
          </table>
        </div>
        <div class="hit" data-hit></div>
      </div>
      <div class="hud-col hud-right">
        <div class="limbs">
          <div class="limbs-title" data-title-left>Left</div>
          <div data-limbs-left></div>
          <div class="limbs-title" data-title-right>Right</div>
          <div data-limbs-right></div>
        </div>
        <div class="perf" data-perf></div>
      </div>
    `;

    const pick = (selector: string): HTMLElement => {
      const found = host.querySelector<HTMLElement>(selector);
      if (!found) throw new Error(`HUD is missing ${selector}`);
      return found;
    };

    this.speedFill = pick("[data-speed]");
    this.speedValue = pick("[data-speed-value]");
    this.edgeFill = pick("[data-edge]");
    this.edgeValue = pick("[data-edge-value]");
    this.hitPanel = pick("[data-hit]");
    this.limbLists = {
      left: pick("[data-limbs-left]"),
      right: pick("[data-limbs-right]"),
    };
    this.limbTitles = {
      left: pick("[data-title-left]"),
      right: pick("[data-title-right]"),
    };
    this.perf = pick("[data-perf]");
    this.rigPanel = pick("[data-rig]");
    this.rigLabel = pick("[data-rig-label]");
    this.rigError = pick("[data-rig-error]");
    this.rigDrift = pick("[data-rig-drift]");
    this.rigTip = pick("[data-rig-tip]");
    this.rigPanel.style.display = "none";
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle("hidden", !this.visible);
  }

  update(
    telemetry: Telemetry,
    fighters: Record<"left" | "right", Fighter>,
    lastHit: HitReport | null,
    now: number,
  ): void {
    if (!this.visible) return;

    // 22 m/s is roughly the tip speed of a committed two-handed swing, so the
    // bar is scaled to make the useful range occupy most of its length.
    const speedFraction = Math.min(1, telemetry.tipSpeed / 22);
    this.speedFill.style.width = `${(speedFraction * 100).toFixed(1)}%`;
    this.speedFill.classList.toggle("hot", telemetry.tipSpeed > 11);
    this.speedValue.textContent = telemetry.tipSpeed.toFixed(1);

    this.edgeFill.style.width = `${(telemetry.edgeAlignment * 100).toFixed(1)}%`;
    this.edgeValue.textContent = `${Math.round(telemetry.edgeAlignment * 100)}%`;

    // The three numbers every feel complaint so far has actually been about.
    // They appear only with the overlay, because they are only worth reading
    // beside the thing they describe -- a millimetre figure with nothing drawn to
    // attribute it to is how the last two of these ended up being chased through
    // a bench harness instead of being looked at.
    this.rigPanel.style.display = telemetry.rig ? "" : "none";
    if (telemetry.rig) {
      // Named, because these three follow whoever is being driven and `C` can
      // change that mid-bout. Three unlabelled millimetre figures that quietly
      // swap subject would be read as the left fighter's by habit -- which is
      // what every number in `config.ts`'s arm tables actually is.
      this.rigLabel.innerHTML =
        `Rig &middot; ${telemetry.rig.side} <span class="unit">G</span>`;
      this.rigError.textContent = `${telemetry.rig.errorMm.toFixed(1)} mm`;
      this.rigDrift.textContent = `${telemetry.rig.elbowDriftMm.toFixed(0)} mm`;
      this.rigTip.textContent = `${telemetry.rig.tipSpeed.toFixed(1)} m/s`;
    }

    if (lastHit) {
      const age = now - lastHit.at;
      this.hitPanel.classList.toggle("fresh", age < 0.55);
      this.hitPanel.innerHTML = `
        <div class="hit-kind kind-${lastHit.kind}">${KIND_LABEL[lastHit.kind]}${
          lastHit.severed ? ' <span class="sever">SEVERED</span>' : ""
        }</div>
        <div class="hit-target">${lastHit.by} &rarr; ${lastHit.limb}</div>
        <table class="hit-rows">
          <tr><th>damage</th><td>${lastHit.damage.toFixed(1)}</td></tr>
          <tr><th>contact speed</th><td>${lastHit.speed.toFixed(1)} m/s</td></tr>
          <tr><th>edge</th><td>${Math.round(lastHit.edgeAlignment * 100)}%</td></tr>
          <tr><th>solver impulse</th><td>${lastHit.solverImpulse.toFixed(2)}</td></tr>
        </table>
      `;
    }

    for (const side of ["left", "right"] as const) {
      // Text rather than a class, so the mark needs nothing from `style.css` and
      // reads the same way in a screenshot as it does in the page.
      const title = side === "left" ? "Left" : "Right";
      this.limbTitles[side].textContent =
        telemetry.driving === side ? `${title} · you` : title;
      this.limbLists[side].innerHTML = fighters[side].limbs
        .map((limb) => {
          const fraction = Math.max(0, limb.health / limb.maxHealth);
          const state = limb.severed ? "severed" : fraction < 0.34 ? "critical" : "";
          return `<div class="limb ${state}">
            <span class="limb-name">${limb.label}</span>
            <span class="limb-track"><span class="limb-fill" style="width:${(fraction * 100).toFixed(0)}%"></span></span>
          </div>`;
        })
        .join("");
    }

    this.perf.textContent = `${telemetry.fps.toFixed(0)} fps · physics ${telemetry.physicsMs.toFixed(
      2,
    )} ms · ${telemetry.meshes} meshes`;
  }
}
