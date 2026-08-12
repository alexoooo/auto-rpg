# Smart AI 19 -- interior ordinary-command contact fixture

**Status:** closed `revise`; the bounded Lab search found no eligible mirrored pair
and selected no mechanics fixture. No simulation authority or pin changed.

Session 18 found that the retained strong-strike sword arm contacts at LOW height and
full reach. A scalar joint Jacobian sampled there is a boundary diagnostic, not an
interior response fixture. This session asks the narrower question first: can ordinary
legal articulated commands produce a uniquely attributed, visibly crossing sword/body
contact with the attacking arm strictly inside its reach interval, nonzero arm and
weapon motion, and a mirrored mate with the same properties?

## Frozen search

The ignored Lab selector
`sweep_for_a_precontact_interior_reach_mirror_pair` in
[`crates/lab/src/strong_strike.rs`](../../crates/lab/src/strong_strike.rs) enumerates
one canonical grid:

- seed `0`;
- chamber ticks `[8,12,16,20,24,28,32]`;
- commit horizons `[12,16,20,24,28,32]`;
- commanded reach raw `[32768,40960,49152,57344,61440]`;
- Fighter then Brute targets;
- all nine existing `APPROACH_OFFSETS` in their declared order; and
- unmirrored then mirrored.

That is `7 * 6 * 5 * 2 * 9 * 2 = 7,560` runs. A pair can be selected only when
both adjacent mirror rows pass. Selection is the first such pair in the order above;
there is no score and no response, energy dissipation, channel, anatomy, or damage
value participates.

Eligibility is read from the public subject observation immediately before the
contact tick plus the published contact rows. It requires exactly one attributed
right-sword/body fact, zero competing facts, an independently recomputed observed
region crossing, inferred reach raw in `[17,408,64,512]` -- 1,024 raw inside both
the `16,384` minimum and `65,536` maximum -- nonzero observed right-arm velocity,
nonzero hilt and tip displacement, and zero command refusals, solver rejections, and
energy excess. A selected pair would also have to survive commanded reach probes
`-256/+256` and commit-horizon probes `-1/+1` with those same eligibility margins.
The probes are pass/fail guards, never alternative candidates scored by response.

## Exact result

The 7,560 rows produced this waterfall:

| predicate | rows |
|---|---:|
| any attributed contact recorded | 2,608 |
| inferred reach inside the strict margin | 2,338 |
| exactly one sword/body fact and no competitor | 1,669 |
| complete individual eligibility conjunction | 312 |
| complete adjacent mirrored pairs | **0** |

The counts overlap before the final conjunction and must not be subtracted as a
sequential funnel. Zero pairs is the decision: no fixture is selected.

For diagnosis only, the first eligible individual was chamber `8`, commit horizon
`20`, commanded reach raw `32,768`, Brute target, offset raw `(-131072,0)`, unmirrored.
It contacted at tick `28`, with inferred reach raw `32,765`, observed arm velocity raw
`(141,1278,0)`, hilt displacement length raw `1,334`, tip displacement length raw
`8,433`, one attributed fact, no competitor, a recomputed crossing, and a legal run.
Its mirror contacted at tick `9` with reach `18,522`, velocity `(320,-23,-505)`, and
hilt/tip displacement `863`, but failed the observed crossing predicate. The `-256`
and `+256` reach probes preserved the unmirrored row and did not repair the mirror;
the `-1` horizon probe made the unmirrored row miss. Thus even the first individual
is neither a mirrored fixture nor robust to the predeclared timing slack.

## Consequence

Close `revise`. Do not promote the first individual, relax the crossing predicate,
discard the mirror requirement, or choose a row from damage output. A successor may
change the command construction or choose a synthetic forward-only mathematical
fixture, but either is a new declared experiment. It cannot describe this search as
having found an ordinary-command interior pair.

## Verification

```powershell
cargo test -p lab sweep_for_a_precontact_interior_reach_mirror_pair -- --ignored --nocapture
cargo test -p lab
node tools/check_docs.js
git diff --check
```
