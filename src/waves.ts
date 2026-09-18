import {
  GOLEM_WEAR_SLOTS,
  type GolemSetup,
  type Matchup,
  type SideSetup,
} from "./bout.ts";
import { NAMED_BUILDS, namedBuild, type NamedBuild } from "./golem/roster.ts";
import type { GolemModuleReport } from "./golem/parts-bin.ts";
import { mulberry32 } from "./rng.ts";

/**
 * Waves: one body of yours against a queue of other people's, until one of them finishes you.
 *
 * The second of the two modes the owner asked for. Everything it needs already existed and was
 * not joined up: the roster is the twelve named builds salvaged out of the retired tournament
 * harness (`src/golem/roster.ts`), the enemy minds are the hand-coded golem policies, the reward
 * is the parts bin that has always settled on the verdict edge (`collectSalvage` in `main.ts`),
 * and a wave transition is `rebuild()`, which already throws both bodies away and stands two new
 * ones up. What is new here is the *queue*, and what you carry down it.
 *
 * **No Babylon and no DOM**, the same rule `src/bout.ts` keeps and for the same reason: the run
 * is rules, the rules are where the arguable decisions are, and `tests/waves.test.mjs` argues
 * with them in Node. The one import from `src/golem/` is the roster, which is a table of strings
 * and holds nothing of the engine.
 */

/** One run's whole state. Your *body* is not in here; see `waveMatchup`. */
export interface WaveRun {
  /** Which wave is standing in the ring, counting from one. */
  readonly wave: number;
  /** The order the roster is walked in, fixed when the run starts and then cycled. */
  readonly order: readonly string[];
  readonly seed: number;
  /** Set when a wave beat you. A finished run is only cleared by starting another. */
  readonly over: boolean;
}

/** Who wave `run.wave` puts in front of you. */
export interface WaveEnemy {
  readonly build: NamedBuild;
  /** A `Policy.name` from `POLICIES` in `src/mind.ts`. */
  readonly policy: string;
}

export function startRun(seed: number): WaveRun {
  return { wave: 1, order: rosterOrder(seed), seed, over: false };
}

/**
 * The roster, shuffled once per run.
 *
 * **Shuffled and not sorted, because bodies here are variety and not difficulty.** Ordering the
 * twelve by how hard they are to beat would need a measurement of each against a fixed opponent,
 * and the one measurement this module *did* take -- the mind ladder below -- came back saying the
 * differences it looked for were not there. Inventing an ordering for the bodies instead, off no
 * measurement at all, would be the same mistake with less excuse. So the queue is a shuffle, the
 * run seed names which shuffle, and a run is repeatable from its seed alone.
 */
function rosterOrder(seed: number): readonly string[] {
  const names = NAMED_BUILDS.map((build) => build.name);
  const random = mulberry32(seed);
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return Object.freeze(names);
}

export function waveEnemy(run: WaveRun): WaveEnemy {
  const name = run.order[(run.wave - 1) % run.order.length];
  const build = namedBuild(name);
  // `roster.ts` refuses an unknown build at import, so this cannot fire from the table. It can
  // fire from a `WaveRun` that came from somewhere else, and a wave with no body in it is worth
  // more as an error than as a default golem nobody asked for.
  if (!build) throw new Error(`wave ${run.wave} names no build "${name}"`);
  return { build, policy: wavePolicy(run) };
}

/**
 * Your corner and theirs, as a matchup the arena already knows how to build.
 *
 * You are on the **left** in every wave. Not a coincidence to be tidied away later: the camera,
 * the aim indicator and `Targeting` all follow `humanSide`, and a mode that swapped you between
 * corners between waves would re-point every one of them for no gain a player can see.
 *
 * Your `SideSetup` is passed in rather than held, because it is the matchup's -- which is where
 * the setup screen edits it, where `collectSalvage` writes back what you salvaged, and where
 * `afterWave` writes back what is left of you. One copy of your body, and the run does not own it.
 * It is passed through untouched, unit included: the screen is golem-only by the owner's
 * decision, and a mode that overrode the unit anyway would be deciding that again somewhere a
 * reader of the screen would never look.
 */
export function waveMatchup(run: WaveRun, yours: SideSetup): Matchup {
  const enemy = waveEnemy(run);
  return {
    // The mode travels with the matchup so `modeOf` still answers for the bout being fought and
    // not only for the one on the screen: the host reads it back to know whether a verdict is a
    // wave's or an arena bout's.
    mode: "waves",
    left: { ...yours },
    right: {
      unit: "golem",
      policy: enemy.policy,
      control: "mind",
      handA: "empty",
      handB: "empty",
      golem: { ...enemy.build.setup },
    },
  };
}

/**
 * The verdict edge: forward one wave, or the run is finished.
 *
 * A draw is not a win. The fights this ships on end by exhaustion 48 times out of 48 -- see the
 * table beside `overtimeSeconds` in `src/config.ts` -- so a draw is the rare case, and the rare
 * case going against you is the reading that does not reward standing still.
 */
