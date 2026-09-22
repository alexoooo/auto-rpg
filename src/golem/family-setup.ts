import type { GolemSetup } from "../bout.ts";
import { defaultGolemSetup } from "./build.ts";
import type { BodyFamily } from "./family.ts";
import { humanSetup } from "./humanoid/presets.ts";

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
});
