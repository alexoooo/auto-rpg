import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ScreenContext } from "../ui/screen.ts";
import { need as find } from "../dom.ts";
import { MENU_HREF } from "../app-route.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { createWorld, type World } from "../core/world.ts";
import { loadData } from "../core/data/store.ts";
import { treeData, defaultMind } from "../entrants/game.ts";
import { drawBody, drawHeld } from "../render/body-shapes.ts";
import { dresserFor } from "../render/dress.ts";
import { fighterHands } from "../render/strike-hands.ts";
import { warmScene } from "../render/ready.ts";
import { frameMeter } from "../ui/frame-meter.ts";
import { physicalReading } from "../core/observation.ts";
import { buildArena } from "./scene.ts";
import { arenaCameraRig, type ArenaSubjects } from "./camera.ts";
import { readArenaView } from "./view.ts";
import { ARENA_SIDES } from "./side-highlights.ts";
import { endingText } from "./end-rule.ts";
import { SIDES } from "./duel.ts";
import { crowdFight, TeamBout, type Member } from "./team-bout.ts";

/** The most real time one frame steps the world through, s: a frame of a screen at 30 fps; behind it, the fight plays in slow motion. */
const CATCH_UP_SECONDS = 1 / 30;

/** How long the bodies go on moving once the verdict is given, s. */
const AFTERMATH_SECONDS = 3;

/**
 * **The crowd fight's screen** (`?play=crowd`, `&seed=` its bout's seed): the crowd fight
 * (`crowdFight`) played in the arena from its first step, a bar for each body, the frame meter,
 * and the verdict. The camera frames the two sides' middles and orbits as the arena's does.
 */
export async function bootCrowd(context: ScreenContext): Promise<void> {
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const seed = Number(new URLSearchParams(context.address.search).get("seed") ?? 0);
  const recipe = crowdFight(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : 0);
  const canvas = need<HTMLCanvasElement>("stage"), note = need("crowd-note"), hud = need("crowd-hud");
  need<HTMLButtonElement>("crowd-menu").addEventListener("click", () => context.navigate(MENU_HREF));
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  context.own(() => { engine.stopRenderLoop(); engine.dispose(); });
  const physicsEngine = await loadEngine();
  context.signal.throwIfAborted();
  let made: World | null = null;
  const arena = await buildArena(engine, (scene) => {
    context.own(() => scene.dispose());
    const world = made = createWorld(scene, physicsEngine);
    context.own(() => world.dispose());
    return world.physics;
  }, "open", context.signal);
  context.signal.throwIfAborted();
  const world = made as World | null;
  if (!world) throw new Error("the arena made no world");
  const { scene, camera, shadows } = arena;
  await loadData(SIDES.flatMap((side) => treeData(recipe[side].mind ?? defaultMind(recipe[side].model))));
  const dress = await dresserFor("workshop-fighter", scene);
  context.signal.throwIfAborted();

  const reads = new Map<string, ReturnType<typeof physicalReading>>();
  const bout = new TeamBout(world, recipe, {
    onBuilt: (member: Member, built) => {
      const hands = fighterHands(member);
      const skin = dress(built, { clothing: { boots: true, armour: true }, closure: hands.closure });
      const shapes = drawBody(built, scene, Color3.FromHexString(ARENA_SIDES[member.side].colour));
      const held = drawHeld(built, scene);
      for (const mesh of held.meshes) shadows.addShadowCaster(mesh);
      context.own(() => { skin.dispose(); shapes.dispose(); held.dispose(); });
      reads.set(member.id, physicalReading(built));
    },
  });
  context.own(() => bout.dispose());

  // The camera frames each side's middle as the arena's frames each fighter.
  const middle = (side: typeof SIDES[number]) => {
    const at = new Vector3(), still = Quaternion.Identity();
    return { get position() {
      at.setAll(0);
      let n = 0;
      for (const member of bout.members) if (member.side === side && !bout.eliminated(member.id)) { at.addInPlace(reads.get(member.id)!().centre); n++; }
      return n ? at.scaleInPlace(1 / n) : at;
    }, rotation: still, rest: still };
  };
  const subjects: ArenaSubjects = { left: middle("left"), right: middle("right") };
  const rig = arenaCameraRig(camera, readArenaView("", null));
  canvas.addEventListener("pointermove", (event) => { if (event.buttons & 6) rig.orbit(event.movementX, event.movementY); }, { signal: context.signal });
  canvas.addEventListener("wheel", (event) => { event.preventDefault(); rig.zoom(event.deltaY); }, { signal: context.signal, passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: context.signal });

  // A bar for each body, in its line's order, its side's colour.
  const bars = new Map(bout.members.map((member, k) => {
    const row = document.createElement("div"), fill = document.createElement("span");
    row.className = "crowd-bar"; row.title = `${ARENA_SIDES[member.side].label} ${k % recipe[member.side].count + 1}`;
    fill.style.background = ARENA_SIDES[member.side].colour;
    row.append(fill); hud.append(row);
    return [member.id, fill] as const;
  }));
  const meter = frameMeter(engine, context.signal);
  hud.append(meter.element);

  let firstFrame = true, ended = false;
  engine.runRenderLoop(() => {
    if (context.busy) { firstFrame = true; meter.reset(); return; }
    meter.frame(() => {
      const seconds = firstFrame ? 0 : engine.getDeltaTime() / 1000; firstFrame = false;
      const left = bout.verdict ? bout.verdict.time + AFTERMATH_SECONDS - bout.clock : Infinity;
      if (left > 0) meter.physics(() => world.advance(Math.min(seconds, CATCH_UP_SECONDS, left), Math.ceil(CATCH_UP_SECONDS * world.hz)));
      for (const member of bout.members) bars.get(member.id)!.style.width = `${(100 * bout.life(member.id)).toFixed(1)}%`;
      if (bout.verdict && !ended) {
        ended = true;
        const { winner, ending } = bout.verdict;
        note.textContent = winner ? `${ARENA_SIDES[winner].label} wins ${ending === "time" ? "at the bell" : endingText(ending)}` : "A draw";
      }
      rig.frame("fight", subjects, seconds, engine.getAspectRatio(camera));
      scene.render();
    });
  });
  window.addEventListener("resize", () => engine.resize(), { signal: context.signal });
  Object.assign(window, { __crowd: { bout, world, scene, engine } });
  context.own(() => { if ((window as unknown as { __crowd?: { engine: Engine } }).__crowd?.engine === engine) Reflect.deleteProperty(window, "__crowd"); });
  await warmScene(scene, context.signal);
  note.textContent = "";
}
