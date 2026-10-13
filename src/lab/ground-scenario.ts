import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { LabScenario, LabShell } from "./lab-scenario.ts";
import { labAddress, type LabAddress } from "./scenarios.ts";
import { groundShove, startGround } from "./ground-mode.ts";
import { groundPlacement, groundPostures } from "./ground-starts.ts";
import { recordHistory } from "./history.ts";
import { createPlayer } from "./player.ts";
import { shoveSound } from "./sound-log.ts";
import { loadoutSpec } from "./loadout.ts";
import { drawBody } from "../render/body-shapes.ts";
import { action, choice, following, note, quantity, readings, slider, toggle, when } from "../ui/controls.ts";

/** Ground starts, live recovery evidence, and repeated falls on the same physical body. */
export function groundScenario(scene: Scene, shell: LabShell): LabScenario {
  let address = labAddress("?scenario=ground"), fault = "";
  let current: { shove(): void } | null = null;
  let shown: ReturnType<ReturnType<typeof startGround>["frame"]> | null = null;
  const trail = note(() => shown?.trail.slice(-12).map(t => `${t.at.toFixed(2)} s: ${t.position} — ${t.controller}, ${t.mode}, ${t.phase}`).join("\n") ?? "");
  const attempts = note(() => shown?.attempts.map(a => `${a.controller}: ${a.end}, ${a.seconds.toFixed(2)} s`).join("\n") ?? "");
  const phases = note(() => shown ? Object.entries(shown.phases).map(([phase, seconds]) => `${phase}: ${seconds.toFixed(2)} s`).join("; ") : "");
  const change = (ground: Partial<LabAddress["ground"]>) => shell.load({ ...address, ground: { ...address.ground, ...ground } });
  const meter = readings({ position: { name: "Position" }, doing: { name: "Sub-mind / mode / phase" },
    seconds: { name: "Time down", unit: "s" }, handback: { name: "Time to hand-back", unit: "s" },
    hands: { name: "Hand loads", unit: "body weight" }, feet: { name: "Foot loads", unit: "body weight" },
    balance: { name: "Balance", unit: "%" }, assist: { name: "Peak help", unit: "N / N m" },
    impulse: { name: "Total help", unit: "N s / N m s" }, totals: { name: "Falls / stood / median / worst" }, status: { name: "Run" } });
  return {
    keys: new Set(),
    placement(spec, next) {
      address = next; shown = null; fault = "";
      try { return groundPlacement(spec, next); }
      catch (error) { fault = String(error instanceof Error ? error.message : error); throw error; }
    },
    panels: {
      scenario: [
        choice("Start", (["shoved", "dropped", "placed"] as const).map(value => ({ value, name: value })), () => address.ground.start, start => change({ start })),
        quantity("Seed", 1, value => Number.isSafeInteger(value) && value >= 0 && value <= 4294967295, () => address.seed,
          seed => shell.load({ ...address, seed })),
        when(() => address.ground.start === "placed", following(() => address.model, () => choice("Posture",
          groundPostures(loadoutSpec(address)).map(value => ({ value, name: value })), () => address.ground.posture, posture => change({ posture })))),
        when(() => address.ground.start === "shoved", slider("Shove direction", 0, 360, 5, () => groundShove(address).degrees, degrees => change({ degrees }), value => value.toFixed(1))),
        when(() => address.ground.start === "shoved", slider("Shove impulse, N s", 40, 90, 1, () => groundShove(address).impulse, impulse => change({ impulse }), value => value.toFixed(1))),
        when(() => address.ground.start === "shoved", action("Draw shove from seed", () => change({ degrees: null, impulse: null }))),
        note(() => "Driven by: As the mind does. Choose its recovery under Character → Mind → When down."),
        choice("Foe", ([0, 1, 2, 4] as const).map(value => ({ value, name: value === 0 ? "None" : `${value} m` })), () => address.ground.foe, foe => change({ foe })),
        toggle("Gusts", () => address.ground.gusts, () => change({ gusts: !address.ground.gusts })),
        note(() => fault),
      ],
      controls: [action("Next seed", () => shell.load({ ...address, seed: (address.seed + 1) >>> 0 })),
        action("Shove again", () => current?.shove())],
      readout: [meter, trail, attempts, phases],
    },
    timelineLabel: "The last 35 seconds, one physics step per notch.",
    start({ actor, address: next, changed, clock, heard, hears }) {
      address = next;
      const sound = shoveSound(actor.body.built);
      const session = startGround(actor, next, { pushed: (part, impulse, at) => heard(sound(part, impulse, at)), hears });
      const dummy = session.dummy ? drawBody(session.dummy.fighter.built, scene, new Color3(.75, .45, .25)) : null;
      const history = recordHistory(actor.body.built, actor.world, 35, () => session.frame());
      const foeHistory = session.dummy ? recordHistory(session.dummy.fighter.built, actor.world, 35, () => null) : null;
      const recording = { live: history.live, show(frame: number) { history.show(frame); foeHistory?.show(frame); } };
      const player = createPlayer({ world: actor.world, recording }, changed, clock);
      const run = {
        player, recording: () => ({ frames: history.frames, live: history.live() }), drive() {}, closure: () => 0,
        shove() { player.goLive(); session.shove(); },
        readout(frame: number | null) {
          shown = history.at(frame ?? history.live());
          if (!shown) return null;
          const loads = shown.loads, summary = shown.summary;
          const seconds = (v: number | null) => v === null ? "—" : v.toFixed(2);
          const load = (name: string) => loads[name]?.toFixed(2) ?? "—";
          meter.write({ position: shown.position, doing: `${shown.controller} / ${shown.mode} / ${shown.phase} ${shown.stage ?? ""}`,
            seconds: shown.seconds.toFixed(2), handback: seconds(shown.handback),
            hands: `${load("hand.left")} / ${load("hand.right")}`,
            feet: `${load("foot.left")} / ${load("foot.right")}`,
            balance: String(shown.balance), assist: `${shown.assist.forcePeak.toFixed(2)} / ${shown.assist.momentPeak.toFixed(2)}`,
            impulse: `${shown.assist.forceImpulse.toFixed(2)} / ${shown.assist.momentImpulse.toFixed(2)}`,
            totals: `${summary.falls} / ${summary.stood} / ${seconds(summary.median)} s / ${seconds(summary.worst)} s`, status: shown.status });
          if (shown.status !== "running" && frame === null) player.setPaused(true);
          trail.refresh(); attempts.refresh(); phases.refresh();
          return shown.time;
        },
        dispose() { if (current === run) current = null; history.dispose(); foeHistory?.dispose(); dummy?.dispose(); session.dispose(); },
      };
      current = run;
      return run;
    },
  };
}
