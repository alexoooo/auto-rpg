import { Vector3 } from "../../core/math/vector.ts";
import type { EngineName } from "../../core/physics/engines.ts";
import type { PlayerLead } from "../../game/player-input.ts";
import type { GroundPoint } from "../../skills/framework/movement.ts";
import type { Command, StrikeChoice } from "../../minds/command/commands.ts";
import type { MenuEntry } from "../../skills/framework/menu.ts";
import { physicalReading } from "../../control/observation.ts";
import { constructionScope } from "../../core/construction.ts";
import { attachment } from "../../core/bodies/read-body.ts";

import type { Vec3 } from "../../core/quantity.ts";
import type { GameContext } from "../../game/arena/context.ts";
import { SIDES, type Duel, type DuelRecipe, type OrdersEntry, type Verdict } from "../../game/arena/duel.ts";
import { arenaPlayback } from "../../game/arena/playback.ts";
import { teamOfOne, type TeamOfOne } from "../../game/arena/team.ts";
import { aimPoint, rayTarget } from "../../game/arena/orders-input.ts";
import { trialTrace, type TrialTrace } from "../../game/arena/trial-trace.ts";
import { fighterReading, type FighterReading } from "../../game/arena/fighter-readout.ts";
import { airOf, hearTouches } from "../../game/audio/body-sounds.ts";
import { debrisCues, type SoundCue } from "../../game/audio/cues.ts";
import { createBout } from "../../evaluation/bout.ts";
import type { BoutTiming } from "../../evaluation/evaluation.ts";
import { choiceWatch } from "../../game/arena/choice-watch.ts";
import type { Inspected } from "./inspection.ts";
import { frameLayout, packFrame, type FramedBody } from "./frame.ts";
import type { Stage } from "./stage.ts";
import type { ArenaSeat as Side } from "../../game/arena/seat.ts";

/** **A duel as the Arena plays it** (`duelStage`): a drill's trial, or a bout a person may lead a side of. */
export interface DuelStart {
  readonly recipe: DuelRecipe;
  readonly tape: readonly OrdersEntry[];
  /** The bout's clock it stops at, s: where its trial was scored; null plays it to its verdict's aftermath. */
  readonly played: number | null;
  readonly engine?: EngineName;
  readonly timing?: BoutTiming;
  /** The side a person leads as a team of one (`teamOfOne`), or null. */
  readonly person: Side | null;
  /** Whether the bout holds where the person's side has a new choice (`choiceWatch`). */
  readonly hold: boolean;
  /** Whether what a trial draws is traced (`trialTrace`), and sent. */
  readonly traced: boolean;
}

/** Where a person's pointer points: a ray from the camera, world, and how far it reaches, m. */
export interface Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly length: number;
}

/** What a page tells a duel's stage as it runs: each is applied before the next step. */
export type DuelInput =
  /** Hand live control to a side, or return both fighters to their minds. */
  | { readonly kind: "control"; readonly side: Side | null }
  /** The person's lead, read before every step until the next; null for none. */
  | { readonly kind: "lead"; readonly lead: PlayerLead | null }
  /** The pointer selects the sensed opponent under `ray`, or sends the fighter to the floor point. */
  | { readonly kind: "point"; readonly ray: Ray }
  /** A choice picked (`choicePanel`): an attack, and the entries it picks among. */
  | { readonly kind: "attack"; readonly strike: StrikeChoice & { readonly foe: string }; readonly among: readonly MenuEntry[] }
  /** What the page shows of `side` beyond its status: its choices (`menu`), its mind's inspection (`mind`). */
  | { readonly kind: "look"; readonly side: Side; readonly menu: boolean; readonly mind: boolean }
  /** Whether the bout holds where the person's side has a new choice. */
  | { readonly kind: "hold"; readonly hold: boolean };

/** One side of a duel as its HUD shows it after a step. */
interface SideNews {
  /** What its controller is doing: its first action's stage, else its engagement's phase, else who has its body. */
  readonly phase: string;
  /** Who has its body (`PhysicalBody.has`). */
  readonly has: string;
  readonly down: boolean;
  /** How long it has been down, s, where the bout counts it toward a recovery window; else null. */
  readonly downFor: number | null;
  /** Whether an assist helps it now. */
  readonly assisted: boolean;
  readonly hud: FighterReading;
  readonly feet: GroundPoint;
  readonly route: readonly GroundPoint[] | null;
  readonly target: string | null;
  /** Its mind's choices, where the page looks at them. */
  readonly menu?: readonly MenuEntry[] | null;
  /** Its mind's ownership and actions, where the page inspects it. */
  readonly inspected?: Inspected;
}

