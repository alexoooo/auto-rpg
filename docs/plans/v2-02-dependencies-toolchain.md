# v2-02 — enforce dependency and tool ownership

**Goal:** correct the repository-wide dependency claim, make the allowed boundary
machine-checkable, and pin every tool needed before the visual track begins.

**Depends on:** `v2-01`.

**Golden expectation:** every legacy hash remains byte-identical.

## Policy edits

At `AGENTS.md` under “The one rule everything else serves,” `README.md` under
“The three decisions everything else follows from,” and the determinism authority
identified by `v2-03`, state one rule and link to its canonical reference:

- `fx`, `sim`, and deterministic `policy` code accept only local deterministic
  crates and `std`;
- host, presentation, offline asset, and explicitly nondeterministic learning code
  may use audited exact dependencies;
- no host or learning type enters `Scenario`, `World`, submitted commands, replay,
  or either hash domain;
- lockfiles, lifecycle scripts, registries, git sources, build dependencies, and
  asset tools are reviewed inputs.

Do not split `world.rs` or `crates/web/src/lib.rs` in this phase.

## Exact tools

Add `.node-version`, `.npmrc`, and `tools/toolchain.json`. Pin:

```json
{
  "node": "22.12.0",
  "npm": "10.9.0",
  "typescript": "6.0.3",
  "vite": "8.1.5",
  "babylon": "9.18.1",
  "blender": "4.5.12",
  "gltfValidator": "2.0.0-dev.3.10"
}
```

Node 22.12.0 satisfies Vite 8's 22.12+ engine floor and ships npm 10.9.0.
Record download/binary SHA-256 values for Blender in `tools/toolchain.json`; fail
when `blender --version` differs. KTX2/Basis is deliberately absent because texture
conversion is deferred. Add it with an exact encoder version and flags before the
first KTX2 artifact is committed.

## Checker

Add `tools/check_deps.js` and `tools/check_toolchain.js`. At the `Cargo.toml`
`[workspace]` anchor, make `node tools/check_deps.js` inspect `cargo metadata
--format-version 1` plus every workspace manifest. It fails closed on:

```text
registry or git normal/build/dev dependency reachable from fx, sim, or policy
unrecognized Cargo source or workspace inheritance
non-exact top-level npm version
manifest/lock mismatch or non-registry resolved source
missing/integrity-less lock entry
package lifecycle script outside an explicit allowlist
tool or asset manifest not covered by tools/toolchain.json
```

The allowlist begins empty. The checker may permit Babylon/Vite transitive packages
only from the configured npm registry with lockfile integrity; it does not pretend
transitives are dependency-free.

## Tests and verification

Node tests in `tools/check_deps.test.js` use temporary fixture manifests:

```text
deterministic_crates_reject_normal_build_and_dev_registry_dependencies
deterministic_policy_rejects_a_git_dependency
workspace_inheritance_cannot_hide_a_source
npm_manifest_and_lock_must_agree
npm_lifecycle_scripts_fail_closed
unknown_tool_manifests_fail_closed
the_pinned_toolchain_matches_the_running_tools
```

```powershell
node --test tools/check_deps.test.js
node tools/check_deps.js
node tools/check_toolchain.js
cargo test
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```

Acceptance requires useful diagnostics naming the dependency path or manifest form.
No source move, package installation, or behavior change belongs in this session.
