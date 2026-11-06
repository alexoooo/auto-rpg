import type { SkeletonArt } from "../../../core/bodies/human/skeleton-art.ts";
import { sceneProfile, visualGroup } from "../render/scene-profile.ts";
import { solidGeometry } from "../render/solid-geometry.ts";
import { warmScene } from "../render/ready.ts";
import { arenaMeasurement } from "./measure.ts";
import { frameMeter } from "../ui/frame-meter.ts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
// `scene.createPickingRay` is this module's patch: without it the build compiles and the ray is missing.
import "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { appearanceFor, appearancesFor, type Appearance } from "../../../game/appearance/appearance.ts";
import { showHeroLineup } from "../render/character-preview.ts";
import { arenaSolids } from "../../../game/arena/solids.ts";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { buildArena } from "./scene.ts";
import { LEVELS, type ArenaLevel } from "../../../game/arena/levels.ts";
import { MENU_HREF } from "../../../game/route.ts";
import type { ScreenContext } from "../ui/screen.ts";
import { need as find } from "../dom.ts";
import { GameAudio } from "../audio/game-audio.ts";
import { isRefused } from "../../../core/refusal.ts";
import { BODY_MODELS, modelHolding, modelHolds, resolveCharacterChecked, type BodyModel } from "../../../core/bodies/models.ts";
import { modelLoadout } from "../../../game/model-loadouts.ts";
import { attributeEditor } from "../ui/attribute-editor.ts";
import { writeAttributes } from "../../../game/attribute-link.ts";
import { HELD, heldItem, withLoadout, type Loadout } from "../../../core/bodies/items/held.ts";
import { HUMAN_HASTE, hasteText } from "../../../core/bodies/human/attributes.ts";
import { MODEL_DISPLAY } from "../../../game/appearance/models.ts";
import type { SkinView } from "../render/skin-view.ts";
import { loadSkeletonArt } from "../render/skeleton-skin.ts";
import { drawBody, drawHeld, type BodyShapes } from "../render/body-shapes.ts";
import { dresserFor, type Dresser } from "../render/dress.ts";
import { handsOf } from "../render/strike-hands.ts";
import { puppetBody, type Puppet } from "../render/puppet.ts";
import { bodyBetween, openWorld, posePuppet, type Between, type WorldLink } from "../worker/client.ts";
import type { DuelCard, DuelNews, LeadInput, Ray } from "../../worker/duel-stage.ts";
import { duelSpec, entryRules, SIDES, type DuelRecipe } from "../../../game/arena/duel.ts";
import { trialOverlay } from "./trial-overlay.ts";
import { endingText } from "../../../game/arena/end-rule.ts";
import { caseSearch, readReel, reelHash, unshown } from "./case-link.ts";
import { reelTrials, type Trial } from "./reel.ts";
import { MATCHUP_PARAM, arenaAttributes, appearanceSearch, readAppearances, matchupSearch, readGap, readLevel, readLoadouts, readMatchup, readYou, youSearch, type Matchup } from "../../../game/arena/matchup.ts";
import { CONTROLS, controllerLabel, controlCharacter, controlName, controlsFor, defaultControl, readControls, recipeOf, linkedMind, mindsSearch, unreadMinds } from "../setup.ts";
import { offered } from "../../../minds/controller.ts";
import { partOf, treeObeys, MINDS, defaultMind } from "../../catalog.ts";
import { mindEditor } from "../ui/mind-editor.ts";
import { notesOf, type NoteLevel } from "../ui/mind-notes.ts";
import { mindInspector } from "../ui/mind-inspector.ts";
import type { MindConfig } from "../../../minds/config.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { arenaCameraRig, type ArenaSubjects } from "./camera.ts";
import { arenaViewSearch, cameraFocuses, normalizeArenaView, readArenaView, type ArenaFocus, type ArenaView } from "./view.ts";
import { choice, following, type Control } from "../ui/controls.ts";
import { viewControls } from "../ui/view-controls.ts";
import { keysToMove } from "./keys-input.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../../core/bodies/spec/quantity.ts";
import { ARENA_SIDES, sideHighlights } from "./side-highlights.ts";
import { fighterHud } from "./fighter-hud.ts";
import { choicePanel } from "../ui/choices.ts";
import type { ArenaSeat as Side } from "../../../game/arena/seat.ts";

