import type { BodyCommand, BodyView } from "../../control/body.ts";
import type { MotorUnmet } from "../../control/motor.ts";
import type { Ended } from "../../skills/framework/action.ts";
import { intentOfSet, type Intent } from "../../skills/framework/intent.ts";
import { LEGS_FIELDS, type LegsUnmet } from "../../skills/framework/skill.ts";
import type { Skills } from "../../skills/framework/skills.ts";
import { CommandingMind, type Commanding } from "../commanding-mind.ts";
import { sightOf, type Sight } from "../decider.ts";
import type { Engagement, EngagementDetail } from "../engagement.ts";
import type { CommandLayers } from "../motor-layers.ts";
import type { Prospect } from "../report.ts";
import type { Chooser } from "./contract/chooser.ts";
import type { OptionRecord } from "./contract/context.ts";
import type { Option } from "./contract/option.ts";
import type { Situation, SituationReader } from "./contract/situation.ts";
import type { Pace } from "./assembly/pace.ts";

/** **What an Option Mind is made of**: each part made once, by its build (`buildOptionMind`). */
interface OptionMindParts {
  /** The command layers on its body. */
  readonly layers: CommandLayers<Intent>;
  /** Its skills, which carry out what its Options ask. */
  readonly skills: Skills;
  /** What reads its situation each decision. */
  readonly reader: SituationReader;
  /** Its Options, in rank order. */
  readonly options: readonly Option[];
  /** What chooses among them. */
  readonly chooser: Chooser;
  /** When it decides again. */
  readonly pace: Pace;
  /** Its Options' record of their tries. */
  readonly record: OptionRecord;
  /** What its aims remember, one object an aim that remembers. */
  readonly aims: readonly object[];
  /** The way it faces where no chosen Option claims its legs. */
  readonly facing: (now: Situation) => number;
}

/** Everything an Option Mind remembers. A part's memory is that part's own object, held here by reference. */
interface OptionMindState extends Commanding {
  /** Its skills' memory. */
  readonly skills: object;
  /** Its reader's: the foe it keeps to, and what it has learned of reach and of rising. */
  readonly situation: object;
  /** The tries its Options have made and how each ended. */
  readonly record: object;
  /** Its chooser's: what is running, and what the last decision weighed. */
  readonly chooser: object;
  /** Each Option's own, in the Options' order. */
  readonly options: readonly object[];
  /** Its aims'. */
  readonly aims: readonly object[];
  /** Its pace's: when it last decided, and on what. */
  readonly pace: object;
  /** The intent it last decided, which stands until it decides again. */
  asked: Intent | null;
  /** What it last reported of itself: what it expects of each foe, its details, and what its focus was doing. */
  readonly said: { prospects: readonly Prospect[]; details: readonly EngagementDetail[]; foe: string };
}

/**
 * An Option Mind. Each decision it reads its situation, chooses among its Options by what they
 * are predicted to bring, and asks its skills to carry out what the chosen Options ask.
 */
export class OptionMind extends CommandingMind<Intent> {
  // The parts it is made of. None is replaced after the Mind is built.
  private readonly skills: Skills;
  private readonly reader: SituationReader;
  private readonly options: readonly Option[];
  private readonly chooser: Chooser;
  private readonly pace: Pace;
  private readonly facing: (now: Situation) => number;
  /** What its reader and its Options see of the body and its skills, live. */
  private readonly sight: Sight;

  /**
   * Its memory. Everything it remembers from one step to the next is in here, and is saved and
   * forked with its body. Anything it keeps outside is a cache: dropping it changes no result.
   */
  readonly state: OptionMindState;

  /** What it reports doing, for screens and Commanders. The rules never read it. */
  readonly engagement: Engagement;

  /** What it expects of each foe it has priced, as its last fresh decision left it. */
  get prospects(): readonly Prospect[] { return this.state.said.prospects; }

  constructor(parts: OptionMindParts) {
    super(parts.layers);
    this.skills = parts.skills;
    this.reader = parts.reader;
    this.options = parts.options;
    this.chooser = parts.chooser;
    this.pace = parts.pace;
    this.facing = parts.facing;
    this.sight = sightOf(parts.layers.body, parts.skills);
    const state: OptionMindState = this.state = {
      layers: parts.layers.state, idle: false,
      skills: parts.skills.state, situation: parts.reader.state, record: parts.record.state,
      chooser: parts.chooser.state, options: parts.options.map((option) => option.state),
      aims: parts.aims, pace: parts.pace.state,
      asked: null, said: { prospects: [], details: [], foe: "clear" },
    };
    const chooser = parts.chooser;
    this.engagement = {
      get phase() { return chooser.running[0]?.name ?? "hold"; },
      get kind() { return chooser.running[0]?.kind ?? "hold"; },
      get offers() { return chooser.offers; },
      get foe() { return state.said.foe; },
      get details() { return state.said.details; },
    };
  }

