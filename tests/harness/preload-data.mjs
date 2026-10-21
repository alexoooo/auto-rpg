/**
 * Loads every mind's data (`loadData`, `src/core/data/store.ts`) before anything builds a mind:
 * imported for its side effect by every Node module that builds a data-reading mind, so a script
 * runs alike however it is started, and a worker or child process loads too.
 */
import { DATA_KEYS, loadData } from "../../src/core/data/store.ts";

await loadData(DATA_KEYS);
