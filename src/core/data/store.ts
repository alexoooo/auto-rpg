/** **Mind data**, by key: loaded before the minds that read it are built, and read synchronously after. */
export type DataKey = keyof DataOf;

/**
 * **What each key's data is, as its reader declares it**: the module that reads a key adds it here
 * (`declare module` of this module, `interface DataOf`), so the store names no reader's types:
 * every body's straight punch record (`PunchRecords`, `skills/strikes/straight-punch/data/records.ts`), every
 * body's record of each other skill tuned per body (`SkillRecords`, `skills/framework/records.ts`,
 * declared by the skill's part or module), and what
 * the Strike and Rise drills measured every strike and ground edge to bring (`Profile`,
 * `skills/framework/profile.ts`). A key is read (`dataOf`) only as declared.
 */
export interface DataOf {}

/**
 * Each key's loader: a dynamic import of the module that holds its data, so each is a chunk of its
 * own and loads only when asked. The module imports its JSON statically: a dynamic import of JSON
 * needs import attributes in Node, and the bundle keeps such an import's path unresolved. A loader
 * yields the data as its file holds it; its reader's declaration says what that is (`DataOf`).
 */
export type DataLoaders = Readonly<Partial<Record<DataKey, () => Promise<unknown>>>>;

/** What has loaded, and what is loading, by key: a cache of frozen data, not a bout's state. */
const loaded = new Map<DataKey, unknown>();
const loading = new Map<DataKey, Promise<void>>();

/** Load `keys`; a key loads once a realm, and a failed load can be asked again. */
export function loadData(keys: Iterable<DataKey>, loaders: DataLoaders): Promise<void> {
  return Promise.all([...new Set(keys)].map((key) => {
    if (loaded.has(key)) return undefined;
    let pending = loading.get(key);
    if (!pending) {
      const load = loaders[key];
      if (!load) throw new Error(`mind data ${JSON.stringify(key)} has no registered loader`);
      pending = load().then(
        (data) => { loaded.set(key, data); loading.delete(key); },
        (error: unknown) => { loading.delete(key); throw error; });
      loading.set(key, pending);
    }
    return pending;
  })).then(() => undefined);
}

/** `key`'s data; throws, naming `loadData` and `tests/harness/preload-data.mjs`, when it is not loaded. */
export function dataOf<K extends DataKey & keyof DataOf>(key: K): DataOf[K] {
  if (!loaded.has(key)) throw new Error(`mind data ${JSON.stringify(key)} is not loaded: a screen loads it with loadData(treeData(config)) before building the mind, and Node with tests/harness/preload-data.mjs`);
  return loaded.get(key) as DataOf[K];
}
