import type { ScenarioRun } from "../lab-scenario.ts";
import { isPaused, type Playhead } from "../player.ts";
import { actions, choice, toggle, type Entry } from "../../ui/controls.ts";

/**
 * **The lab's transport**: the bar that pauses the run, steps it a physics step at a time, scrubs
 * its recording and slows page time. It acts on whichever run is under way.
 */

/** How fast page time passes for the player; the first is real time. */
const SPEEDS: readonly Entry<number>[] = [
  { value: 1, name: "1×", title: "Real time" }, { value: 0.25, name: "¼×", title: "A quarter speed" },
  { value: 0.1, name: "1/10×", title: "A tenth speed" },
];
/** Physics steps a nudge moves the shown frame by. */
const NUDGES: readonly Entry<number>[] = [
  { value: -1, name: "◀", title: "Back one physics step" }, { value: 1, name: "▶", title: "Forward one physics step" },
];

interface Transport {
  /** The scale of page time the player is given: slow motion slows the world and a replay alike. */
  speed(): number;
  togglePause(): void;
  /** Show whether a run at `playhead` is paused. */
  showPlayhead(playhead: Playhead): void;
  /** Show `run`'s recording, `time`, the shown frame's, s, and `balance`, its body's, per cent of its weight, if its assist has one. */
  show(run: ScenarioRun, time: number | null, balance: number | null): void;
}

/** Fill `bar`; `label` says what the slider steps through. */
export function labTransport(bar: HTMLElement, label: string, run: () => ScenarioRun | null): Transport {
  let speed = SPEEDS[0]!.value, paused = false;
  const togglePause = (): void => { const player = run()?.player; player?.setPaused(!player.isPaused()); };
  const pause = toggle("Pause", () => paused, togglePause, "Pause or play the world (Space)");
  const timeline = Object.assign(document.createElement("input"), { id: "timeline", type: "range", min: "0", max: "0", step: "1", value: "0" });
  timeline.setAttribute("aria-label", label);
  timeline.addEventListener("input", () => run()?.player.seek(Number(timeline.value)));
  const clock = Object.assign(document.createElement("span"), { id: "clock" });
  bar.append(
    pause.element,
    actions("Step", NUDGES, (steps) => {
      const under = run();
      // The history stops at its start; on from its end is a step of the world.
      if (under) under.player.seek(Math.max(0, (under.player.shownFrame() ?? under.recording().live) + steps));
    }).element,
    timeline,
    choice("Speed", SPEEDS, () => speed, (value) => { speed = value; }).element,
    clock,
  );
  return {
    speed: () => speed,
    togglePause,
    showPlayhead(playhead) {
      paused = isPaused(playhead);
      pause.refresh();
    },
    show(under, time, balance) {
      const recording = under.recording();
      timeline.max = String(Math.max(0, recording.frames - 1));
      if (document.activeElement !== timeline) timeline.value = String(under.player.shownFrame() ?? recording.live);
      if (time !== null) clock.textContent = `${under.player.playhead.kind === "replaying" ? "replay " : ""}${time.toFixed(3)} s${balance === null ? "" : ` · balance ${balance} %`}`;
    },
  };
}
