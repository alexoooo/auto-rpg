import type { Profile } from "../skills/framework/profile.ts";
import type { PunchRecords } from "../skills/strikes/punch-records.ts";

/** **Mind data**, by key: loaded before the minds that read it are built, and read synchronously after. */
export type DataKey = "straight-punch" | "strike-profiles" | "edge-profiles" | "gait-profiles";

interface DataOf {
  /** Every body's straight punch record (`PunchRecord`). */
  "straight-punch": PunchRecords;
  /** What the Strike drill measured every strike to bring (`Profile`). */
  "strike-profiles": readonly Profile[];
  /** What the Rise drill measured every ground edge to bring (`Profile`). */
  "edge-profiles": readonly Profile[];
  /** What the Gait drill measured every gait to leave a body unbraced (`Profile`). */
  "gait-profiles": readonly Profile[];
}

/**
 * Each key's loader: a dynamic import of the module that holds its data, so each is a chunk of its
 * own and loads only when asked. The module imports its JSON statically: a dynamic import of JSON
 * needs import attributes in Node, and the bundle keeps such an import's path unresolved.
 */
const LOADERS: { readonly [K in DataKey]: () => Promise<DataOf[K]> } = {
  "straight-punch": () => import("./straight-punch.ts").then((m) => m.STRAIGHT_PUNCH_RECORDS),
  "strike-profiles": () => import("./strike-profiles.ts").then((m) => m.STRIKE_PROFILES),
  "edge-profiles": () => import("./edge-profiles.ts").then((m) => m.EDGE_PROFILES),
  "gait-profiles": () => import("./gait-profiles.ts").then((m) => m.GAIT_PROFILES),
};

/** Every key, in `LOADERS`' order. */
export const DATA_KEYS = Object.freeze(Object.keys(LOADERS) as DataKey[]);

/** What has loaded, and what is loading, by key: a cache of frozen data, not a bout's state. */
const loaded = new Map<DataKey, unknown>();
const loading = new Map<DataKey, Promise<void>>();

/** Load `keys`; a key loads once a realm, and a failed load can be asked again. */
export function loadData(keys: Iterable<DataKey>): Promise<void> {
  return Promise.all([...new Set(keys)].map((key) => {
    if (loaded.has(key)) return undefined;
    let pending = loading.get(key);
    if (!pending) {
      pending = LOADERS[key]().then(
        (data) => { loaded.set(key, data); loading.delete(key); },
        (error: unknown) => { loading.delete(key); throw error; });
      loading.set(key, pending);
    }
    return pending;
  })).then(() => undefined);
}

/** `key`'s data; throws, naming `loadData` and `tests/harness/preload-data.mjs`, when it is not loaded. */
export function dataOf<K extends DataKey>(key: K): DataOf[K] {
  if (!loaded.has(key)) throw new Error(`mind data ${JSON.stringify(key)} is not loaded: a screen loads it with loadData(treeData(config)) before building the mind, and Node with tests/harness/preload-data.mjs`);
  return loaded.get(key) as DataOf[K];
}
