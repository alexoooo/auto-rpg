import type { Combatant } from "./units";
import type { HitReport } from "./combat";
import type { Side } from "./physics";
import type { RigReadout } from "./rigview";
import type { MetaDiagnostic } from "./learning/meta";

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
  /** Read-only learned-policy decisions; null keeps the panel out of ordinary bouts. */
  learned: Partial<Record<Side, MetaDiagnostic>> | null;
}

const KIND_LABEL: Record<HitReport["kind"], string> = {
  crush: "CRUSH",
  cut: "CUT",
  thrust: "THRUST",
  slap: "FLAT",
  weak: "TOO SLOW",
};

/**
 * What a blow that found a guard is called.
 *
 * `Combat.parried` files every block as `weak`, because a block is not a wound
 * and `weak` is the kind that means "worth nothing". That reads correctly for
 * blade on blade, where the contact really is slow -- and it reads as a lie the
 * moment something fast is stopped: an arrow blocked by a sword came up
 * **"TOO SLOW" at 48.0 m/s**, which is the readout arguing with the number
 * directly beneath it.
 *
 * The fix is here rather than in `Combat` because the report already says so:
 * a parry carries `key: "block:<kind>"` and a wound carries a limb key, so the
 * distinction is in the data and only the wording was missing. The colour still
 * comes from `kind`, so `style.css` -- which `tsc` does not check -- needs
 * nothing.
 */
