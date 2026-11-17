import type { DataLoaders } from "../../../core/data/store.ts";

/** What a foe's fighting took from a body in bouts (`PressureTable`): a striker's body on a struck one, each the struck body's (`identity`). */
export const PRESSURE_PROFILES_DATA = {
  "pressure-profiles": Object.assign(() => import("./pressure-profiles.ts").then((m) => m.PRESSURE_PROFILES),
    { identity: (data: unknown, body: string) => (data as readonly { readonly target: { readonly body: string } }[]).filter((table) => table.target.body === body) }),
} satisfies DataLoaders;
