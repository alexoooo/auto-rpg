# Clean layer boundaries and invariant ownership

## Goal

Every module owns one coherent responsibility. General contracts describe declared capabilities;
implementations own their anatomy requirements, algorithms, tuning and data. Application composition
selects the implementations. Validation, execution, inspection and evidence consume the same facts.
Durable simulation memory belongs to an explicit saved state graph.

The [audit](../analysis/2026-11-05-layer-boundary-audit.md) is the corrective backlog, including the findings
from the Mind and project organization review. Its [file ledger](../analysis/2026-11-05-layer-boundary-files.md)
covers first-party source, tools, authored configuration and the authored Rapier overlay. Every
confirmed finding is in scope. The unresolved questions require a demonstrated resolution.
[AGENTS.md](../../AGENTS.md) supplies the engineering invariants.

## Required boundaries

- General body commands, including `BodyControl` and `MirrorWriter`, address body-declared segments
  and configurations. Bilateral sides, hand poses, named anatomical channels and fixed limb counts
  belong to explicitly applicable body utilities or implementations. Each identifier has one
  domain owner and canonical declaration; moving a literal into a shared constant does not make
  its meaning general.
- The Option loop orchestrates registered behavior. A fighter assembly selects Options, chooser,
  navigation and prediction model. `strike-profiles` and `edge-profiles` belong to their consuming
  providers; `Guarding` belongs to the component producing that phase. The prediction provider and
  Option evaluation contracts must agree without an unchecked `ProfileTables` cast.
- A public extension contract includes the callback types, applicability, resource claims, data
  identity and reporting an independent implementation needs. The configured tree supplies those
  declarations to assembly, admission, editors and evaluations.
- The physical core owns physical descriptions and mechanisms. Gameplay equipment defaults,
  editor metadata and representative evaluation panels belong to their consumers. Arena seats
  and anatomical laterality have separate owners.
- An implementation owns its private algorithms, state, calibrated providers, assets and tools.
  Shared code lives at the narrowest scope of its actual consumers. Authored geometry shared by
  physical asset generation and rendering has an owner below both consumers.
- Applicability checks every requirement the constructor and executor consume. Unsupported input
  returns a named refusal. Allowed commands have explicit ownership, including whole-body assist.
- Saved state includes behavior-relevant memory and published snapshots, with derived caches
  restored consistently. Read-only observations preserve engine records and object identity;
  contact computations follow current attachment topology.
- Transport preserves plain data exactly, correlates each request with its completion, handles
  backpressure, and settles pending work on faults or disposal. Construction transfers resources
  to a completed owner or disposes partial work.
- Evidence identifies the actual code, character, protocol and data it plays. Unreached fixtures
  remain failures or explicit invalid outcomes. Human reference figures remain a reported scale.

## Sequencing and overlap

Start by repairing the evidence entrypoints required for a trustworthy baseline: Ratings loading,
stale diagnostic contracts and paths, record coverage/provenance checks and build identity. Use
bounded startup or protocol checks for these repairs. A broken evidence reader cannot establish
that a behavior-preserving change succeeds. Resolve the worker-lifetime and service-worker-scope
questions with bounded probes before assigning their corrective work.

Physical observation, contact topology, immutable tuning, serialization and request-lifetime
repairs are independent of fighter composition and can proceed alongside contract work. Preserve
their existing arithmetic where the contract is unchanged; classify corrected behavior explicitly.

Establish authoritative capability contracts next: support facts and execution context, callback
types, estimate units, configured skill declarations, applicability and assist ownership. Update
each contract's constructors, validators, saved state and readers in the same landable change.
The editor, inspector, Lab and evaluation adapters consume declared capabilities and actual
component paths; they do not reconstruct private Option configuration layouts.

After those contracts are available, separate Option orchestration and prediction-model
compatibility from fighter assembly. Resolve omitted and null configuration values at the owning
composition root while preserving explicit empty lists. Derive data dependencies, phases and
order-taking capability from the configured components. Move the concrete Option and Commander
registries with their lookup injection and every caller.

Group private implementations, calibrated providers and policy helpers with their owners once
their public boundary is stable. Move source, loaders, assets, tests and research commands together;
correct every retained consumer of named bearing ends and the Mind command phases. Remove
unconsumed exports after the consumer changes establish which public surface remains necessary.

Coordinate Option wiring, defaults and prediction changes with
[Option Mind general](2026-11-03-option-mind-general.md). This plan owns separation, invariant
repairs and compatible extension contracts; that plan owns fighter development and training.
One implementation change and one evidence question own each iteration. A shared file has one
active editor; dependent consumers land with its contract, rather than as a follow-up repair.

## Work ownership

| Area | Audit groups | Result |
| --- | --- | --- |
| Physical and control foundations | `FND-*`, `ROOT-SUPPORT` | Correct state/value preservation, observation and contact contracts; physical and private controller ownership is explicit. |
| Mind and application composition | `MG01` through `MG11`, `MG22`, `ROOT-TABLES`, `ROOT-ESTIMATE` | Generic hosting and decision contracts accept compatible registered implementations; stock choices live in composition. |
| Game and evaluation | `MG12` through `MG21`, `MG23` | Explicit state, returned refusals, faithful subject metadata and outcomes, and compatible recorded evidence. |
| Skills and implementation tools | `SK-*`, `ROOT-AIMS`, `ROOT-TOOLS` | Complete fit and validation contracts, exclusive commands, saved memory, configured geometry and implementation-owned data/tools. |
| Runtime adapters and presentation | `APP-*`, `AE01`, `AE02` | Exact transport, owned completion/lifetimes, declared editor/introspection contracts and working screen data sources. |
| Tooling and authored overlay | `SCR-*`, `RSR-*`, `VO*`, `EXP-001` | Reliable ownership/provenance gates, exact exported policy behavior, reported adapter failures and a consumed public surface. |

The audit supplies each issue's source constructs, effect, correction and verification. Related
findings share a change where they have one cause; the backlog IDs remain individually traceable.

## Validation and completion

For each change, name the broken contract and the affected consumers before implementation.
Reproduce observed failures at that layer. Add a retained test only for a concrete regression
that existing diagnostics or drills do not establish, and document its purpose in the test inventory.
Behavior-preserving slices keep exact fingerprints, supported fresh-fork continuation and worker
equivalence. Behavior corrections retain their failure evidence and explain any changed result.
Hot-path allocation repairs also follow the repository's paired allocation/time requirements.

Run the [checks required by the change](../../AGENTS.md#doing-the-work). Read affected supported
evaluation rows on the corrected code and harness where the change requires them; preserve short
or failed outcomes. Skill-success claims require the watched drill evidence prescribed by
AGENTS.md. Training is separate from structural verification.

Completion requires every confirmed audit obligation to be corrected at its owner, every question
resolved by evidence, all affected consumers inspected on the resulting contracts, and the
architecture describing the implementation accurately. A new entrant can supply its own parts
and data through published APIs without copying private types or editing stock vocabularies.
Passing a path/import gate or a fingerprint establishes only that gate's stated property.

Commit each landable change on main. Remove this plan and its analysis records when the corrective
work lands; retain current contracts in the architecture and change evidence in commits.
