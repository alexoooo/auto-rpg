import { deepFreeze } from "../../state.ts";
import type { BodyHost } from "../host.ts";
import { COUNTER_PUNCHER, STAND_UP, type ActionConfig, type OptionsConfig, type SubMindConfig } from "../config.ts";
import { actionConfigFaults, armedActions, blowsOf } from "../action-config.ts";
import { fighterBody, fighterSkills } from "../fighter.ts";
import { NO_COVER } from "../intent.ts";
import { orderedFacing } from "../ordered.ts";
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
import { fitsAll, takesCommands } from "../parts.ts";
import { reflexLayer, reflexOf } from "./reflex.ts";
import { situationReader } from "./situation.ts";
import { strike } from "./strike.ts";
import { CLINCH, WEIGHTS } from "./value.ts";
import { walker } from "./walk.ts";

/** How many blows an action of `config` throws (`blowsOf`). */
const throws = (config: OptionsConfig, action: ActionConfig): number => blowsOf(config.executors, action);

/** How it holds the edge of its foe's reach: as the Counter-puncher does. */
const EDGE = (() => {
  const edge = "list" in COUNTER_PUNCHER.tactics ? COUNTER_PUNCHER.tactics.list.find((item) => item.kind === "edge") : undefined;
  if (edge?.kind !== "edge") throw new Error("the Counter-puncher holds no edge");
  return edge;
})();

/** How far off straight back it breaks a clinch, rad: out of the path of a foe walking in. */
const CLINCH_SLANT = .8;

/** What it does down, by rank: the sub-mind each down option is carried out by, and how it is priced. */
const DOWN: readonly (readonly [string, SubMindConfig, DownModel])[] = deepFreeze([
  ["get up", STAND_UP, { seconds: 5, stands: .7, shelter: 0 }],
  ["roll away", SUB_MIND_PARTS["get-away"].defaults, { seconds: 2, stands: 0, shelter: .5 }],
  ["fight from the ground", SUB_MIND_PARTS["ground-fight"].defaults, { seconds: 2, stands: 0, shelter: .3 }],
  ["lie still", { kind: "lie" }, { seconds: 2, stands: 0, shelter: 0 }],
]);

/** Why a body cannot take the options fighter's commands or carry out the actions of `config`'s skills, or null where it can (`Part.fits`). */
export const optionsFit = fitsAll<OptionsConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null);

/**
 * **The options fighter**: a meta-controller (`metaController`) over options, which takes the one
 * worth most: by what each is expected to bring (`valued`), its hand-built model's terms weighed
 * by the config's weights over `WEIGHTS`; or, ranked, each worth more than the next, in order. Down: get up; roll away from a foe near; fight from the ground; lie
 * still. Standing: follow orders; break a clinch; strike with a hand that is ready; strike a foe
 * that is down or low, from low support; step back from a blow coming in; hold at the edge of its
 * foe's reach, as the Counter-puncher does; close and strike; and hold, facing its foe. Whatever a
 * standing option asks, its walk keeps out of a fallen body's reach, but the one it means to be
 * near, and out of a solid's clearance (`Walker.constrain`). Standing options are carried out
 * through the skills its config names (`SkillKit`, `fighterSkills`): a strike for each of its
 * standing actions, and a low strike by the first action thrown from low support, if it has one; a
 * down option is carried out by its sub-mind, which the body's one sub-mind, its down half
 * (`downHalf`), hands the body to. Under the option, its reflexes (`reflexOf`) patch what it asks
 * every control step, in rank order (`reflexLayer`).
 *
 * The meta-controller decides once a control step, at the first that asks: the down half, which the
 * body asks whether it wants the body each step once it has looked and before its command layers act
 * (`hosting`), else the tactics. So what the body does, down or standing, is the one decision's.
 */
