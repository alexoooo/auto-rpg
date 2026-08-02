use crate::action::{Action, Order};
use crate::entity::{EntityId, Faction};
use crate::scenario::Scenario;
use crate::world::World;

/// One decision, as it was made.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ActionRecord {
    pub tick: u32,
    pub entity: EntityId,
    pub action: Action,
}

/// One standing order, as the player gave it.
///
/// Orders are an input just as much as agent decisions are, and a replay that
/// records only half the inputs reproduces only half the run.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct OrderRecord {
    pub tick: u32,
    pub faction: Faction,
    pub order: Order,
}

/// A complete, replayable run.
///
/// # Why this records actions and not observations
///
/// The obvious design is to log the seed and re-run the policies. That works
/// right up until a policy is a neural network, and then it stops: a matrix
/// multiply reduced by a wasm SIMD kernel and one reduced by native AVX can
/// differ in the last bit, an `argmax` flips on a near-tie, and the replay
/// diverges from the run it claims to reproduce.
///
/// Recording the *decisions* sidesteps that entirely. Playback never runs
/// inference at all -- it feeds the sim exactly the actions the sim was fed the
/// first time. So the portability requirement lands only on [`World`], which is
/// pure fixed-point integer arithmetic and genuinely is bit-identical
/// everywhere. The policy is free to be as unportable as it likes.
///
/// The cost is size: one record per agent per decision rather than one seed.
/// At 30 agents deciding every 10 ticks that is ~180 records/second, or a few
/// hundred KB for a long fight before any compression. Cheap for what it buys.
#[derive(Clone, Debug)]
pub struct Replay {
    pub seed: u64,
    pub scenario: Scenario,
    /// [`Scenario::fingerprint`] at record time, so playback can detect that
    /// the scenario has been edited underneath it.
    pub scenario_fingerprint: u64,
    /// How many ticks the original run lasted. Playback stops here even if the
    /// last decisions came earlier.
    pub ticks: u32,
    pub entries: Vec<ActionRecord>,
    /// Player orders, in the order they were issued.
    pub orders: Vec<OrderRecord>,
}

impl Replay {
    pub fn new(scenario: &Scenario, seed: u64) -> Replay {
        Replay {
            seed,
            scenario: scenario.clone(),
            scenario_fingerprint: scenario.fingerprint(),
            ticks: 0,
            entries: Vec::new(),
            orders: Vec::new(),
        }
    }

    pub fn record(&mut self, tick: u32, entity: EntityId, action: Action) {
        self.entries.push(ActionRecord {
            tick,
            entity,
            action,
        });
    }

    pub fn record_order(&mut self, tick: u32, faction: Faction, order: Order) {
        self.orders.push(OrderRecord {
            tick,
            faction,
            order,
        });
    }

    /// Marks how long the run lasted. Call once, when the run ends.
    pub fn finish(&mut self, ticks: u32) {
        self.ticks = ticks;
    }

    pub fn is_intact(&self) -> bool {
        self.scenario.fingerprint() == self.scenario_fingerprint
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Re-runs the recorded decisions and returns the final world.
    ///
    /// No policy is consulted, so this is exact by construction as long as the
    /// sim itself is deterministic.
    pub fn play(&self) -> World {
        self.play_until(self.ticks)
    }

    pub fn play_until(&self, ticks: u32) -> World {
        let mut world = World::new(&self.scenario, self.seed);
        let mut next_action = 0;
        let mut next_order = 0;

        loop {
            // Orders are applied before the tick check so that a replay stopped
            // at tick T still ends with the orders that were in force at T.
            while next_order < self.orders.len() && self.orders[next_order].tick <= world.tick() {
                let record = self.orders[next_order];
                world.set_order(record.faction, record.order);
                next_order += 1;
            }
            if world.tick() >= ticks {
                break;
            }
            while next_action < self.entries.len() && self.entries[next_action].tick <= world.tick()
            {
                let entry = self.entries[next_action];
                world.submit(entry.entity, entry.action);
                next_action += 1;
            }
            world.step();
        }

        world
    }
}
