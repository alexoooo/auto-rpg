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
 * The golem effector bench: one module on a fixed stand -- or two, one per socket -- driven with
 * the mouse.
 *
 * This is the page that answers the question three body experiments failed -- can one effector
 * look and feel right in isolation -- and the only way it answers it is that a person drives it
 * and says. Nothing here fights and nothing here has legs. Every number the readout prints is
 * evidence, and no number in it is a verdict.
 *
 * **`P` puts a second effector in the other socket**, which Session 04 added for a question a
 * single module cannot be asked: whether a blade and a plate on one stand read as one body or as
 * two arms that happen to be adjacent. Both are commanded from the same `Intent` and each reads
 * the channel of the socket it was built into, so `F` moves the *cursor* rather than the module
 * and the limb the cursor left holds whatever it was last given -- which is what an arena
 * fighter's off hand does. A module that claims both sockets (a mace) cannot share the stand and
 * the picker says so rather than building half of one.
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
  //
  // **Two effectors, one per socket, and `F` moves the cursor rather than the module.** Session
  // 04's step 7: the owner has to be able to drive a blade with a plate on the other side and see
  // whether the two read as one body, which is a question neither module can answer alone. In
  // pair mode both are built and both are commanded -- each reads the hand channel of the socket
  // it was built into, so the cursor drives whichever hand is acting and the other holds whatever
  // it was last given. In single mode only the acting socket is filled, which is Session 02's
  // bench unchanged, and `F` moves the module across as it always did.
  //
  // A module that claims **both** sockets cannot share the stand, and the picker says so rather
  // than silently building half of it.
  let slot: GolemSlot = "primary";
  let paired = false;
  const chosen: Record<GolemSlot, GolemBenchOption> = {
    locomotion: GOLEM_MODULES[0], torso: GOLEM_MODULES[0], head: GOLEM_MODULES[0],
    primary: GOLEM_MODULES[0], secondary: GOLEM_MODULES[0],
  };
  const built = new Map<GolemSlot, BenchModule>();
  const overlays = new Map<GolemSlot, BenchOverlay>();
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

  const other = (of: GolemSlot): GolemSlot => (of === "primary" ? "secondary" : "primary");
  /** Whether the acting option can share the stand with a second one. */
  const canPair = (): boolean =>
    chosen[slot].sockets === 1 && chosen[other(slot)].sockets === 1;

  const teardown = (): void => {
    releaseWatchers();
    for (const overlay of overlays.values()) overlay.dispose();
    overlays.clear();
    for (const module of built.values()) module.dispose();
    built.clear();
  };

  const build = (): void => {
    teardown();
    elapsed = 0;
    contacts = 0;
    selfContacts = 0;
    if (paired && !canPair()) paired = false;
    const filled: GolemSlot[] = paired ? [slot, other(slot)] : [slot];

    const watch = (body: PhysicsBody): void => {
      owned.add(body);
      body.setCollisionCallbackEnabled(true);
      const observer = body.getCollisionObservable().add((event) => {
        contacts += 1;
        // A self-contact is a contact whose other side is also this golem's. The layer table
        // is written so that no such pair is ever admitted, so a count above zero here says a
        // filter was set wrongly -- not that the body plan touches itself.
        if (owned.has(event.collidedAgainst)) selfContacts += 1;
        // Marked on the acting overlay: a contact belongs to the scene rather than to a socket,
        // and drawing it twice would say two things touched where one did.
        if (event.point) overlays.get(slot)?.markContact(event.point);
      });
      watchers.push([body, observer as never]);
    };
    watch(stand.block.body);

    for (const filling of filled) {
      const socket = stand.socket(filling);
      const module = chosen[filling].build({
        scene, side: "left", name: `golem.bench.${filling}`, socket,
        // The other socket, handed over whether or not the option wants one. A one-socket
        // terminal ignores it; a mace refuses to build without it, by name.
        companion: stand.socket(other(filling)), layers, materials: stand.materials,
      });
      built.set(filling, module);
      const overlay = new BenchOverlay(scene, socket, module.envelope());
      if (rigWanted) overlay.toggle();
      overlays.set(filling, overlay);
      for (const part of module.parts) watch(part.part.body);
    }

    // The band is the **acting** module's, because the readout is: rung 1's first axis is an
    // angle and rungs 2 and 3's is a distance, so a band taken from whichever module happened to
    // be built first would be a number whose unit depends on the other socket.
    readout = new BenchReadout({
      settledBand: built.get(slot)?.envelope().settledBand ?? CHAIN_PITCH.settledBand,
    });
    renderPicker();
  };

  // --- the picker, built from the registry and from nothing else ---------------------------
  //
  // **The keys go past nine now**, because Session 04 took the shelf to eleven registrations and
  // "keys pick the first nine" would have left the whip unreachable at the very gate it exists
  // for. `0` is the tenth and shift picks the second rank, which costs one line of arithmetic
  // and no list.
  const keyFor = (index: number): string => {
    if (index <= 9) return String(index);
    if (index === 10) return "0";
    if (index <= 19) return `s${index - 10}`;
    return " ";
  };

  const renderPicker = (): void => {
    const lines: string[] = ["<b>golem bench</b>"];
    let index = 0;
    for (const mode of golemBenchModes()) {
      lines.push(`  ${benchModeLabel(mode)}`);
      for (const entry of golemModulesForMode(mode)) {
        index += 1;
        const mine = entry.id === chosen[slot].id;
        const theirs = paired && entry.id === chosen[other(slot)].id;
        const both = entry.sockets === 2 ? "  [both sockets]" : "";
        const row = `  ${keyFor(index).padEnd(2)} ${entry.label}  (${entry.massKg.toFixed(2)} kg)${both}`;
        if (mine) lines.push(`<span class="on">${row}  &lt;-- ${slot}</span>`);
        else if (theirs) lines.push(`${row}  &lt;-- ${other(slot)}`);
        else lines.push(row);
      }
    }
    lines.push("");
    lines.push(`  socket: ${slot}   (F swaps)`);
    lines.push(paired
      ? `  pair: on, ${chosen[other(slot)].label} in the ${other(slot)} socket   (P)`
      : `  pair: off${canPair() ? "" : " -- a two-socket module cannot share the stand"}   (P)`);
    lines.push("  keys 1-9, 0, then shift+1-9");
    pickerPanel.innerHTML = lines.join("\n");
  };

  const pick = (wanted: number): void => {
    const ordered = golemBenchModes().flatMap((mode) => golemModulesForMode(mode));
    const picked = ordered[wanted - 1];
    if (!picked || picked.id === chosen[slot].id) return;
    chosen[slot] = picked;
    if (!picked.slots.includes(slot)) slot = picked.slots[0];
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
    onToggleRig: () => {
      // Every overlay on the stand, and the acting one decides the new state: with two limbs up
      // the owner is looking at both, and a rig view that came up on one of them would be an
      // overlay that says the other has no envelope.
      let shown = false;
      for (const [filling, overlay] of overlays) {
        const now = overlay.toggle();
        if (filling === slot) shown = now;
      }
      rigWanted = shown;
    },
    onToggleCamera: noop,
    onRotateCamera: noop,
    onToggleLock: noop,
    onToggleTakeover: noop,
    onSwapHands: () => {
      // **What `F` means depends on how many effectors are on the stand, and both meanings are
      // the same sentence.** An effector reads the channel of the socket it was built into, so
      // the cursor must always end up on a socket something is listening to. With one module
      // that means moving the module across; with two it means moving the cursor and leaving
      // both where they are, which is the whole point of pair mode -- the other limb holds
      // whatever it was last given while this one is driven.
      const next = EFFECTOR_SLOTS.find((candidate) => candidate !== slot);
      if (!next || !chosen[slot].slots.includes(next)) return;
      slot = next;
      if (paired && built.has(slot)) {
        // The band and the overlay belong to the acting module, so the readout is rebuilt and
        // nothing physical is touched: a rebuild here would drop both limbs on the floor every
        // time the owner swapped hands.
        readout = new BenchReadout({
          settledBand: built.get(slot)?.envelope().settledBand ?? CHAIN_PITCH.settledBand,
        });
        elapsed = 0;
        renderPicker();
        return;
      }
      build();
    },
    onPrimaryDown: () => false,
  });
  controls.start();
  // **The default view is from the side, because that is where the swing is.** Rung 1 turns in
  // the sagittal plane, and a camera on the arena's own default bearing looks straight down it:
  // the limb goes away from the viewer and the whole motion the owner is being asked to judge
  // is a foreshortened line behind the stand. Seeded into the gesture state rather than into
  // the camera, so a middle-drag orbits from here and `src/camera.ts` stays the one owner of
  // what a bearing is.
  controls.camera.yaw = -1.1;

  // The number keys and `P` are the bench's own, because `Controls` has no opinion about either:
  // its default branch drops an unhandled code into the held set, where a digit and a `P` are
  // both inert.
  const onDigit = (event: KeyboardEvent): void => {
    if (event.code === "KeyP") {
      // Pair mode. Refused rather than half-applied when either socket holds a module that has
      // already claimed both -- the picker line says which.
      if (!paired && !canPair()) { renderPicker(); return; }
      paired = !paired;
      build();
      return;
    }
    if (!event.code.startsWith("Digit")) return;
    const digit = Number(event.code.slice(5));
    if (!Number.isInteger(digit)) return;
    // 1-9, then 0 for the tenth, then shift for the second rank. The picker prints the same
    // mapping so the two cannot drift.
    const base = digit === 0 ? 10 : digit;
    const wanted = event.shiftKey ? base + 10 : base;
    if (wanted >= 1) pick(wanted);
  };
  window.addEventListener("keydown", onDigit);

  // --- control on the physics clock --------------------------------------------------------
  // `onBeforePhysicsObservable`, not the render loop. The fixed-step accumulator takes several
  // solver steps per rendered frame and notifies this before each one; driving from the render
  // loop refreshes the target on one substep in four, and the Warrior's arm wandered close to
  // four metres when that mistake was made.
  scene.onBeforePhysicsObservable.add(() => {
    // Every module on the stand steps, and the **acting** one is the one sampled. Both halves
    // matter: a limb that is not stepped is a limb whose own joint motors never get their
    // ceilings written, and a readout fed from two modules at once would be two columns in one.
    for (const each of built.values()) each.step(SUBSTEP);
    const module = built.get(slot);
    if (!module) return;
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
      // cursor position are frame events. `step` above is what runs at 240 Hz. **The whole
      // `Intent` goes to both modules** and each takes its own socket's channel out of it, which
      // is the one-seam rule: the person drives one hand at a time and the other limb holds
      // whatever that hand's channel last said, exactly as an arena fighter's does.
      const intent = controls.sample(dt);
      for (const each of built.values()) each.command(intent);
    } else {
      controls.sampleCamera(dt);
    }
    placeCamera(dt, false);
    for (const [filling, overlay] of overlays) overlay.update(built.get(filling)?.view() ?? null);

    if (readoutWanted) {
      const state = readout.state();
      const module = built.get(slot) ?? null;
      const view = module?.view() ?? null;
      const gripStray = view?.gripStray ?? null;
      readoutPanel.textContent = [
        harnessLine,
        `module ${chosen[slot].id}`,
        paired ? `beside ${chosen[other(slot)].id} in the ${other(slot)} socket` : "one effector on the stand",
        `socket ${slot}   stroke ${view ? view.stroke : "n/a"}`,
        ...(view ? view.axes.map((axis) =>
          `${axis.id}: commanded ${axis.commanded.toFixed(4)}  achieved ${axis.achieved.toFixed(4)}`) : []),
        // A two-socket terminal's own reading, printed beside the anchor stray it has to stay
        // under. "n/a" for everything else, rather than a zero that would read as a grip held
        // perfectly by a limb that is not there.
        `trailing grip stray ${gripStray === null ? "n/a" : `${(gripStray * 1000).toFixed(3)} mm`}`,
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
      scene, camera, engine, stand, controls,
      get readout() { return readout; },
      get module() { return built.get(slot) ?? null; },
      get modules() { return built; },
      get option() { return chosen[slot]; },
      get paired() { return paired; },
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
