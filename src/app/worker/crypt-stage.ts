import type { PlayerLead } from "../../game/player-input.ts";
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";
import { isRefused, type Refused } from "../../core/refusal.ts";
import type { Command } from "../../minds/command/commands.ts";
import type { CommanderConfig } from "../../minds/command/kind.ts";
import { loadEngine, type EngineName } from "../../core/physics/engines.ts";
import type { GroundPoint } from "../../skills/intent/movement.ts";
import { armedWith } from "../../core/bodies/items/held.ts";
import type { MindConfig } from "../../minds/config.ts";
import { type BodyModel } from "../../core/bodies/models.ts";
import { modelInfo } from "../../game/model-loadouts.ts";
import { physicalReading } from "../../control/observation.ts";
import { constructionScope } from "../../core/construction.ts";
import { attachment } from "../../core/bodies/read-body.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import type { GameContext } from "../../game/arena/context.ts";
import { debrisCues, type SoundCue, type SoundPoint } from "../../game/audio/cues.ts";
import { hearRun } from "../../game/dungeon/hearing.ts";
import { cellKey, type DungeonMap } from "../../game/dungeon/map.ts";
import { DungeonRun, prepareDungeonCharacters, runMap, runParticipants, type Participant, type RunStatus } from "../../game/dungeon/run.ts";
import type { Inspected } from "./inspection.ts";
import { frameLayout, packFrame, type FramedBody } from "./frame.ts";
import type { Stage, StageRuntime } from "./stage.ts";

/**
 * **A Crypt run as its page starts it** (`cryptStage`), plain data: the run's options, each
 * participant's mind and attributes by its id (`Participant.id`), and the person's lead as it
 * stands.
 */
export interface CryptStart {
  readonly seed: number;
  readonly layout?: DungeonMap;
  readonly hero?: BodyModel;
  readonly companions?: readonly BodyModel[];
  /** Each participant's mind by id; its model's (`defaultMind`) where none is given. */
  readonly minds: Readonly<Record<string, MindConfig>>;
  /** Each participant's attributes over its model's, by id; none where none is given. */
  readonly attributes: Readonly<Record<string, AttributeOverrides>>;
  readonly party?: CommanderConfig;
  readonly enemies?: CommanderConfig;
  readonly lead: PlayerLead;
  readonly engine?: EngineName;
}

/** What a Crypt page tells its run as it plays, each applied before the next step. */
export type CryptInput =
  /** The person's command, heard by the party's Commander (`DungeonRun.command`). */
  | { readonly kind: "command"; readonly command: Command }
  /** Which party members the person's next commands go to, every one for null (`DungeonRun.select`). */
  | { readonly kind: "select"; readonly ids: readonly string[] | null }
  /** The person's lead, read every step until the next. */
  | { readonly kind: "lead"; readonly lead: PlayerLead }
  /** The body whose mind the page inspects, or none: the news carries it (`CryptNews.inspected`). */
  | { readonly kind: "look"; readonly id: string | null };

/** An input as a run's tape keeps it: applied when the world had taken `step` steps. */
export interface CryptTapeEntry {
  readonly step: number;
  readonly input: CryptInput;
}

/** One body of the run after a step, as the page draws and reports it. */
export interface ActorNews {
  readonly id: string;
  /** Whether its body is built: an enemy's is once the party nears it (`DungeonRun`'s wake). */
  readonly built: boolean;
  readonly alive: boolean;
  readonly limp: boolean;
  readonly held: boolean;
  readonly vitality: number;
  /** Where it stands on the ground (`DungeonActor.feet`). */
  readonly feet: GroundPoint;
  /** What its team's Commander says of it (`MemberReport`). */
  readonly target: string | null;
  readonly task: string;
  readonly forced: boolean;
  /** The route its mind walks, where it walks one. */
  readonly route: readonly GroundPoint[] | null;
}

