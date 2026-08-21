# Session 01 -- archive phase 01 and establish the lifecycle

**Status:** completed 2026-08-21.

## Outcome

Replace 73 individual records and 74 individual progress frames with one compact
phase archive while preserving the accepted checkpoint and the evidence needed
to understand every decision. Remove ignored render snapshots and transient
build outputs from the completed run. Document and test how later phases perform
the same transition.

## Implementation

- Add `scripts/archive-similarity-phase.mjs` to validate a completely closed
  phase, write a full concatenated ledger and manifest, and refuse a proposed or
  inconsistent checkpoint.
- Extend `scripts/experiment-state.mjs` so the audit begins active-record
  continuity after the last archived experiment while seeding source/distance
  continuity from the archived accepted checkpoint.
- Archive phase 01 under `experiments/archive/phase-01/` with:
  - `README.md` -- scope, checkpoint, and links;
  - `ledger.md` -- the complete text of records 0001--0073;
  - `manifest.json` -- status, distances, deltas, component/view deltas, and
    evidence hashes for every experiment;
  - `front-contact-sheet.png` -- labelled front renders for the complete run.
- Delete the superseded top-level `experiments/NNNN-*.md` files, individual
  progress PNGs, `.review/`, and disposable build output. Retain `.metric-cache`,
  `metric/.venv`, and `node_modules`; they are reusable tools, not phase evidence.
- Start an empty active phase whose next experiment is 0074, without creating a
  proposed record.

## Tests and verification

- Add a fixture proving archive refusal with a proposed record.
- Add a fixture proving a closed phase compacts, audits without its individual
  evidence tree, and permits the next sequential snapshot.
- Run:

```powershell
npm test
npm run similarity:experiment:audit
npm run asset:validate
```

The repository must contain no phase-01 per-experiment markdown or progress PNG
outside the compact archive.

## Completion record

Phase 01 was compacted to four files: a `353.5 KiB` complete ledger, a
`108.9 KiB` result/hash manifest, a `532.8 KiB` labelled contact sheet, and a
short archive README. Seventy-three top-level records, 74 individual progress
PNGs, and the 4,293-file/~962 MB `.review` tree were removed. The accepted
source/report checkpoint remains exact and the next legal experiment is 0074.

The reusable model cache, pinned Python environment, and `node_modules` remain
because sessions 02--04 need them. Disposable build output was removed; a tiny
`.wrangler` SQLite cache remained locked by the build worker and is ignored.
