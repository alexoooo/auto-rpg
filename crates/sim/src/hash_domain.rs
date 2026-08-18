/// Which authoritative byte grammar produced a state digest.
#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum HashDomain {
    LegacyV1 = 0,
    ArticulatedV1 = 1,
    /// The embodied body's own block. A separate domain rather than a wider
    /// `ArticulatedV1`, so that comparing an embodied digest against an
    /// articulated one is a type-level mismatch rather than two numbers that
    /// happen to differ.
    EmbodiedV1 = 2,
}

/// A state fingerprint together with the grammar needed to interpret it.
#[derive(Clone, Copy, Debug)]
pub struct StateDigest {
    pub domain: HashDomain,
    pub schema: u16,
    pub value: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DigestCompareError {
    DomainMismatch { left: HashDomain, right: HashDomain },
    SchemaMismatch { left: u16, right: u16 },
}

impl StateDigest {
    pub fn compare(self, other: StateDigest) -> Result<bool, DigestCompareError> {
        if self.domain != other.domain {
            return Err(DigestCompareError::DomainMismatch {
                left: self.domain,
                right: other.domain,
            });
        }
        if self.schema != other.schema {
            return Err(DigestCompareError::SchemaMismatch {
                left: self.schema,
                right: other.schema,
            });
        }
        Ok(self.value == other.value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_digest_rejects_cross_domain_and_cross_schema_comparisons() {
        let legacy = StateDigest { domain: HashDomain::LegacyV1, schema: 1, value: 7 };
        let articulated = StateDigest { domain: HashDomain::ArticulatedV1, schema: 1, value: 7 };
        assert_eq!(
            legacy.compare(articulated),
            Err(DigestCompareError::DomainMismatch {
                left: HashDomain::LegacyV1,
                right: HashDomain::ArticulatedV1,
            })
        );

        let newer = StateDigest { schema: 2, ..legacy };
        assert_eq!(
            legacy.compare(newer),
            Err(DigestCompareError::SchemaMismatch { left: 1, right: 2 })
        );
        assert_eq!(legacy.compare(legacy), Ok(true));
        assert_eq!(legacy.compare(StateDigest { value: 8, ..legacy }), Ok(false));
    }
}
