import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { LabScenario, LabShell } from "./lab-scenario.ts";
import { GROUND_RISES, labAddress, type GroundRise, type LabAddress } from "./scenarios.ts";
import { groundShove, ROUND_FALLS, startGround, STAND_CHECK } from "./ground-mode.ts";
import { groundPlacement, groundPostures } from "./ground-starts.ts";
import { groundTechnique, plantWaypoint } from "./ground-technique.ts";
import { TECHNIQUES } from "../core/mind/ground/techniques.ts";
import type { TechniqueName, TechniquePart } from "../core/mind/ground/technique.ts";
import { partLookup } from "../core/mind/catalog.ts";
import type { StandUpConfig } from "../core/mind/ground/stand-up.ts";
import { STAND_UP, type FighterConfig } from "../core/mind/config.ts";
import { recordHistory } from "./history.ts";
import { createPlayer } from "./player.ts";
import { shoveSound } from "./sound-log.ts";
import { loadoutSpec } from "./loadout.ts";
import { drawBody } from "../render/body-shapes.ts";
import { action, choice, following, menu, note, quantity, readings, slider, toggle, when } from "../ui/controls.ts";
import { GROUND_LEVELS } from "./ground-environment.ts";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { sceneModel } from "../render/asset-cache.ts";
import { loadArtAssets } from "../render/art-assets.ts";
import { assembleCryptKit } from "../environment/crypt-kit.ts";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";

/** What each way of getting up is called in the menu. */
const RISES: Readonly<Record<GroundRise, string>> = { "step-up": "Stand up: step up, as the game", "learned-rise": "Stand up: learned rise (experimental)",
  "support-recovery": "Support recovery (experimental)", mind: "As its mind says" };

/** The mind `chosen` with its sub-minds those `rise` names: the game's Stand up by one technique, support recovery, or its own. */
function risingBy(chosen: FighterConfig, rise: GroundRise): FighterConfig {
  switch (rise) {
    case "step-up": return { ...chosen, subs: [STAND_UP] };
    case "learned-rise": { const learned: StandUpConfig = { ...STAND_UP, techniques: [{ kind: "learned-rise" }] }; return { ...chosen, subs: [learned] }; }
    case "support-recovery": return { ...chosen, subs: [{ kind: "support-recovery" }] };
    case "mind": return chosen;
    default: { const never: never = rise; throw new Error(`unknown rise ${String(never)}`); }
  }
}

/**
 * **The Stand-up scenario**: a body shoved, dropped or placed on the ground, or put through a round
 * of the owner's target's falls (sixteen ways round, one after another, each once it stands
 * again), getting up by the game's Stand up or another way, or a technique alone. Every stand is
 * verified as the target verifies it (`STAND_CHECK`: quiet, upright and on both feet, then holding
 * and a short walk); the readout is the time from its recovery's takeover to that, the round's
 * totals, and the ground history (`ground-meter.ts`). The rising bed runs the same mode
 * (`research/rising-bed.mjs`).
 */
