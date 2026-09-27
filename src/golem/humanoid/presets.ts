import type { GolemSetup } from "../../bout.ts";
export const humanSetup = (primary = "blade", secondary = "plate"): GolemSetup => {
  if (primary === "bow") secondary = "bow";
  else if (secondary === "bow") secondary = "fist";
  if (primary === "maul" || secondary === "maul") primary = secondary = "maul";
  return {
    ...(primary === "bow" ? { human: { model: "workshop-rogue" as const, boots: true, armour: false } } : {}),
    family: "human", locomotion: "locomotion.human", torso: "torso.human", head: "head.human",
    primary: { chain: "anatomical", terminal: primary }, secondary: { chain: "anatomical", terminal: secondary },
  };
};
export const HUMAN_BUILDS = [
  { name: "workshop-rogue", setup: { ...humanSetup("bow", "bow"), human: { model: "workshop-rogue" as const, boots: true, armour: false } } },
  { name: "human-warrior", setup: humanSetup() },
  { name: "human-dual-swords", setup: humanSetup("blade", "blade") },
  { name: "human-unarmed", setup: humanSetup("fist", "fist") },
  { name: "human-maul", setup: humanSetup("maul", "maul") },
  { name: "workshop-fighter", setup: { ...humanSetup(), human: { model: "workshop-fighter" as const, boots: true, armour: true } } },
];
export const hasAnatomicalArm = (setup?: GolemSetup): boolean =>
  setup?.primary.chain === "anatomical" || setup?.secondary.chain === "anatomical";
