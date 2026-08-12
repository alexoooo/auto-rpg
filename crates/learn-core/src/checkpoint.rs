//! A frozen model on disk, and the digest that names it.
//!
//! A checkpoint is not a weight file. It is a weight file plus every contract
//! the weights were trained against -- the feature layout, the action layout,
//! the layer widths, the seed set the optimizer scored on, and the optimizer's
//! own settings -- and the whole point of carrying those is that
//! [`Checkpoint::from_bytes`] can **refuse**. Weights are meaningless without
//! the layout they were fitted to: a version-1 feature vector fed to a
//! version-2 network is not a slightly worse policy, it is a network reading
//! the wrong number out of every slot, and it will still produce confident
//! argmaxes. So every mismatch here is an error and none of them is a warning.
//!
//! # Why SHA-256, in a repository that hashes with FNV-1a-64
//!
//! Everything in `fx`, `sim` and `policy` fingerprints state with
//! [`fx::Hash64`], and that is right for what it does: it is fast, it is on the
//! hot path of every recorded run, and the thing it protects against is
//! *accidental* divergence between two runs that claim to be the same run.
//!
//! This digest protects something else. It identifies an artifact -- a file
//! that outlives the process that wrote it, gets copied between machines,
//! quoted in an evidence document, and pasted into a plan -- and the people and
//! tools reading it want a name they can compare without holding the file. A
//! 64-bit sum is a poor name for that: it collides by birthday at four billion
//! artifacts, it is not what anybody's `sha256sum` prints, and half its
//! attraction (speed) buys nothing when it is computed once per training run.
//!
//! **It is not in any determinism path**, and that is the load-bearing half of
//! the argument. Nothing the sim hashes reaches this function, no golden in
//! [`docs/reference/hashes.md`] is computed here, and a replay of a learned run
//! never loads a checkpoint at all -- it plays back stored commands, which is
//! the whole reason v2-19 can afford a floating-point policy in the first
//! place. If this digest changed algorithm tomorrow the only thing that would
//! break is somebody's ability to recognise a file they had seen before, which
//! is exactly the size of promise it is making.
//!
//! [`docs/reference/hashes.md`]: ../../../docs/reference/hashes.md
//!
//! # The hash is hand-rolled because the workspace has no dependencies
//!
//! `sha2` is one line in a manifest and it is one line `tools/check_deps.js`
//! refuses. FIPS 180-4 is about a hundred lines with published test vectors, so
//! the cost of writing it is bounded and the cost of getting it wrong is
//! detectable -- which is the trade that makes a hand-rolled crypto primitive
//! defensible here and would not make one defensible anywhere it had to resist
//! an adversary. See `the_published_sha256_vectors_are_reproduced_exactly`.

use crate::model::{Model, ModelShape, LEARN_ACTION_LAYOUT_VERSION, LEARN_FEATURE_LAYOUT_VERSION};
use std::fmt;
#[cfg(not(target_family = "wasm"))]
use std::path::Path;

// ------------------------------------------------------------------ SHA-256

/// The first thirty-two bits of the fractional parts of the cube roots of the
/// first sixty-four primes. FIPS 180-4 section 4.2.2.
const ROUND_CONSTANTS: [u32; 64] = [
    0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1, 0x923f_82a4,
    0xab1c_5ed5, 0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3, 0x72be_5d74, 0x80de_b1fe,
    0x9bdc_06a7, 0xc19b_f174, 0xe49b_69c1, 0xefbe_4786, 0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f,
    0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da, 0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7,
    0xc6e0_0bf3, 0xd5a7_9147, 0x06ca_6351, 0x1429_2967, 0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc,
    0x5338_0d13, 0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85, 0xa2bf_e8a1, 0xa81a_664b,
    0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070, 0x19a4_c116,
    0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a, 0x5b9c_ca4f, 0x682e_6ff3,
    0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208, 0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7,
    0xc671_78f2,
];

/// The first thirty-two bits of the fractional parts of the square roots of the
/// first eight primes. FIPS 180-4 section 5.3.3.
const INITIAL_STATE: [u32; 8] = [
    0x6a09_e667, 0xbb67_ae85, 0x3c6e_f372, 0xa54f_f53a, 0x510e_527f, 0x9b05_688c, 0x1f83_d9ab,
    0x5be0_cd19,
];

