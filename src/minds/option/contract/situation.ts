import type { GroundReading, Position } from "../../../control/ground-reading.ts";
import type { MotorUnmet } from "../../../control/motor.ts";
import type { StancePhase } from "../../../control/stance/goal.ts";
import type { Rulebook } from "../../../combat/rulebook.ts";
import type { BodySense } from "../../../core/bodies/senses.ts";
import type { BearingEnd, BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Cover } from "../../../skills/framework/intent.ts";
import type { Spot } from "../../../skills/framework/menu.ts";
import type { Profile, StanceNumbers, Stances } from "../../../skills/framework/profile/profile.ts";
import type { Read, Source } from "../../../skills/framework/profile/source.ts";
import type { LegsUnmet } from "../../../skills/framework/skill.ts";
import type { FoePhase, threatReader } from "../../../skills/perception/threat.ts";
import type { Sight } from "../../decider.ts";
import type { Orders } from "../../orders.ts";
import type { Ground } from "./terms.ts";

/**
 * **What a decision reads**, once a control step: the body and its skills as the last step left
 * them, and each percept (`Percepts`) and prediction (`Predictions`), read the first time it is
 * asked and kept for the step. Which cued percepts were asked for is counted for its chooser
 * (`cues`).
 */
export interface Situation extends Percepts {
  readonly sight: Sight;
  readonly time: number;
  readonly predictions: Predictions;
  /** At a state an Option leaves the body in (`placed`), the seconds before the focus's pressure reaches it there (`graceAt`); absent at the state now. */
  readonly grace?: number;
  /** What its chooser watches: the cued percepts asked for of any situation its reader made (`Cues`). */
  readonly cues: Cues;
}

/**
 * **What a predictor reads** (`ExchangePredictor`), a step's: the body as its Mind was made with
 * it, what it sees, the foe it fights and that foe's blow coming.
 */
export interface Seen {
  readonly sight: Sight;
  readonly spec: BodySpec;
  /** The world's rate, Hz. */
  readonly hz: number;
  /** How often its mind looks for a change it watches, Hz (`OptionMindConfig.rate`), at which a profile is read. */
  readonly rate: number;
  /** The steps its body's command waits (`Body.delay`), at which a profile is read. */
  readonly delay: number;
  /** The rules the fight is played by (`BodyHost.rules`), which price a blow. */
  readonly rules: Rulebook;
  /** The foe it fights (its focus, `situationReader`); null with none. */
  readonly focus: BodySense | null;
  /** The blow predicted to reach its head (`READINGS.predicted`), read the first time the step asks for it; null with none. */
  readonly blow: ReturnType<ReturnType<typeof threatReader>["blowOf"]>;
}

/** The stance's feet the ground bears (`StanceEnd.touching`), by name, in the stance's order. */
export type Bearing = readonly BearingEnd[];

/**
 * **Every percept an Option Mind reads**, by name: what it reads of the senses and its own body
 * with fixed geometry and kinematics, the same whatever a drill or the rules give. Those with a
 * cue (the body going down or getting up, another posture, orders asking for something else,
 * another focus, a blow coming) make a chooser decide at once when the cue changes (`Cues`).
 */
export interface Percepts {
  /** Whether the body is down, by its spec's rule. */
  readonly down: boolean;
  /** How the body lies (what bears it, as the ground reading's label settles): standing on its feet. */
  readonly posture: Position;
  /** Whether its rise runs, as its reader keeps it (`riseMemory`). */
  readonly rising: boolean;
  /** The ground as its rise reads it; null where no rise runs. */
  readonly ground: GroundReading | null;
  /** The seconds the body has been braced tumbling in its rise. */
  readonly tumbled: number;
  /** The seconds its regain has held it in its try. */
  readonly regained: number;
  /** Where on the ground it stands and the way it faces: its stance's centre and its heading. */
  readonly where: Spot;
  /** What its reader keeps of the stretches it has spent within each foe's reach (`ReachMemory`). */
  readonly reached: ReachMemory;
  /** Its orders; null with none. */
  readonly orders: Orders | null;
  /** The foe it fights; null with none. */
  readonly focus: BodySense | null;
  /** How far off the focus is, centre to centre across the ground, m; Infinity with none. */
  readonly apart: number;
  /** The cover a foe's blow predicted to reach the head asks for; null with none. */
  readonly incoming: Cover | null;
  /** A foe's weapon near enough to ward off, at the hand that holds it; null with none. */
  readonly ward: Cover | null;
  /** How far off the focus is, head to head, m; Infinity with none. */
  readonly range: number;
  /** Its bearing around the focus, rad from the focus's forward (its `marks.base`'s +z), positive to its right; 0 with none. */
  readonly around: number;
  /** How late the senses show the focus, s; null with no focus, or one sensed without its time. */
  readonly reaction: number | null;
  /** Its own life less the focus's; 0 with none. */
  readonly lead: number;
  /** How late in the bout it is: the share of the clock's time from its start to its verdict that has passed; 0 where no clock ends the bout. */
  readonly lateness: number;
  /** Where the stance is in a step. */
  readonly stride: StancePhase;
  /** Which feet the ground bears (`Bearing`). */
  readonly bearing: Bearing;
  /** The centre of mass's velocity over the ground, m/s. */
  readonly velocity: Ground;
  /** What the legs did not carry out (`LegsReport.unmet`). */
  readonly legsUnmet: LegsUnmet;
  /** What the motor did not carry out (`BodyView.unmet`). */
  readonly motorUnmet: MotorUnmet;
  /** What the focus is doing (`FoePhase`). */
  readonly phase: FoePhase;
  /** The focus's posture as sensed; standing with no focus. */
  readonly foePosture: Position;
  /** How the body and the focus stand toward each other, each in its carriage (`Stances`); neither read with no focus. */
  readonly stances: Stances;
  /** The time to contact of the blow the focus strikes with, s; Infinity with none. */
  readonly contact: number;
}

