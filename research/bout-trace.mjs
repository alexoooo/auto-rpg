/**
 * One arena bout's row (`playBout`, `bout.mjs`): how it ended, what landed, and the digest of
 * every segment's pose at every step. A change that should change nothing leaves the digest as it
 * was; read it before the change and compare after, on the same machine.
 *
 *   node research/bout-trace.mjs [left] [right] [seconds] [--mind '<MindConfig JSON>']
 *
 * The defaults are the Warrior against the Rogue, to the verdict or 30 s. With `--mind` both sides
 * have that mind in place of the game's (`FIGHTER`).
 */
import { playBout } from "./bout.mjs";

const args = process.argv.slice(2), at = args.indexOf("--mind");
const mind = at < 0 ? null : JSON.parse(args.splice(at, 2)[1]);
const [left = "workshop-fighter", right = "workshop-rogue", seconds = "30"] = args;
console.log(JSON.stringify(await playBout(mind ? { left, right, minds: { left: mind, right: mind } } : { left, right }, Number(seconds))));
