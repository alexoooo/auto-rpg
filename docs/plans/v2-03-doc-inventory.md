# v2-03 — inventory documentation authority

**Goal:** publish a navigable target map before moving prose, and identify every
duplicate, stale, or temporary-plan-backed authority.

**Depends on:** `v2-02`.

**Golden expectation:** no hash moves; documentation only.

## Inventory

Create `docs/README.md` and `docs/documentation-inventory.md`. Inventory every
heading in `DESIGN.md`, `README.md`, and `AGENTS.md` by exact heading anchor and
assign one destination:

```text
orientation  architecture  design  decision  reference  evidence  temporary plan
```

The inventory table contains current source anchor, canonical destination, status
(`current`, `historical`, `stale`, `duplicate`), move phase, and inbound links. It
must call out at least the stale two-hand `Command` claim, the temporary v2-plan
performance link, repeated determinism/replay text, and every exact layout/hash
copied into prose.

## Target map

`docs/README.md` defines role-based paths for player, contributor, mechanics author,
renderer author, and policy researcher, plus this hierarchy:

```text
DESIGN.md                       short principles/index and stable compatibility entry
docs/architecture/             current components, authority, and data flow
docs/design/                   rationale by gameplay/presentation concept
docs/decisions/                numbered ADRs with status and consequences
docs/reference/                exact versioned layouts, hashes, commands, constants
docs/performance/              dated methods, hardware, and measurements
docs/plans/                    temporary forward work only
```

No prose moves yet. Add the standard header template to `docs/README.md`:

```markdown
**Purpose:** ...
**Status:** current | proposed | historical
**Canonical source:** ...
**Update when:** ...
```

## Verification

Add `tools/check_docs.js` with inventory-only checks and Node tests named:

```text
every_root_heading_has_one_inventory_row
every_inventory_destination_uses_a_known_document_class
every_role_path_resolves_to_an_existing_anchor
stale_and_duplicate_claims_are_not_silently_current
```

```powershell
node --test tools/check_docs.test.js
node tools/check_docs.js --inventory
git diff --check
```

Acceptance is an exhaustive map, not rewritten design. Unresolved classifications are
written as explicit decisions with an owner phase; no “miscellaneous” destination is
allowed.
