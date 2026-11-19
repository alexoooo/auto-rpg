import { modelLabel, type BodyModel } from "../../../core/bodies/models.ts";
import { runAttributes } from "./run-attributes.ts";
import { runLoadouts } from "./run-loadouts.ts";
import { runMinds } from "./run-minds.ts";
import { ENCOUNTER_MODELS } from "../../../game/dungeon/encounters.ts";
import { COMMANDERS } from "../../registration/commanders.ts";
import type { CommanderEntry } from "../../../minds/command/kind.ts";
import { need as find } from "../dom.ts";
import { publicAssetUrl } from "../asset-url.ts";
import type { ScreenContext } from "../ui/screen.ts";
import { isSeed } from "../../../core/math/random.ts";
import { MOST_COMPANIONS } from "../../../game/dungeon/run.ts";

export type DungeonScenario = "generated" | "reference" | "random-crypt";

/** A seed drawn at random. */
export const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0];
/** Whether `text`, as a person types a seed or a link carries it, is one: ten digits at most, naming a seed (`isSeed`). */
export const isSeedText = (text: string): boolean => /^\d{1,10}$/.test(text) && isSeed(Number(text));

/** The scenario `text` names, as the scene's menu and the address write it. */
export function scenarioOf(text: string): DungeonScenario {
  if (text === "generated" || text === "reference" || text === "random-crypt") return text;
  throw new Error(`unknown crypt scenario ${JSON.stringify(text)}`);
}

/** Whether a scenario is drawn with the reference chamber's look, in place of the generated level's. */
export function usesReferenceLook(scenario: DungeonScenario): boolean {
  switch (scenario) {
    case "generated": return false;
    case "reference": case "random-crypt": return true;
    default: {
      const never: never = scenario;
      throw new Error(`unknown crypt scenario ${JSON.stringify(never)}`);
    }
  }
}

