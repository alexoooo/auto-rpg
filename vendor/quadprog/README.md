# Active-set quadratic kernel

`src/core/math/active-kernel.ts` adapts the Goldfarb–Idnani implementation from
[Alberto Santini's quadprog](https://github.com/albertosantini/quadprog), npm version 2.0.0.
The downloaded `quadprog-2.0.0.tgz` SHA256 is
`ea3db719a5658823c8d08a7599cc608b6eee2f8d793d48b719a8a74379ab37d6`.
The original MIT notice is preserved in [LICENSE](LICENSE).

The adapted files are `lib/qpgen2.js`, `dpofa.js`, `dposl.js`, `dpori.js` and `vsmall.js`.
The kernel preserves their operation order and one-indexed work layout. Type annotations and
array assertions make it checked TypeScript; helpers share one module. The owner supplies the
contact-column arrays, and a deterministic budget bounds the state-machine loops. Empty JSDoc,
coverage directives and commented-out Fortran calls are omitted. The wrapper is repository code.

The arithmetic audit finds only IEEE operations, `Math.sqrt`, `Math.abs`, `Math.min` and
`Math.max`. There is no environment state, random source, wall clock, transcendental function,
external dependency or persistent solver memory in the kernel. Its floating-point zero threshold
is calculated by the original finite doubling procedure. The cold-start owner stores candidates
in explicit state and checks residuals against caller-supplied tolerances.

This is optional control machinery. It does not change the physical body's action contract.
See [the validation record](../../docs/reference/active-quadratic.md).
