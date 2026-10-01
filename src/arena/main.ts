import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildArena } from "./scene.ts";
import { MENU_HREF } from "../app-route.ts";
import { need } from "../dom.ts";
import { blowCue, SURFACE_SOUND } from "../audio/cues.ts";
import { GameAudio } from "../audio/game-audio.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { BODY_MODELS, type BodyModel } from "../core/human/spec.ts";
import { createWorld, type World } from "../core/world.ts";
import type { SkinView } from "../render/skin.ts";
import { loadSkeletonArt, type SkeletonArt } from "../render/skeleton-skin.ts";
import { drawHeld, type BodyShapes } from "../render/body-shapes.ts";
import { dresserFor, type Dresser } from "../render/dress.ts";
import { Duel, SIDES, type DuelEnding, type Side, type Verdict } from "./duel.ts";
import { MATCHUP_PARAM, MODEL_LABELS, matchupSearch, readMatchup, type Matchup } from "./matchup.ts";
import { ORBIT, orbitPosition } from "./orbit.ts";

/**
 * **The arena page**: the arena's scene with its solids in a world (`buildArena`), and a bout
 * of two bodies in it (`Duel`). Setup picks the two models; a bout runs to its verdict, and can
 * be run again, or again with the right side redrawn. A person watches and gives no orders.
 *
 * Setup owns `#curtain`, pause owns `#pause-menu`, the verdict is `#bout-end`.
 */

/** The most real time one frame steps the world through, s: a page that falls behind runs slow rather than in a burst. */
const CATCH_UP_SECONDS = 0.1;

/** How a bout ended, as the verdict bar says it. */
const ENDING_TEXT: Readonly<Record<DuelEnding, string>> = Object.freeze({
  fatal: "by a fatal wound",
  severed: "by a severing wound",
  exhausted: "by exhaustion",
  fallen: "by a fall",
  time: "on the bar at the bell",
});

const show = (id: string, shown: boolean) => need(id).classList.toggle("gone", !shown);