/** **A duel's news after a step**: what the Arena's HUD, sound and overlays show of it. */
export interface DuelNews {
  /** The bout's clock and the world's time it started at, s. */
  readonly clock: number;
  readonly start: number;
  readonly verdict: Verdict | null;
  /** Whether it has played what it is for. */
  readonly done: boolean;
  /** Whether it holds here, where the person's side has a new choice. */
  readonly choosing: boolean;
  readonly sides: Readonly<Record<Side, SideNews>>;
  /** What was heard since the last news: its touches (`hearTouches`) and what blows took off (`debrisCues`). */
  readonly cues: readonly SoundCue[];
  /** Each side's air now (`airOf`): its fastest point's speed, m/s, and where it is. */
  readonly air: readonly { readonly side: Side; readonly speed: number; readonly at: Vec3 }[];
  /** What the trial's overlays drew since the last news (`trialTrace`). */
  readonly trace: TrialTrace | null;
}

/** A body of a duel's stage as the page makes its spec: its side (`duelSpec` of the bout's recipe). */
export interface DuelCard {
  readonly side: Side;
}

/** A bout built and played as the Arena plays it: its verdict's aftermath shown with the defeated loose (`arenaPlayback`), stopped at `played`. */
async function played(context: GameContext, start: DuelStart, hooks: ConstructorParameters<typeof Duel>[3]) {
  const { defaultMind } = context, { loadData, treeData } = context.catalog;
  const { buildBout } = createBout(context);
  await loadData(SIDES.flatMap((side) => treeData(start.recipe.minds?.[side] ?? defaultMind(start.recipe[side]))));
  const built = await buildBout(start.recipe, { ...start.engine === undefined ? {} : { engine: start.engine }, ...start.timing, hooks });
  let complete = false;
  try {
  const playback = arenaPlayback(built.duel, start.played ?? Infinity);
  complete = true;
  return { ...built, playback };
  } finally { if (!complete) built.dispose(); }
}

/** `duel`'s bodies as a frame packs them. */
const framed = (duel: Duel): FramedBody[] => SIDES.map((side) => {
  const duelist = duel.duelists[side], read = physicalReading(duelist.built), on = attachment(duelist.built);
  return { segments: duelist.built.segments, attached: (name) => on(duelist.built.segments.get(name)!), life: () => duel.life(side), out: () => duel.eliminated(side),
    down: () => duelist.body.down, centre: () => read().centre };
});

/**
 * **A duel's stage**: `start`'s bout built by `buildBout`, its minds' data loaded first, played as
 * the Arena plays it (`arenaPlayback`), its tape played as it steps, and the side a person leads
 * led as a team of one, whose orders go on its tape. Each step's news is what the Arena shows of
 * it (`DuelNews`); a new choice for the person's side holds it, where they asked.
 */
