import { VIEW_MODES, CAMERA_MODES, PROJECTIONS, type ViewSettings } from "../render/view.ts";
import { appearanceFor, type Appearance } from "../render/appearance.ts";
import { playHref } from "../app-route.ts";
import { CHARACTERS } from "../character-lab/catalog.ts";
import { HUMANOID_MODELS, type HumanoidModel } from "../core/models.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { balanceFrom } from "../core/rules/rulebook.ts";
import { HELD, type Held } from "../core/items/held.ts";
import { RECIPE_FIGHTER, type FighterConfig, type MindConfig } from "../core/mind/config.ts";
import type { Provision } from "../core/mind/parts.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { deepFreeze } from "../core/state.ts";
import { mindFaults, mindText, readMind } from "../ui/mind-link.ts";

/**
 * **The lab's scenarios, and the address that opens one.** `?play=lab` is the scenario menu
 * (`setup.ts`); `?play=lab&scenario=…` runs that scenario (`main.ts`), where the loadout, the balance, the mind, the
 * rate, the view and the camera are chosen, and the address keeps them: the mind as a preset's id or
 * its whole tree (`readMind`). Choosing a scenario, or going back to
 * the menu, is a navigation, as every change of screen in the game is.
 *
 * Pure and free of the DOM, so `tests/lab-scenarios.test.mjs` can argue with it; the menu
 * reads its options from here, so an option offered is one the lab has.
 */

export type ScenarioId = "stance" | "routine" | "run" | "blow";

interface ScenarioInfo {
  readonly id: ScenarioId;
  readonly name: string;
  readonly line: string;
  /** What the menu's card puts in the hands, where the scenario needs it; the scenario's page can change it after. */
  readonly holds?: Partial<Pick<LabLoadout, "right" | "left">>;
}

/** Every scenario, in the menu's order; the first is the default. */
export const SCENARIOS: readonly ScenarioInfo[] = [
  { id: "stance", name: "Stance", line: "Walk it from the keyboard, and shove it." },
  { id: "routine", name: "Routine", line: "It walks out, strikes at ten targets hung high, middle and low, turns and walks back." },
  { id: "run", name: "Run", line: "It goes round a track as fast as its walk holds: a big circle, or straight back and forth." },
  { id: "blow", name: "Blow", line: "It swings a club blow the strike search found into a head, and reads what it lands with.", holds: { right: "club" } },
];

export const MODELS: readonly { readonly id: HumanoidModel; readonly name: string }[] = HUMANOID_MODELS.map((id) => ({ id, name: MODEL_DISPLAY[id].label }));
/** The hands that hold, and the clothing worn or not, as the loadout names them. */
export const LAB_HANDS = ["right", "left"] as const, LAB_WORN = ["boots", "armour"] as const;

/**
 * What each body wears unless the address says: the character workshop's own default loadout for
 * the humans, the Warrior armoured and the Rogue not; the skeleton wears nothing.
 */
const WORN: Readonly<Record<HumanoidModel, { readonly boots: boolean; readonly armour: boolean }>> = {
  "workshop-fighter": CHARACTERS.fighter.defaults,
  "workshop-rogue": CHARACTERS.rogue.defaults,
  "crypt-skeleton": { boots: false, armour: false },
};

/**
 * **A loadout**: the body, what each hand holds, and what it wears. The body and the hands are
 * physical: they make the spec (`loadout.ts`). Boots and armour are the skin's meshes alone; the
 * core has no clothing, and the boot is in the foot's shape whatever the skin shows.
 */
export type LabLoadout = { readonly model: HumanoidModel }
  & Readonly<Record<(typeof LAB_HANDS)[number], Held>> & Readonly<Record<(typeof LAB_WORN)[number], boolean>>;

/**
 * The physics and control rates on offer, Hz: the game's (`PHYSICS_HZ`, which the test pins
 * this to without the menu loading the engine), and a finer step where the readings converge.
 */
export const LAB_RATES = [120, 480] as const;
type LabRate = (typeof LAB_RATES)[number];

/**
 * **The minds the Lab names**, by the id its address carries; the first is the default. A scenario's
 * mode writes a script, which the Script preset's tactics carry out on the game's recipe skills
 * (`labActor`, `actor.ts`); Guard stands in guard the way it faces, whatever the script asks. Each
 * lies still once down; any part of either may be changed (`mindEditor`).
 */
export const LAB_PRESETS: Readonly<Record<"script" | "guard", { readonly label: string; readonly config: FighterConfig }>> = deepFreeze({
  script: { label: "Script", config: { ...RECIPE_FIGHTER, tactics: { kind: "script" } } },
  guard: { label: "Guard", config: { ...RECIPE_FIGHTER, tactics: { kind: "stand" } } },
});

/** What the Lab gives a mind beyond the body and the world: its scenario's script. */
export const LAB_PROVIDES: readonly Provision[] = Object.freeze(["script"]);

/**
 * What a Lab body of `spec` is driven by under the mind `config`, and what is wrong with `config`
 * (`mindFaults`): the Lab drives a fighter, and a mind with a fault plays the Script preset whole.
 */
