# Hierarchical combat learning -- overview

**Status:** proposed research successor. No training, browser promotion, or mechanics
change is authorized by this overview.

The current learned policies map one observation directly to joint or tactical
controls. The next research branch asks a different question: can a slower
meta-policy choose among complete, understandable combat options while a lower-level
controller executes each choice long enough for it to have an effect?

An option is a versioned `(loadout, strategy)` pair. Examples are
`(shield+sword, charge)`, `(shield+sword, withdraw)`, and `(club, hold-measure)`.
Several options may therefore share one loadout. That is the important first case:
it isolates strategy selection from equipment selection and can show whether a
hierarchy helps before the catalog grows.

## Two selection boundaries

The two meanings of selection must not be conflated:

- **Encounter selection** happens before `World` construction and may choose any
  eligible `(loadout, strategy)` pair. The chosen loadout becomes ordinary scenario
  input and is replayed and hashed exactly as it is today.
- **Tactical selection** happens during a fight and may change only the strategy.
  Every candidate must match the fighter's already-equipped loadout. A selector that
  asks for another loadout is refused by option id; it does not silently swap gear.

The selected low-level strategy still receives only `ArticulatedObservation` and
returns `ArticulatedCommandV1`. The hierarchy owns no `World`, simulation snapshot,
hidden target state, or authoritative memory. Replay continues to record submitted
commands, so replay does not need the selector, its option catalog, or its model.

## Session order

| session | lands | depends on |
|---|---|---|
| [01](hierarchical-ai-01-option-corpus.md) | fixed option catalog, matched corpus, best-fixed and oracle baselines | a mechanically productive corpus |
| [02](hierarchical-ai-02-encounter-selector.md) | learned encounter-level selection over complete pairs | 01 shows context-dependent option advantage |
| [03](hierarchical-ai-03-temporal-options.md) | fixed-loadout strategy switching at named termination boundaries | 01; 02 is informative but not required |
| [04](hierarchical-ai-04-lookahead-gate.md) | optional shallow option planning and conditional promotion decision | 03 beats the best fixed option on held-out fights |

Each session is a decision session. If its preregistered comparison fails, it records
`revise` with the matched evidence and does not weaken the threshold, enlarge the
catalog, or promote a checkpoint after seeing the result.

## Versioned vocabulary

Session 01 owns the append-only identities; numeric values are fixed before any
training run:

```rust
pub enum ArticulatedLoadoutKindV1 {
    ShieldSword = 0,
    Club = 1,
}

pub enum StrategyKindV1 {
    Charge = 0,
    HoldMeasure = 1,
    Withdraw = 2,
    Tactical = 3,
}

pub struct CombatOptionV1 {
    pub id: u16,
    pub loadout: ArticulatedLoadoutKindV1,
    pub strategy: StrategyKindV1,
}
```

`CombatOptionV1::id` identifies the pair, not either component alone. Catalog order is
not a learned meaning: checkpoints store the catalog version and an ordered list of
option ids, and loading refuses a missing, duplicated, reordered, or incompatible
option by name.

## Comparisons that make the hierarchy earn its cost

Every learned result is paired on identical scenario, opponent, seed, mirror, and
evaluation budget against:

1. every fixed option;
2. the single best fixed option selected on training data;
3. a context-free selector with the same option frequencies; and
4. an offline per-fight oracle, reported only as headroom and never as a deployable
   baseline.

The hierarchy succeeds only by beating the best fixed option on held-out paired
fights. Beating an average option merely shows that weak options were put in the
catalog. Session 01 stops the branch if different options do not win in different
contexts or the oracle has no positive lower confidence bound over the best fixed
choice.

## Golden and dependency budget

Sessions 01--03 are native research paths and must move no registered hash. Strategy
controllers belong in `crates/policy`; selector inference and its versioned codec
belong in `crates/learn-core`; training belongs in `crates/learn`; corpus and evidence
belong in `crates/lab`. This preserves
`fx <- sim <- policy <- {learn-core, lab, web}` and keeps `learn` hosted only by Lab.

Session 04 may propose browser promotion only after the held-out gate passes. A
promotion that changes a shipped model shape, feature layout, option layout, forward
pass, or checkpoint owns the corresponding `LEARNED_INFERENCE_DIGEST` change. No
simulation, command, combat, replay, or legacy pin is ever authorized to move by this
research branch.