export async function duelStage(context: GameContext, start: DuelStart): Promise<Stage<DuelCard, DuelInput>> {
  const scope = constructionScope();
  let complete = false;
  try {
  const { phaseLabels } = context.catalog;
  const cues: SoundCue[] = [];
  const main = scope.own(await played(context, start, { onBlow: (blow) => { cues.push(...debrisCues(blow)); } }));
  scope.own(main.playback);
  const { world, duel, playback } = main;
  const sides = SIDES.map((side) => ({ id: side, built: duel.duelists[side].built }));
  scope.own(hearTouches(world, sides, (cue) => { cues.push(cue); }));
  const airs = SIDES.map((side) => ({ side, air: airOf(duel.duelists[side].built) })), airAt = new Vector3();
  const trace = scope.own(start.traced ? trialTrace(duel) : null);
  duel.play(start.tape);
  const leadSide = (side: Side | null): TeamOfOne | null => side ? teamOfOne(duel, side, { kind: "party", picks: false }, context.commanders) : null;
  let led = leadSide(start.person);
  scope.own({ dispose: () => led?.dispose() });
  const readings = Object.fromEntries(SIDES.map((side) => [side, fighterReading(duel.duelists[side], () => duel.blows, phaseLabels(duel.duelists[side].mind))])) as Record<Side, ReturnType<typeof fighterReading>>;
  const time = () => duel.state.start + (duel.verdict?.time ?? duel.clock);
  let feedStopped = false;
  scope.own(world.afterStep(() => {
    for (const side of SIDES) readings[side].sample(time(), !feedStopped);
    if (duel.verdict) feedStopped = true;
  }));
  for (const side of SIDES) readings[side].sample(time());

  const roster = SIDES.map((side) => ({ id: side, segments: [...duel.duelists[side].built.segments.keys()], card: { side } }));
  const bodies = framed(duel);
  const { length } = frameLayout(roster);
  const looks = Object.fromEntries(SIDES.map((side) => [side, { menu: false, mind: false }])) as Record<Side, { menu: boolean; mind: boolean }>;
  const watch = choiceWatch();
  const state = { person: start.person, lead: null as PlayerLead | null, hold: start.hold, choosing: false, taken: 0 };

  /** A pointer ray selects a sensed opponent or a destination on the floor. */
  const pointAt = ({ origin, direction, length }: Ray) => {
    if (!led || !state.person) return;
    const own = duel.duelists[state.person], target = rayTarget(own.senses(), origin, direction, length), floor = aimPoint(origin, direction, 0);
    const command: Command | null = target ? { kind: "attack", foe: target.foe }
      : floor ? { kind: "go", destination: { x: floor[0], z: floor[2] } } : null;
    if (command) {
      led.hear(command);
      if (command.kind === "attack") watch.picked([]);
    }
  };

  /** The person's lead as the team reads it, from their input and the world as it stands. */
  const leading = () => {
    if (!led || !state.person) return;
    const input = state.lead;
    if (!input) { led.lead = null; return; }
    led.lead = { keys: input.keys, walk: input.walk };
  };
  /** Whether the person's side has a new choice to hold for. */
  const chose = (): boolean => {
    if (!state.hold || !led || !state.person || duel.verdict) return false;
    const own = duel.duelists[state.person], report = own.minded.report, menu = report?.menu;
    return !!menu && watch.changed(menu, report!.ended ?? [], own.body.down, duel.clock);
  };
  const sideNews = (side: Side): SideNews => {
    const fighter = duel.duelists[side], mind = fighter.minded, look = looks[side];
    const phase = mind.skills ? mind.skills.report.actions[0]?.stage ?? mind.report?.engagement?.phase ?? "guard / move" : mind.body.has;
    const report = mind.report ?? null;
    const centre = fighter.body.physical.centre;
    return { phase, has: fighter.body.has, down: fighter.body.down, downFor: duel.state.recovery?.[side] ?? null,
      assisted: fighter.body.assist.on, hud: readings[side].read(time()),
      feet: { x: centre.x, z: centre.z }, route: report?.navigation?.route.map(point => ({ x: point.x, z: point.z })) ?? null,
      target: duel.state.given[side]?.foe ?? null,
      ...look.menu ? { menu: report?.menu ?? null } : {},
      ...look.mind ? { inspected: { body: { has: fighter.body.has, level: fighter.body.level },
        skills: mind.skills ? { report: { holders: mind.skills.report.holders, defaultOwners: mind.skills.report.defaultOwners, actions: mind.skills.report.actions } } : null,
        report: report ? { engagement: report.engagement, actions: report.actions, ended: report.ended } : null } } : {} };
  };
  complete = true;
  return {
    hz: world.hz, roster,
    step() {
      if (!playback.done) {
        leading();
        world.step();
        state.choosing = chose();
      }
      state.taken += 1;
    },
    frame: () => packFrame(bodies, length, state.taken / world.hz, state.taken),
    news() {
      const air = airs.map(({ side, air }) => { const speed = air(airAt); return { side, speed, at: [airAt.x, airAt.y, airAt.z] as Vec3 }; });
      const news: DuelNews = { clock: duel.clock, start: duel.state.start, verdict: duel.verdict, done: playback.done, choosing: state.choosing,
        sides: { left: sideNews("left"), right: sideNews("right") }, cues: cues.splice(0), air,
        trace: trace?.take() ?? null };
      const held = state.choosing;
      state.choosing = false;
      return { ...duel.verdict ? { verdict: duel.verdict } : {}, ...held ? { held } : {}, duel: news };
    },
    over: () => playback.done,
    input(input) {
      switch (input.kind) {
        case "control":
          if (input.side === state.person) return;
          led?.dispose(); led = null;
          if (state.person) duel.order(state.person, null);
          state.person = input.side;
          state.lead = null; state.choosing = false; watch.reset();
          led = leadSide(state.person);
          return;
        case "lead":
          state.lead = input.lead;
          return;
        case "point": pointAt(input.ray); return;
        case "attack":
          if (!led) return;
          led.hear({ kind: "attack", ...input.strike });
          watch.picked(input.among);
          return;
        case "look": looks[input.side] = { menu: input.menu, mind: input.mind }; return;
        case "hold": state.hold = input.hold; watch.reset(); return;
        default: { const never: never = input; throw new Error(`unknown input ${JSON.stringify(never)}`); }
      }
    },
    tape: () => duel.tape,
    dispose: scope.dispose,
  };
  } finally { if (!complete) scope.dispose(); }
}
