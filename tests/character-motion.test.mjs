/**
 * The character workshop's loops, read frame by frame off the exported models: the bow hand turns without a
 * flip between its authored poses, and through the sword-and-shield and the bow loops the wrists stay open, the
 * forearms slim, and the arms and what they hold clear of the head, the body and each other
 * (`scripts/character-lab/validation.mjs`).
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CHARACTERS, clipFor } from "../src/character-lab/catalog.ts";
import { surface } from "../scripts/character-lab/contact.mjs";
import { forearmExpansion, meshCrossesSurface, skinPart, skinRegions, surfaceIndex, wristAreaRatio } from "../scripts/character-lab/validation.mjs";
import { LOOP, workshopModels } from "./harness/workshop-model.mjs";

const IDS = Object.keys(CHARACTERS);
const SIDES = ["l", "r"];
const FRAMES = LOOP.seconds * LOOP.framesPerSecond;
/** The fastest the bow hand may turn, degrees a second. */
const TURN_RATE = 180;
/** The frames of the sword's wind-up, and the least its wrist stands from its shoulder through them, m. */
const WIND_UP = { from: 228, to: 243, reach: 0.34 };
/** The least a wrist's section may keep of its rest area, and the most a forearm's skin may stand from its axis
 * as a multiple of its rest distance. */
const WRIST_AREA = 0.65, FOREARM_SWELL = 1.5;
/** What each loop holds that could pass through the body. */
const CARRIED = { "sword-shield": ["sword__blade", "shield__board"], bow: ["bow__stave", "bow__string", "bow__arrow"] };

const models = workshopModels();
after(() => models.dispose());

const loop = (weapon) => clipFor("loop", { weapon });
const seconds = (frame) => `${(frame / LOOP.framesPerSecond).toFixed(3)} s`;

/** How fast a body turns that goes from `from` to `to` in `spacing` of a second, degrees a second. */
function turnRate(from, to, spacing) {
  const dot = Math.abs(from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w);
  return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI / spacing;
}

/** The parts of `model` the clearance checks read: the skin, the jacket, the head, the torso, each side's hand
 * and forearm, each side's whole arm in skin and in sleeve, and the regions of each arm on the skin. */
function partsOf(model) {
  const skin = model.mesh("base__skin"), jacket = model.mesh("base__jacket");
  const sided = (pattern, side) => (bone) => pattern.test(bone) && bone.endsWith(`_${side}`);
  return {
    skin, jacket,
    head: skinPart(skin, (bone) => bone === "head" || bone === "neck_01"),
    torso: skinPart(jacket, (bone) => /spine|pelvis|neck/.test(bone)),
    hands: SIDES.map((side) => skinPart(skin, sided(/lowerarm|forearm_twist|hand|thumb|index|middle|ring|pinky/, side))),
    arms: Object.fromEntries(SIDES.map((side) => [side, [skin, jacket].map((mesh) => skinPart(mesh, sided(/arm|hand|thumb|index|middle|ring|pinky/, side)))])),
    regions: Object.fromEntries(SIDES.map((side) => [side, skinRegions(skin, side)])),
  };
}

test("the turn rate reads a quarter turn in half a frame, and none between a pose and itself", () => {
  const still = Quaternion.Identity(), quarter = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
  const spacing = 0.5 / LOOP.framesPerSecond;
  assert.deepEqual([Math.round(turnRate(still, still, spacing)), Math.round(turnRate(still, quarter, spacing))], [0, 10800],
    "a quarter turn in a 120th of a second is 10800 degrees a second");
});