  /** Asked every step it has its body. It chooses anew only when its pace says a decision is due. */
  protected decide(view: BodyView, dt: number): Intent | null {
    if (view.resumed) this.skills.resume(view);
    const since = this.pace.since(view, dt, lastEnded(this.skills.report.ledger));
    if (since !== null) this.state.asked = this.choose(since);
    return this.state.asked;
  }

  protected carry(view: BodyView, intent: Intent, dt: number): BodyCommand {
    return this.skills.command(view, intent, dt);
  }

  protected released(view: BodyView, reason: "idle" | "takeover"): void {
    this.skills.release(view, reason);
  }

  /** One decision, `dt` s after the last: what it knows, what it does, and what that asks of the skills. */
  private choose(dt: number): Intent {
    const said = this.state.said;
    const read = this.reader.read(this.sight);
    said.foe = read.phase;
    let priced: readonly Situation[] = NONE;
    const chosen = this.chooser.decide(read, () => priced = this.reader.others());
    if (chosen.fresh) said.prospects = this.prospectsAt(read, priced);
    this.reader.keep(chosen.at);
    // Each chosen Option's step, made one intent: the walk and facing of the one that claims the legs, else no walk, facing as the Mind faces.
    const intent = intentOfSet(chosen.set.map((option) => ({ claims: option.claims, ...option.step(chosen.at, dt) })),
      () => ({ move: null, face: this.facing(chosen.at) }));
    said.details = this.detailsAt(chosen.at);
    return intent;
  }

  /** Its prospects with what it expects of the focus at `read`, and of each other foe it priced (`priced`). */
  private prospectsAt(read: Situation, priced: readonly Situation[]): readonly Prospect[] {
    let prospects = prospect(this.state.said.prospects, this.options, read);
    for (const other of priced) prospects = prospect(prospects, this.options, other);
    return prospects;
  }

  /** What it reports beside its choice at `now`: what its legs and motor left undone, and how its Options and its foe are priced. */
  private detailsAt(now: Situation): readonly EngagementDetail[] {
    return [unmetDetail(this.sight.report.legs.unmet, this.sight.view.unmet), pricedDetail(this.options, now)];
  }
}

/** No other foe's situation read. */
const NONE: readonly Situation[] = Object.freeze([]);

/** The last action `ledger` says ended (`Ended.sequence`), 0 for none. */
const lastEnded = (ledger: readonly Ended[]): number => ledger.length ? ledger[ledger.length - 1]!.sequence : 0;

/**
 * How each Option that reads a profile and the focus's strikes are priced as it last decided, as
 * an engagement's detail: by their measured profiles, by hand, or not at all, and why (`Option.priced`,
 * `Pressure.priced`).
 */
function pricedDetail(options: readonly Option[], now: Situation): EngagementDetail {
  const own = options.flatMap((option) => option.priced ? [`${option.name}: ${option.priced(now)}`] : []);
  return { label: "Profiles", value: [...own, `foe: ${now.predictions.pressure.priced}`].join("; ") };
}

/**
 * **`prospects` with what `now` expects of its focus** (`Prospect`), at reach: the most its
 * `options` are expected to deal the focus a second within their reach (`Option.rate`), and
 * the most the focus's are expected to take of it (`Pressure.peak` of `pressure`), in place of what
 * was kept of that foe; as they were with no focus or where nothing changed. They are reported, so
 * a change is a new array, never a write into this one.
 */
function prospect(prospects: readonly Prospect[], options: readonly Option[], now: Situation): readonly Prospect[] {
  if (!now.focus) return prospects;
  let dealt = 0;
  for (const option of options) if (option.rate) dealt = Math.max(dealt, option.rate(now));
  const foe = now.focus.id, taken = now.predictions.pressure.peak;
  const at = prospects.findIndex((one) => one.foe === foe), kept = prospects[at];
  if (kept && Object.is(kept.dealt, dealt) && Object.is(kept.taken, taken)) return prospects;
  const next = [...prospects], one = { foe, dealt, taken };
  if (kept) next[at] = one; else next.push(one);
  return next;
}

/** What the legs and the motor left undone, as an engagement's detail. */
function unmetDetail(legs: LegsUnmet, motor: MotorUnmet): EngagementDetail {
  let pushes = 0;
  for (const pushed of motor.pushes) pushes += pushed;
  const parts = [...legs.fields.length ? [`legs: ${LEGS_FIELDS.filter((field) => legs.fields.includes(field)).join(", ")}`] : [],
    ...pushes ? [`${pushes} ${pushes === 1 ? "push" : "pushes"}`] : [], ...motor.points ? [`${motor.points} ${motor.points === 1 ? "point" : "points"}`] : []];
  return { label: "Unmet", value: parts.length ? parts.join("; ") : "none" };
}
