# Learning status

**Purpose:** State exactly what policy optimization exists today and which learned-policy components do not ship.
**Status:** current
**Canonical source:** [`crates/policy/src/lib.rs`](../../crates/policy/src/lib.rs), [`crates/policy/src/genome.rs`](../../crates/policy/src/genome.rs), and [`crates/lab/src/evolve.rs`](../../crates/lab/src/evolve.rs)
**Update when:** A learned policy, model artifact, inference runtime, training backend, genome surface, or evolution method changes.

No learned policy currently ships. There is no neural-network implementation, model
file, inference dependency, gradient/autodiff path, browser trainer, Python training
pipeline, GPU evaluator, or learned state inside the simulation. References to a
future network in the root documents explain a boundary and a comparison target; they
do not describe a current component.

## Current policies and evolvable surface

The shipped policies implement the hand-written `Policy` trait:
`Observation -> Command`. `PolicyKind` exposes Utility, Duelist, Idle, and Random.
Utility and Duelist are authored algorithms with named fixed-point weights; Idle is a
control and Random is a deterministic fuzzer. `PolicySpec` maps each named weight to a
gene in `0..=1`, and `MAX_GENOME_LEN` bounds the flat fixed-size genome. The browser
uses the same metadata for policy sliders and resetting baseline values.

`Observation::write_features` already provides a versioned fixed-width feature vector
so a future policy can share the observation boundary without moving simulation
authority. Current policies read typed observation fields directly; no shipped model
consumes that flattened vector.

## What `lab evolve` does

The Lab CLI runs a deterministic `(mu + lambda)` evolution strategy over the named
weights of an existing hand-authored policy. A population begins with the hand-tuned
baseline plus fixed-point genes, evaluates candidates through the ordinary native run
harness, retains elites, and mutates only genes that the selected policy reads. It can
score skirmishes, one named duel, or the full roster and can require performance
against a second opponent by taking the worse score.

Every candidate in a generation sees the same seed set. Seeds change between
generations, and the winner is evaluated again on a fixed held-out range before the
CLI compares it with the baseline. Parallel evaluation writes scores back in
population-index order; tests require evolution to produce the same genome across
thread counts. The CLI prints the best named weights. It does not train or serialize a
network, add a new `PolicyKind`, or produce a runtime model artifact.

Calling this optimization "learning" would hide the important boundary: the search
changes constants consumed by code somebody wrote; it does not learn the observation-
to-command function. Its architectural value is the rollout, fitness, selection, and
holdout harness that a later learned-policy experiment can reuse.

> **Proposed by v2 -- not shipped:** The [learning probe](../plans/v2-19-learning-probe.md)
> proposes one small native/reference learned policy measured against the scripted
> baseline. The [v2 roadmap](../plans/v2-00-overview.md) explicitly defers browser
> training, GPU evaluation, multiple wasm hosts, policy catalogs, hierarchy, and a Lab
> workbench until that probe earns expansion.
