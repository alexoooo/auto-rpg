import { readFileSync } from "node:fs";
import { trial } from "./ctl.mjs";
import { pushController } from "./push3.mjs";
const best = JSON.parse(readFileSync(process.argv[2], "utf8")), seed = Number(process.argv[3]);
console.log(JSON.stringify(Object.fromEntries(Object.entries(best.p).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(2) : v]))));
const over = JSON.parse(process.argv[4] ?? "{}"), bridge = JSON.parse(process.argv[5] ?? '{"ease":0.8,"rise":0.75,"pitch":0.8}');
const out = await trial({ seed, trace: process.env.QUIET ? 0 : 6, bridge, controller: pushController({ ...best.p, ...over }) });
if (process.env.QUIET) { const { rows, ...rest } = out; console.log(JSON.stringify(rest)); process.exit(0); }
console.table(out.rows.filter((r, i) => i % 2 === 0).map(({ thigh, trunk, cap, hand, pos, ...r }) => r)); const { rows, ...rest } = out; console.log(JSON.stringify(rest));
