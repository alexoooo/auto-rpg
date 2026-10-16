import { commandable, createBody } from "../../body.ts";
import type { BuiltBody } from "../../build/build-body.ts";
import type { BodySpec } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { World } from "../../world.ts";
import { COMBINATION } from "../../skills/combination.ts";
import { COUNTER_PUNCHER, MOVE, SCRAPPER, STAND_UP, type ActionConfig, type FighterConfig, type OptionsConfig, type SubMindConfig } from "../config.ts";
import { actionConfigFaults } from "../action-config.ts";
import { fighterBody, fighterFaults, fighterSkills } from "../fighter.ts";
import { NO_COVER } from "../intent.ts";
import type { MindWiring } from "../minds.ts";
import { SUB_MIND_PARTS, subMind } from "../sub-minds.ts";
import { driveBy, type Sight, type Tactics } from "../tactics.ts";
import type { Skills } from "../../skills/skills.ts";
import { setDistance } from "./distance.ts";
import { metaController, valued } from "./meta.ts";
import { downHalf, downOption, type DownModel } from "./down.ts";
import { holdEdge } from "./edge.ts";
import { evade } from "./evade.ts";
import type { Option, Situation } from "./option.ts";
import { strikeLow } from "./low.ts";
import { followOrders } from "./orders.ts";
import { cover, reflexLayer } from "./reflex.ts";
import { situationReader } from "./situation.ts";
import { strike } from "./strike.ts";
import { CLINCH, WEIGHTS } from "./value.ts";
import { walker } from "./walk.ts";

/** Its blow at a low foe: the Scrapper's, thrown from low support. */
const LOW = (() => {
  const low = SCRAPPER.actions.find((action) => action.lower !== undefined);
  if (!low) throw new Error("the Scrapper has no low blow");
  return low;
})();

/** Its one-two: a combination (`COMBINATION`) at the head, either hand first, as the Counter-puncher's punch aims. */
const ONE_TWO = (() => {
  const punch = COUNTER_PUNCHER.actions[0];
  if (!punch) throw new Error("the Counter-puncher has no punch");
  return deepFreeze({ ...punch, name: "one-two", executor: "combination" });
})();

/**
 * The skills it fights with: the Counter-puncher's (`COUNTER_PUNCHER`), its straight punch with
 * either hand, thrown as a combination of one drive (`COMBINATION`), which waits for its poise and
 * leaves its hand to the guard coming back; its one-two (`ONE_TWO`); and the Scrapper's for a low foe, its low blow and the
 * support fold it is thrown from; and its gaits, Classic's (`MOVE`): braced near, and farther the walk that runs where it asks a run's pace.
 */
const SKILLS: FighterConfig = deepFreeze({ ...COUNTER_PUNCHER, locomotion: MOVE,
  executors: [...COUNTER_PUNCHER.executors.map((executor) => executor.name === "punch" ? { name: "punch", kind: "combination" as const, ...COMBINATION, drives: 1 } : executor),
    { name: "combination", kind: "combination", ...COMBINATION },
    ...SCRAPPER.executors.filter((executor) => executor.name === LOW.executor)],
  actions: [...COUNTER_PUNCHER.actions, ONE_TWO, LOW], support: SCRAPPER.support });

/** How many blows an action of its skills throws: a combination its drives, else one. */
const throws = (action: ActionConfig): number => {
  const executor = SKILLS.executors.find((one) => one.name === action.executor);
  return executor?.kind === "combination" ? executor.drives : 1;
};
if (fighterFaults(SKILLS).length) throw new Error(`the options fighter's skills: ${fighterFaults(SKILLS).join("; ")}`);

/** How it holds the edge of its foe's reach: as the Counter-puncher does. */
const EDGE = (() => {
  const edge = "list" in SKILLS.tactics ? SKILLS.tactics.list.find((item) => item.kind === "edge") : undefined;
  if (edge?.kind !== "edge") throw new Error("the Counter-puncher holds no edge");
  return edge;
})();

/** The longest its cover holds a hand up against one run of blows, s. */
const COVER_LONGEST = 1;

/** What it does down, by rank: the sub-mind each down option is carried out by, and how it is priced. */
const DOWN: readonly (readonly [string, SubMindConfig, DownModel])[] = deepFreeze([
  ["get up", STAND_UP, { seconds: 5, stands: .7, shelter: 0 }],
  ["roll away", SUB_MIND_PARTS["get-away"].defaults, { seconds: 2, stands: 0, shelter: .5 }],
  ["fight from the ground", SUB_MIND_PARTS["ground-fight"].defaults, { seconds: 2, stands: 0, shelter: .3 }],
  ["lie still", { kind: "lie" }, { seconds: 2, stands: 0, shelter: 0 }],
]);

/** Whether a body of `spec` takes the options fighter's commands and carries out its skills' actions. */
export const optionsFit = (spec: BodySpec): boolean => commandable(spec) && actionConfigFaults(spec, SKILLS.executors, SKILLS.actions).length === 0;

