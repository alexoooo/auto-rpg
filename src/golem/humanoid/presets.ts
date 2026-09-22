import type { GolemSetup } from "../../bout.ts";
export const humanSetup = (primary = "blade", secondary = "plate"): GolemSetup => {
  if (primary === "maul" || secondary === "maul") primary = secondary = "maul";
  return {
    locomotion: "locomotion.human", torso: "torso.human", head: "head.human",
    primary: { chain: "anatomical", terminal: primary }, secondary: { chain: "anatomical", terminal: secondary },
  };
};
export const HUMAN_BUILDS = [
  { name: "human-warrior", setup: humanSetup() },
  { name: "human-dual-swords", setup: humanSetup("blade", "blade") },
  { name: "human-unarmed", setup: humanSetup("fist", "fist") },
  { name: "human-maul", setup: humanSetup("maul", "maul") },
];
export const hasAnatomicalArm = (setup?: GolemSetup): boolean =>
  setup?.primary.chain === "anatomical" || setup?.secondary.chain === "anatomical";
