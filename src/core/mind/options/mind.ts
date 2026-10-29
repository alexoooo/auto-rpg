import type { PartLookup } from "../lookup.ts";
import type { BodyHost } from "../host.ts";
import type { ActionConfig, OptionsConfig } from "../config.ts";
import { actionConfigFaults, armedActions, blowsOf } from "../action-config.ts";
import { keepOut } from "../clear-step.ts";
import { fighterBody, fighterSkills } from "../fighter.ts";
import { NO_COVER } from "../intent.ts";
import { orderedFacing } from "../ordered.ts";
import type { MindWiring } from "../minds.ts";
import { kitOf, subMind } from "../kit.ts";
import { driveBy, type Sight, type Tactics } from "../tactics.ts";
import type { Skills } from "../../skills/skills.ts";
import { approach } from "./approach.ts";
import { chooserOf, type Chooser } from "./chooser.ts";
import { cover } from "./cover.ts";
import { setDistance } from "./distance.ts";
import { downHalf, downOption } from "./down.ts";
import { holdEdge } from "./edge.ts";
import { EDGE } from "./goals.ts";
import { evade } from "./evade.ts";
import type { Asked, Option, Situation } from "./option.ts";
import { strikeLow } from "./low.ts";
import { followOrders } from "./orders.ts";
import { fitsAll, takesCommands } from "../parts.ts";
import { situationReader } from "./situation.ts";
import { measuredProfile, strike, strikeMeasure } from "./strike.ts";
import { CLINCH } from "./value.ts";
import { walker } from "./walk.ts";

/** How many blows an action of `config` throws (`blowsOf`). */
const throws = (parts: PartLookup, config: OptionsConfig, action: ActionConfig): number => blowsOf(parts, config.executors, action);

/** How far off straight back it breaks a clinch, rad: out of the path of a foe walking in. */
const CLINCH_SLANT = .8;

/** Why a body cannot take the options fighter's commands or carry out the actions of `config`'s skills, or null where it can (`Part.fits`). */
export const optionsFit = fitsAll<OptionsConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null);

/**
 * **The options fighter**: a chooser (`Chooser`, the part its config names) over options, each a
 * skill in one shape (`Option`: entry, holds, model, exit). Down: its sub-minds (`subs`), each
 * priced by its part (`SubMindPart.down`): by default, get up; roll away from a foe near; fight
 * from the ground; lie still. Standing, the commitments: follow orders; strike, with a limb in its
 * action's entry or from a window its legs are brought to; strike a foe that is down or low, from
 * low support. And the footwork: break a clinch; step back from a blow coming in; hold at the edge
 * of its foe's reach (`EDGE`). With none worth more than holding its position, it holds it, facing
 * its foe. Standing options are carried out through
 * the skills its config names (`SkillKit`, `fighterSkills`): a strike for each of its standing
 * actions, and a low strike by the first action thrown from low support, if it has one; a down
 * option is carried out by its sub-mind, which the body's one sub-mind, its down half
 * (`downHalf`), hands the body to.
 *
 * Each control step the option chosen fills the intent's commitment or its footwork (`Layer`),
 * and the layers under it the rest: the legs approach a commitment's window where its entry says
 * `position` (`approach`); the walk keeps out of a fallen body's reach, but the one it means to
 * be near, and out of a solid's clearance (`keepOut`); and a free hand covers (`cover`).
 *
 * The chooser decides once a control step, at the first that asks: the down half, which the body
 * asks whether it wants the body each step once it has looked and before its command layers act
 * (`hosting`), else the tactics. So what the body does, down or standing, is the one decision's.
 */
