import { Engine } from "@babylonjs/core/Engines/engine.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import HavokPhysics from "@babylonjs/havok";
// The one line in the bring-up that only a bundler can resolve. `src/arena.ts` carries the
// same import and the same comment: Node's ESM resolver rejects the `?url` subpath outright,
// so a module that carries it takes every one of its importers out of a headless harness's
// reach. This file is a page entry and imports nothing that Node has to load, which is exactly
// why it is allowed to be here and not in `src/golem/`.
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

import { buildArenaColliders, type RoomMaterials } from "../arena-room.ts";
import { orbitFraming } from "../camera.ts";
import { CONFIG } from "../config.ts";
import { CHAIN_PITCH } from "../golem/config.ts";
import { BenchReadout, blankSample, formatReadout } from "../golem/readout.ts";
import {
  GOLEM_MODULES,
  benchModeLabel,
  golemBenchModes,
  golemModulesForMode,
  type BenchModule,
  type GolemBenchOption,
} from "../golem/registry.ts";
import { buildGolemStand, golemLayers } from "../golem/stand.ts";
import { EFFECTOR_SLOTS, type GolemSlot } from "../golem/module.ts";
import { Controls } from "../input.ts";
import { attachPhysics } from "../physics.ts";
import { BenchOverlay } from "./overlay.ts";

// Side effect, and a load-bearing one: the HDR loader registers itself on import, exactly as
// `src/arena.ts` records. Sixth member of the family of side-effect imports `AGENTS.md` lists.
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";

/**
 * The golem effector bench: one module on a fixed stand, driven with the mouse.
 *
 * This is the page that answers the question three body experiments failed -- can one effector
 * look and feel right in isolation -- and the only way it answers it is that a person drives it
 * and says. Nothing here fights and nothing here has legs. Every number the readout prints is
 * evidence, and no number in it is a verdict.
 *
 * **It carries no list of what it can show.** The picker is built from `GOLEM_MODULES` in
 * `src/golem/registry.ts`, grouped by the mode each registration declares, and the number keys
 * select from the registry's own order. Session 03's chains, Session 04's terminals, Session
 * 05's locomotion modules and Session 07's torso and head therefore appear here by
 * registration alone -- and Sessions 05 and 07, which may run at the same time, do not both
 * have to edit the middle of this file.
 *
 * The bring-up order is the one `AGENTS.md` insists on and it is not negotiable: **physics
 * before any body**, then the fixed 240 Hz sub-step, then geometry. Creating a body first
 * fails with "No Physics Engine available", which names neither the cause nor the file.
 */

const SUBSTEP = 1 / CONFIG.world.physicsHz;

const need = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element as T;
};

/**
 * A plain material set for the room colliders.
 *
 * `buildArenaColliders` wants a `RoomMaterials`, which is the arena's whole palette -- HDR
 * environment, four CC0 tiling maps, a costume family. The bench needs a floor and a ring of
 * posts, and dragging the arena's palette in would mean the bench could fail to load for a
 * reason that has nothing to do with a golem. Eight flat PBR surfaces instead, and the golem
 * itself takes its own salvaged palette from `golemMaterials`.
 */
function roomMaterials(scene: Scene): RoomMaterials {
  const flat = (name: string, albedo: Color3, metallic: number, roughness: number): PBRMaterial => {
    const material = new PBRMaterial(`bench.${name}`, scene);
    material.albedoColor = albedo;
    material.metallic = metallic;
    material.roughness = roughness;
    return material;
  };
  const stone = flat("stone", new Color3(0.20, 0.21, 0.23), 0, 0.92);
  const metal = flat("metal", new Color3(0.52, 0.54, 0.58), 0.85, 0.38);
  const timber = flat("timber", new Color3(0.28, 0.22, 0.16), 0, 0.85);
  return {
    steel: metal, edge: metal, brass: metal, leather: timber,
    wood: timber, paintedWood: timber, bowString: timber, arrowAccent: metal,
    ground: stone, wall: stone, timber, banner: timber,
  };
}

