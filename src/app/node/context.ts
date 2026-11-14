import { BUILD_IDENTITY } from "./build-identity.ts";
import { applicationContext } from "../context.ts";

/** Node's application choices and its build's identity. */
export const CONTEXT = applicationContext(BUILD_IDENTITY);
