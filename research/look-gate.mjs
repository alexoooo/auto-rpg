/**
 * **The look a search needs** ([the skill recipe](../docs/recipes/skill.md#the-procedure)): where a
 * look at a skill's movement is kept (`look.mjs` makes it), the code it is of, and the gate every
 * search passes before it plays a candidate (`requireLook`, called by `cmaSearch`).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/** Where looks are kept. */
export const LOOKS = join(ROOT, "research", "looks");

/** Every file under `dir`, sorted, relative to the repository. */
const filesUnder = (dir) => !existsSync(dir) ? [] : readdirSync(dir).sort().flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? filesUnder(path) : [relative(ROOT, path).replaceAll("\\", "/")];
});

/**
 * **The code a look is of**: the hash of `skill`'s folder, its group's shared code and their records
 * (`src/skills/<group>/<skill>/`, `src/skills/<group>/shared/`, `assets/skills/<group>/<skill>/`, and
 * `assets/skills/<group>/<name>/` for each folder `<name>` of the shared code: a staged way up's
 * record is `staged/`'s), the variation and the settings looked at, and the rate where it is not
 * the game's. A change to any is another look.
 */
export function lookCode(variation, tuning = null, hz = undefined) {
  const skill = variation.split("/")[0], group = readdirSync(join(ROOT, "src", "skills")).find((one) => existsSync(join(ROOT, "src", "skills", one, skill)));
  if (!group) throw new Error(`no skill ${skill} under src/skills`);
  const hash = createHash("sha256").update(JSON.stringify({ variation, tuning, ...(hz === undefined ? {} : { hz }) })), shared = join(ROOT, "src/skills", group, "shared");
  const sharedRecords = !existsSync(shared) ? [] : readdirSync(shared).filter((name) => statSync(join(shared, name)).isDirectory()).sort().map((name) => join(ROOT, "assets/skills", group, name));
  for (const file of [join(ROOT, "src/skills", group, skill), shared, join(ROOT, "assets/skills", group, skill), ...sharedRecords].flatMap(filesUnder))
    hash.update(file).update(readFileSync(join(ROOT, file)));
  return hash.digest("hex").slice(0, 12);
}

/** Where the look of `body`'s `variation` at `code` is kept. */
export const lookDir = (body, variation, code) => join(LOOKS, body, variation.replace("/", "-"), code);

/**
 * **The gate**: throws unless the look of `body`'s `variation` (with `tuning`, the search's start)
 * at the skill's code now has a verdict that says the movement looks like the motion and works some
 * of the time. Every search calls it before it plays a candidate.
 */
export function requireLook({ body, variation, tuning = null }) {
  const dir = lookDir(body, variation, lookCode(variation, tuning)), verdict = join(dir, "verdict.md");
  const how = `look at it first: npm run look -- ${body} ${variation}${tuning ? " --tuning <its settings>" : ""}, read the strips, and write ${relative(ROOT, verdict)}`;
  if (!existsSync(verdict)) throw new Error(`no look at ${body}'s ${variation} as its code is now; ${how}`);
  const text = readFileSync(verdict, "utf8");
  if (!/^Looks like the motion: yes\b/m.test(text) || !/^Works some of the time: yes\b/m.test(text))
    throw new Error(`the look at ${body}'s ${variation} (${relative(ROOT, verdict)}) does not say it looks like the motion and works some of the time; its movement goes back to its code, not to a search`);
}