async function main(): Promise<void> {
  const canvas = need<HTMLCanvasElement>("stage");
  const pickerPanel = need("picker");
  const readoutPanel = need("readout");

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false, stencil: true, antialias: true,
    powerPreference: "high-performance",
  });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.055, 0.062, 0.078, 1);
  scene.ambientColor = new Color3(0.14, 0.15, 0.18);

  // Physics first, before a single body exists.
  attachPhysics(scene, await HavokPhysics({ locateFile: () => havokWasmUrl }));
  // The fixed sub-step, in **milliseconds**, exactly as `src/arena.ts` sets it. Without it a
  // motorised joint gets a slightly different correction every frame and the limb shivers --
  // measured at 40 mm of tip wander under realistic frame jitter, against 0 mm fixed.
  scene.getPhysicsEngine()?.setSubTimeStep(1000 / CONFIG.world.physicsHz);

  const camera = new FreeCamera("bench.camera", new Vector3(0, 1.6, -3.4), scene);
  camera.fov = CONFIG.camera.fov;
  camera.minZ = 0.05;
  camera.maxZ = 80;

  // Image-based lighting, on the same terms as `src/arena.ts`: it is what makes a steel blade
  // read as steel rather than as a black bar, and a metal terminal on a stone limb is exactly
  // the contrast the owner is being asked to look at. Wrapped, so a fresh clone that has not
  // run `npm run asset:fetch` still loads the bench -- just flatter.
  try {
    const environment = new HDRCubeTexture("/assets/env.hdr", scene, 256, false, true, false, true);
    scene.environmentTexture = environment;
    scene.environmentIntensity = 0.9;
  } catch {
    scene.environmentIntensity = 0;
  }

  const sky = new HemisphericLight("bench.sky", new Vector3(0.2, 1, 0.1), scene);
  sky.intensity = 0.55;
  sky.diffuse = new Color3(0.72, 0.78, 0.92);
  sky.groundColor = new Color3(0.24, 0.2, 0.16);
  const sun = new DirectionalLight("bench.sun", new Vector3(-0.45, -1, 0.62), scene);
  sun.position = new Vector3(6, 10, -8);
  sun.intensity = 2.2;

  const surfaces = roomMaterials(scene);
  const room = buildArenaColliders(scene, surfaces);
  // **A floor you can see.** `buildArenaColliders` builds the ground slab invisible, because in
  // the arena the cosmetic room draws the visible floor over it and the bench does not want the
  // rest of that room. Without something under it the stand hangs in a void, and depth is
  // exactly the part of a three-dimensional motion a person cannot read from perspective alone
  // -- which is the same argument `src/aim.ts` makes about staking the aim point out on the
  // ground. This is a **flat floor marking on the existing slab**, which is one of the explicit
  // body-free cases the room rules allow: no aggregate, no collider, no authority.
  const floor = MeshBuilder.CreateGround("bench.floor", { width: 22, height: 22 }, scene);
  floor.position.y = 0.002;
  floor.material = surfaces.ground;
  floor.isPickable = false;
  floor.receiveShadows = true;
  const stand = buildGolemStand(scene, {
    side: "left", ground: Vector3.Zero(), facing: Quaternion.Identity(),
  });
  const layers = golemLayers("left");

  // --- what is on the stand ---------------------------------------------------------------
  let slot: GolemSlot = "primary";
  let option: GolemBenchOption = GOLEM_MODULES[0];
  let module: BenchModule | null = null;
  /**
   * The head the bench stands on whatever is on the stand, when the thing on the stand has a neck.
   *
   * **Capability, not mode.** Nothing here asks what kind of module is selected: it asks the built
   * module whether it hosts a `head` socket, which only a torso does, and it carries whichever
   * registered option last chosen fits the `head` slot. That is what lets the owner answer the
   * gate the session plan actually asks -- lean a trunk *with a head on it*, and see the head bob
   * when the trunk moves -- without the bench growing a table of which options go together.
   *
   * It starts at the first registered head so the pairing exists before anybody presses anything,
   * and `pick` moves it, so looking at `head.ram` and then at `torso.plated` shows the ram on the
   * plated trunk.
   */
  let headOption: GolemBenchOption | null =
    GOLEM_MODULES.find((entry) => entry.slots.includes("head")) ?? null;
  let carried: BenchModule | null = null;
  let overlay: BenchOverlay | null = null;
  let rigWanted = false;
  let readoutWanted = true;
  let elapsed = 0;
  let contacts = 0;
  let selfContacts = 0;
  let owned = new Set<PhysicsBody>();
  let watchers: [PhysicsBody, Observer<unknown>][] = [];
  // **Rebuilt with the module, because the band is the module's.** The first published axis is an
  // angle on rung 1 and a distance on rungs 2 and 3, so a single shared constant would be a
  // number whose unit depends on which option happens to be on the stand -- the same shape of
  // defect as a range constant in `policies.ts` that is a weapon's length in disguise.
  let readout = new BenchReadout({ settledBand: CHAIN_PITCH.settledBand });
  const sample = blankSample();

  const releaseWatchers = (): void => {
    for (const [body, observer] of watchers) {
      body.getCollisionObservable().remove(observer as never);
    }
    watchers = [];
    owned = new Set();
  };

  const teardown = (): void => {
    releaseWatchers();
    overlay?.dispose();
    overlay = null;
    // The carried module first. Its neck joint is anchored into the host's own body, and
    // disposing the host first would leave a constraint pointing at a freed Havok body --
    // `PhysicsBody.dispose` walks straight past whatever is constraining it. Same rule and same
    // reason as terminal-before-chain in `effectorModule`.
    carried?.dispose();
    carried = null;
    module?.dispose();
    module = null;
  };

  const build = (): void => {
    teardown();
    elapsed = 0;
    contacts = 0;
    selfContacts = 0;
    const socket = stand.socket(slot);
    module = option.build({
      scene, side: "left", name: `golem.bench.${slot}`, socket, layers,
      materials: stand.materials,
    });
    readout = new BenchReadout({ settledBand: module.envelope().settledBand });
    overlay = new BenchOverlay(scene, socket, module.envelope());
    if (rigWanted) overlay.toggle();

    const watch = (body: PhysicsBody): void => {
      owned.add(body);
      body.setCollisionCallbackEnabled(true);
      const observer = body.getCollisionObservable().add((event) => {
        contacts += 1;
        // A self-contact is a contact whose other side is also this golem's. The layer table
        // is written so that no such pair is ever admitted, so a count above zero here says a
        // filter was set wrongly -- not that the body plan touches itself.
        if (owned.has(event.collidedAgainst)) selfContacts += 1;
        if (event.point) overlay?.markContact(event.point);
      });
      watchers.push([body, observer as never]);
    };
    watch(stand.block.body);
    for (const part of module.parts) watch(part.part.body);

    // Ask what is on the stand whether it carries a head, and stand one on it if it does.
    const neck = module.socket?.("head") ?? null;
    if (neck && headOption) {
      carried = headOption.build({
        scene, side: "left", name: "golem.bench.head", socket: neck, layers,
        materials: stand.materials,
      });
      for (const part of carried.parts) watch(part.part.body);
    }
    renderPicker();
  };

  // --- the picker, built from the registry and from nothing else ---------------------------
  const renderPicker = (): void => {
    const lines: string[] = ["<b>golem bench</b>"];
    let index = 0;
    for (const mode of golemBenchModes()) {
      lines.push(`  ${benchModeLabel(mode)}`);
      for (const entry of golemModulesForMode(mode)) {
        index += 1;
        const key = index <= 9 ? String(index) : " ";
        const current = entry.id === option.id;
        const row = `  ${key}  ${entry.label}  (${entry.massKg.toFixed(2)} kg)`;
        lines.push(current ? `<span class="on">${row}  &lt;--</span>` : row);
      }
    }
    lines.push("");
    lines.push(`  socket: ${slot}   (F swaps)`);
    if (carried && headOption) lines.push(`  carrying: ${headOption.label}`);
    if (GOLEM_MODULES.length > 9) {
      lines.push("  more than nine registered; keys pick the first nine");
    }
    pickerPanel.innerHTML = lines.join("\n");
  };

  const pick = (wanted: number): void => {
    const ordered = golemBenchModes().flatMap((mode) => golemModulesForMode(mode));
    const chosen = ordered[wanted - 1];
    if (!chosen || chosen.id === option.id) return;
    // Remembered by **slot** rather than by mode, so the bench never asks what kind of thing an
    // option is: whatever fits a neck is what a neck gets. Picking a head therefore both shows it
    // on the stand and chooses which head rides the next torso you pick.
    if (chosen.slots.includes("head")) headOption = chosen;
    option = chosen;
    if (!option.slots.includes(slot)) slot = option.slots[0];
    build();
  };

  build();

  // --- input -------------------------------------------------------------------------------
  // `Controls` is the arena's, unchanged, because the frozen choice for this session is that
  // the mouse mapping is the page's existing one: the cursor is absolute, its position is where
  // the effector is asked to be, and `F` swaps sockets. What the bench does not have is a bout,
  // a target, a takeover or a camera mode, so those hooks are answered with nothing.
  const noop = (): void => { /* the bench has no bout to do this to */ };
  const controls = new Controls(canvas, {
    onReset: () => build(),
    onToggleReadout: () => {
      readoutWanted = !readoutWanted;
      readoutPanel.classList.toggle("gone", !readoutWanted);
    },
    onPause: () => {
      // Physics authority, not just input. Stopping input alone leaves a keyframed body
      // carrying whatever velocity its last target gave it, which is the difference between a
      // frozen bench and a bench that drifts while you look at it.
      const running = controls.isActive;
      if (running) {
        scene.physicsEnabled = false;
        controls.pauseCombat();
      } else {
        scene.physicsEnabled = true;
        controls.start();
      }
    },
    onPauseOnly: () => {
      if (!controls.isActive) return;
      scene.physicsEnabled = false;
      controls.pauseCombat();
    },
    onToggleHelp: noop,
    onToggleRig: () => { rigWanted = overlay?.toggle() ?? false; },
    onToggleCamera: noop,
    onRotateCamera: noop,
    onToggleLock: noop,
    onToggleTakeover: noop,
    onSwapHands: () => {
      // The socket follows the hand the mouse is on, which is what `F` means on this page: an
      // effector module reads the channel of the slot it was built into, so moving the cursor
      // to the other hand has to move the module to the other socket or the mouse would be
      // driving a channel nothing is listening to.
      const next = EFFECTOR_SLOTS.find((candidate) => candidate !== slot);
      if (!next || !option.slots.includes(next)) return;
      slot = next;
      build();
    },
    onPrimaryDown: () => false,
  });
  // **The person owns their own posture here, and without this line a torso has no writer.**
  // `Controls` gates the arrow keys on `ownership.posture`, which is false by default because in
  // the arena a policy is steering the body while the person spends the mouse on one hand. There
  // is no policy on the bench: the person is the only driver, so `Intent.posture.trunkLean` and
  // `trunkTwist` are theirs to write and nothing else would ever write them. A command channel
  // with no writer is a button a person cannot press and it looks exactly like a body that does
  // not work -- which is on record for `Intent.natural`, one channel over, and cost a session.
  controls.ownership.posture = true;
  controls.start();
  // **The default view is from the side, because that is where the swing is.** Rung 1 turns in
  // the sagittal plane, and a camera on the arena's own default bearing looks straight down it:
  // the limb goes away from the viewer and the whole motion the owner is being asked to judge
  // is a foreshortened line behind the stand. Seeded into the gesture state rather than into
  // the camera, so a middle-drag orbits from here and `src/camera.ts` stays the one owner of
  // what a bearing is.
  controls.camera.yaw = -1.1;

  // The number keys are the bench's own, because `Controls` has no opinion about them: its
  // default branch drops an unhandled code into the held set, so a digit is inert there.
  const onDigit = (event: KeyboardEvent): void => {
    if (!event.code.startsWith("Digit")) return;
    const wanted = Number(event.code.slice(5));
    if (Number.isInteger(wanted) && wanted >= 1 && wanted <= 9) pick(wanted);
  };
  window.addEventListener("keydown", onDigit);

  // --- control on the physics clock --------------------------------------------------------
  // `onBeforePhysicsObservable`, not the render loop. The fixed-step accumulator takes several
  // solver steps per rendered frame and notifies this before each one; driving from the render
  // loop refreshes the target on one substep in four, and the Warrior's arm wandered close to
  // four metres when that mistake was made.
  scene.onBeforePhysicsObservable.add(() => {
    if (!module) return;
    module.step(SUBSTEP);
    carried?.step(SUBSTEP);
    const view = module.view();
    sample.t = elapsed;
    sample.commanded = view && view.axes.length > 0 ? view.axes[0].commanded : 0;
    sample.achieved = view && view.axes.length > 0 ? view.axes[0].achieved : 0;
    if (view) {
      sample.tipX = view.tip.x;
      sample.tipY = view.tip.y;
      sample.tipZ = view.tip.z;
      sample.cmdX = view.commandedTip.x;
      sample.cmdY = view.commandedTip.y;
      sample.cmdZ = view.commandedTip.z;
      sample.stroking = view.stroke !== "idle";
      sample.anchorStray = view.anchorStray;
      sample.hasEdge = view.edge !== null;
      if (view.edge) {
        sample.edgeX = view.edge.x;
        sample.edgeY = view.edge.y;
        sample.edgeZ = view.edge.z;
      }
    }
    sample.contacts = contacts;
    sample.selfContacts = selfContacts;
    contacts = 0;
    selfContacts = 0;
    readout.sample(sample);
    elapsed += SUBSTEP;
  });

  // --- camera ------------------------------------------------------------------------------
  const orbit = { distance: 0, height: 0 };
  // Framed on the middle of the working envelope rather than on the stand: the limb hangs from
  // 1.42 m and reaches 1.14 m out and down, so the thing being looked at is in front of and
  // below the block, not inside it.
  const focus = new Vector3(0, 1.10, 0.35);
  const goal = new Vector3();
  const placeCamera = (dt: number, snap: boolean): void => {
    const gesture = controls.camera;
    // `orbitFraming` and the gesture state are `src/camera.ts`'s, so middle-drag orbit,
    // Shift+middle-drag pan and the wheel behave exactly as they do in the arena. The bench's
    // subject does not move, so there is no facing to follow: the bearing is the gesture's.
    orbitFraming(gesture, 3.6, 1.6, orbit);
    const bearing = gesture.yaw;
    goal.set(
      focus.x + Math.sin(bearing) * -orbit.distance + gesture.panX,
      orbit.height + 0.6,
      focus.z + Math.cos(bearing) * -orbit.distance + gesture.panZ,
    );
    const blend = snap ? 1 : 1 - Math.exp(-CONFIG.camera.followResponse * dt);
    camera.position.addInPlace(goal.subtract(camera.position).scale(blend));
    camera.setTarget(focus);
  };
  placeCamera(0, true);

  // --- the frame ---------------------------------------------------------------------------
  const harnessLine = "harness: the page bench (bench.html, WebGL, real Havok)";
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, CONFIG.world.maxFrameSeconds);
    if (dt <= 0) return;

    if (controls.isActive) {
      // Once per rendered frame, which is what a control boundary is: a button press and a
      // cursor position are frame events. `step` above is what runs at 240 Hz.
      //
      // **One command, handed to both.** Each module's registration says which channel of it to
      // read -- an effector takes its own hand, a trunk takes `posture`, a head takes `natural` --
      // so a torso and the head it carries are driven by the same `Intent` a person produced,
      // with nothing here switching on what either of them is.
      const command = controls.sample(dt);
      module?.command(command);
      carried?.command(command);
    } else {
      controls.sampleCamera(dt);
    }
    placeCamera(dt, false);
    overlay?.update(module?.view() ?? null);

    if (readoutWanted) {
      const state = readout.state();
      const view = module?.view() ?? null;
      readoutPanel.textContent = [
        harnessLine,
        `module ${option.id}`,
        `socket ${slot}   stroke ${view ? view.stroke : "n/a"}`,
        ...(view ? view.axes.map((axis) =>
          `${axis.id}: commanded ${axis.commanded.toFixed(4)}  achieved ${axis.achieved.toFixed(4)}`) : []),
        "",
        ...formatReadout(state),
        "",
        controls.isActive ? "" : "PAUSED -- Space or Esc resumes",
      ].join("\n");
    }

    scene.render();
  });

  /**
   * The console handle, in the house style.
   *
   * The arena exposes `window.__sword` so that `__sword.config.arm.stiffness = 1600` takes
   * effect on the next frame, and the documented way to tune anything here is to move a number
   * from the console first and write it back into the file afterwards. The golem blocks in
   * `src/golem/config.ts` are deliberately mutable for that reason -- with the same caveat the
   * arena's carries: geometry and joint limits are read at construction and motor ceilings are
   * written onto native solver objects there, so a change to one of those needs `R` (which
   * rebuilds the module from its file) rather than the next frame.
   *
   * `step` and `render` are here for the trap `AGENTS.md` records: Chrome does not paint WebGL
   * in a hidden tab, `requestAnimationFrame` stops outright, and a screenshot then shows the
   * DOM updating over a black canvas. Stepping the world by hand and calling `render` yourself
   * is the way through, and it is how this page was checked from a background window.
   */
  Object.assign(window as unknown as Record<string, unknown>, {
    __golem: {
      scene, camera, engine, stand, readout, controls,
      get module() { return module; },
      get option() { return option; },
      step: (frames = 1) => {
        // Both of these are Babylon internals with no public spelling, and the cast is the
        // whole reason this lives here rather than in a module something else imports.
        // `_advancePhysicsEngineStep` takes **milliseconds** and runs the fixed sub-step
        // accumulator; `_renderId` has to be advanced once per simulated frame or every matrix
        // a reader touches freezes at its first sample.
        const internals = scene as unknown as {
          _renderId: number;
          _advancePhysicsEngineStep(ms: number): void;
        };
        for (let frame = 0; frame < frames; frame += 1) {
          internals._renderId += 1;
          internals._advancePhysicsEngineStep(1000 / 60);
        }
      },
      render: () => scene.render(),
    },
  });

  window.addEventListener("resize", () => engine.resize());
  window.addEventListener("beforeunload", () => {
    window.removeEventListener("keydown", onDigit);
    controls.dispose();
    teardown();
    room.dispose();
    stand.dispose();
  });
}

void main();
