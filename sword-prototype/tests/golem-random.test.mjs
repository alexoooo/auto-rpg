// A build drawn at random, and the caption that names one.
//
// No arena and no Havok: `randomGolemSetup` is a pure function of a seeded stream over the option
// lists in `src/golem/build.ts`, and `golemSetupRefusal` is the same gate the screen and the
// measure apply, so everything a draw has to be true of can be said here without building a body.
import test from "node:test";
import assert from "node:assert/strict";

import { golemMatchup } from "../src/bout.ts";
import {
  GOLEM_EFFECTORS,
  defaultGolemSetup,
  describeGolemSetup,
  golemChainOptions,
  golemEffector,
  golemHeadOptions,
  golemLocomotionOptions,
  golemSetupRefusal,
  golemTerminalOptions,
  golemTorsoOptions,
  randomGolemSetup,
} from "../src/golem/build.ts";
import {
  VIABLE_DRAW_TRIES,
  VIABLE_PAIRS,
  VIABLE_TERMINALS,
  armedTerminal,
  pairKey,
  randomViableGolemSetup,
  randomViableOpponent,
  randomViablePair,
  unviablePairNote,
  viableBuild,
  viablePair,
} from "../src/golem/viability.ts";
import { mulberry32 } from "../src/rng.ts";
import { unitDefinition } from "../src/units.ts";

const DRAWS = 400;

const draws = (seed, count = DRAWS) => {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => randomGolemSetup(rng));
};

test("every_random_build_passes_the_same_refusal_the_screen_applies", () => {
  for (const setup of draws(20260906)) {
    assert.equal(golemSetupRefusal(setup), null, JSON.stringify(setup));
  }
});

test("seeded_draws_repeat_and_different_seeds_differ", () => {
  assert.deepEqual(draws(1), draws(1));
  assert.notDeepEqual(draws(1), draws(2));
  assert.notDeepEqual(draws(1, 8), draws(3, 8));
});

test("over_a_few_hundred_draws_every_option_of_every_slot_appears", () => {
  const seen = { locomotion: new Set(), torso: new Set(), head: new Set(), effector: new Set() };
  for (const setup of draws(20260906)) {
    seen.locomotion.add(setup.locomotion);
    seen.torso.add(setup.torso);
    seen.head.add(setup.head);
    for (const socket of ["primary", "secondary"]) {
      seen.effector.add(`${setup[socket].chain}+${setup[socket].terminal}`);
    }
  }
  const ids = (options) => options.map((option) => option.id).sort();
  assert.deepEqual([...seen.locomotion].sort(), ids(golemLocomotionOptions()));
  assert.deepEqual([...seen.torso].sort(), ids(golemTorsoOptions()));
  assert.deepEqual([...seen.head].sort(), ids(golemHeadOptions()));
  const offered = golemChainOptions().flatMap((chain) =>
    golemTerminalOptions(chain.id).map((terminal) => `${chain.id}+${terminal.id}`)).sort();
  assert.deepEqual([...seen.effector].sort(), offered,
    "every chain-and-terminal pair the registry offers is drawn, and nothing it does not");
  assert.equal(offered.length, GOLEM_EFFECTORS.length, "the option lists are the registry's");
});

test("a_two_socket_terminal_drawn_in_either_socket_claims_both", () => {
  let mauls = 0;
  for (const setup of draws(20260906)) {
    const two = ["primary", "secondary"].filter((socket) =>
      (golemEffector(setup[socket].chain, setup[socket].terminal)?.sockets ?? 1) === 2);
    if (two.length === 0) continue;
    mauls += 1;
    assert.deepEqual(setup.primary, setup.secondary, JSON.stringify(setup));
  }
  assert.ok(mauls > 0, "the maul is drawn at all");
});

test("the_draw_reads_its_stream_and_nothing_else", () => {
  // A stream of zeros is the first option of every slot; a stream just under one is the last of
  // every slot. Neither reads the clock or `Math.random`, or the two calls would disagree.
  const first = randomGolemSetup(() => 0);
  assert.deepEqual(first, randomGolemSetup(() => 0));
  assert.equal(first.locomotion, golemLocomotionOptions()[0].id);
  assert.equal(first.primary.chain, golemChainOptions()[0].id);
  const last = randomGolemSetup(() => 1 - 1e-9);
  const chains = golemChainOptions();
  assert.equal(last.locomotion, golemLocomotionOptions().at(-1).id);
  assert.equal(last.primary.chain, chains.at(-1).id);
  assert.equal(last.primary.terminal, golemTerminalOptions(chains.at(-1).id).at(-1).id);
});

test("the_caption_names_every_slot_in_short_words_and_says_when_two_hands_hold_one_thing", () => {
  const plain = describeGolemSetup(defaultGolemSetup());
  assert.equal(plain, "biped, plain trunk, plain head; wrist + blade, wrist + plate");
  const maul = describeGolemSetup({
    ...defaultGolemSetup(),
    locomotion: "locomotion.wheel",
    head: "head.ram",
    primary: { chain: "reach", terminal: "maul" },
    secondary: { chain: "reach", terminal: "maul" },
  });
  assert.equal(maul, "wheel, plain trunk, ram head; reach + maul in both hands");
  const capped = describeGolemSetup({
    ...defaultGolemSetup(),
    torso: "torso.plated",
    primary: { chain: "pitch", terminal: "fist" },
    secondary: { chain: "none", terminal: "none" },
  });
  assert.equal(capped, "biped, plated trunk, plain head; pitch + fist, none, capped");
  // Every drawn build gets a caption with all five slots in it and no registry label in it.
  for (const setup of draws(4, 40)) {
    const caption = describeGolemSetup(setup);
    assert.equal((caption.match(/[;,]/g) ?? []).length >= 3, true, caption);
    assert.doesNotMatch(caption, / - /, "a registry label leaked into the caption");
  }
});

