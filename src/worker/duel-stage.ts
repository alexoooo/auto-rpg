import { Vector3 } from "../core/math/vector.ts";
import { loadData } from "../core/data/store.ts";
import type { EngineName } from "../core/engine/engines.ts";
import type { Heading } from "../core/intent/orders.ts";
import type { StrikeChoice } from "../core/command/commands.ts";
import type { MenuEntry } from "../core/skills/framework/menu.ts";
import { physicalReading } from "../core/observation.ts";
import type { Side } from "../core/spec/body.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { defaultMind, treeData } from "../entrants/game.ts";
import { SIDES, type Duel, type DuelRecipe, type OrdersEntry, type Verdict } from "../arena/duel.ts";
import { arenaPlayback } from "../arena/playback.ts";
import { teamOfOne, type TeamOfOne } from "../arena/team.ts";
import { aimPoint, rayTarget } from "../arena/orders-input.ts";
import { trialTrace, type TrialTrace } from "../arena/trial-trace.ts";
import { fighterReading, type FighterReading } from "../arena/fighter-readout.ts";
import { airOf, hearTouches } from "../audio/body-sounds.ts";
import { debrisCues, type SoundCue } from "../audio/cues.ts";
import { buildBout } from "../evaluation/bout.ts";
import { choiceWatch } from "../ui/choices.ts";
import type { Inspected } from "../ui/mind-inspector.ts";
import { frameLayout, packFrame, type FramedBody } from "./frame.ts";
import type { Stage } from "./stage.ts";

/** A bout played beside the duel, step for step: a recorded trial at another version. */
interface BesideStart {
  readonly recipe: DuelRecipe;
  readonly tape: readonly OrdersEntry[];
  /** The bout's clock it stops at, s: where its record was scored; null plays it to its verdict's aftermath. */
  readonly played: number | null;
  readonly engine?: EngineName;
}

/** **A duel as the Arena plays it** (`duelStage`): a recorded bout, or one a person may lead a side of. */
export interface DuelStart extends BesideStart {
  /** The side a person leads as a team of one (`teamOfOne`), or null. */
  readonly person: Side | null;
  /** Whether the bout holds where the person's side has a new choice (`choiceWatch`). */
  readonly hold: boolean;
  /** Whether what a trial draws is traced (`trialTrace`), and sent. */
  readonly traced: boolean;
  /** The previous version's same trial, played beside it, or null. */
  readonly beside: BesideStart | null;
}

/** Where a person's pointer points: a ray from the camera, world, and how far it reaches, m. */
export interface Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly length: number;
}

/**
 * A person's live lead of their side, as the page reads the keys and the pointer: the ground
 * direction the keys ask as the camera sees the ground (`keysToMove`), whether Shift walks, the
 * pointer's ray, and whether its left button is down, which strikes the body part under it.
 */
export interface LeadInput {
  readonly keys: Heading | null;
  readonly walk: boolean;
  readonly ray: Ray | null;
  readonly attacking: boolean;
}

/** What a page tells a duel's stage as it runs: each is applied before the next step. */
export type DuelInput =
  /** The person's lead, read before every step until the next; null for none. */
  | { readonly kind: "lead"; readonly lead: LeadInput | null }
  /** A click: the person's side goes where `ray` meets the floor, unless it meets a body part first. */
  | { readonly kind: "go"; readonly ray: Ray }
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
  /** Whether it, and the bout beside it, have played what they are for. */
  readonly done: boolean;
  /** Whether it holds here, where the person's side has a new choice. */
  readonly choosing: boolean;
  readonly sides: Readonly<Record<Side, SideNews>>;
  /** What was heard since the last news: its touches (`hearTouches`) and what blows took off (`debrisCues`). */
  readonly cues: readonly SoundCue[];
  /** Each side's air now (`airOf`): its fastest point's speed, m/s, and where it is. */
  readonly air: readonly { readonly side: Side; readonly speed: number; readonly at: Vec3 }[];
  /** What the trial's overlays and the one beside drew since the last news (`trialTrace`). */
  readonly trace: TrialTrace | null;
  readonly besideTrace: TrialTrace | null;
}