/** The Dungeon's setup owns its choices without constructing a renderer or world. */
function dungeonSetup(context: ScreenContext) {
  const location = context.address;
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const heroChoices = need("hero-choices"), seedInput = need<HTMLInputElement>("seed");
  const companionCount = need<HTMLFieldSetElement>("companions");
  const choice = (group: HTMLElement): string => group.querySelector<HTMLInputElement>("input:checked")!.value;
  const setupQuery = new URLSearchParams(location.search);
  const linkedSeed = setupQuery.get("seed");
  seedInput.value = linkedSeed !== null && isSeedText(linkedSeed) ? linkedSeed : String(randomSeed());
  /** The heroes a person can lead, in the order companions are drawn from: each is a body, and each carries what its model holds (`ModelInfo.held`). */
  const HEROES: readonly { readonly model: BodyModel; readonly label: string }[] = [{ model: "man", label: modelLabel("man") }, { model: "woman", label: modelLabel("woman") }];
  /** The companions for a hero: the next heroes on the list after the hero's own, in turn. */
  const companionModels = (hero: BodyModel, count: number): BodyModel[] => {
    const at = Math.max(0, HEROES.findIndex(h => h.model === hero));
    return Array.from({ length: count }, (_, i) => HEROES[(at + 1 + i) % HEROES.length].model);
  };
  for (const hero of HEROES) {
    const label = document.createElement("label"), input = document.createElement("input"), name = document.createElement("span");
    input.type = "radio"; input.name = "hero"; input.value = hero.model; input.checked = hero.model === (setupQuery.get("hero") ?? "man");
    name.textContent = hero.label;
    const portrait = document.createElement("img");
    portrait.src = publicAssetUrl(`/assets/menu/${hero.model === "man" ? "warrior" : "rogue"}.webp`);
    portrait.alt = ""; portrait.width = 512; portrait.height = 768; portrait.decoding = "async";
    label.append(input, name, portrait); heroChoices.append(label);
  }
  const heroLabel = (model: BodyModel) => HEROES.find(h => h.model === model)?.label ?? model;
  if (!heroChoices.querySelector<HTMLInputElement>("input:checked")) heroChoices.querySelector<HTMLInputElement>("input")!.checked = true;
  const linkedCompanions = (setupQuery.get("companions") ?? "").split(",").filter((value): value is BodyModel => HEROES.some(h => h.model === value)).slice(0, MOST_COMPANIONS);
  companionCount.querySelector<HTMLInputElement>(`input[value="${linkedCompanions.length}"]`)!.checked = true;
  let selectedCompanions = linkedCompanions;
  const attributeHolder = document.createElement("div");
  attributeHolder.id = "party-attributes"; need("party-minds").before(attributeHolder);
  const attributePanel = runAttributes(attributeHolder, location.search);
  const loadoutPanel = runLoadouts(need("party-loadout-list"), location.search);
  const updateAttributeParty = (keepRoster = false) => {
    const hero = choice(heroChoices) as BodyModel;
    if (!keepRoster) selectedCompanions = companionModels(hero, Number(choice(companionCount)));
    attributePanel.update(hero, selectedCompanions);
    loadoutPanel.update(hero, selectedCompanions);
  };
  updateAttributeParty(true);
  heroChoices.addEventListener("change", () => updateAttributeParty());
  companionCount.addEventListener("change", () => updateAttributeParty());
  /** Each hero's mind as a party member, and each enemy model's: chosen on the start panel and carried by the address. */
  const mindPanel = runMinds(need("party-mind-list"), [...HEROES.map(h => ({ side: "party" as const, model: h.model })),
    ...ENCOUNTER_MODELS.map((model) => ({ side: "enemy" as const, model }))], location.search);

  const scenario = need<HTMLFieldSetElement>("dungeon-scene"), quality = need<HTMLSelectElement>("dungeon-quality");
  const requestedScene = new URLSearchParams(location.search).get("scene");
  const initialScene = requestedScene === "reference" || requestedScene === "random-crypt" ? requestedScene : "generated";
  scenario.querySelector<HTMLInputElement>(`input[value="${initialScene}"]`)!.checked = true;
  quality.value = new URLSearchParams(location.search).get("quality") === "reduced" ? "reduced" : "high";
  const chooseScenario = () => {
    const reference = usesReferenceLook(scenarioOf(choice(scenario)));
    quality.parentElement!.hidden = !reference;
  };
  scenario.addEventListener("change", chooseScenario);
  chooseScenario();
  // Each side's Commander, offered from every one that leads that side (`COMMANDERS`, `CommanderEntry.sides`), by kind as the
  // address carries it (`?party=`, `?enemies=`): the first offered unless it names another, and a kind it cannot take is said.
  const partyCommander = need<HTMLSelectElement>("party-commander"), enemyCommander = need<HTMLSelectElement>("enemy-commander");
  const unknownCommanders: string[] = [];
  for (const [select, key, side] of [[partyCommander, "party", "party"], [enemyCommander, "enemies", "enemies"]] as const) {
    select.replaceChildren(...Object.entries(COMMANDERS).filter(([, entry]) => (entry as CommanderEntry).sides.includes(side))
      .map(([kind, entry]) => Object.assign(document.createElement("option"), { value: kind, textContent: entry.label })));
    const kind = setupQuery.get(key);
    if (kind === null) continue;
    if ([...select.options].some((option) => option.value === kind)) select.value = kind;
    else unknownCommanders.push(`No Commander ${JSON.stringify(kind)} leads the ${side}; ${select.selectedOptions[0]?.textContent ?? "none"} does.`);
  }
  if (unknownCommanders.length > 0) Object.assign(need("setup-error"), { hidden: false, textContent: unknownCommanders.join(" ") });
  /** `url` with each side's Commander, and none where it is the default (the picker's first). */
  const writeCommanders = (url: URL) => {
    for (const [select, key] of [[partyCommander, "party"], [enemyCommander, "enemies"]] as const) {
      if (select.selectedIndex === 0) url.searchParams.delete(key);
      else url.searchParams.set(key, select.value);
    }
  };

  context.own(() => {
    const url = new URL(location.href);
    mindPanel.write(url);
    attributePanel.write(url);
    loadoutPanel.write(url);
    writeCommanders(url);
    url.searchParams.set("hero", choice(heroChoices));
    url.searchParams.set("companions", selectedCompanions.join(","));
    url.searchParams.set("seed", seedInput.value);
    url.searchParams.set("scene", choice(scenario));
    url.searchParams.set("quality", quality.value);
    context.remember(url.href);
  });
  return { heroChoices, seedInput, choice, attributePanel, loadoutPanel, mindPanel,
    scenario, quality, partyCommander, enemyCommander, writeCommanders, heroLabel,
    get selectedCompanions() { return selectedCompanions; } };
}

export type DungeonSetup = ReturnType<typeof dungeonSetup>;

/** The 3D runtime is acquired on Start and kept for this screen's retries. */
export function bootDungeonSetup(context: ScreenContext): void {
  const setup = dungeonSetup(context);
  const start = find<HTMLButtonElement>("start", context.root);
  let play: (() => void) | null = null, loading = false;
  start.disabled = false; start.textContent = "Start";
  start.addEventListener("click", async () => {
    if (loading) return;
    if (play) { play(); return; }
    loading = true; start.disabled = true;
    try {
      play = await context.loading("Preparing your expedition", async () => {
        const { bootDungeon } = await import("./main.ts");
        context.signal.throwIfAborted();
        const startRun = bootDungeon(context, setup);
        startRun();
        return startRun;
      });
    } catch (error) {
      if (context.signal.aborted) return;
      const note = find("setup-error", context.root);
      note.hidden = false; note.textContent = String(error);
      console.error(error);
    } finally {
      loading = false;
      if (!play && !context.signal.aborted) start.disabled = false;
    }
  }, { signal: context.signal });
}
