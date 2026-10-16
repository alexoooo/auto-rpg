import { VIEW_MODES, CAMERA_MODES, PROJECTIONS, type ViewSettings } from "../render/view.ts";
import { appearanceFor, type Appearance } from "../render/appearance.ts";
import { playHref } from "../app-route.ts";
import { CHARACTERS } from "../character-lab/catalog.ts";
import { HUMANOID_MODELS, type HumanoidModel } from "../core/models.ts";
import { MODEL_DISPLAY } from "../render/models.ts";
import { balanceFrom } from "../core/rules/rulebook.ts";
import { validHaste } from "../core/human/attributes.ts";
import { HELD, type Held } from "../core/items/held.ts";
import { CLASSIC, PUNCHER, RECIPE_FIGHTER, type FighterConfig, type MindConfig } from "../core/mind/config.ts";
import type { Provision } from "../core/mind/parts.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { deepFreeze } from "../core/state.ts";
import { mindFaults, mindText, readMind } from "../ui/mind-link.ts";
import { groundMind } from "./ground-config.ts";
import { TECHNIQUES, type TechniqueName } from "../core/mind/ground/techniques.ts";

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

export type ScenarioId = "stance" | "attack" | "locomotion" | "recovery" | "ground";

interface ScenarioInfo {
  readonly id: ScenarioId;
  readonly name: string;
}

