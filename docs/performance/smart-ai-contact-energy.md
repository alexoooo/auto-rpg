# Smart AI contact-energy allocation

**Purpose:** Record the session-05 offline contact-floor interpretations and decision.
**Status:** current
**Canonical source:** this record and the offline ledger in [`strike_corpus.rs`](../../crates/lab/src/strike_corpus.rs)
**Update when:** Contact allocation, the energy floor, the striker, or the stationary-target corpus changes.

Measured on 2026-08-11. No authoritative contact rule or state changed.

## Method

The production striker ran one complete `Commit -> Recover` sweep for the same 3,600
seed, target, offset and mirror cases used by actuator calibration. For every attacker
weapon/body resolution the Lab ledger retained the full contact key, tick, group
ordinal, group closure ledger, allocated share, and production cut-plus-thrust energy.
Keys on consecutive ticks form one offline episode; a one-tick absence ends it.

The three interpretations consume identical allocated shares:

- production charges raw 144 per fact per tick;
- per-group charges raw 144 once for all attacker facts in a solver group;
- per-episode charges raw 144 once for each consecutive run of a contact key.

The sword's edge and point factors are both one, so after the floor, cut plus thrust
is exactly the available allocated share; no material factor is approximated. An
allocation of zero remains zero under every interpretation, so held zero-energy
overlap does not become a damage source.

Run the measurement with:

```powershell
cargo run --release -p lab -- strike-corpus --policy striker --seeds 100 --mirrored --contact-energy-ledger
```

The command first writes the complete allocation ledger for the first sweep. Its
seven rows are seven distinct contact episodes, all with one fact and zero allocated
energy; closure energies are 91, 51, 35, 35, 42, 36 and 35 raw.

## Result

| interpretation | cases | maximum closure energy | allocated energy | floor charges | cut + thrust energy |
|---|---:|---:|---:|---:|---:|
| per fact / tick | 3,600 | 43,076 | 131,994 | 28,646 | 1,228 |
| per contact group | 3,600 | 43,076 | 131,994 | 28,646 | 1,230 |
| per continuous episode | 3,600 | 43,076 | 131,994 | 8,628 | 1,258 |

Episode billing removes 20,018 nominal floor charges but produces only 30 additional
raw units of wounding-channel energy over the entire corpus, a 2.44% increase. The
reason is visible in the first complete ledger and in the aggregate: most allocated
shares are already below the floor even after consecutive facts are combined. Group
billing changes only 2 raw because almost every attacker fact is alone in its group.

The decision is **revise**. Moving a floor from every fact to every episode is real,
but it is not the bottleneck preventing these clean geometric crossings from becoming
proportionate wounds. Adding hashed episode state would move three mechanics pins for
no practical gain, so production retains the stateless per-fact rule and every golden
remains unchanged.
