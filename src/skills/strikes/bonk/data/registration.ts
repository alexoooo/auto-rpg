import { bodyRecords } from "../../../framework/records.ts";
import type { DataLoaders } from "../../../../core/data/store.ts";

/** The bonk's body records and identity. */
export const BONK_DATA = { bonk: bodyRecords(() => import("./bonk.ts").then(m => m.BONK_RECORDS)) } satisfies DataLoaders;
