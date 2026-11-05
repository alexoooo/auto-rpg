import { physicalReading } from "../core/observation.ts";
import { attachment } from "../core/read-body.ts";
import type { EngineName } from "../core/engine/engines.ts";
import { defaultMind, treeData, loadData } from "../entrants/game.ts";
import { SIDES, type Verdict } from "../arena/duel.ts";
import type { TeamRecipe } from "../arena/team-bout.ts";
import type { Side } from "../core/spec/body.ts";
import { buildTeamBout } from "../evaluation/bout.ts";
import type { MindPlace } from "../core/mind/apart.ts";
import type { DuelNews } from "./duel-stage.ts";
import type { CryptNews } from "./crypt-stage.ts";
import type { TapeEntry } from "./protocol.ts";
import { frameLayout, packFrame, type FramedBody, type RosterBody } from "./frame.ts";

/** What a stage tells the page beside its frames. */
export interface StageNews {
  /** The bout's verdict, once given. */
  readonly verdict?: Verdict;
  /** The stage holds here: the world runs no more until the page runs it again. */
  readonly held?: boolean;
  /** A duel's, every step (`duelStage`). */
  readonly duel?: DuelNews;
  /** A Crypt run's, every step (`cryptStage`). */
  readonly crypt?: CryptNews;
}

/**
 * **A world a worker steps**: built from a screen's recipe exactly as Node builds it, stepped one
 * step at a time, and read out as frames (`frame.ts`).
 */
export interface Stage<Card = unknown, Input = never> {
  readonly hz: number;
  /** Its bodies, in the frame's order. */
  readonly roster: readonly RosterBody<Card>[];
  step(): void;
  /** The world as it stands, a new array. */
  frame(): Float64Array;
  /** What has happened since the last call that the page is told of; null when nothing has. */
  news(): StageNews | null;
  /** Whether it has played what it is for: no step is taken past it. */
  over(): boolean;
  /** Take what the page tells it as it runs (`DuelInput`, `CryptInput`), before the next step; a stage that takes none refuses. */
  input(input: Input): void;
  /** Every order or input given so far, as the stage keeps it: with what built it, the whole of what made it. */
  tape(): readonly TapeEntry[];
  dispose(): void;
}

/** Runtime adapters supplied by the application's worker or Node composition. */
export interface StageRuntime {
  readonly minds?: () => MindPlace | undefined;
}

/** A body of a team bout as the page makes its spec: its side, whose `TeamSide` names it (`teamSpec`). */
export interface TeamCard { readonly side: Side }

/**
 * **A team bout's stage**: `recipe`'s bout built by `buildTeamBout` on `engine`, its minds' data
 * loaded first, played until `aftermath` s past its verdict, using the runtime's minds adapter.
 */
export async function teamStage(recipe: TeamRecipe, aftermath: number, { engine, minds: makeMinds }: StageRuntime & { readonly engine?: EngineName } = {}): Promise<Stage<TeamCard>> {
  await loadData(SIDES.flatMap((side) => treeData(recipe[side].mind ?? defaultMind(recipe[side].model))));
  const minds = makeMinds?.(), built = await buildTeamBout(recipe, { ...engine === undefined ? {} : { engine }, ...minds ? { minds } : {} });
  const { world, bout } = built, dispose = () => { built.dispose(); minds?.dispose(); };
  const roster = bout.members.map((member) => ({ id: member.id, segments: [...member.built.segments.keys()], card: { side: member.side } }));
  const { length } = frameLayout(roster);
  const bodies: FramedBody[] = bout.members.map((member) => {
    const read = physicalReading(member.built), on = attachment(member.built);
    return { segments: member.built.segments, attached: (name) => on(member.built.segments.get(name)!), life: () => bout.life(member.id), out: () => bout.eliminated(member.id),
      down: () => read().down, centre: () => read().centre };
  });
  let told = false;
  return {
    hz: world.hz, roster,
    step: () => world.step(),
    frame: () => packFrame(bodies, length, world.time, world.steps),
    news() {
      if (told || !bout.verdict) return null;
      told = true;
      return { verdict: bout.verdict };
    },
    over: () => bout.verdict !== null && bout.clock >= bout.verdict.time + aftermath,
    input() { throw new Error("a team bout takes no input"); },
    tape: () => [],
    dispose,
  };
}
