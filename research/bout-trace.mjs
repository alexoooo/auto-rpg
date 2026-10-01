/**
 * One arena bout's row (`playBout`, `bout.mjs`): how it ended, what landed, and the digest of
 * every segment's pose at every step. A change that should change nothing leaves the digest as it
 * was; read it before the change and compare after, on the same machine.
 *
 *   node research/bout-trace.mjs [left] [right] [seconds]
 *
 * The defaults are the Warrior against the Rogue, to the verdict or 30 s.
 */
import { playBout } from "./bout.mjs";

const [left = "workshop-fighter", right = "workshop-rogue", seconds = "30"] = process.argv.slice(2);
console.log(JSON.stringify(await playBout({ left, right }, Number(seconds))));
