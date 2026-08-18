//! The `CombatModel::Legacy` phase bodies and the combat scalars they read.
//!
//! This is the original body model: one blade per limb, planar swings, arrows,
//! parries and blocks. It is kept as the control -- the way the Canvas game is
//! kept as the control for the GPU client -- so nothing here is dead code even
//! though the articulated model supersedes it.

use super::*;

impl World {
    /// Out-of-combat recovery. See [`crate::rules::REGEN_PER_TICK`] for why
    /// this rule exists at all -- it is what makes retreating a tactic instead
    /// of a way to stall a fight forever.
    ///
    /// **Out of combat means out of contact, not merely out of range.** Timing
    /// it from the last blow alone was the obvious reading and it quietly
    /// undoes the difficulty range: an exchange takes a couple of seconds and
    /// [`crate::rules::REGEN_DELAY`] is three, so two fighters circling each
    /// other at arm's length heal between every trade. A bad fighter therefore
    /// could not be ground down -- it could only be caught -- and the whole
    /// bottom of the skill ladder came out as timeouts rather than defeats. It
    /// also read badly: characters visibly closing their wounds while an enemy
    /// stood four feet away, sword drawn.
    ///
    /// Breaking line of sight is a much higher bar and it is the one the rule
    /// always meant. Retreating still works, and it now has to be a real
    /// retreat.
    pub(super) fn regenerate(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] || self.hp[i] >= self.max_hp[i] {
                continue;
            }
            if self.tick < self.last_combat[i].saturating_add(crate::rules::REGEN_DELAY) {
                continue;
            }
            if self.enemy_in_sight(i) {
                continue;
            }
            // Bounded for the whole fight, not per rest: see
            // `rules::REGEN_BUDGET`. Without the budget a beaten fighter can
            // walk away, wait, and un-lose the exchange, and the fight has no
            // reason ever to end.
            let tick_heal = (self.max_hp[i] * crate::rules::REGEN_PER_TICK)
                .min(self.regen_left[i])
                .min(self.max_hp[i] - self.hp[i]);
            if !tick_heal.is_positive() {
                continue;
            }
            self.hp[i] += tick_heal;
            self.regen_left[i] -= tick_heal;
        }
    }

    /// Whether anything hostile stands inside `i`'s own sight range.
    ///
    /// Ground truth rather than perception: this is a rule about the world, not
    /// a decision the character makes, and a fighter that healed because it had
    /// failed to notice the enemy would be rewarded for its blind spot.
    fn enemy_in_sight(&self, i: usize) -> bool {
        let sight = self.stats[i].sight_range();
        for j in 0..self.alive.len() {
            if j == i || !self.alive[j] || self.faction[j] == self.faction[i] {
                continue;
            }
            if (self.pos[j] - self.pos[i]).length() <= sight {
                return true;
            }
        }
        false
    }

    /// Steps every limb against whatever it is holding.
    ///
    /// This is also where every attack clock ticks down, which is why there is
    /// no cooldown phase in [`World::step`] any more. Putting the countdown
    /// anywhere else would let a limb be observed in a phase it had already
    /// left, or bill a blow on a windup that ran out earlier in the same tick.
    pub(super) fn drive_limbs(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                self.blade_was[i] = None;
                self.blade_p[i] = Fx::ZERO;
                continue;
            }
            // 1. Snapshot before anything, and **against the outgoing action**.
            //
            // The body has already moved this tick but the limb has not, so
            // this pair is exactly where the blade was when the last tick
            // ended. Order matters more than it looks: a chambered blade sits
            // at `GUARD_REACH` (0.30), which is above `MIN_STRIKE_REACH`, so it
            // is a real segment that `resolve_parries` will test. Flipping the
            // slot first would sweep a club-length segment from where a knife
            // was and bill a parry on a blade that never existed.
            self.blade_was[i] = self.blade_from(i, self.start_pos[i], self.limb[i]);
            self.blade_p[i] = self.blade_momentum(i);

            // 2. Then honour a swap request, if the limb is in any state to
            //    hear one. Three ways to be refused, and all three are silent:
            //    a slot this fighter does not carry, the slot already in hand,
            //    or a limb that is mid-attack. The last is the load-bearing one
            //    -- a swap out of a committed cut would make overcommitting
            //    free, and the punish window is half the model.
            let want = self.command[i].slot as usize;
            if want != self.slot[i] as usize
                && self.limb[i].swing == Swing::Guard
                && self.loadout[i].holds(want)
            {
                // The slot flips *now*, not when the swap lands. `Swing::Swap`
                // alone carries "nothing is live", and resolving the arm
                // against the incoming action is what makes its `ready` cost
                // and its extend rate the numbers that actually run.
                self.slot[i] = want as u8;
                let incoming = self.arm(i);
                self.limb[i].begin_swap(incoming);
            }

            // 3. Then drive, against whatever is in hand now.
            let arm = self.arm(i);
            let cmd = self.command[i].limb;
            let before = self.limb[i].swing;
            self.limb[i].drive(cmd, arm);

            // 4. And if that was a release, put an arrow in the air.
            //
            // **Detected here rather than flagged on the limb.** A `Hand` is
            // pure arm physics with no idea projectiles exist, and giving it a
            // `loosed` bit would be new state, new bytes in `Hand::hash_into`,
            // and a concept living in the one type that must not know about it.
            // The edge is perfectly visible from out here, and this function
            // already runs the same snapshot-then-compare pattern for
            // `blade_was` and `blade_p` two steps above.
            if arm.spec.role == Role::Shoot
                && before == Swing::Windup
                && self.limb[i].swing == Swing::Strike
            {
                self.loose(i, arm);
            }
        }
    }

    /// Puts an arrow in the air, and bills the archer for it.
    ///
    /// Called on the one tick a [`Role::Shoot`] limb crosses from
    /// [`Swing::Windup`] into [`Swing::Strike`].
    fn loose(&mut self, i: usize, arm: rules::Arm) {
        // **Along the frozen line, not along the hand.**
        //
        // At this exact edge the hand is still back at the cocked bearing --
        // `Hand::step_attack` only just commanded it forward -- so `limb.angle`
        // points at very nearly the one direction the shot is guaranteed *not*
        // to go. `line` is the plan and the pose is the tell, which is the same
        // distinction `swing::landing` is built on.
        let heading = self.limb[i].line;
        let along = Vec2::from_angle(heading);
        let nock = self.radius[i] + arm.spec.length;
        let speed = rules::shot_speed(arm);

        // Born clear of the archer's own body, so it cannot be tested against
        // the thing that fired it on the tick it appears. `resolve_shots` skips
        // the owner by handle as well; this is the geometric half of the same
        // promise, and it is what makes the arrow visibly leave the bow.
        let from = self.pos[i] + along * nock;

        let Some(k) = self.free_shot() else {
            return; // at the ceiling: the draw is spent, the arrow is not made
        };
        self.shot_alive[k] = true;
        self.shot_pos[k] = from;
        self.shot_vel[k] = along * speed;
        self.shot_range[k] = self.stats[i].sight_range();
        self.shot_mass[k] = arm.spec.mass;
        self.shot_power[k] = rules::power_multiplier(self.stats[i].power);
        self.shot_owner[k] = self.id_of(i);
        self.shot_faction[k] = self.faction[i];

        // Newton, at the string. **Not through `apply_recoil`**, which
        // *differences* a blade's momentum across a tick and applies a traction
        // threshold because a swing's reaction is sustained over a whole arc and
        // static friction genuinely holds it. A release is a single-tick
        // momentum change -- the same case as a blade reversing off a shield --
        // and it is exactly what that threshold is meant to let through.
        let kick = fx::mul_div(
            arm.spec.mass * speed,
            rules::RECOIL_TRANSFER,
            self.mass[i].max(Fx::EPSILON),
        );
        self.vel[i] -= along * kick;

        self.events.push(Event::Loose {
            source: self.id_of(i),
            at: from,
            line: heading,
        });
    }

    /// A free arrow slot, growing the arrays if there is room left under
    /// [`rules::MAX_SHOTS`].
    fn free_shot(&mut self) -> Option<usize> {
        if let Some(k) = self.shot_free.pop() {
            return Some(k as usize);
        }
        if self.shot_alive.len() >= rules::MAX_SHOTS {
            return None;
        }
        self.shot_alive.push(false);
        self.shot_pos.push(Vec2::ZERO);
        self.shot_vel.push(Vec2::ZERO);
        self.shot_range.push(Fx::ZERO);
        self.shot_mass.push(Fx::ZERO);
        self.shot_power.push(Fx::ZERO);
        self.shot_owner.push(EntityId::NONE);
        self.shot_faction.push(Faction::Heroes);
        Some(self.shot_alive.len() - 1)
    }

    fn reap_shot(&mut self, k: usize) {
        self.shot_alive[k] = false;
        self.shot_free.push(k as u32);
    }

    /// Steel on steel. Both swings are thrown off line, neither lands.
    ///
    /// Its own pass with an `i < j` loop for the same reason
    /// [`World::separate`] has one: a pairwise interaction resolved inside a
    /// per-entity loop resolves twice, and asymmetrically.
    ///
    /// **At least one of the two blades has to be mid-cut.** Two chambered
    /// guards brushing past each other is not a parry, however fast the bodies
    /// happen to be turning -- and without that rule, a pair of fighters
    /// standing close would trade rebounds forever on blades neither of them
    /// swung. The other blade may be a guard, though, and that is the point:
    /// catching a cut on your own steel is the answer available to a fighter
    /// whose shield is on the wrong side. It is not free, because a parry ends
    /// with *both* hands recovering.
    pub(super) fn resolve_parries(&mut self) {
        self.impulses.clear();
        let n = self.alive.len();
        for i in 0..n {
            if !self.alive[i] || !self.can_parry(i) {
                continue;
            }
            let (ia, ib) = match self.blade(i) {
                Some(seg) => seg,
                None => continue,
            };
            for j in (i + 1)..n {
                if !self.alive[j] || self.faction[j] == self.faction[i] || !self.can_parry(j) {
                    continue;
                }
                // Somebody has to have actually swung.
                if !self.limb[i].swing.is_live() && !self.limb[j].swing.is_live() {
                    continue;
                }
                // Two blades merely resting against each other are not a parry.
                // Without a speed floor a crossed pair would fire an event
                // every tick for as long as they stayed lined up.
                let closing = self.limb[i].spin.abs() + self.limb[j].spin.abs();
                if closing < rules::PARRY_MIN_SPIN {
                    continue;
                }
                let (ja, jb) = match self.blade(j) {
                    Some(seg) => seg,
                    None => continue,
                };
                let at = match fx::segment_segment(ia, ib, ja, jb) {
                    Some(p) => p,
                    None => continue,
                };
                // Steel on steel is the same collision a block is, with two
                // blades in it instead of a blade and a guard -- so the heavier
                // weapon wins the crossing, which is what a parry ought to be a
                // question about and previously was not.
                let (mine, theirs) =
                    self.deflect(i, j, at, rules::PARRY_RESTITUTION);
                for (e, add) in [(i, mine), (j, theirs)] {
                    self.impulses.push(Impulse {
                        entity: e,

                        scale: Fx::ONE,
                        add,
                        recover: Some(rules::PARRY_RECOVERY),
                    });
                }
                self.events.push(Event::Parry {
                    a: self.id_of(i),
                    b: self.id_of(j),
                    at,
                });
            }
        }
        self.apply_impulses();
    }

    /// Whether `i`'s blade is in any state to meet another.
    ///
    /// A recovering hand is not. That phase is the punish window, and a blade
    /// that could still swat cuts aside on its way back to guard would not be
    /// much of one.
    ///
    /// Neither is a guard, and that consequence is worth stating plainly because
    /// it is a real cost rather than a technicality: **a shield cannot parry**.
    /// A fighter behind one has no answer to a crossed blade except to take it
    /// on the arc, and no way to punish the crossing. That is what the loadout
    /// is *for* -- if a guard could do both jobs there would be nothing to
    /// choose between.
    #[inline]
    fn can_parry(&self, i: usize) -> bool {
        self.action_of(i).spec().role.is_live_capable()
            && !matches!(self.limb[i].swing, Swing::Recover | Swing::Swap)
    }

    /// Blade against body: the whole of damage.
    ///
    /// **Only a blade in [`Swing::Strike`] can hurt anybody.** That one line is
    /// what ended the windmill. Under the old model every tick of rotation was
    /// a live hitbox, so the dominant strategy -- for a hand-written policy, for
    /// evolution, and for a person with a mouse -- was to hold the blade out and
    /// spin it, and there was no instant at which an attack could be said to
    /// have *started*, which meant there was no instant at which one could be
    /// read or answered. Extension is not the gate and never was a good one: a
    /// fighter has every reason to keep a guard chambered, and a guard that
    /// cuts is a guard nobody would drop.
    ///
    /// Two passes, and the split is not tidiness. The old `resolve_attacks`
    /// wrote only health and cooldowns, which no other attacker read, so it
    /// could resolve in place. This one writes **spin**, and spin is the input
    /// to damage -- so an in-place loop would let the first attacker's rebound
    /// change the second attacker's blow, making a mutual exchange depend on
    /// entity index. Collecting the outcomes and applying them afterwards *is*
    /// the snapshot; no extra buffer is needed.
    ///
    /// [`Swing::Strike`]: crate::Swing::Strike
    pub(super) fn resolve_swings(&mut self) {
        self.blows.clear();
        self.impulses.clear();

        // ---- pass 1: read-only
        for i in 0..self.alive.len() {
            if !self.alive[i] || !self.limb[i].swing.is_live() {
                continue;
            }
            let (base, tip) = match self.blade(i) {
                Some(seg) => seg,
                None => continue,
            };
            // A blade with no history is tested where it is, which is what the
            // un-swept version did for everything.
            let (was_base, was_tip) = self.blade_was[i].unwrap_or((base, tip));
            let spec = self.action_of(i).spec();
            let sweep = self.radius[i] + spec.length;
            let power = rules::power_multiplier(self.stats[i].power);
            let travelled = self.pos[i] - self.start_pos[i];
            // What this blade has to be worth here to count as a cut rather
            // than a scrape. See `rules::GRAZE_FRACTION`: below it the blade
            // passes through, which costs the swinger nothing and is the only
            // thing standing between a weapon and having every cut it throws
            // spent on the hilt end of its own arc.
            let graze = rules::graze_floor(self.arm(i), self.stats[i]);

            for j in 0..self.alive.len() {
                if i == j || !self.alive[j] || self.faction[j] == self.faction[i] {
                    continue; // no friendly fire, ever -- checked before any geometry
                }
                // Bounding circle before anything expensive. The geometry below
                // runs several integer square roots per pair and this is the
                // hot loop of the whole tick.
                //
                // Widened by the relative travel, because the two bodies were
                // somewhere else at the start of the tick: distance between two
                // linearly moving points is convex, so it is *smallest* in the
                // middle, and a bound taken at the end alone would reject the
                // exact pairs the sweep exists to catch.
                let closing = (travelled - (self.pos[j] - self.start_pos[j])).length();
                if (self.pos[j] - self.pos[i]).length() > sweep + self.radius[j] + closing {
                    continue;
                }
                let hit = match fx::swept_segment_circle(
                    was_base,
                    was_tip,
                    base,
                    tip,
                    self.start_pos[j],
                    self.pos[j],
                    self.radius[j],
                ) {
                    Some(h) => h,
                    None => continue,
                };
                // A cut that crosses masonry did not land. Measured from the
                // swinger's own centre to the point of impact, which is the
                // segment the arm actually occupies at the moment it connects.
                //
                // Belt-and-braces once sight is occluded -- nobody *aims*
                // through a wall any more -- but "cannot see it" and "cannot hit
                // it" are different claims, and only the second one stops a
                // long weapon. A Brute's `Club` reaches 2.15 from its own centre
                // (radius 0.70 plus a 1.45 blade), and a Brute and a Skitterer
                // pressed against opposite faces of a one-tile wall are
                // 0.70 + 1.00 + 0.30 = 2.00 apart. It clears the rock by 0.15,
                // so this is arithmetic and not paranoia.
                //
                // On the hit path only, which is rare, and free on a flat plan:
                // `raycast` bails on its first tile test. It is `raycast` and not
                // `sees` because the short-circuit is not wanted -- a swing is
                // already inside a `carved` check by virtue of being rare, and
                // reading the same method the arrows read (`resolve_shots`) keeps
                // one rule for "what stops a moving thing".
                if self.dungeon.carved() && self.dungeon.raycast(self.pos[i], hit.point).is_some() {
                    continue;
                }

                let impact = self.impact_speed(i, j, hit.point);
                let mut full = rules::blow_damage(spec.mass, impact, power);
                if !full.is_positive() {
                    continue; // resting, withdrawing, or merely leaning on them
                }
                if full < graze {
                    continue; // caught it with the wrong part of the blade
                }
                // A body committed to a spent swing is turned into the blow and
                // cannot give ground with it. This is the only term in the
                // damage model that depends on what the *target* is doing, and
                // it is what makes timing an attack worth more than throwing
                // one; see `rules::RECOVERY_EXPOSURE`.
                if self.limb[j].swing == Swing::Recover {
                    full *= rules::RECOVERY_EXPOSURE;
                }
                let leak = self.block_leak(j, hit.point);
                let blocked = leak.is_some();
                let amount = match leak {
                    Some(fraction) => full * fraction,
                    None => full,
                };
                self.blows.push(Blow {
                    source: i,
                    target: j,
                    amount,
                    absorbed: full - amount,
                    blocked,
                    at: hit.point,
                    shove: self.shove(i, j, hit.point, blocked),
                });

                if blocked {
                    // The swing comes back off the shield, and the shield is
                    // shoved the way the blow was travelling. That pairing is
                    // the punish window: the attacker has to pay off a reversed
                    // swing *and* the extra recovery, while the defender's guard
                    // is out of position too. Blocking is not free either.
                    //
                    // Both halves are one collision between two arms now rather
                    // than two independent fractions, so the guard that swats a
                    // knife aside is thrown wide open by an axe -- see
                    // `World::deflect`.
                    let (rebound, knock) =
                        self.deflect(i, j, hit.point, rules::BLOCK_RESTITUTION);
                    self.impulses.push(Impulse {
                        entity: i,

                        scale: Fx::ONE,
                        add: rebound,
                        recover: Some(rules::BLOCK_RECOVERY),
                    });
                    self.impulses.push(Impulse {
                        entity: j,

                        scale: Fx::ONE,
                        add: knock,
                        recover: None,
                    });
                } else {
                    // A cut that went home is spent, and the hand starts back.
                    // This is what stops one swing billing damage on every tick
                    // it spends inside a body -- the old hand refractory, now
                    // expressed as the thing it always meant.
                    self.impulses.push(Impulse {
                        entity: i,

                        scale: Fx::ONE,
                        add: Fx::ZERO,
                        recover: Some(0),
                    });
                }
            }
        }

        // ---- pass 2: apply, in ascending source order
        for k in 0..self.blows.len() {
            let blow = self.blows[k];
            let (i, j) = (blow.source, blow.target);
            let source = self.id_of(i);
            let target = self.id_of(j);

            if blow.blocked {
                self.events.push(Event::Block {
                    attacker: source,
                    defender: target,
                    absorbed: blow.absorbed,
                    at: blow.at,
                });
            }

            self.vel[j] += blow.shove;
            // Reported where it is applied, and **as a field read and nothing
            // else**. The vector was computed in pass 1 (`World::shove`); an
            // emission site that recomputed it would be a second rounding of a
            // number that is already in `vel`, which is the whole argument for
            // this variant existing rather than the page differencing velocity.
            //
            // A zero shove is not announced. `World::shove` answers zero when
            // the contact coincides with the attacker's own centre, and a shove
            // of nothing is not a thing that happened.
            if !blow.shove.is_zero() {
                self.events.push(Event::Shove {
                    entity: target,
                    shover: source,
                    impulse: blow.shove,
                    at: blow.at,
                });
            }

            let effective = blow.amount.min(self.hp[j].max(Fx::ZERO));
            self.hp[j] -= blow.amount;
            self.damage_dealt[i] += effective;
            self.last_attacker[j] = source;
            self.last_combat[i] = self.tick;
            self.last_combat[j] = self.tick;
            self.events.push(Event::Damage {
                source,
                target,
                amount: blow.amount,
                lethal: !self.hp[j].is_positive(),
                at: blow.at,
            });
        }
        self.blows.clear();
        self.apply_impulses();
    }

    /// Flies every arrow one tick, and resolves whatever it met.
    ///
    /// The twin of [`World::resolve_swings`] and deliberately shaped like it,
    /// down to the read-only first pass -- an arrow reads `vel` to work out its
    /// closing speed, so a shove written where it is computed would change what
    /// the *next* arrow's blow is worth and make a volley depend on slot order.
    ///
    /// Two things it deliberately does **not** do. It writes no
    /// [`Impulse`]: a blocked blade rebounds off a shield and pays for it, but
    /// an arrow that hits one does not travel back up the string, and there is
    /// no swing left to interrupt. And it credits `damage_dealt` only if the
    /// archer is still alive -- an arrow outlives its owner, and a slot that has
    /// been recycled belongs to somebody else now.
    pub(super) fn resolve_shots(&mut self) {
        if self.shot_alive.is_empty() {
            return;
        }
        self.pierces.clear();
        self.prop_impacts.clear();

        // ---- pass 1: read-only
        for k in 0..self.shot_alive.len() {
            if !self.shot_alive[k] {
                continue;
            }
            let was = self.shot_pos[k];
            let step = self.shot_vel[k];
            let now = was + step;

            // Whom it met first. **Nearest along the flight**, not first by
            // index: `SegmentHit` reports where on the segment it touched, so
            // the honest answer costs nothing extra, and the entity index breaks
            // ties so the result never depends on scan order.
            let mut first: Option<(Fx, usize, Vec2)> = None;
            for j in 0..self.alive.len() {
                if !self.alive[j] || self.faction[j] == self.shot_faction[k] {
                    continue; // no friendly fire, ever -- before any geometry
                }
                if self.id_of(j) == self.shot_owner[k] {
                    continue; // and never the archer, however the flight curves back
                }
                // **The arrow's own travel is the segment**, so this is already
                // swept exactly along the flight and nothing can tunnel through
                // a body lengthwise. What it does not sweep is the *target's*
                // motion over the tick, and it does not have to: a body moves at
                // most about 0.05 units a tick against a radius of at least
                // 0.30, six times the margin `segment_circle`'s invariant asks
                // for. Pinned by `an_arrow_cannot_tunnel_through_a_body`.
                let Some(hit) = fx::segment_circle(was, now, self.pos[j], self.radius[j]) else {
                    continue;
                };
                if first.is_none_or(|(t, best, _)| (hit.t, j) < (t, best)) {
                    first = Some((hit.t, j, hit.point));
                }
            }

            // Masonry is not a target -- there is no blow to resolve and no
            // event to raise -- but it is very much something that stops an
            // arrow, and which of the two comes first is settled the same way
            // two bodies are: nearest along the flight.
            let wall = if self.dungeon.carved() {
                self.dungeon.raycast(was, now)
            } else {
                None
            };
            let mut first_prop: Option<(Fx, usize)> = None;
            for (prop_index, prop) in self.dungeon_props.iter().enumerate() {
                if prop.broken || !prop.max_hp.is_positive() { continue; }
                let radius = prop.half_extents.x.max(prop.half_extents.y);
                let Some(hit) = fx::segment_circle(was, now, prop.position, radius) else {
                    continue;
                };
                if first_prop.is_none_or(|(toi, best)| (hit.t, prop.identity) <
                    (toi, self.dungeon_props[best].identity)) {
                    first_prop = Some((hit.t, prop_index));
                }
            }
            if let Some((toi, prop)) = first_prop {
                let body_t = first.map(|row| row.0);
                if wall.is_none_or(|wall_t| toi <= wall_t)
                    && body_t.is_none_or(|target_t| toi <= target_t)
                {
                    let amount = rules::blow_damage(
                        self.shot_mass[k], self.shot_vel[k].length(), self.shot_power[k]);
                    self.prop_impacts.push(PropImpact {
                        toi, prop, attacker: self.shot_owner[k], amount,
                    });
                    self.reap_shot(k);
                    continue;
                }
            }
            let struck = match first {
                Some((t, j, at)) if wall.is_none_or(|w| t <= w) => Some((j, at)),
                _ => None,
            };
            let Some((j, at)) = struck else {
                if wall.is_some() {
                    // Spent on the wall. No event, for exactly the reason a
                    // shot that leaves the room raises none: an arrow does not
                    // bounce and does not stick, it stops being in the frame.
                    self.reap_shot(k);
                }
                continue;
            };

            // Relative closing speed, and a magnitude rather than a projection
            // onto the surface normal. `impact_speed` takes the projection for
            // the *body* term of a cut and explains why the blade term must not
            // be one: a hit dead centre has the way in perpendicular to the
            // velocity, so projecting would make the cleanest possible contact
            // worth exactly nothing. An arrow has the same geometry and the same
            // answer.
            let impact = (self.shot_vel[k] - self.vel[j]).length();
            let mut full = rules::blow_damage(self.shot_mass[k], impact, self.shot_power[k]);
            if !full.is_positive() {
                continue;
            }
            // A body committed to a spent swing cannot give ground with the
            // blow, whichever direction the blow came from. Same rule, same
            // reason, same constant as a cut.
            if self.limb[j].swing == Swing::Recover {
                full *= rules::RECOVERY_EXPOSURE;
            }
            // **The same guard rule a blade meets**, deliberately, rather than a
            // second defensive mechanic that would have to be balanced against
            // the first. A planted shield leaks `BLOCK_LEAK_BRACED` of an arrow
            // and a snapped one `BLOCK_LEAK_SNAP`, so reading a draw pays and
            // flinching at it does not -- which is the whole point of a bow's
            // very long telegraph.
            let leak = self.block_leak(j, at);
            let blocked = leak.is_some();
            let amount = match leak {
                Some(fraction) => full * fraction,
                None => full,
            };
            self.pierces.push(Pierce {
                shot: k,
                target: j,
                source: self.shot_owner[k],
                amount,
                absorbed: full - amount,
                blocked,
                at,
                shove: self.shot_shove(k, j, blocked),
            });
        }

        sort_prop_impacts(&mut self.prop_impacts, &self.dungeon_props);
        for impact in &self.prop_impacts {
            let prop = &mut self.dungeon_props[impact.prop];
            if prop.broken { continue; }
            prop.hp -= impact.amount;
            if !prop.hp.is_positive() {
                prop.hp = Fx::ZERO;
                prop.broken = true;
            }
        }
        self.prop_impacts.clear();

        // ---- pass 2: apply, in ascending shot order
        for p in 0..self.pierces.len() {
            let pierce = self.pierces[p];
            let j = pierce.target;
            let target = self.id_of(j);

            if pierce.blocked {
                self.events.push(Event::Block {
                    attacker: pierce.source,
                    defender: target,
                    absorbed: pierce.absorbed,
                    at: pierce.at,
                });
            }

            self.vel[j] += pierce.shove;
            // The arrow's half of the same rule, on the same terms: a field
            // read of what pass 1 computed. `shover` is the archer's handle
            // rather than an index it may no longer own -- an arrow outlives
            // the fighter that loosed it, and a listener that keys on this is
            // told so by the generation half failing to resolve.
            if !pierce.shove.is_zero() {
                self.events.push(Event::Shove {
                    entity: target,
                    shover: pierce.source,
                    impulse: pierce.shove,
                    at: pierce.at,
                });
            }

            let effective = pierce.amount.min(self.hp[j].max(Fx::ZERO));
            self.hp[j] -= pierce.amount;
            self.last_attacker[j] = pierce.source;
            self.last_combat[j] = self.tick;
            // Credit and the combat clock, **only if the archer is still there**.
            // The handle is generational, so a shot whose owner died and whose
            // slot has been refilled resolves to `None` rather than paying the
            // wrong fighter -- which is exactly why `shot_owner` is an
            // `EntityId` and not an index.
            if let Some(i) = self.resolve(pierce.source) {
                self.damage_dealt[i] += effective;
                self.last_combat[i] = self.tick;
            }
            // **The body, not the rim.** A cut has a contact point worth
            // carrying -- `blow.at` is where on the blade the two met, and where
            // on the blade decides what the blow was worth. A pierce has no such
            // point: the arrow is a point itself, and `resolve_shots` tests the
            // whole segment it travelled this tick, so `pierce.at` is merely
            // wherever along that segment the circle was first crossed. The
            // honest answer to "where did this land" is the body it stopped in.
            // `Event::Block` above keeps the rim, because a shield is struck at
            // a place and that place is the whole of what a block is about.
            self.events.push(Event::Damage {
                source: pierce.source,
                target,
                amount: pierce.amount,
                lethal: !self.hp[j].is_positive(),
                at: self.pos[j],
            });
            // Spent on what it hit, blocked or not. An arrow stopped by a shield
            // is still an arrow that has stopped.
            self.reap_shot(pierce.shot);
        }
        self.pierces.clear();

        // ---- and everything still in the air moves.
        for k in 0..self.shot_alive.len() {
            if !self.shot_alive[k] {
                continue;
            }
            let step = self.shot_vel[k];
            let now = self.shot_pos[k] + step;
            self.shot_range[k] -= step.length();
            let outside = now.x < Fx::ZERO
                || now.y < Fx::ZERO
                || now.x > self.arena.x
                || now.y > self.arena.y;
            // Range spent, or gone over the wall. An arrow does not bounce and
            // does not stick: it simply stops being in the frame, which is what
            // a miss looks like from the far side of a room.
            if outside || !self.shot_range[k].is_positive() {
                self.reap_shot(k);
                continue;
            }
            self.shot_pos[k] = now;
        }
    }

    /// Velocity an arrow adds to what it hits.
    ///
    /// **Along the flight**, which is where [`World::shove`] deliberately does
    /// *not* point -- that function's whole argument is that a cut sweeps across
    /// a body and carries it round the arc. A shot does not sweep. Same momentum
    /// law, same [`rules::KNOCKBACK_TRANSFER`], and the same
    /// [`rules::BRACE_ANCHOR`] discount for a guard that was planted to meet it.
    fn shot_shove(&self, k: usize, j: usize, blocked: bool) -> Vec2 {
        let vel = self.shot_vel[k];
        if vel.is_zero() {
            return Vec2::ZERO;
        }
        let carried = self.shot_mass[k] * vel.length() * rules::KNOCKBACK_TRANSFER;
        let taken = if blocked {
            Fx::ONE - rules::BRACE_ANCHOR * self.limb[j].brace_fraction()
        } else {
            Fx::ONE
        };
        let mass = self.mass[j].max(Fx::EPSILON);
        vel.normalize() * fx::mul_div(carried, taken, mass)
    }

    /// Applies collected impulses in ascending `(entity, hand)`.
    ///
    /// The order is fixed rather than incidental: `Fx` addition saturates, and
    /// saturating addition is commutative but not associative at the boundary,
    /// so two impulses landing on one hand must always combine the same way.
    ///
    /// An impulse carrying a recovery ends the running attack outright. Two
    /// arriving on the same hand in one tick -- a cut that is blocked by one
    /// enemy and parried by another -- take the longer of the two recoveries,
    /// which is the same "worst of" rule the old refractory used and keeps the
    /// result independent of which landed first.
    fn apply_impulses(&mut self) {
        self.impulses.sort_by_key(|im| im.entity);
        for k in 0..self.impulses.len() {
            let im = self.impulses[k];
            let arm = self.arm(im.entity);
            let ceiling = arm.cap;
            let hand = &mut self.limb[im.entity];
            hand.spin = (hand.spin * im.scale + im.add).clamp(-ceiling, ceiling);
            if let Some(extra) = im.recover {
                // Only a hand *already* recovering has a countdown worth
                // keeping. Reading `swing_left` off a live cut instead would
                // hand the attacker whatever was left of `STRIKE_TIMEOUT` as
                // its recovery, which is both far too long and backwards --
                // the earlier a cut is stopped, the longer it would be punished.
                let already = if hand.swing == Swing::Recover {
                    hand.swing_left
                } else {
                    0
                };
                hand.recover(arm, extra);
                hand.swing_left = hand.swing_left.max(already);
            }
        }
        self.impulses.clear();
    }

    /// Bills every body for the reaction to its own sword.
    ///
    /// **Your own attack moves you.** A blade is mass on the end of an arm, and
    /// getting it moving has to push the shoulder the other way; letting it go
    /// again has to haul the shoulder after it. The sim gets that for free by
    /// differencing the weapon's momentum across the tick, because whatever
    /// changed it -- the muscle, a shield, another blade -- changed it by pushing
    /// on the body through the arm.
    ///
    /// Three consequences, in rising order of how much they matter:
    ///
    /// * A swing that runs its whole arc is very nearly momentum-neutral. It
    ///   starts and ends at rest, so the impulses cancel; what does *not* cancel
    ///   is the ground covered in between, because the blade points somewhere
    ///   different at the end than it did at the start and traction is shedding
    ///   the drift the whole time.
    /// * A cut that is **stopped** is not neutral at all. A blocked blade
    ///   reverses in one tick, and the whole of that momentum change lands on the
    ///   attacker as a shove backwards along its own swing. Being blocked already
    ///   cost tempo; it now costs ground.
    /// * A fighter cannot swing and hold a position exactly. Spacing was a
    ///   decision you made with your feet and now it is one you make with the
    ///   whole body, which is the entire point of the phase.
    ///
    /// **Every role, not only a blade.** [`World::blade_momentum`] has no role
    /// gate and should not have one: what is being billed is mass on the end of
    /// an arm being accelerated, and a guard, a bow and a pair of empty hands all
    /// have that. It is why `RunMind` parks its limb rather than tucking it --
    /// a limb hauled round the compass every tick costs footing whether or not
    /// it can cut.
    ///
    /// A shot's own reaction is *not* billed here. This function differences
    /// momentum across a tick, and a release is a one-off; see [`World::loose`].
    pub(super) fn apply_recoil(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] {
                continue;
            }
            let change = self.blade_momentum(i) - self.blade_p[i];
            if change.is_zero() {
                continue;
            }
            // Newton's third law, with the ground taking the rest of it: see
            // `rules::RECOIL_TRANSFER`.
            let mass = self.mass[i].max(Fx::EPSILON);
            let recoil = fx::mul_div(change, rules::RECOIL_TRANSFER, mass);

            // What the feet hold. Static friction, and the same budget
            // `apply_movement` spends on steering, because it is the same
            // friction -- so a swing worth less than a tick of footwork does not
            // move a planted fighter at all, and one worth more does.
            //
            // Not a refinement: without it the model is unusable. A swing
            // accelerates its blade the same way for twenty or forty ticks
            // running, so every tick of recoil points *the same way* and they
            // add, while traction can only shed a fixed amount per tick. At a
            // quarter transfer that came to well over a body's top speed
            // accumulated across a single cut -- a fighter physically could not
            // close on anything while swinging at it, Rogue mirror duels stopped
            // landing blows, and 86% of them ended in a draw at full health.
            // With a threshold the smooth part of a swing is simply held, which
            // is the correct answer and the one every swordsman demonstrates.
            let slipped = recoil.abs() - self.stats[i].traction();
            if !slipped.is_positive() {
                continue;
            }
            // Along where the blade is pointing *now*: the impulse is billed at
            // the bottom of the tick, so it is billed where the blade ended up.
            let along = Vec2::from_angle(self.limb[i].angle).perp();
            // Bound rather than written inline, which is a refactor and not a
            // change: `-=` desugars to the same subtraction of the same
            // operand, evaluated once either way. The binding exists so the
            // event below can be a field read like the other two shove sites.
            let kick = along * (slipped * recoil.signum());
            self.vel[i] -= kick;
            let entity = self.id_of(i);
            let at = self.pos[i];
            // The same rule the other two sites hold: a shove of nothing is not
            // a thing that happened. `slipped` is positive by the test above,
            // but `Mul<Fx> for Vec2` truncates toward zero, so a kick barely
            // past the traction threshold can round to `(0, 0)` in both
            // components -- and shoves are nine event rows in ten, so a
            // zero-magnitude one is noise on the highest-rate channel there is.
            // Measured rather than assumed: `web`'s scripted feed
            // (`one_script_run_twice_...`) carried 929 shove rows of 1409 over
            // 2195 ticks, and two of the 929 were this.
            //
            // **The guard is around the event and not around `vel`.** The
            // subtraction above is unconditional and stays that way; it is a
            // no-op when `kick` is zero, and moving it in here would put a
            // branch on simulation state to spare an event row, which is the
            // one trade this file never makes.
            //
            // `-kick`, because `impulse` is what the body *gains* at all three
            // sites and this one is billed as a subtraction. The negation
            // cannot reach state -- it is never written back to `vel`.
            if !kick.is_zero() {
                self.events.push(Event::Shove {
                    entity,
                    // Nobody to blame. A recoil is a fighter's own swing
                    // throwing it off its feet, which is why this variant
                    // carries a shover that is allowed not to exist.
                    shover: EntityId::NONE,
                    impulse: -kick,
                    at,
                });
            }
        }
    }

    pub(super) fn reap_dead(&mut self) {
        for i in 0..self.alive.len() {
            if !self.alive[i] || self.hp[i].is_positive() {
                continue;
            }
            let entity = self.id_of(i);
            let killer = self.last_attacker[i];
            self.alive[i] = false;
            self.generation[i] = self.generation[i].wrapping_add(1);
            self.command[i] = Command::HOLD;
            self.free.push(i as u32);
            self.events.push(Event::Death { entity, killer });
        }
    }

    /// The hardest single blow `i` can land: tip, top spin, nothing in the way.
    ///
    /// Absolute health, so it never leaves this crate in this form -- the two
    /// places it surfaces ([`Contact::threat`], [`Contact::frailty`]) both
    /// divide it by a maximum first. Which maximum is the whole point: the same
    /// axe is a third of a Fighter and three quarters of a Skitterer, and that
    /// ratio is the thing worth perceiving.
    pub(super) fn peak_damage(&self, i: usize) -> Fx {
        rules::peak_damage(self.arm(i), self.stats[i])
    }

    /// How much ground `j` loses to one clean blow from `i`, in `j`'s own body
    /// radii.
    ///
    /// [`World::peak_damage`] on the momentum side, and expressed as a
    /// **distance** for the same reason that one is expressed as a fraction of a
    /// health bar: the raw figure is meaningless without the thing it is
    /// measured against. A velocity of 0.05 says nothing; three quarters of a
    /// body of ground, shed over the dozen ticks it takes traction to pay it
    /// off, is a sentence about spacing -- and spacing is what every number
    /// around it in a [`Contact`] is for.
    ///
    /// Stopping distance rather than peak speed, `v^2 / 2a`, against the
    /// target's *own* traction: the same quantity a fighter already has to hold
    /// in mind about its own footwork ([`Observation::traction`]), so the two
    /// are directly comparable. Being light costs twice over, once in taking
    /// more speed from the blow and again in needing further to shed it, which
    /// is why the spread here is so much wider than the damage one.
    pub(super) fn knockback(&self, attacker: usize, target: usize) -> Fx {
        let dv = rules::peak_impulse(self.arm(attacker)) / self.mass[target].max(Fx::EPSILON);
        self.stopping_distance(target, dv)
    }

    /// **How much ground `i`'s own hardest cut costs `i`**, in its own body
    /// radii. [`World::knockback`] turned around to face the fighter throwing
    /// the blow.
    ///
    /// The same question in the same unit as [`Contact::knockback_taken`], which
    /// is the point of computing it this way: a fighter deciding whether to
    /// commit to a cut is weighing what the cut costs it in position against
    /// what standing still costs it, and those two have to be comparable or the
    /// comparison is a units error.
    ///
    /// It is the one number a fighter cannot work out for itself from anything
    /// else in the observation. Recoil goes as `weapon_mass / body_mass`, and
    /// neither of those is a percept -- `action_length` and `radius` are the
    /// visible proxies and both lie, because balance and density are real and
    /// independent. A Skitterer's knife is the second-heaviest thing in the game
    /// for its speed on the lightest body in it.
    ///
    /// [`Contact::knockback_taken`]: crate::Contact::knockback_taken
    pub(super) fn recoil_drift(&self, i: usize) -> Fx {
        let dv = rules::peak_recoil(self.arm(i)) / self.mass[i].max(Fx::EPSILON);
        self.stopping_distance(i, dv)
    }

    /// How far `i` travels shedding `dv`, in `i`'s own body radii.
    ///
    /// `v^2 / 2a` against the body's own traction, so it is directly comparable
    /// with [`Observation::traction`] -- the same quantity a fighter already has
    /// to hold in mind about its own footwork.
    ///
    /// [`Observation::traction`]: crate::Observation::traction
    fn stopping_distance(&self, i: usize, dv: Fx) -> Fx {
        let brake = self.stats[i].traction() * Fx::TWO;
        if !brake.is_positive() {
            return Fx::ZERO;
        }
        fx::mul_div(dv, dv, brake) / self.radius[i].max(Fx::EPSILON)
    }

    /// `i`'s blade as a world-space segment, base to tip, or `None` if the hand
    /// is too tucked to be a hitbox.
    ///
    /// The early out is both the semantics and the fast path: "tucked" means
    /// something mechanically, and it costs nothing to check.
    pub(super) fn blade(&self, i: usize) -> Option<(Vec2, Vec2)> {
        self.blade_from(i, self.pos[i], self.limb[i])
    }

    /// [`World::blade`] for a body and hand that are not the current ones.
    ///
    /// Exists so the previous tick's segment can be reconstructed from
    /// [`World::start_pos`] and the un-stepped hand, which is the other end of
    /// the sweep in [`World::resolve_swings`].
    fn blade_from(&self, i: usize, pos: Vec2, hand: Hand) -> Option<(Vec2, Vec2)> {
        let spec = self.action_of(i).spec();
        // **A guard is not a blade.** It has a length and it is out in front of
        // the body, and neither of those makes it a hitbox. `MIN_STRIKE_REACH`
        // used to be the only thing separating "tucked" from "dangerous", which
        // was fine while every unit in the game held a sword; the role is the
        // honest separator now that some of them hold a shield.
        if !spec.role.is_live_capable() {
            return None;
        }
        // Mid-swap there is nothing in the hand yet. The tucked reach below
        // would catch this anyway, on the tick after the swap begins; saying it
        // outright means the blade vanishes on the *same* tick the fighter
        // reached for something else, which is what "nothing is live" has to
        // mean if the swap is going to be a real price.
        if hand.swing.is_dormant() {
            return None;
        }
        if hand.reach < rules::MIN_STRIKE_REACH {
            return None;
        }
        let along = Vec2::from_angle(hand.angle);
        let base = pos + along * self.radius[i];
        let tip = base + along * (spec.length * hand.reach);
        Some((base, tip))
    }

    /// How much of a blow arriving at `contact` gets past `j`'s guard, or
    /// `None` if `j` does not cover that bearing -- or is not holding a guard at
    /// all.
    ///
    /// *Whether* it covers is a pure integer comparison on binary angles -- no
    /// trigonometry, no tolerance, exact -- and the arc scales with extension,
    /// so a tucked guard covers nothing and an extended one covers its full
    /// width.
    ///
    /// *How well* it covers is a question about time rather than about geometry:
    /// a guard still swinging toward the bearing is barely in the way of
    /// anything. See [`rules::block_leak`].
    fn block_leak(&self, j: usize, contact: Vec2) -> Option<Fx> {
        let spec = self.action_of(j).spec();
        // **The one line that makes blocking a choice.**
        //
        // The arc used to come off `kind[j].weapon()`, so every character in the
        // game had one whether or not it had done anything to deserve it -- and
        // since holding it out cost nothing, every policy did, permanently. A
        // fighter blocks now only while it is holding something that blocks, and
        // it cannot swing that thing. That is the entire trade the loadout
        // exists to make.
        if !spec.role.blocks() {
            return None;
        }
        let guard = self.limb[j];
        // Reaching for the shield is not the same as holding it, and this is
        // the tick that difference is worth something to the attacker.
        if guard.swing.is_dormant() {
            return None;
        }
        if guard.reach < rules::MIN_BLOCK_REACH {
            return None;
        }
        let out = contact - self.pos[j];
        if out.is_zero() {
            return None; // struck dead centre: no bearing to cover
        }
        let arc = Fx::from_int(spec.arc as i32) * guard.reach;
        if guard.angle.delta(out.angle()).abs() > arc.round_int() {
            return None;
        }
        Some(rules::block_leak(guard.braced))
    }

    /// How hard `i`'s blade is travelling through `j`'s body at `contact`.
    ///
    /// This is the whole damage model in one function, and it is the sum of two
    /// quite different things:
    ///
    /// * **The blade's own speed through the flesh**, which is tangential to
    ///   its arc and therefore rises with distance from the shoulder. This is
    ///   the term that makes where you stand matter more than any stat, and it
    ///   is a magnitude rather than a projection because a sword sweeping
    ///   *across* someone cuts them. Projecting it onto the surface normal
    ///   instead reads as an oddly specific claim -- that only a thrust counts
    ///   -- and produces a model in which a blade buried dead centre at full
    ///   speed does nothing at all, because at that exact instant its velocity
    ///   is perpendicular to the way in.
    /// * **The closing speed of the two bodies**, which *is* a projection,
    ///   because walking has a direction and running away from a blow should
    ///   take something off it. It is small next to the first term by design:
    ///   the real answer to a swing is to not be in its arc, and that is
    ///   settled by geometry long before this function is reached.
    fn impact_speed(&self, i: usize, j: usize, contact: Vec2) -> Fx {
        let arm = contact - self.pos[i];
        let blade = fx::tangential_speed(self.limb[i].spin, arm.length());

        let out = contact - self.pos[j];
        let closing = if out.is_zero() {
            Fx::ZERO // struck dead centre: no surface normal to close along
        } else {
            (self.vel[i] - self.vel[j]).dot(-out.normalize())
        };
        blade + closing
    }

    /// Momentum of `i`'s weapon along the direction it is travelling, signed by
    /// which way the hand is turning.
    ///
    /// The weapon's mass centre sits on [`Arm::lever`] from the shoulder and is
    /// carried around by the hand's spin, so its velocity is tangential and its
    /// momentum is that times [`Weapon::mass`].
    ///
    /// **A speed and not a velocity, and that is the whole subtlety here.** A
    /// blade held at constant spin has a constant *speed* and a momentum vector
    /// that swings all the way round the compass, so differencing the vector
    /// bills the body for a centripetal reaction on every tick of every swing --
    /// which is real physics and completely swamps the model. Measured at a
    /// quarter transfer it came to a *sustained* 38% of a Rogue's top speed per
    /// tick, pushing outward from wherever its blade happened to be; Rogue mirror
    /// duels stopped being able to land a blow at all and ended 98% in draws at
    /// full health.
    ///
    /// It is the honest term to drop. Holding a weapon out against its own
    /// circle is a pull straight down the arm and into the shoulder, and leaning
    /// against that is what a stance *is* -- a hammer thrower does not get
    /// dragged sideways, they lean back. What a fighter genuinely cannot brace
    /// against is the blade changing *speed*, which is the term that survives.
    ///
    /// Extension is dropped for a duller reason: pushing a blade out moves its
    /// mass centre too, and that reaction is an order of magnitude below the
    /// swing's -- [`Arm::extend_rate`] is a fraction of a unit of *reach* per
    /// tick against a lever measured in whole units.
    ///
    /// [`Arm::lever`]: crate::Arm::lever
    /// [`Arm::extend_rate`]: crate::Arm::extend_rate
    /// [`Weapon::mass`]: crate::Weapon::mass
    fn blade_momentum(&self, i: usize) -> Fx {
        let hand = self.limb[i];
        let arm = self.arm(i);
        let speed = fx::tangential_speed(hand.spin, arm.lever(hand.reach)) * hand.spin.signum();
        speed * arm.spec.mass
    }

    /// Velocity a blow from `i` landing at `contact` adds to `j`.
    ///
    /// **Along the way the blade is travelling**, which in a top-down arc is
    /// across the target rather than through it, and that is the honest answer
    /// rather than a convenient one: a cut sweeps, and what it does to a body is
    /// carry it along the sweep. Pushing the target directly away from its
    /// attacker would be the intuitive model and it describes a thrust, which is
    /// not what any weapon in this roster is doing.
    ///
    /// The consequence is worth stating because it is the reason to want this at
    /// all. A fighter that has crowded inside a heavy weapon is not pushed back
    /// out of its dead zone -- it is dragged *around* the arc, which costs it the
    /// one thing crowding is made of, which is a position held exactly. Reach
    /// stops being decoration for the fighter who can throw people around with
    /// it.
    fn shove(&self, i: usize, j: usize, contact: Vec2, blocked: bool) -> Vec2 {
        let out = contact - self.pos[i];
        if out.is_zero() {
            return Vec2::ZERO;
        }
        let hand = self.limb[i];
        let speed = fx::tangential_speed(hand.spin, out.length()) * hand.spin.signum();
        let carried = self.action_of(i).spec().mass * speed * rules::KNOCKBACK_TRANSFER;

        // A guard that is merely in the way transmits the whole of it; one that
        // has been planted puts most of it into the ground. See
        // `rules::BRACE_ANCHOR` -- this is the second thing bracing buys, and
        // without it a fighter who could not stop the blow anyway got nothing
        // for having read it.
        let taken = if blocked {
            Fx::ONE - rules::BRACE_ANCHOR * self.limb[j].brace_fraction()
        } else {
            Fx::ONE
        };

        let mass = self.mass[j].max(Fx::EPSILON);
        let dv = fx::mul_div(carried, taken, mass);
        out.normalize().perp() * dv
    }

    /// Two arms meeting at `at`: how much spin each one gains.
    ///
    /// A real collision between two rotating bodies, resolved from both moments
    /// of inertia and a coefficient of restitution, replacing the pair of flat
    /// fractions that used to stand in for it. It is what makes a Brute's axe
    /// shrug off a guard that stops a Rogue's blade dead -- the same fact from
    /// both sides, out of one calculation, instead of two constants that had no
    /// idea the other existed.
    ///
    /// The whole thing resolves in **spin units at `i`'s contact radius**, which
    /// is the trick that keeps it to a handful of `mul_div`s. Every quantity in a
    /// collision is linear in the relative velocity, and the conversion from spin
    /// to world speed is a constant times the radius, so working in one arm's
    /// units lets the constant cancel out of every term and never appear.
    ///
    /// `align` is the cosine between the two arms, and it does two jobs at once.
    /// It projects `j`'s hand speed onto the direction `i`'s blade is travelling,
    /// and it is the moment arm by which an impulse along that direction turns
    /// `j`'s hand -- so it enters `j`'s effective inertia **squared**. At zero the
    /// blow points straight through `j`'s shoulder: infinitely stiff, nothing
    /// rotates, and the guard holds absolutely. That is not a special case in the
    /// code and it falls out correctly on its own.
    fn deflect(&self, i: usize, j: usize, at: Vec2, restitution: Fx) -> (Fx, Fx) {
        let out_i = at - self.pos[i];
        let out_j = at - self.pos[j];
        let r_i = out_i.length();
        let r_j = out_j.length();
        if !r_i.is_positive() || !r_j.is_positive() {
            // Struck dead centre on one side or the other: no lever, no torque,
            // and the divisions below would saturate.
            return (Fx::ZERO, Fx::ZERO);
        }
        let align = out_i.normalize().dot(out_j.normalize());
        let inertia_i = self.arm(i).inertia(self.limb[i].reach);
        let inertia_j = self.arm(j).inertia(self.limb[j].reach);

        // `j`'s contact speed, as the spin `i` would need to match it. Their
        // tangents point different ways, which is what `align` corrects for.
        let mirrored = fx::mul_div(self.limb[j].spin * align, r_j, r_i);
        let closing = (Fx::ONE + restitution) * (self.limb[i].spin - mirrored);

        // `j`'s arm referred to `i`'s contact radius. `inertia_j` is already in
        // those units by construction -- it is the thing being compared against.
        let referred = fx::mul_div(inertia_i * align * align, r_j * r_j, r_i * r_i);
        let total = referred + inertia_j;
        if !total.is_positive() {
            return (Fx::ZERO, Fx::ZERO);
        }
        // The share of the meeting speed each side gives up is the *other* one's
        // weight in the total, which is the whole of a collision.
        let gained = -fx::mul_div(closing, inertia_j, total);
        let thrown = fx::mul_div(closing, fx::mul_div(inertia_i * align, r_j * r_j, r_i), total);
        (gained, thrown)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::command::{LimbCommand, Strike};
    use crate::world::testkit::*;

    #[test]
    fn legacy_health_and_regeneration_are_byte_identical() {
        // The articulated query is a second derivation, not a replacement.
        //
        // The byte-identity half of this claim is not provable here and is not
        // pretended to be: it belongs to `GOLDEN_STATE_HASH` in
        // `crates/sim/tests/determinism.rs` and to the four browser fixtures,
        // all of which are untouched by this session. What *is* proved here is
        // the thing those pins cannot localise -- that a Legacy world takes the
        // legacy arm of every new routing decision, and that the phases the
        // articulated tick does not run are still the ones the legacy tick does.
        let mut world = duel_world();
        assert_eq!(world.state_digest().domain, crate::HashDomain::LegacyV1);
        assert_eq!(world.state_digest().value, world.state_hash(),
                   "a Legacy digest stopped being its own core hash");
        world.phase_trace_enabled = true;
        world.step();
        assert!(world.phase_trace.contains(&"regenerate") && world.phase_trace.contains(&"reap"),
                "the legacy tick lost a phase the articulated tick does not run");
        assert!(!world.phase_trace.contains(&"anatomy"),
                "a Legacy world ran the anatomy phase");

        world.phase_trace_enabled = false;
        let ids: Vec<EntityId> = (0..world.alive.len()).map(|i| world.id_of(i)).collect();
        for _ in 0..120 { world.step(); }
        assert!(world.wounds.is_empty(), "a legacy world allocated anatomy rows");
        for (i, id) in ids.iter().enumerate() {
            if world.resolve(*id).is_none() { continue; }
            // Routing, not arithmetic: these hold by construction *while*
            // `anatomy_spec` answers `None`, and the assertion is there to fail
            // the day something makes it answer otherwise for a Legacy slot.
            assert_eq!(world.health_of(i), world.hp[i]);
            assert_eq!(world.max_health_of(i), world.max_hp[i]);
            assert_eq!(world.health_fraction_of(i), world.legacy_hp_frac(i));
            assert!(world.anatomy_spec(i).is_none());
        }
        // Regeneration still runs, still off `regen_left`, and still only in
        // the legacy arm of the tick.
        let mut hurt = duel_world();
        let id = hurt.id_of(0);
        hurt.hp[0] = Fx::ONE;
        hurt.last_combat[0] = 0;
        for _ in 0..(crate::rules::REGEN_DELAY + 60) { hurt.step(); }
        let i = hurt.resolve(id).expect("the hero survived a duel it is not in");
        assert!(hurt.hp[i] > Fx::ONE, "legacy regeneration stopped happening");
        assert!(hurt.regen_left[i] < hurt.max_hp[i] * crate::rules::REGEN_BUDGET);
    }

    /// Keeps one entity's sword cutting through `bearing`, forever.
    ///
    /// **Every test below that wants a blow to land goes through this**, and the
    /// four-line match is the whole contract a policy has to satisfy. It is
    /// worth reading once, because three of the four arms are mistakes waiting
    /// to happen:
    ///
    /// * Asking to attack while the hand is at guard *and armed* starts a cut.
    /// * Asking to attack during a windup or a cut **must continue** -- letting
    ///   the command lapse there cancels the windup, which is the feint, and a
    ///   test that does it by accident simply never hits anything.
    /// * Asking to attack during a recovery leaves the hand disarmed when the
    ///   recovery ends, so it throws one cut and then stands there forever.
    ///   Releasing is what re-arms it.
    fn cutting(w: &World, id: EntityId, bearing: Angle, side: Strike) -> LimbCommand {
        let sword = w.view(id).unwrap().limb;
        match sword.swing {
            Swing::Guard if sword.armed => LimbCommand::attack(bearing, side),
            Swing::Windup | Swing::Strike => LimbCommand::attack(bearing, side),
            _ => LimbCommand::new(bearing, Fx::ZERO),
        }
    }

    /// A minimum viable swordsman: hold the preferred range and keep cutting.
    fn duellist(w: &World, obs: &Observation, target: EntityId) -> Command {
        let enemy = match obs.enemies().first() {
            Some(c) => *c,
            // Nothing in sight: walk to the middle of the room and look again.
            // The duel scenario spawns the pair 12 units apart and nobody sees
            // further than 9.6, so without this they stand still forever.
            None => return Command::moving((Vec2::from_ints(12, 8) - obs.position).normalize()),
        };
        let bearing = enemy.offset.angle();
        // Stand inside the tip band rather than at the very edge of reach: at
        // maximum extension only a blade pointed almost exactly at the target
        // touches it at all.
        let ideal = obs.radius + obs.action_length * Fx::from_ratio(6, 10) + enemy.radius;
        let approach = if enemy.distance > ideal {
            enemy.offset.normalize()
        } else {
            Vec2::ZERO
        };
        Command::swinging(
            approach,
            target,
            cutting(w, obs.me, bearing, Strike::Nearest),

        )
    }

    /// Runs a duel to a conclusion with both sides attacking.
    fn fight(w: &mut World, ticks: u32) -> Option<Outcome> {
        let hero = w.alive_ids(Faction::Heroes)[0];
        let monster = w.alive_ids(Faction::Monsters)[0];
        for _ in 0..ticks {
            for id in w.pending_decisions().to_vec() {
                let target = if id == hero { monster } else { hero };
                let obs = w.observe(id);
                let command = duellist(w, &obs, target);
                w.submit(id, command);
            }
            w.step();
            if let Some(o) = w.outcome() {
                return Some(o);
            }
        }
        None
    }

    #[test]
    fn units_close_and_kill_each_other() {
        let mut w = duel_world();
        assert!(
            fight(&mut w, 60 * 180).is_some(),
            "the duel never resolved -- two swordsmen attacking each other \
             for three minutes should produce a body"
        );
    }

    #[test]
    fn a_blade_that_is_not_striking_is_furniture() {
        // The property the whole redesign was for, stated as bluntly as it can
        // be. Two Warriors nose to nose, both sweeping their blades through
        // each other as hard as the torque cap allows and never once asking to
        // attack. Under the old model this was the dominant strategy in the
        // game. It now does nothing at all.
        let mut scenario = Scenario::duel();
        scenario.units[1].set_body(Body::Fighter);
        scenario.units[1].stats = Body::Fighter.base_stats();
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        let mut spun = Fx::ZERO;
        for tick in 0..900u32 {
            // A bearing that sweeps right round, twice a second: the fastest
            // windmill the old interface could express.
            let bearing = Angle::from_raw((tick.wrapping_mul(2184) & 0xFFFF) as u16);
            let whirl = LimbCommand::new(bearing, Fx::ONE);
            w.submit(a, Command::swinging(Vec2::ZERO, b, whirl));
            w.submit(b, Command::swinging(Vec2::ZERO, a, whirl));
            w.step();
            spun = spun.max(w.limb[a.index as usize].spin.abs());
        }
        assert!(
            spun > Fx::from_int(500),
            "the blades never got moving, so this proves nothing: {spun}"
        );
        assert_eq!(
            w.damage_dealt(Faction::Heroes),
            Fx::ZERO,
            "a windmill still draws blood"
        );
        assert_eq!(w.damage_dealt(Faction::Monsters), Fx::ZERO);
    }

    #[test]
    fn an_attack_can_be_answered_because_it_arrives_late() {
        // The dodge window, measured rather than asserted. Between the tick a
        // Brute commits and the tick its blade goes live there is a stretch of
        // real time, and it has to be long enough for a Fighter to notice on one
        // decision and act on the next.
        // Close enough that the hero can see the Brute at all: a Fighter sees
        // 9.6 units and the duel scenario spawns the pair twelve apart.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::from_ints(9, 8);
        let mut w = World::new(&scenario, 1);
        let brute = w.alive_ids(Faction::Monsters)[0];
        let hero = w.alive_ids(Faction::Heroes)[0];
        let period = w.view(hero).unwrap().stats.decision_period() as u32;

        let mut announced = None;
        let mut live = None;
        for tick in 0..200u32 {
            let cmd = LimbCommand::attack(Angle::HALF, Strike::Widdershins);
            w.submit(brute, Command::swinging(Vec2::ZERO, hero, cmd));
            w.submit(hero, Command::HOLD);
            w.step();
            let swing = w.limb[brute.index as usize].swing;
            if swing == Swing::Windup && announced.is_none() {
                announced = Some(tick);
                // And the hero can see it. This is not the same claim: the
                // phase reaching the observation is what makes the window
                // usable rather than merely present.
                let seen = w.observe(hero);
                assert_eq!(
                    seen.enemies()[0].limb_swing,
                    Swing::Windup,
                    "the telegraph never reached the defender's observation"
                );
            }
            if swing == Swing::Strike && live.is_none() {
                live = Some(tick);
                break;
            }
        }
        let warning = live.expect("the cut never went live") - announced.expect("never announced");
        assert!(
            warning > period * 2,
            "a Brute gave {warning} ticks of warning to a Fighter that thinks \
             every {period} -- not enough to read and answer"
        );
    }

    #[test]
    fn friendly_fire_is_impossible() {
        // Both units placed a single unit apart, well inside a Fighter's reach,
        // and both windmilling their blades straight through each other. The
        // old version of this test submitted `Command::attacking` with tucked
        // hands, which under geometric damage passes while proving nothing:
        // no blade ever left its scabbard.
        let script = |allied: bool| -> (usize, Fx, Fx) {
            let mut scenario = Scenario::duel();
            if allied {
                scenario.units[1].faction = Faction::Heroes;
            }
            scenario.units[1].spawn = Vec2::from_ints(7, 8);
            let mut w = World::new(&scenario, 1);
            let a = w.alive_ids(Faction::Heroes)[0];
            let b = if allied {
                w.alive_ids(Faction::Heroes)[1]
            } else {
                w.alive_ids(Faction::Monsters)[0]
            };
            for _ in 0..900u32 {
                // Stop the moment somebody falls over. The hostile control
                // script draws real blood now, and `cutting` reads a live view.
                if w.outcome().is_some() {
                    break;
                }
                let cut_a = cutting(&w, a, Angle::ZERO, Strike::Nearest);
                let cut_b = cutting(&w, b, Angle::HALF, Strike::Nearest);
                w.submit(a, Command::swinging(Vec2::ZERO, b, cut_a));
                w.submit(b, Command::swinging(Vec2::ZERO, a, cut_b));
                w.step();
            }
            (
                w.alive.iter().filter(|&&a| a).count(),
                w.damage_dealt(Faction::Heroes),
                w.health_fraction(Faction::Heroes),
            )
        };

        // The control: the identical script across factions draws blood. Without
        // this the assertion below could pass because the geometry never
        // connected rather than because the faction check held.
        let (_, hostile_damage, _) = script(false);
        assert!(
            hostile_damage.is_positive(),
            "the script never landed a blow, so it cannot show anything about \
             friendly fire"
        );

        let (alive, damage, health) = script(true);
        assert_eq!(alive, 2, "an ally was killed");
        assert_eq!(damage, Fx::ZERO, "an ally was wounded");
        assert_eq!(health, Fx::ONE);
    }

    #[test]
    fn a_resting_blade_does_no_damage() {
        // Extended, in contact, and stationary. The whole difference between
        // this model and the old one: standing next to someone with a sword out
        // is not an attack.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        let held = Command::swinging(
            Vec2::ZERO,
            b,
            LimbCommand::new(Angle::ZERO, Fx::ONE),

        );
        for _ in 0..300 {
            w.submit(a, held);
            w.submit(b, Command::HOLD);
            w.step();
        }
        // The blade is genuinely inside the target, not merely short of it.
        let view = w.view(b).unwrap();
        let reach = w.view(a).unwrap().position.x + Fx::from_ratio(45, 100) + Fx::from_ratio(95, 100);
        assert!(
            reach > view.position.x - view.radius,
            "the blade never reached the body, so this proves nothing"
        );
        assert_eq!(w.damage_dealt(Faction::Heroes), Fx::ZERO);
        assert_eq!(w.health_fraction(Faction::Monsters), Fx::ONE);
    }

    #[test]
    fn a_shove_alone_cannot_land_a_blow() {
        // Separation moves bodies, and that movement feeds impact speed. What
        // stops a crowd from mincing itself is the `Swing::Strike` gate: a
        // carried blade is not a weapon because it is not attacking.
        //
        // Worth stating because the obvious guard is *not* the one holding.
        // `rules::ENERGY_FLOOR` would not do it alone -- a Brute's axe carried
        // at a Brute's walking pace is worth 0.0023 against a floor of 0.0022,
        // and would bill a scratch every tick it touched anyone. Weight is
        // exactly what makes the energy law unable to defend this on its own.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = scenario.units[0].spawn;
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];
        for _ in 0..240 {
            // Blades out, hands still: only the shove is moving anything.
            w.submit(
                a,
                Command::swinging(Vec2::ZERO, b, LimbCommand::new(Angle::ZERO, Fx::ONE)),
            );
            w.submit(
                b,
                Command::swinging(Vec2::ZERO, a, LimbCommand::new(Angle::HALF, Fx::ONE)),
            );
            w.step();
        }
        assert_eq!(w.health_fraction(Faction::Heroes), Fx::ONE);
        assert_eq!(w.health_fraction(Faction::Monsters), Fx::ONE);
    }

    #[test]
    fn a_swing_through_a_body_lands_once() {
        // A blade crossing a body occupies it for several ticks. Without ending
        // the cut the moment it lands, it would bill damage on every one of
        // them, and a single swing would delete anything it touched.
        //
        // 1.6 units apart and deliberately not touching: a Fighter with its
        // chest against a Brute meets that body at an arm of 0.45, which is
        // inside its own dead zone and does nothing at all. That is the damage
        // model working exactly as intended, and it makes for a test that
        // measures the wrong thing.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(76, 10), Fx::from_int(8));
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        // Exactly one cut, start to finish. Holding the command down throws a
        // single attack, so the loop only has to run until the hand is back at
        // guard to have covered the whole of it.
        let mut blows = 0;
        let mut started = false;
        for _ in 0..300u32 {
            let sword = w.view(a).unwrap().limb;
            if started && sword.swing == Swing::Guard {
                break;
            }
            started |= sword.swing.is_attacking();
            let cmd = LimbCommand::attack(Angle::ZERO, Strike::Widdershins);
            w.submit(a, Command::swinging(Vec2::ZERO, b, cmd));
            w.submit(b, Command::HOLD);
            for event in w.step() {
                if let Event::Damage { source, .. } = event {
                    if *source == a {
                        blows += 1;
                    }
                }
            }
        }
        assert!(started, "the attack never began");
        assert!(blows > 0, "the sweep never connected");
        assert_eq!(blows, 1, "one sweep billed {blows} separate blows");
    }

    #[test]
    fn a_shield_covers_a_direction_and_only_that_direction() {
        // Identical swing, identical geometry, one variable: where the guard
        // points.
        //
        // Note which direction wins, because it is not the obvious one. The
        // attacker stands to the *west*, but a blade sweeping in at an angle
        // first touches the body well round to the north -- an overhead swing
        // lands on top of you, not on the side facing the swordsman. Pointing a
        // shield at the enemy is therefore not the same as pointing it at the
        // blow, which is exactly the read a good policy has to make.
        let landed = |shield: Option<Angle>| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[1].set_body(Body::Fighter);
            scenario.units[1].stats = Body::Fighter.base_stats();
            // **Holding a guard, and only a guard.** Handing the defender its
            // default Sword instead measures something else entirely: a
            // chambered blade is still a segment, so it parries, and at the
            // right bearing it takes the incoming cut to zero. That is a real
            // mechanic and it is not this one.
            scenario.units[1].loadout = Loadout::single(ActionKind::Shield);
            scenario.units[1].spawn = Vec2::from_ints(7, 8);
            let mut w = World::new(&scenario, 1);
            let a = w.alive_ids(Faction::Heroes)[0];
            let b = w.alive_ids(Faction::Monsters)[0];
            let guard = match shield {
                Some(at) => LimbCommand::new(at, Fx::ONE),
                None => LimbCommand::TUCKED,
            };
            // One named side, every cut. `Strike::Nearest` alternates as the
            // blade ends up on one side and then the other, which lands blows
            // on both flanks and turns a single-variable test into a test of
            // whether one guard can cover two lines. It cannot, and that is not
            // what is being asked here.
            for _ in 0..900u32 {
                let cut = cutting(&w, a, Angle::ZERO, Strike::Widdershins);
                w.submit(a, Command::swinging(Vec2::ZERO, b, cut));
                w.submit(b, Command::swinging(Vec2::ZERO, a, guard));
                w.step();
            }
            w.damage_dealt(Faction::Heroes)
        };

        let unguarded = landed(None);
        assert!(unguarded.is_positive(), "the swing never connected");

        // Sweep the guard around and find the best and worst bearings.
        let mut best = Fx::MAX;
        let mut worst = Fx::ZERO;
        for step in 0..16 {
            let taken = landed(Some(Angle::from_raw((step * 4096) as u16)));
            best = best.min(taken);
            worst = worst.max(taken);
        }

        assert!(
            best < unguarded * Fx::HALF,
            "the best guard took {best} against {unguarded} unguarded -- \
             the shield is not covering anything"
        );
        assert!(
            best.is_positive(),
            "a shield stopped the blow completely; it is meant to leak so that \
             turtling is a discount and never an off switch"
        );
        assert!(
            worst > best * Fx::TWO,
            "guard direction barely mattered: {best} best vs {worst} worst"
        );
    }

    #[test]
    fn where_on_the_blade_you_are_struck_decides_what_it_costs() {
        // The emergent property the whole design rests on, measured end to end:
        // one Brute blow costs several times as much at the tip of its arc as
        // it does close to the hilt. Nothing encodes this -- it falls out of a
        // blade's speed rising with distance from the shoulder, and it is what
        // gives a light fighter something to do about a heavy one.
        //
        // Measured per *blow*, deliberately. Total damage over a fixed window
        // says the opposite, and the reason is worth knowing: the angular
        // window in which a blade reaches a body at the tip of its arc is a few
        // degrees wide, while close in it is tens of degrees, so a distant
        // target is hit rarely and hard and a near one often and weakly. Both
        // effects are real and they pull against each other -- which is what
        // makes choosing a range a decision rather than a lookup.
        // Both feet still and the Brute's blade swept about an exact bearing
        // rather than a perceived one. This is a test of the geometry, so its
        // aim must not be at the mercy of a Brute's eyesight.
        //
        // **The first blow, not the worst of many**, and the change is forced:
        // a blow moves a body now, so the gap this function is named after only
        // exists until one lands. Sampling 1800 ticks used to average an arc and
        // now averages a *retreat* -- the near sample drifts out of the crowd it
        // was placed in and starts reporting the very tip band the far sample is
        // there to measure, which flattened the measured ratio from 3.4 to 1.9
        // without a thing changing about where a blade is dangerous.
        let taken_at = |gap: i32| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[0].spawn =
                Vec2::new(Fx::from_int(18) - Fx::from_ratio(gap, 10), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            for _ in 0..1800u32 {
                let cut = cutting(&w, brute, Angle::HALF, Strike::Nearest);
                w.submit(brute, Command::swinging(Vec2::ZERO, hero, cut));
                w.submit(hero, Command::HOLD);
                for event in w.step() {
                    if let Event::Damage { amount, .. } = event {
                        return *amount;
                    }
                }
            }
            Fx::ZERO
        };

        // 2.5 units apart puts a Fighter's body in the Brute's tip band
        // (0.70 + 1.45 + 0.45 = 2.60); 1.3 is just outside the lee its blade
        // cannot reach into at all (0.845 + 0.45 = 1.295).
        //
        // The near distance used to be 1.6 and had to come in, which is worth
        // recording because it is a symptom of a real fix rather than of a
        // slipping test. A Brute's cut could not finish its arc inside the old
        // flat `STRIKE_TIMEOUT` -- it was cut off eight degrees short of its own
        // line, every time, mid-acceleration -- so the only blows it ever landed
        // were the ones it met early on the approach, and the gradient this test
        // measures was steepened by an accident of which part of the swing was
        // reachable. With the whole arc live the curve is the honest one:
        // damage grows with the square of the arm, so it rises smoothly from
        // the edge of the lee out to the tip rather than jumping.
        let at_the_tip = taken_at(25);
        let inside = taken_at(13);

        assert!(at_the_tip.is_positive(), "the tip band never connected");
        assert!(inside.is_positive(), "closing in avoided the blade entirely");
        assert!(
            at_the_tip > inside * Fx::from_int(3),
            "the worst blow at the tip was {at_the_tip} against {inside} \
             close in -- where you stand is supposed to be the whole fight"
        );
    }

    #[test]
    fn crowding_a_heavy_weapon_takes_most_of_its_bite_away() {
        // The sharpest edge of the damage model, pinned deliberately rather
        // than left to be discovered -- and it has changed *kind* twice since it
        // was first written, which is the part worth reading.
        //
        // Impact is `spin * arm` and energy is its square, so a weapon has a
        // minimum effective radius: inside it even a blade at full speed is
        // worth no more than a graze. That radius used to be 1.27 for a Brute,
        // *outside* the 1.15 at which a Fighter's body and a Brute's stop being
        // able to approach -- meaning a fighter who got close became flatly
        // immune, and a small enough one became immune and harmless at the same
        // time while the fight timed out. Dropping the old speed threshold to
        // 0.06 pulled it to 0.85 and turned the circle into a gradient; the
        // energy law put it at 0.88, which is the same answer.
        //
        // **The bound below is the one that matters, and it is the one Phase 3
        // broke.** Deriving the spin cap from grip raised a Brute's top spin
        // from 741 to 911, which pulled the dead zone to 0.687 -- *inside* its
        // own 0.70 body radius. Nothing was immune any more, which sounds
        // harmless and was not: a blow of any size ends the swing that threw it,
        // so with no harmless band left on the blade every cut a Brute threw was
        // spent on a hilt scratch worth 1-3 damage against a peak of 24.8. The
        // naive Fighter's win rate against it went from 10% to 76%. See
        // `rules::GRAZE_FRACTION`, which is what put the band back.
        //
        // This asserted the same thing before and missed it, because it derived
        // the dead zone inline from the damage law instead of asking
        // `rules::dead_zone`. Ask the sim -- the law has changed again since.
        let brute = Body::Brute;
        let arm = rules::Arm::resolve(ActionKind::Club.spec(), brute.base_stats(), brute.radius());
        let safe = rules::dead_zone(arm);
        assert!(
            safe > brute.radius(),
            "a Brute's dead zone is {safe} against a body radius of {} -- with no \
             part of the blade harmless, every cut it throws is spent on a scratch",
            brute.radius()
        );
        assert!(
            safe < brute.radius() + ActionKind::Club.spec().length,
            "the dead zone is {safe}, which swallows the blade's own span"
        );

        // And the gradient is real in a running fight, not just on paper: the
        // worst blow a Brute lands on someone pressed against it against the
        // worst it lands at the end of its arc.
        let worst_at = |gap: i32| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[0].spawn =
                Vec2::new(Fx::from_int(18) - Fx::from_ratio(gap, 100), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let villain = w.alive_ids(Faction::Monsters)[0];
            let mut worst = Fx::ZERO;
            for _ in 0..1800u32 {
                if w.outcome().is_some() {
                    break;
                }
                let cut = cutting(&w, villain, Angle::HALF, Strike::Nearest);
                w.submit(villain, Command::swinging(Vec2::ZERO, hero, cut));
                // Pinned in place: this is a test of geometry, and a hero that
                // walked would be measuring its own footwork.
                w.submit(hero, Command::HOLD);
                for event in w.step() {
                    if let Event::Damage { amount, .. } = event {
                        worst = worst.max(*amount);
                    }
                }
            }
            worst
        };

        // 1.15 is body contact for this pair; 2.40 is out at the tip.
        let pressed = worst_at(115);
        let at_range = worst_at(240);
        assert!(at_range.is_positive(), "the tip band never connected");
        assert!(
            pressed * Fx::TWO < at_range,
            "crowding in took a {pressed} blow against {at_range} at range -- \
             getting inside a heavy weapon is supposed to be worth doing"
        );

        // And the floor is wired into the sim and not only into `dead_zone`:
        // whatever does get through at body contact clears `graze_floor`, so no
        // cut is ever spent on a touch worth less than that. Checked end to end
        // because the arithmetic above cannot tell whether `resolve_swings`
        // actually asks -- and for one release it did not.
        let floor = rules::graze_floor(arm, brute.base_stats());
        assert!(
            !pressed.is_positive() || pressed >= floor,
            "a blow of {pressed} landed against a graze floor of {floor}, so the \
             swing that threw it was spent on a scratch"
        );
    }

    #[test]
    fn nobody_heals_while_an_enemy_is_watching() {
        // Timing regeneration from the last blow alone is the obvious reading
        // and it quietly undoes the difficulty range: an exchange takes a couple
        // of seconds and `REGEN_DELAY` is three, so two fighters circling each
        // other at arm's length heal between every trade and a bad one can never
        // be ground down. It also reads badly -- wounds closing while an enemy
        // stands four feet away with a sword out.
        let mut scenario = Scenario::duel();
        scenario.units[0].spawn = Vec2::from_ints(4, 8);
        scenario.units[1].spawn = Vec2::from_ints(8, 8);
        let mut w = World::new(&scenario, 1);
        let hero = w.resolve(w.alive_ids(Faction::Heroes)[0]).unwrap();
        w.hp[hero] -= Fx::from_int(40);
        let wounded = w.hp[hero];

        // Well past `REGEN_DELAY`, in plain sight of the Brute: nothing.
        for _ in 0..(rules::REGEN_DELAY + 300) {
            w.regenerate();
            w.tick += 1;
        }
        assert_eq!(w.hp[hero], wounded, "healed with an enemy in sight");

        // Break contact and it works exactly as before.
        w.pos[hero] = Vec2::from_ints(2, 2);
        w.pos[1] = Vec2::from_ints(200, 200);
        for _ in 0..300 {
            w.regenerate();
            w.tick += 1;
        }
        assert!(w.hp[hero] > wounded, "could not recover out of contact");
    }

    #[test]
    fn recovery_is_a_budget_and_not_a_reset() {
        // Retreating to recover is a real tactic and has to stay one. What it
        // must not be is a way to un-lose an exchange indefinitely: without a
        // budget, a beaten fighter walks off, waits, and comes back whole, and
        // the fight has no reason ever to end. One full bar over the whole
        // fight, spent however it likes.
        let mut scenario = Scenario::duel();
        scenario.units[1].spawn = Vec2::from_ints(200, 200);
        let mut w = World::new(&scenario, 1);
        let hero = w.resolve(w.alive_ids(Faction::Heroes)[0]).unwrap();
        let full = w.max_hp[hero];
        assert_eq!(w.regen_left[hero], full * rules::REGEN_BUDGET);

        // Spend the budget in two goes, dropping to a sliver each time.
        let mut healed_total = Fx::ZERO;
        for _ in 0..4 {
            w.hp[hero] = Fx::ONE;
            let before = w.hp[hero];
            for _ in 0..3000 {
                w.regenerate();
                w.tick += 1;
            }
            healed_total += w.hp[hero] - before;
        }
        assert!(
            healed_total <= full * rules::REGEN_BUDGET + Fx::ONE,
            "healed {healed_total} against a budget of {}",
            full * rules::REGEN_BUDGET
        );
        assert!(healed_total > full * Fx::HALF, "the budget was never usable");
    }

    #[test]
    fn a_blow_into_a_recovery_hurts_more_than_the_same_blow_into_a_guard() {
        // The one term in the damage model that depends on what the *target* is
        // doing, and the reason timing an attack is worth more than throwing
        // one. Damage dealt used to be flat across every level of play measured:
        // a Brute is large, slow and never steps aside, so landing a blow was
        // never the hard part and there was nothing for a good fighter to be
        // good at on offence.
        //
        // Driven through the damage arithmetic directly rather than through a
        // staged fight, because the two runs have to differ in *exactly* one
        // thing and a live fight cannot promise that.
        let base = Fx::from_int(20);
        let punished = base * rules::RECOVERY_EXPOSURE;
        assert!(
            punished > base * Fx::from_ratio(13, 10),
            "punishing a recovery is barely worth more than trading"
        );
        assert!(
            punished < base * Fx::TWO,
            "punishing a recovery is worth so much the rest of the fight is noise"
        );

        // And the phase gate itself, in a running world: a Fighter cutting into
        // a Brute that is mid-recovery against the identical cut into one that
        // is not.
        let landed = |target_recovering: bool| -> Fx {
            let mut scenario = Scenario::duel();
            scenario.units[0].spawn = Vec2::from_ints(16, 8);
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            let mut w = World::new(&scenario, 7);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            let mut worst = Fx::ZERO;
            for _ in 0..600u32 {
                if w.outcome().is_some() {
                    break;
                }
                // Pin the Brute's sword into (or out of) a recovery every tick,
                // so the only thing that differs between the two runs is the
                // phase the blow arrives against.
                let b = w.resolve(brute).unwrap();
                if target_recovering {
                    w.limb[b].swing = Swing::Recover;
                    w.limb[b].swing_left = 200;
                } else {
                    w.limb[b].swing = Swing::Guard;
                }
                let cut = cutting(&w, hero, Angle::ZERO, Strike::Nearest);
                w.submit(hero, Command::swinging(Vec2::ZERO, brute, cut));
                w.submit(brute, Command::HOLD);
                for event in w.step() {
                    if let Event::Damage { target, amount, .. } = event {
                        if *target == brute {
                            worst = worst.max(*amount);
                        }
                    }
                }
            }
            worst
        };
        let into_recovery = landed(true);
        let into_guard = landed(false);
        assert!(into_guard.is_positive() && into_recovery.is_positive());
        assert!(
            into_recovery > into_guard,
            "a blow into a recovery did {into_recovery} against {into_guard} \
             into a guard -- reading the opening bought nothing"
        );
    }

    #[test]
    fn a_blow_moves_what_it_lands_on_and_a_planted_guard_takes_less_of_it() {
        // Two claims in one fixture because they need the same setup: a landed
        // blow shoves, and bracing is worth something beyond the damage
        // discount. Before this, a fighter who could not stop a blow anyway got
        // nothing at all for having read it coming.
        // A shield bearing has to be *found* rather than guessed, and the
        // reason is the same one `a_shield_covers_a_direction_and_only_that_direction`
        // records: a blade sweeps in and first bites well round the body from
        // where its wielder is standing, so pointing a guard at the enemy is not
        // pointing it at the blow. Sixteen bearings, and the ones that actually
        // caught something are the sample.
        let shoved = |braced: bool, guard: Option<Angle>| -> (Fx, bool) {
            let mut scenario = Scenario::duel();
            // Clear of each other: the two radii sum to 1.15, and a pair that
            // starts overlapping is shoved apart by `separate`, which would put
            // a velocity on both bodies that has nothing to do with the blow.
            scenario.units[0].spawn = Vec2::new(Fx::from_ratio(165, 10), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            // The defender is here to be blocked *through*, so it has to be
            // holding a guard rather than its default sword. `BRACE_ANCHOR` is
            // only ever charged against a limb that actually caught the blow.
            scenario.units[0].loadout = Loadout::single(ActionKind::Shield);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            let h = w.resolve(hero).unwrap();
            // Enough health that the fixture survives to be measured.
            w.hp[h] = Fx::from_int(4000);
            w.max_hp[h] = Fx::from_int(4000);
            if !braced {
                w.limb[h].braced = 0;
            }
            let shield = match guard {
                Some(at) => LimbCommand::new(at, Fx::ONE),
                None => LimbCommand::TUCKED,
            };
            for _ in 0..400u32 {
                let cut = cutting(&w, brute, Angle::HALF, Strike::Nearest);
                w.submit(brute, Command::swinging(Vec2::ZERO, hero, cut));
                w.submit(
                    hero,
                    Command::swinging(Vec2::ZERO, EntityId::NONE, shield),
                );
                if !braced {
                    w.limb[h].braced = 0;
                }
                let events = w.step();
                let landed = events.iter().any(|e| matches!(e, Event::Damage { .. }));
                let blocked = events.iter().any(|e| matches!(e, Event::Block { .. }));
                if landed {
                    return (w.vel[h].length(), blocked);
                }
            }
            (Fx::ZERO, false)
        };

        let (open, _) = shoved(false, None);
        assert!(
            open.is_positive(),
            "a blow that went home did not move the body it landed on"
        );

        let (mut snapped, mut planted) = (Fx::MAX, Fx::MAX);
        for step in 0..16u32 {
            let at = Angle::from_raw((step * 4096) as u16);
            if let (shove, true) = shoved(false, Some(at)) {
                snapped = snapped.min(shove);
            }
            if let (shove, true) = shoved(true, Some(at)) {
                planted = planted.min(shove);
            }
        }
        assert!(
            snapped < Fx::MAX && planted < Fx::MAX,
            "no bearing caught the blow at all, so this proves nothing about \
             what catching it is worth"
        );
        assert!(
            planted < snapped,
            "a shield planted for BRACE_TICKS took {planted} of shove against a \
             travelling one's {snapped}; setting your feet is supposed to be \
             worth something"
        );
        assert!(
            planted.is_positive(),
            "a braced guard cancelled the shove outright; a heavy blow is meant \
             to be felt through a shield, not switched off by one"
        );
    }

    #[test]
    fn a_heavy_blade_throws_a_guard_aside_and_a_light_one_bounces_off_it() {
        // **The inversion this phase exists to fix.** The old rule shoved a
        // blocking shield by a flat fraction of the *attacker's spin*, with no
        // mass anywhere in it -- so a Rogue's whippy 3461 disturbed a guard
        // nearly four times as hard as a Brute's 911, and the heaviest weapon in
        // the game was the one a shield had the easiest time holding.
        //
        // Both numbers come out of one collision between two arms now, so they
        // cannot contradict each other by construction: whatever the heavy blade
        // fails to give back to itself, it gave to the guard.
        let against = |attacker: Body| -> (Fx, Fx) {
            let mut s = Scenario::duel();
            s.units[0].set_body(Body::Fighter);
            s.units[0].stats = Body::Fighter.base_stats();
            s.units[0].spawn = Vec2::from_ints(14, 8);
            s.units[1].set_body(attacker);
            s.units[1].stats = attacker.base_stats();
            s.units[1].spawn = Vec2::from_ints(18, 8);
            let w = World::new(&s, 3);
            // Contact on the defender's near shoulder, about where a sweeping
            // cut first bites rather than dead on the line between them.
            let at = w.pos[0] + Vec2::new(Fx::from_ratio(30, 100), Fx::from_ratio(30, 100));
            let arm = w.arm(1);
            let mut w = w;
            w.limb[1].spin = arm.reachable_spin();
            w.limb[1].reach = Fx::ONE;
            w.limb[0].reach = Fx::ONE;
            let (rebound, knock) = w.deflect(1, 0, at, rules::BLOCK_RESTITUTION);
            // As fractions of the swing that threw it, so the two archetypes are
            // comparable despite a four-fold difference in spin.
            let spin = w.limb[1].spin;
            (rebound / spin, knock / spin)
        };

        let (brute_back, brute_knock) = against(Body::Brute);
        let (scout_back, scout_knock) = against(Body::Rogue);

        assert!(
            brute_knock.abs() > scout_knock.abs(),
            "an axe moved the guard by {brute_knock} of its own swing and a \
             short blade by {scout_knock} -- the heavy weapon is supposed to be \
             the hard one to hold off"
        );
        assert!(
            scout_back.abs() > brute_back.abs(),
            "the light blade kept {scout_back} of its swing and the heavy one \
             {brute_back}; meeting a guard is supposed to stop the small weapon \
             and barely trouble the big one"
        );
    }

    #[test]
    fn a_swing_costs_footing_only_when_something_stops_it() {
        // Recoil, and the threshold that makes it usable. A blade accelerates
        // the same way for tens of ticks running, so the reaction to a *smooth*
        // swing points one way the whole time and adds up; left unbounded it
        // came to more than a body's top speed across one cut and a fighter
        // could not close on anything it was swinging at. Static friction is the
        // answer, and it is the answer every swordsman demonstrates by not
        // sliding across the floor.
        //
        // What survives the threshold is the interesting half: a blade *stopped*
        // reverses in a single tick, and no footing holds that.
        let swing = |guard: Option<Angle>| -> Fx {
            let mut scenario = Scenario::duel();
            // Clear of each other: the two radii sum to 1.15, and a pair that
            // starts overlapping is shoved apart by `separate`, which would put
            // a velocity on both bodies that has nothing to do with the blow.
            scenario.units[0].spawn = Vec2::new(Fx::from_ratio(165, 10), Fx::from_int(8));
            scenario.units[1].spawn = Vec2::from_ints(18, 8);
            // What stops the cut has to be a guard: a blade in the way would
            // parry it instead, and a parry is a blade-on-blade collision with
            // its own restitution rather than the block this measures.
            scenario.units[0].loadout = Loadout::single(ActionKind::Shield);
            let mut w = World::new(&scenario, 1);
            let hero = w.alive_ids(Faction::Heroes)[0];
            let brute = w.alive_ids(Faction::Monsters)[0];
            let h = w.resolve(hero).unwrap();
            let b = w.resolve(brute).unwrap();
            w.hp[h] = Fx::from_int(4000);
            w.max_hp[h] = Fx::from_int(4000);
            // Either a Fighter standing there with a guard up, or nobody home.
            let shield = match guard {
                Some(at) => LimbCommand::new(at, Fx::ONE),
                None => {
                    w.pos[h] = Vec2::from_ints(2, 2);
                    LimbCommand::TUCKED
                }
            };
            let mut worst = Fx::ZERO;
            for _ in 0..400u32 {
                let cut = cutting(&w, brute, Angle::HALF, Strike::Nearest);
                w.submit(brute, Command::swinging(Vec2::ZERO, hero, cut));
                w.submit(
                    hero,
                    Command::swinging(Vec2::ZERO, EntityId::NONE, shield),
                );
                w.step();
                worst = worst.max(w.vel[b].length());
            }
            worst
        };

        let free = swing(None);
        // The bearing that actually catches the cut has to be found rather than
        // assumed; see the sweep in
        // `a_blow_moves_what_it_lands_on_and_a_planted_guard_takes_less_of_it`.
        let mut stopped = Fx::ZERO;
        for step in 0..16u32 {
            stopped = stopped.max(swing(Some(Angle::from_raw((step * 4096) as u16))));
        }
        let top = Body::Brute.base_stats().move_speed();
        assert!(
            free < rules::TRACTION_BASE,
            "a Brute swinging at empty air drifted at {free} a tick against a \
             footing of {}; a planted fighter's own smooth swing is supposed to \
             be held by its feet",
            rules::TRACTION_BASE
        );
        assert!(
            stopped > free && stopped > top / Fx::from_int(8),
            "being stopped moved the attacker {stopped} against {free} for a \
             clean swing and a top speed of {top} -- a cut that meets a shield \
             is supposed to cost ground"
        );
    }

    #[test]
    fn crossed_blades_deflect_both_swings() {
        // Two Warriors nose to nose, blades sweeping through the same space.
        let mut scenario = Scenario::duel();
        scenario.units[1].set_body(Body::Fighter);
        scenario.units[1].stats = Body::Fighter.base_stats();
        scenario.units[1].spawn = Vec2::from_ints(7, 8);
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        // Mirrored sides, so the two blades sweep *toward* each other. Matching
        // sides about opposing bearings is the subtle failure here: the pair
        // stays exactly antiparallel for the whole cut, which means the two
        // segments are parallel lines that never properly cross, and no parry
        // is ever reported however long the test runs.
        let mut parries = 0;
        let mut ended_an_attack = false;
        for _ in 0..1800u32 {
            let cut_a = cutting(&w, a, Angle::ZERO, Strike::Widdershins);
            let cut_b = cutting(&w, b, Angle::HALF, Strike::Sunwise);
            w.submit(a, Command::swinging(Vec2::ZERO, b, cut_a));
            w.submit(b, Command::swinging(Vec2::ZERO, a, cut_b));
            let mut parried_here = false;
            for event in w.step() {
                if let Event::Parry { a: x, b: y, .. } = event {
                    assert!(x.index < y.index, "a parry was reported unordered");
                    parries += 1;
                    parried_here = true;
                }
            }
            if parried_here {
                // Crossing steel does not merely deflect a swing now, it ends
                // it: both hands go to recovery, which is what makes catching a
                // cut on your own blade worth the tempo it costs.
                ended_an_attack |= w.limb[a.index as usize].swing == Swing::Recover
                    && w.limb[b.index as usize].swing == Swing::Recover;
            }
        }
        assert!(parries > 0, "blades swept through each other without meeting");
        assert!(
            ended_an_attack,
            "a parry left an attack still running on one side or the other"
        );
    }

    #[test]
    fn a_mirrored_duel_is_symmetric() {
        // Two identical fighters placed symmetrically must trade identically.
        // This is the test that catches an in-place resolution loop: resolve
        // spin changes as you go and the lower entity index quietly wins.
        let mut scenario = Scenario::duel();
        scenario.units[1].set_body(Body::Fighter);
        scenario.units[1].stats = Body::Fighter.base_stats();
        // 1.7 apart, symmetric about x = 12. Two units puts each Fighter's body
        // 1.55 from the other's centre against a blade that reaches 1.40, so
        // the pair swings all day and never touches -- and a symmetry test
        // between two zeros passes without proving anything.
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(1115, 100), Fx::from_int(8));
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(1285, 100), Fx::from_int(8));
        let mut w = World::new(&scenario, 1);
        let a = w.alive_ids(Faction::Heroes)[0];
        let b = w.alive_ids(Faction::Monsters)[0];

        // Symmetric under a half turn about the midpoint rather than under a
        // reflection, and the difference decides whether this test measures
        // anything. Reflected sides send the two blades head-on into each
        // other, so the pair parries every exchange and trades no damage at
        // all -- symmetric, and vacuous. Rotated sides keep the blades exactly
        // antiparallel, which never cross, so both cuts land and the assertion
        // has something to compare.
        //
        // The sides are named rather than left to `Strike::Nearest`, which is
        // the one command that cannot answer a perfectly symmetric situation
        // differently for the two fighters; see `Hand::begin`.
        let mut outcome = None;
        for _ in 0..1800u32 {
            let cut_a = cutting(&w, a, Angle::ZERO, Strike::Widdershins);
            let cut_b = cutting(&w, b, Angle::HALF, Strike::Widdershins);
            w.submit(a, Command::swinging(Vec2::ZERO, b, cut_a));
            w.submit(b, Command::swinging(Vec2::ZERO, a, cut_b));
            w.step();
            if let Some(o) = w.outcome() {
                outcome = Some(o);
                break;
            }
        }
        assert!(
            w.damage_dealt(Faction::Heroes).is_positive(),
            "the symmetric pair never landed anything, so this proves nothing"
        );
        // If it ended at all it has to have ended in a draw. Anything else means
        // one index resolved before the other somewhere in the tick loop.
        if let Some(o) = outcome {
            assert_eq!(
                o,
                Outcome::MutualDestruction,
                "a symmetric exchange produced a winner"
            );
        }
        assert_eq!(
            w.damage_dealt(Faction::Heroes),
            w.damage_dealt(Faction::Monsters),
            "a mirrored exchange favoured one side"
        );
        assert_eq!(
            w.health_fraction(Faction::Heroes),
            w.health_fraction(Faction::Monsters)
        );
    }

    #[test]
    fn an_arrow_stops_at_a_wall() {
        let mut w = carved_world(&[
            "#########", //
            "#..#....#",
            "#..#....#",
            "#########",
        ]);
        let archer = w.alive_ids(Faction::Heroes)[0];
        let i = archer.index as usize;
        let from = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        w.pos[i] = from;

        // The columns `loose` writes, written by hand: there is no way to put an
        // arrow in the air without a drawn bow and a phase edge, and none of
        // that is what this test is about. Due east at a whole tile a tick, so
        // the pillar column at x = 3 is met inside the first step and there is
        // nothing subtle about the arithmetic.
        let k = w.free_shot().expect("a free arrow slot");
        w.shot_alive[k] = true;
        w.shot_pos[k] = from;
        w.shot_vel[k] = Vec2::new(Fx::ONE, Fx::ZERO);
        w.shot_range[k] = Fx::from_int(20);
        w.shot_mass[k] = Fx::ONE;
        w.shot_power[k] = Fx::ONE;
        w.shot_owner[k] = archer;
        w.shot_faction[k] = Faction::Heroes;

        assert_eq!(w.shots().count(), 1);
        // Three ticks: the pillar is a tile and a half away, so the first tick
        // is honest open air and the arrow must survive it.
        w.resolve_shots();
        assert_eq!(w.shots().count(), 1, "stopped before it reached anything");
        w.resolve_shots();
        w.resolve_shots();
        assert_eq!(w.shots().count(), 0, "the arrow went through the wall");
        assert!(
            w.events.is_empty(),
            "a wall is not something to raise an event about"
        );
    }

    #[test]
    fn an_arrow_flies_down_an_open_corridor() {
        // The other half of the rule above: masonry stops an arrow, and open
        // ground does not stop it early.
        let mut w = carved_world(&[
            "#########", //
            "#.......#",
            "#########",
        ]);
        let archer = w.alive_ids(Faction::Heroes)[0];
        let from = Vec2::new(Fx::from_ratio(15, 10), Fx::from_ratio(15, 10));
        w.pos[archer.index as usize] = from;
        // Nobody to hit: the archer is the only body in the room, and a shot
        // never resolves against its own owner however the flight curves back.

        let k = w.free_shot().expect("a free arrow slot");
        w.shot_alive[k] = true;
        w.shot_pos[k] = from;
        w.shot_vel[k] = Vec2::new(Fx::from_ratio(5, 10), Fx::ZERO);
        w.shot_range[k] = Fx::from_int(20);
        w.shot_mass[k] = Fx::ONE;
        w.shot_power[k] = Fx::ONE;
        w.shot_owner[k] = archer;
        w.shot_faction[k] = Faction::Heroes;

        for _ in 0..8 {
            w.resolve_shots();
        }
        assert_eq!(w.shots().count(), 1, "stopped in mid-air");
        assert!(w.shot_pos[k].x > Fx::from_int(5));
    }

    /// Puts the roster's longest weapon in a Fighter's hand, points it due east
    /// at a Skitterer 1.75 away, and resolves one tick of swing. Answers what the
    /// Skitterer lost.
    ///
    /// `Club` because it is the 1.45 row -- the Brute's axe, and the only thing
    /// in the game long enough to make this a live question. A Fighter's 0.45
    /// plus 1.45 of haft plus a Skitterer's 0.30 is 2.20 of pair reach against
    /// the 1.75 that two bodies pressed on opposite faces of one tile of masonry
    /// are apart, so the geometry overlaps by 0.45 and the only thing that can
    /// stop the blow is the rule under test.
    ///
    /// No sweep: `blade_was` is left `None`, so the blade is tested where it is
    /// -- which is what the un-swept version did for everything and is all this
    /// needs. What it does need is spin, because a resting blade does no damage
    /// however squarely it overlaps a body.
    fn one_long_swing(rows: &[&str], row: i32) -> (World, Fx, Fx) {
        let y = Fx::from_int(row) + Fx::HALF;
        let mut scenario = Scenario::duel();
        scenario.dungeon = crate::dungeon::parse(rows);
        scenario.units[0].spawn = Vec2::new(Fx::from_ratio(255, 100), y);
        scenario.units[0].loadout = Loadout::single(ActionKind::Club);
        scenario.units[1].kind = Body::Skitterer;
        scenario.units[1].stats = Body::Skitterer.base_stats();
        scenario.units[1].loadout = Loadout::single(ActionKind::Knife);
        scenario.units[1].spawn = Vec2::new(Fx::from_ratio(430, 100), y);
        let mut w = World::new(&scenario, 1);

        let (i, j) = (
            w.alive_ids(Faction::Heroes)[0].index as usize,
            w.alive_ids(Faction::Monsters)[0].index as usize,
        );
        let before = w.hp[j];
        w.limb[i].angle = Angle::ZERO; // due east, straight at the Skitterer
        w.limb[i].reach = Fx::ONE;
        w.limb[i].swing = Swing::Strike;
        w.limb[i].spin = Fx::from_int(4_000);

        // The geometry, before the floor plan gets a say: the blade genuinely
        // crosses the body. Without this a passing test proves only that
        // something else missed.
        let (base, tip) = w.blade(i).expect("the blade is out");
        assert!(
            fx::segment_circle(base, tip, w.pos[j], w.radius[j]).is_some(),
            "premise: the blade does not reach the body at all"
        );

        w.resolve_swings();
        let lost = before - w.hp[j];
        (w, before, lost)
    }

    #[test]
    fn a_blade_cannot_cut_through_a_one_tile_wall() {
        //   0123456789
        let (w, before, lost) = one_long_swing(
            &[
                "##########", // 0
                "#..#.....#", // 1  a pillar at (3, 1)
                "#........#", // 2
                "##########", // 3
            ],
            1,
        );
        assert_eq!(lost, Fx::ZERO, "the axe cut through a tile of masonry");
        assert_eq!(w.damage_dealt(Faction::Heroes), Fx::ZERO);
        // No event either, which is the same treatment an arrow that meets rock
        // gets: the blow did not happen, so there is nothing to report.
        assert!(
            w.events.is_empty(),
            "a wall is not something to raise an event about: {:?}",
            w.events
        );
        assert!(before.is_positive(), "premise: there was health to take");
    }

    #[test]
    fn a_blade_still_cuts_what_it_can_see() {
        // The masonry test must not be a blanket refusal, and the level here is
        // still `carved` -- so `raycast` really runs and really answers "nothing
        // in the way". The only difference from the test above is which row the
        // pair stands in.
        let (w, _, lost) = one_long_swing(
            &[
                "##########", // 0
                "#..#.....#", // 1
                "#........#", // 2  the same span of floor, uninterrupted
                "##########", // 3
            ],
            2,
        );
        assert!(w.dungeon.carved(), "premise: the plan has rock in it");
        assert!(lost.is_positive(), "the axe stopped at open air");
    }

    #[test]
    fn a_blade_that_crosses_a_body_inside_one_tick_still_bills_a_blow() {
        // The sweep, end to end.
        //
        // A hand turning fast enough can put its tip on the far side of a body
        // between two samples, and a closest-approach test then sees a blade
        // that was never near anyone. It used to be held off by capping how
        // fast a hand may turn -- a *physics* limit imposed by a hit test,
        // which is exactly backwards, and a cap that has to go the moment a
        // blow can throw a body faster than it walks.
        let mut w = duel_world();
        let brute = w.alive_ids(Faction::Monsters)[0];
        let hero = w.alive_ids(Faction::Heroes)[0];
        let (i, j) = (brute.index as usize, hero.index as usize);

        // Hero two units due east of the brute, well inside its 2.15 of reach.
        // Nobody is walking, so the only motion in the tick is the arm's.
        w.pos[i] = w.pos[j] - Vec2::new(Fx::TWO, Fx::ZERO);
        w.start_pos[i] = w.pos[i];
        w.start_pos[j] = w.pos[j];
        w.limb[i].reach = Fx::ONE;
        w.limb[i].swing = Swing::Strike;
        w.limb[i].spin = Fx::from_int(4_000);

        // A quarter turn in one tick: 22.5 degrees short of the hero to 22.5
        // degrees past it. The blade is clear of the body at *both* ends and
        // squarely through it in the middle.
        w.limb[i].angle = Angle::from_raw(61_440);
        let before = w.blade(i).expect("the blade is out");
        w.limb[i].angle = Angle::from_raw(4_096);
        let after = w.blade(i).expect("the blade is out");

        for (label, (base, tip)) in [("before", before), ("after", after)] {
            assert!(
                fx::segment_circle(base, tip, w.pos[j], w.radius[j]).is_none(),
                "premise: the {label} sample should miss, or this proves nothing"
            );
        }

        // Health, and not `self.blows`, because pass 2 drains that buffer
        // before it returns -- asserting on it would pass for both outcomes.
        let full = w.hp[j];

        // A blade with no history is tested where it is, and misses. This is
        // precisely what the old code did on every tick of every fight.
        w.blade_was[i] = None;
        w.resolve_swings();
        assert_eq!(w.hp[j], full, "premise: nothing to sweep, nothing to hit");

        w.limb[i].swing = Swing::Strike;
        w.limb[i].spin = Fx::from_int(4_000);
        w.blade_was[i] = Some(before);
        w.resolve_swings();
        assert!(w.hp[j] < full, "the blade passed clean through a body");
    }

    #[test]
    fn impact_is_the_blade_plus_the_closing_and_backing_off_helps() {
        // The two terms, separated. Spin does not care which way it turns --
        // a blade cuts on the backswing too -- but the bodies' closing speed is
        // signed, so retreating from a blow takes something off it.
        let mut w = duel_world();
        let brute = w.alive_ids(Faction::Monsters)[0];
        let hero = w.alive_ids(Faction::Heroes)[0];
        let (i, j) = (brute.index as usize, hero.index as usize);
        w.limb[i].reach = Fx::ONE;
        // Brute two units east of the hero; contact on the hero's eastern
        // surface, which is the side the blow is coming from. "Away" is then
        // due west, and the sign of the closing term is unambiguous.
        w.pos[i] = w.pos[j] + Vec2::new(Fx::TWO, Fx::ZERO);
        let contact = w.pos[j] + Vec2::new(w.radius[j], Fx::ZERO);

        w.limb[i].spin = Fx::from_int(900);
        let clockwise = w.impact_speed(i, j, contact);
        w.limb[i].spin = Fx::from_int(-900);
        let widdershins = w.impact_speed(i, j, contact);
        assert!(clockwise.is_positive(), "a moving blade registered nothing");
        assert_eq!(clockwise, widdershins, "the backswing is not a cut");

        // Now give the defender some motion. Away from the contact is worth
        // less damage; into it is worth more.
        let away = Vec2::new(-Fx::from_ratio(6, 100), Fx::ZERO);
        w.vel[j] = away;
        let retreating = w.impact_speed(i, j, contact);
        w.vel[j] = -away;
        let charging = w.impact_speed(i, j, contact);
        assert!(
            retreating < widdershins && widdershins < charging,
            "closing speed did not register: {retreating} / {widdershins} / {charging}"
        );
    }

    // ---------------------------------------------------------------- the swap

    /// A Fighter at striking distance carrying sword-and-shield, and an attacker
    /// of `body` pressing **one** cut into it. Returns whether that cut was
    /// blocked.
    ///
    /// The defender reaches for its shield the first time it *notices* a windup,
    /// and it only notices on its own decision ticks -- every
    /// `Stats::decision_period`, which for a Fighter is 12. That latency is not
    /// a handicap invented for the test; it is the whole of what `intellect`
    /// buys in this game, and a fighter that reacted on the exact tick a blade
    /// moved would not be a fighter.
    ///
    /// Worth knowing, because the naive arithmetic is wrong in a way that
    /// flatters the defender: the budget is **not** just the telegraph. A cut
    /// also has to travel, and contact happens some way into the strike phase,
    /// so the true window is windup plus part of the swing. Reaching at tick
    /// zero, a Fighter can get a shield up inside even a knife. It is reaction
    /// latency that makes a fast weapon unanswerable, not the telegraph alone --
    /// which is a better fact than the one the tuning was designed around, and
    /// it is why this is measured through a live world instead of on paper.
    fn answered_by_a_swap(attacker: Body, guard_at: Angle) -> bool {
        let mut scenario = Scenario::duel();
        scenario.units[0].set_body(Body::Fighter);
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Shield);
        scenario.units[0].spawn = Vec2::from_ints(17, 8);
        scenario.units[1].set_body(attacker);
        scenario.units[1].spawn = Vec2::from_ints(18, 8);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let foe = w.alive_ids(Faction::Monsters)[0];
        // Enough health to survive being measured.
        let h = w.resolve(hero).unwrap();
        w.hp[h] = Fx::from_int(4000);
        w.max_hp[h] = Fx::from_int(4000);

        let period = Body::Fighter.base_stats().decision_period() as u32;
        let mut reaching = false;
        let mut committed = false;
        let mut saw_windup_at: Option<u32> = None;
        for tick in 0..400u32 {
            let cut = cutting(&w, foe, Angle::HALF, Strike::Nearest);
            w.submit(foe, Command::swinging(Vec2::ZERO, hero, cut));

            // The read, on this fighter's own clock. It sees the blade cocked,
            // and acts on it at its next decision.
            let phase = w.view(foe).unwrap().limb.swing;
            if phase == Swing::Windup && saw_windup_at.is_none() {
                saw_windup_at = Some(tick);
            }
            if let Some(seen) = saw_windup_at {
                if tick >= seen + period {
                    reaching = true;
                }
            }
            if phase.is_attacking() {
                committed = true;
            }
            let mut answer = Command::swinging(
                Vec2::ZERO,
                EntityId::NONE,
                LimbCommand::new(guard_at, Fx::ONE),
            );
            answer.slot = if reaching { 1 } else { 0 };
            w.submit(hero, answer);

            if w.step().iter().any(|e| matches!(e, Event::Block { .. })) {
                return true;
            }
            // **Measure exactly one cut.** Left running, the defender ends up
            // standing behind a shield it drew during the first telegraph and
            // blocks the fifth attack -- which says nothing about whether the
            // telegraph could be answered, and would let a knife pass this by
            // being thrown repeatedly.
            if committed && w.view(foe).unwrap().limb.swing == Swing::Guard {
                return false;
            }
        }
        false
    }

    /// **Constraint 1 of the swap tuning, through a live world.**
    ///
    /// A club announces for 33 ticks on the Brute that carries one, and a
    /// Fighter draws a shield in 9 plus two of extension. Reading the telegraph
    /// and reaching for the guard is therefore a real answer to a heavy weapon,
    /// and it is the play the whole loadout exists to make possible.
    #[test]
    fn a_club_can_be_answered_by_swapping_to_a_guard() {
        // The bearing a cut first bites on is not the bearing the attacker
        // stands at -- see `a_shield_covers_a_direction_and_only_that_direction`
        // -- so the guard has to be swept for rather than guessed.
        let caught = (0..16u32).any(|step| {
            answered_by_a_swap(Body::Brute, Angle::from_raw((step * 4096) as u16))
        });
        assert!(
            caught,
            "no bearing answered a club by swapping to a shield; a heavy weapon \
             is supposed to be slow enough to read, and if it is not then the \
             guard is a slot nobody would ever spend"
        );
    }

    /// **Constraint 2, and it holds by construction rather than by tuning.**
    ///
    /// A knife announces for 7 ticks. The fastest shield draw in the game is 9
    /// on a Fighter and 7 on a Rogue, before the two ticks of extension it takes
    /// to cover anything -- so no amount of reading beats it, at any bearing,
    /// with zero reaction latency. That is what makes a fast weapon worth
    /// holding, and it is the other half of the ladder the club test opens.
    #[test]
    fn a_knife_cannot_be_answered_by_swapping_to_a_guard() {
        let caught = (0..16u32).any(|step| {
            answered_by_a_swap(Body::Skitterer, Angle::from_raw((step * 4096) as u16))
        });
        assert!(
            !caught,
            "a knife was blocked by a fighter that started reaching only when \
             the telegraph began; fast weapons are supposed to be unanswerable \
             and that is the whole reason to carry one"
        );
    }

    #[test]
    fn a_swap_is_refused_unless_the_limb_is_at_guard() {
        let mut scenario = Scenario::duel();
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Shield);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();

        // Throw a cut, and ask to swap on every tick once it is under way. The
        // request must be ignored for as long as the attack is running -- a
        // swap out of a committed cut would make overcommitting free.
        //
        // The slot request is withheld until the blade is actually moving,
        // because at guard it would simply be granted and there would be no
        // attack left to refuse it during.
        let mut refused_during = 0u32;
        for _ in 0..200u32 {
            let mut cmd = Command::swinging(
                Vec2::ZERO,
                EntityId::NONE,
                LimbCommand::attack(Angle::ZERO, Strike::Nearest),
            );
            cmd.slot = if w.limb[h].swing == Swing::Guard && refused_during == 0 {
                0
            } else {
                1
            };
            w.submit(hero, cmd);
            w.step();
            if matches!(
                w.limb[h].swing,
                Swing::Windup | Swing::Strike | Swing::Recover
            ) {
                refused_during += 1;
                assert_eq!(
                    w.slot[h], 0,
                    "the slot changed while the limb was mid-{}",
                    w.limb[h].swing.name()
                );
            }
            if w.limb[h].swing.is_dormant() {
                break;
            }
        }
        assert!(
            refused_during > 5,
            "the attack never ran, so nothing was actually refused"
        );
        assert_eq!(w.slot[h], 1, "the swap was never honoured at all");
    }

    /// An archer at `apart` units, facing a defender holding `defence`.
    ///
    /// Its own scenario rather than `Scenario::duel`, whose twelve units of
    /// separation is further than some bodies can see and therefore further than
    /// their arrows carry.
    fn archery_range(apart: i32, defence: ActionKind) -> (World, EntityId, EntityId) {
        let scenario = Scenario {
            name: "archery".to_string(),
            combat_model: crate::CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            max_ticks: 60 * 60,
            units: vec![
                UnitSpec {
                    kind: Body::Fighter,
                    faction: Faction::Heroes,
                    stats: Body::Fighter.base_stats(),
                    loadout: Loadout::single(ActionKind::Bow),
                    articulated: None,
                    spawn: Vec2::from_ints(6, 8),
                },
                UnitSpec {
                    kind: Body::Fighter,
                    faction: Faction::Monsters,
                    stats: Body::Fighter.base_stats(),
                    loadout: Loadout::single(defence),
                    articulated: None,
                    spawn: Vec2::from_ints(6 + apart, 8),
                },
            ],
        };
        let w = World::new(&scenario, 1);
        let archer = w.alive_ids(Faction::Heroes)[0];
        let target = w.alive_ids(Faction::Monsters)[0];
        (w, archer, target)
    }

    /// Holds both fighters still and makes the archer shoot down +x, returning
    /// every event the fight produced.
    ///
    /// Everyone else stands their ground with the limb held out **back down the
    /// line the arrows are coming along** -- 180 degrees, because the archer is
    /// at lower `x` and a blow arriving from it touches the far side of the
    /// body. That is the command a defender would actually give, and it is load
    /// bearing for anything holding a guard: `block_leak` refuses a limb under
    /// `MIN_BLOCK_REACH`, so a shield sent `Command::HOLD` is tucked, covers
    /// nothing, and would make "a shield stops an arrow" fail for a reason that
    /// has nothing to do with arrows.
    fn shoot_for(w: &mut World, archer: EntityId, ticks: u32) -> Vec<Event> {
        let mut seen = Vec::new();
        for _ in 0..ticks {
            for id in w.pending_decisions().to_vec() {
                let cmd = if id == archer {
                    Command::swinging(
                        Vec2::ZERO,
                        EntityId::NONE,
                        LimbCommand::attack(Angle::ZERO, Strike::Nearest),
                    )
                } else {
                    Command::swinging(
                        Vec2::ZERO,
                        EntityId::NONE,
                        LimbCommand::new(Angle::from_degrees(180), Fx::ONE),
                    )
                };
                w.submit(id, cmd);
            }
            seen.extend_from_slice(w.step());
        }
        seen
    }

    /// The numbers a bow is priced on, printed rather than asserted.
    ///
    /// `cargo test -p sim the_bow_numbers -- --nocapture`. Every figure here is
    /// derived, so this is the table to read before touching the row.
    #[test]
    fn the_bow_numbers() {
        for body in Body::ALL {
            let stats = body.base_stats();
            let arm = rules::Arm::resolve(ActionKind::Bow.spec(), stats, body.radius());
            let speed = rules::shot_speed(arm);
            let damage = rules::blow_damage(
                arm.spec.mass,
                speed,
                rules::power_multiplier(stats.power),
            );
            let sword = rules::Arm::resolve(ActionKind::Sword.spec(), stats, body.radius());
            let cycle = rules::phase_ticks(arm.spec.windup, arm.agility)
                + rules::SHOT_RELEASE_TICKS
                + rules::phase_ticks(arm.spec.recovery, arm.agility);
            println!(
                "{:<10} arrow {:>7.4}/tick  dmg {:>6.2} ({:>4.1}% of {:.0} hp)  \
                 cycle {:>3}t  dps {:>5.2}  | sword peak {:>6.2}",
                body.name(),
                speed.to_f32(),
                damage.to_f32(),
                100.0 * damage.to_f32() / stats.max_hp().to_f32(),
                stats.max_hp().to_f32(),
                cycle,
                damage.to_f32() * 60.0 / cycle as f32,
                rules::peak_damage(sword, stats).to_f32(),
            );
        }
    }

    /// **The bow's whole claim**: it reaches somewhere no blade in the game can.
    ///
    /// Eight units apart is more than five times a Fighter's total reach, so a
    /// blow landing at all here cannot have been a cut -- there is no geometry
    /// by which a sword arrives, and the assertion needs no epsilon to say so.
    #[test]
    fn a_bow_puts_an_arrow_in_the_air_and_the_arrow_carries_the_blow() {
        let (mut w, archer, target) = archery_range(8, ActionKind::Punch);
        let a = w.resolve(archer).unwrap();
        let t = w.resolve(target).unwrap();
        let reach = w.radius[a] + ActionKind::Sword.spec().length + w.radius[t];
        assert!(
            (w.pos[t] - w.pos[a]).length() > reach * Fx::TWO,
            "the harness put them inside a blade's length of each other"
        );

        let events = shoot_for(&mut w, archer, 200);
        assert!(
            events
                .iter()
                .any(|e| matches!(e, Event::Loose { source, .. } if *source == archer)),
            "the bow never loosed"
        );
        let hits: Vec<_> = events
            .iter()
            .filter_map(|e| match e {
                Event::Damage { target: to, amount, .. } if *to == target => Some(*amount),
                _ => None,
            })
            .collect();
        assert!(!hits.is_empty(), "every arrow missed a stationary target");
        assert!(
            hits.iter().all(|d| d.is_positive()),
            "an arrow landed for nothing: {hits:?}"
        );
        assert!(w.hp[t] < w.max_hp[t], "the target took no damage");
    }

    /// An arrow is spent on the first thing it meets, and never on its own side.
    #[test]
    fn an_arrow_does_not_hit_its_own_side() {
        let mut scenario = Scenario {
            name: "crossfire".to_string(),
            combat_model: crate::CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            max_ticks: 60 * 60,
            units: vec![],
        };
        for (n, (faction, x)) in [
            (Faction::Heroes, 6),  // the archer
            (Faction::Heroes, 10), // a friend directly on the line
            (Faction::Monsters, 14),
        ]
        .into_iter()
        .enumerate()
        {
            scenario.units.push(UnitSpec {
                kind: Body::Fighter,
                faction,
                stats: Body::Fighter.base_stats(),
                loadout: Loadout::single(if n == 0 {
                    ActionKind::Bow
                } else {
                    ActionKind::Punch
                }),
                articulated: None,
                spawn: Vec2::from_ints(x, 8),
            });
        }
        let mut w = World::new(&scenario, 1);
        let archer = w.alive_ids(Faction::Heroes)[0];
        let friend = w.alive_ids(Faction::Heroes)[1];
        let f = w.resolve(friend).unwrap();
        let before = w.hp[f];

        let events = shoot_for(&mut w, archer, 200);
        assert!(
            events.iter().any(|e| matches!(e, Event::Loose { .. })),
            "the bow never loosed"
        );
        assert_eq!(w.hp[f], before, "an arrow went through a friend");
        assert!(
            !events
                .iter()
                .any(|e| matches!(e, Event::Damage { target, .. } if *target == friend)),
            "a friend was billed for a blow"
        );
    }

    /// **The same guard rule a blade meets**, which is the reason `resolve_shots`
    /// calls `block_leak` rather than growing a second defensive mechanic.
    #[test]
    fn a_shield_stops_an_arrow() {
        fn taken(defence: ActionKind) -> (Fx, usize) {
            let (mut w, archer, target) = archery_range(8, defence);
            let t = w.resolve(target).unwrap();
            let before = w.hp[t];
            let events = shoot_for(&mut w, archer, 300);
            let blocks = events
                .iter()
                .filter(|e| matches!(e, Event::Block { defender, .. } if *defender == target))
                .count();
            (before - w.hp[t], blocks)
        }

        let (bare, no_blocks) = taken(ActionKind::Punch);
        let (behind_shield, blocks) = taken(ActionKind::Shield);
        assert_eq!(no_blocks, 0, "a fist blocked something");
        assert!(blocks > 0, "a shield never registered stopping an arrow");
        assert!(bare.is_positive(), "the unguarded control took nothing");
        assert!(
            behind_shield < bare,
            "a shield let through {behind_shield:?} of the {bare:?} it faced bare"
        );
    }

    /// An arrow that meets nobody stops being in the world, rather than
    /// accumulating forever at the far wall.
    #[test]
    fn an_arrow_expires_rather_than_flying_forever() {
        let scenario = Scenario {
            name: "empty range".to_string(),
            combat_model: crate::CombatModel::Legacy,
            combat_specs: None,
            dungeon: Dungeon::open(24, 16),
            portal: None,
            torches: Vec::new(),
            max_ticks: 60 * 60,
            units: vec![UnitSpec {
                kind: Body::Fighter,
                faction: Faction::Heroes,
                stats: Body::Fighter.base_stats(),
                loadout: Loadout::single(ActionKind::Bow),
                articulated: None,
                spawn: Vec2::from_ints(4, 8),
            }],
        };
        let mut w = World::new(&scenario, 1);

        let mut peak = 0usize;
        for _ in 0..900 {
            for id in w.pending_decisions().to_vec() {
                w.submit(
                    id,
                    Command::swinging(
                        Vec2::ZERO,
                        EntityId::NONE,
                        LimbCommand::attack(Angle::ZERO, Strike::Nearest),
                    ),
                );
            }
            w.step();
            peak = peak.max(w.shots().count());
        }
        assert!(peak > 0, "fifteen seconds of shooting produced no arrow");
        // One archer, one arrow: the draw-release-recover cycle is longer than
        // the flight, which is the argument `rules::MAX_SHOTS` is sized on.
        assert!(peak <= 2, "{peak} arrows up at once from a single bow");
        assert!(
            w.shot_alive.len() <= rules::MAX_SHOTS,
            "the arrow pool grew past its ceiling"
        );
    }

    /// An arrow is a fact about the past: it outlives the archer, keeps the
    /// faction it was loosed for, and credits nobody once its owner is gone.
    #[test]
    fn an_arrow_outlives_the_fighter_that_loosed_it() {
        let (mut w, archer, _target) = archery_range(10, ActionKind::Punch);
        let a = w.resolve(archer).unwrap();

        // Fly one arrow, then kill the archer while it is still crossing.
        let mut launched = false;
        for _ in 0..300 {
            for id in w.pending_decisions().to_vec() {
                let cmd = if id == archer {
                    Command::swinging(
                        Vec2::ZERO,
                        EntityId::NONE,
                        LimbCommand::attack(Angle::ZERO, Strike::Nearest),
                    )
                } else {
                    Command::HOLD
                };
                w.submit(id, cmd);
            }
            if w.step().iter().any(|e| matches!(e, Event::Loose { .. })) {
                launched = true;
                break;
            }
        }
        assert!(launched, "the bow never loosed");
        assert_eq!(w.shots().count(), 1, "expected exactly one arrow up");

        w.hp[a] = Fx::ZERO;
        w.step(); // reaps the archer
        assert!(!w.alive[a], "the archer survived being emptied");
        assert_eq!(
            w.shots().count(),
            1,
            "the arrow died with the hand that threw it"
        );

        // And it still arrives, still billed to a handle that no longer resolves.
        let mut landed = false;
        for _ in 0..300 {
            for id in w.pending_decisions().to_vec() {
                w.submit(id, Command::HOLD);
            }
            if w
                .step()
                .iter()
                .any(|e| matches!(e, Event::Damage { source, .. } if *source == archer))
            {
                landed = true;
                break;
            }
        }
        assert!(landed, "a dead archer's arrow evaporated");
        assert!(w.resolve(archer).is_none(), "the handle still resolves");
    }

    /// `segment_circle` is a closest-approach test and is exact only while the
    /// *circle* does not cross itself between samples. The arrow's own travel is
    /// the segment and so is swept exactly; what has to hold is the margin on
    /// the body it is tested against.
    #[test]
    fn an_arrow_cannot_tunnel_through_a_body() {
        for body in Body::ALL {
            let arm = rules::Arm::resolve(
                ActionKind::Bow.spec(),
                body.base_stats(),
                body.radius(),
            );
            let speed = rules::shot_speed(arm);
            let smallest = Body::ALL
                .iter()
                .map(|b| b.radius())
                .fold(Fx::MAX, |a, b| if b < a { b } else { a });
            // The test that matters is the *body's* per-tick travel against its
            // own radius, not the arrow's -- but an arrow that outran the sweep
            // entirely would be the louder bug, so both are stated.
            let walk = body.base_stats().move_speed();
            assert!(
                walk * Fx::TWO < smallest,
                "{} covers {walk:?} a tick against a {smallest:?} body",
                body.name()
            );
            assert!(
                speed.is_positive(),
                "{}'s arrow does not move",
                body.name()
            );
        }
    }

    /// Legs are not a weapon and not a guard, and the price of holding them is
    /// that they are neither. The twin of
    /// `a_swapping_limb_neither_cuts_nor_blocks_nor_parries`, for a limb that is
    /// helpless by loadout rather than by phase.
    #[test]
    fn a_run_limb_neither_cuts_nor_blocks_nor_parries() {
        let mut scenario = Scenario::duel();
        scenario.units[0].loadout = Loadout::single(ActionKind::Run);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();

        for tick in 0..60 {
            // Asking for everything a blade could be asked for, every tick.
            w.submit(
                hero,
                Command::swinging(
                    Vec2::ZERO,
                    EntityId::NONE,
                    LimbCommand::attack(Angle::ZERO, Strike::Nearest),
                ),
            );
            w.step();
            assert!(w.blade(h).is_none(), "legs were a blade on tick {tick}");
            assert!(
                w.block_leak(h, w.pos[h] + Vec2::X).is_none(),
                "legs covered a bearing on tick {tick}"
            );
            assert!(!w.can_parry(h), "legs could parry on tick {tick}");
            assert_eq!(
                w.limb[h].swing,
                Swing::Guard,
                "legs entered {} on tick {tick}",
                w.limb[h].swing.name()
            );
        }
    }

    #[test]
    fn a_swapping_limb_neither_cuts_nor_blocks_nor_parries() {
        let mut scenario = Scenario::duel();
        scenario.units[0].loadout = Loadout::pair(ActionKind::Sword, ActionKind::Club);
        let mut w = World::new(&scenario, 1);
        let hero = w.alive_ids(Faction::Heroes)[0];
        let h = w.resolve(hero).unwrap();

        let mut cmd = Command::swinging(
            Vec2::ZERO,
            EntityId::NONE,
            LimbCommand::new(Angle::ZERO, Fx::ONE),
        );
        cmd.slot = 1;
        w.submit(hero, cmd);
        w.step();
        assert!(w.limb[h].swing.is_dormant(), "the swap never began");

        let mut ticks = 0u32;
        while w.limb[h].swing.is_dormant() {
            assert!(
                w.blade(h).is_none(),
                "a swapping limb was still a blade on tick {ticks}"
            );
            assert!(
                w.block_leak(h, w.pos[h] + Vec2::X).is_none(),
                "a swapping limb still covered a bearing on tick {ticks}"
            );
            assert!(
                !w.can_parry(h),
                "a swapping limb could still parry on tick {ticks}"
            );
            w.submit(hero, cmd);
            w.step();
            ticks += 1;
            assert!(ticks < 200, "the swap never finished");
        }
        // And on the far side it is a club, not a sword.
        assert_eq!(w.action_of(h), ActionKind::Club);
    }
}
