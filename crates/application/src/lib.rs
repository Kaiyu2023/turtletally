//! The use cases behind both ingresses. The domain owns the rules; this crate
//! sequences them, keeps the aggregate in step, and leaves transport, storage,
//! and authentication to the layers around it.

pub mod assistant;
pub mod memory;
pub mod ports;
pub mod service;

pub use ports::{Actor, Owner};
pub use service::FinanceService;
