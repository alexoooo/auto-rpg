/**
 * **The Crypt-clearing task's cases**: a party under the subject's Commander, its hero and
 * companions each under its model's own mind, through each of a fixed set of generated levels
 * against each enemy Commander, in repeated trials (`trialMap`), until a standing member reaches
 * the exit, the whole party has fallen, or the protocol's seconds. A Crypt run is deterministic in
 * Node but not bit-equal between JavaScript engines (`crypt.ts`).
 */
import { COMMANDERS, type CommanderConfig } from "../../core/command/commanders.ts";
import type { BodyModel } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import type { BuiltCrypt } from "../crypt.ts";
import type { Cases, Json } from "../evaluation.ts";

/**
 * The protocol: the levels' seeds, the trials of each, the enemies' Commanders, the party's hero
 * and companions, and how long a run lasts at most, s. The seeds are the two of 1 to 30 whose
 * levels have the shortest way from the start to the exit (about 40 m), so that a run can end
 * within the cap. A change here is a new protocol.
 */
const CRYPT_CLEAR = deepFreeze({
  seeds: [10, 25],
  trials: 2,
  enemies: [{ kind: "mob" }, { kind: "independent" }] as CommanderConfig[],
  hero: "workshop-fighter" as BodyModel,
  companions: ["workshop-rogue", "workshop-fighter"] as BodyModel[],
  seconds: 180,
});

/** One run's conditions: the level's seed, the trial and the enemies' Commander. */
export type CryptCondition = { readonly seed: number; readonly trial: number; readonly enemies: CommanderConfig & Json };

/**
 * What a run came to: how it ended (`won` at the exit, `dead`, or still `playing` at the cap), the
 * time read to, s, the party's members and how many of them were out of the fight, and the
 * level's enemies and how many of them were.
 */
export type CryptReading = {
  readonly status: "won" | "dead" | "playing";
  readonly seconds: number;
  readonly members: number;
  readonly lost: number;
  readonly enemies: number;
  readonly defeated: number;
};

/** Why `value` is no Commander's config. */
function faultsOf(value: Json): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(COMMANDERS, kind)) return [`no Commander: a config names its kind (${Object.keys(COMMANDERS).join(", ")})`];
  return COMMANDERS[kind]!.faults(value as unknown as CommanderConfig);
}

function cryptCases(protocol: typeof CRYPT_CLEAR): Cases<CryptCondition, CryptReading, BuiltCrypt> {
  const conditions: CryptCondition[] = [];
  for (const enemies of protocol.enemies) for (const seed of protocol.seeds) for (let trial = 0; trial < protocol.trials; trial++)
    conditions.push({ seed, trial, enemies: enemies as CommanderConfig & Json });
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions,
    seconds: protocol.seconds,
    faults: (value) => faultsOf(value),
    world: ([party], { seed, trial, enemies }, engine) => ({ kind: "crypt", engine,
      crypt: { seed, trial, hero: protocol.hero, companions: protocol.companions, party: party as unknown as CommanderConfig, enemies } }),
    read({ world, run }) {
      const reading = (): CryptReading => ({ status: run.status, seconds: world.time, members: run.party.length, lost: run.party.filter((member) => !member.alive).length,
        enemies: run.enemies.length, defeated: run.enemies.filter((enemy) => !enemy.alive).length });
      return {
        afterStep() {},
        get ended() { return run.status !== "playing" || world.time >= protocol.seconds; },
        reading,
      };
    },
  };
}

/** Every protocol the Crypt-clearing task may be played on, by name. */
export const CRYPT_CLEAR_CASES: Readonly<Record<string, Cases<CryptCondition, CryptReading, BuiltCrypt>>> = Object.freeze({ standard: cryptCases(CRYPT_CLEAR) });