test("the_showcase_matchup_names_a_unit_and_a_policy_the_registry_has", () => {
  const matchup = golemMatchup(defaultGolemSetup());
  for (const side of ["left", "right"]) {
    const definition = unitDefinition(matchup[side].unit);
    assert.equal(definition.kind, "golem");
    assert.ok(definition.driverOptions.some((driver) => driver.name === matchup[side].policy),
      `the golem offers "${matchup[side].policy}"`);
    assert.equal(definition.humanAdapter, true, "the you radio is offered on a golem");
  }
});

// ------------------------------------------------------- the viable draw, Session 01 of the learn set

const viableDraws = (seed, count = 200) => {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => randomViableGolemSetup(rng));
};

test("every_viable_draw_is_viable_and_repeats_under_its_seed", () => {
  const drawn = viableDraws(20260906);
  for (const setup of drawn) {
    assert.equal(golemSetupRefusal(setup), null, JSON.stringify(setup));
    assert.ok(viableBuild(setup), describeGolemSetup(setup));
    assert.ok(VIABLE_TERMINALS.includes(armedTerminal(setup)), armedTerminal(setup));
  }
  assert.deepEqual(viableDraws(20260906), drawn, "the same stream draws the same bodies");
  assert.notDeepEqual(viableDraws(20260907), drawn);
  // It is a rejection over the ordinary draw and not a second shelf. On the table Session 01
  // measured it rejects *nothing* -- every class on the shelf is viable, because the maul decides
  // against all seven -- so the two draws are the same sequence body for body over one stream.
  // That is asserted rather than described: a re-measurement that refuses a class turns this red,
  // which is how anyone finds out the screen's draw changed.
  assert.deepEqual(drawn, draws(20260906, drawn.length),
    "on the measured table the viable draw is the plain draw");
  for (const terminal of new Set(drawn.map(armedTerminal))) {
    assert.ok(VIABLE_TERMINALS.includes(terminal), terminal);
  }
});

test("the_viable_draw_throws_past_its_bound_with_the_class_it_last_refused", () => {
  // A stream of zeros is the first option of every slot, forever, and that body is armed with
  // nothing. `randomViableGolemSetup` accepts it -- every class is viable on the measured table --
  // so the bound that can be reached without waiting on luck is the *opponent* draw's: a body with
  // no terminal pairs with a maul and with nothing else, and this stream never produces one.
  const stuck = randomGolemSetup(() => 0);
  const terminal = armedTerminal(stuck);
  assert.ok(viableBuild(stuck), "the all-zeroes body is one the class table admits");
  assert.equal(viablePair(stuck, stuck), false, `"${terminal}" against itself decides nothing`);
  assert.throws(() => randomViableOpponent(() => 0, stuck), (error) => {
    assert.match(error.message, new RegExp(`"${terminal}"`), "the message names the class");
    assert.match(error.message, new RegExp(String(VIABLE_DRAW_TRIES)), "and how many it tried");
    return true;
  });
  // The bound is an argument, so a caller can ask for a tighter one and still be told the class.
  assert.throws(() => randomViableOpponent(() => 0, stuck, 3), /3 viable bodies in a row/);
  // The body draw keeps its own bound and its own sentence, for the day a class is refused again.
  // Nothing it can draw is unviable today, so the only way to reach that line is to allow it no
  // draws at all -- which is a fair test of the bound and an unfair one of the message's class.
  assert.throws(() => randomViableGolemSetup(() => 0, 0), /0 random golem builds in a row were unviable/);
});

test("a_viable_pair_is_two_viable_bodies_that_the_pair_table_also_accepts", () => {
  assert.equal(pairKey("maul", "blade"), pairKey("blade", "maul"));
  for (const key of VIABLE_PAIRS) {
    const [a, b] = key.split("|");
    assert.ok(VIABLE_TERMINALS.includes(a) && VIABLE_TERMINALS.includes(b),
      `${key} names a class that is not in the viable set`);
    assert.equal(key, pairKey(a, b), "every key is stored in its own canonical order");
  }
  const rng = mulberry32(20260906);
  for (let i = 0; i < 40; i += 1) {
    const [a, b] = randomViablePair(rng);
    assert.ok(viableBuild(a) && viableBuild(b));
    assert.ok(viablePair(a, b), `${armedTerminal(a)} vs ${armedTerminal(b)}`);
    assert.equal(unviablePairNote(a, b), null);
  }
  assert.deepEqual(randomViablePair(mulberry32(7)), randomViablePair(mulberry32(7)));
});

test("a_hand_built_pair_the_predicate_refuses_is_captioned_rather_than_blocked", () => {
  // The screen renders this string and decides nothing, so the sentence is asserted here -- there
  // is no test of `src/setup.ts`, because the Node runner has no DOM.
  const unarmed = {
    ...defaultGolemSetup(),
    primary: { chain: "none", terminal: "none" },
    secondary: { chain: "none", terminal: "none" },
  };
  assert.equal(golemSetupRefusal(unarmed), null, "it is a build the arena will happily assemble");
  // The body is one the class table admits -- a maul finishes it, which is the whole of why every
  // class is in `VIABLE_TERMINALS` -- and the pair is one nothing can finish. That gap is the
  // finding Session 01 measured, and it is what the caption on the screen is for.
  assert.equal(viableBuild(unarmed), true);
  assert.equal(viablePair(unarmed, unarmed), false);
  assert.equal(unviablePairNote(unarmed, unarmed), "these two cannot finish each other");
});
