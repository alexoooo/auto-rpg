/**
 * The build's identity (`BUILD_IDENTITY`, `scripts/build-identity.mjs`): Node reads the commit
 * checked out; Vite replaces this module with the same kind of value, fixed for the page.
 */
export { BUILD_IDENTITY } from "../../../scripts/build-identity.mjs";