export function labMind(config: MindConfig, spec: BodySpec): { readonly plays: FighterConfig; readonly faults: readonly string[] } {
  const faults = config.kind === "fighter" ? mindFaults(config, spec, LAB_PROVIDES) : ["the Lab drives a fighter"];
  return { plays: config.kind === "fighter" && faults.length === 0 ? config : LAB_PRESETS.script.config, faults };
}

/**
 * The Routine's targets: the most the address may ask for, and how many it has and the seed they are
 * drawn from unless the address says (`ROUTINE_TARGETS`, `routine.ts`, which the test pins these to
 * without the menu loading the routine).
 */
export const LAB_TARGETS = { most: 30, count: 10, seed: 1 } as const;

export interface LabAddress extends LabLoadout, ViewSettings {
  readonly appearance: Appearance;
  /** The scenario to run; none is the menu. */
  readonly scenario: ScenarioId | null;
  /** The body's balance, per cent of its weight, in place of its character's (`AttributeSpec.balance`); null is the character's. */
  readonly balance: number | null;
  /** The body's mind, as the address carries it: faults and all (`labMind`). */
  readonly mind: MindConfig;
  /** What its mind may not strike with: each thing held whose strike is barred. */
  readonly barred: readonly Held[];
  readonly hz: LabRate;
  /** The Routine's targets a loop, 0 to `LAB_TARGETS.most`, and the seed they are drawn from (`drawTargets`, `targets.ts`). */
  readonly targets: number;
  readonly seed: number;
}

const KEYS = ["scenario", "model", "appearance", "right", "left", "boots", "armour", "balance", "mind", "barred", "hz", "view", "camera", "projection", "targets", "seed"] as const;

/** A switch in the address: `1` on, `0` off, anything else `fallback`. */
/** A whole number in the address, from `least` to `most`: plain digits, anything else `fallback`. */
function whole(value: string | null, least: number, most: number, fallback: number): number {
  if (value === null || !/^\d{1,10}$/.test(value)) return fallback;
  const n = Number(value);
  return n >= least && n <= most ? n : fallback;
}

const flag = (value: string | null, fallback: boolean): boolean => value === "1" ? true : value === "0" ? false : fallback;

/** Read the lab's address; anything missing or unknown is the default. */
export function labAddress(search: string): LabAddress {
  const query = new URLSearchParams(search);
  const model = MODELS.find((m) => m.id === query.get("model"))?.id ?? MODELS[0].id;
  const worn = WORN[model], barred = (query.get("barred") ?? "").split(",");
  return {
    scenario: SCENARIOS.find((s) => s.id === query.get("scenario"))?.id ?? null,
    model,
    appearance: appearanceFor(model, query.get("appearance")),
    right: HELD.find((h) => h === query.get("right")) ?? "empty",
    left: HELD.find((h) => h === query.get("left")) ?? "empty",
    boots: flag(query.get("boots"), worn.boots),
    armour: flag(query.get("armour"), worn.armour),
    balance: balanceFrom(query.get("balance") ?? ""),
    mind: readMind(query.get("mind"), LAB_PRESETS) ?? LAB_PRESETS.script.config,
    barred: HELD.filter((h) => barred.includes(h)),
    hz: LAB_RATES.find((r) => String(r) === query.get("hz")) ?? LAB_RATES[0],
    view: VIEW_MODES.find((v) => v === query.get("view")) ?? VIEW_MODES[0],
    camera: CAMERA_MODES.find((c) => c === query.get("camera")) ?? CAMERA_MODES[0],
    projection: PROJECTIONS.find((p) => p === query.get("projection")) ?? PROJECTIONS[0],
    targets: whole(query.get("targets"), 0, LAB_TARGETS.most, LAB_TARGETS.count),
    // A seed is taken modulo 2^32 (`mulberry32`), so any whole number under it names one stream.
    seed: whole(query.get("seed"), 0, 4294967295, LAB_TARGETS.seed),
  };
}

/**
 * The address of `address`, keeping whatever else `search` holds. The menu keeps the loadout,
 * the balance, the mind, the rate, the view and the camera, so going back to it and on to another scenario keeps them too.
 */
export function labHref(address: LabAddress, search = ""): string {
  const query = new URLSearchParams(playHref("lab", search));
  for (const key of KEYS) query.delete(key);
  if (address.scenario) query.set("scenario", address.scenario);
  query.set("model", address.model);
  const appearance = appearanceFor(address.model, address.appearance);
  if (appearance !== "default") query.set("appearance", appearance);
  query.set("right", address.right);
  query.set("left", address.left);
  query.set("boots", address.boots ? "1" : "0");
  query.set("armour", address.armour ? "1" : "0");
  if (address.balance !== null) query.set("balance", String(address.balance));
  query.set("mind", mindText(address.mind, LAB_PRESETS));
  if (address.barred.length > 0) query.set("barred", address.barred.join(","));
  query.set("hz", String(address.hz));
  query.set("view", address.view);
  query.set("camera", address.camera);
  query.set("projection", address.projection);
  if (address.targets !== LAB_TARGETS.count) query.set("targets", String(address.targets));
  if (address.seed !== LAB_TARGETS.seed) query.set("seed", String(address.seed));
  return `?${query}`;
}
