import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BlowSide, LandedBlow } from "../core/rules/blows.ts";
import { rulebook } from "../core/rules/rulebook.ts";
import type { StrikeReport } from "../core/skills/strike.ts";
import { BANDS, FIST, heldIn } from "../core/skills/strikes.ts";
import { throwBlow, watchBlow } from "./blow.ts";
import { LAB_BLOWS, type StoredBlow } from "./blows.ts";
import { recordHistory } from "./history.ts";
import type { LabScenario, LabShell } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { hardestOn } from "./targets.ts";
import { choice, legend, note, readings } from "./hud/controls.ts";

/**
 * **The Blow scenario**: the loaded body throws a stored blow (`blows.ts`) standing, as the strike
 * search threw it (`throwBlow`, `blow.ts`), at a target body: a ball of the part its band names,
 * hung where the blow was found to land (`watchBlow`). The landing is read as a fight reads it
 * (`watchBlows`, `src/core/rules/blows.ts`, by the arena's rulebook): the closing speed and the
 * energy of the blow that took the most from the target, the mass each side's contact met, the
 * share of the blow each surface took and its worth in hit points; and beside it all the blow
 * did and cost, every touch counted. The target is a body in the world, and its touches are heard
 * with the thrower's (`ScenarioContext.hears`).
 *
 * A blow needs its hand to hold what it was found with; the menu's card puts the club there
 * (`SCENARIOS`' `holds`). Holding anything else the body stands in guard and the readout says
 * so. The world pauses `HOLD` seconds after the pushes begin, so the whole blow stays in the
 * recording to scrub or replay; Restart throws it again.
 *
 * **The page's reading is not the search's to the digit.** Float noise that moves no step of a
 * blow's timing still moves its energy by a few percent, with the ground's size (the lab's is 40 m;
 * `research/core-blow.mjs`'s `ground`) and the physics rate. `tests/lab-blow.test.mjs` holds
 * the Node reading on a 20 m ground.
 */

/** What the history holds of each step. */
interface BlowMoment {
  /** The time its mind saw at this step (`BodyView.time`), s. */
  readonly time: number;
  /** Seconds since the pushes were due (negative before), by the blow's clock. */
  readonly since: number;
  /** Where its skills are in the blow (`StrikeReport.phase`), and whether they have thrown it. */
  readonly phase: StrikeReport["phase"];
  readonly thrown: boolean;
  readonly fallen: boolean;
  /** The blow that took the most from the target so far (`hardestOn`), and when it landed, s after the pushes were due. */
  readonly landed: LandedBlow | null;
  readonly at: number | null;
  /** Hit points the target has lost, and the body that threw the blow. */
  readonly done: number;
  readonly cost: number;
  readonly nearest: number | null;
  readonly target: readonly [number, number, number] | null;
}

/** Seconds of the blow the page keeps: the stand, the longest chamber the search tries, the watch and `HOLD`. */
const HISTORY_SECONDS = 6;
/** Seconds after the pushes begin at which the world pauses. */
const HOLD = 1.5;
/** Seconds after the pushes begin in which a blow that has not landed has missed. */
const WINDOW = 0.75;
const RULES = rulebook("arena");
/** What the body is doing at `moment`, by what its skills report: the clock says nothing of a blow that is not thrown. */
function doing(moment: BlowMoment): string {
  const { landed } = moment;
  if (landed) return `Landed, ${moment.at!.toFixed(3)} s after the pushes began`;
  if (moment.fallen) return "Fell before it landed";
  switch (moment.phase) {
    case "chamber": return "Chambering";
    case "swing": return "Swinging";
    case "approach": case "place": case "settle": case null:
      if (!moment.thrown) return "Standing in guard";
      return moment.since > WINDOW && moment.nearest !== null ? `Missed: it passed ${(100 * moment.nearest).toFixed(1)} cm from the target` : "Swinging";
    default: { const never: never = moment.phase; return String(never); }
  }
}

/** A side of a blow, as the readout names it: what was touched, the share it took and its worth. */
const sideLine = (side: BlowSide): string => `${side.item ?? side.segment}: ${(100 * side.share).toFixed(0)} %, ${side.damage.toFixed(2)} HP`;

const MARKS = {
  target: { colour: new Color3(0.85, 0.35, 0.3), name: "the target body" },
  touch: { colour: new Color3(1, 0.85, 0.3), name: "where it touched" },
};

