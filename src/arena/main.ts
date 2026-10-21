import { warmScene } from "../render/ready.ts";
import { arenaMeasurement } from "./measure.ts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
// `scene.createPickingRay` is this module's patch: without it the build compiles and the ray is missing.
import "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { appearanceFor, appearancesFor, type Appearance } from "../render/appearance.ts";
import { showHeroLineup } from "../render/character-preview.ts";
import { arenaSolids } from "./room.ts";
import { buildArena } from "./scene.ts";
import { LEVELS, type ArenaLevel } from "./levels.ts";
import { MENU_HREF } from "../app-route.ts";
import type { ScreenContext } from "../ui/screen.ts";
import { need as find } from "../dom.ts";
import { airOf, hearTouches } from "../audio/body-sounds.ts";
import { debrisCues } from "../audio/cues.ts";
import { GameAudio } from "../audio/game-audio.ts";
import { loadEngine } from "../core/engine/engines.ts";
import { BODY_MODELS, modelHolding, modelHolds, resolveCharacter, type BodyModel } from "../core/models.ts";
import { attributeEditor } from "../ui/attribute-editor.ts";
import { writeAttributes } from "../ui/attribute-link.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";
import { EMPTY_LOADOUT, HELD, heldItem, type Loadout } from "../core/items/held.ts";
import { HUMAN_HASTE, hasteText } from "../core/human/attributes.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { createWorld, type Hook, type World } from "../core/world.ts";
import type { SkinView } from "../render/skin-view.ts";
import { loadSkeletonArt, type SkeletonArt } from "../render/skeleton-skin.ts";
import { drawBody, drawHeld, type BodyShapes } from "../render/body-shapes.ts";
import { dresserFor, type Dresser } from "../render/dress.ts";
import { fighterHands } from "../render/strike-hands.ts";
import { boutStart, Duel, SIDES, type DuelEnding, type Verdict } from "./duel.ts";
import { MATCHUP_PARAM, arenaAttributes, appearanceSearch, readAppearances, matchupSearch, readCap, readGap, readLevel, CONTROLS, controllerLabel, controlName, controlsFor, defaultControl, readControls, readMinds, readRecovery, readLoadouts, readMatchup, readTape, readYou, linkedMind, mindsSearch, youSearch, type Matchup } from "./matchup.ts";
import { MINDS } from "../core/mind/controllers.ts";
import { partOf, treeData } from "../core/mind/catalog.ts";
import { loadData } from "../core/data/store.ts";
import { mindEditor } from "../ui/mind-editor.ts";
import { notesOf, RATINGS, type NoteLevel } from "../ui/mind-notes.ts";
import { mindInspector } from "../ui/mind-inspector.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { arenaCameraRig, type ArenaSubjects } from "./camera.ts";
import { arenaViewSearch, cameraFocuses, normalizeArenaView, readArenaView, type ArenaFocus, type ArenaView } from "./view.ts";
import { choice, following, type Control } from "../ui/controls.ts";
import { viewControls } from "../ui/view-controls.ts";
import { aimPoint, keysToMove, personOrders, rayTarget } from "./orders-input.ts";
import type { Side } from "../core/spec/body.ts";
import { physicalReading } from "../core/observation.ts";
import { arenaPlayback } from "./playback.ts";
import { ARENA_SIDES, sideHighlights } from "./side-highlights.ts";
import { fighterHud } from "./fighter-hud.ts";

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

/** What a hand may hold, by name, as the pickers and the ratings show it. */
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

