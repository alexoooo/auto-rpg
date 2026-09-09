import type { Combatant } from "./units";
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
  /**
   * What each side's mind is asking the executor for, and what it is getting.
   *
   * One field rather than seven, because the panel is one thing and a `Telemetry` whose fields have
   * to be assembled in the right combination to mean anything is a record that can be half-filled.
   * Empty `sides` is a bout of two minds that write no command -- every hand-coded style below the
   * fourth executor -- and takes the tables away while leaving the disclosure, which also carries
   * the skim.
   */
  command: CommandReadout;
}

/**
 * What one side of the command readout says. Session 03 of the learn set.
 *
 * **Facts the mind published, decoded into the units the command is written in, and nothing
 * inferred.** The rule is `FighterView`'s and it matters more here than usual: this panel exists so
 * that somebody watching iteration 8 and iteration 93 can say what changed, and a readout that
 * answered "it is being too cautious" instead of printing the stand-off it asked for would be a
 * readout arguing with the fight rather than describing it.
 *
 * The pairing is the point. `standOff` is what the mind asked for and `heldOff` is what the body
 * actually holds, both as multiples of the *other* body's published reach, which is the coordinate
 * `StyleCommand.standOff` is written in. The two together are the owner's complaint stated as a
 * number: a mind that "stays just out of reach" is one whose asked and held stand-off agree at
 * something above 1, and a mind that hugs is one where both are near zero.
 */
export interface CommandSideReadout {
  readonly side: Side;
  /** The mind's own name, which is a wrapper's inner name when a takeover is rebasing. */
  readonly mind: string;
  /** Where a loaded table came from, or null for a mind whose weights are in the tree. */
  readonly provenance: string | null;
  /** Commanded stand-off, as a multiple of their published reach. */
  readonly standOff: number;
  /** The gap actually held, in the same coordinate. */
  readonly heldOff: number;
  readonly advance: number;
  readonly strafe: number;
  readonly lean: number;
  readonly commit: number;
  readonly abort: number;
  readonly parry: number;
  /** Their arm's phase as this mind reads it, and what this mind is doing about it. */
  readonly phase: string;
  readonly stance: string;
  /**
   * How often the pilot is being asked, per second of **wall clock**, over the last frame or two.
   *
   * Wall clock and not the bout clock, which is the opposite of what the rest of this panel does,
   * and the reason is that the two are not the same clock when a frame is missed. A mind is
   * stepped from the physics observable at the fixed sub-step rate, while `Combat.advance` counts
   * the rendered frame's delta -- clamped at `maxFrameSeconds` so a stall cannot teleport a body.
   * On a host that drops frames the mind therefore goes on asking in real time while the bout
   * clock falls behind, and an average taken against the bout clock reads twenty times the
   * cadence, which is a number about the host and not about the mind.
   *
   * What a person watching wants from this row is "is it still deciding, and how often", so it is
   * a rate over the interval between readouts, lightly smoothed because a single frame's window is
   * noisy. It reads about the tactics table's cadence at speed 1 and about four times it under the
   * x4 skim, which is the readout's own check that the skim runs extra steps rather than a bigger
   * one, and it falls to zero on pause because a paused mind is not asking.
   */
  readonly asksPerSecond: number;
  /**
   * The two habits the reward pays nothing for, running.
   *
   * `EngagementTracker` in `src/engagement.ts` has counted both since before the style set and
   * `scripts/tournament.mjs` has printed both, and until this panel neither was visible while a
   * bout was happening. They are here rather than in a post-bout table because the question they
   * answer is "is it doing it *now*", which a total at the end cannot.
   */
  readonly stallSeconds: number;
  readonly outsideReachSeconds: number;
}

