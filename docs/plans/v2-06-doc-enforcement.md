# v2-06 — enforce one canonical home per contract

**Goal:** finish documentation deduplication and make drift/link retirement part of
the repository gate before new boundaries arrive.

**Depends on:** `v2-05`.

**Golden expectation:** no hash moves; documentation and checks only.

## Authority pass

At the exact rows marked duplicate/stale in `docs/documentation-inventory.md`:

- keep product orientation and the ten-minute run path in `README.md`;
- keep contributor commands, gates, and traps in `AGENTS.md`;
- keep rationale in `docs/design/` and decision history in ADRs;
- keep current component/data flow in `docs/architecture/`;
- keep exact layouts, discriminants, hash domains, and constants in
  `docs/reference/`;
- keep measurements and method in `docs/performance/`.

Replace duplicate normative prose with a short contextual link. Reconcile the stale
two-hand command claim with `crates/sim/src/command.rs` and the scenario fingerprint
gap with `crates/sim/src/scenario.rs`; future behavior remains explicitly proposed.

## Enforcement

Complete `tools/check_docs.js` so `node tools/check_docs.js` validates internal files,
Markdown anchors, retired/missing plan references, standard headers, and duplicate
reference-contract markers. Add a `DOC_CONTRACT:` marker convention only in
`docs/reference/`; other documents link to the marker's anchor.

Update the “Before you call it done” checklist in `AGENTS.md` with documentation
impact beside hashes, ABI mirrors, and tests. Add `node tools/check_docs.js` to the
documented gate commands.

## Tests and gate

```text
internal_links_and_anchors_resolve
retired_plan_links_fail
reference_contract_markers_are_unique
normative_markers_live_only_in_reference_documents
the_completion_checklist_requires_documentation_impact
```

```powershell
node --test tools/check_docs.test.js
node tools/check_docs.js
node tools/check_deps.js
cargo test
node --test tools/wasm_check.js
git diff --check
```

Track 1 passes only after a fresh-reader audit finds all eight authorities listed in
`v2-04` and the baseline remains playable. Later sessions update canonical documents
in the same commit as their code; a compiler-green but documentation-stale phase is
not green.
