import { sceneProfile, visualGroup } from "../render/scene-profile.ts";
import { solidGeometry } from "../render/solid-geometry.ts";
import { warmScene } from "../render/ready.ts";
import { arenaMeasurement } from "./measure.ts";
import { frameMeter } from "../ui/frame-meter.ts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
// `scene.createPickingRay` is this module's patch: without it the build compiles and the ray is missing.
import "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { appearanceFor, appearancesFor, type Appearance } from "../render/appearance.ts";
import { showHeroLineup } from "../render/character-preview.ts";
import { addArenaSolids, arenaSolids } from "./room.ts";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { buildArena } from "./scene.ts";
import { LEVELS, type ArenaLevel } from "./levels.ts";
import { MENU_HREF } from "../app-route.ts";
import type { ScreenContext } from "../ui/screen.ts";
import { need as find } from "../dom.ts";
import { airOf, hearTouches } from "../audio/body-sounds.ts";
import { debrisCues } from "../audio/cues.ts";
import { GameAudio } from "../audio/game-audio.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { BODY_MODELS, modelHolding, modelHolds, modelLoadout, resolveCharacter, type BodyModel } from "../core/models.ts";
import { attributeEditor } from "../ui/attribute-editor.ts";
import { writeAttributes } from "../ui/attribute-link.ts";
import { HELD, heldItem, type Loadout } from "../core/items/held.ts";
import { HUMAN_HASTE, hasteText } from "../core/human/attributes.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { createWorld, type Hook, type World } from "../core/world.ts";
import type { SkinView } from "../render/skin-view.ts";
import { loadSkeletonArt, type SkeletonArt } from "../render/skeleton-skin.ts";
import { drawBody, drawHeld, type BodyShapes } from "../render/body-shapes.ts";
import { dresserFor, type Dresser } from "../render/dress.ts";
import { fighterHands } from "../render/strike-hands.ts";
import { boutStart, Duel, entryRules, SIDES, type Verdict } from "./duel.ts";
import { trialOverlay } from "./trial-overlay.ts";
import { endingText } from "./end-rule.ts";
import { caseSearch, readReel, reelHash, unshown } from "./case-link.ts";
import { reelTrials, type Trial } from "./reel.ts";
import { MATCHUP_PARAM, arenaAttributes, appearanceSearch, readAppearances, matchupSearch, readGap, readLevel, CONTROLS, controllerLabel, controlCharacter, controlName, controlsFor, defaultControl, readControls, readLoadouts, readMatchup, readYou, recipeOf, linkedMind, mindsSearch, unreadMinds, youSearch, type Matchup } from "./matchup.ts";
import { offered } from "../core/mind/controller.ts";
import { partOf, treeData, treeObeys, MINDS, defaultMind } from "../entrants/game.ts";
import { loadData } from "../core/data/store.ts";
import { mindEditor } from "../ui/mind-editor.ts";
import { notesOf, type NoteLevel } from "../ui/mind-notes.ts";
import { mindInspector } from "../ui/mind-inspector.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { arenaCameraRig, type ArenaSubjects } from "./camera.ts";
import { arenaViewSearch, cameraFocuses, normalizeArenaView, readArenaView, type ArenaFocus, type ArenaView } from "./view.ts";
import { choice, following, type Control } from "../ui/controls.ts";
import { viewControls } from "../ui/view-controls.ts";
import { aimPoint, keysToMove, rayTarget } from "./orders-input.ts";
import { teamOfOne } from "./team.ts";
import type { Side } from "../core/spec/body.ts";
import { physicalReading } from "../core/observation.ts";
import { arenaPlayback } from "./playback.ts";
import { ARENA_SIDES, sideHighlights } from "./side-highlights.ts";
import { fighterHud } from "./fighter-hud.ts";
import { choicePanel, choiceWatch } from "../ui/choices.ts";

/**
 * **The arena page**: the arena's scene with its solids in a world (`buildArena`), and a bout
 * of two bodies in it (`Duel`). Setup picks the two models and the side the person fights, if
 * any; a bout runs to its verdict, and can be run again, or again with the right side redrawn.
 *
 * A person who takes a side leads it as a team of one (`teamOfOne`) under the party's Commander,
 * which picks no foe untold and gives the side its orders (`Duel.order`): the keys walk it, as the
 * camera sees the ground, it faces the pointer, the left button attacks where the pointer is, and a
 * click on the floor sends it there. The page turns the keys and the pointer into world directions
 * (`orders-input.ts`) before the Commander reads them, so nothing of the camera reaches a mind.
 *
 * Each side shows its choices (`MenuEntry`, `choicePanel`); the person picks one of their side's,
 * ordered as an attack with its action, limb and region, or lets the mind fight its own way. With
 * pause on choice, the bout pauses where their side has a new one (`choiceWatch`), so a bout plays
 * turn by turn, its orders on its tape.
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


/** What a hand may hold, by name, as the pickers show it. */
const HELD_NAMES = Object.fromEntries(HELD.map((held) => [held, heldItem(held)?.name ?? "Empty"])) as Readonly<Record<typeof HELD[number], string>>;
const loadoutName = (loadout: Loadout): string => `Left: ${HELD_NAMES[loadout.left]}, right: ${HELD_NAMES[loadout.right]}`;
/** A note's level as a person reads it, for a character and loadout. */
const levelName = (level: NoteLevel, model: BodyModel, loadout: Loadout): string => {
  switch (level) {
    case "body-loadout": return `${MODEL_DISPLAY[model].label}, ${loadoutName(loadout).toLowerCase()}`;
    case "body": return MODEL_DISPLAY[model].label;
    case "loadout": return loadoutName(loadout);
    case "mind": return "Any";
    default: { const never: never = level; throw new Error(`unknown note level ${never}`); }
  }
};

/** What the setup says of a reel's trial (`Trial`): its record, and what the pickers do not show of it. */
const trialNote = ({ commit, world }: Trial): string => {
  const extra = unshown(world.recipe);
  return `A recorded case from commit ${commit.slice(0, 8)}: the reel plays its recipe and orders as this build's code builds them, `
    + `which may not be the code it was recorded at. Fight plays a new bout of the choices shown.${extra.length ? ` The case also sets ${extra.join(", ")}, which the pickers do not show.` : ""}`;
};
/** Two overlays drawn and taken away together. */
const joined = (a: ReturnType<typeof trialOverlay>, b: ReturnType<typeof trialOverlay>): ReturnType<typeof trialOverlay> =>
  ({ update() { a.update(); b.update(); }, dispose() { a.dispose(); b.dispose(); } });
