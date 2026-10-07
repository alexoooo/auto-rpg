import { rangeLearning, validRangeLearning } from "./range-learning.ts";
import { contactResponse } from "../control/effector-feedback.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import { ATTACK_PATH } from "../skills/attack-path.ts";
import { wrap } from "../skills/locomotion.ts";
import { placedReach } from "../skills/strike.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { PathFighterConfig } from "./config.ts";
import { fighterTactics, STRAFE } from "./fighter.ts";
import { GUARD_ACTION, type CombatAction, type Intent } from "./intent.ts";
import { STAND_ORDERS, type Orders } from "./orders.ts";
import type { Sight, Tactics } from "./tactics.ts";
import { groundCombat } from "./ground-combat.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import { clearStep, clearanceExit } from "./clear-step.ts";
import { openingAction, openingSelector } from "./openings.ts";
import { DEFENSE, guardCanReach, THREAT, threatReader } from "./threat.ts";

/** Search cells for braking, chamber room and escape: `docs/reference/combat-strikes.md#tactical-settings`. */
const COMBAT = Object.freeze({ band: .08, reserve: .08, braking: .5, prediction: .12, pressure: .6,
  escape: .6, blockedAttempts: 3, boundaryMargin: .08, counter: .2, lateral: .2, settle: .08, readySpeed: .35, boundarySpeed: .18 });