const isBlock = (report: HitReport): boolean => report.key.startsWith("block:");

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
  private readonly vitalityFills: Record<"left" | "right", HTMLElement>;
  private readonly vitalityValues: Record<"left" | "right", HTMLElement>;
  private readonly perf: HTMLElement;
  private readonly rigPanel: HTMLElement;
  private readonly rigLabel: HTMLElement;
  private readonly rigError: HTMLElement;
  private readonly rigDrift: HTMLElement;
  private readonly rigTip: HTMLElement;
  private readonly rigRoll: HTMLElement;
  private readonly rigBend: HTMLElement;
  private readonly rigCrouch: HTMLElement;
  private readonly rigWaist: HTMLElement;
  private readonly rigLimits: HTMLElement;
  private readonly learnedPanel: HTMLElement;
  private readonly learnedRows: HTMLElement;
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
            <tr><th>forearm roll</th><td data-rig-roll>&mdash;</td></tr>
            <tr><th>wrist bend</th><td data-rig-bend>&mdash;</td></tr>
            <tr><th>crouch</th><td data-rig-crouch>&mdash;</td></tr>
            <tr><th>waist error</th><td data-rig-waist>&mdash;</td></tr>
            <tr><th>joint limits</th><td data-rig-limits>&mdash;</td></tr>
          </table>
        </div>
        <div class="hit" data-hit></div>
      </div>
      <div class="hud-col hud-right">
        <div class="limbs">
          <div class="limbs-title" data-title-left>Left</div>
          <div class="vitality-track"><span class="vitality-fill" data-vitality-left></span></div>
          <div class="vitality-value" data-vitality-value-left>100% vitality</div>
          <div class="limbs-title" data-title-right>Right</div>
          <div class="vitality-track"><span class="vitality-fill" data-vitality-right></span></div>
          <div class="vitality-value" data-vitality-value-right>100% vitality</div>
          <details class="injuries">
            <summary>critical injuries</summary>
            <div data-limbs-left></div>
            <div data-limbs-right></div>
          </details>
        </div>
        <div class="perf" data-perf></div>
        <div class="gauge" data-learned>
          <div class="gauge-label">Learned options</div>
          <div class="hit-rows" data-learned-rows></div>
        </div>
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
    this.vitalityFills = {
      left: pick("[data-vitality-left]"),
      right: pick("[data-vitality-right]"),
    };
    this.vitalityValues = {
      left: pick("[data-vitality-value-left]"),
      right: pick("[data-vitality-value-right]"),
    };
    this.perf = pick("[data-perf]");
    this.rigPanel = pick("[data-rig]");
    this.rigLabel = pick("[data-rig-label]");
    this.rigError = pick("[data-rig-error]");
    this.rigDrift = pick("[data-rig-drift]");
    this.rigTip = pick("[data-rig-tip]");
    this.rigRoll = pick("[data-rig-roll]");
    this.rigBend = pick("[data-rig-bend]");
    this.rigCrouch = pick("[data-rig-crouch]");
    this.rigWaist = pick("[data-rig-waist]");
    this.rigLimits = pick("[data-rig-limits]");
    this.learnedPanel = pick("[data-learned]");
    this.learnedRows = pick("[data-learned-rows]");
    this.rigPanel.style.display = "none";
    this.learnedPanel.style.display = "none";
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle("hidden", !this.visible);
  }

  update(
    telemetry: Telemetry,
    fighters: Record<"left" | "right", Combatant>,
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

    const learned = telemetry.learned ? Object.entries(telemetry.learned) : [];
    this.learnedPanel.style.display = learned.length > 0 ? "" : "none";
    this.learnedRows.innerHTML = learned.map(([side, reading]) => {
      const logits = reading.topLogits.map((row) => `${row.option} ${row.value.toFixed(2)}`).join(", ");
      return `<div><strong>${side}</strong> ${reading.option} ` +
        `${reading.persistenceRemaining.toFixed(2)}/${reading.persistenceSeconds.toFixed(2)} s` +
        `${logits ? `<br><span class="unit">${logits}</span>` : ""}</div>`;
    }).join("");

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
      this.rigRoll.textContent = `${((telemetry.rig.roll * 180) / Math.PI).toFixed(0)} deg`;
      this.rigBend.textContent = `${(telemetry.rig.wristBend * 90).toFixed(0)} deg`;
      this.rigCrouch.textContent = `${Math.round(telemetry.rig.crouch * 100)}%`;
      this.rigWaist.textContent = `${telemetry.rig.waistErrorMm.toFixed(1)} mm`;
      const limits = [
        telemetry.rig.waistAtLimit ? "waist" : "",
        telemetry.rig.hipAtLimit ? "hip" : "",
        telemetry.rig.kneeAtLimit ? "knee" : "",
      ].filter(Boolean);
      this.rigLimits.textContent = limits.length > 0 ? limits.join(", ") : "clear";
    }

    if (lastHit) {
      const age = now - lastHit.at;
      this.hitPanel.classList.toggle("fresh", age < 0.55);
      this.hitPanel.innerHTML = `
        <div class="hit-kind kind-${lastHit.kind}">${
          isBlock(lastHit)
            ? lastHit.key === "block:empty" ? "BLOCKED BY HAND" : "BLOCKED"
            : lastHit.weapon === "empty" ? "PUNCH" : KIND_LABEL[lastHit.kind]
        }${lastHit.severed ? ' <span class="sever">SEVERED</span>' : ""}</div>
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
      const life = fighters[side].vitality;
      this.vitalityFills[side].style.width = `${(life * 100).toFixed(1)}%`;
      this.vitalityFills[side].classList.toggle("critical", life < 0.34);
      this.vitalityValues[side].textContent = `${Math.round(life * 100)}% vitality`;
      const injuries = fighters[side].limbs
        .map((limb) => {
          const fraction = Math.max(0, limb.health / limb.maxHealth);
          const state = limb.severed ? "severed" : fraction < 0.34 ? "critical" : "";
          return state
            ? `<div class="limb ${state}"><span class="limb-name">${title}: ${limb.label}</span></div>`
            : "";
        })
        .filter(Boolean);
      this.limbLists[side].innerHTML = injuries.join("") ||
        `<div class="limb"><span class="limb-name">${title}: none</span></div>`;
    }

    this.perf.textContent = `${telemetry.fps.toFixed(0)} fps · physics ${telemetry.physicsMs.toFixed(
      2,
    )} ms · ${telemetry.meshes} meshes`;
  }
}
