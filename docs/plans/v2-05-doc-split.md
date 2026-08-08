# v2-05 — split design, decisions, reference, and evidence

**Status:** complete. The root design monolith is now a short compatibility index;
current contracts, rationale, decisions, and dated evidence have durable owners, and
the instructive superseded measurements and corrections remain recorded. No legacy
hash moved.

**Goal:** move the `DESIGN.md` monolith into concept-owned documents without losing
history or breaking stable entry points.

**Depends on:** `v2-04`.

**Golden expectation:** no hash moves; documentation only.

## Mechanical moves first

Following `docs/documentation-inventory.md` exactly, move cohesive sections with
minimal wording changes into:

```text
docs/design/combat.md
docs/design/navigation-visibility.md
docs/design/presentation.md
docs/design/progression.md
docs/decisions/0001-deterministic-fixed-point.md
docs/decisions/0002-record-commands-in-replays.md
docs/decisions/0003-renderer-outside-sim.md
docs/reference/determinism.md
docs/reference/commands.md
docs/reference/hashes.md
docs/reference/frame-abi.md
docs/performance/README.md
```

Add further numbered ADR/evidence files only where the inventory already identifies
a cohesive decision or dated measurement. `DESIGN.md` becomes a short principles
index with compatibility anchors for its former top-level destinations.

## Simplification pass

After link-preserving moves are green, reconcile each destination against the code
sources named in `v2-04`. Preserve instructive superseded findings with ADR status or
dated evidence; do not silently erase them. Replace copied normative layouts and
hash values with links to `docs/reference/`. Temporary `docs/plans/*` files may be
linked as pending work but cannot be the sole source for a shipped claim.

## Verification

Tests in `tools/check_docs.test.js`:

```text
all_moved_design_anchors_have_a_valid_destination
every_design_reference_and_decision_document_has_the_standard_header
no_durable_document_depends_only_on_a_temporary_plan
the_root_design_entry_point_keeps_compatibility_links
historical_measurements_name_date_hardware_and_method
```

```powershell
node --test tools/check_docs.test.js
node tools/check_docs.js
rg -n "docs/plans/" README.md AGENTS.md DESIGN.md docs -g "*.md"
git diff --check
```

Acceptance requires every inventory row to be moved, intentionally retained, or
explicitly scheduled for `v2-06`; nothing is parked in a replacement monolith.
