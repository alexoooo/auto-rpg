import { Engine } from "@babylonjs/core/Engines/engine.js";
// `scene.createPickingRay` is this module's patch: without it the build compiles and the ray is missing.
import "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { showHeroLineup } from "../render/character-preview.ts";
import { buildArena } from "./scene.ts";
import { MENU_HREF } from "../app-route.ts";
import { need } from "../dom.ts";
import { airOf, hearTouches } from "../audio/body-sounds.ts";
import { debrisCues } from "../audio/cues.ts";
import { GameAudio } from "../audio/game-audio.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { BODY_MODELS, type BodyModel } from "../core/human/spec.ts";
import { createWorld, type World } from "../core/world.ts";
import type { SkinView } from "../render/skin-view.ts";
import { loadSkeletonArt, type SkeletonArt } from "../render/skeleton-skin.ts";
import { drawHeld, type BodyShapes } from "../render/body-shapes.ts";
import { dresserFor, type Dresser } from "../render/dress.ts";
import { Duel, SIDES, type DuelEnding, type Side, type Verdict } from "./duel.ts";
import { MATCHUP_PARAM, MODEL_LABELS, matchupSearch, readBalance, readCap, readGap, readGuard, readHeld, readMatchup, readTape, readYou, youSearch, type Matchup } from "./matchup.ts";
import { ORBIT, orbitPosition } from "./orbit.ts";
import { aimPoint, keysToMove, personOrders } from "./orders-input.ts";

/**
 * **The arena page**: the arena's scene with its solids in a world (`buildArena`), and a bout
 * of two bodies in it (`Duel`). Setup picks the two models and the side the person fights, if
 * any; a bout runs to its verdict, and can be run again, or again with the right side redrawn.
 *
 * A person who takes a side gives it orders (`Duel.order`): the keys walk it, as the camera sees
 * the ground, it faces the pointer, and the left button attacks where the pointer is. The page
 * turns the keys and the pointer into world directions (`orders-input.ts`) before the orders are
 * made, so nothing of the camera reaches a mind.
 *
 * The bout is heard until its verdict: each body's touches and its air
 * (`src/audio/body-sounds.ts`), and what a blow takes off (`debrisCues`). The verdict silences
 * it with the cues not played yet, so what decides the bout is not heard.
 *
 * Setup owns `#curtain`, pause owns `#pause-menu`, the verdict is `#bout-end`.
 */

