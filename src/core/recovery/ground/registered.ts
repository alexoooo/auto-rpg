import { TECHNIQUES } from "./techniques.ts";

/** Whether a registered executor is a recovery technique. */
export const isGroundSkill = (kind: string): boolean => Object.hasOwn(TECHNIQUES, kind);