/**
 * **The arena page**: the arena's scene with its solids in a world (`buildArena`), and a bout
 * of two bodies in it (`Duel`). Setup picks the two models and the side the person fights, if
 * any; a bout runs to its verdict, and can be run again, or again with the right side redrawn.
 *
 * The bout's world steps in a worker (`duelStage`, `src/app/worker/`): the page draws a puppet of each
 * body between the last two steps it holds, and shows what each step's news tells (`DuelNews`), so
 * it keeps its frame rate when the world cannot keep real time and the bout plays in slow motion.
 *
 * A person who takes a side leads it as a team of one (`teamOfOne`) under the party's Commander,
 * which picks no foe untold and gives the side its orders (`Duel.order`): the keys walk it, as the
 * camera sees the ground, it faces the pointer, the left button attacks where the pointer is, and a
 * click on the floor sends it there. The page turns the keys and the pointer into world directions
 * and a ray (`orders-input.ts`, `LeadInput`) before the worker's Commander reads them, so nothing of
 * the camera reaches a mind.
 *
 * Each side shows its choices (`MenuEntry`, `choicePanel`); the person picks one of their side's,
 * ordered as an attack with its skill, limb and region, or lets the mind fight its own way. With
 * pause on choice, the bout holds at the step where their side has a new one (`choiceWatch`), so a
 * bout plays turn by turn, its orders on its tape.
 *
 * The bout is heard until its verdict: each body's touches and its air
 * (`src/game/audio/body-sounds.ts`), and what a blow takes off (`debrisCues`). The verdict silences
 * it with the cues not played yet, so what decides the bout is not heard.
 *
 * Setup owns `#curtain`, pause owns `#pause-menu`, the verdict is `#bout-end`.
 */

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
/** The pause between one trial's end and the next one's start, with auto-play on, ms. */
const TRIAL_BEAT_MS = 1000;
/** Where the previous version's same trial plays, beside the trial: this far along +x, the stage's own axis, m. */
const BESIDE = 4;
/** How much of its side's colour the previous version's bodies are drawn in: its shapes, dimmed. */
const BESIDE_SHADE = .55;

/** The segment of `spec` no joint carries: the one the chase camera turns with. */
const rootOf = (spec: BodySpec): string => spec.segments.find((segment) => !spec.joints.some((joint) => joint.child === segment.name))!.name;

/** A ray as the worker reads it (`Ray`). */
const vec = ({ x, y, z }: { readonly x: number; readonly y: number; readonly z: number }): Vec3 => [x, y, z];

/** The bout under way: its world's worker, the recipe and specs it was built from, the side a person leads, and what its last step told. */
interface Bout {
  readonly link: WorldLink<DuelCard>;
  readonly recipe: DuelRecipe;
  readonly specs: Readonly<Record<Side, BodySpec>>;
  readonly person: Side | null;
  news: DuelNews | null;
}

