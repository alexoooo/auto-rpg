import { MIND_CATALOGS } from "./catalogs.ts";
import type { Batch } from "./wire.ts";

/** A batch initializes only the data declared by the minds it constructs. */
export async function loadBatchData(batch: Batch): Promise<void> {
  for (const { ask } of batch.asks) {
    if (ask.kind !== "make") continue;
    const { catalog: name, config } = ask.recipe, catalog = MIND_CATALOGS[name];
    if (!catalog) throw new Error(`no catalog is named ${JSON.stringify(name)} here`);
    await catalog.loadData(catalog.treeData(config));
  }
}