/** Tactical selection uses detached sensed bodies; the common skill owns physical execution. */
export function combatTactics(spec: BodySpec, name: string, orders: (sight: Sight) => Orders | null, config: PathFighterConfig): Tactics {
  if (!validRangeLearning(config.spacing, config.spacingStep)) throw new Error("invalid combat range learning settings");
  const range = (config.spacingStep ?? 0) > 0 ? rangeLearning(config.spacing ?? 0, config.spacingStep!) : null;
  const paths = { ...ATTACK_PATH, ...config.paths };
  const combinationWindow = paths.returnLimit + paths.chamberSeconds;
  const selectOpening = openingSelector(spec,config.openings,paths);
  const { threatOf, incomingThreat } = threatReader();
  const repertoire = config.repertoire ?? "linear";
  const mixed = (()=>{
    switch(repertoire) {
      case "linear":return false;
      case "mixed": case "vertical": case "boxing":return true;
      default:{const never:never=repertoire;throw new Error(`unknown repertoire ${never}`);}
    }
  })();
  const ordered = fighterTactics(name, sight => orders(sight) ?? STAND_ORDERS);
  const state = { phase: "guard", foe: null as string | null, action: null as CombatAction | null,
    pressure: 0, escape: 0, angle: 1, cycle: 0, ready: 0, surface: "head",
    blockedSurface: null as string | null, blocks: 0, responded: false, previousHead: null as { time: number; at: Vec3 } | null, counter: 0,
    threat: false, defense: null as "guard" | "evade" | null,
    combo: { hand: null as "left" | "right" | null, until: 0, returned: 0, depth: 0, following: false },
    range: range?.state ?? null,
    ground: null as ReturnType<typeof groundCombat>["state"] | null,
    choice: null as ReturnType<typeof selectOpening>, nextSelection: 0, ordered: ordered.state! };
  const resetCombination = () => { state.combo.hand = null; state.combo.until = 0; state.combo.returned = 0; state.combo.depth = 0; state.combo.following = false; };
  const defenseMode = config.defenseMode ?? "reference";
  const predictive = (() => {
    switch (defenseMode) {
      case "reference": return false;
      case "predictive": return true;
      default: { const never: never = defenseMode; throw new Error(`unknown defense ${never}`); }
    }
  })();
  const bodyRadius = bodyClearance(spec) + COMBAT.boundaryMargin;
  const moveClear = (view: Sight["view"], heading: number, move: readonly [number, number] | null) => {
    if (!move || !view.senses.solids) return move;
    const c = view.stance.centre, from: Vec3 = [c.x, c.y, c.z], angle = heading;
    const candidates = [move, [move[0], -move[1]], [0, Math.abs(move[0]) + Math.abs(move[1])], [0, -Math.abs(move[0]) - Math.abs(move[1])]] as const;
    for (const candidate of candidates) {
      const dx = candidate[0] * sin(angle) + candidate[1] * cos(angle), dz = candidate[0] * cos(angle) - candidate[1] * sin(angle);
      if (clearStep(from, [c.x + dx * COMBAT.escape, c.y, c.z + dz * COMBAT.escape], bodyRadius, view.senses.solids)) return candidate;
    }
    return null;
  };
  const ground = config.groundGame ? groundCombat(spec, moveClear, {}, config.hand === "alternate") : null;
  state.ground = ground?.state ?? null;
  const guard = { left: GUARD_ACTION, right: GUARD_ACTION };
  return { name, state, engagement: state, decide(sight, dt): Intent {
    const { view, report, envelope } = sight, strike = report.strike;
    const previous = state.previousHead, head: Vec3 = [view.head.x, view.head.y, view.head.z];
    const ownVelocity: Vec3 = previous && !view.resumed && view.time > previous.time
      ? head.map((v, k) => (v - previous.at[k]!) / (view.time - previous.time)) as unknown as Vec3 : [0, 0, 0];
    state.previousHead = { time: view.time, at: head }; state.counter = Math.max(0, state.counter - dt); state.defense = null;
    if (view.resumed) { range?.cancel(); resetCombination(); ground?.reset(); state.action = null; state.escape = 0; state.pressure = 0; state.ready = 0; state.responded = false; state.blockedSurface = null; state.blocks = 0; state.threat = false; state.counter = 0; state.choice = null; state.nextSelection = 0; }
    const cycles = strike.thrown.left + strike.thrown.right + (strike.pointCycle?.failed ?? 0);
    const overlapReady = () => !!config.overlap && !!state.combo.hand && strike.overlapHand === state.combo.hand;
    if (!strike.hand && cycles !== state.cycle) { state.cycle = cycles; state.action = null; state.ready = 0; state.responded = false; state.nextSelection = 0; }
    let hand: "left" | "right";
    switch (config.hand) {
      case "left": case "right": hand = config.hand; break;
      case "alternate": hand = cycles % 2 === 0 ? "right" : "left"; break;
      default: { const never: never = config.hand; throw new Error(`unknown combat hand ${never}`); }
    }
    if (state.combo.following && strike.hand === state.combo.hand && strike.hand) {
      state.combo.depth = 1; state.combo.hand = null; state.combo.until = 0; state.combo.returned = 0; state.combo.following = false;
    }
    if (state.combo.hand && (view.time >= state.combo.until || (!strike.hand
      && (strike.pointCycle?.returned[state.combo.hand === "left" ? "right" : "left"] ?? 0) <= state.combo.returned))) resetCombination();
    const given = orders(sight);
    if (given) {
      range?.cancel(); resetCombination(); ground?.reset();
      state.action = null; state.foe = null; state.pressure = 0; state.escape = 0; state.ready = 0;
      state.choice = null; state.nextSelection = 0;
      const intent = ordered.decide(sight, dt);
      state.phase = given.attack ? strike.phase ?? "attack" : given.move ? "approach" : "guard";
      return { ...intent, hands: guard, combat: given.attack ? { hand, target: given.attack, family: "straight" } : null };
    }
    const foe = view.senses.others.filter(o => o.side !== view.senses.side && !o.out)
      .reduce<typeof view.senses.others[number] | null>((near, o) => !near || hypot(o.centre.x - view.head.x, o.centre.z - view.head.z)
        < hypot(near.centre.x - view.head.x, near.centre.z - view.head.z) ? o : near, null);
    if (!foe || view.down || view.senses.out) {
      range?.cancel(); resetCombination(); ground?.reset();
      state.action = null; state.phase = "guard";
      return { move: null, face: report.heading, hands: guard, combat: null };
    }
    if(state.foe!==foe.id){range?.restart();resetCombination();state.choice=null;state.nextSelection=0;}
    state.foe = foe.id;
    const exit = view.senses.solids && clearanceExit([view.stance.centre.x, view.stance.centre.y, view.stance.centre.z], bodyRadius, view.senses.solids);
    if (exit && !strike.hand && (!report.support || report.support.stage === "stand")) {
      resetCombination(); state.phase = "escape"; state.action = null; state.ready = 0;
      return { move: [COMBAT.boundarySpeed * (exit[0] * sin(report.heading) + exit[1] * cos(report.heading)),
        COMBAT.boundarySpeed * (exit[0] * cos(report.heading) - exit[1] * sin(report.heading))], face: report.heading, hands: guard, combat: null };
    }
    const lowIntent = ground?.decide(view, report, foe, hand, dt);
    if (lowIntent) {
      range?.cancel(); resetCombination(); state.phase = ground!.state.phase; state.action = lowIntent.combat ?? null;
      state.choice = null; state.nextSelection = 0; state.ready = 0; state.pressure = 0;
      state.surface = ground!.state.surface;
      if (state.action) state.action = { ...state.action, targetId: foe.id };
      return { ...lowIntent, combat: state.action };
    }
    range?.observe(strike, view.effectors);
    const part = foe.segments.get("head"), at = part?.centre ?? foe.centre, velocity = part?.velocity ?? foe.velocity;
    if (!state.responded && strike.phase === "swing" && strike.hand) {
      const response = contactResponse(view.effectors[`hand.${strike.hand}`]!.feedback, foe.id);
      if (response) {
        state.responded = true;
        if (response === "block") {
          state.blockedSurface = state.surface; state.blocks++;
          if (state.blocks >= COMBAT.blockedAttempts) { state.escape = COMBAT.escape; state.angle *= -1; state.ready = 0; state.blocks = 0; }
        }
        else if (response === "target") {
          state.blockedSurface = null; state.blocks = 0;
          if (config.combinations && state.combo.depth === 0) {
            state.combo.hand = strike.hand === "right" ? "left" : "right"; state.combo.until = view.time + combinationWindow;
            state.combo.returned = strike.pointCycle?.returned[strike.hand] ?? 0;
          }
        }
      }
    }
    let opening: ReturnType<typeof selectOpening> = null;
    if(!mixed) {
      opening = selectOpening(view,foe,hand,state.blockedSurface);
      if (state.combo.hand && (!strike.hand || overlapReady())) {
        const follow = selectOpening(view,foe,state.combo.hand,state.blockedSurface);
        state.combo.following = !!follow && !follow.blocked;
        if (state.combo.following) { opening = follow; hand = state.combo.hand; } else resetCombination();
      }
    }
    else {
      if(view.time>=state.nextSelection&&!strike.hand) {
        const follow = state.combo.hand ? selectOpening(view,foe,state.combo.hand,state.blockedSurface,repertoire) : null;
        state.combo.following = !!follow && !follow.blocked;
        if (state.combo.hand && !state.combo.following) resetCombination();
        state.choice = state.combo.following ? follow : selectOpening(view,foe,hand,state.blockedSurface,repertoire);
        if(config.hand==="alternate" && !state.combo.following) {
          const other = selectOpening(view,foe,hand==="right"?"left":"right",state.blockedSurface,repertoire);
          if(other&&(!state.choice||other.score<state.choice.score))state.choice=other;
        }
        state.nextSelection = view.time+COMBAT.prediction;
      }
      opening = state.choice;
      if (overlapReady()) {
        const follow = selectOpening(view,foe,state.combo.hand!,state.blockedSurface,repertoire);
        state.combo.following = !!follow && !follow.blocked;
        if (state.combo.following) opening = follow;
      }
      if(opening)hand=opening.hand;
    }
    const target: Vec3 = opening?.target ?? [at.x + COMBAT.prediction * velocity.x, at.y + COMBAT.prediction * velocity.y, at.z + COMBAT.prediction * velocity.z];
    const dx = target[0] - view.head.x, dz = target[2] - view.head.z, far = hypot(dx, dz), face = atan2(dx, dz);
    const turn = wrap(face - report.heading), aligned = Math.abs(wrap(face - view.stance.facing)) < STRAFE.turned;
    const radius = foe.spec.segments.find(s => s.name === "head")?.shape;
    const skin = radius?.kind === "sphere" || radius?.kind === "capsule" ? radius.radius.value : 0;
    const distance = Math.max(0, (mixed&&opening?opening.reach:placedReach(spec, hand, target[1] - view.head.y)) - COMBAT.reserve + (opening ? 0 : skin) + (range?.state.offset ?? config.spacing ?? 0));
    const toward = far > 0 ? ((view.stance.velocity.x - velocity.x) * dx + (view.stance.velocity.z - velocity.z) * dz) / far : 0;
    const delta = far - distance, anticipated = delta - Math.max(0, toward) * COMBAT.braking;
    const maximum = envelope?.walk.value ?? COMBAT.lateral;
    const touching = (view.effectors["hand.left"]!.feedback?.impulse ?? 0) + (view.effectors["hand.right"]!.feedback?.impulse ?? 0) > 0;
    state.pressure = touching && strike.phase !== "swing" ? state.pressure + dt : 0;
    if (!strike.hand && (state.pressure >= COMBAT.pressure || delta < -COMBAT.band)) {
      resetCombination(); state.escape = COMBAT.escape; state.angle *= -1; state.pressure = 0; state.ready = 0;
    }
    let hands = guard;
    if (predictive) {
      const threat = incomingThreat(view, ownVelocity);
      if (!threat && state.threat) state.counter = COMBAT.counter;
      state.threat = !!threat;
      if (threat) {
        const available = (["left", "right"] as const).filter(h => h !== strike.hand && h !== strike.returning && guardCanReach(view, spec, h, threat));
        const defending = available.reduce<"left" | "right" | null>((near, h) => !near || hypot(view.fists[h].position.x - threat.cover.threat[0],
          view.fists[h].position.y - threat.cover.threat[1], view.fists[h].position.z - threat.cover.threat[2]) < hypot(view.fists[near].position.x - threat.cover.threat[0],
          view.fists[near].position.y - threat.cover.threat[1], view.fists[near].position.z - threat.cover.threat[2]) ? h : near, null);
        if (defending) { hands = { ...guard, [defending]: { kind: "guard", cover: threat.cover } }; state.defense = "guard"; }
        else state.defense = "evade";
        const moving = state.defense === "evade" ? moveClear(view, report.heading, [-maximum * STRAFE.share, state.angle * maximum * STRAFE.share]) : null;
        if (strike.phase !== "swing" && strike.phase !== "return") {
          resetCombination(); state.action = null; state.ready = 0; state.phase = state.defense === "guard" ? "defend" : "evade";
          return { move: moving, face, hands, combat: null };
        }
      }
    }
    if (!predictive) {
      const cover = threatOf(view, THREAT, DEFENSE);
      if (cover) hands = { left: { kind: "guard", cover }, right: { kind: "guard", cover } };
    }
    const follows = state.combo.following && Math.abs(delta) <= COMBAT.band && aligned
      && view.stance.phase === "stand" && view.stance.velocity.length() <= COMBAT.readySpeed;
    if (strike.hand && !(overlapReady() && follows && state.escape <= 0 && !state.threat)) {
      state.phase = state.combo.depth === 1 ? `followup ${strike.phase ?? "return"}` : strike.phase ?? "return";
      // Committed paths retain the observed aim; preparation and return keep locomotion available.
      if (overlapReady()) return { move: null, face: report.heading, hands, combat: state.action };
      const speed = anticipated < -COMBAT.band ? -maximum * STRAFE.share : 0;
      return { move: strike.phase === "swing" ? null : moveClear(view, report.heading, [speed * cos(turn), speed * sin(turn)]), face,
        hands, combat: state.action };
    }
    if (state.escape > 0) {
      resetCombination(); state.escape -= dt; state.action = null; state.phase = "escape";
      const forward = -maximum * STRAFE.share, lateral = maximum * STRAFE.share * state.angle;
      return { move: moveClear(view, report.heading, [forward * cos(turn) - lateral * sin(turn), forward * sin(turn) + lateral * cos(turn)]), face, hands, combat: null };
    }
    if (Math.abs(delta) <= COMBAT.band && aligned && view.stance.velocity.length() <= COMBAT.readySpeed) state.ready += dt;
    else state.ready = 0;
    if ((state.ready >= COMBAT.settle || follows || (state.counter > 0 && Math.abs(delta) <= COMBAT.band && aligned)) && view.time >= ATTACK_PATH.startup) {
      state.counter = 0;
      if (strike.hand && overlapReady()) state.cycle = cycles;
      state.surface = opening?.segment ?? "head"; state.responded = false;
      if (!state.combo.following && !state.action) state.combo.depth = 0;
      state.phase = state.combo.following ? "combination" : "attack"; state.action = { ...(opening ? openingAction(opening) : { hand, target }),
        family: mixed&&opening?opening.family:cycles % 2 === 0 ? "straight" : "cross", targetId: foe.id };
      return { move: null, face, hands, combat: state.action };
    }
    const speed = Math.max(-maximum * STRAFE.share, Math.min(maximum, anticipated / COMBAT.braking));
    state.phase = Math.abs(turn) > STRAFE.turned ? "align" : delta < -COMBAT.band ? "escape" : "approach";
    return { move: moveClear(view, report.heading, [speed * cos(turn), speed * sin(turn)]), face, hands, combat: null };
  } };
}
