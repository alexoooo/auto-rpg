//! The game. All of it.
//!
//! This crate has no engine, no renderer, no window, no threads, no clock, no
//! I/O and no floating point. It is a state machine you drive by hand:
//!
//! ```text
//!     loop {
//!         for id in world.pending_decisions() {   // who is due to think
//!             let obs = world.observe(id);        // what they can perceive
//!             world.submit(id, policy(obs));      // what they chose to do
//!         }
//!         world.step();                           // advance one tick
//!     }
//! ```
//!
//! Nothing about *how* decisions get made lives here. A hand-authored utility
//! AI, a neural policy, a recorded log, or a human clicking -- they all enter
//! through [`World::submit`] and the sim cannot tell them apart. That boundary
//! is the whole architecture: it is what lets the browser build and the
//! headless experiment lab share one implementation, and what lets a recorded
//! run be replayed exactly without re-running inference.
//!
//! # Determinism
//!
//! Given the same [`Scenario`], seed, and sequence of submitted actions, every
//! tick produces byte-identical state on every platform we target. That holds
//! because:
//!
//! * All arithmetic is fixed point ([`fx`]) -- no libm, no FMA, no vectorised
//!   reduction order to worry about.
//! * [`World`] holds **no RNG state at all**. Randomness (currently only
//!   perception noise) is drawn from `Rng::from_stream(seed, tick, entity)`, so
//!   a value depends on what is being decided, never on visitation order.
//! * Every loop runs in ascending entity index, and every tie breaks on index.
//! * Deaths are applied after all attacks resolve, so simultaneous kills are
//!   symmetric rather than first-come.
//!
//! [`World::state_hash`] fingerprints the whole thing; comparing that hash
//! across native and wasm builds is the regression test that keeps the
//! guarantee honest.

#![forbid(unsafe_code)]

/// Re-exported so downstream crates can talk about world values without
/// separately depending on the math crate.
pub use fx;

mod action;
mod entity;
mod event;
mod obs;
mod replay;
mod rules;
mod scenario;
mod world;

pub use action::{Action, Intent, Order};
pub use entity::{EntityId, Faction, UnitKind};
pub use event::Event;
pub use obs::{Contact, Observation, FEATURE_COUNT, FEATURE_LAYOUT_VERSION};
pub use replay::{ActionRecord, OrderRecord, Replay};
pub use rules::{Stats, DT, MAX_CONTACTS, TICKS_PER_SECOND};
pub use scenario::{Scenario, UnitSpec};
pub use world::{Outcome, Snapshot, UnitView, World};