/** **The blow already coming**: the share of the body's own life it is expected to take, and where that reading comes from. */
export interface Coming { readonly life: number; readonly source: Source }

/** **What lying costs a body**: the own life a second down is expected to cost it (`rate`), and where that comes from (`source`). */
export interface DownCost {
  readonly rate: number;
  readonly source: Source;
}

/**
 * **Every prediction an Option Mind reads**, by name: what data a drill, a training run or the
 * rules make says of the situation, stale with that data; read when an Option or the objective
 * asks for it, once a step at most, each by its Mind's exchange predictor (`ExchangePredictor`).
 */
export interface Predictions {
  /** The blow coming (`Coming`): no life with none, or where the focus's pressure holds it already. */
  readonly danger: Coming;
  /** What the focus's fighting is expected to deal the body (`Pressure`). */
  readonly pressure: Pressure;
  /** What a second down in each posture is expected to cost the body (`DownCost`). */
  readonly down: (posture: Position) => DownCost;
  /** How fast the focus turns to face, rad/s; Infinity with none. */
  readonly turns: number;
  /** The focus's life a blow of a limb of the body's takes at a segment of the focus's, closing on it at `closing` m/s, by the rules; 0 with no focus. */
  readonly blows: (limb: string, segment: string, closing: number) => number;
}

/**
 * **What a chooser watches of a body's situations** (`Situation.cues`): the cued percepts asked
 * for since it last cleared them, of any situation its reader made, and the event those cues make.
 */
export interface Cues {
  /** **What changes the situation enough to decide at once**: the cue of each of the percepts `watched` names at `now`, as one text a chooser compares with the last; reading them is not asking. */
  event(now: Situation, watched: readonly string[]): string;
  /** Count the cued percepts asked for afresh. */
  clear(): void;
  /** The cued percepts asked for since `clear`, by name, in their order. */
  asked(): string[];
}

/**
 * **What one body's strikes are expected to take from another as the two stand**: the focus's
 * from this body (`Predictions.pressure`). With no focus it takes nothing and reaches nowhere.
 */
export interface Pressure {
  /** The seconds before a blow not yet begun reaches the struck body once it is within reach. */
  readonly latency: number;
  /** The most it takes in a second, the struck body's life, for a report. */
  readonly peak: number;
  /** Each thing it is priced by, and where that reading comes from (`Read`), for a report. None with no focus. */
  readonly reads: readonly Read[];
  /**
   * Where the life it takes comes from, said once: the weakest of what it is priced by (`weakest`
   * of `reads`). It is a bound, not the one reading that answered at a state: a pressure is the
   * most of several strikes' rates, or a table measured in bouts, and any of them may decide it.
   * A given with no focus, which takes nothing.
   */
  readonly source: Source;
  /** The share of the struck body's life it takes over `span` (`Span`), from `now`. */
  dealt(now: Situation, span: Span): number;
  /** How far it reaches, m head to head, as the range at `now` places it; 0 where it has no blow. */
  edge(now: Pick<Situation, "range" | "apart">): number;
  /** The same pressure with the struck body standing at `own`. */
  stanced(own: StanceNumbers): Pressure;
  /** The same pressure keeping scratch for one search's repeated questions. The scratch ends with the search. */
  cached(): Pressure;
}

/** **A span under a pressure**: the two bodies `apart` m head to head, moving at `velocity` (`startOf`), for `seconds` s from `from` s after now. */
export interface Span {
  readonly apart: number;
  readonly velocity: readonly [number, number];
  readonly seconds: number;
  readonly from: number;
}

/**
 * **What a body's reader keeps of the focus's reach** (`reachMemory`): for each foe, the seconds a
 * blow it has not begun would still take to reach the body (its grace), and when that was counted.
 */
export interface ReachMemory {
  /** Its memory: each foe's grace and the time it was counted at, by the foe's id. */
  readonly state: Record<string, { grace: number; at: number }>;
  /** The grace at `now`'s focus, counted to `now`. */
  grace(now: Situation): number;
}

/**
 * **A strike a body is modelled by**: its name, the limbs it is thrown with (effector segments,
 * `hand.right`), and its profiles measured on that body as it is read, its senses' reaction time
 * aside, one a body it was measured against (none where none is). It is read by the one against
 * the body it strikes (`profileAgainst`); one whose profile is not fresh at the senses' reaction
 * time is left to its limbs' guess (`Guesses.limb`), so a strike left unmeasured is priced by hand
 * while the others are measured, or not priced where its Mind guesses nothing.
 */
export interface ModelledStrike {
  readonly name: string;
  readonly limbs: readonly string[];
  readonly profiles: readonly Profile[];
}

/**
 * **A body's situation reader**: the situation at the foe it keeps to, and at each other foe it may
 * focus on. The foes it may focus on are the one its orders name, else every foe in the fight; it
 * reads at the one it kept (`keep`) while that one is in the fight, else the nearest.
 */
export interface SituationReader {
  /** Its memory: the kept focus, and what it keeps of the body's rise and of each foe's reach. */
  readonly state: object;
  /** The situation at its focus, now. */
  read(sight: Sight): Situation;
  /** The situation at each other foe it may focus on, as the last `read` saw them: none where it may focus on one alone. */
  others(): readonly Situation[];
  /** Keep `now`'s focus: the one it reads at while it is in the fight. */
  keep(now: Situation): void;
}