/** **A Crypt run's news after a step**: what its page shows, hears and draws of it. */
export interface CryptNews {
  readonly clock: number;
  readonly status: RunStatus;
  readonly notice: string;
  /** The party member the camera follows (`DungeonRun.leader`), and those selected. */
  readonly leader: string;
  readonly selected: readonly string[];
  /** Every body, in the run's order (`DungeonRun.actors`). */
  readonly actors: readonly ActorNews[];
  /** The doors open, by id. */
  readonly doors: readonly number[];
  /** The cells explored since the last news, by `cellKey`. */
  readonly explored: readonly number[];
  /** The cells the party sees, where they changed since the last news; else null. */
  readonly visible: readonly number[] | null;
  /** What was heard where the party sees since the last news (`hearRun`, `debrisCues`). */
  readonly cues: readonly SoundCue[];
  /** The air of each body the party sees now (`RunHearing.airs`). */
  readonly air: readonly { readonly id: string; readonly speed: number; readonly at: SoundPoint }[];
  /**
   * The mind the page inspects, where it inspects one that is built, as the HUD refreshes it: every
   * `INSPECTED_STEPS` steps and at once after a look; absent between.
   */
  readonly inspected?: { readonly id: string; readonly inspected: Inspected } | null;
}

/** A body of a Crypt stage as the page makes its spec (`cryptSpec`): who it is. */
export type CryptCard = Participant;

/** The spec a body of a run is built from: its character's, holding what its model holds (`DungeonRun`'s build). */
export const cryptSpec = (character: { readonly spec: BodySpec }, model: BodyModel): BodySpec =>
  armedWith(character.spec, "right", modelInfo(model).held);

/**
 * `start`'s run built as its page plays it, with no look,
 * its minds' data loaded first, using the supplied minds adapter, and the
 * person's lead applied; `cues` is given what a blow takes
 * off where the party sees.
 */
export async function buildCryptRun(context: GameContext, start: CryptStart, { cues = [], minds: makeMinds }: StageRuntime & { readonly cues?: SoundCue[] } = {}) {
  const { defaultMind } = context, { treeData, loadData } = context.catalog;
  const layout = start.layout ? structuredClone(start.layout) : runMap(start);
  if (isRefused(layout)) return layout;
  const fielded = { seed: start.seed, layout,
    ...start.hero ? { hero: start.hero } : {}, ...start.companions ? { companions: start.companions } : {},
    attributes: (participant: Participant) => start.attributes[participant.id] ?? {} };
  const mind = (participant: Participant) => start.minds[participant.id] ?? null;
  const prepared = prepareDungeonCharacters(layout, fielded);
  if (isRefused(prepared)) return prepared;
  await loadData(runParticipants(fielded.layout, fielded).flatMap((participant) => treeData(mind(participant) ?? defaultMind(participant.model))));
  const scope = constructionScope();
  let complete = false;
  try {
  const minds = scope.own(await makeMinds?.());
  const seen = (point: Vec3) => run.visible.has(cellKey(run.map, { x: point[0], z: point[2] }));
  const run: DungeonRun = scope.own(new DungeonRun({ ...fielded, prepared, engine: await loadEngine(start.engine), mind,
    ...start.party ? { party: start.party } : {}, ...start.enemies ? { enemies: start.enemies } : {}, ...minds ? { minds } : {},
    onBlow: (blow) => { if (seen(blow.point)) cues.push(...debrisCues(blow)); } }, context));
  const apply = cryptInput(run);
  apply({ kind: "lead", lead: start.lead });
  complete = true;
  return { run, prepared, apply, dispose: scope.dispose };
  } finally { if (!complete) scope.dispose(); }
}

/**
 * How `run` takes a page's input, as its stage does before the next step and a replay of its tape
 * does: a command heard, the selection and the lead set.
 */
function cryptInput(run: DungeonRun): (input: CryptInput) => void {
  return (input) => {
    switch (input.kind) {
      case "command": run.command(input.command); return;
      case "select": run.select(input.ids); return;
      case "lead": run.lead = input.lead; return;
      case "look": return;
      default: { const never: never = input; throw new Error(`unknown input ${JSON.stringify(never)}`); }
    }
  };
}

/** How often the news carries the inspected mind, steps: ten times a second at 120 Hz, as the HUD refreshes. */
const INSPECTED_STEPS = 12;

/** Where a frame puts a body's segment before it is built: at the origin, unturned. */
const UNBUILT = Object.freeze({ pose: Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: 0 }),
  rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }) }) });

/**
 * **A Crypt run's stage**: `start`'s run built by `buildCryptRun`, stepped while it plays, every
 * body in its frames from the first, each segment of an enemy not yet built at the origin
 * (`ActorNews.built`); each step's news is what the Crypt shows (`CryptNews`). The page's input is
 * applied before the next step and kept on the run's tape, so a run a person played replays from
 * its start and its tape.
 */
