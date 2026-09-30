import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { blowDamage, rulebook } from "../core/rules/rulebook.ts";
import { STAND, throwBlow } from "./blow.ts";
import { LAB_BLOWS, type StoredBlow } from "./blows.ts";
import { watchClubBlow, type ClubLanding } from "./club-blow.ts";
import { recordHistory } from "./history.ts";
import type { LabScenario, LabShell } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";

/**
 * **The Blow scenario**: the loaded body throws a stored blow (`blows.ts`) standing, as the strike
 * search threw it (`throwBlow`, `blow.ts`), into an opponent's head, and the landing is read as the
 * search reads it (`watchClubBlow`, `club-blow.ts`): its closing speed, the masses the contact
 * meets, its energy and its worth in hit points (`blowDamage`, the arena's rulebook). The head is a
 * mark, not a body: the club passes through it, and the reading is its first touch.
 *
 * A club blow needs the club in the hand it was found with; the menu's card puts it there
 * (`SCENARIOS`' `holds`). Without it the body stands in guard and the panel says so. The world
 * pauses `HOLD` seconds after the pushes begin, so the whole blow stays in the recording to scrub
 * or replay; Restart throws it again.
 *
 * **The page's reading is not the search's to the digit.** The unit's blow, found on Havok, lands
 * glancing on Rapier, and its energy follows float noise that moves no step of its timing: at
 * 120 Hz it lands 0.2915 s after the pushes begin every time, but with 37.6 J on a 20 m ground and
 * 27.6 J on the lab's 40 m one (closing 8.63 against 7.23 m/s; the pelvis 0.1 mm apart at the
 * pushes), in the page, and 45.9 J on the 20 m ground in Node (`tests/core-lab-blow.test.mjs`
 * holds the Node reading).
 */

/** What the history holds of each step. */
interface BlowMoment {
  readonly time: number;
  /** Seconds since the pushes began (negative before). */
  readonly since: number;
  readonly fallen: boolean;
  readonly landed: ClubLanding | null;
  readonly nearest: number;
  readonly peak: number;
  readonly target: readonly [number, number, number] | null;
}

/** Seconds of the blow the page keeps: the stand, the longest chamber the search tries, the watch and `HOLD`. */
const HISTORY_SECONDS = 6;
/** Seconds after the pushes begin at which the world pauses. */
const HOLD = 1.5;
/** Seconds after the pushes begin in which a blow that has not landed has missed (`core-club-strike.mjs`'s window). */
const WINDOW = 0.5;
const RULES = rulebook("arena");

export function blowScenario(scene: Scene, shell: LabShell): LabScenario {
  const material = (name: string, colour: Color3, alpha: number): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = colour;
    m.emissiveColor = colour.scale(0.5);
    m.specularColor = Color3.Black();
    m.alpha = alpha;
    return m;
  };
  const head = MeshBuilder.CreateSphere("lab.blow.head", { diameter: 1, segments: 24 }, scene);
  head.material = material("lab.blow.head", new Color3(0.85, 0.35, 0.3), 0.35);
  const touch = MeshBuilder.CreateSphere("lab.blow.touch", { diameter: 0.035, segments: 12 }, scene);
  touch.material = material("lab.blow.touch", new Color3(1, 0.85, 0.3), 1);
  for (const mark of [head, touch]) { mark.isPickable = false; mark.setEnabled(false); mark.renderingGroupId = 1; }

  const $ = (id: string): HTMLElement => document.getElementById(id)!;
  const shown = {
    about: $("b-about"), doing: $("b-doing"), since: $("b-since"), closing: $("b-closing"), energy: $("b-energy"),
    hp: $("b-hp"), club: $("b-club"), head: $("b-head"), peak: $("b-peak"), rate: $("b-rate"),
  };
  let chosen: StoredBlow = LAB_BLOWS[0]!;
  const choices = $("b-choice");
  const showChoice = (): void => {
    for (const b of choices.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.blow === chosen.id));
    shown.about.textContent = chosen.line;
  };
  choices.replaceChildren(...LAB_BLOWS.map((blow) => {
    const button = Object.assign(document.createElement("button"), { textContent: blow.name });
    button.dataset.blow = blow.id;
    button.addEventListener("click", () => {
      button.blur();
      if (blow === chosen) return;
      chosen = blow;
      showChoice();
      shell.restart();
    });
    return button;
  }));
  showChoice();

  return {
    keys: new Set(),
    timelineLabel: "The blow, from standing in guard, one physics step a notch; dragging pauses. Arrow keys step once it has focus.",
    start({ built, world, changed, clock }) {
      const stored = chosen;
      const holds = built.spec.held?.some((h) => h.segment === `hand.${stored.hand}`) ?? false;
      // Without the club, the body stands in guard: the same rig with no blow to throw.
      const blow = throwBlow(built, world, holds ? stored.strike : { name: "guard", hand: stored.hand, pushes: [] });
      const watch = holds ? watchClubBlow(built, world, blow, stored.distance, stored.hand) : null;
      const history = recordHistory(built, world, HISTORY_SECONDS, (): BlowMoment => {
        const t = watch?.target;
        return {
          time: blow.time, since: blow.time - blow.pushing, fallen: blow.fallen, landed: watch?.landed ?? null,
          nearest: watch?.nearest ?? Infinity, peak: watch?.peak ?? 0, target: t ? [t.x, t.y, t.z] : null,
        };
      });
      const player = createPlayer({ world, recording: history }, changed, clock);
      let held = false;
      head.scaling.setAll(2 * (watch?.radius ?? 0));
      return {
        player,
        recording: () => ({ frames: history.frames, live: history.live(), wraps: false }),
        drive: () => {},
        readout(frame: number | null): number | null {
          const moment = history.at(frame ?? history.live());
          if (!moment) return null;
          // Pause once the blow is over, so all of it stays to scrub.
          if (!held && frame === null && moment.since >= HOLD) { held = true; player.setPaused(true); }
          const { landed } = moment;
          shown.doing.textContent = !holds ? `Standing: put the club in the ${stored.hand} hand to throw it`
            : moment.fallen ? "Fell before it landed"
            : moment.time < STAND ? "Standing in guard"
            : moment.since < 0 ? "Chambering"
            : landed ? `Landed, ${landed.at.toFixed(3)} s after the pushes began`
            : moment.since > WINDOW ? `Missed: the club passed ${(100 * moment.nearest).toFixed(1)} cm from the head`
            : "Swinging";
          shown.since.textContent = moment.since < 0 ? "-" : moment.since.toFixed(3);
          shown.closing.textContent = landed ? landed.closing.toFixed(2) : "-";
          shown.energy.textContent = landed ? landed.energy.toFixed(1) : "-";
          shown.hp.textContent = landed ? blowDamage(RULES, "blunt", landed.energy).toFixed(2) : "-";
          shown.club.textContent = landed ? landed.clubKg.toFixed(2) : "-";
          shown.head.textContent = landed ? landed.headKg.toFixed(1) : "-";
          shown.peak.textContent = moment.peak.toFixed(1);
          shown.rate.textContent = String(Math.round(1 / world.dt));
          head.setEnabled(moment.target !== null);
          if (moment.target) head.position.set(...moment.target);
          touch.setEnabled(landed !== null);
          if (landed) touch.position.set(...landed.point);
          return moment.time;
        },
        // The skin closes a hand on what it holds; the other stays open.
        closure: () => 0,
        dispose(): void {
          history.dispose();
          watch?.dispose();
          blow.dispose();
          head.setEnabled(false);
          touch.setEnabled(false);
        },
      };
    },
  };
}