/**
 * **The options fighter**: a meta-controller (`metaController`) over options, which takes the one
 * worth most: by what each is expected to bring (`valued`), its hand-built model's terms weighed
 * by the config's weights over `WEIGHTS`; or, ranked, each worth more than the next, in order. Down: get up; roll away from a foe near; fight from the ground; lie
 * still. Standing: follow orders; break a clinch; strike with a hand that is ready; strike a foe
 * that is down or low, from low support; step back from a blow coming in; hold at the edge of its
 * foe's reach, as the Counter-puncher does; close and strike; and hold, facing its foe. Whatever a
 * standing option asks, its walk keeps out of a fallen body's reach, but the one it means to be
 * near, and out of a solid's clearance (`Walker.constrain`). Standing options are carried out
 * through its skills (`SKILLS`), the hands holding the guard's pose; a down option is carried out
 * by its sub-mind, which the body's one sub-mind, its down half (`downHalf`), hands the body to.
 * Under the option, its reflexes patch what it asks every control step (`reflexLayer`): its one,
 * cover, puts the hand on the side a blow closes on the head from, where it is free, between the
 * two (`cover`).
 *
 * The meta-controller decides once a control step, at the first that asks: the down half, which the
 * body asks whether it wants the body each step once it has looked and before its command layers act
 * (`hosting`), else the tactics. So what the body does, down or standing, is the one decision's.
 */
export function createOptionsFighter(built: BuiltBody, world: World, config: OptionsConfig, wiring: MindWiring) {
  const walk = walker(built.spec), reader = situationReader(built.spec, (sight) => wiring.orders(sight.view.senses));
  let sight: Sight | null = null, meta: ReturnType<typeof metaController> | null = null;
  // The situation is read once a step, by whichever asks first; it is of the step's view, so nothing of it outlives the step.
  let read: Situation | null = null;
  const situation = (seen: Sight): Situation => read !== null && read.time === seen.view.time ? read : read = reader.read(seen);
  const decide = (): Option | null => sight && meta ? meta.decide(situation(sight)) : null;
  const half = { current: false }, downs: ReturnType<typeof downOption>[] = [];
  const running = () => { const chosen = meta && meta.state.running >= 0 ? options[meta.state.running]! : null; return chosen?.posture === "down" ? downs.find((down) => down === chosen) ?? null : null; };
  const body = createBody(built, world, { ...fighterBody(SKILLS, wiring), subs: [(own, view, w, afterPhysics) => {
    for (const [name, sub, model] of DOWN) downs.push(downOption(name, subMind(own, view, sub, w, afterPhysics), half, model));
    return downHalf(downs, running, decide, half);
  }] });
  if (downs.length !== DOWN.length) throw new Error("the options fighter's body made no down half");
  const standing = SKILLS.actions.filter((action) => action.lower === undefined && (config.tuning?.combination !== false || action !== ONE_TWO));
  const strikeNow = standing.map((action) => strike(action, walk, false, throws(action)));
  const options: readonly Option[] = [
    ...downs,
    followOrders(walk),
    setDistance({ name: "break the clinch", foe: "standing", to: "centre", near: CLINCH.within, far: Infinity, correcting: true, facing: "foe" }, walk),
    ...strikeNow,
    strikeLow(LOW, built.spec, walk),
    evade(walk),
    holdEdge(EDGE, walk, (now) => strikeNow.some((option) => option.available(now))),
    ...standing.map((action) => strike(action, walk, true, throws(action))),
    setDistance({ name: "hold", foe: "any", to: "centre", near: 0, far: Infinity, correcting: false, facing: "foe" }, walk),
  ];
  meta = metaController(options, config.meta === "ranked" ? options.map((_, i) => options.length - i) : valued("hand-built", { ...WEIGHTS, ...config.weights }));
  const reflexes = reflexLayer(config.tuning?.cover === false ? [] : [cover(COVER_LONGEST)]);
  const state = { meta: meta.state, situation: reader.state, options: options.map((option) => option.state), reflexes: reflexes.state };
  const engagement = { get phase() { return meta!.state.running < 0 ? "guard" : options[meta!.state.running]!.name; }, get offers() { return meta!.state.offers; } };
  const tactics: Tactics = { name: "options", state, engagement,
    decide(seen, dt) {
      const now = situation(seen), chosen = meta!.decide(now);
      const asked = chosen?.posture === "standing" ? chosen.step(now, dt) : { move: null, face: seen.report.heading, actions: [] };
      const near = chosen?.posture === "standing" ? chosen.near?.(now) ?? null : null;
      return reflexes.apply(now, { ...asked, move: walk.constrain(now, asked.move, near), guard: NO_COVER });
    } };
  let skills: Skills;
  skills = driveBy(body, tactics, (made, driving) => fighterSkills(made, world, SKILLS, driving, () => skills?.report.ledger ?? []));
  sight = { view: body.view, report: skills.report, get envelope() { return skills.envelope; }, instance: skills.instance, readiness: skills.readiness };
  return { kind: "fighter" as const, body, skills, state: skills.state };
}
