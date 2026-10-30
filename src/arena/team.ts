import { createCommander, type CommanderConfig } from "../core/command/commander.ts";
import { releaseCombatApproach } from "../core/command/delivery.ts";
import { sameOrders, type Orders } from "../core/mind/orders.ts";
import type { Command } from "../core/command/commands.ts";
import type { Commander, MemberView, TeamLevel, TeamView } from "../core/command/team.ts";
import { hypot } from "../core/math/real.ts";
import type { Side } from "../core/spec/body.ts";
import type { Hook } from "../core/world.ts";
import { cryptModel } from "../dungeon/actors.ts";
import type { Duel } from "./duel.ts";
import { otherSide } from "../core/spec/body.ts";

/**
 * The arena's ground as a team of one knows it: every body within range in sight, no door, nothing
 * to explore. A lone member asks where no other stands, and its Mind's own navigator routes it round
 * the stage's solids.
 */
const OPEN_GROUND: TeamLevel = Object.freeze<TeamLevel>({
  sees: (from, to, metres) => hypot(to.x - from.x, to.z - from.z) <= metres,
  look: () => {}, fits: () => true, passes: () => true, reaches: () => true, frontier: () => null, doorway: () => null, open: () => true,
});

/** **One side of a bout led as a team of one** (`teamOfOne`): its Commander, and what the person leading it gives. */
export interface TeamOfOne {
  readonly commander: Commander;
  /** The Commander's memory and its last raw orders, saved together when a team forks. */
  readonly state: { readonly commander: object; orders: Orders | null };
  /** The person's live input (`TeamView.lead`), which the page sets as the keys and the pointer change; null for nobody. */
  lead: TeamView["lead"];
  /** The person's command, heard at once. */
  hear(command: Command): void;
  dispose(): void;
}

/**
 * `side` of `duel` as a team of one under a Commander of `config`: asked each step in the sensing
 * phase, after the senses and before every Mind, until the verdict, its orders given to the side
 * (`Duel.order`), so the bout's tape holds them and plays it again with no Commander. The team
 * looks every step; its member's home is where it stood when the team was made. Its state retains
 * raw orders so a reached combat approach can resume without a fresh Commander decision.
 */
export function teamOfOne(duel: Duel, side: Side, config: CommanderConfig): TeamOfOne {
  const commander = createCommander({ level: OPEN_GROUND }, config), other: Side = otherSide(side);
  const duelist = duel.duelists[side], { radius, attackMetres } = cryptModel(duelist.model);
  const at = (of: Side) => { const c = duel.duelists[of].body.physical.centre; return { x: c.x, z: c.z }; };
  const home = at(side);
  const state = { commander: commander.state, orders: null as Orders | null };
  const team: TeamOfOne = {
    commander, state, lead: null,
    hear(command) { commander.hear(command, view()); },
    dispose() { leading.dispose(); },
  };
  const view = (): TeamView => {
    const report = duelist.minded.report;
    const member: MemberView = { id: side, at: at(side), fighting: !duel.eliminated(side), held: false, vitality: duel.life(side), radius, reach: attackMetres, home,
      navigation: report?.navigation ?? null, gait: report?.gait ?? null, heading: report?.heading ?? null, kit: report?.kit ?? null,
      get actions() { return report?.actions ?? null; }, get ended() { return report?.ended ?? null; }, get menu() { return report?.menu ?? null; } };
    return { time: duel.clock, look: true, lead: team.lead, members: [member], others: [{ id: other, at: at(other), fighting: !duel.eliminated(other), down: duel.duelists[other].body.down }] };
  };
  const leading: Hook = duel.world.sense(() => {
    if (duel.verdict) return;
    const current = view(), orders = commander.decide(current).orders.get(side);
    if (orders && !sameOrders(state.orders, orders)) state.orders = JSON.parse(JSON.stringify(orders)) as Orders;
    const given = state.orders;
    if (given) duel.order(side, releaseCombatApproach(given, current.members[0]!.at,
      current.others.find(target => target.id === given.foe) ?? null));
  });
  return team;
}
