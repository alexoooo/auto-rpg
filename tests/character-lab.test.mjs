/**
 * The character workshop's models as they are exported: what each loadout shows, and what the authored loop does
 * with the body and with what it holds. The loop stands until 0.6 s, walks out until 3 s, attacks where it stands,
 * turns from 6.4 s, walks back from 8 s and turns again from 10.4 s (`pose`,
 * `scripts/character-lab/realistic/motion.py`). Every reading is of the exported bones and skin, never of the
 * generator's targets.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CHARACTERS, clipFor, gripHand, visiblePart } from "../src/character-lab/catalog.ts";
import { surface } from "../scripts/character-lab/contact.mjs";
import { contactPatch, gripDistances, gripGap, skinRegions } from "../scripts/character-lab/validation.mjs";
import { LOOP, workshopModels } from "./harness/workshop-model.mjs";

const IDS = Object.keys(CHARACTERS);
/** The mesh groups each choice of weapon shows, written out here apart from the catalogue's own table. */
const HELD = { empty: [], sword: ["sword"], shield: ["shield"], "sword-shield": ["shield", "sword"], bow: ["bow"] };
const WEAPON_IDS = Object.keys(HELD);
const SIDES = ["l", "r"];
const DIGITS = ["index", "middle", "ring", "pinky", "thumb"];

/** Moments of the loop, s: the walk out has ended and the guard is up; the blow is under way; the bow is drawn;
 * the arrow has gone. */
const WALKED_OUT = 3.1, STRUCK = 4.5, DRAWN = 4.6, RELEASED = 5;
/** Two moments of one step of the walk out, s, with the left foot on the ground through both. */
const STANCE = [0.8, 1.0];
/** The loop is read for the wrists and the torso every 0.2 s. */
const SAMPLES = Array.from({ length: LOOP.seconds * 5 }, (_, step) => step / 5);
/** The widest a wrist may bend: the angle between the forearm and the hand's length, degrees. */
const WRIST_BEND = 60;
/** The torso, as an ellipsoid about the middle of the pelvis and the neck: its half width and half depth, m, and
 * its half height as a share of the pelvis to the neck. */
const TORSO = { across: 0.16, front: 0.13, up: 0.52 };
/** A grip is held when the pad's nearest point sinks no deeper than `deepest` into it, its contact
 * (`contactPatch`) lies within `patch` of it, and a digit's nearest skin within `gap`, m. */
const HOLD = { deepest: -0.0015, patch: 0.004, gap: 0.003 };

const models = workshopModels();
after(() => models.dispose());

const loop = (weapon) => clipFor("loop", { weapon });
/** Stands `model` at `seconds` of the loop with `weapon`. */
const stand = (model, weapon, seconds) => model.pose(loop(weapon), seconds * LOOP.framesPerSecond);
const millimetres = (metres) => Math.round(metres * 1000);

/** The skin of `model`, the regions of each arm on it, and each vertex's bones with their weights. */
function skinOf(model) {
  const skin = model.mesh("base__skin");
  const indices = skin.getVerticesData("matricesIndices"), weights = skin.getVerticesData("matricesWeights");
  const names = new Map(skin.skeleton.bones.map((bone) => [bone.getIndex(), bone.name]));
  /** Whether vertex `i` is bound by more than a quarter to one bone of `digit` on `side`. */
  const onDigit = (i, digit, side) => [0, 1, 2, 3].some((j) => {
    const name = names.get(indices[i * 4 + j]);
    return name?.startsWith(`${digit}_`) && name.endsWith(`_${side}`) && weights[i * 4 + j] > 0.25;
  });
  return { skin, regions: { l: skinRegions(skin, "l"), r: skinRegions(skin, "r") }, onDigit };
}

/** The grips a hand holds at the loop's first frame, each with the posed skin and the grip's own points. */
function* grips(model) {
  const { skin, regions, onDigit } = skinOf(model);
  for (const weapon of ["sword", "shield", "bow"]) {
    stand(model, weapon, 0);
    const side = gripHand(weapon);
    yield { weapon, side, points: surface(skin), grip: surface(model.mesh(`${weapon}__grip`)), regions: regions[side], onDigit };
  }
}