export async function bootArena(context: ScreenContext): Promise<void> {
  const location = context.address, lifetime = context;
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const previewFailed = (error: Error) => { need("boot-note").textContent = `Preview unavailable: ${error.message}`; };
  const show = (id: string, shown: boolean) => need(id).classList.toggle("gone", !shown);
  // A reel opened from the Ratings plays its trials in this screen, one after another; the trial
  // shown puts its choices in the address, so the pickers show them when the reel is left.
  const reel = readReel(location.hash);
  if (reel && "fault" in reel) { need("boot-note").textContent = reel.fault; return; }
  const reading = reel ? await reelTrials(reel) : null;
  if (reading?.fault !== undefined) { need("boot-note").textContent = reading.fault; return; }
  const trials = reading?.trials ?? null;
  context.signal.throwIfAborted();
  let at = reel?.at ?? 0, auto = reel?.auto ?? false;
  const reelAt = () => reel ? reelHash({ ...reel, at, auto }) : "";
  if (trials) context.replace(caseSearch(trials[at]!.world.recipe) + reelAt());
  const canvas = need<HTMLCanvasElement>("stage");
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  context.own(() => { engine.stopRenderLoop(); engine.dispose(); });
  const level = readLevel(location.search);
  const arena = await buildArena(engine, level, context.signal);
  const { scene, camera, shadows } = arena;
  context.own(() => scene.dispose());
  context.signal.throwIfAborted();

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
      const model = select.value as BodyModel;
      const resolved = resolveCharacterChecked({ model, attributes: controlCharacter(control.value, attributes[side]) });
      return isRefused(resolved) ? modelHolding(model, loadout()) : withLoadout(resolved.spec, loadout());
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
      const drafted = attributePanel.read() !== null;
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
    // `fromLink`: the first listing, where the side's mind is the link's.
    let fromLink = true;
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
      // The menu lists the offered minds (`offered`), and the one the link chose if it is another,
      // offered or not: its panel says why the body cannot play it, and the bout is not played.
      const listed = choices.filter(value => offered(MINDS[value]!) || value === previous);
      if (fromLink && !listed.includes(previous) && Object.hasOwn(MINDS, previous)) listed.push(previous);
      fromLink = false;
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
    previewLoads.push(showHeroLineup(preview, [matchup[side]], lifetime.signal, [appearances[side]]).then(async view => {
      context.signal.throwIfAborted();
      previews[side] = view; select.disabled = false; appearancePicker.disabled = false;
      const drafted = attributePanel.read() !== null;
      if (drafted) await view.setCharacter(0, { model: select.value as BodyModel, attributes: controlCharacter(control.value, attributes[side]) }, appearances[side]).catch(previewFailed);
      select.addEventListener("change", () => {
        appearances = { ...appearances, [side]: "default" };
        attributePanel.set({ model: select.value as BodyModel, attributes: attributes[side] });
        refresh();
        select.blur();
        if (attributePanel.read() !== null) void view.setCharacter(0, { model: select.value as BodyModel, attributes: controlCharacter(control.value, attributes[side]) }).catch(previewFailed);
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
      const draft = attributeEditors[side].read();
      if (draft) writeAttributes(query, side, draft);
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
  let bout: Bout | null = null, drawn: (SkinView | BodyShapes)[] = [], puppets: Puppet[] = [], paused = false, verdictShown = false;
  const highlights = sideHighlights(scene);
  context.own(() => highlights.dispose());
  /** A body drawn: its puppet, where it is in a frame, its centre and life as last shown. */
  interface Drawn { readonly puppet: Puppet; readonly offset: number; readonly centre: Vector3; life: number }
  /** Each side's body of the bout, with its skin and shapes, and what the camera follows of it; and every body drawn, those beside too. */
  const bodies = new Map<Side, { readonly body: Drawn; readonly skin: SkinView; readonly shapes: BodyShapes; readonly head: TransformNode | null; readonly subject: ArenaSubjects[Side] }>();
  let shownBodies: Drawn[] = [], subjects: ArenaSubjects | null = null;
  /** A trial's overlays (`trialOverlay`), while the bout plays one, and those of the previous version's beside it. */
  let overlay: ReturnType<typeof trialOverlay> | null = null, besideOverlay: ReturnType<typeof trialOverlay> | null = null;
  /** Where the previous version's same trial is drawn, beside the trial's: `BESIDE` m along, made the first time a reel plays one. */
  let besideRoot: TransformNode | null = null;
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
    for (const drawing of drawn) { for (const mesh of drawing.meshes) shadows.removeShadowCaster(mesh); drawing.dispose(); }
    for (const puppet of puppets) puppet.dispose();
    drawn = []; puppets = []; bodies.clear(); shownBodies = []; subjects = null;
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
  /** Whether the bout holds where the person's side has a new choice, and whether it is held so now, for the person to pick. */
  let pauseOnChoice = false, choosing = false;
  /** Whether the bout's world runs in its worker now, and whether its scene is warm enough that it may. */
  let running = false, warm = false;
  /** The person's lead and each side's looks as last sent to the worker, to send only what changed. */
  let leadSent = "", looksSent: Record<Side, string> = { left: "", right: "" };
  /** Run the bout's world while it is shown: warm, not paused, not loading, and its tab visible. */
  const sync = () => {
    const run = bout !== null && warm && !paused && !context.busy && document.visibilityState === "visible";
    if (run !== running) { running = run; bout?.link.run(run); }
  };
  document.addEventListener("visibilitychange", sync, { signal: context.signal });
  const end = () => {
    choosing = false;
    for (const row of rows) row.choices.reset();
    for (const row of rows) row.condition.reset();
    hud.hidden = true;
    undraw(); bout?.link.dispose(); bout = null; verdictShown = false; running = false; warm = false;
    leadSent = ""; looksSent = { left: "", right: "" };
    overlay?.dispose(); overlay = null; besideOverlay?.dispose(); besideOverlay = null;
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
      (strike, among) => { if (!bout?.person) return; bout.link.input({ kind: "attack", strike, among }); setPaused(false); });
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
  choiceBox.addEventListener("change", () => { choiceBox.blur(); pauseOnChoice = choiceBox.checked; bout?.link.input({ kind: "hold", hold: pauseOnChoice }); });
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
    const decided = !!bout?.news?.verdict;
    paused = value && bout !== null && !decided;
    choosing = paused && why === "choice";
    show("pause-menu", paused && !choosing);
    choosingLine.hidden = !choosing;
    pauseButton.hidden = paused || !bout || decided;
    audio.setActive(!paused && bout !== null && !decided);
    sync();
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
      const drafted = attributeEditors[side].read() !== null;
      if (drafted) void previews[side].setCharacter(0, { model: matchup[side], attributes: controlCharacter(controlPickers[side].value, attributes[side]) }, appearances[side]).catch(previewFailed);
    }
  };
  /** Begins a bout of `next`: the reel's trial `given`, as recorded, or the one the pickers make. */
  const begin = async (next: Matchup, given: Trial | null = null) => {
    if (beginButton.disabled) return;
    if (!given) {
      for (const side of SIDES) {
        const draft = attributeEditors[side].read();
        if (!draft) return;
        attributes[side] = draft;
        const resolved = resolveCharacterChecked({ model: next[side], attributes: controlCharacter(controlPickers[side].value, attributes[side]) });
        if (isRefused(resolved)) { need("boot-note").textContent = resolved.refused; return; }
      }
      // A mind with a fault is not played, nor another in its place.
      const faults = SIDES.flatMap((side) => mindFaultsOf[side]().map((fault) => `${ARENA_SIDES[side].label}: ${fault}`));
      if (faults.length > 0) { need("boot-note").textContent = `The bout is not played: ${faults.join("; ")}`; return; }
    }
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
        const recipe = given?.world.recipe ?? recipeOf(location.search, attributes, level), previous = given?.previous ?? null;
        const dress = new Map(await Promise.all(SIDES.map(async (side) => [side, await dresser(matchup[side], appearances[side])] as const)));
        context.signal.throwIfAborted();
        end();
        trial = given;
        audio.reset();
        controllers = { left: controllerLabel(location.search, "left"), right: controllerLabel(location.search, "right") };
        // A trial plays as recorded; a person leads their side of a new bout.
        const person = given ? null : you;
        const link = await openWorld<DuelCard>({ kind: "duel", start: {
          recipe, tape: given?.world.tape ?? [], played: given?.played ?? null, ...given ? { engine: given.world.engine, ...given.world.timing === undefined ? {} : { timing: given.world.timing } } : {},
          person, hold: pauseOnChoice, traced: given !== null,
          beside: previous ? { recipe: previous.world.recipe, tape: previous.world.tape, played: previous.played, engine: previous.world.engine, ...previous.world.timing === undefined ? {} : { timing: previous.world.timing } } : null,
        } }, context.signal);
        const specs = { left: duelSpec(recipe, "left"), right: duelSpec(recipe, "right") };
        const besideSpecs = previous ? { left: duelSpec(previous.world.recipe, "left"), right: duelSpec(previous.world.recipe, "right") } : null;
        const current: Bout = bout = { link, recipe, specs, person, news: null };
        link.listen({
          news: (news) => {
            if (bout !== current || !news.duel) return;
            current.news = news.duel;
            for (const cue of news.duel.cues) audio.cue(cue);
            if (news.duel.trace) overlay?.add(news.duel.trace);
            if (news.duel.besideTrace) besideOverlay?.add(news.duel.besideTrace);
            if (news.held) setPaused(true, "choice");
          },
          fault: (message) => { if (bout === current) need("boot-note").textContent = `The bout stopped: ${message}`; },
        });
        if (previous) {
          besideRoot ??= new TransformNode("arena.beside", scene);
          besideRoot.position.set(BESIDE, 0, 0);
        }
        // Each body as its worker built it, drawn at the world as it stands before the first step.
        link.roster.forEach(({ id, segments, card: { side, beside } }, k) => {
          const puppet = puppetBody((beside ? besideSpecs! : specs)[side], scene);
          puppets.push(puppet);
          if (segments.join() !== [...puppet.segments.keys()].join()) throw new Error(`the page draws ${id} with other segments than its world built`);
          const body: Drawn = { puppet, offset: link.offsets[k]!, centre: new Vector3(), life: 1 };
          shownBodies.push(body);
          posePuppet(puppet, body.offset, { from: link.newest, to: link.newest, share: 1 });
          bodyBetween(body.offset, { from: link.newest, to: link.newest, share: 1 }, body.centre);
          if (beside) {
            // The previous version's bodies, beside: their nodes under the root, their shapes dimmed.
            for (const segment of puppet.segments.values()) segment.node.parent = besideRoot;
            drawn.push(drawBody(puppet, scene, Color3.FromHexString(ARENA_SIDES[side].colour).scale(BESIDE_SHADE)), drawHeld(puppet, scene));
            return;
          }
          const hands = handsOf(puppet.configurations.state);
          const skin = dress.get(side)!(puppet, { clothing: { boots: true, armour: true }, closure: hands.closure });
          const shapes = drawBody(puppet, scene, Color3.FromHexString(ARENA_SIDES[side].colour));
          const held = drawHeld(puppet, scene), root = puppet.segments.get(rootOf(puppet.spec))!.node;
          const rest = root.rotationQuaternion!.clone();
          highlights.add(side, [...skin.meshes, ...shapes.meshes, ...held.meshes]);
          bodies.set(side, { body, skin, shapes, head: puppet.segments.get("head")?.node ?? null, subject: {
            get position() { return body.centre; },
            get rotation() { return root.rotationQuaternion!; }, rest,
          } });
          for (const mesh of held.meshes) shadows.addShadowCaster(mesh);
          drawn.push(skin, shapes, held);
        });
        subjects = { left: bodies.get("left")!.subject, right: bodies.get("right")!.subject };
        if (given) overlay = trialOverlay(scene);
        if (previous) {
          besideOverlay = trialOverlay(scene, besideRoot);
          // The camera frames the trial's striker and the previous version's target: both bouts.
          const own = subjects.right, at = new Vector3();
          const target = shownBodies[link.roster.findIndex(({ card }) => card.beside && card.side === "right")]!;
          subjects = { left: subjects.left, right: { get position() { return at.copyFrom(target.centre).addInPlaceFromFloats(BESIDE, 0, 0); }, get rotation() { return own.rotation; }, rest: own.rest } };
        }
        rig.reset(); applyView();
        choiceLabel.hidden = person === null;
        for (const row of rows) {
          row.label.textContent = `${ARENA_SIDES[row.side].label} · ${MODEL_DISPLAY[matchup[row.side]].label}${row.side === person ? " (you)" : ""}`;
          const config = recipe.minds?.[row.side] ?? defaultMind(recipe[row.side]);
          row.condition.bind(specs[row.side]);
          row.inspector = mindInspector(config, specs[row.side], () => bout === current ? current.news?.sides[row.side].inspected ?? null : null);
          row.mind.replaceChildren(row.mind.firstElementChild!, row.inspector.element);
        }
        if (given) trialText.textContent = `Trial ${at + 1} of ${trials!.length}: ${given.condition}${given.outcome === null ? "" : `; recorded ${given.outcome}${given.why ? ` (${given.why})` : ""}`}`
          + (!reel?.previous ? "" : given.previous ? `; beside, version ${given.previous.version.slice(0, 8)}${given.previous.outcome === null ? "" : `: ${given.previous.outcome}${given.previous.why ? ` (${given.previous.why})` : ""}`}`
            : `; no record holds version ${reel.previous.slice(0, 8)}'s same trial`);
        reelLine.hidden = !given; nextButton.hidden = !given || at + 1 >= trials!.length;
        for (const id of ["random-replay", "bout-end-random"]) need(id).hidden = given !== null;
        hud.hidden = false;
        show("curtain", false); show("bout-end", false); setPaused(false); screen = "fight"; viewPanel.hidden = false;
        frame(); readout();
        await stage("Preparing lighting");
        await warmScene(scene, context.signal);
        firstFrame = true;
        warm = true;
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
    if (!bout || walkKey(event, true)) return;
    if (event.key === " " || event.key === "Escape") { event.preventDefault(); if (!bout.news?.verdict) setPaused(!paused); }
    else if (event.key === "r" || event.key === "R") replay();
  }, { signal: context.signal });
  window.addEventListener("keyup", (event) => { if (event.key === "Shift") walking = false; walkKey(event, false); }, { signal: context.signal });
  // Losing focus pauses the bout, and lets go of every key and button: their releases are not heard.
  window.addEventListener("blur", () => {
    keys.up = keys.down = keys.left = keys.right = false;
    walking = false;
    attacking = false;
    if (bout && !bout.news?.verdict) setPaused(true);
  }, { signal: context.signal });
  // The left button is a level, read from every pointer event, since a release is not guaranteed.
  for (const type of ["pointerdown", "pointermove", "pointerup"] as const) {
    canvas.addEventListener(type, (event) => {
      pointer = { x: event.offsetX, y: event.offsetY };
      attacking = (event.buttons & 1) !== 0;
    });
  }
  canvas.addEventListener("pointerleave", () => { pointer = null; attacking = false; press = null; });
  // A left click that moves less than `CLICK_PIXELS` before its release sends the person's side to
  // the floor under it, where its ray meets no body part first (`DuelInput` "go").
  const CLICK_PIXELS = 6;
  let press: { x: number; y: number } | null = null;
  /** The person's ray from the camera through (`x`, `y`) on the canvas. */
  const rayAt = (x: number, y: number): Ray => {
    const ray = scene.createPickingRay(x, y, null, camera);
    return { origin: vec(ray.origin), direction: vec(ray.direction), length: camera.maxZ };
  };
  canvas.addEventListener("pointerdown", (event) => {
    press = event.button === 0 && bout?.person ? { x: event.offsetX, y: event.offsetY } : null;
  });
  canvas.addEventListener("pointerup", (event) => {
    const pressed = press; press = null;
    if (event.button !== 0 || !pressed || !bout?.person || paused || Math.abs(event.offsetX - pressed.x) + Math.abs(event.offsetY - pressed.y) >= CLICK_PIXELS) return;
    bout.link.input({ kind: "go", ray: rayAt(event.offsetX, event.offsetY) });
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
   * direction on the ground, Shift a walk, the pointer's ray, which the worker turns into a point to
   * face on the level of the side's centre of mass, and the left button held, which strikes the body
   * part under the pointer. Sent when it changes.
   */
  const steer = () => {
    if (!bout?.person) return;
    const lead: LeadInput = { keys: keysToMove(keys, rig.azimuth), walk: walking, ray: pointer ? rayAt(pointer.x, pointer.y) : null, attacking };
    const sent = JSON.stringify(lead);
    if (sent !== leadSent) { leadSent = sent; bout.link.input({ kind: "lead", lead }); }
  };
  const airAt = new Vector3();
  const frame = () => {
    rig.frame(screen, subjects, engine.getDeltaTime() / 1000, engine.getAspectRatio(camera));
    audio.setView(camera.position, { x: Math.sin(rig.azimuth), z: Math.cos(rig.azimuth) });
    if (profile.view === "world") arena.updateRoomOcclusion(screen === "fight" && bout ? SIDES.map(side => {
      const drawn = bodies.get(side)!;
      return { point: drawn.head?.position ?? drawn.body.centre };
    }) : []);
  };
  /** The world's time last shown, s. */
  let shownTime = 0;
  /** Pose every body between `at`'s frames. */
  const pose = (at: Between) => {
    for (const body of shownBodies) {
      posePuppet(body.puppet, body.offset, at);
      body.life = bodyBetween(body.offset, at, body.centre).life;
    }
    shownTime = at.from[0]! + (at.to[0]! - at.from[0]!) * at.share;
  };
  const readout = () => {
    const news = bout?.news;
    if (!bout || !news) return;
    const time = news.start + (news.verdict?.time ?? news.clock);
    for (const row of rows) {
      const side = news.sides[row.side], controller = controllers[row.side];
      row.bar.value = bodies.get(row.side)?.body.life ?? 1;
      row.condition.render(side.hud, time);
      row.status.textContent = news.verdict
        ? news.verdict.winner === null ? "Draw" : news.verdict.winner === row.side ? "Winner" : "Defeated"
        : side.down
        ? `${side.has}${side.downFor !== null && bout.recipe.recoverySeconds ? ` - ${Math.max(0, bout.recipe.recoverySeconds - side.downFor).toFixed(1)} s recovery left` : " - getting up"}`
        : `${controller} - ${side.phase}`;
      if (row.mind.open) row.inspector?.refresh();
      const leads = bout.person === row.side && !news.verdict;
      // What the worker sends of the side: its choices while their list is open or opens, its mind while inspected.
      const look = { menu: row.choices.element.open || leads && choosing, mind: row.mind.open }, looked = JSON.stringify(look);
      if (looked !== looksSent[row.side]) { looksSent[row.side] = looked; bout.link.input({ kind: "look", side: row.side, ...look }); }
      row.choices.refresh(() => side.menu ?? null, { picks: leads, opens: leads && choosing });
    }
    // While either side is helped, each side's balance, per cent of its weight: the link's, or its character's.
    const helped = SIDES.some((side) => news.sides[side].assisted);
    const balance = SIDES.map((side) => bout!.recipe.balance?.[side] ?? bout!.specs[side].attributes.balance.value);
    // While either side is hasted, each side's haste, per cent over a person's, signed.
    const haste = SIDES.map((side) => bout!.specs[side].attributes.haste.value), hasted = haste.some((h) => h !== HUMAN_HASTE.value);
    clock.textContent = `${(news.verdict?.time ?? news.clock).toFixed(1)} s${helped ? ` · balance ${balance.join(" / ")} %` : ""}${hasted ? ` · haste ${haste.map(hasteText).join(" / ")} %` : ""}${trial ? " · replay" : ""}`;
    // A trial ends where it was scored: its verdict, if any, and its outcome as recorded.
    if (trial && news.done && !trialShown) {
      trialShown = true;
      const last = at + 1 >= trials!.length, { verdict } = news;
      need("bout-end").style.setProperty("--side-colour", verdict?.winner ? ARENA_SIDES[verdict.winner].colour : "var(--hot)");
      need("bout-verdict").textContent = `Trial ${at + 1} of ${trials!.length}${trial.outcome === null ? "" : `: ${trial.outcome}`}${last ? " · the reel is played" : ""}`;
      const decided = verdict ? `${verdict.winner ? `${MODEL_DISPLAY[matchup[verdict.winner]].label} ` : ""}${endingText(verdict.ending)} · ` : "";
      need("bout-ending").textContent = `${trial.condition} · ${decided}${news.clock.toFixed(1)} s${trial.why ? ` · ${trial.why}` : ""}`
        + (trial.previous ? ` · beside, version ${trial.previous.version.slice(0, 8)}: ${trial.previous.outcome ?? ""}${trial.previous.why ? `, ${trial.previous.why}` : ""}` : "");
      show("bout-end", true); audio.setActive(false); pauseButton.hidden = true;
      if (auto && !last) nextTimer = setTimeout(() => playTrial(at + 1), TRIAL_BEAT_MS);
    }
    if (!trial && news.verdict && !verdictShown) {
      pauseButton.hidden = true;
      verdictShown = true;
      const { winner, ending, time } = news.verdict;
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
    sync();
    if (context.busy) { firstFrame = true; meter.reset(); return; }
    if (firstFrame) meter.reset();
    const shownBefore = shownTime;
    const timing = meter.frame(() => {
      const seconds = firstFrame ? 0 : engine.getDeltaTime() / 1000; firstFrame = false;
      if (!context.busy) steer();
      if (bout) {
        meter.world(bout.link.received(), bout.link.newest[2]!);
        pose(bout.link.between(performance.now()));
        if (!paused && bout.news) for (const { side, speed, at } of bout.news.air) audio.swish(side, speed, airAt.set(at[0], at[1], at[2]));
      }
      if (!paused && !context.busy && profile.view === "world") arena.fire.burn(seconds);
      frame(); readout(); audio.update(); overlay?.update(); besideOverlay?.update();
      scene.render();
    });
    measurement?.record({ ...timing, simulated: shownTime - shownBefore, time: shownTime, hz: bout?.link.hz ?? 0,
      active: !!bout && !paused && !bout.news?.verdict });
  });
  window.addEventListener("resize", () => engine.resize(), { signal: context.signal });
  context.own(() => measurement?.dispose());
  /**
   * From a console: the bout's world (`WorldLink`, its tape by `world.tape()`), its verdict, its
   * bodies' puppets, and `step(n)`, which takes `n` steps in the worker, then draws the newest, as
   * a hidden tab needs.
   */
  const step = async (steps = 1) => {
    if (!bout) return;
    await bout.link.step(steps);
    const newest = bout.link.newest;
    pose({ from: newest, to: newest, share: 1 });
    frame(); readout();
    scene.render();
  };
  Object.assign(window, { __arena: { get world() { return bout?.link ?? null; }, get verdict() { return bout?.news?.verdict ?? null; },
    get puppets() { return shownBodies.map((body) => body.puppet); }, step, scene, engine } });

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
