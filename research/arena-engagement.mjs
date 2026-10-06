import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Duel } from "../src/arena/duel.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { createWorld } from "../src/core/world.ts";
import { FIGHTER, POINT_FIGHTER } from "../src/core/mind/config.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { motionAtToRef, pointOfToRef } from "../src/core/control/support.ts";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { aimOf } from "../src/core/skills/strikes.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";

/** Real Duel with an ordered opponent; exchanging sides mirrors the approach without installing poses. */
export async function engagementArena({ held = "empty", hand = "right", engagement = "reference", gap = 2.4, mirror = false, seconds = 40 } = {}) {
  const rendering = new NullEngine(), scene = new Scene(rendering), engine = await freshEngine(), world = createWorld(scene, engine);
  addArenaSolids(world.physics);
  const side = mirror ? "right" : "left", other = mirror ? "left" : "right";
  const duel = new Duel(world, { [side]: "workshop-fighter", [other]: "workshop-rogue", gap, capSeconds: seconds + 2,
    recoverySeconds: 60, held: { [side]: held, [other]: "empty" },
    minds: { [side]: { ...POINT_FIGHTER, hand, engagement }, [other]: FIGHTER } });
  duel.order(other, STAND_ORDERS);
  return { world, duel, side, other, fighter: duel.duelists[side], opponent: duel.duelists[other],
    harness: { kind: "Node arena Duel", engine: engine.revision, hz: world.hz, actuation: world.actuation, balance: { left: 0, right: 0 } },
    dispose() { duel.dispose(); world.dispose(); scene.dispose(); rendering.dispose(); } };
}

/** A two-second walk followed by two seconds standing; lateral walks alternate direction. */
export function orderOpponent(stand, motion, step) {
  const { fighter, opponent, duel, other } = stand;
  if (motion === "stationary" || Math.floor(step / 240) % 2 === 1) { duel.order(other, STAND_ORDERS); return; }
  const a = fighter.body.view.head, b = opponent.body.view.head;
  const d = Math.max(.001, Math.hypot(a.x - b.x, a.z - b.z)), x = (a.x - b.x) / d, z = (a.z - b.z) / d;
  let move;
  switch (motion) {
    case "advance": move = { x, z }; break;
    case "retreat": move = { x: -x, z: -z }; break;
    case "lateral": { const sign = Math.floor(step / 480) % 2 ? -1 : 1; move = { x: sign * z, z: -sign * x }; break; }
    default: throw new Error(`unknown opponent motion ${motion}`);
  }
  duel.order(other, { move, face: { x, z }, attack: null });
}

/** Contact is scored at the solver step of the swing, independently of the controller's outcome report. */
export async function engagementTrial(config) {
  const stand = await engagementArena(config), { world, duel, fighter, opponent } = stand;
  const seconds = config.seconds ?? 40, motion = config.motion ?? "stationary";
  try {
    const report = fighter.minded.skills.report.strike, bodies = new Set([...opponent.built.segments.values()].map(s => s.body));
    const point = new Vector3(), velocity = new Vector3(), spin = new Vector3();
    const aims = Object.fromEntries(["left", "right"].map(hand => [hand,
      rigidPoints(fighter.built.spec, fighter.built.segments.get(`hand.${hand}`).spec).get(aimOf(fighter.built.spec, hand)).value]));
    const result = { harness: stand.harness, config, attempts: 0, impacts: 0, usefulReturns: 0, returns: 0, timeouts: 0,
      falls: 0, opponentFalls: 0, outsideSeconds: 0, firstContact: null, simulatedSeconds: 0, transitions: [] };
    let phase = null, active = false, incoming = false, contacted = false, down = false, otherDown = false;
    let returned = 0, touching = { left: false, right: false };
    for (let step = 0; step < seconds * world.hz && !duel.verdict; step++) {
      orderOpponent(stand, motion, step);
      const closing = {};
      for (const h of ["left", "right"]) {
        const s = fighter.built.segments.get(`hand.${h}`);
        pointOfToRef(s, aims[h], point); motionAtToRef(s, point, velocity, spin);
        const head = opponent.body.view.head, sensed = fighter.body.view.senses.others.find(o => o.side === stand.other)?.segments.get("head");
        const dx = head.x - point.x, dy = head.y - point.y, dz = head.z - point.z, d = Math.hypot(dx, dy, dz);
        closing[h] = d > 0 ? (dx * (velocity.x - (sensed?.velocity.x ?? 0)) + dy * (velocity.y - (sensed?.velocity.y ?? 0)) + dz * (velocity.z - (sensed?.velocity.z ?? 0))) / d : 0;
      }
      world.step();
      const hand = report.hand, swing = report.phase === "swing";
      if (report.phase !== phase) {
        result.transitions.push({ time: world.time, phase: report.phase, hand: report.hand });
        if (report.phase === "chamber") { result.attempts++; active = true; incoming = false; contacted = false; }
        phase = report.phase;
      }
      for (const h of ["left", "right"]) {
        const now = world.physics.contactsOf(fighter.built.segments.get(`hand.${h}`).body).some(c => bodies.has(c.other) && c.impulse > 0);
        if (now && swing && hand === h && !contacted && !fighter.body.down) {
          if (!touching[h] && closing[h] > 0) { incoming = true; result.impacts++; result.firstContact ??= world.time; }
          contacted = true;
        }
        touching[h] = now;
      }
      const total = report.pointCycle.returned.left + report.pointCycle.returned.right;
      if (total > returned) { if (active && incoming) result.usefulReturns++; returned = total; active = false; }
      if (fighter.body.down && !down) result.falls++;
      if (opponent.body.down && !otherDown) result.opponentFalls++;
      down = fighter.body.down; otherDown = opponent.body.down;
      const a = fighter.body.view.head, b = opponent.body.view.head;
      const range = report.rangeAt(report.hand ?? (config.hand === "left" ? "left" : "right"), b.y - a.y);
      const off = Math.hypot(b.x - a.x, b.z - a.z) - range.reach;
      if (off < range.along[0] || off > range.along[1]) result.outsideSeconds += world.dt;
    }
    result.returns = returned; result.timeouts = report.pointCycle.failed; result.simulatedSeconds = world.time;
    result.verdict = duel.verdict;
    return result;
  } finally { stand.dispose(); }
}
