/**
 * **Choosing between blow skills** (`chooseSkill`, `src/core/skills/choose.ts`): each policy on
 * stub skills whose blows last a few steps, and the `choose-blow` part in a bout, forked in the
 * middle of a blow (Node, core world, vendored Rapier, 120 Hz).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { treeFaults, kindsFor, partOf } from "../src/core/mind/catalog.ts";
import { CLASSIC } from "../src/core/mind/config.ts";
import { loadEngine, DEFAULT_ENGINE } from "../src/core/engine/engines.ts";
import { modelSpec } from "../src/core/models.ts";
import { chooseSkill } from "../src/core/skills/choose.ts";
import { buildBout } from "../research/bout.mjs";
import { traceOf } from "./harness/trace.mjs";
import { COMBAT, withParts } from "./fixtures/minds.mjs";

/**
 * A stub blow skill named `name`: given an attack it `accepts`, a blow of `steps` steps with its
 * right hand; what it was given, and how often it was resumed, in its state.
 */
function stub(name, { accepts = () => true, steps = 3 } = {}) {
  const state = { left: 0, thrown: 0, resumed: 0 };
  return {
    name, state, releases: false, lower: null,
    report: { hand: null, phase: null, blow: null, since: 0, still: 0, thrown: { left: 0, get right() { return state.thrown; } }, rangeAt: () => ({ reach: steps, along: [0, 0] }) },
    get holds() { return state.left > 0 ? "right" : null; },
    get busy() { return state.left > 0; },
    accepts,
    resume() { state.resumed++; state.left = 0; },
    command(_view, attack) {
      if (state.left > 0) state.left--;
      else if (attack) { state.left = steps; state.thrown++; }
      return null;
    },
  };
}

const ATTACK = Object.freeze({ kind: "blow", hand: "right", target: [0, 1.6, 1] });
const PATHED = Object.freeze({ ...ATTACK, path: { family: "straight" } });
/** A view in which the right hand touches the foe, or touches nothing. */
const view = (touching) => ({
  effectors: { "hand.right": { feedback: { contact: touching ? { target: { kind: "body", body: "foe", segment: "head", guard: false } } : null } } },
  senses: { side: "left", others: [{ id: "foe", side: "right" }] },
});

/** The option each blow begun went to, over `steps` steps of `attack`, the hand touching where `lands` says of the option that has the body. */
function begun(skill, steps, attack = ATTACK, lands = () => false) {
  const out = [];
  let busy = false;
  for (let i = 0; i < steps; i++) {
    skill.command(view(lands(skill.report.choice.option)), attack, {}, {}, 1 / 120);
    if (skill.busy && !busy) out.push(skill.report.choice.option);
    busy = skill.busy;
  }
  return out;
}

test("rotate gives each blow begun to the next option", () => {
  const a = stub("a"), b = stub("b"), skill = chooseSkill([a, b], "rotate");
  assert.deepEqual(begun(skill, 16), [0, 1, 0, 1]);
  assert.deepEqual(skill.report.choice.counts, [{ thrown: 2, landed: 0 }, { thrown: 2, landed: 0 }]);
  // Each takes the body back as its own: resumed when it is chosen after the other.
  assert.deepEqual([a.state.resumed, b.state.resumed], [1, 2]);
  assert.equal(skill.report.thrown.right, 4, "the blows thrown are summed over the options");
});

test("scored moves to the option that lands, and stays with one that lands as well", () => {
  // A never lands; B lands every blow. Tied at first, the earlier begins.
  const never = chooseSkill([stub("a"), stub("b")], "scored");
  assert.deepEqual(begun(never, 24, ATTACK, (option) => option === 1), [0, 1, 1, 1, 1, 1]);
  assert.deepEqual(never.report.choice.counts, [{ thrown: 1, landed: 0 }, { thrown: 5, landed: 5 }]);
  // The control: with A landing too, A keeps the body.
  const both = chooseSkill([stub("a"), stub("b")], "scored");
  assert.deepEqual(begun(both, 24, ATTACK, () => true), [0, 0, 0, 0, 0, 0]);
  // And neither landing, each loses its lead in turn.
  const neither = chooseSkill([stub("a"), stub("b")], "scored");
  assert.deepEqual(begun(neither, 24, ATTACK, () => false), [0, 1, 0, 1, 0, 1]);
});

test("first-able falls through to the option that accepts the attack, and refuses one none accepts", () => {
  const pathOnly = stub("path", { accepts: (attack) => attack.path !== undefined }), any = stub("any");
  const skill = chooseSkill([pathOnly, any], "first-able");
  assert.deepEqual(begun(skill, 8, PATHED), [0, 0]);
  assert.deepEqual(begun(skill, 8, ATTACK), [1, 1]);
  assert.equal(skill.accepts(ATTACK), true);
  const none = chooseSkill([pathOnly], "rotate");
  assert.equal(none.accepts(ATTACK), false);
  assert.deepEqual(begun(none, 8, ATTACK), []);
});

