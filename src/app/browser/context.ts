import { BUILD_IDENTITY } from "./build-identity.ts";
import { applicationContext } from "../context.ts";

/** The page and its workers use the build identity injected by Vite. */
export const CONTEXT = applicationContext(BUILD_IDENTITY);
