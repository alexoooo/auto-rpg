import type { GroundPoint } from "../mind/movement.ts";
import type { NavigationReport } from "../mind/navigation.ts";
import type { Orders } from "../mind/orders.ts";
import type { GaitLimits } from "../mind/travel.ts";
import type { Command } from "./commands.ts";

/**
 * **A Commander** stands to a team as a Mind stands to a body: it knows what its members sense,
 * pooled (`TeamView`), what the level's adapter answers of the ground (`TeamLevel`) and its own
 * memory (`state`), and acts only by giving its members orders, which their Minds carry out. It
 * never holds the world, a body or an engine handle.
 *
 * Its host asks it once a step, after the senses and before every Mind (`decide`), and hands it a
 * leader's command the moment it is given (`hear`). What it remembers is plain data in `state`
 * (`src/core/state.ts`), so a fight forks by copying it, and the orders it gives are the whole of
 * what it did: a tape of them plays the fight again with no Commander.
 */
export interface Commander {
  /** Its memory: plain data, saved and loaded whole. */
  readonly state: object;
  /** A command from whoever leads the team, carried out at once on the members selected. */
  hear(command: Command, view: TeamView): void;
  /** This step's orders for its members, from what the team senses now. */
  decide(view: TeamView): TeamDecision;
  /** Whether it leaves `member` nothing to do at `time`: a body its fight may hold while it waits. */
  idle(member: string, time: number): boolean;
  /** What it says of `member`: whom it fights and what it is doing. */
  report(member: string): MemberReport;
  /** What it tells its leader of the team's movement, or "" when nothing. */
  readonly notice: string;
}

/** A step's decision: each member's orders (a member not named keeps its last), and whether the team looked this step. */
export interface TeamDecision {
  readonly orders: ReadonlyMap<string, Orders>;
  /** Whether it read who it sees this step: its own schedule's look, or one it took at once. */
  readonly looked: boolean;
}

/** What a Commander says of one member. */
export interface MemberReport {
  /** The body it fights, by id, or null. */
  readonly target: string | null;
  /** What it was told, or does untold, in a word or two for a person; "" where it has none. */
  readonly task: string;
  /** Whether it walks a route its leader drew, past any foe. */
  readonly forced: boolean;
  /** Whether its leader's commands go to it. */
  readonly selected: boolean;
}

/**
 * **What a team senses at a step**: its members, everybody any member senses, the leader's live
 * input, and whether the team's schedule has it look now (read who it sees).
 */
export interface TeamView {
  /** Its clock, s. */
  readonly time: number;
  /** Its members in the fight's order, each once its body is built; the first is the leader. */
  readonly members: readonly MemberView[];
  /** Every other body the members sense, pooled. */
  readonly others: readonly SensedBody[];
  /** Whether its host's schedule has it look this step. */
  readonly look: boolean;
  /** What the person leading it points at and steers now; null for a team nobody leads. */
  readonly lead: Lead | null;
}

/** A member as its team knows it. */
export interface MemberView {
  readonly id: string;
  /** Where it stands on the ground: its centre of mass, or where its root lies once limp. */
  readonly at: GroundPoint;
  /** Whether it is in the fight. */
  readonly fighting: boolean;
  /** Whether its body is held: fixed where it is, with nothing driving it. */
  readonly held: boolean;
  /** What is left of its pool: 1 whole, 0 spent. */
  readonly vitality: number;
  /** Its footprint's radius, m: what its routes keep clear by. */
  readonly radius: number;
  /** How near its foe it stands to fight, m. */
  readonly reach: number;
  /** Where it was placed: the post it keeps when nothing calls it away. */
  readonly home: GroundPoint;
  /** Its Mind's navigation report, of whichever request it walks (`NavigationReport.request`); null where its Mind has none. */
  readonly navigation: NavigationReport | null;
  /** The limits its legs state (`Locomotion.envelope`, `Locomotion.stopping`), which the speed rule reads (`travelSpeed`); null where its Mind states none. */
  readonly gait: GaitLimits | null;
  /** The way its legs face, radians from +z toward +x (`SkillReport.heading`); null where its Mind reports none. */
  readonly heading: number | null;
}

/** A body some member senses. */
export interface SensedBody {
  readonly id: string;
  readonly at: GroundPoint;
  readonly fighting: boolean;
}

/**
 * A person's live input to the team they lead. The keys and the pointer steer one member: the one
 * selected, or the leader where several are.
 */
interface Lead {
  /** The step on the ground the keys ask of the member they steer, where the keys steer it; null where they do not. */
  readonly keys: GroundPoint | null;
  /** Whether that member walks, not runs, where it moves. */
  readonly walk: boolean;
  /** The ground point that member faces and picks foes about, where the pointer steers its facing; null where it does not. */
  readonly aim: GroundPoint | null;
  /** The sensed foe, and its segment, that member strikes now, where the person presses on one; null where they do not. */
  readonly strike: { readonly foe: string; readonly region: string } | null;
  /** Whether the leader explores by itself. */
  readonly explore: boolean;
}

/**
 * **The ground as a team knows it**, answered by the level's adapter: sight, room to stand and
 * pass, routes, the edge of what the team has explored and the doors on the way.
 */
export interface TeamLevel {
  /** Whether `to` is seen from `from`, within `metres`. */
  sees(from: GroundPoint, to: GroundPoint, metres: number): boolean;
  /** The team looks from `places`: what it has explored grows by what they see. */
  look(places: readonly GroundPoint[]): void;
  /** Whether a body of `radius` fits at `at`, closed doors in the way. */
  fits(at: GroundPoint, radius: number): boolean;
  /** Whether a body of `radius` passes straight from `from` to `to`, closed doors in the way. */
  passes(from: GroundPoint, to: GroundPoint, radius: number): boolean;
  /** Whether a body of `radius` has a route from `from` to `to`, doors opened on the way. */
  reaches(from: GroundPoint, to: GroundPoint, radius: number): boolean;
  /** The nearest place on the edge of what the team has explored that a body of `radius` reaches from `from`, or the exit once seen; null when none. */
  frontier(from: GroundPoint, radius: number): GroundPoint | null;
  /** The first closed door a body of `radius` meets going from `from` to `to`, and where it stands to open it; null when none is in the way. */
  doorway(from: GroundPoint, to: GroundPoint, radius: number): { readonly door: number; readonly point: GroundPoint } | null;
  /** Whether door `door` is open. */
  open(door: number): boolean;
}

/** What a Commander's maker is given in place of the world: the level as its adapter answers it. */
export interface TeamHost {
  readonly level: TeamLevel;
}
