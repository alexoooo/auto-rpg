/**
 * **The stub evaluation's cases**: one lone body (`LoneCase`, `src/evaluation/lone.ts`), the
 * Warrior under the subject's mind, for the condition's seconds; read whether it is down at the end.
 */
export const STUB_STAND_CASES = Object.freeze({
  standard: Object.freeze({
    arity: 1, play: "stub-stand standard", seconds: 1,
    conditions: Object.freeze([Object.freeze({ seconds: 1 })]),
    world: ([mind], _condition, engine) => ({ kind: "lone", engine, lone: { model: "workshop-fighter", mind } }),
    read(built, condition) {
      return {
        afterStep() {},
        get ended() { return built.world.time >= condition.seconds; },
        reading: () => ({ down: built.body.body.down, seconds: built.world.time }),
      };
    },
  }),
});
