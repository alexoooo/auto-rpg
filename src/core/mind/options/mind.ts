import { commandable } from "../../body.ts";
import type { BodySpec } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";
import type { BodyHost } from "../host.ts";
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

/** Its skills with blows at the body beside the head's: the punch and the one-two aimed at the trunk's middle. */
const BODY_SKILLS: FighterConfig = deepFreeze({ ...SKILLS, actions: [...SKILLS.actions,
  ...[COUNTER_PUNCHER.actions[0]!, ONE_TWO].map((action) => ({ ...action, name: action === ONE_TWO ? "one-two to the body" : "body blow", regions: [{ kind: "mark" as const, mark: "middle" as const }] }))] });

/** How many blows an action of its skills throws: a combination its drives, else one. */
const throws = (action: ActionConfig): number => {
  const executor = SKILLS.executors.find((one) => one.name === action.executor);
  return executor?.kind === "combination" ? executor.drives : 1;
};
/** A kit with its standing blows aimed at an opening in the foe's guard (`openingSelector`), in place of the centre of what they strike. */
const opened = (kit: FighterConfig): FighterConfig => deepFreeze({ ...kit,
  actions: kit.actions.map((action) => action.lower === undefined ? { ...action, aim: { kind: "surface" as const, tuning: {} } } : action) });
const OPENED = new Map([SKILLS, BODY_SKILLS].map((kit) => [kit, opened(kit)] as const));
/**
 * How a driven drive asks its fist (`StraightPunch.driven`): up to 600 m/s^2, at the speed that
 * gives over 0.3 m at the least so it lands moving, its velocity closed at 30 per second.
 */
const DRIVEN = deepFreeze({ accel: 600, steer: 30, arrive: 0.3 });
/** A kit whose straight drives drive the fist through the whole-body solve (`DRIVEN`) in place of pushing the arm's joints. */
const drivenKit = (kit: FighterConfig): FighterConfig => deepFreeze({ ...kit,
  executors: kit.executors.map((executor) => executor.kind === "combination" ? { ...executor, driven: DRIVEN } : executor) });
const DRIVEN_KITS = new Map([SKILLS, BODY_SKILLS, ...OPENED.values()].map((kit) => [kit, drivenKit(kit)] as const));
/** A kit whose free hands hold what they hold up through the whole-body solve (`holdUp`). */
const heldKit = (kit: FighterConfig): FighterConfig => deepFreeze({ ...kit, guard: { ...kit.guard, tuning: { ...kit.guard.tuning, hold: true } } });
const HELD_KITS = new Map([SKILLS, BODY_SKILLS, ...OPENED.values(), ...DRIVEN_KITS.values()].map((kit) => [kit, heldKit(kit)] as const));
for (const kit of [SKILLS, BODY_SKILLS, ...OPENED.values(), ...DRIVEN_KITS.values(), ...HELD_KITS.values()]) if (fighterFaults(kit).length) throw new Error(`the options fighter's skills: ${fighterFaults(kit).join("; ")}`);

/** How it holds the edge of its foe's reach: as the Counter-puncher does. */
const EDGE = (() => {
  const edge = "list" in SKILLS.tactics ? SKILLS.tactics.list.find((item) => item.kind === "edge") : undefined;
  if (edge?.kind !== "edge") throw new Error("the Counter-puncher holds no edge");
  return edge;
})();

/** How far off straight back it breaks a clinch, rad: out of the path of a foe walking in. */
const CLINCH_SLANT = .8;

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
 * through its skills (`SKILLS`), its blows aimed at an opening in the foe's guard (`opened`) and the hands holding the guard's pose; a down option is carried out
 * by its sub-mind, which the body's one sub-mind, its down half (`downHalf`), hands the body to.
 * Under the option, its reflexes patch what it asks every control step (`reflexLayer`): its one,
 * cover, puts the hand on the side a blow closes on the head from, where it is free, between the
 * two (`cover`).
 *
 * The meta-controller decides once a control step, at the first that asks: the down half, which the
 * body asks whether it wants the body each step once it has looked and before its command layers act
 * (`hosting`), else the tactics. So what the body does, down or standing, is the one decision's.
 */
export function createOptionsFighter(host: BodyHost, config: OptionsConfig, wiring: MindWiring) {
  const walk = walker(host.spec), reader = situationReader(host.spec, (sight) => wiring.orders(sight.view.senses));
  let sight: Sight | null = null, meta: ReturnType<typeof metaController> | null = null;
  // The situation is read once a step, by whichever asks first; it is of the step's view, so nothing of it outlives the step.
  let read: Situation | null = null;
  const situation = (seen: Sight): Situation => read !== null && read.time === seen.view.time ? read : read = reader.read(seen);
  const decide = (): Option | null => sight && meta ? meta.decide(situation(sight)) : null;
  const half = { current: false }, downs: ReturnType<typeof downOption>[] = [];
  const running = () => { const chosen = meta && meta.state.running >= 0 ? options[meta.state.running]! : null; return chosen?.posture === "down" ? downs.find((down) => down === chosen) ?? null : null; };
  const aimed = config.tuning?.body === true ? BODY_SKILLS : SKILLS, opening = config.tuning?.opening === false ? aimed : OPENED.get(aimed)!;
  const drives = config.tuning?.driven === true ? DRIVEN_KITS.get(opening)! : opening, kit = config.tuning?.hold === true ? HELD_KITS.get(drives)! : drives;
  const body = host.command({ ...fighterBody(kit, wiring), subs: [(own, view, w, afterPhysics) => {
    for (const [name, sub, model] of DOWN) downs.push(downOption(name, subMind(own, view, sub, w, afterPhysics), half, model));
    return downHalf(downs, running, decide, half);
  }] });
  if (downs.length !== DOWN.length) throw new Error("the options fighter's body made no down half");
  const standing = kit.actions.filter((action) => action.lower === undefined && (config.tuning?.combination !== false || action.executor !== ONE_TWO.executor));
  const strikeNow = standing.map((action) => strike(action, walk, false, throws(action)));
  const options: readonly Option[] = [
    ...downs,
    followOrders(walk),
    setDistance({ name: "break the clinch", foe: "standing", to: "centre", near: CLINCH.within, far: Infinity, correcting: true, facing: "foe", slant: CLINCH_SLANT }, walk),
    ...strikeNow,
    strikeLow(LOW, host.spec, walk),
    evade(walk),
    holdEdge(EDGE, walk, (now) => strikeNow.some((option) => option.available(now))),
    ...standing.map((action) => strike(action, walk, true, throws(action))),
    setDistance({ name: "hold", foe: "any", to: "centre", near: 0, far: Infinity, correcting: false, facing: "foe", slant: 0 }, walk),
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
  skills = driveBy(body, tactics, (made, driving) => fighterSkills(made, host.clock, kit, driving, () => skills?.report.ledger ?? []));
  sight = { view: body.view, report: skills.report, get envelope() { return skills.envelope; }, instance: skills.instance, readiness: skills.readiness };
  return { skills, state: skills.state };
}
