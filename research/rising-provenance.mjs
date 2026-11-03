/** Hash the actual runtime source graph, its data and the locked/vendored engine for a search stage (`implementationOf`). */
import { implementationOf } from "../scripts/build-identity.mjs";

export const risingImplementation = (entries) => implementationOf(entries);
