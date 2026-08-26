# Session 24 -- integrate a passing controller

> **Corrections, 2026-08-26.**
>
> - **`npm run ai:evaluate -- --verify-promoted` does not exist.** `evaluate-ai.mjs` throws on
>   a missing `--manifest` before reading any other flag. No session owns building this; it
>   belongs to 23 or here.
> - **Step 3 silently depends on session 19 having built a page-side deployment path**, which
>   does not exist today -- `src/main.ts` has zero `artifact` references and all nine
>   `deployment.ts` importers are Node-side. Say so.

## Entry gate

Begin only when session 23 names a passing artifact. A null verdict blocks this session; see
**No passing candidate** below.

## Implement

1. Copy the exact winning artifact into its committed runtime location and pin its SHA-256,
   alongside the compute-contract and balance-config digests it ran under.
2. Register one policy named adaptive-v1; do not expose algorithm or seed variants.
3. Load through src/learning/deployment.ts. Runtime receives only published FighterView,
   the frozen recurrent/model state and capability masks.
4. Add setup compatibility for every supported unit/loadout and refuse unsupported exact
   cells by name. No fallback to Duelist, specialist coefficients or another body.
5. Surface artifact digest, algorithm, selected tactic and refusal reason in diagnostics.
6. Update README, design and measurements with the tournament evidence authorizing the
   picker entry.

## Verify

- Re-run the tournament report from raw rows and confirm the promoted digest.
- Add complete-bout, finite-command, post-verdict, restart/disposal and browser-load tests.
- Mutation-check digest bypass, capability fallback and post-verdict action.
- Run `npm test`, `npm run check`, `npm run build`, `npm run measure`,
  `npm run ai:preflight` and `npm run ai:evaluate -- --verify-promoted`.

## Playtest before you believe the verdict

Before writing the promotion into durable documentation, fight adaptive-v1 by hand across the
supported loadouts, exactly as session 21 required of every champion-so-far. A controller that
passes every gate and plays a fight nobody enjoys is a finding about the gates, and it must be
recorded as one in `docs/measurements.md` rather than shipped quietly because the numbers were
green. This does not block promotion; it is promoted on the tournament. It blocks the claim
that the gates now measure something worth having.

## No passing candidate

None of the implementation above is performed. Instead:

1. Fold every candidate's full gate table, signed margins and ledger summary into
   `docs/measurements.md` as a dated negative result. Four directions that stopped, with the
   place each one stopped, is a real finding about this interface.
2. Add the named diagnosis session chosen by session 23's decide branch. It is an interface,
   fitness or gate session, not a longer run.
3. Do not add a picker entry, do not lower a threshold, and do not promote the least-bad
   controller under a softer name.
