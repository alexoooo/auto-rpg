import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";

import { CONFIG } from "./config";
import { buildArena } from "./arena";
import { Hero } from "./hero";
import { Figure } from "./figure";
import { Dummy } from "./dummy";
import { Combat } from "./combat";
import { Hud } from "./hud";
import { Controls } from "./input";
import { AimIndicator } from "./aim";
import { Targeting } from "./targeting";

const need = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
};

/** Everything solid casts a shadow. Indicators and control frames do not. */
function refreshShadowCasters(scene: Scene, shadows: ShadowGenerator): void {
  const list = shadows.getShadowMap()?.renderList;
  if (!list) return;
  list.length = 0;
  for (const mesh of scene.meshes) {
    if (mesh.name === "ground") continue;
    if (!mesh.isVisible) continue;
    if (mesh.name.startsWith("aim.") || mesh.name.startsWith("target.")) continue;
    list.push(mesh);
  }
}

const MODE_TEXT: Record<string, string> = {
  free: "",
  selecting: "SELECT TARGET &mdash; click an enemy, or L to cancel",
  locked: "LOCKED &mdash; strafe to circle, Q/E to break",
};

async function boot(): Promise<void> {
  const canvas = need<HTMLCanvasElement>("stage");
  const curtain = need("curtain");
  const beginButton = need<HTMLButtonElement>("begin");
  const bootNote = need("boot-note");
  const modeLine = need("mode");

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

  // Babylon's own input manager cancels `pointerdown`, and cancelling that
  // suppresses every compatibility mouse event for the rest of the gesture. It
  // costs nothing to turn off here, and leaving it on makes any future
  // mouse-event listener mysteriously deaf while a button is held.
  arena.scene.preventDefaultOnPointerDown = false;
  arena.scene.preventDefaultOnPointerUp = false;

  const hero = new Hero(arena.scene, Vector3.Zero(), arena.materials);
  const figure = new Figure(arena.scene, hero, arena.materials);
  const dummyOrigin = new Vector3(CONFIG.dummy.origin.x, CONFIG.dummy.origin.y, CONFIG.dummy.origin.z);
  let dummy = new Dummy(arena.scene, dummyOrigin, arena.materials);

  const combat = new Combat(hero.sword);
  combat.attach(dummy);

  const hud = new Hud(need("hud"));
  const aim = new AimIndicator(arena.scene);
  const targeting = new Targeting(arena.scene, hero);
  targeting.attach(dummy);
  refreshShadowCasters(arena.scene, arena.shadows);

  // The control loop runs on the physics clock, not the render clock.
  //
  // Babylon's accumulator takes several fixed solver steps per rendered frame,
  // and notifies this observable before each one. Driving the arm from the
  // render loop instead refreshed the anchor's target only on the first of
  // those steps, so the keyframed anchor kept coasting through the rest and the
  // arm wandered metres from where it was pointed.
  const FIXED_STEP = 1 / CONFIG.world.physicsHz;

  let physicsMs = 0;
  let physicsStart = 0;
  arena.scene.onBeforePhysicsObservable.add(() => {
    physicsStart = performance.now();
    if (controls.isActive) hero.update(FIXED_STEP, controls.state);
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
      targeting.attach(dummy);
      refreshShadowCasters(arena.scene, arena.shadows);
    },
    onToggleReadout: () => hud.toggle(),
    onPause: () => {
      controls.pause();
      showCurtain(true);
    },
    onToggleLock: () => targeting.toggle(),
    onPrimaryDown: () => targeting.primaryDown(),
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
    const zoom = controls.state.zoom;

    // Both goals are built from the hero's position on the ground, so the
    // framing does not shift when the torso's centre height is retuned. Zoom
    // scales distance and height together, so the camera slides along its own
    // sight line and the angle you read the arena at never changes.
    cameraGoal
      .copyFromFloats(origin.x, 0, origin.z)
      .subtractInPlace(forward.scale(C.distance * zoom))
      .addInPlaceFromFloats(0, C.height * zoom, 0);

    lookGoal
      .copyFromFloats(origin.x, 0, origin.z)
      .addInPlace(forward.scale(C.lookAhead))
      .addInPlaceFromFloats(0, C.lookHeight, 0);

    const blend = snap ? 1 : 1 - Math.exp(-C.followResponse * dt);
    arena.camera.position.addInPlace(cameraGoal.subtract(arena.camera.position).scale(blend));
    focus.addInPlace(lookGoal.subtract(focus).scale(blend));
    arena.camera.setTarget(focus);
  };

  placeCamera(0, true);

  let shownMode = "";

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, CONFIG.world.maxFrameSeconds);
    if (dt <= 0) return;

    if (controls.isActive) {
      controls.sample(dt);
      targeting.releaseIfSteering(controls.state.turn);
      targeting.update(dt);
    }

    combat.advance(dt);
    figure.update(dt, hero.groundSpeed());
    placeCamera(dt, false);

    aim.update(hero.feetPosition(), hero.aimPoint());
    arena.scene.render();

    if (targeting.status !== shownMode) {
      shownMode = targeting.status;
      modeLine.innerHTML = MODE_TEXT[shownMode] ?? "";
      modeLine.classList.toggle("on", shownMode !== "free");
      modeLine.classList.toggle("locked", shownMode === "locked");
    }

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
  // deliberately mutable, so `__sword.config.arm.linearMotorForce = 1600` takes
  // effect on the very next frame -- which is the whole point of a feel
  // prototype. Anything the solver caches natively needs `hero.applyTuning()`.
  Object.assign(window as unknown as Record<string, unknown>, {
    __sword: {
      engine,
      scene: arena.scene,
      camera: arena.camera,
      hero,
      figure,
      combat,
      targeting,
      controls,
      config: CONFIG,
    },
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
