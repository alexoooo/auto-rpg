/**
 * Node/Havok bout-runner diagnostic, supported human bodies, idle opponent four metres away.
 * One second at rest, then one 0.6-second task proposal, followed by a held endpoint.
 * Separates requested-to-commanded geometry from commanded-to-physical motor following.
 * It measures neither damage nor contact-excluded tip speed and is not a headroom result.
 * Run: node research/effector-proposal-bench.mjs
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { freshBodyCommand, setChannelFlags } from "../src/body-command.ts";
import { effectorTrajectory, applyEffectorTrajectory } from "../src/effector-trajectories.ts";
import { humanSetup } from "../src/golem/humanoid/presets.ts";

export const PROPOSAL_BENCH = "Node/Havok bout runner, supported human, idle opponent at 4 m, 1 s rest + 0.6 s trajectory + 2.4 s hold";
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export async function proposalBench({ kind = "sweep", terminal = "blade", hand = "primary", force = 1 } = {}) {
  if (!["sweep", "point", "soft"].includes(kind) || !["blade", "fist", "mace"].includes(terminal)
    || !["primary", "secondary"].includes(hand) || !Number.isFinite(force) || force < 0 || force > 1) {
    throw new Error("invalid proposal bench configuration");
  }
  const previous = setChannelFlags({ effector: true });
  let bout;
  try {
    let elapsed = 0;
    const command = freshBodyCommand();
    const spec = effectorTrajectory(kind, hand);
    spec.force *= force;
    const mind = { name: "proposal-bench", command(view, dt) {
      if (elapsed >= 1) applyEffectorTrajectory(command, view, spec, elapsed - 1);
      elapsed += dt;
      return command;
    } };
    bout = createBout({ left: "idle", right: "idle", leftMind: mind, seeds: [11, 22],
      leftGolem: humanSetup(terminal, terminal), rightGolem: humanSetup(), separation: 4,
      locomotionMode: "supported", maxSeconds: 5, physics: await freshHavok() });
    const module = bout.left.effectorModules[hand === "primary" ? 0 : 1].module;
    const plugin = bout.scene.getPhysicsEngine().getPhysicsPlugin();
    for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
    const samples = [];
    for (let frame = 0; frame < 240; frame++) {
      bout.step();
      const target = command.effectors[hand].target;
      if (!target) continue;
      const view = module.view();
      // The command was sampled before the last control increment, not at the frame boundary.
      samples.push({ seconds: elapsed - 1,
        requested: { ...target.position }, commanded: { x: view.commandedTip.x, y: view.commandedTip.y, z: view.commandedTip.z },
        actual: { x: view.tip.x, y: view.tip.y, z: view.tip.z },
        requestError: distance(view.commandedTip, target.position),
        followingError: distance(view.tip, view.commandedTip),
        totalError: distance(view.tip, target.position) });
    }
    return { harness: PROPOSAL_BENCH, kind, terminal, hand, force: spec.force,
      samples, final: samples.at(-1),
      damage: { left: bout.result().left.damage, right: bout.result().right.damage } };
  } finally { bout?.dispose(); setChannelFlags(previous); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(PROPOSAL_BENCH);
  for (const terminal of ["blade", "fist", "mace"]) for (const hand of ["primary", "secondary"])
    for (const kind of ["sweep", "point", "soft"]) {
      const { samples, ...result } = await proposalBench({ kind, terminal, hand });
      console.log(JSON.stringify(result));
    }
}