export interface CommandReadout {
  /** The diagnostics skim in force: 1, 2 or 4. See `SKIM_SPEEDS` in `src/host-run.ts`. */
  readonly skim: number;
  readonly sides: readonly CommandSideReadout[];
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
  /**
   * The two halves of the command readout, rewritten in place and never opened.
   *
   * `AGENTS.md`'s diagnostics rule is that nothing which changes state may open, close or navigate
   * a surface a person owns. `update` writes into these two elements and never touches the `open`
   * attribute of the disclosure holding them, so a panel somebody opened to watch a stand-off stays
   * open through a verdict, a restart and a takeover, and one they left shut stays shut through all
   * three. That is also why the readout ships shut: it is a diagnostic, not a gauge.
   */
  private readonly commandLists: Record<"left" | "right", HTMLElement>;
  private readonly skimPicker: HTMLSelectElement;
  private visible = true;

  /**
   * @param host where the readout is built.
   * @param onSkim what to do when somebody picks a skim speed, or nothing at all for a host that
   *   has no simulation to skim. The control is inert rather than absent in that case, because a
   *   panel whose contents depend on who constructed it is a panel two people describe differently.
   */
  constructor(host: HTMLElement, onSkim: ((speed: number) => void) | null = null) {
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
          <details class="injuries" data-commands>
            <summary>command readout</summary>
            <div class="limb"><span class="limb-name">skim
              <select data-skim>
                <option value="1">x1 real time</option>
                <option value="2">x2</option>
                <option value="4">x4</option>
              </select>
            </span></div>
            <div data-command-left></div>
            <div data-command-right></div>
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
    this.rigPanel.style.display = "none";
    this.commandLists = {
      left: pick("[data-command-left]"),
      right: pick("[data-command-right]"),
    };
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
      const found = telemetry.command.sides.find((entry) => entry.side === side) ?? null;
      this.commandLists[side].innerHTML = found === null ? "" : commandRows(found);
    }

    this.perf.textContent = `${telemetry.fps.toFixed(0)} fps · physics ${telemetry.physicsMs.toFixed(
      2,
    )} ms · ${telemetry.meshes} meshes`;
  }
}

/**
 * One side of the command readout, as rows.
 *
 * A `hit-rows` table because that is what the panel above it already is and a diagnostics surface
 * that invented its own layout would need `style.css` to be edited for it -- and `style.css` is not
 * type-checked, so a class that does not exist is a silent nothing rather than an error.
 *
 * The gates are printed as the three words that are on, and as an em dash when none is, rather than
 * as three zeros. A row of zeros reads as a mind that is not deciding anything; "commit" on its own
 * reads as the one bit that changed, which is what somebody watching a stroke is looking for.
 */
function commandRows(read: CommandSideReadout): string {
  const gates = [read.commit >= 0.5 ? "commit" : "", read.abort >= 0.5 ? "abort" : "",
    read.parry >= 0.5 ? "parry" : ""].filter(Boolean);
  const title = read.side === "left" ? "Left" : "Right";
  return `
    <div class="limb"><span class="limb-name">${title}: ${read.mind}</span></div>
    ${read.provenance === null ? "" : `<div class="limb"><span class="limb-name">${read.provenance}</span></div>`}
    <table class="hit-rows">
      <tr><th>stand-off</th><td>${read.standOff.toFixed(2)} asked &middot; ${read.heldOff.toFixed(2)} held</td></tr>
      <tr><th>advance</th><td>${read.advance.toFixed(2)}</td></tr>
      <tr><th>strafe / lean</th><td>${read.strafe.toFixed(2)} / ${read.lean.toFixed(2)}</td></tr>
      <tr><th>gates</th><td>${gates.length > 0 ? gates.join(", ") : "&mdash;"}</td></tr>
      <tr><th>their phase</th><td>${read.phase}</td></tr>
      <tr><th>stance</th><td>${read.stance}</td></tr>
      <tr><th>asks</th><td>${read.asksPerSecond.toFixed(1)} /s</td></tr>
      <tr><th>near-range stall</th><td>${read.stallSeconds.toFixed(1)} s</td></tr>
      <tr><th>outside reach</th><td>${read.outsideReachSeconds.toFixed(1)} s</td></tr>
    </table>
  `;
}