test("the option that has the body keeps it until its blow ends, whatever is asked meanwhile", () => {
  const skill = chooseSkill([stub("a", { steps: 5 }), stub("b")], "rotate"), options = [];
  for (let i = 0; i < 6; i++) { skill.command(view(false), ATTACK, {}, {}, 1 / 120); options.push(skill.report.choice.option); }
  assert.deepEqual(options, [0, 0, 0, 0, 0, 0]);
  assert.throws(() => chooseSkill([], "rotate"), /a choice needs a blow/);
});

test("choose-blow is a blow part with a list of blows, and its tree's faults are its options'", () => {
  const human = modelSpec("workshop-fighter");
  assert.deepEqual([partOf({ kind: "choose-blow" }).role, partOf({ kind: "choose-blow" }).stage], ["blow", "experimental"]);
  assert.ok(kindsFor("blow", human).some(({ kind, reason }) => kind === "choose-blow" && reason === null));
  const choosing = (options, policy = "rotate") => withParts(COMBAT, { blow: { kind: "choose-blow", options, policy } });
  assert.deepEqual(treeFaults(choosing([{ kind: "path-strike", overlap: false }, { kind: "recipe-strike" }])), []);
  assert.deepEqual(treeFaults(choosing([])), ["blow: a choice needs a blow to choose"]);
  assert.deepEqual(treeFaults(choosing([{ kind: "lie" }])), ["blow.options.0: a sub-mind part cannot go where a blow part goes"]);
  // Tactics that name no path need an option that throws without one.
  const seeking = (options) => ({ ...CLASSIC, blow: { kind: "choose-blow", options, policy: "first-able" } });
  assert.deepEqual(treeFaults(seeking([{ kind: "path-strike", overlap: false }])),
    ["blow: the path strike carries out a blow only along a path, and these tactics name none"]);
  assert.deepEqual(treeFaults(seeking([{ kind: "path-strike", overlap: false }, { kind: "recipe-strike" }])), []);
  // Overlapping combinations need every option to overlap.
  const overlapping = (options) => withParts(COMBAT, { tactics: { combinations: "overlap" }, blow: { kind: "choose-blow", options, policy: "rotate" } });
  assert.deepEqual(treeFaults(overlapping([{ kind: "path-strike", overlap: true }])), []);
  assert.deepEqual(treeFaults(overlapping([{ kind: "path-strike", overlap: true }, { kind: "recipe-strike" }])),
    ["blow: overlapping combinations need a blow that may begin while the other hand returns"]);
});

const bout = async (left, right) => buildBout({ left: "workshop-fighter", right: "workshop-fighter", held: { left: "empty", right: "empty" }, balance: { left: 0, right: 0 },
  minds: { left, right }, recoverySeconds: null, capSeconds: 30 }, { physicsEngine: await loadEngine(DEFAULT_ENGINE) });

/** The opening fighter giving its blows in turn to the path strike and the recipe strike. */
const CHOOSER = withParts(COMBAT, { blow: { kind: "choose-blow", options: [{ kind: "path-strike", overlap: false }, { kind: "recipe-strike" }], policy: "rotate" } });

test("a bout with a chooser forked in the middle of a blow goes on as the one it was forked from", async () => {
  const a = await bout(CHOOSER, COMBAT), b = await bout(CHOOSER, COMBAT);
  try {
    const skills = a.duel.duelists.left.minded.skills, report = skills.report.strike;
    // On to the first option's blow under way, after each option has begun one: which option began the last blow then
    // decides the next, as it would not from the second's.
    const forkable = () => report.choice.counts.every(({ thrown }) => thrown > 0) && skills.state.blow.busy && report.choice.option === 0;
    while (!forkable() && a.duel.clock < 30 && !a.duel.verdict) a.world.step();
    assert.ok(forkable(), `mid-blow at ${a.duel.clock} s, ${JSON.stringify(report.choice.counts)}`);
    b.duel.load(a.duel.save());
    const trace = (s) => traceOf(Object.values(s.duel.duelists).map((d) => d.built)), ta = trace(a), tb = trace(b);
    for (let i = 0; i < 600 && !a.duel.verdict; i++) { a.world.step(); b.world.step(); ta.take(); tb.take(); }
    assert.deepEqual(b.duel.save().state, a.duel.save().state);
    assert.equal(tb.digest(), ta.digest());
    assert.deepEqual(b.duel.duelists.left.minded.skills.report.strike.choice.counts, report.choice.counts);
  } finally { a.dispose(); b.dispose(); }
});