export async function cryptStage(context: GameContext, start: CryptStart, runtime: StageRuntime = {}): Promise<Stage<CryptCard, CryptInput> | Refused> {
  const scope = constructionScope();
  let complete = false;
  try {
  const cues: SoundCue[] = [];
  const building = await buildCryptRun(context, start, { ...runtime, cues });
  if (isRefused(building)) return building;
  const { run, prepared, apply } = scope.own(building);
  const hearing = scope.own(hearRun(run, (cue) => { cues.push(cue); }));
  const tape: CryptTapeEntry[] = [];
  const roster = run.actors.map((actor) => ({ id: actor.id,
    segments: cryptSpec(prepared.characters.get(actor.id)!, actor.model).segments.map((segment) => segment.name),
    card: { id: actor.id, side: actor.side, model: actor.model } }));
  const { length } = frameLayout(roster);
  const bodies: FramedBody[] = run.actors.map((actor, k) => {
    const spec = cryptSpec(prepared.characters.get(actor.id)!, actor.model);
    const unbuilt = new Map(spec.segments.map((segment) => [segment.name, { ...UNBUILT, spec: segment }]));
    let reading: ReturnType<typeof physicalReading> | null = null, on: ReturnType<typeof attachment> | null = null;
    const read = () => {
      if (reading) return reading();
      const built = actor.fighter!.built;
      if ([...built.segments.keys()].join() !== roster[k]!.segments.join()) throw new Error(`${actor.id} was built with other segments than its spec names`);
      return (reading = physicalReading(built))();
    };
    return {
      get segments() { return actor.fighter?.built.segments ?? unbuilt; },
      attached: (name) => { const built = actor.fighter?.built; return !built || (on ??= attachment(built))(built.segments.get(name)!); },
      life: () => actor.vitality, down: () => actor.fighter?.body.down ?? false, out: () => !actor.alive,
      centre: () => actor.fighter ? read().centre : { x: actor.home.x, y: 0, z: actor.home.z },
    };
  });
  let looked: string | null = null, lookedNow = false, explored = 0, visible: ReadonlySet<number> | null = null;
  const inspected = (): CryptNews["inspected"] => {
    const fighter = run.actors.find((actor) => actor.id === looked)?.fighter;
    if (!fighter || looked === null) return null;
    const mind = fighter.minded, report = mind.report ?? null;
    return { id: looked, inspected: { body: { has: fighter.body.has, level: fighter.body.level },
      skills: mind.skills ? { report: { holders: mind.skills.report.holders, defaultOwners: mind.skills.report.defaultOwners, actions: mind.skills.report.actions } } : null,
      report: report ? { engagement: report.engagement, actions: report.actions, ended: report.ended } : null } };
  };
  const news = (): CryptNews => {
    const cells = run.explored.size === explored ? [] : [...run.explored].slice(explored);
    explored = run.explored.size;
    const seen = run.visible === visible ? null : [...run.visible];
    visible = run.visible;
    const air: { id: string; speed: number; at: SoundPoint }[] = [];
    const told = lookedNow;
    lookedNow = false;
    hearing.airs((id, speed, at) => { air.push({ id, speed, at: { x: at.x, z: at.z } }); });
    return {
      clock: run.clock, status: run.status, notice: run.notice, leader: run.leader.id, selected: [...run.selected],
      actors: run.actors.map((actor) => {
        const report = run.report(actor);
        return { id: actor.id, built: actor.fighter !== null, alive: actor.alive, limp: actor.fighter ? actor.limp : false, held: actor.held,
          vitality: actor.vitality, feet: actor.feet(), target: report.target, task: report.task, forced: report.forced,
          route: actor.navigation?.route.map((point) => ({ x: point.x, z: point.z })) ?? null };
      }),
      doors: run.map.doors.filter((door) => door.open).map((door) => door.id), explored: cells, visible: seen,
      cues: cues.splice(0), air,
      ...told || run.world.steps % INSPECTED_STEPS === 0 ? { inspected: inspected() } : {},
    };
  };
  complete = true;
  return {
    hz: run.world.hz, roster,
    step: () => run.step(),
    frame: () => packFrame(bodies, length, run.world.time, run.world.steps),
    news: () => ({ crypt: news() }),
    over: () => run.status !== "playing",
    input(input) {
      if (input.kind === "look") { looked = input.id; lookedNow = true; return; }
      // A run that has ended takes no more: its tape ends where it did.
      if (run.status !== "playing") return;
      tape.push({ step: run.world.steps, input: structuredClone(input) });
      apply(input);
    },
    tape: () => tape,
    dispose: scope.dispose,
  };
  } finally { if (!complete) scope.dispose(); }
}