/** **The last tournament's table** (`RATINGS`), its best first, into the ratings panel. */
function showRatings(root: ParentNode): void {
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, root);
  const { entrants, unseen, date, commit, harness, unavailable } = RATINGS;
  need("ratings-about").textContent = unavailable ? `Ratings unavailable: ${unavailable}.` : entrants.length === 0 ? "No tournament has been played yet (scripts/tournament.mjs)."
    : `Each mind on each character with each loadout against every other, both sides, Bradley-Terry on the Elo scale (the field's mean 1500), with its 95 % interval. ${date} at ${commit?.slice(0, 8)}; ${harness}.`;
  const cell = (tag: "td" | "th", text: string) => Object.assign(document.createElement(tag), { textContent: text });
  const head = document.createElement("tr");
  head.append(...["", "Mind", "Character", "Hands", "Rating", "95 %", "Won", "Drawn", "Lost"].map(text => cell("th", text)));
  const rows = [...entrants].sort((a, b) => b.rating - a.rating).map((entrant, rank) => {
    const row = document.createElement("tr");
    row.append(...[`${rank + 1}`, MINDS[entrant.mind]?.label ?? entrant.mind, MODEL_DISPLAY[entrant.model].label, loadoutName(entrant.loadout),
      entrant.rating.toFixed(0), `${entrant.interval[0].toFixed(0)}-${entrant.interval[1].toFixed(0)}`, `${entrant.wins}`, `${entrant.draws}`, `${entrant.losses}`]
      .map(text => cell("td", text)));
    return row;
  });
  need("ratings-table").replaceChildren(head, ...rows);
  need("unseen-about").textContent = unseen.length === 0 ? "" : `Unseen loadouts, rated on none: each mind against ${MINDS[unseen[0]!.against]?.label ?? unseen[0]!.against} with sword and buckler, both sides.`;
  const unseenHead = document.createElement("tr");
  unseenHead.append(...["Mind", "Character", "Hands", "Won", "Drawn", "Lost"].map(text => cell("th", text)));
  need("unseen-table").replaceChildren(...unseen.length === 0 ? [] : [unseenHead, ...unseen.map((entrant) => {
    const row = document.createElement("tr");
    row.append(...[MINDS[entrant.mind]?.label ?? entrant.mind, MODEL_DISPLAY[entrant.model].label, loadoutName(entrant.loadout), `${entrant.wins}`, `${entrant.draws}`, `${entrant.losses}`].map(text => cell("td", text)));
    return row;
  })]);
}

