//! The Turtle Tally domain. `apps/web/src/data` owns the contract (ADR 0008);
//! this crate conforms to it and is proven against the committed vector in
//! `tests/conformance.rs`.

pub mod aggregates;
pub mod calendar;
pub mod error;
pub mod fingerprint;
pub mod money;
pub mod recurrence;
pub mod reference;
pub mod rollup;
pub mod time;
pub mod types;

pub use error::{DomainError, DomainResult, ErrorCode};
