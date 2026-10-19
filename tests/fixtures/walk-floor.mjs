/**
 * **What any walk passes**: the Warrior with a walk on the Node stand at 120 Hz, driven by hand,
 * read as records (`tests/simbicon.test.mjs`, `tests/walk-run.test.mjs`, `tests/stride.test.mjs`). Asked to hold, it
 * stands; asked a way, it goes that way more than across and stops when told; asked past its walk
 * by Move's Run, it runs, and walks again when Move's Walk takes the legs. How far and how fast
 * is measured in each walk's capability file.
 */
import { humanSpec } from "../../src/core/human/spec.ts";
import { NO_COVER } from "../../src/core/mind/intent.ts";
import { labActor } from "../../src/lab/actor.ts";
import { coreStand } from "../harness/core-stand.mjs";

/** The way along `move` ([forward, right]) and across it of a walk from `from` to `to`, m. */
function along(move, from, to) {
  const speed = Math.hypot(move[0], move[1]), ux = move[1] / speed, uz = move[0] / speed;
  const dx = to.x - from.x, dz = to.z - from.z;
  return { along: dx * ux + dz * uz, across: dx * uz - dz * ux };
}

/**
 * The Warrior with `mind` on a ground `groundSize` m across, run by `script(actor, stand)`, its
 * stand disposed after. The ground's size is each case's as it was read: a walk may go another way
 * on a larger box.
 */
async function withActor(mind, script, { groundSize = 20, ...options } = {}) {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, groundSize });
  const actor = labActor(stand.built, stand.world, { mind, ...options });
  try { return await script(actor, stand); } finally { actor.dispose(); stand.dispose(); }
}

/** Held for `seconds`: whether it is down, whether the stance stands it, and its speed, m/s. */
export function held(mind, seconds = 4) {
  return withActor(mind, (actor, stand) => {
    actor.drive({ name: "hold", decide: () => ({ move: null, face: 0, guard: NO_COVER, actions: [] }) });
    stand.step(stand.seconds(seconds));
    const s = actor.body.view.stance;
    return { down: actor.body.view.down, stanced: actor.skills.state.command.stance !== null, speed: Math.hypot(s.velocity.x, s.velocity.z) };
  });
}

/**
 * Asked `move` for `seconds`, facing +z, then to stand for `rest` s: whether it fell, how far it
 * went along the way asked and across it, m, and its speed and phase at the end. `during(actor)`
 * reads each step.
 */
export function walked(mind, move, { seconds = 5, rest = 4, during = () => {}, groundSize } = {}) {
  return withActor(mind, (actor, stand) => {
    let walking = true;
    actor.drive({ name: "walk", decide: () => ({ move: walking ? move : null, face: 0, guard: NO_COVER, actions: [] }) });
    const from = actor.body.view.stance.centre.clone();
    for (let k = 0; k < stand.seconds(seconds) && !actor.body.view.down; k++) { stand.step(1); during(actor); }
    const went = along(move, from, actor.body.view.stance.centre);
    walking = false;
    for (let k = 0; k < stand.seconds(rest) && !actor.body.view.down; k++) { stand.step(1); during(actor); }
    const s = actor.body.view.stance;
    return { down: actor.body.view.down, ...went, speed: Math.hypot(s.velocity.x, s.velocity.z), phase: s.phase };
  }, { groundSize });
}

/**
 * Asked 2 m/s forward under Move, its `run` gait while the destination is past 6 m and its `walk`
 * nearer, with no envelope to cap it: sent 20 m for 8 s, then 3 m for up to 8 s. Whether `running`
 * read it running when sent far, how far it went, m, how long after it was sent near it read
 * walking, s, and whether it fell.
 */
export function ranThenWalked(mind, { run, walk, running }) {
  const locomotion = { kind: "move", rules: [{ kind: "when-distance", of: "destination", than: "over", metres: 6, gait: run }], otherwise: walk };
  return withActor({ ...mind, locomotion }, (actor, stand) => {
    let near = false;
    actor.drive({ name: "run", decide: () => ({ move: [2, 0], face: 0, guard: NO_COVER, actions: [], destination: near ? 3 : 20 }) });
    const from = actor.body.view.stance.centre.clone();
    for (let k = 0; k < stand.seconds(8) && !actor.body.view.down; k++) stand.step(1);
    const ran = running(actor), went = along([1, 0], from, actor.body.view.stance.centre);
    near = true;
    let walkedAt = null;
    for (let k = 0; k < stand.seconds(8) && !actor.body.view.down && walkedAt === null; k++) {
      stand.step(1);
      if (!running(actor)) walkedAt = (k + 1) / 120;
    }
    return { ran, ...went, walkedAt, down: actor.body.view.down };
  }, { measuring: true, groundSize: 80 });
}
