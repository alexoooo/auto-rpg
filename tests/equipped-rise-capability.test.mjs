/**
 * **Up again, holding both** (`research/rising-bed.mjs --loadouts`; Node stand, core World, Rapier,
 * 120 Hz, Balance 0): the Warrior and the Rogue shoved the target's sixteen ways with sword and
 * buckler, and with the club, rising by the game's Stand up. With sword and buckler each stands,
 * verified and walked, at least as often as with the club on the same falls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

test("sword and buckler stand up as often as the club on the same falls", { timeout: 3600_000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), "equipped-rise-")), out = join(folder, "report.json");
  try {
    await promisify(execFile)(process.execPath, ["research/rising-bed.mjs", "--loadouts", "buckler,sword;empty,club", "--sub", "stand-up", "--out", out], { maxBuffer: 1 << 26 });
    const report = JSON.parse(await readFile(out, "utf8")), stood = new Map(report.groups.map((group) => [group.key, group]));
    for (const model of ["workshop-fighter", "workshop-rogue"]) {
      const equipped = stood.get(`shoved/${model}/buckler,sword`), club = stood.get(`shoved/${model}/empty,club`);
      assert.equal(equipped?.all, 16, `${model}: the fixture did not play sixteen falls with sword and buckler`);
      assert.equal(club?.all, 16, `${model}: the fixture did not play sixteen falls with the club`);
      assert.ok(equipped.stood >= club.stood, `${model}: ${equipped.stood}/16 stood with sword and buckler against ${club.stood}/16 with the club`);
    }
  } finally { await rm(folder, { recursive: true, force: true }); }
});
