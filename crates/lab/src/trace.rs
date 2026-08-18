//! One fight, written down so somebody can look at it.
//!
//! **This is a diagnostic artifact and it is deliberately not the worker
//! protocol.** v2-17 closed with the mechanical gate failing by roughly a factor
//! of fifty and with three successive diagnoses refuted by later measurement,
//! and the closure's first instruction to a successor is to go and watch a fight
//! before calibrating anything else. Building checkpoint C's ABI to do that
//! would pin a published pose row against a physics nobody has looked at yet.
//! So the trace leaves this crate as JSON, is read by a page that talks to no
//! worker and instantiates no wasm, and can be deleted in the commit that lands
//! the real path.
//!
//! **Every number in the file is a raw fixed-point integer.** `Fx` is 16.16, a
//! JavaScript double holds an `i32` exactly and dividing one by 65536 is exact,
//! so a reader recovers the simulation's number rather than a rounding of it.
//! The other half of the reason is that this crate prints no floating point
//! anywhere, and a viewer is not the place to start.
//!
//! Nothing here computes geometry. The regional capsules come from
//! [`sim::body_region_volumes`], which is the same function the contact phase
//! sweeps, precisely so that the picture cannot disagree with the physics about
//! where an arm is. A viewer that rebuilt a shoulder from an anatomy row would
//! be a second answer to that question, and the one thing this detour exists to
//! avoid is being confidently shown the wrong thing.

use fx::Vec3;
use sim::{
    AnatomyRegion, BodyAnatomySpec, EquipmentGeometry, Faction, Outcome, Scenario, World,
    CONTACT_ENERGY_FLOOR, IMPACT_THRESHOLD,
};
use std::fmt::Write as _;

/// The reader's contract.
///
/// Bumped when a field changes meaning, never when one is added: the page
/// refuses a file whose schema it does not know, which is the difference between
/// "the viewer is out of date" and "the viewer is drawing the wrong thing".
///
/// **Moved from 5 by the forearm collider, and it is a meaning change rather
/// than an addition.** `pose.regions` went from five rows to seven, and until it
/// did, row `i` was named by `regionNames[i]`. It no longer is: the array is the
/// swept-volume list and the name table is anatomy, which agree on their first
/// five entries and nowhere after. A schema-5 file read by this page would draw
/// two arms as one capsule each and would fail
/// `a_live_fight_matches_the_traced_fight` deep inside a pose diff -- which is
/// the confusing half of the failure the guard exists to make plain.
pub const TRACE_SCHEMA: &str = "arpg-fight-trace-6";

/// Raw units in one world unit, carried in the file rather than assumed by the
/// reader. `Fx::ONE.raw()` is not public API to a page.
const ONE_RAW: i32 = 1 << 16;

/// What the header says about the run, gathered where the run was driven.
///
/// A struct rather than seven parameters because six of the seven are already
/// columns of the trial the gate produced, and a positional argument list of
/// `(seed, script, mirrored, timed_out, ...)` is two `bool`s away from being
/// silently transposable.
pub struct TraceRun<'a> {
    pub scenario: &'a Scenario,
    pub seed: u64,
    /// What drove the Fighter, and what drove the Brute.
    ///
    /// **Two fields where schema 2 had one `script`, and the reason is v2-19.**
    /// Until a learned policy existed, every trace put the same script on both
    /// sides and one token said everything; a learned fight is a fight with a
    /// different policy on each side, and a viewer showing "learned" over a run
    /// whose opponent was the windmill rather than the composed script would be
    /// showing something plausible that is not what happened -- which is the one
    /// failure this whole detour exists to avoid.
    pub heroes: &'a str,
    pub monsters: &'a str,
    /// The SHA-256 of the checkpoint that produced the learned side, or `None`.
    ///
    /// The name of the weights and not the weights: a trace is a recording of a
    /// fight, and a reader that wanted to re-run it needs the checkpoint file,
    /// which this identifies and does not contain.
    pub checkpoint: Option<&'a str>,
    pub mirrored: bool,
    pub outcome: Outcome,
    pub timed_out: bool,
    pub ticks: u32,
}