/** A body of a duel's stage as the page makes its spec: its side, and whether it is in the bout beside (`duelSpec` of that bout's recipe). */
export interface DuelCard {
  readonly side: Side;
  readonly beside: boolean;
}

/** A bout built and played as the Arena plays it: its verdict's aftermath shown with the defeated loose (`arenaPlayback`), stopped at `played`. */
async function played(start: BesideStart, hooks: ConstructorParameters<typeof Duel>[2] = {}) {
  await loadData(SIDES.flatMap((side) => treeData(start.recipe.minds?.[side] ?? defaultMind(start.recipe[side]))));
  const built = await buildBout(start.recipe, { ...start.engine === undefined ? {} : { engine: start.engine }, hooks });
  const playback = arenaPlayback(built.duel, start.played ?? Infinity);
  return { ...built, playback };
}

/** `duel`'s bodies as a frame packs them. */
const framed = (duel: Duel): FramedBody[] => SIDES.map((side) => {
  const duelist = duel.duelists[side], read = physicalReading(duelist.built);
  return { segments: duelist.built.segments, life: () => duel.life(side), out: () => duel.eliminated(side),
    down: () => duelist.body.down, centre: () => read().centre };
});

/**
 * **A duel's stage**: `start`'s bout built by `buildBout`, its minds' data loaded first, played as
 * the Arena plays it (`arenaPlayback`), its tape played as it steps, and the side a person leads
 * led as a team of one, whose orders go on its tape; with the bout beside it, where there is one,
 * stepped with it in a world of its own. Each step's news is what the Arena shows of it
 * (`DuelNews`); a new choice for the person's side holds it, where they asked.
 */
