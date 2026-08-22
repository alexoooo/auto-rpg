import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";

import { CONFIG } from "./config";
import { buildArena } from "./arena";
import { Hero } from "./hero";
import { Dummy } from "./dummy";
import { Combat } from "./combat";
import { Hud } from "./hud";
import { Controls } from "./input";

const need = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
};

/** Everything visible casts a shadow except the floor it falls on. */
function refreshShadowCasters(scene: Scene, shadows: ShadowGenerator): void {
  const list = shadows.getShadowMap()?.renderList;
  if (!list) return;
  list.length = 0;
  for (const mesh of scene.meshes) {
    if (mesh.name === "ground") continue;
    list.push(mesh);
  }
}

async function boot(): Promise<void> {
  const canvas = need<HTMLCanvasElement>("stage");
  const curtain = need("curtain");
  const beginButton = need<HTMLButtonElement>("begin");
  const bootNote = need("boot-note");

  beginButton.disabled = true;

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

  // buildArena brings up Havok before it creates any bodies, and fixes the
  // sub-step so that stiff joints carrying a heavy lever behave the same on a
  // 144 Hz monitor as on a 60 Hz one.
  const arena = await buildArena(engine);

  const hero = new Hero(arena.scene, Vector3.Zero(), arena.materials);
  const dummyOrigin = new Vector3(CONFIG.dummy.origin.x, CONFIG.dummy.origin.y, CONFIG.dummy.origin.z);
  let dummy = new Dummy(arena.scene, dummyOrigin, arena.materials);

  const combat = new Combat(hero.sword);
  combat.attach(dummy);

  const hud = new Hud(need("hud"));
  refreshShadowCasters(arena.scene, arena.shadows);

  let physicsMs = 0;
  let physicsStart = 0;
  arena.scene.onBeforePhysicsObservable.add(() => {
    physicsStart = performance.now();
  });
  arena.scene.onAfterPhysicsObservable.add(() => {
    // Smoothed, because a raw per-frame number is unreadable at 60 Hz.
    physicsMs += (performance.now() - physicsStart - physicsMs) * 0.1;
  });

  const showCurtain = (show: boolean): void => {
    curtain.classList.toggle("gone", !show);
  };

  const controls = new Controls(canvas, {
    onReset: () => {
      dummy.dispose();
      dummy = new Dummy(arena.scene, dummyOrigin, arena.materials);
      combat.attach(dummy);
      refreshShadowCasters(arena.scene, arena.shadows);
    },
    onToggleReadout: () => hud.toggle(),
    onPause: () => {
      controls.pause();
      showCurtain(true);
    },
  });

  beginButton.addEventListener("click", () => {
    showCurtain(false);
    controls.start();
  });

  // Camera: a simple trailing chase. It lags on purpose -- a rigid camera makes
  // a swing look like the world is turning rather than the arm.
  const cameraGoal = new Vector3();
  const lookGoal = new Vector3();
  const focus = new Vector3();

  const placeCamera = (dt: number, snap: boolean): void => {
    const C = CONFIG.camera;
    const world = hero.torso.mesh.getWorldMatrix();
    const forward = new Vector3(world.m[8], world.m[9], world.m[10]).normalize();
    const origin = hero.torso.mesh.absolutePosition;

    cameraGoal
      .copyFrom(origin)
      .subtractInPlace(forward.scale(C.distance))
      .addInPlaceFromFloats(0, C.height - 0.9, 0);

    lookGoal
      .copyFrom(origin)
      .addInPlace(forward.scale(1.6))
      .addInPlaceFromFloats(0, C.pitch, 0);

    const blend = snap ? 1 : 1 - Math.exp(-C.followResponse * dt);
    arena.camera.position.addInPlace(cameraGoal.subtract(arena.camera.position).scale(blend));
    focus.addInPlace(lookGoal.subtract(focus).scale(blend));
    arena.camera.setTarget(focus);
  };

  placeCamera(0, true);

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, CONFIG.world.maxFrameSeconds);
    if (dt <= 0) return;

    if (controls.isActive) {
      const input = controls.sample();
      hero.update(dt, input);
      controls.endFrame();
    }
    combat.advance(dt);
    placeCamera(dt, false);

    arena.scene.render();

    hud.update(
      {
        fps: engine.getFps(),
        physicsMs,
        tipSpeed: hero.sword.tipSpeed(),
        edgeAlignment: edgeAlignmentNow(hero),
        bodies: arena.scene.meshes.length,
      },
      dummy,
      combat.lastHit,
      combat["clock" as keyof Combat] as unknown as number,
    );
  });

  window.addEventListener("resize", () => engine.resize());

  // A live handle on everything, for tuning from the console. CONFIG is
  // deliberately mutable, so `__sword.config.arm.stiffness = 1600` takes effect
  // on the very next frame -- which is the whole point of a feel prototype.
  Object.assign(window as unknown as Record<string, unknown>, {
    __sword: { engine, scene: arena.scene, camera: arena.camera, hero, combat, config: CONFIG },
  });

  bootNote.textContent = "Havok ready.";
  beginButton.disabled = false;
  beginButton.textContent = "Click to take the sword";
}

/**
 * How squarely the blade is moving into its own edge right now.
 *
 * Shown live rather than only on contact, because the useful skill is learning
 * to turn the wrist *before* the blade arrives, and a number that only appears
 * after a hit teaches that far more slowly.
 */
function edgeAlignmentNow(hero: Hero): number {
  const tip = hero.sword.tipPosition();
  const velocity = hero.sword.velocityAt(tip);
  const speed = velocity.length();
  if (speed < 0.4) return 0;
  return Math.abs(Vector3.Dot(velocity.scale(1 / speed), hero.sword.edgeDirection()));
}

boot().catch((error: unknown) => {
  const note = document.getElementById("boot-note");
  if (note) {
    note.classList.add("error");
    note.textContent = error instanceof Error ? error.message : String(error);
  }
  // eslint-disable-next-line no-console
  console.error(error);
});
