/**
 * **The Cover drill's cases**: the subject's mind, ordered to stand facing its foe and strike nothing
 * (the stand Commander), covers as it chooses against a drill opponent striking on its script: rung 1 (`punched`) closing
 * to punch (`drill-punch`), two seconds striking and one standing, round again. The subject is a
 * Warrior empty-handed; the opponent starts the condition's gap ahead and offset across, the two on the
 * stage's own axis as a bout's spawns are, so the Arena's camera sees them side on. Nothing ends a
 * trial but its seconds. A trial is a bout world, so the Arena plays it as it was scored.
 */
import { presetFitsModel } from "../../minds/catalog/controller.ts";
import { loadoutKey, type Loadout } from "../../core/bodies/items/held.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import { deepFreeze } from "../../core/state.ts";
import { mindOf, seatBody, sideCharacters, type Cases, type Json, type Subject } from "../evaluation.ts";
import { readCover, type CoverReading } from "./read.ts";
import { createDrillOpponents, opposed } from "../drill-opponents.ts";
import { between } from "../twin.ts";
import { type GameContext, mindFaults as contextMindFaults } from "../../game/arena/context.ts";

/** What the subject holds in its right hand: nothing, a club or a sword. */
type CoverHeld = "empty" | "club" | "sword";

/** What the subject holds in its left hand, where it holds anything: a buckler. */
type CoverShield = "buckler";

/**
 * One trial's conditions, range last: the strip's columns (`Evaluation.outcome`). The left hand is
 * named only where it holds something, so a trial with an empty left hand keys without it.
 */
export type CoverCondition = { readonly model: BodyModel; readonly held: CoverHeld; readonly left?: CoverShield; readonly across: number; readonly gap: number };

/**
 * A rung: its opponent (`opponentOf`) and what that one holds; the subjects' bodies and what
 * they hold; how far ahead the opponent's centre stands at the start and how far to the side, m;
 * and how long a trial plays, s. A change here is a new protocol.
 */
const PUNCHED = deepFreeze({
  opponent: "drill-punch", foe: { left: "empty", right: "empty" } as Loadout,
  models: ["man"] as BodyModel[], loadouts: [{ left: "empty", right: "empty" }] as Loadout[],
  across: [0, .2], gaps: [1.2, 1.6, 2], seconds: 8,
});

type Rung = typeof PUNCHED;

/** Against a weapon: every body holding the buckler with the club or the sword, struck by a drill opponent's club on its rhythm. */
const CLUBBED = deepFreeze({ ...PUNCHED, opponent: "drill-club", foe: { left: "empty", right: "club" } as Loadout,
  models: ["man", "woman", "skeleton"] as BodyModel[],
  loadouts: [{ left: "buckler", right: "club" }, { left: "buckler", right: "sword" }] as Loadout[] });

/** The same, struck by a drill opponent's sword thrust. */
const SWORD = deepFreeze({ ...CLUBBED, opponent: "drill-sword", foe: { left: "empty", right: "sword" } as Loadout });

/** What the subject holds, as a loadout. */
const loadoutOf = ({ held, left }: Pick<CoverCondition, "held" | "left">): Loadout => ({ left: left ?? "empty", right: held });

/** The Commander that leads the subject: stand facing the foe, and strike nothing. */
const STANDING = deepFreeze({ kind: "stand" });

export function createCoverCases(context: GameContext) {
  const { treeObeys, controllers: CONTROLLERS } = context.catalog;
  const mindFaults = contextMindFaults.bind(undefined, context);
  const { opponentOf } = createDrillOpponents(context);

  /** Why `value` is no subject, or what keeps its mind from `model` holding `loadout` (`mindFaults`). */
  function faultsOf(value: Json, model: BodyModel, loadout: Loadout, subject?: Subject): readonly string[] {
    const kind = (value as { kind?: unknown } | null)?.kind;
    if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
    if (!presetFitsModel(subject ?? {}, model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
    if (!treeObeys(mindOf(value))) return [`a ${kind} mind carries out no orders, so no drill leads it`];
    return mindFaults(mindOf(value), seatBody(model, loadout, subject), { entry: [] }).map((fault) => `${model}, ${loadoutKey(loadout)}: ${fault}`);
  }

  function coverCases(protocol: Rung): Cases<CoverCondition, CoverReading> {
    const conditions: CoverCondition[] = [];
    for (const model of protocol.models) for (const { left, right } of protocol.loadouts) for (const across of protocol.across) for (const gap of protocol.gaps)
      conditions.push({ model, held: right as CoverHeld, ...(left === "empty" ? {} : { left: left as CoverShield }), across, gap });
    return {
      arity: 1,
      play: { ...protocol, recordsAttackAttempt: true } as unknown as Json,
      conditions,
      seconds: protocol.seconds,
      faults: (value, condition, subject) => faultsOf(value, condition.model, loadoutOf(condition), subject),
      world: ([value], condition, engine, [seat]) => {
        const { model, across, gap } = condition;
        return { kind: "bout", engine, tape: [],
          // A drill, not a fight: nothing ends it but its reader.
          recipe: { left: model, right: "man", capSeconds: protocol.seconds + 1, recoverySeconds: null, entry: [], ends: [], ...sideCharacters({ left: model, right: "man" }, { left: seat }),
            loadouts: { left: loadoutOf(condition), right: protocol.foe },
            // Along +x, as the open stage's spawns are.
            start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, across], heading: -Math.PI / 2 } },
            ...opposed({ mind: mindOf(value), commander: STANDING }, opponentOf(protocol.opponent)!) } };
      },
      read: (built) => readCover(built, protocol),
    };
  }

  /** A rung a table cell reads, `name`, beside its training twin, `<name>-twin`: its places halfway between its gaps and its offsets across (`between`). */
  const twinned = (name: string, rung: Rung): Record<string, Cases<CoverCondition, CoverReading>> =>
    ({ [name]: { ...coverCases(rung), twin: `${name}-twin` }, [`${name}-twin`]: coverCases(deepFreeze({ ...rung, gaps: between(rung.gaps), across: between(rung.across) })) });

  /** Every protocol the Cover drill may be played on, by name: its rungs. */
  const COVER_CASES: Readonly<Record<string, Cases<CoverCondition, CoverReading>>> = Object.freeze({ punched: coverCases(PUNCHED), ...twinned("club", CLUBBED), ...twinned("sword", SWORD) });

  return { COVER_CASES };
}
