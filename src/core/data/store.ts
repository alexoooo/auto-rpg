import type { RisePolicy } from "../mind/ground/learned-rise.ts";
import type { PunchPolicy } from "../skills/learned-punch.ts";
import type { ResearchRiseData } from "./research-rise.ts";

/** **Mind data**, by key: loaded before the minds that read it are built, and read synchronously after. */
export type DataKey = "learned-punch" | "learned-rise" | "research-rise";

interface DataOf {
  "learned-punch": PunchPolicy;
  "learned-rise": RisePolicy;
  "research-rise": ResearchRiseData;
}

/**
 * Each key's loader: a dynamic import of the module that holds its data, so each is a chunk of its
 * own and loads only when asked. The module imports its JSON statically: a dynamic import of JSON
 * needs import attributes in Node, and the bundle keeps such an import's path unresolved.
 */
const LOADERS: { readonly [K in DataKey]: () => Promise<DataOf[K]> } = {
  "learned-punch": () => import("./learned-punch.ts").then((m) => m.LEARNED_PUNCH),
  "learned-rise": () => import("./learned-rise.ts").then((m) => m.LEARNED_RISE),
  "research-rise": () => import("./research-rise.ts").then((m) => m.RESEARCH_RISE),
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
