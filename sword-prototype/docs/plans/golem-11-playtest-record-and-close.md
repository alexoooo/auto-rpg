# Session 11 -- playtest, durable record and close

**Status (2026-09-04): planned.** Depends on 09 and 10. This is the session that deletes the plan
set, including itself.

## Outcome

An owner playtest across the accepted shelf with its verdicts written down, the golem design
recorded in the durable documents where the construct design used to be, the new traps recorded
in `AGENTS.md`, and `docs/plans/golem-*.md` deleted with the register regenerated.

## Implement

1. **Playtest protocol.** The owner plays, at minimum: every accepted effector option against
   the Warrior duelist; every accepted locomotion option against `golem-duelist`; one bout per
   torso and head option; two loot cycles. Each bout gets one line: build, opponent, verdict,
   and the answer to the three questions. Bouts are chosen by the owner, not by a script; the
   guided playtest that scheduled a person's sitting was deleted in Session 01 for a reason.
2. **`docs/design.md`.** New sections in the place the construct sections occupied: the body
   plan and its five slots; the module contract; the chain-and-terminal factoring of effectors,
   the chain ladder and why every rung stays; the anchor drive without redundancy; the locomotion contract over the carrier; the collision
   rule for a golem's own parts; the human-first gate and why the proxies came second; loot.
   Each section says what the thing *is*; the arguments that were settled on the bench go in
   with their date.
3. **`docs/measurements.md`.** One section per bench (effector, locomotion, torso and head),
   each naming its harness, then the golem rows in the policy table, then the dynamism floors,
   then the playtest lines from step 1 verbatim. Anything still owed is listed as owed.
4. **`README.md`.** The golem in the unit list, the five-slot picker, the parts bin, the bench
   page and its keys, and one paragraph on what changed and why, replacing the construct
   paragraphs Session 01 removed.
5. **`AGENTS.md`.** Every trap this plan set paid for: at least the two-commit register rule,
   whatever the bench taught about anchors on low-axis chains, whatever the plate terminal's
   layer choice cost, and any measurement exclusion window a golem stroke needed. Prune
   the command list to what exists.
6. **Delete this plan set.** All twelve `docs/plans/golem-*.md` files, then the second commit
   that regenerates `docs/deleted-paths.md`. Any Markdown link into the set from a durable
   document is removed first (the root docs checker walks this tree's links).

## Verification

```powershell
npm run check
npm test
npm run build
npm run measure
git diff --check -- .
cd .. ; node tools/check_docs.js ; cd sword-prototype
```

The last line of the landing note names the commit at which the plan set was deleted, so the
history is one `git log` away.