/// Frames accumulated as they happen, serialised on arrival.
///
/// Held as text rather than as a `Vec` of rows because there is no consumer for
/// a row in this process: the whole artifact is written once and read by a
/// browser. A 3600-tick fight is about six megabytes of it, which is a file, not
/// a data structure.
pub struct FightTrace {
    /// Anatomy per unit, in `Scenario::units` order. Resolved once at
    /// construction so a per-tick binary search does not sit inside the loop
    /// that the gate's own measurement shares.
    anatomy: Vec<BodyAnatomySpec>,
    /// `(kind, faction)` per unit, so the slot assumption below is checked
    /// rather than believed.
    identity: Vec<(sim::Body, sim::Faction)>,
    frames: String,
    recorded: u32,
    limit: u32,
}

impl FightTrace {
    /// `limit` bounds the **recording**, not the fight.
    ///
    /// The run always goes to its natural stop, because the trial this recorder
    /// hangs off is the one the gate reports and truncating the world would make
    /// the two disagree. A truncated file says so in its header, so a viewer
    /// showing 600 of 3600 ticks can never be mistaken for a fight that ended.
    pub fn new(scenario: &Scenario, limit: u32) -> FightTrace {
        let table = scenario.combat_specs.as_ref()
            .expect("an articulated scenario carries a combat spec table");
        let anatomy = scenario.units.iter().map(|unit| {
            let row = unit.articulated.expect("an articulated unit carries a spec row");
            table.anatomy(row.anatomy).expect("a validated anatomy reference").clone()
        }).collect();
        let identity = scenario.units.iter().map(|unit| (unit.kind, unit.faction)).collect();
        FightTrace { anatomy, identity, frames: String::new(), recorded: 0, limit }
    }

