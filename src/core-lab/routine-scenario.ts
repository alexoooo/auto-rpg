import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { LabScenario } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { startRoutine, type Step } from "./routine.ts";
import { recordTimeline, type FrameReading } from "./timeline.ts";
import { groundDisc } from "./view.ts";

/**
 * **The Routine scenario**: the lab routine (`routine.ts`) on the stance's legs -- walk forward,
 * strike three times, turn, walk back, turn -- to show the muscles. The readout is the striking
 * fist's speed, read from the hand's body each physics sub-step, and each strike's peak. Its last
 * loop is recorded (`timeline.ts`); the disc on the ground is where the loop starts and ends.
 */

const describe = (step: Step): string => {
  switch (step.kind) {
    case "settle": return "Settling";
    case "walk": return "Walking";
    case "turn": return "Turning";
    case "set": return "Setting its stance";
    case "strike": return `Striking: ${step.strike.name}`;
    default: { const never: never = step; return String(never); }
  }
};

export function routineScenario(scene: Scene): LabScenario {
  groundDisc(scene, "lab.start", 0.25, new Color3(0.85, 0.64, 0.36), 0.35, 0.004);
  const $ = (id: string): HTMLElement => document.getElementById(id)!;
  const doing = $("doing"), fist = $("fist"), strikesBody = $("strikes");

  return {
    keys: new Set(),
    timelineLabel: "The routine's loop, one physics step a notch; dragging pauses. Arrow keys step once it has focus.",
    start({ built, world, changed, clock }) {
      const routine = startRoutine(built, world), timeline = recordTimeline(built, routine, world);
      const player = createPlayer({ world, recording: timeline }, changed, clock);
      let shownStrikes = -1;
      return {
        player,
        recording: () => ({ frames: timeline.frames, live: timeline.live(), wraps: true }),
        drive: () => {},
        readout(frame: number | null): number {
          const reading: FrameReading | null = frame === null ? null : timeline.at(frame);
          doing.textContent = describe(reading?.step ?? routine.state().step);
          fist.textContent = (reading?.fist ?? routine.fistSpeed()).toFixed(1);
          if (routine.strikes.length !== shownStrikes) {
            shownStrikes = routine.strikes.length;
            strikesBody.replaceChildren(...routine.strikes.slice(-6).map((s) => {
              const row = document.createElement("tr");
              row.append(Object.assign(document.createElement("td"), { textContent: s.name }),
                Object.assign(document.createElement("td"), { textContent: s.peak.toFixed(1) }));
              return row;
            }));
          }
          return reading?.time ?? routine.state().time;
        },
        // A hand closes only to strike.
        closure(hand) {
          const frame = player.shownFrame();
          return frame === null ? routine.closure(hand) : timeline.at(frame)?.closure[hand] ?? 0;
        },
        dispose(): void {
          timeline.dispose();
          routine.dispose();
        },
      };
    },
  };
}
