import { physicalReading } from "../core/observation.ts";
import { loadData } from "../core/data/store.ts";
import type { EngineName } from "../core/engine/engines.ts";
import { defaultMind, treeData } from "../entrants/game.ts";
import { SIDES, type Verdict } from "../arena/duel.ts";
import type { TeamRecipe } from "../arena/team-bout.ts";
import type { Side } from "../core/spec/body.ts";
import { buildTeamBout } from "../evaluation/bout.ts";
import { frameLayout, packFrame, type FramedBody, type RosterBody } from "./frame.ts";

/** What a stage tells the page beside its frames, once it happens. */
export interface StageNews {
  readonly verdict?: Verdict;
}

/**
 * **A world a worker steps**: built from a screen's recipe exactly as Node builds it, stepped one
 * step at a time, and read out as frames (`frame.ts`).
 */
export interface Stage<Card = unknown> {
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
  dispose(): void;
}

/** A body of a team bout as the page makes its spec: its side, whose `TeamSide` names it (`teamSpec`). */
export interface TeamCard { readonly side: Side }

/**
 * **A team bout's stage**: `recipe`'s bout built by `buildTeamBout` on `engine`, its minds' data
 * loaded first, played until `aftermath` s past its verdict.
 */
export async function teamStage(recipe: TeamRecipe, aftermath: number, engine?: EngineName): Promise<Stage<TeamCard>> {
  await loadData(SIDES.flatMap((side) => treeData(recipe[side].mind ?? defaultMind(recipe[side].model))));
  const { world, bout, dispose } = await buildTeamBout(recipe, engine === undefined ? {} : { engine });
  const roster = bout.members.map((member) => ({ id: member.id, segments: [...member.built.segments.keys()], card: { side: member.side } }));
  const { length } = frameLayout(roster);
  const bodies: FramedBody[] = bout.members.map((member) => {
    const read = physicalReading(member.built);
    return { segments: member.built.segments, life: () => bout.life(member.id), out: () => bout.eliminated(member.id),
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
    dispose,
  };
}
