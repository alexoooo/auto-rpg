import type { Dummy } from "./dummy";
import type { HitReport } from "./combat";

export interface Telemetry {
  fps: number;
  physicsMs: number;
  tipSpeed: number;
  edgeAlignment: number;
  bodies: number;
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
  private readonly limbList: HTMLElement;
  private readonly perf: HTMLElement;
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
        <div class="hit" data-hit></div>
      </div>
      <div class="hud-col hud-right">
        <div class="limbs" data-limbs></div>
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
    this.limbList = pick("[data-limbs]");
    this.perf = pick("[data-perf]");
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle("hidden", !this.visible);
  }

  update(telemetry: Telemetry, dummy: Dummy, lastHit: HitReport | null, now: number): void {
    if (!this.visible) return;

    // 22 m/s is roughly the tip speed of a committed two-handed swing, so the
    // bar is scaled to make the useful range occupy most of its length.
    const speedFraction = Math.min(1, telemetry.tipSpeed / 22);
    this.speedFill.style.width = `${(speedFraction * 100).toFixed(1)}%`;
    this.speedFill.classList.toggle("hot", telemetry.tipSpeed > 11);
    this.speedValue.textContent = telemetry.tipSpeed.toFixed(1);

    this.edgeFill.style.width = `${(telemetry.edgeAlignment * 100).toFixed(1)}%`;
    this.edgeValue.textContent = `${Math.round(telemetry.edgeAlignment * 100)}%`;

    if (lastHit) {
      const age = now - lastHit.at;
      this.hitPanel.classList.toggle("fresh", age < 0.55);
      this.hitPanel.innerHTML = `
        <div class="hit-kind kind-${lastHit.kind}">${KIND_LABEL[lastHit.kind]}${
          lastHit.severed ? ' <span class="sever">SEVERED</span>' : ""
        }</div>
        <div class="hit-target">${lastHit.limb}</div>
        <table class="hit-rows">
          <tr><th>damage</th><td>${lastHit.damage.toFixed(1)}</td></tr>
          <tr><th>contact speed</th><td>${lastHit.speed.toFixed(1)} m/s</td></tr>
          <tr><th>edge</th><td>${Math.round(lastHit.edgeAlignment * 100)}%</td></tr>
          <tr><th>solver impulse</th><td>${lastHit.solverImpulse.toFixed(2)}</td></tr>
        </table>
      `;
    }

    const rows = dummy.limbs
      .map((limb) => {
        const fraction = Math.max(0, limb.health / limb.maxHealth);
        const state = limb.severed ? "severed" : fraction < 0.34 ? "critical" : "";
        return `<div class="limb ${state}">
          <span class="limb-name">${limb.label}</span>
          <span class="limb-track"><span class="limb-fill" style="width:${(fraction * 100).toFixed(0)}%"></span></span>
        </div>`;
      })
      .join("");
    this.limbList.innerHTML = rows;

    this.perf.textContent = `${telemetry.fps.toFixed(0)} fps · physics ${telemetry.physicsMs.toFixed(
      2,
    )} ms · ${telemetry.bodies} bodies`;
  }
}