export function createOptionsFighter(host: BodyHost, given: OptionsConfig, wiring: MindWiring) {
  // Its blows are those its body throws as armed.
  const config = { ...given, actions: armedActions(host.parts, host.spec, given.executors, given.actions) };
  const walk = walker(host.spec), reader = situationReader(host.spec, (sight) => wiring.orders(sight.view.senses));
  let sight: Sight | null = null, meta: ReturnType<typeof metaController> | null = null;
  // The situation is read once a step, by whichever asks first; it is of the step's view, so nothing of it outlives the step.
  let read: Situation | null = null;
  const situation = (seen: Sight): Situation => read !== null && read.time === seen.view.time ? read : read = reader.read(seen);
  const decide = (): Option | null => sight && meta ? meta.decide(situation(sight)) : null;
  const half = { current: false }, downs: ReturnType<typeof downOption>[] = [];
  const running = () => { const chosen = meta && meta.state.running >= 0 ? options[meta.state.running]! : null; return chosen?.posture === "down" ? downs.find((down) => down === chosen) ?? null : null; };
  const body = host.command({ ...fighterBody({ subs: [], motor: config.motor }, wiring), subs: [(own, view, w, afterPhysics) => {
    for (const [name, sub, model] of DOWN) downs.push(downOption(name, subMind(own, view, sub, w, afterPhysics), half, model));
    return downHalf(downs, running, decide, half);
  }] });
  if (downs.length !== DOWN.length) throw new Error("the options fighter's body made no down half");
  const standing = config.actions.filter((action) => action.lower === undefined), low = config.actions.find((action) => action.lower !== undefined);
  const strikeNow = standing.map((action) => strike(action, walk, false, throws(config, action)));
  const options: readonly Option[] = [
    ...downs,
    followOrders(walk, standing),
    setDistance({ name: "break the clinch", foe: "standing", to: "centre", near: CLINCH.within, far: Infinity, correcting: true, facing: "foe", slant: CLINCH_SLANT }, walk),
    ...strikeNow,
    ...low ? [strikeLow(low, host.spec, walk)] : [],
    evade(walk),
    holdEdge(EDGE, walk, (now) => strikeNow.some((option) => option.available(now))),
    ...standing.map((action) => strike(action, walk, true, throws(config, action))),
    setDistance({ name: "hold", foe: "any", to: "centre", near: 0, far: Infinity, correcting: false, facing: "foe", slant: 0 }, walk),
  ];
  meta = metaController(options, config.meta === "ranked" ? options.map((_, i) => options.length - i) : valued("hand-built", { ...WEIGHTS, ...config.weights }));
  const reflexes = reflexLayer(config.reflexes.map((reflex) => reflexOf(reflex, host.spec)));
  const state = { meta: meta.state, situation: reader.state, options: options.map((option) => option.state), reflexes: reflexes.state };
  const engagement = { get phase() { return meta!.state.running < 0 ? "guard" : options[meta!.state.running]!.name; }, get offers() { return meta!.state.offers; } };
  const tactics: Tactics = { name: "options", state, engagement,
    decide(seen, dt) {
      const now = situation(seen), chosen = meta!.decide(now);
      const asked = chosen?.posture === "standing" ? chosen.step(now, dt) : { move: null, face: seen.report.heading, actions: [] };
      const near = chosen?.posture === "standing" ? chosen.near?.(now) ?? null : null;
      const facing = now.orders?.move === undefined && now.orders ? orderedFacing(now.orders.face) : null;
      return reflexes.apply(now, { ...walk.constrain(now, asked, near), ...(facing === null ? {} : { face: facing }), guard: NO_COVER });
    } };
  let skills: Skills;
  skills = driveBy(body, tactics, (made, driving) => fighterSkills(made, host.clock, host.parts, config, driving, () => skills?.report.ledger ?? []));
  sight = { view: body.view, report: skills.report, get envelope() { return skills.envelope; }, instance: skills.instance, readiness: skills.readiness };
  return { skills, state: skills.state };
}
