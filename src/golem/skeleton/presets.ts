import type { GolemSetup } from "../../bout.ts";

/** A skeleton, bone arm in both sockets. A maul in either socket takes both. */
export const skeletonSetup = (primary = "blade", secondary = "plate"): GolemSetup => {
  if (primary === "maul" || secondary === "maul") primary = secondary = "maul";
  return {
    family: "skeleton", locomotion: "locomotion.skeleton", torso: "torso.ribcage", head: "head.skull",
    primary: { chain: "skeletal", terminal: primary }, secondary: { chain: "skeletal", terminal: secondary },
  };
};
