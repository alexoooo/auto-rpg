import type { GolemSetup } from "../../bout.ts";
import type { WorkshopModel } from "./workshop-profile.ts";

/**
 * A human is the Warrior or the Rogue, and nothing else: the legacy human was retired on
 * 2026-09-27. A bow is the Rogue's and takes both hands; anything else defaults to the Warrior.
 * Terminals the workshop cannot hold are not substituted here -- `golemSetupRefusal` names them.
 */
export const humanSetup = (primary = "blade", secondary = "plate",
  model: WorkshopModel = primary === "bow" ? "workshop-rogue" : "workshop-fighter"): GolemSetup => {
  if (primary === "bow") secondary = "bow";
  else if (secondary === "bow") secondary = "fist";
  return {
    human: { model, boots: true, armour: model === "workshop-fighter" },
    family: "human", locomotion: "locomotion.human", torso: "torso.human", head: "head.human",
    primary: { chain: "anatomical", terminal: primary }, secondary: { chain: "anatomical", terminal: secondary },
  };
};
export const HUMAN_BUILDS = [
  { name: "warrior", setup: humanSetup() },
  { name: "warrior-sword", setup: humanSetup("blade", "fist") },
  { name: "warrior-club", setup: humanSetup("club", "plate") },
  { name: "warrior-unarmed", setup: humanSetup("fist", "fist") },
  { name: "rogue", setup: humanSetup("bow", "bow") },
  { name: "rogue-sword", setup: humanSetup("blade", "plate", "workshop-rogue") },
];
export const hasAnatomicalArm = (setup?: GolemSetup): boolean =>
  setup?.primary.chain === "anatomical" || setup?.secondary.chain === "anatomical";