/** The pause between one trial's end and the next one's start, with auto-play on, ms. */
const TRIAL_BEAT_MS = 1000;
/** Where the previous version's same trial plays, beside the trial: this far along +x, the stage's own axis, m. */
const BESIDE = 4;
/** How much of its side's colour the previous version's bodies are drawn in: its shapes, dimmed. */
const BESIDE_SHADE = .55;

export async function bootArena(context: ScreenContext): Promise<void> {
  const location = context.address, lifetime = context;
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const previewFailed = (error: Error) => { need("boot-note").textContent = `Preview unavailable: ${error.message}`; };
  const show = (id: string, shown: boolean) => need(id).classList.toggle("gone", !shown);
  // A reel opened from the Ratings plays its trials in this screen, one after another; the trial
  // shown puts its choices in the address, so the pickers show them when the reel is left.
  const reel = readReel(location.hash), trials = reel ? await reelTrials(reel) : null;
  context.signal.throwIfAborted();
  let at = reel?.at ?? 0, auto = reel?.auto ?? false;
  const reelAt = () => reel ? reelHash({ ...reel, at, auto }) : "";
  if (trials) context.replace(caseSearch(trials[at]!.world.recipe) + reelAt());
  const canvas = need<HTMLCanvasElement>("stage");
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  context.own(() => { engine.stopRenderLoop(); engine.dispose(); });
  const physicsEngine = await loadEngine(trials?.[at]!.world.engine);
  context.signal.throwIfAborted();
  const level = readLevel(location.search);
  let made: World | null = null;
  const arena = await buildArena(engine, (scene) => {
    context.own(() => scene.dispose());
    const world = made = createWorld(scene, physicsEngine);
    context.own(() => world.dispose());
    return world.physics;
  }, level, context.signal);
  context.signal.throwIfAborted();
  const world = made as World | null;
  if (!world) throw new Error("the arena made no world");
  const { scene, camera, shadows } = arena;
  // Every bout begins in the world as the arena left it, as a bout in a fresh world does.
  const toStart = boutStart(world);

  // Setup: a contender panel on each side, each with its model.
  let matchup: Matchup = readMatchup(location.search), you: Side | null = readYou(location.search);
  let appearances = readAppearances(location.search, matchup);
  let view = readArenaView(location.search, you);
  const rig = arenaCameraRig(camera, view);
  /** The reel's trial under way, if the bout plays one: it then takes no orders from a person. */
  let trial: Trial | null = null;
  const youPicker = need<HTMLSelectElement>("you");
  youPicker.value = you ?? "";
  youPicker.addEventListener("change", () => { for (const side of SIDES) renameControl[side]?.(); });
  const controlPickers = {} as Record<Side, HTMLSelectElement>, loadoutPickers = {} as Record<Side, Record<Side, HTMLSelectElement>>;
  // Each side's mind as its panel shows it (`mindEditor`).
  const mindOf = {} as Record<Side, () => MindConfig>, mindFaultsOf = {} as Record<Side, () => readonly string[]>;
  const controls = readControls(location.search), loadoutChoices = readLoadouts(location.search);
  const pickers = {} as Record<Side, HTMLSelectElement>;
  const refreshChoices = {} as Record<Side, () => void>, renameControl = {} as Record<Side, () => void>;
  const previews = {} as Record<Side, Awaited<ReturnType<typeof showHeroLineup>>>;
  const attributeEditors = {} as Record<Side, ReturnType<typeof attributeEditor>>;
  const attributes = { ...arenaAttributes(location.search) };
  const previewLoads: Promise<void>[] = [];
  for (const side of SIDES) {
    const panel = document.createElement("section");
    panel.className = "contender"; panel.dataset.side = side;
    const head = document.createElement("header"), title = document.createElement("h2");
    head.className = "contender-head"; title.textContent = ARENA_SIDES[side].label; head.append(title);
    panel.style.setProperty("--side-colour", ARENA_SIDES[side].colour);
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
    const attributePanel = attributeEditors[side] = attributeEditor({ model: matchup[side], attributes: attributes[side] }, {
      change: (draft, resolved) => {
        attributes[side] = draft;
        if (resolved) {
          refreshChoices[side]?.();
          void previews[side]?.setCharacter(0, { model: select.value as BodyModel, attributes: controlCharacter(control.value, draft) }, appearances[side]);
        }
      },
    });
    choices.append(attributePanel.element);
    const controller = document.createElement("label"), control = document.createElement("select");
    controller.className = "field"; controller.textContent = "Controller";
    control.setAttribute("aria-label", `${side} controller`);
    for (const [value, textContent] of Object.entries(CONTROLS)) control.append(Object.assign(document.createElement("option"), { value, textContent }));
    control.value = controls[side];
    controller.append(control); choices.append(controller); controlPickers[side] = control;
    const hands = {} as Record<Side, HTMLSelectElement>, equipment: HTMLLabelElement[] = [];
    for (const hand of SIDES) {
      const field = document.createElement("label"), picker = document.createElement("select");
      field.className = "field"; field.textContent = `${hand === "left" ? "Left" : "Right"} hand`;
      picker.setAttribute("aria-label", `${side} fighter's ${hand} hand`);
      for (const value of HELD) picker.append(Object.assign(document.createElement("option"), { value, textContent: HELD_NAMES[value] }));
      picker.value = loadoutChoices?.[side][hand] ?? modelLoadout(matchup[side])[hand];
      field.append(picker); controller.before(field); equipment.push(field); hands[hand] = picker;
    }
    loadoutPickers[side] = hands;
    const loadout = (): Loadout => ({ left: hands.left.value as typeof HELD[number], right: hands.right.value as typeof HELD[number] });
    // The mind's tree (`mindEditor`), its preset's until changed; the linked mind as the link carries it, with any fault.
    const settings = document.createElement("details"), summary = document.createElement("summary");
    settings.className = "settings"; summary.textContent = "Mind";
    // Each mind's notes for this side's character and loadout (`notesOf`), the most particular first.
    const notes = document.createElement("p"); notes.className = "mind-notes";
    // The chosen preset is named as the mind now stands (`controlName`): custom once it is changed. Each
    // is followed by its most particular note, and the chosen one's notes are listed under the picker.
    // A side the person leads under a mind that takes no orders (`treeObeys`) is said to: its mind plays it as its own.
    const nameControl = renameControl[side] = () => {
      const model = select.value as BodyModel, holds = loadout();
      for (const option of control.options) {
        const note = notesOf(option.value, model, holds)[0]?.note;
        option.textContent = `${option.value === control.value ? controlName(option.value, editor.config) : CONTROLS[option.value]!}${note ? ` · ${note}` : ""}`;
      }
      const all = notesOf(control.value, model, holds).map(({ level, note }) => `${levelName(level, model, holds)}: ${note}`);
      if (youPicker.value === side && !treeObeys(editor.config)) all.unshift("Takes no orders: it fights on its own while you lead its side");
      notes.replaceChildren(...all.map((textContent) => Object.assign(document.createElement("span"), { textContent })));
      notes.hidden = all.length === 0;
    };
    const editorSpec = () => {
      try { return modelHolding(select.value as BodyModel, loadout(), controlCharacter(control.value, attributes[side])); }
      catch { return modelHolding(select.value as BodyModel, loadout()); }
    };
    // The minds are checked by the entry rule of the bout the page opens with: a trial's own, or a fight's.
    const editor = mindEditor(linkedMind(location.search, side).config, { spec: editorSpec(), entry: entryRules(trials?.[at]!.world.recipe), onFault: "the bout is not played until it is fixed", onChange: () => nameControl() });
    settings.append(summary, editor.element); choices.append(notes, settings);
    // The chosen mind's character is the attributes' base (`controlCharacter`): the panel shows it, and a person's draft goes over it.
    let shownBase = "{}";
    const based = () => {
      const base = MINDS[control.value]!.character ?? {}, key = JSON.stringify(base);
      if (key === shownBase) return;
      shownBase = key; attributePanel.setBase(base);
      let drafted = true;
      try { attributePanel.read(); } catch { drafted = false; /* The editor displays its draft's error. */ }
      if (drafted) void previews[side]?.setCharacter(0, { model: select.value as BodyModel, attributes: controlCharacter(control.value, attributes[side]) }, appearances[side]).catch(previewFailed);
    };
    const showSettings = (config: MindConfig) => {
      based();
      editor.set(config, editorSpec());
      settings.hidden = partOf(config).fields.length === 0 && partOf(config).slots.length === 0;
      nameControl();
    };
    showSettings(editor.config);
    mindOf[side] = () => editor.config;
    mindFaultsOf[side] = () => editor.faults;
    control.addEventListener("change", () => { control.blur(); showSettings(MINDS[control.value]!.config); });
    // What it holds before how it thinks: the mind's tree is last, and scrolls in what room is left.
    // The minds offered are those the body, holding what it holds, can carry out (`controlsFor`).
    const refresh = refreshChoices[side] = () => {
      refreshAppearance();
      const model = select.value as BodyModel, hands = modelHolds(model);
      for (const field of equipment) field.hidden = !hands;
      for (const hand of SIDES) {
        const picker = loadoutPickers[side][hand];
        for (const option of picker.options) option.disabled = !hands && option.value !== "empty";
        if (!hands) picker.value = "empty";
      }
      const holds = loadout(), previous = control.value;
      let choices: readonly string[];
      try { choices = controlsFor(model, holds, attributes[side]); } catch { choices = controlsFor(model, holds); }
      // The menu lists the offered minds (`offered`), and the one the link chose if it is another.
      const listed = choices.filter(value => offered(MINDS[value]!) || value === previous);
      control.replaceChildren(...listed.map(value => Object.assign(document.createElement("option"), { value, textContent: CONTROLS[value] })));
      const fallback = defaultControl(model, holds);
      const preferred = listed.includes(fallback) ? fallback : listed[0]!;
      control.value = listed.includes(previous) ? previous : preferred;
      showSettings(control.value !== previous ? MINDS[control.value]!.config : editor.config);
    };
    for (const hand of SIDES) hands[hand].addEventListener("change", () => { hands[hand].blur(); refresh(); });
    refresh();
    need("matchup").append(panel);
    pickers[side] = select;
    previewLoads.push(showHeroLineup(preview, physicsEngine, [matchup[side]], lifetime.signal, [appearances[side]]).then(async view => {
      context.signal.throwIfAborted();
      previews[side] = view; select.disabled = false; appearancePicker.disabled = false;
      let drafted = true;
      try { attributePanel.read(); } catch { drafted = false; /* The editor displays its draft's error. */ }
      if (drafted) await view.setCharacter(0, { model: select.value as BodyModel, attributes: controlCharacter(control.value, attributes[side]) }, appearances[side]).catch(previewFailed);
      select.addEventListener("change", () => {
        appearances = { ...appearances, [side]: "default" };
        attributePanel.set({ model: select.value as BodyModel, attributes: attributes[side] });
        refresh();
        select.blur();
        void view.setCharacter(0, { model: select.value as BodyModel, attributes: controlCharacter(control.value, attributes[side]) }).catch(previewFailed);
      }, { signal: lifetime.signal });
      appearancePicker.addEventListener("change", () => {
        const appearance = appearanceFor(select.value as BodyModel, appearancePicker.value);
        appearances = { ...appearances, [side]: appearance };
        appearancePicker.blur();
        void view.setAppearance(0, appearance).catch(previewFailed);
      }, { signal: lifetime.signal });
    }));
  }

  const levelField = document.createElement("label"), levelPicker = document.createElement("select");
  levelField.className = "field bout-choice"; levelField.textContent = "Level"; levelPicker.setAttribute("aria-label", "Arena level");
  for (const [value, definition] of Object.entries(LEVELS)) levelPicker.append(Object.assign(document.createElement("option"), { value, textContent: definition.label }));
  levelPicker.value = level;
  levelPicker.addEventListener("change", () => {
    const query = new URLSearchParams(location.search), next = levelPicker.value as ArenaLevel;
    query.set("level", next);
    if (readGap(location.search, next) === undefined) query.delete("gap");
    const draft = new URL(setupAddress());
    draft.searchParams.set("level", next);
    if (!query.has("gap")) draft.searchParams.delete("gap");
    context.navigate(draft.href, { setup: true });
  });
  levelField.append(levelPicker); need("matchup").after(levelField);

  function setupAddress(): string {
    const models = { left: pickers.left.value as BodyModel, right: pickers.right.value as BodyModel };
    const query = new URLSearchParams(location.search);
    query.delete("balance"); query.delete("haste"); query.delete("held");
    query.set("control", SIDES.map(side => controlPickers[side].value).join(","));
    query.set("level", levelPicker.value); query.delete("recovery");
    for (const side of SIDES) {
      try { writeAttributes(query, side, attributeEditors[side].read()); } catch { /* The link retains its last valid attributes. */ }
      query.set(`${side}.loadout`, SIDES.map(hand => loadoutPickers[side][hand].value).join(","));
    }
    const search = mindsSearch(`?${query}`, { left: mindOf.left(), right: mindOf.right() });
    return new URL(arenaViewSearch(youSearch(appearanceSearch(matchupSearch(search, models), models, appearances),
      youPicker.value === "left" || youPicker.value === "right" ? youPicker.value : null), view), location).href;
  }
  context.own(() => context.remember(setupAddress()));

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
  context.own(() => audio.dispose());
  // What each side's controller is called while its bout runs (`controllerLabel`).
  let controllers: Record<Side, string> = { left: "", right: "" };
  let duel: Duel | null = null, drawn: (SkinView | BodyShapes)[] = [], paused = false, shown: Verdict | null = null;
  const highlights = sideHighlights(scene);
  context.own(() => highlights.dispose());
  let playback: ReturnType<typeof arenaPlayback> | null = null;
  const bodies = new Map<Side, { read: ReturnType<typeof physicalReading>; skin: SkinView; shapes: BodyShapes; hands: ReturnType<typeof fighterHands>; subject: ArenaSubjects[Side] }>();
  let subjects: ArenaSubjects | null = null;
  /** A trial's overlays (`trialOverlay`), while the bout plays one. */
  let overlay: ReturnType<typeof trialOverlay> | null = null;
  /**
   * The world the previous version's same trial plays in, beside the trial's: made the first time a
   * reel plays one, with the arena's solids, its bodies drawn `BESIDE` m along under `root`.
   */
  let besideWorld: { readonly world: World; readonly toStart: () => void; readonly root: TransformNode } | null = null;
  /** The previous version's bout under way beside the trial, its playback, overlays and shapes. */
  let besideBout: { readonly duel: Duel; readonly playback: ReturnType<typeof arenaPlayback>; dispose(): void } | null = null;
  /** The bout of `previous` beside the trial, in a world of its own, stepped as the trial's is. */
  const playBeside = (previous: NonNullable<Trial["previous"]>) => {
    besideWorld ??= (() => {
      const other = createWorld(scene, physicsEngine);
      context.own(() => other.dispose());
      addArenaSolids(other.physics, arenaSolids(level));
      const root = new TransformNode("arena.beside", scene);
      root.position.set(BESIDE, 0, 0);
      return { world: other, toStart: boutStart(other), root };
    })();
    const { world: other, toStart: reset, root } = besideWorld, shapes: BodyShapes[] = [];
    reset();
    const bout = new Duel(other, previous.world.recipe, { solids: arenaSolids(level), onBuilt: (duelist, built) => {
      // Its nodes under the root: the solver writes each node's place in its own world, drawn beside.
      for (const segment of built.segments.values()) segment.node.parent = root;
      shapes.push(drawBody(built, scene, Color3.FromHexString(ARENA_SIDES[duelist.side].colour).scale(BESIDE_SHADE)), drawHeld(built, scene));
    } });
    bout.play(previous.world.tape);
    const shown = arenaPlayback(bout, CATCH_UP_SECONDS, previous.played ?? Infinity), drawn = trialOverlay(scene, bout, root);
    return { duel: bout, playback: shown, overlay: drawn, right: bout.duelists.right, dispose() {
      drawn.dispose(); shown.dispose();
      for (const one of shapes) one.dispose();
      bout.dispose();
    } };
  };
  const profile = sceneProfile(scene);
  profile.register("world", visualGroup([...scene.meshes]));
  const geometry = solidGeometry(scene, arenaSolids(level));
  profile.register("tactical", geometry);
  context.own(() => { profile.dispose(); geometry.dispose(); });
  const applyView = () => {
    profile.setView(view.view);
    meter.reset();
    for (const { skin, shapes } of bodies.values()) {
      skin.setEnabled(view.view === "world");
      for (const mesh of shapes.meshes) mesh.setEnabled(view.view === "tactical");
      for (const mesh of [...skin.meshes, ...shapes.meshes]) shadows.removeShadowCaster(mesh);
      for (const mesh of (view.view === "world" ? skin : shapes).meshes) shadows.addShadowCaster(mesh);
    }
  };
  const undraw = () => {
    highlights.clear();
    for (const { hands } of bodies.values()) hands.dispose();
    for (const drawing of drawn) { for (const mesh of drawing.meshes) shadows.removeShadowCaster(mesh); drawing.dispose(); }
    drawn = []; bodies.clear(); subjects = null;
  };
  const viewPanel = need<HTMLDetailsElement>("arena-view");
  viewPanel.open = false;
  viewPanel.querySelector("summary")!.addEventListener("click", event => (event.currentTarget as HTMLElement).blur());
  for (const type of ["pointerdown", "pointermove", "wheel"]) viewPanel.addEventListener(type, event => event.stopPropagation());
  const viewFields: Control[] = [];
  const chooseView = (patch: Partial<ArenaView>) => {
    view = normalizeArenaView({ ...view, ...patch }, you);
    rig.choose(view); applyView();
    context.replace(arenaViewSearch(location.search, view) + location.hash);
    for (const control of viewFields) control.refresh();
  };
  viewFields.push(...viewControls(() => view, chooseView),
    following(() => view.camera, mode => choice("Focus", cameraFocuses(mode).map(value => ({ value,
      name: ({ both: "Both", left: "Left", right: "Right" } satisfies Record<ArenaFocus, string>)[value] })),
      () => view.focus, focus => chooseView({ focus }))));
  need("arena-view-controls").append(...viewFields.map(control => control.element));
  /** What hears the bout under way: its touches' listener, and each side's air. */
  let hearing: { dispose(): void } | null = null, airs: { readonly side: Side; readonly air: (at: Vector3) => number }[] = [];
  let hudHook: Hook | null = null;
  /** The person's side as a team of one, while they lead it in the bout under way. */
  let led: ReturnType<typeof teamOfOne> | null = null;
  /** Whether the bout pauses where the person's side has a new choice, and whether it is paused so now, for the person to pick. */
  let pauseOnChoice = false, choosing = false;
  const watch = choiceWatch();
  const end = () => {
    watch.reset(); choosing = false;
    for (const row of rows) row.choices.reset();
    hudHook?.dispose(); hudHook = null;
    led?.dispose(); led = null;
    for (const row of rows) row.condition.reset();
    hud.hidden = true;
    playback?.dispose(); playback = null; undraw(); hearing?.dispose(); hearing = null; airs = []; duel?.dispose(); duel = null; shown = null;
    overlay?.dispose(); overlay = null; besideBout?.dispose(); besideBout = null;
    trial = null; trialShown = false; clearTimeout(nextTimer);
  };

  context.own(end);

  // Each side's pool, damaged parts and recent actions accompany its detailed mind inspector.
  const hud = need("hud");
  hud.hidden = true;
  const rows = SIDES.map((side) => {
    const column = document.createElement("div"), label = document.createElement("strong"), bar = document.createElement("progress");
    column.className = "hud-col"; column.dataset.side = side; bar.max = 1; bar.value = 1;
    column.style.setProperty("--side-colour", ARENA_SIDES[side].colour);
    const status = document.createElement("small"), mind = document.createElement("details"), summary = document.createElement("summary");
    const condition = fighterHud(ARENA_SIDES[side].label);
    mind.className = "hud-mind"; summary.textContent = "Mind"; mind.append(summary);
    bar.setAttribute("aria-label", `${ARENA_SIDES[side].label} fighter health`);
    // A pick goes to the person's side as an attack, as their pointer's strike does, and the bout goes on.
    const choices = choicePanel((foe) => ARENA_SIDES[foe as Side]?.name ?? foe,
      (strike, among) => { if (!led) return; led.hear({ kind: "attack", ...strike }); watch.picked(among); setPaused(false); });
    column.append(label, bar, condition.element, status, choices.element, mind); hud.append(column);
    return { side, label, bar, status, mind, condition, choices, inspector: null as ReturnType<typeof mindInspector> | null };
  });
  const clockColumn = document.createElement("div"), clock = document.createElement("span"), pauseButton = document.createElement("button");
  const meter = frameMeter(engine, context.signal);
  clockColumn.className = "hud-col hud-clock";
  pauseButton.id = "arena-pause"; pauseButton.type = "button"; pauseButton.className = "action quiet";
  pauseButton.textContent = "Pause"; pauseButton.title = "Pause (Space / Esc)"; pauseButton.hidden = true;
  pauseButton.setAttribute("aria-controls", "pause-menu");
  // Pause on choice, while the person leads a side; paused so, what to do and how to go on.
  const choiceBox = Object.assign(document.createElement("input"), { type: "checkbox", checked: pauseOnChoice });
  const choiceLabel = document.createElement("label"), choosingLine = document.createElement("div");
  const goOn = Object.assign(document.createElement("button"), { type: "button", className: "action quiet", textContent: "Go on" });
  choiceLabel.className = "hud-choice-setting"; choiceLabel.append(choiceBox, " Pause on choice"); choiceLabel.hidden = true;
  choosingLine.className = "hud-choosing"; choosingLine.hidden = true;
  choosingLine.append(Object.assign(document.createElement("span"), { textContent: "A new choice: pick one under your side, or go on (Space)" }), goOn);
  for (const control of [choiceLabel, goOn]) for (const type of ["pointerdown", "pointermove"]) control.addEventListener(type, event => event.stopPropagation());
  choiceBox.addEventListener("change", () => { choiceBox.blur(); pauseOnChoice = choiceBox.checked; watch.reset(); });
  goOn.addEventListener("click", () => { goOn.blur(); setPaused(false); });
  clockColumn.append(clock, pauseButton, choiceLabel, choosingLine, viewPanel, meter.element); hud.insertBefore(clockColumn, rows[1].label.parentElement);
  // A reel's trial: which, its conditions and recorded outcome, auto-play and the next trial.
  const reelLine = document.createElement("div"), trialText = document.createElement("span");
  const autoBox = Object.assign(document.createElement("input"), { type: "checkbox", checked: auto });
  const autoLabel = document.createElement("label"), nextButton = Object.assign(document.createElement("button"), { type: "button", className: "action quiet", textContent: "Next trial" });
  reelLine.className = "hud-reel"; reelLine.hidden = true;
  autoLabel.append(autoBox, " Auto-play");
  reelLine.append(trialText, autoLabel, nextButton); clockColumn.append(reelLine);
  /** Whether the trial under way has played as long as it was scored, and when the next begins on its own. */
  let trialShown = false, nextTimer: ReturnType<typeof setTimeout> | undefined;

  /** Pauses or resumes the bout: paused for the menu, or for the person to pick a choice (`why: "choice"`), which shows no menu. */
  const setPaused = (value: boolean, why: "menu" | "choice" = "menu") => {
    paused = value && duel !== null && !duel.verdict;
    choosing = paused && why === "choice";
    show("pause-menu", paused && !choosing);
    choosingLine.hidden = !choosing;
    pauseButton.hidden = paused || !duel || !!duel.verdict;
    audio.setActive(!paused && duel !== null && !duel.verdict);
  };
  let screen: "setup" | "fight" = "setup";
  const setup = () => {
    // Leaving a reel opens the setup of the trial last shown, with its choices in the pickers.
    if (trial) { context.navigate(arenaViewSearch(caseSearch(trial.world.recipe), view), { setup: true }); return; }
    end(); setPaused(false); show("bout-end", false); show("curtain", true); screen = "setup"; viewPanel.hidden = true;
    for (const side of SIDES) {
      pickers[side].value = matchup[side];
      refreshChoices[side]();
      attributeEditors[side].set({ model: matchup[side], attributes: attributes[side] });
      let drafted = true;
      try { attributeEditors[side].read(); } catch { drafted = false; /* Invalid drafts stay in the editor. */ }
      if (drafted) void previews[side].setCharacter(0, { model: matchup[side], attributes: controlCharacter(controlPickers[side].value, attributes[side]) }, appearances[side]).catch(previewFailed);
    }
  };
  /** Begins a bout of `next`: the reel's trial `given`, as recorded, or the one the pickers make. */
  const begin = async (next: Matchup, given: Trial | null = null) => {
    if (beginButton.disabled) return;
    if (!given) try {
      for (const side of SIDES) {
        attributes[side] = attributeEditors[side].read();
        resolveCharacter({ model: next[side], attributes: controlCharacter(controlPickers[side].value, attributes[side]) });
      }
      // A mind with a fault is not played, nor another in its place.
      const faults = SIDES.flatMap((side) => mindFaultsOf[side]().map((fault) => `${ARENA_SIDES[side].label}: ${fault}`));
      if (faults.length > 0) throw new Error(`The bout is not played: ${faults.join("; ")}`);
    } catch (error) { need("boot-note").textContent = error instanceof Error ? error.message : String(error); return; }
    beginButton.disabled = true;
    try {
      await context.loading("Preparing fighters", async stage => {
        appearances = { left: appearanceFor(next.left, appearances.left), right: appearanceFor(next.right, appearances.right) };
        matchup = next;
        if (given) context.replace(arenaViewSearch(appearanceSearch(caseSearch(given.world.recipe), matchup, appearances), view) + reelAt());
        else {
          const query = new URLSearchParams(location.search);
          query.delete("balance"); query.delete("haste");
          for (const side of SIDES) writeAttributes(query, side, attributes[side]);
          query.set(MATCHUP_PARAM, `${matchup.left},${matchup.right}`);
          query.set("control", SIDES.map((side) => controlPickers[side].value).join(","));
          query.delete("held");
          for (const side of SIDES) query.set(`${side}.loadout`, SIDES.map((hand) => loadoutPickers[side][hand].value).join(","));
          query.delete("recovery");
          const search = mindsSearch(`?${query}`, { left: mindOf.left(), right: mindOf.right() });
          context.replace(arenaViewSearch(youSearch(appearanceSearch(matchupSearch(search, matchup), matchup, appearances), you), view));
        }
        // The bout: the trial's recipe as recorded, or the one the address and the pickers make.
        const recipe = given?.world.recipe ?? recipeOf(location.search, attributes, level);
        const minds = recipe.minds ?? { left: defaultMind(recipe.left), right: defaultMind(recipe.right) };
        const [dress] = await Promise.all([
          Promise.all(SIDES.map(async (side) => [side, await dresser(matchup[side], appearances[side])] as const)).then((dressed) => new Map(dressed)),
          loadData([...SIDES.flatMap((side) => treeData(minds[side])), ...given?.previous ? SIDES.flatMap((side) => treeData(given.previous!.world.recipe.minds?.[side] ?? defaultMind(given.previous!.world.recipe[side]))) : []]),
        ]);
        context.signal.throwIfAborted();
        end();
        trial = given;
        toStart();
        audio.reset();
        controllers = { left: controllerLabel(location.search, "left"), right: controllerLabel(location.search, "right") };
        const bout = duel = new Duel(world, recipe, {
          solids: arenaSolids(level),
          onBuilt: (duelist, built) => {
            const hands = fighterHands(duelist);
            const skin = dress.get(duelist.side)!(built, { clothing: { boots: true, armour: true }, closure: hands.closure });
            const shapes = drawBody(built, scene, Color3.FromHexString(ARENA_SIDES[duelist.side].colour));
            const held = drawHeld(built, scene), pelvis = duelist.body.muscles.dynamics.root.segment.node;
            const rest = pelvis.rotationQuaternion!.clone(), read = physicalReading(built);
            highlights.add(duelist.side, [...skin.meshes, ...shapes.meshes, ...held.meshes]);
            bodies.set(duelist.side, { read, skin, shapes, hands, subject: {
              get position() { return read().centre; },
              get rotation() { return pelvis.rotationQuaternion!; }, rest,
            } });
            for (const mesh of held.meshes) shadows.addShadowCaster(mesh);
            drawn.push(skin, shapes, held);
          },
          // A blow is a touch, and is heard as one; this is what it took off.
          onBlow: (blow) => { for (const cue of debrisCues(blow)) audio.cue(cue); },
        });
        playback = arenaPlayback(bout, CATCH_UP_SECONDS, given?.played ?? Infinity);
        subjects = { left: bodies.get("left")!.subject, right: bodies.get("right")!.subject };
        if (given) overlay = trialOverlay(scene, bout);
        if (given?.previous) {
          const beside = playBeside(given.previous), read = physicalReading(beside.right.built), at = new Vector3();
          besideBout = { duel: beside.duel, playback: beside.playback, dispose: beside.dispose };
          overlay = joined(overlay!, beside.overlay);
          // The camera frames the trial's striker and the previous version's target: both bouts.
          const own = subjects.right;
          subjects = { left: subjects.left, right: { get position() { return at.copyFrom(read().centre).addInPlaceFromFloats(BESIDE, 0, 0); }, get rotation() { return own.rotation; }, rest: own.rest } };
        }
        rig.reset(); applyView();
        const sides = SIDES.map((side) => ({ id: side, built: bout.duelists[side].built }));
        hearing = hearTouches(world, sides, (cue) => audio.cue(cue));
        airs = sides.map(({ id, built }) => ({ side: id, air: airOf(built) }));
        if (given) bout.play(given.world.tape);
        else if (you) led = teamOfOne(bout, you, { kind: "party", picks: false });
        choiceLabel.hidden = !led;
        for (const row of rows) {
          row.label.textContent = `${ARENA_SIDES[row.side].label} · ${MODEL_DISPLAY[matchup[row.side]].label}${row.side === you && !given ? " (you)" : ""}`;
          const duelist = bout.duelists[row.side], minded = duelist.minded;
          row.condition.bind(duelist);
          row.condition.sample(world.time); row.condition.render(world.time);
          row.inspector = mindInspector(duelist.mind, duelist.built.spec, () => duel === bout
            ? { body: duelist.body, skills: minded.skills ?? null, report: minded.report ?? null } : null);
          row.mind.replaceChildren(row.mind.firstElementChild!, row.inspector.element);
        }
        let feedStopped = false;
        hudHook = world.afterStep(() => {
          const time = bout.state.start + (bout.verdict?.time ?? bout.clock);
          for (const row of rows) row.condition.sample(time, !feedStopped);
          if (bout.verdict) feedStopped = true;
        });
        if (given) trialText.textContent = `Trial ${at + 1} of ${trials!.length}: ${given.condition}${given.outcome === null ? "" : `; recorded ${given.outcome}${given.why ? ` (${given.why})` : ""}`}`
          + (!reel?.previous ? "" : given.previous ? `; beside, version ${given.previous.version.slice(0, 8)}${given.previous.outcome === null ? "" : `: ${given.previous.outcome}${given.previous.why ? ` (${given.previous.why})` : ""}`}`
            : `; no record holds version ${reel.previous.slice(0, 8)}'s same trial`);
        reelLine.hidden = !given; nextButton.hidden = !given || at + 1 >= trials!.length;
        for (const id of ["random-replay", "bout-end-random"]) need(id).hidden = given !== null;
        hud.hidden = false;
        show("curtain", false); show("bout-end", false); setPaused(false); screen = "fight"; viewPanel.hidden = false;
        frame();
        await stage("Preparing lighting");
        await warmScene(scene, context.signal);
        firstFrame = true;
      });
      if (!context.signal.aborted) canvas.focus();
    } catch (error) {
      if (context.signal.aborted) return;
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
  /** Plays the reel's trial `k`. */
  const playTrial = (k: number) => { at = k; const one = trials![k]!; void begin({ left: one.world.recipe.left, right: one.world.recipe.right }, one); };
  /** The bout under way again: the trial, or a new bout of the pickers' choices. */
  const replay = () => trial ? playTrial(at) : void begin(matchup);
  for (const id of ["restart", "bout-end-replay"]) need(id).addEventListener("click", replay);
  for (const id of ["random-replay", "bout-end-random"]) need(id).addEventListener("click", () => void begin(redrawn()));
  for (const id of ["leave", "bout-end-leave"]) need(id).addEventListener("click", setup);
  need<HTMLButtonElement>("to-menu").addEventListener("click", () => context.navigate(MENU_HREF));
  if (reel?.back) {
    const back = reel.back, link = need<HTMLAnchorElement>("case-back"), button = need<HTMLButtonElement>("bout-end-back");
    link.href = back; link.hidden = false; button.hidden = false;
    button.addEventListener("click", () => context.navigate(back));
  }
  for (const control of [nextButton, autoLabel]) for (const type of ["pointerdown", "pointermove"]) control.addEventListener(type, event => event.stopPropagation());
  nextButton.addEventListener("click", () => { nextButton.blur(); playTrial(at + 1); });
  autoBox.addEventListener("change", () => {
    autoBox.blur(); auto = autoBox.checked;
    context.replace(location.search + reelAt());
    clearTimeout(nextTimer);
    if (auto && trialShown && at + 1 < trials!.length) nextTimer = setTimeout(() => playTrial(at + 1), TRIAL_BEAT_MS);
  });
  const help = (open: boolean) => show("help", open);
  need("help-open").addEventListener("click", () => help(true));
  need("help-close").addEventListener("click", () => help(false));
  // What the person's hands are doing: the walking keys held, and whether Shift is, which walks; where the
  // pointer is on the canvas, px, and whether its left button is down.
  const keys = { up: false, down: false, left: false, right: false };
  let pointer: { x: number; y: number } | null = null, attacking = false, walking = false;
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
    if (event.key === "Shift") { walking = true; return; }
    if (event.target instanceof HTMLElement && event.target.matches("input, select, textarea")) return;
    if (event.key === "?") { help(need("help").classList.contains("gone")); return; }
    if (!duel || walkKey(event, true)) return;
    if (event.key === " " || event.key === "Escape") { event.preventDefault(); if (!duel.verdict) setPaused(!paused); }
    else if (event.key === "r" || event.key === "R") replay();
  }, { signal: context.signal });
  window.addEventListener("keyup", (event) => { if (event.key === "Shift") walking = false; walkKey(event, false); }, { signal: context.signal });
  // Losing focus pauses the bout, and lets go of every key and button: their releases are not heard.
  window.addEventListener("blur", () => {
    keys.up = keys.down = keys.left = keys.right = false;
    walking = false;
    attacking = false;
    if (duel && !duel.verdict) setPaused(true);
  }, { signal: context.signal });
  // The left button is a level, read from every pointer event, since a release is not guaranteed.
  for (const type of ["pointerdown", "pointermove", "pointerup"] as const) {
    canvas.addEventListener(type, (event) => {
      pointer = { x: event.offsetX, y: event.offsetY };
      attacking = (event.buttons & 1) !== 0;
    });
  }
  canvas.addEventListener("pointerleave", () => { pointer = null; attacking = false; press = null; });
  // A left click that is on no body, and moves less than `CLICK_PIXELS` before its release, sends the person's side to the floor under it.
  const CLICK_PIXELS = 6;
  let press: { x: number; y: number } | null = null;
  /** Where the person's ray from the camera through (`x`, `y`) on the canvas meets the floor, and the body part it meets first, if any. */
  const pointed = (x: number, y: number) => {
    if (!duel || !you) return null;
    const ray = scene.createPickingRay(x, y, null, camera), origin = ray.origin.asArray(), direction = ray.direction.asArray();
    return { floor: aimPoint(origin, direction, 0), part: rayTarget(duel.duelists[you].senses(), origin, direction, camera.maxZ) };
  };
  canvas.addEventListener("pointerdown", (event) => {
    press = event.button === 0 && led && !pointed(event.offsetX, event.offsetY)?.part ? { x: event.offsetX, y: event.offsetY } : null;
  });
  canvas.addEventListener("pointerup", (event) => {
    const pressed = press; press = null;
    if (event.button !== 0 || !pressed || !led || paused || Math.abs(event.offsetX - pressed.x) + Math.abs(event.offsetY - pressed.y) >= CLICK_PIXELS) return;
    const at = pointed(event.offsetX, event.offsetY);
    if (at?.floor && !at.part) led.hear({ kind: "go", destination: { x: at.floor[0], z: at.floor[2] } });
  });

  // Orbit uses the spare buttons; left-button attack remains independent of camera mode.
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  canvas.addEventListener("pointermove", event => {
    if (screen === "fight" && (event.buttons & 6)) rig.orbit(event.movementX, event.movementY);
  });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    if (screen === "fight") rig.zoom(event.deltaY);
  }, { passive: false });
  /**
   * The person's lead for this frame, from the keys and the pointer as the camera has them: the keys a
   * direction on the ground, Shift a walk, the pointer a point to face on the level of the side's centre
   * of mass, and the left button held the body part under the pointer, to strike.
   */
  const steer = () => {
    if (!duel || !you || !led) return;
    const centre = duel.duelists[you].body.physical.centre;
    const ray = pointer ? scene.createPickingRay(pointer.x, pointer.y, null, camera) : null;
    const point = ray ? aimPoint(ray.origin.asArray(), ray.direction.asArray(), centre.y) : null;
    const strike = attacking && ray ? rayTarget(duel.duelists[you].senses(), ray.origin.asArray(), ray.direction.asArray(), camera.maxZ) : null;
    led.lead = { keys: keysToMove(keys, rig.azimuth), walk: walking, aim: point ? { x: point[0], z: point[2] } : null, strike, explore: false };
  };
  const airAt = new Vector3();
  const frame = () => {
    rig.frame(screen, subjects, engine.getDeltaTime() / 1000, engine.getAspectRatio(camera));
    audio.setView(camera.position, { x: Math.sin(rig.azimuth), z: Math.cos(rig.azimuth) });
    if (profile.view === "world") arena.updateRoomOcclusion(screen === "fight" && duel ? SIDES.map(side => ({ point: bodies.get(side)!.read().head })) : []);
  };
  const readout = () => {
    if (!duel) return;
    for (const row of rows) {
      const fighter = duel.duelists[row.side];
      row.bar.value = duel.life(row.side);
      row.condition.render(duel.state.start + (duel.verdict?.time ?? duel.clock));
      const mind = fighter.minded, controller = controllers[row.side];
      const phase = mind.skills ? mind.skills.report.actions[0]?.stage ?? mind.report?.engagement?.phase ?? "guard / move" : mind.body.has;
      const down = duel.state.recovery?.[row.side];
      row.status.textContent = duel.verdict
        ? duel.verdict.winner === null ? "Draw" : duel.verdict.winner === row.side ? "Winner" : "Defeated"
        : fighter.body.down
        ? `${fighter.body.has}${down !== undefined && duel.recipe.recoverySeconds ? ` - ${Math.max(0, duel.recipe.recoverySeconds - down).toFixed(1)} s recovery left` : " - getting up"}`
        : `${controller} - ${phase}`;
      if (row.mind.open) row.inspector?.refresh();
      const leads = led !== null && row.side === you && !duel.verdict;
      row.choices.refresh(fighter.minded.report?.menu ?? null, { picks: leads, opens: leads && choosing });
    }
    // While either side is helped, each side's balance, per cent of its weight: the link's, or its character's.
    const helped = SIDES.some((side) => duel!.duelists[side].body.assist.on);
    const balance = SIDES.map((side) => duel!.recipe.balance?.[side] ?? duel!.duelists[side].built.spec.attributes.balance.value);
    // While either side is hasted, each side's haste, per cent over a person's, signed.
    const haste = SIDES.map((side) => duel!.duelists[side].built.spec.attributes.haste.value), hasted = haste.some((h) => h !== HUMAN_HASTE.value);
    clock.textContent = `${(duel.verdict?.time ?? duel.clock).toFixed(1)} s${helped ? ` · balance ${balance.join(" / ")} %` : ""}${hasted ? ` · haste ${haste.map(hasteText).join(" / ")} %` : ""}${trial ? " · replay" : ""}`;
    // A trial ends where it was scored: its verdict, if any, and its outcome as recorded.
    if (trial && playback?.done && (besideBout?.playback.done ?? true) && !trialShown) {
      trialShown = true;
      const last = at + 1 >= trials!.length, { verdict } = duel;
      need("bout-end").style.setProperty("--side-colour", verdict?.winner ? ARENA_SIDES[verdict.winner].colour : "var(--hot)");
      need("bout-verdict").textContent = `Trial ${at + 1} of ${trials!.length}${trial.outcome === null ? "" : `: ${trial.outcome}`}${last ? " · the reel is played" : ""}`;
      const decided = verdict ? `${verdict.winner ? `${MODEL_DISPLAY[matchup[verdict.winner]].label} ` : ""}${endingText(verdict.ending)} · ` : "";
      need("bout-ending").textContent = `${trial.condition} · ${decided}${duel.clock.toFixed(1)} s${trial.why ? ` · ${trial.why}` : ""}`
        + (trial.previous ? ` · beside, version ${trial.previous.version.slice(0, 8)}: ${trial.previous.outcome ?? ""}${trial.previous.why ? `, ${trial.previous.why}` : ""}` : "");
      show("bout-end", true); audio.setActive(false); pauseButton.hidden = true;
      if (auto && !last) nextTimer = setTimeout(() => playTrial(at + 1), TRIAL_BEAT_MS);
    }
    if (!trial && duel.verdict && shown !== duel.verdict) {
      pauseButton.hidden = true;
      shown = duel.verdict;
      const { winner, ending, time } = shown;
      const how = endingText(ending);
      need("bout-end").style.setProperty("--side-colour", winner ? ARENA_SIDES[winner].colour : "var(--hot)");
      need("bout-verdict").textContent = winner ? `${ARENA_SIDES[winner].label} wins${winner === you ? " (you)" : ""}` : "Draw";
      need("bout-ending").textContent = `${winner ? `${MODEL_DISPLAY[matchup[winner]].label} ` : ""}${how} · ${time.toFixed(1)} s`;
      show("bout-end", true); audio.setActive(false);
    }
  };

  const measurement = new URLSearchParams(location.search).get("measure") === "1" ? arenaMeasurement(document.body) : null;
  let firstFrame = true;
  engine.runRenderLoop(() => {
    if (context.busy) { firstFrame = true; meter.reset(); return; }
    if (firstFrame) meter.reset();
    const clockBefore = world.time;
    const timing = meter.frame(() => {
      const seconds = firstFrame ? 0 : engine.getDeltaTime() / 1000; firstFrame = false;
      if (!context.busy) steer();
      if (duel && !paused && !context.busy) {
        meter.physics(() => {
          const steps = playback?.advance(seconds) ?? 0;
          // The previous version's bout beside the trial, in step: the same time, so the same steps.
          return steps + (besideBout?.playback.advance(seconds) ?? 0);
        });
        // A new choice for the person's side pauses the bout for them to pick, where they asked so.
        const own = you ? duel.duelists[you] : null, report = own?.minded.report;
        if (pauseOnChoice && led && own && report?.menu && !duel.verdict
          && watch.changed(report.menu, report.ended ?? [], own.body.down, duel.clock)) setPaused(true, "choice");
        for (const { side, air } of airs) audio.swish(side, air(airAt), airAt);
      }
      if (!paused && !context.busy && profile.view === "world") arena.fire.burn(seconds);
      frame(); readout(); audio.update(); overlay?.update();
      scene.render();
    });
    measurement?.record({ ...timing,
      simulated: world.time - clockBefore, time: world.time, hz: world.hz, active: !!duel && !paused && !duel.verdict });
  });
  window.addEventListener("resize", () => engine.resize(), { signal: context.signal });
  context.own(() => measurement?.dispose());
  Object.assign(window, { __arena: { get duel() { return duel; }, world, scene, engine } });

  await Promise.all(previewLoads);
  context.signal.throwIfAborted();
  frame();
  await warmScene(scene, context.signal);
  const unread = unreadMinds(location.search);
  need("boot-note").textContent = [...unread, ...trials ? [trialNote(trials[at]!)] : []].join(" ");
  beginButton.disabled = false;
  // A reel plays from its trial at once: it has no setup of its own. A link that names its matchup
  // opens the bout directly, unless a mind it names could not be read.
  if (trials) playTrial(at);
  else if (context.autostart && new URLSearchParams(location.search).has(MATCHUP_PARAM) && unread.length === 0) await begin(matchup);
  context.own(() => {
    if ((window as unknown as { __arena?: { engine: Engine } }).__arena?.engine === engine) Reflect.deleteProperty(window, "__arena");
  });
}
