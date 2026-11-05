/** The support-height fact published by an applicable motor. */
export const SUPPORT_REFERENCE = "support-reference";
declare module "../parts/parts.ts" { interface Requirements { readonly [SUPPORT_REFERENCE]: true } }

import type { BodySpec } from "../core/bodies/spec/body.ts";
import type { ReadBody } from "../core/bodies/read-body.ts";

/** Reference support height supplied by a selected motor capability. */
export interface SupportReference {
  fits(spec: BodySpec): string | null;
  read(built: ReadBody): number;
}

/** The support height required by an applicable stance, strike or recovery implementation. */
export function supportHeight(view: { readonly standing: number | null }): number {
  if (view.standing === null) throw new Error("this implementation requires a motor support reference");
  return view.standing;
}
