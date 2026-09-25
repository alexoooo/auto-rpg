// The control clock (`CONFIG.world.controlHz`): a mind decides every `physicsHz / controlHz`
// substeps and the host re-applies its command in between. See
// `docs/analysis/2026-09-25-rate-control-clock.md`.
import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/config.ts";
import { stepControlledPair } from "../src/control-host.ts";
import { GolemControlEndpoint } from "../src/golem/golem-control.ts";
import { policyMind } from "../src/mind.ts";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";

/** Run `body` at the given rates, and put the shipped ones back whatever happens. */
const atRates = async (physicsHz, controlHz, body) => {
  const was = { physicsHz: CONFIG.world.physicsHz, controlHz: CONFIG.world.controlHz };
  CONFIG.world.physicsHz = physicsHz;
  CONFIG.world.controlHz = controlHz;
  try { return await body(); } finally { Object.assign(CONFIG.world, was); }
};

/**
 * A decision and a substep are two clocks, and each consumer gets its own.
 *
 * The mind is told how long its decision stands (`every` substeps); the command it returns is
 * applied once per substep, and every application is one substep long -- on the substep it was
 * decided on as on each one it is held for. Until 2026-09-25 the host handed the decision's
 * interval to `apply` as well, so a decided substep was a whole interval long to whatever `apply`
 * integrated and each held substep after it counted again. Stubs, not a golem: the property is
 * the host's and the driver's, and a stub can see every call.
 */
test("a_decision_is_told_its_interval_and_each_substep_applies_one_substep", async () => {
  await atRates(120, 60, () => {
    const substep = 1 / 120;
    const calls = [];
    const pair = ["left", "right"].map((side) => {
      let decided = 0;
      const control = new GolemControlEndpoint({
        initialMind: {
          name: "counter",
          decide: (_view, dt) => {
            calls.push({ side, what: "decide", dt });
            decided += 1;
            return { tag: `${side}-${decided}` };
          },
        },
        view: {}, canStep: () => true, stopBody: () => {},
        apply: (dt, intent) => calls.push({ side, what: "apply", dt, tag: intent.tag }),
        policies: [{ name: "counter", label: "Counter" }],
      });
      return {
        control,
        observe: (_opponent, _clock, publish) => calls.push({ side, what: "observe", publish }),
      };
    });
    for (let i = 0; i < 6; i += 1) stepControlledPair(pair[0], pair[1], substep, i * substep);

    const left = calls.filter((call) => call.side === "left");
    assert.deepEqual(left.filter((call) => call.what === "observe").map((call) => call.publish),
      [true, false, true, false, true, false], "the view is published on decided substeps only");
    const decides = left.filter((call) => call.what === "decide");
    assert.equal(decides.length, 3, "two substeps a decision at 120 Hz physics and 60 Hz control");
    for (const call of decides) assert.ok(Math.abs(call.dt - 2 * substep) < 1e-12, `mind told ${call.dt}`);
    const applies = left.filter((call) => call.what === "apply");
    assert.deepEqual(applies.map((call) => call.tag),
      ["left-1", "left-1", "left-2", "left-2", "left-3", "left-3"], "a decision is held until the next");
    for (const [i, call] of applies.entries()) {
      assert.ok(Math.abs(call.dt - substep) < 1e-12, `substep ${i} applied for ${call.dt} s, not one substep`);
    }
  });
});

/**
 * Holding a command through the host is exactly a mind that repeats itself.
 *
 * The reference decides on every substep, as the shipped rate does, through a mind that asks the
 * real one on every `every`-th call only -- told the interval -- and returns the same intent in
 * between. If the host's hold is what it claims to be, only the view and the decision leave the
 * physics clock, and the two runs are the same simulation to the last bit: every part of both
 * golems, every substep, through the opening exchange (the first cut lands at 0.33 s).
 *
 * Mutated, it goes red when the host tells the mind the substep instead of the interval and when
 * `hold` stops re-applying the command. It does **not** see `beginSubstep` moved behind the
 * decision, even over 1.5 s: in this opening a root velocity one substep old moves nothing, so
 * that ordering is not pinned here. Node bout runner, 240 Hz physics.
 */
test("holding_a_command_is_a_zero_order_hold_of_the_mind", async () => {
  const run = async (controlHz, mindHold) => atRates(CONFIG.world.physicsHz, controlHz, async () => {
    const seeds = [2158207037, 3265167439];
    const held = (mind) => {
      if (mindHold <= 1) return mind;
      const decide = mind.decide.bind(mind);
      let calls = 0, last = null;
      mind.decide = (view, dt) => {
        if (calls++ % mindHold === 0 || last === null) last = decide(view, dt * mindHold);
        return last;
      };
      return mind;
    };
    const trace = [];
    const bout = createBout({
      left: "golem-brawler", right: "golem-miser", seeds, maxSeconds: 150,
      locomotionMode: "supported", physics: await freshHavok(),
      leftMind: held(policyMind("golem-brawler", seeds[0])),
      rightMind: held(policyMind("golem-miser", seeds[1])),
      onSample: ({ left, right }) => {
        const row = [];
        for (const body of [left, right]) {
          for (const limb of body.limbs) {
            const { position: p, rotationQuaternion: q } = limb.part.mesh;
            row.push(p.x, p.y, p.z, q?.x ?? 0, q?.y ?? 0, q?.z ?? 0, q?.w ?? 1);
          }
        }
        trace.push(row);
      },
    });
    for (let frame = 0; frame < 27 && bout.step(); frame += 1) { /* 0.45 s */ }
    bout.dispose();
    return trace;
  });

  const physicsHz = CONFIG.world.physicsHz;
  // The control: deciding every substep is a different simulation, so an equality below is about
  // the hold and not a window too short for the decisions to have moved anything.
  const shipped = await run(physicsHz, 1);
  for (const every of [2, 4]) {
    const host = await run(physicsHz / every, 1);
    const mind = await run(physicsHz, every);
    assert.ok(host.length >= 0.4 * physicsHz, `the bout ran ${host.length} substeps`);
    assert.equal(host.length, mind.length);
    assert.ok(host.some((row, i) => row.some((value, k) => !Object.is(value, shipped[i]?.[k]))),
      `every ${every}: holding moved nothing against deciding every substep, so this proves nothing`);
    for (let i = 0; i < host.length; i += 1) {
      const differs = host[i].findIndex((value, k) => !Object.is(value, mind[i][k]));
      assert.equal(differs, -1, `every ${every}: substep ${i} differs at coordinate ${differs}`);
    }
  }
});