/** Every scenario, in the menu's order; the first is the default. */
export const SCENARIOS: readonly ScenarioInfo[] = [
  { id: "stance", name: "Stance" },
  { id: "recovery", name: "Get-up experiment" },
  { id: "ground", name: "On the ground" },
  { id: "attack", name: "Attack" },
  { id: "locomotion", name: "Locomotion" },
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
/** A loadout: the model, what each hand holds, the clothing worn, and whether its feet are shod (`withSoles`: a sole that gives against the ground). */
export type LabLoadout = {
  readonly model: HumanoidModel; readonly sole: boolean;
  /** The body's haste, per cent of a person's speed in its legs, in place of its character's (`AttributeSpec.haste`); null is the character's. */
  readonly haste: number | null;
}
  & Readonly<Record<(typeof LAB_HANDS)[number], Held>> & Readonly<Record<(typeof LAB_WORN)[number], boolean>>;

/**
 * The physics and control rates on offer, Hz: the game's (`PHYSICS_HZ`, which the test pins
 * this to without the menu loading the engine), and a finer step where the readings converge.
 */
export const LAB_RATES = [120, 480] as const;
type LabRate = (typeof LAB_RATES)[number];

/**
 * **The minds the Lab names**, by the id its address carries. Attack defaults to Puncher and
 * carries out game orders; Classic offers the game's recipe fighter. Other scenarios default to
 * Script, which carries out their tactics. Guard stands still. Each tree is editable (`mindEditor`).
 */
export const LAB_PRESETS: Readonly<Record<"script" | "guard" | "classic" | "puncher", { readonly label: string; readonly config: FighterConfig }>> = deepFreeze({
  classic: { label: "Classic", config: CLASSIC },
  puncher: { label: "Puncher", config: PUNCHER },
  script: { label: "Script", config: { ...RECIPE_FIGHTER, tactics: { kind: "script" } } },
  guard: { label: "Guard", config: { ...RECIPE_FIGHTER, tactics: { kind: "stand" } } },
});

/** What the Lab gives a mind beyond the body and the world: its scenario's script. */
export const LAB_PROVIDES: readonly Provision[] = Object.freeze(["script"]);

/**
 * What a Lab body of `spec` is driven by under the mind `config`, and what is wrong with `config`
 * (`mindFaults`): a faulty mind plays the scenario's default, Puncher in Attack and Script elsewhere.
 */
export function labMind(config: MindConfig, spec: BodySpec, scenario: ScenarioId | null = null): { readonly plays: FighterConfig; readonly faults: readonly string[] } {
  const faults = config.kind === "fighter" ? mindFaults(config, spec, scenario === "attack" ? [] : LAB_PROVIDES) : ["the Lab drives a fighter"];
  return { plays: config.kind === "fighter" && faults.length === 0 ? config : scenario === "attack" ? PUNCHER : LAB_PRESETS.script.config, faults };
}

/** The Attack field's target count and random seed unless the address supplies them. */
const LAB_TARGETS = { most: 30, count: 10, seed: 1 } as const;

export interface LabAddress extends LabLoadout, ViewSettings {
  readonly ground: {
    readonly drive: "mind" | TechniqueName;
    readonly waypoint: "none" | "brace" | "plant" | "transfer" | "rise";
    readonly start: "shoved" | "dropped" | "placed";
    readonly posture: "back" | "front" | "left" | "right" | "fours" | "half-kneel" | "squat";
    /** Null draws the shove from the seed. */
    readonly degrees: number | null;
    readonly impulse: number | null;
    readonly foe: 0 | 1 | 2 | 4;
    readonly gusts: boolean;
  };
  readonly recoveryMode: "witness" | "selected";
  /** Two timed chest impulses: direction in degrees, impulse in N s, separation in seconds. */
  readonly recoveryPush: { readonly degrees: number; readonly impulse: number; readonly separation: number };
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
  /** Targets maintained in the Attack field, 0 to `LAB_TARGETS.most`. */
  readonly targets: number;
  readonly seed: number;
}

const KEYS = ["groundStart", "groundPosture", "groundDegrees", "groundImpulse", "groundFoe", "groundGusts", "recoveryMode", "pushDegrees", "pushImpulse", "pushSeparation", "scenario", "model", "appearance", "right", "left", "boots", "armour", "sole", "balance", "haste", "mind", "barred", "hz", "view", "camera", "projection", "targets", "seed"] as const;

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
  const bounded = (key: string, lo: number, hi: number, fallback: number): number => {
    const text = query.get(key), value = text === null || text.trim() === "" ? NaN : Number(text);
    return Number.isFinite(value) && value >= lo && value <= hi ? value : fallback;
  };
  return {
    ground: {
      drive: (Object.keys(TECHNIQUES) as TechniqueName[]).find(v => v === query.get("groundDrive")) ?? "mind",
      waypoint: (["none", "brace", "plant", "transfer", "rise"] as const).find(v => v === query.get("groundWaypoint")) ?? "none",
      start: (["shoved", "dropped", "placed"] as const).find(v => v === query.get("groundStart")) ?? "shoved",
      posture: (["back", "front", "left", "right", "fours", "half-kneel", "squat"] as const).find(v => v === query.get("groundPosture")) ?? "back",
      degrees: query.has("groundDegrees") ? bounded("groundDegrees", 0, 360, 0) : null,
      impulse: query.has("groundImpulse") ? bounded("groundImpulse", 40, 90, 60) : null,
      foe: ([0, 1, 2, 4] as const).find(v => String(v) === query.get("groundFoe")) ?? 0,
      gusts: flag(query.get("groundGusts"), false),
    },
    recoveryMode: recoveryModeFrom(query.get("recoveryMode")),
    recoveryPush: {degrees:bounded("pushDegrees",0,360,0),impulse:bounded("pushImpulse",10,120,60),separation:bounded("pushSeparation",.05,1,.2)},
    scenario: SCENARIOS.find((s) => s.id === query.get("scenario"))?.id ?? null,
    model,
    appearance: appearanceFor(model, query.get("appearance")),
    right: HELD.find((h) => h === query.get("right")) ?? "empty",
    left: HELD.find((h) => h === query.get("left")) ?? "empty",
    boots: flag(query.get("boots"), worn.boots),
    armour: flag(query.get("armour"), worn.armour),
    sole: flag(query.get("sole"), false),
    balance: balanceFrom(query.get("balance") ?? ""),
    haste: hasteFrom(query.get("haste") ?? ""),
    mind: readMind(query.get("mind"), LAB_PRESETS) ?? (query.get("scenario") === "attack" ? PUNCHER
      : query.get("scenario") === "ground" ? groundMind(LAB_PRESETS.script.config) : LAB_PRESETS.script.config),
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
  query.delete("groundDrive");
  query.delete("groundWaypoint");
  if (address.ground.drive !== "mind") query.set("groundDrive", address.ground.drive);
  if (address.ground.waypoint !== "none") query.set("groundWaypoint", address.ground.waypoint);
  if (address.ground.start !== "shoved") query.set("groundStart", address.ground.start);
  if (address.ground.posture !== "back") query.set("groundPosture", address.ground.posture);
  if (address.ground.degrees !== null) query.set("groundDegrees", String(address.ground.degrees));
  if (address.ground.impulse !== null) query.set("groundImpulse", String(address.ground.impulse));
  if (address.ground.foe !== 0) query.set("groundFoe", String(address.ground.foe));
  if (address.ground.gusts) query.set("groundGusts", "1");
  if (address.recoveryMode !== "selected") query.set("recoveryMode", address.recoveryMode);
  if (address.recoveryPush.degrees !== 0) query.set("pushDegrees", String(address.recoveryPush.degrees));
  if (address.recoveryPush.impulse !== 60) query.set("pushImpulse", String(address.recoveryPush.impulse));
  if (address.recoveryPush.separation !== .2) query.set("pushSeparation", String(address.recoveryPush.separation));
  if (address.scenario) query.set("scenario", address.scenario);
  query.set("model", address.model);
  const appearance = appearanceFor(address.model, address.appearance);
  if (appearance !== "default") query.set("appearance", appearance);
  query.set("right", address.right);
  query.set("left", address.left);
  query.set("boots", address.boots ? "1" : "0");
  query.set("armour", address.armour ? "1" : "0");
  if (address.sole) query.set("sole", "1");
  if (address.balance !== null) query.set("balance", String(address.balance));
  if (address.haste !== null) query.set("haste", String(address.haste));
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

/** The haste `text` writes, per cent: a positive number; null for anything else, and the character's. */
function hasteFrom(text: string): number | null {
  const haste = balanceFrom(text);
  return haste !== null && validHaste(haste) ? haste : null;
}

/** An explicit recovery demonstration; changing it preserves the view preferences. */
export function recoveryAddress(address: LabAddress, recoveryMode: LabAddress["recoveryMode"] = "selected"): LabAddress {
  if (recoveryMode === "selected") return { ...address, scenario: "recovery", recoveryMode };
  return { ...address, scenario: "recovery", recoveryMode, recoveryPush: {degrees:0,impulse:60,separation:.2},
    model: "workshop-fighter", right: "empty", left: "empty", sole: true,
    balance: 0, haste: null, hz: 120, mind: LAB_PRESETS.script.config, barred: [], appearance: "default" };
}

function recoveryModeFrom(value: string | null): LabAddress["recoveryMode"] {
  switch (value) {
    case "selected": case "witness": return value;
    default: return "selected";
  }
}