/// A streaming SHA-256, so a caller can digest a checkpoint without building a
/// second copy of its bytes.
///
/// **Every add wraps deliberately.** The workspace sets `overflow-checks` in
/// release precisely so that arithmetic which was *not* meant to wrap panics
/// instead of going quiet, so a hash whose whole definition is modulo 2^32 has
/// to say `wrapping_add` at every step or it would be the one place in the tree
/// where that tripwire fires on correct code.
#[derive(Clone, Debug)]
pub struct Sha256 {
    state: [u32; 8],
    block: [u8; 64],
    buffered: usize,
    /// Message length in **bits**, which is what the padding writes. Counted in
    /// bits rather than bytes and multiplied at the end because a byte counter
    /// would silently truncate the same 2^61-byte message the bit counter
    /// reports honestly, and neither of us is going to hash one.
    bits: u64,
}

impl Default for Sha256 {
    fn default() -> Sha256 {
        Sha256::new()
    }
}

impl Sha256 {
    pub fn new() -> Sha256 {
        Sha256 {
            state: INITIAL_STATE,
            block: [0u8; 64],
            buffered: 0,
            bits: 0,
        }
    }

    pub fn update(&mut self, bytes: &[u8]) {
        self.bits = self.bits.wrapping_add((bytes.len() as u64).wrapping_mul(8));
        let mut rest = bytes;
        while !rest.is_empty() {
            let want = 64 - self.buffered;
            let take = want.min(rest.len());
            self.block[self.buffered..self.buffered + take].copy_from_slice(&rest[..take]);
            self.buffered += take;
            rest = &rest[take..];
            if self.buffered == 64 {
                let block = self.block;
                self.compress(&block);
                self.buffered = 0;
            }
        }
    }

    /// The padded tail, then the eight words as big-endian bytes.
    ///
    /// The 448-bit boundary lives here: a message whose last block has 56 bytes
    /// or more in it has no room for the eight-byte length, so the padding runs
    /// into a whole extra block. That is the case
    /// `the_published_sha256_vectors_are_reproduced_exactly` pins by name,
    /// because it is the one an implementation gets wrong while passing `""`
    /// and `"abc"`.
    pub fn finish(mut self) -> [u8; 32] {
        let bits = self.bits;
        self.append_byte(0x80);
        while self.buffered != 56 {
            self.append_byte(0x00);
        }
        let length = bits.to_be_bytes();
        for byte in length {
            self.append_byte(byte);
        }
        debug_assert_eq!(self.buffered, 0, "the length must have closed a block");

        let mut out = [0u8; 32];
        for (word, slot) in self.state.iter().zip(out.chunks_mut(4)) {
            slot.copy_from_slice(&word.to_be_bytes());
        }
        out
    }

    /// Pushes one padding byte without touching the message length, which
    /// `update` would.
    fn append_byte(&mut self, byte: u8) {
        self.block[self.buffered] = byte;
        self.buffered += 1;
        if self.buffered == 64 {
            let block = self.block;
            self.compress(&block);
            self.buffered = 0;
        }
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 64];
        for (i, chunk) in block.chunks(4).enumerate() {
            w[i] = u32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.state;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choose = (e & f) ^ (!e & g);
            let temp1 = h
                .wrapping_add(s1)
                .wrapping_add(choose)
                .wrapping_add(ROUND_CONSTANTS[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(majority);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        for (slot, value) in self
            .state
            .iter_mut()
            .zip([a, b, c, d, e, f, g, h])
        {
            *slot = slot.wrapping_add(value);
        }
    }
}

/// One-shot SHA-256.
pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finish()
}

/// Lowercase hex, which is what `sha256sum` prints and therefore what a human
/// comparing two artifacts already has in their scrollback.
pub fn hex(digest: &[u8; 32]) -> String {
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push(char::from_digit((byte >> 4) as u32, 16).expect("a nibble is a hex digit"));
        out.push(char::from_digit((byte & 0xf) as u32, 16).expect("a nibble is a hex digit"));
    }
    out
}

// --------------------------------------------------------------- the artifact