/** The most real time one frame steps the world through, s: a page that falls behind runs slow rather than in a burst.
 * A numeric setting. */
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
  const lifetime = new AbortController();
  window.addEventListener("pagehide", () => lifetime.abort(), { once: true });
  const canvas = need<HTMLCanvasElement>("stage");
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  const physicsEngine = await loadEngine();
  let made: World | null = null;
  const arena = await buildArena(engine, (scene) => (made = createWorld(scene, physicsEngine)).physics);
  const world = made as World | null;
  if (!world) throw new Error("the arena made no world");
  const { scene, camera, shadows } = arena;

  // Setup: a contender panel on each side, each with its model.
  let matchup: Matchup = readMatchup(location.search), you: Side | null = readYou(location.search);
  // A link's tape is of the link's matchup: a bout of another matchup begun from the page plays none.
  const linked = { matchup, tape: readTape(location.hash), hash: location.hash };
  /** Whether the bout under way plays a tape: it then takes no orders from a person. */
  let replaying = false;
  const youPicker = need<HTMLSelectElement>("you");
  youPicker.value = you ?? "";
  const pickers = {} as Record<Side, HTMLSelectElement>;
  const previews = {} as Record<Side, Awaited<ReturnType<typeof showHeroLineup>>>;
  const previewLoads: Promise<void>[] = [];
  for (const side of SIDES) {
    const panel = document.createElement("section");
    panel.className = "contender"; panel.dataset.side = side;
    const head = document.createElement("header"), title = document.createElement("h2");
    head.className = "contender-head"; title.textContent = side === "left" ? "Left" : "Right"; head.append(title);
    const field = document.createElement("label"), name = document.createElement("span"), select = document.createElement("select");
    field.className = "field"; name.className = "field-name"; name.textContent = "Character";
    for (const model of BODY_MODELS) {
      const option = document.createElement("option"); option.value = model; option.textContent = MODEL_LABELS[model]; select.append(option);
    }
    select.value = matchup[side]; select.disabled = true;
    select.setAttribute("aria-label", `${side === "left" ? "Left" : "Right"} character`);
    const preview = document.createElement("canvas");
    preview.className = "contender-preview"; preview.setAttribute("aria-hidden", "true");
    field.append(name, select); panel.append(head, preview, field);
    need("matchup").append(panel);
    pickers[side] = select;
    previewLoads.push(showHeroLineup(preview, physicsEngine, [matchup[side]], lifetime.signal).then(view => {
      previews[side] = view; select.disabled = false;
      select.addEventListener("change", () => {
        void view.setModel(0, select.value as BodyModel).catch(error => {
          need("boot-note").textContent = `Preview unavailable: ${error.message}`;
        });
      }, { signal: lifetime.signal });
    }));
  }

  // Each model's dresser, loaded once: its skin, or its shapes if the skin does not load.
  let skeletonArt: Promise<SkeletonArt> | null = null;
  const dressers = new Map<BodyModel, Promise<Dresser>>();
  const dresser = (model: BodyModel): Promise<Dresser> => {
    let found = dressers.get(model);
    if (!found) {
      found = dresserFor(model, scene, { skeletonArt: () => skeletonArt ??= loadSkeletonArt() });
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
  /** What hears the bout under way: its touches' listener, and each side's air. */
  let hearing: { dispose(): void } | null = null, airs: { readonly side: Side; readonly air: (at: Vector3) => number }[] = [];
  const end = () => { undraw(); hearing?.dispose(); hearing = null; airs = []; duel?.dispose(); duel = null; shown = null; };

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
  let screen: "setup" | "fight" = "setup";
  const setup = () => {
    end(); setPaused(false); show("bout-end", false); show("curtain", true); screen = "setup";
    for (const side of SIDES) {
      pickers[side].value = matchup[side];
      void previews[side].setModel(0, matchup[side]);
    }
  };
  const begin = async (next: Matchup) => {
    if (beginButton.disabled) return;
    beginButton.disabled = true;
    try {
      matchup = next;
      const tape = matchup.left === linked.matchup.left && matchup.right === linked.matchup.right ? linked.tape : [];
      replaying = tape.length > 0;
      history.replaceState(null, "", youSearch(matchupSearch(location.search, matchup), you) + (replaying ? linked.hash : ""));
      const dress = new Map(await Promise.all(SIDES.map(async (side) => [side, await dresser(matchup[side])] as const)));
      end();
      audio.reset();
      const balance = readBalance(location.search), gap = readGap(location.search), capSeconds = readCap(location.search), held = readHeld(location.search), minds = readGuard(location.search);
      const bout = duel = new Duel(world, {
        left: matchup.left, right: matchup.right,
        ...(gap !== undefined ? { gap } : {}), ...(capSeconds !== undefined ? { capSeconds } : {}), ...(balance ? { balance } : {}), ...(held ? { held } : {}), ...(minds ? { minds } : {}),
      }, {
        onBuilt: (duelist, built) => {
          for (const view of [dress.get(duelist.side)!(built, { clothing: { boots: true, armour: true } }), drawHeld(built, scene)]) {
            for (const mesh of view.meshes) shadows.addShadowCaster(mesh);
            drawn.push(view);
          }
        },
        // A blow is a touch, and is heard as one; this is what it took off.
        onBlow: (blow) => { for (const cue of debrisCues(blow)) audio.cue(cue); },
      });
      const sides = SIDES.map((side) => ({ id: side, built: bout.duelists[side].built }));
      hearing = hearTouches(world, sides, (cue) => audio.cue(cue));
      airs = sides.map(({ id, built }) => ({ side: id, air: airOf(built) }));
      bout.play(tape);
      for (const row of rows) row.label.textContent = `${MODEL_LABELS[matchup[row.side]]} (${row.side === you && !replaying ? "you" : row.side})`;
      show("curtain", false); show("bout-end", false); setPaused(false); screen = "fight";
      canvas.focus();
    } catch (error) {
      setup();
      need("boot-note").textContent = error instanceof Error ? error.message : String(error);
    } finally { beginButton.disabled = false; }
  };
  const redrawn = (): Matchup => ({ ...matchup, right: BODY_MODELS[Math.floor(Math.random() * BODY_MODELS.length)] });
  const fromPickers = (): Matchup => ({ left: pickers.left.value as BodyModel, right: pickers.right.value as BodyModel });

  const beginButton = need<HTMLButtonElement>("begin");
  beginButton.addEventListener("click", () => {
    beginButton.blur();
    you = youPicker.value === "left" || youPicker.value === "right" ? youPicker.value : null;
    void begin(fromPickers());
  });
  need("resume").addEventListener("click", () => setPaused(false));
  for (const id of ["restart", "bout-end-replay"]) need(id).addEventListener("click", () => void begin(matchup));
  for (const id of ["random-replay", "bout-end-random"]) need(id).addEventListener("click", () => void begin(redrawn()));
  for (const id of ["leave", "bout-end-leave"]) need(id).addEventListener("click", setup);
  need<HTMLButtonElement>("to-menu").addEventListener("click", () => window.location.assign(MENU_HREF));
  const help = (open: boolean) => show("help", open);
  need("help-open").addEventListener("click", () => help(true));
  need("help-close").addEventListener("click", () => help(false));
  // What the person's hands are doing: the walking keys held, where the pointer is on the canvas,
  // px, and whether its left button is down.
  const keys = { up: false, down: false, left: false, right: false };
  let pointer: { x: number; y: number } | null = null, attacking = false;
  const walkKeys: Readonly<Record<string, keyof typeof keys>> = {
    w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right",
  };
  /** Whether `event` was a walking key, now held or let go. */
  const walkKey = (event: KeyboardEvent, held: boolean): boolean => {
    const key = walkKeys[event.key.toLowerCase()];
    if (!key) return false;
    keys[key] = held;
    if (event.key.startsWith("Arrow")) event.preventDefault();
    return true;
  };
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLSelectElement) return;
    if (event.key === "?") { help(need("help").classList.contains("gone")); return; }
    if (!duel || walkKey(event, true)) return;
    if (event.key === " " || event.key === "Escape") { event.preventDefault(); if (!duel.verdict) setPaused(!paused); }
    else if (event.key === "r" || event.key === "R") void begin(matchup);
  });
  window.addEventListener("keyup", (event) => { walkKey(event, false); });
  // Losing focus pauses the bout, and lets go of every key and button: their releases are not heard.
  window.addEventListener("blur", () => {
    keys.up = keys.down = keys.left = keys.right = false;
    attacking = false;
    if (duel && !duel.verdict) setPaused(true);
  });
  // The left button is a level, read from every pointer event, since a release is not guaranteed.
  for (const type of ["pointerdown", "pointermove", "pointerup"] as const) {
    canvas.addEventListener(type, (event) => {
      pointer = { x: event.offsetX, y: event.offsetY };
      attacking = (event.buttons & 1) !== 0;
    });
  }
  canvas.addEventListener("pointerleave", () => { pointer = null; attacking = false; });

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
  /** The person's orders for this frame, from the keys and the pointer as the camera has them. */
  const giveOrders = () => {
    if (!duel || !you || replaying || paused || duel.verdict) return;
    const centre = duel.duelists[you].body.physical.centre;
    const ray = pointer ? scene.createPickingRay(pointer.x, pointer.y, null, camera) : null;
    const point = ray ? aimPoint(ray.origin.asArray(), ray.direction.asArray(), centre.y) : null;
    duel.order(you, personOrders(keysToMove(keys, azimuth), point, attacking, centre));
  };
  const target = new Vector3(0, 1, 0), airAt = new Vector3();
  const frame = () => {
    if (screen === "setup") {
      target.set(0, 0, 0);
      // The full ring fits between the character niches (docs/reference/look.md#arena-camera).
      const aspect = engine.getRenderWidth() / engine.getRenderHeight();
      camera.position.set(...orbitPosition(target, 0, .78, Math.max(39, 31 / aspect)));
      camera.setTarget(target);
      arena.updateRoomOcclusion([]);
      return;
    }
    if (duel) {
      const a = duel.duelists.left.body.physical.centre, b = duel.duelists.right.body.physical.centre;
      target.set((a.x + b.x) / 2, 1, (a.z + b.z) / 2);
    }
    camera.position.set(...orbitPosition(target, azimuth, pitch, distance));
    camera.setTarget(target);
    audio.setView({ x: camera.position.x, z: camera.position.z }, { x: Math.sin(azimuth), z: Math.cos(azimuth) });
    arena.updateRoomOcclusion(duel ? SIDES.map((side) => ({ point: duel!.duelists[side].body.physical.head })) : []);
  };
  const readout = () => {
    if (!duel) return;
    for (const row of rows) row.bar.value = duel.duelists[row.side].pool.bar();
    // While either side is helped, each side's balance, per cent of its weight: the link's, or its character's.
    const helped = SIDES.some((side) => duel!.duelists[side].body.assist.on);
    const balance = SIDES.map((side) => duel!.recipe.balance?.[side] ?? duel!.duelists[side].built.spec.attributes.balance.value);
    clock.textContent = `${duel.clock.toFixed(1)} s${helped ? ` · balance ${balance.join(" / ")} %` : ""}${replaying ? " · replay" : ""}`;
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
    giveOrders();
    if (duel && !paused) {
      world.advance(seconds, Math.ceil(CATCH_UP_SECONDS * world.hz));
      for (const { side, air } of airs) audio.swish(side, air(airAt), airAt);
    }
    if (!paused) arena.fire.burn(seconds);
    frame(); readout(); audio.update();
    scene.render();
  });
  window.addEventListener("resize", () => engine.resize());
  window.addEventListener("pagehide", () => { end(); audio.dispose(); engine.stopRenderLoop(); world.dispose(); scene.dispose(); engine.dispose(); });
  Object.assign(window, { __arena: { get duel() { return duel; }, world, scene, engine } });

  await Promise.all(previewLoads);
  need("boot-note").textContent = "";
  beginButton.disabled = false;
  // A link that names its matchup opens the bout directly.
  if (new URLSearchParams(location.search).has(MATCHUP_PARAM)) await begin(matchup);
}
