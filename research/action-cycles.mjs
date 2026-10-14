/** Stable request identity and ledger-derived summaries for physical research stands. */
export function actionCycles(skills) {
  const state = { sequence: 0, returned: { left: 0, right: 0 }, thrown: { left: 0, right: 0 }, failed: 0,
    admitted: 0, aborted: 0, seenCommit: [], releasing: [], requests: {} };
  const sample = () => {
    for (const action of skills.report.actions) if (action.phase === "release" && !state.releasing.includes(action.id)) state.releasing.push(action.id);
    for (const action of skills.report.actions) if (action.phase === "commit" && !state.seenCommit.includes(action.id)) {
      state.seenCommit.push(action.id); state.thrown[action.effector.split(".")[1]]++;
    }
    for (const record of skills.report.ledger) if (record.sequence > state.sequence) {
      const side = record.effector.split(".")[1];
      if (record.committed && !state.seenCommit.includes(record.id)) state.thrown[side]++;
      state.seenCommit = state.seenCommit.filter(id => id !== record.id);
      // A cancelled or blocked stroke can still verify its physical return; host interruptions cannot.
      if (record.ending.kind === "completed" || state.releasing.includes(record.id) && !["stalled", "refused"].includes(record.ending.kind)
        && !["takeover", "idle", "replaced", "body is down"].includes(record.ending.reason)) state.returned[side]++;
      state.releasing = state.releasing.filter(id => id !== record.id);
      if (record.ending.kind === "stalled") state.failed++;
      if (record.ending.kind === "interrupted") state.aborted++;
      if (record.contacts.counts.commit.target > 0) state.admitted++;
      state.sequence = record.sequence;
    }
  };
  return { state, sample,
    requests(view, action, effector, target, enabled = true, around = { heading: skills.report.heading, placed: true, support: skills.report.support ?? null, walk: null, lower: .03 }) {
      sample();
      const key = `${action}/${effector}`, live = state.requests[key];
      if (live && skills.report.ledger.some(record => record.id === live.id)) delete state.requests[key];
      if (!enabled) { delete state.requests[key]; return []; }
      if (!state.requests[key] && skills.readiness(view, action, effector, target, around).kind === "ready")
        state.requests[key] = { id: skills.instance(), action, effector, target };
      return state.requests[key] ? [{ ...state.requests[key], target }] : [];
    },
    phase(effector) { const action = skills.report.actions.find(action => !effector || action.effector === effector); return action?.phase === "commit" ? "swing" : action?.phase === "prepare" ? "chamber" : action ? "return" : null; },
    reading() { sample(); return { returned: { ...state.returned }, thrown: { ...state.thrown }, failed: state.failed, admitted: state.admitted, aborted: state.aborted }; },
  };
}
