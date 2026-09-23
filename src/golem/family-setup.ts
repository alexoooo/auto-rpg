import type { GolemSetup } from "../bout.ts";
import { defaultGolemSetup } from "./build.ts";
import type { BodyFamily } from "./family.ts";
import { humanSetup } from "./humanoid/presets.ts";
import { skeletonSetup } from "./skeleton/presets.ts";

/**
 * The body a family's button builds. Total, so a new family is a compile error here.
 *
 * Not in `family.ts`, because `build.ts` imports that file and this one imports `build.ts`: kept
 * apart, `family.ts` stays a table with nothing but a type import, which is what lets `bout.ts`
 * read it.
 */
export const FAMILY_SETUP: Readonly<Record<BodyFamily, () => GolemSetup>> = Object.freeze({
  human: () => humanSetup(),
  golem: () => defaultGolemSetup(),
  skeleton: () => skeletonSetup(),
});

/**
 * The families whose hands hold chosen weapons, and how to arm one. A stone golem is absent on
 * purpose: its weapons are its build, and the hero picker already chooses between builds.
 */
export const ARMED_SETUP: Readonly<Partial<Record<BodyFamily, (primary: string, secondary: string) => GolemSetup>>> =
  Object.freeze({ human: humanSetup, skeleton: skeletonSetup });