/// The eight bytes every checkpoint starts with.
///
/// A magic rather than a bare version word, so that a file that is not a
/// checkpoint at all -- a truncated download, a JSON trace somebody renamed --
/// fails as `BadMagic` at byte zero instead of as an implausible layout version
/// forty bytes in.
pub const CHECKPOINT_MAGIC: [u8; 8] = *b"ARPGLRN1";

/// Bumped whenever the *framing* below changes: field order, widths, or what is
/// carried at all.
///
/// Separate from [`LEARN_FEATURE_LAYOUT_VERSION`] and
/// [`LEARN_ACTION_LAYOUT_VERSION`] because the three fail for different
/// reasons. A framing change means this reader cannot parse the file; a layout
/// change means it can parse it perfectly and must still refuse the weights.
/// Folding them into one number would make the second indistinguishable from
/// the first in the error a human sees.
pub const CHECKPOINT_FORMAT_VERSION: u32 = 1;

/// What the optimizer was doing when it produced these weights.
///
/// Recorded rather than derivable, because none of it is: a checkpoint outlives
/// the command line that made it, and "which seeds was this scored on" is the
/// first question anybody comparing two of them asks. The seed set in
/// particular is a *contract* -- v2-19's held-out corpus is only held out if
/// this list says what training saw.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct TrainingRecord {
    pub generations: u32,
    pub population: u32,
    pub elite: u32,
    pub sigma: f32,
    pub master_seed: u64,
    /// The fixed scoring seed set, in the order the optimizer walked it.
    pub seeds: Vec<u64>,
    /// Mean return of the champion on its own scoring seeds, as the optimizer
    /// last measured it. Provenance for the number a later evaluation is going
    /// to disagree with, and disagreeing with it is the *point* -- a held-out
    /// mean far below this one is overfitting, and without the training figure
    /// written down there is nothing to notice that against.
    pub training_return: f32,
}

/// A model plus everything needed to refuse it.
#[derive(Clone, PartialEq, Debug)]
pub struct Checkpoint {
    pub training: TrainingRecord,
    pub model: Model,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum CheckpointError {
    /// The bytes ran out mid-field. Carries what was being read, because
    /// "truncated" alone does not distinguish a half-written file from a reader
    /// that walked off the end of a field it mis-sized.
    Truncated { reading: &'static str },
    BadMagic,
    UnknownFormat(u32),
    FeatureLayout { expected: u32, found: u32 },
    ActionLayout { expected: u32, found: u32 },
    Shape { expected: ModelShape, found: ModelShape },
    /// The header declared the right shape and then carried a different number
    /// of weights.
    ///
    /// Separate from [`CheckpointError::Shape`] because folding the two makes
    /// the message a lie: the shape *was* the shape this build expects, and
    /// reporting a fabricated `5x0x0` tells a reader the file claims something
    /// it does not claim.
    WeightCount { expected: usize, found: usize },
    /// The recorded digest is not the digest of the bytes in front of it.
    Digest { expected: String, found: String },
    /// A weight that is not a finite number.
    ///
    /// Rejected at load rather than at use, because a NaN weight does not crash
    /// anything: it propagates into every logit, every comparison against it is
    /// false, and `argmax` then answers index zero on every head forever. A
    /// policy that has quietly become "always the first action" is much harder
    /// to notice than a file that would not open.
    NotFinite { at: usize },
    /// A `sigma` or a `training_return` that is not a finite number.
    ///
    /// **The training record needs this as much as the weights do, and for a
    /// different reason.** A NaN there cannot make the policy misbehave -- the
    /// network never reads it -- but it breaks the crate's own round-trip
    /// claim, because `NaN != NaN` under the derived `PartialEq` and a
    /// checkpoint would stop being equal to itself. A field that is only ever
    /// printed is exactly the field nobody checks.
    NotFiniteRecord { field: &'static str },
    /// Bytes after the digest. A checkpoint is exactly as long as its fields,
    /// so a longer file is two files or a rewrite that did not truncate.
    TrailingBytes { extra: usize },
}

impl fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CheckpointError::Truncated { reading } => {
                write!(f, "checkpoint ended while reading {reading}")
            }
            CheckpointError::BadMagic => write!(f, "not a checkpoint: the magic does not match"),
            CheckpointError::UnknownFormat(v) => {
                write!(f, "checkpoint framing version {v}, this build writes {CHECKPOINT_FORMAT_VERSION}")
            }
            CheckpointError::FeatureLayout { expected, found } => write!(
                f,
                "checkpoint was trained against feature layout {found}, this build reads {expected}"
            ),
            CheckpointError::ActionLayout { expected, found } => write!(
                f,
                "checkpoint emits action layout {found}, this build speaks {expected}"
            ),
            CheckpointError::Shape { expected, found } => {
                write!(f, "checkpoint is {found}, this build expects {expected}")
            }
            CheckpointError::WeightCount { expected, found } => write!(
                f,
                "checkpoint declares the right shape and carries {found} weights, not {expected}"
            ),
            CheckpointError::Digest { expected, found } => {
                write!(f, "checkpoint digest is {expected} but its bytes hash to {found}")
            }
            CheckpointError::NotFinite { at } => {
                write!(f, "checkpoint weight {at} is not a finite number")
            }
            CheckpointError::NotFiniteRecord { field } => {
                write!(f, "checkpoint training record field {field} is not a finite number")
            }
            CheckpointError::TrailingBytes { extra } => {
                write!(f, "{extra} bytes after the checkpoint digest")
            }
        }
    }
}