export function afterWave(run: WaveRun, won: boolean): WaveRun {
  if (run.over) return run;
  if (!won) return { ...run, over: true };
  return { ...run, wave: run.wave + 1 };
}

/**
 * Your body as you walked out of the wave, ready to walk into the next one.
 *
 * Every module reports the fraction of its own health it has left, and that fraction goes back
 * into the build as `GolemSetup.wear` -- all five slots through the one field, for the reason
 * that field's own doc gives. The parts bin's `durability` is left strictly alone here: it is a
 * different lifetime of the same number and `collectSalvage` is its writer.
 *
 * **The wounds are what makes a run end.** The mind ladder measured flat (see `wavePolicy`), so
 * wave twenty is not fought by a better opponent than wave four; it is fought by a worse you.
 * That is the whole difficulty ramp, and it is one this build can honestly claim, because it is
 * the fight's own damage read back rather than a curve somebody drew.
 *
 * A **severed** module comes back on, at the durability it had when its socket broke. Re-fitting
 * your own arm between waves is the kindest reading of a report that says it came off, and the
 * alternative -- a build whose named arm is gone -- is not a build this codebase can express.
 */
export function carriedGolem(
  golem: GolemSetup,
  report: readonly GolemModuleReport[],
): GolemSetup {
  const wear: Record<string, number> = {};
  for (const slot of GOLEM_WEAR_SLOTS) {
    const found = report.find((module) => module.slot === slot);
    if (found) wear[slot] = found.durability;
  }
  return { ...golem, wear };
}

/** A body with no run's wounds on it. What a fresh run, and only a fresh run, starts from. */
export function mendedGolem(golem: GolemSetup): GolemSetup {
  const { wear: _wear, ...rest } = golem;
  return rest;
}

/**
 * Which mind a wave is fought by -- and the measurement that says this is nearly all of the
 * curve there is.
 *
 * The plan for this mode says "difficulty is body x mind", and that premise was tested before
 * anything was built on it. Every golem mind in `POLICIES` was played against `golem-fencer` on
 * the default body, 128 seeds x both corners = **256 bouts each**, supported locomotion, a 90 s
 * cap that every bout finished well inside. Score is wins plus half the draws. One sigma on a
 * row is sqrt(0.25/256) = **0.031**.
 *
 * | mind | score | vs the reference |
 * | --- | ---: | ---: |
 * | `golem-champion` | 0.5156 | +0.5 sigma |
 * | `golem-duelist` | 0.5156 | +0.5 |
 * | `golem-fencer` | 0.5000 | mirror |
 * | `golem-skirmisher` | 0.4941 | -0.2 |
 * | `golem-tactician` | 0.4688 | -1.0 |
 * | `golem-guardian` | 0.4570 | -1.4 |
 * | `golem-form` | 0.4512 | -1.6 |
 * | `golem-planner` | 0.4414 | -1.9 |
 * | `golem-driver` | 0.4414 | -1.9 |
 * | `golem-brawler` | 0.3574 | **-4.8** |
 * | `idle` | 0.0020 | -160 |
 *
 * **Two rungs exist and the rest is one flat cluster.** Eight of the ten designed minds sit
 * inside 0.441 to 0.516 -- a spread of 0.075 where a single row carries +-0.062 at two sigma, so
 * even the extremes of that band are not separated, let alone their neighbours. Ordering the
 * eight into a ladder would be ordering noise, and a wave twelve that claimed to be harder than
 * a wave four on that basis would be a promise the build cannot keep.
 *
 * `idle` is in the table as the instrument's own control rather than as a wave. It is what a
 * result looks like when there *is* a difference, and it is what makes the flat cluster a finding
 * instead of a blind instrument: the same 256 bouts that cannot tell the champion from the
 * planner have no trouble at all with a body that does not move. A statue is also not an enemy,
 * and the fencer needs 33.9 s to finish one, which is not a wave anybody wants to open on.
 *
 * So the curve is honest about its own size: **wave one is the one mind measurably weaker than
 * the pack**, and every wave after it draws from the cluster in an order the run's seed picks --
 * variety, like the bodies, because that is what the evidence supports calling it. The ramp that
 * actually rises is `carriedGolem`.
 */
const WAVE_OPENER = "golem-brawler";

const WAVE_CLUSTER: readonly string[] = Object.freeze([
  "golem-champion", "golem-duelist", "golem-fencer", "golem-skirmisher",
  "golem-tactician", "golem-guardian", "golem-form", "golem-planner", "golem-driver",
]);

function wavePolicy(run: WaveRun): string {
  if (run.wave <= 1) return WAVE_OPENER;
  // Offset from the roster's shuffle so the pairing of body and mind is not the same pairing
  // every run: nine minds and twelve bodies would otherwise walk in lockstep from the same seed.
  const random = mulberry32(run.seed ^ 0x5f3a);
  const pool = [...WAVE_CLUSTER];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool[(run.wave - 2) % pool.length];
}
