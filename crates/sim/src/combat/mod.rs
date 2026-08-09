pub mod spec;

// These modules name the ownership boundaries that the following sessions fill.
// Keeping them empty now prevents the immutable construction grammar from
// accreting transient mechanics merely because it landed first.
pub mod actuator;
pub mod contact;
pub(crate) mod geometry;
pub mod resolution;
