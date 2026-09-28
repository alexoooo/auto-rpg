/** Independent motor-ceiling and command-rate sweep. No shipped tuning changes.
 * Node impact bench: awake anatomical module on a fixed stand, standard stroke,
 * first unobstructed then into a gravity-free 90 kg sphere placed from that stroke.
 * Target placement changes with the stroke; momentum is not a common-target comparison.
 * Optional --clamp sweeps the servo velocity ceiling with tone/rate held in each group.
 * This separates sensitivities, not combat headroom.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { HUMAN_ARM_DRIVE } from "../src/golem/humanoid/arm.ts";
import { strokeProbe } from "../tests/harness/impact-bench.mjs";

export const ARM_LIMIT_HARNESS = "Node impact bench, awake anatomical module on fixed stand, standard stroke after 1.5 s guard, 90 kg gravity-free sphere, two sequential passes";

export async function humanArmLimitCell({ terminal = "blade", tone = 1, armSpeed = 1, velocityLimit = HUMAN_ARM_DRIVE.velocityLimit } = {}) {
  if (!["blade", "mace", "fist"].includes(terminal) || !Number.isFinite(tone) || tone < 0
    || !Number.isFinite(velocityLimit) || velocityLimit <= 0
    || !Number.isFinite(armSpeed) || armSpeed < 0.5 || armSpeed > 1.5) throw new Error("invalid human arm limit cell");
  const impact = await strokeProbe({ moduleId: `effector.anatomical.${terminal}`, massKg: 90,
    tone, attributes: { armSpeed }, overrides: [[HUMAN_ARM_DRIVE, { velocityLimit }]] });
  const valid = !impact.overlapped && impact.touched !== false && Number.isFinite(impact.sphereDvMps);
  return { terminal, tone, armSpeed, velocityLimit, ...impact,
    momentumNs: valid ? impact.massKg * impact.sphereDvMps : null,
    energyJ: valid ? 0.5 * impact.massKg * impact.sphereDvMps ** 2 : null };
}

async function main() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const rows = [];
  const clamps = process.argv.includes("--clamp") ? [8, 16, 24, 48] : [HUMAN_ARM_DRIVE.velocityLimit];
  // Sequential: Havok's native state is realm-global.
  for (const terminal of ["blade", "mace", "fist"]) {
    for (const armSpeed of [0.5, 1, 1.5]) for (const tone of [0.5, 1, 2, 4]) {
      for (const velocityLimit of clamps) {
        rows.push(await humanArmLimitCell({ terminal, armSpeed, tone, velocityLimit }));
      }
    }
  }
  console.log(JSON.stringify({ harness: ARM_LIMIT_HARNESS, velocityClampsRadS: clamps,
    note: "Each group varies one servo velocity ceiling independently of rate and tone. Each cell has its own sphere placement.", rows }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
