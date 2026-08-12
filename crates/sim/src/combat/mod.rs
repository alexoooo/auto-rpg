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
