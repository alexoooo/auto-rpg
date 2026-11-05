/** Apply the authored JS reporting boundary to a freshly built or unpacked Rapier package. */
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const folder = resolve(process.argv[2]), here = fileURLToPath(new URL(".", import.meta.url));
const source = readFileSync(join(here, "contact-errors.mjs"), "utf8");
for (const extension of ["mjs", "cjs"]) {
  const original = join(folder, "dist", `rapier.${extension}`), base = join(folder, "dist", `rapier.base.${extension}`);
  if (existsSync(base)) throw new Error(`${base} already exists: package a fresh generated bundle`);
  renameSync(original, base);
}
writeFileSync(join(folder, "dist/contact-errors.mjs"), source);
writeFileSync(join(folder, "dist/contact-errors.cjs"), source.replace("export function reportContactErrors", "function reportContactErrors") + "\nmodule.exports = { reportContactErrors };\n");
writeFileSync(join(folder, "dist/rapier.mjs"), 'import { PhysicsPipeline } from "./rapier.base.mjs";\nimport { reportContactErrors } from "./contact-errors.mjs";\nreportContactErrors(PhysicsPipeline);\nexport * from "./rapier.base.mjs";\nexport { default } from "./rapier.base.mjs";\n');
writeFileSync(join(folder, "dist/rapier.cjs"), 'const R = require("./rapier.base.cjs");\nrequire("./contact-errors.cjs").reportContactErrors(R.PhysicsPipeline);\nmodule.exports = R;\n');
