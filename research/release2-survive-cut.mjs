/**
 * Release 2's question 17: why survive-cut cannot be played on five human bodies (the headroom
 * audit, `docs/analysis/2026-09-26-headroom.md` (in git at c76ce6bc) section 3: 39 or 40 of 40 starts void). Replays the
 * audit's own starts -- the seeds `research/drills.mjs` draws, `seed("drills", drill, build,
 * obuild, i)` -- with the drill's control rung alone and a trace, and files each start by what the
 * reference's cut met first and what the idle body's bar lost.
 *
 *     node research/release2-survive-cut.mjs [--bodies a,b] [--obuild default] [--runs 40]
 *
 * Harness: the drill runner (`runDrill` in `tests/harness/drills.mjs`, exact forks), one Havok arena
 * per start, sequential in this realm. Write-up: `docs/analysis/2026-09-26-release-2-questions.md` (in git at c76ce6bc),
 * section 6.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { runDrill } from "../tests/harness/drills.mjs";
import { auditBuild } from "./headroom-builds.mjs";
import { seed } from "./schedule.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;

/** What the reference's cut met first on the idle body, from the control's trace. */
export function firstMet(events, subject) {
  const theirs = events.filter((e) => e.side !== subject);
  if (!theirs.length) return "nothing";
  const e = theirs[0];
  if (e.blocked || e.guarded) return "held item";
  if (/upper|fore|hand|collar|wrist|roll ring|fist/i.test(e.limb ?? "")) return "arm";
  return "body";
}

const { values } = parseArgs({ options: {
  bodies: { type: "string", default: "warrior,warrior-sword,warrior-unarmed,rogue-sword,default" },
  obuild: { type: "string", default: "default" }, runs: { type: "string", default: "40" },
} });
const out = join("research", "runs", "release2", "survive-cut");
mkdirSync(out, { recursive: true });
const rows = [];
for (const body of values.bodies.split(",")) {
  const starts = [];
  for (let i = 0; i < Number(values.runs); i += 1) {
    const s = seed("drills", "survive-cut", body, values.obuild, i);
    const r = await runDrill({ drill: "survive-cut", subjectSetup: auditBuild(body).setup,
      opponentSetup: auditBuild(values.obuild).setup, seed: s, rungs: ["idle"], trace: true });
    if (r.skipped || r.refused) { starts.push({ seed: s, skipped: r.skipped ?? r.refused }); continue; }
    const c = r.control ?? r.rungs.idle;
    const events = c.events ?? [];
    const theirs = events.filter((e) => e.side !== r.subject);
    starts.push({ seed: s, line: r.start.params.line, void: Boolean(r.void), wound: c.margin, first: firstMet(events, r.subject),
      landed: theirs.filter((e) => e.damage > 0 && e.kind !== "weak").map((e) => ({ limb: e.limb, kind: e.kind, damage: e.damage })) });
  }
  const n = starts.filter((s) => !s.skipped).length;
  const count = (f) => starts.filter(f).length;
  const armDamage = starts.flatMap((s) => s.landed ?? []).filter((e) => /upper|fore|hand|collar|wrist/i.test(e.limb));
  const row = { body, obuild: values.obuild, n, void: count((s) => s.void),
    first: Object.fromEntries(["held item", "arm", "body", "nothing"].map((k) => [k, count((s) => s.first === k)])),
    woundMedian: starts.map((s) => s.wound).filter(Number.isFinite).sort((a, b) => a - b)[Math.floor(n / 2)] ?? null,
    armBlows: armDamage.length, armDamage: armDamage.reduce((a, e) => a + e.damage, 0),
    byLine: Object.fromEntries(["high", "middle", "low"].map((l) => [l, `${count((s) => s.line === l && !s.void)}/${count((s) => s.line === l)}`])),
    starts };
  rows.push(row);
  console.log(`${body.padEnd(18)} n ${n} void ${row.void} first: ${JSON.stringify(row.first)} wound median ${row.woundMedian?.toFixed(3)} admitted by line ${JSON.stringify(row.byLine)} arm blows ${row.armBlows}`);
}
writeFileSync(join(out, `survive-cut-${values.obuild}.json`), `${JSON.stringify({ harness: "drill runner (runDrill), control rung only, trace", rows }, null, 1)}\n`);
