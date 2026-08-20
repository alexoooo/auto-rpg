//! Which way the arrow points, checked against Cargo's resolved graph rather
//! than against a sentence in a document.
//!
//! `crates/learn-core` is allowed to use floating point on one condition: that
//! nothing it computes reaches authoritative state. Half of that is a type
//! fence -- [`learn_core::LearnedActionV1`] is not
//! [`sim::CommandV1`] and `World::submit` cannot be
//! handed one -- and the crate root's doctest pair is what says it. The other
//! half is structural and is what this file says: **`sim` cannot see this
//! crate**, so there is no path by which a weight could reach the world other
//! than the one the type fence guards.
//!
//! Checked by asking **Cargo** for the graph, because that is the graph Cargo
//! actually builds from. A `use` scan would miss a dependency declared and not
//! yet used, which is precisely the state a crate is in the moment somebody adds
//! it "just to try something".
//!
//! **This walk used to read the manifests as text, and a review broke it three
//! ways in an afternoon.** It matched byte-exact on ` = "../`, so
//! `learn = {path="../learn"}` without the spaces, `path = "../learn/"` with a
//! trailing slash, and `learn.workspace = true` against a root
//! `[workspace.dependencies]` each declared an edge Cargo resolved and this file
//! did not see. None of the three is exotic; two of them are what an editor's
//! formatter or `cargo add` produces. The lesson is not "match more spellings" --
//! it is that a hand-rolled parser of somebody else's format is a second answer
//! to a question its owner will answer for free.
//!
//! `cargo tree` and not `cargo metadata`, because metadata is JSON and this
//! crate has no JSON parser and may not acquire one -- `tools/check_deps.js`
//! exists to refuse exactly that dependency. `cargo tree --prefix depth` prints
//! one resolved package per line, computes the transitive closure itself, and is
//! reached through the `CARGO` the test harness sets rather than through `PATH`.
//! `--edges normal,build,dev` keeps the dev and build edges the text walk also
//! caught, and `--target all` keeps the `[target.'cfg(...)']` ones, which a
//! host-filtered tree would drop.

#![forbid(unsafe_code)]

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::Command;

/// The workspace manifest, from this crate's own manifest directory.
fn workspace_manifest() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("crates/learn-core sits two directories inside the workspace")
        .join("Cargo.toml")
}

/// Every package reachable from `root`, `root` included, **as Cargo resolves it**.
fn reachable(root: &str) -> BTreeSet<String> {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_string());
    let output = Command::new(&cargo)
        .arg("tree")
        .arg("--manifest-path")
        .arg(workspace_manifest())
        .args(["--package", root])
        .args(["--edges", "normal,build,dev"])
        .args(["--target", "all"])
        .args(["--prefix", "depth"])
        .output()
        .unwrap_or_else(|e| panic!("{cargo} tree --package {root}: {e}"));
    assert!(
        output.status.success(),
        "{cargo} tree --package {root} failed: {}",
        String::from_utf8_lossy(&output.stderr),
    );
    let tree = String::from_utf8(output.stdout).expect("cargo tree prints UTF-8");

    // `<depth><name> v<version> (<path>)`, with `(*)` on a subtree already
    // printed -- which hides the subtree and never the name on the line, so the
    // set is complete without `--no-dedupe`.
    let mut found = BTreeSet::new();
    for line in tree.lines().filter(|line| !line.trim().is_empty()) {
        let rest = line.trim_start_matches(|c: char| c.is_ascii_digit());
        let name = rest.split_whitespace().next().unwrap_or_default();
        assert!(!name.is_empty(), "cargo tree printed a line with no package: {line:?}");
        found.insert(name.to_string());
    }

    // The root at depth zero on the first line is what says the walk happened.
    // Without it an empty answer -- a renamed flag, a cargo that failed quietly,
    // an output format that moved -- would read as "depends on nothing" and pass
    // every assertion below, which is the failure mode the text parser had.
    assert!(
        tree.lines()
            .next()
            .is_some_and(|line| line.starts_with(&format!("0{root} "))),
        "cargo tree --package {root} did not print {root} at depth zero:\n{tree}",
    );
    found
}

#[test]
fn the_learned_policy_is_unreachable_from_sim() {
    // The direction of this arrow is the whole architecture. `learn-core` may
    // depend on `fx`, `sim` and `policy`; none of the three may depend on it,
    // and neither may `fx` or `sim` depend on `policy`. A cycle here would mean
    // a float could reach authoritative state by a route the type fence never
    // sees, and it would compile.
    for host in ["fx", "sim", "policy"] {
        let graph = reachable(host);
        for forbidden in ["learn-core", "learn", "lab", "web"] {
            assert!(
                !graph.contains(forbidden),
                "{host} reaches {forbidden}: {graph:?}",
            );
        }
    }

    // `fx` depends on nothing and `sim` on `fx` alone, which `AGENTS.md` states
    // as the layout rule. Asserted here as well because it is what makes the
    // three walks above complete rather than merely true: a walk that found no
    // dependencies at all would also pass every assertion in this test.
    assert_eq!(reachable("fx"), BTreeSet::from(["fx".to_string()]));
    assert_eq!(
        reachable("sim"),
        BTreeSet::from(["fx".to_string(), "sim".to_string()]),
    );
    assert_eq!(
        reachable("policy"),
        BTreeSet::from(["fx".to_string(), "policy".to_string(), "sim".to_string()]),
    );

    // And the arrow the other way, which is the thing v2-ui-08 added: `web`
    // reaches `learn-core` and must never reach `learn`, because the trainer
    // uses `std::thread::scope` and a wall clock and belongs in no `cdylib`.
    let browser = reachable("web");
    assert!(browser.contains("learn-core"), "web cannot see the frozen network");
    assert!(!browser.contains("learn"), "web reaches the trainer: {browser:?}");
}
