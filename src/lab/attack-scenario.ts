import "@babylonjs/core/Culling/ray.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { massOf } from "../core/control/support.ts";
import { fighterHands } from "../render/strike-hands.ts";
import { legend, readings, slider } from "../ui/controls.ts";
import { startAttack } from "./attack-mode.ts";
import { actionReadout } from "../ui/action-readout.ts";
import { recordHistory } from "./history.ts";
import type { LabScenario } from "./lab-scenario.ts";
import { createPlayer } from "./player.ts";
import { gustText, type WindSettings } from "./wind.ts";

/** Seconds held for replay, including target positions, impacts and selection. */
const HISTORY_SECONDS = 30;
const MARKS = {
  waiting: { colour: new Color3(0.35, 0.7, 0.85), name: "target — click to select" },
  selected: { colour: new Color3(1, 0.7, 0.2), name: "ordered target" },
  hit: { colour: new Color3(0.7, 0.8, 0.7), name: "impacted target" },
};

/** Attack orders against physical, sensed targets, with live wind and target movement controls. */
export function attackScenario(scene: Scene): LabScenario {
  let speed = 0, wind: WindSettings = { rate: 0, strength: 0 }, weight = 0;
  let current: ReturnType<typeof startAttack> | null = null;
  const setWind = (settings: WindSettings): void => { wind = settings; if (current) current.wind.settings = settings; };
  const actionDetails = actionReadout();
  const shown = readings({ hits: { name: "Physical impacts" }, target: { name: "Focus" },
    committed: { name: "Committed" }, landed: { name: "Landed" }, blocked: { name: "Blocked" }, missed: { name: "Clean misses" },
    refused: { name: "Refused" }, stalled: { name: "Stalled" }, interrupted: { name: "Interrupted" }, phase: { name: "Attack" }, state: { name: "Body" }, wind: { name: "Wind", unit: "N" } });
  return {
    keys: new Set(),
    panels: {
      controls: [
        slider("Target speed, m/s", 0, 2, 0.05, () => speed, (value) => { speed = value; if (current) current.state.speed = value; }, (value) => value.toFixed(2)),
        slider("Gusts", 0, 2, 0.1, () => wind.rate, (rate) => setWind({ ...wind, rate }), (rate) => `${rate.toFixed(1)} /s`),
        slider("Gust force", 0, 200, 1, () => wind.strength, (strength) => setWind({ ...wind, strength }), (strength) => gustText(strength, weight)),
      ],
      readout: [shown, { element: actionDetails.element, refresh() {} }, legend(Object.values(MARKS))],
    },
    timelineLabel: `The last ${HISTORY_SECONDS} seconds; dragging pauses. Click a target to attack it.`,
    start({ actor, address, changed, clock, hears }) {
      const { world } = actor, { built } = actor.body;
      const attack = startAttack(actor, { seed: address.seed, count: address.targets, speed, wind, hears });
      current = attack;
      weight = massOf([...built.segments.values()]) * -world.physics.gravity[1];
      const hands = fighterHands({ minded: { body: actor.body } });
      const history = recordHistory(built, world, HISTORY_SECONDS, () => ({ ...attack.frame(), closure: hands.snapshot() }));
      const player = createPlayer({ world, recording: history }, changed, clock);
      const balls: { mesh: Mesh; material: StandardMaterial; id: string }[] = [];
      const pointer = scene.onPointerObservable.add((info) => {
        if (info.type !== PointerEventTypes.POINTERTAP || info.event.button !== 0) return;
        if (player.shownFrame() !== null && player.shownFrame() !== history.live()) return;
        const ball = balls.find((ball) => ball.mesh === info.pickInfo?.pickedMesh);
        if (ball) attack.select(ball.id);
      });
      return {
        player,
        recording: () => ({ frames: history.frames, live: history.live() }),
        drive() {},
        readout(frame) {
          const moment = history.at(frame ?? history.live()) ?? { ...attack.frame(), closure: hands.snapshot() };
          for (let i = 0; i < moment.targets.length; i++) {
            const target = moment.targets[i]!;
            let ball = balls[i];
            if (!ball) {
              const mesh = MeshBuilder.CreateSphere(`lab.attack.${i}`, { diameter: 1, segments: 16 }, scene);
              const material = new StandardMaterial(`lab.attack.${i}`, scene);
              material.specularColor = Color3.Black();
              mesh.material = material;
              ball = { mesh, material, id: target.id }; balls.push(ball);
            }
            ball.id = target.id;
            ball.mesh.setEnabled(true);
            ball.mesh.isPickable = !target.hit;
            ball.mesh.position.set(...target.centre);
            ball.mesh.scaling.setAll(2 * target.radius);
            const colour = target.hit ? MARKS.hit.colour : target.id === moment.selected ? MARKS.selected.colour : MARKS.waiting.colour;
            ball.material.diffuseColor = colour;
            ball.material.emissiveColor = colour.scale(0.3);
            ball.material.alpha = target.fade;
          }
          for (let i = moment.targets.length; i < balls.length; i++) balls[i]!.mesh.setEnabled(false);
          shown.write({ ...Object.fromEntries(Object.entries(moment.totals).map(([key, value]) => [key, String(value)])) as Record<keyof typeof moment.totals, string>, hits: String(moment.hits), target: moment.selected ?? "None", phase: moment.phase ?? "Guard",
            state: moment.down ? "Down" : "Upright", wind: Math.hypot(...moment.wind).toFixed(1) });
          actionDetails.refresh({ actions: moment.actions, ledger: moment.ledger, engagement: moment.engagement });
          return moment.time;
        },
        closure: (hand) => history.at(player.shownFrame() ?? history.live())?.closure[hand] ?? hands.closure(hand),
        dispose() {
          if (current === attack) current = null;
          scene.onPointerObservable.remove(pointer);
          for (const ball of balls) { ball.mesh.dispose(); ball.material.dispose(); }
          history.dispose(); hands.dispose(); attack.dispose();
        },
      };
    },
  };
}
