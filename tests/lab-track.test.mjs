/**
 * **The Run scenario's tracks** (`src/lab/track.ts`): closed paths from the origin facing +z,
 * continuous, of the length their pieces say, and found again from a point on them -- on the
 * shuttle, from the straight the body is on, not the one 0.6 m across.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CIRCLE_RADIUS, SHUTTLE_METRES, SHUTTLE_TURN_RADIUS, TRACK_IDS, TRACKS, trackOf, TURN_PACE } from "../src/lab/track.ts";
import { LAB_TURN_RATE } from "../src/lab/stance-mode.ts";

const near = (a, b, within, what) => assert.ok(Math.abs(a - b) <= within, `${what}: ${a} against ${b}`);
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

test("each_track_starts_where_the_body_stands_and_closes_on_itself", () => {
  assert.deepEqual([...TRACK_IDS], ["circle", "shuttle"]);
  near(trackOf(TRACKS.circle.pieces).length, 2 * Math.PI * CIRCLE_RADIUS, 1e-9, "circle length");
  near(trackOf(TRACKS.shuttle.pieces).length, 2 * SHUTTLE_METRES + 2 * Math.PI * SHUTTLE_TURN_RADIUS, 1e-9, "shuttle length");
  // The shuttle turns on the Routine's arc: its pace at the lab's turn rate.
  near(SHUTTLE_TURN_RADIUS, TURN_PACE / LAB_TURN_RATE, 1e-12, "shuttle turn radius");
  for (const id of TRACK_IDS) {
    const track = trackOf(TRACKS[id].pieces);
    for (const at of [track.at(0), track.at(track.length)]) {
      near(at.x, 0, 1e-9, `${id} x`); near(at.z, 0, 1e-9, `${id} z`); near(wrap(at.heading), 0, 1e-9, `${id} heading`);
    }
  }
  // The circle turns right, round (4, 0); the shuttle's far end is 6 m up +z, its way back 0.6 m to the right.
  const circle = trackOf(TRACKS.circle.pieces), shuttle = trackOf(TRACKS.shuttle.pieces);
  const half = circle.at(circle.length / 2);
  near(half.x, 2 * CIRCLE_RADIUS, 1e-9, "circle's far side x"); near(half.z, 0, 1e-9, "circle's far side z");
  const back = shuttle.at(SHUTTLE_METRES + Math.PI * SHUTTLE_TURN_RADIUS + 1);
  near(back.x, 2 * SHUTTLE_TURN_RADIUS, 1e-9, "shuttle's way back x"); near(back.z, SHUTTLE_METRES - 1, 1e-9, "shuttle's way back z");
  near(Math.abs(wrap(back.heading)), Math.PI, 1e-9, "shuttle's way back heading");
});

test("a_track_is_continuous_and_turns_by_its_curvature", () => {
  for (const id of TRACK_IDS) {
    const track = trackOf(TRACKS[id].pieces), ds = 0.01;
    for (let s = 0; s < track.length; s += ds) {
      const a = track.at(s), b = track.at(s + ds);
      assert.ok(Math.hypot(b.x - a.x, b.z - a.z) <= ds + 1e-9, `${id} jumps at ${s}`);
      // Along the heading, as far as the arc goes; turned by the curvature over it.
      near((b.x - a.x) * Math.sin(a.heading) + (b.z - a.z) * Math.cos(a.heading), ds, 1e-3 * ds + ds * ds * Math.abs(a.curvature), `${id} runs along its heading at ${s}`);
      if (a.curvature === b.curvature) near(wrap(b.heading - a.heading), a.curvature * ds, 1e-9, `${id} turns at ${s}`);
    }
  }
});

test("a_point_is_found_on_the_track_where_it_lies_and_on_the_shuttle_on_its_own_straight", () => {
  for (const id of TRACK_IDS) {
    const track = trackOf(TRACKS[id].pieces);
    for (let s = 0; s < track.length; s += 0.37) {
      const p = track.at(s);
      // Searched from a little behind or ahead, it finds itself, within the search's millimetre.
      for (const from of [s - 0.3, s + 0.2]) {
        const found = track.nearest(p.x, p.z, from);
        near(Math.abs(wrap((found - s) / track.length * 2 * Math.PI)) * track.length / (2 * Math.PI), 0, 0.0015, `${id} at ${s} from ${from}`);
      }
    }
  }
  // A body 0.25 m right of the way out, 3 m along, is nearer the way out than the way back
  // (0.35 m on) -- and even 0.35 m right, where the way back is nearer, it is still on the way out.
  const shuttle = trackOf(TRACKS.shuttle.pieces);
  near(shuttle.nearest(0.35, 3, 2.9), 3, 0.0015, "shuttle, 0.35 m right of the way out");
  const wayBack = 2 * SHUTTLE_METRES + Math.PI * SHUTTLE_TURN_RADIUS - 3;
  near(shuttle.nearest(0.25, 3, wayBack), wayBack, 0.0015, "shuttle, 0.35 m left of the way back");
});
