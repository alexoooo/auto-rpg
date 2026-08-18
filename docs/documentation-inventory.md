# Root documentation inventory

**Purpose:** Preserve the root-heading audit and record each heading's current migration destination.
**Status:** current
**Canonical source:** this document
**Update when:** A root heading is added, removed, renamed, reclassified, or gains an inbound documentation link.

There is one row below for every Markdown heading inventoried before the root split.
Live root anchors remain links; moved anchors remain code-form migration keys rather
than broken links. `Destination` is one of the seven classes fixed by
[the documentation map](README.md#target-hierarchy). `Move phase` records the session
that performed the move for completed phases through v2-05, or owns the remaining
work for later phases.
`Inbound links` lists repository Markdown links that name the exact anchor, including
the role paths added by the map. Plain-text mentions are not links.

## DESIGN.md

| Current source anchor | Heading | Destination | Status | Move phase | Inbound links | Audit note |
|---|---|---|---|---|---|---|
| [`DESIGN.md#design-rules`](../DESIGN.md#design-rules) | Design rules | orientation | current | v2-05 | none | Retain as the short principles/index entry. |
| [`DESIGN.md#the-determinism-contract`](../DESIGN.md#the-determinism-contract) | The determinism contract | reference | current | v2-05 | `README.md` | Stable compatibility entry for the canonical reference contract. `Scenario::fingerprint` currently omits each `UnitSpec.loadout`; the reference records that gap and v2-10 owns the correction. |
| `DESIGN.md#what-is-not-covered` | What is *not* covered | design | current | v2-05 | none | Policy portability rationale. |
| [`DESIGN.md#the-agent-boundary`](../DESIGN.md#the-agent-boundary) | The agent boundary | architecture | current | v2-04 | none | Stable compatibility entry; architecture owns the flow and command reference owns exact feature layouts. Root orientation prose now links those authorities. |
| `DESIGN.md#the-one-exception-taking-the-controls` | The one exception: taking the controls | decision | current | v2-05 | none | Human-control exception and consequences. |
| [`DESIGN.md#the-swing`](../DESIGN.md#the-swing) | The swing | design | current | v2-05 | none | Mechanics rationale index. |
| `DESIGN.md#actions-and-loadouts` | Actions and loadouts | reference | historical | v2-05 | none | Removed source anchor whose exact action/loadout shapes and discriminants now live in command reference; v2-11 updates that authority for articulated commands. |
| `DESIGN.md#the-swap-and-why-it-costs-what-it-costs` | The swap, and why it costs what it costs | design | current | v2-05 | none | Current timing rationale. |
| `DESIGN.md#what-this-cost-honestly` | What this cost, honestly | evidence | historical | v2-05 | none | Historical measurement and trade-off record. |
| `DESIGN.md#why-it-is-a-state-machine-and-not-a-bearing` | Why it is a state machine and not a bearing | design | current | v2-05 | none | Current swing-state rationale. |
| `DESIGN.md#where-you-stand-still-decides-what-it-costs` | Where you stand still decides what it costs | design | current | v2-05 | none | Current position/commitment rationale. |
| `DESIGN.md#perception-is-a-fighting-stat-and-the-split-is-deliberate` | Perception is a fighting stat, and the split is deliberate | design | current | v2-05 | none | Current policy rationale. |
| `DESIGN.md#what-measurement-said-including-where-it-disagreed` | What measurement said, including where it disagreed | evidence | historical | v2-05 | none | Preserve measured corrections. |
| `DESIGN.md#the-difficulty-range-which-is-what-all-of-it-is-for` | The difficulty range, which is what all of it is for | evidence | current | v2-05 | none | Current sweep conclusions plus provenance. |
| [`DESIGN.md#weight-momentum-and-inertia`](../DESIGN.md#weight-momentum-and-inertia) | Weight, momentum and inertia | design | current | v2-05 | none | Mechanics rationale index. |
| `DESIGN.md#mass-is-geometry-unless-stated-otherwise` | Mass is geometry unless stated otherwise | design | current | v2-05 | none | Current mass rule. |
| `DESIGN.md#traction-is-grip-not-weight` | Traction is grip, not weight | design | current | v2-05 | none | Current traction rule. |
| `DESIGN.md#what-it-broke-and-what-that-says` | What it broke, and what that says | evidence | historical | v2-05 | none | Regression history. |
| `DESIGN.md#the-hit-test-had-to-stop-being-a-physics-limit` | The hit test had to stop being a physics limit | decision | historical | v2-05 | none | Superseded approach and correction. |
| `DESIGN.md#what-the-agent-can-see-layout-versions-7-through-9` | What the agent can see (layout versions 7 through 9) | reference | historical | v2-05 | none | Removed source anchor whose former feature-vector layouts are preserved as history. v2-16 took it to layout version 12 and pointed it at the articulated ABI reference for the appended block; embodied session 09 appended a second block and took it to 13; **embodied session 10 deleted the vector entirely** -- it hung off the legacy `Observation` and nothing in the workspace read it -- so what this anchor names is now wholly historical and the command reference records where the input contract went. |
| `DESIGN.md#a-measured-negative-leading-a-target-does-not-pay` | A measured negative: leading a target does not pay | evidence | historical | v2-05 | none | Negative experiment worth retaining. |
| `DESIGN.md#weapons-became-physical-and-one-cliff-came-with-it` | Weapons became physical, and one cliff came with it | design | current | v2-05 | none | Current mechanics rationale with history. |
| `DESIGN.md#blows-move-bodies-and-weight-finally-means-something` | Blows move bodies, and weight finally means something | design | current | v2-05 | none | Current recoil rationale. |
| `DESIGN.md#two-things-the-recoil-model-got-wrong-first-both-measured` | Two things the recoil model got wrong first, both measured | evidence | historical | v2-05 | none | Preserve corrections. |
| `DESIGN.md#what-it-cost-and-what-it-did-not-buy` | What it cost, and what it did not buy | evidence | historical | v2-05 | none | Measurement record. |
| `DESIGN.md#a-rounding-bug-was-deciding-mirror-matches` | A rounding bug was deciding mirror matches | decision | historical | v2-05 | none | Determinism-relevant correction history. |
| `DESIGN.md#damage-is-kinetic-energy-and-weapon-mass-cancels-out-of-it` | Damage is kinetic energy, and weapon mass cancels out of it | design | current | v2-05 | none | Current damage rationale. |
| `DESIGN.md#the-squared-law-is-what-finally-made-reach-pay` | The squared law is what finally made reach pay | design | current | v2-05 | none | Current reach rationale. |
| `DESIGN.md#a-phase-3-bug-that-only-became-expensive-here` | A Phase 3 bug that only became expensive here | decision | historical | v2-05 | none | Correction history. |
| `DESIGN.md#the-wrong-triangle-and-a-second-one-underneath-it` | The wrong triangle, and a second one underneath it | decision | historical | v2-05 | none | Correction history. |
| `DESIGN.md#four-things-a-fighter-was-given-to-do-about-weight-of-which-two-survived` | Four things a fighter was given to do about weight, of which two survived | decision | historical | v2-05 | none | Rejected and retained mechanics. |
| `DESIGN.md#a-fifth-change-nobody-asked-for-which-the-barge-exposed` | A fifth change nobody asked for, which the barge exposed | evidence | historical | v2-05 | none | Emergent measurement. |
| `DESIGN.md#what-it-came-to` | What it came to | evidence | current | v2-05 | none | Current measured conclusion. |
| `DESIGN.md#the-ladder-is-an-anti-objective-and-fitness-cannot-hold-both-ends` | The ladder is an anti-objective, and fitness cannot hold both ends | evidence | current | v2-05 | none | Current policy-training limitation. |
| [`DESIGN.md#replays`](../DESIGN.md#replays) | Replays | reference | current | v2-05 | none | Stable compatibility entry. ADR 0002 preserves the former two-hand, 36-byte claim and command reference records today's one-limb `LimbCommand`; v2-10 adds versioned codec and hash domains. |
| [`DESIGN.md#deliberate-non-choices`](../DESIGN.md#deliberate-non-choices) | Deliberate non-choices | decision | current | v2-05 | none | Current rejected architecture choices. |
| [`DESIGN.md#the-floor-plan`](../DESIGN.md#the-floor-plan) | The floor plan | design | current | v2-05 | none | Navigation/world rationale index. |
| `DESIGN.md#three-wide-corridors` | Three-wide corridors | design | current | v2-05 | none | Current generation rule. |
| `DESIGN.md#collision` | Collision | design | current | v2-05 | none | Current planar collision rationale. |
| `DESIGN.md#routing-and-why-the-objective-is-an-input` | Routing, and why the objective is an input | architecture | current | v2-04 | none | Authority/data-flow boundary. |
| `DESIGN.md#sight` | Sight | design | current | v2-05 | none | Current visibility rationale. |
| `DESIGN.md#the-order-channel` | The order channel | architecture | current | v2-04 | none | Input ownership and flow. |
| `DESIGN.md#naming-the-quarry` | Naming the quarry | design | current | v2-05 | none | Current focus-order rationale. |
| `DESIGN.md#what-the-sim-does-not-know` | What the sim does not know | architecture | current | v2-04 | none | Progression authority boundary. |
| `DESIGN.md#the-route` | The route | architecture | current | v2-04 | none | Browser-owned queue boundary. It also copies the exact historical `ROOM_HASH` value `0xadae95f2b6b46499`; v2-05 moves that literal into hash reference/evidence while retaining the boundary in architecture. |
| [`DESIGN.md#performance-notes`](../DESIGN.md#performance-notes) | Performance notes | evidence | current | v2-05 | none | Stable compatibility entry. Dated evidence owns measurements and method, and ADR 0003 owns the durable renderer decision; plans describe only forward work. |
| `DESIGN.md#what-the-isometric-conversion-cost` | What the isometric conversion cost | evidence | historical | v2-05 | none | Canvas conversion measurements and correction record. |
| [`DESIGN.md#art-direction`](../DESIGN.md#art-direction) | Art direction | design | current | v2-05 | none | Current presentation rationale. |
| [`DESIGN.md#rules-that-exist-for-termination-not-for-flavour`](../DESIGN.md#rules-that-exist-for-termination-not-for-flavour) | Rules that exist for termination, not for flavour | design | current | v2-05 | none | Termination rationale. |
| [`DESIGN.md#open-questions`](../DESIGN.md#open-questions) | Open questions | temporary plan | current | v2-05 | none | Proposed work must move to plans or become a decision. |

## README.md

| Current source anchor | Heading | Destination | Status | Move phase | Inbound links | Audit note |
|---|---|---|---|---|---|---|
| [`README.md#auto-rpg`](../README.md#auto-rpg) | auto-rpg | orientation | current | keep root | none | Product entry. |
| [`README.md#status`](../README.md#status) | Status | orientation | current | v2-05 | `docs/README.md` | Current product tour. v2-05 removed the unpinned literal state hash `0x00b48ceb21081d1d`; [Hashes](reference/hashes.md#golden-registry) preserves it as historical provenance rather than a current fixture. |
| [`README.md#layout`](../README.md#layout) | Layout | orientation | current | v2-04 | none | Compact player-facing repository orientation; AGENTS remains the contributor map and the documentation map routes durable authority. |
| [`README.md#getting-started`](../README.md#getting-started) | Getting started | orientation | current | v2-06 | `docs/README.md` | The ten-minute play path remains. Contributor commands route to AGENTS and dated benchmark results route to performance evidence. |
| [`README.md#the-three-decisions-everything-else-follows-from`](../README.md#the-three-decisions-everything-else-follows-from) | The three decisions everything else follows from | orientation | current | v2-06 | none | Product context only; current boundaries and replay rationale are links to architecture, reference, and ADR authority. |
| [`README.md#the-agent-boundary`](../README.md#the-agent-boundary) | The agent boundary | orientation | current | v2-06 | none | Product-level `Observation` to `Command` summary linking current architecture and exact command reference. |
| [`README.md#stats-drive-the-ai-not-the-network`](../README.md#stats-drive-the-ai-not-the-network) | Stats drive the AI, not the network | orientation | current | v2-05 | none | Product explanation only; exact fields and mechanics rationale link to command and design authorities. |
| [`README.md#where-this-goes-next`](../README.md#where-this-goes-next) | Where this goes next | temporary plan | current | v2-05 | none | Migrated to a direct v2 plan link that explicitly distinguishes temporary roadmap work from shipped behavior. |

## AGENTS.md

| Current source anchor | Heading | Destination | Status | Move phase | Inbound links | Audit note |
|---|---|---|---|---|---|---|
| [`AGENTS.md#agentsmd`](../AGENTS.md#agentsmd) | AGENTS.md | orientation | current | keep root | none | Contributor entry. |
| [`AGENTS.md#layout`](../AGENTS.md#layout) | Layout | architecture | current | v2-04 | none | Contributor navigation; README retains a shorter player-facing orientation while the documentation map routes durable authority. |
| [`AGENTS.md#commands`](../AGENTS.md#commands) | Commands | reference | current | keep root | `README.md`, `docs/README.md` | Operational command gate belongs in AGENTS; exact contracts link to reference. |
| [`AGENTS.md#the-one-rule-everything-else-serves`](../AGENTS.md#the-one-rule-everything-else-serves) | The one rule everything else serves | reference | current | v2-06 | none | Contributor guardrail links the canonical determinism contract and replay decision instead of repeating their normative detail. |
| [`AGENTS.md#golden-hashes-decide-before-you-edit-not-after`](../AGENTS.md#golden-hashes-decide-before-you-edit-not-after) | Golden hashes: decide before you edit, not after | reference | current | v2-05 | none | Operational change gate links the canonical registry for exact hash names, pin locations, and re-record paths; the ROOM_HASH trap remains local. |
| [`AGENTS.md#the-trap-that-keeps-catching-plans`](../AGENTS.md#the-trap-that-keeps-catching-plans) | The trap that keeps catching plans | evidence | current | keep root | none | Contributor trap supported by regression history. |
| [`AGENTS.md#the-frame-abi-is-a-handshake-across-five-files`](../AGENTS.md#the-frame-abi-is-a-handshake-across-five-files) | The frame ABI is a handshake across five files | reference | current | v2-05 | none | Required workflow remains here and links reference for exact layout, versions, identity, and append-only rules; v2-16 left the legacy frame ABI untouched and gave the pose/event streams their own reference authority beside it. v2-ui-06 corrected "four" to "six", because the count predated the v2 client split; retiring the Canvas page removed `web/main.js` and its hand-written parser from the handshake and made it five. Count from `frame-abi.md`, which owns the obligations, rather than from the heading — it has now been wrong twice. |
| [`AGENTS.md#house-style`](../AGENTS.md#house-style) | House style | reference | current | keep root | none | Contributor-only convention. |
| [`AGENTS.md#plans`](../AGENTS.md#plans) | Plans | reference | current | keep root | none | Contributor workflow for temporary plans. |
| [`AGENTS.md#gotchas-that-have-already-cost-time`](../AGENTS.md#gotchas-that-have-already-cost-time) | Gotchas that have already cost time | evidence | current | keep root | none | Operational measurement traps; link to dated performance evidence after split. |
| [`AGENTS.md#before-you-call-it-done`](../AGENTS.md#before-you-call-it-done) | Before you call it done | reference | current | keep root | `docs/README.md` | Contributor completion gate. |

## Cross-cutting findings and resolutions

- [Determinism reference](reference/determinism.md#contract) is the canonical
  contract. The DESIGN compatibility entry, README product context, and AGENTS
  contributor guardrail now link it instead of carrying normative copies.
- The former `DESIGN.md#replays` text described a two-hand, 36-byte `Command` and
  hashing strikes on both hands. [Commands](reference/commands.md) now records the
  current single-`LimbCommand` shape while [ADR 0002](decisions/0002-record-commands-in-replays.md)
  preserves the useful history; v2-10 still owns explicit codec and hash domains.
- `Scenario::fingerprint` currently covers a unit's kind, faction, stats, and spawn
  but omits its loadout. That gap contradicts the complete-scenario premise and is
  explicitly assigned to v2-10 rather than silently classified as current.
- The former performance section's temporary-plan authority is resolved by
  [ADR 0003](decisions/0003-renderer-outside-sim.md) and the dated
  [performance evidence](performance/README.md); the v2 plan now describes only
  forward work.
- v2-05 extracted feature layouts, frame ABI details, golden ownership, and former
  literal hash provenance into `docs/reference/`. v2-06 reduced the remaining root
  copies to contextual orientation or operational traps. v2-10, v2-11, and v2-16
  update those references when their respective contracts change.
