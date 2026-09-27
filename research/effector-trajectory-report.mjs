/** Archive the three bounded physical screens with their sampled cells and comparison controls. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const screens = [
  ["orientation", 36, "orientation-screen.json"],
  ["chamber", 13, "chamber-screen.json"],
  ["chamberRotation", 15, "chamber-rotation-screen.json"],
];
const compact = row => ({ label: row.label, plan: row.plan, warmPose: row.start.pose,
  targetHands: row.targetHands, primaryContacts: row.primaryContacts, primaryBlocks: row.primaryBlocks,
  bodyContacts: row.bodyContacts, maxBodyEnergyJ: row.maxBodyEnergyJ,
  maxBodyClosingMps: row.maxBodyClosingMps, strongestBodyContact: row.strongestBodyContact,
  preArmourDamage: row.preArmourDamage, postArmourDamage: row.postArmourDamage,
  damageMargin: row.damageMargin });

export function trajectoryReport(directory = "research/runs/effector-expert") {
  const out = { date: "2026-09-27", scope: "one warmed state, seed pair 11/22, left human blade, forced legal plans, no search",
    screens: {} };
  let sharedPose;
  for (const [name, expected, file] of screens) {
    const bytes = readFileSync(`${directory}/${file}`);
    // PowerShell's `>` writes Node stdout as UTF-16LE in this workspace.
    const serialized = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString("utf16le") : bytes.toString("utf8");
    const raw = JSON.parse(serialized);
    if (raw.rows.length !== expected) throw new Error(`${name}: expected ${expected} rows`);
    if (new Set(raw.rows.map(row => row.label)).size !== expected) throw new Error(`${name}: duplicate cells`);
    const poses = new Set(raw.rows.map(row => row.start.pose));
    if (poses.size !== 1) throw new Error(`${name}: unequal warmed states`);
    const pose = [...poses][0];
    sharedPose ??= pose;
    if (pose !== sharedPose) throw new Error(`${name}: different warmup from earlier screen`);
    if (raw.rows.some(row => !row.targetHands.includes("primary"))) throw new Error(`${name}: missing task command`);
    out.screens[name] = { harness: raw.harness, axes: raw.axes, rows: raw.rows.map(compact) };
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = trajectoryReport();
  writeFileSync("research/results/2026-09-27-effector-trajectory-screen.json", JSON.stringify(report, null, 2) + "\n");
  console.log(Object.fromEntries(Object.entries(report.screens).map(([name, screen]) =>
    [name, { cells: screen.rows.length, bestJ: Math.max(...screen.rows.map(row => row.maxBodyEnergyJ)),
      wounds: screen.rows.filter(row => row.preArmourDamage > 0).length }])));
}
