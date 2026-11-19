/**
 * **The coarse table**, a kind of outcome model (`OutcomeModel`): another model's answers kept by a
 * start rounded to a cell, so a read costs a look-up once its cell has been read.
 */
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { OutcomeModel } from "./outcomes.ts";
import { PROFILE_SPANS, STANCE_SPANS } from "./profile/nearest.ts";
import { type Expected, type ProfileReading } from "./profile/reading.ts";
import { type StanceNumbers } from "./profile/profile.ts";

/** Where a reading is asked at, and the progress a let-go is asked at. */
type At = Parameters<ProfileReading["expect"]>[0];

/**
 * How finely a coarse table rounds a start: half the span over which a reading takes trials as
 * alike (`PROFILE_SPANS`, `STANCE_SPANS`), so a cell's answer is one its neighbours' nearest trials
 * would mostly give; and a let-go's progress, s.
 */
const CELL = Object.freeze({ range: PROFILE_SPANS.range / 2, speed: PROFILE_SPANS.speed / 2, place: PROFILE_SPANS.place / 2, progress: .02,
  stance: Object.freeze({ stagger: STANCE_SPANS.stagger / 2, width: STANCE_SPANS.width / 2, height: STANCE_SPANS.height / 2 }) });

/** `x` rounded to the nearest multiple of `step`. */
const cell = (x: number, step: number): number => Math.round(x / step) * step;

/** `at` at the middle of its cell (`CELL`), and the cell's key. */
function cellOf(at: At): { readonly at: At; readonly key: string } {
  const range = cell(at.range, CELL.range), velocity = at.velocity && [cell(at.velocity[0], CELL.speed), cell(at.velocity[1], CELL.speed)] as const;
  const window = at.window && [cell(at.window[0], CELL.place), cell(at.window[1], CELL.place)] as const, progress = at.progress === undefined ? undefined : cell(at.progress, CELL.progress);
  const stanced = (one: StanceNumbers | undefined) => one && { stagger: cell(one.stagger, CELL.stance.stagger), width: cell(one.width, CELL.stance.width), height: cell(one.height, CELL.stance.height) };
  const stance = at.stance && { ...at.stance.own ? { own: stanced(at.stance.own)! } : {}, ...at.stance.target ? { target: stanced(at.stance.target)! } : {} };
  const placed: At = { range, phase: at.phase, ...at.postures ? { postures: at.postures } : {}, ...velocity ? { velocity } : {}, ...window ? { window } : {}, ...stance ? { stance } : {}, ...progress === undefined ? {} : { progress } };
  const numbers = (one: StanceNumbers | undefined) => one ? `${one.stagger},${one.width},${one.height}` : "";
  return { at: placed, key: `${at.phase}|${at.postures?.own ?? ""}|${at.postures?.target ?? ""}|${range}|${velocity ?? ""}|${window ?? ""}|${numbers(stance?.own)}|${numbers(stance?.target)}|${progress ?? ""}` };
}

/** Each reading a coarse table answers by, made once a reading read. */
const COARSE = new WeakMap<ProfileReading, ProfileReading>();

/**
 * **`reading` as a coarse table**: what it expects and its rate at a start, answered at the middle of
 * the start's cell (`cellOf`) and kept, by the struck body, so a cell is read of its trials once and
 * then looked up; its reach and extremes its own.
 */
function coarseReading(reading: ProfileReading): ProfileReading {
  const known = COARSE.get(reading);
  if (known) return known;
  const expected = new WeakMap<BodySpec, Map<string, Expected | null>>(), rates = new WeakMap<BodySpec, Map<string, number | null>>(), ALONE = {} as BodySpec;
  const keptFor = <T,>(kept: WeakMap<BodySpec, Map<string, T>>, struck: BodySpec | null): Map<string, T> => {
    const by = struck ?? ALONE;
    let map = kept.get(by);
    if (!map) kept.set(by, map = new Map());
    return map;
  };
  const made: ProfileReading = {
    profile: reading.profile,
    reach: (phase) => reading.reach(phase),
    expect(at, struck) {
      const { at: middle, key } = cellOf(at), kept = keptFor(expected, struck);
      if (kept.has(key)) return kept.get(key)!;
      const answer = reading.expect(middle, struck);
      kept.set(key, answer);
      return answer;
    },
    rate(at, struck) {
      const { at: middle, key } = cellOf(at), kept = keptFor(rates, struck);
      if (kept.has(key)) return kept.get(key)!;
      const answer = reading.rate(middle, struck);
      kept.set(key, answer);
      return answer;
    },
    peak: (phase, struck) => reading.peak(phase, struck),
    fastest: (phase) => reading.fastest(phase),
    scaled: (struck) => reading.scaled(struck),
  };
  COARSE.set(reading, made);
  return made;
}

/**
 * **A coarse table** of `model`'s answers: each act as `model` has it, its readings answered at the
 * middle of a start's cell and kept (`coarseReading`), so a read costs a look-up once its cell has
 * been read, however many trials the act has.
 */
export function coarseTable(model: OutcomeModel): OutcomeModel {
  return {
    act(table, asked) {
      const act = model.act(table, asked);
      if (!act) return null;
      return {
        stale: act.stale, read: act.read,
        reading(struck, spec, postures) {
          const reading = act.reading(struck, spec, postures);
          return reading ? coarseReading(reading) : null;
        },
      };
    },
  };
}
