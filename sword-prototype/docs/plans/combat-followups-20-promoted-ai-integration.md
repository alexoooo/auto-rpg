# Session 20 -- integrate a passing controller

## Entry gate

Begin only when session 19 names a passing artifact. A null verdict blocks this session and
requires a new research plan.

## Implement

1. Copy the exact winning artifact into its committed runtime location and pin its SHA-256.
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
- Run npm test, npm run check, npm run build, npm run measure, npm run ai:options and
  npm run ai:evaluate -- --verify-promoted.

No passing candidate means none of this file is performed.
