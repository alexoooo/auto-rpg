import type { DataLoaders } from "../../core/data/store.ts";
import { BODY_MODELS, modelSpec } from "../../core/bodies/models.ts";
import type { BodyNumbers } from "../../skills/framework/profile.ts";

/**
 * **Each body model's numbers** (`dataOf("body-numbers")`, `BodyNumbers`): its stature, from its
 * spec, so a mind reads one body's measured trials for another without building either.
 */
export const BODY_NUMBERS_DATA = {
  "body-numbers": Object.assign(
    () => Promise.resolve(Object.fromEntries(BODY_MODELS.map((model): [string, BodyNumbers] => [model, { stature: modelSpec(model).stature.value }]))),
    { identity: (data: unknown, body: string) => (data as Readonly<Record<string, BodyNumbers>>)[body] ?? null }),
} satisfies DataLoaders;
