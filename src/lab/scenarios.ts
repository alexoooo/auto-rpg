import { playHref } from "../app-route.ts";
import { CHARACTERS } from "../character-lab/catalog.ts";
import type { BodyModel } from "../core/human/spec.ts";
import { balanceFrom } from "../core/rules/rulebook.ts";

/**
 * **The lab's scenarios, and the address that opens one.** `?play=lab` is the scenario menu
 * (`setup.ts`); `?play=lab&scenario=…` runs that scenario (`main.ts`), where the loadout, the balance, the mind, the
 * rate, the view and the camera are chosen, and the address keeps them. Choosing a scenario, or going back to
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
  { id: "routine", name: "Routine", line: "It walks out, strikes three times, turns and walks back." },
  { id: "run", name: "Run", line: "It goes round a track as fast as its walk holds: a big circle, or straight back and forth." },
  { id: "blow", name: "Blow", line: "It swings a club blow the strike search found into a head, and reads what it lands with.", holds: { right: "club" } },
];

export const MODELS: readonly { readonly id: BodyModel; readonly name: string }[] = [
  { id: "workshop-fighter", name: "Warrior" },
  { id: "workshop-rogue", name: "Rogue" },
  { id: "crypt-skeleton", name: "Skeleton" },
];

/**
 * What a hand may hold: nothing, or the wooden club (`woodenClub`, `src/core/items/club.ts`),
 * which becomes one rigid body with the hand.
 */
export const LAB_HELD = ["empty", "club"] as const;
export type LabHeld = (typeof LAB_HELD)[number];
/** The hands that hold, and the clothing worn or not, as the loadout names them. */
export const LAB_HANDS = ["right", "left"] as const, LAB_WORN = ["boots", "armour"] as const;

/**
 * What each body wears unless the address says: the character workshop's own default loadout for
 * the humans, the Warrior armoured and the Rogue not; the skeleton wears nothing.
 */
const WORN: Readonly<Record<BodyModel, { readonly boots: boolean; readonly armour: boolean }>> = {
  "workshop-fighter": CHARACTERS.fighter.defaults,
  "workshop-rogue": CHARACTERS.rogue.defaults,
  "crypt-skeleton": { boots: false, armour: false },
};

/**
 * **A loadout**: the body, what each hand holds, and what it wears. The body and the hands are
 * physical: they make the spec (`loadout.ts`). Boots and armour are the skin's meshes alone; the
 * core has no clothing, and the boot is in the foot's shape whatever the skin shows.
 */
export type LabLoadout = { readonly model: BodyModel }
  & Readonly<Record<(typeof LAB_HANDS)[number], LabHeld>> & Readonly<Record<(typeof LAB_WORN)[number], boolean>>;

/**
 * The physics and control rates on offer, Hz: the game's (`PHYSICS_HZ`, which the test pins
 * this to without the menu loading the engine), and a finer step where the readings converge.
 */
export const LAB_RATES = [120, 480] as const;
type LabRate = (typeof LAB_RATES)[number];

/**
 * How the body is drawn: World, the model's skin, or Tactical, the collision shapes the solver
 * moves. The first is the default.
 */
export const LAB_VIEWS = ["world", "tactical"] as const;
export type LabView = (typeof LAB_VIEWS)[number];
/** How the camera follows the body (`camera.ts`); the first is the default. */
export const LAB_CAMERAS = ["free", "isometric", "chase"] as const;
export type LabCamera = (typeof LAB_CAMERAS)[number];
/** What may drive the body (`LAB_MINDS`, `minds.ts`); the first is the default. */
export const LAB_MIND_IDS = ["script", "guard"] as const;
export type LabMindId = (typeof LAB_MIND_IDS)[number];
/** How the isometric camera draws; the first is the default. */
export const LAB_PROJECTIONS = ["orthographic", "perspective"] as const;
export type LabProjection = (typeof LAB_PROJECTIONS)[number];

export interface LabAddress extends LabLoadout {
  /** The scenario to run; none is the menu. */
  readonly scenario: ScenarioId | null;
  /** The body's balance, points, in place of its character's (`AttributeSpec.balance`); null is the character's. */
  readonly balance: number | null;
  readonly mind: LabMindId;
  /** What its mind may not strike with: each thing held whose strike is barred. */
  readonly barred: readonly LabHeld[];
  readonly hz: LabRate;
  readonly view: LabView;
  readonly camera: LabCamera;
  readonly projection: LabProjection;
}

const KEYS = ["scenario", "model", "right", "left", "boots", "armour", "balance", "mind", "barred", "hz", "view", "camera", "projection"] as const;

/** A switch in the address: `1` on, `0` off, anything else `fallback`. */
const flag = (value: string | null, fallback: boolean): boolean => value === "1" ? true : value === "0" ? false : fallback;

/** Read the lab's address; anything missing or unknown is the default. */
export function labAddress(search: string): LabAddress {
  const query = new URLSearchParams(search);
  const model = MODELS.find((m) => m.id === query.get("model"))?.id ?? MODELS[0].id;
  const worn = WORN[model], barred = (query.get("barred") ?? "").split(",");
  return {
    scenario: SCENARIOS.find((s) => s.id === query.get("scenario"))?.id ?? null,
    model,
    right: LAB_HELD.find((h) => h === query.get("right")) ?? LAB_HELD[0],
    left: LAB_HELD.find((h) => h === query.get("left")) ?? LAB_HELD[0],
    boots: flag(query.get("boots"), worn.boots),
    armour: flag(query.get("armour"), worn.armour),
    balance: balanceFrom(query.get("balance") ?? ""),
    mind: LAB_MIND_IDS.find((m) => m === query.get("mind")) ?? LAB_MIND_IDS[0],
    barred: LAB_HELD.filter((h) => barred.includes(h)),
    hz: LAB_RATES.find((r) => String(r) === query.get("hz")) ?? LAB_RATES[0],
    view: LAB_VIEWS.find((v) => v === query.get("view")) ?? LAB_VIEWS[0],
    camera: LAB_CAMERAS.find((c) => c === query.get("camera")) ?? LAB_CAMERAS[0],
    projection: LAB_PROJECTIONS.find((p) => p === query.get("projection")) ?? LAB_PROJECTIONS[0],
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
  query.set("right", address.right);
  query.set("left", address.left);
  query.set("boots", address.boots ? "1" : "0");
  query.set("armour", address.armour ? "1" : "0");
  if (address.balance !== null) query.set("balance", String(address.balance));
  query.set("mind", address.mind);
  if (address.barred.length > 0) query.set("barred", address.barred.join(","));
  query.set("hz", String(address.hz));
  query.set("view", address.view);
  query.set("camera", address.camera);
  query.set("projection", address.projection);
  return `?${query}`;
}