export function blowScenario(scene: Scene, shell: LabShell): LabScenario {
  const material = (name: string, colour: Color3, alpha: number): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = colour;
    m.emissiveColor = colour.scale(0.5);
    m.specularColor = Color3.Black();
    m.alpha = alpha;
    return m;
  };
  const ball = MeshBuilder.CreateSphere("lab.blow.target", { diameter: 1, segments: 24 }, scene);
  ball.material = material("lab.blow.target", MARKS.target.colour, 0.35);
  const touch = MeshBuilder.CreateSphere("lab.blow.touch", { diameter: 0.035, segments: 12 }, scene);
  touch.material = material("lab.blow.touch", MARKS.touch.colour, 1);
  for (const mark of [ball, touch]) { mark.isPickable = false; mark.setEnabled(false); mark.renderingGroupId = 1; }

  const shown = readings({
    doing: { name: "Doing" }, since: { name: "Since the pushes", unit: "s" }, closing: { name: "Closing speed", unit: "m/s" },
    energy: { name: "Energy", unit: "J" }, took: { name: "The target's side" }, gave: { name: "The striker's side" },
    struck: { name: "Target's mass met", unit: "kg" }, striking: { name: "Striker's mass met", unit: "kg" },
    done: { name: "Done, every touch", unit: "HP" }, cost: { name: "Cost, every touch", unit: "HP" }, rate: { name: "Rate", unit: "Hz" },
  });
  let chosen: StoredBlow = LAB_BLOWS[0]!;
  const about = note(() => chosen.line);

  return {
    keys: new Set(),
    panels: {
      scenario: [
        choice("Blow", LAB_BLOWS.map((blow) => ({ value: blow, name: blow.name })), () => chosen, (blow) => {
          chosen = blow;
          about.refresh();
          shell.restart();
        }),
        about,
      ],
      readout: [shown, legend([MARKS.target, MARKS.touch])],
    },
    timelineLabel: "The blow, from standing in guard, one physics step a notch; dragging pauses. Arrow keys step once it has focus.",
    start({ actor, changed, clock, hears }) {
      const { world } = actor, { built } = actor.body;
      const stored = chosen;
      const holds = heldIn(built.spec, stored.hand) === stored.held;
      // Holding anything else, the body stands in guard: the same rig with no blow to throw.
      const blow = throwBlow(actor, { hand: stored.hand, strike: holds ? stored.strike : { name: "guard", hand: stored.hand, pushes: [] }, place: stored.place, band: stored.band });
      const watch = holds ? watchBlow(actor, blow, RULES, { hung: hears }) : null;
      let at: number | null = null;
      const history = recordHistory(built, world, HISTORY_SECONDS, (): BlowMoment => {
        const reading = watch?.reading, landed = reading ? hardestOn(reading.blows, "dummy") : null, since = blow.time - blow.pushing;
        if (landed && at === null) at = since;
        return {
          time: blow.body.view.time, since, phase: blow.report.strike.phase, thrown: blow.report.strike.thrown[stored.hand] > 0,
          fallen: blow.body.view.down, landed, at: landed ? at : null, done: reading?.done ?? 0, cost: reading?.cost ?? 0,
          nearest: reading?.nearest ?? null, target: watch?.centre ?? null,
        };
      });
      const player = createPlayer({ world, recording: history }, changed, clock);
      let held = false;
      ball.scaling.setAll(2 * (watch?.radius ?? 0));
      return {
        player,
        recording: () => ({ frames: history.frames, live: history.live() }),
        drive: () => {},
        readout(frame: number | null): number | null {
          const moment = history.at(frame ?? history.live());
          if (!moment) return null;
          // Pause once the blow is over, so all of it stays to scrub.
          if (!held && frame === null && moment.since >= HOLD) { held = true; player.setPaused(true); }
          const { landed } = moment, pushed = moment.phase === "swing" || moment.thrown;
          const took = landed?.sides.find((side) => side.fighter === "dummy"), gave = landed?.sides.find((side) => side.fighter !== "dummy");
          shown.write({
            doing: holds ? doing(moment) : `Standing: the ${stored.hand} hand holds ${stored.held === FIST ? "nothing" : `the ${stored.held}`} to throw it`,
            since: pushed ? moment.since.toFixed(3) : "-",
            closing: landed ? landed.closing.toFixed(2) : "-", energy: landed ? landed.energy.toFixed(1) : "-",
            took: took ? sideLine(took) : `${BANDS[stored.band]}: -`, gave: gave ? sideLine(gave) : "-",
            struck: took ? took.kg.toFixed(2) : "-", striking: gave ? gave.kg.toFixed(2) : "-",
            done: moment.done.toFixed(2), cost: moment.cost.toFixed(2), rate: String(Math.round(1 / world.dt)),
          });
          ball.setEnabled(moment.target !== null);
          if (moment.target) ball.position.set(...moment.target);
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
          ball.setEnabled(false);
          touch.setEnabled(false);
        },
      };
    },
  };
}
