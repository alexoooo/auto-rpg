/// FNV-1a, 64-bit.
///
/// Used to fingerprint simulation state. `std::collections::hash_map::DefaultHasher`
/// would be the obvious choice and is the wrong one: its algorithm is explicitly
/// unspecified and allowed to change between Rust releases, so a golden hash
/// recorded today could stop matching after a toolchain upgrade. FNV is fixed
/// forever and fast enough for a few hundred entities per tick.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Hash64(u64);

const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

impl Default for Hash64 {
    fn default() -> Self {
        Hash64::new()
    }
}

impl Hash64 {
    #[inline]
    pub const fn new() -> Hash64 {
        Hash64(FNV_OFFSET)
    }

    #[inline]
    pub fn write_u8(&mut self, v: u8) {
        self.0 ^= v as u64;
        self.0 = self.0.wrapping_mul(FNV_PRIME);
    }

    #[inline]
    pub fn write_u16(&mut self, v: u16) {
        for b in v.to_le_bytes() {
            self.write_u8(b);
        }
    }

    #[inline]
    pub fn write_u32(&mut self, v: u32) {
        for b in v.to_le_bytes() {
            self.write_u8(b);
        }
    }

    #[inline]
    pub fn write_u64(&mut self, v: u64) {
        for b in v.to_le_bytes() {
            self.write_u8(b);
        }
    }

    #[inline]
    pub fn write_i32(&mut self, v: i32) {
        self.write_u32(v as u32);
    }

    #[inline]
    pub fn write_bool(&mut self, v: bool) {
        self.write_u8(v as u8);
    }

    #[inline]
    pub fn write_bytes(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.write_u8(b);
        }
    }

    #[inline]
    pub fn finish(self) -> u64 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_vectors() {
        // Standard FNV-1a test vectors, so a broken edit is caught immediately.
        let mut h = Hash64::new();
        assert_eq!(h.finish(), 0xcbf29ce484222325);
        h.write_bytes(b"a");
        assert_eq!(h.finish(), 0xaf63dc4c8601ec8c);
        let mut h = Hash64::new();
        h.write_bytes(b"foobar");
        assert_eq!(h.finish(), 0x85944171f73967e8);
    }

    #[test]
    fn order_matters() {
        let mut a = Hash64::new();
        a.write_u32(1);
        a.write_u32(2);
        let mut b = Hash64::new();
        b.write_u32(2);
        b.write_u32(1);
        assert_ne!(a.finish(), b.finish());
    }
}