impl std::error::Error for CheckpointError {}

/// A cursor that cannot read past the end, so every field decoder is one line
/// and the truncation arm is written once.
struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize, reading: &'static str) -> Result<&'a [u8], CheckpointError> {
        let end = self.at.checked_add(n).ok_or(CheckpointError::Truncated { reading })?;
        if end > self.bytes.len() {
            return Err(CheckpointError::Truncated { reading });
        }
        let slice = &self.bytes[self.at..end];
        self.at = end;
        Ok(slice)
    }

    fn u32(&mut self, reading: &'static str) -> Result<u32, CheckpointError> {
        let bytes = self.take(4, reading)?;
        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn u64(&mut self, reading: &'static str) -> Result<u64, CheckpointError> {
        let bytes = self.take(8, reading)?;
        Ok(u64::from_le_bytes(bytes.try_into().expect("eight bytes")))
    }

    fn f32(&mut self, reading: &'static str) -> Result<f32, CheckpointError> {
        let bytes = self.take(4, reading)?;
        Ok(f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }
}

fn put_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn put_u64(out: &mut Vec<u8>, value: u64) {
    out.extend_from_slice(&value.to_le_bytes());
}

/// Little-endian IEEE-754 bits, not a decimal rendering.
///
/// A checkpoint has to reload the weights it saved *exactly* -- a printed float
/// that reloads one ulp away is a different policy, and on an argmax boundary
/// it is a visibly different policy. `to_le_bytes` is the identity round trip
/// and a decimal one is not.
fn put_f32(out: &mut Vec<u8>, value: f32) {
    out.extend_from_slice(&value.to_le_bytes());
}

impl Checkpoint {
    /// The whole artifact: framing, contracts, optimizer record, weights, and a
    /// SHA-256 of everything above it.
    ///
    /// The digest goes **last** and covers everything before it, which is the
    /// only ordering that lets a reader hash what it just parsed without
    /// knowing in advance where the digest sits.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(64 + self.training.seeds.len() * 8 + self.model.len() * 4);
        out.extend_from_slice(&CHECKPOINT_MAGIC);
        put_u32(&mut out, CHECKPOINT_FORMAT_VERSION);
        put_u32(&mut out, LEARN_FEATURE_LAYOUT_VERSION);
        put_u32(&mut out, LEARN_ACTION_LAYOUT_VERSION);
        let shape = self.model.shape();
        put_u32(&mut out, shape.inputs as u32);
        put_u32(&mut out, shape.hidden as u32);
        put_u32(&mut out, shape.outputs as u32);
        put_u32(&mut out, self.training.generations);
        put_u32(&mut out, self.training.population);
        put_u32(&mut out, self.training.elite);
        put_f32(&mut out, self.training.sigma);
        put_f32(&mut out, self.training.training_return);
        put_u64(&mut out, self.training.master_seed);
        put_u32(&mut out, self.training.seeds.len() as u32);
        for &seed in &self.training.seeds {
            put_u64(&mut out, seed);
        }
        put_u32(&mut out, self.model.len() as u32);
        for &weight in self.model.weights() {
            put_f32(&mut out, weight);
        }
        let digest = sha256(&out);
        out.extend_from_slice(&digest);
        out
    }

    /// Every check this reader can make, in the order that makes the failure
    /// legible: framing, then contracts, then integrity, then values.
    ///
    /// **Contracts before the digest deliberately.** A file whose feature
    /// layout has moved is intact, self-consistent, correctly hashed and still
    /// useless, and reporting "digest ok, layout wrong" is the sentence a human
    /// can act on. The reverse order would report a layout mismatch on a
    /// corrupt file and send somebody looking for a retraining bill they do not
    /// owe.
    pub fn from_bytes(bytes: &[u8]) -> Result<Checkpoint, CheckpointError> {
        let mut reader = Reader { bytes, at: 0 };
        if reader.take(8, "the magic")? != CHECKPOINT_MAGIC {
            return Err(CheckpointError::BadMagic);
        }
        let format = reader.u32("the framing version")?;
        if format != CHECKPOINT_FORMAT_VERSION {
            return Err(CheckpointError::UnknownFormat(format));
        }
        let features = reader.u32("the feature layout version")?;
        if features != LEARN_FEATURE_LAYOUT_VERSION {
            return Err(CheckpointError::FeatureLayout {
                expected: LEARN_FEATURE_LAYOUT_VERSION,
                found: features,
            });
        }
        let actions = reader.u32("the action layout version")?;
        if actions != LEARN_ACTION_LAYOUT_VERSION {
            return Err(CheckpointError::ActionLayout {
                expected: LEARN_ACTION_LAYOUT_VERSION,
                found: actions,
            });
        }
        let found = ModelShape {
            inputs: reader.u32("the input width")? as usize,
            hidden: reader.u32("the hidden width")? as usize,
            outputs: reader.u32("the output width")? as usize,
        };
        if found != ModelShape::CURRENT {
            return Err(CheckpointError::Shape {
                expected: ModelShape::CURRENT,
                found,
            });
        }

        let generations = reader.u32("the generation count")?;
        let population = reader.u32("the population size")?;
        let elite = reader.u32("the elite count")?;
        let sigma = reader.f32("the mutation sigma")?;
        let training_return = reader.f32("the training return")?;
        let master_seed = reader.u64("the master seed")?;
        // **The cap is what the *file* could back, not what a count could
        // say.** These two headers are the only place a checkpoint asks this
        // decoder to reserve memory, and since v2-ui-08 the decoder runs inside
        // `web.wasm` behind `load_checkpoint` -- where a reservation grows
        // linear memory and detaches every typed array the page is holding,
        // which is the failure `articulated-abi.md`'s three fixed arrays exist
        // to make impossible. A refusal is the *cheap* path or it is a denial of
        // service dressed as a validation error: a review measured a 68-byte
        // file claiming four billion weights reserving 4 MiB and growing the
        // module by 65 pages on its way to answering `Truncated`.
        //
        // A seed is eight bytes, so a file of `bytes.len()` cannot carry more
        // than `bytes.len() / 8` of them; and the shape check above has already
        // refused everything but `ModelShape::CURRENT`, so by this line 3,858 is
        // the only weight count `Model::from_weights` will accept. Both caps are
        // therefore exact rather than generous, and a file that loads reaches
        // neither by more than nothing.
        //
        // A cap is a *hint*, so the two loops below stay correct when a header
        // over- or under-claims -- `WeightCount` still reports the count it
        // actually read. The one case that reallocates is a file that declares
        // more weights than the shape allows **and** carries the bytes for them,
        // and that growth is bounded by the 32 KB staging buffer the caller
        // filled. Bounded by the input somebody delivered is the property; the
        // old caps of 4,096 and `1 << 20` were bounded by nothing.
        // `a_refused_checkpoint_does_not_grow_linear_memory` in
        // `tools/wasm_check.js` measures it against the artifact.
        let seed_count = reader.u32("the seed count")? as usize;
        let mut seeds = Vec::with_capacity(seed_count.min(bytes.len() / 8));
        for _ in 0..seed_count {
            seeds.push(reader.u64("a training seed")?);
        }

        let weight_count = reader.u32("the weight count")? as usize;
        let mut weights = Vec::with_capacity(weight_count.min(ModelShape::CURRENT.weight_count()));
        for _ in 0..weight_count {
            weights.push(reader.f32("a weight")?);
        }
        let hashed = reader.at;
        let recorded: [u8; 32] = reader
            .take(32, "the digest")?
            .try_into()
            .expect("thirty-two bytes");
        if reader.at != bytes.len() {
            return Err(CheckpointError::TrailingBytes {
                extra: bytes.len() - reader.at,
            });
        }
        let actual = sha256(&bytes[..hashed]);
        if actual != recorded {
            return Err(CheckpointError::Digest {
                expected: hex(&recorded),
                found: hex(&actual),
            });
        }

        // Last, because a NaN in a file whose digest already failed is a
        // consequence of the corruption and not a separate fact worth
        // reporting. The training record is checked beside the weights rather
        // than where it was parsed, for the same reason.
        for (field, value) in [("sigma", sigma), ("training_return", training_return)] {
            if !value.is_finite() {
                return Err(CheckpointError::NotFiniteRecord { field });
            }
        }
        for (at, weight) in weights.iter().enumerate() {
            if !weight.is_finite() {
                return Err(CheckpointError::NotFinite { at });
            }
        }
        let model = Model::from_weights(weights).map_err(|found| CheckpointError::WeightCount {
            expected: ModelShape::CURRENT.weight_count(),
            found,
        })?;

        Ok(Checkpoint {
            training: TrainingRecord {
                generations,
                population,
                elite,
                sigma,
                master_seed,
                seeds,
                training_return,
            },
            model,
        })
    }

    /// This checkpoint's name: the SHA-256 of the bytes `to_bytes` would write,
    /// as lowercase hex.
    pub fn digest(&self) -> String {
        let bytes = self.to_bytes();
        hex(&sha256(&bytes[..bytes.len() - 32]))
    }

    /// Writes to a temporary beside the target and renames it into place.
    ///
    /// **Compiled out on a wasm target, with [`Checkpoint::read`], and that is
    /// the whole of what v2-ui-08's split costs this module.** A browser has no
    /// path to open: a checkpoint arrives there as bytes somebody fetched,
    /// staged through `crates/web`'s `checkpoint_ptr` buffer and handed to
    /// [`Checkpoint::from_bytes`] -- which is this file's real entry point and
    /// is available everywhere. `std::fs` does *compile* for
    /// `wasm32-unknown-unknown` and answers `Unsupported` at runtime, so the
    /// `cfg` is not what makes the build work; it is what makes "no I/O on any
    /// path a browser can reach" a fact about the artifact rather than a
    /// promise about the callers.
    ///
    /// **v2-19 asks for atomic and this is what atomic can mean here.** A
    /// rename within one directory is atomic on both NTFS and every filesystem
    /// this repository is developed on, so a reader either sees the previous
    /// checkpoint or the new one and never a half-written prefix -- which is
    /// the failure that matters, because a truncated file whose digest happens
    /// to be absent is exactly the artifact somebody quotes a number out of.
    /// What it is not is durable against power loss without an `fsync`, and
    /// there is no reason to buy that for a file a training run can simply
    /// produce again.
    #[cfg(not(target_family = "wasm"))]
    pub fn write_atomically(&self, path: &Path) -> std::io::Result<()> {
        let mut temporary = path.as_os_str().to_os_string();
        temporary.push(".partial");
        let temporary = Path::new(&temporary);
        std::fs::write(temporary, self.to_bytes())?;
        // Windows `rename` refuses an existing destination, unlike POSIX, so
        // the old artifact goes first. That is a real window in which neither
        // file exists and it is the smaller of the two evils: the alternative
        // on this platform is a copy, which reintroduces the torn read this
        // whole function exists to remove.
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        std::fs::rename(temporary, path)
    }

    /// The file on disk, decoded. Native only; see [`Checkpoint::write_atomically`].
    #[cfg(not(target_family = "wasm"))]
    pub fn read(path: &Path) -> std::io::Result<Result<Checkpoint, CheckpointError>> {
        Ok(Checkpoint::from_bytes(&std::fs::read(path)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Model;

    #[test]
    fn the_published_sha256_vectors_are_reproduced_exactly() {
        // The three FIPS 180-4 / NIST examples, plus the lengths either side of
        // the padding boundary. The boundary is the whole reason a hand-rolled
        // hash needs more than "abc": a message of 55 bytes still fits its
        // length word in the same block, one of 56 does not and forces a second
        // compression that an implementation can skip while passing every
        // shorter vector.
        //
        // The two boundary digests and the 64-byte one are recorded from
        // `node -e "crypto.createHash('sha256')..."` on 2026-08-10, which is
        // the independent implementation this repository already has installed;
        // the first three are the published constants.
        let cases: [(&[u8], &str); 6] = [
            (b"", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
            (b"abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
            (
                b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
                "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
            ),
            (
                &[b'a'; 55],
                "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318",
            ),
            (
                &[b'a'; 56],
                "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
            ),
            (
                &[b'a'; 64],
                "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb",
            ),
        ];
        for (message, expected) in cases {
            assert_eq!(
                hex(&sha256(message)),
                expected,
                "sha256 of {} bytes",
                message.len()
            );
        }
    }

    #[test]
    fn a_streamed_hash_equals_the_one_shot_hash_at_every_split() {
        // The buffering in `update` is the part of this implementation that has
        // nothing to do with FIPS 180-4 and therefore no published vector, and
        // it is the part a checkpoint actually uses.
        let message: Vec<u8> = (0..200u32).map(|i| (i * 37 % 251) as u8).collect();
        let whole = sha256(&message);
        for split in 0..=message.len() {
            let mut hasher = Sha256::new();
            hasher.update(&message[..split]);
            hasher.update(&message[split..]);
            assert_eq!(hasher.finish(), whole, "split at {split}");
        }
    }

    fn fixture() -> Checkpoint {
        let mut weights = vec![0.0f32; ModelShape::CURRENT.weight_count()];
        for (i, weight) in weights.iter_mut().enumerate() {
            *weight = (i % 17) as f32 / 16.0 - 0.5;
        }
        Checkpoint {
            training: TrainingRecord {
                generations: 12,
                population: 24,
                elite: 6,
                sigma: 0.075,
                master_seed: 20_260_810,
                seeds: vec![0, 1, 2, 3, 4, 5, 6, 7],
                training_return: 61.25,
            },
            model: Model::from_weights(weights).expect("the fixture is the current shape"),
        }
    }

    #[test]
    fn a_checkpoint_round_trips_through_its_bytes() {
        let checkpoint = fixture();
        let bytes = checkpoint.to_bytes();
        assert_eq!(Checkpoint::from_bytes(&bytes), Ok(checkpoint.clone()));
        // The name a human quotes is the name the file carries.
        assert_eq!(checkpoint.digest(), hex(&sha256(&bytes[..bytes.len() - 32])));
        assert_eq!(checkpoint.digest().len(), 64);
    }

    #[test]
    fn checkpoint_layout_and_digest_mismatches_fail_closed() {
        // Every refusal `from_bytes` can make, each provoked by the smallest
        // edit that provokes it, because the value of this reader is entirely
        // in what it *declines* to load. A checkpoint that opened anyway would
        // produce a policy that runs and is wrong.
        let good = fixture().to_bytes();

        let mut bad = good.clone();
        bad[0] = b'X';
        assert_eq!(Checkpoint::from_bytes(&bad), Err(CheckpointError::BadMagic));

        // Each of the three version words in turn. They are adjacent on
        // purpose and they must not be interchangeable: a framing bump means
        // "this reader cannot parse the file", and a layout bump means "it
        // parsed perfectly and the weights are still void".
        let mut bad = good.clone();
        bad[8..12].copy_from_slice(&99u32.to_le_bytes());
        assert_eq!(
            Checkpoint::from_bytes(&bad),
            Err(CheckpointError::UnknownFormat(99))
        );

        let mut bad = good.clone();
        bad[12..16].copy_from_slice(&(LEARN_FEATURE_LAYOUT_VERSION + 1).to_le_bytes());
        assert_eq!(
            Checkpoint::from_bytes(&bad),
            Err(CheckpointError::FeatureLayout {
                expected: LEARN_FEATURE_LAYOUT_VERSION,
                found: LEARN_FEATURE_LAYOUT_VERSION + 1,
            })
        );

        let mut bad = good.clone();
        bad[16..20].copy_from_slice(&(LEARN_ACTION_LAYOUT_VERSION + 1).to_le_bytes());
        assert_eq!(
            Checkpoint::from_bytes(&bad),
            Err(CheckpointError::ActionLayout {
                expected: LEARN_ACTION_LAYOUT_VERSION,
                found: LEARN_ACTION_LAYOUT_VERSION + 1,
            })
        );

        let mut bad = good.clone();
        bad[20..24].copy_from_slice(&7u32.to_le_bytes());
        assert!(matches!(
            Checkpoint::from_bytes(&bad),
            Err(CheckpointError::Shape { .. })
        ));

        // A header that declares the right shape and then carries a different
        // number of weights, self-consistently and correctly digested.
        // Distinct from the case above, because the shape it declared *was*
        // right, and saying otherwise would send a reader looking for a layout
        // change nobody made.
        let full = ModelShape::CURRENT.weight_count();
        let weights_at = good.len() - 32 - full * 4;
        let count_at = weights_at - 4;
        let mut bad = good[..count_at].to_vec();
        bad.extend_from_slice(&((full - 1) as u32).to_le_bytes());
        bad.extend_from_slice(&good[weights_at..weights_at + (full - 1) * 4]);
        let digest = sha256(&bad);
        bad.extend_from_slice(&digest);
        assert_eq!(
            Checkpoint::from_bytes(&bad),
            Err(CheckpointError::WeightCount {
                expected: full,
                found: full - 1,
            })
        );

        // A NaN in the training record. It cannot make the policy misbehave --
        // nothing reads it -- and it breaks the round trip, because a NaN is
        // not equal to itself and a loaded checkpoint would stop comparing
        // equal to the one that was written.
        let mut checkpoint = fixture();
        checkpoint.training.sigma = f32::NAN;
        assert_eq!(
            Checkpoint::from_bytes(&checkpoint.to_bytes()),
            Err(CheckpointError::NotFiniteRecord { field: "sigma" })
        );
        let mut checkpoint = fixture();
        checkpoint.training.training_return = f32::INFINITY;
        assert_eq!(
            Checkpoint::from_bytes(&checkpoint.to_bytes()),
            Err(CheckpointError::NotFiniteRecord { field: "training_return" })
        );

        // One flipped bit in the middle of the weights: parseable, correctly
        // shaped, and not the file that was written.
        let mut bad = good.clone();
        let middle = bad.len() / 2;
        bad[middle] ^= 0x01;
        assert!(matches!(
            Checkpoint::from_bytes(&bad),
            Err(CheckpointError::Digest { .. })
        ));

        // A NaN weight, re-digested so that the file is internally consistent.
        // This is the case the digest cannot catch and the one that would
        // otherwise turn the policy into "always head index zero".
        let mut checkpoint = fixture();
        checkpoint.model.weights_mut()[3] = f32::NAN;
        let bad = checkpoint.to_bytes();
        assert_eq!(
            Checkpoint::from_bytes(&bad),
            Err(CheckpointError::NotFinite { at: 3 })
        );

        let mut bad = good.clone();
        bad.push(0);
        assert!(matches!(
            Checkpoint::from_bytes(&bad),
            Err(CheckpointError::TrailingBytes { extra: 1 })
        ));

        for cut in [0, 4, 8, 24, good.len() - 33, good.len() - 1] {
            assert!(
                matches!(
                    Checkpoint::from_bytes(&good[..cut]),
                    Err(CheckpointError::Truncated { .. }) | Err(CheckpointError::BadMagic)
                ),
                "a checkpoint truncated to {cut} bytes loaded anyway"
            );
        }
    }

    #[test]
    fn an_atomic_write_leaves_no_partial_file_behind() {
        let dir = std::env::temp_dir().join(format!(
            "auto-rpg-learn-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).expect("a scratch directory");
        let path = dir.join("probe.ckpt");
        let checkpoint = fixture();
        checkpoint.write_atomically(&path).expect("the first write");
        // Twice, because the interesting case is the overwrite: the temporary
        // has to be gone and the destination has to be the new artifact.
        checkpoint.write_atomically(&path).expect("the second write");
        assert!(!path.with_extension("ckpt.partial").exists());
        let loaded = Checkpoint::read(&path).expect("the file is readable");
        assert_eq!(loaded, Ok(checkpoint));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