    /// One frame: every published pose, every resolution row the tick produced,
    /// and the two health fractions the outcome is decided on.
    ///
    /// Called once before the first step and once after every step, so frame `t`
    /// is the world as tick `t` left it and frame 0 is the fixture as it spawned.
    pub fn record(&mut self, world: &World) {
        if self.recorded >= self.limit {
            return;
        }
        if self.recorded > 0 {
            self.frames.push(',');
        }
        self.recorded += 1;

        let out = &mut self.frames;
        // `fmt::Write` on a `String` cannot fail; there is nothing for the
        // `Result` to say. Discarded once per call site rather than unwrapped,
        // because a panic path here would be unreachable code in a diagnostic.
        let _ = write!(out, "{{\"t\":{},\"poses\":[", world.tick());

        for (n, pose) in world.articulated_poses().enumerate() {
            if n > 0 {
                out.push(',');
            }
            // A world slot indexes the unit that spawned into it, which is true
            // because `World::try_new` spawns `scenario.units` in order and this
            // fixture never respawns -- and is an assumption about spawn order
            // rather than a documented contract, so it is checked. A trace that
            // hung the Brute's anatomy off the Fighter would draw two bodies
            // that were both plausible and both wrong.
            let slot = pose.id.index as usize;
            let anatomy = self.anatomy.get(slot)
                .expect("a pose slot indexes the unit that spawned into it");
            if let (Some(&(kind, faction)), Some(view)) =
                (self.identity.get(slot), world.view(pose.id))
            {
                assert!(view.kind == kind && view.faction == faction,
                    "slot {slot} holds a {:?} of {:?}, not the {kind:?} of {faction:?} that \
                     scenario.units[{slot}] describes", view.kind, view.faction);
            }
            // Presence per region, from the one authority on it. A severed arm
            // has no capsule to draw and is not a zero-radius point.
            let present: [bool; AnatomyRegion::COUNT] =
                std::array::from_fn(|part| pose.severed_mask & (1 << part) == 0);
            // The published hands are world space and `body_region_volumes`
            // takes them body-relative -- it adds the origin itself, which is
            // the single conversion the whole contact module is arranged around.
            let hands = [pose.arms[0].hand - pose.body, pose.arms[1].hand - pose.body];
            // The **swept volumes**, all seven of them, through the same
            // constructor `crates/web` publishes with. A jointed arm is two
            // capsules, and `a_live_fight_matches_the_traced_fight` compares
            // this array against the live one field for field -- so a trace that
            // wrote the five anatomy regions here would fail that comparison
            // rather than merely draw a shorter arm. The elbows are `None` on
            // every articulated body, which is why no recorded fixture's rows 5
            // and 6 are anything but absent.
            let elbows = [pose.arms[0].elbow.map(|joint| joint - pose.body),
                          pose.arms[1].elbow.map(|joint| joint - pose.body)];
            let regions = sim::jointed_body_region_volumes(
                pose.body, anatomy, pose.body_yaw, hands, present, elbows,
            );

            let _ = write!(out, "{{\"id\":");
            entity(out, pose.id);
            let _ = write!(out, ",\"body\":");
            vec3(out, pose.body);
            let _ = write!(out, ",\"yaw\":{},\"vel\":", pose.body_yaw.raw());
            vec3(out, pose.body_velocity);

            out.push_str(",\"arms\":[");
            for (limb, arm) in pose.arms.iter().enumerate() {
                if limb > 0 {
                    out.push(',');
                }
                out.push_str("{\"hand\":");
                vec3(out, arm.hand);
                out.push_str(",\"vel\":");
                vec3(out, arm.velocity);
                out.push_str(",\"target\":");
                vec3(out, arm.target_hand);
                let _ = write!(out, ",\"fatigue\":{}}}", arm.fatigue.raw());
            }

            out.push_str("],\"weapons\":[");
            for (limb, weapon) in pose.weapons.iter().enumerate() {
                if limb > 0 {
                    out.push(',');
                }
                match weapon {
                    None => out.push_str("null"),
                    Some(segment) => {
                        out.push_str("{\"hilt\":");
                        vec3(out, segment.hilt);
                        out.push_str(",\"tip\":");
                        vec3(out, segment.tip);
                        let _ = write!(out, ",\"radius\":{}}}", segment.radius.raw());
                    }
                }
            }

            out.push_str("],\"shield\":");
            match pose.shield {
                None => out.push_str("null"),
                Some(shield) => {
                    out.push_str("{\"centre\":");
                    vec3(out, shield.centre);
                    out.push_str(",\"normal\":");
                    vec3(out, shield.normal);
                    let _ = write!(out, ",\"halfWidth\":{},\"halfHeight\":{},\"thickness\":{}}}",
                        shield.half_width.raw(), shield.half_height.raw(), shield.thickness.raw());
                }
            }

            out.push_str(",\"regions\":[");
            for (at, region) in regions.iter().enumerate() {
                if at > 0 {
                    out.push(',');
                }
                out.push_str("{\"lower\":");
                vec3(out, region.lower);
                out.push_str(",\"upper\":");
                vec3(out, region.upper);
                let _ = write!(out, ",\"radius\":{},\"present\":{}}}",
                    region.radius.raw(), region.present);
            }

            out.push_str("],\"integrity\":");
            fractions(out, &pose.integrity_fraction);
            out.push_str(",\"wound\":");
            fractions(out, &pose.wound_fraction);
            let _ = write!(out, ",\"blood\":{},\"shock\":{},\"severed\":{},\"equipmentMask\":{}",
                pose.blood_fraction.raw(), pose.shock.raw(),
                pose.severed_mask, pose.equipment_mask);

            let (intent, target) = match pose.intent {
                sim::Intent::Hold => ("hold", None),
                sim::Intent::Flee => ("flee", None),
                sim::Intent::Attack(id) => ("attack", Some(id)),
            };
            let _ = write!(out, ",\"intent\":\"{intent}\",\"target\":");
            match target {
                None => out.push_str("null"),
                Some(id) => entity(out, id),
            }
            let _ = write!(out, ",\"hints\":[{},{}]}}",
                pose.hints[0] as u8, pose.hints[1] as u8);
        }

        out.push_str("],\"projectiles\":[");
        for (n, projectile) in world.articulated_projectiles().enumerate() {
            if n > 0 {
                out.push(',');
            }
            let _ = write!(out, "{{\"id\":[{},{}],\"owner\":",
                projectile.slot, projectile.generation);
            entity(out, projectile.owner);
            out.push_str(",\"position\":");
            vec3(out, projectile.position);
            out.push_str(",\"velocity\":");
            vec3(out, projectile.velocity);
            let _ = write!(out, ",\"radius\":{},\"remainingRange\":{}}}",
                projectile.radius.raw(), projectile.remaining_range.raw());
        }

        out.push_str("],\"contacts\":[");
        for (n, row) in world.contact_resolutions().iter().enumerate() {
            if n > 0 {
                out.push(',');
            }
            let key = row.fact.key;
            out.push_str("{\"a\":");
            entity(out, key.a);
            let _ = write!(out, ",\"aSlot\":{},\"b\":", key.a_slot);
            entity(out, key.b);
            let _ = write!(out, ",\"bSlot\":{},\"kind\":{},\"region\":{}",
                key.b_slot, key.kind as u8,
                // The **region**, mapped, and not the volume the fact carries.
                // `regionNames` below has five entries and `Trace.region` is
                // documented as an index into it, so a forearm is written as its
                // arm. Writing the raw volume would put a `5` in a column the
                // reader names from a five-element table.
                sim::volume_region(row.fact.volume as usize)
                    .map_or(sim::NO_VOLUME, |part| part as u8));
            out.push_str(",\"point\":");
            vec3(out, row.fact.point);
            out.push_str(",\"normal\":");
            vec3(out, row.fact.normal);
            out.push_str(",\"velocityA\":");
            vec3(out, row.fact.velocity_a);
            out.push_str(",\"velocityB\":");
            vec3(out, row.fact.velocity_b);
            out.push_str(",\"impulseA\":");
            vec3(out, row.impulse.on_a);
            out.push_str(",\"impulseB\":");
            vec3(out, row.impulse.on_b);
            // **The ledger is named `group` because it is one.**
            // `resolve_group_into` builds a single `EnergyLedger` per time-of-
            // impact group and copies it into every row of that group
            // (`resolution.rs:267` and `:282`), so five facts in one group carry
            // five copies of one number -- and that number is
            // `closure_energy` over every collider in the group, bodies' own
            // translational energy included. It is not what any one contact
            // brought and it is not what the floor is charged against. A reader
            // that plotted it against `CONTACT_ENERGY_FLOOR` would be comparing
            // a group's whole kinetic energy to a per-fact deduction, and on
            // this corpus that reads 578 contacts over the floor where the
            // honest count is 9.
            //
            // The per-fact quantity is `share`, the row's slice of
            // `dissipated`, and it is recoverable exactly:
            // `cut + thrust + pressure == share` for every weapon-body row. For
            // the other two kinds no channel exists and no floor is charged.
            //
            // **That invariant is why `crush_raw` is added in rather than
            // dropped, and this line published `pressure_raw` alone until it was
            // caught.** `channels()` splits a share four ways --
            // `(cut, thrust, crush, pressure)` -- while this row, like the
            // combat-event ABI beside it, carries three channel words. The
            // comment here described a three-way `channels()` that had already
            // become four, so the missing term read as an absent one. Publishing
            // only `pressure_raw` is invisible while `crush_raw` is zero, which
            // is every default-law fixture, and wrong the moment one is not: on
            // seed 3 of the shipped duel, frame 460's first contact splits 194
            // into crush 36 and pressure 157, and a reader checking the
            // invariant against the recorded columns finds 158. `crates/web/
            // src/lib.rs`'s `COMBAT_EVENT_PRESSURE` word already summed the two
            // for exactly this reason; the two sides of the trace contract now
            // agree, which is what `a_live_fight_matches_the_traced_fight`
            // compares field for field.
            let _ = write!(out,
                ",\"toi\":{},\"group\":{},\"alpha\":{},\
                 \"groupBefore\":{},\"groupAfter\":{},\"groupDissipated\":{},\
                 \"cut\":{},\"thrust\":{},\"pressure\":{},\"deflected\":{},\"severed\":{}}}",
                row.fact.toi.get().raw(), row.group_ordinal, row.group_alpha_raw,
                row.energy.before_raw, row.energy.after_raw, row.energy.dissipated_raw,
                row.cut_raw, row.thrust_raw, row.crush_raw + row.pressure_raw,
                row.deflected_raw, row.severed);
        }

        let _ = write!(out, "],\"health\":[{},{}]}}",
            world.health_fraction(Faction::Heroes).raw(),
            world.health_fraction(Faction::Monsters).raw());
    }

