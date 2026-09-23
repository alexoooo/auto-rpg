import type { GolemSetup } from "../../bout.ts";

/** A skeleton, bone arm in both sockets. A maul in either socket takes both. */
export const skeletonSetup = (primary = "blade", secondary = "plate"): GolemSetup => {
  if (primary === "maul" || secondary === "maul") primary = secondary = "maul";
  return {
    family: "skeleton", locomotion: "locomotion.skeleton", torso: "torso.ribcage", head: "head.skull",
    primary: { chain: "skeletal", terminal: primary }, secondary: { chain: "skeletal", terminal: secondary },
  };
};

/**
 * The skeletons a person can pick by name. A hero and not an enemy: none is in `NAMED_BUILDS`,
 * which is the dungeon's and the waves' enemy pool. The maul is here because its grip is taken
 * and held on the bone arm (the skeletal chain's maul-grip test).
 */
export const SKELETON_BUILDS = [
  { name: "skeleton-warrior", setup: skeletonSetup() },
  { name: "skeleton-mace", setup: skeletonSetup("mace", "plate") },
  { name: "skeleton-dual-blades", setup: skeletonSetup("blade", "blade") },
  { name: "skeleton-maul", setup: skeletonSetup("maul", "maul") },
];