export async function duelStage(start: DuelStart): Promise<Stage<DuelCard, DuelInput>> {
  const cues: SoundCue[] = [];
  const main = await played(start, { onBlow: (blow) => { cues.push(...debrisCues(blow)); } });
  const beside = start.beside, other = beside ? await played(beside) : null;
  const { world, duel, playback } = main;
  const sides = SIDES.map((side) => ({ id: side, built: duel.duelists[side].built }));
  const hearing = hearTouches(world, sides, (cue) => { cues.push(cue); });
  const airs = SIDES.map((side) => ({ side, air: airOf(duel.duelists[side].built) })), airAt = new Vector3();
  const trace = start.traced ? trialTrace(duel) : null, besideTrace = start.traced && other ? trialTrace(other.duel) : null;
  duel.play(start.tape);
  if (other && beside) other.duel.play(beside.tape);
  const led: TeamOfOne | null = start.person ? teamOfOne(duel, start.person, { kind: "party", picks: false }) : null;
  const readings = Object.fromEntries(SIDES.map((side) => [side, fighterReading(duel.duelists[side], () => duel.blows)])) as Record<Side, ReturnType<typeof fighterReading>>;
  const time = () => duel.state.start + (duel.verdict?.time ?? duel.clock);
  let feedStopped = false;
  const sampling = world.afterStep(() => {
    for (const side of SIDES) readings[side].sample(time(), !feedStopped);
    if (duel.verdict) feedStopped = true;
  });
  for (const side of SIDES) readings[side].sample(time());

  const roster = [...SIDES.map((side) => ({ id: side, segments: [...duel.duelists[side].built.segments.keys()], card: { side, beside: false } })),
    ...other ? SIDES.map((side) => ({ id: `beside.${side}`, segments: [...other.duel.duelists[side].built.segments.keys()], card: { side, beside: true } })) : []];
  const bodies = [...framed(duel), ...other ? framed(other.duel) : []];
  const { length } = frameLayout(roster);
  const looks = Object.fromEntries(SIDES.map((side) => [side, { menu: false, mind: false }])) as Record<Side, { menu: boolean; mind: boolean }>;
  const watch = choiceWatch();
  let lead: DuelInput & { kind: "lead" } | null = null, hold = start.hold, choosing = false, taken = 0;

  /** The person's lead as the team reads it, from their input and the world as it stands. */
  const leading = () => {
    if (!led || !start.person) return;
    const input = lead?.lead ?? null, own = duel.duelists[start.person];
    if (!input) { led.lead = null; return; }
    const point = input.ray ? aimPoint(input.ray.origin, input.ray.direction, own.body.physical.centre.y) : null;
    const strike = input.attacking && input.ray ? rayTarget(own.senses(), input.ray.origin, input.ray.direction, input.ray.length) : null;
    led.lead = { keys: input.keys, walk: input.walk, aim: point ? { x: point[0], z: point[2] } : null, strike, explore: false };
  };
  /** Whether the person's side has a new choice to hold for. */
  const chose = (): boolean => {
    if (!hold || !led || !start.person || duel.verdict) return false;
    const own = duel.duelists[start.person], report = own.minded.report, menu = report?.menu;
    return !!menu && watch.changed(menu, report!.ended ?? [], own.body.down, duel.clock);
  };
  const sideNews = (side: Side): SideNews => {
    const fighter = duel.duelists[side], mind = fighter.minded, look = looks[side];
    const phase = mind.skills ? mind.skills.report.actions[0]?.stage ?? mind.report?.engagement?.phase ?? "guard / move" : mind.body.has;
    const report = mind.report ?? null;
    return { phase, has: fighter.body.has, down: fighter.body.down, downFor: duel.state.recovery?.[side] ?? null,
      assisted: fighter.body.assist.on, hud: readings[side].read(time()),
      ...look.menu ? { menu: report?.menu ?? null } : {},
      ...look.mind ? { inspected: { body: { has: fighter.body.has, level: fighter.body.level },
        skills: mind.skills ? { report: { holders: mind.skills.report.holders, actions: mind.skills.report.actions } } : null,
        report: report ? { engagement: report.engagement, actions: report.actions, ended: report.ended } : null } } : {} };
  };
  const mainDone = () => playback.done, besideDone = () => other?.playback.done ?? true;

  return {
    hz: world.hz, roster,
    step() {
      if (!mainDone()) {
        leading();
        world.step();
        choosing = chose();
      }
      if (other && !besideDone()) other.world.step();
      taken += 1;
    },
    frame: () => packFrame(bodies, length, taken / world.hz, taken),
    news() {
      const air = airs.map(({ side, air }) => { const speed = air(airAt); return { side, speed, at: [airAt.x, airAt.y, airAt.z] as Vec3 }; });
      const news: DuelNews = { clock: duel.clock, start: duel.state.start, verdict: duel.verdict, done: mainDone() && besideDone(), choosing,
        sides: { left: sideNews("left"), right: sideNews("right") }, cues: cues.splice(0), air,
        trace: trace?.take() ?? null, besideTrace: besideTrace?.take() ?? null };
      const held = choosing;
      choosing = false;
      return { ...duel.verdict ? { verdict: duel.verdict } : {}, ...held ? { held } : {}, duel: news };
    },
    over: () => mainDone() && besideDone(),
    input(input) {
      switch (input.kind) {
        case "lead": lead = input; return;
        case "go": {
          if (!led || !start.person) return;
          const own = duel.duelists[start.person], { origin, direction, length: reach } = input.ray;
          const floor = aimPoint(origin, direction, 0);
          if (floor && !rayTarget(own.senses(), origin, direction, reach)) led.hear({ kind: "go", destination: { x: floor[0], z: floor[2] } });
          return;
        }
        case "attack":
          if (!led) return;
          led.hear({ kind: "attack", ...input.strike });
          watch.picked(input.among);
          return;
        case "look": looks[input.side] = { menu: input.menu, mind: input.mind }; return;
        case "hold": hold = input.hold; watch.reset(); return;
        default: { const never: never = input; throw new Error(`unknown input ${JSON.stringify(never)}`); }
      }
    },
    tape: () => duel.tape,
    dispose() {
      sampling.dispose(); hearing.dispose(); trace?.dispose(); besideTrace?.dispose(); led?.dispose();
      playback.dispose(); other?.playback.dispose();
      main.dispose(); other?.dispose();
    },
  };
}