export async function bootArena(context: ScreenContext): Promise<void> {
  const location = context.address, lifetime = context;
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const show = (id: string, shown: boolean) => need(id).classList.toggle("gone", !shown);
  const canvas = need<HTMLCanvasElement>("stage");
  const engine = new Engine(canvas, true, { stencil: true, antialias: true });
  context.own(() => { engine.stopRenderLoop(); engine.dispose(); });
  const physicsEngine = await loadEngine();
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
  // A link's tape is of the link's matchup: a bout of another matchup begun from the page plays none.
  const linked = { matchup, tape: readTape(location.hash), hash: location.hash };
  /** Whether the bout under way plays a tape: it then takes no orders from a person. */
  let replaying = false;
  const youPicker = need<HTMLSelectElement>("you");
  youPicker.value = you ?? "";
  const controlPickers = {} as Record<Side, HTMLSelectElement>, loadoutPickers = {} as Record<Side, Record<Side, HTMLSelectElement>>;
  // Each side's mind as its panel shows it (`mindEditor`).
  const mindOf = {} as Record<Side, () => MindConfig>;
  const controls = readControls(location.search), loadoutChoices = readLoadouts(location.search);
  const linkedControl = JSON.stringify(readMinds(location.search)), linkedRecovery = readRecovery(location.search);
  const linkedLoadouts = JSON.stringify(loadoutChoices ?? { left: EMPTY_LOADOUT, right: EMPTY_LOADOUT });
  const pickers = {} as Record<Side, HTMLSelectElement>;
  const refreshChoices = {} as Record<Side, () => void>;
  const previews = {} as Record<Side, Awaited<ReturnType<typeof showHeroLineup>>>;
  const attributeEditors = {} as Record<Side, ReturnType<typeof attributeEditor>>;
  const attributes = { ...arenaAttributes(location.search) };
  const attributeKey = (models: Matchup, values: Readonly<Record<Side, AttributeOverrides>>) => JSON.stringify(SIDES.map(side => resolveCharacter({ model: models[side], attributes: values[side] }).config));
  let linkedAttributes = "";
  try { linkedAttributes = attributeKey(matchup, attributes); } catch { /* The editor reports invalid linked values. */ }
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
          void previews[side]?.setCharacter(0, { model: select.value as BodyModel, attributes: draft }, appearances[side]);
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
      picker.value = loadoutChoices?.[side][hand] ?? EMPTY_LOADOUT[hand];
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
    const nameControl = () => {
      const model = select.value as BodyModel, holds = loadout();
      for (const option of control.options) {
        const note = notesOf(option.value, model, holds)[0]?.note;
        option.textContent = `${option.value === control.value ? controlName(option.value, editor.config) : CONTROLS[option.value]!}${note ? ` · ${note}` : ""}`;
      }
      const all = notesOf(control.value, model, holds);
      notes.replaceChildren(...all.map(({ level, note }) => Object.assign(document.createElement("span"), { textContent: `${levelName(level, model, holds)}: ${note}` })));
      notes.hidden = all.length === 0;
    };
    const editorSpec = () => {
      try { return modelHolding(select.value as BodyModel, loadout(), attributes[side]); }
      catch { return modelHolding(select.value as BodyModel, loadout()); }
    };
    const editor = mindEditor(linkedMind(location.search, side).config, { spec: editorSpec(), onFault: "the preset is used", onChange: () => nameControl() });
    settings.append(summary, editor.element); choices.append(notes, settings);
    const showSettings = (config: MindConfig) => {
      editor.set(config, editorSpec());
      settings.hidden = partOf(config).fields.length === 0 && partOf(config).slots.length === 0;
      nameControl();
    };
    showSettings(editor.config);
    mindOf[side] = () => editor.config;
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
      control.replaceChildren(...choices.map(value => Object.assign(document.createElement("option"), { value, textContent: CONTROLS[value] })));
      const fallback = defaultControl(model, holds);
      const preferred = choices.includes(fallback) ? fallback : choices[0]!;
      control.value = choices.includes(previous) ? previous : preferred;
      showSettings(control.value !== previous ? MINDS[control.value]!.config : editor.config);
    };
    for (const hand of SIDES) hands[hand].addEventListener("change", () => { hands[hand].blur(); refresh(); });
    refresh();
    need("matchup").append(panel);
    pickers[side] = select;
    previewLoads.push(showHeroLineup(preview, physicsEngine, [matchup[side]], lifetime.signal, [appearances[side]]).then(async view => {
      context.signal.throwIfAborted();
      previews[side] = view; select.disabled = false; appearancePicker.disabled = false;
      try { attributePanel.read(); await view.setCharacter(0, { model: select.value as BodyModel, attributes: attributes[side] }, appearances[side]); } catch { /* The editor displays its draft's error. */ }
      select.addEventListener("change", () => {
        appearances = { ...appearances, [side]: "default" };
        attributePanel.set({ model: select.value as BodyModel, attributes: attributes[side] });
        refresh();
        select.blur();
        void view.setCharacter(0, { model: select.value as BodyModel, attributes: attributes[side] }).catch(error => {
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
  for (const seconds of new Set([0, 20, 30, 60, linkedRecovery ?? 60])) recoveryPicker.append(Object.assign(document.createElement("option"),
    { value: String(seconds), textContent: seconds === 0 ? "Fall ends bout" : `${seconds} seconds down before defeat` }));
  recoveryPicker.value = linkedRecovery == null ? "continue" : String(linkedRecovery); recoveryPicker.addEventListener("change", () => recoveryPicker.blur());
  recoveryField.append(recoveryPicker); need("matchup").after(recoveryField);

  const levelField = document.createElement("label"), levelPicker = document.createElement("select");
  levelField.className = "field"; levelField.textContent = "Level"; levelPicker.setAttribute("aria-label", "Arena level");
  for (const [value, definition] of Object.entries(LEVELS)) levelPicker.append(Object.assign(document.createElement("option"), { value, textContent: definition.label }));
  levelPicker.value = level;
  levelPicker.addEventListener("change", () => {
    const query = new URLSearchParams(location.search), next = levelPicker.value as ArenaLevel;
    query.set("level", next);
    const gap = readGap(location.search), policy = LEVELS[next].gap;
    if (gap !== undefined && (gap < policy.min || gap > policy.max)) query.delete("gap");
    const draft = new URL(setupAddress());
    draft.searchParams.set("level", next);
    if (!query.has("gap")) draft.searchParams.delete("gap");
    context.navigate(draft.href, { setup: true });
  });
  levelField.append(levelPicker); recoveryField.before(levelField);

  function setupAddress(): string {
    const models = { left: pickers.left.value as BodyModel, right: pickers.right.value as BodyModel };
    const query = new URLSearchParams(location.search);
    query.delete("balance"); query.delete("haste"); query.delete("held");
    query.set("control", SIDES.map(side => controlPickers[side].value).join(","));
    query.set("level", levelPicker.value); query.set("recovery", recoveryPicker.value);
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
  const applyView = () => {
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
  const end = () => {
    hudHook?.dispose(); hudHook = null;
    for (const row of rows) row.condition.reset();
    hud.hidden = true;
    playback?.dispose(); playback = null; undraw(); hearing?.dispose(); hearing = null; airs = []; duel?.dispose(); duel = null; shown = null;
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
    column.append(label, bar, condition.element, status, mind); hud.append(column);
    return { side, label, bar, status, mind, condition, inspector: null as ReturnType<typeof mindInspector> | null };
  });
  const clockColumn = document.createElement("div"), clock = document.createElement("span"), pauseButton = document.createElement("button");
  clockColumn.className = "hud-col hud-clock";
  pauseButton.id = "arena-pause"; pauseButton.type = "button"; pauseButton.className = "action quiet";
  pauseButton.textContent = "Pause"; pauseButton.title = "Pause (Space / Esc)"; pauseButton.hidden = true;
  pauseButton.setAttribute("aria-controls", "pause-menu");
  clockColumn.append(clock, pauseButton, viewPanel); hud.insertBefore(clockColumn, rows[1].label.parentElement);

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
      attributeEditors[side].set({ model: matchup[side], attributes: attributes[side] });
      try { attributeEditors[side].read(); void previews[side].setCharacter(0, { model: matchup[side], attributes: attributes[side] }, appearances[side]); } catch { /* Invalid drafts stay in the editor. */ }
    }
  };
  const begin = async (next: Matchup) => {
    if (beginButton.disabled) return;
    try {
      for (const side of SIDES) {
        attributes[side] = attributeEditors[side].read();
        resolveCharacter({ model: next[side], attributes: attributes[side] });
      }
    } catch (error) { need("boot-note").textContent = error instanceof Error ? error.message : String(error); return; }
    beginButton.disabled = true;
    try {
      await context.loading("Preparing fighters", async stage => {
        appearances = { left: appearanceFor(next.left, appearances.left), right: appearanceFor(next.right, appearances.right) };
        matchup = next;
        const query = new URLSearchParams(location.search);
        query.delete("balance"); query.delete("haste");
        for (const side of SIDES) writeAttributes(query, side, attributes[side]);
        query.set(MATCHUP_PARAM, `${matchup.left},${matchup.right}`);
        query.set("control", SIDES.map((side) => controlPickers[side].value).join(","));
        query.delete("held");
        for (const side of SIDES) query.set(`${side}.loadout`, SIDES.map((hand) => loadoutPickers[side][hand].value).join(","));
        query.set("recovery", recoveryPicker.value);
        let search = mindsSearch(`?${query}`, { left: mindOf.left(), right: mindOf.right() });
        const sameControllers = linkedControl === JSON.stringify(readMinds(search));
        const sameRecovery = (linkedRecovery ?? null) === (readRecovery(search) ?? null);
        const sameLoadouts = linkedLoadouts === JSON.stringify(readLoadouts(search));
        const tape = matchup.left === linked.matchup.left && matchup.right === linked.matchup.right && sameControllers && sameRecovery && sameLoadouts && linkedAttributes === attributeKey(matchup, attributes) ? linked.tape : null;
        replaying = tape !== null;
        if (replaying) {
          const snapshot = new URLSearchParams(search);
          for (const side of SIDES) writeAttributes(snapshot, side, resolveCharacter({ model: matchup[side], attributes: attributes[side] }).config.attributes);
          search = `?${snapshot}`;
        }
        context.replace(arenaViewSearch(youSearch(appearanceSearch(matchupSearch(search, matchup), matchup, appearances), you), view) + (replaying ? linked.hash : ""));
        const minds = readMinds(location.search);
        const [dress] = await Promise.all([
          Promise.all(SIDES.map(async (side) => [side, await dresser(matchup[side], appearances[side])] as const)).then((dressed) => new Map(dressed)),
          loadData(SIDES.flatMap((side) => treeData(minds[side]))),
        ]);
        context.signal.throwIfAborted();
        end();
        toStart();
        audio.reset();
        const gap = readGap(location.search), capSeconds = readCap(location.search), loadouts = readLoadouts(location.search), recoverySeconds = readRecovery(location.search) ?? null;
        controllers = { left: controllerLabel(location.search, "left"), right: controllerLabel(location.search, "right") };
        const bout = duel = new Duel(world, {
          left: matchup.left, right: matchup.right, recoverySeconds, attributes, level,
          ...(gap !== undefined ? { gap } : {}), ...(capSeconds !== undefined ? { capSeconds } : {}), ...(loadouts ? { loadouts } : {}), ...(minds ? { minds } : {}),
        }, {
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
        playback = arenaPlayback(bout, CATCH_UP_SECONDS);
        subjects = { left: bodies.get("left")!.subject, right: bodies.get("right")!.subject };
        rig.reset(); applyView();
        const sides = SIDES.map((side) => ({ id: side, built: bout.duelists[side].built }));
        hearing = hearTouches(world, sides, (cue) => audio.cue(cue));
        airs = sides.map(({ id, built }) => ({ side: id, air: airOf(built) }));
        if (tape) bout.playRecording(tape);
        for (const row of rows) {
          row.label.textContent = `${ARENA_SIDES[row.side].label} · ${MODEL_DISPLAY[matchup[row.side]].label}${row.side === you && !replaying ? " (you)" : ""}`;
          const duelist = bout.duelists[row.side], minded = duelist.minded;
          row.condition.bind(duelist);
          row.condition.sample(world.time); row.condition.render(world.time);
          row.inspector = mindInspector(duelist.mind, duelist.built.spec, () => duel === bout
            ? { body: duelist.body, skills: minded.skills ?? null } : null);
          row.mind.replaceChildren(row.mind.firstElementChild!, row.inspector.element);
        }
        let feedStopped = false;
        hudHook = world.afterStep(() => {
          const time = bout.state.start + (bout.verdict?.time ?? bout.clock);
          for (const row of rows) row.condition.sample(time, !feedStopped);
          if (bout.verdict) feedStopped = true;
        });
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
  for (const id of ["restart", "bout-end-replay"]) need(id).addEventListener("click", () => void begin(matchup));
  for (const id of ["random-replay", "bout-end-random"]) need(id).addEventListener("click", () => void begin(redrawn()));
  for (const id of ["leave", "bout-end-leave"]) need(id).addEventListener("click", setup);
  need<HTMLButtonElement>("to-menu").addEventListener("click", () => context.navigate(MENU_HREF));
  const help = (open: boolean) => show("help", open);
  need("help-open").addEventListener("click", () => help(true));
  need("help-close").addEventListener("click", () => help(false));
  showRatings(context.root);
  need("ratings-open").addEventListener("click", () => show("ratings", true));
  need("ratings-close").addEventListener("click", () => show("ratings", false));
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
    else if (event.key === "r" || event.key === "R") void begin(matchup);
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
    const target = attacking && ray ? rayTarget(duel.duelists[you].senses(), ray.origin.asArray(), ray.direction.asArray(), camera.maxZ) : null;
    duel.order(you, personOrders(keysToMove(keys, rig.azimuth), point, target, centre, walking));
  };
  const airAt = new Vector3();
  const frame = () => {
    rig.frame(screen, subjects, engine.getDeltaTime() / 1000, engine.getAspectRatio(camera));
    audio.setView(camera.position, { x: Math.sin(rig.azimuth), z: Math.cos(rig.azimuth) });
    arena.updateRoomOcclusion(screen === "fight" && duel ? SIDES.map(side => ({ point: bodies.get(side)!.read().head })) : []);
  };
  const readout = () => {
    if (!duel) return;
    for (const row of rows) {
      const fighter = duel.duelists[row.side];
      row.bar.value = fighter.pool.bar();
      row.condition.render(duel.state.start + (duel.verdict?.time ?? duel.clock));
      const mind = fighter.minded, controller = controllers[row.side];
      const phase = mind.skills ? mind.skills.report.actions[0]?.stage ?? mind.skills.report.engagement?.phase ?? "guard / move" : mind.body.has;
      const down = duel.state.recovery?.[row.side];
      row.status.textContent = duel.verdict
        ? duel.verdict.winner === null ? "Draw" : duel.verdict.winner === row.side ? "Winner" : "Defeated"
        : fighter.body.down
        ? `${fighter.body.has}${duel.recipe.recoverySeconds === null ? " - getting up" : down !== undefined ? ` - ${Math.max(0, duel.recipe.recoverySeconds! - down).toFixed(1)} s recovery left` : " - down"}`
        : `${controller} - ${phase}`;
      if (row.mind.open) row.inspector?.refresh();
    }
    // While either side is helped, each side's balance, per cent of its weight: the link's, or its character's.
    const helped = SIDES.some((side) => duel!.duelists[side].body.assist.on);
    const balance = SIDES.map((side) => duel!.recipe.balance?.[side] ?? duel!.duelists[side].built.spec.attributes.balance.value);
    // While either side is hasted, each side's haste, per cent over a person's, signed.
    const haste = SIDES.map((side) => duel!.duelists[side].built.spec.attributes.haste.value), hasted = haste.some((h) => h !== HUMAN_HASTE.value);
    clock.textContent = `${(duel.verdict?.time ?? duel.clock).toFixed(1)} s${helped ? ` · balance ${balance.join(" / ")} %` : ""}${hasted ? ` · haste ${haste.map(hasteText).join(" / ")} %` : ""}${replaying ? " · replay" : ""}`;
    if (duel.verdict && shown !== duel.verdict) {
      pauseButton.hidden = true;
      shown = duel.verdict;
      const { winner, ending, time } = shown;
      const how = ENDING_TEXT[ending];
      need("bout-end").style.setProperty("--side-colour", winner ? ARENA_SIDES[winner].colour : "var(--hot)");
      need("bout-verdict").textContent = winner ? `${ARENA_SIDES[winner].label} wins${winner === you && !replaying ? " (you)" : ""}` : "Draw";
      need("bout-ending").textContent = `${winner ? `${MODEL_DISPLAY[matchup[winner]].label} ` : ""}${how} · ${time.toFixed(1)} s`;
      show("bout-end", true); audio.setActive(false);
    }
  };

  const measurement = new URLSearchParams(location.search).get("measure") === "1" ? arenaMeasurement(document.body) : null;
  let firstFrame = true;
  engine.runRenderLoop(() => {
    if (context.busy) { firstFrame = true; return; }
    const began = measurement ? performance.now() : 0, clockBefore = world.time;
    let physicsMs = 0;
    const seconds = firstFrame ? 0 : engine.getDeltaTime() / 1000; firstFrame = false;
    if (!context.busy) giveOrders();
    if (duel && !paused && !context.busy) {
      const beforePhysics = measurement ? performance.now() : 0;
      playback?.advance(seconds);
      if (measurement) physicsMs = performance.now() - beforePhysics;
      for (const { side, air } of airs) audio.swish(side, air(airAt), airAt);
    }
    if (!paused && !context.busy) arena.fire.burn(seconds);
    frame(); readout(); audio.update();
    scene.render();
    measurement?.record({ frame: performance.now() - began, interval: seconds * 1000, physics: physicsMs,
      simulated: world.time - clockBefore, time: world.time, hz: world.hz, active: !!duel && !paused && !duel.verdict });
  });
  window.addEventListener("resize", () => engine.resize(), { signal: context.signal });
  context.own(() => measurement?.dispose());
  Object.assign(window, { __arena: { get duel() { return duel; }, world, scene, engine } });

  await Promise.all(previewLoads);
  context.signal.throwIfAborted();
  frame();
  await warmScene(scene, context.signal);
  need("boot-note").textContent = "";
  beginButton.disabled = false;
  // A link that names its matchup opens the bout directly.
  if (context.autostart && new URLSearchParams(location.search).has(MATCHUP_PARAM)) await begin(matchup);
  context.own(() => {
    if ((window as unknown as { __arena?: { engine: Engine } }).__arena?.engine === engine) Reflect.deleteProperty(window, "__arena");
  });
}
