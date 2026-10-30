import type { OpeningTuning } from "../perception/openings.ts";
import type { ActionConfig, ExecutorConfig } from "../skills/config.ts";
import { KICK_PATH, type KickTuning } from "../skills/strikes/kick.ts";
import { deepFreeze } from "../state.ts";
import { FIGHTING, type FighterConfig } from "../tactics/config.ts";

/**
 * **A mind's config**: plain data, so it rides in a recipe, a save and a link, its kind naming
 * its controller (`CONTROLLERS`). Each kind of mind declares its own type in its own module; a
 * fight passes one through and reads nothing in it.
 */
export interface MindConfig { readonly kind: string }

const BLADE_EXECUTORS: readonly ExecutorConfig[] = [{ kind: "blade-cut", name: "blade-cut" }, { kind: "blade-thrust", name: "blade-thrust" }];
const BLADE_ACTIONS: readonly ActionConfig[] = BLADE_EXECUTORS.map(executor => ({ name: executor.name, executor: executor.name,
  effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } }));

/** The blade fighter: seeking tactics over a blade's cut and thrust, walking in the stance and lying still once down; empty-handed or holding a blunt item, it strikes with nothing. */
export const BLADE_FIGHTER: FighterConfig = deepFreeze({ kind: "fighter", tactics: FIGHTING, locomotion: { kind: "stance-walk" }, guard: { kind: "shield-guard" },
  executors: BLADE_EXECUTORS, actions: BLADE_ACTIONS, support: null, subs: [{ kind: "lie" }] });

/** Opening scores that favour the trunk over the head: `docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`. */
const BODY_OPENINGS: OpeningTuning = deepFreeze({ head: .3, upperTrunk: 0, middleTrunk: 0 });

/** The Arena's low kick: `docs/reference/front-kicks.md#arena-selection`. */
export const ARENA_KICKS: KickTuning = deepFreeze({ ...KICK_PATH, swingSeconds: .3, contactSpeed: 3 });

/**
 * **The path strikes at the body**: the path strike's executor, its straight blow, cross, hook and
 * downward blow from either hand aimed at the body's openings
 * (`docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`), the downward
 * one thrown from low support (`docs/reference/ground-combat.md#arena-integration`), and the
 * support fold it is thrown from.
 */
export const PATH_STRIKES = deepFreeze({
  executors: [{ name: "paths", kind: "path-strike" as const, overlap: false }],
  actions: (["straight", "cross", "hook", "downward"] as const).map(family => ({ name: family, executor: "paths", family, ...(family === "downward" ? { lower: .5 } : {}),
    effectors: ["hand.right", "hand.left"] as const, regions: [{ kind: "mark" as const, mark: "middle" as const }], aim: { kind: "surface" as const, tuning: BODY_OPENINGS } })),
  support: { kind: "support-fold" as const } });
