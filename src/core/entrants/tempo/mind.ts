import { commandable } from "../../body.ts";
import { actionConfigFaults } from "../../mind/action-config.ts";
import { OPTIONS, STAND_UP, type ReflexConfig, type SkillKit, type SubMindConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { fighterBody, fighterSkills, kitFaults } from "../../mind/fighter.ts";
import { number } from "../../mind/fields.ts";
import type { BodyHost } from "../../mind/host.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { slotList, slotOne, type Slot } from "../../mind/parts.ts";
import { driveBy } from "../../mind/tactics.ts";
import type { Skills } from "../../skills/skills.ts";
import { guardPosture } from "../../skills/guard.ts";
import { deepFreeze } from "../../state.ts";
import { tempoTactics } from "./tactics.ts";

/**
 * **The tempo fighter's config**: its skills (`SkillKit`), its reflexes and the sub-minds it hands
 * its body to when down, and its rhythm: it rests `rest` s just outside its foe's reach (up to
 * `margin` m past it), steps in for `burst` blows, at most `commit` s, and steps back out.
 */
export interface TempoConfig extends SkillKit {
  readonly kind: "tempo";
  readonly reflexes: readonly ReflexConfig[];
  readonly subs: readonly SubMindConfig[];
  readonly burst: number;
  readonly rest: number;
  readonly margin: number;
  readonly commit: number;
}

/** Its rhythm's bounds, least and most: blows a burst, s of rest, m past the foe's reach, s in reach. */
const BOUNDS = deepFreeze({ burst: [1, 6], rest: [0, 5], margin: [0, 1], commit: [.2, 5] } as const);

/** As it starts: the options fighter's skills and cover, the game's stand-up, two blows, a short rest. */
const TEMPO: TempoConfig = deepFreeze({ kind: "tempo", locomotion: OPTIONS.locomotion, guard: OPTIONS.guard, executors: OPTIONS.executors,
  actions: OPTIONS.actions, support: OPTIONS.support, reflexes: OPTIONS.reflexes, subs: [STAND_UP], burst: 2, rest: .8, margin: .2, commit: 1.5 });

/** What is wrong with `config`, each a sentence: its kit's faults, a setting out of its bounds, no way up, or no blow standing. */
function tempoFaults(config: TempoConfig): readonly string[] {
  const faults = [...kitFaults(config)];
  for (const key of ["burst", "rest", "margin", "commit"] as const) {
    const [least, most] = BOUNDS[key], value = config[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < least || value > most || key === "burst" && !Number.isInteger(value)) faults.push(`${key}: ${least} to ${most}`);
  }
  if (!Array.isArray(config.subs) || config.subs.length === 0) faults.push("subs: a way up when down");
  if (Array.isArray(config.actions) && !config.actions.some((action) => action?.lower === undefined)) faults.push("actions: a blow thrown standing");
  return faults;
}

/** Its slots: a skill of each role, as the options fighter's, its reflexes and its sub-minds. */
const SLOTS: readonly Slot[] = Object.freeze([
  slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
  slotOne("support", "Low support", "support", true), slotList("reflexes", "Reflexes", "reflex"), slotList("subs", "When down", "sub-mind"),
  slotOne("motor", "Motor control", "motor", true, "Whole-body solve"),
]);

/** **A tempo fighter**: its body and sub-minds (`fighterBody`), driven by its rhythm (`tempoTactics`) over its skills. */
function createTempo(host: BodyHost, config: TempoConfig, wiring: MindWiring) {
  const body = host.command(fighterBody(config, wiring));
  let skills: Skills;
  skills = driveBy(body, tempoTactics(host.spec, config, wiring), (made, driving) => fighterSkills(made, host.clock, config, driving, () => skills?.report.ledger ?? []));
  return { skills, state: skills.state };
}

/** **The tempo fighter** as an entrant: hit and run on a fixed rhythm. */
export const TEMPO_MIND = controller<TempoConfig>({
  role: "mind", label: "Tempo fighter", stage: "game", slots: SLOTS, defaults: TEMPO,
  fields: [number("burst", "Blows a burst", ...BOUNDS.burst, 1, ""), number("rest", "Rest", ...BOUNDS.rest, .1, "s"),
    number("margin", "Beyond reach", ...BOUNDS.margin, .05, "m"), number("commit", "Longest in reach", ...BOUNDS.commit, .1, "s")],
  keys: { kind: true, locomotion: true, guard: true, executors: true, actions: true, support: true, reflexes: true, subs: true, motor: true,
    burst: true, rest: true, margin: true, commit: true },
  fits: (spec, config) => commandable(spec) && actionConfigFaults(spec, config.executors, config.actions).length === 0,
  faults: tempoFaults,
  presets: deepFreeze({ tempo: { label: "Tempo fighter", config: TEMPO } }),
  builtIn: guardPosture,
  create: createTempo,
});
