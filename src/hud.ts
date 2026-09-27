import type { Combatant } from "./units";
import type { HitReport } from "./combat";
import type { Side } from "./physics";
import { describeAttributes } from "./golem/attributes.ts";
import { commandAction } from "./bout.ts";

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
  /**
   * The diagnostics skim in force. The per-side command tables went with the fourth executor\n   * (tactics v4) in the 2026-09-27 cleanup.\n   */
  command: CommandReadout;
}

export interface CommandReadout {
  /** The diagnostics skim in force: 1, 2 or 4. See `SKIM_SPEEDS` in `src/host-run.ts`. */
  readonly skim: number;
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
  private readonly skimPicker: HTMLSelectElement;
  /** Command or Stand down, one a side, written from `telemetry.driving` like the title beside it. */
  private readonly driveButtons: Record<"left" | "right", HTMLButtonElement>;
  /**
   * What each body was built at, one read-only line a side, inside the command readout. Read from
   * the body rather than from the setup, because the readout describes the fight on screen and the
   * body is what is in it. Like everything in that disclosure, it never touches `open`.
   */
  private readonly attributeLines: Record<"left" | "right", HTMLElement>;
  private visible = true;

  /**
   * @param host where the readout is built.
   * @param onSkim what to do when somebody picks a skim speed, or nothing at all for a host that
   *   has no simulation to skim. The control is inert rather than absent in that case, because a
   *   panel whose contents depend on who constructed it is a panel two people describe differently.
   * @param onDrive what to do when somebody presses a side's Command or Stand down. It is one
   *   question either way -- "that side's button" -- and the host decides which act it is from who
   *   is commanding. Inert when absent, for the same reason as `onSkim`.
   */
  constructor(
    host: HTMLElement,
    onSkim: ((speed: number) => void) | null = null,
    onDrive: ((side: "left" | "right") => void) | null = null,
  ) {
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
        <div class="limbs">
          <div class="limbs-title"><span data-title-left>Left</span><button class="drive" type="button" data-drive-left>Command</button></div>
          <div class="vitality-track"><span class="vitality-fill" data-vitality-left></span></div>
          <div class="vitality-value" data-vitality-value-left>100% vitality</div>
          <div class="limbs-title"><span data-title-right>Right</span><button class="drive" type="button" data-drive-right>Command</button></div>
          <div class="vitality-track"><span class="vitality-fill" data-vitality-right></span></div>
          <div class="vitality-value" data-vitality-value-right>100% vitality</div>
          <details class="injuries">
            <summary>critical injuries</summary>
            <div data-limbs-left></div>
            <div data-limbs-right></div>
          </details>
          <details class="injuries" data-commands>
            <summary>command readout</summary>
            <div class="limb"><span class="limb-name">skim
              <select data-skim>
                <option value="1">x1 real time</option>
                <option value="2">x2</option>
                <option value="4">x4</option>
              </select>
            </span></div>
            <div class="limb"><span class="limb-name" data-attributes-left></span></div>
            <div class="limb"><span class="limb-name" data-attributes-right></span></div>
          </details>
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
    this.vitalityFills = {
      left: pick("[data-vitality-left]"),
      right: pick("[data-vitality-right]"),
    };
    this.vitalityValues = {
      left: pick("[data-vitality-value-left]"),
      right: pick("[data-vitality-value-right]"),
    };
    this.perf = pick("[data-perf]");
    this.attributeLines = {
      left: pick("[data-attributes-left]"),
      right: pick("[data-attributes-right]"),
    };
    this.driveButtons = {
      left: pick("[data-drive-left]") as HTMLButtonElement,
      right: pick("[data-drive-right]") as HTMLButtonElement,
    };
    for (const side of ["left", "right"] as const) {
      const button = this.driveButtons[side];
      // Kept from `Controls`, which listens on the window: a press on this button is not an order
      // on the arena behind it. The release is let through, so a camera drag that began on the
      // canvas and was let go over the button still ends.
      for (const kind of ["pointerdown", "pointermove"]) {
        button.addEventListener(kind, (event) => event.stopPropagation());
      }
      button.addEventListener("click", () => {
        // Focus handed straight back, or the next Enter -- or a held Space, whose repeats
        // `Controls` does not cancel -- presses the button again.
        button.blur();
        onDrive?.(side);
      });
    }
    this.skimPicker = pick("[data-skim]") as HTMLSelectElement;
    this.skimPicker.addEventListener("change", () => {
      onSkim?.(Number(this.skimPicker.value));
    });
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
          ${lastHit.projectile ? `
          <tr><th>projectile mass</th><td>${lastHit.projectile.massKg.toFixed(3)} kg</td></tr>
          <tr><th>arrival speed</th><td>${lastHit.projectile.arrivalSpeedMps.toFixed(1)} m/s</td></tr>
          <tr><th>point-first</th><td>${Math.round(Math.max(0, lastHit.projectile.signedShaftAlignment) * 100)}%</td></tr>
          <tr><th>contact zone</th><td>${lastHit.projectile.contactedZone}</td></tr>
          <tr><th>usable energy</th><td>${lastHit.projectile.usableEnergyJ.toFixed(1)} J</td></tr>
          <tr><th>efficiency</th><td>${Math.round(lastHit.projectile.penetrationEfficiency * 100)}%</td></tr>
          <tr><th>pre / post armour</th><td>${lastHit.projectile.preArmourDamage.toFixed(2)} / ${lastHit.projectile.postArmourDamage.toFixed(2)}</td></tr>
          ` : `<tr><th>edge</th><td>${Math.round(lastHit.edgeAlignment * 100)}%</td></tr>`}
          <tr><th>closing</th><td>${lastHit.closingSpeed.toFixed(1)} m/s</td></tr>
          <tr><th>arriving energy</th><td>${lastHit.energyJ.toFixed(1)} J</td></tr>
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
      const drive = commandAction(telemetry.driving, side) === "stand-down" ? "Stand down" : "Command";
      if (this.driveButtons[side].textContent !== drive) this.driveButtons[side].textContent = drive;
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

    // The picker is a person's control and is written to only when the host disagrees with it,
    // which happens on the one edge the person did not make: `leave` puts the skim back to 1 on the
    // way to the setup screen, so a fight started after one that was being skimmed is real time.
    const skim = String(telemetry.command.skim);
    if (this.skimPicker.value !== skim) this.skimPicker.value = skim;
    for (const side of ["left", "right"] as const) {
      const built = fighters[side].attributes;
      const line = `${side === "left" ? "Left" : "Right"} attributes: `
        + ((built && describeAttributes(built)) || "default");
      if (this.attributeLines[side].textContent !== line) this.attributeLines[side].textContent = line;
    }

    this.perf.textContent = `${telemetry.fps.toFixed(0)} fps · physics ${telemetry.physicsMs.toFixed(
      2,
    )} ms · ${telemetry.meshes} meshes`;
  }
}

