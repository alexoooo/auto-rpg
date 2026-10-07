import { arenaMeasurement } from "./measure.ts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
// `scene.createPickingRay` is this module's patch: without it the build compiles and the ray is missing.
import "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { appearanceFor, appearancesFor, type Appearance } from "../render/appearance.ts";
import { showHeroLineup } from "../render/character-preview.ts";
import { arenaSolids } from "./room.ts";
import { buildArena } from "./scene.ts";
import { MENU_HREF } from "../app-route.ts";
import { need } from "../dom.ts";
import { airOf, hearTouches } from "../audio/body-sounds.ts";
import { debrisCues } from "../audio/cues.ts";
import { GameAudio } from "../audio/game-audio.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { BODY_MODELS, modelHolds, modelInfo, type BodyModel } from "../core/models.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { createWorld, type World } from "../core/world.ts";
import type { SkinView } from "../render/skin-view.ts";
import { loadSkeletonArt, type SkeletonArt } from "../render/skeleton-skin.ts";
import { drawBody, drawHeld, type BodyShapes } from "../render/body-shapes.ts";
import { dresserFor, type Dresser } from "../render/dress.ts";
import { fighterHands } from "../render/strike-hands.ts";
import { Duel, SIDES, type DuelEnding, type Verdict } from "./duel.ts";
import { MATCHUP_PARAM, appearanceSearch, readAppearances, matchupSearch, readBalance, readCap, readGap, CONTROLS, controllerLabel, controlsFor, readControls, readMinds, readRecovery, readHeld, readMatchup, readTape, readYou, linkedSettings, settingsSearch, settled, youSearch, type Matchup } from "./matchup.ts";
import { fieldsOf, PRESETS } from "../core/mind/controllers.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { arenaCameraRig, type ArenaSubjects } from "./camera.ts";
import { arenaViewSearch, cameraFocuses, normalizeArenaView, readArenaView, type ArenaFocus, type ArenaView } from "./view.ts";
import { choice, following, type Control } from "../ui/controls.ts";
import { viewControls } from "../ui/view-controls.ts";
import { aimPoint, keysToMove, personOrders } from "./orders-input.ts";
import type { Side } from "../core/spec/body.ts";

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
  let appearances = readAppearances(location.search, matchup);
  let view = readArenaView(location.search, you);
  const rig = arenaCameraRig(camera, view);
  // A link's tape is of the link's matchup: a bout of another matchup begun from the page plays none.
  const linked = { matchup, tape: readTape(location.hash), hash: location.hash };
  /** Whether the bout under way plays a tape: it then takes no orders from a person. */
  let replaying = false;
  const youPicker = need<HTMLSelectElement>("you");
  youPicker.value = you ?? "";
  const controlPickers = {} as Record<Side, HTMLSelectElement>, heldPickers = {} as Record<Side, HTMLSelectElement>;
  // Each side's settings as its panel shows them, by field key (`Controller.fields`).
  const settingsOf = {} as Record<Side, () => Record<string, string>>;
  const controls = readControls(location.search), heldChoices = readHeld(location.search);
  const linkedControl = JSON.stringify(readMinds(location.search)), linkedRecovery = readRecovery(location.search);
  const linkedHeld = JSON.stringify(heldChoices ?? { left: modelInfo(matchup.left).held, right: modelInfo(matchup.right).held });
  const pickers = {} as Record<Side, HTMLSelectElement>;
  const refreshChoices = {} as Record<Side, () => void>;
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
      const option = document.createElement("option"); option.value = model; option.textContent = MODEL_DISPLAY[model].label; select.append(option);
    }
    select.value = matchup[side]; select.disabled = true;
    select.setAttribute("aria-label", `${side === "left" ? "Left" : "Right"} character`);
    const preview = document.createElement("canvas");
    preview.className = "contender-preview"; preview.setAttribute("aria-hidden", "true");
    const appearanceField = document.createElement("label"), appearanceName = document.createElement("span"), appearancePicker = document.createElement("select");
    appearanceField.className = "field"; appearanceName.className = "field-name"; appearanceName.textContent = "Appearance";
    appearancePicker.setAttribute("aria-label", `${side === "left" ? "Left" : "Right"} appearance`);
    appearancePicker.disabled = true;
    const refreshAppearance = () => {
      const model = select.value as BodyModel, choices = appearancesFor(model);
      appearancePicker.replaceChildren(...choices.map(row => Object.assign(document.createElement("option"), { value: row.id, textContent: row.name })));
      appearancePicker.value = appearanceFor(model, appearances[side]);
      appearanceField.hidden = choices.length < 2;
    };
    refreshAppearance();
    appearanceField.append(appearanceName, appearancePicker);
    const choices = document.createElement("div"); choices.className = "contender-choices";
    field.append(name, select); choices.append(field, appearanceField); panel.append(head, preview, choices);
    const controller = document.createElement("label"), control = document.createElement("select");
    controller.className = "field"; controller.textContent = "Controller";
    control.setAttribute("aria-label", `${side} controller`);
    for (const [value, textContent] of Object.entries(CONTROLS)) control.append(Object.assign(document.createElement("option"), { value, textContent }));
    control.value = controls[side];
    controller.append(control); choices.append(controller); controlPickers[side] = control;
    // The controller's settings, its preset's until changed; the linked controller's as the link writes them, with any fault.
    const settings = document.createElement("details"), summary = document.createElement("summary");
    const fields = document.createElement("div"), fault = document.createElement("p");
    settings.className = "settings"; summary.textContent = "Settings"; fault.className = "settings-fault";
    settings.append(summary, fields, fault); choices.append(settings);
    const inputs = new Map<string, HTMLSelectElement | HTMLInputElement>();
    const value = (key: string): string | null => inputs.get(key)?.value ?? null;
    const showFault = () => {
      const { faults } = settled(control.value, value);
      fault.hidden = faults.length === 0;
      fault.textContent = faults.length ? `${faults.join("; ")}: the preset is used` : "";
    };
    const showSettings = (config: MindConfig) => {
      inputs.clear();
      fields.replaceChildren(...fieldsOf(config).map((field) => {
        const row = document.createElement("label"), name = document.createElement("span");
        row.className = "field"; name.textContent = field.label;
        const input = (() => {
          switch (field.kind) {
            case "choice": {
              const select = document.createElement("select");
              for (const [value, textContent] of field.options) select.append(Object.assign(document.createElement("option"), { value, textContent }));
              return select;
            }
            case "number":
              return Object.assign(document.createElement("input"), { type: "number", min: String(field.least), max: String(field.most), step: String(field.step) });
            default: { const never: never = field; throw new Error(`no field of kind ${JSON.stringify(never)}`); }
          }
        })();
        input.value = field.read(config);
        input.setAttribute("aria-label", `${side} ${field.label.toLowerCase()}${field.kind === "number" ? `, ${field.unit}` : ""}`);
        input.addEventListener("change", () => { input.blur(); showFault(); });
        inputs.set(field.key, input);
        row.append(name, input);
        return row;
      }));
      settings.hidden = inputs.size === 0;
      showFault();
    };
    settingsOf[side] = () => Object.fromEntries([...inputs].map(([key, input]) => [key, input.value]));
    showSettings(linkedSettings(location.search, side).config);
    control.addEventListener("change", () => { control.blur(); showSettings(PRESETS[control.value]!.config); });
    const equipment = document.createElement("label"), held = document.createElement("select");
    equipment.className = "field"; equipment.textContent = "Right hand"; held.setAttribute("aria-label", `${side} equipment`);
    for (const [value, textContent] of [["club", "Wooden club"], ["empty", "Empty hands"]])
      held.append(Object.assign(document.createElement("option"), { value, textContent }));
    held.value = heldChoices?.[side] ?? modelInfo(matchup[side]).held; held.addEventListener("change", () => held.blur());
    equipment.append(held); choices.append(equipment); heldPickers[side] = held;
    const refresh = refreshChoices[side] = () => {
      refreshAppearance();
      const model = select.value as BodyModel, choices = controlsFor(model), previous = control.value;
      control.replaceChildren(...choices.map(value => Object.assign(document.createElement("option"), { value, textContent: CONTROLS[value] })));
      control.value = choices.includes(previous as typeof choices[number]) ? previous : readControls(matchupSearch("", { ...matchup, [side]: model }))[side];
      if (control.value !== previous) showSettings(PRESETS[control.value]!.config);
      const hands = modelHolds(model);
      equipment.hidden = !hands;
      for (const option of held.options) option.disabled = !hands && option.value !== "empty";
      if (!hands) held.value = "empty";
    };
    refresh();
    need("matchup").append(panel);
    pickers[side] = select;
    previewLoads.push(showHeroLineup(preview, physicsEngine, [matchup[side]], lifetime.signal, [appearances[side]]).then(view => {
      previews[side] = view; select.disabled = false; appearancePicker.disabled = false;
      select.addEventListener("change", () => {
        appearances = { ...appearances, [side]: "default" };
        refresh();
        select.blur();
        void view.setModel(0, select.value as BodyModel).catch(error => {
          need("boot-note").textContent = `Preview unavailable: ${error.message}`;
        });
      }, { signal: lifetime.signal });
      appearancePicker.addEventListener("change", () => {
        const appearance = appearanceFor(select.value as BodyModel, appearancePicker.value);
        appearances = { ...appearances, [side]: appearance };
        appearancePicker.blur();
        void view.setAppearance(0, appearance).catch(error => { need("boot-note").textContent = `Preview unavailable: ${error.message}`; });
      }, { signal: lifetime.signal });
    }));
  }

  const recoveryField = document.createElement("label"), recoveryPicker = document.createElement("select");
  recoveryField.className = "field recovery"; recoveryField.textContent = "After a fall";
  recoveryPicker.setAttribute("aria-label", "Recovery window");
  recoveryPicker.append(Object.assign(document.createElement("option"), { value: "continue", textContent: "Continue fighting and attempt recovery" }));
  for (const seconds of new Set([0, 15, 30, 60, linkedRecovery ?? 60])) recoveryPicker.append(Object.assign(document.createElement("option"),
    { value: String(seconds), textContent: seconds === 0 ? "Fall ends bout" : `${seconds} seconds down before defeat` }));
  recoveryPicker.value = linkedRecovery == null ? "continue" : String(linkedRecovery); recoveryPicker.addEventListener("change", () => recoveryPicker.blur());
  recoveryField.append(recoveryPicker); need("matchup").after(recoveryField);

  // Each model's dresser, loaded once: its skin, or its shapes if the skin does not load.
  let skeletonArt: Promise<SkeletonArt> | null = null;
  const dressers = new Map<string, Promise<Dresser>>();
  const dresser = (model: BodyModel, appearance: Appearance): Promise<Dresser> => {
    const key = `${model}:${appearance}`;
    let found = dressers.get(key);
    if (!found) {
      found = dresserFor(model, scene, { appearance, skeletonArt: () => skeletonArt ??= loadSkeletonArt() });
      dressers.set(key, found);
    }
    return found;
  };

  const audio = new GameAudio();
  // What each side's controller is called while its bout runs (`controllerLabel`).
  let controllers: Record<Side, string> = { left: "", right: "" };
  let duel: Duel | null = null, drawn: (SkinView | BodyShapes)[] = [], paused = false, shown: Verdict | null = null;
  const bodies = new Map<Side, { skin: SkinView; shapes: BodyShapes; hands: ReturnType<typeof fighterHands>; subject: ArenaSubjects[Side] }>();
  let subjects: ArenaSubjects | null = null;
  const applyView = () => {
    for (const { skin, shapes } of bodies.values()) {
      skin.setEnabled(view.view === "world");
      for (const mesh of shapes.meshes) mesh.setEnabled(view.view === "tactical");
      for (const mesh of [...skin.meshes, ...shapes.meshes]) shadows.removeShadowCaster(mesh);
      for (const mesh of (view.view === "world" ? skin : shapes).meshes) shadows.addShadowCaster(mesh);
    }
  };
  const undraw = () => {
    for (const { hands } of bodies.values()) hands.dispose();
    for (const drawing of drawn) { for (const mesh of drawing.meshes) shadows.removeShadowCaster(mesh); drawing.dispose(); }
    drawn = []; bodies.clear(); subjects = null;
  };
  const viewPanel = need<HTMLDetailsElement>("arena-view");
  viewPanel.open = !matchMedia("(max-width: 700px)").matches;
  viewPanel.querySelector("summary")!.addEventListener("click", event => (event.currentTarget as HTMLElement).blur());
  for (const type of ["pointerdown", "pointermove", "wheel"]) viewPanel.addEventListener(type, event => event.stopPropagation());
  const viewFields: Control[] = [];
  const chooseView = (patch: Partial<ArenaView>) => {
    view = normalizeArenaView({ ...view, ...patch }, you);
    rig.choose(view); applyView();
    history.replaceState(null, "", arenaViewSearch(location.search, view) + location.hash);
    for (const control of viewFields) control.refresh();
  };
  viewFields.push(...viewControls(() => view, chooseView),
    following(() => view.camera, mode => choice("Focus", cameraFocuses(mode).map(value => ({ value,
      name: ({ both: "Both", left: "Left", right: "Right" } satisfies Record<ArenaFocus, string>)[value] })),
      () => view.focus, focus => chooseView({ focus }))));
  need("arena-view-controls").append(...viewFields.map(control => control.element));
  /** What hears the bout under way: its touches' listener, and each side's air. */
  let hearing: { dispose(): void } | null = null, airs: { readonly side: Side; readonly air: (at: Vector3) => number }[] = [];
  const end = () => { undraw(); hearing?.dispose(); hearing = null; airs = []; duel?.dispose(); duel = null; shown = null; };

  // The readout: each side's name and bar, and the clock.
  const hud = need("hud");
  const rows = SIDES.map((side) => {
    const column = document.createElement("div"), label = document.createElement("strong"), bar = document.createElement("progress");
    column.className = "hud-col"; column.dataset.side = side; bar.max = 1; bar.value = 1;
    const status = document.createElement("small");
    column.append(label, bar, status); hud.append(column);
    return { side, label, bar, status };
  });
  const clockColumn = document.createElement("div"), clock = document.createElement("span"), pauseButton = document.createElement("button");
  clockColumn.className = "hud-col hud-clock";
  pauseButton.id = "arena-pause"; pauseButton.type = "button"; pauseButton.className = "action quiet";
  pauseButton.textContent = "Pause"; pauseButton.title = "Pause (Space / Esc)"; pauseButton.hidden = true;
  pauseButton.setAttribute("aria-controls", "pause-menu");
  clockColumn.append(clock, pauseButton); hud.insertBefore(clockColumn, rows[1].label.parentElement);

  const setPaused = (value: boolean) => {
    paused = value && duel !== null && !duel.verdict;
    show("pause-menu", paused);
    pauseButton.hidden = paused || !duel || !!duel.verdict;
    audio.setActive(!paused && duel !== null && !duel.verdict);
  };
  let screen: "setup" | "fight" = "setup";
  const setup = () => {
    end(); setPaused(false); show("bout-end", false); show("curtain", true); screen = "setup"; viewPanel.hidden = true;
    for (const side of SIDES) {
      pickers[side].value = matchup[side];
      refreshChoices[side]();
      void previews[side].setModel(0, matchup[side], appearances[side]);
    }
  };
  const begin = async (next: Matchup) => {
    if (beginButton.disabled) return;
    beginButton.disabled = true;
    try {
      appearances = { left: appearanceFor(next.left, appearances.left), right: appearanceFor(next.right, appearances.right) };
      matchup = next;
      const query = new URLSearchParams(location.search);
      query.set(MATCHUP_PARAM, `${matchup.left},${matchup.right}`);
      query.set("control", SIDES.map((side) => controlPickers[side].value).join(","));
      query.set("held", SIDES.map((side) => heldPickers[side].value).join(","));
      query.set("recovery", recoveryPicker.value);
      const search = settingsSearch(`?${query}`, { left: settingsOf.left(), right: settingsOf.right() });
      const sameControllers = linkedControl === JSON.stringify(readMinds(search));
      const sameRecovery = (linkedRecovery ?? null) === (readRecovery(search) ?? null);
      const sameHeld = linkedHeld === JSON.stringify(readHeld(search));
      const tape = matchup.left === linked.matchup.left && matchup.right === linked.matchup.right && sameControllers && sameRecovery && sameHeld ? linked.tape : [];
      replaying = tape.length > 0;
      history.replaceState(null, "", arenaViewSearch(youSearch(appearanceSearch(matchupSearch(search, matchup), matchup, appearances), you), view) + (replaying ? linked.hash : ""));
      const dress = new Map(await Promise.all(SIDES.map(async (side) => [side, await dresser(matchup[side], appearances[side])] as const)));
      end();
      audio.reset();
      const balance = readBalance(location.search), gap = readGap(location.search), capSeconds = readCap(location.search), held = readHeld(location.search), minds = readMinds(location.search), recoverySeconds = readRecovery(location.search) ?? null;
      controllers = { left: controllerLabel(location.search, "left"), right: controllerLabel(location.search, "right") };
      const bout = duel = new Duel(world, {
        left: matchup.left, right: matchup.right, recoverySeconds,
        ...(gap !== undefined ? { gap } : {}), ...(capSeconds !== undefined ? { capSeconds } : {}), ...(balance ? { balance } : {}), ...(held ? { held } : {}), ...(minds ? { minds } : {}),
      }, {
        solids: arenaSolids(),
        onBuilt: (duelist, built) => {
          const hands = fighterHands(world, duelist);
          const skin = dress.get(duelist.side)!(built, { clothing: { boots: true, armour: true }, closure: hands.closure });
          const shapes = drawBody(built, scene, Color3.FromHexString(duelist.side === "left" ? "#6f8bb5" : "#d0705e"));
          const held = drawHeld(built, scene), pelvis = duelist.body.muscles.dynamics.root.segment.node;
          const rest = pelvis.rotationQuaternion!.clone();
          bodies.set(duelist.side, { skin, shapes, hands, subject: {
            get position() { return duelist.body.physical.centre; },
            get rotation() { return pelvis.rotationQuaternion!; }, rest,
          } });
          for (const mesh of held.meshes) shadows.addShadowCaster(mesh);
          drawn.push(skin, shapes, held);
        },
        // A blow is a touch, and is heard as one; this is what it took off.
        onBlow: (blow) => { for (const cue of debrisCues(blow)) audio.cue(cue); },
      });
      subjects = { left: bodies.get("left")!.subject, right: bodies.get("right")!.subject };
      rig.reset(); applyView();
      const sides = SIDES.map((side) => ({ id: side, built: bout.duelists[side].built }));
      hearing = hearTouches(world, sides, (cue) => audio.cue(cue));
      airs = sides.map(({ id, built }) => ({ side: id, air: airOf(built) }));
      bout.play(tape);
      for (const row of rows) row.label.textContent = `${MODEL_DISPLAY[matchup[row.side]].label} (${row.side === you && !replaying ? "you" : row.side})`;
      show("curtain", false); show("bout-end", false); setPaused(false); screen = "fight"; viewPanel.hidden = false;
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
  for (const [button, value] of [[pauseButton, true], [need("resume"), false]] as const) {
    for (const type of ["pointerdown", "pointermove"]) button.addEventListener(type, event => event.stopPropagation());
    button.addEventListener("click", () => { button.blur(); setPaused(value); });
  }
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

  // Orbit uses the spare buttons; left-button attack remains independent of camera mode.
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  canvas.addEventListener("pointermove", event => {
    if (screen === "fight" && (event.buttons & 6)) rig.orbit(event.movementX, event.movementY);
  });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    if (screen === "fight") rig.zoom(event.deltaY);
  }, { passive: false });
  /** The person's orders for this frame, from the keys and the pointer as the camera has them. */
  const giveOrders = () => {
    if (!duel || !you || replaying || paused || duel.verdict) return;
    const centre = duel.duelists[you].body.physical.centre;
    const ray = pointer ? scene.createPickingRay(pointer.x, pointer.y, null, camera) : null;
    const point = ray ? aimPoint(ray.origin.asArray(), ray.direction.asArray(), centre.y) : null;
    duel.order(you, personOrders(keysToMove(keys, rig.azimuth), point, attacking, centre));
  };
  const airAt = new Vector3();
  const frame = () => {
    rig.frame(screen, subjects, engine.getDeltaTime() / 1000, engine.getAspectRatio(camera));
    audio.setView(camera.position, { x: Math.sin(rig.azimuth), z: Math.cos(rig.azimuth) });
    arena.updateRoomOcclusion(screen === "fight" && duel ? SIDES.map(side => ({ point: duel!.duelists[side].body.physical.head })) : []);
  };
  const readout = () => {
    if (!duel) return;
    for (const row of rows) {
      const fighter = duel.duelists[row.side];
      row.bar.value = fighter.pool.bar();
      const mind = fighter.minded, controller = controllers[row.side];
      const phase = "skills" in mind ? mind.skills.report.strike.phase ?? mind.skills.report.engagement?.phase ?? "guard / move" : mind.body.has;
      const down = duel.state.recovery?.[row.side];
      row.status.textContent = fighter.body.down
        ? `${fighter.body.has}${duel.recipe.recoverySeconds === null ? " - getting up" : down !== undefined ? ` - ${Math.max(0, duel.recipe.recoverySeconds! - down).toFixed(1)} s recovery left` : " - down"}`
        : `${controller} - ${phase}`;
    }
    // While either side is helped, each side's balance, per cent of its weight: the link's, or its character's.
    const helped = SIDES.some((side) => duel!.duelists[side].body.assist.on);
    const balance = SIDES.map((side) => duel!.recipe.balance?.[side] ?? duel!.duelists[side].built.spec.attributes.balance.value);
    clock.textContent = `${duel.clock.toFixed(1)} s${helped ? ` · balance ${balance.join(" / ")} %` : ""}${replaying ? " · replay" : ""}`;
    if (duel.verdict && shown !== duel.verdict) {
      pauseButton.hidden = true;
      shown = duel.verdict;
      const { winner, ending, time } = shown;
      const how = ENDING_TEXT[ending];
      need("bout-verdict").textContent = winner
        ? `${MODEL_DISPLAY[matchup[winner]].label} (${winner}) wins ${how}, ${time.toFixed(1)} s`
        : `A draw ${how}, ${time.toFixed(1)} s`;
      show("bout-end", true); audio.setActive(false);
    }
  };

  const measurement = new URLSearchParams(location.search).get("measure") === "1" ? arenaMeasurement(document.body) : null;
  engine.runRenderLoop(() => {
    const began = measurement ? performance.now() : 0, clockBefore = world.time;
    let physicsMs = 0;
    const seconds = engine.getDeltaTime() / 1000;
    giveOrders();
    if (duel && !paused) {
      const beforePhysics = measurement ? performance.now() : 0;
      world.advance(seconds, Math.ceil(CATCH_UP_SECONDS * world.hz));
      if (measurement) physicsMs = performance.now() - beforePhysics;
      for (const { side, air } of airs) audio.swish(side, air(airAt), airAt);
    }
    if (!paused) arena.fire.burn(seconds);
    frame(); readout(); audio.update();
    scene.render();
    measurement?.record({ frame: performance.now() - began, interval: seconds * 1000, physics: physicsMs,
      simulated: world.time - clockBefore, time: world.time, hz: world.hz, active: !!duel && !paused && !duel.verdict });
  });
  window.addEventListener("resize", () => engine.resize());
  window.addEventListener("pagehide", () => { end(); measurement?.dispose(); audio.dispose(); engine.stopRenderLoop(); world.dispose(); scene.dispose(); engine.dispose(); });
  Object.assign(window, { __arena: { get duel() { return duel; }, world, scene, engine } });

  await Promise.all(previewLoads);
  need("boot-note").textContent = "";
  beginButton.disabled = false;
  // A link that names its matchup opens the bout directly.
  if (new URLSearchParams(location.search).has(MATCHUP_PARAM)) await begin(matchup);
}
