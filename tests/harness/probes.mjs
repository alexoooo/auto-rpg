import { coreStand } from "./core-stand.mjs";
import { SERVO_SECONDS } from "../../src/core/body.ts";
import { commandedBody } from "../../src/core/mind/host.ts";
import { partLookup } from "../../src/entrants/game.ts";
import { gaitLegsOf, legsOf, motorOf } from "../../src/core/mind/kit.ts";
import { WHOLE_BODY_MOTOR } from "../../src/core/control/whole-body-motor.ts";
import { modelSpec } from "../../src/core/models.ts";
import { guardPosture } from "../../src/core/skills/guard/guard.ts";

/**
 * A rig: the Warrior standing in the guard on a stand of its own, built turned `RIG_TURN` about up
 * (what a body takes as it is born, it takes facing as it was built), its motor `motor` (the game's,
 * the whole-body solve, unless named), its legs `legs` (Move, else a gait alone), the parts found by `lookup`. `run(seconds, ask)` steps it, each
 * control step asking `ask(view)`'s claim: the legs goal (`legs`, a walk of none facing the legs'
 * heading unless set), the posture over the guard, and the other claim terms as they are.
 * `wrapLegs(legs)` stands in for the legs a test controls; `filter(command)` for the command a
 * motor is given.
 */
/** How far a rig's body is built turned from the world's heading 0, rad: none of its legs' headings by default. */
const RIG_TURN = 1;

export async function rig({ legs: legsConfig = { kind: "stance-walk" }, motor = WHOLE_BODY_MOTOR.defaults, lookup = partLookup, wrapLegs = (legs) => legs,
  filter = (command) => command, engine, delay, mirrored } = {}) {
  const spec = modelSpec("workshop-fighter"), guard = guardPosture(spec);
  const stand = await coreStand(spec, { posture: guard, rotation: [0, Math.sin(RIG_TURN / 2), 0, Math.cos(RIG_TURN / 2)], engine, delay, mirrored });
  const hosted = commandedBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, motor: motorOf(lookup, motor) });
  const legs = wrapLegs((legsConfig.kind === "move" ? legsOf : gaitLegsOf)(lookup, hosted.driver, legsConfig));
  let ask = () => ({});
  // The claim is decided on the view as sensed; the legs carry it out on the body as it is (`SplitDriver`).
  hosted.drive({ decide: (view) => ask(view), carry: (view, claim, dt) => {
    const drive = legs.goal(view, { walk: null, face: legs.heading, ...claim.legs }, dt);
    const stance = drive.kind === "stance";
    return filter({ posture: { ...guard, ...(stance ? {} : drive.posture), ...claim.posture }, pushes: [...(stance ? [] : drive.pushes), ...claim.pushes ?? []],
      stance: stance ? drive.goal : null, ...(!stance && drive.held !== undefined ? { held: drive.held } : {}), ...(claim.effectors ? { effectors: claim.effectors } : {}), ...(claim.points ? { points: claim.points } : {}),
      ...(claim.handPoses ? { handPoses: claim.handPoses } : {}) });
  } });
  // The first step builds the stance's reference; what the probes read from is the body standing after it.
  stand.step(1);
  const view = hosted.view, s = view.stance;
  const start = { heading: s.facing, standing: view.standing, soles: { left: [s.ends["foot.left"].middle.x, s.ends["foot.left"].middle.z], right: [s.ends["foot.right"].middle.x, s.ends["foot.right"].middle.z] },
    support: [s.support.x, s.support.z], guard };
  return {
    view, legs, start, channels: hosted.muscles.channels.map((channel) => channel.name),
    /** The steps a command waits before motor control carries it out (`World.delay`). */
    delay: stand.world.delay,
    /** The height over the ground of the centre of the segment the spec's bearing end `end` is on, m. */
    endHeight: (end) => stand.built.segments.get(spec.ends.find((one) => one.name === end).segment).pose.position.y,
    run(seconds, asked) { ask = asked; stand.step(stand.seconds(seconds)); },
    dispose() { hosted.dispose(); stand.dispose(); },
  };
}