for (const id of IDS) {
  test(`${id}: the bow hand turns no faster than ${TURN_RATE} degrees a second, read at every half frame`, async () => {
    const model = await models.model(id);
    let last, peak = 0, at = 0;
    // Half frames are read too: a flip between two authored keys shows only in what is interpolated between them.
    for (let frame = 0; frame <= FRAMES; frame += 0.5) {
      model.pose(loop("bow"), frame);
      const turned = model.rotation("hand_l");
      const rate = last ? turnRate(last, turned, 0.5 / LOOP.framesPerSecond) : 0;
      if (rate > peak) [peak, at] = [rate, frame];
      last = turned;
    }
    assert.ok(peak > 1, `the hand turns at all: ${peak.toFixed(1)} degrees a second at most`);
    assert.ok(peak <= TURN_RATE, `the bow hand turns ${peak.toFixed(1)} degrees a second at ${seconds(at)}`);
  });

  test(`${id}: the checks find a crossed triangle, a surface pushed through another, a wrist pressed flat and a forearm swollen`, async () => {
    const model = await models.model(id), { skin, head, regions } = partsOf(model);
    model.pose(loop("sword-shield"), 0);
    const points = surface(skin), cache = new Map([[skin, points]]), skull = surfaceIndex([head], cache);

    const [a, b, c] = Array.from(head.getIndices().slice(0, 3), (i) => points[i]);
    const centre = a.add(b).add(c).scale(1 / 3), normal = Vector3.Cross(b.subtract(a), c.subtract(a)).normalize().scale(0.01);
    assert.deepEqual([skull.intersects(centre.subtract(normal), centre.add(normal)), skull.intersects(centre.add(normal), centre.add(normal.scale(2)))],
      [true, false], "a segment through a triangle of the head crosses it, and one that stops short of it does not");

    // The head against itself moved a centimetre to the side, and moved three metres.
    const moved = (by) => {
      const copy = { getIndices: () => head.getIndices() };
      cache.set(copy, points.map((point) => point.add(new Vector3(by, 0, 0))));
      return copy;
    };
    assert.deepEqual([meshCrossesSurface(moved(0.01), skull, cache), meshCrossesSurface(moved(3), skull, cache)], [true, false],
      "the head moved a centimetre passes through the head, and moved three metres it does not");

    // The skin drawn in toward the right forearm's axis to a tenth of its distance, and pushed out to twice it.
    const elbow = model.point("lowerarm_r"), wrist = model.point("hand_r"), axis = wrist.subtract(elbow).normalize();
    const scaled = (by) => points.map((point) => {
      const from = point.subtract(wrist), along = axis.scale(Vector3.Dot(from, axis));
      return wrist.add(along).add(from.subtract(along).scale(by));
    });
    const kept = [wristAreaRatio(regions.r, points, axis), wristAreaRatio(regions.r, scaled(0.1), axis)];
    assert.ok(kept[0] > WRIST_AREA && kept[1] < 0.05, `the wrist as it stands keeps its area, and pressed flat it keeps under a twentieth: ${kept}`);
    const swell = [forearmExpansion(regions.r, points, elbow, wrist), forearmExpansion(regions.r, scaled(2), elbow, wrist)];
    assert.ok(swell[0] < FOREARM_SWELL && swell[1] > FOREARM_SWELL, `the forearm as it stands is slim, and pushed out to twice its distance it is not: ${swell}`);
  });

  test(`${id}: a part of the skin is the skin of its own bones`, async () => {
    const model = await models.model(id), { skin, head, hands } = partsOf(model);
    model.pose(loop("sword-shield"), 0);
    const points = surface(skin), of = (part) => [...new Set(part.getIndices())].map((i) => points[i]);
    const shoulders = Math.max(model.point("upperarm_l").y, model.point("upperarm_r").y);
    const lowest = Math.min(...of(head).map((point) => point.y));
    assert.ok(lowest > shoulders, `standing, the head's skin is all above the shoulders at ${shoulders.toFixed(3)} m: it reaches down to ${lowest.toFixed(3)} m`);
    // Along the forearm, 0 is the elbow and 1 the wrist.
    const nearest = SIDES.map((side, i) => {
      const elbow = model.point(`lowerarm_${side}`), forearm = model.point(`hand_${side}`).subtract(elbow);
      return Math.min(...of(hands[i]).map((point) => Vector3.Dot(point.subtract(elbow), forearm) / forearm.lengthSquared()));
    });
    assert.ok(nearest.every((along) => along > 1 / 3), `each hand and forearm's skin is all beyond a third of the forearm from the elbow: ${nearest}`);
  });

  test(`${id}: the sword's wind-up keeps the hand more than ${WIND_UP.reach} m from the shoulder`, async () => {
    const model = await models.model(id), folded = [];
    for (let frame = WIND_UP.from; frame <= WIND_UP.to; frame++) {
      model.pose(loop("sword-shield"), frame);
      const reach = Vector3.Distance(model.point("hand_r"), model.point("upperarm_r"));
      if (!(reach > WIND_UP.reach)) folded.push(`${seconds(frame)}: ${reach.toFixed(3)} m`);
    }
    assert.deepEqual(folded, [], "the wrist never folds against the shoulder");
  });

  for (const weapon of Object.keys(CARRIED)) {
    test(`${id}: through the ${weapon} loop the wrists stay open, the forearms slim and every surface clear`, async () => {
      const model = await models.model(id), { skin, jacket, head, torso, hands, arms, regions } = partsOf(model);
      const trousers = model.mesh("base__trousers"), carried = CARRIED[weapon].map((name) => model.mesh(name));
      const shut = [], swollen = [], inHead = [], inTorso = [], crossed = [], inBody = [];
      for (let frame = 0; frame <= FRAMES; frame++) {
        model.pose(loop(weapon), frame);
        const at = seconds(frame), points = surface(skin), cache = new Map([[skin, points]]);
        for (const side of SIDES) {
          const elbow = model.point(`lowerarm_${side}`), wrist = model.point(`hand_${side}`);
          const area = wristAreaRatio(regions[side], points, wrist.subtract(elbow).normalize());
          if (!(area > WRIST_AREA)) shut.push(`${at}, ${side}: ${area.toFixed(2)}`);
          const swell = forearmExpansion(regions[side], points, elbow, wrist);
          if (!(swell < FOREARM_SWELL)) swollen.push(`${at}, ${side}: ${swell.toFixed(2)}`);
        }
        const skull = surfaceIndex([head], cache);
        for (const side of SIDES) if (meshCrossesSurface(arms[side][0], skull, cache)) inHead.push(`${at}, ${side}`);
        const chest = surfaceIndex([torso], cache);
        if (hands.some((hand) => meshCrossesSurface(hand, chest, cache))) inTorso.push(at);
        const right = surfaceIndex(arms.r, cache);
        if (arms.l.some((arm) => meshCrossesSurface(arm, right, cache))) crossed.push(at);
        const body = surfaceIndex([jacket, trousers, head], cache);
        for (const held of carried) if (meshCrossesSurface(held, body, cache)) inBody.push(`${at}: ${held.name}`);
      }
      assert.deepEqual(shut, [], `each wrist keeps more than ${WRIST_AREA} of its rest area at every section`);
      assert.deepEqual(swollen, [], `no forearm's skin stands ${FOREARM_SWELL} times its rest distance from the axis`);
      assert.deepEqual(inHead, [], "neither arm's skin passes through the head");
      assert.deepEqual(inTorso, [], "neither hand nor forearm passes through the jacket's torso");
      assert.deepEqual(crossed, [], "the left arm, in skin and in sleeve, does not pass through the right");
      assert.deepEqual(inBody, [], "nothing carried passes through the jacket, the trousers or the head");
    });
  }
}