for (const id of IDS) {
  test(`${id}: every drawn part is skinned, and each loadout shows its own groups, its own strap and has both its clips`, async () => {
    const model = await models.model(id);
    assert.deepEqual(model.meshes.filter((mesh) => !mesh.skeleton).map((mesh) => mesh.name), [], "every drawn mesh is bound to the skeleton");
    const shown = {}, expected = {}, straps = {}, cut = {}, missing = [];
    for (const boots of [false, true]) for (const armour of [false, true]) for (const weapon of WEAPON_IDS) {
      const kit = { boots, armour, weapon }, name = `${boots ? "boots" : "bare"}, ${armour ? "armour" : "no armour"}, ${weapon}`;
      shown[name] = [...new Set(model.meshes.filter((mesh) => visiblePart(mesh.name, kit)).map((mesh) => mesh.name.split("__")[0]))].sort();
      expected[name] = ["base", boots ? "boots" : "bare", ...(armour ? ["armour"] : []), ...HELD[weapon]].sort();
      straps[name] = model.meshes.filter((mesh) => mesh.name.includes("strap") && visiblePart(mesh.name, kit)).map((mesh) => mesh.name);
      cut[name] = HELD[weapon].includes("shield") ? [`shield__forearm_strap_${armour ? "armour" : "cloth"}`] : [];
      for (const pose of ["inspection", "loop"]) if (!model.clips.includes(clipFor(pose, kit))) missing.push(clipFor(pose, kit));
    }
    assert.equal(Object.keys(shown).length, 20, "there are twenty loadouts");
    assert.deepEqual(shown, expected, "each loadout shows the body, its footwear, its armour and what it holds, and nothing else");
    assert.deepEqual(straps, cut, "a shield's forearm strap is the one cut for what the arm wears, and it is shown with no other weapon");
    assert.deepEqual(missing, [], "each loadout has a clip to be inspected in and a clip to loop");
  });

  test(`${id}: the loop walks out more than 1.5 m and ends where it began, whatever is in the hands`, async () => {
    const model = await models.model(id), strayed = [];
    for (const weapon of WEAPON_IDS) {
      const pelvis = [0, WALKED_OUT, LOOP.seconds].map((seconds) => { stand(model, weapon, seconds); return model.point("pelvis"); });
      const out = Vector3.Distance(pelvis[1], pelvis[0]), back = Vector3.Distance(pelvis[2], pelvis[0]);
      if (!(out > 1.5 && back < 0.005)) strayed.push(`${weapon}: out ${out.toFixed(3)} m, back to within ${back.toFixed(4)} m`);
    }
    assert.deepEqual(strayed, [], `the pelvis is more than 1.5 m from its start at ${WALKED_OUT} s, and within 5 mm of it at ${LOOP.seconds} s`);
  });

  test(`${id}: an attack moves the hand that makes it`, async () => {
    const model = await models.model(id), still = [];
    for (const weapon of WEAPON_IDS) {
      // The shield strikes with the arm that carries it, and everything else with the right.
      const hand = weapon === "shield" ? "hand_l" : "hand_r";
      const [guard, blow] = [WALKED_OUT, STRUCK].map((seconds) => { stand(model, weapon, seconds); return model.point(hand); });
      const moved = Vector3.Distance(blow, guard);
      if (!(moved > 0.08)) still.push(`${weapon}: ${hand} moves ${millimetres(moved)} mm`);
    }
    assert.deepEqual(still, [], `the hand moves more than 80 mm between ${WALKED_OUT} s and ${STRUCK} s`);
  });

  test(`${id}: a planted foot stays where it is while the pelvis goes on`, async () => {
    const model = await models.model(id);
    const [from, to] = STANCE.map((seconds) => { stand(model, "empty", seconds); return { foot: model.point("foot_l"), pelvis: model.point("pelvis") }; });
    const slid = Vector3.Distance(from.foot, to.foot), advanced = Vector3.Distance(from.pelvis, to.pelvis);
    assert.ok(advanced > 0.1, `the pelvis advances between ${STANCE[0]} s and ${STANCE[1]} s: ${millimetres(advanced)} mm`);
    assert.ok(slid < 0.012, `the left foot slides less than 12 mm in that time: ${millimetres(slid)} mm`);
  });

  test(`${id}: the bow bends as it is drawn and is straight again once the arrow has gone`, async () => {
    const model = await models.model(id), stave = model.mesh("bow__stave");
    assert.ok(stave.morphTargetManager, "the stave has a morph target to bend by");
    const [rest, drawn, released] = [WALKED_OUT, DRAWN, RELEASED].map((seconds) => {
      stand(model, "bow", seconds);
      return stave.morphTargetManager.getTarget(0).influence;
    });
    assert.ok(drawn - rest > 0.9, `the bend rises by more than 0.9 from ${WALKED_OUT} s to ${DRAWN} s: ${rest} to ${drawn}`);
    assert.ok(released < 0.01, `the bend is under 0.01 at ${RELEASED} s: ${released}`);
  });

  test(`${id}: no wrist bends more than ${WRIST_BEND} degrees anywhere in a loop`, async () => {
    const model = await models.model(id), bent = [];
    for (const weapon of WEAPON_IDS) for (const seconds of SAMPLES) {
      stand(model, weapon, seconds);
      for (const side of SIDES) {
        const wrist = model.point(`hand_${side}`);
        const forearm = wrist.subtract(model.point(`lowerarm_${side}`)).normalize();
        const hand = model.point(`middle_01_${side}`).subtract(wrist).normalize();
        const bend = Math.acos(Math.min(1, Vector3.Dot(forearm, hand))) * 180 / Math.PI;
        if (!(bend < WRIST_BEND)) bent.push(`${weapon} at ${seconds} s, ${side}: ${bend.toFixed(1)}`);
      }
    }
    assert.deepEqual(bent, [], "the hand's length stays within the bend of the forearm's, at every sample of every loop");
  });

  test(`${id}: the hands stay outside the torso through the bow's loop`, async () => {
    const model = await models.model(id), entered = [];
    for (const seconds of SAMPLES) {
      stand(model, "bow", seconds);
      const pelvis = model.point("pelvis"), neck = model.point("neck_01");
      const up = neck.subtract(pelvis).normalize();
      const across = model.point("upperarm_l").subtract(model.point("upperarm_r")).normalize();
      const front = Vector3.Cross(up, across).normalize();
      const centre = pelvis.add(neck).scale(0.5), height = Vector3.Distance(neck, pelvis) * TORSO.up;
      const inside = (point) => {
        const from = point.subtract(centre);
        return (Vector3.Dot(from, across) / TORSO.across) ** 2 + (Vector3.Dot(from, up) / height) ** 2 + (Vector3.Dot(from, front) / TORSO.front) ** 2 < 1;
      };
      assert.deepEqual([inside(centre), inside(centre.add(across.scale(2 * TORSO.across)))], [true, false],
        "the torso holds its own middle, and not a point two half widths to its side");
      for (const name of ["hand_r", "middle_01_r", "hand_l", "middle_01_l"]) if (inside(model.point(name))) entered.push(`${seconds} s: ${name}`);
    }
    assert.deepEqual(entered, [], "no wrist and no middle knuckle is inside the torso at any sample");
  });

  test(`${id}: the palm and every digit's pad lie on the grip the hand holds`, async () => {
    const model = await models.model(id), off = [], small = [], attached = [];
    for (const { weapon, points, grip, regions } of grips(model)) for (const pad of ["palm", ...DIGITS]) {
      const patch = regions[pad].map((i) => points[i]);
      if (!(patch.length > 8)) small.push(`${weapon} ${pad}: ${patch.length}`);
      const contact = contactPatch(gripDistances(patch, grip));
      if (!(contact.minimum > HOLD.deepest && contact.patch < HOLD.patch)) off.push(`${weapon} ${pad}: ${JSON.stringify(contact)}`);
      const apart = contactPatch(gripDistances(patch.map((p) => p.add(new Vector3(0.1, 0, 0.1))), grip));
      if (!(apart.patch > 0.02)) attached.push(`${weapon} ${pad}: ${JSON.stringify(apart)}`);
    }
    assert.deepEqual(small, [], "every pad is more than eight vertices of skin");
    assert.deepEqual(off, [], `no pad sinks deeper than ${-HOLD.deepest} m into its grip, and each one's contact is within ${HOLD.patch} m of it`);
    assert.deepEqual(attached, [], "a pad moved 0.1 m along x and z reads as off its grip, by more than 0.02 m");
  });

  test(`${id}: every digit's skin touches the grip the hand holds`, async () => {
    const model = await models.model(id), off = [], small = [], attached = [];
    for (const { weapon, side, points, grip, onDigit } of grips(model)) for (const digit of DIGITS) {
      const skin = points.filter((_, i) => onDigit(i, digit, side));
      if (!(skin.length > 8)) small.push(`${weapon} ${digit}: ${skin.length}`);
      const gap = gripGap(skin, grip);
      if (!(gap > HOLD.deepest && gap < HOLD.gap)) off.push(`${weapon} ${digit}: ${gap}`);
      const apart = gripGap(skin.map((p) => p.add(new Vector3(1, 1, 1))), grip);
      if (!(apart > 0.1)) attached.push(`${weapon} ${digit}: ${apart}`);
    }
    assert.deepEqual(small, [], "every digit is more than eight vertices of skin");
    assert.deepEqual(off, [], `each digit's nearest skin is between ${HOLD.deepest} m and ${HOLD.gap} m from its grip`);
    assert.deepEqual(attached, [], "a digit moved a metre each way reads as more than 0.1 m off its grip");
  });
}