export function groundScenario(scene: Scene, shell: LabShell): LabScenario {
  let kit: ReturnType<typeof sceneModel> | null = null;
  let address = labAddress("?scenario=ground"), fault = "";
  let current: { shove(): void } | null = null;
  let shown: ReturnType<ReturnType<typeof startGround>["frame"]> | null = null;
  const trail = note(() => shown?.trail.slice(-12).map(t => `${t.at.toFixed(2)} s: ${t.position} — ${t.controller}, ${t.mode}, ${t.phase}`).join("\n") ?? "");
  const attempts = note(() => shown?.attempts.map(a => `${a.controller}: ${a.end}, ${a.seconds.toFixed(2)} s`).join("\n") ?? "");
  const phases = note(() => shown ? Object.entries(shown.phases).map(([phase, seconds]) => `${phase}: ${seconds.toFixed(2)} s`).join("; ") : "");
  const change = (ground: Partial<LabAddress["ground"]>) => shell.load({ ...address, ground: { ...address.ground, ...ground } });
  const meter = readings({ position: { name: "Position" }, doing: { name: "Sub-mind / mode / phase" }, reached: { name: "Technique reached" },
    level: { name: "Fall environment" }, seconds: { name: "Time down", unit: "s" }, check: { name: "Stand check" }, verified: { name: "Up and quiet", unit: "s from takeover" },
    round: { name: "Round" }, handback: { name: "Time to hand-back", unit: "s" }, handbackRule: { name: "Hand-back rule" },
    hands: { name: "Hand loads", unit: "body weight" }, feet: { name: "Foot loads", unit: "body weight" },
    balance: { name: "Balance", unit: "%" }, assist: { name: "Peak help", unit: "N / N m" },
    impulse: { name: "Total help", unit: "N s / N m s" }, totals: { name: "Falls / stood / median / worst" }, status: { name: "Run" } });
  return {
    keys: new Set(),
    mind: (chosen, next) => risingBy(chosen, next.ground.rise),
    subs(next) {
      const name = next.ground.drive;
      return name === "mind" ? undefined : [(own, view, clock) => groundTechnique(name, own, view, clock, next.ground.start !== "shoved")];
    },
    subsData: (next) => next.ground.drive === "learned-rise" ? ["learned-rise"] : [],
    placement(spec, next) {
      address = next; shown = null; fault = "";
      try {
        const start = groundPlacement(spec, next, next.ground.start === "placed" && next.ground.drive === "plant-up" && next.ground.waypoint !== "none" ? plantWaypoint(spec, next.ground.waypoint) : undefined);
        if ("refused" in start) throw new Error(start.refused);
        return start;
      }
      catch (error) { fault = String(error instanceof Error ? error.message : error); throw error; }
    },
    panels: {
      scenario: [
        choice("Fall environment", Object.entries(GROUND_LEVELS).map(([value, definition]) => ({ value: value as keyof typeof GROUND_LEVELS, name: definition.label })),
          () => address.ground.level, level => change({ level })),
        choice("Start", (["shoved", "dropped", "placed", "round"] as const).map(value => ({ value, name: value === "round" ? `round of ${ROUND_FALLS}` : value })),
          () => address.ground.start, start => change({ start })),
        quantity("Seed", 1, value => Number.isSafeInteger(value) && value >= 0 && value <= 4294967295, () => address.seed,
          seed => shell.load({ ...address, seed })),
        when(() => address.ground.start === "placed", following(() => address.model, () => menu("Posture",
          groundPostures(loadoutSpec(address)).map(value => ({ value, name: value })), () => address.ground.posture, posture => change({ posture })))),
        when(() => address.ground.start === "shoved", slider("Shove direction", 0, 360, 5, () => groundShove(address).degrees, degrees => change({ degrees }), value => value.toFixed(1))),
        when(() => address.ground.start === "shoved", slider("Shove impulse, N s", 40, 90, 1, () => groundShove(address).impulse, impulse => change({ impulse }), value => value.toFixed(1))),
        when(() => address.ground.start === "shoved", action("Draw shove from seed", () => change({ degrees: null, impulse: null }))),
        following(() => address.model, () => menu("Gets up by", [
          ...GROUND_RISES.map((rise) => ({ value: `rise:${rise}`, name: RISES[rise] })),
          ...Object.entries(TECHNIQUES as Readonly<Record<string, TechniquePart>>).filter(([, technique]) => technique.fits(loadoutSpec(address), technique.defaults, partLookup) === null).map(([value, spec]) => ({ value: `alone:${value}`, name: `${spec.label} alone (experimental)` }))],
        () => address.ground.drive === "mind" ? `rise:${address.ground.rise}` : `alone:${address.ground.drive}`,
        value => value.startsWith("rise:") ? change({ drive: "mind", rise: value.slice(5) as GroundRise }) : change({ drive: value.slice(6) as TechniqueName }))),
        when(() => address.ground.start === "placed" && address.ground.drive === "plant-up", menu("Waypoint",
          (["none", "brace", "plant", "transfer", "rise"] as const).map(value => ({ value, name: value === "none" ? "Selected posture" : value })),
          () => address.ground.waypoint, waypoint => change({ waypoint }))),
        choice("Foe", ([0, 1, 2, 4] as const).map(value => ({ value, name: value === 0 ? "None" : `${value} m` })), () => address.ground.foe, foe => change({ foe })),
        toggle("Gusts", () => address.ground.gusts, () => change({ gusts: !address.ground.gusts })),
        note(() => fault),
      ],
      controls: [action("Next seed", () => shell.load({ ...address, seed: (address.seed + 1) >>> 0 })),
        when(() => address.ground.start !== "round", action("Shove again", () => current?.shove()))],
      readout: [meter, trail, attempts, phases],
    },
    timelineLabel: "The last 35 seconds, one physics step per notch.",
    start({ actor, address: next, changed, clock, heard, hears }) {
      address = next;
      const sound = shoveSound(actor.body.built);
      const session = startGround(actor, next, { pushed: (part, impulse, at) => heard(sound(part, impulse, at)), hears });
      const obstacles: Mesh[] = [], obstacleMaterial = new StandardMaterial("ground.obstacle", scene);
      obstacleMaterial.diffuseColor.set(.5, .47, .42);
      let closed = false;
      if (session.environment.placements.length) {
        kit ??= loadArtAssets().then(art => sceneModel(art.model("crypt-kit/kit.glb"), scene)).then(container => {
          for (const mesh of container.meshes) mesh.setEnabled(false);
          container.addAllToScene(); return container;
        });
        void kit.then(container => {
          if (closed) return;
          for (const mesh of assembleCryptKit(container, session.environment.placements, false)) { mesh.material = obstacleMaterial; obstacles.push(mesh); }
        }).catch(error => { if (!closed) { fault = `Obstacle art unavailable: ${String(error)}`; } });
      } else for (const solid of session.environment.solids) {
        if (solid.kind !== "box") throw new Error("ground wall visual requires a box");
        const mesh = MeshBuilder.CreateBox(solid.name, { width: solid.size[0], height: solid.size[1], depth: solid.size[2] }, scene);
        mesh.position.set(solid.centre[0], solid.centre[1], solid.centre[2]); mesh.rotation.y = solid.turn ?? 0; mesh.material = obstacleMaterial; obstacles.push(mesh);
      }
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
          meter.write({ level: GROUND_LEVELS[shown.level].label, position: shown.position, doing: `${shown.controller} / ${shown.mode} / ${shown.phase} ${shown.stage ?? ""}`, reached: shown.techniqueReached === null ? "—" : shown.techniqueReached ? "yes" : "no",
            seconds: shown.seconds.toFixed(2), check: shown.check.stage, verified: seconds(shown.check.verified),
            round: shown.round ? `${shown.round.falls} of ${shown.round.of}: stood ${shown.round.stood}, within 6 s ${shown.round.within6}, median ${seconds(shown.round.median)} s (a failure at ${STAND_CHECK.cap} s)` : "—",
            handback: seconds(shown.handback), handbackRule: shown.handBackReason ?? "—",
            hands: `${load("hand.left")} / ${load("hand.right")}`,
            feet: `${load("foot.left")} / ${load("foot.right")}`,
            balance: String(shown.balance), assist: `${shown.assist.forcePeak.toFixed(2)} / ${shown.assist.momentPeak.toFixed(2)}`,
            impulse: `${shown.assist.forceImpulse.toFixed(2)} / ${shown.assist.momentImpulse.toFixed(2)}`,
            totals: `${summary.falls} / ${summary.stood} / ${seconds(summary.median)} s / ${seconds(summary.worst)} s`, status: shown.status });
          if (shown.status !== "running" && frame === null) player.setPaused(true);
          trail.refresh(); attempts.refresh(); phases.refresh();
          return shown.time;
        },
        dispose() { closed = true; for (const mesh of obstacles) mesh.dispose(false, false); obstacleMaterial.dispose(); if (current === run) current = null; history.dispose(); foeHistory?.dispose(); dummy?.dispose(); session.dispose(); },
      };
      current = run;
      return run;
    },
  };
}
