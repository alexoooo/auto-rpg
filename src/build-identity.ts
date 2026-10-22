/**
 * The build's identity and its file table (`fileTable`, `scripts/build-identity.mjs`): Node reads
 * the current input content; Vite replaces this module with the same values, fixed for the page.
 */
export { BUILD_IDENTITY, fileTable as buildFiles } from "../scripts/build-identity.mjs";