    /// The complete file. Consumes the recorder: there is exactly one artifact.
    pub fn finish(self, run: &TraceRun) -> String {
        let scenario = run.scenario;
        let arena = scenario.arena();
        let mut out = String::with_capacity(self.frames.len() + 4096);

        let _ = write!(out, "{{\"schema\":\"{TRACE_SCHEMA}\",\"one\":{ONE_RAW}");
        let _ = write!(out, ",\"scenario\":\"{}\",\"mirrored\":{}", scenario.name, run.mirrored);
        // **What was run, not whether it was the pin.** This field used to be
        // `null` for every mirrored run, on the argument that the only question a
        // reader asks of it is "am I looking at the pinned fixture" -- true while
        // the only two scenarios a trace could record were the fixture and its
        // reflection. A described duel killed that premise: a mirrored
        // `configured-duel-v1` is one of unboundedly many scenarios, its
        // fingerprint is the only thing that says *which*, and the file is the
        // artifact that outlives the terminal the number was printed in. So the
        // scenario's own number goes in, always, and a reader deciding whether
        // it holds the pin compares it against the pin -- which is the same test
        // it was already making, one comparison later. `mirrored` is a separate
        // field and still says a reflection happened.
        let _ = write!(out, ",\"fingerprint\":\"{:#018x}\"", scenario.fingerprint());
        let _ = write!(out, ",\"seed\":{},\"heroes\":\"{}\",\"monsters\":\"{}\"",
            run.seed, run.heroes, run.monsters);
        match run.checkpoint {
            None => out.push_str(",\"checkpoint\":null"),
            Some(digest) => {
                let _ = write!(out, ",\"checkpoint\":\"{digest}\"");
            }
        }
        let _ = write!(out, ",\"outcome\":\"{:?}\",\"timedOut\":{},\"ticks\":{}",
            run.outcome, run.timed_out, run.ticks);
        let _ = write!(out, ",\"maxTicks\":{},\"arena\":[{},{}]",
            scenario.max_ticks, arena.x.raw(), arena.y.raw());
        let _ = write!(out, ",\"frameCount\":{},\"truncated\":{}",
            self.recorded, self.recorded < run.ticks + 1);

        // The two lines the picture is judged against, read out of the code that
        // owns them. `IMPACT_THRESHOLD` is the legacy "is this a swing at all"
        // bar and is not what the articulated path tests -- it is carried
        // because it is the only calibrated speed in the repository, and the
        // finding that closed v2-17 is that a weapon-body contact arrives about
        // thirty-five times under it.
        let _ = write!(out, ",\"impactThreshold\":{},\"contactEnergyFloor\":{}",
            IMPACT_THRESHOLD.raw(), CONTACT_ENERGY_FLOOR);

        // Names for every code the frames carry as a number, so the reader owns
        // no copy of an enum that `sim` can renumber underneath it.
        // Five names for a `regions` array that is seven long, and the
        // mismatch is the point rather than a bug: this table names **anatomy**
        // -- it is what the contact column and the severed readout index -- while
        // `pose.regions` is the swept-volume list the solver works in. The first
        // five agree by construction, which is what `forearm_volume` appending
        // rather than interleaving buys.
        out.push_str(",\"regionNames\":[\"head\",\"torso\",\"leftArm\",\"rightArm\",\"legs\"]");
        out.push_str(",\"hintNames\":[\"idle\",\"chasing\",\"braced\",\"contact\",\"recoiling\",\"severed\"]");
        out.push_str(",\"contactKinds\":[\"weaponWeapon\",\"weaponShield\",\"weaponBody\",\"projectileBody\"]");
        let _ = write!(out, ",\"bodySlot\":{},\"noRegion\":{}", sim::BODY_SLOT, sim::NO_VOLUME);

        out.push_str(",\"bodies\":[");
        for (index, unit) in scenario.units.iter().enumerate() {
            if index > 0 {
                out.push(',');
            }
            let anatomy = self.anatomy.get(index).expect("one anatomy per unit");
            let _ = write!(out, "{{\"index\":{index},\"kind\":\"{:?}\",\"faction\":\"{:?}\"",
                unit.kind, unit.faction);
            let _ = write!(out,
                ",\"anatomy\":{{\"standingHeight\":{},\"shoulderHeight\":{},\
                 \"shoulderHalfWidth\":{},\"armLength\":{},\"handRadius\":{}}}",
                anatomy.standing_height.raw(), anatomy.shoulder_height.raw(),
                anatomy.shoulder_half_width.raw(), anatomy.arm_length.raw(),
                anatomy.hand_radius.raw());

            out.push_str(",\"carried\":[");
            let table = scenario.combat_specs.as_ref().expect("a validated spec table");
            let row = unit.articulated.expect("a validated articulated unit");
            for (slot, id) in row.equipment.iter().enumerate() {
                if slot > 0 {
                    out.push(',');
                }
                match id.and_then(|id| table.equipment(id)) {
                    None => out.push_str("null"),
                    Some(item) => {
                        let _ = write!(out, "{{\"action\":\"{:?}\",\"binding\":\"{:?}\",\
                            \"mass\":{},\"balance\":{}",
                            item.action, item.binding, item.mass.raw(), item.balance.raw());
                        match item.geometry {
                            EquipmentGeometry::Segment { length, radius } => {
                                let _ = write!(out, ",\"geometry\":\"segment\",\
                                    \"length\":{},\"radius\":{}}}", length.raw(), radius.raw());
                            }
                            EquipmentGeometry::Shield { half_width, half_height, thickness } => {
                                let _ = write!(out, ",\"geometry\":\"shield\",\"halfWidth\":{},\
                                    \"halfHeight\":{},\"thickness\":{}}}",
                                    half_width.raw(), half_height.raw(), thickness.raw());
                            }
                        }
                    }
                }
            }
            out.push_str("]}");
        }

        out.push_str("],\"frames\":[");
        out.push_str(&self.frames);
        out.push_str("]}\n");
        out
    }
}

fn vec3(out: &mut String, v: Vec3) {
    let _ = write!(out, "[{},{},{}]", v.x.raw(), v.y.raw(), v.z.raw());
}

fn entity(out: &mut String, id: sim::EntityId) {
    let _ = write!(out, "[{},{}]", id.index, id.generation);
}

fn fractions(out: &mut String, values: &[fx::Fx]) {
    out.push('[');
    for (at, value) in values.iter().enumerate() {
        if at > 0 {
            out.push(',');
        }
        let _ = write!(out, "{}", value.raw());
    }
    out.push(']');
}