export async function bootArena(): Promise<void> {
  const canvas = need<HTMLCanvasElement>("stage");
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  const physicsEngine = await loadEngine();
  let made: World | null = null;
  const arena = await buildArena(engine, (scene) => (made = createWorld(scene, physicsEngine)).physics);
  const world = made as World | null;
  if (!world) throw new Error("the arena made no world");
  const { scene, camera, shadows } = arena;

  // Setup: a contender panel on each side, each with its model.
  let matchup: Matchup = readMatchup(location.search);
  const pickers = {} as Record<Side, HTMLSelectElement>;
  for (const side of SIDES) {
    const panel = document.createElement("section");
    panel.className = "contender"; panel.dataset.side = side;
    const head = document.createElement("header"), title = document.createElement("h2");
    head.className = "contender-head"; title.textContent = side === "left" ? "Left" : "Right"; head.append(title);
    const field = document.createElement("label"), name = document.createElement("span"), select = document.createElement("select");
    field.className = "field"; name.className = "field-name"; name.textContent = "Body";
    for (const model of BODY_MODELS) {
      const option = document.createElement("option"); option.value = model; option.textContent = MODEL_LABELS[model]; select.append(option);
    }
    select.value = matchup[side];
    field.append(name, select); panel.append(head, field);
    need("matchup").append(panel);
    pickers[side] = select;
  }

  // Each model's dresser, loaded once: its skin, or its shapes if the skin does not load.
  let skeletonArt: Promise<SkeletonArt> | null = null;
  const dressers = new Map<BodyModel, Promise<Dresser>>();
  const dresser = (model: BodyModel): Promise<Dresser> => {
    let found = dressers.get(model);
    if (!found) {
      found = dresserFor(model, scene, { boots: true, armour: true }, () => skeletonArt ??= loadSkeletonArt());
      dressers.set(model, found);
    }
    return found;
  };

  const audio = new GameAudio();
  let duel: Duel | null = null, drawn: (SkinView | BodyShapes)[] = [], paused = false, shown: Verdict | null = null;
  const undraw = () => {
    for (const view of drawn) { for (const mesh of view.meshes) shadows.removeShadowCaster(mesh); view.dispose(); }
    drawn = [];
  };
  const end = () => { undraw(); duel?.dispose(); duel = null; shown = null; };

  // The readout: each side's name and bar, and the clock.
  const hud = need("hud");
  const rows = SIDES.map((side) => {
    const column = document.createElement("div"), label = document.createElement("strong"), bar = document.createElement("progress");
    column.className = "hud-col"; column.dataset.side = side; bar.max = 1; bar.value = 1;
    column.append(label, bar); hud.append(column);
    return { side, label, bar };
  });
  const clock = document.createElement("div"); clock.className = "hud-col"; hud.insertBefore(clock, rows[1].label.parentElement);

  const setPaused = (value: boolean) => {
    paused = value && duel !== null;
    show("pause-menu", paused);
    audio.setActive(!paused && duel !== null && !duel.verdict);
  };
  const setup = () => { end(); setPaused(false); show("bout-end", false); show("curtain", true); };
  const begin = async (next: Matchup) => {
    matchup = next;
    history.replaceState(null, "", matchupSearch(location.search, matchup));
    const dress = new Map(await Promise.all(SIDES.map(async (side) => [side, await dresser(matchup[side])] as const)));
    end();
    audio.reset();
    duel = new Duel(world, { left: matchup.left, right: matchup.right }, {
      onBuilt: (duelist, built) => {
        for (const view of [dress.get(duelist.side)!(built), drawHeld(built, scene)]) {
          for (const mesh of view.meshes) shadows.addShadowCaster(mesh);
          drawn.push(view);
        }
      },
      onBlow: (blow) => {
        const struck = duel?.duelists[blow.target as Side];
        audio.cue(blowCue(blow, struck ? SURFACE_SOUND[struck.model] : "body"));
      },
    });
    for (const row of rows) row.label.textContent = `${MODEL_LABELS[matchup[row.side]]} (${row.side})`;
    show("curtain", false); show("bout-end", false); setPaused(false);
    canvas.focus();
  };
  const redrawn = (): Matchup => ({ ...matchup, right: BODY_MODELS[Math.floor(Math.random() * BODY_MODELS.length)] });
  const fromPickers = (): Matchup => ({ left: pickers.left.value as BodyModel, right: pickers.right.value as BodyModel });

  const beginButton = need<HTMLButtonElement>("begin");
  beginButton.addEventListener("click", () => { beginButton.blur(); void begin(fromPickers()); });
  need("resume").addEventListener("click", () => setPaused(false));
  for (const id of ["restart", "bout-end-replay"]) need(id).addEventListener("click", () => void begin(matchup));
  for (const id of ["random-replay", "bout-end-random"]) need(id).addEventListener("click", () => void begin(redrawn()));
  for (const id of ["leave", "bout-end-leave"]) need(id).addEventListener("click", setup);
  need<HTMLButtonElement>("to-menu").addEventListener("click", () => window.location.assign(MENU_HREF));
  const help = (open: boolean) => show("help", open);
  need("help-open").addEventListener("click", () => help(true));
  need("help-close").addEventListener("click", () => help(false));
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLSelectElement) return;
    if (event.key === "?") { help(need("help").classList.contains("gone")); return; }
    if (!duel) return;
    if (event.key === " " || event.key === "Escape") { event.preventDefault(); if (!duel.verdict) setPaused(!paused); }
    else if (event.key === "r" || event.key === "R") void begin(matchup);
  });
  // Losing focus pauses the bout.
  window.addEventListener("blur", () => { if (duel && !duel.verdict) setPaused(true); });

  // The orbit camera: middle or right drag turns it, the wheel brings it in and out.
  let azimuth: number = ORBIT.azimuth, pitch: number = ORBIT.pitch, distance: number = ORBIT.distance;
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointermove", (event) => {
    if (!(event.buttons & 6)) return;
    azimuth += event.movementX * 0.006;
    pitch = Math.min(ORBIT.highest, Math.max(ORBIT.lowest, pitch + event.movementY * 0.004));
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    distance = Math.min(ORBIT.farthest, Math.max(ORBIT.nearest, distance * Math.exp(event.deltaY * 0.001)));
  }, { passive: false });
  const target = new Vector3(0, 1, 0);
  const frame = () => {
    if (duel) {
      const a = duel.duelists.left.body.view.stance.centre, b = duel.duelists.right.body.view.stance.centre;
      target.set((a.x + b.x) / 2, 1, (a.z + b.z) / 2);
    }
    camera.position.set(...orbitPosition(target, azimuth, pitch, distance));
    camera.setTarget(target);
    audio.setView({ x: camera.position.x, z: camera.position.z }, { x: Math.sin(azimuth), z: Math.cos(azimuth) });
    arena.updateRoomOcclusion(duel ? SIDES.map((side) => ({ point: duel!.duelists[side].body.view.head })) : []);
  };
  const readout = () => {
    if (!duel) return;
    for (const row of rows) row.bar.value = duel.duelists[row.side].pool.bar();
    clock.textContent = `${duel.clock.toFixed(1)} s`;
    if (duel.verdict && shown !== duel.verdict) {
      shown = duel.verdict;
      const { winner, ending, time } = shown;
      const how = ENDING_TEXT[ending];
      need("bout-verdict").textContent = winner
        ? `${MODEL_LABELS[matchup[winner]]} (${winner}) wins ${how}, ${time.toFixed(1)} s`
        : `A draw ${how}, ${time.toFixed(1)} s`;
      show("bout-end", true); audio.setActive(false);
    }
  };

  engine.runRenderLoop(() => {
    const seconds = engine.getDeltaTime() / 1000;
    if (duel && !paused) world.advance(seconds, Math.ceil(CATCH_UP_SECONDS * world.hz));
    frame(); readout(); audio.update();
    scene.render();
  });
  window.addEventListener("resize", () => engine.resize());
  window.addEventListener("pagehide", () => { end(); audio.dispose(); engine.stopRenderLoop(); world.dispose(); scene.dispose(); engine.dispose(); });
  Object.assign(window, { __arena: { get duel() { return duel; }, world, scene, engine } });

  need("boot-note").textContent = "";
  beginButton.disabled = false;
  // A link that names its matchup opens the bout directly.
  if (new URLSearchParams(location.search).has(MATCHUP_PARAM)) await begin(matchup);
}
