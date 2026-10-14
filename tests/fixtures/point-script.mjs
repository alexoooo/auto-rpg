import { standIntent } from "../../src/core/mind/intent.ts";
import { actionProducer } from "../../src/core/mind/action-producer.ts";
import { approachActionWindow } from "../../src/core/mind/action-window.ts";

/** A numbered sequence of point commitments, approached through the executor's own window. */
export function pointScript(choiceOf) {
  const producer = actionProducer(), state = { producer: producer.state, key: null, finished: false };
  return { name: "point script", state, decide(sight) {
    const choice = choiceOf(sight), stand = standIntent(sight.report.heading);
    if (!choice) { producer.state.current = null; return stand; }
    if (choice.key !== state.key) { state.key = choice.key; state.finished = false; producer.state.current = null; }
    if (producer.state.current && sight.report.ledger.some(record => record.id === producer.state.current.id)) state.finished = true;
    if (state.finished) return stand;
    const { key, ...request } = choice;
    const produced = producer.request(sight, request, { heading: sight.report.heading, placed: sight.view.stance.phase === "stand", support: sight.report.support ?? null, walk: null, lower: 0 });
    if (produced.readiness?.kind === "blocked") {
      producer.state.current = { ...request, id: sight.instance() };
      return { ...stand, actions: [producer.state.current] };
    }
    const position = produced.readiness?.kind === "position"
      ? approachActionWindow(sight.view, produced.readiness.window, sight.report.heading, .3, .3) : {};
    return { ...stand, ...position, actions: produced.requests };
  } };
}
