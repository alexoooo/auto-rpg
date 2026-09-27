/** Forced-plan screen, not expert headroom. Every plan receives the same warmed real state,
 * reached independently through commands; no body transform or joint is edited.
 * One seed pair and corner screen parameters, then promising plans need held-out mirrors.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { ExpertMind, Program, expertConfig, proposals, poseHash } from "../tests/harness/expert.mjs";
import { captureCombatReports } from "../tests/harness/rollout-reports.mjs";
import { freshBodyCommand, setChannelFlags } from "../src/body-command.ts";
import { humanSetup } from "../src/golem/humanoid/presets.ts";

export const IMPACT_SCREEN_HARNESS = "Node/Havok bout runner, supported equal humans, 0.75 s shadow warmup then one forced legal plan for 1 s, no search, initial separation 1.5 m";

export function impactScreenPlans() {
  const base = proposals(expertConfig("expert-effector@c8,h1"), { hold: freshBodyCommand(), warm: null });
  const plans = base.filter(p => ["duelist", "cut-mid"].includes(p.label));
  for (const kind of ["sweep", "point"]) for (const duration of [.15, .3, .6]) {
    for (const lift of [-.35, 0, .35]) for (const extend of [.75, .95]) {
      const plan = base.find(p => p.label === `target-${kind}`);
      plans.push({ ...plan, label: `${kind}/t${duration}/y${lift}/r${extend}`,
        segs: plan.segs.map(seg => ({ ...seg, duration, lift, extend })) });
    }
  }
  return plans;
}

export async function impactScreenCell({ terminal, plan, side = "left", seeds = [11, 22] }) {
  if (!["blade", "mace", "fist"].includes(terminal) || !["left", "right"].includes(side)
    || !plan?.segs?.length) throw new Error("invalid impact screen cell");
  const other = side === "left" ? "right" : "left";
  const flags = setChannelFlags({ effector: true });
  const expert = new ExpertMind(expertConfig("expert-effector@c8,h1"), seeds[side === "left" ? 0 : 1]);
  const setup = humanSetup(terminal, terminal === "fist" ? "fist" : "plate");
  let bout, evidence;
  try {
    bout = createBout({ left: "humanoid-duelist", right: "humanoid-duelist", seeds,
      leftGolem: setup, rightGolem: setup, [`${side}Mind`]: expert,
      separation: 1.5, locomotionMode: "supported", maxSeconds: 3, physics: await freshHavok() });
    for (let i = 0; i < 45 && bout.active; i++) bout.step();
    if (!bout.active) throw new Error("impact screen ended during warmup");
    const start = { pose: poseHash(bout), own: bout[side].vitality, opponent: bout[other].vitality };
    // This is the same command Program a chosen expert proposal uses, without searching.
    expert.program = new Program(plan);
    evidence = captureCombatReports(bout);
    const targetHands = new Set();
    for (let i = 0; i < 60 && bout.active; i++) {
      bout.step();
      const command = bout[side].control.driver.held;
      for (const hand of ["primary", "secondary"]) if (command?.effectors[hand].target) targetHands.add(hand);
    }
    const end = { own: bout[side].vitality, opponent: bout[other].vitality };
    const reports = evidence.reports.filter(r => r.side === side);
    const primary = reports.filter(r => r.hand === "primary");
    const body = primary.filter(r => !r.blocked);
    const strongest = body.reduce((best, report) => !best || report.energyJ > best.energyJ ? report : best, null);
    return { terminal, side, seeds, label: plan.label, plan, start, end, targetHands: [...targetHands],
      damageMargin: (start.opponent - end.opponent) - (start.own - end.own),
      primaryContacts: primary.length, primaryBlocks: primary.filter(r => r.blocked).length,
      bodyContacts: body.length, maxBodyEnergyJ: Math.max(0, ...body.map(r => r.energyJ)),
      maxBodyClosingMps: Math.max(0, ...body.map(r => r.closingSpeed)),
      strongestBodyContact: strongest && { energyJ: strongest.energyJ, closingSpeed: strongest.closingSpeed,
        edgeAlignment: strongest.edgeAlignment, bladeAlignment: strongest.bladeAlignment,
        tipDistanceM: strongest.tipDistanceM, kind: strongest.kind, weapon: strongest.weapon,
        preArmourDamage: strongest.preArmourDamage, postArmourDamage: strongest.postArmourDamage },
      preArmourDamage: body.reduce((sum, r) => sum + r.preArmourDamage, 0),
      postArmourDamage: body.reduce((sum, r) => sum + r.postArmourDamage, 0) };
  } finally { evidence?.stop(); expert.dispose(); bout?.dispose(); setChannelFlags(flags); }
}

async function main() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const plans = impactScreenPlans(), rows = [];
  for (const terminal of ["blade", "mace", "fist"]) {
    let warmPose;
    for (const plan of plans) {
      const row = await impactScreenCell({ terminal, plan });
      warmPose ??= row.start.pose;
      if (row.start.pose !== warmPose) throw new Error("plans did not receive the same warmed state");
      rows.push(row);
    }
  }
  console.log(JSON.stringify({ harness: IMPACT_SCREEN_HARNESS, rows }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
