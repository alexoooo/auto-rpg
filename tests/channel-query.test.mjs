import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CHANNEL_FLAGS, parseChannelFlags } from "../src/body-command.ts";
import { channelFlagsFromSearch, channelSearch } from "../src/channel-query.ts";

test("page channel flags distinguish shipped defaults, explicit off and selected experiments", () => {
  assert.deepEqual(channelFlagsFromSearch("?play=arena"), DEFAULT_CHANNEL_FLAGS);
  assert.notEqual(channelFlagsFromSearch(""), DEFAULT_CHANNEL_FLAGS);
  assert.deepEqual(channelFlagsFromSearch("?channels="), { stance: false, step: false, effector: false });
  assert.deepEqual(channelFlagsFromSearch("?channels=stance"), { stance: true, step: false, effector: false });
  assert.deepEqual(channelFlagsFromSearch("?channels=step"), { stance: false, step: true, effector: false });
  assert.deepEqual(channelFlagsFromSearch("?channels=stance,step"), { stance: true, step: true, effector: false });
  assert.deepEqual(channelFlagsFromSearch("?channels=effector"), { stance: false, step: false, effector: true });
});

test("invalid or ambiguous channel URLs refuse the whole request", () => {
  for (const name of ["footwork", "constructor", "toString", "__proto__"]) {
    assert.throws(() => parseChannelFlags(`stance,${name}`), /no channel flag/);
    assert.throws(() => channelFlagsFromSearch(`?channels=stance,${name}`), /no channel flag/);
  }
  assert.throws(() => channelFlagsFromSearch("?channels=stance&channels=step"), /only once/);
});

test("switching channel flags preserves the exact matchup and unrelated page parameters", () => {
  const input = '?play=arena&matchup=%7B%22seed%22%3A17%7D&tactic=a&tactic=b&channels=stance';
  for (const flags of [{ stance: false, step: false, effector: false }, { stance: false, step: true, effector: false }, { stance: true, step: true, effector: false }]) {
    const result = channelSearch(input, flags);
    assert.deepEqual(channelFlagsFromSearch(result), flags);
    const before = new URLSearchParams(input), after = new URLSearchParams(result);
    before.delete("channels"); after.delete("channels");
    assert.deepEqual([...after], [...before]);
    assert.equal(new URLSearchParams(result).getAll("channels").length, 1);
  }
});
