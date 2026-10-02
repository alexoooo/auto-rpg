/**
 * **One run of the targets' battery** (`core-targets.mjs`, `core-placed.mjs`): the lab's Routine
 * once round its loop on a stand of its own, and what each of its targets read. Node core stand,
 * Rapier, no assist, the arena's rules.
 */
import { labActor } from "../src/lab/actor.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { ROUTINE_HANDS, startRoutine } from "../src/lab/routine.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

/** Seconds a loop may take beyond its walk before the run is called stuck: the walk is about 20 s, a target about 5. */
const WALK_SECONDS = 40, TARGET_SECONDS = 10;

/**
 * The Routine of `model` holding `held` in its right hand, its targets drawn from `seed`, run from
 * target `from` to the loop's end at `hz`; `skills`, an experiment's, in place of the skills'
 * defaults. With a hand empty the hands strike in turn; with something held, the right at every
 * target. Returns how the run ended, each target's stratum, and each reading.
 */
export async function runTargets({ model, held, seed, from, targets, hz, skills }) {
  const stand = await coreStand(loadoutSpec({ model, right: held, left: "empty" }), { ground: true, hz });
  const routine = startRoutine(labActor(stand.built, stand.world), { targets, seed, from, hands: held === "empty" ? ROUTINE_HANDS : ["right"], skills });
  try {
    const most = stand.seconds(WALK_SECONDS + TARGET_SECONDS * (targets - from));
    let t = 0, doing = routine.doing();
    // What it was doing as it went down is what it was doing the step before.
    while (t < most && routine.tactics.loops < 1 && !routine.body.view.down) { doing = routine.doing(); stand.step(1); t++; }
    return {
      ended: routine.tactics.loops >= 1 ? "looped" : routine.body.view.down ? `fell (${doing})` : "out of time",
      seconds: stand.world.time,
      strata: (routine.tactics.targets ?? []).slice(from).map((target) => target.stratum),
      readings: routine.readings.map((r) => ({
        stratum: r.target.stratum, at: [...r.target.at], hand: r.hand, strike: r.strike?.name ?? null, kind: r.strike?.kind ?? null, band: r.strike?.band ?? null, up: r.strike?.up ?? null,
        seconds: r.seconds, hung: r.hung, nearest: r.nearest,
        blow: r.blow && { damage: r.took.damage, energy: r.blow.energy, closing: r.blow.closing, with: r.gave.item ?? r.gave.segment },
        fell: r.fell,
      })),
    };
  } finally { routine.dispose(); stand.dispose(); }
}
