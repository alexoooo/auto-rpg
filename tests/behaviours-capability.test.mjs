/**
 * **How far the behaviours take a body, and what they throw**, in Arena bouts against a Warrior
 * standing in guard (`tests/fixtures/behaving-bout.mjs`; Node, core world, Rapier, 120 Hz): the
 * Runner and the Charger move the gap by over 0.8 m in 4 s, and the left-hand and kick-only
 * fighters each commit an action with only their named effectors.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { againstStanding, CHARGER, KICKS_ONLY, LEFT_HAND, RUNNER } from "./fixtures/behaving-bout.mjs";

test("the Runner opens the gap and the Charger closes it by over 0.8 m in 4 s", async () => {
  // Each walks for about 2.5 of its 4 s at the walk's pace, 0.4 m/s and more.
  const ran = await againstStanding(RUNNER, 4), charged = await againstStanding(CHARGER, 4);
  assert.ok(ran.gap - ran.opened > .8, JSON.stringify(ran)); assert.ok(charged.opened - charged.gap > .8, JSON.stringify(charged));
});

test("a configured left-hand fighter admits only its named effector", async () => {
  const jabbed = await againstStanding(LEFT_HAND, 8, .8);
  assert.ok(jabbed.effectors.length > 0, JSON.stringify(jabbed)); assert.ok(jabbed.effectors.every(effector => effector === "hand.left"));
});

test("a configured kick-only fighter commits a kick, and with its named effectors only", async () => {
  const kicked = await againstStanding(KICKS_ONLY, 8, 1.2);
  assert.ok(kicked.effectors.length > 0, JSON.stringify(kicked)); assert.ok(kicked.effectors.every(effector => effector.startsWith("foot.")));
});
