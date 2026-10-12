import assert from 'node:assert/strict';

/** Observe the engine seam, including calls that bypass Assist. Gravity, contacts and joint motors are internal to the solver. */
export function unassistedAudit(built, clock = () => 0) {
  const events = [], undo = [];
  const record = (segment, method, value) => events.push({ step: clock(), segment, method, value });
  for (const [name, segment] of built.segments) {
    const body = segment.body;
    for (const method of ['applyForce', 'applyTorque', 'applyImpulse', 'applyTorqueImpulse']) {
      const original = body[method];
      body[method] = function (value, ...args) {
        const vector = [value.x, value.y, value.z];
        if (vector.some(v => !Number.isFinite(v) || v !== 0)) record(name, method, vector);
        return original.call(this, value, ...args);
      };
      undo.push(() => { body[method] = original; });
    }
    for (const method of ['setFixed', 'setMassProperties']) {
      const original = body[method];
      body[method] = function (...args) {
        record(name, method, null);
        return original.apply(this, args);
      };
      undo.push(() => { body[method] = original; });
    }
  }
  return {
    events,
    check() {
      assert.equal(events.length, 0, `unassisted evaluation rejected external actuation: ${JSON.stringify(events[0])}`);
    },
    dispose() { for (const restore of undo) restore(); },
  };
}

/** Failure is sticky, and zero in one direction cannot cancel help in another. */
export function unassistedResult(result, events) {
  return { ...result, success: result.success === true && !result.assisted && events.length === 0,
    failure: events.length ? 'external actuation' : result.assisted ? 'assistance meter nonzero' : result.failure,
    externalActuation: events };
}