export function createOptionsFighter(host: BodyHost, given: OptionsConfig, wiring: MindWiring) {
  // Its blows are those its body throws as armed.
  const config = { ...given, actions: armedActions(host.parts, host.spec, given.executors, given.actions) };
  const hz = Math.round(1 / host.clock.dt), walk = walker(host.spec), standing = config.actions.filter((action) => action.lower === undefined);
  const measures = standing.map((action) => strikeMeasure(host.parts, host.spec, config.executors, action, hz));
  const reader = situationReader({ spec: host.spec, hz, rules: host.rules, strikes: measures.flatMap((measure) => measuredProfile(measure) ?? []),
    ordersOf: (sight) => wiring.orders(sight.view.senses), downs: config.subs.map((sub) => host.parts.of("sub-mind", sub).down!) });
  let sight: Sight | null = null, choosing: Chooser | null = null;
  // The situation is read once a step, by whichever asks first; it is of the step's view, so nothing of it outlives the step.
  let read: Situation | null = null;
  const situation = (seen: Sight): Situation => read !== null && read.time === seen.view.time ? read : read = reader.read(seen);
  const decide = (): Option | null => sight && choosing ? choosing.decide(situation(sight)) : null;
  const half = { current: false }, downs: ReturnType<typeof downOption>[] = [];
  const running = () => { const chosen = choosing?.running ?? null; return chosen?.posture === "down" ? downs.find((down) => down === chosen) ?? null : null; };
  const body = host.command({ ...fighterBody({ subs: [], motor: config.motor, guard: config.guard }, wiring, host.parts), subs: [(own, view, w, afterPhysics) => {
    const kit = kitOf(host.parts, own.spec, config);
    for (const sub of config.subs) {
      const { name, ...model } = host.parts.of("sub-mind", sub).down!;
      downs.push(downOption(name, subMind(host.parts, own, view, sub, kit, w, afterPhysics), half, model));
    }
    return downHalf(downs, running, decide, half);
  }] });
  if (downs.length !== config.subs.length) throw new Error("the options fighter's body made no down half");
  const low = config.actions.find((action) => action.lower !== undefined);
  const strikes = standing.map((action, i) => strike(action, walk, true, throws(host.parts, config, action), measures[i]!));
  const options: readonly Option[] = [
    ...downs,
    followOrders(walk, standing),
    setDistance({ name: "break the clinch", foe: "standing", to: "centre", near: CLINCH.within, far: Infinity, correcting: true, facing: "foe", slant: CLINCH_SLANT }, walk),
    ...strikes,
    ...low ? [strikeLow(low, host.spec, walk)] : [],
    evade(walk),
    holdEdge(EDGE, walk, (now) => strikes.some((option) => option.entry(now).kind === "ready")),
  ];
  const chosen = choosing = chooserOf(host.parts, config.chooser, options, host.seed);
  const hands = cover(host.spec);
  const state = { chooser: chosen.state, situation: reader.state, options: options.map((option) => option.state), cover: hands.state };
  const engagement = { get phase() { return chosen.running?.name ?? "hold"; }, get offers() { return chosen.offers; } };
  const tactics: Tactics = { name: "options", state, engagement,
    decide(seen, dt) {
      const now = situation(seen), option = chosen.decide(now);
      const asked: Asked = option?.posture === "standing" ? option.step(now, dt) : { move: null, face: now.down ? seen.report.heading : walk.facing(now), actions: [] };
      const held = option?.posture === "standing" ? option.holds(now, asked) : [];
      const near = option?.posture === "standing" ? option.near?.(now) ?? null : null;
      const facing = now.orders?.move === undefined && now.orders ? orderedFacing(now.orders.face) : null;
      const covered = hands.step(now, held);
      return { ...keepOut(seen.view, seen.clearance, approach(now, asked), near, now.orders?.pace), ...(facing === null ? {} : { face: facing }),
        guard: covered ? { ...NO_COVER, ...covered } : NO_COVER };
    } };
  let skills: Skills;
  skills = driveBy(body, tactics, (made, driving) => fighterSkills(made, host.clock, host.parts, config, driving, () => skills?.report.ledger ?? []));
  sight = { view: body.view, report: skills.report, get envelope() { return skills.envelope; }, instance: skills.instance, readiness: skills.readiness, needs: skills.needs, clearance: skills.clearance };
  return { skills, state: skills.state };
}
