import "@babylonjs/core/Culling/ray.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { ScreenContext } from "../ui/screen.ts";
import { need as find } from "../dom.ts";
import { MENU_HREF } from "../../../game/route.ts";
import { drawBody, drawHeld } from "../render/body-shapes.ts";
import { dresserFor } from "../render/dress.ts";
import { handsOf } from "../render/strike-hands.ts";
import { puppetBody } from "../render/puppet.ts";
import { warmScene } from "../render/ready.ts";
import { frameMeter } from "../ui/frame-meter.ts";
import { cameraControls } from "../ui/camera-controls.ts";
import { bodyBetween, openWorld, posePuppet, type Between } from "../worker/client.ts";
import type { TeamCard } from "../../worker/stage.ts";
import { buildArena } from "./scene.ts";
import { arenaCameraRig, type ArenaSubjects } from "./camera.ts";
import { readArenaView } from "./view.ts";
import { ARENA_SIDES } from "./side-highlights.ts";
import { endingText } from "../../../game/arena/end-rule.ts";
import { teamSpec } from "../../../game/arena/team-bout.ts";
import { crowdFight } from "../game.ts";
import type { ArenaSeat as Side } from "../../../game/arena/seat.ts";
import { damageFlashes } from "../render/damage-flashes.ts";

/** How long the bodies go on moving once the verdict is given, s. */
const AFTERMATH_SECONDS = 3;

/**
 * **The crowd fight's screen** (`?play=crowd`, `&seed=` its bout's seed): the crowd fight
 * (`crowdFight`) played in the arena from its first step, a bar for each body, the frame meter,
 * and the verdict. The world steps in a worker (`openWorld`, `src/app/worker/`): the page draws a
 * puppet of each body between the last two steps it holds, so it keeps its frame rate when the
 * world cannot keep real time and the fight plays in slow motion. The camera frames the two sides'
 * middles and orbits as the arena's does.
 */
export async function bootCrowd(context: ScreenContext): Promise<void> {
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const seed = Number(new URLSearchParams(context.address.search).get("seed") ?? 0);
  const recipe = crowdFight(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : 0);
  const canvas = need<HTMLCanvasElement>("stage"), note = need("crowd-note"), hud = need("crowd-hud");
  need<HTMLButtonElement>("crowd-menu").addEventListener("click", () => context.navigate(MENU_HREF));
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  context.own(() => { engine.stopRenderLoop(); engine.dispose(); });
  // The worker builds the world while the page builds the scene.
  const opening = openWorld<TeamCard>({ kind: "team", recipe, aftermath: AFTERMATH_SECONDS }, context.signal);
  context.own(() => void opening.then((link) => link.dispose(), () => { /* A world that failed to open has no worker left. */ }));
  const arena = await buildArena(engine, "open", context.signal);
  const { scene, camera, shadows } = arena;
  context.own(() => scene.dispose());
  const flashes = damageFlashes(scene);
  context.own(flashes.dispose);
  const dress = await dresserFor("man", scene);
  const link = await opening;
  context.signal.throwIfAborted();

  const bodies = link.roster.map(({ id, card }, k) => {
    const puppet = puppetBody(teamSpec(recipe[card.side]), scene), hands = handsOf(puppet.configurations.state);
    const skin = dress(puppet, { clothing: { boots: true, armour: true }, closure: hands.closure });
    const shapes = drawBody(puppet, scene, Color3.FromHexString(ARENA_SIDES[card.side].colour));
    const held = drawHeld(puppet, scene);
    for (const mesh of held.meshes) shadows.addShadowCaster(mesh);
    context.own(() => { skin.dispose(); shapes.dispose(); held.dispose(); puppet.dispose(); });
    return { id, side: card.side, puppet, offset: link.offsets[k]!, centre: new Vector3(), life: 1, out: false };
  });

  // The camera frames each side's middle as the arena's frames each fighter.
  const middle = (side: Side) => {
    const at = new Vector3(), still = Quaternion.Identity();
    return { get position() {
      at.setAll(0);
      let n = 0;
      for (const body of bodies) if (body.side === side && !body.out) { at.addInPlace(body.centre); n++; }
      return n ? at.scaleInPlace(1 / n) : at;
    }, rotation: still, rest: still };
  };
  const subjects: ArenaSubjects = { left: middle("left"), right: middle("right") };
  const rig = arenaCameraRig(camera, readArenaView("", null));
  cameraControls(canvas, { signal: context.signal, enabled: () => true, camera: rig });

  // A bar for each body, in its line's order, its side's colour.
  const bars = bodies.map((body, k) => {
    const row = document.createElement("div"), fill = document.createElement("span");
    row.className = "crowd-bar"; row.title = `${ARENA_SIDES[body.side].label} ${k % recipe[body.side].count + 1}`;
    fill.style.background = ARENA_SIDES[body.side].colour;
    row.append(fill); hud.append(row);
    return fill;
  });
  const meter = frameMeter(engine, context.signal);
  hud.append(meter.element);

  link.listen({
    news: ({ verdict, hits }) => {
      flashes.add(hits ?? []);
      if (!verdict) return;
      const { winner, ending } = verdict;
      note.textContent = winner ? `${ARENA_SIDES[winner].label} wins ${ending === "time" ? "at the bell" : endingText(ending)}` : "A draw";
    },
    fault: (message) => { note.textContent = `The world stopped: ${message}`; },
  });

  /** Pose every body between `at`'s frames, with its bar. */
  const pose = (at: Between) => {
    bodies.forEach((body, k) => {
      posePuppet(body.puppet, body.offset, at);
      const { life, out } = bodyBetween(body.offset, at, body.centre);
      body.life = life; body.out = out;
      bars[k]!.style.width = `${(100 * life).toFixed(1)}%`;
    });
    flashes.update(at.from[0]! + (at.to[0]! - at.from[0]!) * at.share);
  };

  // The world runs while the screen is idle and shown; a hidden tab draws nothing, so it holds.
  let running = false, warm = false;
  const sync = () => {
    const run = warm && !context.busy && document.visibilityState === "visible";
    if (run !== running) { running = run; link.run(run); }
  };
  document.addEventListener("visibilitychange", sync, { signal: context.signal });

  let last = -1;
  engine.runRenderLoop(() => {
    sync();
    if (context.busy) { last = -1; meter.reset(); return; }
    meter.frame(() => {
      const now = performance.now(), seconds = last < 0 ? 0 : (now - last) / 1000;
      last = now;
      meter.world(link.received(), link.newest[2]!);
      pose(link.between(now));
      rig.frame("fight", subjects, seconds, engine.getAspectRatio(camera));
      scene.render();
    });
  });
  window.addEventListener("resize", () => engine.resize(), { signal: context.signal });
  /** From a console, `__crowd.step(n)` takes `n` steps in the worker, then draws the newest, as a hidden tab needs. */
  const step = async (steps = 1) => {
    await link.step(steps);
    const newest = link.newest;
    pose({ from: newest, to: newest, share: 1 });
    scene.render();
  };
  Object.assign(window, { __crowd: { world: link, scene, engine, step } });
  context.own(() => { if ((window as unknown as { __crowd?: { engine: Engine } }).__crowd?.engine === engine) Reflect.deleteProperty(window, "__crowd"); });
  pose(link.between(performance.now()));
  await warmScene(scene, context.signal);
  note.textContent = "";
  warm = true;
  sync();
}
