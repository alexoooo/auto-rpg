import { createCommander, type CommanderConfig } from "../core/command/commanders.ts";
import type { Command } from "../core/command/commands.ts";
import type { Commander, MemberView, TeamLevel, TeamView } from "../core/command/team.ts";
import { hypot } from "../core/math/real.ts";
import type { Side } from "../core/spec/body.ts";
import type { Hook } from "../core/world.ts";
import { cryptModel } from "../dungeon/actors.ts";
import type { Duel } from "./duel.ts";

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
interface TeamOfOne {
  readonly commander: Commander;
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
 * looks every step; its member's home is where it stood when the team was made.
 */
export function teamOfOne(duel: Duel, side: Side, config: CommanderConfig): TeamOfOne {
  const commander = createCommander({ level: OPEN_GROUND }, config), other: Side = side === "left" ? "right" : "left";
  const duelist = duel.duelists[side], { radius, attackMetres } = cryptModel(duelist.model);
  const at = (of: Side) => { const c = duel.duelists[of].body.physical.centre; return { x: c.x, z: c.z }; };
  const home = at(side);
  const team: TeamOfOne = {
    commander, lead: null,
    hear(command) { commander.hear(command, view()); },
    dispose() { leading.dispose(); },
  };
  const view = (): TeamView => {
    const skills = duelist.minded.skills;
    const member: MemberView = { id: side, at: at(side), fighting: !duel.eliminated(side), held: false, radius, reach: attackMetres, home,
      navigation: skills?.report.navigation ?? null, gait: skills?.gait ?? null, heading: skills?.report.heading ?? null };
    return { time: duel.clock, look: true, lead: team.lead, members: [member], others: [{ id: other, at: at(other), fighting: !duel.eliminated(other) }] };
  };
  const leading: Hook = duel.world.sense(() => {
    if (duel.verdict) return;
    const orders = commander.decide(view()).orders.get(side);
    if (orders) duel.order(side, orders);
  });
  return team;
}
