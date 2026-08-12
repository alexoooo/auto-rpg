pub mod spec;

// A second scenario constructor beside `spec::fixtures`, and -- more to the
// point -- the argument, written down beside the code, for why a table built at
// runtime cannot move what `fixtures` is pinned at.
pub mod arena;

// These modules name the ownership boundaries that the following sessions fill.
// Keeping them empty now prevents the immutable construction grammar from
// accreting transient mechanics merely because it landed first.
pub mod actuator;
pub mod contact;
pub(crate) mod geometry;
pub mod resolution;

// Exact response translation is still feature-gated research. Keeping its pure
// grammar beside contact and resolution lets both consume one evaluator without
// making either of those two ownership boundaries depend on the other.
#[cfg(any(test, feature = "cartesian-recoil"))]
pub(crate) mod trajectory;
#[cfg(any(test, feature = "cartesian-recoil"))]
pub(crate) mod wide;
