import test from "node:test";
import assert from "node:assert/strict";
import { baselineOf, rowsOn, scoreOf } from "../src/evaluation/table/judge.ts";

const WARRIOR = "workshop-fighter", EMPTY = { left: "empty", right: "empty" }, CLUB = { left: "empty", right: "club" };

/** A strike trial: how it came out, whether it began, its hit (a fist's speed, a held blow's value), and whether the striker fell. */
const strike = (outcome, { began = 1, speed = null, held = null, down = false } = {}) => ({ condition: { model: WARRIOR },
  reading: { outcome, began: began ? 1 : null, down, hit: speed === null && held === null ? null : { speed, foot: null, held: held === null ? null : { value: held } } } });

/**
 * A strike rung's score is the median of its hit's figure over the trials begun, a trial whose
 * limb met the mark (landed or weak) at its figure and any other begun at 0; a trial never begun
 * (refused) is beside it, not in it.
 */
test("a strike's score is the failure-inclusive median of its hit's figure over the trials begun", () => {
  const rows = [strike("landed", { speed: 7 }), strike("weak", { speed: 5 }), strike("missed"), strike("fell", { speed: 9, down: true }), strike("landed", { speed: 8 }),
    strike("refused", { began: false }), strike("refused", { began: false })];
  assert.deepEqual(scoreOf({ drill: "strike", protocol: "still", subject: "option/straight-punch", judge: "landed", hit: "fist" }, rows),
    { value: 5, unit: "m/s", figures: "5 begun, 3 on the mark, 2 landed, 1 fell, 2 refused, 7 trials" });
  const club = [strike("landed", { speed: 6, held: 70 }), strike("weak", { speed: 4, held: 30 }), strike("missed")];
  assert.deepEqual(scoreOf({ drill: "strike", protocol: "still", subject: "option/club-blow@empty,club", judge: "landed", hit: "energy" }, club),
    { value: 30, unit: "J", figures: "3 begun, 2 on the mark, 1 landed, 0 fell, 0 refused, 3 trials" });
  assert.equal(scoreOf({ drill: "strike", protocol: "still", subject: "option/straight-punch", judge: "landed", hit: "fist" }, []), null, "no rows, no score");
});

test("a walk scores its share not fallen and the Cover drill its share of blows the buckler met first", () => {
  const walks = [{ kind: "walk", fell: false, along: 1 }, { kind: "walk", fell: true, along: .5 }, { kind: "shove", fell: false, along: null }, { kind: "walk", fell: false, along: 1.2 }]
    .map((reading) => ({ condition: { model: WARRIOR }, reading }));
  assert.deepEqual(scoreOf({ drill: "locomotion", protocol: "every", subject: "option", judge: "walk" }, walks),
    { value: .75, unit: "share not fallen", figures: "1 of 4 fell, walk along 1.00 of the pace asked (median)" });
  const covers = [{ blows: 3, shielded: 2, down: false }, { blows: 1, shielded: 1, down: true }].map((reading) => ({ condition: { model: WARRIOR }, reading }));
  assert.deepEqual(scoreOf({ drill: "cover", protocol: "club", subject: "option", judge: "buckler" }, covers),
    { value: .75, unit: "share of blows met by the buckler first", figures: "3 of 4 blows, 1 fell, 2 trials" });
});

/** A baseline is its cell's alone: its body, its loadout, its reading's protocol and subject. */
test("a cell's baseline is the one of its body, loadout, protocol and subject", () => {
  const entry = (body, loadout, protocol, subject) => ({ body, loadout, protocol, subject, record: `${body}-${loadout}-${protocol}.jsonl`, id: subject, version: "v" });
  const baselines = [entry(WARRIOR, "empty,empty", "still", "option/straight-punch"), entry(WARRIOR, "empty,empty", "walk", "option/straight-punch"),
    entry(WARRIOR, "empty,club", "still", "option/straight-punch@empty,club"), entry("workshop-rogue", "empty,empty", "still", "option/straight-punch")];
  assert.deepEqual(baselineOf(baselines, { body: WARRIOR, loadout: EMPTY }, { protocol: "walk", subject: "option/straight-punch" }), baselines[1]);
  assert.deepEqual(baselineOf(baselines, { body: WARRIOR, loadout: CLUB }, { protocol: "still", subject: "option/straight-punch@empty,club" }), baselines[2]);
  assert.equal(baselineOf(baselines, { body: "crypt-skeleton", loadout: EMPTY }, { protocol: "still", subject: "option/straight-punch" }), null);
  assert.equal(baselineOf(baselines, { body: WARRIOR, loadout: EMPTY }, { protocol: "fight", subject: "option/straight-punch" }), null);
});

test("a cell reads the rows on its body, and on its loadout where its drill lays its trials out by loadout", () => {
  const rows = [{ model: WARRIOR, loadout: CLUB }, { model: WARRIOR, held: "club" }, { model: WARRIOR }, { model: "workshop-rogue", loadout: CLUB }]
    .map((condition) => ({ condition, reading: {} }));
  assert.deepEqual(rowsOn({ body: WARRIOR, loadout: CLUB }, { byLoadout: true }, rows), rows.slice(0, 2));
  assert.deepEqual(rowsOn({ body: WARRIOR, loadout: CLUB }, {}, rows), rows.slice(0, 3));
});
