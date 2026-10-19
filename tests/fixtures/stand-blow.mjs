/**
 * **A research blow on the punch stand** (`punchStand`, `research/punch-calibration.mjs`): the
 * first blow a blow config takes at the pad, read whole.
 */
import { punchStand } from "../../research/punch-calibration.mjs";

/**
 * The first blow of `blow` with the Warrior's right hand at the pad 0.55 m ahead, 1.55 m up and
 * 0.1 m to the right: whether it was thrown and landed, whether the steps under way drove the body
 * whole (the stance left out and every channel pushed: all, none or some of them), who held the
 * body once it was over, and whether the body went down.
 */
export async function firstBlow(blow) {
  const s = await punchStand({ model: "workshop-fighter", hand: "right", family: "cross", hz: 120, seconds: 8, ahead: 0.55, height: 1.55,
    armExtension: 0.5, pad: { face: "compliant" }, matchedFeedback: true, blow });
  try {
    let began = false, ended = false, steps = 0, whole = 0;
    for (let i = 0; i < 6 * 120 && !ended; i++) {
      s.step(1);
      const under = s.skills.report.actions.length > 0, command = s.skills.state.command;
      if (under) { steps++; if (command.stance === null && command.pushes.length === s.body.muscles.channels.length) whole++; }
      began ||= under;
      ended = began && !under;
    }
    return { ended, thrown: s.cycles.reading().thrown.right, landed: s.state.impacts.length + (s.state.active ? 1 : 0),
      whole: whole === 0 ? "none" : whole === steps ? "all" : "some", holders: [...new Set(Object.values(s.skills.report.holders))], fell: s.state.fell };
  } finally { s.dispose(); }
}
