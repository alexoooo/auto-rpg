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
import { buildLocomotionCourse, registerLocomotionCourse } from "../golem/locomotion/course.ts";
import { buildGolemStand, golemLayers, type GolemStand } from "../golem/stand.ts";
import { EFFECTOR_SLOTS, effectorSlot, type GolemSlot } from "../golem/module.ts";
import { Controls } from "../input.ts";
import { attachPhysics } from "../physics.ts";
import { flatSupportedWorldRegistry } from "../supported-locomotion-production.ts";
import { BenchOverlay } from "./overlay.ts";

// Side effect, and a load-bearing one: the HDR loader registers itself on import, exactly as
// `src/arena.ts` records. Sixth member of the family of side-effect imports `AGENTS.md` lists.
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";

/**
 * The golem module bench: one module on a stand -- or two effectors, one per socket -- driven
 * with the mouse.
 *
 * This is the page that answers the question three body experiments failed -- can one module
 * look and feel right in isolation -- and the only way it answers it is that a person drives it
 * and says. Nothing here fights. Every number the readout prints is evidence, and no number in
 * it is a verdict.
 *
 * **The stand is not fixed for every slot**, which is Session 05's half of this file. For the
 * four slots that hang off a body it is Session 02's immovable `ANIMATED` block; for locomotion
 * it is a real `DYNAMIC` torso block the module underneath has to carry, and it is rebuilt
 * whenever the acting slot changes. `src/golem/stand.ts` owns that distinction and takes the
 * slot, so nothing here switches on what kind of module is up.
 *
 * **`P` puts a second effector in the other socket**, which Session 04 added for a question a
 * single module cannot be asked: whether a blade and a plate on one stand read as one body or as
 * two arms that happen to be adjacent. Both are commanded from the same `Intent` and each reads
 * the channel of the socket it was built into, so `F` moves the *cursor* rather than the module
 * and the limb the cursor left holds whatever it was last given -- which is what an arena
 * fighter's off hand does. A module that claims both sockets (a mace) cannot share the stand and
 * the picker says so rather than building half of one.
 *
 * **A trunk gets a head stood on it**, which is Session 07's, and it is asked as a capability
 * rather than looked up in a table: whatever is on the stand is asked for a `head` socket, only a
 * torso has one, and the last head-slot option anybody picked is what goes on it. The gate that
 * needs it is the one the session plan actually asks -- lean a trunk *with a head on it* and see
 * whether the head bobs. `controls.ownership.posture` is set true for the same gate's sake:
 * `Controls` gates the arrow keys on ownership because in the arena a policy steers the body, and
 * on a bench the person is the only driver there is.
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
  const layers = golemLayers("left");

  /**
   * The world the carrier navigates against, and the course it navigates around.
   *
   * Built once and outliving every module rebuild, because a query registry is a fact about the
   * room rather than about what is on the stand -- and because `StandableWorldRegistry.register`
   * throws on a duplicate id, so re-registering the same course per rebuild would fail loudly on
   * the second press of `R`. Handed to every module through `ModuleBuild.world`; an effector
   * ignores it, which is why this is not a dispatch on what kind of module is up.
   */
  const world = flatSupportedWorldRegistry();
  registerLocomotionCourse(world);
  const course = buildLocomotionCourse(scene, surfaces.ground);

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
  /**
   * The first registered option that can fill a slot, which is what that slot starts holding.
   *
   * **A refusal rather than a fallback.** Session 04 seeded all five entries of `chosen` with
   * `GOLEM_MODULES[0]`, which was harmless while every registration was an effector and is not
   * any more: Sessions 05 and 07 put a locomotion module, two trunks and two heads on the page,
   * and a rung-0 effector sitting in the `head` entry would be built into a neck the moment a
   * torso asked for one -- an effector in a slot whose channel it cannot read, which is a silent
   * substitution of exactly the kind the `never`-defaulted unions elsewhere exist to prevent. A
   * slot with no registered option is a bench that cannot show that slot, so it says so by name
   * at bring-up instead of standing the wrong thing there.
   */
  const firstFor = (which: GolemSlot): GolemBenchOption => {
    const found = GOLEM_MODULES.find((entry) => entry.slots.includes(which));
    if (!found) throw new Error(`no registered golem module fills the ${which} slot`);
    return found;
  };
  /**
   * What each slot is holding, whether or not it is on the stand right now.
   *
   * Keyed by slot rather than by mode, which is what lets the head the bench stands on a trunk be
   * the same record as the head the picker shows: `chosen.head` *is* "the last head-slot option
   * anybody picked", so Session 07's separate `headOption` is this entry and not a second copy of
   * it. Picking a head therefore both shows it on the stand and chooses which head rides the next
   * torso, with nothing anywhere asking what kind of thing an option is.
   */
  const chosen: Record<GolemSlot, GolemBenchOption> = {
    locomotion: firstFor("locomotion"), torso: firstFor("torso"), head: firstFor("head"),
    primary: firstFor("primary"), secondary: firstFor("secondary"),
  };
  const built = new Map<GolemSlot, BenchModule>();
  const overlays = new Map<GolemSlot, BenchOverlay>();
  /**
   * The head standing on whatever is on the stand, when the thing on the stand has a neck.
   *
   * **Capability, not mode**, which is Session 07's rule kept verbatim: nothing here asks what
   * kind of module is selected, it asks the built module whether it hosts a `head` socket -- which
   * only a torso does -- and stands `chosen.head` on it. That is what lets the owner answer the
   * gate the session plan actually asks: lean a trunk *with a head on it*, and watch the head bob
   * when the trunk moves.
   *
   * Its own variable rather than a sixth entry in `built`, because it is not on the stand: it is
   * on the thing on the stand. The distinction is load-bearing at teardown -- its neck joint is
   * anchored into the host's body, so it has to go first -- and `built` is a map whose iteration
   * order says nothing about what is jointed to what.
   */
  let carried: BenchModule | null = null;
  /**
   * **The stand is rebuilt with the module, because which slot is filled decides what it is.**
   * For four of the five slots it is the fixed `ANIMATED` anchor Session 02 built; for locomotion
   * it is a real `DYNAMIC` torso block that the module carries, which is what the session plan
   * means by "the stand becomes a real torso block on top of the module under test". `stand.ts`
   * owns that distinction and takes the slot; nothing here switches on a mode.
   *
   * Nullable, and torn down with what stands on it. Sessions 04 and 05 restructured this file at
   * the same time -- 04 for two effectors at once, 05 for a stand that is a different body per
   * slot -- and the union is that one stand carries the whole `built` map: the map is what is on
   * the stand, and the stand is what the map is bolted to, so they are built and dropped together.
   */
  let stand: GolemStand | null = null;
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
  /**
   * Why the acting option cannot share the stand with a second one, or null when it can.
   *
   * A refusal that names its own reason rather than a bare `false`, because there are now two
   * reasons and they want different answers from the person: a two-socket terminal is refused
   * until they pick a different one, and a locomotion or torso slot is refused because that slot
   * has no second socket at all and never will. Session 05 put non-effector options on this page,
   * so `slot` is no longer always a hand -- which is the one place pairing had to be taught
   * something by the merge rather than merely carried through it.
   */
  const pairRefusal = (): string | null => {
    if (effectorSlot(slot) === null) return `the ${slot} slot has only one socket`;
    if (chosen[slot].sockets === 2 || chosen[other(slot)].sockets === 2) {
      return "a two-socket module cannot share the stand";
    }
    return null;
  };
  /** Whether the acting option can share the stand with a second one. */
  const canPair = (): boolean => pairRefusal() === null;

  const teardown = (): void => {
    releaseWatchers();
    for (const overlay of overlays.values()) overlay.dispose();
    overlays.clear();
    // **Down the way it was built up**, and that ordering is the whole of this function. Every
    // constraint here points from a body at one level into the body below it, and
    // `PhysicsBody.dispose` walks straight past whatever is constraining it -- so disposing a host
    // first leaves a live constraint pointing at a freed Havok body. Same rule and same reason as
    // terminal-before-chain in `effectorModule`: the carried head is jointed into the trunk, the
    // trunk and every effector are jointed into the stand's block, so it is head, then modules,
    // then stand.
    carried?.dispose();
    carried = null;
    for (const module of built.values()) module.dispose();
    built.clear();
    stand?.dispose();
    stand = null;
  };

  const build = (): void => {
    teardown();
    elapsed = 0;
    contacts = 0;
    selfContacts = 0;
    if (paired && !canPair()) paired = false;
    const filled: GolemSlot[] = paired ? [slot, other(slot)] : [slot];
    // The stand first and the modules onto it, because the stand's own body is what every one of
    // them is jointed to -- and **which slot is acting decides what the stand is**, so it is
    // rebuilt here rather than once at bring-up.
    const rebuilt = buildGolemStand(scene, {
      side: "left", ground: Vector3.Zero(), facing: Quaternion.Identity(), slot,
    });
    stand = rebuilt;

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
    watch(rebuilt.block.body);

    for (const filling of filled) {
      const socket = rebuilt.socket(filling);
      const module = chosen[filling].build({
        scene, side: "left", name: `golem.bench.${filling}`, socket,
        // The other socket, handed over whether or not the option wants one. A one-socket
        // terminal ignores it; a mace refuses to build without it, by name.
        companion: rebuilt.socket(other(filling)), layers, materials: rebuilt.materials,
        // The room's own registry, handed over on the same terms. A locomotion module navigates
        // against it and every other slot ignores it, which is why this is not a dispatch on
        // what kind of module is being built.
        world,
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

    // Ask what is being driven whether it carries a head, and stand one on it if it does. The
    // **acting** module is the one asked, which is exact rather than a narrowing of Session 07's
    // "whatever is on the stand": only a trunk hosts a neck, a trunk fills a slot that has no
    // second socket, and `pairRefusal` therefore refuses to put anything beside one.
    const neck = built.get(slot)?.socket?.("head") ?? null;
    if (neck) {
      carried = chosen.head.build({
        scene, side: "left", name: "golem.bench.head", socket: neck, layers,
        materials: rebuilt.materials, world,
      });
      for (const part of carried.parts) watch(part.part.body);
    }
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
    const refusal = pairRefusal();
    lines.push(paired
      ? `  pair: on, ${chosen[other(slot)].label} in the ${other(slot)} socket   (P)`
      : `  pair: off${refusal === null ? "" : ` -- ${refusal}`}   (P)`);
    if (carried) lines.push(`  carrying: ${chosen.head.label}`);
    lines.push("  keys 1-9, 0, then shift+1-9");
    pickerPanel.innerHTML = lines.join("\n");
  };

  const pick = (wanted: number): void => {
    const ordered = golemBenchModes().flatMap((mode) => golemModulesForMode(mode));
    const picked = ordered[wanted - 1];
    if (!picked) return;
    // **The option is remembered under a slot it can actually fill.** Session 04 wrote
    // `chosen[slot] = picked` and then moved `slot` if the option did not fit, which was correct
    // for as long as every registration was an effector offered in both hands -- the move never
    // fired. Sessions 05 and 07 register modules that fit exactly one slot each, so picking a
    // biped from the primary socket used to file it under `primary` and then build whatever was
    // filed under `locomotion`, which is an effector in a socket whose channel it cannot read.
    // Choosing the target first is the same one line pointed at the slot the option names.
    //
    // Filing by slot is also what makes a head remembered: `chosen.head` is the last head-slot
    // option anybody picked, so looking at `head.ram` and then at `torso.plated` stands the ram
    // on the plated trunk, with nothing here asking what kind of thing either of them is.
    const target = picked.slots.includes(slot) ? slot : picked.slots[0];
    if (target === slot && picked.id === chosen[target].id) return;
    chosen[target] = picked;
    slot = target;
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

  // The number keys, `P` and `B` are the bench's own, because `Controls` has no opinion about any
  // of them: its default branch drops an unhandled code into the held set, where a digit, a `P`
  // and a `B` are all inert.
  //
  // **One listener, because two would both fire.** Sessions 04 and 05 each grew a `keydown`
  // handler on this window for their own key -- `onDigit` and `onBenchKey` -- and registering
  // both would mean every digit ran `pick` twice: the first rebuild would drop the module the
  // second one then read. The union is one function and one `addEventListener`.
  const onBenchKey = (event: KeyboardEvent): void => {
    // **A shove is an impulse, not a force**, and what it is worth is the module's own number
    // with its own bracket beside it. The bench presses the button; it does not decide how hard.
    // Asked of the **acting** module and answered by capability: a module that publishes no
    // fixture, or a fixture that cannot be knocked down, does nothing here and needs no branch.
    if (event.code === "KeyB") {
      built.get(slot)?.fixture?.shove?.();
      return;
    }
    if (event.code === "KeyP") {
      // Pair mode. Refused rather than half-applied, and the picker line names which of the two
      // refusals it is -- a module that has already claimed both sockets, or an acting slot that
      // has only ever had one.
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
  window.addEventListener("keydown", onBenchKey);

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
    // And whatever is standing on one of them. A head's neck drive runs on the same clock as
    // everything else; a module that is not stepped is a module whose joint motors never get
    // their ceilings written.
    carried?.step(SUBSTEP);
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
  //
  // **Taken from the block each frame rather than fixed**, which is the same offset for an
  // effector -- that block never moves -- and is what keeps a walking golem in shot. The block is
  // the right thing to follow rather than the module's own root: it is where the torso is on
  // every slot, and reading `mesh.position` costs nothing and stamps no render id.
  const FOCUS_OFFSET = Object.freeze(new Vector3(0, 0.07, 0.35));
  const focus = new Vector3(0, 1.10, 0.35);
  const goal = new Vector3();
  const placeCamera = (dt: number, snap: boolean): void => {
    if (stand) focus.copyFrom(stand.block.mesh.position).addInPlace(FOCUS_OFFSET);
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
      // **One command, handed to every module on the page.** Each module's registration says
      // which channel of it to read -- an effector takes the hand of the socket it was built
      // into, a trunk takes `posture`, a head takes `natural` -- so two effectors, a trunk and
      // the head riding it are all driven by the same `Intent` a person produced, with nothing
      // here switching on what any of them is. The person drives one hand at a time and the
      // other limb holds whatever that hand's channel last said, exactly as an arena fighter's
      // does.
      const intent = controls.sample(dt);
      for (const each of built.values()) each.command(intent);
      carried?.command(intent);
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
        // "one module", not "one effector": the stand carries a trunk or a pair of legs as
        // readily as an arm now, and a readout that says otherwise is a wrong comment printed
        // sixty times a second.
        paired ? `beside ${chosen[other(slot)].id} in the ${other(slot)} socket` : "one module on the stand",
        ...(carried ? [`carrying ${chosen.head.id}`] : []),
        `socket ${slot}   stroke ${view ? view.stroke : "n/a"}`,
        ...(view ? view.axes.map((axis) =>
          `${axis.id}: commanded ${axis.commanded.toFixed(4)}  achieved ${axis.achieved.toFixed(4)}`) : []),
        // A two-socket terminal's own reading, printed beside the anchor stray it has to stay
        // under. "n/a" for everything else, rather than a zero that would read as a grip held
        // perfectly by a limb that is not there.
        `trailing grip stray ${gripStray === null ? "n/a" : `${(gripStray * 1000).toFixed(3)} mm`}`,
        "",
        ...(view ? formatReadout(state) : []),
        ...(module?.fixture ? module.fixture.lines() : []),
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
      scene, camera, engine, controls, world, course,
      // Getters, not fields, for everything a rebuild replaces. `stand`, `readout` and the acting
      // module are all reassigned by `build`, so a console handle that captured them once would
      // hand back the corpse of whatever was on the stand before the last `R` -- and `readout` in
      // particular is where the merge chose: Session 05 published it as a plain field and Session
      // 04 had already made it a getter for exactly this reason.
      get readout() { return readout; },
      get stand() { return stand; },
      get module() { return built.get(slot) ?? null; },
      get modules() { return built; },
      // The head riding whatever is on the stand. It is a real body on the page and `modules` is
      // keyed by what is *on* the stand, so without this there is no way to reach it from a
      // console -- which is how Session 07's gate gets looked at from a background window.
      get carried() { return carried; },
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
    window.removeEventListener("keydown", onBenchKey);
    controls.dispose();
    teardown();
    course.dispose();
    room.dispose();
  });
}

void main();
