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
